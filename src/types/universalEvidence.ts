/**
 * Universal Evidence Node — Unified Evidence Model
 *
 * Provides a single, technique-agnostic evidence node interface that all
 * engines (fusionEngine, claimGraph, routerEngine) consume. This replaces
 * the incompatible EvidenceNode definitions:
 *
 *   - fusionEngine/types.ts: uses `x` field, `Technique` = 4 values
 *   - claimGraph/types.ts: uses `value` field, `Technique` = 7 values
 *
 * The UniversalEvidenceNode normalizes these discrepancies into one
 * coherent shape. Backward-compatible adapters are provided for
 * legacy consumers.
 *
 * @module universalEvidence
 */

import type { Technique, TechniqueDomain } from './universalTechnique';

// ---------------------------------------------------------------------------
// Confidence & Quality
// ---------------------------------------------------------------------------

/**
 * Standardized confidence level for any evidence observation.
 * Used across all 11 technique modules.
 */
export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'uncertain';

/**
 * Signal quality assessment for raw data input.
 */
export type SignalQuality = 'excellent' | 'good' | 'marginal' | 'weak' | 'insufficient';

/**
 * Role of this evidence node within a claim's evidence set.
 *
 * - `primary`: Core evidence directly supporting or contradicting a claim.
 * - `supporting`: Additional evidence that strengthens the claim.
 * - `validation`: Independent evidence required to confirm the claim.
 * - `contextual`: Background or contextual information.
 */
export type EvidenceRole = 'primary' | 'supporting' | 'validation' | 'contextual';

// ---------------------------------------------------------------------------
// Universal Evidence Node
// ---------------------------------------------------------------------------

/**
 * Technique-agnostic evidence node.
 *
 * Every evidence observation produced by any of the 11 technique modules
 * MUST conform to this interface. The `technique` field identifies the
 * source module; the `primaryAxis` and `value` fields provide the core
 * measurement; additional metadata is stored in technique-specific
 * extensions via `techniqueMetadata`.
 *
 * @example XRD peak evidence node
 * ```ts
 * const node: UniversalEvidenceNode = {
 *   id: 'xrd-peak-001',
 *   technique: 'XRD',
 *   primaryAxis: 35.267,
 *   primaryAxisUnit: '°2θ',
 *   value: 100.0,
 *   valueUnit: 'normalized_intensity',
 *   label: 'peak 1',
 *   concept: 'crystalline',
 *   role: 'primary',
 *   confidence: 'high',
 *   techniqueMetadata: {
 *     hkl: '311',
 *     dSpacing: 2.542,
 *     fwhm: 0.18,
 *     classification: 'sharp',
 *   },
 *   provenance: {
 *     datasetId: 'ds-001',
 *     sampleName: 'NiFe2O4 SBA-15',
 *     processingHash: 'sha256:abc123',
 *     createdAt: '2026-05-27T14:30:00Z',
 *   },
 * };
 * ```
 */
export interface UniversalEvidenceNode {
  /** Unique identifier for this evidence node (UUIDv4 recommended). */
  id: string;

  /** Source characterization technique. */
  technique: Technique;

  /**
   * Primary measurement axis value.
   *
   * Unit is technique-dependent:
   * - XRD: 2θ in degrees
   * - FTIR/Raman: wavenumber in cm⁻¹
   * - XPS: binding energy in eV
   * - XAS: photon energy in eV
   * - TEM/SEM: length in nm/μm
   * - BET: relative pressure (P/P₀)
   * - TPD: temperature in °C
   * - NMR: chemical shift in ppm
   * - XRF: energy in keV
   */
  primaryAxis: number;

  /** Unit string for the primary axis (e.g., '°2θ', 'cm⁻¹', 'eV'). */
  primaryAxisUnit: string;

  /**
   * Measurement value at this observation.
   *
   * Interpretation is technique-dependent:
   * - XRD: intensity (counts or normalized)
   * - FTIR/Raman: absorbance/transmittance or intensity
   * - XPS: counts or intensity
   * - BET: adsorbed volume
   * - TPD: signal intensity
   */
  value: number;

  /** Unit string for the measurement value. */
  valueUnit: string;

  /** Human-readable label for this observation. */
  label: string;

