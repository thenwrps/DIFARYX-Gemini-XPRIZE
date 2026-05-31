/**
 * XRD Parameter Adapter
 *
 * Converts parameter state effectiveValues to XrdProcessingParams format
 * for use with runXrdPhaseIdentificationAgent.
 */

import type { XrdProcessingParams } from '../agents/xrdAgent/runner';
import type { TechniqueParameterValue } from '../data/techniqueWorkspaceContent';
import { readParameterState } from './parameterStateManager';
import type { XRDParameters } from '../types/xrdParameters';
import { DEFAULT_XRD_PARAMETERS } from '../config/xrdDefaults';

/**
 * Convert parameter state effective values to XrdProcessingParams
 */
export function convertToXrdProcessingParams(
  effectiveValues: Record<string, TechniqueParameterValue>
): XrdProcessingParams | undefined {
  const params: XrdProcessingParams = {};
  let hasAnyParams = false;

  // Smoothing parameters
  const smoothingWindowSize = effectiveValues['smoothing_window_size'] ?? effectiveValues['smoothingWindow'] ?? effectiveValues['smoothing_window'];
  if (typeof smoothingWindowSize === 'number' && smoothingWindowSize >= 3 && smoothingWindowSize <= 51) {
    // Convert window_size to radius (window_size = 2*radius + 1)
    params.smoothingRadius = Math.floor(smoothingWindowSize / 2);
    hasAnyParams = true;
  }

  // Baseline correction parameters
  const baselineMethod = effectiveValues['baseline_method'] ?? effectiveValues['baselineMethod'];
  const baselineLambda = effectiveValues['baseline_lambda'] ?? effectiveValues['baselineLambda'];

  const isAsymmetricLS = baselineMethod === 'ALS' ||
                         baselineMethod === 'asymmetric_ls' ||
                         baselineMethod === 'Asymmetric LS';

  if (isAsymmetricLS && typeof baselineLambda === 'number' && baselineLambda >= 1e2 && baselineLambda <= 1e9) {
    // Map lambda to fraction: higher lambda -> higher fraction (less removal)
    const logLambda = Math.log10(baselineLambda);
    const baselineFraction = Math.max(0.05, Math.min(0.3, 0.05 + (logLambda - 2) / (9 - 2) * (0.3 - 0.05)));
    params.baselineFraction = baselineFraction;
    params.baselineRadius = 42;
    hasAnyParams = true;
  }

  // Peak detection parameters
  const minHeight = effectiveValues['peak_min_height'] ?? effectiveValues['peakThreshold'] ?? effectiveValues['minHeight'];
  if (typeof minHeight === 'number' && minHeight >= 0) {
    params.minHeight = minHeight;
    hasAnyParams = true;
  }

  const minProminence = effectiveValues['peak_min_prominence'] ?? effectiveValues['minimumProminence'] ?? effectiveValues['minProminence'];
  if (typeof minProminence === 'number' && minProminence >= 0) {
    params.minProminence = minProminence;
    hasAnyParams = true;
  }

  const minDistance = effectiveValues['peak_min_distance'] ?? effectiveValues['peakMinDistance'] ?? effectiveValues['minDistance'];
  if (typeof minDistance === 'number' && minDistance >= 0) {
    params.minDistance = minDistance;
    hasAnyParams = true;
  }

  // Return undefined if no parameters were set (use defaults)
  return hasAnyParams ? params : undefined;
}

/**
 * Convert nested XRDParameters to flat key-value pairs matching config controls
 */
