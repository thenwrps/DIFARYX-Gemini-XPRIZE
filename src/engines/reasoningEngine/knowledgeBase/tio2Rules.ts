/**
 * ============================================================================
 * DIFARYX — Universal Knowledge Base: TiO₂ Rule Set
 * ============================================================================
 *
 * Titanium dioxide (TiO₂) is the archetypal wide-bandgap oxide semiconductor
 * and the primary proof-of-concept material for the DIFARYX reasoning engine.
 * This module implements the complete MaterialRuleSet for TiO₂, encoding
 * decades of published crystallographic, spectroscopic, and electronic
 * structure reference data.
 *
 * ============================================================================
 * CRYSTALLOGRAPHY — TiO₂ POLYMORPHS
 * ============================================================================
 *
 * TiO₂ exists in three major polymorphs, of which two are dominant:
 *
 * 1. ANATASE (I4₁/amd, #141, tetragonal)
 *    - Lattice: a = 3.785 Å, c = 9.514 Å
 *    - Band gap: E_g = 3.2 eV (indirect, allowed)
 *    - Ti coordination: distorted octahedral (D₂d local symmetry)
 *    - Unit cell: 4 TiO₂ formula units
 *    - Thermodynamically metastable; transforms to rutile at 600–900°C
 *    - Preferred phase for photocatalysis (higher surface energy, more reactive)
 *
 * 2. RUTILE (P4₂/mnm, #136, tetragonal)
 *    - Lattice: a = 4.593 Å, c = 2.959 Å
 *    - Band gap: E_g = 3.0 eV (direct, forbidden)
 *    - Ti coordination: slightly distorted octahedral (D₂h local symmetry)
 *    - Unit cell: 2 TiO₂ formula units
 *    - Thermodynamically stable bulk phase
 *    - Higher refractive index (n ≈ 2.61) → preferred for optical coatings
 *
 * 3. BROOKITE (Pbca, #61, orthorhombic)
 *    - Lattice: a = 9.184 Å, b = 5.447 Å, c = 5.145 Å
 *    - Band gap: E_g ≈ 3.3 eV
 *    - Rarely encountered in thin films or nanoparticles
 *    - Not included in this rule set (can be added later)
 *
 * ============================================================================
 * XRD PHASE IDENTIFICATION PHYSICS
 * ============================================================================
 *
 * Bragg's Law: nλ = 2d·sin(θ)
 * For Cu Kα radiation: λ = 1.5406 Å
 *
 * Anatase tetragonal d-spacing:
 *   1/d² = (h² + k²)/a² + l²/c²
 *   where a = 3.785 Å, c = 9.514 Å
 *
 * Rutile tetragonal d-spacing:
 *   1/d² = (h² + k²)/a² + l²/c²
 *   where a = 4.593 Å, c = 2.959 Å
 *
 * Structure factor for anatase (I4₁/amd):
 *   F(hkl) = f_Ti·T_Ti + f_O·T_O
 *   where T = lattice translation factor incorporating the 4₁ screw axis
 *
 * Key diagnostic reflections:
 *   Anatase (101) at 25.28° → d = 3.52 Å (I/I₀ = 100)
 *   Rutile (110) at 27.45° → d = 3.25 Å (I/I₀ = 100)
 *
 * ============================================================================
 * RAMAN SPECTROSCOPY PHYSICS
 * ============================================================================
 *
 * Group theory analysis for TiO₂ Raman modes:
 *
 * Anatase (I4₁/amd, D₄ₕ point group):
 *   Γ = 1A₁g + 1A₂u + 2B₁g + 1B₂u + 3Eg + 2Eu
 *   Raman-active: A₁g + 2B₁g + 3Eg = 6 modes
 *   IR-active: A₂u + 2Eu = 3 modes
 *   Silent: B₂u (1 mode)
 *
 *   Primary diagnostic: Eg(1) at 144 cm⁻¹ (very strong)
 *   Secondary diagnostics: B₁g(1) at 399 cm⁻¹, Eg(3) at 639 cm⁻¹
 *
 * Rutile (P4₂/mnm, D₄ₕ point group):
 *   Γ = 1A₁g + 1A₂g + 1B₁g + 1B₂g + 1Eg + 2A₂u + 2B₁u + 1B₂u + 3Eu
 *   Raman-active: A₁g + B₁g + B₂g + Eg = 4 modes
 *   IR-active: A₂u + Eu = 3 modes (+ 1 B₁u silent)
 *
 *   Primary diagnostic: A₁g at 612 cm⁻¹ (strong)
 *   Secondary diagnostics: Eg at 447 cm⁻¹ (strong)
 *
 * CRITICAL OVERLAP: Anatase Eg(1) at 144 cm⁻¹ ≈ Rutile B₁g at 143 cm⁻¹
 * → Requires secondary mode analysis for unambiguous phase ID
 *
 * Nano-confinement effects (Richter-Wang-Ley model):
 *   For crystallite size D < 10 nm, LO-phonon confinement causes:
 *   - Asymmetric broadening toward lower frequencies
 *   - Peak shift: Δω ≈ -C(a/D)^1.5 (C ≈ 50 cm⁻¹·nm for anatase)
 *   - This correlates with Scherrer size from XRD peak broadening
 *
 * ============================================================================
 * XPS CORE-LEVEL PHYSICS
 * ============================================================================
 *
 * Ti 2p spin-orbit doublet:
 *   Ti 2p₃/₂ (j = 3/2) and Ti 2p₁/₂ (j = 1/2)
 *   Intensity ratio: I(2p₃/₂)/I(2p₁/₂) = 2:1
 *   Spin-orbit splitting: ΔE_SO ≈ 5.7 eV for Ti⁴⁺
 *
 * Chemical state assignments:
 *   Ti⁴⁺ (TiO₂): Ti 2p₃/₂ at 458.5 ± 0.5 eV
 *   Ti³⁺ (Ti₂O₃): Ti 2p₃/₂ at 456.8 ± 0.5 eV (shift of -1.7 eV)
 *   Ti²⁺ (TiO): Ti 2p₃/₂ at 454.5 ± 0.5 eV (shift of -4.0 eV)
 *
 * Chemical shift mechanism:
 *   ΔBE = k·Δq + ΔV_Madelung
 *   Higher oxidation state → greater effective nuclear charge → higher BE
 *
 * O 1s components:
 *   Lattice O²⁻: 529.7 eV (bulk oxide)
 *   Surface OH⁻: 531.2 eV (hydroxyl groups)
 *   Adsorbed H₂O: 533.0 eV (physisorbed water)
 *
 * Multiplet effects:
 *   Ti³⁺ (d¹) shows characteristic shake-up satellites at +1.5 eV
 *   from main peak, due to ligand-to-metal charge transfer (LMCT)
 *
 * ============================================================================
 * FTIR VIBRATIONAL PHYSICS
 * ============================================================================
 *
 * Anatase IR-active modes (factor group analysis):
 *   Γ_IR = 2A₂u + 2Eu
 *   Ti-O stretching: 400–500 cm⁻¹ region
 *   Ti-O-Ti bridging: 520–620 cm⁻¹ region
 *   Asymmetric stretch: 750–900 cm⁻¹ region
 *
 * Rutile IR-active modes:
 *   Γ_IR = A₂u + B₁u + Eu
 *   Ti-O stretching: 380–480 cm⁻¹ region
 *   Ti-O-Ti stretching: 490–580 cm⁻¹ region
 *
 * Surface species:
 *   ν(O-H) stretching: 3100–3600 cm⁻¹ (broad, hydrogen-bonded)
 *   δ(H-O-H) bending: 1590–1660 cm⁻¹ (adsorbed water)
 *   ν(C=O) carbonate: 1380–1450 cm⁻¹ (contamination)
 *
 * Mutual exclusion principle:
 *   Anatase has inversion symmetry (I4₁/amd has inversion at origin)
 *   → Raman and IR modes are mutually exclusive (no common frequencies)
 *   → This is a powerful cross-validation tool
 *
 * ============================================================================
 * CROSS-VALIDATION PHYSICS
 * ============================================================================
 *
 * CV-001: XRD Phase ↔ Raman Modes
 *   Physical basis: Both techniques probe long-range order but via different
 *   scattering mechanisms. XRD: elastic X-ray scattering (Bragg condition).
 *   Raman: inelastic light scattering (phonon creation/annihilation).
 *   Consistency: Same space group → same crystal symmetry → correlated modes.
 *
 * CV-002: XRD Phase ↔ XPS Oxidation State
 *   Physical basis: Crystallographic phase determines Ti coordination and
 *   formal oxidation state. XPS directly measures core-level binding energy,
 *   which is oxidation-state-sensitive. Anatase/rutile both have Ti⁴⁺.
 *
 * CV-003: XRD Crystallite Size ↔ Raman Broadening
 *   Physical basis: Scherrer equation: D = Kλ/(β·cosθ)
 *   Both techniques sense the same crystallite size distribution:
 *   XRD → coherent domain size; Raman → phonon correlation length
 *
 * CV-005: Raman Phase Ratio ↔ XRD Phase Fraction
 *   Physical basis: Spurr-Myers equation for anatase weight fraction:
 *   W_A = 1 / (1 + 0.8·I_R(447)/I_A(144))
 *   where I_R and I_A are Raman integrated intensities
 *   Independent XRD quantification via Rietveld refinement
 *
 * ============================================================================
 * @module reasoningEngine/knowledgeBase/tio2Rules
 * ============================================================================
 */

