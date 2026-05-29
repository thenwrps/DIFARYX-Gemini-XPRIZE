/**
 * ============================================================================
 * DIFARYX — Universal Knowledge Base: Abstract Material Grammar
 * ============================================================================
 *
 * This module defines the material-agnostic `MaterialRuleSet` interface — the
 * core abstraction that enables the DIFARYX reasoning engine to operate on
 * ANY material system, not just TiO₂. Every material (from LiFePO₄ battery
 * cathodes to YBCO superconductors) implements this interface, providing:
 *
 *   1. Crystallographic phase references (XRD d-spacings, space groups)
 *   2. Vibrational mode references (Raman shifts, IR absorption bands)
 *   3. Electronic structure references (XPS binding energies, oxidation states)
 *   4. Cross-validation rules that check consistency across techniques
 *   5. Material-specific inference functions for phase/oxidation state ID
 *   6. Gap analysis hooks for material-specific ambiguity detection
 *   7. Decision intelligence recommendations for next experimental steps
 *
 * ============================================================================
 * SOLID-STATE PHYSICS FOUNDATIONS
 * ============================================================================
 *
 * The interface encodes fundamental solid-state physics relationships:
 *
 * XRD Phase Identification:
 *   Bragg's Law: nλ = 2d·sin(θ)
 *   d-spacing for cubic: 1/d² = (h² + k² + l²)/a²
 *   d-spacing for orthorhombic: 1/d² = h²/a² + k²/b² + l²/c²
 *   d-spacing for tetragonal: 1/d² = (h² + k²)/a² + l²/c²
 *   d-spacing for hexagonal: 1/d² = 4(h² + hk + k²)/(3a²) + l²/c²
 *
 * Raman Scattering:
 *   Stokes shift: ω_s = ω_laser - ω_phonon
 *   Selection rules: ∂α/∂Q ≠ 0 (polarizability change with normal mode)
 *   LO-phonon confinement in nanostructures:
 *     I(ω) ∝ ∫ exp(-q²·D²/(16π²)) · d³q / [(ω - ω(q))² + (Γ/2)²]
 *   where D = nanocrystal diameter, Γ = natural linewidth
 *
 * XPS Core-Level Spectroscopy:
 *   BE = hν - KE - φ (work function correction)
 *   Chemical shift ΔBE reflects oxidation state and coordination:
 *     ΔBE ∝ Δq / r (charge transfer per ionic radius)
 *   Spin-orbit splitting: ΔE_SO = ξ·(l+1/2) for j = l±1/2
 *   Multiplet splitting in open-shell systems (d⁵, d⁷, d⁸, d⁹)
 *
 * FTIR Absorption:
 *   Beer-Lambert: A = ε·c·l
 *   Vibrational frequency: ν̃ = (1/2πc)√(k/μ)
 *   where k = force constant, μ = reduced mass
 *   Selection rule: ∂μ/∂Q ≠ 0 (dipole moment change)
 *
 * Cross-Technique Validation:
 *   Consistency metric: C_ij = Σ w_k · f(|Δ_k|) / Σ w_k
 *   where Δ_k = deviation between technique i and j for feature k
 *   f = penalty function (linear, quadratic, or threshold)
 *
 * ============================================================================
 * QUANTUM MECHANICAL CONSTRAINTS
 * ============================================================================
 *
 * Crystal Field Theory (for XPS satellite interpretation):
 *   In octahedral coordination: Δ_oct = 10Dq
 *   Spectrochemical series determines d-d transition energies
 *   Tanabe-Sugano diagrams map ground-state → excited-state transitions
 *
 * Group Theory Selection Rules:
 *   Raman active: Γ_vib contains Γ_polarizability (A₁g, Eg, T₂g in Oh)
 *   IR active: Γ_vib contains Γ_dipole (T₁u in Oh)
 *   Mutual exclusion: In centrosymmetric systems, no mode is both Raman and IR active
 *   This is fundamental for bio-implants (HA: P6₃/m centrosymmetric space group)
 *
 * Debye-Waller Factor (for XRD intensity):
 *   I(hkl) = I₀ · exp(-2B·sin²(θ)/λ²)
 *   B = 8π²<u²>/3 (mean-square displacement)
 *   Critical for high-entropy alloys with large lattice distortion δ
 *
 * ============================================================================
 * @module reasoningEngine/knowledgeBase/baseTypes
 * ============================================================================
 */

