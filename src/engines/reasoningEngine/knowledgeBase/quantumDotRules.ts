/**
 * ============================================================================
 * DIFARYX — Universal Knowledge Base: Quantum Dot Materials Rule Set
 * ============================================================================
 *
 * Materials: CdSe, InP — II-VI and III-V semiconductor nanocrystals
 *
 * ============================================================================
 * QUANTUM CONFINEMENT PHYSICS
 * ============================================================================
 *
 * Quantum dots (QDs) are 0-dimensional semiconductor nanocrystals where the
 * exciton Bohr radius (a_B) exceeds the particle radius (R). This produces
 * quantum confinement effects that dramatically alter electronic and optical
 * properties.
 *
 * Brus equation (size-dependent band gap):
 *   E_g(R) = E_g(bulk) + ℏ²π²/(2μR²) - 1.786·e²/(4πε₀εR) - 0.248·E*_Ry
 * where:
 *   μ = (1/m*_e + 1/m*_h)⁻¹ = reduced effective mass
 *   E*_Ry = Rydberg energy of the exciton
 *   The 2nd term = quantum confinement (kinetic energy increase ∝ 1/R²)
 *   The 3rd term = Coulomb attraction (decreases with size)
 *
 * CdSe:
 *   Bulk band gap: E_g = 1.74 eV (direct, at Γ point)
 *   Exciton Bohr radius: a_B = 5.6 nm
 *   Effective masses: m*_e = 0.12 m₀, m*_h = 0.45 m₀
 *   Crystal structure: Wurtzite (P6₃mc) or Zinc blende (F-43m)
 *   QD emission tunable: 450–650 nm (2.0–2.8 eV) for D = 2–8 nm
 *
 * InP:
 *   Bulk band gap: E_g = 1.35 eV (direct)
 *   Exciton Bohr radius: a_B = 11.3 nm
 *   Effective masses: m*_e = 0.077 m₀, m*_h = 0.64 m₀
 *   Crystal structure: Zinc blende (F-43m)
 *   QD emission tunable: 500–750 nm (1.7–2.5 eV) for D = 2–7 nm
 *   Cd-free alternative → preferred for biological/eco applications
 *
 * @module reasoningEngine/knowledgeBase/quantumDotRules
 * ============================================================================
 */

import type { Technique } from '../../../types/universalTechnique';
import type {
  MaterialRuleSet, PhaseReference, CrossValidationRuleDefinition,
  RecommendationEntry, PhaseInferenceResult, OxidationStateResult,
} from './baseTypes';

// ============================================================================
// CdSe Reference Data
// ============================================================================

/** CdSe wurtzite XRD — P6₃mc (#186): a=4.299, c=7.010 Å */
const CDSE_XRD_PEAKS = [
  { hkl: '100', twoTheta: 23.90, dSpacing: 3.72, relativeIntensity: 40 },
  { hkl: '002', twoTheta: 25.35, dSpacing: 3.51, relativeIntensity: 60 },
  { hkl: '101', twoTheta: 27.00, dSpacing: 3.30, relativeIntensity: 100 },
  { hkl: '102', twoTheta: 35.10, dSpacing: 2.56, relativeIntensity: 30 },
  { hkl: '110', twoTheta: 42.00, dSpacing: 2.15, relativeIntensity: 50 },
  { hkl: '103', twoTheta: 45.70, dSpacing: 1.98, relativeIntensity: 20 },
  { hkl: '112', twoTheta: 49.70, dSpacing: 1.83, relativeIntensity: 35 },
];

/** CdSe Raman — LO phonon at 210 cm⁻¹; strong confinement sensitivity */
const CDSE_RAMAN_MODES = [
  { shift: 210, symmetry: 'A₁(LO)', relativeIntensity: 100, ramanActive: true, irActive: true, description: 'CdSe LO-phonon (confinement-sensitive)', confinementSensitivity: -3.5 },
  { shift: 415, symmetry: '2LO', relativeIntensity: 40, ramanActive: true, irActive: false, description: 'CdSe 2LO overtone' },
  { shift: 170, symmetry: 'TO', relativeIntensity: 25, ramanActive: true, irActive: true, description: 'CdSe TO-phonon' },
];

