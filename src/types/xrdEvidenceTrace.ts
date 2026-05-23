import type { XRDDatasetContext } from './xrdDatasetContext';
import type { XRDParameters } from './xrdParameters';
import type { XRDReferenceClaimLevel, XRDReferenceMatchResult } from './xrdReference';

export type XRDEvidenceTraceStage =
  | 'dataset_binding'
  | 'signal_intake'
  | 'range_radiation'
  | 'baseline'
  | 'smoothing'
  | 'peak_detection'
  | 'peak_fitting'
  | 'reference_match'
  | 'boundary';

export type XRDEvidenceTraceStatus = 'pending' | 'active' | 'completed' | 'skipped' | 'blocked';

export interface XRDEvidenceTraceEntry {
  stage: XRDEvidenceTraceStage;
  status: XRDEvidenceTraceStatus;
  summary?: string;
  evidenceIds?: string[];
}

export interface XRDEvidenceTrace {
  traceId: string;
  stages: XRDEvidenceTraceEntry[];
  boundaryNotes: string[];
}

export interface XRDEvidenceBoundaryHandoff {
  claimLevel: XRDReferenceClaimLevel;
  phaseConfirmed: false;
  phasePurityConfirmed: false;
  notes: string[];
}

export interface XRDEvidenceHandoff {
  technique: 'xrd';
  datasetContext: XRDDatasetContext;
  parameters: XRDParameters;
  referenceMatch?: XRDReferenceMatchResult;
  trace: XRDEvidenceTrace;
  boundary: XRDEvidenceBoundaryHandoff;
}
