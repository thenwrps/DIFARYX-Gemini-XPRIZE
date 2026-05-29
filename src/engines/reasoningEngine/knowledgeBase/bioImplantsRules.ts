/**
 * ============================================================================
 * DIFARYX — Universal Knowledge Base: Bio-Implant Materials Rule Set
 * ============================================================================
 * Materials: Hydroxyapatite (HA), Zirconia (ZrO₂) — biomedical grade
 * ============================================================================
 * BIO-IMPLANT MATERIALS PHYSICS
 * ============================================================================
 *
 * Hydroxyapatite (Ca₁₀(PO₄)₆(OH)₂):
 *   - Primary mineral component of bone and tooth enamel
 *   - Space group: P6₃/m (#176), hexagonal
 *   - Lattice parameters: a = 9.418 Å, c = 6.884 Å
 *   - Ca²⁺ sites: Ca(I) at 4f (columnar), Ca(II) at 6h (peripheral)
 *   - PO₄³⁻ tetrahedra: ν₁(A₁) 960, ν₃(T₂) 1030–1090, ν₄(T₂) 565–603 cm⁻¹
 *   - OH⁻ librational mode: 630 cm⁻¹ (IR active, Raman inactive)
 *   - Centrosymmetric → mutual exclusion applies for OH⁻ mode
 *
 *   Biological relevance:
 *   - Osseointegration: bone-like Ca/P ratio = 1.67
 *   - Substitutions: CO₃²⁻ for PO₄³⁻ (B-type) → shifts FTIR bands
 *   - Si-substitution: enhances osteoblast activity (0.5–2 wt% Si)
 *
 * Zirconia (ZrO₂):
 *   - Three polymorphs:
 *     Monoclinic (P2₁/c): stable < 1170°C, a=5.15, b=5.21, c=5.32 Å, β=99.2°
 *     Tetragonal (P4₂/nmc): 1170–2370°C, a=3.64, c=5.27 Å
 *     Cubic (Fm-3m): > 2370°C, a=5.09 Å (fluorite structure)
 *   - 3Y-TZP: 3 mol% Y₂O₃ stabilizes tetragonal at room temperature
 *     Transformation toughening: t→m at crack tip, 4.5% volume expansion
 *     Raman: 147, 263, 315, 460, 610, 645 cm⁻¹ (tetragonal)
 *            178, 188, 222, 304, 333, 347, 380, 476, 501, 537, 558, 615, 638 cm⁻¹ (monoclinic)
 *
 *   Biocompatibility: ISO 13356 for surgical implants
 *   Aging (LTD): t→m in moist environment at 200–400°C → limits lifetime
 *
 * @module reasoningEngine/knowledgeBase/bioImplantsRules
 * ============================================================================
 */
import type { Technique } from '../../../types/universalTechnique';
import type { MaterialRuleSet, PhaseReference, CrossValidationRuleDefinition, RecommendationEntry, PhaseInferenceResult, OxidationStateResult } from './baseTypes';

// ============================================================================
// Hydroxyapatite XRD — P6₃/m
// ============================================================================
const HA_XRD_PEAKS = [
  { hkl: '002', twoTheta: 25.88, dSpacing: 3.440, relativeIntensity: 40 },
  { hkl: '211', twoTheta: 31.77, dSpacing: 2.814, relativeIntensity: 100 },
  { hkl: '112', twoTheta: 32.20, dSpacing: 2.778, relativeIntensity: 60 },
  { hkl: '300', twoTheta: 32.90, dSpacing: 2.720, relativeIntensity: 60 },
  { hkl: '202', twoTheta: 34.05, dSpacing: 2.631, relativeIntensity: 25 },
  { hkl: '310', twoTheta: 9.47, dSpacing: 2.262, relativeIntensity: 20 },
  { hkl: '222', twoTheta: 46.71, dSpacing: 1.943, relativeIntensity: 30 },
  { hkl: '213', twoTheta: 49.47, dSpacing: 1.841, relativeIntensity: 40 },
];