/** CdSe XPS — Cd²⁺ 3d₅/₂ and Se²⁻ 3d₅/₂ */
const CDSE_XPS_PEAKS = [
  { orbital: 'Cd 3d5/2', bindingEnergy: 405.2, fwhm: 1.3, oxidationState: 'Cd²⁺', chemicalContext: 'Cd²⁺ in CdSe wurtzite' },
  { orbital: 'Cd 3d3/2', bindingEnergy: 411.9, fwhm: 1.3, oxidationState: 'Cd²⁺', spinOrbitSplitting: 6.7 },
  { orbital: 'Se 3d5/2', bindingEnergy: 54.0, fwhm: 1.2, oxidationState: 'Se²⁻', chemicalContext: 'Se²⁻ in CdSe lattice' },
  { orbital: 'Se 3d3/2', bindingEnergy: 54.8, fwhm: 1.2, oxidationState: 'Se²⁻', spinOrbitSplitting: 0.8 },
  { orbital: 'O 1s', bindingEnergy: 531.5, fwhm: 1.6, oxidationState: 'O²⁻', chemicalContext: 'surface oxide/ligand' },
];

/** CdSe FTIR — Surface ligand characterization (oleate, thiol) */
const CDSE_FTIR_BANDS = [
  { wavenumber: 2850, assignment: 'CH₂ symmetric stretch', relativeIntensity: 70, bandShape: 'sharp' as const, diagnostic: true },
  { wavenumber: 2920, assignment: 'CH₂ asymmetric stretch', relativeIntensity: 80, bandShape: 'sharp' as const, diagnostic: true },
  { wavenumber: 1460, assignment: 'CH₂ bending', relativeIntensity: 50, bandShape: 'sharp' as const, diagnostic: false },
  { wavenumber: 1540, assignment: 'COO⁻ asymmetric stretch (oleate)', relativeIntensity: 60, bandShape: 'broad' as const, diagnostic: true },
  { wavenumber: 1410, assignment: 'COO⁻ symmetric stretch (oleate)', relativeIntensity: 55, bandShape: 'broad' as const, diagnostic: true },
];

// ============================================================================
// InP Reference Data
// ============================================================================

/** InP zinc blende XRD — F-43m (#216): a=5.869 Å */
const INP_XRD_PEAKS = [
  { hkl: '111', twoTheta: 26.25, dSpacing: 3.39, relativeIntensity: 100 },
  { hkl: '220', twoTheta: 43.40, dSpacing: 2.08, relativeIntensity: 60 },
  { hkl: '311', twoTheta: 51.20, dSpacing: 1.78, relativeIntensity: 35 },
  { hkl: '222', twoTheta: 53.80, dSpacing: 1.70, relativeIntensity: 15 },
  { hkl: '400', twoTheta: 62.60, dSpacing: 1.48, relativeIntensity: 20 },
  { hkl: '331', twoTheta: 68.50, dSpacing: 1.37, relativeIntensity: 25 },
];

/** InP Raman — LO phonon at 345 cm⁻¹ */
const INP_RAMAN_MODES = [
  { shift: 345, symmetry: 'A₁(LO)', relativeIntensity: 100, ramanActive: true, irActive: true, description: 'InP LO-phonon (confinement-sensitive)', confinementSensitivity: -2.8 },
  { shift: 304, symmetry: 'TO', relativeIntensity: 30, ramanActive: true, irActive: true, description: 'InP TO-phonon' },
  { shift: 690, symmetry: '2LO', relativeIntensity: 35, ramanActive: true, irActive: false, description: 'InP 2LO overtone' },
];