import type { Technique } from '../../../types/universalTechnique';
import type { MaterialSystem, CrystalPhase, TechniquePair } from '../types';
import type {
  MaterialRuleSet,
  PhaseReference,
  XrdPeakReference,
  XrdPhaseReference,
  RamanModeReference,
  RamanPhaseReference,
  XpsPeakReference,
  XpsMaterialReference,
  FtirBandReference,
  FtirMaterialReference,
  CrossValidationRuleDefinition,
  RecommendationEntry,
  PhaseInferenceResult,
  OxidationStateResult,
} from './baseTypes';

// ============================================================================
// LEGACY TYPES — Preserved for backward compatibility with existing consumers
// ============================================================================

/**
 * Legacy XRD peak reference (matches original knowledgeBase.ts interface).
 * Kept to avoid breaking existing crossValidation.ts consumers.
 */
export interface LegacyXrdPeakReference {
  hkl: string;
  twoTheta: number;
  tolerance: number;
  relativeIntensity: number;
  dSpacing: number;
}

/**
 * Legacy XRD phase reference.
 */
export interface LegacyXrdPhaseReference {
  phase: CrystalPhase;
  peaks: readonly LegacyXrdPeakReference[];
  spaceGroupNumber: number;
}

/**
 * Legacy Raman mode reference.
 */
export interface LegacyRamanModeReference {
  mode: string;
  wavenumber: number;
  tolerance: number;
  intensity: 'very_strong' | 'strong' | 'medium' | 'weak';
  firstOrder: boolean;
}

/**
 * Legacy Raman phase reference.
 */
export interface LegacyRamanPhaseReference {
  phaseName: string;
  modes: readonly LegacyRamanModeReference[];
  symmetryLabel: string;
  totalModes: number;
}

/**
 * Legacy XPS peak reference.
 */
export interface LegacyXpsPeakReference {
  orbital: string;
  bindingEnergy: number;
  tolerance: number;
  chemicalState: string;
  spinOrbitPartner?: string;
  spinOrbitSplitting?: number;
}

/**
 * Legacy XPS material reference.
 */
export interface LegacyXpsMaterialReference {
  material: string;
  oxidationState: string;
  peaks: readonly LegacyXpsPeakReference[];
}

/**
 * Legacy FTIR band reference.
 */
export interface LegacyFtirBandReference {
  vibrationalMode: string;
  wavenumberCenter: number;
  wavenumberRange: readonly [number, number];
  bandType: 'sharp' | 'broad' | 'shoulder';
  intensity: 'strong' | 'medium' | 'weak';
  functionalGroup: string;
}

/**
 * Legacy FTIR material reference.
 */
export interface LegacyFtirMaterialReference {
  material: string;
  phase?: string;
  bands: readonly LegacyFtirBandReference[];
}

/**
 * Legacy cross-validation rule.
 */
export interface LegacyCrossValidationRule {
  id: string;
  name: string;
  techniques: TechniquePair;
  applicableMaterials: MaterialSystem[];
  weight: number;
  description: string;
}

// ============================================================================
// TiO₂ ANATASE — Crystallographic Phase Definition
// ============================================================================

/**
 * Anatase crystal phase identity.
 * Space group: I4₁/amd (#141), tetragonal
 * Lattice parameters: a = 3.785 Å, c = 9.514 Å
 * Ti at Wyckoff 4a (0, 3/4, 1/8), O at Wyckoff 8e (0, 1/4, u) with u ≈ 0.208
 */
export const ANATASE_PHASE: CrystalPhase = {
  name: 'anatase',
  spaceGroup: 'I41/amd',
  crystalSystem: 'tetragonal',
};

/**
 * Anatase XRD reference pattern.
 * All 2θ values calculated for Cu Kα (λ = 1.5406 Å) using:
 *   2θ = 2·arcsin(λ/(2d))
 *   d₁₀₁ = 1/√(1/a² + 1/c²) = 1/√(1/3.785² + 1/9.514²) = 3.52 Å → 2θ = 25.28°
 */
export const ANATASE_XRD: LegacyXrdPhaseReference = {
  phase: ANATASE_PHASE,
  spaceGroupNumber: 141,
  peaks: [
    { hkl: '101', twoTheta: 25.28, tolerance: 0.15, relativeIntensity: 100, dSpacing: 3.52 },
    { hkl: '103', twoTheta: 36.95, tolerance: 0.15, relativeIntensity: 10, dSpacing: 2.43 },
    { hkl: '004', twoTheta: 37.80, tolerance: 0.15, relativeIntensity: 20, dSpacing: 2.38 },
    { hkl: '112', twoTheta: 38.57, tolerance: 0.15, relativeIntensity: 10, dSpacing: 2.33 },
    { hkl: '200', twoTheta: 48.05, tolerance: 0.15, relativeIntensity: 35, dSpacing: 1.89 },
    { hkl: '105', twoTheta: 53.89, tolerance: 0.15, relativeIntensity: 20, dSpacing: 1.70 },
    { hkl: '211', twoTheta: 55.06, tolerance: 0.15, relativeIntensity: 20, dSpacing: 1.67 },
    { hkl: '204', twoTheta: 62.69, tolerance: 0.15, relativeIntensity: 14, dSpacing: 1.48 },
    { hkl: '116', twoTheta: 68.76, tolerance: 0.15, relativeIntensity: 6, dSpacing: 1.36 },
    { hkl: '220', twoTheta: 70.31, tolerance: 0.15, relativeIntensity: 6, dSpacing: 1.34 },
    { hkl: '215', twoTheta: 75.03, tolerance: 0.15, relativeIntensity: 10, dSpacing: 1.27 },
  ],
} as const;

// ============================================================================
// TiO₂ ANATASE — Raman Vibrational Fingerprint
// ============================================================================

/**
 * Anatase Raman reference data.
 * Factor group analysis for I4₁/amd (D₄ₕ):
 *   Γ_Raman = A₁g + 2B₁g + 3Eg = 6 modes
 * All 6 modes are first-order Raman active.
 * The Eg(1) mode at 144 cm⁻¹ is the strongest and most diagnostic.
 */
export const ANATASE_RAMAN: LegacyRamanPhaseReference = {
  phaseName: 'anatase',
  symmetryLabel: 'D4h (I41/amd)',
  totalModes: 6,
  modes: [
    { mode: 'Eg(1)', wavenumber: 144, tolerance: 5, intensity: 'very_strong', firstOrder: true },
    { mode: 'Eg(2)', wavenumber: 197, tolerance: 5, intensity: 'weak', firstOrder: true },
    { mode: 'B1g(1)', wavenumber: 399, tolerance: 8, intensity: 'medium', firstOrder: true },
    { mode: 'A1g', wavenumber: 513, tolerance: 8, intensity: 'medium', firstOrder: true },
    { mode: 'B1g(2)', wavenumber: 519, tolerance: 8, intensity: 'weak', firstOrder: true },
    { mode: 'Eg(3)', wavenumber: 639, tolerance: 8, intensity: 'strong', firstOrder: true },
  ],
} as const;

// ============================================================================
// TiO₂ RUTILE — Crystallographic Phase Definition
// ============================================================================

/**
 * Rutile crystal phase identity.
 * Space group: P4₂/mnm (#136), tetragonal
 * Lattice parameters: a = 4.593 Å, c = 2.959 Å
 * Ti at Wyckoff 2a (0, 0, 0), O at Wyckoff 4f (u, u, 0) with u ≈ 0.305
 */
export const RUTILE_PHASE: CrystalPhase = {
  name: 'rutile',
  spaceGroup: 'P42/mnm',
  crystalSystem: 'tetragonal',
};

/**
 * Rutile XRD reference pattern.
 * The (110) reflection at 27.45° is the strongest and most diagnostic:
 *   d₁₁₀ = 1/√(1/a² + 1/a²) = a/√2 = 4.593/√2 = 3.25 Å → 2θ = 27.45°
 */
export const RUTILE_XRD: LegacyXrdPhaseReference = {
  phase: RUTILE_PHASE,
  spaceGroupNumber: 136,
  peaks: [
    { hkl: '110', twoTheta: 27.45, tolerance: 0.15, relativeIntensity: 100, dSpacing: 3.25 },
    { hkl: '101', twoTheta: 36.09, tolerance: 0.15, relativeIntensity: 50, dSpacing: 2.49 },
    { hkl: '200', twoTheta: 39.19, tolerance: 0.15, relativeIntensity: 8, dSpacing: 2.30 },
    { hkl: '111', twoTheta: 41.23, tolerance: 0.15, relativeIntensity: 25, dSpacing: 2.19 },
    { hkl: '210', twoTheta: 44.05, tolerance: 0.15, relativeIntensity: 10, dSpacing: 2.05 },
    { hkl: '211', twoTheta: 54.32, tolerance: 0.15, relativeIntensity: 60, dSpacing: 1.69 },
    { hkl: '220', twoTheta: 56.64, tolerance: 0.15, relativeIntensity: 20, dSpacing: 1.62 },
    { hkl: '002', twoTheta: 62.75, tolerance: 0.15, relativeIntensity: 8, dSpacing: 1.48 },
    { hkl: '310', twoTheta: 64.04, tolerance: 0.15, relativeIntensity: 15, dSpacing: 1.45 },
    { hkl: '301', twoTheta: 69.01, tolerance: 0.15, relativeIntensity: 10, dSpacing: 1.36 },
    { hkl: '112', twoTheta: 69.79, tolerance: 0.15, relativeIntensity: 8, dSpacing: 1.35 },
  ],
} as const;