// ============================================================================
// Zirconia XRD — Tetragonal P4₂/nmc + Monoclinic P2₁/c
// ============================================================================
const ZRO2_TET_XRD_PEAKS = [
  { hkl: '101', twoTheta: 30.12, dSpacing: 2.964, relativeIntensity: 100 },
  { hkl: '110', twoTheta: 35.25, dSpacing: 2.545, relativeIntensity: 50 },
  { hkl: '111', twoTheta: 42.80, dSpacing: 2.112, relativeIntensity: 20 },
  { hkl: '002', twoTheta: 50.20, dSpacing: 1.817, relativeIntensity: 30 },
  { hkl: '200', twoTheta: 50.60, dSpacing: 1.803, relativeIntensity: 20 },
  { hkl: '211', twoTheta: 59.80, dSpacing: 1.546, relativeIntensity: 25 },
];

const ZRO2_MONO_XRD_PEAKS = [
  { hkl: '1̄11', twoTheta: 28.18, dSpacing: 3.165, relativeIntensity: 100 },
  { hkl: '111', twoTheta: 31.47, dSpacing: 2.841, relativeIntensity: 70 },
  { hkl: '002', twoTheta: 34.20, dSpacing: 2.620, relativeIntensity: 20 },
  { hkl: '020', twoTheta: 35.35, dSpacing: 2.538, relativeIntensity: 25 },
  { hkl: '200', twoTheta: 38.55, dSpacing: 2.335, relativeIntensity: 15 },
  { hkl: '1̄12', twoTheta: 49.28, dSpacing: 1.849, relativeIntensity: 20 },
  { hkl: '112', twoTheta: 54.10, dSpacing: 1.694, relativeIntensity: 20 },
];

// ============================================================================
// Hydroxyapatite Raman — P6₃/m (centrosymmetric)
// ============================================================================
const HA_RAMAN_MODES = [
  { shift: 428, symmetry: 'E_1g', relativeIntensity: 20, ramanActive: true, irActive: false, description: 'PO₄³⁻ ν₂ bending' },
  { shift: 591, symmetry: 'F_2', relativeIntensity: 40, ramanActive: true, irActive: false, description: 'PO₄³⁻ ν₄ bending' },
  { shift: 960, symmetry: 'A₁g', relativeIntensity: 100, ramanActive: true, irActive: false, description: 'PO₄³⁻ ν₁ symmetric stretch (diagnostic)', confinementSensitivity: 0 },
  { shift: 1045, symmetry: 'F_2', relativeIntensity: 40, ramanActive: true, irActive: false, description: 'PO₄³⁻ ν₃ asymmetric stretch' },
];

// ============================================================================
// Zirconia Raman — diagnostic for phase identification
// ============================================================================
const ZRO2_TET_RAMAN_MODES = [
  { shift: 147, symmetry: 'E_g', relativeIntensity: 30, ramanActive: true, irActive: false, description: 'Tetragonal ZrO₂ (diagnostic)' },
  { shift: 263, symmetry: 'B_1g', relativeIntensity: 40, ramanActive: true, irActive: false, description: 'Tetragonal ZrO₂ lattice mode' },
  { shift: 315, symmetry: 'A_1g', relativeIntensity: 20, ramanActive: true, irActive: false, description: 'Tetragonal ZrO₂ lattice mode' },
  { shift: 460, symmetry: 'E_g', relativeIntensity: 60, ramanActive: true, irActive: false, description: 'Tetragonal ZrO₂ lattice mode' },
  { shift: 610, symmetry: 'B_1g', relativeIntensity: 35, ramanActive: true, irActive: false, description: 'Tetragonal ZrO₂ lattice mode' },
  { shift: 645, symmetry: 'A_1g', relativeIntensity: 50, ramanActive: true, irActive: false, description: 'Tetragonal ZrO₂ lattice mode' },
];