/** InP XPS — In³⁺ 3d₅/₂ and P³⁻ 2p₃/₂ */
const INP_XPS_PEAKS = [
  { orbital: 'In 3d5/2', bindingEnergy: 444.5, fwhm: 1.4, oxidationState: 'In³⁺', chemicalContext: 'In³⁺ in InP zinc blende' },
  { orbital: 'In 3d3/2', bindingEnergy: 452.1, fwhm: 1.4, oxidationState: 'In³⁺', spinOrbitSplitting: 7.6 },
  { orbital: 'P 2p3/2', bindingEnergy: 128.8, fwhm: 1.2, oxidationState: 'P³⁻', chemicalContext: 'P³⁻ in InP lattice' },
  { orbital: 'O 1s', bindingEnergy: 531.8, fwhm: 1.6, oxidationState: 'O²⁻', chemicalContext: 'surface oxide' },
];

// ============================================================================
// Phase References
// ============================================================================

function makeCdSePhaseRef(): PhaseReference {
  return {
    phaseName: 'wurtzite CdSe',
    materialId: 'CdSe',
    xrd: {
      phaseName: 'wurtzite CdSe', spaceGroup: 'P6₃mc', crystalSystem: 'hexagonal',
      latticeParameters: { a: 4.299, c: 7.010 },
      peaks: CDSE_XRD_PEAKS.map((p) => ({ ...p, fwhm: 0.3 })), detectionLimit: 0.01,
    },
    raman: {
      phaseName: 'wurtzite CdSe', excitationWavelength: 532,
      modes: CDSE_RAMAN_MODES.map((m) => ({ ...m, fwhm: 15 })),
      overlapZone: { min: 195, max: 225, confusablePhases: ['CdSe zinc blende'] },
    },
    xps: { materialName: 'CdSe', xraySource: 'Al_Kalpha', peaks: CDSE_XPS_PEAKS },
    ftir: { materialName: 'CdSe QD (oleate-capped)', spectralRange: { min: 1000, max: 3500 }, bands: CDSE_FTIR_BANDS.map((b) => ({ ...b, fwhm: 20 })) },
  };
}

function makeInPPhaseRef(): PhaseReference {
  return {
    phaseName: 'zinc blende InP',
    materialId: 'InP',
    xrd: {
      phaseName: 'zinc blende InP', spaceGroup: 'F-43m', crystalSystem: 'cubic',
      latticeParameters: { a: 5.869 },
      peaks: INP_XRD_PEAKS.map((p) => ({ ...p, fwhm: 0.3 })), detectionLimit: 0.01,
    },
    raman: {
      phaseName: 'zinc blende InP', excitationWavelength: 532,
      modes: INP_RAMAN_MODES.map((m) => ({ ...m, fwhm: 12 })),
    },
    xps: { materialName: 'InP', xraySource: 'Al_Kalpha', peaks: INP_XPS_PEAKS },
  };
}

// ============================================================================
// Cross-Validation Rules
// ============================================================================

