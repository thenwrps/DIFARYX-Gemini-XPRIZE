/**
 * Canonical DIFARYX parameter registry.
 *
 * This file is the single source of truth for Workspace controls, persisted
 * Condition Locks, processing adapters, evidence provenance, and Agent prompts.
 * UI modules may add layout copy, but must not redefine defaults or ranges.
 */

import type { ParameterDefinition as LegacyParameterDefinition } from '../types/parameters';

export const PARAMETER_SCHEMA_VERSION = '3.0.0' as const;

export type CanonicalTechnique = 'xrd' | 'xps' | 'ftir' | 'raman';
export type ParameterCategory = 'measurement' | 'processing' | 'interpretation' | 'validation';
export type CanonicalParameterType =
  | 'number'
  | 'string'
  | 'boolean'
  | 'select'
  | 'multi_select'
  | 'datetime';
export type CanonicalParameterValue = string | number | boolean | string[] | null;
export type ParameterSource =
  | 'instrument'
  | 'imported_metadata'
  | 'user'
  | 'system_default'
  | 'agent_inferred'
  | 'not_available';
export type ParameterLifecycleStatus =
  | 'active_and_applied'
  | 'stored_but_not_active'
  | 'missing'
  | 'inferred'
  | 'locked'
  | 'modified_after_run';
export type CanonicalContextStatus = 'draft' | 'ready' | 'locked' | 'validation_limited' | 'invalid';
export type AnalysisModeId = 'gpt-5.6-scientific' | 'gemini-2.5-flash' | 'scientific-baseline';

export interface AllowedRange {
  min?: number;
  max?: number;
  step?: number;
}

export interface CanonicalParameterDefinition {
  id: string;
  label: string;
  category: ParameterCategory;
  type: CanonicalParameterType;
  unit: string | null;
  defaultValue: CanonicalParameterValue;
  allowedRange: AllowedRange | null;
  options: string[];
  required: boolean;
  active: boolean;
  locked: boolean;
  source: ParameterSource;
  version: string;
  affects: string[];
  uiSurface: 'workspace' | 'condition_lock' | 'both' | 'hidden';
  description?: string;
}

export interface CanonicalParameter extends CanonicalParameterDefinition {
  value: CanonicalParameterValue;
  stored: true;
  status: ParameterLifecycleStatus;
  updatedAt: string;
}

export interface CanonicalSourceFile {
  filename: string;
  sha256: string | null;
  byteSize?: number;
  mediaType?: string;
  role?: 'primary' | 'supporting' | 'replicate' | 'validation';
}

export interface AnalysisModeProfile {
  id: AnalysisModeId;
  label: string;
  model: string | null;
  provider: 'openai' | 'google' | 'deterministic';
  usesLlm: boolean;
  capabilities: string[];
  limitations: string[];
}

export interface CanonicalParameterProvenance {
  createdAt: string;
  updatedAt: string;
  createdBy: ParameterSource;
  processingProfileVersion: string;
  referenceSnapshotVersion: string;
  migratedFrom?: string;
  generationTimestamp?: string;
  modelProvenance?: string;
}

export interface CanonicalParameterContext {
  schemaVersion: typeof PARAMETER_SCHEMA_VERSION;
  technique: CanonicalTechnique;
  datasetId: string;
  sourceFiles: CanonicalSourceFile[];
  measurementConditions: CanonicalParameter[];
  processingParameters: CanonicalParameter[];
  interpretationParameters: CanonicalParameter[];
  validationParameters: CanonicalParameter[];
  analysisMode: AnalysisModeProfile;
  provenance: CanonicalParameterProvenance;
  status: CanonicalContextStatus;
}

export const ANALYSIS_MODE_REGISTRY: Record<AnalysisModeId, AnalysisModeProfile> = {
  'gpt-5.6-scientific': {
    id: 'gpt-5.6-scientific',
    label: 'GPT-5.6 Scientific Reasoning',
    model: 'GPT-5.6',
    provider: 'openai',
    usesLlm: true,
    capabilities: [
      'Evidence synthesis',
      'Claim-evidence reasoning',
      'Cross-technique interpretation',
      'Validation-gap reasoning',
      'Next-experiment recommendation',
      'Contextual scientific discussion',
    ],
    limitations: ['Does not replace experimental validation'],
  },
  'gemini-2.5-flash': {
    id: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    model: 'Gemini 2.5 Flash',
    provider: 'google',
    usesLlm: true,
    capabilities: [
      'Evidence synthesis',
      'Structured interpretation',
      'Cross-technique comparison',
      'Validation-gap identification',
      'Scientific discussion',
      'Next-step recommendation',
    ],
    limitations: ['Does not replace experimental validation'],
  },
  'scientific-baseline': {
    id: 'scientific-baseline',
    label: 'Scientific Baseline Mode',
    model: null,
    provider: 'deterministic',
    usesLlm: false,
    capabilities: [
      'Signal parsing',
      'Calibration',
      'Baseline correction',
      'Feature detection',
      'Reference matching',
      'Basic feature extraction',
      'Rule-based observations',
      'Simple confidence scoring',
    ],
    limitations: ['No LLM reasoning', 'No generated discussion', 'Limited interpretation'],
  },
};

type DefinitionOptions = Partial<Omit<CanonicalParameterDefinition,
  'id' | 'label' | 'category' | 'type' | 'unit' | 'defaultValue' | 'allowedRange' |
  'options' | 'required' | 'active' | 'locked' | 'source' | 'version' | 'affects' | 'uiSurface'
>> & {
  unit?: string | null;
  range?: AllowedRange | null;
  options?: string[];
  required?: boolean;
  active?: boolean;
  locked?: boolean;
  source?: ParameterSource;
  affects?: string[];
  uiSurface?: CanonicalParameterDefinition['uiSurface'];
};

function parameter(
  id: string,
  label: string,
  category: ParameterCategory,
  type: CanonicalParameterType,
  defaultValue: CanonicalParameterValue,
  options: DefinitionOptions = {},
): CanonicalParameterDefinition {
  return {
    id,
    label,
    category,
    type,
    unit: options.unit ?? null,
    defaultValue,
    allowedRange: options.range ?? null,
    options: options.options ?? [],
    required: options.required ?? false,
    active: options.active ?? true,
    locked: options.locked ?? false,
    source: options.source ?? (defaultValue === null ? 'not_available' : 'system_default'),
    version: PARAMETER_SCHEMA_VERSION,
    affects: options.affects ?? [],
    uiSurface: options.uiSurface ?? (category === 'measurement' ? 'condition_lock' : 'workspace'),
    description: options.description,
  };
}

