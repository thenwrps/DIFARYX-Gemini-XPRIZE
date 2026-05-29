/**
 * ============================================================================
 * DIFARYX — Universal Knowledge Base: Energy Storage Materials Rule Set
 * ============================================================================
 *
 * Materials: LiFePO₄ (LFP), LiNi₁/₃Mn₁/₃Co₁/₃O₂ (NMC-111), Li₇La₃Zr₂O₁₂ (LLZO)
 *
 * ============================================================================
 * SOLID-STATE IONICS & ELECTROCHEMISTRY FOUNDATIONS
 * ============================================================================
 *
 * Energy storage materials are intercalation/deintercalation compounds where
 * lithium ions (Li⁺) move between cathode and anode through an electrolyte.
 *
 * Key physics:
 *   Nernst equation: E = E° - (RT/nF)·ln(Q)
 *   Open circuit voltage: OCV = -ΔG/(nF) where ΔG = Gibbs free energy of reaction
 *   Diffusion coefficient: D_Li from GITT: D = (4/π)·(m·V_M/(M·A))²·(ΔE_s/(τ·dE/√τ))²
 *
 * LFP (Olivine, Pnma):
 *   Fe²⁺/Fe³⁺ redox at ~3.4 V vs Li/Li⁺
 *   Flat voltage plateau → two-phase reaction mechanism
 *   Poor electronic conductivity (σ ~ 10⁻⁹ S/cm) → carbon coating required
 *   XPS: Fe 2p₃/₂ at 710.5 eV (Fe²⁺), satellite at +6 eV from main peak
 *   Raman: PO₄³⁻ symmetric stretch at 948 cm⁻¹ (A₁ mode)
 *
 * NMC-111 (Layered, R-3m):
 *   Ni²⁺/Ni⁴⁺ redox dominant, Co³⁺ contributes at high voltage
 *   Multiple phase transitions: H1 → M → H2 → H3 during charging
 *   XPS: Ni 2p₃/₂ at 854.5 eV (Ni²⁺), 856.0 eV (Ni³⁺)
 *   Raman: Eg + A₁g modes of MO₆ octahedra at 480–600 cm⁻¹
 *
 * LLZO (Garnet, Ia-3d):
 *   Li⁺ ionic conductor: σ_Li ~ 10⁻⁴ to 10⁻³ S/cm
 *   Cubic phase preferred (higher conductivity than tetragonal)
 *   XRD: cubic (211) at 2θ ≈ 27.5° vs tetragonal splitting
 *   Raman: La-O and Zr-O modes at 100–700 cm⁻¹
 *
 * @module reasoningEngine/knowledgeBase/energyStorageRules
 * ============================================================================
 */

import type { Technique } from '../../../types/universalTechnique';
import type { MaterialSystem } from '../types';
import type {
  MaterialRuleSet,
  PhaseReference,
  CrossValidationRuleDefinition,
  RecommendationEntry,
  PhaseInferenceResult,
  OxidationStateResult,
} from './baseTypes';

// ============================================================================
// LiFePO₄ Reference Data
// ============================================================================

/** LiFePO₄ olivine XRD — Pnma (#62), orthorhombic: a=10.334, b=6.010, c=4.693 Å */
const LFP_XRD_PEAKS = [
  { hkl: '020', twoTheta: 20.74, dSpacing: 4.28, relativeIntensity: 40 },
  { hkl: '101', twoTheta: 25.57, dSpacing: 3.48, relativeIntensity: 25 },
  { hkl: '111', twoTheta: 29.70, dSpacing: 3.00, relativeIntensity: 50 },
  { hkl: '021', twoTheta: 32.20, dSpacing: 2.78, relativeIntensity: 30 },
  { hkl: '121', twoTheta: 35.61, dSpacing: 2.52, relativeIntensity: 100 },
  { hkl: '002', twoTheta: 38.82, dSpacing: 2.32, relativeIntensity: 15 },
  { hkl: '301', twoTheta: 43.58, dSpacing: 2.08, relativeIntensity: 20 },
  { hkl: '131', twoTheta: 48.39, dSpacing: 1.88, relativeIntensity: 25 },
  { hkl: '040', twoTheta: 52.43, dSpacing: 1.74, relativeIntensity: 20 },
];

