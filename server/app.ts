import express, {
  type RequestHandler,
  type Response,
} from 'express';
import cors from 'cors';
import type {
  ReasoningRequest,
  ReasoningResponse,
} from '../src/agent/mcp/types';
import {
  handleReasoningRequest,
  type ReasoningRequestContext,
} from './api/reasoning';
import { createGoogleIdentityVerifier } from './auth/googleIdentityVerifier';
import { createGoogleOAuthClient } from './auth/googleOAuthClient';
import {
  registerAuthRoutes,
  requireAuthenticatedSession,
} from './auth/sessionBoundary';
import { createSessionManager } from './auth/sessionManager';
import type {
  GoogleOAuthClient,
  GoogleIdentityVerifier,
  SessionManager,
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
import { parseReasoningRequest } from './validation/reasoningRequest';

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
  oauthClient?: GoogleOAuthClient;
  sessionManager?: SessionManager;
  quotaService?: GeminiQuotaService;
  logger?: StructuredLogger;
}

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

  let sessionManager = options.sessionManager;
  if (config.auth.ok) {
    sessionManager ??= createSessionManager(config.auth.value);
    registerAuthRoutes(app, {
      config: config.auth.value,
      identityVerifier,
      oauthClient: options.oauthClient ?? createGoogleOAuthClient(config.auth.value),
      sessionManager,
    });
  } else {
    registerUnavailableAuthRoutes(app);
  }

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
      const { packet, provider, model } = parseReasoningRequest(
        request.body,
        'reasoning',
        config,
      );
      response.locals.selectedProvider = provider;
      response.locals.selectedModel = model ?? (
        isGeminiRequestProvider(provider) ? config.geminiModel : null
      );
      const executionPolicy = resolveReasoningExecutionPolicy(provider, config);

      const identity = await authenticateForExecutionPolicy(
        request,
        response,
        executionPolicy,
        config,
        sessionManager,
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
      const { packet, provider } = parseReasoningRequest(
        request.body,
        'legacy',
        config,
      );
      response.locals.selectedProvider = provider;
      response.locals.selectedModel = isGeminiRequestProvider(provider)
        ? config.geminiModel
        : null;
      const executionPolicy = resolveReasoningExecutionPolicy(provider, config);

      const identity = await authenticateForExecutionPolicy(
        request,
        response,
        executionPolicy,
        config,
        sessionManager,
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
    credentials: true,
    origin(origin, callback) {
      if (!origin || config.allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new HttpError(403, 'Origin not allowed'));
    },
  });
}

async function authenticateForExecutionPolicy(
  request: express.Request,
  response: Response,
  executionPolicy: ReasoningExecutionPolicy,
  config: ServerConfig,
  sessionManager: SessionManager | undefined,
): Promise<VerifiedGoogleIdentity | undefined> {
  if (!executionPolicy.requiresGoogleIdentity) {
    response.locals.authOutcome = 'not_required';
    return undefined;
  }
  if (!config.auth.ok || !sessionManager) {
    response.locals.authOutcome = 'unavailable';
    throw new HttpError(503, 'Authentication service unavailable');
  }
  return requireAuthenticatedSession(
    request,
    response,
    config.auth.value,
    sessionManager,
  );
}

function registerUnavailableAuthRoutes(app: express.Express): void {
  const unavailable = (_request: express.Request, _response: Response, next: express.NextFunction) => {
    next(new HttpError(503, 'Authentication service unavailable'));
  };
  app.get('/api/auth/google/start', unavailable);
  app.get('/api/auth/google/callback', unavailable);
  app.get('/api/session', unavailable);
  app.post('/api/logout', unavailable);
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