const ZRO2_MONO_RAMAN_MODES = [
  { shift: 178, symmetry: 'A_g', relativeIntensity: 40, ramanActive: true, irActive: false, description: 'Monoclinic ZrO₂ (diagnostic)' },
  { shift: 188, symmetry: 'A_g', relativeIntensity: 35, ramanActive: true, irActive: false, description: 'Monoclinic ZrO₂ (diagnostic)' },
  { shift: 222, symmetry: 'A_g', relativeIntensity: 30, ramanActive: true, irActive: false, description: 'Monoclinic ZrO₂ lattice mode' },
  { shift: 304, symmetry: 'B_g', relativeIntensity: 25, ramanActive: true, irActive: false, description: 'Monoclinic ZrO₂ lattice mode' },
  { shift: 333, symmetry: 'A_g', relativeIntensity: 20, ramanActive: true, irActive: false, description: 'Monoclinic ZrO₂ lattice mode' },
  { shift: 347, symmetry: 'B_g', relativeIntensity: 15, ramanActive: true, irActive: false, description: 'Monoclinic ZrO₂ lattice mode' },
  { shift: 380, symmetry: 'A_g', relativeIntensity: 20, ramanActive: true, irActive: false, description: 'Monoclinic ZrO₂ lattice mode' },
  { shift: 476, symmetry: 'A_g', relativeIntensity: 30, ramanActive: true, irActive: false, description: 'Monoclinic ZrO₂ lattice mode' },
  { shift: 501, symmetry: 'B_g', relativeIntensity: 20, ramanActive: true, irActive: false, description: 'Monoclinic ZrO₂ lattice mode' },
  { shift: 537, symmetry: 'B_g', relativeIntensity: 15, ramanActive: true, irActive: false, description: 'Monoclinic ZrO₂ lattice mode' },
  { shift: 558, symmetry: 'A_g', relativeIntensity: 25, ramanActive: true, irActive: false, description: 'Monoclinic ZrO₂ lattice mode' },
  { shift: 615, symmetry: 'A_g', relativeIntensity: 40, ramanActive: true, irActive: false, description: 'Monoclinic ZrO₂ lattice mode' },
  { shift: 638, symmetry: 'B_g', relativeIntensity: 35, ramanActive: true, irActive: false, description: 'Monoclinic ZrO₂ lattice mode' },
];

// ============================================================================
// Hydroxyapatite FTIR
// ============================================================================
const HA_FTIR_BANDS = [
  { wavenumber: 565, assignment: 'PO₄³⁻ ν₄ bending (T₂)', relativeIntensity: 60, bandShape: 'sharp' as const, diagnostic: true },
  { wavenumber: 603, assignment: 'PO₄³⁻ ν₄ bending (T₂)', relativeIntensity: 55, bandShape: 'sharp' as const, diagnostic: true },
  { wavenumber: 630, assignment: 'OH⁻ librational mode', relativeIntensity: 20, bandShape: 'sharp' as const, diagnostic: true },
  { wavenumber: 960, assignment: 'PO₄³⁻ ν₁ symmetric stretch', relativeIntensity: 15, bandShape: 'sharp' as const, diagnostic: false },
  { wavenumber: 1030, assignment: 'PO₄³⁻ ν₃ asymmetric stretch', relativeIntensity: 100, bandShape: 'broad' as const, diagnostic: true },
  { wavenumber: 1090, assignment: 'PO₄³⁻ ν₃ asymmetric stretch', relativeIntensity: 80, bandShape: 'broad' as const, diagnostic: true },
  { wavenumber: 1410, assignment: 'CO₃²⁻ ν₃ (B-type substitution)', relativeIntensity: 15, bandShape: 'broad' as const, diagnostic: true },
  { wavenumber: 1450, assignment: 'CO₃²⁻ ν₃ (B-type substitution)', relativeIntensity: 10, bandShape: 'broad' as const, diagnostic: true },
  { wavenumber: 1540, assignment: 'CO₃²⁻ ν₃ (A-type substitution)', relativeIntensity: 8, bandShape: 'broad' as const, diagnostic: true },
  { wavenumber: 3570, assignment: 'O-H stretch (structural OH⁻)', relativeIntensity: 10, bandShape: 'sharp' as const, diagnostic: true },
];

// ============================================================================
// XPS
// ============================================================================
const HA_XPS_PEAKS = [
  { orbital: 'Ca 2p3/2', bindingEnergy: 347.2, fwhm: 1.5, oxidationState: 'Ca²⁺', chemicalContext: 'Ca in HA lattice' },
  { orbital: 'P 2p', bindingEnergy: 133.2, fwhm: 1.3, oxidationState: 'P⁵⁺', chemicalContext: 'PO₄³⁻ tetrahedral' },
  { orbital: 'O 1s', bindingEnergy: 531.0, fwhm: 1.6, oxidationState: 'O²⁻', chemicalContext: 'PO₄³⁻ + OH⁻ in HA' },
];