// ============================================================================
// TiO₂ RUTILE — Raman Vibrational Fingerprint
// ============================================================================

/**
 * Rutile Raman reference data.
 * Factor group analysis for P4₂/mnm (D₄ₕ):
 *   Γ_Raman = A₁g + B₁g + B₂g + Eg = 4 modes
 * The A₁g mode at 612 cm⁻¹ and Eg at 447 cm⁻¹ are the strongest.
 * Note: Rutile has fewer Raman modes than anatase (4 vs 6) due to its
 * higher symmetry (only 2 TiO₂ per unit cell vs 4 for anatase).
 */
export const RUTILE_RAMAN: LegacyRamanPhaseReference = {
  phaseName: 'rutile',
  symmetryLabel: 'D4h (P42/mnm)',
  totalModes: 4,
  modes: [
    { mode: 'B1g', wavenumber: 143, tolerance: 5, intensity: 'weak', firstOrder: true },
    { mode: 'Eg', wavenumber: 447, tolerance: 8, intensity: 'strong', firstOrder: true },
    { mode: 'A1g', wavenumber: 612, tolerance: 8, intensity: 'strong', firstOrder: true },
    { mode: 'B2g', wavenumber: 825, tolerance: 15, intensity: 'weak', firstOrder: true },
  ],
} as const;

// ============================================================================
// TiO₂ Raman Overlap Zone — Critical Ambiguity Region
// ============================================================================

/**
 * CRITICAL OVERLAP REGION: Anatase Eg(1) at 144 cm⁻¹ ≈ Rutile B₁g at 143 cm⁻¹
 *
 * This 1 cm⁻¹ difference is within typical Raman spectrometer resolution (2–4 cm⁻¹)
 * and peak widths (5–15 cm⁻¹), making single-peak phase discrimination impossible.
 *
 * RESOLUTION STRATEGY:
 * Use secondary modes for unambiguous identification:
 *   Anatase: 399 cm⁻¹ (B₁g), 513 cm⁻¹ (A₁g), 639 cm⁻¹ (Eg)
 *   Rutile: 447 cm⁻¹ (Eg), 612 cm⁻¹ (A₁g), 825 cm⁻¹ (B₂g)
 *
 * Quantitative phase analysis via Spurr-Myers equation:
 *   W_anatase = 1 / (1 + 0.8 · I_R(447)/I_A(144))
 * where I_R and I_A are integrated Raman intensities of the indicated peaks.
 */
export const TIO2_RAMAN_OVERLAP_ZONE = {
  center: 143.5,
  halfWidth: 5,
  anataseMarker: 'Eg(1) at 144 cm⁻¹',
  rutileMarker: 'B1g at 143 cm⁻¹',
  discriminatingModes: {
    anataseSecondary: [399, 513, 639],   // B1g, A1g, Eg(3)
    rutileSecondary: [447, 612, 825],    // Eg, A1g, B2g
  },
} as const;

// ============================================================================
// TiO₂ XPS — Ti⁴⁺ Electronic Structure
// ============================================================================

/**
 * Ti⁴⁺ (TiO₂) XPS reference data.
 *
 * Ti⁴⁺ has the electronic configuration [Ar]3d⁰ — no unpaired d-electrons.
 * This means:
 * - No multiplet splitting in the 2p levels
 * - No shake-up satellites (no d-electron to undergo excitation)
 * - Clean spin-orbit doublet with ΔE_SO = 5.7 eV
 * - The 2p₃/₂/2p₁/₂ intensity ratio follows the (2j+1) statistical ratio: 2:1
 *
 * O 1s shows multiple components reflecting different oxygen environments:
 * - Lattice O²⁻ at 529.7 eV (bulk oxide)
 * - Surface OH⁻ at 531.2 eV (hydroxyl termination)
 * - The hydroxyl component is critical for photocatalytic activity assessment
 */
export const TI4_PLUS_XPS: LegacyXpsMaterialReference = {
  material: 'TiO2',
  oxidationState: 'Ti⁴⁺',
  peaks: [
    {
      orbital: 'Ti 2p3/2',
      bindingEnergy: 458.5,
      tolerance: 0.5,
      chemicalState: 'Ti⁴⁺',
      spinOrbitPartner: 'Ti 2p1/2',
      spinOrbitSplitting: 5.7,
    },
    {
      orbital: 'Ti 2p1/2',
      bindingEnergy: 464.2,
      tolerance: 0.5,
      chemicalState: 'Ti⁴⁺',
    },
    {
      orbital: 'O 1s (lattice)',
      bindingEnergy: 529.7,
      tolerance: 0.4,
      chemicalState: 'O²⁻ (lattice)',
    },
    {
      orbital: 'O 1s (hydroxyl)',
      bindingEnergy: 531.2,
      tolerance: 0.5,
      chemicalState: 'OH⁻ (surface)',
    },
    {
      orbital: 'Ti 3p',
      bindingEnergy: 37.5,
      tolerance: 1.0,
      chemicalState: 'Ti⁴⁺',
    },
  ],
} as const;

/**
 * Ti³⁺ (Ti₂O₃) XPS reference — used for contradiction detection.
 *
 * Ti³⁺ has configuration [Ar]3d¹ — one unpaired d-electron.
 * This produces:
 * - Lower binding energy (456.8 eV vs 458.5 eV for Ti⁴⁺, ΔBE = -1.7 eV)
 *   due to reduced effective nuclear charge on the 2p core electrons
 * - Characteristic shake-up satellite at +1.5 eV from main peak
 *   from ligand-to-metal charge transfer (LMCT: O 2p → Ti 3d)
 * - Slightly different spin-orbit splitting (5.6 eV vs 5.7 eV)
 */
export const TI3_PLUS_XPS: LegacyXpsMaterialReference = {
  material: 'Ti2O3',
  oxidationState: 'Ti³⁺',
  peaks: [
    {
      orbital: 'Ti 2p3/2',
      bindingEnergy: 456.8,
      tolerance: 0.5,
      chemicalState: 'Ti³⁺',
      spinOrbitPartner: 'Ti 2p1/2',
      spinOrbitSplitting: 5.6,
    },
    {
      orbital: 'Ti 2p1/2',
      bindingEnergy: 462.4,
      tolerance: 0.5,
      chemicalState: 'Ti³⁺',
    },
  ],
} as const;

// ============================================================================
// TiO₂ FTIR — Anatase Infrared Absorption
// ============================================================================

/**
 * Anatase FTIR reference data.
 *
 * IR-active modes for I4₁/amd (D₄ₕ):
 *   Γ_IR = 2A₂u + 2Eu = 4 modes
 *
 * The Ti-O stretching region (400–600 cm⁻¹) is diagnostic for phase ID.
 * Surface hydroxyl bands (3100–3600 cm⁻¹) indicate surface reactivity.
 * Water bending mode (1590–1660 cm⁻¹) indicates adsorbed moisture.
 *
 * Mutual exclusion with Raman: Since anatase has inversion symmetry,
 * NO mode appears in both Raman and IR spectra. This is a powerful
 * cross-validation check (CV-004, CV-006, CV-011).
 */
export const ANATASE_FTIR: LegacyFtirMaterialReference = {
  material: 'TiO2',
  phase: 'anatase',
  bands: [
    {
      vibrationalMode: 'Ti-O stretching',
      wavenumberCenter: 450,
      wavenumberRange: [400, 500],
      bandType: 'broad',
      intensity: 'strong',
      functionalGroup: 'Ti-O (lattice)',
    },
    {
      vibrationalMode: 'Ti-O-Ti bridging',
      wavenumberCenter: 560,
      wavenumberRange: [520, 620],
      bandType: 'broad',
      intensity: 'strong',
      functionalGroup: 'Ti-O-Ti',
    },
    {
      vibrationalMode: 'Ti-O-Ti asymmetric stretch',
      wavenumberCenter: 820,
      wavenumberRange: [750, 900],
      bandType: 'broad',
      intensity: 'medium',
      functionalGroup: 'Ti-O-Ti',
    },
    {
      vibrationalMode: 'O-H stretching (surface)',
      wavenumberCenter: 3400,
      wavenumberRange: [3100, 3600],
      bandType: 'broad',
      intensity: 'medium',
      functionalGroup: 'hydroxyl',
    },
    {
      vibrationalMode: 'H-O-H bending (adsorbed water)',
      wavenumberCenter: 1630,
      wavenumberRange: [1590, 1660],
      bandType: 'broad',
      intensity: 'weak',
      functionalGroup: 'water',
    },
  ],
} as const;

// ============================================================================
// TiO₂ FTIR — Rutile Infrared Absorption
// ============================================================================

/**
 * Rutile FTIR reference data.
 *
 * IR-active modes for P4₂/mnm (D₄ₕ):
 *   Γ_IR = A₂u + 2Eu = 3 modes (+ 1 B₁u silent)
 *
 * Rutile has fewer IR-active modes than anatase, reflecting its higher
 * symmetry and smaller unit cell (2 vs 4 formula units).
 *
 * Key difference from anatase: Rutile Ti-O stretching band at 430 cm⁻¹
 * is shifted to lower wavenumber compared to anatase (450 cm⁻¹),
 * reflecting the different Ti-O bond strengths in the two phases.
 */