import type { Technique } from '../../../types/universalTechnique';

// ---------------------------------------------------------------------------
// Material Classification
// ---------------------------------------------------------------------------

/**
 * Material class taxonomy — each class represents a distinct domain of
 * materials science with shared analytical patterns and cross-validation logic.
 *
 * PHYSICS RATIONALE:
 * The classification reflects fundamentally different physical phenomena:
 * - 'oxide_semiconductor': Band-gap materials (E_g > 0), anionic sublattice O²⁻
 * - 'energy_storage': Intercalation/deintercalation compounds with mixed valence
 * - 'quantum_dot': Zero-dimensional confiners where ΔE ~ 1/r² (quantum size effect)
 * - 'catalyst': Surface-active metals/oxides with d-band center theory
 * - 'high_entropy_alloy': Multi-principal-element alloys with ΔS_mix > 1.5R
 * - 'zeolite': Microporous aluminosilicates with Si/Al-dependent acidity
 * - 'conducting_polymer': Organic semiconductors with conjugation-length transport
 * - 'bio_implant': Biocompatible ceramics with osseointegration interfaces
 * - 'superconductor': Macroscopic quantum coherent states with Cooper pairing
 */
export type MaterialClass =
  | 'oxide_semiconductor'
  | 'energy_storage'
  | 'quantum_dot'
  | 'catalyst'
  | 'high_entropy_alloy'
  | 'zeolite'
  | 'conducting_polymer'
  | 'bio_implant'
  | 'superconductor';

// ---------------------------------------------------------------------------
// Crystallographic References
// ---------------------------------------------------------------------------

/**
 * XRD peak reference for a single Bragg reflection.
 *
 * SOLID-STATE PHYSICS:
 * Each peak corresponds to constructive interference from a set of lattice
 * planes (hkl) satisfying Bragg's law: nλ = 2d·sin(θ).
 *
 * The d-spacing is determined by the crystal system and lattice parameters:
 * - Cubic (Fm-3m, Im-3m, Pm-3m): d = a/√(h²+k²+l²)
 * - Tetragonal (I4/mmm): 1/d² = (h²+k²)/a² + l²/c²
 * - Orthorhombic (Pnma, Pbnm): 1/d² = h²/a² + k²/b² + l²/c²
 * - Hexagonal (P6₃mc, R-3m): 1/d² = 4(h²+hk+k²)/(3a²) + l²/c²
 *
 * Relative intensity encodes structure factor |F(hkl)|²:
 *   F(hkl) = Σ_j f_j · exp[2πi(hx_j + ky_j + lz_j)] · exp(-B_j·sin²θ/λ²)
 * where f_j = atomic form factor, (x_j,y_j,z_j) = fractional coordinates
 */
export interface XrdPeakReference {
  /** Miller indices (hkl) */
  hkl: string;
  /** 2θ position in degrees (Cu Kα, λ = 1.5406 Å) */
  twoTheta: number;
  /** d-spacing in Ångströms */
  dSpacing: number;
  /** Relative intensity 0–100 (100 = strongest peak) */
  relativeIntensity: number;
  /** Optional FWHM reference in degrees (instrumental broadening baseline) */
  fwhm?: number;
  /** Optional notes on peak origin, symmetry-forbidden conditions, etc. */
  notes?: string;
}

/**
 * XRD phase reference — complete crystallographic fingerprint of one polymorph.
 *
 * Contains space group info, lattice parameters, and the set of characteristic
 * Bragg reflections used for phase identification and quantification.
 */
export interface XrdPhaseReference {
  /** Phase name (e.g., "anatase", "rutile", "olivine") */
  phaseName: string;
  /** Space group symbol (e.g., "I4₁/amd", "P4₂/mnm", "Pnma") */
  spaceGroup: string;
  /** Crystal system */
  crystalSystem: 'cubic' | 'tetragonal' | 'orthorhombic' | 'hexagonal' | 'monoclinic' | 'trigonal' | 'rhombohedral';
  /** Lattice parameters in Ångströms */
  latticeParameters: { a: number; b?: number; c?: number; alpha?: number; beta?: number; gamma?: number };
  /** Characteristic XRD peaks for this phase */
  peaks: XrdPeakReference[];
  /** Optional minimum detectable weight fraction (via detection limit analysis) */
  detectionLimit?: number;
}

