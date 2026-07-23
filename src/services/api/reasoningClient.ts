import type {
  ReasoningRequest,
  ReasoningResponse,
} from '../../agent/mcp/types';
import { getAgentApiUrl } from './agentApiUrl';
import { generateDeterministicReasoning } from './deterministicReasoning';
import {
  clearIdentitySession,
  getIdentityToken,
} from '../auth/identitySession';

/**
 * Client-side helper to call the reasoning API.
 *
 * The deterministic fallback remains client-safe and preserves the existing
 * response contract when the backend is unavailable.
 */
export async function callReasoningAPI(
  request: ReasoningRequest,
): Promise<ReasoningResponse> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (requiresGeminiIdentity(request.provider)) {
      const identityToken = getIdentityToken();
      if (identityToken) {
        headers.Authorization = `Bearer ${identityToken}`;
      }
    }

    const response = await fetch(getAgentApiUrl('/api/reasoning'), {
      method: 'POST',
      headers,
      body: JSON.stringify(request),
    });

    if (response.status === 401) {
      clearIdentitySession();
      return {
        success: false,
        error: 'Sign in with Google to use Gemini reasoning',
      };
    }

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

function requiresGeminiIdentity(provider: ReasoningRequest['provider']): boolean {
  return provider === 'gemini-2.5-flash'
    || provider === 'gemini-developer-api'
    || provider === 'vertex-gemini';
}
