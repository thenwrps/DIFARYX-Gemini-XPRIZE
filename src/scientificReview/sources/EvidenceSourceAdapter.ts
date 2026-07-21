import type { DemoDataset, DemoProject, Technique } from '../../data/demoProjects';
import type { ProjectEvidenceSnapshot } from '../../utils/evidenceSnapshot';

export type EvidenceSourceKind = 'sample' | 'project' | 'upload';

export interface EvidenceSourceRequest {
  kind: EvidenceSourceKind;
  projectId?: string;
  datasetId?: string;
  technique?: Technique;
  source?: string | null;
  analysisSessionId?: string | null;
  uploadedRunId?: string | null;
  driveFileId?: string | null;
}

export interface EvidenceSourceResult {
  kind: EvidenceSourceKind;
  project: DemoProject | null;
  dataset: DemoDataset | null;
  snapshot: ProjectEvidenceSnapshot;
  warnings: string[];
  compatibilityOnly: boolean;
  reviewReady: boolean;
}

export interface EvidenceSourceAdapter {
  readonly kind: EvidenceSourceKind;
  resolve(request: EvidenceSourceRequest): EvidenceSourceResult;
}
