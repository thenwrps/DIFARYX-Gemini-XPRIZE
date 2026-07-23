import express, {
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import cors from 'cors';
import type {
  AgentEvidencePacket,
  ModelProvider,
  ReasoningRequest,
  ReasoningResponse,
} from '../src/agent/mcp/types';
import {
  handleReasoningRequest,
  type ReasoningRequestContext,
} from './api/reasoning';
import { createGoogleIdentityVerifier } from './auth/googleIdentityVerifier';
import { requireGoogleIdentity } from './auth/requireGoogleIdentity';
import type {
  GoogleIdentityVerifier,
  VerifiedGoogleIdentity,
} from './auth/types';
import { loadServerConfig, type ServerConfig } from './config';
import { errorHandler, HttpError } from './middleware/errorHandler';
import {
  jsonStructuredLogger,
  requestContext,
  type StructuredLogger,
} from './middleware/requestContext';
import {
  isGeminiRequestProvider,
  resolveReasoningExecutionPolicy,
  type ReasoningExecutionPolicy,
} from './llm/executionPolicy';
import { getGeminiProviderStatus } from './llm/providers/geminiProvider';
import { createGeminiQuotaService } from './quota/geminiQuotaService';
import type { GeminiQuotaConfig } from './quota/quotaConfig';
import type { GeminiQuotaService } from './quota/types';
import { createUpstashGeminiQuotaStore } from './quota/upstashGeminiQuotaStore';

type PublicProvider = ModelProvider | 'gemini';
interface ReasoningContext extends ReasoningRequestContext {
  identity?: VerifiedGoogleIdentity;
}
type ReasoningHandler = (
  request: ReasoningRequest,
  context: ReasoningContext,
) => Promise<ReasoningResponse>;

export interface CreateAppOptions {
  config?: ServerConfig;
  reasoningHandler?: ReasoningHandler;
  identityVerifier?: GoogleIdentityVerifier;
  quotaService?: GeminiQuotaService;
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
  const identityVerifier = options.identityVerifier ?? createGoogleIdentityVerifier({
    clientId: config.googleOAuthClientId,
  });
  const logger = options.logger ?? jsonStructuredLogger;
  let quotaService = options.quotaService;
  const getQuotaService = (quotaConfig: GeminiQuotaConfig): GeminiQuotaService => {
    if (!quotaService) {
      quotaService = createGeminiQuotaService({
        config: quotaConfig,
        store: createUpstashGeminiQuotaStore(quotaConfig),
      });
    }
    return quotaService;
  };
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
    const geminiStatus = getGeminiProviderStatus(config);
    response.json({
      ok: true,
      service: config.serviceName,
      version: config.serviceVersion,
      provider: geminiStatus.provider,
      providerMode: geminiStatus.mode,
      model: config.geminiModel,
      providerConfigured: geminiStatus.configured,
    });
  });

  app.post('/api/reasoning', async (request, response, next) => {
    try {
      const body = readObjectBody(request.body);
      const packet = readPacket(body.packet, 'Missing evidence packet');
      const provider = readProvider(body.provider, true);
      const model = readOptionalModel(body.model);
      response.locals.selectedProvider = provider;
      response.locals.selectedModel = model ?? (
        isGeminiRequestProvider(provider) ? config.geminiModel : null
      );
      const executionPolicy = resolveReasoningExecutionPolicy(provider, config);

      const identity = await authenticateForExecutionPolicy(
        request,
        response,
        executionPolicy,
        identityVerifier,
      );
      await consumeGeminiQuota(
        response,
        executionPolicy,
        identity,
        config,
        getQuotaService,
      );
      const result = await reasoningHandler(
        { packet, provider, model },
        {
          identity,
          config,
          executionPolicy,
          geminiQuotaConsumed: executionPolicy.consumesGeminiQuota,
        },
      );
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
      response.locals.selectedModel = isGeminiRequestProvider(provider)
        ? config.geminiModel
        : null;
      const executionPolicy = resolveReasoningExecutionPolicy(provider, config);

      const identity = await authenticateForExecutionPolicy(
        request,
        response,
        executionPolicy,
        identityVerifier,
      );
      await consumeGeminiQuota(
        response,
        executionPolicy,
        identity,
        config,
        getQuotaService,
      );
      const result = await reasoningHandler(
        { packet, provider },
        {
          identity,
          config,
          executionPolicy,
          geminiQuotaConsumed: executionPolicy.consumesGeminiQuota,
        },
      );
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

async function authenticateForExecutionPolicy(
  request: Request,
  response: Response,
  executionPolicy: ReasoningExecutionPolicy,
  identityVerifier: GoogleIdentityVerifier,
): Promise<VerifiedGoogleIdentity | undefined> {
  if (!executionPolicy.requiresGoogleIdentity) {
    response.locals.authOutcome = 'not_required';
    return undefined;
  }
  return requireGoogleIdentity(request, response, identityVerifier);
}

async function consumeGeminiQuota(
  response: Response,
  executionPolicy: ReasoningExecutionPolicy,
  identity: VerifiedGoogleIdentity | undefined,
  config: ServerConfig,
  getQuotaService: (quotaConfig: GeminiQuotaConfig) => GeminiQuotaService,
): Promise<void> {
  if (!executionPolicy.consumesGeminiQuota) {
    response.locals.quotaOutcome = 'not_required';
    return;
  }
  if (!identity || !config.geminiQuota.ok) {
    response.locals.quotaOutcome = 'unavailable';
    throw new HttpError(
      503,
      'Gemini quota service unavailable',
      'GEMINI_QUOTA_UNAVAILABLE',
    );
  }

  const decision = await getQuotaService(config.geminiQuota.value)
    .consume(identity.subject);
  response.locals.quotaOutcome = decision.status;
  if (decision.status === 'allowed') return;
  if (decision.status === 'unavailable') {
    throw new HttpError(
      503,
      'Gemini quota service unavailable',
      'GEMINI_QUOTA_UNAVAILABLE',
    );
  }

  response.setHeader('Retry-After', String(decision.retryAfterSeconds));
  throw new HttpError(
    429,
    'Gemini beta usage limit reached',
    'GEMINI_QUOTA_EXCEEDED',
    {
      quota: {
        dimension: decision.dimension,
        resetAt: decision.resetAt,
        retryAfterSeconds: decision.retryAfterSeconds,
      },
    },
  );
}