/** LiFePO₄ Raman — Olivenite-type: 36 internal modes, strongest: PO₄³⁻ symmetric stretch */
const LFP_RAMAN_MODES = [
  { shift: 243, symmetry: 'Bg', relativeIntensity: 30, ramanActive: true, irActive: false, description: 'FeO₆ translation' },
  { shift: 298, symmetry: 'Ag', relativeIntensity: 40, ramanActive: true, irActive: false, description: 'FeO₆ rotation' },
  { shift: 389, symmetry: 'Ag', relativeIntensity: 50, ramanActive: true, irActive: false, description: 'PO₄³⁻ ν₂ bending' },
  { shift: 470, symmetry: 'Bg', relativeIntensity: 35, ramanActive: true, irActive: false, description: 'PO₄³⁻ ν₄ bending' },
  { shift: 615, symmetry: 'Ag', relativeIntensity: 30, ramanActive: true, irActive: false, description: 'PO₄³⁻ ν₄ asymmetric bending' },
  { shift: 948, symmetry: 'Ag', relativeIntensity: 100, ramanActive: true, irActive: false, description: 'PO₄³⁻ ν₁ symmetric stretch' },
  { shift: 993, symmetry: 'Bg', relativeIntensity: 50, ramanActive: true, irActive: false, description: 'PO₄³⁻ ν₃ asymmetric stretch' },
  { shift: 1065, symmetry: 'Ag', relativeIntensity: 40, ramanActive: true, irActive: false, description: 'PO₄³⁻ ν₃ asymmetric stretch' },
];

/** LiFePO₄ XPS — Fe²⁺ in octahedral O²⁻ environment */
const LFP_XPS_PEAKS = [
  { orbital: 'Fe 2p3/2', bindingEnergy: 710.5, fwhm: 2.8, oxidationState: 'Fe²⁺', chemicalContext: 'octahedral Fe²⁺ in olivine' },
  { orbital: 'Fe 2p1/2', bindingEnergy: 724.0, fwhm: 3.2, oxidationState: 'Fe²⁺', spinOrbitSplitting: 13.5 },
  { orbital: 'Fe 2p3/2 sat', bindingEnergy: 716.5, fwhm: 3.0, oxidationState: 'Fe²⁺ (satellite)', chemicalContext: 'LMCT satellite +6 eV' },
  { orbital: 'P 2p', bindingEnergy: 133.2, fwhm: 1.8, oxidationState: 'P⁵⁺', chemicalContext: 'PO₄³⁻ phosphate' },
  { orbital: 'O 1s', bindingEnergy: 531.5, fwhm: 1.6, oxidationState: 'O²⁻', chemicalContext: 'lattice oxygen in PO₄/FeO₆' },
];

/** LiFePO₄ FTIR — PO₄³⁻ vibrational modes */
const LFP_FTIR_BANDS = [
  { wavenumber: 500, assignment: 'PO₄³⁻ ν₂ bending', relativeIntensity: 50, bandShape: 'broad' as const, diagnostic: false },
  { wavenumber: 575, assignment: 'PO₄³⁻ ν₄ bending', relativeIntensity: 60, bandShape: 'broad' as const, diagnostic: false },
  { wavenumber: 945, assignment: 'PO₄³⁻ ν₁ symmetric stretch', relativeIntensity: 80, bandShape: 'sharp' as const, diagnostic: true },
  { wavenumber: 1005, assignment: 'PO₄³⁻ ν₃ asymmetric stretch', relativeIntensity: 70, bandShape: 'broad' as const, diagnostic: true },
  { wavenumber: 1060, assignment: 'PO₄³⁻ ν₃ asymmetric stretch', relativeIntensity: 65, bandShape: 'broad' as const, diagnostic: false },
  { wavenumber: 1135, assignment: 'PO₄³⁻ ν₃ asymmetric stretch', relativeIntensity: 40, bandShape: 'shoulder' as const, diagnostic: false },
];

