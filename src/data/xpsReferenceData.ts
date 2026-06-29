/**
 * XPS Reference Data for CuFe₂O₄ (Copper Ferrite)
 * 
 * This module contains scientifically accurate X-ray Photoelectron Spectroscopy (XPS)
 * binding energies for copper ferrite characterization. All values are validated against
 * peer-reviewed literature and XPS databases.
 * 
 * Literature Sources:
 * - Biesinger, M. C., et al. (2009). "Resolving surface chemical states in XPS analysis
 *   of first row transition metals, oxides and hydroxides: Cr, Mn, Fe, Co and Ni."
 *   Applied Surface Science, 257(7), 2717-2730.
 * - Biesinger, M. C., et al. (2011). "Resolving surface chemical states in XPS analysis
 *   of first row transition metals, oxides and hydroxides: Sc, Ti, V, Cu and Zn."
 *   Applied Surface Science, 257(3), 887-898.
 * - NIST XPS Database (https://srdata.nist.gov/xps/)
 */

/**
 * Interface for XPS core level reference data
 */
export interface XpsCoreLevelReference {
  /** Chemical element symbol */
  element: string;
  
  /** Oxidation state (e.g., "2+", "3+") */
  oxidationState: string;
  
  /** Core level designation (e.g., "2p3/2", "2p1/2", "1s") */
  coreLevel: string;
  
  /** Binding energy in eV */
  bindingEnergy: number;
  
  /** Experimental uncertainty in eV */
  uncertainty: number;
  
  /** Full width at half maximum (FWHM) range [min, max] in eV */
  fwhm: [number, number];
  
  /** Spin-orbit splitting in eV (for doublets like 2p3/2 and 2p1/2) */
  spinOrbitSplitting?: number;
  
  /** Satellite peak offset from main peak in eV (for transition metals) */
  satelliteOffset?: number;
  
  /** Satellite peak intensity relative to main peak (0-1 scale) */
  satelliteIntensity?: number;
  
  /** Literature source citation */
  literatureSource: string;
  dbSource?: string;
  sourceId?: string;
  sourceDoi?: string;
  matchSource?: string;
  formula?: string;
}

/**
 * XPS reference data for CuFe₂O₄ characterization
 * 
 * Copper ferrite (CuFe₂O₄) has an inverse spinel structure where:
 * - Cu²⁺ ions occupy octahedral sites
 * - Fe³⁺ ions occupy both tetrahedral and octahedral sites
 * - O²⁻ ions form the spinel lattice
 * 
 * XPS is surface-sensitive (sampling depth 5-10 nm) and provides chemical state information
 * through core-level binding energies.
 */
