/**
 * ============================================================================
 * DIFARYX — Universal Knowledge Base: Superconductor Rule Set
 * ============================================================================
 * Materials: YBCO (YBa₂Cu₃O₇₋ₓ) — High-Temperature Superconductor
 * ============================================================================
 * SUPERCONDUCTOR PHYSICS
 * ============================================================================
 *
 * YBCO (YBa₂Cu₃O₇₋ₓ):
 *   - First superconductor with Tc > 77 K (liquid nitrogen temperature)
 *   - Space group: Pmmm (#47), orthorhombic
 *   - Lattice parameters: a ≈ 3.82 Å, b ≈ 3.89 Å, c ≈ 11.68 Å
 *   - Perovskite-related structure with CuO₂ planes (conducting) and CuO chains
 *   - Oxygen content 7-δ controls Tc:
 *     δ ≈ 0: Tc ≈ 93 K (fully oxygenated, orthorhombic-II)
 *     δ ≈ 0.3: Tc ≈ 60 K (oxygen-deficient, orthorhombic-I)
 *     δ ≈ 0.6: Tc ≈ 0 (tetragonal, non-superconducting)
 *
 *   Crystal Chemistry:
 *   - Cu(1) site: chain copper (BaO-CuO-δ-BaO layers), coordination 4→2→4
 *   - Cu(2) site: plane copper (CuO₂ planes), 5-fold pyramidal coordination
 *   - Cu(1) oxidation: Cu¹⁺ for δ>0, Cu²⁺ for δ≈0 (oxygen on chain sites)
 *   - Cu(2) oxidation: always ~Cu²⁺ in superconducting compositions
 *   - Formal charge balance: Y³⁺ + 2·Ba²⁺ + 3·Cu_avg + (7-δ)·O²⁻ = 0
 *     → Cu_avg = (7 + 2δ)/3 ≈ 2.33 for δ=0
 *
 *   BCS Theory (Extended for HTS):
 *   - Cooper pairing: electron-electron coupling via phonon exchange
 *   - Energy gap: Δ₀ = 2Δ(0) ≈ 4.28 kB·Tc (BCS ratio)
 *   - Coherence length: ξ_ab ≈ 15 Å (in-plane), ξ_c ≈ 3 Å (out-of-plane)
 *   - Penetration depth: λ_ab ≈ 1400 Å (in-plane)
 *   - London equation: B(x) = B₀·exp(-x/λ)
 *   - Ginzburg-Landau parameter: κ = λ/ξ >> 1 (Type-II superconductor)
 *   - Upper critical field: Hc₂ = Φ₀/(2πξ²) where Φ₀ = h/2e = 2.07×10⁻¹⁵ Wb
 *
 *   Raman Spectroscopy:
 *   - Ag modes (fully symmetric): O(2)-O(3) out-of-phase ~340 cm⁻¹
 *   - Ba mode: ~120 cm⁻¹
 *   - Cu(2) mode: ~150 cm⁻¹
 *   - O(4) chain oxygen: ~500 cm⁻¹ (sensitive to oxygen content)
 *   - Phonon anomaly near Tc: renormalization due to electron-phonon coupling
 *
 *   XPS:
 *   - Cu 2p₃/₂: 933.5 eV (Cu¹⁺), 933.8 eV (Cu²⁺ in chains), 934.5 eV (Cu²⁺ in planes)
 *   - Shake-up satellite: 942 eV (Cu²⁺ diagnostic, absent for Cu¹⁺)
 *   - Ba 3d₅/₂: 778.5 eV (Ba²⁺ in YBCO)
 *   - Y 3d₅/₂: 156.8 eV (Y³⁺)
 *   - O 1s: 528.5 eV (lattice O²⁻), 531.0 eV (surface oxygen)
 *
 *   FTIR / Reflectance:
 *   - Phonon modes: 155, 190, 280, 340, 500, 580, 620 cm⁻¹
 *   - Infrared active: B₁u, B₂u, B₃u modes (orthorhombic symmetry)
 *   - Superconducting gap: 2Δ ~ 60–80 meV (far-IR reflectance edge)
 *
 * @module reasoningEngine/knowledgeBase/superconductorRules
 * ============================================================================
 */
