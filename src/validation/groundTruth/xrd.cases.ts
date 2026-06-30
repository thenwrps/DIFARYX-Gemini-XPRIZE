import { XRD_PHASE_DATABASE } from '../../data/xrdPhaseDatabase.js';
import { RUTILE_XRD } from '../../engines/reasoningEngine/knowledgeBase/tio2Rules.js';
import { perturbPeaks, type PerturbationType, type PerturbationOptions } from './perturbationHelper.js';

export { type PerturbationType };

export interface XrdTestCaseInputPeak {
  position: number;
  intensity: number;
}

export interface XrdTestCase {
  id: string;
  category: 'A' | 'B' | 'C';
  description: string;
  input: XrdTestCaseInputPeak[];
  perturbations?: PerturbationType[];
  knownLimitation?: { reason: string };
  expected: {
    topPhase?: string;
    shouldMatch: boolean;
  };
}

function getPerturbedPeaks(
  phaseId: string,
  options: PerturbationOptions = {}
): XrdTestCaseInputPeak[] {
  let rawPeaks: { position: number; intensity: number }[] = [];
  if (phaseId === 'rutile') {
    rawPeaks = RUTILE_XRD.peaks.map(p => ({ position: p.twoTheta, intensity: p.relativeIntensity }));
  } else {
    const phase = XRD_PHASE_DATABASE.find(p => p.id === phaseId);
    if (!phase) {
      throw new Error(`Phase ${phaseId} not found in XRD_PHASE_DATABASE`);
    }
    rawPeaks = phase.peaks.map(p => ({ position: p.position, intensity: p.relativeIntensity }));
  }

  return perturbPeaks(rawPeaks, { tolerance: 0.2, axisUnits: 'deg(2theta)', decimals: 3 }, options);
}

