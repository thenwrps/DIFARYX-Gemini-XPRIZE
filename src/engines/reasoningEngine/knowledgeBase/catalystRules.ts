/**
 * ============================================================================
 * DIFARYX — Universal Knowledge Base: Catalyst Materials Rule Set
 * ============================================================================
 *
 * Materials: Pt/C (platinum on carbon), IrO₂ (iridium dioxide)
 *
 * ============================================================================
 * SURFACE SCIENCE & ELECTROCATALYSIS FOUNDATIONS
 * ============================================================================
 *
 * Heterogeneous catalysts operate at surfaces where reactants adsorb, react,
 * and desorb. Activity is governed by the Sabatier principle: optimal binding
 * energy — neither too strong nor too weak.
 *
 * d-band center theory (Hammer–Nørskov):
 *   ε_d = center of d-band relative to Fermi level
 *   Higher ε_d → stronger adsorbate binding (reduced d-band → back-donation)
 *   For Pt: ε_d = -2.25 eV; optimal for ORR and HER
 *
 * Pt/C (Fuel Cell Catalyst):
 *   Pt face-centered cubic (Fm-3m), a = 3.923 Å
 *   Particle size: 2–10 nm → high surface/volume ratio
 *   Electrochemical surface area (ECSA): 60–100 m²/g (from H-UPD)
 *   ORR: 4H⁺ + 4e⁻ + O₂ → 2H₂O (E° = 1.23 V)
 *   Pt 4f₇/₂ at 71.1 eV confirms metallic Pt⁰
 *   C 1s at 284.5 eV (sp² graphite) is the carbon support signature
 *
 * IrO₂ (OER Catalyst):
 *   Rutile structure (P4₂/mnm), a = 4.498, c = 3.154 Å
 *   OER: 2H₂O → O₂ + 4H⁺ + 4e⁻ (E° = 1.23 V)
 *   Ir 4f₇/₂ at 61.8 eV (Ir⁴⁺); satellite at +3 eV
 *   O 1s at 529.5 eV (lattice O²⁻); 531.5 eV (surface OH)
 *
 * Surface defect types:
 *   Terrace atoms: low coordination → specific activity
 *   Edge atoms: CN = 7 → enhanced ORR activity
 *   Step atoms: CN = 6 → strongest binding
 *   Kink atoms: CN = 6 → similar to steps
 *   Metal satellites: shake-up from plasmon → particle size indicator
 *
 * @module reasoningEngine/knowledgeBase/catalystRules
 * ============================================================================
 */

import type { Technique } from '../../../types/universalTechnique';
import type {
  MaterialRuleSet, PhaseReference, CrossValidationRuleDefinition,
  RecommendationEntry, PhaseInferenceResult, OxidationStateResult,
} from './baseTypes';

// ============================================================================
// Pt/C Reference Data
// ============================================================================

/** Pt XRD — Fm-3m (#225): a = 3.923 Å */
const PT_XRD_PEAKS = [
  { hkl: '111', twoTheta: 39.76, dSpacing: 2.265, relativeIntensity: 100 },
  { hkl: '200', twoTheta: 46.24, dSpacing: 1.962, relativeIntensity: 50 },
  { hkl: '220', twoTheta: 67.45, dSpacing: 1.387, relativeIntensity: 35 },
  { hkl: '311', twoTheta: 81.28, dSpacing: 1.183, relativeIntensity: 25 },
  { hkl: '222', twoTheta: 85.71, dSpacing: 1.133, relativeIntensity: 10 },
];

/** Pt Raman — Carbon D and G bands dominate; Pt has no first-order Raman */
const PT_RAMAN_MODES = [
  { shift: 1350, symmetry: 'A₁g', relativeIntensity: 60, ramanActive: true, irActive: false, description: 'Carbon D-band (defect-activated sp³)' },
  { shift: 1580, symmetry: 'E₂g', relativeIntensity: 100, ramanActive: true, irActive: false, description: 'Carbon G-band (sp² graphitic)' },
  { shift: 2700, symmetry: '2D', relativeIntensity: 40, ramanActive: true, irActive: false, description: 'Carbon 2D-band (graphene-like stacking)' },
];

/** Pt/C XPS — Metallic Pt⁰ and carbon support */
const PT_XPS_PEAKS = [
  { orbital: 'Pt 4f7/2', bindingEnergy: 71.1, fwhm: 0.9, oxidationState: 'Pt⁰', chemicalContext: 'metallic Pt nanoparticles' },
  { orbital: 'Pt 4f5/2', bindingEnergy: 74.4, fwhm: 0.9, oxidationState: 'Pt⁰', spinOrbitSplitting: 3.3 },
  { orbital: 'Pt 4f7/2', bindingEnergy: 72.3, fwhm: 1.4, oxidationState: 'Pt²⁺', chemicalContext: 'PtO surface oxide' },
  { orbital: 'C 1s', bindingEnergy: 284.5, fwhm: 0.8, oxidationState: 'C⁰', chemicalContext: 'sp² graphite support' },
  { orbital: 'C 1s', bindingEnergy: 286.0, fwhm: 1.2, oxidationState: 'C-O', chemicalContext: 'surface oxygen groups on carbon' },
];

