/** Server-only Gemini adapter using the shared canonical prompt. */
import {
  GoogleGenAI,
  type GenerateContentParameters,
  type GoogleGenAIOptions,
} from '@google/genai';
import type { AgentEvidencePacket, ModelProvider, ReasoningOutput } from '../../../src/agent/mcp/types';
import { buildCanonicalAgentPrompt, normalizeAgentModelOutput } from '../../../src/agent/prompt/canonicalAgentPrompt';
import { loadServerConfig, type GeminiProviderMode, type ServerConfig } from '../../config';

let cachedDeveloperClient: GoogleGenAI | undefined;
let cachedDeveloperApiKey: string | undefined;
let cachedVertexClient: GoogleGenAI | undefined;
let cachedVertexClientKey = '';

export interface GeminiProviderOptions {
  config?: ServerConfig;
  generateContent?: (parameters: GenerateContentParameters) => Promise<{ text?: string }>;
}

export interface GeminiProviderStatus {
  configured: boolean;
  mode: GeminiProviderMode;
  provider: Extract<ModelProvider, 'gemini-developer-api' | 'vertex-gemini'>;
}

export async function callGemini(
  packet: AgentEvidencePacket,
  model?: string,
  options: GeminiProviderOptions = {},
): Promise<ReasoningOutput> {
  const startTime = Date.now();
  const config = options.config ?? loadServerConfig();
  const status = getGeminiProviderStatus(config);
  if (!status.configured) {
    throw new Error('Gemini provider is not configured');
  }

  const selectedModel = model ?? config.geminiModel;
  const prompt = buildCanonicalAgentPrompt(packet, 'gemini-2.5-flash');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.geminiRequestTimeoutMs);

  try {
    const parameters: GenerateContentParameters = {
      model: selectedModel,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.1,
        maxOutputTokens: 4096,
        httpOptions: { timeout: config.geminiRequestTimeoutMs },
        abortSignal: controller.signal,
      },
    };
    const response = options.generateContent
      ? await options.generateContent(parameters)
      : await getClient(config).models.generateContent(parameters);
    const text = response.text ?? '';
    if (!text) throw new Error('Empty provider response');

    const output = normalizeAgentModelOutput(
      JSON.parse(text),
      packet,
      'gemini-2.5-flash',
      Date.now() - startTime,
    );
    return {
      ...output,
      metadata: {
        ...output.metadata,
        provider: status.provider,
        model: selectedModel,
      },
    };
  } catch {
    throw new Error('Gemini provider request failed');
  } finally {
    clearTimeout(timeout);
  }
}

export function getGeminiProviderStatus(
  config: ServerConfig = loadServerConfig(),
): GeminiProviderStatus {
  if (config.geminiProviderMode === 'vertex') {
    return {
      configured: Boolean(
        config.googleCloudProject
        && config.googleCloudLocation
        && config.geminiModelConfigured,
      ),
      mode: 'vertex',
      provider: 'vertex-gemini',
    };
  }
  return {
    configured: Boolean(config.geminiApiKey && config.geminiModelConfigured),
    mode: 'developer',
    provider: 'gemini-developer-api',
  };
}

export function isGeminiConfigured(config: ServerConfig = loadServerConfig()): boolean {
  return getGeminiProviderStatus(config).configured;
}

function getClient(config: ServerConfig): GoogleGenAI {
  if (config.geminiProviderMode === 'vertex') {
    const clientKey = `${config.googleCloudProject}:${config.googleCloudLocation}`;
    if (!cachedVertexClient || cachedVertexClientKey !== clientKey) {
      cachedVertexClient = new GoogleGenAI(buildGeminiClientOptions(config));
      cachedVertexClientKey = clientKey;
    }
    return cachedVertexClient;
  }

  if (!config.geminiApiKey) throw new Error('Gemini provider is not configured');
  if (!cachedDeveloperClient || cachedDeveloperApiKey !== config.geminiApiKey) {
    cachedDeveloperClient = new GoogleGenAI(buildGeminiClientOptions(config));
    cachedDeveloperApiKey = config.geminiApiKey;
  }
  return cachedDeveloperClient;
}

export function buildGeminiClientOptions(config: ServerConfig): GoogleGenAIOptions {
  if (config.geminiProviderMode === 'vertex') {
    if (!config.googleCloudProject || !config.googleCloudLocation || !config.geminiModelConfigured) {
      throw new Error('Gemini provider is not configured');
    }
    return {
      vertexai: true,
      project: config.googleCloudProject,
      location: config.googleCloudLocation,
    };
  }
  if (!config.geminiApiKey || !config.geminiModelConfigured) {
    throw new Error('Gemini provider is not configured');
  }
  return { apiKey: config.geminiApiKey, vertexai: false };
}