import type { Technique } from '../../../types/universalTechnique';
import type { MaterialRuleSet, PhaseReference, CrossValidationRuleDefinition, RecommendationEntry, PhaseInferenceResult, OxidationStateResult } from './baseTypes';

// ============================================================================
// YBCO XRD — Pmmm orthorhombic
// ============================================================================
const YBCO_XRD_PEAKS = [
  { hkl: '001', twoTheta: 6.80, dSpacing: 13.00, relativeIntensity: 5, notes: 'Superlattice reflection' },
  { hkl: '003', twoTheta: 22.80, dSpacing: 3.898, relativeIntensity: 30 },
  { hkl: '005', twoTheta: 25.70, dSpacing: 3.463, relativeIntensity: 15 },
  { hkl: '006', twoTheta: 30.90, dSpacing: 2.891, relativeIntensity: 20 },
  { hkl: '103', twoTheta: 32.50, dSpacing: 2.752, relativeIntensity: 100 },
  { hkl: '110', twoTheta: 32.80, dSpacing: 2.728, relativeIntensity: 80 },
  { hkl: '013', twoTheta: 32.85, dSpacing: 2.724, relativeIntensity: 75 },
  { hkl: '007', twoTheta: 36.00, dSpacing: 2.492, relativeIntensity: 10 },
  { hkl: '020', twoTheta: 38.50, dSpacing: 2.337, relativeIntensity: 15 },
  { hkl: '009', twoTheta: 46.50, dSpacing: 1.951, relativeIntensity: 20 },
  { hkl: '200', twoTheta: 47.50, dSpacing: 1.912, relativeIntensity: 15 },
  { hkl: '119', twoTheta: 57.80, dSpacing: 1.593, relativeIntensity: 15 },
];

// ============================================================================
// YBCO Raman modes
// ============================================================================
const YBCO_RAMAN_MODES = [
  { shift: 118, symmetry: 'A_g', relativeIntensity: 30, ramanActive: true, irActive: false, description: 'Ba vibration', confinementSensitivity: 0 },
  { shift: 150, symmetry: 'A_g', relativeIntensity: 25, ramanActive: true, irActive: false, description: 'Cu(2) apical vibration', confinementSensitivity: 0 },
  { shift: 340, symmetry: 'A_g', relativeIntensity: 100, ramanActive: true, irActive: false, description: 'O(2)-O(3) out-of-phase buckling (diagnostic)', confinementSensitivity: 0 },
  { shift: 440, symmetry: 'A_g', relativeIntensity: 40, ramanActive: true, irActive: false, description: 'O(2)-O(3) in-phase stretch', confinementSensitivity: 0 },
  { shift: 500, symmetry: 'A_g', relativeIntensity: 35, ramanActive: true, irActive: false, description: 'O(4) chain oxygen vibration (sensitive to δ)', confinementSensitivity: 0 },
];

// ============================================================================
// YBCO FTIR
// ============================================================================
const YBCO_FTIR_BANDS = [
  { wavenumber: 155, assignment: 'Ba A_g mode', relativeIntensity: 20, bandShape: 'sharp' as const, diagnostic: false },
  { wavenumber: 190, assignment: 'Cu(2) B₁u mode', relativeIntensity: 25, bandShape: 'sharp' as const, diagnostic: false },
  { wavenumber: 280, assignment: 'O(2)-O(3) B₂u mode', relativeIntensity: 30, bandShape: 'broad' as const, diagnostic: true },
  { wavenumber: 340, assignment: 'O(2)-O(3) B₃u mode', relativeIntensity: 40, bandShape: 'broad' as const, diagnostic: true },
  { wavenumber: 500, assignment: 'O(4) chain oxygen IR mode', relativeIntensity: 50, bandShape: 'broad' as const, diagnostic: true },
  { wavenumber: 580, assignment: 'Cu(1)-O(4) stretch', relativeIntensity: 35, bandShape: 'broad' as const, diagnostic: true },
  { wavenumber: 620, assignment: 'Cu(2)-O(1) apical stretch', relativeIntensity: 30, bandShape: 'broad' as const, diagnostic: true },
];