export function xrdToFlatParameters(xrd: XRDParameters): Record<string, TechniqueParameterValue> {
  const flat: Record<string, TechniqueParameterValue> = {};

  flat['twoThetaMin'] = xrd.range.twoThetaMin;
  flat['twoThetaMax'] = xrd.range.twoThetaMax;

  if (xrd.baseline.method === 'asymmetric_ls') flat['baselineMethod'] = 'Asymmetric LS';
  else if (xrd.baseline.method === 'polynomial') flat['baselineMethod'] = 'Polynomial';
  else if (xrd.baseline.method === 'rolling_ball') flat['baselineMethod'] = 'Rolling Ball';
  else flat['baselineMethod'] = 'None';

  flat['baselineLambda'] = xrd.baseline.lambda;
  flat['baselineP'] = xrd.baseline.p;

  if (xrd.smoothing.method === 'savitzky_golay') flat['smoothingMethod'] = 'Savitzky-Golay';
  else if (xrd.smoothing.method === 'moving_average') flat['smoothingMethod'] = 'Moving Average';
  else flat['smoothingMethod'] = 'None';

  flat['smoothingWindow'] = xrd.smoothing.windowSize;
  flat['smoothingPolynomialOrder'] = xrd.smoothing.polynomialOrder;

  flat['minimumProminence'] = xrd.peakDetection.minProminence;
  flat['peakMinDistance'] = xrd.peakDetection.minDistanceDeg;
  flat['peakThreshold'] = xrd.peakDetection.minHeightRatio;
  flat['peakMaxCount'] = xrd.peakDetection.maxPeakCount;

  if (xrd.peakFitting.model === 'pseudo_voigt') flat['fitModel'] = 'Pseudo-Voigt';
  else if (xrd.peakFitting.model === 'gaussian') flat['fitModel'] = 'Gaussian';
  else if (xrd.peakFitting.model === 'lorentzian') flat['fitModel'] = 'Lorentzian';

  flat['peakFitWindow'] = xrd.peakFitting.fitWindowDeg;
  flat['peakFitMaxIterations'] = xrd.peakFitting.maxIterations;
  flat['peakFitCalculateCrystalliteSize'] = xrd.peakFitting.calculateCrystalliteSize;

  flat['referenceMatchEnabled'] = xrd.referenceMatch.enabled;

  if (xrd.referenceMatch.matchMode === 'targeted_candidate_match') flat['referenceMatchMode'] = 'Targeted Candidate Match';
  else if (xrd.referenceMatch.matchMode === 'candidate_screening') flat['referenceMatchMode'] = 'Candidate Screening';
  else flat['referenceMatchMode'] = 'Disabled';

  if (xrd.referenceMatch.referenceSource === 'internal_curated') flat['referenceDatabase'] = 'ICSD';
  else if (xrd.referenceMatch.referenceSource === 'project_local_reference') flat['referenceDatabase'] = 'Local Reference';
  else if (xrd.referenceMatch.referenceSource === 'uploaded_reference') flat['referenceDatabase'] = 'Local Reference';

  if (xrd.referenceMatch.referenceSetId) {
    flat['referenceSetId'] = xrd.referenceMatch.referenceSetId;
  }
  flat['candidatePhaseIds'] = xrd.referenceMatch.candidatePhaseIds;
  flat['referenceMatchTolerance'] = xrd.referenceMatch.toleranceTwoTheta;
  flat['referenceMatchMinPeaks'] = xrd.referenceMatch.minMatchedPeaks;
  flat['referenceMatchMinCoverage'] = xrd.referenceMatch.minCoverageRatio;
  flat['referenceMatchMinScore'] = xrd.referenceMatch.minScore;
  flat['referenceMatchUseRelativeIntensity'] = xrd.referenceMatch.useRelativeIntensity;
  flat['referenceMatchIntensityTolerance'] = xrd.referenceMatch.intensityToleranceRatio;
  flat['referenceMatchAllowUnknown'] = xrd.referenceMatch.allowUnknownSearch;

  if (xrd.boundary.claimMode === 'conservative') flat['boundaryClaimMode'] = 'Conservative';
  else if (xrd.boundary.claimMode === 'standard') flat['boundaryClaimMode'] = 'Standard';
  else if (xrd.boundary.claimMode === 'exploratory') flat['boundaryClaimMode'] = 'Exploratory';

  flat['boundaryAllowIdentityClaim'] = xrd.boundary.allowIdentityClaim;
  flat['boundaryAllowPhasePurityClaim'] = xrd.boundary.allowPhasePurityClaim;
  flat['boundaryRequireComplementary'] = xrd.boundary.requireComplementaryEvidence;
  flat['boundaryRequireReferenceSet'] = xrd.boundary.requireReferenceSetForMatch;
  flat['boundaryRequireSampleContext'] = xrd.boundary.requireSampleContextForTargetedMatch;

  return flat;
}

/**
 * Restore flat overrides into nested XRDParameters
 */