// ---------------------------------------------------------------------------
// Vibrational Spectroscopy References
// ---------------------------------------------------------------------------

/**
 * Raman vibrational mode reference.
 *
 * QUANTUM MECHANICS FOUNDATIONS:
 * Raman scattering involves inelastic scattering of photons by phonons.
 * The selection rule requires the polarizability derivative to be nonzero:
 *   (∂α/∂Q)_0 ≠ 0
 *
 * For a crystal with N atoms per unit cell, there are 3N normal modes:
 *   Γ_total = Γ_acoustic + Γ_optical
 *   Acoustic: 3 modes (translations of entire lattice)
 *   Optical: 3N - 3 modes (relative atomic displacements)
 *
 * In centrosymmetric crystals (space groups with inversion), the mutual
 * exclusion principle applies: modes are EITHER Raman-active OR IR-active,
 * but never both. This is critical for distinguishing phases.
 *
 * Confinement effects in nanocrystals:
 *   For nanoparticles with diameter D, the Raman peak shifts and broadens:
 *   Δω(D) ≈ -A·(a/D)^γ
 *   where a = lattice constant, A,γ = material-dependent parameters
 *   (Richter-Wang-Ley model for LO-phonon confinement)
 */
export interface RamanModeReference {
  /** Raman shift in cm⁻¹ */
  shift: number;
  /** Symmetry label (e.g., "E_g", "A₁g", "B₁g", "T₂g") */
  symmetry: string;
  /** Relative intensity 0–100 */
  relativeIntensity: number;
  /** Optional FWHM in cm⁻¹ */
  fwhm?: number;
  /** Whether this mode is Raman-active (true) or IR-active (false) */
  ramanActive: boolean;
  /** Whether this mode is IR-active */
  irActive: boolean;
  /** Physical origin description */
  description?: string;
  /** Confinement sensitivity: peak shift per 1/nm size reduction (cm⁻¹·nm) */
  confinementSensitivity?: number;
}

/**
 * Raman phase reference — full vibrational fingerprint of one material phase.
 */
export interface RamanPhaseReference {
  /** Phase name */
  phaseName: string;
  /** Excitation wavelength used for reference data (nm) */
  excitationWavelength: number;
  /** Raman modes for this phase */
  modes: RamanModeReference[];
  /** Optional resonance conditions (e.g., near electronic transitions) */
  resonanceCondition?: string;
  /** Overlap zone with other phases (shifts in cm⁻¹ where ambiguity exists) */
  overlapZone?: { min: number; max: number; confusablePhases: string[] };
}

// ---------------------------------------------------------------------------
// XPS Electronic Structure References
// ---------------------------------------------------------------------------

/**
 * XPS core-level peak reference.
 *
 * QUANTUM MECHANICS FOUNDATIONS:
 * The binding energy BE = hν - KE - φ, where:
 *   hν = X-ray photon energy (Al Kα = 1486.6 eV, Mg Kα = 1253.6 eV)
 *   KE = measured kinetic energy
 *   φ = spectrometer work function
 *
 * Chemical shifts arise from changes in the electronic environment:
 *   ΔBE ≈ k·Δq + ΔV_Madelung
 * where Δq = charge transfer, ΔV_Madelung = change in electrostatic potential
 *
 * Spin-orbit coupling splits p, d, f levels:
 *   j = l ± 1/2
 *   ΔE_SO = ξ(n,l)·(l+1/2) for the two j values
 *   Intensity ratio: I(j=l+1/2)/I(j=l-1/2) = (l+1)/l
 *   For p levels: I(p₁/₂)/I(p₃/₂) = 1:2
 *   For d levels: I(d₃/₂)/I(d₅/₂) = 2:3
 *
 * Multiplet splitting in open-shell systems (3d⁵, 3d⁷, 3d⁸, 3d⁹):
 *   Final-state configuration interaction produces satellite structure
 *   Shake-up: core-hole screening by valence electron excitation
 *   Shake-off: valence electron ejection
 */