// ============================================================================
// NMC-111 Reference Data
// ============================================================================

/** NMC-111 XRD — R-3m (#166), rhombohedral: a=2.860, c=14.230 Å (hexagonal setting) */
const NMC_XRD_PEAKS = [
  { hkl: '003', twoTheta: 18.48, dSpacing: 4.80, relativeIntensity: 60 },
  { hkl: '101', twoTheta: 36.70, dSpacing: 2.45, relativeIntensity: 40 },
  { hkl: '104', twoTheta: 44.38, dSpacing: 2.04, relativeIntensity: 100 },
  { hkl: '015', twoTheta: 48.50, dSpacing: 1.88, relativeIntensity: 25 },
  { hkl: '018', twoTheta: 58.50, dSpacing: 1.58, relativeIntensity: 20 },
  { hkl: '110', twoTheta: 64.30, dSpacing: 1.45, relativeIntensity: 50 },
  { hkl: '113', twoTheta: 68.70, dSpacing: 1.36, relativeIntensity: 30 },
];

/** NMC-111 Raman — MO₆ octahedral modes */
const NMC_RAMAN_MODES = [
  { shift: 430, symmetry: 'Eg', relativeIntensity: 40, ramanActive: true, irActive: false, description: 'M-O-M bending (MO₆ network)' },
  { shift: 480, symmetry: 'Eg', relativeIntensity: 50, ramanActive: true, irActive: false, description: 'Ni-O stretching' },
  { shift: 555, symmetry: 'A₁g', relativeIntensity: 70, ramanActive: true, irActive: false, description: 'M-O symmetric stretch (MO₆)' },
  { shift: 595, symmetry: 'A₁g', relativeIntensity: 100, ramanActive: true, irActive: false, description: 'Co-O symmetric stretch' },
];

/** NMC-111 XPS — Mixed Ni²⁺/Ni³⁺ and Co³⁺ */
const NMC_XPS_PEAKS = [
  { orbital: 'Ni 2p3/2', bindingEnergy: 854.5, fwhm: 2.5, oxidationState: 'Ni²⁺', chemicalContext: 'octahedral Ni²⁺ in layered oxide' },
  { orbital: 'Ni 2p3/2', bindingEnergy: 856.0, fwhm: 2.2, oxidationState: 'Ni³⁺', chemicalContext: 'octahedral Ni³⁺ in layered oxide' },
  { orbital: 'Ni 2p1/2', bindingEnergy: 872.0, fwhm: 2.8, oxidationState: 'Ni²⁺/Ni³⁺', spinOrbitSplitting: 17.5 },
  { orbital: 'Co 2p3/2', bindingEnergy: 779.8, fwhm: 2.0, oxidationState: 'Co³⁺', chemicalContext: 'octahedral Co³⁺' },
  { orbital: 'Mn 2p3/2', bindingEnergy: 642.0, fwhm: 2.5, oxidationState: 'Mn⁴⁺', chemicalContext: 'octahedral Mn⁴⁺' },
  { orbital: 'O 1s', bindingEnergy: 529.3, fwhm: 1.4, oxidationState: 'O²⁻', chemicalContext: 'lattice oxygen in MO₆' },
];

// ============================================================================
// LLZO (Li₇La₃Zr₂O₁₂) Reference Data
// ============================================================================

/** LLZO XRD — Cubic Ia-3d (#230): a=12.984 Å; Tetragonal I4₁/acd (#142): a=13.134, c=12.670 Å */
const LLZO_XRD_PEAKS = [
  { hkl: '211', twoTheta: 16.50, dSpacing: 5.37, relativeIntensity: 15 },
  { hkl: '220', twoTheta: 20.40, dSpacing: 4.35, relativeIntensity: 20 },
  { hkl: '321', twoTheta: 25.30, dSpacing: 3.52, relativeIntensity: 25 },
  { hkl: '400', twoTheta: 28.60, dSpacing: 3.12, relativeIntensity: 40 },
  { hkl: '420', twoTheta: 32.10, dSpacing: 2.79, relativeIntensity: 100 },
  { hkl: '422', twoTheta: 35.20, dSpacing: 2.55, relativeIntensity: 30 },
  { hkl: '521', twoTheta: 37.80, dSpacing: 2.38, relativeIntensity: 20 },
  { hkl: '440', twoTheta: 41.20, dSpacing: 2.19, relativeIntensity: 35 },
];