// ============================================================================
// YBCO XPS
// ============================================================================
const YBCO_XPS_PEAKS = [
  { orbital: 'Cu 2p3/2', bindingEnergy: 933.5, fwhm: 1.5, oxidationState: 'Cu¹⁺', chemicalContext: 'Cu(1) chain site (oxygen deficient)', satellites: [] },
  { orbital: 'Cu 2p3/2', bindingEnergy: 933.8, fwhm: 1.8, oxidationState: 'Cu²⁺', chemicalContext: 'Cu(1) chain site', satellites: [{ label: 'Cu²⁺ shake-up', offset: 8.5, relativeIntensity: 15 }] },
  { orbital: 'Cu 2p3/2', bindingEnergy: 934.5, fwhm: 2.0, oxidationState: 'Cu²⁺/Cu³⁺', chemicalContext: 'Cu(2) plane site', satellites: [{ label: 'Cu²⁺ shake-up', offset: 7.8, relativeIntensity: 20 }] },
  { orbital: 'Ba 3d5/2', bindingEnergy: 778.5, fwhm: 1.4, oxidationState: 'Ba²⁺', chemicalContext: 'Ba in YBCO lattice' },
  { orbital: 'Y 3d5/2', bindingEnergy: 156.8, fwhm: 1.2, oxidationState: 'Y³⁺', chemicalContext: 'Y in YBCO lattice' },
  { orbital: 'O 1s', bindingEnergy: 528.5, fwhm: 1.3, oxidationState: 'O²⁻', chemicalContext: 'Lattice oxygen in CuO₂ planes' },
  { orbital: 'O 1s', bindingEnergy: 531.0, fwhm: 1.8, oxidationState: 'O²⁻', chemicalContext: 'Surface oxygen / oxygen vacancies' },
];

// ============================================================================
// Phase References
// ============================================================================
function makeYbcoOrthoIIPhaseRef(): PhaseReference {
  return {
    phaseName: 'YBCO Orthorhombic-II (fully oxygenated)', materialId: 'YBCO-OII',
    xrd: {
      phaseName: 'YBCO Ortho-II', spaceGroup: 'Pmmm', crystalSystem: 'orthorhombic',
      latticeParameters: { a: 3.82, b: 3.89, c: 11.68 },
      peaks: YBCO_XRD_PEAKS.map((p) => ({ ...p, fwhm: 0.12 })),
      detectionLimit: 0.05,
    },
    raman: { phaseName: 'YBCO Ortho-II', excitationWavelength: 514, modes: YBCO_RAMAN_MODES },
    xps: { materialName: 'YBCO', xraySource: 'Al_Kalpha', peaks: YBCO_XPS_PEAKS },
    ftir: { materialName: 'YBCO', spectralRange: { min: 50, max: 1000 }, bands: YBCO_FTIR_BANDS },
  };
}

