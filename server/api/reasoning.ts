/**
 * Server-Side API Route for LLM Reasoning
 * 
 * This module provides a server-side API endpoint for LLM reasoning.
 * In a production deployment, this would be deployed as a Cloud Run service
 * or serverless function.
 * 
 * For local development with Vite, you would need to set up a proxy or
 * use a separate Express/Fastify server.
 */

import type {
  ReasoningRequest,
  ReasoningResponse,
} from '../../src/agent/mcp/types';
import { routeReasoning } from '../llm/router';

/**
 * Handle reasoning request.
 * 
 * This function would be called by your API endpoint handler.
 * 
 * Example Express route:
 * ```typescript
 * app.post('/api/reasoning', async (req, res) => {
 *   try {
 *     const request: ReasoningRequest = req.body;
 *     const response = await handleReasoningRequest(request);
 *     res.json(response);
 *   } catch (error) {
 *     res.status(500).json({
 *       success: false,
 *       error: error.message,
 *     });
 *   }
 * });
 * ```
 */
export async function handleReasoningRequest(
  request: ReasoningRequest,
): Promise<ReasoningResponse> {
  try {
    // Validate request
    if (!request.packet) {
      return {
        success: false,
        error: 'Missing evidence packet',
      };
    }

    if (!request.provider) {
      return {
        success: false,
        error: 'Missing provider',
      };
    }

    // Route to appropriate provider
    const response = await routeReasoning(
      request.packet,
      request.provider,
      request.model,
    );

    return response;
  } catch (error) {
    console.error('Reasoning request error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
