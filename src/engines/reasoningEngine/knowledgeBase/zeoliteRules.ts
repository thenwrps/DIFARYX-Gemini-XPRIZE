/**
 * ============================================================================
 * DIFARYX — Universal Knowledge Base: Zeolite & MOF Materials Rule Set
 * ============================================================================
 * Materials: ZSM-5 (MFI), MIL-101(Cr) Metal-Organic Framework
 * ============================================================================
 * POROUS FRAMEWORK PHYSICS
 * ============================================================================
 * Zeolites: crystalline aluminosilicates with well-defined microporous channels.
 * Framework composition: SiO₄/AlO₄⁻ tetrahedra connected by bridging oxygens.
 * Si/Al ratio determines acidity and hydrophilicity:
 *   Si/Al = 1 → maximum Al (Löwenstein rule: no Al-O-Al)
 *   Si/Al > 100 → essentially pure silica, hydrophobic
 *
 * Brønsted acid site: Si-O(H)-Al → proton donor (catalytic activity)
 * Lewis acid site: framework Al³⁺ → electron pair acceptor
 *
 * MIL-101(Cr): Cr₃O clusters + terephthalate linkers → mesoporous cages (29/34 Å)
 * BET surface area: 4000–6000 m²/g (record for MOFs)
 *
 * XRD: Zeolite framework peaks at low 2θ (5–35°) → fingerprint for topology
 * FTIR: T-O-T asymmetric stretch 1000–1100, symmetric 750–820, double ring 550–650 cm⁻¹
 * XPS: Si 2p 103.0 eV, Al 2p 74.5 eV, Cr 2p₃/₂ 577.0 eV (Cr³⁺)
 *
 * @module reasoningEngine/knowledgeBase/zeoliteRules
 * ============================================================================
 */
import type { Technique } from '../../../types/universalTechnique';
import type { MaterialRuleSet, PhaseReference, CrossValidationRuleDefinition, RecommendationEntry, PhaseInferenceResult, OxidationStateResult } from './baseTypes';

// ZSM-5 MFI XRD — characteristic low-angle peaks
const ZSM5_XRD_PEAKS = [
  { hkl: '011', twoTheta: 7.90, dSpacing: 11.18, relativeIntensity: 40 },
  { hkl: '020', twoTheta: 8.80, dSpacing: 10.05, relativeIntensity: 60 },
  { hkl: '002', twoTheta: 9.05, dSpacing: 9.77, relativeIntensity: 100 },
  { hkl: '130', twoTheta: 13.90, dSpacing: 6.37, relativeIntensity: 20 },
  { hkl: '051', twoTheta: 23.10, dSpacing: 3.85, relativeIntensity: 50 },
  { hkl: '033', twoTheta: 23.90, dSpacing: 3.72, relativeIntensity: 45 },
  { hkl: '303', twoTheta: 24.40, dSpacing: 3.65, relativeIntensity: 35 },
];

// MIL-101(Cr) XRD — characteristic low-angle peaks
const MIL101_XRD_PEAKS = [
  { hkl: '111', twoTheta: 2.90, dSpacing: 30.45, relativeIntensity: 100 },
  { hkl: '220', twoTheta: 4.80, dSpacing: 18.40, relativeIntensity: 40 },
  { hkl: '222', twoTheta: 5.80, dSpacing: 15.23, relativeIntensity: 30 },
  { hkl: '400', twoTheta: 6.70, dSpacing: 13.18, relativeIntensity: 20 },
  { hkl: '511', twoTheta: 8.40, dSpacing: 10.52, relativeIntensity: 15 },
];

// ZSM-5 FTIR — framework vibrations
const ZSM5_FTIR_BANDS = [
  { wavenumber: 1080, assignment: 'T-O-T asymmetric stretch', relativeIntensity: 100, bandShape: 'broad' as const, diagnostic: true },
  { wavenumber: 790, assignment: 'T-O-T symmetric stretch', relativeIntensity: 50, bandShape: 'sharp' as const, diagnostic: true },
  { wavenumber: 545, assignment: 'Double ring (5-membered)', relativeIntensity: 40, bandShape: 'sharp' as const, diagnostic: true },
  { wavenumber: 450, assignment: 'T-O bending', relativeIntensity: 30, bandShape: 'sharp' as const, diagnostic: false },
  { wavenumber: 3610, assignment: 'Si-OH Brønsted acid', relativeIntensity: 20, bandShape: 'broad' as const, diagnostic: true },
  { wavenumber: 3745, assignment: 'Si-OH silanol (terminal)', relativeIntensity: 15, bandShape: 'sharp' as const, diagnostic: false },
];

