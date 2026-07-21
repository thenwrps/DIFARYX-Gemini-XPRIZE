import {
  ANALYSIS_MODE_REGISTRY,
  PARAMETER_SCHEMA_VERSION,
  createCanonicalParameterContext,
  listCanonicalParameters,
  type AnalysisModeId,
  type CanonicalParameterContext,
} from '../../data/parameterDefinitions';
import { createEvidenceOutput, type CanonicalEvidenceOutput, type EvidenceOutputKind } from '../../evidence/canonicalEvidence';
import type { AgentAnalysisResult } from '../contracts/agentAnalysisResult';
import type { AgentEvidencePacket, ReasoningOutput } from '../mcp/types';

function outputKind(packet: AgentEvidencePacket): EvidenceOutputKind {
  if (packet.context === 'ftir') return 'detected_band';
  if (packet.context === 'raman') return 'detected_raman_mode';
  if (packet.context === 'xps') return 'element_identity';
  return 'detected_peak';
}

export function normalizePacketParameterContext(
  packet: AgentEvidencePacket,
  mode: AnalysisModeId = packet.analysisMode ?? 'scientific-baseline',
): CanonicalParameterContext {
  if (packet.parameterContext) {
    return {
      ...packet.parameterContext,
      analysisMode: { ...ANALYSIS_MODE_REGISTRY[mode] },
      provenance: {
        ...packet.parameterContext.provenance,
        generationTimestamp: new Date().toISOString(),
        modelProvenance: ANALYSIS_MODE_REGISTRY[mode].model ?? 'none',
      },
    };
  }
  return createCanonicalParameterContext(packet.context, {
    datasetId: packet.datasetId,
    sourceFiles: [{ filename: packet.datasetName, sha256: null, role: 'primary' }],
    analysisMode: mode,
    migratedFrom: 'legacy-agent-evidence-packet',
  });
}

export function normalizePacketEvidenceOutputs(
  packet: AgentEvidencePacket,
  context: CanonicalParameterContext,
): CanonicalEvidenceOutput[] {
  if (packet.evidenceOutputs?.length) return packet.evidenceOutputs;
  const parameterIds = context.processingParameters
    .filter((item) => item.active && item.status !== 'stored_but_not_active')
    .map((item) => item.id);
  return packet.detectedFeatures.map((feature, index) => createEvidenceOutput(context, {
    id: `${packet.datasetId}:${packet.context}:feature:${index + 1}`,
    kind: outputKind(packet),
    value: { ...feature },
    parameterIds: parameterIds.length ? parameterIds : ['rawSourceFilename'],
    confidence: feature.confidence ?? packet.fusedScore,
    warnings: [...packet.uncertaintyFlags],
  }));
}

function compactParameter(item: ReturnType<typeof listCanonicalParameters>[number]) {
  return {
    id: item.id,
    label: item.label,
    category: item.category,
    value: item.value,
    unit: item.unit,
    active: item.active,
    locked: item.locked,
    source: item.source,
    status: item.status,
    affects: item.affects,
  };
}