export interface XpsPeakReference {
  /** Orbital label (e.g., "Ti 2p₃/₂", "Fe 2p₃/₂", "Cd 3d₅/₂") */
  orbital: string;
  /** Binding energy in eV (referenced to adventitious C 1s = 284.8 eV) */
  bindingEnergy: number;
  /** Spin-orbit splitting energy in eV (for the doublet partner) */
  spinOrbitSplitting?: number;
  /** Intensity ratio within the doublet (e.g., 0.5 for p₁/₂:p₃/₂) */
  intensityRatio?: number;
  /** FWHM of the peak in eV */
  fwhm: number;
  /** Oxidation state this peak is diagnostic of */
  oxidationState: string;
  /** Chemical context (e.g., "octahedral Ti⁴⁺", "tetrahedral Fe²⁺") */
  chemicalContext?: string;
  /** Optional satellite peaks */
  satellites?: Array<{ label: string; offset: number; relativeIntensity: number }>;
  /** Auger parameter (α' = BE + KE of Auger line) for chemical state analysis */
  augerParameter?: number;
}

/**
 * XPS material reference — complete electronic structure fingerprint.
 */
export interface XpsMaterialReference {
  /** Material name */
  materialName: string;
  /** X-ray source used (Al Kα, Mg Kα) */
  xraySource: 'Al_Kalpha' | 'Mg_Kalpha';
  /** Core-level peaks for this material */
  peaks: XpsPeakReference[];
  /** Valence band edge position in eV (for band structure context) */
  valenceBandEdge?: number;
  /** Work function in eV */
  workFunction?: number;
}

// ---------------------------------------------------------------------------
// FTIR References
// ---------------------------------------------------------------------------

/**
 * FTIR absorption band reference.
 *
 * FOUNDATIONS:
 * IR absorption requires a change in dipole moment during vibration:
 *   (∂μ/∂Q)_0 ≠ 0
 *
 * The absorption frequency is determined by force constants and reduced mass:
 *   ν̃ = (1/2πc)√(k/μ)
 * where k = force constant (N/m), μ = reduced mass (kg), c = speed of light
 *
 * For polyatomic molecules/crystals, normal mode analysis:
 *   ν̃ᵢ = (1/2πc)√(eigenvalue of GF matrix)
 *   G = inverse kinetic energy matrix (Wilson's G matrix)
 *   F = force constant matrix (Wilson's F matrix)
 *
 * Band intensity proportional to:
 *   A ∝ |(∂μ/∂Q)_0|² · c · l (Beer-Lambert)
 *
 * Factor group analysis determines which modes are IR-active in each space group.
 */
export interface FtirBandReference {
  /** Wavenumber in cm⁻¹ */
  wavenumber: number;
  /** Vibrational mode assignment (e.g., "ν₃(PO₄³⁻) asymmetric stretch") */
  assignment: string;
  /** Relative intensity 0–100 */
  relativeIntensity: number;
  /** Band shape: "sharp", "broad", "shoulder" */
  bandShape: 'sharp' | 'broad' | 'shoulder';
  /** Optional FWHM in cm⁻¹ */
  fwhm?: number;
  /** Symmetry species (e.g., "T₂", "E", "A₁") */
  symmetrySpecies?: string;
  /** Whether this band is diagnostic (unique identifier) or common */
  diagnostic: boolean;
}

/**
 * FTIR material reference — complete infrared fingerprint.
 */
export interface FtirMaterialReference {
  /** Material name */
  materialName: string;
  /** Spectral range (cm⁻¹) */
  spectralRange: { min: number; max: number };
  /** Absorption bands */
  bands: FtirBandReference[];
  /** ATR correction factor if applicable */
  atrCorrectionFactor?: number;
}

// ---------------------------------------------------------------------------
// Phase Reference (Aggregated)
// ---------------------------------------------------------------------------

/**
 * Aggregated reference data for a single crystallographic/polymorphic phase,
 * combining all four spectroscopic techniques.
 */
