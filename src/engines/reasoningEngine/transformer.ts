/**
 * ============================================================================
 * DIFARYX — Data Transformer: AnalysisSession → UniversalEvidenceNode[]
 * ============================================================================
 *
 * Pillar 1 of the backend pipeline implementation.
 *
 * Extracts raw parsed elements, intensity spectrum bounds, and dataset
 * variables from an AnalysisSession and normalizes them into structured
 * UniversalEvidenceNode instances populated with technique-aware metadata.
 *
 * @module reasoningEngine/transformer
 * ============================================================================
 */

import type { AnalysisSession, AnalysisTechnique, AnalysisFeature } from '../../data/analysisSessions';
import type { Technique } from '../../types/universalTechnique';
import type {
  UniversalEvidenceNode,
  EvidenceRole,
  ConfidenceLevel,
  XrdEvidenceMetadata,
  XpsEvidenceMetadata,
  FtirEvidenceMetadata,
  RamanEvidenceMetadata,
} from '../../types/universalEvidence';

// ---------------------------------------------------------------------------
// Global XPS Element-Awareness Registry
// ---------------------------------------------------------------------------

/**
 * A single sub-component entry within an XPS core-level registry window.
 * Represents one resolved bonding state at a reference binding energy.
 */
interface XpsSubComponent {
  /** Reference binding energy in eV for this bonding state. */
  referenceBE: number;
  /** Human-readable bonding assignment label. */
  bondingAssignment: string;
}

/**
 * Registry entry for one XPS core-level window.
 * Tracks element identity, shell, binding energy envelope, doublet splitting,
 * and all sub-component bonding environments.
 */
interface XpsRegistryEntry {
  /** Element symbol (e.g., 'C', 'O', 'Ti', 'Au'). */
  element: string;
  /** Active core-level shell (e.g., '1s', '2p', '4f', '3d'). */
  shell: string;
  /** Binding energy range [min, max] in eV for this core-level. */
  beRange: [number, number];
  /** Doublet spin-orbit splitting gap ΔE in eV. Undefined for singlet levels. */
  doubletGap?: number;
  /** Ordered sub-component bonding environments within this window. */
  subComponents: XpsSubComponent[];
}

/**
 * Global XPS Element-Awareness Registry
 *
 * Comprehensive multi-tiered reference table covering:
 * - Representative Elements (C, O, N, S, P, F, Cl)
 * - Transition Metals (Ti, Cr, Mn, Co, Ni, Zn)
 * - Noble Metals (Au, Ag, Pt)
 *
 * Each entry tracks the main binding energy envelope, doublet splitting gap,
 * and explicit sub-component bonding assignments for peak deconvolution.
 */