export function buildCanonicalAgentPrompt(
  packet: AgentEvidencePacket,
  mode: AnalysisModeId,
): string {
  const context = normalizePacketParameterContext(packet, mode);
  const profile = ANALYSIS_MODE_REGISTRY[mode];
  if (!profile.usesLlm) {
    throw new Error('Scientific Baseline Mode must not construct or invoke an LLM prompt');
  }
  const parameters = listCanonicalParameters(context);
  const activeParameters = parameters.filter((item) => item.active && item.status !== 'missing').map(compactParameter);
  const inactiveParameters = parameters.filter((item) => !item.active || item.status === 'stored_but_not_active').map(compactParameter);
  const missingMetadata = context.measurementConditions.filter((item) => item.status === 'missing').map((item) => ({ id: item.id, label: item.label }));
  const outputs = normalizePacketEvidenceOutputs(packet, context);

  const promptContext = {
    activeAnalysisMode: profile.label,
    modelIdentity: profile.model,
    technique: context.technique,
    datasetId: context.datasetId,
    sourceFilenames: context.sourceFiles.map((file) => file.filename),
    measurementConditions: context.measurementConditions.map(compactParameter),
    processingParameters: context.processingParameters.map(compactParameter),
    activeParameters,
    parametersStoredButNotActive: inactiveParameters,
    evidenceOutputs: outputs,
    referenceDatabase: {
      provider: context.interpretationParameters.find((item) => item.id === 'referenceDatabase')?.value ?? 'not_available',
      version: context.interpretationParameters.find((item) => item.id === 'referenceDatabaseVersion')?.value ?? 'not_available',
    },
    interpretationPolicy: context.interpretationParameters.map(compactParameter),
    validationPolicy: context.validationParameters.map(compactParameter),
    crossTechniqueEvidence: packet.crossTechniqueEvidence ?? [],
    missingMetadata,
    processingWarnings: [...packet.processingNotes, ...packet.uncertaintyFlags],
    provenance: context.provenance,
    parameterSchemaVersion: context.schemaVersion,
  };

  return `You are DIFARYX operating in ${profile.label}.

Use only the JSON context below. Preserve Evidence -> Interpretation -> Hypothesis -> Conclusion -> Validation Gap.

Mandatory rules:
1. Never invent missing measurement conditions.
2. Distinguish measured metadata, processed evidence, interpretation, and inference.
3. Cite source filenames for every important observation.
4. Cite relevant parameter IDs when explaining results.
5. Never claim that an inactive or stored_but_not_active parameter was applied.
6. Never upgrade a validation-limited result into a confirmed claim.
7. Respect the technique boundary: XRD is crystallographic evidence; XPS is surface evidence; FTIR is bonding evidence; Raman is vibrational/local-structure evidence.
8. Separate confidence in measurement quality from confidence in interpretation.
9. Preserve contradictions and identify the additional measurement or experiment required.
10. Return JSON only. Do not wrap it in Markdown.

CANONICAL_PARAMETER_CONTEXT:
${JSON.stringify(promptContext, null, 2)}

Return this exact JSON-first shape:
{
  "mode": "${mode}",
  "model": ${JSON.stringify(profile.model)},
  "technique": "${context.technique}",
  "datasetId": "${context.datasetId}",
  "sourceFiles": ["source filename"],
  "evidence": [],
  "claims": ["bounded claim"],
  "supportingEvidence": ["observation with source filename and parameter IDs"],
  "contradictingEvidence": [],
  "interpretation": "validation-bounded interpretation",
  "validationStatus": "blocked | limited_confidence | validation_limited | validated",
  "validationGap": [],
  "confidence": { "measurementQuality": 0.0, "interpretation": 0.0 },
  "missingInformation": [],
  "requiredNextAction": [],
  "provenance": {
    "model": ${JSON.stringify(profile.model)},
    "provider": "${profile.provider}",
    "generationTimestamp": "ISO-8601",
    "parameterSchemaVersion": "${PARAMETER_SCHEMA_VERSION}"
  },
  "parameterSnapshot": {}
}`;
}

export function buildScientificBaselineResult(packet: AgentEvidencePacket): AgentAnalysisResult {
  const context = normalizePacketParameterContext(packet, 'scientific-baseline');
  const evidence = normalizePacketEvidenceOutputs(packet, context);
  const missingInformation = context.measurementConditions
    .filter((item) => item.status === 'missing')
    .map((item) => `${item.id}: ${item.label}`);
  const warnings = [...packet.uncertaintyFlags, ...packet.processingNotes];
  return {
    mode: 'scientific-baseline',
    model: null,
    technique: context.technique,
    datasetId: context.datasetId,
    sourceFiles: context.sourceFiles.map((file) => file.filename),
    evidence,
    claims: [],
    supportingEvidence: evidence.map((item) => `${item.kind} from ${item.sourceFilename} using ${item.parameterIds.join(', ')}`),
    contradictingEvidence: packet.crossTechniqueEvidence?.flatMap((item) => item.contradictions ?? []) ?? [],
    interpretation: null,
    validationStatus: missingInformation.length ? 'limited_confidence' : 'validation_limited',
    validationGap: warnings,
    confidence: {
      measurementQuality: packet.signalSummary.signalQuality === 'high' ? 0.85 : packet.signalSummary.signalQuality === 'medium' ? 0.65 : 0.4,
      interpretation: 0,
    },
    missingInformation,
    requiredNextAction: ['Review missing metadata and validation requirements before scientific interpretation'],
    provenance: {
      model: null,
      provider: 'deterministic',
      generationTimestamp: new Date().toISOString(),
      parameterSchemaVersion: PARAMETER_SCHEMA_VERSION,
    },
    parameterSnapshot: context,
  };
}