export const RUTILE_FTIR: LegacyFtirMaterialReference = {
  material: 'TiO2',
  phase: 'rutile',
  bands: [
    {
      vibrationalMode: 'Ti-O stretching',
      wavenumberCenter: 430,
      wavenumberRange: [380, 480],
      bandType: 'broad',
      intensity: 'strong',
      functionalGroup: 'Ti-O (lattice)',
    },
    {
      vibrationalMode: 'Ti-O-Ti stretching',
      wavenumberCenter: 530,
      wavenumberRange: [490, 580],
      bandType: 'broad',
      intensity: 'strong',
      functionalGroup: 'Ti-O-Ti',
    },
    {
      vibrationalMode: 'O-H stretching (surface)',
      wavenumberCenter: 3400,
      wavenumberRange: [3100, 3600],
      bandType: 'broad',
      intensity: 'medium',
      functionalGroup: 'hydroxyl',
    },
  ],
} as const;

// ============================================================================
// TiO₂ Cross-Validation Rules (Legacy Format)
// ============================================================================

/**
 * Cross-validation rules for TiO₂ phase identification and consistency.
 * Each rule encodes a specific physical relationship between two techniques.
 *
 * PHYSICAL BASIS FOR EACH RULE:
 *
 * CV-001: XRD identifies crystal structure via Bragg diffraction; Raman probes
 *   phonon modes determined by the same crystal symmetry. Consistency requires
 *   that the space group inferred from both techniques matches.
 *
 * CV-002: XRD phase assignment implies Ti⁴⁺ coordination environment; XPS
 *   directly measures Ti 2p binding energy which is oxidation-state-sensitive.
 *   Both anatase and rutile should show Ti⁴⁺ (not Ti³⁺).
 *
 * CV-003: Scherrer equation D = Kλ/(β·cosθ) gives crystallite size from XRD.
 *   Raman phonon confinement broadening follows Δω ∝ (a/D)^1.5.
 *   Both sense the same crystallite population.
 *
 * CV-004: XPS O 1s lattice oxygen (529.7 eV) corresponds to Ti-O bonding.
 *   FTIR Ti-O stretching (400–600 cm⁻¹) probes the same bonds via vibrations.
 *
 * CV-005: Quantitative phase fraction: Raman intensity ratios and XRD peak
 *   areas both give phase fractions (Spurr-Myers for Raman, Rietveld for XRD).
 *
 * CV-006: FTIR surface OH bands ↔ XPS O 1s hydroxyl component. Both sense
 *   the same surface hydroxyl population but via different physics.
 *
 * CV-007: Amorphous content shows as broad XRD background AND broad Raman bands.
 *
 * CV-008: Internal XPS consistency check: Ti 2p spin-orbit splitting must be
 *   5.7 ± 0.3 eV for Ti⁴⁺. Deviation indicates mixed states or charging.
 *
 * CV-009: Carbonate contamination detected by FTIR (1380, 1630 cm⁻¹) should
 *   correlate with XPS C 1s carbonate component at 289.0 eV.
 *
 * CV-010: Crystallinity: sharp XRD peaks ↔ narrow Raman modes. Both reflect
 *   long-range order quality.
 *
 * CV-011: Multi-phase: XRD anatase+rutile mixture ↔ FTIR showing bands from
 *   both phases at their characteristic positions.
 *
 * CV-012: Oxidation state: XPS Ti⁴⁺ (458.5 eV) ↔ Raman showing TiO₂ modes
 *   (no Ti₂O₃ A₂u mode at 243 cm⁻¹ which would indicate Ti³⁺).
 */
export const CROSS_VALIDATION_RULES: readonly LegacyCrossValidationRule[] = [
  {
    id: 'CV-001',
    name: 'XRD Phase ↔ Raman Active Modes',
    techniques: ['XRD', 'Raman'],
    applicableMaterials: ['TiO2', 'generic'],
    weight: 1.0,
    description: 'Verifies that the crystal phase identified by XRD matches the Raman-active phonon modes. Anatase I41/amd → 6 modes (Eg 144 cm⁻¹ primary); Rutile P42/mnm → 4 modes (A1g 612 cm⁻¹ primary).',
  },
  {
    id: 'CV-002',
    name: 'XRD Phase ↔ XPS Ti⁴⁺ Binding Energy',
    techniques: ['XRD', 'XPS'],
    applicableMaterials: ['TiO2', 'generic'],
    weight: 0.95,
    description: 'Confirms that the oxidation state from XPS (Ti 2p3/2 at 458.5 eV for Ti⁴⁺) is consistent with the crystallographic phase identified by XRD. Both anatase and rutile should show Ti⁴⁺.',
  },
  {
    id: 'CV-003',
    name: 'XRD Crystallite Size ↔ Raman Peak Broadening',
    techniques: ['XRD', 'Raman'],
    applicableMaterials: ['TiO2', 'generic'],
    weight: 0.7,
    description: 'Checks that Scherrer crystallite size from XRD peak broadening is consistent with Raman phonon confinement broadening. Nanoparticles <10 nm show asymmetric Raman peak broadening.',
  },
  {
    id: 'CV-004',
    name: 'XPS O 1s ↔ FTIR Ti-O Bands',
    techniques: ['XPS', 'FTIR'],
    applicableMaterials: ['TiO2', 'generic'],
    weight: 0.8,
    description: 'Verifies oxygen bonding consistency between XPS O 1s lattice oxygen at 529.7 eV and FTIR Ti-O stretching bands at 400–600 cm⁻¹.',
  },
  {
    id: 'CV-005',
    name: 'Raman Mode Ratio ↔ XRD Phase Fraction',
    techniques: ['Raman', 'XRD'],
    applicableMaterials: ['TiO2', 'generic'],
    weight: 0.85,
    description: 'Quantitative phase agreement: Raman intensity ratios of anatase Eg(144)/rutile Eg(447) should correlate with XRD-derived anatase/rutile phase fraction (Spurr-Myers method).',
  },
  {
    id: 'CV-006',
    name: 'FTIR Surface Species ↔ XPS Surface Oxidation',
    techniques: ['FTIR', 'XPS'],
    applicableMaterials: ['TiO2', 'generic'],
    weight: 0.75,
    description: 'Cross-checks surface chemistry: FTIR surface OH bands (3200–3600 cm⁻¹) should correlate with XPS O 1s hydroxyl component at 531.2 eV.',
  },
  {
    id: 'CV-007',
    name: 'XRD Amorphous Fraction ↔ Raman Disorder Bands',
    techniques: ['XRD', 'Raman'],
    applicableMaterials: ['TiO2', 'generic'],
    weight: 0.65,
    description: 'Amorphous content cross-check: broad XRD background hump should correlate with broad Raman disorder bands. Highly crystalline samples show sharp, well-resolved Raman peaks.',
  },
  {
    id: 'CV-008',
    name: 'XPS Ti 2p Spin-Orbit Splitting Validation',
    techniques: ['XPS', 'XPS'],
    applicableMaterials: ['TiO2', 'generic'],
    weight: 0.9,
    description: 'Internal XPS consistency: Ti 2p3/2 and Ti 2p1/2 separation should be 5.7 ± 0.3 eV for Ti⁴⁺. Deviation indicates mixed oxidation states or charging effects.',
  },
  {
    id: 'CV-009',
    name: 'FTIR Carbonate ↔ XPS C 1s Contamination',
    techniques: ['FTIR', 'XPS'],
    applicableMaterials: ['TiO2', 'generic'],
    weight: 0.5,
    description: 'Contamination cross-check: FTIR carbonate bands (1380, 1630 cm⁻¹) should correlate with XPS C 1s adventitious carbon at 284.8 eV and any carbonate component at 289.0 eV.',
  },
  {
    id: 'CV-010',
    name: 'Raman Crystallinity ↔ XRD Peak Sharpness',
    techniques: ['Raman', 'XRD'],
    applicableMaterials: ['TiO2', 'generic'],
    weight: 0.8,
    description: 'Overall crystallinity agreement: sharp XRD peaks (low FWHM) should correspond to narrow, well-resolved Raman modes. Broad XRD peaks indicate nanocrystallinity and Raman broadening.',
  },
  {
    id: 'CV-011',
    name: 'XRD Phase Mixture ↔ FTIR Band Deconvolution',
    techniques: ['XRD', 'FTIR'],
    applicableMaterials: ['TiO2', 'generic'],
    weight: 0.7,
    description: 'Multi-phase consistency: if XRD identifies anatase+rutile mixture, FTIR should show bands from both phases (anatase 450/560 cm⁻¹ + rutile 430/530 cm⁻¹).',
  },
  {
    id: 'CV-012',
    name: 'Overall Oxidation State Consistency',
    techniques: ['XPS', 'Raman'],
    applicableMaterials: ['TiO2', 'generic'],
    weight: 0.85,
    description: 'Cross-technique oxidation state validation: XPS Ti⁴⁺ assignment (458.5 eV) should be consistent with Raman showing TiO₂ modes (no Ti₂O₃ A2u mode at 243 cm⁻¹).',
  },
] as const;

// ============================================================================
// TiO₂ Gap Recommendation Templates
// ============================================================================

/**
 * Pre-defined next-step recommendations for common TiO₂ gaps.
 * Each recommendation is triggered by a specific gap type and provides
 * the physical rationale for the recommended measurement.
 */