const GLOBAL_XPS_REGISTRY: XpsRegistryEntry[] = [
  // ── Representative Elements ──────────────────────────────────────────────
  {
    element: 'C',
    shell: '1s',
    beRange: [282, 290],
    subComponents: [
      { referenceBE: 284.8, bondingAssignment: 'C-C / C-H (Sp3 Carbon / Calibration Reference)' },
      { referenceBE: 286.5, bondingAssignment: 'C-O (Single Bond / Hydroxyl / Ether)' },
      { referenceBE: 288.0, bondingAssignment: 'C=O (Double Bond / Carbonyl)' },
      { referenceBE: 289.0, bondingAssignment: 'O-C=O (Carboxyl / Ester Environment)' },
    ],
  },
  {
    element: 'O',
    shell: '1s',
    beRange: [528, 536],
    subComponents: [
      { referenceBE: 529.5, bondingAssignment: 'M-O (Metal Crystalline Lattice Oxide)' },
      { referenceBE: 531.5, bondingAssignment: 'C=O / O-C=O (Surface Defect / Carbonyl Oxygen)' },
      { referenceBE: 533.0, bondingAssignment: 'C-O / O-O (Single Bond / Chemisorbed Species / H2O)' },
    ],
  },
  {
    element: 'N',
    shell: '1s',
    beRange: [396, 406],
    subComponents: [
      { referenceBE: 398.0, bondingAssignment: 'Pyridinic N / Metal-Nitride (M-N)' },
      { referenceBE: 399.5, bondingAssignment: 'Pyrrolic N / Amine / Amide (C-N / -NH2)' },
      { referenceBE: 401.3, bondingAssignment: 'Quaternary / Graphitic N (N-C)' },
      { referenceBE: 404.5, bondingAssignment: 'Oxidized N / Nitrate (N-O / NO3-)' },
    ],
  },
  {
    element: 'S',
    shell: '2p',
    beRange: [160, 172],
    doubletGap: 1.2,
    subComponents: [
      { referenceBE: 161.5, bondingAssignment: 'Metal Sulfide (M-S / S2-)' },
      { referenceBE: 163.5, bondingAssignment: 'Organic Thiol / Sulfide (C-S / -SH)' },
      { referenceBE: 167.5, bondingAssignment: 'Sulfoxide / Sulfone (C-SO-C)' },
      { referenceBE: 169.0, bondingAssignment: 'Sulfate Group (SO4 2-)' },
    ],
  },
  {
    element: 'P',
    shell: '2p',
    beRange: [128, 136],
    doubletGap: 0.84,
    subComponents: [
      { referenceBE: 129.5, bondingAssignment: 'Metal Phosphide (M-P)' },
      { referenceBE: 132.0, bondingAssignment: 'Organic Phosphorus (P-C)' },
      { referenceBE: 133.5, bondingAssignment: 'Phosphate / Phosphonate (P-O / PO4 3-)' },
    ],
  },
  {
    element: 'F',
    shell: '1s',
    beRange: [683, 690],
    subComponents: [
      { referenceBE: 684.5, bondingAssignment: 'Ionic Fluoride (M-F)' },
      { referenceBE: 688.0, bondingAssignment: 'Organic Fluorine (C-F / PTFE)' },
    ],
  },
  {
    element: 'Cl',
    shell: '2p',
    beRange: [196, 204],
    doubletGap: 1.6,
    subComponents: [
      { referenceBE: 197.5, bondingAssignment: 'Ionic Chloride (M-Cl / Cl-)' },
      { referenceBE: 200.5, bondingAssignment: 'Organic Chloride (C-Cl)' },
    ],
  },

  // ── Transition Metals ────────────────────────────────────────────────────
  {
    element: 'Ti',
    shell: '2p',
    beRange: [452, 466],
    doubletGap: 5.7,
    subComponents: [
      { referenceBE: 454.0, bondingAssignment: 'Metallic Ti (Ti0)' },
      { referenceBE: 456.5, bondingAssignment: 'Sub-oxide Crystalline (Ti3+)' },
      { referenceBE: 458.5, bondingAssignment: 'Titanium Dioxide (Ti4+ / TiO2)' },
    ],
  },
  {
    element: 'Cr',
    shell: '2p',
    beRange: [570, 590],
    doubletGap: 9.3,
    subComponents: [
      { referenceBE: 574.0, bondingAssignment: 'Metallic Cr (Cr0)' },
      { referenceBE: 576.5, bondingAssignment: 'Chromium Oxide (Cr3+ / Cr2O3)' },
      { referenceBE: 579.5, bondingAssignment: 'Chromate Environment (Cr6+)' },
    ],
  },
  {
    element: 'Mn',
    shell: '2p',
    beRange: [638, 655],
    doubletGap: 11.8,
    subComponents: [
      { referenceBE: 639.0, bondingAssignment: 'Metallic Mn (Mn0)' },
      { referenceBE: 640.5, bondingAssignment: 'Manganese Oxide (Mn2+ / MnO)' },
      { referenceBE: 641.2, bondingAssignment: 'Manganese Oxide (Mn3+ / Mn2O3)' },
      { referenceBE: 642.0, bondingAssignment: 'Manganese Dioxide (Mn4+ / MnO2)' },
    ],
  },
  {
    element: 'Co',
    shell: '2p',
    beRange: [775, 805],
    doubletGap: 15.0,
    subComponents: [
      { referenceBE: 778.0, bondingAssignment: 'Metallic Co (Co0)' },
      { referenceBE: 779.5, bondingAssignment: 'Cobaltic State (Co3+)' },
      { referenceBE: 781.0, bondingAssignment: 'Cobalous Oxide (Co2+ / High-spin Satellite Active)' },
    ],
  },
  {
    element: 'Ni',
    shell: '2p',
    beRange: [850, 885],
    doubletGap: 17.5,
    subComponents: [
      { referenceBE: 852.7, bondingAssignment: 'Metallic Ni (Ni0)' },
      { referenceBE: 855.5, bondingAssignment: 'Nickelous Oxide/Hydroxide (Ni2+ / NiO / Strong Satellite)' },
    ],
  },
  {
    element: 'Zn',
    shell: '2p',
    beRange: [1020, 1045],
    doubletGap: 23.0,
    subComponents: [
      { referenceBE: 1021.5, bondingAssignment: 'Metallic Zn (Zn0)' },
      { referenceBE: 1022.0, bondingAssignment: 'Zinc Oxide (Zn2+ / ZnO)' },
    ],
  },

  // ── Noble Metal Standards ────────────────────────────────────────────────
  {
    element: 'Au',
    shell: '4f',
    beRange: [80, 90],
    doubletGap: 3.7,
    subComponents: [
      { referenceBE: 84.0, bondingAssignment: 'Metallic Gold Calibration Standard (Au0)' },
    ],
  },
  {
    element: 'Ag',
    shell: '3d',
    beRange: [364, 374],
    doubletGap: 6.0,
    subComponents: [
      { referenceBE: 368.2, bondingAssignment: 'Metallic Silver Reference (Ag0)' },
    ],
  },
  {
    element: 'Pt',
    shell: '4f',
    beRange: [68, 78],
    doubletGap: 3.3,
    subComponents: [
      { referenceBE: 71.2, bondingAssignment: 'Metallic Platinum Catalyst (Pt0)' },
    ],
  },
];