const QD_CV_RULES: CrossValidationRuleDefinition[] = [
  {
    ruleId: 'CV-QD-001', ruleName: 'Raman LO Phonon Shift ↔ XRD Crystallite Size',
    techniques: ['Raman', 'XRD'], weight: 0.90, materialSystem: 'CdSe/InP',
    physicalBasis: 'Richter-Wang-Ley model: Δω = -C(a/D)^γ. Raman LO-phonon red-shift and asymmetric broadening correlate with Scherrer size from XRD. For CdSe: Δω ≈ -3.5(a/D)^1.5 cm⁻¹.',
    conditions: [{ parameter: 'crystalliteSize', primaryTechnique: 'Raman', secondaryTechnique: 'XRD', tolerance: 1, unit: 'nm' }],
    consistentInterpretation: 'Raman confinement shift and XRD Scherrer size agree — consistent QD diameter.',
    inconsistentInterpretation: 'Size mismatch — possible surface amorphization or strain effects.',
    partialInterpretation: 'Broad size distribution — techniques average differently.',
  },
  {
    ruleId: 'CV-QD-002', ruleName: 'XPS Oxidation State ↔ Raman LO Phonon Position',
    techniques: ['XPS', 'Raman'], weight: 0.80, materialSystem: 'CdSe/InP',
    physicalBasis: 'Surface oxidation (CdO, In₂O₃) produces XPS oxide signatures and shifts/broadens Raman LO phonon. Cd²⁺ 3d at 405.2 eV confirms no metallic Cd.',
    conditions: [{ parameter: 'surfaceOxidation', primaryTechnique: 'XPS', secondaryTechnique: 'Raman', tolerance: 5, unit: 'cm⁻¹' }],
    consistentInterpretation: 'Clean surface: XPS shows only Cd²⁺/Se²⁻; Raman LO phonon is sharp.',
    inconsistentInterpretation: 'XPS shows oxide but Raman LO is clean — possible surface-only oxidation.',
    partialInterpretation: 'Partial surface oxidation detected by both techniques.',
  },
  {
    ruleId: 'CV-QD-003', ruleName: 'FTIR Ligand Bands ↔ XPS C 1s Surface Chemistry',
    techniques: ['FTIR', 'XPS'], weight: 0.70, materialSystem: 'CdSe/InP',
    physicalBasis: 'FTIR C-H (2850/2920 cm⁻¹) and COO⁻ (1540 cm⁻¹) bands confirm capping ligands. XPS C 1s at 284.8 eV (C-C) and 288.5 eV (COO⁻) corroborate.',
    conditions: [{ parameter: 'surfaceLigands', primaryTechnique: 'FTIR', secondaryTechnique: 'XPS', tolerance: 0.5, unit: 'eV' }],
    consistentInterpretation: 'FTIR and XPS agree on ligand identity and coverage.',
    inconsistentInterpretation: 'Ligand mismatch — possible ligand exchange or desorption during measurement.',
    partialInterpretation: 'Mixed ligand population detected.',
  },
];

// ============================================================================
// Recommendations
// ============================================================================

const QD_RECS: RecommendationEntry[] = [
  {
    trigger: 'missing_technique:Raman', recommendation: 'Perform Raman spectroscopy for LO-phonon confinement analysis.',
    priority: 'critical', techniques: ['Raman'],
    expectedOutcome: 'CdSe LO at ~210 cm⁻¹ (bulk) with size-dependent red-shift for D < 11 nm.',
    rationale: 'Raman LO-phonon confinement directly measures QD size via Richter-Wang-Ley model.',
  },
  {
    trigger: 'contradiction:crystalliteSize', recommendation: 'Perform TEM for direct QD size measurement.',
    priority: 'high', techniques: ['TEM'],
    expectedOutcome: 'Direct diameter measurement with lattice fringe imaging.',
    rationale: 'TEM resolves size distribution vs ensemble-averaged XRD/Raman size.',
  },
  {
    trigger: 'missing_technique:XPS', recommendation: 'Perform XPS Cd 3d / In 3d analysis for surface oxidation assessment.',
    priority: 'high', techniques: ['XPS'],
    expectedOutcome: 'Confirm Cd²⁺ at 405.2 eV or In³⁺ at 444.5 eV without oxide shoulders.',
    rationale: 'Surface oxide shells quench QD photoluminescence — XPS detects oxide formation.',
  },
];

// ============================================================================
// Inference Functions
// ============================================================================