const commonMeasurement = (): CanonicalParameterDefinition[] => [
  parameter('instrument', 'Instrument', 'measurement', 'string', null, { required: true, source: 'not_available' }),
  parameter('sampleId', 'Sample ID', 'measurement', 'string', null, { required: true, source: 'not_available' }),
  parameter('samplePreparation', 'Sample preparation', 'measurement', 'string', null, { source: 'not_available' }),
  parameter('measurementTimestamp', 'Measurement timestamp', 'measurement', 'datetime', null, { required: true, source: 'not_available' }),
  parameter('rawSourceFilename', 'Raw source filename', 'measurement', 'string', null, { required: true, locked: true, source: 'not_available' }),
  parameter('rawFileHash', 'Raw file SHA-256', 'measurement', 'string', null, { required: true, locked: true, source: 'not_available' }),
];

const commonPolicy = (
  database: string,
  tolerance: number,
  toleranceUnit: string,
  databaseOptions: string[],
): CanonicalParameterDefinition[] => [
  parameter('referenceDatabase', 'Reference database provider', 'interpretation', 'select', database, {
    options: databaseOptions,
    affects: ['reference-matching', 'assignment'],
  }),
  parameter('referenceDatabaseVersion', 'Reference database version', 'interpretation', 'string', 'demo-curated-2026.07', { affects: ['reference-matching', 'assignment'] }),
  parameter('referenceDatabaseLicense', 'Reference database license', 'interpretation', 'string', database === 'COD' ? 'CC0-1.0' : 'Provider terms', { affects: ['reference-matching', 'assignment'] }),
  parameter('matchingTolerance', 'Matching tolerance', 'interpretation', 'number', tolerance, { unit: toleranceUnit, range: { min: 0, max: toleranceUnit === 'eV' ? 2 : 50, step: 0.01 }, affects: ['reference-matching', 'assignment'] }),
  parameter('minimumEvidenceThreshold', 'Minimum evidence threshold', 'interpretation', 'number', 0.5, { range: { min: 0, max: 1, step: 0.05 }, affects: ['claim-boundary'] }),
  parameter('minimumConfidence', 'Minimum confidence', 'interpretation', 'number', 0.5, { range: { min: 0, max: 1, step: 0.05 }, affects: ['claim-boundary'] }),
  parameter('interpretationMode', 'Interpretation mode', 'interpretation', 'select', 'conservative', { options: ['conservative', 'exploratory'], affects: ['agent-reasoning', 'claim-boundary'] }),
  parameter('claimScope', 'Claim scope', 'validation', 'select', 'evidence-limited', { options: ['observation-only', 'evidence-limited', 'validated'], affects: ['claim-boundary'] }),
  parameter('complementaryEvidenceRequirement', 'Complementary evidence requirement', 'validation', 'multi_select', [], { options: ['XRD', 'XPS', 'FTIR', 'Raman', 'ICP-OES', 'SEM-EDS', 'Replicate'], affects: ['validation-gap'] }),
  parameter('contradictionPolicy', 'Contradiction policy', 'validation', 'select', 'preserve-and-escalate', { options: ['preserve-and-escalate', 'block-claim'], affects: ['validation-gap', 'agent-reasoning'] }),
  parameter('requiredNextExperiment', 'Required next experiment', 'validation', 'string', 'Collect the missing validation evidence', { affects: ['next-action'] }),
  parameter('validationBoundaryPolicy', 'Validation boundary policy', 'validation', 'select', 'validation-limited', { options: ['validation-limited', 'block-on-missing', 'approved-reference-required'], affects: ['claim-boundary', 'report'] }),
];