/** Result of a global XPS registry lookup. */
interface XpsRegistryLookupResult {
  /** Identified element symbol. */
  element: string;
  /** Active core-level shell. */
  shell: string;
  /** Doublet splitting gap ΔE in eV, if applicable. */
  doubletGap?: number;
  /** Nearest sub-component bonding assignment. */
  bondingAssignment: string;
  /** C 1s charging calibration offset in eV (only when C 1s calibration reference detected). */
  chargingCalibrationOffset?: number;
}

/**
 * Lookup the global XPS registry for the nearest matching entry given a raw binding energy.
 *
 * Algorithm:
 * 1. Find the registry entry whose BE range contains the observed energy.
 * 2. If multiple entries match (rare, due to overlap), pick the one with the
 *    smallest range width (most specific).
 * 3. Among the entry's sub-components, find the one with minimum |BE - referenceBE|.
 * 4. Return the element, shell, doubletGap, and bonding assignment.
 *
 * @param bindingEnergy - Observed binding energy in eV.
 * @returns Registry lookup result or null if no match found.
 */
export function lookupXpsRegistry(bindingEnergy: number): XpsRegistryLookupResult | null {
  // Step 1: Find all matching entries
  const candidates = GLOBAL_XPS_REGISTRY.filter(
    (entry) => bindingEnergy >= entry.beRange[0] && bindingEnergy <= entry.beRange[1],
  );

  if (candidates.length === 0) return null;

  // Step 2: Pick the most specific (smallest range width)
  candidates.sort(
    (a, b) => (a.beRange[1] - a.beRange[0]) - (b.beRange[1] - b.beRange[0]),
  );
  const best = candidates[0];

  // Step 3: Find nearest sub-component
  let nearestIndex = 0;
  let minDist = Infinity;
  for (let i = 0; i < best.subComponents.length; i++) {
    const dist = Math.abs(bindingEnergy - best.subComponents[i].referenceBE);
    if (dist < minDist) {
      minDist = dist;
      nearestIndex = i;
    }
  }

  // Step 4: Compute charging calibration offset if this is C 1s calibration reference
  let chargingCalibrationOffset: number | undefined;
  if (best.element === 'C' && best.shell === '1s') {
    const c1sCalibrationBE = 284.8;
    chargingCalibrationOffset = bindingEnergy - c1sCalibrationBE;
  }

  return {
    element: best.element,
    shell: best.shell,
    doubletGap: best.doubletGap,
    bondingAssignment: best.subComponents[nearestIndex].bondingAssignment,
    chargingCalibrationOffset,
  };
}

/**
 * Calculate the C 1s charging calibration offset from observed binding energy.
 *
 * @param observedBE - Observed C 1s binding energy in eV.
 * @returns Offset in eV (observed - 284.8 eV reference).
 */
export function calculateChargingCalibration(observedBE: number): number {
  const C1S_REFERENCE_BE = 284.8;
  return observedBE - C1S_REFERENCE_BE;
}

// ---------------------------------------------------------------------------
// Technique Mapping (lowercase session → uppercase engine)
// ---------------------------------------------------------------------------

const TECHNIQUE_MAP: Record<AnalysisTechnique, Technique> = {
  xrd: 'XRD',
  xps: 'XPS',
  ftir: 'FTIR',
  raman: 'Raman',
};