export const TIO2_RECOMMENDATIONS = {
  missingXps: {
    stepType: 'characterization' as const,
    recommendedTechnique: 'XPS' as Technique,
    description: 'Perform XPS Ti 2p analysis to confirm Ti⁴⁺ oxidation state and check for Ti³⁺ reduction.',
    rationale: 'XPS provides direct oxidation state evidence via Ti 2p3/2 binding energy (458.5 eV for Ti⁴⁺). Essential for confirming the electronic state matches the crystallographic phase.',
    expectedConfidenceImpact: 0.25,
  },
  missingFtir: {
    stepType: 'characterization' as const,
    recommendedTechnique: 'FTIR' as Technique,
    description: 'Collect FTIR spectrum in the 400–4000 cm⁻¹ range to identify Ti-O vibrational modes and surface species.',
    rationale: 'FTIR confirms metal-oxygen bonding environment (Ti-O at 400–600 cm⁻¹) and identifies surface hydroxyl groups critical for photocatalytic activity assessment.',
    expectedConfidenceImpact: 0.20,
  },
  missingRaman: {
    stepType: 'characterization' as const,
    recommendedTechnique: 'Raman' as Technique,
    description: 'Perform Raman spectroscopy with 532 nm excitation to fingerprint anatase vs rutile phases.',
    rationale: 'Raman provides unambiguous phase discrimination: anatase Eg at 144 cm⁻¹ vs rutile A1g at 612 cm⁻¹, resolving the overlap region around 143–144 cm⁻¹ with secondary modes.',
    expectedConfidenceImpact: 0.25,
  },
  missingXrd: {
    stepType: 'characterization' as const,
    recommendedTechnique: 'XRD' as Technique,
    description: 'Perform XRD analysis (Cu Kα, 20–80° 2θ) for crystallographic phase identification and crystallite size determination.',
    rationale: 'XRD provides definitive crystal structure identification: anatase (25.28° 101) vs rutile (27.45° 110). Scherrer analysis yields crystallite size from peak broadening.',
    expectedConfidenceImpact: 0.25,
  },
  xrdRamanMismatch: {
    stepType: 'validation' as const,
    recommendedTechnique: 'TEM' as Technique,
    description: 'Collect TEM/SAED images for direct crystallographic phase imaging to resolve XRD/Raman disagreement.',
    rationale: 'TEM-SAED provides real-space and reciprocal-space structural information at the individual particle level, resolving ensemble-averaged XRD/Raman discrepancies from mixed-phase samples.',
    expectedConfidenceImpact: 0.15,
  },
  oxidationStateConflict: {
    stepType: 'validation' as const,
    recommendedTechnique: 'XAS' as Technique,
    description: 'Perform Ti K-edge XANES analysis to independently confirm oxidation state via pre-edge feature shape and edge position.',
    rationale: 'XANES is element-specific and oxidation-state-sensitive. The Ti K-edge pre-edge feature at ~4968 eV shifts with oxidation state, providing independent confirmation of Ti³⁺ vs Ti⁴⁺.',
    expectedConfidenceImpact: 0.20,
  },
  bandGapVerification: {
    stepType: 'exploration' as const,
    recommendedTechnique: 'XPS' as Technique,
    description: 'Perform UV-Vis Diffuse Reflectance Spectroscopy (DRS) for band gap determination (3.2 eV anatase vs 3.0 eV rutile).',
    rationale: 'Band gap energy provides indirect phase identification: anatase Eg = 3.2 eV (direct) vs rutile Eg = 3.0 eV (indirect). Tauc plot analysis from DRS data yields quantitative phase discrimination.',
    expectedConfidenceImpact: 0.10,
  },
  amorphousContent: {
    stepType: 'exploration' as const,
    recommendedTechnique: 'TEM' as Technique,
    description: 'Run pair distribution function (PDF) analysis or high-temperature XRD to quantify amorphous fraction.',
    rationale: 'PDF analysis from total scattering data provides local structure information even in disordered/amorphous phases, enabling quantification of amorphous TiO₂ content.',
    expectedConfidenceImpact: 0.15,
  },
  surfaceChemistryGap: {
    stepType: 'characterization' as const,
    recommendedTechnique: 'FTIR' as Technique,
    description: 'Perform FTIR-ATR analysis for surface species identification and compare with XPS surface composition.',
    rationale: 'Combining FTIR vibrational information with XPS elemental/chemical state data provides a complete picture of surface chemistry including hydroxyl coverage, adsorbed species, and carbonate contamination.',
    expectedConfidenceImpact: 0.10,
  },
} as const;

// ============================================================================
// TiO₂ Utility Functions (Legacy API)
// ============================================================================

/**
 * Get the XRD reference for a TiO₂ phase by name.
 */
export function getTiO2XrdPhase(phaseName: string): LegacyXrdPhaseReference | undefined {
  if (phaseName.toLowerCase() === 'anatase') return ANATASE_XRD;
  if (phaseName.toLowerCase() === 'rutile') return RUTILE_XRD;
  return undefined;
}

/**
 * Get the Raman reference for a TiO₂ phase by name.
 */
export function getTiO2RamanPhase(phaseName: string): LegacyRamanPhaseReference | undefined {
  if (phaseName.toLowerCase() === 'anatase') return ANATASE_RAMAN;
  if (phaseName.toLowerCase() === 'rutile') return RUTILE_RAMAN;
  return undefined;
}

/**
 * Get the FTIR reference for a TiO₂ phase by name.
 */
export function getTiO2FtirPhase(phaseName: string): LegacyFtirMaterialReference | undefined {
  if (phaseName.toLowerCase() === 'anatase') return ANATASE_FTIR;
  if (phaseName.toLowerCase() === 'rutile') return RUTILE_FTIR;
  return undefined;
}

// ============================================================================
// TiO₂ Phase References (New Universal Format)
// ============================================================================

/**
 * Anatase phase reference in the universal PhaseReference format.
 * Converts legacy data to the new baseTypes interfaces for factory consumption.
 */
const ANATASE_PHASE_REF: PhaseReference = {
  phaseName: 'anatase',
  materialId: 'TiO2',
  xrd: {
    phaseName: 'anatase',
    spaceGroup: 'I41/amd',
    crystalSystem: 'tetragonal',
    latticeParameters: { a: 3.785, c: 9.514 },
    peaks: ANATASE_XRD.peaks.map((p) => ({
      hkl: p.hkl,
      twoTheta: p.twoTheta,
      dSpacing: p.dSpacing,
      relativeIntensity: p.relativeIntensity,
      fwhm: 0.15,
    })),
    detectionLimit: 0.02,
  },
  raman: {
    phaseName: 'anatase',
    excitationWavelength: 532,
    modes: ANATASE_RAMAN.modes.map((m) => ({
      shift: m.wavenumber,
      symmetry: m.mode,
      relativeIntensity: m.intensity === 'very_strong' ? 100 : m.intensity === 'strong' ? 80 : m.intensity === 'medium' ? 50 : 20,
      fwhm: 8,
      ramanActive: true,
      irActive: false,
      description: `${m.mode} mode of anatase TiO₂`,
    })),
    overlapZone: { min: 138, max: 149, confusablePhases: ['rutile'] },
  },
  xps: {
    materialName: 'TiO₂ (anatase)',
    xraySource: 'Al_Kalpha',
    peaks: TI4_PLUS_XPS.peaks.map((p) => ({
      orbital: p.orbital,
      bindingEnergy: p.bindingEnergy,
      fwhm: 1.2,
      oxidationState: p.chemicalState,
      chemicalContext: p.chemicalState,
      spinOrbitSplitting: p.spinOrbitSplitting,
    })),
  },
  ftir: {
    materialName: 'TiO₂ (anatase)',
    spectralRange: { min: 400, max: 4000 },
    bands: ANATASE_FTIR.bands.map((b) => ({
      wavenumber: b.wavenumberCenter,
      assignment: b.vibrationalMode,
      relativeIntensity: b.intensity === 'strong' ? 90 : b.intensity === 'medium' ? 60 : 30,
      bandShape: b.bandType as 'sharp' | 'broad' | 'shoulder',
      fwhm: (b.wavenumberRange[1] - b.wavenumberRange[0]) / 2,
      diagnostic: b.functionalGroup === 'Ti-O (lattice)',
    })),
  },
};

/**
 * Rutile phase reference in the universal PhaseReference format.
 */
