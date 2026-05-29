/**
 * ============================================================================
 * DIFARYX — Universal Knowledge Base: High-Entropy Alloy Rule Set
 * ============================================================================
 *
 * Materials: AlCoCrCuFeNi (Cantor-type HEA)
 *
 * ============================================================================
 * HIGH-ENTROPY ALLOY PHYSICS
 * ============================================================================
 *
 * High-entropy alloys (HEAs) contain ≥5 principal elements in equimolar or
 * near-equimolar ratios. The high configurational entropy:
 *   ΔS_config = -R·Σ xᵢ·ln(xᵢ) ≥ 1.5R (≈12.5 J/mol·K for 5 equimolar elements)
 * stabilizes simple solid-solution phases over intermetallic compounds.
 *
 * Gibbs free energy: ΔG_mix = ΔH_mix - T·ΔS_mix
 *   Large ΔS_mix at high T → favors disordered solid solution
 *   ΔH_mix from Miedema model: ΔH_mix = Σᵢ<ⱼ 4·ΔHᵢⱼ·xᵢ·xⱼ
 *
 * Lattice distortion (δ):
 *   δ = √[Σ xᵢ·(1 - rᵢ/r̄)²]  where r̄ = Σ xᵢ·rᵢ
 *   For AlCoCrCuFeNi: δ ≈ 4.8% (significant lattice strain)
 *   δ > 6.6% → amorphization tendency (σ criterion)
 *
 * Valence electron concentration (VEC):
 *   VEC = Σ xᵢ·VECᵢ
 *   VEC > 8.0 → FCC stable; 6.87 < VEC < 8.0 → BCC stable
 *   For AlCoCrCuFeNi: VEC ≈ 8.0 → FCC+BCC mixed
 *
 * Element VEC values: Al=3, Co=9, Cr=6, Cu=11, Fe=8, Ni=10
 * Element atomic radii (Å): Al=1.43, Co=1.25, Cr=1.28, Cu=1.28, Fe=1.26, Ni=1.24
 * Element electronegativity (Pauling): Al=1.61, Co=1.88, Cr=1.66, Cu=1.90, Fe=1.83, Ni=1.91
 *
 * Phases:
 *   FCC (Fm-3m): Cu-rich, Ni-rich regions → ductile
 *   BCC (Im-3m): Al-rich, Cr-rich regions → hard
 *   B2 (ordered BCC): AlNi-type ordering
 *   σ-phase (P4₂/mnm): Cr-rich brittle intermetallic → undesirable
 *
 * XPS: Core-level shifts from multi-element mixing → broadened peaks
 *   Cu 2p₃/₂: 932.6 eV (Cu⁰), 933.5 eV (Cu²⁺ oxide)
 *   Ni 2p₃/₂: 852.8 eV (Ni⁰), 854.0 eV (Ni²⁺)
 *   Al 2p: 72.7 eV (Al⁰), 74.5 eV (Al³⁺ oxide)
 *
 * @module reasoningEngine/knowledgeBase/highEntropyAlloyRules
 * ============================================================================
 */

import type { Technique } from '../../../types/universalTechnique';
import type {
  MaterialRuleSet, PhaseReference, CrossValidationRuleDefinition,
  RecommendationEntry, PhaseInferenceResult, OxidationStateResult,
} from './baseTypes';

// ============================================================================
// HEA Reference Data — XRD
// ============================================================================

/** HEA FCC phase — Fm-3m (#225): a ≈ 3.59 Å (Vegard's law average) */
const HEA_FCC_XRD_PEAKS = [
  { hkl: '111', twoTheta: 43.50, dSpacing: 2.080, relativeIntensity: 100 },
  { hkl: '200', twoTheta: 50.60, dSpacing: 1.803, relativeIntensity: 50 },
  { hkl: '220', twoTheta: 74.50, dSpacing: 1.274, relativeIntensity: 35 },
  { hkl: '311', twoTheta: 90.30, dSpacing: 1.087, relativeIntensity: 25 },
  { hkl: '222', twoTheta: 95.60, dSpacing: 1.040, relativeIntensity: 10 },
];

/** HEA BCC phase — Im-3m (#229): a ≈ 2.88 Å */
const HEA_BCC_XRD_PEAKS = [
  { hkl: '110', twoTheta: 44.40, dSpacing: 2.040, relativeIntensity: 100 },
  { hkl: '200', twoTheta: 64.60, dSpacing: 1.440, relativeIntensity: 30 },
  { hkl: '211', twoTheta: 81.70, dSpacing: 1.178, relativeIntensity: 40 },
];

