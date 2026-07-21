import type {
  CanonicalScientificEvidencePacket,
  ScientificReasoningModel,
  ScientificReasoningOutput,
  ScientificReasoningRequest,
} from './ScientificReasoningModel';
import {
  ScientificModelConfigurationError,
  type ScientificModelConfiguration,
} from './modelConfig';

/** Strict output contract reserved for the future Responses API adapter. */
export const SCIENTIFIC_REVIEW_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'primaryResult',
    'confidence',
    'evidenceSummary',
    'rejectedAlternatives',
    'decisionLogic',
    'uncertainty',
    'recommendedNextStep',
  ],
  properties: {
    primaryResult: { type: 'string' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    evidenceSummary: { type: 'array', items: { type: 'string' } },
    rejectedAlternatives: { type: 'array', items: { type: 'string' } },
    decisionLogic: { type: 'string' },
    uncertainty: { type: 'array', items: { type: 'string' } },
    recommendedNextStep: { type: 'string' },
  },
} as const;

export interface OpenAIResponsesRequestContract {
  model: string;
  store: false;
  reasoning: { effort: string };
  input: CanonicalScientificEvidencePacket;
  metadata: {
    promptVersion: string;
    evidenceSnapshotId?: string;
  };
  text: {
    format: {
      type: 'json_schema';
      name: 'scientific_review';
      strict: true;
      schema: typeof SCIENTIFIC_REVIEW_JSON_SCHEMA;
    };
  };
}

export class ScientificModelTransportUnavailableError extends Error {
  readonly code = 'SCIENTIFIC_MODEL_TRANSPORT_UNAVAILABLE';

  constructor() {
    super('The OpenAI Responses transport is intentionally unavailable during Phase 1.');
    this.name = 'ScientificModelTransportUnavailableError';
  }
}

/** Compile-time contract only. No SDK, fetch, credentials, or fallback is used. */
export class OpenAIResponsesScientificReasoningAdapter implements ScientificReasoningModel {
  readonly provider = 'openai-responses' as const;

  constructor(private readonly configuration: ScientificModelConfiguration) {}

  buildRequest(request: ScientificReasoningRequest): OpenAIResponsesRequestContract {
    if (!this.configuration.model) {
      throw new ScientificModelConfigurationError(
        'OPENAI_SCIENTIFIC_MODEL is required to construct an OpenAI Responses request.',
      );
    }
    if (!this.configuration.reasoningEffort) {
      throw new ScientificModelConfigurationError(
        'OPENAI_SCIENTIFIC_REASONING_EFFORT is required to construct an OpenAI Responses request.',
      );
    }
    if (!this.configuration.promptVersion) {
      throw new ScientificModelConfigurationError(
        'OPENAI_SCIENTIFIC_PROMPT_VERSION is required to construct an OpenAI Responses request.',
      );
    }

    return {
      model: this.configuration.model,
      store: false,
      reasoning: { effort: this.configuration.reasoningEffort },
      input: request.packet,
      metadata: {
        promptVersion: this.configuration.promptVersion,
        evidenceSnapshotId: request.evidenceSnapshotId,
      },
      text: {
        format: {
          type: 'json_schema',
          name: 'scientific_review',
          strict: true,
          schema: SCIENTIFIC_REVIEW_JSON_SCHEMA,
        },
      },
    };
  }

  async review(_request: ScientificReasoningRequest): Promise<ScientificReasoningOutput> {
    throw new ScientificModelTransportUnavailableError();
  }
}
