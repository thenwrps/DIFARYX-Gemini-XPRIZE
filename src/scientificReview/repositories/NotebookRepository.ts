import {
  getLatestNotebookEntry,
  getNotebookEntry,
  saveNotebookEntry,
  type NotebookEntry,
  type NotebookTemplateMode,
} from '../../data/workflowPipeline';
import type { RepositoryCompatibilityMetadata } from './repositoryMetadata';

export interface NotebookRepository {
  readonly compatibility: RepositoryCompatibilityMetadata;
  get(id: string): NotebookEntry | null;
  getLatest(projectId: string, templateMode?: NotebookTemplateMode): NotebookEntry | null;
  save(entry: NotebookEntry): NotebookEntry;
}

export class ExistingNotebookRepository implements NotebookRepository {
  readonly compatibility: RepositoryCompatibilityMetadata = {
    delegatedHelpers: ['getNotebookEntry', 'getLatestNotebookEntry', 'saveNotebookEntry'],
    storageKeys: ['difaryx-workflow-notebook-entries'],
    serializedSchema: 'NotebookEntry[]',
    readsLossless: true,
    writesLossless: true,
    legacyFormats: ['NotebookEntry[] with optional XRD handoff fields'],
    migration: 'deferred',
  };

  get(id: string) {
    return getNotebookEntry(id);
  }

  getLatest(projectId: string, templateMode?: NotebookTemplateMode) {
    return getLatestNotebookEntry(projectId, templateMode);
  }

  save(entry: NotebookEntry) {
    return saveNotebookEntry(entry);
  }
}
