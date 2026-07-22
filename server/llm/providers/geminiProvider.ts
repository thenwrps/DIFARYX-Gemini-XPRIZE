/** Server-only Vertex AI Gemini adapter using the shared canonical prompt. */
import { GoogleGenAI } from '@google/genai';
import type { AgentEvidencePacket, ReasoningOutput } from '../../../src/agent/mcp/types';
import { buildCanonicalAgentPrompt, normalizeAgentModelOutput } from '../../../src/agent/prompt/canonicalAgentPrompt';
import { loadServerConfig, type ServerConfig } from '../../config';

let cachedClient: GoogleGenAI | undefined;
let cachedClientKey = '';

export interface GeminiProviderOptions {
  config?: ServerConfig;
}

export async function callVertexGemini(
  packet: AgentEvidencePacket,
  model?: string,
  options: GeminiProviderOptions = {},
): Promise<ReasoningOutput> {
  const startTime = Date.now();
  const config = options.config ?? loadServerConfig();
  if (!isVertexAIConfigured(config)) {
    throw new Error('Gemini provider is not configured');
  }

  const selectedModel = model ?? config.geminiModel;
  const prompt = buildCanonicalAgentPrompt(packet, 'gemini-2.5-flash');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.geminiRequestTimeoutMs);

  try {
    const response = await getClient(config).models.generateContent({
      model: selectedModel,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.1,
        maxOutputTokens: 4096,
        httpOptions: { timeout: config.geminiRequestTimeoutMs },
        abortSignal: controller.signal,
      },
    });
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
        provider: 'vertex-gemini',
        model: selectedModel,
      },
    };
  } catch {
    throw new Error('Gemini provider request failed');
  } finally {
    clearTimeout(timeout);
  }
}

export function isVertexAIConfigured(config: ServerConfig = loadServerConfig()): boolean {
  return Boolean(config.googleCloudProject && config.googleGenAIUseVertexAI);
}

function getClient(config: ServerConfig): GoogleGenAI {
  const clientKey = `${config.googleCloudProject}:${config.googleCloudLocation}`;
  if (!cachedClient || cachedClientKey !== clientKey) {
    cachedClient = new GoogleGenAI({
      vertexai: true,
      project: config.googleCloudProject,
      location: config.googleCloudLocation,
    });
    cachedClientKey = clientKey;
  }
  return cachedClient;
}
