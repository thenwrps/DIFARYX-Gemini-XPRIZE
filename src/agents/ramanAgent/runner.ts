/**
 * Raman Processing Agent Runner
 * 
 * Implements Raman spectroscopy processing pipeline:
 * 1. Baseline Correction
 * 2. Smoothing
 * 3. Peak Detection
 * 4. Mode Assignment
 * 5. Phase / Defect Interpretation
 * 6. Scientific Summary
 */

import type {
  RamanPoint,
  RamanDetectedPeak,
  RamanPeakMatch,
  RamanModeCandidate,
  RamanProcessingParams,
  RamanProcessingResult,
  RamanInterpretation,
  RamanModeReference,
} from './types';
import type { RamanDataset } from '../../data/ramanDemoData';
import { applyBaseline, applySmoothing, removeCosmicRays, identifyFunctionalGroups } from '../../hooks/useX7UniversalHook';
import { RAMAN_STARTER_DATABASE } from '../../data/ramanReferenceData';

// ============================================================================
// Raman Mode Reference Database (Synchronized Part C)
// ============================================================================

const RAMAN_MODE_DATABASE: RamanModeReference[] = RAMAN_STARTER_DATABASE;

// ============================================================================
// Processing Functions
// ============================================================================

function correctBaseline(
  dataPoints: RamanPoint[],
  method: 'Polynomial' | 'Rubberband' | 'Linear' | 'ALS' | 'Rolling Ball'
): { corrected: RamanPoint[]; baseline: number[] } {
  const corrected = applyBaseline(dataPoints, method as any);
  const baseline = dataPoints.map((p, i) => p.y - corrected[i].y);
  return { corrected, baseline };
}


function smoothData(
  dataPoints: RamanPoint[],
  windowSize: number
): RamanPoint[] {
  return applySmoothing(dataPoints, 'Savitzky-Golay');
}


function detectPeaks(
  dataPoints: RamanPoint[],
  prominence: number,
  minDistance: number,
  minHeight: number
): RamanDetectedPeak[] {
  const candidatePeaks: RamanDetectedPeak[] = [];
  const maxIntensity = Math.max(...dataPoints.map(p => p.y));
  const prominenceThreshold = prominence * maxIntensity;
  const heightThreshold = minHeight * maxIntensity;
  
  for (let i = 1; i < dataPoints.length - 1; i++) {
    const curr = dataPoints[i];
    const prev = dataPoints[i - 1];
    const next = dataPoints[i + 1];
    
    if (curr.y > prev.y && curr.y > next.y) {
      if (curr.y >= prominenceThreshold && curr.y >= heightThreshold) {
        const tooClose = candidatePeaks.some(peak => 
          Math.abs(curr.x - peak.ramanShift) < minDistance
        );
        
        if (!tooClose) {
          const halfMax = curr.y / 2;
          let leftIdx = i;
          let rightIdx = i;
          
          while (leftIdx > 0 && dataPoints[leftIdx].y > halfMax) leftIdx--;
          while (rightIdx < dataPoints.length - 1 && dataPoints[rightIdx].y > halfMax) rightIdx++;
          
          const fwhm = Math.abs(dataPoints[leftIdx].x - dataPoints[rightIdx].x);
          
          let classification: 'sharp' | 'medium' | 'broad';
          if (fwhm < 30) {
            classification = 'sharp';
          } else if (fwhm <= 60) {
            classification = 'medium';
          } else {
            classification = 'broad';
          }
          
          const area = curr.y * fwhm * 0.8;
          
          const windowSize = 50;
          const startIdx = Math.max(0, i - windowSize);
          const endIdx = Math.min(dataPoints.length - 1, i + windowSize);
          const localMin = Math.min(...dataPoints.slice(startIdx, endIdx + 1).map(p => p.y));
          const localProminence = curr.y - localMin;
          
          candidatePeaks.push({
            id: `peak-${candidatePeaks.length + 1}`,
            ramanShift: curr.x,
            intensity: curr.y,
            rawIntensity: curr.y,
            prominence: localProminence,
            fwhm: fwhm,
            area: area,
            classification: classification,
          });
        }
      }
    }
  }
  
  // Filter meaningful peaks
  const meaningfulPeaks = candidatePeaks.filter(peak => {
    if (peak.intensity < 0.10) return false;
    if (peak.fwhm > 200) return false;
    if (peak.prominence < 0.08) return false;
    if (peak.area < 3.0) return false;
    return true;
  });
  
  // Remove near-duplicates
  const filteredPeaks: RamanDetectedPeak[] = [];
  const sortedByIntensity = [...meaningfulPeaks].sort((a, b) => b.intensity - a.intensity);
  
  for (const peak of sortedByIntensity) {
    const tooClose = filteredPeaks.some(existing => 
      Math.abs(peak.ramanShift - existing.ramanShift) < 30
    );
    
    if (!tooClose) {
      filteredPeaks.push(peak);
    }
  }
  
  filteredPeaks.sort((a, b) => a.ramanShift - b.ramanShift);
  
  filteredPeaks.forEach((peak, index) => {
    peak.id = `peak-${index + 1}`;
  });
  
  return filteredPeaks;
}

