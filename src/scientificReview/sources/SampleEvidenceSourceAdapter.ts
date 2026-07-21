import {
  DEFAULT_PROJECT_ID,
  getProject,
  getProjectDatasets,
} from '../../data/demoProjects';
import { getProjectEvidenceSnapshot } from '../../utils/evidenceSnapshot';
import type {
  EvidenceSourceAdapter,
  EvidenceSourceRequest,
  EvidenceSourceResult,
} from './EvidenceSourceAdapter';

export class SampleEvidenceSourceAdapter implements EvidenceSourceAdapter {
  readonly kind = 'sample' as const;

  resolve(request: EvidenceSourceRequest): EvidenceSourceResult {
    const projectId = request.projectId ?? DEFAULT_PROJECT_ID;
    const project = getProject(projectId) ?? getProject(DEFAULT_PROJECT_ID);
    if (!project) {
      throw new Error(`Sample project not found: ${projectId}`);
    }

    const datasets = getProjectDatasets(project.id);
    const dataset =
      datasets.find((item) => request.datasetId && item.id === request.datasetId) ??
      datasets.find((item) => request.technique && item.technique === request.technique) ??
      datasets.find((item) => item.dataPoints.length > 0) ??
      null;
    const snapshot = getProjectEvidenceSnapshot(project.id, {
      source: 'demo_preloaded',
      projectIdExplicit: true,
    });

    return {
      kind: this.kind,
      project,
      dataset: dataset ?? snapshot.activeDataset,
      snapshot,
      warnings: [],
      compatibilityOnly: false,
      reviewReady: Boolean(dataset ?? snapshot.activeDataset),
    };
  }
}
