/**
 * LLM Provider Router for DIFARYX Agent Demo
 * 
 * SERVER-SIDE ONLY
 * 
 * Routes reasoning requests to appropriate provider:
 * - deterministic: No LLM, use deterministic reasoning
 * - vertex-gemini: Google Cloud Vertex AI Gemini
 * - gemma: Open model via configurable endpoint
 * 
 * Includes fallback logic: if LLM fails, use deterministic reasoning.
 */

import type {
  AgentEvidencePacket,
  ReasoningOutput,
  ModelProvider,
  ReasoningResponse,
} from '../../src/agent/mcp/types';
import { callVertexGemini, isVertexAIConfigured } from './providers/geminiProvider';
import { callGemma, isGemmaConfigured } from './providers/gemmaProvider';
import { generateDeterministicReasoning } from '../../src/services/api/deterministicReasoning';

/**
 * Route reasoning request to appropriate provider.
 */
export async function routeReasoning(
  packet: AgentEvidencePacket,
  provider: ModelProvider,
  model?: string,
): Promise<ReasoningResponse> {
  try {
    // Deterministic mode
    if (provider === 'deterministic' || provider === 'scientific-baseline') {
      const output = generateDeterministicReasoning(packet);
      return {
        success: true,
        output,
        fallbackUsed: false,
      };
    }

    // Vertex AI Gemini mode
    if (provider === 'vertex-gemini' || provider === 'gemini-2.5-flash') {
      if (!isVertexAIConfigured()) {
        const output = generateDeterministicReasoning(packet);
        return {
          success: true,
          output,
          fallbackUsed: true,
        };
      }

      try {
        const output = await callVertexGemini(packet, model);
        return {
          success: true,
          output,
          fallbackUsed: false,
        };
      } catch {
        const output = generateDeterministicReasoning(packet);
        return {
          success: true,
          output,
          fallbackUsed: true,
        };
      }
    }

    // GPT-5.6 request contract is available through the scientificReview
    // adapter. Until a server transport is configured, fail closed to the
    // baseline result and preserve fallback provenance.
    if (provider === 'gpt-5.6') {
      const output = generateDeterministicReasoning(packet);
      return { success: true, output, fallbackUsed: true };
    }

    // Gemma mode
    if (provider === 'gemma') {
      if (!isGemmaConfigured()) {
        const output = generateDeterministicReasoning(packet);
        return {
          success: true,
          output,
          fallbackUsed: true,
        };
      }

      try {
        const output = await callGemma(packet, model);
        return {
          success: true,
          output,
          fallbackUsed: false,
        };
      } catch {
        const output = generateDeterministicReasoning(packet);
        return {
          success: true,
          output,
          fallbackUsed: true,
        };
      }
    }

    // Unknown provider
    return {
      success: false,
      error: `Unknown provider: ${provider}`,
    };
  } catch {
    return {
      success: false,
      error: 'Reasoning routing failed',
    };
  }
}

/**
 * Get provider status for UI display.
 */
export function getProviderStatus(provider: ModelProvider): {
  provider: ModelProvider;
  configured: boolean;
  displayName: string;
} {
  if (provider === 'deterministic' || provider === 'scientific-baseline') {
    return {
      provider,
      configured: true,
      displayName: 'Scientific Baseline Mode',
    };
  }

  if (provider === 'vertex-gemini' || provider === 'gemini-2.5-flash') {
    return {
      provider,
      configured: isVertexAIConfigured(),
      displayName: 'Gemini 2.5 Flash',
    };
  }

  if (provider === 'gemma') {
    return {
      provider: 'gemma',
      configured: isGemmaConfigured(),
      displayName: 'Gemma',
    };
  }

  if (provider === 'gpt-5.6') {
    return {
      provider,
      configured: false,
      displayName: 'GPT-5.6 Scientific Reasoning',
    };
  }

  return {
    provider,
    configured: false,
    displayName: 'Unknown',
  };
}
