import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_PROJECT_ID, getProject, getProjectDatasets } from '../../data/demoProjects';
import { buildClaimBoundaryArtifact } from '../../utils/claimBoundaryArtifact';
import { createEvidenceNodes, evaluate } from '../../engines/fusionEngine';
import {
  ClaimBoundaryService,
  EvidenceBundleService,
  FusionService,
  NotebookHandoffService,
  ProcessingOrchestrationService,
  ScientificReviewService,
} from '../services';
import { SampleEvidenceSourceAdapter, UploadEvidenceSourceAdapter } from '../sources';
import type { AgentEvidencePacket } from '../../agent/mcp/types';
import type { ScientificReasoningModel } from '../model/ScientificReasoningModel';

function packet(): AgentEvidencePacket {
  return {
    context: 'xrd',
    datasetId: 'dataset-test',
    datasetName: 'test.xy',
    materialSystem: 'test material',
    signalSummary: { featureCount: 1, signalQuality: 'medium' },
    detectedFeatures: [{ position: 35.5, intensity: 100 }],
    candidates: [{ label: 'Candidate phase', score: 0.8, matchedFeatures: 1, totalFeatures: 1, missingFeatures: [], unexplainedFeatures: [] }],
    fusedScore: 0.8,
    uncertaintyFlags: [],
    processingNotes: [],
    toolTrace: [],
  };
}

describe('Phase 1 source and service seams', () => {
  it('selects sample evidence without making the service import demo data', () => {
    const source = new SampleEvidenceSourceAdapter().resolve({ kind: 'sample', projectId: DEFAULT_PROJECT_ID });
    expect(source.kind).toBe('sample');
    expect(source.project?.id).toBe(DEFAULT_PROJECT_ID);
    expect(source.snapshot.projectId).toBe(DEFAULT_PROJECT_ID);
    expect(source.reviewReady).toBe(true);
  });

  it('marks incomplete uploads with warnings and compatibility-only status', () => {
    const source = new UploadEvidenceSourceAdapter().resolve({ kind: 'upload', source: 'user_uploaded' });
    expect(source.compatibilityOnly).toBe(true);
    expect(source.warnings.length).toBeGreaterThan(0);
    expect(source.warnings.join(' ')).toContain('Uploaded evidence');
  });

  it('coordinates references without copying full evidence representations', () => {
    const source = new SampleEvidenceSourceAdapter().resolve({ kind: 'sample', projectId: DEFAULT_PROJECT_ID });
    const modelInput = packet();
    const result = new EvidenceBundleService().build({ source, modelInput, universalEvidenceNodeIds: ['node-1'] });

    expect(result.coordination.modelInput).toBe(modelInput);
    expect(result.coordination.universalEvidenceNodeIds).toEqual(['node-1']);
    expect(result.coordination.runtimeEvidenceBundle).not.toHaveProperty('files');
    expect(result.coordination.sourceSnapshot).toEqual({
      projectId: source.snapshot.projectId,
      projectName: source.snapshot.projectName,
      sampleIdentity: source.snapshot.sampleIdentity,
    });
  });

  it('keeps fusion wrapper output exactly equivalent', () => {
    const input = { technique: 'XRD' as const, peaks: [{ id: 'p1', position: 35.5, intensity: 100, label: '(311)' }] };
    const wrapper = new FusionService();
    expect(wrapper.createEvidenceNodes(input)).toEqual(createEvidenceNodes(input));
    expect(wrapper.evaluate({ evidence: createEvidenceNodes(input) })).toEqual(evaluate({ evidence: createEvidenceNodes(input) }));
  });

  it('keeps claim-boundary wrapper wording exactly equivalent', () => {
    const input = {
      technique: 'XRD',
      provider: 'deterministic' as const,
      confidence: 0.6,
      contradictions: ['secondary feature requires review'],
      missingValidation: ['phase purity'],
    };
    expect(new ClaimBoundaryService().build(input)).toEqual(buildClaimBoundaryArtifact(input));
  });

  it('preserves model-generated claim provenance for the Developer API label', () => {
    const artifact = new ClaimBoundaryService().buildFromReasoning('XRD', {
      primaryResult: 'Candidate phase',
      confidence: 0.8,
      evidenceSummary: ['bounded evidence'],
      rejectedAlternatives: [],
      decisionLogic: 'compatibility test',
      uncertainty: ['validation required'],
      recommendedNextStep: 'Validate',
      metadata: {
        provider: 'existing-provider',
        actualProvider: 'gemini-developer-api',
        fallbackUsed: false,
        evidenceSnapshotId: 'snapshot-test',
        timestamp: '2026-07-22T00:00:00.000Z',
      },
    });

    expect(artifact.provider).toBe('vertex');
  });

  it('keeps processing orchestration synchronous and delegates the supplied runner once', () => {
    const runner = vi.fn(() => ({ status: 'complete' }));
    const result = new ProcessingOrchestrationService().run({ name: 'test-runner', execute: runner });
    expect(result).toEqual({ status: 'complete' });
    expect(runner).toHaveBeenCalledTimes(1);
  });

  it('runs the compatibility facade without persistence or a new lifecycle', async () => {
    const sourceAdapter = new SampleEvidenceSourceAdapter();
    const model: ScientificReasoningModel = {
      provider: 'deterministic',
      review: async ({ evidenceSnapshotId }) => ({
        primaryResult: 'Candidate phase',
        confidence: 0.8,
        evidenceSummary: ['deterministic evidence'],
        rejectedAlternatives: [],
        decisionLogic: 'compatibility test',
        uncertainty: ['validation required'],
        recommendedNextStep: 'Validate',
        metadata: {
          provider: 'deterministic',
          modelId: 'deterministic-test',
          fallbackUsed: false,
          evidenceSnapshotId,
          timestamp: '2026-07-20T00:00:00.000Z',
        },
      }),
    };
    const result = await new ScientificReviewService(sourceAdapter, model).review({
      source: { kind: 'sample', projectId: DEFAULT_PROJECT_ID },
      modelInput: packet(),
      technique: 'XRD',
    });

    expect(result.evidence.projectId).toBe(DEFAULT_PROJECT_ID);
    expect(result.reasoning.primaryResult).toBe('Candidate phase');
    expect(result.claimBoundary.renderedClaimBoundary.length).toBeGreaterThan(0);
    expect(result.provenance.evidenceSnapshotId).toContain(DEFAULT_PROJECT_ID);
    expect(result.compatibilityWarnings).toEqual([]);
  });

  it('exposes the notebook wrapper without changing its call contracts', () => {
    const service = new NotebookHandoffService();
    expect(typeof service.saveProcessing).toBe('function');
    expect(typeof service.refine).toBe('function');
    expect(typeof service.saveRefinement).toBe('function');
    expect(typeof service.createEntry).toBe('function');
    expect(typeof service.saveEntry).toBe('function');
    expect(getProject(DEFAULT_PROJECT_ID)).toBeTruthy();
    expect(getProjectDatasets(DEFAULT_PROJECT_ID).length).toBeGreaterThan(0);
  });
});
