import type {
  AnalysisModeId,
  CanonicalParameterContext,
} from '../../data/parameterDefinitions';
import type { CanonicalEvidenceOutput } from '../../evidence/canonicalEvidence';
import type { AgentAnalysisResult } from '../contracts/agentAnalysisResult';

/**
 * MCP-Style Tool Schema for DIFARYX Agent Demo
 * 
 * Model Context Protocol (MCP) inspired types for structured tool calling
 * and reasoning in scientific agent workflows.
 */

export type ModelProvider = 'scientific-baseline' | 'gpt-5.6' | 'gemini-2.5-flash' | 'gemini-developer-api' | 'deterministic' | 'vertex-gemini' | 'gemma';

export type ToolName =
  | 'baseline_correction'
  | 'feature_detection'
  | 'reference_search'
  | 'match_scoring'
  | 'evidence_fusion'
  | 'llm_reasoning'
  | 'report_generation';

export type ToolStatus = 'pending' | 'running' | 'complete' | 'error';

/**
 * Tool call request following MCP-style structure.
 */
export interface ToolCall {
  id: string;
  name: ToolName;
  arguments: Record<string, any>;
  timestamp: string;
}

/**
 * Tool execution result following MCP-style structure.
 */
export interface ToolResult {
  id: string;
  toolCallId: string;
  name: ToolName;
  status: ToolStatus;
  output: any;
  error?: string;
  durationMs: number;
  timestamp: string;
}

/**
 * Structured evidence packet for LLM reasoning.
 * Contains ONLY deterministic tool outputs - no raw data generation.
 */
export interface AgentEvidencePacket {
  context: 'xrd' | 'xps' | 'ftir' | 'raman';
  datasetId: string;
  datasetName: string;
  materialSystem: string;
  
  signalSummary: {
    featureCount: number;
    noiseLevel?: number;
    signalQuality?: 'high' | 'medium' | 'low';
  };
  
  detectedFeatures: Array<{
    position: number;
    intensity: number;
    assignment?: string;
    confidence?: number;
    /** Feature category, e.g. 'oxidation-state' for XPS element-focused evidence. */
    category?: string;
  }>;

  candidates: Array<{
    label: string;
    score: number;
    matchedFeatures: number;
    totalFeatures: number;
    missingFeatures: string[];
    unexplainedFeatures: string[];
  }>;

  fusedScore: number;
  uncertaintyFlags: string[];
  processingNotes: string[];

  toolTrace: ToolResult[];

  /** Canonical Workspace/Agent parameter context. Runtime normalizes legacy packets. */
  parameterContext?: CanonicalParameterContext;
  evidenceOutputs?: CanonicalEvidenceOutput[];
  analysisMode?: AnalysisModeId;
  crossTechniqueEvidence?: Array<{
    technique: 'xrd' | 'xps' | 'ftir' | 'raman';
    sourceFilename: string;
    summary: string;
    confidence: number;
    contradictions?: string[];
  }>;

  /**
   * Optional XPS element-focused evidence (Phase 1 — Agent Evidence Packet
   * Integration). Present only for XPS runs where the user inspected an element
   * via the Element Selection Analysis view. Optional → non-breaking for
   * XRD/FTIR/Raman and the LLM contract.
   */
  xpsElementEvidence?: XpsElementEvidence;
}

/**
 * Element-focused XPS evidence derived deterministically from the XPS Element
 * Selection Analysis view (oxidation-state candidates, satellites, region,
 * caveats). Evidence-bound only; carries no positive-confirmation claims.
 */
export interface XpsElementEvidence {
  selectedElement: string;
  candidateStates: Array<{
    label: string;
    /** 0..1 numeric confidence (deterministic mapping from high/medium/low). */
    confidence: number;
    matchedPeaks: number;
  }>;
  satellitePresent: boolean;
  regionWindow?: { min: number; max: number };
  caveats: string[];
  dbSource?: string;
  sourceId?: string;
  sourceDoi?: string;
  matchSource?: string;
  formula?: string;
}

/**
 * LLM reasoning output following MCP-style structure.
 */
export interface ReasoningOutput {
  primaryResult: string;
  confidence: number;
  evidenceSummary: string[];
  rejectedAlternatives: string[];
  decisionLogic: string;
  uncertainty: string[];
  recommendedNextStep: string;
  /** Canonical JSON-first output. Legacy fields above remain for current renderers. */
  analysisResult?: AgentAnalysisResult;
  metadata: {
    provider: ModelProvider;
    model: string;
    durationMs: number;
    timestamp: string;
    parameterSchemaVersion?: string;
  };
}

/**
 * Tool definition in the registry.
 */
export interface ToolDefinition {
  name: ToolName;
  displayName: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required: string[];
  };
  outputSchema: {
    type: 'object';
    properties: Record<string, any>;
  };
  provider: 'deterministic' | 'llm';
  canInsertLlmAfter?: boolean;
}

/**
 * Provider configuration.
 */
export interface ProviderConfig {
  provider: ModelProvider;
  enabled: boolean;
  model?: string;
  endpoint?: string;
  projectId?: string;
  location?: string;
}

/**
 * Reasoning request to server.
 */
export interface ReasoningRequest {
  packet: AgentEvidencePacket;
  provider: ModelProvider;
  model?: string;
}

/**
 * Reasoning response from server.
 */
export interface ReasoningResponse {
  success: boolean;
  output?: ReasoningOutput;
  error?: string;
  errorCode?: 'GEMINI_QUOTA_EXCEEDED' | 'GEMINI_QUOTA_UNAVAILABLE';
  fallbackUsed?: boolean;
}
