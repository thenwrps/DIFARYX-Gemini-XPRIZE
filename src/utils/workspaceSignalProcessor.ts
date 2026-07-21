/**
 * workspaceSignalProcessor.ts
 *
 * Dynamic signal processing engine for DIFARYX evidence workspace.
 * Applies processing parameters (smoothing, baseline correction, shift,
 * range cropping, normalization, peak thresholding) to raw signal points
 * and peak results so that the graph and tables update in real time according
 * to scientific theory.
 */

import type { PeakResult, TechniqueId } from './reportPreviewTypes';
import { getRegionWindowByValue } from '../data/xpsReferenceData';

export interface ProcessedWorkspaceData {
  points: Array<{ x: number; y: number }>;
  baselinePoints: Array<{ x: number; y: number }>;
  peaks: PeakResult[];
  peakMarkers: Array<{ position: number; intensity: number; label: string }>;
}

/**
 * Apply moving average smoothing
 */
function applySmoothing(
  points: Array<{ x: number; y: number }>,
  windowSize: number,
): Array<{ x: number; y: number }> {
  if (windowSize <= 1 || points.length < 3) return points;

  const half = Math.floor(windowSize / 2);
  const n = points.length;

  return points.map((pt, i) => {
    let sum = 0;
    let count = 0;
    for (let j = i - half; j <= i + half; j++) {
      if (j >= 0 && j < n) {
        sum += points[j].y;
        count++;
      }
    }
    return { x: pt.x, y: sum / count };
  });
}

/**
 * Estimate baseline curve using iterative rolling minimum (SNIP-like algorithm)
 */
function estimateBaselineCurve(
  points: Array<{ x: number; y: number }>,
  iterations = 10,
): Array<{ x: number; y: number }> {
  if (points.length === 0) return [];

  let baseline = points.map((p) => p.y);
  const n = baseline.length;

  for (let iter = 0; iter < iterations; iter++) {
    const windowHalf = Math.max(1, Math.floor((iterations - iter) * 2));
    const next: number[] = [];
    for (let i = 0; i < n; i++) {
      const lo = Math.max(0, i - windowHalf);
      const hi = Math.min(n - 1, i + windowHalf);
      const avg = (baseline[lo] + baseline[hi]) / 2;
      next.push(Math.min(baseline[i], avg));
    }
    baseline = next;
  }

  // Smooth the estimated baseline
  const blurHalf = 7;
  const smoothed: number[] = [];
  for (let i = 0; i < n; i++) {
    let sum = 0;
    let count = 0;
    for (let j = i - blurHalf; j <= i + blurHalf; j++) {
      if (j >= 0 && j < n) {
        sum += baseline[j];
        count++;
      }
    }
    smoothed.push(sum / count);
  }

  return points.map((p, i) => ({ x: p.x, y: smoothed[i] }));
}

/**
 * Main signal processing pipeline for workspace data
 */