export const XPS_REFERENCE_DATA: XpsCoreLevelReference[] = [
  // Copper 2p doublet (Cu²⁺ oxidation state)
  {
    element: 'Cu',
    oxidationState: '2+',
    coreLevel: '2p3/2',
    bindingEnergy: 933.6,
    uncertainty: 0.5,
    fwhm: [2.0, 3.0],
    spinOrbitSplitting: 19.8,
    satelliteOffset: 8.6,
    satelliteIntensity: 0.4,
    literatureSource: 'Biesinger 2010',
    dbSource: 'literature',
    sourceId: 'biesinger-2010-cu',
    sourceDoi: '10.1016/j.apsusc.2010.07.086',
    matchSource: 'literature',
    formula: 'CuO'
  },
  {
    element: 'Cu',
    oxidationState: '2+',
    coreLevel: '2p1/2',
    bindingEnergy: 953.4,
    uncertainty: 0.5,
    fwhm: [2.0, 3.0],
    spinOrbitSplitting: 19.8,
    satelliteOffset: 8.6,
    satelliteIntensity: 0.4,
    literatureSource: 'Biesinger 2010',
    dbSource: 'literature',
    sourceId: 'biesinger-2010-cu',
    sourceDoi: '10.1016/j.apsusc.2010.07.086',
    matchSource: 'literature',
    formula: 'CuO'
  },
  
  // Iron 2p doublet (Fe³⁺ oxidation state)
  {
    element: 'Fe',
    oxidationState: '3+',
    coreLevel: '2p3/2',
    bindingEnergy: 711.0,
    uncertainty: 0.5,
    fwhm: [2.5, 3.5],
    spinOrbitSplitting: 13.5,
    literatureSource: 'Biesinger et al., Appl. Surf. Sci. 257 (2011) 2717',
    dbSource: 'literature',
    sourceDoi: '10.1016/j.apsusc.2010.10.051',
    matchSource: 'literature',
    formula: 'Fe2O3'
  },
  {
    element: 'Fe',
    oxidationState: '3+',
    coreLevel: '2p1/2',
    bindingEnergy: 724.5,
    uncertainty: 0.5,
    fwhm: [2.5, 3.5],
    spinOrbitSplitting: 13.5,
    literatureSource: 'Biesinger et al., Appl. Surf. Sci. 257 (2011) 2717',
    dbSource: 'literature',
    sourceDoi: '10.1016/j.apsusc.2010.10.051',
    matchSource: 'literature',
    formula: 'Fe2O3'
  },
  
  // Oxygen 1s (lattice oxygen in spinel structure)
  {
    element: 'O',
    oxidationState: '2-',
    coreLevel: '1s',
    bindingEnergy: 529.8,
    uncertainty: 0.3,
    fwhm: [2.0, 2.5],
    literatureSource: 'NIST XPS Database, metal oxide lattice oxygen'
  },
  
  // Oxygen 1s (surface hydroxyl groups)
  {
    element: 'O',
    oxidationState: '2-',
    coreLevel: '1s',
    bindingEnergy: 531.5,
    uncertainty: 0.5,
    fwhm: [2.0, 3.0],
    literatureSource: 'NIST XPS Database, hydroxyl oxygen'
  },

  // Copper 2p doublet (Cu⁺ / Cu(I) reduced surface state)
  {
    element: 'Cu',
    oxidationState: '1+',
    coreLevel: '2p3/2',
    bindingEnergy: 932.5,
    uncertainty: 0.3,
    fwhm: [1.8, 2.6],
    spinOrbitSplitting: 19.8,
    literatureSource: 'NIST XPS Database; Biesinger et al., Appl. Surf. Sci. 257, 887 (2011)',
    dbSource: 'nist',
    sourceDoi: undefined,
    matchSource: 'literature',
    formula: 'Cu2O'
  },
  {
    element: 'Cu',
    oxidationState: '1+',
    coreLevel: '2p1/2',
    bindingEnergy: 952.3,
    uncertainty: 0.3,
    fwhm: [1.8, 2.6],
    spinOrbitSplitting: 19.8,
    literatureSource: 'NIST XPS Database; Biesinger et al., Appl. Surf. Sci. 257, 887 (2011)',
    dbSource: 'nist',
    sourceDoi: undefined,
    matchSource: 'literature',
    formula: 'Cu2O'
  },

  // Cobalt 2p doublet (mixed Co(II)/Co(III) surface states in spinel ferrite)
  {
    element: 'Co',
    oxidationState: '2+/3+',
    coreLevel: '2p3/2',
    bindingEnergy: 780.0,
    uncertainty: 0.5,
    fwhm: [2.5, 3.5],
    spinOrbitSplitting: 15.5,
    satelliteOffset: 6.0,
    satelliteIntensity: 0.3,
    literatureSource: 'Biesinger et al., Appl. Surf. Sci. 257, 2717 (2009)'
  },
  {
    element: 'Co',
    oxidationState: '2+/3+',
    coreLevel: '2p1/2',
    bindingEnergy: 795.5,
    uncertainty: 0.5,
    fwhm: [2.5, 3.5],
    spinOrbitSplitting: 15.5,
    literatureSource: 'Biesinger et al., Appl. Surf. Sci. 257, 2717 (2009)'
  },

  // Carbon 1s reference states (adventitious + oxidized carbon environments)
  {
    element: 'C',
    oxidationState: '0',
    coreLevel: '1s',
    bindingEnergy: 284.8,
    uncertainty: 0.3,
    fwhm: [1.0, 1.8],
    literatureSource: 'NIST XPS Database; adventitious carbon reference'
  },
  {
    element: 'C',
    oxidationState: '2+',
    coreLevel: '1s',
    bindingEnergy: 286.5,
    uncertainty: 0.3,
    fwhm: [1.0, 1.8],
    literatureSource: 'NIST XPS Database; C–O environments'
  },
  {
    element: 'C',
    oxidationState: '4+',
    coreLevel: '1s',
    bindingEnergy: 288.2,
    uncertainty: 0.3,
    fwhm: [1.0, 1.8],
    literatureSource: 'NIST XPS Database; O–C=O / carbonate environments'
  },
  
  // Nitrogen 1s references
  {
    element: 'N',
    oxidationState: '3-',
    coreLevel: '1s',
    bindingEnergy: 399.8,
    uncertainty: 0.4,
    fwhm: [1.2, 2.0],
    literatureSource: 'NIST XPS Database — organic nitrogen / amines'
  },
  {
    element: 'N',
    oxidationState: 'ammonium',
    coreLevel: '1s',
    bindingEnergy: 401.5,
    uncertainty: 0.5,
    fwhm: [1.2, 2.2],
    literatureSource: 'NIST XPS Database — protonated nitrogen'
  },
  {
    element: 'N',
    oxidationState: '5+',
    coreLevel: '1s',
    bindingEnergy: 405.5,
    uncertainty: 0.5,
    fwhm: [1.2, 2.2],
    literatureSource: 'NIST XPS Database — nitrate species'
  },

  // Silicon 2p references
  {
    element: 'Si',
    oxidationState: '4+',
    coreLevel: '2p',
    bindingEnergy: 103.3,
    uncertainty: 0.3,
    fwhm: [1.3, 2.1],
    literatureSource: 'NIST XPS Database — silica (SiO2)'
  },
  {
    element: 'Si',
    oxidationState: '0',
    coreLevel: '2p',
    bindingEnergy: 99.3,
    uncertainty: 0.2,
    fwhm: [0.6, 1.2],
    literatureSource: 'NIST XPS Database — elemental silicon'
  },

  // Aluminum 2p references
  {
    element: 'Al',
    oxidationState: '3+',
    coreLevel: '2p',
    bindingEnergy: 74.5,
    uncertainty: 0.3,
    fwhm: [1.2, 2.0],
    literatureSource: 'NIST XPS Database — aluminum oxide'
  },
  {
    element: 'Al',
    oxidationState: '0',
    coreLevel: '2p',
    bindingEnergy: 72.8,
    uncertainty: 0.2,
    fwhm: [0.5, 1.2],
    literatureSource: 'NIST XPS Database — metallic aluminum'
  },

  // Sulfur 2p references
  {
    element: 'S',
    oxidationState: '2-',
    coreLevel: '2p',
    bindingEnergy: 162.5,
    uncertainty: 0.4,
    fwhm: [1.2, 1.8],
    literatureSource: 'NIST XPS Database — metal sulfides'
  },
  {
    element: 'S',
    oxidationState: '6+',
    coreLevel: '2p',
    bindingEnergy: 168.0,
    uncertainty: 0.4,
    fwhm: [1.2, 2.0],
    literatureSource: 'NIST XPS Database — organic/inorganic sulfates'
  },

  // Phosphorus 2p references
  {
    element: 'P',
    oxidationState: '5+',
    coreLevel: '2p',
    bindingEnergy: 133.5,
    uncertainty: 0.4,
    fwhm: [1.2, 2.0],
    literatureSource: 'NIST XPS Database — phosphates'
  },

  // Chlorine 2p references (Doublet)
  {
    element: 'Cl',
    oxidationState: '1-',
    coreLevel: '2p3/2',
    bindingEnergy: 198.5,
    uncertainty: 0.3,
    fwhm: [1.2, 1.8],
    spinOrbitSplitting: 1.6,
    literatureSource: 'NIST XPS Database — metal chlorides'
  },
  {
    element: 'Cl',
    oxidationState: '1-',
    coreLevel: '2p1/2',
    bindingEnergy: 200.1,
    uncertainty: 0.3,
    fwhm: [1.2, 1.8],
    spinOrbitSplitting: 1.6,
    literatureSource: 'NIST XPS Database — metal chlorides'
  },
  {
    element: 'Cl',
    oxidationState: 'organic',
    coreLevel: '2p3/2',
    bindingEnergy: 200.5,
    uncertainty: 0.4,
    fwhm: [1.2, 1.8],
    spinOrbitSplitting: 1.6,
    literatureSource: 'NIST XPS Database — chlorinated organics'
  },

  // Sodium 1s references
  {
    element: 'Na',
    oxidationState: '1+',
    coreLevel: '1s',
    bindingEnergy: 1071.5,
    uncertainty: 0.4,
    fwhm: [1.5, 2.2],
    literatureSource: 'NIST XPS Database — sodium salts'
  },

  // Potassium 2p references (Doublet)
  {
    element: 'K',
    oxidationState: '1+',
    coreLevel: '2p3/2',
    bindingEnergy: 292.8,
    uncertainty: 0.3,
    fwhm: [1.2, 1.8],
    spinOrbitSplitting: 2.8,
    literatureSource: 'NIST XPS Database — potassium salts'
  },
  {
    element: 'K',
    oxidationState: '1+',
    coreLevel: '2p1/2',
    bindingEnergy: 295.6,
    uncertainty: 0.3,
    fwhm: [1.2, 1.8],
    spinOrbitSplitting: 2.8,
    literatureSource: 'NIST XPS Database — potassium salts'
  },

  // Calcium 2p references (Doublet)
  {
    element: 'Ca',
    oxidationState: '2+',
    coreLevel: '2p3/2',
    bindingEnergy: 347.0,
    uncertainty: 0.3,
    fwhm: [1.2, 2.0],
    spinOrbitSplitting: 3.55,
    literatureSource: 'NIST XPS Database — calcium carbonate/oxides'
  },
  {
    element: 'Ca',
    oxidationState: '2+',
    coreLevel: '2p1/2',
    bindingEnergy: 350.55,
    uncertainty: 0.3,
    fwhm: [1.2, 2.0],
    spinOrbitSplitting: 3.55,
    literatureSource: 'NIST XPS Database — calcium carbonate/oxides'
  },

  // Zinc 2p references (Doublet)
  {
    element: 'Zn',
    oxidationState: '2+',
    coreLevel: '2p3/2',
    bindingEnergy: 1021.7,
    uncertainty: 0.3,
    fwhm: [1.5, 2.2],
    spinOrbitSplitting: 23.0,
    literatureSource: 'Biesinger et al., Appl. Surf. Sci. 257 (2010) 887',
    dbSource: 'literature',
    sourceDoi: '10.1016/j.apsusc.2010.07.086',
    matchSource: 'literature',
    formula: 'ZnO'
  },
  {
    element: 'Zn',
    oxidationState: '2+',
    coreLevel: '2p1/2',
    bindingEnergy: 1044.7,
    uncertainty: 0.3,
    fwhm: [1.5, 2.2],
    spinOrbitSplitting: 23.0,
    literatureSource: 'Biesinger et al., Appl. Surf. Sci. 257 (2010) 887',
    dbSource: 'literature',
    sourceDoi: '10.1016/j.apsusc.2010.07.086',
    matchSource: 'literature',
    formula: 'ZnO'
  },

  // Fluorine 1s references
  {
    element: 'F',
    oxidationState: '1-',
    coreLevel: '1s',
    bindingEnergy: 685.0,
    uncertainty: 0.4,
    fwhm: [1.2, 2.0],
    literatureSource: 'NIST XPS Database — fluorides'
  },

  // Magnesium 2p references
  {
    element: 'Mg',
    oxidationState: '2+',
    coreLevel: '2p',
    bindingEnergy: 50.8,
    uncertainty: 0.3,
    fwhm: [1.0, 1.8],
    literatureSource: 'NIST XPS Database — magnesium oxide'
  },

  // Titanium 2p references (Doublet)
  {
    element: 'Ti',
    oxidationState: '4+',
    coreLevel: '2p3/2',
    bindingEnergy: 458.6,
    uncertainty: 0.4,
    fwhm: [1.2, 2.0],
    spinOrbitSplitting: 5.7,
    literatureSource: 'Biesinger et al., Appl. Surf. Sci. 257 (2010) 887',
    dbSource: 'literature',
    sourceDoi: '10.1016/j.apsusc.2010.07.086',
    matchSource: 'literature',
    formula: 'TiO2'
  },
  {
    element: 'Ti',
    oxidationState: '4+',
    coreLevel: '2p1/2',
    bindingEnergy: 464.3,
    uncertainty: 0.4,
    fwhm: [1.2, 2.0],
    spinOrbitSplitting: 5.7,
    literatureSource: 'Biesinger et al., Appl. Surf. Sci. 257 (2010) 887',
    dbSource: 'literature',
    sourceDoi: '10.1016/j.apsusc.2010.07.086',
    matchSource: 'literature',
    formula: 'TiO2'
  },

  // Chromium 2p references (Doublet)
  {
    element: 'Cr',
    oxidationState: '3+',
    coreLevel: '2p3/2',
    bindingEnergy: 576.5,
    uncertainty: 0.5,
    fwhm: [1.5, 2.5],
    spinOrbitSplitting: 9.3,
    literatureSource: 'Biesinger et al., Appl. Surf. Sci. 257, 2717 (2009)'
  },
  {
    element: 'Cr',
    oxidationState: '3+',
    coreLevel: '2p1/2',
    bindingEnergy: 585.8,
    uncertainty: 0.5,
    fwhm: [1.5, 2.5],
    spinOrbitSplitting: 9.3,
    literatureSource: 'Biesinger et al., Appl. Surf. Sci. 257, 2717 (2009)'
  },

  // Manganese 2p references (Doublet)
  {
    element: 'Mn',
    oxidationState: '4+',
    coreLevel: '2p3/2',
    bindingEnergy: 642.2,
    uncertainty: 0.5,
    fwhm: [1.5, 2.5],
    spinOrbitSplitting: 11.7,
    literatureSource: 'Biesinger et al., Appl. Surf. Sci. 257, 2717 (2009)'
  },
  {
    element: 'Mn',
    oxidationState: '4+',
    coreLevel: '2p1/2',
    bindingEnergy: 653.9,
    uncertainty: 0.5,
    fwhm: [1.5, 2.5],
    spinOrbitSplitting: 11.7,
    literatureSource: 'Biesinger et al., Appl. Surf. Sci. 257, 2717 (2009)'
  },

  // Nickel 2p references (Doublet)
  {
    element: 'Ni',
    oxidationState: '2+',
    coreLevel: '2p3/2',
    bindingEnergy: 855.6,
    uncertainty: 0.5,
    fwhm: [1.5, 2.5],
    spinOrbitSplitting: 17.3,
    satelliteOffset: 6.0,
    satelliteIntensity: 0.4,
    literatureSource: 'Biesinger et al., Appl. Surf. Sci. 257, 2717 (2009)'
  },
  {
    element: 'Ni',
    oxidationState: '2+',
    coreLevel: '2p1/2',
    bindingEnergy: 872.9,
    uncertainty: 0.5,
    fwhm: [1.5, 2.5],
    spinOrbitSplitting: 17.3,
    literatureSource: 'Biesinger et al., Appl. Surf. Sci. 257, 2717 (2009)'
  },

  // Gold 4f references (Doublet)
  {
    element: 'Au',
    oxidationState: '0',
    coreLevel: '4f7/2',
    bindingEnergy: 84.0,
    uncertainty: 0.2,
    fwhm: [0.8, 1.4],
    spinOrbitSplitting: 3.7,
    literatureSource: 'NIST XPS Database — sputter-cleaned gold'
  },
  {
    element: 'Au',
    oxidationState: '0',
    coreLevel: '4f5/2',
    bindingEnergy: 87.7,
    uncertainty: 0.2,
    fwhm: [0.8, 1.4],
    spinOrbitSplitting: 3.7,
    literatureSource: 'NIST XPS Database — sputter-cleaned gold'
  },

  // Silver 3d references
  {
    element: 'Ag',
    oxidationState: '0',
    coreLevel: '3d5/2',
    bindingEnergy: 368.3,
    uncertainty: 0.2,
    fwhm: [0.6, 1.2],
    literatureSource: 'NIST XPS Database — sputter-cleaned silver'
  }
];