  /** Scientific concept this evidence relates to (e.g., 'crystalline', 'oxidation_state', 'bonding'). */
  concept?: string;

  /** Evidence category for claim graph integration. */
  inferredCategory?: 'crystalline' | 'non-crystalline' | 'mixed' | 'amorphous';

  /** Role of this evidence within a claim evaluation. */
  role?: EvidenceRole;

  /** Confidence level of this observation. */
  confidence?: ConfidenceLevel;

  /**
   * Technique-specific metadata.
   *
   * Each technique module defines its own metadata shape. This field
   * provides extensibility without polluting the universal interface.
   */
  techniqueMetadata?: XrdEvidenceMetadata
    | XpsEvidenceMetadata
    | FtirEvidenceMetadata
    | RamanEvidenceMetadata
    | XasEvidenceMetadata
    | TemEvidenceMetadata
    | BetEvidenceMetadata
    | TpdEvidenceMetadata
    | NmrEvidenceMetadata
    | SemEvidenceMetadata
    | XrfEvidenceMetadata
    | Record<string, unknown>;

  /** Provenance tracking for reproducibility. */
  provenance?: EvidenceProvenance;
}

// ---------------------------------------------------------------------------
// Technique-Specific Metadata Extensions
// ---------------------------------------------------------------------------

/** XRD-specific evidence metadata. */
export interface XrdEvidenceMetadata {
  /** Miller indices (e.g., '311', '220'). */
  hkl?: string;
  /** Interplanar spacing in Ångströms. */
  dSpacing?: number;
  /** Full width at half maximum in °2θ. */
  fwhm?: number;
  /** Peak classification: 'sharp' | 'broad'. */
  classification?: 'sharp' | 'broad';
  /** Crystallite size in nm (Scherrer equation). */
  crystalliteSize?: number;
  /** Phase label from reference matching. */
  phaseLabel?: string;
  /** Space group (e.g., 'Fd-3m'). */
  spaceGroup?: string;
  /** Crystal system (e.g., 'cubic', 'hexagonal'). */
  crystalSystem?: string;
}

/** XPS-specific evidence metadata. */
export interface XpsEvidenceMetadata {
  /** Core-level orbital (e.g., 'Fe 2p3/2', 'O 1s'). */
  orbital?: string;
  /** Chemical state assignment (e.g., 'Fe³⁺', 'Fe²⁺'). */
  chemicalState?: string;
  /** Spin-orbit splitting in eV. */
  spinOrbitSplitting?: number;
  /** Background subtraction method. */
  backgroundMethod?: 'shirley' | 'linear' | 'tougaard';
  /** Full width at half maximum in eV. */
  fwhm?: number;
  /** Atomic concentration percentage. */
  atomicPercent?: number;
  /** Identified element symbol from global registry (e.g., 'C', 'Ti', 'Au'). */
  element?: string;
  /** Active core-level shell from global registry (e.g., '1s', '2p', '4f'). */
  shell?: string;
  /** Dynamic bonding assignment from global XPS registry lookup. */
  bondingAssignment?: string;
  /** Doublet splitting interval ΔE in eV from global registry (e.g., 5.7 for Ti 2p). */
  doubletSplitting?: number;
  /** C 1s charging calibration offset in eV (Observed BE − 284.8 eV). */
  chargingCalibrationOffset?: number;
}

/** FTIR-specific evidence metadata. */
export interface FtirEvidenceMetadata {
  /** Vibrational mode assignment (e.g., 'O-H stretch', 'C=O stretch'). */
  vibrationalMode?: string;
  /** Functional group (e.g., 'hydroxyl', 'carbonyl'). */
  functionalGroup?: string;
  /** Bonding environment description. */
  bondingEnvironment?: string;
  /** Band classification: 'sharp' | 'broad' | 'shoulder'. */
  bandType?: 'sharp' | 'broad' | 'shoulder';
  /** Absorption intensity category. */
  intensityCategory?: 'strong' | 'medium' | 'weak';
}

