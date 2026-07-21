import {
  getAllRuns,
  getRun,
  getRunsByProject,
  saveRun,
  type AgentRun,
} from '../../data/runModel';
import {
  loadAgentRunResult,
  saveAgentRunResult,
  type AgentRunResult,
} from '../../data/demoProjects';
import type { RepositoryCompatibilityMetadata } from './repositoryMetadata';

export interface AgentRunRepository {
  readonly compatibility: RepositoryCompatibilityMetadata;
  get(id: string): AgentRun | null;
  listByProject(projectId: string): AgentRun[];
  save(run: AgentRun): void;
  saveCompatibilityResult(result: AgentRunResult): void;
  getCompatibilityResult(projectId: string): AgentRunResult | null;
}

export class ExistingAgentRunRepository implements AgentRunRepository {
  readonly compatibility: RepositoryCompatibilityMetadata = {
    delegatedHelpers: ['getRun', 'getRunsByProject', 'saveRun', 'saveAgentRunResult', 'loadAgentRunResult'],
    storageKeys: ['difaryx_runs', 'difaryx-agent-run:${projectId}'],
    serializedSchema: 'AgentRun[] plus AgentRunResult per project',
    readsLossless: true,
    writesLossless: true,
    legacyFormats: ['AgentRun[]', 'project-scoped AgentRunResult'],
    migration: 'deferred',
  };

  get(id: string) {
    return getRun(id);
  }

  listByProject(projectId: string) {
    return getRunsByProject(projectId);
  }

  save(run: AgentRun) {
    saveRun(run);
  }

  saveCompatibilityResult(result: AgentRunResult) {
    saveAgentRunResult(result);
  }

  getCompatibilityResult(projectId: string) {
    return loadAgentRunResult(projectId);
  }

  /** Characterization helper for the existing global run store. */
  listAll() {
    return getAllRuns();
  }
}
