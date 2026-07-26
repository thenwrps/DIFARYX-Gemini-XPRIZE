import type {
  AgentEvidencePacket,
  ModelProvider,
  ReasoningRequest,
} from '../../src/agent/mcp/types';
import type { ServerConfig } from '../config';
import { HttpError } from '../middleware/errorHandler';

type PublicProvider = ModelProvider | 'gemini';

const SUPPORTED_PROVIDERS = new Set<PublicProvider>([
  'scientific-baseline',
  'gpt-5.6',
  'gemini-2.5-flash',
  'gemini-developer-api',
  'deterministic',
  'vertex-gemini',
  'gemini',
  'gemma',
]);
const TECHNIQUES = new Set(['xrd', 'xps', 'ftir', 'raman']);
const SIGNAL_QUALITIES = new Set(['high', 'medium', 'low']);
const MAX_ARRAY_ITEMS = 10_000;
const MAX_STRING_LENGTH = 100_000;

export function parseReasoningRequest(
  value: unknown,
  route: 'reasoning' | 'legacy',
  config: ServerConfig,
): ReasoningRequest {
  const body = readObject(value, 'Request body must be a JSON object');
  const packetValue = body.packet;
  if (packetValue === undefined || packetValue === null) {
    throw new HttpError(
      400,
      route === 'reasoning' ? 'Missing evidence packet' : 'Missing packet in request body',
    );
  }
  const provider = readProvider(
    route === 'reasoning' ? body.provider : body.modelMode,
    route === 'reasoning',
  );
  const model = route === 'reasoning' ? readModel(body.model, provider, config) : undefined;
  return {
    packet: readEvidencePacket(packetValue),
    provider,
    ...(model ? { model } : {}),
  };
}

function readProvider(value: unknown, required: boolean): ModelProvider {
  if (value === undefined || value === null || value === '') {
    if (required) throw new HttpError(400, 'Missing provider');
    return 'deterministic';
  }
  if (typeof value !== 'string' || !SUPPORTED_PROVIDERS.has(value as PublicProvider)) {
    throw new HttpError(400, 'Unsupported provider');
  }
  return value === 'gemini' ? 'vertex-gemini' : value as ModelProvider;
}

function readModel(
  value: unknown,
  provider: ModelProvider,
  config: ServerConfig,
): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new HttpError(400, 'Model must be a string');
  const model = value.trim();
  if (!model || model.length > 128) throw new HttpError(400, 'Invalid model');
  if (isGeminiProvider(provider) && model !== config.geminiModel) {
    throw new HttpError(400, 'Unsupported model');
  }
  return model;
}

