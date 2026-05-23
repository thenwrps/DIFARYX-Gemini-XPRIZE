import type { XRDReferenceSource } from './xrdParameters';

export interface XRDDatasetContext {
  sampleId?: string;
  sampleName?: string;
  materialClass?: string;
  batchId?: string;
  knownElements: string[];
  expectedElements: string[];
  excludedElements: string[];
  declaredPhases: string[];
  candidatePhaseIds: string[];
  excludedPhaseIds: string[];
  referenceSource: XRDReferenceSource;
  referenceSetId?: string;
  identitySource: 'user_declared' | 'project_registry' | 'filename_hint' | 'unknown';
  identityConfidence: 'declared' | 'inferred' | 'unknown';
}
