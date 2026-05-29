/**
 * ============================================================================
 * DIFARYX — Universal Knowledge Base: Conducting Polymer Rule Set
 * ============================================================================
 * Materials: PEDOT:PSS, Polyaniline (PANI)
 * ============================================================================
 * CONDUCTING POLYMER PHYSICS
 * ============================================================================
 *
 * Conducting polymers have π-conjugated backbones enabling charge transport.
 *
 * PEDOT:PSS (poly(3,4-ethylenedioxythiophene):poly(styrene sulfonate)):
 *   - PEDOT is the conducting component (oxidized, p-doped)
 *   - PSS is the counter-ion (polyanionic dopant)
 *   - Conductivity: 0.1–1000 S/cm (tuned by secondary doping)
 *   - Band gap: ~1.6 eV (optical gap from π-π* transition)
 *   - Work function: 4.8–5.2 eV (tunable by dopants)
 *
 * Polyaniline (PANI):
 *   - Three oxidation states: leucoemeraldine (fully reduced), emeraldine
 *     (half-oxidized, conducting), pernigraniline (fully oxidized, insulating)
 *   - Emeraldine salt (ES): σ ~ 1–10 S/cm after protonic acid doping
 *   - XPS N 1s: —NH— (399.5 eV), =N— (398.5 eV), —NH⁺• (401.0 eV), =N⁺= (402.5 eV)
 *   - The ratio of oxidized/reduced nitrogen determines oxidation state
 *
 * Raman: C=C backbone stretch ~1450–1580 cm⁻¹, ring breathing ~1000 cm⁻¹
 * FTIR: N-H stretch ~3300, C-N stretch ~1300, C=C aromatic ring ~1600 cm⁻¹
 *
 * @module reasoningEngine/knowledgeBase/conductingPolymerRules
 * ============================================================================
 */
import type { Technique } from '../../../types/universalTechnique';
import type { MaterialRuleSet, PhaseReference, CrossValidationRuleDefinition, RecommendationEntry, PhaseInferenceResult, OxidationStateResult } from './baseTypes';

const PEDOT_RAMAN_MODES = [
  { shift: 574, symmetry: 'A_g', relativeIntensity: 25, ramanActive: true, irActive: false, description: 'Oxyethylene ring deformation' },
  { shift: 987, symmetry: 'A_g', relativeIntensity: 40, ramanActive: true, irActive: false, description: 'Ring deformation (symmetric)' },
  { shift: 1260, symmetry: 'B_2g', relativeIntensity: 30, ramanActive: true, irActive: false, description: 'C-C inter-ring stretch' },
  { shift: 1365, symmetry: 'A_g', relativeIntensity: 50, ramanActive: true, irActive: false, description: 'C-C ring stretch (quinoid)' },
  { shift: 1430, symmetry: 'A_g', relativeIntensity: 60, ramanActive: true, irActive: false, description: 'Cα=Cβ symmetric stretch' },
  { shift: 1510, symmetry: 'A_g', relativeIntensity: 100, ramanActive: true, irActive: false, description: 'Cα=Cβ antisymmetric stretch' },
];

const PANI_RAMAN_MODES = [
  { shift: 508, symmetry: 'A_g', relativeIntensity: 15, ramanActive: true, irActive: false, description: 'Amine deformation' },
  { shift: 810, symmetry: 'B_1g', relativeIntensity: 20, ramanActive: true, irActive: false, description: 'C-N-C wag' },
  { shift: 1170, symmetry: 'B_2g', relativeIntensity: 40, ramanActive: true, irActive: false, description: 'C-H in-plane bend (quinoid)' },
  { shift: 1220, symmetry: 'A_g', relativeIntensity: 50, ramanActive: true, irActive: false, description: 'C-N stretch (polaron)' },
  { shift: 1340, symmetry: 'A_g', relativeIntensity: 60, ramanActive: true, irActive: false, description: 'C-N⁺ stretch (semiquinone)' },
  { shift: 1480, symmetry: 'A_g', relativeIntensity: 80, ramanActive: true, irActive: false, description: 'C=C benzenoid ring stretch' },
  { shift: 1590, symmetry: 'A_g', relativeIntensity: 100, ramanActive: true, irActive: false, description: 'C=C quinoid ring stretch' },
];

