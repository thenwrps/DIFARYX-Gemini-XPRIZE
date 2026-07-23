import type { ModelProvider } from '../../src/agent/mcp/types';
import type { ServerConfig } from '../config';
import { getGeminiProviderStatus } from './providers/geminiProvider';

export type ReasoningExecutionPolicy =
  | {
      mode: 'real_gemini';
      requiresGoogleIdentity: true;
      consumesGeminiQuota: true;
    }
  | {
      mode: 'no_gemini';
      requiresGoogleIdentity: false;
      consumesGeminiQuota: false;
    };

/**
 * Canonical server-side decision for authentication, quota, and provider
 * routing. Browser flags cannot turn a non-Gemini request into real Gemini
 * execution or bypass the configured-provider check.
 */
export function resolveReasoningExecutionPolicy(
  provider: ModelProvider,
  config: ServerConfig,
): ReasoningExecutionPolicy {
  if (isGeminiRequestProvider(provider) && getGeminiProviderStatus(config).configured) {
    return {
      mode: 'real_gemini',
      requiresGoogleIdentity: true,
      consumesGeminiQuota: true,
    };
  }
  return {
    mode: 'no_gemini',
    requiresGoogleIdentity: false,
    consumesGeminiQuota: false,
  };
}

export function isGeminiRequestProvider(provider: ModelProvider): boolean {
  return provider === 'vertex-gemini' || provider === 'gemini-2.5-flash';
}
