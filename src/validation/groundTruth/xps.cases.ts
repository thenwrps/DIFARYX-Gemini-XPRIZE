import { perturbPeaks, type Peak, type PerturbationType, type TechniquePerturbationConfig } from './perturbationHelper.js';
import { runXpsProcessing } from '../../agents/xpsAgent/runner.js';
import type { TechniqueCaseResult } from '../metrics.js';

export interface XpsTestCase {
  id: string;
  category: 'A' | 'B' | 'C';
  description: string;
  input: Peak[];
  expected: {
    shouldMatch: boolean;
    topPhase?: string; // Scored over (element, oxidationState) label e.g. 'Cu²⁺'
  };
  perturbations: PerturbationType[];
  knownLimitation?: { reason: string };
}

const XPS_CONFIG: TechniquePerturbationConfig = {
  tolerance: 0.5,
  axisUnits: 'eV',
  decimals: 2,
};

// Seeded core level reference binding energies from xpsReferenceData.ts
const RAW_CU2P: Peak[] = [
  { position: 933.6, intensity: 5000 }, // Cu²⁺
];

const RAW_FE2P_3: Peak[] = [
  { position: 711.0, intensity: 5000 }, // Fe³⁺
];

const RAW_FE2P_2: Peak[] = [
  { position: 709.5, intensity: 5000 }, // Fe²⁺
];

const RAW_TI2P: Peak[] = [
  { position: 458.5, intensity: 5000 }, // Ti⁴⁺
];

const RAW_ZN2P: Peak[] = [
  { position: 1021.8, intensity: 5000 }, // Zn²⁺
];

const RAW_CO2P: Peak[] = [
  { position: 780.0, intensity: 5000 }, // Co²⁺
];

const RAW_NI2P: Peak[] = [
  { position: 855.6, intensity: 5000 }, // Ni²⁺
];

const RAW_O1S: Peak[] = [
  { position: 530.0, intensity: 5000 }, // O²⁻ lattice
];

const RAW_PB4F: Peak[] = [
  { position: 138.6, intensity: 5000 }, // Pb 4f (out of set)
];

const RAW_AG3D: Peak[] = [
  { position: 368.2, intensity: 5000 }, // Ag 3d (out of set)
];

const RAW_BR3D: Peak[] = [
  { position: 68.0, intensity: 5000 }, // Br 3d (out of set)
];

const RAW_NA1S: Peak[] = [
  { position: 1072.0, intensity: 5000 }, // Na 1s (out of set)
];