/** Raman-specific evidence metadata. */
export interface RamanEvidenceMetadata {
  /** Raman mode assignment (e.g., 'A1g', 'Eg', 'T2g'). */
  modeAssignment?: string;
  /** Local symmetry reference. */
  symmetry?: string;
  /** Band classification. */
  bandType?: 'sharp' | 'broad' | 'shoulder';
  /** Polarization dependence. */
  polarization?: string;
  /** Phonon mode identifier. */
  phononMode?: string;
}

/** XAS-specific evidence metadata. */
export interface XasEvidenceMetadata {
  /** Absorption edge (e.g., 'K-edge', 'L3-edge'). */
  edge?: string;
  /** Target element. */
  element?: string;
  /** Oxation state inferred from edge position. */
  oxidationState?: string;
  /** Pre-edge feature indicator. */
  hasPreEdgeFeature?: boolean;
  /** White line intensity. */
  whiteLineIntensity?: number;
  /** XAS region: 'XANES' | 'EXAFS'. */
  region?: 'XANES' | 'EXAFS';
}

/** TEM-specific evidence metadata. */
export interface TemEvidenceMetadata {
  /** Imaging mode (e.g., 'bright_field', 'dark_field', 'HRTEM', 'SAED'). */
  imagingMode?: string;
  /** Particle size in nm. */
  particleSize?: number;
  /** Size distribution standard deviation. */
  sizeDistributionStd?: number;
  /** d-spacing from SAED rings in Å. */
  saedDSpacing?: number;
  /** Morphology descriptor (e.g., 'spherical', 'rod', 'platelet'). */
  morphology?: string;
}

/** BET-specific evidence metadata. */
export interface BetEvidenceMetadata {
  /** Specific surface area in m²/g. */
  specificSurfaceArea?: number;
  /** BJH pore diameter in nm. */
  poreDiameter?: number;
  /** Total pore volume in cm³/g. */
  poreVolume?: number;
  /** Isotherm type (IUPAC classification). */
  isothermType?: 'I' | 'II' | 'III' | 'IV' | 'V' | 'VI';
  /** Hysteresis loop type. */
  hysteresisType?: 'H1' | 'H2' | 'H3' | 'H4' | 'none';
}

/** TPD-specific evidence metadata. */
export interface TpdEvidenceMetadata {
  /** Adsorbate molecule (e.g., 'CO2', 'NH3', 'H2'). */
  adsorbate?: string;
  /** Peak temperature in °C. */
  peakTemperature?: number;
  /** Desorption order. */
  desorptionOrder?: 1 | 2 | 3;
  /** Site type (e.g., 'acidic', 'basic', 'metallic'). */
  siteType?: string;
  /** Adsorption energy in kJ/mol. */
  adsorptionEnergy?: number;
}

/** NMR-specific evidence metadata. */
export interface NmrEvidenceMetadata {
  /** Nucleus observed (e.g., '1H', '13C', '29Si', '27Al'). */
  nucleus?: string;
  /** Chemical shift in ppm. */
  chemicalShift?: number;
  /** Multiplicity pattern. */
  multiplicity?: string;
  /** Coupling constant in Hz. */
  couplingConstant?: number;
  /** Coordination number. */
  coordinationNumber?: number;
}

/** SEM-specific evidence metadata. */
export interface SemEvidenceMetadata {
  /** Imaging mode (e.g., 'secondary_electron', 'backscattered'). */
  imagingMode?: string;
  /** Particle/grain size in μm. */
  grainSize?: number;
  /** Surface morphology descriptor. */
  morphology?: string;
  /** EDS elemental mapping results. */
  edsElements?: string[];
}

/** XRF-specific evidence metadata. */
export interface XrfEvidenceMetadata {
  /** Target element. */
  element?: string;
  /** Emission line (e.g., 'Kα', 'Lβ'). */
  emissionLine?: string;
  /** Net intensity (counts). */
  netIntensity?: number;
  /** Concentration in ppm or wt%. */
  concentration?: number;
  /** Concentration unit. */
  concentrationUnit?: 'ppm' | 'wt%' | 'at%';
}

// ---------------------------------------------------------------------------
// Evidence Provenance
// ---------------------------------------------------------------------------

/**
 * Provenance metadata for evidence reproducibility.
 *
 * Every evidence node SHOULD include provenance to ensure the full
 * audit trail from raw data → processing → evidence is preserved.
 */