function makeYbcoTetPhaseRef(): PhaseReference {
  return {
    phaseName: 'YBCO Tetragonal (non-superconducting)', materialId: 'YBCO-TET',
    xrd: {
      phaseName: 'YBCO Tetragonal', spaceGroup: 'P4/mmm', crystalSystem: 'tetragonal',
      latticeParameters: { a: 3.86, c: 11.75 },
      peaks: [
        { hkl: '003', twoTheta: 22.60, dSpacing: 3.931, relativeIntensity: 30, fwhm: 0.15 },
        { hkl: '103', twoTheta: 32.30, dSpacing: 2.769, relativeIntensity: 100, fwhm: 0.15 },
        { hkl: '110', twoTheta: 32.60, dSpacing: 2.744, relativeIntensity: 85, fwhm: 0.15 },
        { hkl: '006', twoTheta: 30.60, dSpacing: 2.919, relativeIntensity: 20, fwhm: 0.15 },
        { hkl: '009', twoTheta: 46.20, dSpacing: 1.963, relativeIntensity: 20, fwhm: 0.15 },
      ],
      detectionLimit: 0.05,
    },
    raman: { phaseName: 'YBCO Tetragonal', excitationWavelength: 514, modes: YBCO_RAMAN_MODES },
    xps: { materialName: 'YBCO', xraySource: 'Al_Kalpha', peaks: YBCO_XPS_PEAKS },
    ftir: { materialName: 'YBCO', spectralRange: { min: 50, max: 1000 }, bands: YBCO_FTIR_BANDS },
  };
}

// ============================================================================
// Cross-Validation Rules
// ============================================================================
const SC_CV_RULES: CrossValidationRuleDefinition[] = [
  { ruleId: 'CV-SC-001', ruleName: 'XRD Orthorhombic Splitting ↔ Tc', techniques: ['XRD'], weight: 0.95, materialSystem: 'YBCO',
    physicalBasis: 'Orthorhombic splitting Δ(2θ) between (103)/(013)/(110) reflections correlates with oxygen content δ and Tc. Large splitting = high oxygen content = high Tc.',
    conditions: [{ parameter: 'oxygenContent', primaryTechnique: 'XRD', secondaryTechnique: 'XRD', tolerance: 0.05, unit: 'δ' }],
    consistentInterpretation: 'XRD orthorhombic splitting consistent with expected Tc.', inconsistentInterpretation: 'XRD shows tetragonal but transport shows Tc>0 → partial oxygenation or mixed phase.', partialInterpretation: 'Broadened peaks suggest oxygen inhomogeneity.' },
  { ruleId: 'CV-SC-002', ruleName: 'XPS Cu 2p Shake-up ↔ Cu Oxidation State', techniques: ['XPS'], weight: 0.85, materialSystem: 'YBCO',
    physicalBasis: 'Cu²⁺ shake-up satellite at ~942 eV (absent for Cu¹⁺). Intensity of satellite correlates with Cu²⁺/Cu¹⁺ ratio, which tracks oxygen content δ.',
    conditions: [{ parameter: 'copperOxidation', primaryTechnique: 'XPS', secondaryTechnique: 'XPS', tolerance: 0.1, unit: 'ratio' }],
    consistentInterpretation: 'Cu 2p satellite intensity consistent with expected oxygen content.', inconsistentInterpretation: 'Strong satellite but low oxygen → surface oxidation differs from bulk.', partialInterpretation: 'Mixed Cu valence suggests oxygen-deficient composition.' },
  { ruleId: 'CV-SC-003', ruleName: 'Raman O(4) Mode ↔ Oxygen Content', techniques: ['Raman', 'XRD'], weight: 0.80, materialSystem: 'YBCO',
    physicalBasis: 'O(4) chain oxygen Raman mode shifts from ~500 cm⁻¹ (δ≈0) to ~470 cm⁻¹ (δ≈0.5). XRD c-parameter also tracks oxygen: c = 11.68 + 0.1δ Å.',
    conditions: [{ parameter: 'oxygenContent', primaryTechnique: 'Raman', secondaryTechnique: 'XRD', tolerance: 0.1, unit: 'δ' }],
    consistentInterpretation: 'Raman O(4) frequency and XRD c-parameter agree on oxygen content.', inconsistentInterpretation: 'Raman and XRD disagree → surface vs bulk oxygen gradient.', partialInterpretation: 'Oxygen ordering detected (ortho-II vs ortho-I).' },
];

