import { perturbPeaks, type Peak, type PerturbationType, type TechniquePerturbationConfig } from './perturbationHelper.js';
import { runFtirProcessing } from '../../agents/ftirAgent/runner.js';
import type { TechniqueCaseResult } from '../metrics.js';

export interface FtirTestCase {
  id: string;
  category: 'A' | 'B' | 'C';
  description: string;
  input: Peak[];
  expected: {
    shouldMatch: boolean;
    topPhase?: string; // Representing target phase/material to illustrate exact-phase weakness vs band-family recall
  };
  perturbations: PerturbationType[];
}

const FTIR_CONFIG: TechniquePerturbationConfig = {
  tolerance: 25,
  axisUnits: 'cm-1',
  decimals: 0,
};

// Seeded reference peaks from FTIR_REFERENCE_DATA and FTIR_GROUP_CORRELATION_TABLE
const RAW_CUFE2O4_FTIR: Peak[] = [
  { position: 3400, intensity: 80 }, // Surface hydroxyl
  { position: 1640, intensity: 50 }, // Adsorbed water
  { position: 575, intensity: 100 }, // Metal-oxygen vibration
];

const RAW_FE3O4_FTIR: Peak[] = [
  { position: 3400, intensity: 70 },
  { position: 575, intensity: 100 },
];

const RAW_CARBONATE_FTIR: Peak[] = [
  { position: 3400, intensity: 60 },
  { position: 1450, intensity: 80 }, // Carbonate
  { position: 575, intensity: 100 },
];

const RAW_CARBOXYLATE_FTIR: Peak[] = [
  { position: 3400, intensity: 60 },
  { position: 1600, intensity: 80 }, // Carboxylate
  { position: 575, intensity: 100 },
];

const RAW_ALIPHATIC_FTIR: Peak[] = [
  { position: 2920, intensity: 70 }, // Aliphatic C-H
  { position: 575, intensity: 100 },
];

const RAW_QUARTZ_FTIR: Peak[] = [
  { position: 1100, intensity: 100 },
  { position: 800, intensity: 60 },
  { position: 460, intensity: 80 },
];

const RAW_CAF2_FTIR: Peak[] = [
  { position: 300, intensity: 100 },
];

const RAW_SI3N4_FTIR: Peak[] = [
  { position: 900, intensity: 100 },
];

const RAW_KBR_FTIR: Peak[] = [
  { position: 350, intensity: 20 },
];