/**
 * Map a lowercase AnalysisTechnique to an uppercase Technique identifier.
 */
function mapTechnique(technique: AnalysisTechnique): Technique {
  return TECHNIQUE_MAP[technique];
}

// ---------------------------------------------------------------------------
// Axis / Unit resolution per technique
// ---------------------------------------------------------------------------

interface AxisDescriptor {
  primaryAxisKey: string;
  primaryAxisUnit: string;
  valueKey: string;
  valueUnit: string;
}

const AXIS_DESCRIPTORS: Record<AnalysisTechnique, AxisDescriptor> = {
  xrd: {
    primaryAxisKey: '2theta',
    primaryAxisUnit: '°2θ',
    valueKey: 'intensity',
    valueUnit: 'normalized_intensity',
  },
  xps: {
    primaryAxisKey: 'binding energy',
    primaryAxisUnit: 'eV',
    valueKey: 'intensity',
    valueUnit: 'counts',
  },
  ftir: {
    primaryAxisKey: 'wavenumber',
    primaryAxisUnit: 'cm⁻¹',
    valueKey: 'intensity',
    valueUnit: 'transmittance_%',
  },
  raman: {
    primaryAxisKey: 'Raman shift',
    primaryAxisUnit: 'cm⁻¹',
    valueKey: 'intensity',
    valueUnit: 'normalized_intensity',
  },
};

// ---------------------------------------------------------------------------
// Confidence inference helpers
// ---------------------------------------------------------------------------

/**
 * Infer a ConfidenceLevel from a feature's confidence/status string.
 */
function inferConfidence(feature: AnalysisFeature): ConfidenceLevel {
  const confidenceStr = (feature.values['confidence'] || feature.values['match confidence'] || '').toLowerCase();
  if (confidenceStr.includes('high') || confidenceStr.includes('supported')) return 'high';
  if (confidenceStr.includes('medium') || confidenceStr.includes('contextual')) return 'medium';
  if (confidenceStr.includes('low') || confidenceStr.includes('pending') || confidenceStr.includes('limited')) return 'low';
  return 'uncertain';
}

/**
 * Infer the evidence role from the feature's label and status.
 */
function inferRole(feature: AnalysisFeature): EvidenceRole {
  const label = feature.label.toLowerCase();
  const status = (feature.values['status'] || '').toLowerCase();
  if (label.includes('primary') || label.includes('main')) return 'primary';
  if (label.includes('secondary') || label.includes('shoulder')) return 'supporting';
  if (status.includes('context') || label.includes('support')) return 'contextual';
  return 'primary';
}

// ---------------------------------------------------------------------------
// Numeric parsing helper
// ---------------------------------------------------------------------------

/**
 * Parse the first numeric token from a string value.
 * Handles formats like '35.5', '933.4 eV', '1084 cm-1', '100', '2.53 A'.
 */
function parseNumeric(raw: string | undefined): number {
  if (!raw) return 0;
  const match = raw.match(/-?\d+\.?\d*/);
  return match ? parseFloat(match[0]) : 0;
}

// ---------------------------------------------------------------------------
// XPS Core-Level & Oxidation-State Parsing Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a core-level orbital label from raw feature region/assignment text.
 * Handles formats like "Cu 2p3/2", "Fe 2p", "O 1s", "C 1s", "Ni 2p1/2".
 */
function parseCoreLevel(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  // Match patterns: Element + shell + optional sub-shell (e.g., "Fe 2p3/2", "O 1s")
  const match = raw.match(/\b([A-Z][a-z]?\s+\d[spdfg]\d*\/?\d*)\b/i);
  return match ? match[1] : raw;
}

/**
 * Extract the parent orbital shell from a core-level label for spin-orbit splitting detection.
 * e.g., "Cu 2p3/2" → "Cu 2p", "Fe 2p" → "Fe 2p"
 */
function extractParentShell(coreLevel: string | undefined): string | undefined {
  if (!coreLevel) return undefined;
  const match = coreLevel.match(/\b([A-Z][a-z]?\s+\d[spdfg])\b/i);
  return match ? match[1] : undefined;
}

/**
 * Parse oxidation state from chemical state strings.
 * Handles: "Fe3+", "Fe³⁺", "Cu2+", "Cu²⁺", "Fe2O3", mixed-valence patterns.
 */