const PEDOT_FTIR_BANDS = [
  { wavenumber: 690, assignment: 'C-S-C bending', relativeIntensity: 30, bandShape: 'sharp' as const, diagnostic: true },
  { wavenumber: 830, assignment: 'C-S stretch', relativeIntensity: 40, bandShape: 'sharp' as const, diagnostic: true },
  { wavenumber: 980, assignment: 'Ring deformation', relativeIntensity: 35, bandShape: 'sharp' as const, diagnostic: false },
  { wavenumber: 1050, assignment: 'S=O stretch (PSS)', relativeIntensity: 50, bandShape: 'broad' as const, diagnostic: true },
  { wavenumber: 1310, assignment: 'C-C inter-ring stretch', relativeIntensity: 45, bandShape: 'sharp' as const, diagnostic: false },
  { wavenumber: 1520, assignment: 'C=C backbone stretch', relativeIntensity: 100, bandShape: 'broad' as const, diagnostic: true },
];

const PANI_FTIR_BANDS = [
  { wavenumber: 820, assignment: 'C-H out-of-plane bend (1,4-disubstituted)', relativeIntensity: 40, bandShape: 'sharp' as const, diagnostic: true },
  { wavenumber: 1150, assignment: 'C-H in-plane bend (quinoid)', relativeIntensity: 50, bandShape: 'sharp' as const, diagnostic: true },
  { wavenumber: 1300, assignment: 'C-N stretch (secondary amine)', relativeIntensity: 60, bandShape: 'broad' as const, diagnostic: true },
  { wavenumber: 1490, assignment: 'C=C benzenoid ring stretch', relativeIntensity: 100, bandShape: 'sharp' as const, diagnostic: true },
  { wavenumber: 1580, assignment: 'C=C quinoid ring stretch', relativeIntensity: 80, bandShape: 'sharp' as const, diagnostic: true },
  { wavenumber: 3250, assignment: 'N-H stretch (amine)', relativeIntensity: 40, bandShape: 'broad' as const, diagnostic: false },
];

const PEDOT_XPS_PEAKS = [
  { orbital: 'S 2p3/2', bindingEnergy: 164.0, fwhm: 1.2, oxidationState: 'S⁻ (thiophene)', chemicalContext: 'PEDOT thiophene sulfur' },
  { orbital: 'S 2p3/2', bindingEnergy: 168.0, fwhm: 1.5, oxidationState: 'S⁶⁺ (sulfonate)', chemicalContext: 'PSS sulfonate group' },
  { orbital: 'O 1s', bindingEnergy: 533.0, fwhm: 1.5, oxidationState: 'O²⁻', chemicalContext: 'EDOT ring oxygen' },
  { orbital: 'C 1s', bindingEnergy: 284.8, fwhm: 1.2, oxidationState: 'C⁰', chemicalContext: 'aromatic carbon' },
  { orbital: 'C 1s', bindingEnergy: 286.0, fwhm: 1.3, oxidationState: 'C-O', chemicalContext: 'EDOT C-O bond' },
];

const PANI_XPS_PEAKS = [
  { orbital: 'N 1s', bindingEnergy: 398.5, fwhm: 1.3, oxidationState: '=N-', chemicalContext: 'imine nitrogen (quinoid)' },
  { orbital: 'N 1s', bindingEnergy: 399.5, fwhm: 1.2, oxidationState: '-NH-', chemicalContext: 'amine nitrogen (benzenoid)' },
  { orbital: 'N 1s', bindingEnergy: 401.0, fwhm: 1.5, oxidationState: '-NH⁺•', chemicalContext: 'polaron (semiquinone cation radical)' },
  { orbital: 'N 1s', bindingEnergy: 402.5, fwhm: 1.5, oxidationState: '=N⁺=', chemicalContext: 'bipolaron (dication)' },
  { orbital: 'C 1s', bindingEnergy: 284.8, fwhm: 1.2, oxidationState: 'C⁰', chemicalContext: 'aromatic ring carbon' },
];