// ZSM-5 XPS
const ZSM5_XPS_PEAKS = [
  { orbital: 'Si 2p', bindingEnergy: 103.0, fwhm: 1.8, oxidationState: 'Si⁴⁺', chemicalContext: 'SiO₂ framework' },
  { orbital: 'Al 2p', bindingEnergy: 74.5, fwhm: 1.5, oxidationState: 'Al³⁺', chemicalContext: 'AlO₄⁻ tetrahedral framework' },
  { orbital: 'O 1s', bindingEnergy: 532.5, fwhm: 1.8, oxidationState: 'O²⁻', chemicalContext: 'framework Si-O-Si/Al' },
];

// MIL-101(Cr) XPS
const MIL101_XPS_PEAKS = [
  { orbital: 'Cr 2p3/2', bindingEnergy: 577.0, fwhm: 2.0, oxidationState: 'Cr³⁺', chemicalContext: 'Cr₃O cluster in MIL-101' },
  { orbital: 'Cr 2p1/2', bindingEnergy: 586.5, fwhm: 2.0, oxidationState: 'Cr³⁺', spinOrbitSplitting: 9.5 },
  { orbital: 'O 1s', bindingEnergy: 531.5, fwhm: 1.8, oxidationState: 'O²⁻', chemicalContext: 'carboxylate linker + Cr₃O' },
  { orbital: 'C 1s', bindingEnergy: 284.5, fwhm: 1.2, oxidationState: 'C⁰', chemicalContext: 'aromatic ring (terephthalate)' },
  { orbital: 'C 1s', bindingEnergy: 288.5, fwhm: 1.5, oxidationState: 'COO⁻', chemicalContext: 'carboxylate (COO-Cr)' },
];

function makeZSM5PhaseRef(): PhaseReference {
  return {
    phaseName: 'ZSM-5 (MFI)', materialId: 'ZSM5',
    xrd: { phaseName: 'ZSM-5 (MFI)', spaceGroup: 'Pnma', crystalSystem: 'orthorhombic', latticeParameters: { a: 20.09, b: 19.74, c: 13.14 }, peaks: ZSM5_XRD_PEAKS.map((p) => ({ ...p, fwhm: 0.15 })), detectionLimit: 0.02 },
    xps: { materialName: 'ZSM-5', xraySource: 'Al_Kalpha', peaks: ZSM5_XPS_PEAKS },
    ftir: { materialName: 'ZSM-5', spectralRange: { min: 400, max: 4000 }, bands: ZSM5_FTIR_BANDS.map((b) => ({ ...b, fwhm: 25 })) },
  };
}

function makeMIL101PhaseRef(): PhaseReference {
  return {
    phaseName: 'MIL-101(Cr)', materialId: 'MIL101',
    xrd: { phaseName: 'MIL-101(Cr)', spaceGroup: 'Fm-3m', crystalSystem: 'cubic', latticeParameters: { a: 88.94 }, peaks: MIL101_XRD_PEAKS.map((p) => ({ ...p, fwhm: 0.2 })), detectionLimit: 0.05 },
    xps: { materialName: 'MIL-101(Cr)', xraySource: 'Al_Kalpha', peaks: MIL101_XPS_PEAKS },
  };
}

const ZEOLITE_CV_RULES: CrossValidationRuleDefinition[] = [
  { ruleId: 'CV-ZEO-001', ruleName: 'XRD Framework ↔ Si/Al XPS', techniques: ['XRD', 'XPS'], weight: 0.85, materialSystem: 'ZSM-5',
    physicalBasis: 'XRD peak positions fingerprint the MFI topology. XPS Si 2p / Al 2p ratio determines Si/Al. Si/Al > 10 → XRD peaks shift slightly due to framework contraction.',
    conditions: [{ parameter: 'frameworkTopology', primaryTechnique: 'XRD', secondaryTechnique: 'XPS', tolerance: 0.5, unit: 'ratio' }],
    consistentInterpretation: 'XRD MFI pattern + XPS Si/Al ratio consistent with ZSM-5.', inconsistentInterpretation: 'MFI XRD but low Si/Al → likely SAPO-34 or AlPO.', partialInterpretation: 'Amorphous component + crystalline ZSM-5.' },
  { ruleId: 'CV-ZEO-002', ruleName: 'FTIR Double Ring ↔ XRD Crystallinity', techniques: ['FTIR', 'XRD'], weight: 0.80, materialSystem: 'ZSM-5',
    physicalBasis: 'FTIR 545 cm⁻¹ double-ring band is unique to 5-membered ring zeolites. I₅₅₀/I₄₅₀ ratio indicates crystallinity: > 0.7 → high crystallinity.',
    conditions: [{ parameter: 'crystallinity', primaryTechnique: 'FTIR', secondaryTechnique: 'XRD', tolerance: 0.1, unit: 'ratio' }],
    consistentInterpretation: 'FTIR and XRD agree on high framework crystallinity.', inconsistentInterpretation: 'FTIR crystalline but XRD broad → nano-crystalline ZSM-5.', partialInterpretation: 'Partial framework collapse detected.' },
];