function parseOxidationState(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  // Match unicode superscript digits: Fe³⁺, Cu²⁺
  const unicodeMatch = raw.match(/([A-Z][a-z]?[²³⁴⁵⁶⁷⁸⁹⁰⁺⁻]+)/);
  if (unicodeMatch) return unicodeMatch[1];
  // Match ASCII: Fe3+, Cu2+, Fe2+/Fe3+
  const asciiMatch = raw.match(/([A-Z][a-z]?\d*[+\-])/);
  if (asciiMatch) return asciiMatch[1];
  // Match mixed-valence patterns like "Fe3+/Fe2+", "Cu2+/Cu+"
  const mixedMatch = raw.match(/([A-Z][a-z]?\d*[+\-]\/[A-Z][a-z]?\d*[+\-])/);
  if (mixedMatch) return mixedMatch[1];
  return raw;
}

/**
 * Detect mixed-valence states from the chemical state string.
 * Returns a descriptive label if mixed-valence is detected.
 */
function detectMixedValence(chemicalState: string | undefined): string | undefined {
  if (!chemicalState) return undefined;
  // Pattern: "Fe3+/Fe2+", "Cu2+/Cu+", "Mn4+/Mn3+"
  const mixedPattern = /([A-Z][a-z]?\d*[+\-])\s*\/\s*([A-Z][a-z]?\d*[+\-])/i;
  const match = chemicalState.match(mixedPattern);
  if (match) return `mixed-valence ${match[1]}/${match[2]}`;
  return undefined;
}

// ---------------------------------------------------------------------------
// Technique-specific metadata builders
// ---------------------------------------------------------------------------

function buildXrdMetadata(feature: AnalysisFeature): XrdEvidenceMetadata {
  const hklMatch = feature.values['assignment']?.match(/\((\d+)\)/);
  return {
    hkl: hklMatch ? hklMatch[1] : undefined,
    dSpacing: parseNumeric(feature.values['d-spacing']),
    fwhm: feature.values['FWHM'] === 'broad' ? undefined : parseNumeric(feature.values['FWHM']),
    classification: feature.values['FWHM'] === 'broad' ? 'broad' : 'sharp',
    phaseLabel: feature.values['best match'] !== 'pending material assignment'
      ? feature.values['best match']
      : undefined,
  };
}

function buildXpsMetadata(feature: AnalysisFeature): XpsEvidenceMetadata {
  // Extract binding energy from the feature's primary data axis
  const bindingEnergy = parseNumeric(feature.values['binding energy']) || parseNumeric(feature.values['binding-energy']);

  // Parse core-level orbital assignment
  const rawRegion = feature.values['region'] || feature.values['assignment'] || undefined;
  const coreLevel = parseCoreLevel(rawRegion);
  const parentShell = extractParentShell(coreLevel);

  // Parse chemical state and detect mixed-valence patterns
  const rawChemicalState = feature.values['oxidation-state assignment']
    || feature.values['component']
    || feature.values['chemical state']
    || undefined;
  const chemicalState = parseOxidationState(rawChemicalState);
  const mixedValence = detectMixedValence(rawChemicalState);

  // Parse FWHM from feature values
  const fwhm = parseNumeric(feature.values['FWHM']) || parseNumeric(feature.values['fwhm']) || undefined;

  // Parse spin-orbit splitting if a sub-shell orbital is present (e.g., 2p3/2 vs 2p1/2)
  let spinOrbitSplitting: number | undefined;
  if (coreLevel && coreLevel.includes('/')) {
    // If we have paired data, the splitting can be derived from the BE difference
    spinOrbitSplitting = parseNumeric(feature.values['spin-orbit splitting'])
      || parseNumeric(feature.values['sos'])
      || undefined;
  }

  // Parse atomic percent
  const atomicPercent = parseNumeric(feature.values['atomic percent'])
    || parseNumeric(feature.values['atomic %'])
    || parseNumeric(feature.values['at%'])
    || undefined;

  // Build the orbital label — prefer parsed core-level, fallback to raw region
  const orbitalLabel = coreLevel || rawRegion;

  // Build the chemical state label — prefer parsed state with mixed-valence annotation
  const chemicalStateLabel = mixedValence
    ? `${chemicalState} (${mixedValence})`
    : chemicalState;

  // ── Global XPS Registry Cross-Matching ────────────────────────────────────
  // Cross-match the observed binding energy against the global XPS registry
  // to resolve element identity, core-level shell, doublet splitting, and
  // specific bonding assignment via sub-component window matching.
  const registryLookup = bindingEnergy > 0 ? lookupXpsRegistry(bindingEnergy) : null;

  // Build the final element label — prefer registry-resolved element, fallback to parsed core-level
  const resolvedElement = registryLookup?.element
    || (coreLevel ? coreLevel.match(/^([A-Z][a-z]?)/)?.[1] : undefined);

  // Build the final shell label — prefer registry-resolved shell
  const resolvedShell = registryLookup?.shell
    || (coreLevel ? coreLevel.match(/\d[spdfg]/i)?.[0] : undefined);

  // Resolve doublet splitting — prefer registry ΔE, fallback to parsed spin-orbit splitting
  const resolvedDoubletSplitting = registryLookup?.doubletGap ?? spinOrbitSplitting;

  // Charging calibration offset — automatically calculated for C 1s references
  const chargingOffset = registryLookup?.chargingCalibrationOffset;

  return {
    orbital: orbitalLabel,
    chemicalState: chemicalStateLabel,
    spinOrbitSplitting,
    backgroundMethod: undefined,
    fwhm: fwhm && fwhm > 0 ? fwhm : undefined,
    atomicPercent: atomicPercent && atomicPercent > 0 ? atomicPercent : undefined,
    // Global registry enrichment fields
    element: resolvedElement,
    shell: resolvedShell,
    bondingAssignment: registryLookup?.bondingAssignment,
    doubletSplitting: resolvedDoubletSplitting,
    chargingCalibrationOffset: chargingOffset,
  };
}