/** LLZO Raman — Garnet framework modes: LaO₈ dodecahedra + ZrO₆ octahedra + LiOₓ polyhedra */
const LLZO_RAMAN_MODES = [
  { shift: 105, symmetry: 'Ag', relativeIntensity: 40, ramanActive: true, irActive: false, description: 'LaO₈ cage vibration' },
  { shift: 152, symmetry: 'Ag', relativeIntensity: 50, ramanActive: true, irActive: false, description: 'ZrO₆ rotation' },
  { shift: 230, symmetry: 'T₂g', relativeIntensity: 35, ramanActive: true, irActive: true, description: 'Li-O vibration' },
  { shift: 370, symmetry: 'Ag', relativeIntensity: 60, ramanActive: true, irActive: false, description: 'ZrO₆ bending' },
  { shift: 520, symmetry: 'T₂g', relativeIntensity: 80, ramanActive: true, irActive: true, description: 'ZrO₆ asymmetric stretch' },
  { shift: 650, symmetry: 'Ag', relativeIntensity: 100, ramanActive: true, irActive: false, description: 'ZrO₆ symmetric stretch' },
];

/** LLZO XPS — La³⁺, Zr⁴⁺ */
const LLZO_XPS_PEAKS = [
  { orbital: 'La 3d5/2', bindingEnergy: 834.8, fwhm: 2.0, oxidationState: 'La³⁺', chemicalContext: 'LaO₈ dodecahedra in garnet' },
  { orbital: 'Zr 3d5/2', bindingEnergy: 182.2, fwhm: 1.5, oxidationState: 'Zr⁴⁺', chemicalContext: 'ZrO₆ octahedra' },
  { orbital: 'Li 1s', bindingEnergy: 54.8, fwhm: 1.8, oxidationState: 'Li⁺', chemicalContext: 'mobile Li⁺ in garnet channels' },
  { orbital: 'O 1s', bindingEnergy: 529.0, fwhm: 1.4, oxidationState: 'O²⁻', chemicalContext: 'lattice oxygen in garnet framework' },
];

// ============================================================================
// Phase References (Universal Format)
// ============================================================================

function makeLfpPhaseRef(): PhaseReference {
  return {
    phaseName: 'olivine LiFePO₄',
    materialId: 'LiFePO4',
    xrd: {
      phaseName: 'olivine LiFePO₄',
      spaceGroup: 'Pnma',
      crystalSystem: 'orthorhombic',
      latticeParameters: { a: 10.334, b: 6.010, c: 4.693 },
      peaks: LFP_XRD_PEAKS.map((p) => ({ ...p, fwhm: 0.15 })),
      detectionLimit: 0.02,
    },
    raman: {
      phaseName: 'olivine LiFePO₄',
      excitationWavelength: 532,
      modes: LFP_RAMAN_MODES.map((m) => ({ ...m, fwhm: 8 })),
      overlapZone: { min: 940, max: 1000, confusablePhases: ['FePO₄ (delithiated)'] },
    },
    xps: { materialName: 'LiFePO₄', xraySource: 'Al_Kalpha', peaks: LFP_XPS_PEAKS },
    ftir: {
      materialName: 'LiFePO₄',
      spectralRange: { min: 400, max: 1200 },
      bands: LFP_FTIR_BANDS.map((b) => ({ ...b, fwhm: 30 })),
    },
  };
}

