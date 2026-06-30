import { perturbPeaks, type Peak, type PerturbationType, type TechniquePerturbationConfig } from './perturbationHelper.js';
import { runRamanProcessing } from '../../agents/ramanAgent/runner.js';
import type { TechniqueCaseResult } from '../metrics.js';

export interface RamanTestCase {
  id: string;
  category: 'A' | 'B' | 'C';
  description: string;
  input: Peak[];
  expected: {
    shouldMatch: boolean;
    topPhase?: string;
  };
  perturbations: PerturbationType[];
}

const RAMAN_CONFIG: TechniquePerturbationConfig = {
  tolerance: 8,
  axisUnits: 'cm-1',
  decimals: 1,
};

// Seeded unperturbed peaks derived from RAMAN_STARTER_DATABASE and literature
const RAW_FE3O4: Peak[] = [
  { position: 668, intensity: 100 },
  { position: 538, intensity: 40 },
  { position: 306, intensity: 30 },
];

const RAW_HEMATITE: Peak[] = [
  { position: 226, intensity: 100 },
  { position: 292, intensity: 90 },
  { position: 1320, intensity: 80 },
];

const RAW_ANATASE: Peak[] = [
  { position: 144, intensity: 100 },
  { position: 197, intensity: 40 },
  { position: 399, intensity: 50 },
  { position: 516, intensity: 60 },
  { position: 639, intensity: 50 },
];

const RAW_RUTILE: Peak[] = [
  { position: 447, intensity: 100 },
  { position: 612, intensity: 80 },
];

const RAW_ZINCITE: Peak[] = [
  { position: 437, intensity: 100 },
  { position: 332, intensity: 40 },
  { position: 380, intensity: 50 },
];

const RAW_TENORITE: Peak[] = [
  { position: 298, intensity: 100 },
  { position: 345, intensity: 60 },
  { position: 630, intensity: 50 },
];

const RAW_CUFE2O4: Peak[] = [
  { position: 656, intensity: 100 },
  { position: 481, intensity: 70 },
  { position: 278, intensity: 70 },
];

const RAW_COFE2O4: Peak[] = [
  { position: 685, intensity: 100 },
  { position: 470, intensity: 60 },
  { position: 310, intensity: 50 },
];

const RAW_NIFE2O4: Peak[] = [
  { position: 702, intensity: 100 },
  { position: 490, intensity: 60 },
  { position: 330, intensity: 50 },
];

const RAW_QUARTZ: Peak[] = [
  { position: 464, intensity: 100 },
  { position: 206, intensity: 50 },
  { position: 128, intensity: 40 },
];

const RAW_CALCITE: Peak[] = [
  { position: 1085, intensity: 100 },
  { position: 711, intensity: 40 },
  { position: 282, intensity: 50 },
];

const RAW_BATIO3: Peak[] = [
  { position: 515, intensity: 100 },
  { position: 305, intensity: 60 },
  { position: 720, intensity: 40 },
];

const RAW_NACL: Peak[] = [
  { position: 350, intensity: 20 },
];