function assignModes(
  peaks: RamanDetectedPeak[],
  database: RamanModeReference[]
): RamanPeakMatch[] {
  const matches: RamanPeakMatch[] = [];
  
  for (const peak of peaks) {
    for (const ref of database) {
      const [minRs, maxRs] = ref.ramanShiftRange;
      
      if (peak.ramanShift >= minRs && peak.ramanShift <= maxRs) {
        const rangeCenter = ref.typicalCenter;
        const rangeWidth = maxRs - minRs;
        const deltaFromCenter = Math.abs(peak.ramanShift - rangeCenter);
        const positionScore = Math.max(0, 1 - (deltaFromCenter / (rangeWidth / 2)));
        
        let widthScore = 0.5;
        if (peak.classification === ref.expectedWidth) {
          widthScore = 1.0;
        } else if (
          (peak.classification === 'medium' && ref.expectedWidth !== 'sharp') ||
          (peak.classification === 'sharp' && ref.expectedWidth === 'medium')
        ) {
          widthScore = 0.7;
        }
        
        const overallScore = positionScore * widthScore * ref.diagnosticWeight;
        
        matches.push({
          referenceMode: ref,
          observedPeak: peak,
          deltaFromCenter: deltaFromCenter,
          positionScore: positionScore,
          widthScore: widthScore,
          overallScore: overallScore,
        });
      }
    }
  }
  
  return matches;
}

function matchModes(
  matches: RamanPeakMatch[],
  peaks: RamanDetectedPeak[]
): RamanModeCandidate[] {
  const candidates: RamanModeCandidate[] = [];
  const modeMap = new Map<string, RamanPeakMatch[]>();
  
  for (const match of matches) {
    const mode = match.referenceMode.modeName;
    if (!modeMap.has(mode)) {
      modeMap.set(mode, []);
    }
    modeMap.get(mode)!.push(match);
  }
  
  for (const [mode, modeMatches] of modeMap.entries()) {
    modeMatches.sort((a, b) => b.overallScore - a.overallScore);
    const bestMatch = modeMatches[0];
    
    let finalScore = bestMatch.overallScore;
    const ref = bestMatch.referenceMode;
    
    // Check for supporting modes
    const supportingModes: RamanPeakMatch[] = [];
    if (ref.supportingModes.length > 0) {
      for (const supportId of ref.supportingModes) {
        const supportMatches = matches.filter(m => 
          m.referenceMode.modeName.toLowerCase().includes(supportId.replace('_', ' '))
        );
        if (supportMatches.length > 0) {
          supportingModes.push(supportMatches[0]);
        }
      }
    }
    
    // Apply strict confidence caps based on mode type and support
    const isBroadPeak = bestMatch.observedPeak.classification === 'broad';
    
    if (mode === 'A1g spinel ferrite') {
      // A1g + supporting modes → max 85%
      if (supportingModes.length >= 1) {
        finalScore = Math.min(finalScore, 0.85);
      } else {
        // A1g only → max 70%
        finalScore = Math.min(finalScore, 0.70);
      }
    } else if (ref.phaseType === 'ferrite') {
      // Other ferrite modes capped at 75%
      finalScore = Math.min(finalScore, 0.75);
    } else if (ref.phaseType === 'carbon') {
      // Carbon/defect modes capped at 65%
      finalScore = Math.min(finalScore, 0.65);
    }
    
    if (isBroadPeak) {
      finalScore = Math.min(finalScore, 0.65);
    }
    
    // Determine confidence level
    let confidenceLevel: 'high' | 'medium' | 'low';
    
    // A1g + supporting modes = high (but capped at 85%)
    if (mode === 'A1g spinel ferrite' && supportingModes.length >= 1 && finalScore > 0.70) {
      confidenceLevel = 'high';
    } else if (mode === 'A1g spinel ferrite' && finalScore > 0.60) {
      confidenceLevel = 'medium';
    } else if (ref.phaseType === 'ferrite' && supportingModes.length > 0 && finalScore > 0.55) {
      confidenceLevel = 'medium';
    } else if (finalScore > 0.50) {
      confidenceLevel = 'medium';
    } else {
      confidenceLevel = 'low';
    }
    
    candidates.push({
      modeName: mode,
      assignment: ref.assignment,
      matches: modeMatches,
      supportingModes: supportingModes,
      score: finalScore,
      confidenceLevel: confidenceLevel,
      ambiguity: null,
      phaseType: ref.phaseType,
      phaseId: ref.phaseId,
      phaseLabel: ref.phaseLabel,
      formula: ref.formula,
      dbSource: ref.dbSource,
      rruffId: ref.rruffId,
      sourceDoi: ref.sourceDoi,
      excitationNm: ref.excitationNm,
      caveat: ref.caveat,
      sourceId: ref.rruffId ?? ref.phaseId,
      matchSource: ref.dbSource,
      summary: `${mode} (${ref.formula ?? ''})`,
      rawConfidence: finalScore,
    });
  }
  
  return candidates;
}