const ZRO2_XPS_PEAKS = [
  { orbital: 'Zr 3d5/2', bindingEnergy: 182.2, fwhm: 1.3, oxidationState: 'Zr⁴⁺', chemicalContext: 'ZrO₂ (Zr⁴⁺ in 8-fold coordination)' },
  { orbital: 'Zr 3d3/2', bindingEnergy: 184.6, fwhm: 1.3, oxidationState: 'Zr⁴⁺', chemicalContext: 'ZrO₂ spin-orbit doublet' },
  { orbital: 'O 1s', bindingEnergy: 529.8, fwhm: 1.2, oxidationState: 'O²⁻', chemicalContext: 'ZrO₂ lattice oxygen' },
];

// ============================================================================
// Phase References
// ============================================================================
function makeHaPhaseRef(): PhaseReference {
  return {
    phaseName: 'Hydroxyapatite', materialId: 'HA',
    xrd: { phaseName: 'Hydroxyapatite', spaceGroup: 'P6₃/m', crystalSystem: 'hexagonal', latticeParameters: { a: 9.418, c: 6.884 }, peaks: HA_XRD_PEAKS.map((p) => ({ ...p, fwhm: 0.15 })), detectionLimit: 0.05 },
    raman: { phaseName: 'Hydroxyapatite', excitationWavelength: 785, modes: HA_RAMAN_MODES },
    xps: { materialName: 'Hydroxyapatite', xraySource: 'Al_Kalpha', peaks: HA_XPS_PEAKS },
    ftir: { materialName: 'Hydroxyapatite', spectralRange: { min: 400, max: 4000 }, bands: HA_FTIR_BANDS },
  };
}

function makeZro2TetPhaseRef(): PhaseReference {
  return {
    phaseName: 'Tetragonal ZrO₂ (3Y-TZP)', materialId: 'ZRO2-TET',
    xrd: { phaseName: 'Tetragonal ZrO₂', spaceGroup: 'P4₂/nmc', crystalSystem: 'tetragonal', latticeParameters: { a: 3.64, c: 5.27 }, peaks: ZRO2_TET_XRD_PEAKS.map((p) => ({ ...p, fwhm: 0.2 })), detectionLimit: 0.05 },
    raman: { phaseName: 'Tetragonal ZrO₂', excitationWavelength: 785, modes: ZRO2_TET_RAMAN_MODES },
    xps: { materialName: 'ZrO₂', xraySource: 'Al_Kalpha', peaks: ZRO2_XPS_PEAKS },
  };
}

function makeZro2MonoPhaseRef(): PhaseReference {
  return {
    phaseName: 'Monoclinic ZrO₂', materialId: 'ZRO2-MONO',
    xrd: { phaseName: 'Monoclinic ZrO₂', spaceGroup: 'P2₁/c', crystalSystem: 'monoclinic', latticeParameters: { a: 5.15, b: 5.21, c: 5.32, beta: 99.2 }, peaks: ZRO2_MONO_XRD_PEAKS.map((p) => ({ ...p, fwhm: 0.15 })), detectionLimit: 0.02 },
    raman: { phaseName: 'Monoclinic ZrO₂', excitationWavelength: 785, modes: ZRO2_MONO_RAMAN_MODES },
    xps: { materialName: 'ZrO₂', xraySource: 'Al_Kalpha', peaks: ZRO2_XPS_PEAKS },
  };
}