export const RAMAN_GROUND_TRUTH_CASES: RamanTestCase[] = [
  // --- Category A: Positive, Perturbed ---
  {
    id: 'raman-a1-fe3o4',
    category: 'A',
    description: 'Magnetite Fe3O4 with minor shift within tolerance',
    input: perturbPeaks(RAW_FE3O4, RAMAN_CONFIG, { shift: 2.0 }),
    expected: { shouldMatch: true, topPhase: 'fe3o4' },
    perturbations: ['within_tolerance_shift'],
  },
  {
    id: 'raman-a2-hematite',
    category: 'A',
    description: 'Hematite alpha-Fe2O3 with minor shift within tolerance',
    input: perturbPeaks(RAW_HEMATITE, RAMAN_CONFIG, { shift: -2.0 }),
    expected: { shouldMatch: true, topPhase: 'hematite' },
    perturbations: ['within_tolerance_shift'],
  },
  {
    id: 'raman-a3-anatase',
    category: 'A',
    description: 'Anatase TiO2 with minor shift within tolerance',
    input: perturbPeaks(RAW_ANATASE, RAMAN_CONFIG, { shift: 1.5 }),
    expected: { shouldMatch: true, topPhase: 'anatase' },
    perturbations: ['within_tolerance_shift'],
  },
  {
    id: 'raman-a4-rutile',
    category: 'A',
    description: 'Rutile TiO2 with minor shift within tolerance',
    input: perturbPeaks(RAW_RUTILE, RAMAN_CONFIG, { shift: -1.5 }),
    expected: { shouldMatch: true, topPhase: 'rutile' },
    perturbations: ['within_tolerance_shift'],
  },
  {
    id: 'raman-a5-zincite',
    category: 'A',
    description: 'Zincite ZnO with minor shift within tolerance',
    input: perturbPeaks(RAW_ZINCITE, RAMAN_CONFIG, { shift: 2.5 }),
    expected: { shouldMatch: true, topPhase: 'zincite' },
    perturbations: ['within_tolerance_shift'],
  },
  {
    id: 'raman-a6-tenorite',
    category: 'A',
    description: 'Tenorite CuO with minor shift within tolerance',
    input: perturbPeaks(RAW_TENORITE, RAMAN_CONFIG, { shift: 1.0 }),
    expected: { shouldMatch: true, topPhase: 'tenorite' },
    perturbations: ['within_tolerance_shift'],
  },
  {
    id: 'raman-a7-cufe2o4',
    category: 'A',
    description: 'Copper ferrite CuFe2O4 with minor shift within tolerance',
    input: perturbPeaks(RAW_CUFE2O4, RAMAN_CONFIG, { shift: 2.0 }),
    expected: { shouldMatch: true, topPhase: 'cufe2o4' },
    perturbations: ['within_tolerance_shift'],
  },
  {
    id: 'raman-a8-cofe2o4',
    category: 'A',
    description: 'Cobalt ferrite CoFe2O4 with minor shift within tolerance',
    input: perturbPeaks(RAW_COFE2O4, RAMAN_CONFIG, { shift: -2.0 }),
    expected: { shouldMatch: true, topPhase: 'cofe2o4' },
    perturbations: ['within_tolerance_shift'],
  },
  {
    id: 'raman-a9-nife2o4',
    category: 'A',
    description: 'Nickel ferrite NiFe2O4 with minor shift within tolerance',
    input: perturbPeaks(RAW_NIFE2O4, RAMAN_CONFIG, { shift: 1.5 }),
    expected: { shouldMatch: true, topPhase: 'nife2o4' },
    perturbations: ['within_tolerance_shift'],
  },
  {
    id: 'raman-a10-fe3o4-noise',
    category: 'A',
    description: 'Magnetite Fe3O4 with intensity multiplier variation',
    input: perturbPeaks(RAW_FE3O4, RAMAN_CONFIG, { noiseMultiplier: 1.4 }),
    expected: { shouldMatch: true, topPhase: 'fe3o4' },
    perturbations: ['noise'],
  },
  {
    id: 'raman-a11-hematite-noise',
    category: 'A',
    description: 'Hematite alpha-Fe2O3 with intensity multiplier variation',
    input: perturbPeaks(RAW_HEMATITE, RAMAN_CONFIG, { noiseMultiplier: 0.7 }),
    expected: { shouldMatch: true, topPhase: 'hematite' },
    perturbations: ['noise'],
  },
  {
    id: 'raman-a12-anatase-missing',
    category: 'A',
    description: 'Anatase TiO2 missing second strongest peak',
    input: perturbPeaks(RAW_ANATASE, RAMAN_CONFIG, { dropCount: 1 }),
    expected: { shouldMatch: true, topPhase: 'anatase' },
    perturbations: ['missing_peak'],
  },
  {
    id: 'raman-a13-zincite-missing',
    category: 'A',
    description: 'Zincite ZnO missing secondary peak',
    input: perturbPeaks(RAW_ZINCITE, RAMAN_CONFIG, { dropCount: 1 }),
    expected: { shouldMatch: true, topPhase: 'zincite' },
    perturbations: ['missing_peak'],
  },
  {
    id: 'raman-a14-rutile-extra',
    category: 'A',
    description: 'Rutile TiO2 with extra spurious peak at 850 cm-1',
    input: perturbPeaks(RAW_RUTILE, RAMAN_CONFIG, { spuriousPeak: { position: 850, intensity: 35 } }),
    expected: { shouldMatch: true, topPhase: 'rutile' },
    perturbations: ['extra_peak'],
  },
  {
    id: 'raman-a15-tenorite-extra',
    category: 'A',
    description: 'Tenorite CuO with extra spurious peak at 800 cm-1',
    input: perturbPeaks(RAW_TENORITE, RAMAN_CONFIG, { spuriousPeak: { position: 800, intensity: 40 } }),
    expected: { shouldMatch: true, topPhase: 'tenorite' },
    perturbations: ['extra_peak'],
  },
  {
    id: 'raman-a16-beyond-fe3o4',
    category: 'A',
    description: 'Magnetite shifted beyond 8 cm-1 tolerance (+15 cm-1)',
    input: perturbPeaks(RAW_FE3O4, RAMAN_CONFIG, { shift: 15.0 }),
    expected: { shouldMatch: true, topPhase: 'fe3o4' },
    perturbations: ['beyond_tolerance_shift'],
  },
  {
    id: 'raman-a17-beyond-hematite',
    category: 'A',
    description: 'Hematite shifted beyond 8 cm-1 tolerance (+16 cm-1)',
    input: perturbPeaks(RAW_HEMATITE, RAMAN_CONFIG, { shift: 16.0 }),
    expected: { shouldMatch: true, topPhase: 'hematite' },
    perturbations: ['beyond_tolerance_shift'],
  },
  {
    id: 'raman-a18-combined-cufe2o4',
    category: 'A',
    description: 'Copper ferrite with shift, noise, and extra peak',
    input: perturbPeaks(RAW_CUFE2O4, RAMAN_CONFIG, { shift: 2.0, noiseMultiplier: 1.2, spuriousPeak: { position: 900, intensity: 30 } }),
    expected: { shouldMatch: true, topPhase: 'cufe2o4' },
    perturbations: ['combined'],
  },
  {
    id: 'raman-a19-combined-anatase',
    category: 'A',
    description: 'Anatase with shift and noise',
    input: perturbPeaks(RAW_ANATASE, RAMAN_CONFIG, { shift: 1.5, noiseMultiplier: 1.3 }),
    expected: { shouldMatch: true, topPhase: 'anatase' },
    perturbations: ['combined'],
  },

  // --- Category B: Negative, Out-of-Set ---
  {
    id: 'raman-b1-quartz',
    category: 'B',
    description: 'Out-of-set Quartz SiO2',
    input: RAW_QUARTZ,
    expected: { shouldMatch: false },
    perturbations: [],
  },
  {
    id: 'raman-b2-calcite',
    category: 'B',
    description: 'Out-of-set Calcite CaCO3',
    input: RAW_CALCITE,
    expected: { shouldMatch: false },
    perturbations: [],
  },
  {
    id: 'raman-b3-batio3',
    category: 'B',
    description: 'Out-of-set Barium Titanate BaTiO3',
    input: RAW_BATIO3,
    expected: { shouldMatch: false },
    perturbations: [],
  },
  {
    id: 'raman-b4-nacl',
    category: 'B',
    description: 'Out-of-set Halite NaCl',
    input: RAW_NACL,
    expected: { shouldMatch: false },
    perturbations: [],
  },

  // --- Category C: Tolerance Edge ---
  {
    id: 'raman-c1-in-tolerance',
    category: 'C',
    description: 'Magnetite shifted by +7.0 cm-1 (just inside 8 cm-1 tolerance)',
    input: perturbPeaks(RAW_FE3O4, RAMAN_CONFIG, { shift: 7.0 }),
    expected: { shouldMatch: true, topPhase: 'fe3o4' },
    perturbations: ['within_tolerance_shift'],
  },
  {
    id: 'raman-c2-out-tolerance',
    category: 'C',
    description: 'Magnetite shifted by +9.5 cm-1 (just outside 8 cm-1 tolerance)',
    input: perturbPeaks(RAW_FE3O4, RAMAN_CONFIG, { shift: 9.5 }),
    expected: { shouldMatch: false },
    perturbations: ['beyond_tolerance_shift'],
  },
];

