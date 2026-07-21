/** Server-side Gemini 2.5 Flash adapter using the shared canonical prompt. */
import type { AgentEvidencePacket, ReasoningOutput } from '../../agent/mcp/types';
import { buildCanonicalAgentPrompt, normalizeAgentModelOutput } from '../../agent/prompt/canonicalAgentPrompt';

export async function callVertexGemini(
  packet: AgentEvidencePacket,
  model = 'gemini-2.5-flash',
): Promise<ReasoningOutput> {
  const startTime = Date.now();
  if (!isVertexAIConfigured()) {
    throw new Error('Gemini 2.5 Flash is not configured for Vertex AI');
  }
  const prompt = buildCanonicalAgentPrompt(packet, 'gemini-2.5-flash');
  // Keep the server SDK out of the browser bundle. The Agent demo may import
  // this adapter to inspect availability, but it must never load Vertex in a
  // browser process.
  const vertexModuleName = '@google-cloud/vertexai';
  const vertexModule = await import(/* @vite-ignore */ vertexModuleName);
  const { VertexAI } = vertexModule as typeof import('@google-cloud/vertexai');
  const vertexAI = new VertexAI({
    project: readServerEnvironment('GOOGLE_CLOUD_PROJECT')!,
    location: readServerEnvironment('GOOGLE_CLOUD_LOCATION') || 'us-central1',
  });
  const generativeModel = vertexAI.getGenerativeModel({
    model,
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.1,
      maxOutputTokens: 4096,
    },
  });
  const result = await generativeModel.generateContent(prompt);
  const text = result.response.candidates?.[0]?.content?.parts
    ?.map((part) => ('text' in part ? part.text : ''))
    .join('') ?? '';
  if (!text) throw new Error('Gemini 2.5 Flash returned an empty response');
  return normalizeAgentModelOutput(JSON.parse(text), packet, 'gemini-2.5-flash', Date.now() - startTime);
}

export function isVertexAIConfigured(): boolean {
  return Boolean(
    typeof window === 'undefined'
    && readServerEnvironment('GOOGLE_CLOUD_PROJECT')
    && readServerEnvironment('GOOGLE_GENAI_USE_VERTEXAI') === 'true',
  );
}

function readServerEnvironment(key: string): string | undefined {
  if (typeof process === 'undefined' || !process.env) return undefined;
  return process.env[key];
}