const RUTILE_PHASE_REF: PhaseReference = {
  phaseName: 'rutile',
  materialId: 'TiO2',
  xrd: {
    phaseName: 'rutile',
    spaceGroup: 'P42/mnm',
    crystalSystem: 'tetragonal',
    latticeParameters: { a: 4.593, c: 2.959 },
    peaks: RUTILE_XRD.peaks.map((p) => ({
      hkl: p.hkl,
      twoTheta: p.twoTheta,
      dSpacing: p.dSpacing,
      relativeIntensity: p.relativeIntensity,
      fwhm: 0.15,
    })),
    detectionLimit: 0.02,
  },
  raman: {
    phaseName: 'rutile',
    excitationWavelength: 532,
    modes: RUTILE_RAMAN.modes.map((m) => ({
      shift: m.wavenumber,
      symmetry: m.mode,
      relativeIntensity: m.intensity === 'strong' ? 90 : m.intensity === 'medium' ? 50 : 15,
      fwhm: 12,
      ramanActive: true,
      irActive: false,
      description: `${m.mode} mode of rutile TiO₂`,
    })),
    overlapZone: { min: 138, max: 149, confusablePhases: ['anatase'] },
  },
  xps: {
    materialName: 'TiO₂ (rutile)',
    xraySource: 'Al_Kalpha',
    peaks: TI4_PLUS_XPS.peaks.map((p) => ({
      orbital: p.orbital,
      bindingEnergy: p.bindingEnergy,
      fwhm: 1.2,
      oxidationState: p.chemicalState,
      chemicalContext: p.chemicalState,
      spinOrbitSplitting: p.spinOrbitSplitting,
    })),
  },
  ftir: {
    materialName: 'TiO₂ (rutile)',
    spectralRange: { min: 380, max: 3600 },
    bands: RUTILE_FTIR.bands.map((b) => ({
      wavenumber: b.wavenumberCenter,
      assignment: b.vibrationalMode,
      relativeIntensity: b.intensity === 'strong' ? 90 : b.intensity === 'medium' ? 60 : 30,
      bandShape: b.bandType as 'sharp' | 'broad' | 'shoulder',
      fwhm: (b.wavenumberRange[1] - b.wavenumberRange[0]) / 2,
      diagnostic: b.functionalGroup === 'Ti-O (lattice)',
    })),
  },
};

// ============================================================================
// TiO₂ Cross-Validation Rules (New Universal Format)
// ============================================================================

const TIO2_CV_RULES: CrossValidationRuleDefinition[] = [
  {
    ruleId: 'CV-TIO2-001',
    ruleName: 'XRD Phase ↔ Raman Active Modes',
    techniques: ['XRD', 'Raman'],
    weight: 1.0,
    materialSystem: 'TiO2',
    physicalBasis: 'Both techniques probe long-range crystalline order. XRD: elastic X-ray scattering (Bragg). Raman: inelastic light scattering (phonons). Same space group → correlated modes.',
    conditions: [
      { parameter: 'phase', primaryTechnique: 'XRD', secondaryTechnique: 'Raman', tolerance: 5, unit: 'cm⁻¹' },
    ],
    consistentInterpretation: 'XRD and Raman identify the same TiO₂ polymorph. High confidence in phase assignment.',
    inconsistentInterpretation: 'XRD and Raman suggest different phases — possible laser-induced phase transformation or sample heterogeneity.',
    partialInterpretation: 'Partial agreement — mixed phase sample or ambiguous overlap zone (143–144 cm⁻¹). Use secondary modes.',
  },
  {
    ruleId: 'CV-TIO2-002',
    ruleName: 'XRD Phase ↔ XPS Ti⁴⁺ Binding Energy',
    techniques: ['XRD', 'XPS'],
    weight: 0.95,
    materialSystem: 'TiO2',
    physicalBasis: 'Crystallographic phase determines Ti coordination; XPS measures oxidation-state-sensitive core-level BE. Both phases show Ti⁴⁺ at 458.5 eV.',
    conditions: [
      { parameter: 'oxidationState', primaryTechnique: 'XPS', secondaryTechnique: 'XRD', tolerance: 0.5, unit: 'eV' },
    ],
    consistentInterpretation: 'XPS Ti⁴⁺ (458.5 eV) consistent with TiO₂ crystallographic phase from XRD.',
    inconsistentInterpretation: 'XPS shows Ti³⁺ (456.8 eV) but XRD shows TiO₂ phase — possible surface reduction or mixed oxide.',
    partialInterpretation: 'Mixed Ti³⁺/Ti⁴⁺ signals — surface reduction or non-stoichiometric TiO₂₋ₓ.',
  },
  {
    ruleId: 'CV-TIO2-003',
    ruleName: 'XRD Crystallite Size ↔ Raman Peak Broadening',
    techniques: ['XRD', 'Raman'],
    weight: 0.7,
    materialSystem: 'TiO2',
    physicalBasis: 'Scherrer equation D = Kλ/(β·cosθ) and Raman phonon confinement Δω ∝ (a/D)^1.5 both sense crystallite size.',
    conditions: [
      { parameter: 'crystalliteSize', primaryTechnique: 'XRD', secondaryTechnique: 'Raman', tolerance: 3, unit: 'nm' },
    ],
    consistentInterpretation: 'XRD Scherrer size and Raman confinement broadening agree — consistent crystallite population.',
    inconsistentInterpretation: 'Size mismatch — possible surface amorphization, twin boundaries, or strain effects.',
    partialInterpretation: 'Broad size distribution — both techniques average differently over the population.',
  },
  {
    ruleId: 'CV-TIO2-004',
    ruleName: 'XPS O 1s ↔ FTIR Ti-O Bands',
    techniques: ['XPS', 'FTIR'],
    weight: 0.8,
    materialSystem: 'TiO2',
    physicalBasis: 'XPS O 1s lattice oxygen (529.7 eV) and FTIR Ti-O stretching (400–600 cm⁻¹) probe the same Ti-O bonds.',
    conditions: [
      { parameter: 'oxygenBonding', primaryTechnique: 'XPS', secondaryTechnique: 'FTIR', tolerance: 50, unit: 'cm⁻¹' },
    ],
    consistentInterpretation: 'XPS and FTIR agree on oxygen bonding environment — Ti-O lattice vibrations confirmed.',
    inconsistentInterpretation: 'XPS and FTIR disagree — possible surface vs bulk difference or contamination.',
    partialInterpretation: 'Partial agreement — surface hydroxyl species detected but lattice bonding unclear.',
  },
  {
    ruleId: 'CV-TIO2-005',
    ruleName: 'Raman Mode Ratio ↔ XRD Phase Fraction',
    techniques: ['Raman', 'XRD'],
    weight: 0.85,
    materialSystem: 'TiO2',
    physicalBasis: 'Spurr-Myers equation: W_A = 1/(1 + 0.8·I_R(447)/I_A(144)) gives Raman phase fraction; Rietveld refinement gives XRD phase fraction.',
    conditions: [
      { parameter: 'phaseFraction', primaryTechnique: 'Raman', secondaryTechnique: 'XRD', tolerance: 10, unit: '%' },
    ],
    consistentInterpretation: 'Raman and XRD phase fractions agree — reliable quantitative phase analysis.',
    inconsistentInterpretation: 'Phase fraction mismatch — possible Raman resonance effects or preferred orientation in XRD.',
    partialInterpretation: 'Moderate disagreement — consider using secondary Raman modes for improved quantification.',
  },
  {
    ruleId: 'CV-TIO2-006',
    ruleName: 'FTIR Surface Species ↔ XPS Surface Oxidation',
    techniques: ['FTIR', 'XPS'],
    weight: 0.75,
    materialSystem: 'TiO2',
    physicalBasis: 'FTIR surface OH bands (3200–3600 cm⁻¹) ↔ XPS O 1s hydroxyl component (531.2 eV). Both sense surface hydroxyl population.',
    conditions: [
      { parameter: 'surfaceHydroxyl', primaryTechnique: 'FTIR', secondaryTechnique: 'XPS', tolerance: 1.0, unit: 'eV' },
    ],
    consistentInterpretation: 'FTIR and XPS agree on surface hydroxyl coverage — consistent surface chemistry.',
    inconsistentInterpretation: 'Surface species mismatch — FTIR may probe deeper than XPS (5–10 nm vs 1–3 nm).',
    partialInterpretation: 'Partial agreement — different sampling depths explain the discrepancy.',
  },
  {
    ruleId: 'CV-TIO2-007',
    ruleName: 'XRD Amorphous Fraction ↔ Raman Disorder Bands',
    techniques: ['XRD', 'Raman'],
    weight: 0.65,
    materialSystem: 'TiO2',
    physicalBasis: 'Amorphous content: broad XRD background hump ↔ broad Raman disorder bands. Crystalline: sharp peaks in both.',
    conditions: [
      { parameter: 'crystallinity', primaryTechnique: 'XRD', secondaryTechnique: 'Raman', tolerance: 20, unit: '%' },
    ],
    consistentInterpretation: 'XRD and Raman crystallinity indicators agree — consistent structural order.',
    inconsistentInterpretation: 'Crystallinity mismatch — Raman may detect short-range order invisible to XRD.',
    partialInterpretation: 'Partial agreement — consider PDF analysis for definitive amorphous content quantification.',
  },
  {
    ruleId: 'CV-TIO2-008',
    ruleName: 'XPS Ti 2p Spin-Orbit Splitting Validation',
    techniques: ['XPS', 'XPS'],
    weight: 0.9,
    materialSystem: 'TiO2',
    physicalBasis: 'Ti 2p spin-orbit splitting must be 5.7 ± 0.3 eV for Ti⁴⁺. Deviation indicates mixed oxidation states or charging.',
    conditions: [
      { parameter: 'spinOrbitSplitting', primaryTechnique: 'XPS', secondaryTechnique: 'XPS', tolerance: 0.3, unit: 'eV' },
    ],
    consistentInterpretation: 'Ti 2p spin-orbit splitting is 5.7 ± 0.3 eV — consistent with Ti⁴⁺ in TiO₂.',
    inconsistentInterpretation: 'Splitting deviates from 5.7 eV — mixed oxidation states, charging, or multiplet effects.',
    partialInterpretation: 'Slight deviation — possible minor Ti³⁺ contribution or surface charging.',
  },
  {
    ruleId: 'CV-TIO2-009',
    ruleName: 'FTIR Carbonate ↔ XPS C 1s Contamination',
    techniques: ['FTIR', 'XPS'],
    weight: 0.5,
    materialSystem: 'TiO2',
    physicalBasis: 'FTIR carbonate bands (1380, 1630 cm⁻¹) ↔ XPS C 1s carbonate at 289.0 eV. Both detect surface contamination.',
    conditions: [
      { parameter: 'contamination', primaryTechnique: 'FTIR', secondaryTechnique: 'XPS', tolerance: 1.0, unit: 'eV' },
    ],
    consistentInterpretation: 'Both techniques detect surface carbonate contamination — consistent contamination state.',
    inconsistentInterpretation: 'Contamination mismatch — one technique may be more surface-sensitive.',
    partialInterpretation: 'Partial agreement — heterogeneous contamination distribution.',
  },
  {
    ruleId: 'CV-TIO2-010',
    ruleName: 'Raman Crystallinity ↔ XRD Peak Sharpness',
    techniques: ['Raman', 'XRD'],
    weight: 0.8,
    materialSystem: 'TiO2',
    physicalBasis: 'Sharp XRD peaks (low FWHM) ↔ narrow, well-resolved Raman modes. Both reflect long-range order quality.',
    conditions: [
      { parameter: 'crystallinity', primaryTechnique: 'Raman', secondaryTechnique: 'XRD', tolerance: 15, unit: '%' },
    ],
    consistentInterpretation: 'XRD and Raman agree on crystallinity — consistent structural quality.',
    inconsistentInterpretation: 'Crystallinity indicators disagree — possible surface vs bulk crystallinity difference.',
    partialInterpretation: 'Partial agreement — sample may have gradient crystallinity.',
  },
  {
    ruleId: 'CV-TIO2-011',
    ruleName: 'XRD Phase Mixture ↔ FTIR Band Deconvolution',
    techniques: ['XRD', 'FTIR'],
    weight: 0.7,
    materialSystem: 'TiO2',
    physicalBasis: 'XRD anatase+rutile mixture ↔ FTIR showing bands from both phases (anatase 450/560 + rutile 430/530 cm⁻¹).',
    conditions: [
      { parameter: 'phaseMixture', primaryTechnique: 'XRD', secondaryTechnique: 'FTIR', tolerance: 20, unit: '%' },
    ],
    consistentInterpretation: 'XRD and FTIR agree on phase mixture composition.',
    inconsistentInterpretation: 'Phase mixture disagreement — FTIR band overlap may obscure minor phase.',
    partialInterpretation: 'Partial agreement — FTIR may not resolve closely overlapping bands.',
  },
  {
    ruleId: 'CV-TIO2-012',
    ruleName: 'Overall Oxidation State Consistency',
    techniques: ['XPS', 'Raman'],
    weight: 0.85,
    materialSystem: 'TiO2',
    physicalBasis: 'XPS Ti⁴⁺ (458.5 eV) ↔ Raman TiO₂ modes (no Ti₂O₃ A₂u at 243 cm⁻¹). Both confirm Ti⁴⁺.',
    conditions: [
      { parameter: 'oxidationState', primaryTechnique: 'XPS', secondaryTechnique: 'Raman', tolerance: 0.5, unit: 'eV' },
    ],
    consistentInterpretation: 'XPS and Raman agree on Ti⁴⁺ — no evidence of Ti³⁺ reduction.',
    inconsistentInterpretation: 'XPS shows Ti⁴⁺ but Raman shows reduced Ti modes — possible laser-induced reduction.',
    partialInterpretation: 'Weak Ti³⁺ signals in one technique — surface reduction or minority phase.',
  },
];