const XRD_DEFINITIONS: CanonicalParameterDefinition[] = [
  ...commonMeasurement(),
  parameter('radiationSource', 'Radiation source', 'measurement', 'select', 'Cu Kα', { options: ['Cu Kα', 'Co Kα', 'Mo Kα', 'Other'], required: true }),
  parameter('wavelength', 'Wavelength', 'measurement', 'number', 1.5406, { unit: 'Å', range: { min: 0.1, max: 3, step: 0.0001 }, required: true, affects: ['reference-matching', 'refinement'], uiSurface: 'both' }),
  parameter('geometry', 'Geometry', 'measurement', 'select', 'Bragg-Brentano', { options: ['Bragg-Brentano', 'Grazing incidence', 'Transmission', 'Other'] }),
  parameter('twoThetaMin', '2θ minimum', 'measurement', 'number', 10, { unit: '°2θ', range: { min: 0, max: 180, step: 0.1 }, required: true, affects: ['baseline', 'peaks', 'match'], uiSurface: 'both' }),
  parameter('twoThetaMax', '2θ maximum', 'measurement', 'number', 80, { unit: '°2θ', range: { min: 0, max: 180, step: 0.1 }, required: true, affects: ['baseline', 'peaks', 'match'], uiSurface: 'both' }),
  parameter('stepSize', 'Step size', 'measurement', 'number', null, { unit: '°2θ', range: { min: 0.0001, max: 1, step: 0.001 }, required: true, source: 'not_available' }),
  parameter('scanRate', 'Scan rate', 'measurement', 'number', null, { unit: '°/min', range: { min: 0.001, max: 100, step: 0.01 }, source: 'not_available' }),
  parameter('countingTime', 'Counting time', 'measurement', 'number', null, { unit: 's/step', range: { min: 0, max: 3600, step: 0.1 }, source: 'not_available' }),
  parameter('sampleRotation', 'Sample rotation', 'measurement', 'boolean', false),
  parameter('sampleHolder', 'Sample holder', 'measurement', 'string', null, { source: 'not_available' }),
  parameter('calibrationReference', 'Calibration reference', 'measurement', 'string', null, { required: true, source: 'not_available' }),
  parameter('atmosphere', 'Atmosphere', 'measurement', 'string', null, { source: 'not_available' }),
  parameter('kAlphaHandling', 'Kα1/Kα2 handling', 'processing', 'select', 'combined', { options: ['combined', 'strip-kalpha2', 'monochromated-kalpha1'], active: false, affects: ['calibration', 'peaks'] }),
  parameter('zeroShift', 'Zero shift', 'processing', 'number', 0, { unit: '°2θ', range: { min: -2, max: 2, step: 0.001 }, active: false, affects: ['calibration', 'match'] }),
  parameter('sampleDisplacement', 'Sample displacement', 'processing', 'number', 0, { unit: 'mm', range: { min: -5, max: 5, step: 0.001 }, active: false, affects: ['calibration', 'refinement'] }),
  parameter('baselineMethod', 'Baseline method', 'processing', 'select', 'Asymmetric LS', { options: ['Asymmetric LS', 'Polynomial', 'Rolling Ball', 'None'], affects: ['baseline'] }),
  parameter('baselineLambda', 'Baseline lambda', 'processing', 'number', 1e6, { range: { min: 1e2, max: 1e9, step: 1e5 }, affects: ['baseline'] }),
  parameter('baselineP', 'Baseline asymmetry', 'processing', 'number', 0.01, { range: { min: 0.001, max: 0.1, step: 0.001 }, affects: ['baseline'] }),
  parameter('baselineIterations', 'Baseline iterations', 'processing', 'number', 10, { range: { min: 1, max: 100, step: 1 }, affects: ['baseline'] }),
  parameter('smoothingMethod', 'Smoothing method', 'processing', 'select', 'Savitzky-Golay', { options: ['Savitzky-Golay', 'Moving Average', 'None'], affects: ['smooth'] }),
  parameter('smoothingWindow', 'Smoothing window', 'processing', 'number', 7, { range: { min: 3, max: 51, step: 2 }, affects: ['smooth'] }),
  parameter('smoothingPolynomialOrder', 'Smoothing polynomial order', 'processing', 'number', 2, { range: { min: 1, max: 5, step: 1 }, affects: ['smooth'] }),
  parameter('minimumProminence', 'Peak prominence', 'processing', 'number', 0.08, { range: { min: 0, max: 1, step: 0.01 }, affects: ['peaks'] }),
  parameter('peakMinDistance', 'Minimum peak distance', 'processing', 'number', 0.2, { unit: '°2θ', range: { min: 0.05, max: 2, step: 0.05 }, affects: ['peaks'] }),
  parameter('peakThreshold', 'Peak height threshold', 'processing', 'number', 0.12, { range: { min: 0, max: 1, step: 0.01 }, affects: ['peaks'] }),
  parameter('fitModel', 'Peak fitting model', 'processing', 'select', 'Pseudo-Voigt', { options: ['Pseudo-Voigt', 'Gaussian', 'Lorentzian'], affects: ['fit'] }),
  parameter('peakFitTolerance', 'Peak fit tolerance', 'processing', 'number', 1e-4, { range: { min: 1e-6, max: 1e-2, step: 1e-6 }, affects: ['fit'] }),
  parameter('peakFitMaxIterations', 'Peak fit maximum iterations', 'processing', 'number', 100, { range: { min: 10, max: 1000, step: 10 }, affects: ['fit'] }),
  parameter('peakMaxCount', 'Maximum peak count', 'processing', 'number', 40, { range: { min: 1, max: 1000, step: 1 }, affects: ['peaks'] }),
  parameter('peakFitWindow', 'Peak fit window', 'processing', 'number', 0.8, { unit: '°2θ', range: { min: 0.05, max: 10, step: 0.05 }, affects: ['fit'] }),
  parameter('refineFWHM', 'Refine FWHM', 'processing', 'boolean', true, { affects: ['fit'] }),
  parameter('refineShape', 'Refine peak shape', 'processing', 'boolean', true, { affects: ['fit'] }),
  parameter('calculateCrystalliteSize', 'Calculate crystallite size', 'processing', 'boolean', true, { affects: ['fit'] }),
  parameter('scherrerConstant', 'Scherrer constant', 'processing', 'number', 0.89, { range: { min: 0.1, max: 2, step: 0.01 }, affects: ['fit'] }),
  parameter('instrumentalBroadening', 'Instrumental broadening', 'processing', 'number', 0.05, { unit: '°2θ', range: { min: 0, max: 5, step: 0.001 }, affects: ['fit'] }),
  parameter('calculateMicrostrain', 'Calculate microstrain', 'processing', 'boolean', false, { affects: ['fit'] }),
  parameter('referenceMatchEnabled', 'Reference matching enabled', 'processing', 'boolean', true, { affects: ['match'] }),
  parameter('referenceMatchMode', 'Reference matching mode', 'processing', 'select', 'Targeted Candidate Match', { options: ['Disabled', 'Candidate Screening', 'Targeted Candidate Match'], affects: ['match'] }),
  parameter('referenceSetId', 'Reference set ID', 'processing', 'string', 'spinel_ferrite_sba15_demo_set', { affects: ['match'] }),
  parameter('candidatePhaseIds', 'Candidate phase IDs', 'processing', 'multi_select', [], { affects: ['match'] }),
  parameter('referenceMatchMinPeaks', 'Minimum matched peaks', 'processing', 'number', 3, { range: { min: 1, max: 1000, step: 1 }, affects: ['match'] }),
  parameter('referenceMatchMinCoverage', 'Minimum coverage ratio', 'processing', 'number', 0.5, { range: { min: 0, max: 1, step: 0.05 }, affects: ['match'] }),
  parameter('referenceMatchMinScore', 'Minimum match score', 'processing', 'number', 0.7, { range: { min: 0, max: 1, step: 0.05 }, affects: ['match'] }),
  parameter('referenceMatchUseRelativeIntensity', 'Use relative intensity', 'processing', 'boolean', false, { affects: ['match'] }),
  parameter('referenceMatchIntensityTolerance', 'Intensity tolerance ratio', 'processing', 'number', 0.5, { range: { min: 0, max: 1, step: 0.05 }, affects: ['match'] }),
  parameter('referenceMatchAllowUnknown', 'Allow unknown search', 'processing', 'boolean', false, { affects: ['match'] }),
  parameter('boundaryClaimMode', 'Claim mode', 'validation', 'select', 'Standard', { options: ['Conservative', 'Standard', 'Exploratory'], affects: ['claim-boundary'] }),
  parameter('boundaryAllowIdentityClaim', 'Allow identity claim', 'validation', 'boolean', false, { affects: ['claim-boundary'] }),
  parameter('boundaryAllowPhasePurityClaim', 'Allow phase-purity claim', 'validation', 'boolean', false, { affects: ['claim-boundary'] }),
  parameter('boundaryRequireComplementary', 'Require complementary evidence', 'validation', 'boolean', true, { affects: ['claim-boundary'] }),
  parameter('boundaryRequireReferenceSet', 'Require approved reference set', 'validation', 'boolean', true, { affects: ['claim-boundary'] }),
  parameter('boundaryRequireSampleContext', 'Require sample context', 'validation', 'boolean', true, { affects: ['claim-boundary'] }),
  parameter('referenceApprovalStatus', 'Reference approval status', 'validation', 'select', 'not_reviewed', { options: ['approved', 'not_reviewed', 'requires_peak_extraction', 'requires_converter', 'unsupported_format', 'corrupted_file', 'parse_error', 'not_supported_yet'], affects: ['match', 'claim-boundary'] }),
  parameter('refinementStatus', 'Refinement status', 'validation', 'select', 'not_run', { options: ['not_run', 'pending', 'complete', 'failed'], active: false, affects: ['refinement', 'claim-boundary'] }),
  ...commonPolicy('COD', 0.1, '°2θ', ['COD', 'ICDD', 'ICSD', 'Custom', 'Uploaded reference', 'Local approved reference']),
];