// ============================================================================
// IrO₂ Reference Data
// ============================================================================

/** IrO₂ XRD — P4₂/mnm (#136): a = 4.498, c = 3.154 Å */
const IRO2_XRD_PEAKS = [
  { hkl: '110', twoTheta: 28.00, dSpacing: 3.18, relativeIntensity: 100 },
  { hkl: '101', twoTheta: 34.70, dSpacing: 2.58, relativeIntensity: 60 },
  { hkl: '200', twoTheta: 40.00, dSpacing: 2.25, relativeIntensity: 15 },
  { hkl: '111', twoTheta: 40.60, dSpacing: 2.22, relativeIntensity: 20 },
  { hkl: '210', twoTheta: 46.00, dSpacing: 1.97, relativeIntensity: 10 },
  { hkl: '211', twoTheta: 54.00, dSpacing: 1.70, relativeIntensity: 30 },
  { hkl: '220', twoTheta: 58.30, dSpacing: 1.58, relativeIntensity: 15 },
];

/** IrO₂ Raman — Rutile Raman-active: A₁g + B₁g + B₂g + 2×Eg */
const IRO2_RAMAN_MODES = [
  { shift: 560, symmetry: 'Eg', relativeIntensity: 40, ramanActive: true, irActive: false, description: 'Ir-O bending (Eg mode)' },
  { shift: 725, symmetry: 'B₂g', relativeIntensity: 60, ramanActive: true, irActive: false, description: 'Ir-O asymmetric stretch' },
  { shift: 750, symmetry: 'A₁g', relativeIntensity: 100, ramanActive: true, irActive: false, description: 'Ir-O symmetric stretch (rutile A₁g)' },
];

/** IrO₂ XPS — Ir⁴⁺ in rutile */
const IRO2_XPS_PEAKS = [
  { orbital: 'Ir 4f7/2', bindingEnergy: 61.8, fwhm: 1.2, oxidationState: 'Ir⁴⁺', chemicalContext: 'Ir⁴⁺ in IrO₂ rutile' },
  { orbital: 'Ir 4f5/2', bindingEnergy: 64.8, fwhm: 1.2, oxidationState: 'Ir⁴⁺', spinOrbitSplitting: 3.0 },
  { orbital: 'Ir 4f7/2', bindingEnergy: 63.0, fwhm: 1.5, oxidationState: 'Ir³⁺', chemicalContext: 'Ir₂O₃ surface layer' },
  { orbital: 'O 1s', bindingEnergy: 529.5, fwhm: 1.2, oxidationState: 'O²⁻', chemicalContext: 'lattice oxygen in IrO₂' },
  { orbital: 'O 1s', bindingEnergy: 531.5, fwhm: 1.5, oxidationState: 'OH⁻', chemicalContext: 'surface hydroxyl / adsorbed water' },
];

// ============================================================================
// Phase References
// ============================================================================

function makePtCPhaseRef(): PhaseReference {
  return {
    phaseName: 'Pt/C catalyst', materialId: 'Pt',
    xrd: {
      phaseName: 'Pt/C catalyst', spaceGroup: 'Fm-3m', crystalSystem: 'cubic',
      latticeParameters: { a: 3.923 },
      peaks: PT_XRD_PEAKS.map((p) => ({ ...p, fwhm: 0.5 })), detectionLimit: 0.02,
    },
    raman: {
      phaseName: 'Pt/C carbon support', excitationWavelength: 532,
      modes: PT_RAMAN_MODES.map((m) => ({ ...m, fwhm: 40 })),
    },
    xps: { materialName: 'Pt/C', xraySource: 'Al_Kalpha', peaks: PT_XPS_PEAKS },
  };
}

function makeIrO2PhaseRef(): PhaseReference {
  return {
    phaseName: 'IrO₂ rutile', materialId: 'IrO2',
    xrd: {
      phaseName: 'IrO₂ rutile', spaceGroup: 'P4₂/mnm', crystalSystem: 'tetragonal',
      latticeParameters: { a: 4.498, c: 3.154 },
      peaks: IRO2_XRD_PEAKS.map((p) => ({ ...p, fwhm: 0.15 })), detectionLimit: 0.03,
    },
    raman: {
      phaseName: 'IrO₂ rutile', excitationWavelength: 532,
      modes: IRO2_RAMAN_MODES.map((m) => ({ ...m, fwhm: 12 })),
    },
    xps: { materialName: 'IrO₂', xraySource: 'Al_Kalpha', peaks: IRO2_XPS_PEAKS },
  };
}