function synthesizeRamanSignal(peaks: Peak[]): { ramanShift: number[]; intensity: number[] } {
  const ramanShift: number[] = [];
  const intensity: number[] = [];
  for (let x = 100; x <= 1600; x += 1) {
    let y = 10;
    for (const p of peaks) {
      if (Math.abs(x - p.position) < 35) {
        y += p.intensity * Math.exp(-Math.pow((x - p.position) / 5, 2));
      }
    }
    ramanShift.push(x);
    intensity.push(y);
  }
  return { ramanShift, intensity };
}

export function evaluateRamanCases(): TechniqueCaseResult[] {
  const results: TechniqueCaseResult[] = [];

  for (const tc of RAMAN_GROUND_TRUTH_CASES) {
    const trace = synthesizeRamanSignal(tc.input);
    const agentResult = runRamanProcessing({
      id: `val-${tc.id}`,
      label: tc.description,
      sampleName: tc.description,
      fileName: `${tc.id}.txt`,
      signal: trace,
      baseline: [],
      peaks: [],
    });

    const bestCand = agentResult.modeCandidate?.[0];
    const actualDidMatch = Boolean(bestCand && bestCand.score >= 0.5);
    const actualPhase = actualDidMatch && bestCand ? bestCand.phaseId : undefined;

    results.push({
      caseId: tc.id,
      expectedShouldMatch: tc.expected.shouldMatch,
      actualDidMatch,
      expectedPhase: tc.expected.topPhase,
      actualPhase,
      actualScore: bestCand ? bestCand.score : 0,
      perturbations: tc.perturbations,
    });
  }

  return results;
}