export interface PhaseReference {
  /** Phase name */
  phaseName: string;
  /** Material this phase belongs to */
  materialId: string;
  /** XRD crystallographic reference */
  xrd: XrdPhaseReference;
  /** Raman vibrational fingerprint */
  raman?: RamanPhaseReference;
  /** XPS electronic structure reference */
  xps?: XpsMaterialReference;
  /** FTIR absorption fingerprint */
  ftir?: FtirMaterialReference;
}

// ---------------------------------------------------------------------------
// Cross-Validation Rule Definition
// ---------------------------------------------------------------------------

/**
 * A cross-validation rule defines a specific consistency check between
 * two or more characterization techniques for a given material system.
 *
 * The rule specifies:
 * - Which techniques are correlated
 * - The physical relationship being validated
 * - The expected consistency metric and thresholds
 *
 * For the generic engine, rules are defined declaratively and evaluated
 * by the cross-validation module against actual evidence.
 */
export interface CrossValidationRuleDefinition {
  /** Unique rule identifier (e.g., "CV-TIO2-001", "CV-LFP-001") */
  ruleId: string;
  /** Human-readable rule name */
  ruleName: string;
  /** Techniques involved in this correlation */
  techniques: Technique[];
  /** Weight/importance of this rule (0–1) */
  weight: number;
  /** Material system this rule applies to */
  materialSystem: string;
  /** Physical basis for this correlation */
  physicalBasis: string;
  /** Expected consistency conditions */
  conditions: CrossValidationCondition[];
  /** Interpretation template for consistent results */
  consistentInterpretation: string;
  /** Interpretation template for inconsistent results */
  inconsistentInterpretation: string;
  /** Interpretation template for partially consistent results */
  partialInterpretation: string;
}

/**
 * A condition within a cross-validation rule — specifies what to check
 * and the tolerance for consistency.
 */
export interface CrossValidationCondition {
  /** Parameter being checked (e.g., "phase", "oxidationState", "crystallinity") */
  parameter: string;
  /** Technique providing the primary signal */
  primaryTechnique: Technique;
  /** Technique providing the corroborating signal */
  secondaryTechnique: Technique;
  /** Tolerance for consistency (interpretation depends on parameter type) */
  tolerance: number;
  /** Unit of the tolerance */
  unit: string;
}

// ---------------------------------------------------------------------------
// Recommendation Entry
// ---------------------------------------------------------------------------

/**
 * A recommendation entry for next experimental steps, specific to a material.
 */
export interface RecommendationEntry {
  /** Trigger condition (gap category or feature that activates this recommendation) */
  trigger: string;
  /** Recommended action */
  recommendation: string;
  /** Priority level */
  priority: 'critical' | 'high' | 'medium' | 'low';
  /** Technique(s) involved */
  techniques: Technique[];
  /** Expected outcome description */
  expectedOutcome: string;
  /** Physical/chemical rationale */
  rationale: string;
}

// ---------------------------------------------------------------------------
// Inference Results
// ---------------------------------------------------------------------------

/**
 * Result of phase inference from XRD or Raman data.
 */
export interface PhaseInferenceResult {
  /** Inferred phases with match scores */
  phases: Array<{ phaseName: string; matchScore: number; matchedPeaks: string[] }>;
  /** Dominant phase */
  dominantPhase: string;
  /** Confidence in inference */
  confidence: number;
  /** Whether mixed phases are detected */
  isMixed: boolean;
  /** Phase fraction estimates if applicable */
  phaseFractions?: Record<string, number>;
}

/**
 * Result of oxidation state inference from XPS data.
 */
export interface OxidationStateResult {
  /** Inferred oxidation states with evidence */
  states: Array<{ oxidationState: string; bindingEnergy: number; matchScore: number }>;
  /** Dominant oxidation state */
  dominantState: string;
  /** Confidence in inference */
  confidence: number;
  /** Whether mixed oxidation states are detected */
  isMixed: boolean;
}

// ---------------------------------------------------------------------------
// Material Rule Set — The Core Interface
// ---------------------------------------------------------------------------