const XPS_DEFINITIONS: CanonicalParameterDefinition[] = [
  ...commonMeasurement(),
  parameter('xRaySource', 'X-ray source', 'measurement', 'select', 'Al Kα', { options: ['Al Kα', 'Mg Kα', 'Other'], required: true }),
  parameter('photonEnergy', 'Photon energy', 'measurement', 'number', 1486.6, { unit: 'eV', range: { min: 100, max: 5000, step: 0.1 }, required: true }),
  parameter('analyzerMode', 'Analyzer mode', 'measurement', 'select', 'Survey', { options: ['Survey', 'High-resolution', 'Depth profile'], required: true }),
  parameter('passEnergy', 'Pass energy', 'measurement', 'number', null, { unit: 'eV', range: { min: 0.1, max: 500, step: 0.1 }, required: true, source: 'not_available' }),
  parameter('energyStep', 'Energy step', 'measurement', 'number', null, { unit: 'eV', range: { min: 0.001, max: 10, step: 0.001 }, required: true, source: 'not_available' }),
  parameter('dwellTime', 'Dwell time', 'measurement', 'number', null, { unit: 'ms/point', range: { min: 0, max: 60000, step: 1 }, source: 'not_available' }),
  parameter('numberOfScans', 'Number of scans', 'measurement', 'number', null, { range: { min: 1, max: 10000, step: 1 }, source: 'not_available' }),
  parameter('spotSize', 'Spot size', 'measurement', 'number', null, { unit: 'µm', range: { min: 1, max: 10000, step: 1 }, source: 'not_available' }),
  parameter('takeOffAngle', 'Take-off angle', 'measurement', 'number', null, { unit: '°', range: { min: 0, max: 90, step: 0.1 }, source: 'not_available' }),
  parameter('vacuumLevel', 'Vacuum level', 'measurement', 'number', null, { unit: 'mbar', range: { min: 0, max: 1, step: 1e-10 }, source: 'not_available' }),
  parameter('chargeNeutralization', 'Charge neutralization', 'measurement', 'boolean', false),
  parameter('energyCalibrationReference', 'Calibration reference', 'measurement', 'select', 'C 1s (284.8 eV)', { options: ['C 1s (284.8 eV)', 'Au 4f7/2 (84.0 eV)', 'Ag 3d5/2 (368.3 eV)', 'Custom'], required: true, affects: ['calibration'], uiSurface: 'both' }),
  parameter('sampleState', 'Sample state', 'measurement', 'string', null, { source: 'not_available' }),
  parameter('sputteringCondition', 'Sputtering condition', 'measurement', 'string', null, { source: 'not_available' }),
  parameter('chargeCorrectionMethod', 'Charge correction method', 'processing', 'select', 'None', { options: ['None', 'Reference peak shift', 'Instrument neutralizer'], active: false, affects: ['calibration', 'assignment'] }),
  parameter('referencePeak', 'Reference peak', 'processing', 'select', 'C1s', { options: ['C1s', 'Au4f7', 'Ag3d5'], affects: ['calibration'] }),
  parameter('referenceEnergy', 'Reference energy', 'processing', 'number', 284.8, { unit: 'eV', range: { min: 0, max: 2000, step: 0.1 }, affects: ['calibration'] }),
  parameter('energyShift', 'Energy shift', 'processing', 'number', 0, { unit: 'eV', range: { min: -5, max: 5, step: 0.1 }, affects: ['calibration'] }),
  parameter('backgroundMethod', 'Background method', 'processing', 'select', 'Shirley', { options: ['Shirley', 'Tougaard', 'Linear', 'None'], affects: ['background-subtraction'] }),
  parameter('surveyPeakProminence', 'Survey peak prominence', 'processing', 'number', 0.1, { range: { min: 0, max: 1, step: 0.01 }, affects: ['peak-detection', 'element-screening'] }),
  parameter('surveyPeakMinDistance', 'Survey peak minimum distance', 'processing', 'number', 0.5, { unit: 'eV', range: { min: 0.05, max: 20, step: 0.05 }, affects: ['peak-detection', 'element-screening'] }),
  parameter('smoothingMethod', 'Fitting smoothing', 'processing', 'select', 'None', { options: ['None', 'Savitzky-Golay', 'Moving Average'], active: false, affects: ['display-preview'] }),
  parameter('regionSelection', 'Spectrum scope', 'processing', 'select', 'Survey', { options: ['Survey', 'C 1s', 'O 1s', 'Si 2p', 'Fe 2p', 'Cu 2p'], affects: ['peak-detection', 'peak-fitting', 'assignment'] }),
  parameter('peakModel', 'Peak fitting model', 'processing', 'select', 'Gaussian-Lorentzian', { options: ['Gaussian-Lorentzian', 'Voigt', 'Gaussian', 'Lorentzian'], affects: ['peak-fitting'] }),
  parameter('fwhmConstraint', 'FWHM constraint', 'processing', 'string', 'unconstrained', { active: false, affects: ['peak-fitting'] }),
  parameter('spinOrbitSplit', 'Spin-orbit split', 'processing', 'string', 'reference-constrained', { active: false, affects: ['peak-fitting', 'assignment'] }),
  parameter('areaRatio', 'Area ratio', 'processing', 'string', 'reference-constrained', { active: false, affects: ['peak-fitting', 'assignment'] }),
  parameter('peakAsymmetry', 'Peak asymmetry', 'processing', 'select', 'symmetric', { options: ['symmetric', 'asymmetric'], active: false, affects: ['peak-fitting'] }),
  parameter('assignmentPolicy', 'Assignment policy', 'interpretation', 'select', 'surface-evidence-only', { options: ['surface-evidence-only', 'candidate-oxidation-state', 'approved-reference-required'], affects: ['assignment', 'claim-boundary'] }),
  ...commonPolicy('NIST XPS', 0.3, 'eV', ['NIST XPS', 'PHI Handbook', 'Custom', 'Uploaded reference']),
];

