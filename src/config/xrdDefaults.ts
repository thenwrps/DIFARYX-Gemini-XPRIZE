import type { XRDParameters } from '../types/xrdParameters';

export const DEFAULT_XRD_PARAMETERS: XRDParameters = {
  range: {
    twoThetaMin: 10,
    twoThetaMax: 80,
  },
  radiation: {
    source: 'cu_ka',
    wavelengthAngstrom: 1.5406,
  },
  baseline: {
    method: 'asymmetric_ls',
    lambda: 100000,
    p: 0.01,
  },
  smoothing: {
    method: 'savitzky_golay',
    windowSize: 11,
    polynomialOrder: 3,
  },
  peakDetection: {
    minProminence: 0.03,
    minDistanceDeg: 0.15,
    minHeightRatio: 0.02,
    maxPeakCount: 40,
  },
  peakFitting: {
    model: 'pseudo_voigt',
    fitWindowDeg: 0.8,
    maxIterations: 500,
    calculateCrystalliteSize: true,
  },
  referenceMatch: {
    enabled: true,
    matchMode: 'targeted_candidate_match',
    referenceSource: 'internal_curated',
    referenceSetId: 'spinel_ferrite_sba15_demo_set',
    candidatePhaseIds: [],
    toleranceTwoTheta: 0.5,
    minMatchedPeaks: 3,
    minCoverageRatio: 0.5,
    minScore: 0.65,
    useRelativeIntensity: false,
    intensityToleranceRatio: 0.5,
    allowUnknownSearch: false,
    allowIdentityClaim: false,
    allowPhasePurityClaim: false,
  },
  boundary: {
    enabled: true,
    claimMode: 'standard',
    allowIdentityClaim: false,
    allowPhasePurityClaim: false,
    requireComplementaryEvidence: true,
    requireReferenceSetForMatch: true,
    requireSampleContextForTargetedMatch: true,
  },
};