function makeNmcPhaseRef(): PhaseReference {
  return {
    phaseName: 'layered NMC-111',
    materialId: 'NMC111',
    xrd: {
      phaseName: 'layered NMC-111',
      spaceGroup: 'R-3m',
      crystalSystem: 'rhombohedral',
      latticeParameters: { a: 2.860, c: 14.230 },
      peaks: NMC_XRD_PEAKS.map((p) => ({ ...p, fwhm: 0.15 })),
      detectionLimit: 0.02,
    },
    raman: {
      phaseName: 'layered NMC-111',
      excitationWavelength: 532,
      modes: NMC_RAMAN_MODES.map((m) => ({ ...m, fwhm: 12 })),
    },
    xps: { materialName: 'NMC-111', xraySource: 'Al_Kalpha', peaks: NMC_XPS_PEAKS },
  };
}

function makeLlzoPhaseRef(): PhaseReference {
  return {
    phaseName: 'cubic LLZO',
    materialId: 'LLZO',
    xrd: {
      phaseName: 'cubic LLZO',
      spaceGroup: 'Ia-3d',
      crystalSystem: 'cubic',
      latticeParameters: { a: 12.984 },
      peaks: LLZO_XRD_PEAKS.map((p) => ({ ...p, fwhm: 0.15 })),
      detectionLimit: 0.03,
    },
    raman: {
      phaseName: 'cubic LLZO',
      excitationWavelength: 532,
      modes: LLZO_RAMAN_MODES.map((m) => ({ ...m, fwhm: 10 })),
    },
    xps: { materialName: 'LLZO', xraySource: 'Al_Kalpha', peaks: LLZO_XPS_PEAKS },
  };
}

// ============================================================================
// Cross-Validation Rules
// ============================================================================

const ENERGY_STORAGE_CV_RULES: CrossValidationRuleDefinition[] = [
  {
    ruleId: 'CV-ES-001',
    ruleName: 'XRD Phase ↔ XPS Valence State (LFP)',
    techniques: ['XRD', 'XPS'],
    weight: 0.95,
    materialSystem: 'LiFePO4',
    physicalBasis: 'Olivine Pnma structure requires Fe²⁺. XPS Fe 2p₃/₂ at 710.5 eV confirms Fe²⁺. Fe³⁺ (711.5 eV) would indicate partial delithiation to FePO₄.',
    conditions: [{ parameter: 'oxidationState', primaryTechnique: 'XPS', secondaryTechnique: 'XRD', tolerance: 0.5, unit: 'eV' }],
    consistentInterpretation: 'XRD olivine structure + XPS Fe²⁺ → phase-pure LiFePO₄.',
    inconsistentInterpretation: 'XRD olivine but XPS Fe³⁺ → partial delithiation or FePO₄ impurity.',
    partialInterpretation: 'Mixed Fe²⁺/Fe³⁺ → partial state of charge or surface oxidation.',
  },
  {
    ruleId: 'CV-ES-002',
    ruleName: 'Raman PO₄ Modes ↔ XRD Crystallinity (LFP)',
    techniques: ['Raman', 'XRD'],
    weight: 0.80,
    materialSystem: 'LiFePO4',
    physicalBasis: 'Sharp PO₄³⁻ Raman peak at 948 cm⁻¹ ↔ sharp XRD (121) reflection. Both indicate high crystallinity.',
    conditions: [{ parameter: 'crystallinity', primaryTechnique: 'Raman', secondaryTechnique: 'XRD', tolerance: 15, unit: '%' }],
    consistentInterpretation: 'Raman and XRD agree on crystallinity — high-quality LFP.',
    inconsistentInterpretation: 'Raman sharp but XRD broad → amorphous carbon coating dominates XRD background.',
    partialInterpretation: 'Slight mismatch → carbon coating may obscure XRD but not Raman.',
  },
  {
    ruleId: 'CV-ES-003',
    ruleName: 'NMC I(003)/I(104) ↔ XPS Ni Oxidation',
    techniques: ['XRD', 'XPS'],
    weight: 0.90,
    materialSystem: 'NMC111',
    physicalBasis: 'I(003)/I(104) > 1.2 indicates good cation ordering. Ni²⁺ (854.5 eV) → ordered; Ni³⁺ (856.0 eV) → disordered or charged.',
    conditions: [{ parameter: 'cationOrdering', primaryTechnique: 'XRD', secondaryTechnique: 'XPS', tolerance: 0.2, unit: 'ratio' }],
    consistentInterpretation: 'Good cation ordering and expected Ni oxidation state.',
    inconsistentInterpretation: 'Low I(003)/I(104) with Ni²⁺ → Li/Ni cation mixing.',
    partialInterpretation: 'Partial cation disorder detected.',
  },
  {
    ruleId: 'CV-ES-004',
    ruleName: 'LLZO Cubic/Tetragonal ↔ Conductivity',
    techniques: ['XRD', 'Raman'],
    weight: 0.85,
    materialSystem: 'LLZO',
    physicalBasis: 'Cubic Ia-3d shows single (420) peak; tetragonal splits into multiple peaks. Cubic σ_Li ~ 10⁻³ S/cm >> tetragonal ~ 10⁻⁴ S/cm.',
    conditions: [{ parameter: 'phase', primaryTechnique: 'XRD', secondaryTechnique: 'Raman', tolerance: 5, unit: 'cm⁻¹' }],
    consistentInterpretation: 'XRD and Raman agree on cubic phase — high ionic conductivity expected.',
    inconsistentInterpretation: 'XRD cubic but Raman shows tetragonal splitting → partial transformation.',
    partialInterpretation: 'Coexistence of cubic and tetragonal domains.',
  },
];