// ============================================================================
// Cross-Validation Rules
// ============================================================================
const BIOIMPLANT_CV_RULES: CrossValidationRuleDefinition[] = [
  { ruleId: 'CV-BIO-001', ruleName: 'Raman t/m Ratio ↔ XRD Phase Fraction (ZrO₂)', techniques: ['Raman', 'XRD'], weight: 0.90, materialSystem: 'ZrO₂',
    physicalBasis: 'Raman monoclinic fraction X_m = (I₁₇₈ + I₁₈₈) / (I₁₇₈ + I₁₈₈ + 0.97·I₂₆₃). XRD monoclinic fraction from (1̄11) and (111) peak intensity ratio. Both should agree within 5%.',
    conditions: [{ parameter: 'monoclinicFraction', primaryTechnique: 'Raman', secondaryTechnique: 'XRD', tolerance: 0.05, unit: 'fraction' }],
    consistentInterpretation: 'Raman and XRD agree on t/m phase ratio — consistent sintering and aging state.', inconsistentInterpretation: 'Raman shows more monoclinic than XRD → surface transformation layer (LTD or grinding damage).', partialInterpretation: 'Depth-dependent transformation detected.' },
  { ruleId: 'CV-BIO-002', ruleName: 'FTIR PO₄ Bands ↔ XRD HA Crystallinity', techniques: ['FTIR', 'XRD'], weight: 0.85, materialSystem: 'Hydroxyapatite',
    physicalBasis: 'HA crystallinity from FTIR: I₆₀₃/I₅₆₅ splitting factor. Well-crystallized HA: ν₄ doublet clearly split (> 603 and 565 cm⁻¹). XRD peak sharpness (002 and 300 reflections) confirms.',
    conditions: [{ parameter: 'crystallinity', primaryTechnique: 'FTIR', secondaryTechnique: 'XRD', tolerance: 0.1, unit: 'index' }],
    consistentInterpretation: 'FTIR and XRD agree on high HA crystallinity.', inconsistentInterpretation: 'FTIR broad bands but sharp XRD → amorphous calcium phosphate + crystalline HA.', partialInterpretation: 'Partially crystalline HA — bone-like apatite.' },
  { ruleId: 'CV-BIO-003', ruleName: 'FTIR CO₃²⁻ ↔ XPS Surface Carbonate', techniques: ['FTIR', 'XPS'], weight: 0.70, materialSystem: 'Hydroxyapatite',
    physicalBasis: 'B-type CO₃²⁻ substitution (CO₃ for PO₄): FTIR bands at 1410–1450 cm⁻¹. XPS C 1s at 289.2 eV confirms carbonate. Ca/P ratio from XPS: Ca 2p/P 2p = 1.67 for stoichiometric HA.',
    conditions: [{ parameter: 'carbonate', primaryTechnique: 'FTIR', secondaryTechnique: 'XPS', tolerance: 0.5, unit: 'wt%' }],
    consistentInterpretation: 'FTIR and XPS agree on carbonate content and substitution type.', inconsistentInterpretation: 'High FTIR carbonate but low XPS → surface adsorbed vs lattice substituted.', partialInterpretation: 'Mixed A and B type carbonate substitution.' },
];

// ============================================================================
// Recommendations
// ============================================================================
const BIOIMPLANT_RECS: RecommendationEntry[] = [
  { trigger: 'missing_technique:Raman', recommendation: 'Perform Raman spectroscopy for ZrO₂ phase identification (t/m ratio) and HA crystallinity.', priority: 'critical', techniques: ['Raman'], expectedOutcome: 'Tetragonal ZrO₂: 263, 460, 645 cm⁻¹; Monoclinic: 178, 188, 380 cm⁻¹; HA: 960 cm⁻¹ PO₄ ν₁.', rationale: 'Raman is the most sensitive technique for detecting tetragonal-monoclinic transformation in Y-TZP.' },
  { trigger: 'contradiction:phase', recommendation: 'Perform accelerated aging test (LTD) to assess ZrO₂ aging resistance.', priority: 'high', techniques: ['XRD', 'Raman'], expectedOutcome: 'Surface monoclinic fraction < 5% after 5h at 134°C/2bar per ISO 13356.', rationale: 'LTD simulates in-vivo hydrothermal degradation of Y-TZP implants over 10–20 years.' },
];

// ============================================================================
// Inference Functions
// ============================================================================
function inferBioXrdPhases(xrdNodes: Array<{ peaks?: Array<{ twoTheta: number; intensity: number }> }>): PhaseInferenceResult {
  const phases: PhaseInferenceResult['phases'] = [];
  for (const [name, ref] of [['Hydroxyapatite', HA_XRD_PEAKS] as const, ['Tetragonal ZrO₂', ZRO2_TET_XRD_PEAKS] as const, ['Monoclinic ZrO₂', ZRO2_MONO_XRD_PEAKS] as const]) {
    let matched = 0, total = 0; const matchedPeaks: string[] = [];
    for (const rp of ref) { total += rp.relativeIntensity; for (const node of xrdNodes) { for (const op of node.peaks ?? []) { if (Math.abs(op.twoTheta - rp.twoTheta) <= 0.5) { matched += rp.relativeIntensity; if (!matchedPeaks.includes(rp.hkl)) matchedPeaks.push(rp.hkl); } } } }
    phases.push({ phaseName: name, matchScore: total > 0 ? matched / total : 0, matchedPeaks });
  }
  phases.sort((a, b) => b.matchScore - a.matchScore);
  return { phases, dominantPhase: phases[0].phaseName, confidence: phases[0].matchScore, isMixed: phases.length > 1 && phases[1].matchScore > 0.2 };
}

