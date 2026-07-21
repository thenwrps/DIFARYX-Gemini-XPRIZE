/** Backward-compatible XRD runner projection from the canonical registry. */
import { getCanonicalDefaultValues } from '../data/parameterDefinitions';
import type { XRDParameters } from '../types/xrdParameters';

const canonical = getCanonicalDefaultValues('xrd');
const value = <T>(id: string): T => canonical[id] as T;

export const DEFAULT_XRD_PARAMETERS: XRDParameters = {
  range: {
    twoThetaMin: value<number>('twoThetaMin'),
    twoThetaMax: value<number>('twoThetaMax'),
  },
  radiation: {
    source: 'cu_ka',
    wavelengthAngstrom: value<number>('wavelength'),
  },
  baseline: {
    method: value<string>('baselineMethod') === 'Asymmetric LS' ? 'asymmetric_ls' : 'none',
    lambda: value<number>('baselineLambda'),
    p: value<number>('baselineP'),
  },
  smoothing: {
    method: value<string>('smoothingMethod') === 'Savitzky-Golay' ? 'savitzky_golay' : 'none',
    windowSize: value<number>('smoothingWindow'),
    polynomialOrder: value<number>('smoothingPolynomialOrder'),
  },
  peakDetection: {
    minProminence: value<number>('minimumProminence'),
    minDistanceDeg: value<number>('peakMinDistance'),
    minHeightRatio: value<number>('peakThreshold'),
    maxPeakCount: value<number>('peakMaxCount'),
  },
  peakFitting: {
    model: 'pseudo_voigt',
    fitWindowDeg: value<number>('peakFitWindow'),
    maxIterations: value<number>('peakFitMaxIterations'),
    refineFWHM: value<boolean>('refineFWHM'),
    refineShape: value<boolean>('refineShape'),
    calculateCrystalliteSize: value<boolean>('calculateCrystalliteSize'),
    scherrerConstant: value<number>('scherrerConstant'),
    instrumentalBroadening: value<number>('instrumentalBroadening'),
    calculateMicrostrain: value<boolean>('calculateMicrostrain'),
  },
  referenceMatch: {
    enabled: value<boolean>('referenceMatchEnabled'),
    matchMode: 'targeted_candidate_match',
    referenceSource: 'internal_curated',
    referenceSetId: value<string>('referenceSetId'),
    candidatePhaseIds: value<string[]>('candidatePhaseIds'),
    toleranceTwoTheta: value<number>('matchingTolerance'),
    minMatchedPeaks: value<number>('referenceMatchMinPeaks'),
    minCoverageRatio: value<number>('referenceMatchMinCoverage'),
    minScore: value<number>('referenceMatchMinScore'),
    useRelativeIntensity: value<boolean>('referenceMatchUseRelativeIntensity'),
    intensityToleranceRatio: value<number>('referenceMatchIntensityTolerance'),
    allowUnknownSearch: value<boolean>('referenceMatchAllowUnknown'),
    allowIdentityClaim: value<boolean>('boundaryAllowIdentityClaim'),
    allowPhasePurityClaim: value<boolean>('boundaryAllowPhasePurityClaim'),
  },
  boundary: {
    enabled: true,
    claimMode: 'standard',
    allowIdentityClaim: value<boolean>('boundaryAllowIdentityClaim'),
    allowPhasePurityClaim: value<boolean>('boundaryAllowPhasePurityClaim'),
    requireComplementaryEvidence: value<boolean>('boundaryRequireComplementary'),
    requireReferenceSetForMatch: value<boolean>('boundaryRequireReferenceSet'),
    requireSampleContextForTargetedMatch: value<boolean>('boundaryRequireSampleContext'),
  },
};