function makePedotPhaseRef(): PhaseReference {
  return {
    phaseName: 'PEDOT:PSS', materialId: 'PEDOT-PSS',
    xrd: { phaseName: 'PEDOT:PSS (amorphous)', spaceGroup: 'P1', crystalSystem: 'monoclinic', latticeParameters: { a: 10.0, b: 7.6, c: 6.8 }, peaks: [{ hkl: '010', twoTheta: 6.5, dSpacing: 13.6, relativeIntensity: 100, fwhm: 1.5 }, { hkl: '100', twoTheta: 25.5, dSpacing: 3.49, relativeIntensity: 40, fwhm: 3.0 }], detectionLimit: 0.1 },
    raman: { phaseName: 'PEDOT:PSS', excitationWavelength: 785, modes: PEDOT_RAMAN_MODES },
    xps: { materialName: 'PEDOT:PSS', xraySource: 'Al_Kalpha', peaks: PEDOT_XPS_PEAKS },
    ftir: { materialName: 'PEDOT:PSS', spectralRange: { min: 400, max: 4000 }, bands: PEDOT_FTIR_BANDS },
  };
}

function makePaniPhaseRef(): PhaseReference {
  return {
    phaseName: 'Polyaniline (Emeraldine Salt)', materialId: 'PANI-ES',
    xrd: { phaseName: 'PANI (semi-crystalline)', spaceGroup: 'P2₁/a', crystalSystem: 'monoclinic', latticeParameters: { a: 8.5, b: 5.8, c: 10.2, beta: 92.0 }, peaks: [{ hkl: '100', twoTheta: 9.1, dSpacing: 9.7, relativeIntensity: 60, fwhm: 1.2 }, { hkl: '010', twoTheta: 20.5, dSpacing: 4.33, relativeIntensity: 100, fwhm: 2.0 }, { hkl: '011', twoTheta: 25.5, dSpacing: 3.49, relativeIntensity: 50, fwhm: 2.5 }], detectionLimit: 0.05 },
    raman: { phaseName: 'PANI (Emeraldine Salt)', excitationWavelength: 785, modes: PANI_RAMAN_MODES },
    xps: { materialName: 'Polyaniline', xraySource: 'Al_Kalpha', peaks: PANI_XPS_PEAKS },
    ftir: { materialName: 'Polyaniline', spectralRange: { min: 400, max: 4000 }, bands: PANI_FTIR_BANDS },
  };
}

const POLYMER_CV_RULES: CrossValidationRuleDefinition[] = [
  { ruleId: 'CV-CPO-001', ruleName: 'XPS N 1s Oxidation ↔ Raman Quinoid/Benzenoid', techniques: ['XPS', 'Raman'], weight: 0.85, materialSystem: 'Polyaniline',
    physicalBasis: 'PANI oxidation state determined by imine/amine ratio from N 1s deconvolution. Raman C=C quinoid (1590 cm⁻¹) vs benzenoid (1480 cm⁻¹) ratio confirms. Emeraldine: ~50/50 oxidized/reduced N.',
    conditions: [{ parameter: 'oxidationState', primaryTechnique: 'XPS', secondaryTechnique: 'Raman', tolerance: 0.15, unit: 'ratio' }],
    consistentInterpretation: 'XPS and Raman agree on emeraldine oxidation state.', inconsistentInterpretation: 'XPS shows emeraldine but Raman shows pernigraniline → surface vs bulk difference.', partialInterpretation: 'Mixed oxidation states detected.' },
  { ruleId: 'CV-CPO-002', ruleName: 'XPS S 2p ↔ FTIR PSS Content', techniques: ['XPS', 'FTIR'], weight: 0.75, materialSystem: 'PEDOT:PSS',
    physicalBasis: 'XPS S 2p doublet at 168 eV (PSS sulfonate) vs 164 eV (PEDOT thiophene). FTIR 1050 cm⁻¹ S=O band intensity correlates with PSS loading.',
    conditions: [{ parameter: 'composition', primaryTechnique: 'XPS', secondaryTechnique: 'FTIR', tolerance: 0.2, unit: 'ratio' }],
    consistentInterpretation: 'Surface and bulk PEDOT:PSS ratio consistent.', inconsistentInterpretation: 'Surface PSS enrichment detected → PSS segregation to surface.', partialInterpretation: 'Phase separation between PEDOT-rich and PSS-rich domains.' },
];

