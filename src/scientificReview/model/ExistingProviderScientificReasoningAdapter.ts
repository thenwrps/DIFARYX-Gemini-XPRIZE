import { callReasoningAPI } from '../../server/api/reasoning';
import type {
  ModelProvider,
  ReasoningRequest,
  ReasoningResponse,
} from '../../agent/mcp/types';
import type {
  ScientificReasoningModel,
  ScientificReasoningOutput,
  ScientificReasoningRequest,
} from './ScientificReasoningModel';

export type LegacyReasoningInvoker = (request: ReasoningRequest) => Promise<ReasoningResponse>;

export interface ExistingProviderScientificReasoningAdapterOptions {
  provider: ModelProvider;
  model?: string;
  invoke?: LegacyReasoningInvoker;
}

/** Compatibility boundary for the current Vertex/Gemma/deterministic path. */
export class ExistingProviderScientificReasoningAdapter implements ScientificReasoningModel {
  readonly provider = 'existing-provider' as const;
  private readonly invoke: LegacyReasoningInvoker;

  constructor(private readonly options: ExistingProviderScientificReasoningAdapterOptions) {
    this.invoke = options.invoke ?? callReasoningAPI;
  }

  async review(request: ScientificReasoningRequest): Promise<ScientificReasoningOutput> {
    const response = await this.invoke({
      packet: request.packet,
      provider: this.options.provider,
      model: this.options.model,
    });

    if (!response.success || !response.output) {
      throw new Error(response.error ?? 'Existing scientific reasoning provider returned no output.');
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
        provider: 'existing-provider',
        actualProvider: output.metadata?.provider,
        modelId: output.metadata?.model,
        latencyMs: output.metadata?.durationMs,
        fallbackUsed: response.fallbackUsed ?? false,
        evidenceSnapshotId: request.evidenceSnapshotId,
        timestamp: output.metadata?.timestamp ?? new Date().toISOString(),
      },
    };
  }
}