const ZEOLITE_RECS: RecommendationEntry[] = [
  { trigger: 'missing_technique:FTIR', recommendation: 'Perform FTIR for framework vibration analysis and acidity measurement.', priority: 'critical', techniques: ['FTIR'], expectedOutcome: 'T-O-T asymmetric stretch at 1080 cm⁻¹; Brønsted OH at 3610 cm⁻¹.', rationale: 'FTIR framework bands fingerprint zeolite topology and measure acid site density.' },
  { trigger: 'contradiction:crystallinity', recommendation: 'Perform N₂ physisorption (BET) for surface area and porosity.', priority: 'high', techniques: ['BET'], expectedOutcome: 'ZSM-5: 300–400 m²/g; MIL-101: 4000–6000 m²/g.', rationale: 'BET surface area confirms framework integrity and pore accessibility.' },
];

function inferZeoliteXrdPhases(xrdNodes: Array<{ peaks?: Array<{ twoTheta: number; intensity: number }> }>): PhaseInferenceResult {
  const phases: PhaseInferenceResult['phases'] = [];
  for (const [name, ref] of [['ZSM-5', ZSM5_XRD_PEAKS] as const, ['MIL-101', MIL101_XRD_PEAKS] as const]) {
    let matched = 0, total = 0; const matchedPeaks: string[] = [];
    for (const rp of ref) { total += rp.relativeIntensity; for (const node of xrdNodes) { for (const op of node.peaks ?? []) { if (Math.abs(op.twoTheta - rp.twoTheta) <= 0.3) { matched += rp.relativeIntensity; if (!matchedPeaks.includes(rp.hkl)) matchedPeaks.push(rp.hkl); } } } }
    phases.push({ phaseName: name, matchScore: total > 0 ? matched / total : 0, matchedPeaks });
  }
  phases.sort((a, b) => b.matchScore - a.matchScore);
  return { phases, dominantPhase: phases[0].phaseName, confidence: phases[0].matchScore, isMixed: phases.length > 1 && phases[1].matchScore > 0.25 };
}

function inferZeoliteXpsOxidationState(xpsNodes: Array<{ peaks?: Array<{ bindingEnergy: number; orbital?: string }> }>): OxidationStateResult {
  const states: OxidationStateResult['states'] = [];
  const refs = [{ state: 'Si⁴⁺', be: 103.0 }, { state: 'Al³⁺', be: 74.5 }, { state: 'Cr³⁺', be: 577.0 }];
  for (const r of refs) { for (const node of xpsNodes) { for (const op of node.peaks ?? []) { if (Math.abs(op.bindingEnergy - r.be) <= 1.0) { states.push({ oxidationState: r.state, bindingEnergy: op.bindingEnergy, matchScore: 1 - Math.abs(op.bindingEnergy - r.be) / 1.0 }); } } } }
  states.sort((a, b) => b.matchScore - a.matchScore);
  const dominant = states[0] ?? { oxidationState: 'unknown', bindingEnergy: 0, matchScore: 0 };
  return { states, dominantState: dominant.oxidationState, confidence: dominant.matchScore, isMixed: states.length > 1 };
}

export const zeoliteRuleSet: MaterialRuleSet = {
  materialId: 'zeolite', materialName: 'Zeolite & MOF Materials (ZSM-5, MIL-101)', materialClass: 'zeolite',
  formula: 'ZSM-5 / MIL-101(Cr)', aliases: ['ZSM-5', 'MIL-101', 'zeolite', 'MOF', 'metal-organic framework', 'aluminosilicate', 'MFI'],
  phases: [makeZSM5PhaseRef(), makeMIL101PhaseRef()],
  crossValidationRules: ZEOLITE_CV_RULES, recommendations: ZEOLITE_RECS,
  inferXrdPhases: inferZeoliteXrdPhases, inferRamanPhases: () => ({ phases: [], dominantPhase: 'none', confidence: 0, isMixed: false }), inferXpsOxidationState: inferZeoliteXpsOxidationState,
  version: '1.0.0', lastUpdated: '2026-05-28T00:00:00Z', notes: 'ZSM-5 and MIL-101(Cr) porous frameworks. Si/Al ratio from XPS determines acidity. FTIR double-ring band fingerprints topology.',
};