/**
 * Get XPS reference data for a specific element and oxidation state
 * 
 * @param element - Chemical element symbol (e.g., "Cu", "Fe", "O")
 * @param oxidationState - Oxidation state (e.g., "2+", "3+")
 * @returns Array of core level references for the specified element and oxidation state
 */
export function getXpsReferenceData(
  element: string,
  oxidationState: string
): XpsCoreLevelReference[] {
  return XPS_REFERENCE_DATA.filter(
    ref => ref.element === element && ref.oxidationState === oxidationState
  );
}

/**
 * Get XPS reference data for a specific core level
 * 
 * @param element - Chemical element symbol
 * @param oxidationState - Oxidation state
 * @param coreLevel - Core level designation (e.g., "2p3/2", "1s")
 * @returns Core level reference or undefined if not found
 */
export function getCoreLevelReference(
  element: string,
  oxidationState: string,
  coreLevel: string
): XpsCoreLevelReference | undefined {
  return XPS_REFERENCE_DATA.find(
    ref =>
      ref.element === element &&
      ref.oxidationState === oxidationState &&
      ref.coreLevel === coreLevel
  );
}

/**
 * Get spin-orbit splitting for a given element and core level
 * 
 * @param element - Chemical element symbol
 * @param coreLevel - Core level designation (should be the lower binding energy component)
 * @returns Spin-orbit splitting in eV, or undefined if not applicable
 */
