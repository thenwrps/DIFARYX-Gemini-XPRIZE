import type {
  ReasoningRequest,
  ReasoningResponse,
} from '../../agent/mcp/types';
import { getAgentApiUrl } from './agentApiUrl';
import { generateDeterministicReasoning } from './deterministicReasoning';
import { notifySessionInvalidated } from '../auth/serverSession';

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
    const response = await fetch(getAgentApiUrl('/api/reasoning'), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (response.status === 401) {
      notifySessionInvalidated();
      return {
        success: false,
        error: 'Sign in with Google to use Gemini reasoning',
        errorCode: 'AUTH_REQUIRED',
      };
    }

    if (response.status === 429) {
      return {
        success: false,
        error: 'Gemini beta limit reached. Please try again after the reset, or use Scientific Baseline Mode now.',
        errorCode: 'GEMINI_QUOTA_EXCEEDED',
      };
    }

    if (response.status === 503) {
      const envelope = await readErrorEnvelope(response);
      if (envelope?.errorCode === 'GEMINI_QUOTA_UNAVAILABLE') {
        return {
          success: false,
          error: 'Gemini beta usage is temporarily unavailable. Scientific Baseline Mode is still available.',
          errorCode: 'GEMINI_QUOTA_UNAVAILABLE',
        };
      }
      return {
        success: false,
        error: 'Verified authentication is temporarily unavailable. Scientific Baseline Mode is still available.',
        errorCode: 'AUTH_SERVICE_UNAVAILABLE',
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

async function readErrorEnvelope(
  response: Response,
): Promise<{ errorCode?: string } | undefined> {
  try {
    const value: unknown = await response.json();
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as { errorCode?: string }
      : undefined;
  } catch {
    return undefined;
  }
}
