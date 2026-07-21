import { describe, expect, it } from 'vitest';
import {
  AnalysisSessionReviewSessionRepository,
  ExistingAgentRunRepository,
  ExistingNotebookRepository,
  ExistingProcessingRunRepository,
} from '../repositories';
import type { AgentRun } from '../../data/runModel';
import type { AgentRunResult } from '../../data/demoProjects';
import type { NotebookEntry, ProcessingResult } from '../../data/workflowPipeline';

function installStorage() {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
  (globalThis as any).localStorage = storage;
  (globalThis as any).window = { localStorage: storage };
  return { storage, values };
}

const run: AgentRun = {
  id: 'run-compatibility-test',
  projectId: 'project-compatibility-test',
  createdAt: '2026-07-20T00:00:00.000Z',
  mission: 'Compatibility test',
  outputs: {
    phase: 'Candidate phase',
    claimStatus: 'partial',
    confidence: 60,
    confidenceLabel: 'Status',
    evidence: ['deterministic evidence'],
    interpretation: 'compatibility interpretation',
    caveats: ['validation required'],
    recommendations: ['Validate'],
    selectedDatasets: ['XRD'],
  },
};

const agentResult = {
  projectId: run.projectId,
  projectName: 'Compatibility project',
  material: 'Test material',
  selectedDatasets: ['XRD'],
  decision: 'Candidate phase',
  claimStatus: 'partial',
  validationState: 'limited',
  evidence: ['deterministic evidence'],
  warnings: ['validation required'],
  recommendations: ['Validate'],
  detectedPeaks: [],
  pipeline: ['test'],
  generatedAt: run.createdAt,
  summary: 'Compatibility result',
} as AgentRunResult;

const processing = {
  id: 'processing-compatibility-test',
  projectId: run.projectId,
  technique: 'XRD',
  sourceRoute: '/workspace/xrd',
  processedAt: run.createdAt,
  title: 'Compatibility processing',
  sampleId: 'sample-1',
  materialSystem: 'Test material',
  processedResult: 'Candidate phase',
  summary: 'Compatibility processing result',
  detectedFeatures: [],
  evidenceReview: ['evidence'],
  limitations: ['validation'],
  followUpValidation: ['validate'],
  metrics: [],
} as ProcessingResult;

const notebook = {
  id: 'notebook-compatibility-test',
  projectId: run.projectId,
  templateMode: 'research',
  templateLabel: 'Research Mode',
  refinementId: 'refinement-1',
  processingResultId: processing.id,
  createdAt: run.createdAt,
  title: 'Compatibility notebook',
  subtitle: 'Compatibility',
  sourceLabel: 'Test',
  stepperLabels: [],
  tabs: [],
  requiredSections: [],
  statusSummary: [],
  sections: [],
  reportTemplate: 'manuscript',
} as NotebookEntry;

describe('repository compatibility boundaries', () => {
  it('uses an in-memory projection and does not create review-session storage', () => {
    const { values } = installStorage();
    const repository = new AnalysisSessionReviewSessionRepository();
    const projection = repository.saveProjection({
      reviewId: 'review-projection',
      projectId: run.projectId,
      status: 'projection',
      createdAt: run.createdAt,
      updatedAt: run.createdAt,
      authoritativeRecordIds: {},
      derived: {},
      compatibility: { warnings: [], persistable: false },
    });

    expect(repository.get(projection.reviewId)).toEqual(projection);
    expect([...values.keys()]).toEqual([]);
    expect(repository.compatibility.storageKeys).toEqual(['difaryx-analysis-sessions-v1']);
    expect(repository.compatibility.writesLossless).toBe(false);
  });

  it('round-trips AgentRun and legacy project-scoped AgentRunResult stores', () => {
    const { values } = installStorage();
    const repository = new ExistingAgentRunRepository();
    repository.save(run);
    repository.saveCompatibilityResult(agentResult);

    expect(repository.get(run.id)).toEqual(run);
    expect(repository.getCompatibilityResult(run.projectId)).toEqual(agentResult);
    expect(values.has('difaryx_runs')).toBe(true);
    expect(values.has(`difaryx-agent-run:${run.projectId}`)).toBe(true);
    expect(repository.compatibility.legacyFormats).toHaveLength(2);
  });

  it('round-trips processing and notebook records without changing schemas', () => {
    const { values } = installStorage();
    const processingRepository = new ExistingProcessingRunRepository();
    const notebookRepository = new ExistingNotebookRepository();

    processingRepository.save(processing);
    notebookRepository.save(notebook);

    expect(processingRepository.get(processing.id)).toEqual(processing);
    expect(processingRepository.getLatest(run.projectId)).toEqual(processing);
    expect(notebookRepository.get(notebook.id)).toEqual(notebook);
    expect(notebookRepository.getLatest(run.projectId, 'research')).toEqual(notebook);
    expect(values.has('difaryx-workflow-processing-results')).toBe(true);
    expect(values.has('difaryx-workflow-notebook-entries')).toBe(true);
    expect(processingRepository.compatibility.writesLossless).toBe(true);
    expect(notebookRepository.compatibility.writesLossless).toBe(true);
  });
});