const POLYMER_RECS: RecommendationEntry[] = [
  { trigger: 'missing_technique:Raman', recommendation: 'Perform Raman spectroscopy to assess conjugation length via backbone vibrations.', priority: 'critical', techniques: ['Raman'], expectedOutcome: 'C=C stretch at 1430–1510 cm⁻¹ (PEDOT) or 1480–1590 cm⁻¹ (PANI).', rationale: 'Raman peak positions and intensity ratios directly reflect conjugation length and doping level.' },
  { trigger: 'missing_technique:XPS', recommendation: 'Perform XPS for surface oxidation state and dopant ratio analysis.', priority: 'high', techniques: ['XPS'], expectedOutcome: 'N 1s deconvolution for PANI or S 2p for PEDOT:PSS.', rationale: 'XPS determines surface oxidation state and dopant distribution critical for device performance.' },
];

function inferPolymerXpsOxidationState(xpsNodes: Array<{ peaks?: Array<{ bindingEnergy: number; orbital?: string }> }>): OxidationStateResult {
  const states: OxidationStateResult['states'] = [];
  const refs = [
    { state: 'PANI imine (=N-)', be: 398.5 }, { state: 'PANI amine (-NH-)', be: 399.5 },
    { state: 'PANI polaron (-NH⁺•)', be: 401.0 }, { state: 'PANI bipolaron (=N⁺=)', be: 402.5 },
    { state: 'PEDOT thiophene S', be: 164.0 }, { state: 'PSS sulfonate S', be: 168.0 },
  ];
  for (const r of refs) { for (const node of xpsNodes) { for (const op of node.peaks ?? []) { if (Math.abs(op.bindingEnergy - r.be) <= 1.0) { states.push({ oxidationState: r.state, bindingEnergy: op.bindingEnergy, matchScore: 1 - Math.abs(op.bindingEnergy - r.be) / 1.0 }); } } } }
  states.sort((a, b) => b.matchScore - a.matchScore);
  const dominant = states[0] ?? { oxidationState: 'unknown', bindingEnergy: 0, matchScore: 0 };
  return { states, dominantState: dominant.oxidationState, confidence: dominant.matchScore, isMixed: states.length > 1 };
}

export const conductingPolymerRuleSet: MaterialRuleSet = {
  materialId: 'conductingPolymer', materialName: 'Conducting Polymer (PEDOT:PSS, PANI)', materialClass: 'conducting_polymer',
  formula: 'PEDOT:PSS / PANI', aliases: ['PEDOT', 'PANI', 'PEDOT:PSS', 'polyaniline', 'polythiophene', 'conducting polymer', 'emeraldine'],
  phases: [makePedotPhaseRef(), makePaniPhaseRef()],
  crossValidationRules: POLYMER_CV_RULES, recommendations: POLYMER_RECS,
  inferXrdPhases: () => ({ phases: [{ phaseName: 'PEDOT:PSS', matchScore: 0.5, matchedPeaks: [] }, { phaseName: 'PANI', matchScore: 0.5, matchedPeaks: [] }], dominantPhase: 'undetermined', confidence: 0.5, isMixed: false }),
  inferRamanPhases: () => ({ phases: [{ phaseName: 'PEDOT:PSS', matchScore: 0.5, matchedPeaks: [] }, { phaseName: 'PANI', matchScore: 0.5, matchedPeaks: [] }], dominantPhase: 'undetermined', confidence: 0.5, isMixed: false }),
  inferXpsOxidationState: inferPolymerXpsOxidationState,
  version: '1.0.0', lastUpdated: '2026-05-28T00:00:00Z', notes: 'PEDOT:PSS and PANI conducting polymers. Raman backbone modes reflect conjugation length. XPS N 1s for PANI oxidation state; S 2p for PEDOT:PSS composition.',
};