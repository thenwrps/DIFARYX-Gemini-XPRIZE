import type { TechniqueId } from './demoProjectRegistry';
import {
  getWorkspaceParameterControls,
  type CanonicalParameterValue,
  type CanonicalWorkspaceControl,
} from './parameterDefinitions';

export type TechniqueWorkspaceId = Exclude<TechniqueId, 'multi'>;
export type TechniqueParameterValue = Exclude<CanonicalParameterValue, null>;
export type TechniqueParameterControlType = CanonicalWorkspaceControl['type'];
export type TechniqueParameterControl = CanonicalWorkspaceControl;

export interface TechniqueWorkspaceTab {
  id: string;
  label: string;
}

export interface TechniquePipelineStep {
  id: string;
  label: string;
  summary: string;
}

export interface TechniqueWorkspaceConfig {
  id: TechniqueWorkspaceId;
  label: string;
  title: string;
  fullName: string;
  purpose: string;
  graphLabel: string;
  featureLabel: string;
  unitLabel: string;
  centerTabs: TechniqueWorkspaceTab[];
  pipeline: TechniquePipelineStep[];
  parameters: TechniqueParameterControl[];
  reprocessLabel: string;
}

/**
 * UI labels, descriptions, tabs, and pipeline copy only.
 * Parameter definitions/defaults are projected from parameterDefinitions.ts.
 */