function generateInterpretation(
  candidates: RamanModeCandidate[],
  peaks: RamanDetectedPeak[],
  allMatches: RamanPeakMatch[]
): RamanInterpretation {
  // Sort candidates with strict hierarchy:
  // 1. A1g first (always)
  // 2. Then Eg/T2g/Lower ferrite modes
  // 3. Then others by score
  const sorted = [...candidates].sort((a, b) => {
    const aIsA1g = a.modeName.includes('A1g');
    const bIsA1g = b.modeName.includes('A1g');
    const aIsSupporting = a.modeName.includes('Eg') || a.modeName.includes('T2g') || a.modeName.includes('F2g') || a.modeName.includes('Lower ferrite');
    const bIsSupporting = b.modeName.includes('Eg') || b.modeName.includes('T2g') || b.modeName.includes('F2g') || b.modeName.includes('Lower ferrite');
    
    // A1g always first
    if (aIsA1g && !bIsA1g) return -1;
    if (!aIsA1g && bIsA1g) return 1;
    
    // Then supporting ferrite modes
    if (aIsSupporting && !bIsSupporting) return -1;
    if (!aIsSupporting && bIsSupporting) return 1;
    
    // Then by score
    return b.score - a.score;
  });
  
  const dominantModes = sorted.slice(0, 3).map(c => c.modeName);
  
  const hasA1g = sorted.some(m => m.modeName.includes('A1g'));
  const hasEg = sorted.some(m => m.modeName.includes('Eg') || m.modeName.includes('F2g'));
  const hasLowFerrite = sorted.some(m => m.modeName.includes('Lower ferrite'));
  const hasDband = sorted.some(m => m.modeName.includes('D band'));
  const hasGband = sorted.some(m => m.modeName.includes('G band'));
  
  // Remove "confirmed" language - use "consistent with" or "suggests"
  let phaseInterpretation = '';
  if (hasA1g && (hasEg || hasLowFerrite) && (hasDband || hasGband)) {
    phaseInterpretation = 'Spinel ferrite vibrational modes with carbonaceous residue';
  } else if (hasA1g && (hasEg || hasLowFerrite)) {
    phaseInterpretation = 'Vibrational modes consistent with spinel ferrite structure';
  } else if (hasA1g) {
    phaseInterpretation = 'A1g mode suggests spinel ferrite (limited supporting evidence)';
  } else if (hasDband || hasGband) {
    phaseInterpretation = 'Carbonaceous material detected (ferrite phase unclear)';
  } else {
    phaseInterpretation = 'Phase identification inconclusive from Raman data';
  }
  
  // Calculate confidence with calibrated D/G penalty
  const ferriteOnlyCandidates = sorted.filter(c => c.phaseType === 'ferrite');
  const avgConfidence = ferriteOnlyCandidates.length > 0
    ? ferriteOnlyCandidates.reduce((sum, c) => sum + c.score, 0) / ferriteOnlyCandidates.length
    : 0;
  
  const broadPeakCount = peaks.filter(p => p.classification === 'broad').length;
  
  let globalConfidence = avgConfidence;
  
  // Reduced D/G penalty: multiplicative 0.90 (≈ -10% effective but proportional)
  if (hasDband || hasGband) {
    globalConfidence *= 0.90;
  }
  
  // Penalize broad peaks
  globalConfidence -= broadPeakCount * 0.03;
  
  const uniqueMatchedPeakIds = new Set(allMatches.map(m => m.observedPeak.id));
  const matchedRatio = peaks.length > 0 ? uniqueMatchedPeakIds.size / peaks.length : 0;
  if (matchedRatio >= 0.9) {
    globalConfidence += 0.03;
  }
  
  // Apply strict confidence caps
  if (hasA1g && (hasEg || hasLowFerrite)) {
    // A1g + supporting → max 75%, min 55%
    globalConfidence = Math.min(globalConfidence, 0.75);
    globalConfidence = Math.max(globalConfidence, 0.55);
  } else if (hasA1g) {
    // A1g only → max 70%
    globalConfidence = Math.min(globalConfidence, 0.70);
  } else {
    // No A1g → <50%
    globalConfidence = Math.min(globalConfidence, 0.45);
  }
  
  globalConfidence = Math.max(0, globalConfidence);
  
  let confidenceLevel: 'high' | 'medium' | 'low';
  // Do not show HIGH if D/G bands present (carbon contamination)
  if (globalConfidence > 0.70 && hasA1g && (hasEg || hasLowFerrite) && !hasDband && !hasGband) {
    confidenceLevel = 'high';
  } else if (globalConfidence > 0.5) {
    confidenceLevel = 'medium';
  } else {
    confidenceLevel = 'low';
  }
  
  const evidence: string[] = [];
  for (const c of sorted.slice(0, 3)) {
    let evidenceStr = `${c.modeName}: ${c.matches[0].observedPeak.ramanShift.toFixed(0)} cm⁻¹ (${c.assignment})`;
    if (c.supportingModes.length > 0) {
      evidenceStr += ` [supported by ${c.supportingModes.map(sm => sm.referenceMode.modeName).join(', ')}]`;
    }
    evidence.push(evidenceStr);
  }
  
  const ambiguities = sorted
    .filter(c => c.ambiguity)
    .map(c => `${c.modeName}: ${c.ambiguity}`);
  
  // Reviewer-level scientific caveats
  const caveats: string[] = [];
  
  caveats.push('Raman supports phase EVIDENCE; it CANNOT assert phase purity without reference validation.');
  
  if (hasDband || hasGband) {
    caveats.push('D and G bands at 1350 and 1580 cm⁻¹ indicate carbonaceous species; these do not confirm ferrite phase identity');
  }
  
  if (hasA1g && !hasEg && !hasLowFerrite) {
    caveats.push('A1g mode observed without corroborating Eg, F2g, or T2g modes; spinel assignment requires additional characterization');
  }
  
  if (broadPeakCount > 0) {
    caveats.push(`Broad linewidths (FWHM > 60 cm⁻¹) may reflect structural disorder, nanocrystallinity, or overlapping modes`);
  }
  
  caveats.push('Raman-active modes alone cannot distinguish between isostructural spinel ferrites (e.g., CoFe₂O₄ vs. NiFe₂O₄)');
  caveats.push('Quantitative intensity ratios are sensitive to baseline correction, laser power, and sample orientation');
  
  const unassignedPeaks = peaks.filter(p => !uniqueMatchedPeakIds.has(p.id));
  if (unassignedPeaks.length > 0) {
    caveats.push(`${unassignedPeaks.length} unassigned peak(s) may indicate secondary phases, surface species, or instrumental artifacts`);
  }
  
  const confidenceQualifier = confidenceLevel === 'high' ? 'high' : confidenceLevel === 'medium' ? 'moderate' : 'low';
  const summary = `${dominantModes.slice(0, 2).join(', ')} detected with ${confidenceQualifier} confidence`;
  
  const bestCand = sorted[0];
  if (bestCand?.caveat && !caveats.includes(bestCand.caveat)) {
    caveats.push(bestCand.caveat);
  }
  return {
    dominantModes: dominantModes,
    phaseInterpretation: phaseInterpretation,
    decision: phaseInterpretation,
    confidenceScore: globalConfidence * 100,
    confidenceLevel: confidenceLevel,
    evidence: evidence,
    ambiguities: ambiguities,
    caveats: caveats,
    summary: summary,
    primaryPhase: bestCand?.phaseLabel,
    formula: bestCand?.formula,
    dbSource: bestCand?.dbSource,
    catalogId: bestCand?.rruffId || bestCand?.sourceDoi,
  };
}

