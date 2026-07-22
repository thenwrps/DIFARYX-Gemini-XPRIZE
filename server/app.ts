import express, { type RequestHandler } from 'express';
import cors from 'cors';
import type {
  AgentEvidencePacket,
  ModelProvider,
  ReasoningRequest,
  ReasoningResponse,
} from '../src/agent/mcp/types';
import { handleReasoningRequest } from './api/reasoning';
import { loadServerConfig, type ServerConfig } from './config';
import { errorHandler, HttpError } from './middleware/errorHandler';
import {
  jsonStructuredLogger,
  requestContext,
  type StructuredLogger,
} from './middleware/requestContext';
import { isVertexAIConfigured } from './llm/providers/geminiProvider';

type PublicProvider = ModelProvider | 'gemini';
type ReasoningHandler = (request: ReasoningRequest) => Promise<ReasoningResponse>;

export interface CreateAppOptions {
  config?: ServerConfig;
  reasoningHandler?: ReasoningHandler;
  logger?: StructuredLogger;
}

const SUPPORTED_PROVIDERS = new Set<PublicProvider>([
  'scientific-baseline',
  'gpt-5.6',
  'gemini-2.5-flash',
  'deterministic',
  'vertex-gemini',
  'gemini',
  'gemma',
]);

export function createApp(options: CreateAppOptions = {}) {
  const config = options.config ?? loadServerConfig();
  const reasoningHandler = options.reasoningHandler ?? handleReasoningRequest;
  const logger = options.logger ?? jsonStructuredLogger;
  const app = express();

  app.disable('x-powered-by');
  app.use(requestContext(logger));
  app.use(createCorsMiddleware(config));
  app.use(express.json({ limit: config.jsonLimit }));

  app.get('/health', (_request, response) => {
    response.json({
      ok: true,
      service: config.serviceName,
      version: config.serviceVersion,
    });
  });

  app.get('/api/health', (_request, response) => {
    response.json({
      ok: true,
      service: config.serviceName,
      version: config.serviceVersion,
      provider: 'vertex-gemini',
      model: config.geminiModel,
      providerConfigured: isVertexAIConfigured(config),
    });
  });

  app.post('/api/reasoning', async (request, response, next) => {
    try {
      const body = readObjectBody(request.body);
      const packet = readPacket(body.packet, 'Missing evidence packet');
      const provider = readProvider(body.provider, true);
      const model = readOptionalModel(body.model);
      response.locals.selectedProvider = provider;
      response.locals.selectedModel = model ?? (isGeminiProvider(provider) ? config.geminiModel : null);

      const result = await reasoningHandler({ packet, provider, model });
      response.locals.selectedProvider = result.output?.metadata.provider ?? provider;
      response.locals.selectedModel = result.output?.metadata.model ?? response.locals.selectedModel;
      response.locals.fallbackUsed = result.fallbackUsed ?? false;
      response.status(result.success ? 200 : 500).json(result);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/llm/reason', async (request, response, next) => {
    try {
      const body = readObjectBody(request.body);
      const packet = readPacket(body.packet, 'Missing packet in request body');
      const provider = readProvider(body.modelMode, false);
      response.locals.selectedProvider = provider;
      response.locals.selectedModel = isGeminiProvider(provider) ? config.geminiModel : null;

      const result = await reasoningHandler({ packet, provider });
      response.locals.selectedProvider = result.output?.metadata.provider ?? provider;
      response.locals.selectedModel = result.output?.metadata.model ?? response.locals.selectedModel;
      response.locals.fallbackUsed = result.fallbackUsed ?? false;
      if (!result.success) {
        response.status(500).json({ error: 'Reasoning request failed' });
        return;
      }
      response.json({ output: result.output, fallbackUsed: result.fallbackUsed ?? false });
    } catch (error) {
      next(error);
    }
  });

  app.use(errorHandler);
  return app;
}

function createCorsMiddleware(config: ServerConfig): RequestHandler {
  return cors({
    credentials: false,
    origin(origin, callback) {
      if (!origin || config.allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new HttpError(403, 'Origin not allowed'));
    },
  });
}

function readObjectBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'Request body must be a JSON object');
  }
  return value as Record<string, unknown>;
}

function readPacket(value: unknown, missingMessage: string): AgentEvidencePacket {
  if (value === undefined || value === null) throw new HttpError(400, missingMessage);
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'Evidence packet must be a JSON object');
  }
  return value as AgentEvidencePacket;
}

function readProvider(value: unknown, required: boolean): ModelProvider {
  if (value === undefined || value === null || value === '') {
    if (required) throw new HttpError(400, 'Missing provider');
    return 'deterministic';
  }
  if (typeof value !== 'string' || !SUPPORTED_PROVIDERS.has(value as PublicProvider)) {
    throw new HttpError(400, 'Unsupported provider');
  }
  return value === 'gemini' ? 'vertex-gemini' : value as ModelProvider;
}

function readOptionalModel(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new HttpError(400, 'Model must be a string');
  const model = value.trim();
  if (!model || model.length > 128) throw new HttpError(400, 'Invalid model');
  return model;
}

function isGeminiProvider(provider: ModelProvider): boolean {
  return provider === 'vertex-gemini' || provider === 'gemini-2.5-flash';
}