export const TECHNIQUE_WORKSPACE_CONFIG: Record<TechniqueWorkspaceId, TechniqueWorkspaceConfig> = {
  xrd: {
    id: 'xrd',
    label: 'XRD',
    title: 'XRD Workspace',
    fullName: 'X-ray Diffraction',
    purpose: 'Bulk phase and long-range structure evidence review.',
    graphLabel: 'Pattern',
    featureLabel: 'Peaks',
    unitLabel: '2theta',
    centerTabs: [
      { id: 'pattern', label: 'Pattern' },
      { id: 'peaks', label: 'Peaks' },
      { id: 'match', label: 'Match' },
      { id: 'residual', label: 'Residual' },
      { id: 'rietveld', label: 'Rietveld' },
    ],
    pipeline: [
      { id: 'calibration', label: 'Calibrate', summary: 'Radiation, zero shift, and source metadata are reviewed.' },
      { id: 'baseline', label: 'Baseline', summary: 'Baseline correction is recorded for phase-evidence review.' },
      { id: 'smooth', label: 'Smooth', summary: 'Smoothing is applied before peak detection.' },
      { id: 'peaks', label: 'Peak Detect', summary: 'Diffraction peaks are detected and indexed where possible.' },
      { id: 'fit', label: 'Fit Peaks', summary: 'Peak fitting state is preserved with parameter provenance.' },
      { id: 'match', label: 'Match Ref', summary: 'Approved reference matching contributes to the claim boundary.' },
      { id: 'refinement', label: 'Boundary', summary: 'Refinement remains required for stronger phase-purity claims.' },
    ],
    parameters: getWorkspaceParameterControls('xrd'),
    reprocessLabel: 'Reprocess Peaks',
  },
  xps: {
    id: 'xps',
    label: 'XPS',
    title: 'XPS Workspace',
    fullName: 'X-ray Photoelectron Spectroscopy',
    purpose: 'Surface chemistry and oxidation-state evidence review.',
    graphLabel: 'Spectrum',
    featureLabel: 'Core-level evidence',
    unitLabel: 'Binding energy',
    centerTabs: [
      { id: 'spectrum', label: 'Spectrum' },
      { id: 'peak-list', label: 'Peak List' },
      { id: 'chemical-states', label: 'Chemical States' },
      { id: 'fit', label: 'Fit' },
      { id: 'assignment', label: 'Assignment' },
      { id: 'element-analysis', label: 'Element Analysis' },
    ],
    pipeline: [
      { id: 'calibration', label: 'Calibrate', summary: 'Binding-energy calibration is recorded before fitting.' },
      { id: 'background-subtraction', label: 'Baseline', summary: 'Background model is prepared for core-level regions.' },
      { id: 'display-preview', label: 'Preview', summary: 'Optional display smoothing never changes fitting evidence.' },
      { id: 'peak-detection', label: 'Peak Detect', summary: 'Candidate photoelectron peaks are detected.' },
      { id: 'peak-fitting', label: 'Fit Peaks', summary: 'Component fitting state is recorded for review.' },
      { id: 'assignment', label: 'Assign Peaks', summary: 'Oxidation-state assignment remains surface-evidence bounded.' },
      { id: 'claim-boundary', label: 'Boundary', summary: 'Surface interpretation is checked against validation limits.' },
    ],
    parameters: getWorkspaceParameterControls('xps'),
    reprocessLabel: 'Fit Region',
  },
  ftir: {
    id: 'ftir',
    label: 'FTIR',
    title: 'FTIR Workspace',
    fullName: 'Fourier Transform Infrared',
    purpose: 'Bonding and functional-group evidence review.',
    graphLabel: 'Spectrum',
    featureLabel: 'Bands',
    unitLabel: 'Wavenumber',
    centerTabs: [
      { id: 'spectrum', label: 'Spectrum' },
      { id: 'band-list', label: 'Band List' },
      { id: 'functional-groups', label: 'Functional Groups' },
      { id: 'baseline', label: 'Baseline' },
      { id: 'assignment', label: 'Assignment' },
    ],
    pipeline: [
      { id: 'calibration', label: 'Correct', summary: 'ATR and atmospheric corrections are tracked explicitly.' },
      { id: 'baseline-correction', label: 'Baseline', summary: 'Baseline correction is prepared for band review.' },
      { id: 'smoothing', label: 'Smooth', summary: 'Spectrum smoothing is applied before band detection.' },
      { id: 'band-detection', label: 'Band Detect', summary: 'Bands are detected for functional evidence.' },
      { id: 'band-assignment', label: 'Assign Bands', summary: 'Band assignments are linked to reference provenance.' },
      { id: 'claim-boundary', label: 'Boundary', summary: 'Functional-group interpretation is checked against project limits.' },
    ],
    parameters: getWorkspaceParameterControls('ftir'),
    reprocessLabel: 'Detect Bands',
  },
  raman: {
    id: 'raman',
    label: 'Raman',
    title: 'Raman Workspace',
    fullName: 'Raman Spectroscopy',
    purpose: 'Vibrational mode and local symmetry evidence review.',
    graphLabel: 'Spectrum',
    featureLabel: 'Modes',
    unitLabel: 'Raman shift',
    centerTabs: [
      { id: 'spectrum', label: 'Spectrum' },
      { id: 'peak-list', label: 'Peak List' },
      { id: 'mode-assignments', label: 'Mode Assignments' },
      { id: 'baseline', label: 'Baseline' },
      { id: 'assignment', label: 'Assignment' },
    ],
    pipeline: [
      { id: 'calibration', label: 'Calibrate', summary: 'Raman-shift calibration is recorded with its reference.' },
      { id: 'artifact-removal', label: 'Artifacts', summary: 'Cosmic-ray and fluorescence handling is explicit.' },
      { id: 'baseline-correction', label: 'Baseline', summary: 'Baseline correction is prepared for mode review.' },
      { id: 'smoothing', label: 'Smooth', summary: 'Signal smoothing is applied before peak detection.' },
      { id: 'peak-detection', label: 'Peak Detect', summary: 'Raman peaks are detected for mode assignment.' },
      { id: 'mode-assignment', label: 'Assign Modes', summary: 'Vibrational modes retain library and policy provenance.' },
      { id: 'claim-boundary', label: 'Boundary', summary: 'Mode interpretation is checked against scientific boundaries.' },
    ],
    parameters: getWorkspaceParameterControls('raman'),
    reprocessLabel: 'Detect Modes',
  },
};

export function getTechniqueWorkspaceConfig(technique: TechniqueWorkspaceId): TechniqueWorkspaceConfig {
  return TECHNIQUE_WORKSPACE_CONFIG[technique];
}