function inferBioRamanPhases(ramanNodes: Array<{ peaks?: Array<{ position: number; intensity: number }> }>): PhaseInferenceResult {
  const phases: PhaseInferenceResult['phases'] = [];
  for (const [name, ref] of [['Hydroxyapatite', HA_RAMAN_MODES] as const, ['Tetragonal ZrO₂', ZRO2_TET_RAMAN_MODES] as const, ['Monoclinic ZrO₂', ZRO2_MONO_RAMAN_MODES] as const]) {
    let matched = 0, total = 0; const matchedPeaks: string[] = [];
    for (const rm of ref) { total += rm.relativeIntensity; for (const node of ramanNodes) { for (const op of node.peaks ?? []) { if (Math.abs(op.position - rm.shift) <= 15) { matched += rm.relativeIntensity; matchedPeaks.push(rm.description ?? `${rm.shift}`); } } } }
    phases.push({ phaseName: name, matchScore: total > 0 ? matched / total : 0, matchedPeaks });
  }
  phases.sort((a, b) => b.matchScore - a.matchScore);
  return { phases, dominantPhase: phases[0].phaseName, confidence: phases[0].matchScore, isMixed: phases.length > 1 && phases[1].matchScore > 0.25 };
}

function inferBioXpsOxidationState(xpsNodes: Array<{ peaks?: Array<{ bindingEnergy: number; orbital?: string }> }>): OxidationStateResult {
  const states: OxidationStateResult['states'] = [];
  const refs = [{ state: 'Ca²⁺', be: 347.2 }, { state: 'P⁵⁺', be: 133.2 }, { state: 'Zr⁴⁺', be: 182.2 }];
  for (const r of refs) { for (const node of xpsNodes) { for (const op of node.peaks ?? []) { if (Math.abs(op.bindingEnergy - r.be) <= 1.0) { states.push({ oxidationState: r.state, bindingEnergy: op.bindingEnergy, matchScore: 1 - Math.abs(op.bindingEnergy - r.be) / 1.0 }); } } } }
  states.sort((a, b) => b.matchScore - a.matchScore);
  const dominant = states[0] ?? { oxidationState: 'unknown', bindingEnergy: 0, matchScore: 0 };
  return { states, dominantState: dominant.oxidationState, confidence: dominant.matchScore, isMixed: states.length > 1 };
}

// ============================================================================
// Export
// ============================================================================
export const bioImplantsRuleSet: MaterialRuleSet = {
  materialId: 'bioImplant', materialName: 'Bio-Implant Materials (HA, ZrO₂)', materialClass: 'bio_implant',
  formula: 'Ca₁₀(PO₄)₆(OH)₂ / ZrO₂', aliases: ['hydroxyapatite', 'HA', 'zirconia', 'ZrO₂', '3Y-TZP', 'bio-ceramic', 'bioceramic', 'bone implant', 'dental'],
  phases: [makeHaPhaseRef(), makeZro2TetPhaseRef(), makeZro2MonoPhaseRef()],
  crossValidationRules: BIOIMPLANT_CV_RULES, recommendations: BIOIMPLANT_RECS,
  inferXrdPhases: inferBioXrdPhases, inferRamanPhases: inferBioRamanPhases, inferXpsOxidationState: inferBioXpsOxidationState,
  version: '1.0.0', lastUpdated: '2026-05-28T00:00:00Z', notes: 'Hydroxyapatite and 3Y-TZP zirconia bio-implants. Raman t/m ratio for ZrO₂ aging assessment. FTIR PO₄/CO₃ bands for HA quality. ISO 13356 compliance criteria.',
};