/** HEA B2 ordered phase — Pm-3m (#221): a ≈ 2.88 Å */
const HEA_B2_XRD_PEAKS = [
  { hkl: '100', twoTheta: 31.50, dSpacing: 2.840, relativeIntensity: 20 },
  { hkl: '110', twoTheta: 44.40, dSpacing: 2.040, relativeIntensity: 100 },
  { hkl: '111', twoTheta: 55.20, dSpacing: 1.660, relativeIntensity: 15 },
  { hkl: '200', twoTheta: 64.60, dSpacing: 1.440, relativeIntensity: 30 },
];

// ============================================================================
// HEA Reference Data — Raman
// ============================================================================

/** HEAs are metallic → no first-order Raman. Defect/disorder-induced modes only. */
const HEA_RAMAN_MODES = [
  { shift: 180, symmetry: 'disorder', relativeIntensity: 20, ramanActive: true, irActive: false, description: 'Acoustic phonon (lattice distortion)' },
  { shift: 280, symmetry: 'disorder', relativeIntensity: 30, ramanActive: true, irActive: false, description: 'Optical phonon (multi-element disorder)' },
  { shift: 600, symmetry: '2D', relativeIntensity: 15, ramanActive: true, irActive: false, description: 'Second-order Raman (zone-boundary)' },
];

// ============================================================================
// HEA Reference Data — XPS
// ============================================================================

/** HEA XPS — Multi-element core-level analysis */
const HEA_XPS_PEAKS = [
  { orbital: 'Al 2p', bindingEnergy: 72.7, fwhm: 1.2, oxidationState: 'Al⁰', chemicalContext: 'metallic Al in HEA' },
  { orbital: 'Al 2p', bindingEnergy: 74.5, fwhm: 1.5, oxidationState: 'Al³⁺', chemicalContext: 'Al₂O₃ surface oxide' },
  { orbital: 'Co 2p3/2', bindingEnergy: 778.3, fwhm: 1.1, oxidationState: 'Co⁰', chemicalContext: 'metallic Co in HEA' },
  { orbital: 'Cr 2p3/2', bindingEnergy: 574.2, fwhm: 1.2, oxidationState: 'Cr⁰', chemicalContext: 'metallic Cr in HEA' },
  { orbital: 'Cr 2p3/2', bindingEnergy: 576.5, fwhm: 1.5, oxidationState: 'Cr³⁺', chemicalContext: 'Cr₂O₃ passivation layer' },
  { orbital: 'Cu 2p3/2', bindingEnergy: 932.6, fwhm: 1.0, oxidationState: 'Cu⁰', chemicalContext: 'metallic Cu in HEA' },
  { orbital: 'Fe 2p3/2', bindingEnergy: 706.8, fwhm: 1.2, oxidationState: 'Fe⁰', chemicalContext: 'metallic Fe in HEA' },
  { orbital: 'Fe 2p3/2', bindingEnergy: 710.5, fwhm: 2.0, oxidationState: 'Fe²⁺/³⁺', chemicalContext: 'iron oxide surface' },
  { orbital: 'Ni 2p3/2', bindingEnergy: 852.8, fwhm: 1.1, oxidationState: 'Ni⁰', chemicalContext: 'metallic Ni in HEA' },
  { orbital: 'O 1s', bindingEnergy: 529.5, fwhm: 1.3, oxidationState: 'O²⁻', chemicalContext: 'lattice oxide (Al₂O₃, Cr₂O₃)' },
  { orbital: 'O 1s', bindingEnergy: 531.5, fwhm: 1.5, oxidationState: 'OH⁻', chemicalContext: 'surface hydroxyl' },
];

// ============================================================================
// Phase References
// ============================================================================

function makeHeaFccPhaseRef(): PhaseReference {
  return {
    phaseName: 'FCC HEA', materialId: 'HEA-FCC',
    xrd: {
      phaseName: 'FCC HEA', spaceGroup: 'Fm-3m', crystalSystem: 'cubic',
      latticeParameters: { a: 3.59 },
      peaks: HEA_FCC_XRD_PEAKS.map((p) => ({ ...p, fwhm: 0.3 })), detectionLimit: 0.05,
    },
    raman: {
      phaseName: 'HEA (metallic)', excitationWavelength: 532,
      modes: HEA_RAMAN_MODES.map((m) => ({ ...m, fwhm: 50 })),
    },
    xps: { materialName: 'AlCoCrCuFeNi', xraySource: 'Al_Kalpha', peaks: HEA_XPS_PEAKS },
  };
}

function makeHeaBccPhaseRef(): PhaseReference {
  return {
    phaseName: 'BCC HEA', materialId: 'HEA-BCC',
    xrd: {
      phaseName: 'BCC HEA', spaceGroup: 'Im-3m', crystalSystem: 'cubic',
      latticeParameters: { a: 2.88 },
      peaks: HEA_BCC_XRD_PEAKS.map((p) => ({ ...p, fwhm: 0.2 })), detectionLimit: 0.05,
    },
    raman: {
      phaseName: 'HEA (metallic)', excitationWavelength: 532,
      modes: HEA_RAMAN_MODES.map((m) => ({ ...m, fwhm: 50 })),
    },
    xps: { materialName: 'AlCoCrCuFeNi', xraySource: 'Al_Kalpha', peaks: HEA_XPS_PEAKS },
  };
}

