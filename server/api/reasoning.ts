import type { ReasoningRequest, ReasoningResponse } from '../../src/agent/mcp/types';
import type { ServerConfig } from '../config';
import type { ReasoningExecutionPolicy } from '../llm/executionPolicy';
import { routeReasoning } from '../llm/router';

export interface ReasoningRequestContext {
  config: ServerConfig;
  executionPolicy: ReasoningExecutionPolicy;
  geminiQuotaConsumed: boolean;
}

/** Route a validated server request through the provider boundary. */
export async function handleReasoningRequest(
  request: ReasoningRequest,
  context: ReasoningRequestContext,
): Promise<ReasoningResponse> {
  if (!request.packet) {
    return { success: false, error: 'Missing evidence packet' };
  }
  if (!request.provider) {
    return { success: false, error: 'Missing provider' };
  }
  return routeReasoning(request.packet, request.provider, request.model, context);
}