export function getSpinOrbitSplitting(
  element: string,
  coreLevel: string
): number | undefined {
  const ref = XPS_REFERENCE_DATA.find(
    r => r.element === element && r.coreLevel === coreLevel && r.spinOrbitSplitting
  );
  return ref?.spinOrbitSplitting;
}

/**
 * Check if a core level has satellite peaks
 * 
 * @param element - Chemical element symbol
 * @param oxidationState - Oxidation state
 * @param coreLevel - Core level designation
 * @returns True if satellite peaks are expected
 */
export function hasSatellitePeaks(
  element: string,
  oxidationState: string,
  coreLevel: string
): boolean {
  const ref = getCoreLevelReference(element, oxidationState, coreLevel);
  return ref?.satelliteOffset !== undefined && ref?.satelliteIntensity !== undefined;
}

/**
 * Get satellite peak parameters
 * 
 * @param element - Chemical element symbol
 * @param oxidationState - Oxidation state
 * @param coreLevel - Core level designation
 * @returns Satellite parameters { offset, intensity } or undefined
 */
export function getSatelliteParameters(
  element: string,
  oxidationState: string,
  coreLevel: string
): { offset: number; intensity: number } | undefined {
  const ref = getCoreLevelReference(element, oxidationState, coreLevel);
  if (ref?.satelliteOffset && ref?.satelliteIntensity) {
    return {
      offset: ref.satelliteOffset,
      intensity: ref.satelliteIntensity
    };
  }
  return undefined;
}

