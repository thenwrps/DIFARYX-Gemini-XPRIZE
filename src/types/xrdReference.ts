import type { XRDReferenceSource } from './xrdParameters';

export type XRDReferenceClaimLevel = 'candidate_evidence';

export interface XRDReferencePeak {
  twoTheta: number;
  relativeIntensity: number;
  hkl?: string;
  dSpacingAngstrom?: number;
}

export interface XRDReferencePhase {
  phaseId: string;
  label: string;
  formula?: string;
  materialClass?: string;
  peaks: XRDReferencePeak[];
}

export interface XRDReferenceSet {
  referenceSetId: string;
  label: string;
  referenceSource: XRDReferenceSource;
  phases: XRDReferencePhase[];
}

export interface XRDMatchedPeak {
  measuredTwoTheta: number;
  referenceTwoTheta: number;
  referencePeak: XRDReferencePeak;
  deltaTwoTheta: number;
  score?: number;
}

export interface XRDReferenceCandidateResult {
  phaseId: string;
  phaseLabel: string;
  score: number;
  coverageRatio: number;
  matchedPeaks: XRDMatchedPeak[];
  unmatchedMeasuredPeaks: number[];
  claimLevel: XRDReferenceClaimLevel;
}

export interface XRDReferenceMatchResult {
  referenceSource: XRDReferenceSource;
  referenceSetId?: string;
  candidates: XRDReferenceCandidateResult[];
  matchedPeaks: XRDMatchedPeak[];
  unmatchedMeasuredPeaks: number[];
  claimLevel: XRDReferenceClaimLevel;
  phaseConfirmed: false;
  phasePurityConfirmed: false;
}