// ============================================================================
// Cross-Validation Rules
// ============================================================================

const HEA_CV_RULES: CrossValidationRuleDefinition[] = [
  {
    ruleId: 'CV-HEA-001', ruleName: 'XRD Phase (FCC/BCC) ↔ VEC Calculation',
    techniques: ['XRD'], weight: 0.90, materialSystem: 'AlCoCrCuFeNi',
    physicalBasis: 'VEC = Σ xᵢ·VECᵢ. VEC > 8.0 → FCC; 6.87 < VEC < 8.0 → BCC. For equimolar AlCoCrCuFeNi: VEC = (3+9+6+11+8+10)/6 = 7.83 → FCC+BCC expected.',
    conditions: [{ parameter: 'phase', primaryTechnique: 'XRD', secondaryTechnique: 'XRD', tolerance: 0.3, unit: 'VEC' }],
    consistentInterpretation: 'XRD FCC+BCC peaks consistent with VEC ≈ 7.83.',
    inconsistentInterpretation: 'XRD pure FCC but VEC < 7.5 → Cu segregation may stabilize FCC locally.',
    partialInterpretation: 'Minority phase detected — compositional fluctuations.',
  },
  {
    ruleId: 'CV-HEA-002', ruleName: 'XRD Peak Broadening ↔ Raman Disorder Modes',
    techniques: ['XRD', 'Raman'], weight: 0.75, materialSystem: 'AlCoCrCuFeNi',
    physicalBasis: 'Lattice distortion δ ≈ 4.8% causes XRD peak broadening (Williamson-Hall: β·cosθ = Kλ/D + 4ε·sinθ). Raman disorder-induced modes at 180–280 cm⁻¹ confirm atomic-scale strain.',
    conditions: [{ parameter: 'latticeDistortion', primaryTechnique: 'XRD', secondaryTechnique: 'Raman', tolerance: 20, unit: 'cm⁻¹' }],
    consistentInterpretation: 'XRD broadening and Raman disorder modes agree on high lattice distortion.',
    inconsistentInterpretation: 'Sharp XRD but broad Raman → possible grain boundary disorder.',
    partialInterpretation: 'Moderate disorder — partial ordering detected.',
  },
  {
    ruleId: 'CV-HEA-003', ruleName: 'XPS Surface Oxide ↔ XRD Phase Stability',
    techniques: ['XPS', 'XRD'], weight: 0.70, materialSystem: 'AlCoCrCuFeNi',
    physicalBasis: 'Al₂O₃ (Al 2p at 74.5 eV) and Cr₂O₃ (Cr 2p at 576.5 eV) form protective passivation. BCC phase (Al-rich) → thicker oxide; FCC (Cu/Ni-rich) → thinner oxide.',
    conditions: [{ parameter: 'surfaceOxide', primaryTechnique: 'XPS', secondaryTechnique: 'XRD', tolerance: 0.5, unit: 'eV' }],
    consistentInterpretation: 'XPS oxide composition consistent with bulk phase (BCC→Al₂O₃, FCC→Cu/Ni metallic).',
    inconsistentInterpretation: 'Thick oxide on FCC phase → corrosion or post-oxidation.',
    partialInterpretation: 'Mixed oxide layer — multi-element passivation.',
  },
];

// ============================================================================
// Recommendations
// ============================================================================

const HEA_RECS: RecommendationEntry[] = [
  {
    trigger: 'missing_technique:XRD', recommendation: 'Perform XRD for FCC/BCC phase identification and lattice parameter measurement.',
    priority: 'critical', techniques: ['XRD'],
    expectedOutcome: 'FCC (111) at ~43.5° and/or BCC (110) at ~44.4° with δ-broadened peaks.',
    rationale: 'XRD determines the dominant crystal structure which governs mechanical properties.',
  },
  {
    trigger: 'missing_technique:XPS', recommendation: 'Perform multi-element XPS for surface composition and oxidation state analysis.',
    priority: 'high', techniques: ['XPS'],
    expectedOutcome: 'All 6 metallic elements detected; Al and Cr show surface oxide signatures.',
    rationale: 'XPS reveals preferential oxidation of Al and Cr — critical for corrosion resistance.',
  },
  {
    trigger: 'contradiction:phase', recommendation: 'Perform SEM-EDS for compositional mapping to detect segregation.',
    priority: 'high', techniques: ['SEM'],
    expectedOutcome: 'Homogeneous elemental distribution or Cu-rich dendrites in FCC matrix.',
    rationale: 'Cu has positive mixing enthalpy with most elements → tendency to segregate.',
  },
];