// ============================================================================
// TiO₂ Recommendations (New Universal Format)
// ============================================================================

const TIO2_RECS: RecommendationEntry[] = [
  {
    trigger: 'missing_technique:XPS',
    recommendation: 'Perform XPS Ti 2p analysis to confirm Ti⁴⁺ oxidation state.',
    priority: 'critical',
    techniques: ['XPS'],
    expectedOutcome: 'Confirm Ti 2p₃/₂ at 458.5 eV (Ti⁴⁺) and check for Ti³⁺ at 456.8 eV.',
    rationale: 'XPS provides direct oxidation state evidence. Essential for confirming electronic state matches crystallographic phase.',
  },
  {
    trigger: 'missing_technique:FTIR',
    recommendation: 'Collect FTIR spectrum (400–4000 cm⁻¹) for Ti-O vibrational modes.',
    priority: 'high',
    techniques: ['FTIR'],
    expectedOutcome: 'Identify Ti-O stretching (400–600 cm⁻¹) and surface hydroxyl bands.',
    rationale: 'FTIR confirms bonding environment and identifies surface species critical for photocatalytic activity.',
  },
  {
    trigger: 'missing_technique:Raman',
    recommendation: 'Perform Raman spectroscopy (532 nm) for anatase/rutile fingerprinting.',
    priority: 'critical',
    techniques: ['Raman'],
    expectedOutcome: 'Anatase Eg at 144 cm⁻¹, secondary modes at 399/513/639 cm⁻¹.',
    rationale: 'Raman provides unambiguous phase discrimination using secondary modes to resolve the 143–144 cm⁻¹ overlap.',
  },
  {
    trigger: 'missing_technique:XRD',
    recommendation: 'Perform XRD (Cu Kα, 20–80° 2θ) for crystallographic phase ID.',
    priority: 'critical',
    techniques: ['XRD'],
    expectedOutcome: 'Anatase (101) at 25.28° vs rutile (110) at 27.45°.',
    rationale: 'XRD provides definitive structure identification and crystallite size via Scherrer analysis.',
  },
  {
    trigger: 'contradiction:phase',
    recommendation: 'Collect TEM-SAED for direct crystallographic phase imaging.',
    priority: 'high',
    techniques: ['TEM'],
    expectedOutcome: 'Real-space and reciprocal-space structural info at single-particle level.',
    rationale: 'TEM-SAED resolves ensemble-averaged XRD/Raman discrepancies from mixed-phase samples.',
  },
  {
    trigger: 'contradiction:oxidationState',
    recommendation: 'Perform Ti K-edge XANES for independent oxidation state confirmation.',
    priority: 'high',
    techniques: ['XAS'],
    expectedOutcome: 'Ti K-edge pre-edge at ~4968 eV shifts with oxidation state.',
    rationale: 'XANES is element-specific and oxidation-state-sensitive — independent confirmation of Ti³⁺ vs Ti⁴⁺.',
  },
];

// ============================================================================
// TiO₂ Inference Functions
// ============================================================================

/**
 * Infer TiO₂ crystallographic phases from XRD evidence.
 *
 * ALGORITHM:
 * For each observed peak, check against all reference peaks for all phases.
 * A match occurs when |2θ_obs - 2θ_ref| < tolerance (0.15°).
 * Phase score = Σ(relative_intensity of matched peaks) / Σ(all reference peaks)
 * Dominant phase = highest-scoring phase.
 * Mixed phases detected when both phases have score > 0.3.
 *
 * PHYSICS: Bragg's law nλ = 2d·sin(θ) → each phase has unique d-spacings
 * determined by its unit cell geometry (space group + lattice parameters).
 */
function inferTiO2XrdPhases(
  xrdNodes: Array<{ peaks?: Array<{ twoTheta: number; intensity: number }> }>,
): PhaseInferenceResult {
  const phases: PhaseInferenceResult['phases'] = [];

  for (const [phaseName, xrdRef] of [
    ['anatase', ANATASE_XRD] as const,
    ['rutile', RUTILE_XRD] as const,
  ]) {
    let matchedIntensity = 0;
    let totalIntensity = 0;
    const matchedPeaks: string[] = [];

    for (const refPeak of xrdRef.peaks) {
      totalIntensity += refPeak.relativeIntensity;

      for (const node of xrdNodes) {
        if (!node.peaks) continue;
        for (const obsPeak of node.peaks) {
          if (Math.abs(obsPeak.twoTheta - refPeak.twoTheta) <= refPeak.tolerance) {
            matchedIntensity += refPeak.relativeIntensity;
            if (!matchedPeaks.includes(refPeak.hkl)) {
              matchedPeaks.push(refPeak.hkl);
            }
          }
        }
      }
    }

    const matchScore = totalIntensity > 0 ? matchedIntensity / totalIntensity : 0;
    phases.push({ phaseName, matchScore, matchedPeaks });
  }

  phases.sort((a, b) => b.matchScore - a.matchScore);
  const dominant = phases[0];
  const isMixed = phases.length > 1 && phases[1].matchScore > 0.3;

  return {
    phases,
    dominantPhase: dominant.phaseName,
    confidence: dominant.matchScore,
    isMixed,
    phaseFractions: isMixed
      ? {
          anatase: phases.find((p) => p.phaseName === 'anatase')?.matchScore ?? 0,
          rutile: phases.find((p) => p.phaseName === 'rutile')?.matchScore ?? 0,
        }
      : undefined,
  };
}

/**
 * Infer TiO₂ phases from Raman evidence.
 *
 * ALGORITHM:
 * Match observed Raman shifts against reference modes within tolerance.
 * Primary discriminant: Eg(1) 144 cm⁻¹ (anatase) vs B₁g 143 cm⁻¹ (rutile)
 * → Use secondary modes for disambiguation:
 *   Anatase: 399, 513, 639 cm⁻¹
 *   Rutile: 447, 612, 825 cm⁻¹
 */
