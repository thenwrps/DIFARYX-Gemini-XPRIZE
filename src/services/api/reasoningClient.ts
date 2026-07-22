import type {
  ReasoningRequest,
  ReasoningResponse,
} from '../../agent/mcp/types';
import { generateDeterministicReasoning } from './deterministicReasoning';

/**
 * Client-side helper to call the reasoning API.
 *
 * The deterministic fallback remains client-safe and preserves the existing
 * response contract when the backend is unavailable.
 */
export async function callReasoningAPI(
  request: ReasoningRequest,
): Promise<ReasoningResponse> {
  const baseUrl = import.meta.env.VITE_AGENT_API_URL || 'http://localhost:3001';
  try {
    const response = await fetch(`${baseUrl}/api/reasoning`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`Agent backend returned HTTP ${response.status}`);
    }

    const data: ReasoningResponse = await response.json();
    return data;
  } catch (error) {
    console.warn('Failed to call agent backend reasoning API, falling back to local reasoning:', error);
    if (!request.packet) {
      return { success: false, error: 'Missing evidence packet' };
    }
    if (!request.provider) {
      return { success: false, error: 'Missing provider' };
    }
    try {
      return {
        success: true,
        output: generateDeterministicReasoning(request.packet),
        fallbackUsed: request.provider !== 'deterministic' && request.provider !== 'scientific-baseline',
      };
    } catch (fallbackError) {
      return {
        success: false,
        error: fallbackError instanceof Error ? fallbackError.message : 'Unknown error',
      };
    }
  }
}
