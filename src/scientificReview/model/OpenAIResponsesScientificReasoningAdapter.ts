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
import { buildCanonicalAgentPrompt } from '../../agent/prompt/canonicalAgentPrompt';

/** Strict output contract reserved for the future Responses API adapter. */
export const SCIENTIFIC_REVIEW_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'mode',
    'model',
    'technique',
    'datasetId',
    'sourceFiles',
    'evidence',
    'claims',
    'supportingEvidence',
    'contradictingEvidence',
    'interpretation',
    'validationStatus',
    'validationGap',
    'confidence',
    'missingInformation',
    'requiredNextAction',
    'provenance',
    'parameterSnapshot',
  ],
  properties: {
    mode: { type: 'string', enum: ['gpt-5.6-scientific'] },
    model: { type: ['string', 'null'] },
    technique: { type: 'string', enum: ['xrd', 'xps', 'ftir', 'raman'] },
    datasetId: { type: 'string' },
    sourceFiles: { type: 'array', items: { type: 'string' } },
    evidence: { type: 'array', items: { type: 'object', additionalProperties: true } },
    claims: { type: 'array', items: { type: 'string' } },
    supportingEvidence: { type: 'array', items: { type: 'string' } },
    contradictingEvidence: { type: 'array', items: { type: 'string' } },
    interpretation: { type: ['string', 'null'] },
    validationStatus: { type: 'string', enum: ['blocked', 'limited_confidence', 'validation_limited', 'validated'] },
    validationGap: { type: 'array', items: { type: 'string' } },
    confidence: {
      type: 'object',
      additionalProperties: false,
      required: ['measurementQuality', 'interpretation'],
      properties: {
        measurementQuality: { type: 'number', minimum: 0, maximum: 1 },
        interpretation: { type: 'number', minimum: 0, maximum: 1 },
      },
    },
    missingInformation: { type: 'array', items: { type: 'string' } },
    requiredNextAction: { type: 'array', items: { type: 'string' } },
    provenance: { type: 'object', additionalProperties: true },
    parameterSnapshot: { type: 'object', additionalProperties: true },
  },
} as const;

export interface OpenAIResponsesRequestContract {
  model: string;
  store: false;
  reasoning: { effort: string };
  input: CanonicalScientificEvidencePacket;
  instructions: string;
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
      instructions: buildCanonicalAgentPrompt(request.packet, 'gpt-5.6-scientific'),
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