function inferTiO2RamanPhases(
  ramanNodes: Array<{ peaks?: Array<{ position: number; intensity: number }> }>,
): PhaseInferenceResult {
  const phases: PhaseInferenceResult['phases'] = [];

  for (const [phaseName, ramanRef] of [
    ['anatase', ANATASE_RAMAN] as const,
    ['rutile', RUTILE_RAMAN] as const,
  ]) {
    const matchedPeaks: string[] = [];
    let matchCount = 0;

    for (const refMode of ramanRef.modes) {
      for (const node of ramanNodes) {
        if (!node.peaks) continue;
        for (const obsPeak of node.peaks) {
          if (Math.abs(obsPeak.position - refMode.wavenumber) <= refMode.tolerance) {
            matchCount++;
            if (!matchedPeaks.includes(refMode.mode)) {
              matchedPeaks.push(refMode.mode);
            }
          }
        }
      }
    }

    const matchScore = ramanRef.modes.length > 0 ? matchCount / ramanRef.modes.length : 0;
    phases.push({ phaseName, matchScore, matchedPeaks });
  }

  phases.sort((a, b) => b.matchScore - a.matchScore);
  const dominant = phases[0];
  const isMixed = phases.length > 1 && phases[1].matchScore > 0.25;

  return {
    phases,
    dominantPhase: dominant.phaseName,
    confidence: dominant.matchScore,
    isMixed,
    phaseFractions: isMixed
      ? {
          anatase: phases.find((p) => p.phaseName === 'anatase')?.matchScore ?? 0,
          rutile: phases.find((p) => p.phaseName === 'rutile')?.matchScore ?? 0,
        }
      : undefined,
  };
}

/**
 * Infer Ti oxidation states from XPS evidence.
 *
 * ALGORITHM:
 * Match observed binding energies against Ti⁴⁺ (458.5 eV) and Ti³⁺ (456.8 eV)
 * references within tolerance (±0.5 eV).
 * Also check spin-orbit splitting: ΔE_SO = 5.7 ± 0.3 eV for Ti⁴⁺.
 *
 * PHYSICS: ΔBE(Ti⁴⁺ - Ti³⁺) = 1.7 eV reflects the additional core-electron
 * screening by the 3d¹ electron in Ti³⁺ (reduced effective nuclear charge).
 */
function inferTiO2XpsOxidationState(
  xpsNodes: Array<{ peaks?: Array<{ bindingEnergy: number; orbital?: string }> }>,
): OxidationStateResult {
  const states: OxidationStateResult['states'] = [];

  for (const ref of [TI4_PLUS_XPS, TI3_PLUS_XPS]) {
    for (const refPeak of ref.peaks) {
      if (refPeak.orbital !== 'Ti 2p3/2') continue;

      for (const node of xpsNodes) {
        if (!node.peaks) continue;
        for (const obsPeak of node.peaks) {
          if (Math.abs(obsPeak.bindingEnergy - refPeak.bindingEnergy) <= refPeak.tolerance) {
            states.push({
              oxidationState: ref.oxidationState,
              bindingEnergy: obsPeak.bindingEnergy,
              matchScore: 1 - Math.abs(obsPeak.bindingEnergy - refPeak.bindingEnergy) / refPeak.tolerance,
            });
          }
        }
      }
    }
  }

  const ti4State = states.find((s) => s.oxidationState === 'Ti⁴⁺');
  const ti3State = states.find((s) => s.oxidationState === 'Ti³⁺');
  const dominant = ti4State ?? ti3State ?? states[0] ?? { oxidationState: 'unknown', bindingEnergy: 0, matchScore: 0 };
  const isMixed = ti4State !== undefined && ti3State !== undefined;

  return {
    states,
    dominantState: dominant.oxidationState,
    confidence: dominant.matchScore,
    isMixed,
  };
}

// ============================================================================
// TiO₂ Material-Specific Ambiguity Detection
// ============================================================================

/**
 * Detect TiO₂-specific ambiguities that generic gap analysis cannot catch.
 *
 * CRITICAL AMBIGUITY: Anatase/Rutile Raman Overlap
 * The Eg(1) mode of anatase (144 cm⁻¹) and B₁g mode of rutile (143 cm⁻¹)
 * are separated by only 1 cm⁻¹ — within typical spectrometer resolution.
 * This makes single-peak Raman phase discrimination impossible.
 *
 * RESOLUTION: Use secondary Raman modes:
 *   Anatase: 399 (B₁g), 513 (A₁g), 639 cm⁻¹ (Eg)
 *   Rutile: 447 (Eg), 612 (A₁g), 825 cm⁻¹ (B₂g)
 *
 * Also detect XRD/Raman mixed-phase ambiguity where both show mixed signals.
 */
function detectTiO2Ambiguities(
  correlations: Array<{ ruleId: string; status: string; details?: Record<string, unknown> }>,
  bundle: { materialSystem: string; evidenceByTechnique: Record<string, unknown[]> },
): Array<{
  gapId: string;
  category: string;
  severity: string;
  techniques: string[];
  description: string;
  interpretation: string;
  recommendation: string;
}> {
  const gaps: Array<{
    gapId: string;
    category: string;
    severity: string;
    techniques: string[];
    description: string;
    interpretation: string;
    recommendation: string;
  }> = [];

  const cv001 = correlations.find((c) => c.ruleId === 'CV-001' || c.ruleId === 'CV-TIO2-001');
  if (cv001?.status === 'partially_consistent') {
    const details = cv001.details as Record<string, unknown> | undefined;
    const xrdPhases = details?.xrdPhases as { phases: string[]; anataseMatch: number; rutileMatch: number } | undefined;
    const ramanPhases = details?.ramanPhases as { phases: string[]; anataseMatch: number; rutileMatch: number } | undefined;

    if (xrdPhases && ramanPhases) {
      const xrdMixed = xrdPhases.phases.includes('anatase') && xrdPhases.phases.includes('rutile');
      const ramanMixed = ramanPhases.phases.includes('anatase') && ramanPhases.phases.includes('rutile');

      if (xrdMixed || ramanMixed) {
        gaps.push({
          gapId: 'GAP-TIO2-AMBIGUITY-001',
          category: 'ambiguity',
          severity: 'medium',
          techniques: ['XRD', 'Raman'],
          description: `Phase ambiguity: Both anatase and rutile signatures detected. XRD anatase match ${(xrdPhases.anataseMatch * 100).toFixed(0)}%, rutile ${(xrdPhases.rutileMatch * 100).toFixed(0)}%. Raman anatase match ${(ramanPhases.anataseMatch * 100).toFixed(0)}%, rutile ${(ramanPhases.rutileMatch * 100).toFixed(0)}%.`,
          interpretation: `The presence of both anatase and rutile phases is common in TiO₂ synthesis. Quantification of the phase ratio is critical for applications (photocatalysis, coatings) where phase composition determines performance. The Raman overlap zone at 143–144 cm⁻¹ limits discrimination without secondary mode analysis.`,
          recommendation: 'Use Raman secondary modes (anatase 399/639 cm⁻¹, rutile 447/612 cm⁻¹) for phase ratio quantification. Apply Spurr-Myers equation to XRD (101)/(110) peak area ratio for independent phase fraction determination.',
        });
      }
    }
  }

  return gaps;
}

// ============================================================================
// TiO₂ MaterialRuleSet — Complete Implementation
// ============================================================================

/**
 * Complete MaterialRuleSet for TiO₂ — the primary proof-of-concept material.
 *
 * This implements the universal MaterialRuleSet interface defined in baseTypes.ts,
 * providing all the information the reasoning engine needs for TiO₂ analysis:
 * - 2 phases (anatase, rutile) with complete spectroscopic fingerprints
 * - 12 cross-validation rules encoding physical relationships
 * - 6 recommendation templates for gap resolution
 * - Inference functions for XRD, Raman, and XPS analysis
 * - Material-specific ambiguity detection for the anatase/rutile overlap
 */
export const tio2RuleSet: MaterialRuleSet = {
  // ─── Identity ───────────────────────────────────────────────────────
  materialId: 'TiO2',
  materialName: 'Titanium Dioxide (TiO₂)',
  materialClass: 'oxide_semiconductor',
  formula: 'TiO2',
  aliases: ['TiO2', 'titanium dioxide', 'titanium oxide', 'TiO₂', 'tio2'],

  // ─── Phase References ───────────────────────────────────────────────
  phases: [ANATASE_PHASE_REF, RUTILE_PHASE_REF],

  // ─── Cross-Validation Rules ─────────────────────────────────────────
  crossValidationRules: TIO2_CV_RULES,

  // ─── Recommendations ────────────────────────────────────────────────
  recommendations: TIO2_RECS,

  // ─── Inference Functions ────────────────────────────────────────────
  inferXrdPhases: inferTiO2XrdPhases,
  inferRamanPhases: inferTiO2RamanPhases,
  inferXpsOxidationState: inferTiO2XpsOxidationState,

  // ─── Material-Specific Gap Detection ────────────────────────────────
  detectAmbiguities: detectTiO2Ambiguities,

  // ─── Metadata ───────────────────────────────────────────────────────
  version: '1.0.0',
  lastUpdated: '2026-05-28T00:00:00Z',
  notes: 'Primary proof-of-concept material. Data sourced from published crystallographic (ICSD) and spectroscopic (RRUFF, NIST XPS) databases. Anatase/rutile Raman overlap at 143–144 cm⁻¹ is the critical ambiguity requiring secondary mode analysis.',
};