export function flatToXrdParameters(
  flat: Record<string, any>,
  currentXrd?: XRDParameters
): XRDParameters {
  const base = currentXrd ? { ...currentXrd } : {
    ...DEFAULT_XRD_PARAMETERS,
    range: { ...DEFAULT_XRD_PARAMETERS.range },
    radiation: { ...DEFAULT_XRD_PARAMETERS.radiation },
    baseline: { ...DEFAULT_XRD_PARAMETERS.baseline },
    smoothing: { ...DEFAULT_XRD_PARAMETERS.smoothing },
    peakDetection: { ...DEFAULT_XRD_PARAMETERS.peakDetection },
    peakFitting: { ...DEFAULT_XRD_PARAMETERS.peakFitting },
    referenceMatch: {
      ...DEFAULT_XRD_PARAMETERS.referenceMatch,
      candidatePhaseIds: [...DEFAULT_XRD_PARAMETERS.referenceMatch.candidatePhaseIds],
    },
    boundary: { ...DEFAULT_XRD_PARAMETERS.boundary },
  };

  if (flat['twoThetaMin'] !== undefined) base.range.twoThetaMin = Number(flat['twoThetaMin']);
  if (flat['twoThetaMax'] !== undefined) base.range.twoThetaMax = Number(flat['twoThetaMax']);

  if (flat['baselineMethod'] !== undefined) {
    const val = String(flat['baselineMethod']).toLowerCase();
    if (val === 'asymmetric ls' || val === 'asymmetric_ls') base.baseline.method = 'asymmetric_ls';
    else if (val === 'polynomial') base.baseline.method = 'polynomial';
    else if (val === 'rolling ball' || val === 'rolling_ball') base.baseline.method = 'rolling_ball';
    else if (val === 'none') base.baseline.method = 'none';
  }

  if (flat['baselineLambda'] !== undefined) base.baseline.lambda = Number(flat['baselineLambda']);
  if (flat['baselineP'] !== undefined) base.baseline.p = Number(flat['baselineP']);

  if (flat['smoothingMethod'] !== undefined) {
    const val = String(flat['smoothingMethod']).toLowerCase();
    if (val === 'savitzky-golay' || val === 'savitzky_golay') base.smoothing.method = 'savitzky_golay';
    else if (val === 'moving average' || val === 'moving_average') base.smoothing.method = 'moving_average';
    else if (val === 'none') base.smoothing.method = 'none';
  }

  if (flat['smoothingWindow'] !== undefined) base.smoothing.windowSize = Number(flat['smoothingWindow']);
  if (flat['smoothingPolynomialOrder'] !== undefined) base.smoothing.polynomialOrder = Number(flat['smoothingPolynomialOrder']);

  const minProm = flat['minimumProminence'] ?? flat['peak_min_prominence'] ?? flat['minProminence'];
  if (minProm !== undefined) base.peakDetection.minProminence = Number(minProm);

  const minDistance = flat['peakMinDistance'] ?? flat['peak_min_distance'] ?? flat['minDistance'];
  if (minDistance !== undefined) base.peakDetection.minDistanceDeg = Number(minDistance);

  const minHeight = flat['peakThreshold'] ?? flat['peak_min_height'] ?? flat['minHeightRatio'];
  if (minHeight !== undefined) base.peakDetection.minHeightRatio = Number(minHeight);

  if (flat['peakMaxCount'] !== undefined) base.peakDetection.maxPeakCount = Number(flat['peakMaxCount']);

  if (flat['fitModel'] !== undefined) {
    const val = String(flat['fitModel']).toLowerCase();
    if (val === 'pseudo-voigt' || val === 'pseudo_voigt') base.peakFitting.model = 'pseudo_voigt';
    else if (val === 'gaussian') base.peakFitting.model = 'gaussian';
    else if (val === 'lorentzian') base.peakFitting.model = 'lorentzian';
  }

  if (flat['peakFitWindow'] !== undefined) base.peakFitting.fitWindowDeg = Number(flat['peakFitWindow']);
  if (flat['peakFitMaxIterations'] !== undefined) base.peakFitting.maxIterations = Number(flat['peakFitMaxIterations']);
  if (flat['peakFitCalculateCrystalliteSize'] !== undefined) base.peakFitting.calculateCrystalliteSize = Boolean(flat['peakFitCalculateCrystalliteSize']);

  if (flat['referenceMatchEnabled'] !== undefined) base.referenceMatch.enabled = Boolean(flat['referenceMatchEnabled']);

  if (flat['referenceMatchMode'] !== undefined) {
    const val = String(flat['referenceMatchMode']).toLowerCase();
    if (val === 'targeted candidate match' || val === 'targeted_candidate_match') base.referenceMatch.matchMode = 'targeted_candidate_match';
    else if (val === 'candidate screening' || val === 'candidate_screening') base.referenceMatch.matchMode = 'candidate_screening';
    else if (val === 'disabled') base.referenceMatch.matchMode = 'disabled';
  }

  if (flat['referenceDatabase'] !== undefined) {
    const val = String(flat['referenceDatabase']).toLowerCase();
    if (val === 'icsd' || val === 'internal_curated') base.referenceMatch.referenceSource = 'internal_curated';
    else if (val === 'pdf-4+') base.referenceMatch.referenceSource = 'internal_curated';
    else if (val === 'local reference' || val === 'project_local_reference') base.referenceMatch.referenceSource = 'project_local_reference';
  }

  if (flat['referenceSetId'] !== undefined) base.referenceMatch.referenceSetId = String(flat['referenceSetId']);

  if (flat['candidatePhaseIds'] !== undefined) {
    if (Array.isArray(flat['candidatePhaseIds'])) {
      base.referenceMatch.candidatePhaseIds = flat['candidatePhaseIds'];
    } else if (typeof flat['candidatePhaseIds'] === 'string') {
      base.referenceMatch.candidatePhaseIds = flat['candidatePhaseIds'].split(',').map(s => s.trim()).filter(Boolean);
    }
  }

  if (flat['referenceMatchTolerance'] !== undefined) base.referenceMatch.toleranceTwoTheta = Number(flat['referenceMatchTolerance']);
  if (flat['referenceMatchMinPeaks'] !== undefined) base.referenceMatch.minMatchedPeaks = Number(flat['referenceMatchMinPeaks']);
  if (flat['referenceMatchMinCoverage'] !== undefined) base.referenceMatch.minCoverageRatio = Number(flat['referenceMatchMinCoverage']);
  if (flat['referenceMatchMinScore'] !== undefined) base.referenceMatch.minScore = Number(flat['referenceMatchMinScore']);
  if (flat['referenceMatchUseRelativeIntensity'] !== undefined) base.referenceMatch.useRelativeIntensity = Boolean(flat['referenceMatchUseRelativeIntensity']);
  if (flat['referenceMatchIntensityTolerance'] !== undefined) base.referenceMatch.intensityToleranceRatio = Number(flat['referenceMatchIntensityTolerance']);
  if (flat['referenceMatchAllowUnknown'] !== undefined) base.referenceMatch.allowUnknownSearch = Boolean(flat['referenceMatchAllowUnknown']);

  if (flat['boundaryClaimMode'] !== undefined) {
    const val = String(flat['boundaryClaimMode']).toLowerCase();
    if (val === 'conservative') base.boundary.claimMode = 'conservative';
    else if (val === 'standard') base.boundary.claimMode = 'standard';
    else if (val === 'exploratory') base.boundary.claimMode = 'exploratory';
  }

  if (flat['boundaryAllowIdentityClaim'] !== undefined) base.boundary.allowIdentityClaim = Boolean(flat['boundaryAllowIdentityClaim']);
  if (flat['boundaryAllowPhasePurityClaim'] !== undefined) base.boundary.allowPhasePurityClaim = Boolean(flat['boundaryAllowPhasePurityClaim']);
  if (flat['boundaryRequireComplementary'] !== undefined) base.boundary.requireComplementaryEvidence = Boolean(flat['boundaryRequireComplementary']);
  if (flat['boundaryRequireReferenceSet'] !== undefined) base.boundary.requireReferenceSetForMatch = Boolean(flat['boundaryRequireReferenceSet']);
  if (flat['boundaryRequireSampleContext'] !== undefined) base.boundary.requireSampleContextForTargetedMatch = Boolean(flat['boundaryRequireSampleContext']);

  return base;
}