export function normalizeAgentModelOutput(
  output: unknown,
  packet: AgentEvidencePacket,
  mode: Exclude<AnalysisModeId, 'scientific-baseline'>,
  durationMs: number,
): ReasoningOutput {
  if (!output || typeof output !== 'object') throw new Error('Agent output must be a JSON object');
  const raw = output as Record<string, unknown>;
  const context = normalizePacketParameterContext(packet, mode);
  const evidence = normalizePacketEvidenceOutputs(packet, context);
  const profile = ANALYSIS_MODE_REGISTRY[mode];
  const strings = (value: unknown) => Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())
    : [];
  const claims = strings(raw.claims);
  const validationStatus = raw.validationStatus === 'validated'
    ? 'validated'
    : raw.validationStatus === 'blocked'
      ? 'blocked'
      : raw.validationStatus === 'limited_confidence'
        ? 'limited_confidence'
        : 'validation_limited';
  if (validationStatus !== 'validated' && claims.some((claim) => /\b(proves?|confirms?|confirmed|definitive|guarantees?|guaranteed)\b/i.test(claim))) {
    throw new Error('Agent output contains a confirmed claim without validated status');
  }
  const confidenceRaw = raw.confidence && typeof raw.confidence === 'object' ? raw.confidence as Record<string, unknown> : {};
  const clamp = (value: unknown) => Math.max(0, Math.min(1, Number.isFinite(Number(value)) ? Number(value) : 0));
  const interpretation = typeof raw.interpretation === 'string' ? raw.interpretation.trim() : null;
  const supportingEvidence = strings(raw.supportingEvidence);
  const contradictingEvidence = strings(raw.contradictingEvidence);
  const validationGap = strings(raw.validationGap);
  const requiredNextAction = strings(raw.requiredNextAction);
  const analysisResult: AgentAnalysisResult = {
    mode,
    model: profile.model,
    technique: context.technique,
    datasetId: context.datasetId,
    sourceFiles: context.sourceFiles.map((file) => file.filename),
    evidence,
    claims,
    supportingEvidence,
    contradictingEvidence,
    interpretation,
    validationStatus,
    validationGap,
    confidence: {
      measurementQuality: clamp(confidenceRaw.measurementQuality),
      interpretation: clamp(confidenceRaw.interpretation),
    },
    missingInformation: strings(raw.missingInformation),
    requiredNextAction,
    provenance: {
      model: profile.model,
      provider: profile.provider,
      generationTimestamp: new Date().toISOString(),
      parameterSchemaVersion: PARAMETER_SCHEMA_VERSION,
    },
    parameterSnapshot: context,
  };
  return {
    primaryResult: claims[0] ?? interpretation ?? 'Evidence remains validation-limited',
    confidence: analysisResult.confidence.interpretation,
    evidenceSummary: supportingEvidence,
    rejectedAlternatives: contradictingEvidence,
    decisionLogic: interpretation ?? 'No generated interpretation was returned.',
    uncertainty: validationGap,
    recommendedNextStep: requiredNextAction[0] ?? 'Collect the missing validation evidence',
    analysisResult,
    metadata: {
      provider: mode === 'gpt-5.6-scientific' ? 'gpt-5.6' : 'gemini-2.5-flash',
      model: profile.model ?? 'not_available',
      durationMs,
      timestamp: analysisResult.provenance.generationTimestamp,
      parameterSchemaVersion: PARAMETER_SCHEMA_VERSION,
    },
  };
}
