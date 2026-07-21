import type { AgentEvidencePacket } from '../../agent/mcp/types';

/** Provisional canonical model input: the active MCP packet without React state. */
export type CanonicalScientificEvidencePacket = AgentEvidencePacket;

export type ScientificReasoningProvider = 'deterministic' | 'existing-provider' | 'openai-responses';

export interface ScientificReasoningRequest {
  packet: CanonicalScientificEvidencePacket;
  evidenceSnapshotId?: string;
  promptVersion?: string;
  reasoningEffort?: string;
}

export interface ScientificReasoningOutput {
  primaryResult: string;
  confidence: number;
  evidenceSummary: string[];
  rejectedAlternatives: string[];
  decisionLogic: string;
  uncertainty: string[];
  recommendedNextStep: string;
  metadata: {
    provider: ScientificReasoningProvider;
    /** Opaque compatibility/provider identifier; the shared interface is provider-neutral. */
    actualProvider?: string;
    modelId?: string;
    responseId?: string;
    promptVersion?: string;
    reasoningEffort?: string;
    latencyMs?: number;
    fallbackUsed: boolean;
    evidenceSnapshotId?: string;
    timestamp: string;
  };
}

export interface ScientificReasoningModel {
  readonly provider: ScientificReasoningProvider;
  review(request: ScientificReasoningRequest): Promise<ScientificReasoningOutput>;
}