// ============================================================================
// Energy Calibration Standards (charge-reference standards)
//
// These are the inert / well-defined photoemission lines used to charge-
// reference an XPS spectrum. They are distinct from the element-assignment
// references above (which identify sample chemistry). Surfaced in the UI
// "Energy calibration reference" dropdown. Metadata (bindingEnergy, isInert,
// source) is retained to enable future calibration validation and warnings.
// ============================================================================

/** Reference binding energy used as the deterministic charge-reference baseline. */
export const XPS_C1S_REFERENCE_BE = 284.8;

export interface XpsCalibrationStandard {
  /** Stable identifier (also accepted as the parameter value). */
  id: string;
  /** Element / line family (or '—' for an instrument reference). */
  element: string;
  /** Core level / edge designation. */
  coreLevel: string;
  /** Human-readable dropdown label, e.g. "C 1s (284.8 eV)". */
  label: string;
  /** Reference binding energy in eV. */
  bindingEnergy: number;
  /**
   * Deterministic charge-reference shift (eV) applied to the spectrum in the
   * demo when this standard is selected. Evidence-first: no shift is invented
   * for standards without an established demo offset (defaults to 0).
   */
  chargeReferenceShift: number;
  /** Whether the standard is an inert / sputter-cleaned reference. */
  isInert: boolean;
  /** Literature / instrument source for traceability. */
  source: string;
}