// ============================================================================
// Recommendations
// ============================================================================
const SC_RECS: RecommendationEntry[] = [
  { trigger: 'missing_technique:Raman', recommendation: 'Perform Raman spectroscopy to determine O(4) chain oxygen mode position and estimate δ.', priority: 'critical', techniques: ['Raman'], expectedOutcome: 'O(4) mode at 470–500 cm⁻¹; diagnostic A_g modes at 118, 150, 340 cm⁻¹.', rationale: 'Raman O(4) frequency is the most sensitive non-destructive probe of oxygen content in YBCO.' },
  { trigger: 'contradiction:phase', recommendation: 'Perform susceptibility measurement to confirm superconducting transition temperature.', priority: 'critical', techniques: ['XRD', 'Raman'], expectedOutcome: 'Sharp diamagnetic transition at Tc ≈ 90K for δ≈0, or ~60K for δ≈0.3.', rationale: 'Transport/susceptibility measurement directly confirms superconductivity, resolving phase ambiguity.' },
];

// ============================================================================
// Oxygen content calculation from XRD
// ============================================================================
/**
 * Calculate YBCO oxygen content δ from orthorhombic splitting.
 * Δ(2θ) = 2θ(013) - 2θ(103) for Cu Kα radiation.
 * Empirical relation: δ ≈ 7 - 12.8·Δ(2θ) (approximate)
 */
function calculateOxygenContent(deltaTwoTheta: number): number {
  // Empirical: large splitting → more oxygen → smaller δ
  return Math.max(0, Math.min(1, 7 - 12.8 * Math.abs(deltaTwoTheta)));
}

/**
 * Estimate Tc from oxygen content δ.
 * Empirical relationship from Cava et al. (1987):
 * Tc ≈ 93 K for δ ≈ 0; Tc ≈ 60 K for δ ≈ 0.3; Tc = 0 for δ > 0.6
 */
function estimateTc(delta: number): number {
  if (delta <= 0.05) return 93;
  if (delta <= 0.15) return 93 - 100 * delta;
  if (delta <= 0.35) return 60 - 100 * (delta - 0.15);
  if (delta <= 0.6) return 0;
  return 0;
}

// ============================================================================
// Inference Functions
// ============================================================================
function inferScXrdPhases(xrdNodes: Array<{ peaks?: Array<{ twoTheta: number; intensity: number }> }>): PhaseInferenceResult {
  const phases: PhaseInferenceResult['phases'] = [];
  for (const [name, ref] of [['YBCO Ortho-II', YBCO_XRD_PEAKS] as const]) {
    let matched = 0, total = 0; const matchedPeaks: string[] = [];
    for (const rp of ref) { total += rp.relativeIntensity; for (const node of xrdNodes) { for (const op of node.peaks ?? []) { if (Math.abs(op.twoTheta - rp.twoTheta) <= 0.5) { matched += rp.relativeIntensity; if (!matchedPeaks.includes(rp.hkl)) matchedPeaks.push(rp.hkl); } } } }
    phases.push({ phaseName: name, matchScore: total > 0 ? matched / total : 0, matchedPeaks });
  }
  // Check for orthorhombic splitting (103)/(013)
  for (const node of xrdNodes) {
    const peaks = node.peaks ?? [];
    const p103 = peaks.find((p) => Math.abs(p.twoTheta - 32.5) < 0.3);
    const p013 = peaks.find((p) => Math.abs(p.twoTheta - 32.85) < 0.3);
    if (p103 && p013) {
      const delta = Math.abs(p013.twoTheta - p103.twoTheta);
      if (delta < 0.15) phases.push({ phaseName: 'YBCO Tetragonal (δ>0.6)', matchScore: 0.6, matchedPeaks: ['103/013 merged'] });
      else phases.push({ phaseName: 'YBCO Orthorhombic (δ<0.5)', matchScore: 0.7 + delta, matchedPeaks: ['103', '013 split'] });
    }
  }
  phases.sort((a, b) => b.matchScore - a.matchScore);
  return { phases, dominantPhase: phases[0]?.phaseName ?? 'unknown', confidence: phases[0]?.matchScore ?? 0, isMixed: phases.length > 1 && (phases[1]?.matchScore ?? 0) > 0.2 };
}

