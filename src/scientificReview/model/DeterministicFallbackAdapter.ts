import { handleReasoningRequest } from '../../server/api/reasoning';
import type { ReasoningRequest } from '../../agent/mcp/types';
import type {
  ScientificReasoningModel,
  ScientificReasoningOutput,
  ScientificReasoningRequest,
} from './ScientificReasoningModel';

export type DeterministicReasoningInvoker = (request: ReasoningRequest) => ReturnType<typeof handleReasoningRequest>;

/**
 * Reuses the existing deterministic router implementation without moving or
 * duplicating its generator. It is marked as fallback when used by a caller.
 */
export class DeterministicFallbackAdapter implements ScientificReasoningModel {
  readonly provider = 'deterministic' as const;

  constructor(
    private readonly invoke: DeterministicReasoningInvoker = handleReasoningRequest,
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
