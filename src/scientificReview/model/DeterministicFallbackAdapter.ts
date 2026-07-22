import { generateDeterministicReasoning } from '../../services/api/deterministicReasoning';
import type { ReasoningRequest, ReasoningResponse } from '../../agent/mcp/types';
import type {
  ScientificReasoningModel,
  ScientificReasoningOutput,
  ScientificReasoningRequest,
} from './ScientificReasoningModel';

export type DeterministicReasoningInvoker = (request: ReasoningRequest) => Promise<ReasoningResponse>;

const defaultDeterministicReasoningInvoker: DeterministicReasoningInvoker = async (request) => {
  try {
    if (!request.packet) {
      return { success: false, error: 'Missing evidence packet' };
    }
    if (!request.provider) {
      return { success: false, error: 'Missing provider' };
    }
    return {
      success: true,
      output: generateDeterministicReasoning(request.packet),
      fallbackUsed: false,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

/**
 * Reuses the existing deterministic reasoning implementation without moving
 * provider logic into the browser. It is marked as fallback when used by a caller.
 */
export class DeterministicFallbackAdapter implements ScientificReasoningModel {
  readonly provider = 'deterministic' as const;

  constructor(
    private readonly invoke: DeterministicReasoningInvoker = defaultDeterministicReasoningInvoker,
    private readonly markAsFallback = true,
  ) {}

  async review(request: ScientificReasoningRequest): Promise<ScientificReasoningOutput> {
    const response = await this.invoke({
      packet: request.packet,
      provider: 'deterministic',
    });

    if (!response.success || !response.output) {
      throw new Error(response.error ?? 'Deterministic scientific reasoning returned no output.');
    }

    const output = response.output;
    return {
      primaryResult: output.primaryResult,
      confidence: output.confidence,
      evidenceSummary: output.evidenceSummary,
      rejectedAlternatives: output.rejectedAlternatives,
      decisionLogic: output.decisionLogic,
      uncertainty: output.uncertainty,
      recommendedNextStep: output.recommendedNextStep,
      metadata: {
        provider: 'deterministic',
        actualProvider: 'deterministic',
        modelId: output.metadata?.model,
        latencyMs: output.metadata?.durationMs,
        fallbackUsed: this.markAsFallback,
        evidenceSnapshotId: request.evidenceSnapshotId,
        timestamp: output.metadata?.timestamp ?? new Date().toISOString(),
      },
    };
  }
}
