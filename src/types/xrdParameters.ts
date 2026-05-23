export type XRDBaselineMethod = 'asymmetric_ls' | 'polynomial' | 'rolling_ball' | 'none';
export type XRDSmoothingMethod = 'savitzky_golay' | 'moving_average' | 'none';
export type XRDPeakFitModel = 'pseudo_voigt' | 'gaussian' | 'lorentzian';
export type XRDReferenceSource = 'internal_curated' | 'project_local_reference' | 'uploaded_reference';
export type XRDMatchMode = 'disabled' | 'candidate_screening' | 'targeted_candidate_match';
export type XRDClaimMode = 'conservative' | 'standard' | 'exploratory';

export interface XRDRangeParameters {
  twoThetaMin: number;
  twoThetaMax: number;
}

export interface XRDRadiationParameters {
  source: 'cu_ka';
  wavelengthAngstrom: number;
}

export interface XRDBaselineParameters {
  method: XRDBaselineMethod;
  lambda: number;
  p: number;
}

export interface XRDSmoothingParameters {
  method: XRDSmoothingMethod;
  windowSize: number;
  polynomialOrder: number;
}

export interface XRDPeakDetectionParameters {
  minProminence: number;
  minDistanceDeg: number;
  minHeightRatio: number;
  maxPeakCount: number;
}

export interface XRDPeakFittingParameters {
  model: XRDPeakFitModel;
  fitWindowDeg: number;
  maxIterations: number;
  calculateCrystalliteSize: boolean;
}

export interface XRDReferenceMatchParameters {
  enabled: boolean;
  matchMode: XRDMatchMode;
  referenceSource: XRDReferenceSource;
  referenceSetId?: string;
  candidatePhaseIds: string[];
  toleranceTwoTheta: number;
  minMatchedPeaks: number;
  minCoverageRatio: number;
  minScore: number;
  useRelativeIntensity: boolean;
  intensityToleranceRatio: number;
  allowUnknownSearch: boolean;
  allowIdentityClaim: boolean;
  allowPhasePurityClaim: boolean;
}

export interface XRDBoundaryParameters {
  enabled: boolean;
  claimMode: XRDClaimMode;
  allowIdentityClaim: boolean;
  allowPhasePurityClaim: boolean;
  requireComplementaryEvidence: boolean;
  requireReferenceSetForMatch: boolean;
  requireSampleContextForTargetedMatch: boolean;
}

export interface XRDParameters {
  range: XRDRangeParameters;
  radiation: XRDRadiationParameters;
  baseline: XRDBaselineParameters;
  smoothing: XRDSmoothingParameters;
  peakDetection: XRDPeakDetectionParameters;
  peakFitting: XRDPeakFittingParameters;
  referenceMatch: XRDReferenceMatchParameters;
  boundary: XRDBoundaryParameters;
}