export const XPS_GROUND_TRUTH_CASES: XpsTestCase[] = [
  // --- Category A: Positive, Perturbed ---
  {
    id: 'xps-a1-cu2p',
    category: 'A',
    description: 'Cu²⁺ 2p3/2 core level shifted within tolerance',
    input: perturbPeaks(RAW_CU2P, XPS_CONFIG, { shift: 0.15 }),
    expected: { shouldMatch: true, topPhase: 'Cu²⁺' },
    perturbations: ['within_tolerance_shift'],
  },
  {
    id: 'xps-a2-fe3p',
    category: 'A',
    description: 'Fe³⁺ 2p3/2 core level shifted within tolerance',
    input: perturbPeaks(RAW_FE2P_3, XPS_CONFIG, { shift: -0.15 }),
    expected: { shouldMatch: true, topPhase: 'Fe³⁺' },
    perturbations: ['within_tolerance_shift'],
  },
  {
    // Known limitation (missing reference, confirmed by reference-faithful probe):
    // The seeded XPS reference table (xpsReferenceData.ts) contains NO Fe²⁺ 2p3/2
    // entry — only Fe³⁺ at 711.0 eV. The Fe²⁺ main line at 709.5 eV
    // (Biesinger 2010) therefore cannot match (deltaBE 1.5 > 0.5 eV tolerance)
    // and scores 0.000 even with reference-faithful input (probe B, 2026-07-01:
    // shift -0.0125 -> effective 709.5 eV -> score 0.000, FAIL). This is a real
    // DB-coverage limitation (missing Fe²⁺ reference), not malformed input and
    // not a scorer-kernel issue. Ref: Biesinger et al., Appl. Surf. Sci. 257, 887 (2010).
    id: 'xps-a3-fe2p',
    category: 'A',
    description: 'Fe²⁺ 2p3/2 core level shifted within tolerance',
    input: perturbPeaks(RAW_FE2P_2, XPS_CONFIG, { shift: 0.1 }),
    expected: { shouldMatch: true, topPhase: 'Fe²⁺' },
    perturbations: ['within_tolerance_shift'],
    knownLimitation: { reason: 'No Fe²⁺ 2p3/2 reference in the seeded DB — only Fe³⁺ at 711.0 eV; the Fe²⁺ main line at 709.5 eV cannot match (deltaBE 1.5 > 0.5 tol). Confirmed by reference-faithful probe (score 0.000).' },
  },
  {
    id: 'xps-a4-ti2p',
    category: 'A',
    description: 'Ti⁴⁺ 2p3/2 core level shifted within tolerance',
    input: perturbPeaks(RAW_TI2P, XPS_CONFIG, { shift: -0.1 }),
    expected: { shouldMatch: true, topPhase: 'Ti⁴⁺' },
    perturbations: ['within_tolerance_shift'],
  },
  {
    // Known limitation (scorer-kernel finding, NOT a material limitation):
    // The +0.2 eV within_tolerance_shift lands the effective peak at 1022.0 eV,
    // i.e. deltaBE = 0.3 eV — exactly at the declared Zn 2p3/2 tolerance edge
    // (ref 1021.7 eV, uncertainty 0.3 eV). The XPS match kernel
    // (calculateMatchScore in xpsAgent/runner.ts) uses a Gaussian with
    // sigma = tolerance/2 = 0.15 eV, so at deltaBE = 0.3 the score collapses to
    // exp(-(0.3^2)/(2*0.15^2)) = 0.135 (< 0.25 threshold) -> FAIL.
    // Reference-exact probe A (2026-07-01): shift -0.1125 -> effective 1021.7 eV
    // -> score 0.411, PASS. This PROVES Zn²⁺ is NOT a material limitation; the
    // failure is purely the scorer's effective single-peak detection window
    // (±0.25 eV = sigma*sqrt(-2*ln(0.25))) being NARROWER than the declared
    // 0.3 eV tolerance. Per decision (a) the +0.2 shift and red flag are KEPT
    // to document this kernel/tolerance inconsistency; the kernel fix is tracked
    // as V2 tech-debt (see baselines.ts header / VALIDATION_BACKLOG) and must be
    // re-validated against all negatives (c2-out-tolerance, b1-b4) and beyond-
    // tolerance cases (a13/a14) before adoption.
    // Ref: NIST XPS Database; Biesinger et al., Appl. Surf. Sci. 257, 887 (2010).
    id: 'xps-a5-zn2p',
    category: 'A',
    description: 'Zn²⁺ 2p3/2 core level shifted within tolerance',
    input: perturbPeaks(RAW_ZN2P, XPS_CONFIG, { shift: 0.2 }),
    expected: { shouldMatch: true, topPhase: 'Zn²⁺' },
    perturbations: ['within_tolerance_shift'],
    knownLimitation: { reason: 'within_tolerance_shift lands deltaBE at the 0.3 eV tolerance edge; Gaussian kernel sigma=tol/2=0.15 collapses the score to 0.135 (< 0.25 threshold); effective single-peak detection window ±0.25 eV is narrower than the declared 0.3 eV tolerance. Reference-exact probe scores 0.411 (PASS) — scorer-kernel finding, not a material limitation.' },
  },
  {
    // Scientific rationale: Co 2p3/2 alone cannot disambiguate Co²⁺ from Co³⁺
    // because the main-line binding energies overlap within ~0.5 eV and the
    // satellite structure (the only true discriminator) is not resolvable from
    // a single 2p3/2 peak. The seeded XPS reference table (xpsReferenceData.ts)
    // therefore models cobalt as a single Co(II/III) entry at 780.0 eV by
    // intentional design — this is the honest label, not an incomplete DB.
    // Ref: Biesinger et al., Appl. Surf. Sci. 257, 2717 (2009).
    id: 'xps-a6-co2p',
    category: 'A',
    description: 'Co 2p3/2 main line within tolerance — labeled Co(II/III) (mixed-valence ambiguity by design)',
    input: perturbPeaks(RAW_CO2P, XPS_CONFIG, { shift: -0.2 }),
    expected: { shouldMatch: true, topPhase: 'Co(II/III)' },
    perturbations: ['within_tolerance_shift'],
  },
  {
    // Verdict A (reference alignment): input position 855.6 eV matches the
    // seeded Ni 2p3/2 Ni²⁺ reference at 855.6 eV (Biesinger 2009) exactly,
    // perturbed by +0.15 eV (within 0.5 eV tolerance). Earlier RAW value of
    // 854.5 eV was a malformed input that pre-dated the reference table, not
    // an engine limitation.
    id: 'xps-a7-ni2p',
    category: 'A',
    description: 'Ni²⁺ 2p3/2 core level shifted within tolerance',
    input: perturbPeaks(RAW_NI2P, XPS_CONFIG, { shift: 0.15 }),
    expected: { shouldMatch: true, topPhase: 'Ni²⁺' },
    perturbations: ['within_tolerance_shift'],
  },
  {
    id: 'xps-a8-o1s',
    category: 'A',
    description: 'O²⁻ lattice oxygen 1s core level shifted within tolerance',
    input: perturbPeaks(RAW_O1S, XPS_CONFIG, { shift: -0.15 }),
    expected: { shouldMatch: true, topPhase: 'O²⁻' },
    perturbations: ['within_tolerance_shift'],
  },
  {
    id: 'xps-a9-cu2p-noise',
    category: 'A',
    description: 'Cu²⁺ core level with intensity multiplier variation',
    input: perturbPeaks(RAW_CU2P, XPS_CONFIG, { noiseMultiplier: 1.4 }),
    expected: { shouldMatch: true, topPhase: 'Cu²⁺' },
    perturbations: ['noise'],
  },
  {
    id: 'xps-a10-fe3p-noise',
    category: 'A',
    description: 'Fe³⁺ core level with intensity multiplier variation',
    input: perturbPeaks(RAW_FE2P_3, XPS_CONFIG, { noiseMultiplier: 0.7 }),
    expected: { shouldMatch: true, topPhase: 'Fe³⁺' },
    perturbations: ['noise'],
  },
  {
    id: 'xps-a11-cu2p-extra',
    category: 'A',
    description: 'Cu²⁺ core level with spurious peak at 600 eV',
    input: perturbPeaks(RAW_CU2P, XPS_CONFIG, { spuriousPeak: { position: 600.0, intensity: 1500 } }),
    expected: { shouldMatch: true, topPhase: 'Cu²⁺' },
    perturbations: ['extra_peak'],
  },
  {
    id: 'xps-a12-fe3p-extra',
    category: 'A',
    description: 'Fe³⁺ core level with spurious peak at 400 eV',
    input: perturbPeaks(RAW_FE2P_3, XPS_CONFIG, { spuriousPeak: { position: 400.0, intensity: 1200 } }),
    expected: { shouldMatch: true, topPhase: 'Fe³⁺' },
    perturbations: ['extra_peak'],
  },
  {
    id: 'xps-a13-beyond-cu2p',
    category: 'A',
    description: 'Cu²⁺ shifted beyond 0.5 eV tolerance (+1.2 eV)',
    input: perturbPeaks(RAW_CU2P, XPS_CONFIG, { shift: 1.2 }),
    expected: { shouldMatch: true, topPhase: 'Cu²⁺' },
    perturbations: ['beyond_tolerance_shift'],
  },
  {
    id: 'xps-a14-beyond-fe3p',
    category: 'A',
    description: 'Fe³⁺ shifted beyond 0.5 eV tolerance (-1.2 eV)',
    input: perturbPeaks(RAW_FE2P_3, XPS_CONFIG, { shift: -1.2 }),
    expected: { shouldMatch: true, topPhase: 'Fe³⁺' },
    perturbations: ['beyond_tolerance_shift'],
  },
  {
    id: 'xps-a15-combined-cu2p',
    category: 'A',
    description: 'Cu²⁺ with shift, noise, and extra peak',
    input: perturbPeaks(RAW_CU2P, XPS_CONFIG, { shift: 0.15, noiseMultiplier: 1.2, spuriousPeak: { position: 650.0, intensity: 1000 } }),
    expected: { shouldMatch: true, topPhase: 'Cu²⁺' },
    perturbations: ['combined'],
  },

  // --- Category B: Negative, Out-of-Set ---
  {
    id: 'xps-b1-lead',
    category: 'B',
    description: 'Out-of-set Lead Pb 4f core level (138.6 eV)',
    input: RAW_PB4F,
    expected: { shouldMatch: false },
    perturbations: [],
  },
  {
    id: 'xps-b2-silver',
    category: 'B',
    description: 'Out-of-set Silver Ag 3d core level (368.2 eV)',
    input: RAW_AG3D,
    expected: { shouldMatch: false },
    perturbations: [],
  },
  {
    id: 'xps-b3-bromine',
    category: 'B',
    description: 'Out-of-set Bromine Br 3d core level (68.0 eV)',
    input: RAW_BR3D,
    expected: { shouldMatch: false },
    perturbations: [],
  },
  {
    id: 'xps-b4-sodium',
    category: 'B',
    description: 'Out-of-set Sodium Na 1s core level (1072.0 eV)',
    input: RAW_NA1S,
    expected: { shouldMatch: false },
    perturbations: [],
  },

  // --- Category C: Tolerance Edge ---
  {
    id: 'xps-c1-in-tolerance',
    category: 'C',
    description: 'Cu²⁺ shifted by +0.4 eV (just inside 0.5 eV tolerance)',
    input: perturbPeaks(RAW_CU2P, XPS_CONFIG, { shift: 0.4 }),
    expected: { shouldMatch: true, topPhase: 'Cu²⁺' },
    perturbations: ['within_tolerance_shift'],
  },
  {
    id: 'xps-c2-out-tolerance',
    category: 'C',
    description: 'Cu²⁺ shifted by +0.8 eV (just outside 0.5 eV tolerance)',
    input: perturbPeaks(RAW_CU2P, XPS_CONFIG, { shift: 0.8 }),
    expected: { shouldMatch: false },
    perturbations: ['beyond_tolerance_shift'],
  },
];

