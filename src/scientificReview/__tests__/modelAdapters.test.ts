import { describe, expect, it, vi } from 'vitest';
import type { AgentEvidencePacket, ReasoningResponse } from '../../agent/mcp/types';
import {
  DeterministicFallbackAdapter,
  ExistingProviderScientificReasoningAdapter,
  OpenAIResponsesScientificReasoningAdapter,
  ScientificModelConfigurationError,
  ScientificModelTransportUnavailableError,
  readScientificModelConfiguration,
  SCIENTIFIC_REVIEW_JSON_SCHEMA,
} from '..';

function packet(): AgentEvidencePacket {
  return {
    context: 'xrd',
    datasetId: 'dataset-test',
    datasetName: 'test.xy',
    materialSystem: 'test material',
    signalSummary: { featureCount: 1, signalQuality: 'medium' },
    detectedFeatures: [{ position: 35.5, intensity: 100, assignment: '(311)' }],
    candidates: [{
      label: 'Candidate phase',
      score: 0.8,
      matchedFeatures: 1,
      totalFeatures: 1,
      missingFeatures: [],
      unexplainedFeatures: [],
    }],
    fusedScore: 0.8,
    uncertaintyFlags: [],
    processingNotes: ['deterministic test'],
    toolTrace: [],
  };
}

const legacyOutput = {
  primaryResult: 'Candidate phase',
  confidence: 0.8,
  evidenceSummary: ['one feature'],
  rejectedAlternatives: [],
  decisionLogic: 'highest score',
  uncertainty: ['validation required'],
  recommendedNextStep: 'Validate with complementary evidence',
  metadata: {
    provider: 'vertex-gemini' as const,
    model: 'legacy-test-model',
    durationMs: 12,
    timestamp: '2026-07-20T00:00:00.000Z',
  },
};

describe('scientific reasoning model contracts', () => {
  it('requires all OpenAI request configuration and never defaults a model', () => {
    const adapter = new OpenAIResponsesScientificReasoningAdapter(
      readScientificModelConfiguration({
        OPENAI_SCIENTIFIC_REASONING_EFFORT: 'medium',
        OPENAI_SCIENTIFIC_PROMPT_VERSION: 'phase1-test',
      }),
    );

    expect(() => adapter.buildRequest({ packet: packet() })).toThrow(ScientificModelConfigurationError);
    expect(() => adapter.buildRequest({ packet: packet() })).toThrow('OPENAI_SCIENTIFIC_MODEL');
  });

  it('builds a strict, store=false, transport-neutral Responses request', () => {
    const adapter = new OpenAIResponsesScientificReasoningAdapter(
      readScientificModelConfiguration({
        OPENAI_SCIENTIFIC_MODEL: 'configured-model',
        OPENAI_SCIENTIFIC_REASONING_EFFORT: 'high',
        OPENAI_SCIENTIFIC_PROMPT_VERSION: 'phase1-test',
      }),
    );
    const request = adapter.buildRequest({
      packet: packet(),
      evidenceSnapshotId: 'snapshot-test',
    });

    expect(request.model).toBe('configured-model');
    expect(request.store).toBe(false);
    expect(request.reasoning.effort).toBe('high');
    expect(request.metadata).toEqual({ promptVersion: 'phase1-test', evidenceSnapshotId: 'snapshot-test' });
    expect(request.text.format).toMatchObject({ type: 'json_schema', strict: true });
    expect(request.text.format.schema).toBe(SCIENTIFIC_REVIEW_JSON_SCHEMA);
    expect(request.input).toBeDefined();
  });

  it('does not perform network I/O in Phase 1', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const adapter = new OpenAIResponsesScientificReasoningAdapter({
      model: 'configured-model',
      reasoningEffort: 'low',
      promptVersion: 'phase1-test',
    });

    await expect(adapter.review({ packet: packet() })).rejects.toBeInstanceOf(ScientificModelTransportUnavailableError);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('maps current provider output without fabricating unavailable provenance', async () => {
    const invoke = vi.fn(async (): Promise<ReasoningResponse> => ({
      success: true,
      output: legacyOutput,
      fallbackUsed: true,
    }));
    const adapter = new ExistingProviderScientificReasoningAdapter({
      provider: 'vertex-gemini',
      invoke,
    });
    const output = await adapter.review({ packet: packet(), evidenceSnapshotId: 'snapshot-test' });

    expect(invoke).toHaveBeenCalledWith({ packet: packet(), provider: 'vertex-gemini', model: undefined });
    expect(output.primaryResult).toBe(legacyOutput.primaryResult);
    expect(output.metadata.actualProvider).toBe('vertex-gemini');
    expect(output.metadata.modelId).toBe('legacy-test-model');
    expect(output.metadata.responseId).toBeUndefined();
    expect(output.metadata.fallbackUsed).toBe(true);
    expect(output.metadata.evidenceSnapshotId).toBe('snapshot-test');
  });

  it('wraps the existing deterministic route without moving its generator', async () => {
    const invoke = vi.fn(async (): Promise<ReasoningResponse> => ({
      success: true,
      output: { ...legacyOutput, metadata: { ...legacyOutput.metadata, provider: 'deterministic' } },
      fallbackUsed: false,
    }));
    const adapter = new DeterministicFallbackAdapter(invoke);
    const output = await adapter.review({ packet: packet() });

    expect(invoke).toHaveBeenCalledWith({ packet: packet(), provider: 'deterministic' });
    expect(output.metadata.provider).toBe('deterministic');
    expect(output.metadata.fallbackUsed).toBe(true);
    expect(output.metadata.modelId).toBe('legacy-test-model');
  });
});
