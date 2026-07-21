import { getProject } from '../../data/demoProjects';
import { getProjectEvidenceSnapshot } from '../../utils/evidenceSnapshot';
import type {
  EvidenceSourceAdapter,
  EvidenceSourceRequest,
  EvidenceSourceResult,
} from './EvidenceSourceAdapter';

export class ProjectEvidenceSourceAdapter implements EvidenceSourceAdapter {
  readonly kind = 'project' as const;

  resolve(request: EvidenceSourceRequest): EvidenceSourceResult {
    const project = getProject(request.projectId);
    if (!project) {
      throw new Error(`Project evidence source not found: ${request.projectId ?? 'missing project id'}`);
    }

    const snapshot = getProjectEvidenceSnapshot(project.id, {
      source: request.source,
      projectIdExplicit: true,
    });
    const dataset =
      (request.datasetId && snapshot.activeDataset?.id === request.datasetId
        ? snapshot.activeDataset
        : null) ?? snapshot.activeDataset;

    return {
      kind: this.kind,
      project,
      dataset,
      snapshot,
      warnings: [],
      compatibilityOnly: false,
      reviewReady: Boolean(dataset),
    };
  }
}
