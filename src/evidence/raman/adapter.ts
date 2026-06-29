/**
 * Raman Evidence Adapter — Transport Boundary
 * Maps RamanProcessingResult into UniversalEvidenceNode[] preserving exact provenance.
 */

import type { RamanProcessingResult } from '../../agents/ramanAgent/types.js';
import type { UniversalEvidenceNode } from '../../types/universalEvidence.js';

export function adaptRamanEvidence(
  result: RamanProcessingResult,
  datasetId: string,
  sampleName?: string,
): UniversalEvidenceNode[] {
  if (!result || !Array.isArray(result.modeCandidate)) return [];
  const nowIso = new Date().toISOString();

  return result.modeCandidate.map((candidate, idx) => {
    const strongestMatch = candidate.matches?.[0]?.observedPeak;
    return {
      id: `raman-cand-${idx + 1}`,
      technique: 'Raman',
      primaryAxis: strongestMatch?.ramanShift ?? (strongestMatch as any)?.shift ?? 0,
      primaryAxisUnit: 'cm⁻¹',
      value: candidate.score,
      valueUnit: 'confidence_score',
      label: candidate.modeName,
      concept: 'crystalline',
      role: 'primary',
      confidence: candidate.confidenceLevel,
      provenance: {
        datasetId,
        sampleName,
        createdAt: nowIso,
        dbSource: candidate.dbSource,
        sourceId: candidate.sourceId ?? candidate.rruffId ?? candidate.phaseId,
        sourceDoi: candidate.sourceDoi,
        matchSource: candidate.matchSource ?? candidate.dbSource,
        formula: candidate.formula,
        summary: candidate.summary,
        tolerance: candidate.tolerance,
        rawConfidence: candidate.rawConfidence ?? candidate.score,
      },
    };
  });
}