/**
 * ============================================================================
 * MaterialRuleSet — The Universal Material Knowledge Interface
 * ============================================================================
 *
 * This is the central abstraction of the DIFARYX Universal Knowledge Base.
 * Every material system in the registry must implement this interface,
 * providing all the information the reasoning engine needs to:
 *
 *   1. Identify crystallographic phases from XRD data
 *   2. Identify vibrational modes from Raman/FTIR data
 *   3. Identify oxidation states from XPS data
 *   4. Cross-validate consistency between techniques
 *   5. Detect material-specific ambiguities and edge cases
 *   6. Recommend next experiments for gap resolution
 *
 * DESIGN PATTERN: Strategy + Registry
 *   - Each material file exports a singleton `MaterialRuleSet`
 *   - The registry factory maps material IDs → rule sets
 *   - The reasoning engine resolves dynamically based on sample identity
 *
 * PHYSICS INTEGRATION:
 *   The interface encodes relationships from solid-state physics:
 *   - XRD ↔ phase: Bragg's law, structure factor, Debye-Waller
 *   - Raman ↔ phonon: selection rules, confinement effects, resonance
 *   - XPS ↔ electronic state: Koopmans' theorem, chemical shift, multiplet
 *   - FTIR ↔ bond vibration: normal mode analysis, factor group
 *   - Cross-technique: consistency via shared physical observables
 *
 * ============================================================================
 */
export interface MaterialRuleSet {
  // ─── Identity ───────────────────────────────────────────────────────
  /** Unique material identifier (e.g., "TiO2", "LiFePO4", "CdSe") */
  materialId: string;
  /** Human-readable material name */
  materialName: string;
  /** Material class for domain-specific reasoning */
  materialClass: MaterialClass;
  /** Chemical formula */
  formula: string;
  /** Aliases/formula variations for registry matching */
  aliases: string[];

  // ─── Phase References ───────────────────────────────────────────────
  /** All known phases/polymorphs with complete spectroscopic fingerprints */
  phases: PhaseReference[];

  // ─── Cross-Validation Rules ─────────────────────────────────────────
  /** Material-specific cross-validation rules */
  crossValidationRules: CrossValidationRuleDefinition[];

  // ─── Recommendations ────────────────────────────────────────────────
  /** Decision intelligence recommendations for this material */
  recommendations: RecommendationEntry[];

  // ─── Inference Functions ────────────────────────────────────────────
  /**
   * Infer crystallographic phases from XRD evidence nodes.
   * @param xrdNodes - Evidence nodes containing XRD peak data
   * @returns Phase inference result with match scores
   */
  inferXrdPhases(xrdNodes: Array<{ peaks?: Array<{ twoTheta: number; intensity: number }> }>): PhaseInferenceResult;

  /**
   * Infer vibrational phases from Raman evidence nodes.
   * @param ramanNodes - Evidence nodes containing Raman shift data
   * @returns Phase inference result with match scores
   */
  inferRamanPhases(ramanNodes: Array<{ peaks?: Array<{ position: number; intensity: number }> }>): PhaseInferenceResult;

  /**
   * Infer oxidation states from XPS evidence nodes.
   * @param xpsNodes - Evidence nodes containing XPS binding energy data
   * @returns Oxidation state inference result
   */
  inferXpsOxidationState(xpsNodes: Array<{ peaks?: Array<{ bindingEnergy: number; orbital?: string }> }>): OxidationStateResult;

  // ─── Material-Specific Gap Detection ────────────────────────────────
  /**
   * Detect material-specific ambiguities that generic gap analysis cannot catch.
   * Optional — if not provided, the generic gap analysis is used.
   */
  detectAmbiguities?: (
    correlations: Array<{ ruleId: string; status: string; details?: Record<string, unknown> }>,
    bundle: { materialSystem: string; evidenceByTechnique: Record<string, unknown[]> },
  ) => Array<{
    gapId: string;
    category: string;
    severity: string;
    techniques: string[];
    description: string;
    interpretation: string;
    recommendation: string;
  }>;

  // ─── Metadata ───────────────────────────────────────────────────────
  /** Version of this rule set for cache invalidation */
  version: string;
  /** ISO timestamp of last update */
  lastUpdated: string;
  /** Free-text notes on data sources, assumptions, and limitations */
  notes?: string;
}