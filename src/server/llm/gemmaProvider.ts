/** Legacy Gemma compatibility adapter. New UI modes use GPT-5.6, Gemini 2.5 Flash, or Baseline. */
import type { AgentEvidencePacket, ReasoningOutput } from '../../agent/mcp/types';
import { buildCanonicalAgentPrompt, normalizeAgentModelOutput } from '../../agent/prompt/canonicalAgentPrompt';

export async function callGemma(
  packet: AgentEvidencePacket,
  model?: string,
): Promise<ReasoningOutput> {
  const startTime = Date.now();
  if (!process.env.GEMMA_ENDPOINT) throw new Error('GEMMA_ENDPOINT environment variable not set');
  const modelName = model || process.env.GEMMA_MODEL || 'gemma-2-9b-it';
  const response = await fetch(process.env.GEMMA_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: modelName,
      prompt: buildCanonicalAgentPrompt(packet, 'gemini-2.5-flash'),
      format: 'json',
      stream: false,
      options: { temperature: 0.1, num_predict: 4096 },
    }),
  });
  if (!response.ok) throw new Error(`Gemma API error: ${response.status} ${response.statusText}`);
  const data = await response.json();
  const text = data.response || data.text || data.output || '';
  if (!text) throw new Error('Empty response from Gemma endpoint');
  return normalizeAgentModelOutput(JSON.parse(text), packet, 'gemini-2.5-flash', Date.now() - startTime);
}

export function isGemmaConfigured(): boolean {
  return Boolean(process.env.GEMMA_ENDPOINT);
}