export const XRD_GROUND_TRUTH_CASES: XrdTestCase[] = [
  // Category A: Positive in-set cases (~15 balanced cases covering all perturbation types)
  {
    id: 'xrd-a1-fe3o4',
    category: 'A',
    description: 'Magnetite Fe3O4 positive match with +0.01 deg shift and 1 spurious peak at 21.5 deg.',
    input: getPerturbedPeaks('fe3o4', { shift: 0.01, spuriousPeak: { position: 21.5, intensity: 25 } }),
    perturbations: ['within_tolerance_shift', 'extra_peak', 'combined'],
    expected: { topPhase: 'fe3o4', shouldMatch: true },
  },
  {
    id: 'xrd-a2-hematite',
    category: 'A',
    description: 'Hematite alpha-Fe2O3 positive match with -0.04 deg shift and intensity noise.',
    input: getPerturbedPeaks('alpha-fe2o3', { shift: -0.04, noiseMultiplier: 0.95 }),
    perturbations: ['within_tolerance_shift', 'noise', 'combined'],
    expected: { topPhase: 'alpha-fe2o3', shouldMatch: true },
  },
  {
    id: 'xrd-a3-maghemite',
    category: 'A',
    description: 'Maghemite gamma-Fe2O3 positive match with +0.03 deg shift within tolerance.',
    input: getPerturbedPeaks('maghemite_gamma_fe2o3', { shift: 0.03 }),
    perturbations: ['within_tolerance_shift'],
    expected: { topPhase: 'maghemite_gamma_fe2o3', shouldMatch: true },
  },
  {
    id: 'xrd-a4-cufe2o4',
    category: 'A',
    description: 'Copper Ferrite Cubic CuFe2O4 positive match with +0.02 deg shift.',
    input: getPerturbedPeaks('cufe2o4', { shift: 0.02 }),
    perturbations: ['within_tolerance_shift'],
    expected: { topPhase: 'cufe2o4', shouldMatch: true },
  },
  {
    id: 'xrd-a5-cofe2o4',
    category: 'A',
    description: 'Cobalt Ferrite CoFe2O4 positive match with +0.06 deg shift and spurious peak at 45.0 deg.',
    input: getPerturbedPeaks('cofe2o4', { shift: 0.06, spuriousPeak: { position: 45.0, intensity: 20 } }),
    perturbations: ['within_tolerance_shift', 'extra_peak', 'combined'],
    expected: { topPhase: 'cofe2o4', shouldMatch: true },
  },
  {
    id: 'xrd-a6-nife2o4',
    category: 'A',
    description: 'Nickel Ferrite NiFe2O4 positive match with +0.01 deg shift.',
    input: getPerturbedPeaks('nife2o4', { shift: 0.01 }),
    perturbations: ['within_tolerance_shift'],
    expected: { topPhase: 'nife2o4', shouldMatch: true },
  },
  {
    id: 'xrd-a7-zno',
    category: 'A',
    description: 'Zincite ZnO positive match with +0.10 deg shift.',
    input: getPerturbedPeaks('zincite_zno', { shift: 0.10 }),
    perturbations: ['within_tolerance_shift'],
    expected: { topPhase: 'zincite_zno', shouldMatch: true },
  },
  {
    // Known limitation (Verdict B): CuO tenorite scores below the 0.65 XRD match
    // threshold even with a -0.02 deg shift (well within 0.20 deg tolerance).
    // Root cause is the sparse 4-peak monoclinic CuO reference profile combined
    // with the spinel-family scoring bias in the current XRD engine — this is a
    // real engine limitation, not malformed input. Reference peaks come from
    // XRD_PHASE_DATABASE 'cuo' entry; perturbation is reference-faithful.
    id: 'xrd-a8-cuo',
    category: 'A',
    description: 'Tenorite CuO positive match with -0.02 deg shift.',
    input: getPerturbedPeaks('cuo', { shift: -0.02 }),
    perturbations: ['within_tolerance_shift'],
    knownLimitation: { reason: 'CuO monoclinic reference is sparse (4 peaks); current XRD scorer drops below 0.65 threshold even with reference-faithful input within tolerance.' },
    expected: { topPhase: 'cuo', shouldMatch: true },
  },
  {
    id: 'xrd-a9-anatase',
    category: 'A',
    description: 'Anatase TiO2 positive match with +0.04 deg shift.',
    input: getPerturbedPeaks('anatase_tio2', { shift: 0.04 }),
    perturbations: ['within_tolerance_shift'],
    expected: { topPhase: 'anatase_tio2', shouldMatch: true },
  },
  {
    id: 'xrd-a10-hematite-noise',
    category: 'A',
    description: 'Hematite alpha-Fe2O3 positive match with isolated intensity noise (0.85x multiplier).',
    input: getPerturbedPeaks('alpha-fe2o3', { noiseMultiplier: 0.85 }),
    perturbations: ['noise'],
    expected: { topPhase: 'alpha-fe2o3', shouldMatch: true },
  },
  {
    id: 'xrd-a11-zno-noise',
    category: 'A',
    description: 'Zincite ZnO positive match with isolated intensity noise (1.2x multiplier).',
    input: getPerturbedPeaks('zincite_zno', { noiseMultiplier: 1.2 }),
    perturbations: ['noise'],
    expected: { topPhase: 'zincite_zno', shouldMatch: true },
  },
  {
    id: 'xrd-a12-anatase-missing',
    category: 'A',
    description: 'Anatase TiO2 positive match with isolated missing peak (1 secondary peak dropped).',
    input: getPerturbedPeaks('anatase_tio2', { dropCount: 1 }),
    perturbations: ['missing_peak'],
    expected: { topPhase: 'anatase_tio2', shouldMatch: true },
  },
  {
    id: 'xrd-a13-fe3o4-missing',
    category: 'A',
    description: 'Magnetite Fe3O4 positive match with isolated missing peaks (2 secondary peaks dropped).',
    input: getPerturbedPeaks('fe3o4', { dropCount: 2 }),
    perturbations: ['missing_peak'],
    expected: { topPhase: 'fe3o4', shouldMatch: true },
  },
  {
    id: 'xrd-a14-cufe2o4-extra',
    category: 'A',
    description: 'Copper Ferrite CuFe2O4 positive match with isolated extra spurious peak at 28.0 deg.',
    input: getPerturbedPeaks('cufe2o4', { spuriousPeak: { position: 28.0, intensity: 20 } }),
    perturbations: ['extra_peak'],
    expected: { topPhase: 'cufe2o4', shouldMatch: true },
  },
  {
    id: 'xrd-a15-nife2o4-extra',
    category: 'A',
    description: 'Nickel Ferrite NiFe2O4 positive match with isolated extra spurious peak at 42.0 deg.',
    input: getPerturbedPeaks('nife2o4', { spuriousPeak: { position: 42.0, intensity: 25 } }),
    perturbations: ['extra_peak'],
    expected: { topPhase: 'nife2o4', shouldMatch: true },
  },

  // Category B: Negative out-of-set cases (~5 genuinely absent phases)
  {
    id: 'xrd-b1-quartz',
    category: 'B',
    description: 'Quartz SiO2 peaks (genuinely absent from reference DB). Should return shouldMatch: false.',
    input: [
      { position: 20.85, intensity: 22 },
      { position: 26.64, intensity: 100 },
      { position: 50.14, intensity: 14 },
      { position: 59.95, intensity: 9 },
    ],
    expected: { shouldMatch: false },
  },
  {
    id: 'xrd-b2-batio3',
    category: 'B',
    description: 'BaTiO3 perovskite peaks (genuinely absent from reference DB). Should return shouldMatch: false.',
    input: [
      { position: 22.1, intensity: 100 },
      { position: 31.5, intensity: 80 },
      { position: 38.9, intensity: 60 },
      { position: 45.2, intensity: 50 },
    ],
    expected: { shouldMatch: false },
  },
  {
    id: 'xrd-b3-nacl',
    category: 'B',
    description: 'Halite NaCl peaks (genuinely absent from reference DB). Should return shouldMatch: false.',
    input: [
      { position: 31.7, intensity: 100 },
      { position: 45.4, intensity: 55 },
      { position: 56.5, intensity: 20 },
      { position: 66.2, intensity: 8 },
    ],
    expected: { shouldMatch: false },
  },
  {
    id: 'xrd-b4-calcite',
    category: 'B',
    description: 'Calcite CaCO3 peaks (genuinely absent from reference DB). Should return shouldMatch: false.',
    input: [
      { position: 29.4, intensity: 100 },
      { position: 39.4, intensity: 18 },
      { position: 43.2, intensity: 18 },
      { position: 48.5, intensity: 20 },
    ],
    expected: { shouldMatch: false },
  },
  {
    id: 'xrd-b5-rutile',
    category: 'B',
    description: 'Rutile TiO2 peaks (absent from reference DB). Should return shouldMatch: false.',
    input: getPerturbedPeaks('rutile'),
    expected: { shouldMatch: false },
  },

  // Category C: Tolerance edge cases (~3 cases testing +/-0.2 deg threshold)
  {
    id: 'xrd-c1-in-tolerance',
    category: 'C',
    description: 'Magnetite Fe3O4 shifted by +0.13 deg (just inside 0.20 deg tolerance). Should match.',
    input: getPerturbedPeaks('fe3o4', { shift: 0.13 }),
    perturbations: ['within_tolerance_shift'],
    expected: { topPhase: 'fe3o4', shouldMatch: true },
  },
  {
    id: 'xrd-c2-out-tolerance',
    category: 'C',
    description: 'Magnetite Fe3O4 shifted by +0.26 deg (just outside 0.20 deg tolerance). Should NOT match.',
    input: getPerturbedPeaks('fe3o4', { shift: 0.26 }),
    perturbations: ['beyond_tolerance_shift'],
    expected: { shouldMatch: false },
  },
  {
    id: 'xrd-c3-out-tolerance-zno',
    category: 'C',
    description: 'Zincite ZnO shifted by +0.25 deg (just outside 0.20 deg tolerance). Should NOT match.',
    input: getPerturbedPeaks('zincite_zno', { shift: 0.25 }),
    perturbations: ['beyond_tolerance_shift'],
    expected: { shouldMatch: false },
  },
];
