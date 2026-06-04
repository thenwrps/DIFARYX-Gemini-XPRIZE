#!/usr/bin/env npx tsx
/**
 * DIFARYX — Sample Library Generator
 *
 * Generates 100,000 synthetic sample files (25,000 × 4 techniques)
 * in .txt format with embedded CSV data.
 *
 * Techniques: XRD | FTIR | XPS | Raman
 * Analysis Modes: 6 per technique
 * Industry Groups: 12 sectors
 * File format: .txt (header + data)
 * Output: D:/DIFARYX_Synthetic_Data/SampleLibrary/
 * Target: 100K files, ~5–7 GB total
 */

import { mkdir, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { statfsSync } from 'node:fs';

// ─── Types ─────────────────────────────────────────────────────────────────

type Technique = 'XRD' | 'FTIR' | 'XPS' | 'Raman';

interface Peak {
  center: number;
  width: number;
  amplitude: number;
  eta: number;
}

interface Baseline {
  type: 'polynomial' | 'chebyshev' | 'exponential' | 'linear' | 'none';
  coefficients?: number[];
}

interface TechniqueConfig {
  technique: Technique;
  xRange: [number, number];
  pointCount: number;
  xUnit: string;
  yUnit: string;
  defaultPeaks: Peak[];
  defaultBaseline: Baseline;
  defaultSNR: number;
}

interface AnalysisMode {
  id: string;
  name: string;
  modifyConfig: (config: TechniqueConfig, seed: number) => TechniqueConfig;
}

interface IndustryGroup {
  id: string;
  name: string;
  peakShift: number;
  amplitudeScale: number;
  widthScale: number;
  snrMultiplier: number;
}

interface SampleMeta {
  sampleId: string;
  technique: Technique;
  analysisMode: string;
  industry: string;
  materialSystem: string;
  seed: number;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const OUTPUT_ROOT = 'D:/DIFARYX_Synthetic_Data/SampleLibrary';
const SAMPLES_PER_TECHNIQUE = 25_000;
const BATCH_WRITE_SIZE = 200;
const MIN_FREE_SPACE_GB = 10;

// Increase point counts to hit ~5-7 GB target for 100K TXT files
const POINT_MULTIPLIER = 2.0;

// ─── Analysis Modes (6 per technique) ──────────────────────────────────────

const XRD_MODES: AnalysisMode[] = [
  {
    id: 'PHASE_ID',
    name: 'Phase Identification',
    modifyConfig: (c) => ({ ...c, pointCount: Math.round(2000 * POINT_MULTIPLIER) }),
  },
  {
    id: 'SCHERRER',
    name: 'Crystallite Size (Scherrer)',
    modifyConfig: (c, s) => ({
      ...c,
      pointCount: Math.round(2500 * POINT_MULTIPLIER),
      defaultPeaks: c.defaultPeaks.map(p => ({ ...p, width: p.width * (0.6 + (s % 10) * 0.08) })),
    }),
  },
  {
    id: 'LATTICE',
    name: 'Lattice Parameter Refinement',
    modifyConfig: (c, s) => ({
      ...c,
      pointCount: Math.round(3000 * POINT_MULTIPLIER),
      defaultPeaks: c.defaultPeaks.map(p => ({ ...p, center: p.center + ((s % 5) - 2) * 0.15 })),
    }),
  },
  {
    id: 'AMORPHOUS',
    name: 'Amorphous Content Assessment',
    modifyConfig: (c, s) => ({
      ...c,
      pointCount: Math.round(2000 * POINT_MULTIPLIER),
      defaultBaseline: { type: 'polynomial', coefficients: [15, -0.3, 0.005, -0.00003] },
      defaultPeaks: c.defaultPeaks.map(p => ({ ...p, amplitude: p.amplitude * (0.3 + (s % 8) * 0.1) })),
    }),
  },
  {
    id: 'TEXTURE',
    name: 'Texture / Preferred Orientation',
    modifyConfig: (c, s) => ({
      ...c,
      pointCount: Math.round(2000 * POINT_MULTIPLIER),
      defaultPeaks: c.defaultPeaks.map((p, i) => ({ ...p, amplitude: p.amplitude * (i % 2 === 0 ? 1.5 + (s % 5) * 0.2 : 0.4) })),
    }),
  },
  {
    id: 'STRESS',
    name: 'Residual Stress Analysis',
    modifyConfig: (c, s) => ({
      ...c,
      pointCount: Math.round(3000 * POINT_MULTIPLIER),
      defaultPeaks: c.defaultPeaks.map(p => ({ ...p, center: p.center + ((s % 7) - 3) * 0.05, width: p.width * 0.9 })),
    }),
  },
];

const FTIR_MODES: AnalysisMode[] = [
  {
    id: 'FUNC_GROUP',
    name: 'Functional Group Identification',
    modifyConfig: (c) => ({ ...c, pointCount: Math.round(2000 * POINT_MULTIPLIER) }),
  },
  {
    id: 'QUANT',
    name: 'Quantitative Analysis',
    modifyConfig: (c, s) => ({
      ...c,
      pointCount: Math.round(2500 * POINT_MULTIPLIER),
      defaultSNR: 300,
      defaultPeaks: c.defaultPeaks.map(p => ({ ...p, amplitude: p.amplitude * (0.8 + (s % 6) * 0.15) })),
    }),
  },
  {
    id: 'ATR',
    name: 'ATR Mode',
    modifyConfig: (c, s) => ({
      ...c,
      pointCount: Math.round(2000 * POINT_MULTIPLIER),
      defaultBaseline: { type: 'polynomial', coefficients: [0.15, -0.00005, 0.00000001] },
      defaultPeaks: c.defaultPeaks.map(p => ({ ...p, amplitude: p.amplitude * 0.85, center: p.center + ((s % 3) - 1) * 3 })),
    }),
  },
  {
    id: 'DRIFTS',
    name: 'Diffuse Reflectance (DRIFTS)',
    modifyConfig: (c, s) => ({
      ...c,
      pointCount: Math.round(2000 * POINT_MULTIPLIER),
      defaultBaseline: { type: 'exponential', coefficients: [0.02, 0.15, 800] },
      defaultPeaks: c.defaultPeaks.map(p => ({ ...p, eta: Math.min(p.eta + 0.1, 0.8) })),
    }),
  },
  {
    id: 'EMISSION',
    name: 'Emission Spectroscopy',
    modifyConfig: (c, s) => ({
      ...c,
      pointCount: Math.round(2000 * POINT_MULTIPLIER),
      defaultSNR: 80,
      defaultBaseline: { type: 'linear', coefficients: [0.05, 0.00001] },
      defaultPeaks: c.defaultPeaks.map(p => ({ ...p, amplitude: p.amplitude * (1.2 + (s % 4) * 0.2) })),
    }),
  },
  {
    id: 'THIN_FILM',
    name: 'Thin Film Analysis',
    modifyConfig: (c, s) => ({
      ...c,
      pointCount: Math.round(2500 * POINT_MULTIPLIER),
      defaultBaseline: { type: 'chebyshev', coefficients: [0.12, -0.04, 0.01] },
      defaultPeaks: c.defaultPeaks.map(p => ({ ...p, width: p.width * 1.3, amplitude: p.amplitude * 0.7 })),
    }),
  },
];

const XPS_MODES: AnalysisMode[] = [
  {
    id: 'SURVEY',
    name: 'Survey Scan',
    modifyConfig: (c) => ({ ...c, pointCount: Math.round(1500 * POINT_MULTIPLIER), xRange: [0, 1200] as [number, number] }),
  },
  {
    id: 'HIGH_RES',
    name: 'High-Resolution Core Level',
    modifyConfig: (c, s) => ({
      ...c,
      pointCount: Math.round(2000 * POINT_MULTIPLIER),
      xRange: [525, 540] as [number, number],
      defaultSNR: 40,
      defaultPeaks: c.defaultPeaks.filter(p => p.center >= 525 && p.center <= 540).map(p => ({ ...p, width: p.width * 0.7 })),
    }),
  },
  {
    id: 'CHEM_STATE',
    name: 'Chemical State Identification',
    modifyConfig: (c, s) => ({
      ...c,
      pointCount: Math.round(2000 * POINT_MULTIPLIER),
      xRange: [280, 300] as [number, number],
      defaultPeaks: [
        { center: 284.8, width: 0.8, amplitude: 100, eta: 0.55 },
        { center: 286.3, width: 1.0, amplitude: 40, eta: 0.55 },
        { center: 288.5, width: 1.2, amplitude: 20, eta: 0.55 },
      ].map(p => ({ ...p, center: p.center + ((s % 5) - 2) * 0.2 })),
    }),
  },
  {
    id: 'DEPTH_PROF',
    name: 'Depth Profiling',
    modifyConfig: (c, s) => ({
      ...c,
      pointCount: Math.round(1500 * POINT_MULTIPLIER),
      defaultSNR: 50,
      defaultPeaks: c.defaultPeaks.map((p, i) => ({ ...p, amplitude: p.amplitude * (1.5 - i * 0.2) })),
    }),
  },
  {
    id: 'VALENCE',
    name: 'Valence Band Analysis',
    modifyConfig: (c, s) => ({
      ...c,
      pointCount: Math.round(1500 * POINT_MULTIPLIER),
      xRange: [0, 20] as [number, number],
      defaultPeaks: [
        { center: 3, width: 1.5, amplitude: 30, eta: 0.50 },
        { center: 8, width: 2.0, amplitude: 50, eta: 0.45 },
        { center: 14, width: 2.5, amplitude: 25, eta: 0.50 },
      ].map(p => ({ ...p, center: p.center + ((s % 3) - 1) * 0.5 })),
    }),
  },
  {
    id: 'AUGER',
    name: 'Auger Parameter Analysis',
    modifyConfig: (c, s) => ({
      ...c,
      pointCount: Math.round(1500 * POINT_MULTIPLIER),
      defaultSNR: 45,
      defaultPeaks: c.defaultPeaks.map(p => ({ ...p, eta: Math.max(p.eta - 0.1, 0.3) })),
    }),
  },
];

const RAMAN_MODES: AnalysisMode[] = [
  {
    id: 'FINGERPRINT',
    name: 'Fingerprint Identification',
    modifyConfig: (c) => ({ ...c, pointCount: Math.round(2000 * POINT_MULTIPLIER) }),
  },
  {
    id: 'POLARIZED',
    name: 'Polarized Raman',
    modifyConfig: (c, s) => ({
      ...c,
      pointCount: Math.round(2500 * POINT_MULTIPLIER),
      defaultPeaks: c.defaultPeaks.map((p, i) => ({ ...p, amplitude: p.amplitude * (i % 2 === 0 ? 1.0 + (s % 4) * 0.3 : 0.2 + (s % 3) * 0.1) })),
    }),
  },
  {
    id: 'RESONANCE',
    name: 'Resonance Raman',
    modifyConfig: (c, s) => ({
      ...c,
      pointCount: Math.round(2000 * POINT_MULTIPLIER),
      defaultSNR: 30,
      defaultPeaks: c.defaultPeaks.map(p => ({ ...p, amplitude: p.amplitude * 3.0 })),
    }),
  },
  {
    id: 'SERS',
    name: 'SERS (Surface-Enhanced)',
    modifyConfig: (c, s) => ({
      ...c,
      pointCount: Math.round(2000 * POINT_MULTIPLIER),
      defaultSNR: 20,
      defaultPeaks: c.defaultPeaks.map(p => ({ ...p, amplitude: p.amplitude * 8.0, width: p.width * 0.85 })),
    }),
  },
  {
    id: 'MAPPING',
    name: 'Mapping / Imaging Mode',
    modifyConfig: (c, s) => ({
      ...c,
      pointCount: Math.round(1500 * POINT_MULTIPLIER),
      defaultBaseline: { type: 'exponential', coefficients: [3, 60, 300] },
      defaultSNR: 60,
    }),
  },
  {
    id: 'STRESS',
    name: 'Stress / Strain Analysis',
    modifyConfig: (c, s) => ({
      ...c,
      pointCount: Math.round(2500 * POINT_MULTIPLIER),
      defaultPeaks: c.defaultPeaks.map(p => ({ ...p, center: p.center + ((s % 7) - 3) * 0.8, width: p.width * 0.95 })),
    }),
  },
];

const ANALYSIS_MODES: Record<Technique, AnalysisMode[]> = {
  XRD: XRD_MODES,
  FTIR: FTIR_MODES,
  XPS: XPS_MODES,
  Raman: RAMAN_MODES,
};

// ─── Industry Groups (12 sectors) ─────────────────────────────────────────

const INDUSTRY_GROUPS: IndustryGroup[] = [
  { id: 'PHARMA',     name: 'Pharmaceutical',        peakShift: 0.3,  amplitudeScale: 1.0,  widthScale: 1.0,  snrMultiplier: 1.2 },
  { id: 'SEMI',       name: 'Semiconductor',         peakShift: 0.1,  amplitudeScale: 1.1,  widthScale: 0.85, snrMultiplier: 1.5 },
  { id: 'ENERGY',     name: 'Energy / Battery',      peakShift: 0.25, amplitudeScale: 1.05, widthScale: 1.1,  snrMultiplier: 1.0 },
  { id: 'CATALYSIS',  name: 'Catalysis',             peakShift: 0.4,  amplitudeScale: 0.9,  widthScale: 1.2,  snrMultiplier: 0.9 },
  { id: 'CERAMICS',   name: 'Ceramics / Glass',      peakShift: 0.15, amplitudeScale: 1.15, widthScale: 0.9,  snrMultiplier: 1.3 },
  { id: 'POLYMER',    name: 'Polymer / Plastic',     peakShift: 0.5,  amplitudeScale: 0.85, widthScale: 1.4,  snrMultiplier: 0.8 },
  { id: 'METALS',     name: 'Metals / Alloy',        peakShift: 0.2,  amplitudeScale: 1.2,  widthScale: 0.8,  snrMultiplier: 1.1 },
  { id: 'ENVIRO',     name: 'Environmental',         peakShift: 0.35, amplitudeScale: 0.95, widthScale: 1.15, snrMultiplier: 0.85 },
  { id: 'GEO',        name: 'Geological / Mineral',  peakShift: 0.2,  amplitudeScale: 1.1,  widthScale: 1.0,  snrMultiplier: 1.0 },
  { id: 'BIOMED',     name: 'Biomedical',            peakShift: 0.3,  amplitudeScale: 0.9,  widthScale: 1.2,  snrMultiplier: 0.95 },
  { id: 'FOOD',       name: 'Food / Agriculture',    peakShift: 0.4,  amplitudeScale: 0.85, widthScale: 1.3,  snrMultiplier: 0.8 },
  { id: 'AERO',       name: 'Aerospace',             peakShift: 0.15, amplitudeScale: 1.25, widthScale: 0.85, snrMultiplier: 1.4 },
];

// ─── Material Systems per (Technique, Industry) ───────────────────────────

const MATERIAL_SYSTEMS: Record<Technique, Record<string, string[]>> = {
  XRD: {
    PHARMA:    ['Carbamazepine Form III', 'Lactose Monohydrate', 'Aspirin Polymorph', 'Ibuprofen Racemic', 'Metformin HCl'],
    SEMI:      ['Silicon (100)', 'Gallium Arsenide', 'Indium Phosphide', 'GaN Epitaxial', 'SiC 4H-Polytype'],
    ENERGY:    ['LiFePO4 Olivine', 'NMC811 Layered', 'Graphite Anode', 'Li4Ti5O12 Spinel', 'Na3V2(PO4)3 NASICON'],
    CATALYSIS: ['TiO2 Anatase', 'TiO2 Rutile', 'γ-Al2O3', 'ZSM-5 Zeolite', 'Pt/C Catalyst'],
    CERAMICS:  ['α-Al2O3 Corundum', 'ZrO2 Monoclinic', 'ZrO2 Tetragonal', 'SiO2 Cristobalite', 'Mullite'],
    POLYMER:   ['PE Semi-crystalline', 'PET Crystalline', 'Nylon 6,6', 'PP Isotactic', 'PVDF Beta-phase'],
    METALS:    ['α-Fe BCC', 'γ-Fe FCC', 'Austenitic Steel', 'Ni Superalloy', 'Cu FCC'],
    ENVIRO:    ['Montmorillonite', 'Kaolinite', 'Calcite', 'Gypsum', 'Quartz Sand'],
    GEO:       ['Quartz α', 'Calcite', 'Feldspar Orthoclase', 'Pyrite', 'Hematite'],
    BIOMED:    ['Hydroxyapatite', 'β-TCP', 'Bioglass 45S5', 'Collagen Mineral', 'Bone Cement'],
    FOOD:      ['Sucrose Crystal', 'Starch A-type', 'Starch B-type', 'Cellulose I', 'Lactose Anhydrous'],
    AERO:      ['Ni3Al γ-prime', 'SiC Fiber', 'WC Hardmetal', 'Ti-6Al-4V α+β', 'CMC SiC/SiC'],
  },
  FTIR: {
    PHARMA:    ['O-H / N-H Stretching', 'C=O Amide I', 'C-N Amide II', 'C-H Alkyl', 'S=O Sulfonyl'],
    SEMI:      ['Si-O Stretching', 'Si-N Stretching', 'Si-H Bending', 'Ga-As TO Mode', 'P-H Stretching'],
    ENERGY:    ['P-O Phosphate', 'C-H Carbonate', 'O-H Hydroxide', 'C-F Fluorophosphate', 'S-O Sulfate'],
    CATALYSIS: ['Ti-O Stretching', 'Al-O Stretching', 'O-H Surface', 'N-H Amine Adsorbate', 'C=O Carboxylate'],
    CERAMICS:  ['Si-O-Si Asymmetric', 'Al-O Stretching', 'Si-O Bending', 'Zr-O Stretching', 'O-H Silanol'],
    POLYMER:   ['C-H Stretching', 'C=O Ester', 'C-O-C Ether', 'N-H Amide', 'C-F Stretching'],
    METALS:    ['Fe-O Surface Oxide', 'Ni-O Stretching', 'Cu-O Stretching', 'O-H Adsorbed', 'C-O Carbonate'],
    ENVIRO:    ['CO3 Carbonate', 'Si-O Silicate', 'O-H Clay', 'S-O Sulfate', 'N-O Nitrate'],
    GEO:       ['Si-O Quartz', 'CO3 Calcite', 'O-H Hydroxyl', 'Al-O Feldspar', 'S-O Gypsum'],
    BIOMED:    ['P-O Phosphate', 'CO3 Carbonate', 'Amide I Protein', 'Amide II Protein', 'O-H Hydroxyl'],
    FOOD:      ['O-H Stretching', 'C-H Stretching', 'C=O Carbonyl', 'Amide I Protein', 'C-O-C Polysaccharide'],
    AERO:      ['Si-C Stretching', 'Si-O Oxide', 'Al-O Spinel', 'W-O Surface', 'Ti-O Passive Layer'],
  },
  XPS: {
    PHARMA:    ['N 1s Drug', 'C 1s Carbon', 'O 1s Oxygen', 'S 1s Sulfur', 'Cl 2p Chloride'],
    SEMI:      ['Si 2p Silicon', 'Ga 3d Gallium', 'As 3d Arsenic', 'In 3d Indium', 'P 2p Phosphorus'],
    ENERGY:    ['Li 1s Lithium', 'Fe 2p Iron', 'Ni 2p Nickel', 'P 2p Phosphate', 'F 1s Fluorine'],
    CATALYSIS: ['Ti 2p Titanium', 'Al 2p Aluminum', 'O 1s Oxygen', 'N 1s Nitrogen', 'Pt 4f Platinum'],
    CERAMICS:  ['Al 2p Aluminum', 'Zr 3d Zirconium', 'Si 2p Silicon', 'O 1s Oxygen', 'Ca 2p Calcium'],
    POLYMER:   ['C 1s Carbon', 'O 1s Oxygen', 'N 1s Nitrogen', 'F 1s Fluorine', 'S 2p Sulfur'],
    METALS:    ['Fe 2p Iron', 'Ni 2p Nickel', 'Cu 2p Copper', 'Cr 2p Chromium', 'O 1s Oxygen'],
    ENVIRO:    ['C 1s Carbon', 'O 1s Oxygen', 'Si 2p Silicon', 'Al 2p Aluminum', 'Fe 2p Iron'],
    GEO:       ['Si 2p Silicon', 'Ca 2p Calcium', 'O 1s Oxygen', 'Fe 2p Iron', 'Al 2p Aluminum'],
    BIOMED:    ['Ca 2p Calcium', 'P 2p Phosphate', 'O 1s Oxygen', 'N 1s Nitrogen', 'C 1s Carbon'],
    FOOD:      ['C 1s Carbon', 'O 1s Oxygen', 'N 1s Nitrogen', 'Na 1s Sodium', 'K 2p Potassium'],
    AERO:      ['Ni 2p Nickel', 'Si 2p Silicon', 'W 4f Tungsten', 'Ti 2p Titanium', 'Al 2p Aluminum'],
  },
  Raman: {
    PHARMA:    ['Ring Breathing Mode', 'C-C Stretching', 'C=O Stretching', 'N-H Bending', 'S-S Disulfide'],
    SEMI:      ['Si First-Order TO', 'GaAs LO Phonon', 'InP LO Phonon', 'GaN E2 High', 'SiC Folded Modes'],
    ENERGY:    ['Graphite D Band', 'Graphite G Band', 'Graphite 2D Band', 'PO4 Internal Modes', 'Fe-O Vibrations'],
    CATALYSIS: ['TiO2 Eg Mode', 'TiO2 A1g Mode', 'Al2O3 Phonon', 'ZrO2 Ag Mode', 'Coke D Band'],
    CERAMICS:  ['Al2O2 Phonon', 'ZrO2 Ag/Bg', 'SiO2 D1/D2 Bands', 'Mullite Mode', 'Glass Boson Peak'],
    POLYMER:   ['C-C Backbone', 'Ring Breathing', 'C-H Bending', 'C=O Stretching', 'C-F Stretching'],
    METALS:    ['Fe2O3 A1g Mode', 'Fe3O4 A1g Mode', 'NiO Two-Magnon', 'Cu2O Phonon', 'Cr2O3 Phonon'],
    ENVIRO:    ['Calcite ν1 CO3', 'Quartz 464 cm⁻¹', 'Gypsum ν1 SO4', 'Clay OH Stretch', 'Dolomite Mode'],
    GEO:       ['Quartz 464 cm⁻¹', 'Calcite 1086 cm⁻¹', 'Feldspar 512 cm⁻¹', 'Pyrite Ag Mode', 'Hematite A1g'],
    BIOMED:    ['PO4 ν1 Phosphate', 'Amide III Protein', 'C-H Lipid', 'Amide I Protein', 'Carbonate ν1'],
    FOOD:      ['Glucose Ring Mode', 'Sucrose Fingerprint', 'Starch C-O Stretch', 'Protein Amide III', 'Carotenoid Mode'],
    AERO:      ['SiC LO/TO Phonon', 'SiC Folded Modes', 'WC Phonon', 'Ti-6Al-4V Oxide', 'γ-prime Ni3Al'],
  },
};

// ─── Technique Base Configs ───────────────────────────────────────────────

const TECHNIQUE_CONFIGS: Record<Technique, TechniqueConfig> = {
  XRD: {
    technique: 'XRD',
    xRange: [10, 80],
    pointCount: 2000,
    xUnit: 'deg_2theta',
    yUnit: 'counts',
    defaultSNR: 120,
    defaultBaseline: { type: 'polynomial', coefficients: [8.2, -0.15, 0.003, -0.00002] },
    defaultPeaks: [
      { center: 18.3, width: 0.22, amplitude: 18, eta: 0.22 },
      { center: 25.3, width: 0.24, amplitude: 45, eta: 0.22 },
      { center: 30.1, width: 0.24, amplitude: 52, eta: 0.22 },
      { center: 35.5, width: 0.27, amplitude: 92, eta: 0.22 },
      { center: 37.1, width: 0.25, amplitude: 24, eta: 0.22 },
      { center: 43.2, width: 0.30, amplitude: 48, eta: 0.22 },
      { center: 48.5, width: 0.28, amplitude: 35, eta: 0.22 },
      { center: 53.6, width: 0.34, amplitude: 28, eta: 0.22 },
      { center: 57.1, width: 0.37, amplitude: 39, eta: 0.22 },
      { center: 62.7, width: 0.40, amplitude: 45, eta: 0.22 },
    ],
  },
  FTIR: {
    technique: 'FTIR',
    xRange: [400, 4000],
    pointCount: 2000,
    xUnit: 'wavenumber_cm-1',
    yUnit: 'absorbance',
    defaultSNR: 200,
    defaultBaseline: { type: 'polynomial', coefficients: [0.08, -0.00004, 0.00000002] },
    defaultPeaks: [
      { center: 450, width: 25, amplitude: 0.72, eta: 0.30 },
      { center: 560, width: 30, amplitude: 0.85, eta: 0.30 },
      { center: 1050, width: 40, amplitude: 0.45, eta: 0.25 },
      { center: 1380, width: 35, amplitude: 0.32, eta: 0.28 },
      { center: 1630, width: 45, amplitude: 0.40, eta: 0.25 },
      { center: 2850, width: 60, amplitude: 0.30, eta: 0.30 },
      { center: 2920, width: 65, amplitude: 0.35, eta: 0.30 },
      { center: 3420, width: 180, amplitude: 0.55, eta: 0.40 },
    ],
  },
  XPS: {
    technique: 'XPS',
    xRange: [525, 540],
    pointCount: 1500,
    xUnit: 'eV',
    yUnit: 'counts',
    defaultSNR: 60,
    defaultBaseline: { type: 'polynomial', coefficients: [120, -0.8, 0.005] },
    defaultPeaks: [
      { center: 529.5, width: 0.9, amplitude: 85, eta: 0.65 },
      { center: 531.2, width: 1.1, amplitude: 62, eta: 0.55 },
      { center: 532.8, width: 1.3, amplitude: 30, eta: 0.50 },
      { center: 535.0, width: 1.5, amplitude: 18, eta: 0.50 },
    ],
  },
  Raman: {
    technique: 'Raman',
    xRange: [100, 1000],
    pointCount: 2000,
    xUnit: 'cm-1',
    yUnit: 'intensity_au',
    defaultSNR: 50,
    defaultBaseline: { type: 'exponential', coefficients: [5, 80, 350] },
    defaultPeaks: [
      { center: 210, width: 12.7, amplitude: 20, eta: 0.35 },
      { center: 290, width: 14.1, amplitude: 32, eta: 0.35 },
      { center: 395, width: 15.0, amplitude: 45, eta: 0.30 },
      { center: 480, width: 16.5, amplitude: 75, eta: 0.30 },
      { center: 540, width: 15.0, amplitude: 22, eta: 0.35 },
      { center: 612, width: 17.0, amplitude: 30, eta: 0.30 },
      { center: 690, width: 18.8, amplitude: 100, eta: 0.30 },
      { center: 775, width: 16.0, amplitude: 25, eta: 0.35 },
    ],
  },
};

// ─── Signal Generation Primitives ─────────────────────────────────────────

function gaussian(x: number, center: number, width: number, amplitude: number): number {
  return amplitude * Math.exp(-0.5 * ((x - center) / width) ** 2);
}

function lorentzian(x: number, center: number, width: number, amplitude: number): number {
  return amplitude / (1 + ((x - center) / width) ** 2);
}

function pseudoVoigt(x: number, peak: Peak): number {
  const eta = peak.eta ?? 0.28;
  return (1 - eta) * gaussian(x, peak.center, peak.width, peak.amplitude) +
         eta * lorentzian(x, peak.center, peak.width, peak.amplitude);
}

function polynomialBaseline(x: number, coefficients: number[]): number {
  let y = 0;
  for (let k = 0; k < coefficients.length; k++) {
    y += coefficients[k] * x ** k;
  }
  return y;
}

function chebyshevBaseline(x: number, coefficients: number[], xMin: number, xMax: number): number {
  const t = (2 * x - xMin - xMax) / (xMax - xMin);
  let y = coefficients[0] / 2;
  if (coefficients.length > 1) y += coefficients[1] * t;
  if (coefficients.length > 2) y += coefficients[2] * (2 * t * t - 1);
  if (coefficients.length > 3) y += coefficients[3] * (4 * t * t * t - 3 * t);
  return y;
}

function exponentialBaseline(x: number, coefficients: number[], xMin: number): number {
  const [b0, b1, tau] = coefficients;
  return b0 + b1 * Math.exp(-(x - xMin) / tau);
}

function deterministicNoise(index: number, x: number, amplitude: number, seed: number): number {
  const s = seed * 0.01;
  return amplitude * (
    0.5 * Math.sin((index + s) * 0.93 + x * 0.17) +
    0.3 * Math.sin((index + s) * 2.11 + 0.8) +
    0.2 * Math.cos((index + s) * 0.37 - x * 0.09)
  );
}

function R4(v: number): number {
  return Math.round(v * 10000) / 10000;
}

// ─── Trace Generator ──────────────────────────────────────────────────────

function generateTrace(config: TechniqueConfig, seed: number): { x: number; y: number }[] {
  const [xMin, xMax] = config.xRange;
  const maxAmp = Math.max(...config.defaultPeaks.map(p => p.amplitude), 1);
  const noiseAmp = maxAmp / config.defaultSNR;

  return Array.from({ length: config.pointCount }, (_, i) => {
    const x = R4(xMin + ((xMax - xMin) * i) / (config.pointCount - 1));

    // Baseline
    let y = 0;
    const bl = config.defaultBaseline;
    switch (bl.type) {
      case 'polynomial':
      case 'linear':
        y = polynomialBaseline(x, bl.coefficients ?? [0]);
        break;
      case 'chebyshev':
        y = chebyshevBaseline(x, bl.coefficients ?? [0], xMin, xMax);
        break;
      case 'exponential':
        y = exponentialBaseline(x, bl.coefficients ?? [0, 0, 1], xMin);
        break;
      case 'none':
      default:
        y = 0;
    }

    // Peaks
    for (const peak of config.defaultPeaks) {
      y += pseudoVoigt(x, peak);
    }

    // Noise
    y += deterministicNoise(i, x, noiseAmp, seed);

    return { x, y: R4(Math.max(y, 0)) };
  });
}

// ─── Sample ID Generator ──────────────────────────────────────────────────

function makeSampleId(technique: Technique, modeId: string, industryId: string, index: number): string {
  return `${technique}-${modeId}-${industryId}-${String(index).padStart(5, '0')}`;
}

function hashSeed(technique: string, modeId: string, industryId: string, index: number): number {
  let h = 0;
  const s = `${technique}-${modeId}-${industryId}-${index}`;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// ─── Apply industry + mode modifiers ──────────────────────────────────────

function buildConfig(
  technique: Technique,
  mode: AnalysisMode,
  industry: IndustryGroup,
  seed: number,
): TechniqueConfig {
  const base = { ...TECHNIQUE_CONFIGS[technique] };

  // Apply mode modification
  let config = mode.modifyConfig(base, seed);

  // Apply industry modifiers
  const peaks = config.defaultPeaks.map((p, i) => ({
    ...p,
    center: p.center + industry.peakShift * ((seed + i) % 7 - 3) * 0.1,
    amplitude: p.amplitude * industry.amplitudeScale * (0.85 + (seed % 10) * 0.03),
    width: p.width * industry.widthScale * (0.9 + (seed % 8) * 0.025),
  }));

  return {
    ...config,
    defaultPeaks: peaks,
    defaultSNR: config.defaultSNR * industry.snrMultiplier * (0.8 + (seed % 6) * 0.07),
  };
}

// ─── File Formatting ──────────────────────────────────────────────────────

function formatTXT(meta: SampleMeta, config: TechniqueConfig, points: { x: number; y: number }[]): string {
  const lines = [
    `# DIFARYX Synthetic Sample File`,
    `# Technique: ${meta.technique}`,
    `# Analysis Mode: ${meta.analysisMode}`,
    `# Industry: ${meta.industry}`,
    `# Sample ID: ${meta.sampleId}`,
    `# Material System: ${meta.materialSystem}`,
    `# Generated: ${new Date().toISOString()}`,
    `# Point Count: ${config.pointCount}`,
    `# X Range: [${config.xRange[0]}, ${config.xRange[1]}]`,
    `# X Unit: ${config.xUnit}`,
    `# Y Unit: ${config.yUnit}`,
    `# SNR: ${R4(config.defaultSNR)}`,
    `# Baseline: ${config.defaultBaseline.type}${config.defaultBaseline.coefficients ? ' [' + config.defaultBaseline.coefficients.map(c => R4(c)).join(', ') + ']' : ''}`,
    `# Peak Count: ${config.defaultPeaks.length}`,
    `# Seed: ${meta.seed}`,
    `# ---`,
  ];
  for (const p of points) {
    lines.push(`${R4(p.x)},${R4(p.y)}`);
  }
  return lines.join('\n');
}

// ─── Disk Space ───────────────────────────────────────────────────────────

function getFreeSpaceGB(): number {
  try {
    const s = statfsSync('D:/');
    return (s.bfree * s.bsize) / (1024 * 1024 * 1024);
  } catch {
    return Infinity;
  }
}

function checkDiskSpace(): { ok: boolean; freeGB: number } {
  const freeGB = getFreeSpaceGB();
  return { ok: freeGB >= MIN_FREE_SPACE_GB, freeGB };
}

// ─── Resume Logic ─────────────────────────────────────────────────────────

async function countExisting(dir: string, ext: string): Promise<number> {
  try {
    const files = await readdir(dir);
    return files.filter(f => f.endsWith(ext)).length;
  } catch {
    return 0;
  }
}

// ─── Distribution: 25,000 samples across 6 modes × 12 industries ─────────

function distributeSamples(total: number, modeCount: number, industryCount: number): number[][] {
  const combos = modeCount * industryCount; // 72
  const base = Math.floor(total / combos);
  const remainder = total % combos;
  const distribution: number[][] = [];

  let allocated = 0;
  for (let m = 0; m < modeCount; m++) {
    const row: number[] = [];
    for (let ind = 0; ind < industryCount; ind++) {
      const comboIdx = m * industryCount + ind;
      const count = base + (comboIdx < remainder ? 1 : 0);
      row.push(count);
      allocated += count;
    }
    distribution.push(row);
  }

  return distribution;
}

// ─── Main Generator ───────────────────────────────────────────────────────

async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

interface RunStats {
  technique: Technique;
  totalGenerated: number;
  totalSkipped: number;
  elapsed: number;
}

async function runTechnique(technique: Technique): Promise<RunStats> {
  const t0 = performance.now();
  const modes = ANALYSIS_MODES[technique];
  const industries = INDUSTRY_GROUPS;
  const baseConfig = TECHNIQUE_CONFIGS[technique];

  const txtDir = join(OUTPUT_ROOT, technique, 'txt');
  await ensureDir(txtDir);

  // Count existing
  const existingTxt = await countExisting(txtDir, '.txt');
  if (existingTxt >= SAMPLES_PER_TECHNIQUE) {
    console.log(`  ✅  ${technique} already complete (${existingTxt.toLocaleString()} files). Skipping.`);
    return { technique, totalGenerated: 0, totalSkipped: existingTxt, elapsed: 0 };
  }

  const distribution = distributeSamples(SAMPLES_PER_TECHNIQUE, modes.length, industries.length);

  console.log(`\n${'='.repeat(72)}`);
  console.log(`🔬  ${technique} — Target: ${SAMPLES_PER_TECHNIQUE.toLocaleString()} samples`);
  console.log(`    📂  Found ${existingTxt.toLocaleString()} existing TXT files`);
  console.log(`${'='.repeat(72)}`);

  let totalGenerated = 0;
  let skipped = 0;
  let batchBuffer: { txtPath: string; txtContent: string }[] = [];

  for (let m = 0; m < modes.length; m++) {
    const mode = modes[m];

    for (let ind = 0; ind < industries.length; ind++) {
      const industry = industries[ind];
      const count = distribution[m][ind];

      for (let i = 0; i < count; i++) {
        const globalIndex = totalGenerated + skipped;
        const sampleId = makeSampleId(technique, mode.id, industry.id, i + 1);
        const txtPath = join(txtDir, `${sampleId}.txt`);

        // Skip if already exists
        if (existingTxt > 0 && totalGenerated + skipped < existingTxt) {
          skipped++;
          continue;
        }

        // Check disk space periodically
        if (batchBuffer.length === 0 && totalGenerated % 1000 === 0) {
          const { ok, freeGB } = checkDiskSpace();
          if (!ok) {
            console.error(`\n🛑  DISK SPACE CRITICAL: ${freeGB.toFixed(1)} GB free. Halting ${technique}.`);
            // Flush remaining
            if (batchBuffer.length > 0) {
              await writeBatch(batchBuffer);
            }
            return { technique, totalGenerated, totalSkipped: skipped, elapsed: performance.now() - t0 };
          }
        }

        const seed = hashSeed(technique, mode.id, industry.id, i + 1);
        const materials = MATERIAL_SYSTEMS[technique][industry.id];
        const material = materials[i % materials.length];

        const config = buildConfig(technique, mode, industry, seed);
        const points = generateTrace(config, seed);

        const meta: SampleMeta = {
          sampleId,
          technique,
          analysisMode: mode.name,
          industry: industry.name,
          materialSystem: material,
          seed,
        };

        batchBuffer.push({
          txtPath,
          txtContent: formatTXT(meta, config, points),
        });

        totalGenerated++;

        // Flush batch
        if (batchBuffer.length >= BATCH_WRITE_SIZE) {
          await writeBatch(batchBuffer);
          batchBuffer = [];

          const pct = ((totalGenerated / SAMPLES_PER_TECHNIQUE) * 100).toFixed(1);
          const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
          process.stdout.write(`\r  📝  ${technique}: ${totalGenerated.toLocaleString()} / ${SAMPLES_PER_TECHNIQUE.toLocaleString()} (${pct}%) [${elapsed}s]`);
        }
      }
    }
  }

  // Flush remaining
  if (batchBuffer.length > 0) {
    await writeBatch(batchBuffer);
  }

  const elapsed = performance.now() - t0;
  console.log(`\n  ✅  ${technique} complete: ${totalGenerated.toLocaleString()} new files in ${(elapsed / 1000).toFixed(1)}s`);

  return { technique, totalGenerated, totalSkipped: skipped, elapsed };
}

async function writeBatch(batch: { txtPath: string; txtContent: string }[]): Promise<void> {
  await Promise.all(
    batch.map(b => writeFile(b.txtPath, b.txtContent, 'utf-8'))
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const globalT0 = performance.now();
  const totalTarget = SAMPLES_PER_TECHNIQUE * 4;

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║          DIFARYX — Sample Library Generator                            ║');
  console.log('║          4 Techniques × 25,000 samples = 100,000 files                ║');
  console.log('║          Format: TXT (100,000 total files)                              ║');
  console.log(`║          Target: ${totalTarget.toLocaleString().padStart(8)} samples                                       ║`);
  console.log('║          Analysis Modes: 6 per technique                               ║');
  console.log('║          Industry Groups: 12 sectors                                   ║');
  console.log(`║          Storage: ${OUTPUT_ROOT}                         ║`);
  console.log(`║          Disk: ${getFreeSpaceGB().toFixed(0)} GB free                                            ║`);
  console.log('╚══════════════════════════════════════════════════════════════════════════╝');
  console.log('');

  await ensureDir(OUTPUT_ROOT);

  const techniques: Technique[] = ['XRD', 'FTIR', 'XPS', 'Raman'];
  const stats: RunStats[] = [];

  for (const technique of techniques) {
    const { ok, freeGB } = checkDiskSpace();
    if (!ok) {
      console.error(`\n🛑  DISK SPACE CRITICAL: ${freeGB.toFixed(1)} GB free. Halting.`);
      break;
    }
    const stat = await runTechnique(technique);
    stats.push(stat);
  }

  // Production manifest
  const globalElapsed = performance.now() - globalT0;
  const totalGenerated = stats.reduce((s, r) => s + r.totalGenerated, 0);
  const totalSkipped = stats.reduce((s, r) => s + r.totalSkipped, 0);

  const manifest = {
    runId: `samplelib-${Date.now()}`,
    generatedAt: new Date().toISOString(),
    version: 'v1-sample-library',
    techniques: stats.map(s => ({
      technique: s.technique,
      targetSamples: SAMPLES_PER_TECHNIQUE,
      generated: s.totalGenerated,
      skipped: s.totalSkipped,
      elapsedSeconds: +(s.elapsed / 1000).toFixed(2),
    })),
    aggregate: {
      totalTarget,
      totalGenerated,
      totalSkipped,
      totalFiles: totalGenerated,
      totalElapsedSeconds: +(globalElapsed / 1000).toFixed(2),
      throughputSamplesPerSec: +(totalGenerated / (globalElapsed / 1000)).toFixed(1),
    },
    analysisModes: Object.fromEntries(
      Object.entries(ANALYSIS_MODES).map(([t, modes]) => [t, modes.map(m => m.name)])
    ),
    industryGroups: INDUSTRY_GROUPS.map(i => i.name),
    outputRoot: OUTPUT_ROOT,
    formats: ['txt'],
    diskSpaceRemainingGB: +getFreeSpaceGB().toFixed(1),
  };

  await writeFile(join(OUTPUT_ROOT, 'production-manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');

  // Final report
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║                    SAMPLE LIBRARY GENERATION COMPLETE                  ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝');
  console.log('');

  for (const s of stats) {
    console.log(`  ✅  ${s.technique.padEnd(6)} → ${s.totalGenerated.toLocaleString().padStart(6)} samples | ${(s.elapsed / 1000).toFixed(1)}s`);
  }

  console.log('');
  console.log(`  📊  Total generated  : ${totalGenerated.toLocaleString()} samples`);
  console.log(`  📁  Total files      : ${totalGenerated.toLocaleString()} (TXT)`);
  console.log(`  ⏱️   Total time       : ${(globalElapsed / 1000).toFixed(1)}s (${(globalElapsed / 60000).toFixed(1)} min)`);
  console.log(`  🚀  Throughput       : ${(totalGenerated / (globalElapsed / 1000)).toFixed(0)} samples/s`);
  console.log(`  💾  Disk remaining   : ${getFreeSpaceGB().toFixed(1)} GB`);
  console.log(`  📁  Output           : ${OUTPUT_ROOT}`);
  console.log(`  📋  Manifest         : ${join(OUTPUT_ROOT, 'production-manifest.json')}`);
  console.log('');
}

main().catch((err) => {
  console.error('\n💥  FATAL ERROR:', err);
  process.exit(1);
});