function readEvidencePacket(value: unknown): AgentEvidencePacket {
  const packet = readObject(value, 'Evidence packet must be a JSON object');
  const context = readEnum(packet.context, TECHNIQUES, 'Invalid evidence context');
  const signalSummary = readObject(packet.signalSummary, 'Invalid signal summary');
  const signalQuality = signalSummary.signalQuality === undefined
    ? undefined
    : readEnum(signalSummary.signalQuality, SIGNAL_QUALITIES, 'Invalid signal quality');
  const detectedFeatures = readArray(packet.detectedFeatures, 'Invalid detected features')
    .map((item) => {
      const feature = readObject(item, 'Invalid detected feature');
      return {
        position: readFiniteNumber(feature.position, 'Invalid feature position'),
        intensity: readFiniteNumber(feature.intensity, 'Invalid feature intensity'),
        ...(feature.assignment === undefined
          ? {}
          : { assignment: readString(feature.assignment, 'Invalid feature assignment') }),
        ...(feature.confidence === undefined
          ? {}
          : { confidence: readFiniteNumber(feature.confidence, 'Invalid feature confidence') }),
        ...(feature.category === undefined
          ? {}
          : { category: readString(feature.category, 'Invalid feature category') }),
      };
    });
  const candidates = readArray(packet.candidates, 'Invalid candidates').map((item) => {
    const candidate = readObject(item, 'Invalid candidate');
    return {
      label: readString(candidate.label, 'Invalid candidate label'),
      score: readFiniteNumber(candidate.score, 'Invalid candidate score'),
      matchedFeatures: readFiniteNumber(candidate.matchedFeatures, 'Invalid matched feature count'),
      totalFeatures: readFiniteNumber(candidate.totalFeatures, 'Invalid total feature count'),
      missingFeatures: readStringArray(candidate.missingFeatures, 'Invalid missing features'),
      unexplainedFeatures: readStringArray(
        candidate.unexplainedFeatures,
        'Invalid unexplained features',
      ),
    };
  });
  const toolTrace = readArray(packet.toolTrace, 'Invalid tool trace');
  toolTrace.forEach((item) => assertJsonValue(item, 0));

  for (const optional of [
    packet.parameterContext,
    packet.evidenceOutputs,
    packet.analysisMode,
    packet.crossTechniqueEvidence,
    packet.xpsElementEvidence,
  ]) {
    if (optional !== undefined) assertJsonValue(optional, 0);
  }

  return {
    context: context as AgentEvidencePacket['context'],
    datasetId: readString(packet.datasetId, 'Invalid dataset ID'),
    datasetName: readString(packet.datasetName, 'Invalid dataset name'),
    materialSystem: readString(packet.materialSystem, 'Invalid material system'),
    signalSummary: {
      featureCount: readFiniteNumber(signalSummary.featureCount, 'Invalid feature count'),
      ...(signalSummary.noiseLevel === undefined
        ? {}
        : { noiseLevel: readFiniteNumber(signalSummary.noiseLevel, 'Invalid noise level') }),
      ...(signalQuality ? { signalQuality: signalQuality as 'high' | 'medium' | 'low' } : {}),
    },
    detectedFeatures,
    candidates,
    fusedScore: readFiniteNumber(packet.fusedScore, 'Invalid fused score'),
    uncertaintyFlags: readStringArray(packet.uncertaintyFlags, 'Invalid uncertainty flags'),
    processingNotes: readStringArray(packet.processingNotes, 'Invalid processing notes'),
    toolTrace: toolTrace as AgentEvidencePacket['toolTrace'],
    ...(packet.parameterContext === undefined ? {} : { parameterContext: packet.parameterContext }),
    ...(packet.evidenceOutputs === undefined ? {} : { evidenceOutputs: packet.evidenceOutputs }),
    ...(packet.analysisMode === undefined ? {} : { analysisMode: packet.analysisMode }),
    ...(packet.crossTechniqueEvidence === undefined
      ? {}
      : { crossTechniqueEvidence: packet.crossTechniqueEvidence }),
    ...(packet.xpsElementEvidence === undefined
      ? {}
      : { xpsElementEvidence: packet.xpsElementEvidence }),
  } as AgentEvidencePacket;
}

function readObject(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, message);
  }
  return value as Record<string, unknown>;
}

function readArray(value: unknown, message: string): unknown[] {
  if (!Array.isArray(value) || value.length > MAX_ARRAY_ITEMS) {
    throw new HttpError(400, message);
  }
  return value;
}

function readString(value: unknown, message: string): string {
  if (typeof value !== 'string' || !value || value.length > MAX_STRING_LENGTH) {
    throw new HttpError(400, message);
  }
  return value;
}

function readStringArray(value: unknown, message: string): string[] {
  return readArray(value, message).map((item) => readString(item, message));
}

function readFiniteNumber(value: unknown, message: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new HttpError(400, message);
  }
  return value;
}

function readEnum(value: unknown, allowed: ReadonlySet<string>, message: string): string {
  if (typeof value !== 'string' || !allowed.has(value)) throw new HttpError(400, message);
  return value;
}

function assertJsonValue(value: unknown, depth: number): void {
  if (depth > 20) throw new HttpError(400, 'Evidence packet is too deeply nested');
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'string') {
    if (value.length > MAX_STRING_LENGTH) throw new HttpError(400, 'Evidence value is too long');
    return;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new HttpError(400, 'Evidence value is invalid');
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_ITEMS) throw new HttpError(400, 'Evidence array is too large');
    value.forEach((item) => assertJsonValue(item, depth + 1));
    return;
  }
  if (typeof value === 'object') {
    for (const child of Object.values(value)) assertJsonValue(child, depth + 1);
    return;
  }
  throw new HttpError(400, 'Evidence value is invalid');
}

function isGeminiProvider(provider: ModelProvider): boolean {
  return provider === 'gemini-2.5-flash'
    || provider === 'gemini-developer-api'
    || provider === 'vertex-gemini';
}