export const FTIR_GROUND_TRUTH_CASES: FtirTestCase[] = [
  // --- Category A: Positive, Perturbed ---
  {
    id: 'ftir-a1-cufe2o4',
    category: 'A',
    description: 'CuFe2O4 catalyst with minor shift within tolerance',
    input: perturbPeaks(RAW_CUFE2O4_FTIR, FTIR_CONFIG, { shift: 5 }),
    expected: { shouldMatch: true, topPhase: 'cufe2o4' },
    perturbations: ['within_tolerance_shift'],
  },
  {
    id: 'ftir-a2-fe3o4',
    category: 'A',
    description: 'Fe3O4 catalyst with minor shift within tolerance',
    input: perturbPeaks(RAW_FE3O4_FTIR, FTIR_CONFIG, { shift: -5 }),
    expected: { shouldMatch: true, topPhase: 'fe3o4' },
    perturbations: ['within_tolerance_shift'],
  },
  {
    id: 'ftir-a3-carbonate',
    category: 'A',
    description: 'Carbonate species with shift within tolerance',
    input: perturbPeaks(RAW_CARBONATE_FTIR, FTIR_CONFIG, { shift: 8 }),
    expected: { shouldMatch: true, topPhase: 'carbonate_oxide' },
    perturbations: ['within_tolerance_shift'],
  },
  {
    id: 'ftir-a4-carboxylate',
    category: 'A',
    description: 'Carboxylate species with shift within tolerance',
    input: perturbPeaks(RAW_CARBOXYLATE_FTIR, FTIR_CONFIG, { shift: -8 }),
    expected: { shouldMatch: true, topPhase: 'carboxylate_oxide' },
    perturbations: ['within_tolerance_shift'],
  },
  {
    id: 'ftir-a5-aliphatic',
    category: 'A',
    description: 'Aliphatic C-H species with shift within tolerance',
    input: perturbPeaks(RAW_ALIPHATIC_FTIR, FTIR_CONFIG, { shift: 10 }),
    expected: { shouldMatch: true, topPhase: 'aliphatic_oxide' },
    perturbations: ['within_tolerance_shift'],
  },
  {
    id: 'ftir-a6-cufe2o4-noise',
    category: 'A',
    description: 'CuFe2O4 with intensity multiplier variation',
    input: perturbPeaks(RAW_CUFE2O4_FTIR, FTIR_CONFIG, { noiseMultiplier: 1.4 }),
    expected: { shouldMatch: true, topPhase: 'cufe2o4' },
    perturbations: ['noise'],
  },
  {
    id: 'ftir-a7-fe3o4-noise',
    category: 'A',
    description: 'Fe3O4 with intensity multiplier variation',
    input: perturbPeaks(RAW_FE3O4_FTIR, FTIR_CONFIG, { noiseMultiplier: 0.7 }),
    expected: { shouldMatch: true, topPhase: 'fe3o4' },
    perturbations: ['noise'],
  },
  {
    id: 'ftir-a8-cufe2o4-missing',
    category: 'A',
    description: 'CuFe2O4 missing water bending band',
    input: perturbPeaks(RAW_CUFE2O4_FTIR, FTIR_CONFIG, { dropCount: 1 }),
    expected: { shouldMatch: true, topPhase: 'cufe2o4' },
    perturbations: ['missing_peak'],
  },
  {
    id: 'ftir-a9-carbonate-missing',
    category: 'A',
    description: 'Carbonate oxide missing secondary band',
    input: perturbPeaks(RAW_CARBONATE_FTIR, FTIR_CONFIG, { dropCount: 1 }),
    expected: { shouldMatch: true, topPhase: 'carbonate_oxide' },
    perturbations: ['missing_peak'],
  },
  {
    id: 'ftir-a10-cufe2o4-extra',
    category: 'A',
    description: 'CuFe2O4 with spurious peak at 2100 cm-1',
    input: perturbPeaks(RAW_CUFE2O4_FTIR, FTIR_CONFIG, { spuriousPeak: { position: 2100, intensity: 40 } }),
    expected: { shouldMatch: true, topPhase: 'cufe2o4' },
    perturbations: ['extra_peak'],
  },
  {
    id: 'ftir-a11-fe3o4-extra',
    category: 'A',
    description: 'Fe3O4 with spurious peak at 1900 cm-1',
    input: perturbPeaks(RAW_FE3O4_FTIR, FTIR_CONFIG, { spuriousPeak: { position: 1900, intensity: 35 } }),
    expected: { shouldMatch: true, topPhase: 'fe3o4' },
    perturbations: ['extra_peak'],
  },
  {
    id: 'ftir-a12-beyond-cufe2o4',
    category: 'A',
    description: 'CuFe2O4 shifted beyond 25 cm-1 tolerance (+40 cm-1)',
    input: perturbPeaks(RAW_CUFE2O4_FTIR, FTIR_CONFIG, { shift: 40 }),
    expected: { shouldMatch: true, topPhase: 'cufe2o4' },
    perturbations: ['beyond_tolerance_shift'],
  },
  {
    id: 'ftir-a13-beyond-fe3o4',
    category: 'A',
    description: 'Fe3O4 shifted beyond 25 cm-1 tolerance (-40 cm-1)',
    input: perturbPeaks(RAW_FE3O4_FTIR, FTIR_CONFIG, { shift: -40 }),
    expected: { shouldMatch: true, topPhase: 'fe3o4' },
    perturbations: ['beyond_tolerance_shift'],
  },
  {
    id: 'ftir-a14-combined-cufe2o4',
    category: 'A',
    description: 'CuFe2O4 with shift, noise, and extra peak',
    input: perturbPeaks(RAW_CUFE2O4_FTIR, FTIR_CONFIG, { shift: 5, noiseMultiplier: 1.2, spuriousPeak: { position: 2200, intensity: 30 } }),
    expected: { shouldMatch: true, topPhase: 'cufe2o4' },
    perturbations: ['combined'],
  },
  {
    id: 'ftir-a15-combined-carbonate',
    category: 'A',
    description: 'Carbonate oxide with shift and noise',
    input: perturbPeaks(RAW_CARBONATE_FTIR, FTIR_CONFIG, { shift: -8, noiseMultiplier: 1.3 }),
    expected: { shouldMatch: true, topPhase: 'carbonate_oxide' },
    perturbations: ['combined'],
  },

  // --- Category B: Negative, Out-of-Set ---
  {
    id: 'ftir-b1-quartz',
    category: 'B',
    description: 'Out-of-set Quartz SiO2 (bands outside M-O reference)',
    input: RAW_QUARTZ_FTIR,
    expected: { shouldMatch: false },
    perturbations: [],
  },
  {
    id: 'ftir-b2-caf2',
    category: 'B',
    description: 'Out-of-set Calcium Fluoride CaF2',
    input: RAW_CAF2_FTIR,
    expected: { shouldMatch: false },
    perturbations: [],
  },
  {
    id: 'ftir-b3-si3n4',
    category: 'B',
    description: 'Out-of-set Silicon Nitride Si3N4',
    input: RAW_SI3N4_FTIR,
    expected: { shouldMatch: false },
    perturbations: [],
  },
  {
    id: 'ftir-b4-kbr',
    category: 'B',
    description: 'Out-of-set Potassium Bromide KBr blank',
    input: RAW_KBR_FTIR,
    expected: { shouldMatch: false },
    perturbations: [],
  },

  // --- Category C: Tolerance Edge ---
  {
    id: 'ftir-c1-in-tolerance',
    category: 'C',
    description: 'M-O band at 640 cm-1 (inside [500, 650] range)',
    input: [{ position: 640, intensity: 100 }],
    expected: { shouldMatch: true, topPhase: 'metal_oxide' },
    perturbations: ['within_tolerance_shift'],
  },
  {
    id: 'ftir-c2-out-tolerance',
    category: 'C',
    description: 'M-O band at 670 cm-1 (outside [500, 650] range and all references)',
    input: [{ position: 670, intensity: 100 }],
    expected: { shouldMatch: false },
    perturbations: ['beyond_tolerance_shift'],
  },
];

