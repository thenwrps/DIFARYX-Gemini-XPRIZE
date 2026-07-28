import express, { type Express, type Request, type Response } from 'express';
import type {
  ReasoningRequest,
  ReasoningResponse,
} from '../../src/agent/mcp/types';
import type { SessionManager, VerifiedGoogleIdentity } from '../auth/types';
import { requireAuthenticatedSession } from '../auth/sessionBoundary';
import type { ServerConfig } from '../config';
import {
  isGeminiRequestProvider,
  resolveReasoningExecutionPolicy,
  type ReasoningExecutionPolicy,
} from '../llm/executionPolicy';
import { HttpError } from '../middleware/errorHandler';
import type { GeminiQuotaConfig } from '../quota/quotaConfig';
import type { GeminiQuotaService } from '../quota/types';
import { parseReasoningRequest } from '../validation/reasoningRequest';
import {
  Phase2fPersistenceClient,
  readArray,
  readBoolean,
  readRecord,
  readString,
  requireRecord,
  requireString,
} from './phase2fClient';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9._:-]{1,255}$/;
const SUPPORTED_XRD_EXTENSIONS = new Set(['csv', 'txt', 'xy', 'dat']);
const SUPPORTED_XRD_MIME = new Set([
  'text/csv',
  'text/plain',
  'application/octet-stream',
]);
const PERSISTENT_PROVIDERS = new Set([
  'deterministic',
  'scientific-baseline',
  'gemini-2.5-flash',
  'gemini-developer-api',
  'vertex-gemini',
]);

interface ReasoningContext {
  identity?: VerifiedGoogleIdentity;
  config: ServerConfig;
  executionPolicy: ReasoningExecutionPolicy;
  geminiQuotaConsumed: boolean;
}

type ReasoningHandler = (
  request: ReasoningRequest,
  context: ReasoningContext,
) => Promise<ReasoningResponse>;

export interface PersistentRouteDependencies {
  config: ServerConfig;
  sessionManager?: SessionManager;
  client: Phase2fPersistenceClient;
  reasoningHandler: ReasoningHandler;
  getQuotaService: (config: GeminiQuotaConfig) => GeminiQuotaService;
}