// ============================================================================
// Recommendations
// ============================================================================

const ENERGY_STORAGE_RECS: RecommendationEntry[] = [
  {
    trigger: 'missing_technique:XPS',
    recommendation: 'Perform XPS Fe 2p analysis to confirm Fe²⁺/Fe³⁺ ratio in LFP.',
    priority: 'critical',
    techniques: ['XPS'],
    expectedOutcome: 'Fe 2p₃/₂ at 710.5 eV (Fe²⁺) with LMCT satellite at 716.5 eV.',
    rationale: 'XPS directly measures Fe oxidation state — essential for confirming lithiation state.',
  },
  {
    trigger: 'contradiction:oxidationState',
    recommendation: 'Perform operando XRD to track phase evolution during cycling.',
    priority: 'high',
    techniques: ['XRD'],
    expectedOutcome: 'Two-phase LFP↔FP transition visible as peak evolution with SOC.',
    rationale: 'Operando XRD resolves whether Fe³⁺ is from delithiation or Fe₂O₃ impurity.',
  },
  {
    trigger: 'missing_technique:Raman',
    recommendation: 'Perform Raman spectroscopy for PO₄³⁻ vibrational fingerprinting.',
    priority: 'high',
    techniques: ['Raman'],
    expectedOutcome: 'PO₄³⁻ ν₁ at 948 cm⁻¹ confirms olivine phase.',
    rationale: 'Raman is sensitive to local bonding — detects amorphous phases invisible to XRD.',
  },
];

// ============================================================================
// Inference Functions
// ============================================================================

function inferEnergyStorageXrdPhases(
  xrdNodes: Array<{ peaks?: Array<{ twoTheta: number; intensity: number }> }>,
): PhaseInferenceResult {
  const phases: PhaseInferenceResult['phases'] = [];
  for (const [name, ref] of [['LiFePO₄', LFP_XRD_PEAKS] as const, ['NMC-111', NMC_XRD_PEAKS] as const, ['LLZO', LLZO_XRD_PEAKS] as const]) {
    let matched = 0, total = 0;
    const matchedPeaks: string[] = [];
    for (const rp of ref) {
      total += rp.relativeIntensity;
      for (const node of xrdNodes) {
        for (const op of node.peaks ?? []) {
          if (Math.abs(op.twoTheta - rp.twoTheta) <= 0.2) {
            matched += rp.relativeIntensity;
            if (!matchedPeaks.includes(rp.hkl)) matchedPeaks.push(rp.hkl);
          }
        }
      }
    }
    phases.push({ phaseName: name, matchScore: total > 0 ? matched / total : 0, matchedPeaks });
  }
  phases.sort((a, b) => b.matchScore - a.matchScore);
  return { phases, dominantPhase: phases[0].phaseName, confidence: phases[0].matchScore, isMixed: phases.length > 1 && phases[1].matchScore > 0.3 };
}