/**
 * Get XRD processing params for a project
 */
export function getXrdProcessingParams(
  projectId: string,
  datasetId?: string
): XrdProcessingParams | undefined {
  const paramState = readParameterState(projectId, 'xrd', datasetId);
  return convertToXrdProcessingParams(paramState.effectiveValues);
}

/**
 * Get parameter snapshot for logging/provenance
 */
export interface XrdParameterSnapshot {
  projectId: string;
  technique: 'xrd';
  datasetId?: string;
  effectiveValues: Record<string, TechniqueParameterValue>;
  processingParams: XrdProcessingParams | undefined;
  hasOverrides: boolean;
  overrideCount: number;
  lastUpdatedBy: 'workspace' | 'agent' | 'system';
  updatedAt: string;
  version: number;
}

export function getXrdParameterSnapshot(
  projectId: string,
  datasetId?: string
): XrdParameterSnapshot {
  const paramState = readParameterState(projectId, 'xrd', datasetId);
  const processingParams = convertToXrdProcessingParams(paramState.effectiveValues);

  return {
    projectId,
    technique: 'xrd',
    datasetId,
    effectiveValues: paramState.effectiveValues,
    processingParams,
    hasOverrides: Object.keys(paramState.overrides).length > 0,
    overrideCount: Object.keys(paramState.overrides).length,
    lastUpdatedBy: paramState.lastUpdatedBy,
    updatedAt: paramState.updatedAt,
    version: paramState.version,
  };
}