function synthesizeFtirSignal(peaks: Peak[]): { wavenumber: number[]; absorbance: number[] } {
  const wavenumber: number[] = [];
  const absorbance: number[] = [];
  for (let wn = 4000; wn >= 400; wn -= 2) {
    let y = 0.05 + (4000 - wn) / 40000;
    for (const p of peaks) {
      if (Math.abs(wn - p.position) < 200) {
        y += (p.intensity / 100) * 0.4 * Math.exp(-Math.pow((wn - p.position) / 50, 2));
      }
    }
    wavenumber.push(wn);
    absorbance.push(Number(y.toFixed(4)));
  }
  return { wavenumber, absorbance };
}

export function evaluateFtirCases(): TechniqueCaseResult[] {
  const results: TechniqueCaseResult[] = [];

  for (const tc of FTIR_GROUND_TRUTH_CASES) {
    const trace = synthesizeFtirSignal(tc.input);
    const agentResult = runFtirProcessing({
      id: `val-${tc.id}`,
      label: tc.description,
      sampleName: tc.description,
      fileName: `${tc.id}.txt`,
      signal: trace,
      baseline: [],
      bands: [],
    });

    const dominantGroups = agentResult.interpretation?.dominantFunctionalGroups || [];
    const actualDidMatch = Boolean(dominantGroups.length > 0 && agentResult.interpretation.confidenceScore >= 40);
    const actualPhase = actualDidMatch && dominantGroups.length > 0 ? dominantGroups.join(', ') : undefined;

    results.push({
      caseId: tc.id,
      expectedShouldMatch: tc.expected.shouldMatch,
      actualDidMatch,
      expectedPhase: tc.expected.topPhase,
      actualPhase,
      actualScore: agentResult.interpretation?.confidenceScore ? agentResult.interpretation.confidenceScore / 100 : 0,
      perturbations: tc.perturbations,
    });
  }

  return results;
}