function inferEnergyStorageRamanPhases(
  ramanNodes: Array<{ peaks?: Array<{ position: number; intensity: number }> }>,
): PhaseInferenceResult {
  const phases: PhaseInferenceResult['phases'] = [];
  for (const [name, ref] of [['LiFePO₄', LFP_RAMAN_MODES] as const, ['NMC-111', NMC_RAMAN_MODES] as const, ['LLZO', LLZO_RAMAN_MODES] as const]) {
    let count = 0;
    const matchedPeaks: string[] = [];
    for (const rm of ref) {
      for (const node of ramanNodes) {
        for (const op of node.peaks ?? []) {
          if (Math.abs(op.position - rm.shift) <= 10) {
            count++;
            if (!matchedPeaks.includes(rm.description ?? '')) matchedPeaks.push(rm.description ?? `${rm.shift}`);
          }
        }
      }
    }
    phases.push({ phaseName: name, matchScore: ref.length > 0 ? count / ref.length : 0, matchedPeaks });
  }
  phases.sort((a, b) => b.matchScore - a.matchScore);
  return { phases, dominantPhase: phases[0].phaseName, confidence: phases[0].matchScore, isMixed: phases.length > 1 && phases[1].matchScore > 0.25 };
}

function inferEnergyStorageXpsOxidationState(
  xpsNodes: Array<{ peaks?: Array<{ bindingEnergy: number; orbital?: string }> }>,
): OxidationStateResult {
  const states: OxidationStateResult['states'] = [];
  const refs = [
    { state: 'Fe²⁺', be: 710.5 },
    { state: 'Fe³⁺', be: 711.5 },
    { state: 'Ni²⁺', be: 854.5 },
    { state: 'Ni³⁺', be: 856.0 },
    { state: 'Co³⁺', be: 779.8 },
  ];
  for (const r of refs) {
    for (const node of xpsNodes) {
      for (const op of node.peaks ?? []) {
        if (Math.abs(op.bindingEnergy - r.be) <= 0.8) {
          states.push({ oxidationState: r.state, bindingEnergy: op.bindingEnergy, matchScore: 1 - Math.abs(op.bindingEnergy - r.be) / 0.8 });
        }
      }
    }
  }
  states.sort((a, b) => b.matchScore - a.matchScore);
  const dominant = states[0] ?? { oxidationState: 'unknown', bindingEnergy: 0, matchScore: 0 };
  return { states, dominantState: dominant.oxidationState, confidence: dominant.matchScore, isMixed: states.length > 1 };
}

// ============================================================================
// Rule Set Export
// ============================================================================

export const energyStorageRuleSet: MaterialRuleSet = {
  materialId: 'energyStorage',
  materialName: 'Energy Storage Materials (LFP, NMC, LLZO)',
  materialClass: 'energy_storage',
  formula: 'LiFePO4 / NMC / LLZO',
  aliases: ['LFP', 'LiFePO4', 'lithium iron phosphate', 'NMC', 'NMC111', 'LiNiMnCoO2', 'LLZO', 'Li7La3Zr2O12', 'garnet electrolyte'],
  phases: [makeLfpPhaseRef(), makeNmcPhaseRef(), makeLlzoPhaseRef()],
  crossValidationRules: ENERGY_STORAGE_CV_RULES,
  recommendations: ENERGY_STORAGE_RECS,
  inferXrdPhases: inferEnergyStorageXrdPhases,
  inferRamanPhases: inferEnergyStorageRamanPhases,
  inferXpsOxidationState: inferEnergyStorageXpsOxidationState,
  version: '1.0.0',
  lastUpdated: '2026-05-28T00:00:00Z',
  notes: 'Covers LiFePO₄ (olivine), NMC-111 (layered), and LLZO (garnet solid electrolyte). Fe²⁺/Fe³⁺ and Ni²⁺/Ni³⁺ valence state detection via XPS spin-orbit and satellite analysis is critical.',
};