export const XPS_CALIBRATION_STANDARDS: XpsCalibrationStandard[] = [
  {
    id: 'C1s',
    element: 'C',
    coreLevel: '1s',
    label: 'C 1s (284.8 eV)',
    bindingEnergy: 284.8,
    chargeReferenceShift: 0,
    isInert: true,
    source: 'NIST XPS Database — adventitious carbon',
  },
  {
    id: 'Au4f7',
    element: 'Au',
    coreLevel: '4f7/2',
    label: 'Au 4f7/2 (84.0 eV)',
    bindingEnergy: 84.0,
    // Preserves the existing demo behavior for this standard.
    chargeReferenceShift: -200.2,
    isInert: true,
    source: 'NIST XPS Database — sputter-cleaned gold',
  },
  {
    id: 'Ag3d5',
    element: 'Ag',
    coreLevel: '3d5/2',
    label: 'Ag 3d5/2 (368.3 eV)',
    bindingEnergy: 368.3,
    chargeReferenceShift: 0,
    isInert: true,
    source: 'NIST XPS Database — sputter-cleaned silver',
  },
  {
    id: 'Cu2p3',
    element: 'Cu',
    coreLevel: '2p3/2',
    label: 'Cu 2p3/2 (932.6 eV)',
    bindingEnergy: 932.6,
    chargeReferenceShift: 0,
    isInert: true,
    source: 'NIST XPS Database — sputter-cleaned copper',
  },
  {
    id: 'Fermi',
    element: '—',
    coreLevel: 'Fermi edge',
    label: 'Fermi edge (0.0 eV)',
    bindingEnergy: 0.0,
    chargeReferenceShift: 0,
    isInert: true,
    source: 'Instrument Fermi-level reference',
  },
];