export function processWorkspaceSignal(
  rawPoints: Array<{ x: number; y: number }>,
  rawPeaks: PeakResult[],
  technique: TechniqueId,
  effectiveValues: Record<string, any>,
): ProcessedWorkspaceData {
  if (!rawPoints || rawPoints.length === 0) {
    return { points: [], baselinePoints: [], peaks: [], peakMarkers: [] };
  }

  // 1. Determine shift parameter (Zero shift for XRD, Energy shift for XPS, etc.)
  let shift = 0;
  if (technique === 'xrd') {
    shift = Number(effectiveValues.zeroShift ?? effectiveValues.zero_shift ?? 0);
  } else if (technique === 'xps') {
    shift = Number(effectiveValues.energyShift ?? effectiveValues.energy_shift ?? 0);
  }

  // Apply shift to x coordinates
  let currentPoints = rawPoints.map((p) => ({ x: p.x + shift, y: p.y }));
  let currentPeaks = rawPeaks.map((pk) => ({
    ...pk,
    position: pk.position + shift,
  }));

  // 2. Determine range / region bounds
  let minX = -Infinity;
  let maxX = Infinity;

  if (technique === 'xps') {
    const region = String(effectiveValues.regionSelection ?? 'Survey');
    const window = getRegionWindowByValue(region);
    if (window) {
      minX = window.min;
      maxX = window.max;
    }
  } else if (technique === 'xrd') {
    if (typeof effectiveValues.twoThetaMin === 'number') minX = effectiveValues.twoThetaMin;
    if (typeof effectiveValues.twoThetaMax === 'number') maxX = effectiveValues.twoThetaMax;
  } else if (technique === 'ftir') {
    if (typeof effectiveValues.wavenumberMin === 'number') minX = effectiveValues.wavenumberMin;
    if (typeof effectiveValues.wavenumberMax === 'number') maxX = effectiveValues.wavenumberMax;
  } else if (technique === 'raman') {
    if (typeof effectiveValues.shiftMin === 'number') minX = effectiveValues.shiftMin;
    if (typeof effectiveValues.shiftMax === 'number') maxX = effectiveValues.shiftMax;
  }

  // Filter points and peaks by range
  currentPoints = currentPoints.filter((p) => p.x >= minX && p.x <= maxX);
  currentPeaks = currentPeaks.filter((pk) => pk.position >= minX && pk.position <= maxX);

  if (currentPoints.length === 0) {
    return { points: [], baselinePoints: [], peaks: [], peakMarkers: [] };
  }

  // 3. Apply Smoothing
  const smoothingMethod = String(
    effectiveValues.smoothingMethod ?? effectiveValues.smoothing_method ?? 'Savitzky-Golay',
  );

  let windowSize = 1;
  if (smoothingMethod !== 'None' && smoothingMethod !== 'none') {
    windowSize = Number(
      effectiveValues.smoothingWindow ??
        effectiveValues.smoothing_window ??
        effectiveValues.smoothing_window_size ??
        7,
    );
  }

  if (windowSize > 1) {
    currentPoints = applySmoothing(currentPoints, windowSize);
  }

  // 4. Baseline Correction / Background Subtraction
  const baselineMethod = String(
    effectiveValues.baselineMethod ??
      effectiveValues.backgroundMethod ??
      effectiveValues.baseline_method ??
      'Asymmetric LS',
  );

  let baselinePoints: Array<{ x: number; y: number }> = [];

  if (baselineMethod !== 'None' && baselineMethod !== 'none') {
    const iterations = Math.min(
      50,
      Math.max(
        3,
        Number(
          effectiveValues.baselineIterations ??
            effectiveValues.baseline_iterations ??
            12,
        ),
      ),
    );

    baselinePoints = estimateBaselineCurve(currentPoints, iterations);

    // Subtract baseline
    currentPoints = currentPoints.map((p, i) => ({
      x: p.x,
      y: Math.max(0, p.y - baselinePoints[i].y),
    }));
  } else {
    // Zero baseline
    baselinePoints = currentPoints.map((p) => ({ x: p.x, y: 0 }));
  }

  // 5. Peak Prominence & Height Filtering
  const minProminence = Number(
    effectiveValues.minimumProminence ??
      effectiveValues.surveyPeakProminence ??
      effectiveValues.peak_min_prominence ??
      0,
  );
  const minThreshold = Number(
    effectiveValues.peakThreshold ??
      effectiveValues.peak_min_height ??
      0,
  );

  const maxIntensity = Math.max(...currentPoints.map((p) => p.y), 1);

  const filteredPeaks = currentPeaks.filter((pk) => {
    const relativeIntensity = pk.intensity / maxIntensity;
    if (minProminence > 0 && pk.score < minProminence && relativeIntensity < minProminence) {
      return false;
    }
    if (minThreshold > 0 && relativeIntensity < minThreshold) {
      return false;
    }
    return true;
  });

  const peakMarkers = filteredPeaks.map((pk) => ({
    position: pk.position,
    intensity: pk.intensity,
    label: pk.assignment,
  }));

  return {
    points: currentPoints,
    baselinePoints,
    peaks: filteredPeaks,
    peakMarkers,
  };
}