export function registerPersistentXrdRoutes(
  app: Express,
  dependencies: PersistentRouteDependencies,
): void {
  const authenticate = async (request: Request, response: Response) => {
    if (!dependencies.config.auth.ok || !dependencies.sessionManager) {
      throw new HttpError(503, 'Authentication service unavailable');
    }
    return requireAuthenticatedSession(
      request,
      response,
      dependencies.config.auth.value,
      dependencies.sessionManager,
    );
  };

  app.get('/api/persistent/organizations', async (request, response, next) => {
    try {
      const identity = await authenticate(request, response);
      const payload = requireRecord(await dependencies.client.request(
        identity,
        undefined,
        'GET',
        '/internal/phase2f/organizations',
      ));
      const memberships = readArray(payload.memberships) ?? [];
      response.json(memberships.map((value) => {
        const membership = requireRecord(value);
        const id = requireUuid(membership.organizationId, 'Invalid organization response');
        return {
          id,
          slug: id,
          displayName: requireString(membership.organizationName),
          planTier: 'persistent',
          isActive: true,
          role: requireString(membership.role),
        };
      }));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/persistent/projects', async (request, response, next) => {
    try {
      const identity = await authenticate(request, response);
      const organizationId = requireOrganization(request);
      const limit = readBoundedInteger(request.query.limit, 50, 1, 100);
      const cursor = readOptionalBoundedString(request.query.cursor, 1024);
      const path = `/internal/phase2f/projects?limit=${limit}${
        cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''
      }`;
      const payload = requireRecord(await dependencies.client.request(
        identity, organizationId, 'GET', path,
      ));
      const items = readArray(payload.items) ?? [];
      response.json({
        projects: items,
        nextCursor: readString(payload.nextCursor) ?? null,
        requestId: response.locals.requestId,
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/persistent/projects', async (request, response, next) => {
    try {
      const identity = await authenticate(request, response);
      const organizationId = requireOrganization(request);
      const body = readStrictBody(request.body, ['title', 'description']);
      const title = requireUserString(body.title, 'Project title', 255);
      const description = readOptionalUserString(body.description, 'Project description', 5_000);
      const result = await dependencies.client.request(
        identity,
        organizationId,
        'POST',
        '/internal/phase2f/projects',
        { title, ...(description ? { description } : {}) },
      );
      response.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/persistent/projects/:projectId/datasets', async (request, response, next) => {
    try {
      const identity = await authenticate(request, response);
      const organizationId = requireOrganization(request);
      const projectId = requireUuid(request.params.projectId);
      const limit = readBoundedInteger(request.query.limit, 50, 1, 100);
      const cursor = readOptionalBoundedString(request.query.cursor, 1024);
      const path = `/internal/phase2f/projects/${projectId}/datasets?limit=${limit}${
        cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''
      }`;
      response.json(await dependencies.client.request(
        identity, organizationId, 'GET', path,
      ));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/persistent/projects/:projectId/datasets', async (request, response, next) => {
    try {
      const identity = await authenticate(request, response);
      const organizationId = requireOrganization(request);
      const projectId = requireUuid(request.params.projectId);
      const body = readStrictBody(request.body, [
        'title',
        'measurementMetadata',
        'processingParameters',
        'experimentContext',
      ]);
      const result = await dependencies.client.request(
        identity,
        organizationId,
        'POST',
        `/internal/phase2f/projects/${projectId}/datasets`,
        {
          title: requireUserString(body.title, 'Dataset title', 255),
          measurementMetadata: readJsonObject(body.measurementMetadata, 'Measurement metadata'),
          processingParameters: readJsonObject(body.processingParameters, 'Processing parameters'),
          experimentContext: readJsonObject(body.experimentContext, 'Experiment context'),
        },
      );
      response.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/persistent/datasets/:datasetId', async (request, response, next) => {
    try {
      const identity = await authenticate(request, response);
      const organizationId = requireOrganization(request);
      const datasetId = requireUuid(request.params.datasetId);
      response.json(await dependencies.client.request(
        identity,
        organizationId,
        'GET',
        `/internal/phase2f/datasets/${datasetId}`,
      ));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/persistent/datasets/:datasetId/uploads', async (request, response, next) => {
    try {
      const identity = await authenticate(request, response);
      const organizationId = requireOrganization(request);
      const datasetId = requireUuid(request.params.datasetId);
      const body = readStrictBody(request.body, [
        'originalFilename',
        'displayFilename',
        'declaredContentType',
        'byteSize',
        'clientChecksumSha256',
        'idempotencyKey',
      ]);
      const originalFilename = requireFilename(body.originalFilename);
      const displayFilename = sanitizeFilename(originalFilename);
      const extension = displayFilename.split('.').pop()?.toLowerCase() ?? '';
      if (!SUPPORTED_XRD_EXTENSIONS.has(extension)) {
        throw new HttpError(400, 'Unsupported XRD file format', 'UNSUPPORTED_XRD_FORMAT');
      }
      const declaredContentType = requireUserString(
        body.declaredContentType,
        'Content type',
        200,
      ).split(';', 1)[0].toLowerCase();
      if (!SUPPORTED_XRD_MIME.has(declaredContentType)) {
        throw new HttpError(400, 'Unsupported XRD content type', 'UNSUPPORTED_MIME');
      }
      const byteSize = requireBoundedInteger(
        body.byteSize,
        'File size',
        1,
        dependencies.config.persistenceMaxUploadBytes,
      );
      const checksum = requireUserString(body.clientChecksumSha256, 'Checksum', 64);
      if (!SHA256_PATTERN.test(checksum)) {
        throw new HttpError(400, 'Invalid SHA-256 checksum', 'INVALID_CHECKSUM');
      }
      const idempotencyKey = requireUserString(body.idempotencyKey, 'Idempotency key', 255);
      if (!IDEMPOTENCY_PATTERN.test(idempotencyKey)) {
        throw new HttpError(400, 'Invalid idempotency key', 'INVALID_IDEMPOTENCY_KEY');
      }
      const result = await dependencies.client.request(
        identity,
        organizationId,
        'POST',
        `/internal/phase2f/datasets/${datasetId}/uploads`,
        {
          originalFilename,
          displayFilename,
          declaredContentType,
          byteSize,
          clientChecksumSha256: checksum,
          idempotencyKey,
        },
      );
      response.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });

  app.put(
    '/api/persistent/uploads/:uploadId/content',
    express.raw({
      type: 'application/octet-stream',
      limit: dependencies.config.persistenceMaxUploadBytes,
    }),
    async (request, response, next) => {
      try {
        const identity = await authenticate(request, response);
        const organizationId = requireOrganization(request);
        const uploadId = requireUuid(request.params.uploadId);
        if (!Buffer.isBuffer(request.body) || request.body.length === 0) {
          throw new HttpError(400, 'Upload body is required', 'UPLOAD_BODY_REQUIRED');
        }
        response.json(await dependencies.client.request(
          identity,
          organizationId,
          'PUT',
          `/internal/phase2f/uploads/${uploadId}/content`,
          request.body,
        ));
      } catch (error) {
        next(error);
      }
    },
  );

  app.post('/api/persistent/uploads/:uploadId/finalize', async (request, response, next) => {
    try {
      const identity = await authenticate(request, response);
      const organizationId = requireOrganization(request);
      const uploadId = requireUuid(request.params.uploadId);
      response.json(await dependencies.client.request(
        identity,
        organizationId,
        'POST',
        `/internal/phase2f/uploads/${uploadId}/finalize`,
        {},
      ));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/persistent/evidence/:evidenceId', async (request, response, next) => {
    try {
      const identity = await authenticate(request, response);
      const organizationId = requireOrganization(request);
      const evidenceId = requireUuid(request.params.evidenceId);
      response.json(await dependencies.client.request(
        identity,
        organizationId,
        'GET',
        `/internal/phase2f/evidence/${evidenceId}`,
      ));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/persistent/reasoning', async (request, response, next) => {
    let identity: VerifiedGoogleIdentity | undefined;
    let organizationId: string | undefined;
    let runId: string | undefined;
    let quotaClassification: 'not_required' | 'allowed' | 'rejected' | 'unavailable' = 'not_required';
    let reasoningFailurePersisted = false;
    try {
      identity = await authenticate(request, response);
      organizationId = requireOrganization(request);
      const body = readStrictBody(request.body, [
        'projectId',
        'datasetId',
        'evidenceSnapshotId',
        'provider',
        'model',
        'idempotencyKey',
      ]);
      const projectId = requireUuid(body.projectId);
      const datasetId = requireUuid(body.datasetId);
      const evidenceSnapshotId = requireUuid(body.evidenceSnapshotId);
      const provider = requireUserString(body.provider, 'Provider', 100);
      if (!PERSISTENT_PROVIDERS.has(provider)) {
        throw new HttpError(400, 'Unsupported persistent reasoning provider');
      }
      const model = readOptionalUserString(body.model, 'Model', 128);
      const idempotencyKey = readOptionalUserString(body.idempotencyKey, 'Idempotency key', 255);
      if (idempotencyKey && !IDEMPOTENCY_PATTERN.test(idempotencyKey)) {
        throw new HttpError(400, 'Invalid idempotency key', 'INVALID_IDEMPOTENCY_KEY');
      }

      const evidence = requireRecord(await dependencies.client.request(
        identity,
        organizationId,
        'GET',
        `/internal/phase2f/evidence/${evidenceSnapshotId}`,
      ));
      if (
        requireUuid(evidence.projectId) !== projectId
        || requireUuid(evidence.datasetId) !== datasetId
        || readString(evidence.status) !== 'ready'
      ) {
        throw new HttpError(409, 'Canonical evidence is not ready', 'EVIDENCE_NOT_READY');
      }
      const content = requireRecord(evidence.content);
      const parsed = parseReasoningRequest(
        {
          packet: content.evidencePacket,
          provider,
          ...(model ? { model } : {}),
        },
        'reasoning',
        dependencies.config,
      );
      const executionPolicy = resolveReasoningExecutionPolicy(
        parsed.provider,
        dependencies.config,
      );
      if (isGeminiRequestProvider(parsed.provider) && executionPolicy.mode !== 'real_gemini') {
        throw new HttpError(
          503,
          'Configured Gemini reasoning is unavailable',
          'GEMINI_NOT_CONFIGURED',
        );
      }

      const started = requireRecord(await dependencies.client.request(
        identity,
        organizationId,
        'POST',
        '/internal/phase2f/reasoning',
        {
          projectId,
          datasetId,
          evidenceSnapshotId,
          provider: parsed.provider,
          ...(parsed.model ? { model: parsed.model } : {}),
          promptVersion: 'phase2f-xrd-v1',
          policyVersion: 'phase2e-provider-policy-v1',
          requestId: response.locals.requestId,
          ...(idempotencyKey ? { idempotencyKey } : {}),
        },
      ));
      runId = requireUuid(started.id);
      if (readBoolean(started.created) === false) {
        response.status(readString(started.status) === 'running' ? 202 : 200).json(started);
        return;
      }

      if (executionPolicy.consumesGeminiQuota) {
        if (!dependencies.config.geminiQuota.ok) {
          response.locals.quotaOutcome = 'unavailable';
          quotaClassification = 'unavailable';
          await persistReasoningFailure(
            dependencies.client,
            identity,
            organizationId,
            runId,
            'unavailable',
            'GEMINI_QUOTA_UNAVAILABLE',
            'Gemini quota service unavailable',
          );
          reasoningFailurePersisted = true;
          throw new HttpError(
            503,
            'Gemini quota service unavailable',
            'GEMINI_QUOTA_UNAVAILABLE',
          );
        }
        const decision = await dependencies.getQuotaService(
          dependencies.config.geminiQuota.value,
        ).consume(identity.subject);
        response.locals.quotaOutcome = decision.status;
        if (decision.status === 'unavailable') {
          quotaClassification = 'unavailable';
          await persistReasoningFailure(
            dependencies.client,
            identity,
            organizationId,
            runId,
            'unavailable',
            'GEMINI_QUOTA_UNAVAILABLE',
            'Gemini quota service unavailable',
          );
          reasoningFailurePersisted = true;
          throw new HttpError(
            503,
            'Gemini quota service unavailable',
            'GEMINI_QUOTA_UNAVAILABLE',
          );
        }
        if (decision.status === 'allowed') {
          quotaClassification = 'allowed';
        } else {
          quotaClassification = 'rejected';
          await persistReasoningFailure(
            dependencies.client,
            identity,
            organizationId,
            runId,
            'rejected',
            'GEMINI_QUOTA_EXCEEDED',
            'Gemini beta usage limit reached',
          );
          reasoningFailurePersisted = true;
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
      } else {
        response.locals.quotaOutcome = 'not_required';
      }

      const result = await dependencies.reasoningHandler(
        parsed,
        {
          identity,
          config: dependencies.config,
          executionPolicy,
          geminiQuotaConsumed: executionPolicy.consumesGeminiQuota,
        },
      );
      if (!result.success || !result.output) {
        await persistReasoningFailure(
          dependencies.client,
          identity,
          organizationId,
          runId,
          quotaClassification,
          'REASONING_FAILED',
          'Persistent reasoning failed',
        );
        reasoningFailurePersisted = true;
        throw new HttpError(500, 'Persistent reasoning failed');
      }
      const fallbackUsed = result.fallbackUsed ?? false;
      response.locals.selectedProvider = result.output.metadata.provider;
      response.locals.selectedModel = result.output.metadata.model;
      response.locals.fallbackUsed = fallbackUsed;
      const completed = await dependencies.client.request(
        identity,
        organizationId,
        'POST',
        `/internal/phase2f/reasoning/${runId}/complete`,
        {
          status: fallbackUsed ? 'fallback' : 'succeeded',
          structuredOutput: result.output,
          fallbackUsed,
          quotaClassification,
        },
      );
      response.status(201).json(completed);
    } catch (error) {
      if (
        identity
        && organizationId
        && runId
        && !reasoningFailurePersisted
      ) {
        try {
          await persistReasoningFailure(
            dependencies.client,
            identity,
            organizationId,
            runId,
            quotaClassification,
            'REASONING_FAILED',
            'Persistent reasoning failed',
          );
        } catch {
          // The authoritative persistence failure is surfaced by the original
          // error. No optimistic success is returned.
        }
      }
      next(error);
    }
  });

  app.get('/api/persistent/reasoning/:runId', async (request, response, next) => {
    try {
      const identity = await authenticate(request, response);
      const organizationId = requireOrganization(request);
      const runId = requireUuid(request.params.runId);
      response.json(await dependencies.client.request(
        identity,
        organizationId,
        'GET',
        `/internal/phase2f/reasoning/${runId}`,
      ));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/persistent/history', async (request, response, next) => {
    try {
      const identity = await authenticate(request, response);
      const organizationId = requireOrganization(request);
      const query = new URLSearchParams();
      query.set('limit', String(readBoundedInteger(request.query.limit, 50, 1, 100)));
      const projectId = readOptionalUuid(request.query.projectId);
      const datasetId = readOptionalUuid(request.query.datasetId);
      const cursor = readOptionalBoundedString(request.query.cursor, 1024);
      if (projectId) query.set('projectId', projectId);
      if (datasetId) query.set('datasetId', datasetId);
      if (cursor) query.set('cursor', cursor);
      response.json(await dependencies.client.request(
        identity,
        organizationId,
        'GET',
        `/internal/phase2f/history?${query.toString()}`,
      ));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/persistent/notebook-references', async (request, response, next) => {
    try {
      const identity = await authenticate(request, response);
      const organizationId = requireOrganization(request);
      const body = readStrictBody(request.body, ['reasoningRunId', 'label']);
      const result = await dependencies.client.request(
        identity,
        organizationId,
        'POST',
        '/internal/phase2f/notebook-references',
        {
          reasoningRunId: requireUuid(body.reasoningRunId),
          label: requireUserString(body.label, 'Notebook label', 255),
        },
      );
      response.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/persistent/notebook-references', async (request, response, next) => {
    try {
      const identity = await authenticate(request, response);
      const organizationId = requireOrganization(request);
      response.json(await dependencies.client.request(
        identity,
        organizationId,
        'GET',
        '/internal/phase2f/notebook-references',
      ));
    } catch (error) {
      next(error);
    }
  });
}

async function persistReasoningFailure(
  client: Phase2fPersistenceClient,
  identity: VerifiedGoogleIdentity,
  organizationId: string,
  runId: string,
  quotaClassification: 'not_required' | 'allowed' | 'rejected' | 'unavailable',
  failureCode: string,
  failureMessage: string,
): Promise<void> {
  await client.request(
    identity,
    organizationId,
    'POST',
    `/internal/phase2f/reasoning/${runId}/complete`,
    {
      status: 'failed',
      structuredOutput: null,
      fallbackUsed: false,
      quotaClassification,
      failureCode,
      failureMessage,
    },
  );
}

function requireOrganization(request: Request): string {
  const value = request.header('Active-Organization');
  return requireUuid(value, 'Active organization is required');
}

function requireUuid(value: unknown, message = 'Invalid identifier'): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new HttpError(400, message, 'INVALID_IDENTIFIER');
  }
  return value.toLowerCase();
}

function readOptionalUuid(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  return requireUuid(value);
}

function readStrictBody(value: unknown, allowedKeys: string[]): Record<string, unknown> {
  const body = readRecord(value);
  if (!body) throw new HttpError(400, 'Request body must be a JSON object');
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(body)) {
    if (!allowed.has(key)) throw new HttpError(400, `Unknown request field: ${key}`);
  }
  return body;
}

function requireUserString(
  value: unknown,
  label: string,
  maximumLength: number,
): string {
  if (typeof value !== 'string') throw new HttpError(400, `${label} is required`);
  const normalized = value.trim();
  if (
    !normalized
    || normalized.length > maximumLength
    || /[\u0000-\u001f\u007f]/.test(normalized)
  ) {
    throw new HttpError(400, `${label} is invalid`);
  }
  return normalized;
}

function readOptionalUserString(
  value: unknown,
  label: string,
  maximumLength: number,
): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return requireUserString(value, label, maximumLength);
}

function requireFilename(value: unknown): string {
  const filename = requireUserString(value, 'Filename', 500);
  if (
    filename.includes('/')
    || filename.includes('\\')
    || filename === '.'
    || filename === '..'
  ) {
    throw new HttpError(400, 'Filename is unsafe', 'INVALID_FILENAME');
  }
  return filename;
}

function sanitizeFilename(filename: string): string {
  const sanitized = filename
    .replace(/[^A-Za-z0-9._() -]+/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/^[ .]+|[ .]+$/g, '');
  return sanitized || 'xrd-signal.dat';
}

function readJsonObject(value: unknown, label: string): Record<string, unknown> {
  if (value === undefined) return {};
  const record = readRecord(value);
  if (!record) throw new HttpError(400, `${label} must be a JSON object`);
  assertBoundedJson(record, 0);
  return record;
}

function assertBoundedJson(value: unknown, depth: number): void {
  if (depth > 16) throw new HttpError(400, 'JSON value is too deeply nested');
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'string') {
    if (value.length > 100_000) throw new HttpError(400, 'JSON string is too long');
    return;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new HttpError(400, 'JSON number is invalid');
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > 10_000) throw new HttpError(400, 'JSON array is too large');
    value.forEach((item) => assertBoundedJson(item, depth + 1));
    return;
  }
  const record = readRecord(value);
  if (!record) throw new HttpError(400, 'JSON value is invalid');
  Object.values(record).forEach((item) => assertBoundedJson(item, depth + 1));
}

function readBoundedInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (value === undefined) return fallback;
  return requireBoundedInteger(value, 'Integer value', minimum, maximum);
}

function requireBoundedInteger(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new HttpError(400, `${label} is invalid`);
  }
  return parsed;
}

function readOptionalBoundedString(
  value: unknown,
  maximumLength: number,
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !value || value.length > maximumLength) {
    throw new HttpError(400, 'Query value is invalid');
  }
  return value;
}