const FTIR_DEFINITIONS: CanonicalParameterDefinition[] = [
  ...commonMeasurement(),
  parameter('measurementMode', 'Measurement mode', 'measurement', 'select', 'ATR', { options: ['ATR', 'Transmission', 'Reflectance'], required: true }),
  parameter('signalRepresentation', 'Signal representation', 'measurement', 'select', 'Absorbance', { options: ['Absorbance', 'Transmittance', 'Reflectance'], required: true }),
  parameter('wavenumberMin', 'Wavenumber minimum', 'measurement', 'number', 400, { unit: 'cm⁻¹', range: { min: 100, max: 4000, step: 10 }, required: true, affects: ['baseline-correction', 'band-detection'], uiSurface: 'both' }),
  parameter('wavenumberMax', 'Wavenumber maximum', 'measurement', 'number', 4000, { unit: 'cm⁻¹', range: { min: 400, max: 4500, step: 10 }, required: true, affects: ['baseline-correction', 'band-detection'], uiSurface: 'both' }),
  parameter('spectralResolution', 'Spectral resolution', 'measurement', 'number', null, { unit: 'cm⁻¹', range: { min: 0.1, max: 64, step: 0.1 }, required: true, source: 'not_available' }),
  parameter('numberOfScans', 'Number of scans', 'measurement', 'number', null, { range: { min: 1, max: 10000, step: 1 }, required: true, source: 'not_available' }),
  parameter('backgroundScans', 'Background scans', 'measurement', 'number', null, { range: { min: 1, max: 10000, step: 1 }, source: 'not_available' }),
  parameter('apodization', 'Apodization', 'measurement', 'string', null, { source: 'not_available' }),
  parameter('beamSplitter', 'Beam splitter', 'measurement', 'string', null, { source: 'not_available' }),
  parameter('detector', 'Detector', 'measurement', 'string', null, { source: 'not_available' }),
  parameter('atrCrystal', 'ATR crystal', 'measurement', 'string', null, { source: 'not_available' }),
  parameter('contactPressure', 'Contact pressure', 'measurement', 'number', null, { unit: 'instrument units', range: { min: 0, max: 10000, step: 0.1 }, source: 'not_available' }),
  parameter('sampleThickness', 'Sample thickness', 'measurement', 'number', null, { unit: 'mm', range: { min: 0, max: 100, step: 0.001 }, source: 'not_available' }),
  parameter('atmosphere', 'Atmosphere', 'measurement', 'string', null, { source: 'not_available' }),
  parameter('pretreatment', 'Pretreatment', 'measurement', 'string', null, { source: 'not_available' }),
  parameter('atrCorrection', 'ATR correction', 'processing', 'boolean', false, { active: false, affects: ['calibration'] }),
  parameter('atmosphericCompensation', 'Atmospheric compensation', 'processing', 'boolean', false, { active: false, affects: ['artifact-removal'] }),
  parameter('baselineMethod', 'Baseline method', 'processing', 'select', 'Rubberband', { options: ['Rubberband', 'ALS', 'Polynomial', 'None'], affects: ['baseline-correction'] }),
  parameter('smoothingMethod', 'Smoothing method', 'processing', 'select', 'Savitzky-Golay', { options: ['Savitzky-Golay', 'Moving Average', 'None'], affects: ['smoothing'] }),
  parameter('smoothingWindow', 'Smoothing window', 'processing', 'number', 7, { range: { min: 3, max: 25, step: 2 }, affects: ['smoothing'] }),
  parameter('bandThreshold', 'Band prominence', 'processing', 'number', 0.18, { range: { min: 0, max: 1, step: 0.01 }, affects: ['band-detection'] }),
  parameter('minimumBandDistance', 'Minimum band distance', 'processing', 'number', 10, { unit: 'cm⁻¹', range: { min: 1, max: 50, step: 1 }, affects: ['band-detection'] }),
  parameter('peakDirection', 'Peak direction', 'processing', 'select', 'auto-from-representation', { options: ['auto-from-representation', 'up', 'down'], affects: ['band-detection'] }),
  parameter('normalization', 'Normalization', 'processing', 'select', 'None', { options: ['None', 'Min-max', 'Area', 'Vector'], affects: ['smoothing', 'band-detection'] }),
  parameter('assignmentLibrary', 'Assignment library', 'interpretation', 'select', 'Functional groups', { options: ['Functional groups', 'Surface hydroxyl', 'Metal-oxygen', 'Custom'], affects: ['band-assignment'] }),
  parameter('functionalGroupAnalysisMode', 'Functional-group analysis mode', 'interpretation', 'select', 'full', { options: ['full', 'fingerprint', 'functional-group'], affects: ['band-assignment'] }),
  ...commonPolicy('SDBS', 10, 'cm⁻¹', ['SDBS', 'NIST Chemistry WebBook', 'Custom', 'Uploaded reference']),
];

