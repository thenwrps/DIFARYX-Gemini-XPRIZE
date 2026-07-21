import type {
  AnalysisModeId,
  CanonicalParameterContext,
  CanonicalTechnique,
} from '../../data/parameterDefinitions';
import type { CanonicalEvidenceOutput } from '../../evidence/canonicalEvidence';

export interface AgentAnalysisResult {
  mode: AnalysisModeId;
  model: string | null;
  technique: CanonicalTechnique;
  datasetId: string;
  sourceFiles: string[];
  evidence: CanonicalEvidenceOutput[];
  claims: string[];
  supportingEvidence: string[];
  contradictingEvidence: string[];
  interpretation: string | null;
  validationStatus: 'blocked' | 'limited_confidence' | 'validation_limited' | 'validated';
  validationGap: string[];
  confidence: {
    measurementQuality: number;
    interpretation: number;
  };
  missingInformation: string[];
  requiredNextAction: string[];
  provenance: {
    model: string | null;
    provider: string;
    generationTimestamp: string;
    parameterSchemaVersion: string;
  };
  parameterSnapshot: CanonicalParameterContext;
}

export function validateAgentAnalysisResult(result: AgentAnalysisResult): string[] {
  const errors: string[] = [];
  if (result.technique !== result.parameterSnapshot.technique) errors.push('technique must match parameter snapshot');
  if (result.datasetId !== result.parameterSnapshot.datasetId) errors.push('datasetId must match parameter snapshot');
  if (result.mode !== result.parameterSnapshot.analysisMode.id) errors.push('mode must match parameter snapshot');
  if (result.mode === 'scientific-baseline') {
    if (result.model !== null) errors.push('Scientific Baseline Mode must not identify an LLM model');
    if (result.interpretation !== null) errors.push('Scientific Baseline Mode must not generate interpretation');
  }
  if (result.validationStatus !== 'validated' && result.claims.some((claim) => /\b(proves?|confirms?|confirmed|definitive|guarantees?|guaranteed)\b/i.test(claim))) {
    errors.push('unsupported confirmed claim in a validation-limited result');
  }
  return errors;
}