// ============================================================================
// Cross-Validation Rules
// ============================================================================

const CATALYST_CV_RULES: CrossValidationRuleDefinition[] = [
  {
    ruleId: 'CV-CAT-001', ruleName: 'XRD Particle Size ↔ XPS Surface Oxidation (Pt/C)',
    techniques: ['XRD', 'XPS'], weight: 0.90, materialSystem: 'Pt/C',
    physicalBasis: 'Scherrer size < 3 nm → XPS shows Pt²⁺ oxide at 72.3 eV (high surface/volume). Scherrer > 5 nm → predominantly Pt⁰ at 71.1 eV.',
    conditions: [{ parameter: 'particleSize', primaryTechnique: 'XRD', secondaryTechnique: 'XPS', tolerance: 1, unit: 'nm' }],
    consistentInterpretation: 'Small particles with surface oxide or large particles with metallic character — both self-consistent.',
    inconsistentInterpretation: 'Large XRD size but heavy XPS oxide — possible post-synthesis oxidation or carbon corrosion.',
    partialInterpretation: 'Mixed Pt⁰/Pt²⁺ — partial surface oxidation.',
  },
  {
    ruleId: 'CV-CAT-002', ruleName: 'Raman D/G Ratio ↔ XPS C 1s (Carbon Support Quality)',
    techniques: ['Raman', 'XPS'], weight: 0.75, materialSystem: 'Pt/C',
    physicalBasis: 'D/G intensity ratio I(D)/I(G) indicates graphitization degree. High I(D)/I(G) > 1 → amorphous carbon with many defects (high ORR activity). XPS C-O at 286.0 eV correlates with defect density.',
    conditions: [{ parameter: 'graphitization', primaryTechnique: 'Raman', secondaryTechnique: 'XPS', tolerance: 0.5, unit: 'ratio' }],
    consistentInterpretation: 'Raman and XPS agree on carbon support quality.',
    inconsistentInterpretation: 'High D-band but low C-O XPS — defect without oxygen functionality.',
    partialInterpretation: 'Partially graphitized carbon support.',
  },
  {
    ruleId: 'CV-CAT-003', ruleName: 'Ir 4f Oxidation ↔ O 1s Lattice/Surface Ratio (IrO₂)',
    techniques: ['XPS', 'XRD'], weight: 0.85, materialSystem: 'IrO2',
    physicalBasis: 'Ir⁴⁺ at 61.8 eV ↔ lattice O²⁻ at 529.5 eV. Ir³⁺ at 63.0 eV → Ir₂O₃. OER activity requires Ir⁴⁺/Ir³⁺ ratio > 3.',
    conditions: [{ parameter: 'oxidationRatio', primaryTechnique: 'XPS', secondaryTechnique: 'XRD', tolerance: 0.3, unit: 'ratio' }],
    consistentInterpretation: 'XRD rutile phase + XPS Ir⁴⁺ → phase-pure IrO₂.',
    inconsistentInterpretation: 'XRD amorphous but XPS Ir⁴⁺ → nanocrystalline or thin-film IrO₂.',
    partialInterpretation: 'Mixed Ir³⁺/Ir⁴⁺ → OER-active IrOOH intermediate.',
  },
];

// ============================================================================
// Recommendations
// ============================================================================

const CATALYST_RECS: RecommendationEntry[] = [
  {
    trigger: 'missing_technique:XPS', recommendation: 'Perform XPS Pt 4f analysis to determine Pt oxidation state.',
    priority: 'critical', techniques: ['XPS'],
    expectedOutcome: 'Pt⁰ 4f₇/₂ at 71.1 eV (metallic) with possible Pt²⁺ at 72.3 eV (oxide).',
    rationale: 'XPS directly measures Pt surface oxidation — critical for activity prediction.',
  },
  {
    trigger: 'contradiction:oxidationState', recommendation: 'Perform electrochemical cycling to assess ECSA via H-UPD.',
    priority: 'high', techniques: ['XRD'],
    expectedOutcome: 'ECSA 60–100 m²/g for well-dispersed Pt/C.',
    rationale: 'Electrochemical methods confirm catalytic surface area from XPS-complementary approach.',
  },
  {
    trigger: 'missing_technique:Raman', recommendation: 'Perform Raman spectroscopy for carbon support characterization.',
    priority: 'medium', techniques: ['Raman'],
    expectedOutcome: 'D-band at 1350, G-band at 1580 cm⁻¹; I(D)/I(G) ratio indicates graphitization.',
    rationale: 'Raman D/G ratio directly correlates with carbon support defect density and ORR performance.',
  },
];