const RAMAN_DEFINITIONS: CanonicalParameterDefinition[] = [
  ...commonMeasurement(),
  parameter('laserWavelength', 'Laser wavelength', 'measurement', 'number', null, { unit: 'nm', range: { min: 100, max: 2000, step: 1 }, required: true, source: 'not_available' }),
  parameter('laserPower', 'Laser power', 'measurement', 'number', null, { unit: 'mW', range: { min: 0, max: 10000, step: 0.01 }, required: true, source: 'not_available' }),
  parameter('objectiveLens', 'Objective lens', 'measurement', 'string', null, { required: true, source: 'not_available' }),
  parameter('ramanShiftMin', 'Raman shift minimum', 'measurement', 'number', 100, { unit: 'cm⁻¹', range: { min: 0, max: 3200, step: 10 }, required: true, active: false, affects: ['baseline-correction', 'peak-detection'], uiSurface: 'both' }),
  parameter('ramanShiftMax', 'Raman shift maximum', 'measurement', 'number', 3200, { unit: 'cm⁻¹', range: { min: 100, max: 4000, step: 10 }, required: true, active: false, affects: ['baseline-correction', 'peak-detection'], uiSurface: 'both' }),
  parameter('spectralResolution', 'Spectral resolution', 'measurement', 'number', null, { unit: 'cm⁻¹', range: { min: 0.1, max: 100, step: 0.1 }, source: 'not_available' }),
  parameter('integrationTime', 'Integration time', 'measurement', 'number', null, { unit: 's', range: { min: 0, max: 36000, step: 0.1 }, required: true, source: 'not_available' }),
  parameter('accumulations', 'Accumulations', 'measurement', 'number', null, { range: { min: 1, max: 10000, step: 1 }, source: 'not_available' }),
  parameter('confocalAperture', 'Confocal aperture', 'measurement', 'number', null, { unit: 'µm', range: { min: 0, max: 10000, step: 1 }, source: 'not_available' }),
  parameter('polarization', 'Polarization', 'measurement', 'string', null, { source: 'not_available' }),
  parameter('sampleTemperature', 'Sample temperature', 'measurement', 'number', null, { unit: '°C', range: { min: -273.15, max: 3000, step: 0.1 }, source: 'not_available' }),
  parameter('calibrationReference', 'Calibration reference', 'measurement', 'string', 'Silicon 520.7 cm⁻¹', { required: true }),
  parameter('cosmicRayRemoval', 'Cosmic-ray removal', 'measurement', 'boolean', true, { active: false, affects: ['artifact-removal'], uiSurface: 'both' }),
  parameter('fluorescenceCondition', 'Fluorescence condition', 'measurement', 'select', 'not_assessed', { options: ['not_assessed', 'low', 'medium', 'high'] }),
  parameter('measurementLocation', 'Measurement location', 'measurement', 'string', null, { source: 'not_available' }),
  parameter('ramanShiftCalibration', 'Raman-shift calibration', 'processing', 'select', 'reference-peak', { options: ['reference-peak', 'none'], active: false, affects: ['calibration'] }),
  parameter('cosmicRayMethod', 'Cosmic-ray detection/removal method', 'processing', 'select', 'spike-filter', { options: ['spike-filter', 'multi-accumulation-median', 'none'], active: false, affects: ['artifact-removal'] }),
  parameter('fluorescenceCorrectionMethod', 'Fluorescence correction method', 'processing', 'select', 'Polynomial', { options: ['Polynomial', 'ALS', 'Rubberband', 'None'], active: false, affects: ['baseline-correction'] }),
  parameter('baselineMethod', 'Baseline method', 'processing', 'select', 'Polynomial', { options: ['Polynomial', 'ALS', 'Rubberband', 'None'], affects: ['baseline-correction'] }),
  parameter('polynomialOrder', 'Polynomial order', 'processing', 'number', 3, { range: { min: 1, max: 8, step: 1 }, affects: ['baseline-correction'] }),
  parameter('smoothingMethod', 'Smoothing method', 'processing', 'select', 'Moving Average', { options: ['Moving Average', 'Savitzky-Golay', 'None'], affects: ['smoothing'] }),
  parameter('smoothingWindow', 'Smoothing window', 'processing', 'number', 9, { range: { min: 3, max: 25, step: 2 }, affects: ['smoothing'] }),
  parameter('peakThreshold', 'Peak prominence', 'processing', 'number', 0.14, { range: { min: 0, max: 1, step: 0.01 }, affects: ['peak-detection'] }),
  parameter('minimumDistance', 'Minimum peak distance', 'processing', 'number', 10, { unit: 'cm⁻¹', range: { min: 1, max: 50, step: 1 }, affects: ['peak-detection'] }),
  parameter('modeLibrary', 'Mode library', 'interpretation', 'select', 'Ferrite modes', { options: ['Ferrite modes', 'Carbon bands', 'Oxide modes', 'Custom'], active: false, affects: ['mode-assignment'] }),
  parameter('symmetryAnalysis', 'Symmetry analysis', 'interpretation', 'select', 'group-theory', { options: ['group-theory', 'empirical'], active: false, affects: ['mode-assignment'] }),
  parameter('defectModePolicy', 'Defect-mode policy', 'interpretation', 'select', 'include-with-caveat', { options: ['include-with-caveat', 'exclude', 'separate'], active: false, affects: ['mode-assignment', 'claim-boundary'] }),
  ...commonPolicy('RRUFF', 8, 'cm⁻¹', ['RRUFF', 'Custom', 'Uploaded reference']),
];

export const CANONICAL_PARAMETER_REGISTRY: Record<CanonicalTechnique, readonly CanonicalParameterDefinition[]> = {
  xrd: XRD_DEFINITIONS,
  xps: XPS_DEFINITIONS,
  ftir: FTIR_DEFINITIONS,
  raman: RAMAN_DEFINITIONS,
};

const XPS_ELEMENT_REGION_PARAMETER_IDS = new Set([
  'chargeCorrectionMethod',
  'referencePeak',
  'referenceEnergy',
  'energyShift',
  'peakModel',
  'fwhmConstraint',
  'spinOrbitSplit',
  'areaRatio',
  'peakAsymmetry',
  'matchingTolerance',
  'assignmentPolicy',
]);

const XPS_SURVEY_PARAMETER_IDS = new Set([
  'surveyPeakProminence',
  'surveyPeakMinDistance',
]);

export function isXpsSurveyScope(values: Record<string, CanonicalParameterValue> = {}): boolean {
  const region = String(values.regionSelection ?? 'Survey').trim().toLowerCase();
  return region === '' || region === 'survey';
}

function resolveContextualActiveState(
  technique: CanonicalTechnique,
  definition: CanonicalParameterDefinition,
  values: Record<string, CanonicalParameterValue>,
): boolean {
  if (technique !== 'xps') return definition.active;
  const surveyScope = isXpsSurveyScope(values);
  if (XPS_ELEMENT_REGION_PARAMETER_IDS.has(definition.id)) return !surveyScope;
  if (XPS_SURVEY_PARAMETER_IDS.has(definition.id)) return surveyScope;
  return definition.active;
}

export function getCanonicalParameterDefinitions(technique: CanonicalTechnique): CanonicalParameterDefinition[] {
  return CANONICAL_PARAMETER_REGISTRY[technique].map((definition) => ({
    ...definition,
    options: [...definition.options],
    affects: [...definition.affects],
    allowedRange: definition.allowedRange ? { ...definition.allowedRange } : null,
  }));
}

export function getCanonicalDefaultValues(
  technique: CanonicalTechnique,
  options: { workspaceOnly?: boolean } = {},
): Record<string, CanonicalParameterValue> {
  return Object.fromEntries(
    getCanonicalParameterDefinitions(technique)
      .filter((definition) => !options.workspaceOnly || definition.uiSurface === 'workspace' || definition.uiSurface === 'both')
      .map((definition) => [definition.id, definition.defaultValue]),
  );
}

function lifecycleFor(
  definition: CanonicalParameterDefinition,
  value: CanonicalParameterValue,
  source: ParameterSource,
  locked: boolean,
): ParameterLifecycleStatus {
  if (locked) return 'locked';
  if (value === null || value === '') return 'missing';
  if (!definition.active) return 'stored_but_not_active';
  if (source === 'agent_inferred') return 'inferred';
  return 'active_and_applied';
}