export interface EvidenceProvenance {
  /** Source dataset identifier. */
  datasetId: string;
  /** Sample name or identifier. */
  sampleName?: string;
  /** Material class or category. */
  materialClass?: string;
  /** SHA-256 hash of the input dataset for integrity verification. */
  processingHash?: string;
  /** Processing parameters snapshot (JSON-serializable). */
  processingParameters?: Record<string, unknown>;
  /** ISO 8601 UTC timestamp of evidence creation. */
  createdAt: string;
  /** Engine/agent version that produced this evidence. */
  engineVersion?: string;
}

// ---------------------------------------------------------------------------
// Backward Compatibility Adapters
// ---------------------------------------------------------------------------

/**
 * Legacy fusionEngine EvidenceNode shape.
 * @deprecated Use UniversalEvidenceNode instead.
 */
export interface LegacyFusionEvidenceNode {
  id: string;
  technique: 'XRD' | 'Raman' | 'XPS' | 'FTIR';
  x: number;
  unit: string;
  label: string;
  inferredCategory?: 'crystalline' | 'non-crystalline';
  concept?: string;
}

/**
 * Legacy claimGraph EvidenceNode shape.
 * @deprecated Use UniversalEvidenceNode instead.
 */
export interface LegacyClaimGraphEvidenceNode {
  id: string;
  technique: 'XRD' | 'Raman' | 'XPS' | 'FTIR' | 'TEM' | 'BET' | 'TPD';
  value: number;
  unit: string;
  label: string;
  sample_id?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Convert a legacy fusionEngine EvidenceNode to UniversalEvidenceNode.
 *
 * @param legacy - Legacy fusionEngine evidence node.
 * @returns UniversalEvidenceNode.
 */
export function adaptFromFusionEngine(legacy: LegacyFusionEvidenceNode): UniversalEvidenceNode {
  return {
    id: legacy.id,
    technique: legacy.technique,
    primaryAxis: legacy.x,
    primaryAxisUnit: legacy.unit,
    value: 0, // FusionEngine nodes don't carry a separate value
    valueUnit: 'normalized_intensity',
    label: legacy.label,
    concept: legacy.concept,
    inferredCategory: legacy.inferredCategory,
  };
}

/**
 * Convert a legacy claimGraph EvidenceNode to UniversalEvidenceNode.
 *
 * @param legacy - Legacy claimGraph evidence node.
 * @returns UniversalEvidenceNode.
 */
export function adaptFromClaimGraph(legacy: LegacyClaimGraphEvidenceNode): UniversalEvidenceNode {
  return {
    id: legacy.id,
    technique: legacy.technique,
    primaryAxis: legacy.value,
    primaryAxisUnit: legacy.unit,
    value: legacy.value,
    valueUnit: legacy.unit,
    label: legacy.label,
  };
}

/**
 * Convert a UniversalEvidenceNode to the legacy fusionEngine shape.
 * Use this when interfacing with legacy fusionEngine consumers.
 *
 * @param node - Universal evidence node.
 * @returns Legacy fusionEngine-compatible node.
 */
export function toFusionEngineShape(node: UniversalEvidenceNode): LegacyFusionEvidenceNode {
  return {
    id: node.id,
    technique: node.technique as LegacyFusionEvidenceNode['technique'],
    x: node.primaryAxis,
    unit: node.primaryAxisUnit,
    label: node.label,
    inferredCategory: node.inferredCategory as 'crystalline' | 'non-crystalline' | undefined,
    concept: node.concept,
  };
}

/**
 * Convert a UniversalEvidenceNode to the legacy claimGraph shape.
 * Use this when interfacing with legacy claimGraph consumers.
 *
 * @param node - Universal evidence node.
 * @returns Legacy claimGraph-compatible node.
 */
export function toClaimGraphShape(node: UniversalEvidenceNode): LegacyClaimGraphEvidenceNode {
  return {
    id: node.id,
    technique: node.technique as LegacyClaimGraphEvidenceNode['technique'],
    value: node.primaryAxis,
    unit: node.primaryAxisUnit,
    label: node.label,
    sample_id: node.provenance?.datasetId,
    metadata: node.techniqueMetadata as Record<string, unknown> | undefined,
  };
}