// ============================================================================
// Inference Functions
// ============================================================================

function inferHeaXrdPhases(xrdNodes: Array<{ peaks?: Array<{ twoTheta: number; intensity: number }> }>): PhaseInferenceResult {
  const phases: PhaseInferenceResult['phases'] = [];
  for (const [name, ref] of [['FCC', HEA_FCC_XRD_PEAKS] as const, ['BCC', HEA_BCC_XRD_PEAKS] as const, ['B2', HEA_B2_XRD_PEAKS] as const]) {
    let matched = 0, total = 0;
    const matchedPeaks: string[] = [];
    for (const rp of ref) { total += rp.relativeIntensity; for (const node of xrdNodes) { for (const op of node.peaks ?? []) { if (Math.abs(op.twoTheta - rp.twoTheta) <= 0.5) { matched += rp.relativeIntensity; if (!matchedPeaks.includes(rp.hkl)) matchedPeaks.push(rp.hkl); } } } }
    phases.push({ phaseName: name, matchScore: total > 0 ? matched / total : 0, matchedPeaks });
  }
  phases.sort((a, b) => b.matchScore - a.matchScore);
  return { phases, dominantPhase: phases[0].phaseName, confidence: phases[0].matchScore, isMixed: phases.length > 1 && phases[1].matchScore > 0.2 };
}

function inferHeaRamanPhases(ramanNodes: Array<{ peaks?: Array<{ position: number; intensity: number }> }>): PhaseInferenceResult {
  const phases: PhaseInferenceResult['phases'] = [];
  let count = 0;
  const matchedPeaks: string[] = [];
  for (const rm of HEA_RAMAN_MODES) { for (const node of ramanNodes) { for (const op of node.peaks ?? []) { if (Math.abs(op.position - rm.shift) <= 30) { count++; matchedPeaks.push(rm.description ?? `${rm.shift}`); } } } }
  phases.push({ phaseName: 'HEA (metallic disorder)', matchScore: HEA_RAMAN_MODES.length > 0 ? count / HEA_RAMAN_MODES.length : 0, matchedPeaks });
  return { phases, dominantPhase: phases[0].phaseName, confidence: phases[0].matchScore, isMixed: false };
}

function inferHeaXpsOxidationState(xpsNodes: Array<{ peaks?: Array<{ bindingEnergy: number; orbital?: string }> }>): OxidationStateResult {
  const states: OxidationStateResult['states'] = [];
  const refs = [
    { state: 'Al⁰', be: 72.7 }, { state: 'Al³⁺', be: 74.5 },
    { state: 'Cr⁰', be: 574.2 }, { state: 'Cr³⁺', be: 576.5 },
    { state: 'Cu⁰', be: 932.6 }, { state: 'Ni⁰', be: 852.8 },
    { state: 'Fe⁰', be: 706.8 }, { state: 'Co⁰', be: 778.3 },
  ];
  for (const r of refs) { for (const node of xpsNodes) { for (const op of node.peaks ?? []) { if (Math.abs(op.bindingEnergy - r.be) <= 1.0) { states.push({ oxidationState: r.state, bindingEnergy: op.bindingEnergy, matchScore: 1 - Math.abs(op.bindingEnergy - r.be) / 1.0 }); } } } }
  states.sort((a, b) => b.matchScore - a.matchScore);
  const dominant = states[0] ?? { oxidationState: 'unknown', bindingEnergy: 0, matchScore: 0 };
  return { states, dominantState: dominant.oxidationState, confidence: dominant.matchScore, isMixed: states.length > 1 };
}

// ============================================================================
// Export
// ============================================================================

export const highEntropyAlloyRuleSet: MaterialRuleSet = {
  materialId: 'highEntropyAlloy', materialName: 'High-Entropy Alloy (AlCoCrCuFeNi)', materialClass: 'high_entropy_alloy',
  formula: 'AlCoCrCuFeNi', aliases: ['HEA', 'AlCoCrCuFeNi', 'high entropy alloy', 'Cantor alloy', 'multi-principal element alloy'],
  phases: [makeHeaFccPhaseRef(), makeHeaBccPhaseRef()],
  crossValidationRules: HEA_CV_RULES, recommendations: HEA_RECS,
  inferXrdPhases: inferHeaXrdPhases, inferRamanPhases: inferHeaRamanPhases, inferXpsOxidationState: inferHeaXpsOxidationState,
  version: '1.0.0', lastUpdated: '2026-05-28T00:00:00Z',
  notes: 'AlCoCrCuFeNi Cantor-type HEA. FCC/BCC phase prediction via VEC criterion. Lattice distortion δ from XRD broadening. Multi-element XPS for surface segregation and passivation analysis.',
};