export interface CreateCanonicalContextOptions {
  datasetId: string;
  sourceFiles?: CanonicalSourceFile[];
  values?: Record<string, CanonicalParameterValue>;
  sources?: Record<string, ParameterSource>;
  analysisMode?: AnalysisModeId;
  locked?: boolean;
  now?: string;
  migratedFrom?: string;
  processingProfileVersion?: string;
  referenceSnapshotVersion?: string;
}

export function createCanonicalParameterContext(
  technique: CanonicalTechnique,
  options: CreateCanonicalContextOptions,
): CanonicalParameterContext {
  const now = options.now ?? new Date().toISOString();
  const sourceFiles = (options.sourceFiles ?? []).map((file) => ({ ...file }));
  const firstSource = sourceFiles[0];
  const suppliedValues = { ...(options.values ?? {}) };
  if (firstSource) {
    suppliedValues.rawSourceFilename ??= firstSource.filename;
    suppliedValues.rawFileHash ??= firstSource.sha256;
  }

  const contextualValues = { ...suppliedValues };
  const instantiated = getCanonicalParameterDefinitions(technique).map<CanonicalParameter>((definition) => {
    const hasSuppliedValue = Object.prototype.hasOwnProperty.call(suppliedValues, definition.id);
    const value = hasSuppliedValue ? suppliedValues[definition.id] : definition.defaultValue;
    const source = options.sources?.[definition.id]
      ?? (hasSuppliedValue ? 'user' : definition.source);
    const locked = Boolean(options.locked || definition.locked);
    const active = resolveContextualActiveState(technique, definition, contextualValues);
    const contextualDefinition = { ...definition, active };
    return {
      ...contextualDefinition,
      value,
      active,
      locked,
      source,
      stored: true,
      status: lifecycleFor(contextualDefinition, value, source, locked),
      updatedAt: now,
    };
  });

  const byCategory = (category: ParameterCategory) => instantiated.filter((item) => item.category === category);
  const missingRequired = instantiated.some((item) => item.required && (item.value === null || item.value === ''));
  const validationLimited = byCategory('validation').some((item) =>
    item.id === 'validationBoundaryPolicy' && item.value !== 'approved-reference-required',
  );

  return {
    schemaVersion: PARAMETER_SCHEMA_VERSION,
    technique,
    datasetId: options.datasetId,
    sourceFiles,
    measurementConditions: byCategory('measurement'),
    processingParameters: byCategory('processing'),
    interpretationParameters: byCategory('interpretation'),
    validationParameters: byCategory('validation'),
    analysisMode: { ...ANALYSIS_MODE_REGISTRY[options.analysisMode ?? 'scientific-baseline'] },
    provenance: {
      createdAt: now,
      updatedAt: now,
      createdBy: 'system_default',
      processingProfileVersion: options.processingProfileVersion ?? `${technique}-processing-v3`,
      referenceSnapshotVersion: options.referenceSnapshotVersion ?? `${technique}-reference-v3`,
      migratedFrom: options.migratedFrom,
      generationTimestamp: now,
      modelProvenance: ANALYSIS_MODE_REGISTRY[options.analysisMode ?? 'scientific-baseline'].model ?? 'none',
    },
    status: options.locked ? 'locked' : missingRequired ? 'draft' : validationLimited ? 'validation_limited' : 'ready',
  };
}

export function listCanonicalParameters(context: CanonicalParameterContext): CanonicalParameter[] {
  return [
    ...context.measurementConditions,
    ...context.processingParameters,
    ...context.interpretationParameters,
    ...context.validationParameters,
  ];
}

export function getCanonicalParameter(
  context: CanonicalParameterContext,
  parameterId: string,
): CanonicalParameter | undefined {
  return listCanonicalParameters(context).find((item) => item.id === parameterId);
}

export function updateCanonicalParameterContext(
  context: CanonicalParameterContext,
  updates: Record<string, CanonicalParameterValue>,
  source: ParameterSource,
  now = new Date().toISOString(),
): CanonicalParameterContext {
  const updateGroup = (items: CanonicalParameter[]) => items.map((item) => {
    if (!Object.prototype.hasOwnProperty.call(updates, item.id)) return item;
    const value = updates[item.id];
    const changedAfterRun = context.status === 'locked' || item.status === 'locked';
    return {
      ...item,
      value,
      source,
      locked: false,
      updatedAt: now,
      status: changedAfterRun
        ? 'modified_after_run' as const
        : lifecycleFor(item, value, source, false),
    };
  });
  return {
    ...context,
    measurementConditions: updateGroup(context.measurementConditions),
    processingParameters: updateGroup(context.processingParameters),
    interpretationParameters: updateGroup(context.interpretationParameters),
    validationParameters: updateGroup(context.validationParameters),
    provenance: { ...context.provenance, updatedAt: now },
    status: context.status === 'locked' ? 'validation_limited' : context.status,
  };
}

export function lockCanonicalParameterContext(
  context: CanonicalParameterContext,
  now = new Date().toISOString(),
): CanonicalParameterContext {
  const lockGroup = (items: CanonicalParameter[]) => items.map((item) => ({
    ...item,
    locked: true,
    status: 'locked' as const,
    updatedAt: now,
  }));
  return {
    ...context,
    measurementConditions: lockGroup(context.measurementConditions),
    processingParameters: lockGroup(context.processingParameters),
    interpretationParameters: lockGroup(context.interpretationParameters),
    validationParameters: lockGroup(context.validationParameters),
    provenance: { ...context.provenance, updatedAt: now },
    status: 'locked',
  };
}

export interface CanonicalParameterValidationResult {
  valid: boolean;
  errors: Array<{ parameterId?: string; code: string; message: string }>;
}

