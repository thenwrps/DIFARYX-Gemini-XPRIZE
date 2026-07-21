import {
  getLatestProcessingResult,
  getProcessingResult,
  saveProcessingResult,
  type ProcessingResult,
} from '../../data/workflowPipeline';
import type { RepositoryCompatibilityMetadata } from './repositoryMetadata';

export interface ProcessingRunRepository {
  readonly compatibility: RepositoryCompatibilityMetadata;
  get(id: string): ProcessingResult | null;
  getLatest(projectId: string): ProcessingResult | null;
  save(result: ProcessingResult): ProcessingResult;
}

export class ExistingProcessingRunRepository implements ProcessingRunRepository {
  readonly compatibility: RepositoryCompatibilityMetadata = {
    delegatedHelpers: ['getProcessingResult', 'getLatestProcessingResult', 'saveProcessingResult'],
    storageKeys: ['difaryx-workflow-processing-results'],
    serializedSchema: 'ProcessingResult[]',
    readsLossless: true,
    writesLossless: true,
    legacyFormats: ['ProcessingResult[]'],
    migration: 'deferred',
  };

  get(id: string) {
    return getProcessingResult(id);
  }

  getLatest(projectId: string) {
    return getLatestProcessingResult(projectId);
  }

  save(result: ProcessingResult) {
    return saveProcessingResult(result);
  }
}
