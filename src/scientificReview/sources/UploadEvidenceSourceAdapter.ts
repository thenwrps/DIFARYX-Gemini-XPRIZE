import { getProject } from '../../data/demoProjects';
import { getProjectEvidenceSnapshot } from '../../utils/evidenceSnapshot';
import type {
  EvidenceSourceAdapter,
  EvidenceSourceRequest,
  EvidenceSourceResult,
} from './EvidenceSourceAdapter';

export class UploadEvidenceSourceAdapter implements EvidenceSourceAdapter {
  readonly kind = 'upload' as const;

  resolve(request: EvidenceSourceRequest): EvidenceSourceResult {
    const snapshot = getProjectEvidenceSnapshot(request.projectId ?? null, {
      source: request.source ?? 'user_uploaded',
      analysisSessionId: request.analysisSessionId,
      uploadedRunId: request.uploadedRunId,
      driveFileId: request.driveFileId,
      projectIdExplicit: Boolean(request.projectId),
    });
    const warnings: string[] = [];

    if (!snapshot.activeDataset) {
      warnings.push('Uploaded evidence has no active dataset available for deterministic processing.');
    }
    if (snapshot.availableTechniques.length === 0) {
      warnings.push('Uploaded evidence has no completed technique evidence available for review.');
    }
    if (snapshot.pendingTechniques.length > 0) {
      warnings.push(`Uploaded evidence is incomplete; pending techniques: ${snapshot.pendingTechniques.join(', ')}.`);
    }

    return {
      kind: this.kind,
      project: getProject(snapshot.projectId),
      dataset: snapshot.activeDataset,
      snapshot,
      warnings,
      compatibilityOnly: true,
      reviewReady: Boolean(snapshot.activeDataset) && snapshot.availableTechniques.length > 0,
    };
  }
}