export function validateCanonicalParameterContext(
  context: CanonicalParameterContext,
): CanonicalParameterValidationResult {
  const errors: CanonicalParameterValidationResult['errors'] = [];
  if (context.schemaVersion !== PARAMETER_SCHEMA_VERSION) {
    errors.push({ code: 'SCHEMA_VERSION', message: `Expected schema ${PARAMETER_SCHEMA_VERSION}` });
  }
  if (!CANONICAL_PARAMETER_REGISTRY[context.technique]) {
    errors.push({ code: 'TECHNIQUE', message: 'Unsupported technique' });
  }
  if (!context.datasetId) errors.push({ code: 'DATASET_ID', message: 'datasetId is required' });

  const ids = new Set<string>();
  for (const item of listCanonicalParameters(context)) {
    if (ids.has(item.id)) errors.push({ parameterId: item.id, code: 'DUPLICATE_ID', message: 'Parameter ID must be unique within a technique context' });
    ids.add(item.id);
    if (item.required && (item.value === null || item.value === '')) {
      errors.push({ parameterId: item.id, code: 'REQUIRED', message: `${item.label} is required` });
    }
    if (item.type === 'number' && item.value !== null) {
      if (typeof item.value !== 'number' || !Number.isFinite(item.value)) {
        errors.push({ parameterId: item.id, code: 'TYPE', message: `${item.label} must be a finite number` });
      } else if (item.allowedRange && (
        (item.allowedRange.min !== undefined && item.value < item.allowedRange.min)
        || (item.allowedRange.max !== undefined && item.value > item.allowedRange.max)
      )) {
        errors.push({ parameterId: item.id, code: 'RANGE', message: `${item.label} is outside the allowed range` });
      }
    }
    if (item.options.length > 0 && item.value !== null) {
      const values = Array.isArray(item.value) ? item.value : [item.value];
      if (values.some((value) => !item.options.includes(String(value)))) {
        errors.push({ parameterId: item.id, code: 'OPTION', message: `${item.label} contains an unsupported option` });
      }
    }
    if (!item.active && item.status === 'active_and_applied') {
      errors.push({ parameterId: item.id, code: 'INACTIVE_APPLIED', message: `${item.label} is inactive and cannot be marked as applied` });
    }
  }
  return { valid: errors.length === 0, errors };
}

export const LEGACY_PARAMETER_ID_MAP: Record<CanonicalTechnique, Record<string, string>> = {
  xrd: {
    smoothing_window_size: 'smoothingWindow',
    smoothing_window: 'smoothingWindow',
    baseline_method: 'baselineMethod',
    peak_min_prominence: 'minimumProminence',
    peak_min_distance: 'peakMinDistance',
    peak_min_height: 'peakThreshold',
    referenceMatchTolerance: 'matchingTolerance',
  },
  xps: { chargeCorrection: 'chargeCorrectionMethod', fittingConstraint: 'fwhmConstraint' },
  ftir: { bandProminence: 'bandThreshold' },
  raman: { minimumProminence: 'peakThreshold', minDistance: 'minimumDistance' },
};

export function migrateLegacyParameterValues(
  technique: CanonicalTechnique,
  values: Record<string, unknown>,
): Record<string, CanonicalParameterValue> {
  const definitions = new Map(getCanonicalParameterDefinitions(technique).map((item) => [item.id, item]));
  const map = LEGACY_PARAMETER_ID_MAP[technique];
  const migrated: Record<string, CanonicalParameterValue> = {};
  for (const [legacyId, rawValue] of Object.entries(values ?? {})) {
    const id = map[legacyId] ?? legacyId;
    if (!definitions.has(id)) continue;
    if (rawValue === null || typeof rawValue === 'string' || typeof rawValue === 'number' || typeof rawValue === 'boolean') {
      migrated[id] = rawValue as string | number | boolean | null;
    } else if (Array.isArray(rawValue) && rawValue.every((item) => typeof item === 'string')) {
      migrated[id] = rawValue as string[];
    }
  }
  return migrated;
}

export interface CanonicalWorkspaceControl {
  id: string;
  label: string;
  type: 'select' | 'number' | 'range' | 'text' | 'toggle' | 'checkbox-group';
  defaultValue: string | number | boolean | string[];
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  affectedStepIds: string[];
  category: ParameterCategory;
  active: boolean;
  status: ParameterLifecycleStatus;
  locked: boolean;
  schemaVersion: string;
}

export function getWorkspaceParameterControls(
  technique: CanonicalTechnique,
  values: Record<string, CanonicalParameterValue> = {},
): CanonicalWorkspaceControl[] {
  return getCanonicalParameterDefinitions(technique)
    .filter((item) => (item.uiSurface === 'workspace' || item.uiSurface === 'both') && item.defaultValue !== null)
    .map((item) => {
      const active = resolveContextualActiveState(technique, item, values);
      return ({
      id: item.id,
      label: active ? item.label : `${item.label} (Not active)`,
      type: item.type === 'select' ? 'select'
        : item.type === 'multi_select' ? 'checkbox-group'
          : item.type === 'boolean' ? 'toggle'
            : item.type === 'number' ? 'number'
              : 'text',
      defaultValue: item.defaultValue as string | number | boolean | string[],
      options: item.options.length ? [...item.options] : undefined,
      min: item.allowedRange?.min,
      max: item.allowedRange?.max,
      step: item.allowedRange?.step,
      unit: item.unit ?? undefined,
      affectedStepIds: [...item.affects],
      category: item.category,
      active,
      status: active ? 'active_and_applied' : 'stored_but_not_active',
      locked: item.locked,
      schemaVersion: item.version,
      });
    });
}

// Backward-compatible registries for older accordion components. They are
// projections of the canonical registry and contain no independent defaults.
function toLegacyDefinition(item: CanonicalParameterDefinition): LegacyParameterDefinition {
  return {
    id: item.id,
    label: item.label,
    type: item.type === 'select' ? 'select' : item.type === 'boolean' ? 'boolean' : 'number',
    unit: item.unit ?? undefined,
    defaultValue: (item.defaultValue ?? 0) as string | number | boolean,
    min: item.allowedRange?.min,
    max: item.allowedRange?.max,
    step: item.allowedRange?.step,
    options: item.options.map((value) => ({ value, label: value })),
  };
}

function legacyGroups(technique: CanonicalTechnique): Record<string, LegacyParameterDefinition[]> {
  return getCanonicalParameterDefinitions(technique).reduce<Record<string, LegacyParameterDefinition[]>>((groups, item) => {
    const key = item.affects[0] ?? item.category;
    (groups[key] ??= []).push(toLegacyDefinition(item));
    return groups;
  }, {});
}

export const XRD_PARAMETER_DEFINITIONS = legacyGroups('xrd');
export const XPS_PARAMETER_DEFINITIONS = legacyGroups('xps');
export const FTIR_PARAMETER_DEFINITIONS = legacyGroups('ftir');
export const RAMAN_PARAMETER_DEFINITIONS = legacyGroups('raman');

export function getStepParameterDefinitions(technique: CanonicalTechnique, stepId: string): LegacyParameterDefinition[] {
  const registry = technique === 'xrd' ? XRD_PARAMETER_DEFINITIONS
    : technique === 'xps' ? XPS_PARAMETER_DEFINITIONS
      : technique === 'ftir' ? FTIR_PARAMETER_DEFINITIONS
        : RAMAN_PARAMETER_DEFINITIONS;
  return registry[stepId] ?? [];
}