function inferScRamanPhases(ramanNodes: Array<{ peaks?: Array<{ position: number; intensity: number }> }>): PhaseInferenceResult {
  const phases: PhaseInferenceResult['phases'] = [];
  for (const [name, ref] of [['YBCO', YBCO_RAMAN_MODES] as const]) {
    let matched = 0, total = 0; const matchedPeaks: string[] = [];
    for (const rm of ref) { total += rm.relativeIntensity; for (const node of ramanNodes) { for (const op of node.peaks ?? []) { if (Math.abs(op.position - rm.shift) <= 20) { matched += rm.relativeIntensity; matchedPeaks.push(rm.description ?? `${rm.shift}`); } } } }
    phases.push({ phaseName: name, matchScore: total > 0 ? matched / total : 0, matchedPeaks });
  }
  // Check O(4) position for oxygen content
  for (const node of ramanNodes) {
    const o4 = node.peaks?.find((p) => p.position >= 460 && p.position <= 520);
    if (o4) {
      const delta = o4.position < 480 ? 0.5 : o4.position < 495 ? 0.2 : 0.0;
      const tc = estimateTc(delta);
      phases.push({ phaseName: `YBCO δ≈${delta.toFixed(1)} (Tc≈${tc}K)`, matchScore: 0.8, matchedPeaks: [`O(4) at ${o4.position} cm⁻¹`] });
    }
  }
  phases.sort((a, b) => b.matchScore - a.matchScore);
  return { phases, dominantPhase: phases[0]?.phaseName ?? 'unknown', confidence: phases[0]?.matchScore ?? 0, isMixed: phases.length > 1 };
}

function inferScXpsOxidationState(xpsNodes: Array<{ peaks?: Array<{ bindingEnergy: number; orbital?: string }> }>): OxidationStateResult {
  const states: OxidationStateResult['states'] = [];
  const refs = [
    { state: 'Cu¹⁺ (chain)', be: 933.5 }, { state: 'Cu²⁺ (chain)', be: 933.8 },
    { state: 'Cu²⁺/Cu³⁺ (plane)', be: 934.5 }, { state: 'Ba²⁺', be: 778.5 },
    { state: 'Y³⁺', be: 156.8 },
  ];
  for (const r of refs) { for (const node of xpsNodes) { for (const op of node.peaks ?? []) { if (Math.abs(op.bindingEnergy - r.be) <= 1.0) { states.push({ oxidationState: r.state, bindingEnergy: op.bindingEnergy, matchScore: 1 - Math.abs(op.bindingEnergy - r.be) / 1.0 }); } } } }
  states.sort((a, b) => b.matchScore - a.matchScore);
  const dominant = states[0] ?? { oxidationState: 'unknown', bindingEnergy: 0, matchScore: 0 };
  return { states, dominantState: dominant.oxidationState, confidence: dominant.matchScore, isMixed: states.length > 1 };
}

// ============================================================================
// Export
// ============================================================================
export const superconductorRuleSet: MaterialRuleSet = {
  materialId: 'superconductor', materialName: 'Superconductor (YBCO)', materialClass: 'superconductor',
  formula: 'YBa₂Cu₃O₇₋ₓ', aliases: ['YBCO', 'YBa2Cu3O7', 'Y-123', 'yttrium barium copper oxide', 'superconductor', 'HTS'],
  phases: [makeYbcoOrthoIIPhaseRef(), makeYbcoTetPhaseRef()],
  crossValidationRules: SC_CV_RULES, recommendations: SC_RECS,
  inferXrdPhases: inferScXrdPhases, inferRamanPhases: inferScRamanPhases, inferXpsOxidationState: inferScXpsOxidationState,
  version: '1.0.0', lastUpdated: '2026-05-28T00:00:00Z', notes: 'YBCO high-temperature superconductor. Orthorhombic splitting and Raman O(4) mode track oxygen content δ. Tc derived from δ via empirical Cava relation.',
};