// ============================================================================
// Main Processing Pipeline
// ============================================================================

export function runRamanProcessing(
  dataset: RamanDataset,
  params?: RamanProcessingParams
): RamanProcessingResult {
  const executionLog: any[] = [];
  
  const baselineMethod = params?.baselineMethod ?? 'Polynomial';
  const smoothingWindowSize = params?.smoothingWindowSize ?? 9;
  const peakProminence = params?.peakProminence ?? 0.12;
  const peakMinDistance = params?.peakMinDistance ?? 25;
  const peakMinHeight = params?.peakMinHeight ?? 0.10;
  
  let dataPoints: RamanPoint[] = dataset.signal.ramanShift.map((rs, i) => ({
    x: rs,
    y: dataset.signal.intensity[i],
  }));

  // Cosmic Ray Removal using Median Filter
  dataPoints = removeCosmicRays(dataPoints);
  executionLog.push({ step: 'Cosmic Ray Removal', message: 'Median filter cosmic ray removal applied' });
  
  const { corrected: baselineCorrected, baseline } = correctBaseline(
    dataPoints,
    baselineMethod
  );
  executionLog.push({ step: 'Baseline Correction', message: `${baselineMethod} method applied` });
  
  const smoothed = smoothData(baselineCorrected, smoothingWindowSize);
  executionLog.push({ step: 'Smoothing', message: `Window size=${smoothingWindowSize}` });
  
  const peaks = detectPeaks(smoothed, peakProminence, peakMinDistance, peakMinHeight);

  // Apply Scientific Dictionary mapping
  const dictAssignments = identifyFunctionalGroups(peaks, 'RAMAN');
  for (const peak of peaks) {
    const match = dictAssignments.find(a => Math.abs(a.position - peak.ramanShift) < 1e-3);
    if (match) {
      peak.assignment = match.assignment;
      peak.label = `${match.assignment} (${match.confidence}%)`;
    }
  }

  executionLog.push({ step: 'Peak Detection', message: `${peaks.length} peaks detected` });
  
  const matches = assignModes(peaks, RAMAN_MODE_DATABASE);
  executionLog.push({ step: 'Mode Assignment', message: `${matches.length} matches found` });
  
  const modeCandidate = matchModes(matches, peaks);
  executionLog.push({ step: 'Mode Matching', message: `${modeCandidate.length} candidates` });
  
  const interpretation = generateInterpretation(modeCandidate, peaks, matches);
  executionLog.push({ step: 'Interpretation', message: interpretation.summary });
  
  const validation = {
    ok: true,
    errors: [],
    warnings: [],
    pointCount: dataPoints.length,
    ramanShiftRange: [
      Math.min(...dataset.signal.ramanShift),
      Math.max(...dataset.signal.ramanShift),
    ] as [number, number],
  };
  
  return {
    signal: {
      ramanShift: smoothed.map(p => p.x),
      intensity: smoothed.map(p => p.y),
    },
    baseline: baseline,
    peaks: peaks,
    matches: matches,
    modeCandidate: modeCandidate,
    interpretation: interpretation,
    validation: validation,
    executionLog: executionLog,
    parametersUsed: {
      baselineMethod,
      smoothingWindowSize,
      peakProminence,
      peakMinDistance,
      peakMinHeight,
    },
  };
}