// ---------------------------------------------------------------------------
// FTIR Wavenumber → Functional Group Lookup Table
// ---------------------------------------------------------------------------

interface FtirBandEntry {
  minCm: number;
  maxCm: number;
  functionalGroup: string;
  vibrationalMode: string;
  bondingEnvironment: string;
  bandType: 'sharp' | 'broad' | 'shoulder';
}

const FTIR_BAND_LOOKUP: FtirBandEntry[] = [
  {
    minCm: 0, maxCm: 600,
    functionalGroup: 'Metal–Oxygen (framework)',
    vibrationalMode: 'M–O tetrahedral stretching',
    bondingEnvironment: 'Spinel framework M–O tetrahedral coordination',
    bandType: 'broad',
  },
  {
    minCm: 600, maxCm: 800,
    functionalGroup: 'Metal–Oxygen–Metal (bridging)',
    vibrationalMode: 'M–O–M bridging mode',
    bondingEnvironment: 'Metal oxide bridging vibrations',
    bandType: 'broad',
  },
  {
    minCm: 800, maxCm: 1000,
    functionalGroup: 'Siloxane (Si–O–Si)',
    vibrationalMode: 'Si–O–Si asymmetric stretching',
    bondingEnvironment: 'SBA-15 mesoporous silica support framework',
    bandType: 'sharp',
  },
  {
    minCm: 1000, maxCm: 1300,
    functionalGroup: 'Siloxane / C–O (stretching)',
    vibrationalMode: 'Si–O / C–O stretching',
    bondingEnvironment: 'Silica framework or organic C–O bond region',
    bandType: 'broad',
  },
  {
    minCm: 1300, maxCm: 1800,
    functionalGroup: 'Organic / Nitrate / Carbonate',
    vibrationalMode: 'C=C / C=O / NO₃⁻ stretching',
    bondingEnvironment: 'Organic functional groups or inorganic anion region',
    bandType: 'broad',
  },
  {
    minCm: 2800, maxCm: 3000,
    functionalGroup: 'Alkyl C–H',
    vibrationalMode: 'C–H stretching',
    bondingEnvironment: 'Alkyl chain or organic C–H bonds',
    bandType: 'sharp',
  },
  {
    minCm: 3000, maxCm: 3200,
    functionalGroup: 'Aromatic C–H / N–H',
    vibrationalMode: 'C–H / N–H stretching',
    bondingEnvironment: 'Aromatic ring or amine N–H region',
    bandType: 'broad',
  },
  {
    minCm: 3200, maxCm: 3600,
    functionalGroup: 'Hydroxyl / Silanol',
    vibrationalMode: 'O–H stretching',
    bondingEnvironment: 'Surface hydroxyl groups or silanol O–H bands (SBA-15 support)',
    bandType: 'broad',
  },
  {
    minCm: 3600, maxCm: 4000,
    functionalGroup: 'Isolated Hydroxyl',
    vibrationalMode: 'O–H stretching (free)',
    bondingEnvironment: 'Isolated surface hydroxyl or terminal silanol',
    bandType: 'sharp',
  },
];

