/**
 * Technique Dataset Adapters
 *
 * Pure structural reshapes that convert a generic DemoDataset (from
 * demoProjects.ts) to the typed dataset shapes expected by each technique's
 * processing runner.
 *
 * Rules:
 *  - No scientific logic lives here — all processing is in the runners.
 *  - When dataPoints is empty, signal arrays are empty; callers must guard
 *    before invoking the runners (Q1: skip runner, fall back to detectedFeatures).
 *  - XPS: binding energy must be descending (high→low, XPS convention).
 *    If the caller provides ascending data, this adapter silently re-sorts.
 *  - FTIR: absorbance path only. Transmittance conversion is out of scope
 *    (see PATCH_10_7E Q3); add it here in a future patch if needed.
 */

import type { DemoDataset } from '../data/demoProjects';
import type { RamanDataset } from '../data/ramanDemoData';
import type { XpsDataset } from '../data/xpsDemoData';
import type { FtirDataset } from '../data/ftirDemoData';

// ---------------------------------------------------------------------------
// Raman
// ---------------------------------------------------------------------------

/**
 * Map a DemoDataset to the RamanDataset shape.
 *   x → ramanShift (cm⁻¹)
 *   y → intensity (a.u.)
 *
 * Returns a dataset with empty signal arrays when dataPoints is empty.
 * Callers should check `signal.ramanShift.length > 0` before running.
 */
export function demoDatasetToRamanDataset(dataset: DemoDataset): RamanDataset {
  return {
    id: dataset.id,
    label: dataset.fileName,
    sampleName: dataset.sampleName,
    fileName: dataset.fileName,
    signal: {
      ramanShift: dataset.dataPoints.map((p) => p.x),
      intensity: dataset.dataPoints.map((p) => p.y),
    },
    baseline: [],
    peaks: [],
  };
}

// ---------------------------------------------------------------------------
// XPS
// ---------------------------------------------------------------------------

/**
 * Map a DemoDataset to the XpsDataset shape.
 *   x → bindingEnergy (eV)
 *   y → intensity (counts)
 *
 * XPS convention requires binding energy in **descending** order (high→low).
 * If the source data is ascending, this adapter silently re-sorts the pairs
 * so a wrongly-ordered dataset cannot produce a silent mismatch downstream.
 * The guard is also tested in the unit tests (Q2).
 */
export function demoDatasetToXpsDataset(dataset: DemoDataset): XpsDataset {
  const points = dataset.dataPoints;

  // Determine whether data is already in descending BE order.
  const isDescending =
    points.length < 2 || points[0].x >= points[points.length - 1].x;

  // Sort descending if needed (clone to avoid mutating module-level data).
  const orderedPoints = isDescending
    ? points
    : [...points].sort((a, b) => b.x - a.x);

  return {
    id: dataset.id,
    label: dataset.fileName,
    region: 'Survey',
    sampleName: dataset.sampleName,
    fileName: dataset.fileName,
    signal: {
      bindingEnergy: orderedPoints.map((p) => p.x),
      intensity: orderedPoints.map((p) => p.y),
    },
    baseline: [],
    peaks: [],
    matches: [],
  };
}

// ---------------------------------------------------------------------------
// FTIR
// ---------------------------------------------------------------------------

/**
 * Map a DemoDataset to the FtirDataset shape.
 *   x → wavenumber (cm⁻¹, high-to-low FTIR convention preserved as-is)
 *   y → absorbance (a.u.)
 *
 * Transmittance → absorbance conversion is explicitly out of scope.
 */
export function demoDatasetToFtirDataset(dataset: DemoDataset): FtirDataset {
  return {
    id: dataset.id,
    label: dataset.fileName,
    sampleName: dataset.sampleName,
    fileName: dataset.fileName,
    signal: {
      wavenumber: dataset.dataPoints.map((p) => p.x),
      absorbance: dataset.dataPoints.map((p) => p.y),
    },
    baseline: [],
    bands: [],
    matches: [],
  };
}