function synthesizeXpsSignal(peaks: Peak[]): { bindingEnergy: number[]; intensity: number[] } {
  const bindingEnergy: number[] = [];
  const intensity: number[] = [];
  for (let be = 1100; be >= 0; be -= 0.5) {
    let y = 1000 + be * 0.5;
    for (const p of peaks) {
      if (Math.abs(be - p.position) < 15) {
        y += p.intensity * Math.exp(-Math.pow((be - p.position) / 1.5, 2));
      }
    }
    bindingEnergy.push(Number(be.toFixed(1)));
    intensity.push(Number(y.toFixed(1)));
  }
  return { bindingEnergy, intensity };
}

export function evaluateXpsCases(): TechniqueCaseResult[] {
  const results: TechniqueCaseResult[] = [];

  for (const tc of XPS_GROUND_TRUTH_CASES) {
    const trace = synthesizeXpsSignal(tc.input);
    const agentResult = runXpsProcessing({
      id: `val-${tc.id}`,
      label: tc.description,
      region: 'Survey',
      sampleName: tc.description,
      fileName: `${tc.id}.txt`,
      signal: trace,
      baseline: [],
      peaks: [],
      matches: [],
    }, { region: 'Survey' });

    const topAgg = agentResult.stateAggregations?.[0];
    const actualScore = topAgg ? topAgg.totalScore : 0;
    const actualDidMatch = Boolean(topAgg && actualScore >= 0.25);
    const actualPhase = actualDidMatch && topAgg ? topAgg.state : undefined;

    results.push({
      caseId: tc.id,
      expectedShouldMatch: tc.expected.shouldMatch,
      actualDidMatch,
      expectedPhase: tc.expected.topPhase,
      actualPhase,
      actualScore,
      perturbations: tc.perturbations,
      knownLimitation: tc.knownLimitation,
    });
  }

  return results;
}