/**
 * Look up the FTIR band entry for a given wavenumber position.
 * Returns the matching entry or undefined if no range matches.
 */
function lookupFtirBand(wavenumber: number): FtirBandEntry | undefined {
  return FTIR_BAND_LOOKUP.find((entry) => wavenumber >= entry.minCm && wavenumber < entry.maxCm);
}

function buildFtirMetadata(feature: AnalysisFeature): FtirEvidenceMetadata {
  const intensityRaw = feature.values['intensity']?.toLowerCase() || '';
  const intensityCat = intensityRaw.includes('strong')
    ? 'strong'
    : intensityRaw.includes('medium')
      ? 'medium'
      : 'weak';

  // Parse the wavenumber position for band lookup
  const wavenumber = parseNumeric(feature.values['wavenumber'])
    || parseNumeric(feature.values['position'])
    || 0;

  // Cross-reference with FTIR band lookup table
  const bandLookup = lookupFtirBand(wavenumber);

  // Prioritize explicit feature data, fallback to lookup table
  const vibrationalMode = feature.values['assignment']
    || (bandLookup ? bandLookup.vibrationalMode : undefined);
  const functionalGroup = feature.values['functional group']
    || (bandLookup ? bandLookup.functionalGroup : undefined);
  const bondingEnvironment = feature.values['assignment']
    || (bandLookup ? bandLookup.bondingEnvironment : undefined);
  const bandType = bandLookup ? bandLookup.bandType : 'broad';

  return {
    vibrationalMode,
    functionalGroup,
    bondingEnvironment,
    bandType,
    intensityCategory: intensityCat as 'strong' | 'medium' | 'weak',
  };
}

// ---------------------------------------------------------------------------
// Raman Shift → Phonon Mode / Symmetry Lookup Table
// ---------------------------------------------------------------------------

interface RamanModeEntry {
  minCm: number;
  maxCm: number;
  phononMode: string;
  symmetry: string;
  bandType: 'sharp' | 'broad' | 'shoulder';
}

const RAMAN_MODE_LOOKUP: RamanModeEntry[] = [
  {
    minCm: 150, maxCm: 200,
    phononMode: 'Acoustic / Lattice',
    symmetry: 'Translational lattice mode',
    bandType: 'broad',
  },
  {
    minCm: 200, maxCm: 300,
    phononMode: 'Eg',
    symmetry: 'Eg — spinel low-frequency mode',
    bandType: 'sharp',
  },
  {
    minCm: 300, maxCm: 450,
    phononMode: 'T2g',
    symmetry: 'T2g — spinel mid-frequency bending mode',
    bandType: 'sharp',
  },
  {
    minCm: 450, maxCm: 550,
    phononMode: 'T2g / Eg',
    symmetry: 'T2g / Eg — spinel fingerprint region',
    bandType: 'sharp',
  },
  {
    minCm: 550, maxCm: 600,
    phononMode: 'T2g (high)',
    symmetry: 'T2g — high-frequency spinel bending',
    bandType: 'sharp',
  },
  {
    minCm: 600, maxCm: 700,
    phononMode: 'A1g',
    symmetry: 'A1g — spinel high-frequency M–O stretching fingerprint',
    bandType: 'sharp',
  },
  {
    minCm: 700, maxCm: 800,
    phononMode: 'A1g (metal–oxygen)',
    symmetry: 'A1g — metal–oxygen symmetric stretch',
    bandType: 'sharp',
  },
  {
    minCm: 800, maxCm: 1100,
    phononMode: 'Si–O / Carbonate',
    symmetry: 'Silica framework or carbonate internal mode',
    bandType: 'broad',
  },
  {
    minCm: 1100, maxCm: 1700,
    phononMode: 'D / G band',
    symmetry: 'Carbon D-band / G-band (disorder / graphitic)',
    bandType: 'broad',
  },
];

/**
 * Look up the Raman mode entry for a given Raman shift.
 * Returns the matching entry or undefined if no range matches.
 */
function lookupRamanMode(shift: number): RamanModeEntry | undefined {
  return RAMAN_MODE_LOOKUP.find((entry) => shift >= entry.minCm && shift < entry.maxCm);
}