/** All calibration standards (for the UI dropdown). */
export function getCalibrationStandards(): XpsCalibrationStandard[] {
  return XPS_CALIBRATION_STANDARDS;
}

/** Resolve a calibration standard by id or by its display label. */
export function getCalibrationStandardById(
  idOrLabel: string
): XpsCalibrationStandard | undefined {
  return XPS_CALIBRATION_STANDARDS.find(
    (s) => s.id === idOrLabel || s.label === idOrLabel
  );
}

/** Deterministic charge-reference shift (eV) for a selected standard. */
export function getCalibrationShift(idOrLabel: string): number {
  return getCalibrationStandardById(idOrLabel)?.chargeReferenceShift ?? 0;
}

// ============================================================================
// Element / region helpers (drive region dropdown + element-selection view)
// ============================================================================

/** Orbital family from a core-level designation (e.g. "2p3/2" -> "2p"). */
function orbitalFamily(coreLevel: string): string {
  const m = coreLevel.match(/^(\d+[spdf])/);
  return m ? m[1] : coreLevel;
}

export interface XpsRegionDescriptor {
  /** Region label / parameter value, e.g. "Cu 2p". */
  value: string;
  element: string;
  orbital: string;
  /** Binding-energy window (eV). */
  min: number;
  max: number;
}

/** Distinct elements present in the canonical reference table (insertion order). */
export function listReferenceElements(): string[] {
  const seen: string[] = [];
  for (const ref of XPS_REFERENCE_DATA) {
    if (!seen.includes(ref.element)) seen.push(ref.element);
  }
  return seen;
}

/** All core-level references for an element. */
export function getReferencesForElement(element: string): XpsCoreLevelReference[] {
  return XPS_REFERENCE_DATA.filter((r) => r.element === element);
}

/**
 * Binding-energy window for an element's core-level region, including satellite
 * structure, with a margin for spin-orbit partners. Used to focus a survey
 * spectrum/peak set onto a single element region (deterministic, data-derived).
 */
export function getElementRegionWindow(
  element: string
): { label: string; min: number; max: number } | undefined {
  const refs = getReferencesForElement(element);
  if (refs.length === 0) return undefined;
  const margin = 15;
  const bindingEnergies = refs.map((r) => r.bindingEnergy);
  const satelliteMax = Math.max(
    ...refs.map((r) => r.bindingEnergy + (r.satelliteOffset ?? 0))
  );
  const min = Math.min(...bindingEnergies) - margin;
  const max = Math.max(Math.max(...bindingEnergies), satelliteMax) + margin;
  return {
    label: `${element} ${orbitalFamily(refs[0].coreLevel)}`,
    min: Number(min.toFixed(1)),
    max: Number(max.toFixed(1)),
  };
}

/** Region descriptors for every element present (drives the region dropdown). */
export function listReferenceRegions(): XpsRegionDescriptor[] {
  return listReferenceElements()
    .map((element) => {
      const window = getElementRegionWindow(element);
      if (!window) return undefined;
      return {
        value: window.label,
        element,
        orbital: orbitalFamily(getReferencesForElement(element)[0].coreLevel),
        min: window.min,
        max: window.max,
      };
    })
    .filter((r): r is XpsRegionDescriptor => r !== undefined);
}

/**
 * Resolve a region-selection value (e.g. "Cu 2p") to its element + window.
 * Returns undefined for "Survey" / "Custom" / unknown (i.e. no filtering).
 */
export function getRegionWindowByValue(
  regionValue: string
): { element: string; min: number; max: number } | undefined {
  if (!regionValue || regionValue === 'Survey' || regionValue === 'Custom') {
    return undefined;
  }
  const region = listReferenceRegions().find((r) => r.value === regionValue);
  return region ? { element: region.element, min: region.min, max: region.max } : undefined;
}