// ============================================================================
// Inference Functions
// ============================================================================

function inferCatalystXrdPhases(xrdNodes: Array<{ peaks?: Array<{ twoTheta: number; intensity: number }> }>): PhaseInferenceResult {
  const phases: PhaseInferenceResult['phases'] = [];
  for (const [name, ref] of [['Pt', PT_XRD_PEAKS] as const, ['IrO₂', IRO2_XRD_PEAKS] as const]) {
    let matched = 0, total = 0;
    const matchedPeaks: string[] = [];
    for (const rp of ref) { total += rp.relativeIntensity; for (const node of xrdNodes) { for (const op of node.peaks ?? []) { if (Math.abs(op.twoTheta - rp.twoTheta) <= 0.3) { matched += rp.relativeIntensity; if (!matchedPeaks.includes(rp.hkl)) matchedPeaks.push(rp.hkl); } } } }
    phases.push({ phaseName: name, matchScore: total > 0 ? matched / total : 0, matchedPeaks });
  }
  phases.sort((a, b) => b.matchScore - a.matchScore);
  return { phases, dominantPhase: phases[0].phaseName, confidence: phases[0].matchScore, isMixed: phases.length > 1 && phases[1].matchScore > 0.25 };
}

function inferCatalystRamanPhases(ramanNodes: Array<{ peaks?: Array<{ position: number; intensity: number }> }>): PhaseInferenceResult {
  const phases: PhaseInferenceResult['phases'] = [];
  for (const [name, ref] of [['Pt/C (carbon)', PT_RAMAN_MODES] as const, ['IrO₂', IRO2_RAMAN_MODES] as const]) {
    let count = 0;
    const matchedPeaks: string[] = [];
    for (const rm of ref) { for (const node of ramanNodes) { for (const op of node.peaks ?? []) { if (Math.abs(op.position - rm.shift) <= 20) { count++; matchedPeaks.push(rm.description ?? `${rm.shift}`); } } } }
    phases.push({ phaseName: name, matchScore: ref.length > 0 ? count / ref.length : 0, matchedPeaks });
  }
  phases.sort((a, b) => b.matchScore - a.matchScore);
  return { phases, dominantPhase: phases[0].phaseName, confidence: phases[0].matchScore, isMixed: phases.length > 1 && phases[1].matchScore > 0.25 };
}

function inferCatalystXpsOxidationState(xpsNodes: Array<{ peaks?: Array<{ bindingEnergy: number; orbital?: string }> }>): OxidationStateResult {
  const states: OxidationStateResult['states'] = [];
  const refs = [{ state: 'Pt⁰', be: 71.1 }, { state: 'Pt²⁺', be: 72.3 }, { state: 'Ir⁴⁺', be: 61.8 }, { state: 'Ir³⁺', be: 63.0 }];
  for (const r of refs) { for (const node of xpsNodes) { for (const op of node.peaks ?? []) { if (Math.abs(op.bindingEnergy - r.be) <= 1.0) { states.push({ oxidationState: r.state, bindingEnergy: op.bindingEnergy, matchScore: 1 - Math.abs(op.bindingEnergy - r.be) / 1.0 }); } } } }
  states.sort((a, b) => b.matchScore - a.matchScore);
  const dominant = states[0] ?? { oxidationState: 'unknown', bindingEnergy: 0, matchScore: 0 };
  return { states, dominantState: dominant.oxidationState, confidence: dominant.matchScore, isMixed: states.length > 1 };
}

// ============================================================================
// Export
// ============================================================================

export const catalystRuleSet: MaterialRuleSet = {
  materialId: 'catalyst', materialName: 'Catalyst Materials (Pt/C, IrO₂)', materialClass: 'catalyst',
  formula: 'Pt/C / IrO2', aliases: ['Pt', 'Pt/C', 'platinum', 'IrO2', 'iridium dioxide', 'catalyst', 'electrocatalyst'],
  phases: [makePtCPhaseRef(), makeIrO2PhaseRef()],
  crossValidationRules: CATALYST_CV_RULES, recommendations: CATALYST_RECS,
  inferXrdPhases: inferCatalystXrdPhases, inferRamanPhases: inferCatalystRamanPhases, inferXpsOxidationState: inferCatalystXpsOxidationState,
  version: '1.0.0', lastUpdated: '2026-05-28T00:00:00Z',
  notes: 'Pt/C and IrO₂ electrocatalysts. Surface oxidation state via XPS Pt 4f / Ir 4f is primary diagnostic. Carbon support quality via Raman D/G ratio is critical for Pt/C. Surface defect mapping via coordination number analysis informs activity.',
};