function buildRamanMetadata(feature: AnalysisFeature): RamanEvidenceMetadata {
  // Parse the Raman shift position for mode lookup
  const ramanShift = parseNumeric(feature.values['Raman shift'])
    || parseNumeric(feature.values['raman shift'])
    || parseNumeric(feature.values['position'])
    || 0;

  // Cross-reference with Raman mode lookup table
  const modeLookup = lookupRamanMode(ramanShift);

  // Prioritize explicit feature data, fallback to lookup table
  const modeAssignment = feature.values['mode assignment']
    || (modeLookup ? modeLookup.phononMode : undefined);
  const symmetry = feature.values['lattice/local symmetry note']
    || (modeLookup ? modeLookup.symmetry : undefined);
  const phononMode = (modeLookup ? modeLookup.phononMode : undefined);
  const bandType = modeLookup ? modeLookup.bandType : 'sharp';

  return {
    modeAssignment,
    symmetry,
    bandType,
    phononMode,
  };
}

function buildTechniqueMetadata(
  technique: AnalysisTechnique,
  feature: AnalysisFeature,
): XrdEvidenceMetadata | XpsEvidenceMetadata | FtirEvidenceMetadata | RamanEvidenceMetadata {
  switch (technique) {
    case 'xrd': return buildXrdMetadata(feature);
    case 'xps': return buildXpsMetadata(feature);
    case 'ftir': return buildFtirMetadata(feature);
    case 'raman': return buildRamanMetadata(feature);
  }
}

// ---------------------------------------------------------------------------
// Graph-marker evidence node builder
// ---------------------------------------------------------------------------

function buildMarkerNodes(session: AnalysisSession): UniversalEvidenceNode[] {
  const descriptor = AXIS_DESCRIPTORS[session.technique];
  const technique = mapTechnique(session.technique);

  return session.graphData.markers.map((marker, index) => ({
    id: `${session.analysisId}-marker-${index}`,
    technique,
    primaryAxis: marker.position,
    primaryAxisUnit: descriptor.primaryAxisUnit,
    value: marker.intensity,
    valueUnit: descriptor.valueUnit,
    label: marker.label,
    concept: 'spectrum_marker',
    role: 'supporting' as EvidenceRole,
    confidence: 'medium' as ConfidenceLevel,
    provenance: {
      datasetId: session.analysisId,
      sampleName: session.title,
      createdAt: session.updatedAt,
      engineVersion: '1.0.0',
    },
  }));
}

// ---------------------------------------------------------------------------
// Feature evidence node builder
// ---------------------------------------------------------------------------

function buildFeatureNodes(session: AnalysisSession): UniversalEvidenceNode[] {
  const descriptor = AXIS_DESCRIPTORS[session.technique];
  const technique = mapTechnique(session.technique);

  return session.extractedFeatures.map((feature) => {
    const primaryAxis = parseNumeric(feature.values[descriptor.primaryAxisKey]);
    const value = parseNumeric(feature.values[descriptor.valueKey]);

    return {
      id: `${session.analysisId}-${feature.id}`,
      technique,
      primaryAxis,
      primaryAxisUnit: descriptor.primaryAxisUnit,
      value,
      valueUnit: descriptor.valueUnit,
      label: feature.label,
      concept: feature.values['assignment'] || feature.values['mode assignment'] || feature.values['functional group'] || 'evidence',
      role: inferRole(feature),
      confidence: inferConfidence(feature),
      techniqueMetadata: buildTechniqueMetadata(session.technique, feature),
      provenance: {
        datasetId: session.analysisId,
        sampleName: session.title,
        processingParameters: Object.fromEntries(
          session.processingParameters.map((p) => [p.id, p.value]),
        ),
        createdAt: session.updatedAt,
        engineVersion: '1.0.0',
      },
    } satisfies UniversalEvidenceNode;
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Transform an AnalysisSession into an array of UniversalEvidenceNode instances.
 *
 * Extracts both extracted feature evidence and graph-marker evidence from the
 * session, normalizing them into structured nodes with technique-aware metadata
 * (e.g., XrdEvidenceMetadata, XpsEvidenceMetadata, FtirEvidenceMetadata,
 * RamanEvidenceMetadata).
 *
 * @param session - The source AnalysisSession to transform.
 * @returns Array of UniversalEvidenceNode instances ready for reasoning engine ingestion.
 */
export function transformSessionToEvidenceNodes(session: AnalysisSession): UniversalEvidenceNode[] {
  const featureNodes = buildFeatureNodes(session);
  const markerNodes = buildMarkerNodes(session);
  return [...featureNodes, ...markerNodes];
}