function inferQDXrdPhases(xrdNodes: Array<{ peaks?: Array<{ twoTheta: number; intensity: number }> }>): PhaseInferenceResult {
  const phases: PhaseInferenceResult['phases'] = [];
  for (const [name, ref] of [['CdSe', CDSE_XRD_PEAKS] as const, ['InP', INP_XRD_PEAKS] as const]) {
    let matched = 0, total = 0;
    const matchedPeaks: string[] = [];
    for (const rp of ref) { total += rp.relativeIntensity; for (const node of xrdNodes) { for (const op of node.peaks ?? []) { if (Math.abs(op.twoTheta - rp.twoTheta) <= 0.3) { matched += rp.relativeIntensity; if (!matchedPeaks.includes(rp.hkl)) matchedPeaks.push(rp.hkl); } } } }
    phases.push({ phaseName: name, matchScore: total > 0 ? matched / total : 0, matchedPeaks });
  }
  phases.sort((a, b) => b.matchScore - a.matchScore);
  return { phases, dominantPhase: phases[0].phaseName, confidence: phases[0].matchScore, isMixed: phases.length > 1 && phases[1].matchScore > 0.3 };
}

function inferQDRamanPhases(ramanNodes: Array<{ peaks?: Array<{ position: number; intensity: number }> }>): PhaseInferenceResult {
  const phases: PhaseInferenceResult['phases'] = [];
  for (const [name, ref] of [['CdSe', CDSE_RAMAN_MODES] as const, ['InP', INP_RAMAN_MODES] as const]) {
    let count = 0;
    const matchedPeaks: string[] = [];
    for (const rm of ref) { for (const node of ramanNodes) { for (const op of node.peaks ?? []) { if (Math.abs(op.position - rm.shift) <= 15) { count++; matchedPeaks.push(rm.description ?? `${rm.shift}`); } } } }
    phases.push({ phaseName: name, matchScore: ref.length > 0 ? count / ref.length : 0, matchedPeaks });
  }
  phases.sort((a, b) => b.matchScore - a.matchScore);
  return { phases, dominantPhase: phases[0].phaseName, confidence: phases[0].matchScore, isMixed: phases.length > 1 && phases[1].matchScore > 0.25 };
}

function inferQDXpsOxidationState(xpsNodes: Array<{ peaks?: Array<{ bindingEnergy: number; orbital?: string }> }>): OxidationStateResult {
  const states: OxidationStateResult['states'] = [];
  const refs = [{ state: 'Cd²⁺', be: 405.2 }, { state: 'Se²⁻', be: 54.0 }, { state: 'In³⁺', be: 444.5 }, { state: 'P³⁻', be: 128.8 }];
  for (const r of refs) { for (const node of xpsNodes) { for (const op of node.peaks ?? []) { if (Math.abs(op.bindingEnergy - r.be) <= 0.8) { states.push({ oxidationState: r.state, bindingEnergy: op.bindingEnergy, matchScore: 1 - Math.abs(op.bindingEnergy - r.be) / 0.8 }); } } } }
  states.sort((a, b) => b.matchScore - a.matchScore);
  const dominant = states[0] ?? { oxidationState: 'unknown', bindingEnergy: 0, matchScore: 0 };
  return { states, dominantState: dominant.oxidationState, confidence: dominant.matchScore, isMixed: states.length > 1 };
}

// ============================================================================
// Export
// ============================================================================

export const quantumDotRuleSet: MaterialRuleSet = {
  materialId: 'quantumDot', materialName: 'Quantum Dot Materials (CdSe, InP)', materialClass: 'quantum_dot',
  formula: 'CdSe / InP', aliases: ['CdSe', 'InP', 'cadmium selenide', 'indium phosphide', 'QD', 'quantum dot'],
  phases: [makeCdSePhaseRef(), makeInPPhaseRef()],
  crossValidationRules: QD_CV_RULES, recommendations: QD_RECS,
  inferXrdPhases: inferQDXrdPhases, inferRamanPhases: inferQDRamanPhases, inferXpsOxidationState: inferQDXpsOxidationState,
  version: '1.0.0', lastUpdated: '2026-05-28T00:00:00Z',
  notes: 'CdSe and InP quantum dots. LO-phonon confinement via Richter-Wang-Ley model is the primary size diagnostic. Surface ligand characterization by FTIR is critical for colloidal QDs.',
};