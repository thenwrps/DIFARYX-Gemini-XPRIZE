import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type { AgentEvidencePacket, ReasoningRequest } from '../../src/agent/mcp/types';
import { generateDeterministicReasoning } from '../../src/services/api/deterministicReasoning';
import { createApp } from '../app';
import type { AuthenticatedSession, SessionManager } from '../auth/types';
import { loadServerConfig, type ServerConfig } from '../config';
import { HttpError } from '../middleware/errorHandler';
import { Phase2fPersistenceClient, type PersistentIdentity } from '../persistence/phase2fClient';
import type { GeminiQuotaService } from '../quota/types';

const COOKIE = '__Host-difaryx_session=phase2f-session';
const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const PROJECT_ID = '22222222-2222-4222-8222-222222222222';
const DATASET_ID = '33333333-3333-4333-8333-333333333333';
const EVIDENCE_ID = '44444444-4444-4444-8444-444444444444';
const RUN_ID = '55555555-5555-4555-8555-555555555555';

const session: AuthenticatedSession = {
  identity: {
    provider: 'google',
    subject: 'verified-phase2f-subject',
    displayName: 'Phase 2F Researcher',
    email: 'phase2f@example.test',
  },
  user: {
    provider: 'google',
    displayName: 'Phase 2F Researcher',
    email: 'phase2f@example.test',
  },
  expiresAt: '2099-01-01T00:00:00.000Z',
};

const packet: AgentEvidencePacket = {
  context: 'xrd',
  datasetId: DATASET_ID,
  datasetName: 'persistent-xrd.csv',
  materialSystem: 'Undeclared XRD sample',
  signalSummary: { featureCount: 2, signalQuality: 'medium' },
  detectedFeatures: [
    { position: 31.2, intensity: 100, confidence: 0.8 },
    { position: 36.8, intensity: 80, confidence: 0.7 },
  ],
  candidates: [{
    label: 'Unassigned XRD pattern - approved reference match required',
    score: 0,
    matchedFeatures: 0,
    totalFeatures: 2,
    missingFeatures: [],
    unexplainedFeatures: ['31.2 deg', '36.8 deg'],
  }],
  fusedScore: 0,
  uncertaintyFlags: ['Composition requires complementary evidence.'],
  processingNotes: ['Server-authorized immutable evidence.'],
  toolTrace: [],
};

type FakeCall = {
  identity: PersistentIdentity;
  organizationId: string | undefined;
  method: string;
  path: string;
  body: unknown;
};

class FakePersistenceClient extends Phase2fPersistenceClient {
  readonly calls: FakeCall[] = [];

  constructor(
    config: ServerConfig,
    private readonly responder: (call: FakeCall) => unknown | Promise<unknown>,
  ) {
    super(config);
  }

  override async request(
    identity: PersistentIdentity,
    organizationId: string | undefined,
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    body?: unknown | Buffer,
  ): Promise<unknown> {
    const call = { identity, organizationId, method, path, body };
    this.calls.push(call);
    return this.responder(call);
  }
}

function config(): ServerConfig {
  return loadServerConfig({
    NODE_ENV: 'production',
    ALLOWED_ORIGINS: 'https://app.example.test',
    APP_BASE_URL: 'https://app.example.test',
    GEMINI_PROVIDER_MODE: 'developer',
    GEMINI_API_KEY: 'synthetic-provider-key',
    GEMINI_MODEL: 'gemini-2.5-flash',
    GOOGLE_OAUTH_CLIENT_ID: 'synthetic-client-id',
    GOOGLE_OAUTH_CLIENT_SECRET: 'synthetic-client-secret',
    GOOGLE_OAUTH_REDIRECT_URI: 'https://api.example.test/api/auth/google/callback',
    DIFARYX_SESSION_SECRET: 'phase2f-session-secret-at-least-32-characters',
    UPSTASH_REDIS_REST_URL: 'https://synthetic-quota.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'synthetic-rest-token',
    QUOTA_ID_HASH_SECRET: 'phase2f-independent-quota-secret',
    GEMINI_GLOBAL_DAILY_LIMIT: '100',
    PERSISTENCE_API_BASE_URL: 'https://persistence.example.test',
    DIFARYX_INTERNAL_SERVICE_SECRET: 'phase2f-internal-service-secret-at-least-32-characters',
  });
}

function verifiedSessionManager(valid = true): SessionManager {
  return {
    create: vi.fn(async () => ({ token: 'created-session-token', session })),
    read: vi.fn(async () => valid ? session : null),
    revoke: vi.fn(async () => {}),
  };
}

function allowedQuotaService(): GeminiQuotaService {
  return {
    consume: vi.fn(async () => ({
      status: 'allowed' as const,
      counters: [
        { dimension: 'user_burst' as const, limit: 2, remaining: 1, resetAt: '2099-01-01T00:00:00.000Z', retryAfterSeconds: 30 },
        { dimension: 'user_daily' as const, limit: 5, remaining: 4, resetAt: '2099-01-01T00:00:00.000Z', retryAfterSeconds: 100 },
        { dimension: 'global_daily' as const, limit: 100, remaining: 99, resetAt: '2099-01-01T00:00:00.000Z', retryAfterSeconds: 100 },
      ] as const,
    })),
  };
}

function exceededQuotaService(): GeminiQuotaService {
  return {
    consume: vi.fn(async () => ({
      status: 'user_daily_exceeded' as const,
      dimension: 'user_daily' as const,
      limit: 5,
      remaining: 0,
      resetAt: '2099-01-01T00:00:00.000Z',
      retryAfterSeconds: 60,
    })),
  };
}

function unavailableQuotaService(): GeminiQuotaService {
  return {
    consume: vi.fn(async () => ({ status: 'unavailable' as const })),
  };
}

function reasoningResponder(call: FakeCall): unknown {
  if (call.method === 'GET' && call.path === `/internal/phase2f/evidence/${EVIDENCE_ID}`) {
    return {
      id: EVIDENCE_ID,
      projectId: PROJECT_ID,
      datasetId: DATASET_ID,
      status: 'ready',
      content: { evidencePacket: packet },
    };
  }
  if (call.method === 'POST' && call.path === '/internal/phase2f/reasoning') {
    return { id: RUN_ID, status: 'running', created: true };
  }
  if (call.method === 'POST' && call.path === `/internal/phase2f/reasoning/${RUN_ID}/complete`) {
    return {
      id: RUN_ID,
      organizationId: ORGANIZATION_ID,
      projectId: PROJECT_ID,
      datasetId: DATASET_ID,
      evidenceSnapshotId: EVIDENCE_ID,
      evidenceContentSha256: 'a'.repeat(64),
      executionMode: 'deterministic',
      status: 'succeeded',
      provider: 'deterministic',
      model: null,
      promptVersion: 'phase2f-xrd-v1',
      policyVersion: 'phase2e-provider-policy-v1',
      structuredOutput: generateDeterministicReasoning(packet),
      fallbackUsed: false,
      quotaClassification: 'not_required',
      requestId: 'request-id',
      failureCode: null,
      failureMessage: null,
      createdAt: '2026-07-28T00:00:00.000Z',
      completedAt: '2026-07-28T00:00:01.000Z',
    };
  }
  throw new Error(`Unexpected fake persistence call: ${call.method} ${call.path}`);
}

describe('Phase 2F same-site persistence boundary', () => {
  it('requires a verified Phase 2E session before any persistent API access', async () => {
    const serverConfig = config();
    const persistence = new FakePersistenceClient(serverConfig, () => ({ items: [] }));
    const response = await request(createApp({
      config: serverConfig,
      sessionManager: verifiedSessionManager(false),
      persistenceClient: persistence,
      logger: () => undefined,
    }))
      .get(`/api/persistent/projects/${PROJECT_ID}/datasets`)
      .set('Active-Organization', ORGANIZATION_ID);

    expect(response.status).toBe(401);
    expect(persistence.calls).toHaveLength(0);
  });

  it('derives the internal subject from the verified session and forwards only the active tenant', async () => {
    const serverConfig = config();
    const persistence = new FakePersistenceClient(serverConfig, () => ({ items: [], hasMore: false }));
    const response = await request(createApp({
      config: serverConfig,
      sessionManager: verifiedSessionManager(),
      persistenceClient: persistence,
      logger: () => undefined,
    }))
      .get(`/api/persistent/projects/${PROJECT_ID}/datasets`)
      .set('Cookie', COOKIE)
      .set('Active-Organization', ORGANIZATION_ID)
      .set('X-DIFARYX-Service-Subject', 'forged-browser-subject');

    expect(response.status).toBe(200);
    expect(persistence.calls).toHaveLength(1);
    expect(persistence.calls[0].identity.subject).toBe(session.identity.subject);
    expect(persistence.calls[0].organizationId).toBe(ORGANIZATION_ID);
  });

  it('accepts Unicode names through server sanitization and rejects control characters', async () => {
    const serverConfig = config();
    const persistence = new FakePersistenceClient(serverConfig, () => ({
      datasetId: DATASET_ID,
      uploadId: '66666666-6666-4666-8666-666666666666',
      uploadUrl: '/api/persistent/uploads/66666666-6666-4666-8666-666666666666/content',
      uploadStatus: 'created',
    }));
    const app = createApp({
      config: serverConfig,
      sessionManager: verifiedSessionManager(),
      persistenceClient: persistence,
      logger: () => undefined,
    });
    const valid = await request(app)
      .post(`/api/persistent/datasets/${DATASET_ID}/uploads`)
      .set('Cookie', COOKIE)
      .set('Active-Organization', ORGANIZATION_ID)
      .send({
        originalFilename: 'ตัวอย่าง.csv',
        displayFilename: 'ignored-by-server.csv',
        declaredContentType: 'text/csv',
        byteSize: 120,
        clientChecksumSha256: 'a'.repeat(64),
        idempotencyKey: 'unicode-upload',
      });
    const invalid = await request(app)
      .post(`/api/persistent/datasets/${DATASET_ID}/uploads`)
      .set('Cookie', COOKIE)
      .set('Active-Organization', ORGANIZATION_ID)
      .send({
        originalFilename: 'bad\u0000.csv',
        displayFilename: 'bad.csv',
        declaredContentType: 'text/csv',
        byteSize: 120,
        clientChecksumSha256: 'a'.repeat(64),
        idempotencyKey: 'control-upload',
      });

    expect(valid.status).toBe(201);
    expect((persistence.calls[0].body as Record<string, unknown>).displayFilename).toBe('_.csv');
    expect(invalid.status).toBe(400);
    expect(persistence.calls).toHaveLength(1);
  });

  it('loads canonical evidence server-side and persists deterministic reasoning output', async () => {
    const serverConfig = config();
    const persistence = new FakePersistenceClient(serverConfig, reasoningResponder);
    const deterministicOutput = generateDeterministicReasoning(packet);
    const provider = vi.fn(async (_input: ReasoningRequest) => ({
      success: true as const,
      output: deterministicOutput,
      fallbackUsed: false,
    }));
    const response = await request(createApp({
      config: serverConfig,
      sessionManager: verifiedSessionManager(),
      persistenceClient: persistence,
      quotaService: allowedQuotaService(),
      reasoningHandler: provider,
      logger: () => undefined,
    }))
      .post('/api/persistent/reasoning')
      .set('Cookie', COOKIE)
      .set('Active-Organization', ORGANIZATION_ID)
      .send({
        projectId: PROJECT_ID,
        datasetId: DATASET_ID,
        evidenceSnapshotId: EVIDENCE_ID,
        provider: 'deterministic',
        idempotencyKey: 'deterministic-run',
      });

    expect(
      response.status,
      JSON.stringify({ body: response.body, calls: persistence.calls }, null, 2),
    ).toBe(201);
    expect(provider).toHaveBeenCalledTimes(1);
    expect(provider.mock.calls[0][0].packet.datasetId).toBe(DATASET_ID);
    expect(persistence.calls.map((call) => call.path)).toEqual([
      `/internal/phase2f/evidence/${EVIDENCE_ID}`,
      '/internal/phase2f/reasoning',
      `/internal/phase2f/reasoning/${RUN_ID}/complete`,
    ]);
    const completion = persistence.calls[2].body as Record<string, unknown>;
    expect(completion.quotaClassification).toBe('not_required');
    expect(completion.fallbackUsed).toBe(false);
  });

  it('rejects browser-supplied evidence packets instead of reasoning over them', async () => {
    const serverConfig = config();
    const persistence = new FakePersistenceClient(serverConfig, reasoningResponder);
    const provider = vi.fn();
    const response = await request(createApp({
      config: serverConfig,
      sessionManager: verifiedSessionManager(),
      persistenceClient: persistence,
      reasoningHandler: provider,
      logger: () => undefined,
    }))
      .post('/api/persistent/reasoning')
      .set('Cookie', COOKIE)
      .set('Active-Organization', ORGANIZATION_ID)
      .send({
        projectId: PROJECT_ID,
        datasetId: DATASET_ID,
        evidenceSnapshotId: EVIDENCE_ID,
        provider: 'deterministic',
        packet,
      });

    expect(response.status).toBe(400);
    expect(provider).not.toHaveBeenCalled();
    expect(persistence.calls).toHaveLength(0);
  });

  it.each([
    ['quota rejection', exceededQuotaService, 429, 'rejected'],
    ['quota-store failure', unavailableQuotaService, 503, 'unavailable'],
  ] as const)(
    'fails closed before Gemini invocation on %s',
    async (_label, quotaFactory, expectedStatus, expectedClassification) => {
      const serverConfig = config();
      let completionBody: Record<string, unknown> | undefined;
      const persistence = new FakePersistenceClient(serverConfig, (call) => {
        if (call.method === 'GET') {
          return {
            id: EVIDENCE_ID,
            projectId: PROJECT_ID,
            datasetId: DATASET_ID,
            status: 'ready',
            content: { evidencePacket: packet },
          };
        }
        if (call.path === '/internal/phase2f/reasoning') {
          return { id: RUN_ID, status: 'running', created: true };
        }
        completionBody = call.body as Record<string, unknown>;
        return { id: RUN_ID, ...completionBody };
      });
      const provider = vi.fn();
      const response = await request(createApp({
        config: serverConfig,
        sessionManager: verifiedSessionManager(),
        persistenceClient: persistence,
        quotaService: quotaFactory(),
        reasoningHandler: provider,
        logger: () => undefined,
      }))
        .post('/api/persistent/reasoning')
        .set('Cookie', COOKIE)
        .set('Active-Organization', ORGANIZATION_ID)
        .send({
          projectId: PROJECT_ID,
          datasetId: DATASET_ID,
          evidenceSnapshotId: EVIDENCE_ID,
          provider: 'gemini-2.5-flash',
          idempotencyKey: `gemini-${expectedClassification}`,
        });

      expect(response.status).toBe(expectedStatus);
      expect(provider).not.toHaveBeenCalled();
      expect(completionBody).toMatchObject({
        status: 'failed',
        quotaClassification: expectedClassification,
      });
    },
  );

  it('persists the existing provider-error deterministic fallback classification', async () => {
    const serverConfig = config();
    let completionBody: Record<string, unknown> | undefined;
    const persistence = new FakePersistenceClient(serverConfig, (call) => {
      if (call.method === 'GET') {
        return {
          id: EVIDENCE_ID,
          projectId: PROJECT_ID,
          datasetId: DATASET_ID,
          status: 'ready',
          content: { evidencePacket: packet },
        };
      }
      if (call.path === '/internal/phase2f/reasoning') {
        return { id: RUN_ID, status: 'running', created: true };
      }
      completionBody = call.body as Record<string, unknown>;
      return { id: RUN_ID, ...completionBody };
    });
    const fallbackOutput = generateDeterministicReasoning(packet);
    const provider = vi.fn(async () => ({
      success: true as const,
      output: fallbackOutput,
      fallbackUsed: true,
    }));
    const response = await request(createApp({
      config: serverConfig,
      sessionManager: verifiedSessionManager(),
      persistenceClient: persistence,
      quotaService: allowedQuotaService(),
      reasoningHandler: provider,
      logger: () => undefined,
    }))
      .post('/api/persistent/reasoning')
      .set('Cookie', COOKIE)
      .set('Active-Organization', ORGANIZATION_ID)
      .send({
        projectId: PROJECT_ID,
        datasetId: DATASET_ID,
        evidenceSnapshotId: EVIDENCE_ID,
        provider: 'gemini-2.5-flash',
        idempotencyKey: 'gemini-provider-error-fallback',
      });

    expect(response.status).toBe(201);
    expect(completionBody).toMatchObject({
      status: 'fallback',
      fallbackUsed: true,
      quotaClassification: 'allowed',
    });
  });

  it('completes the mocked persistent XRD slice, recovers after refresh, and rejects another tenant', async () => {
    const serverConfig = config();
    const uploadId = '66666666-6666-4666-8666-666666666666';
    const objectId = '77777777-7777-4777-8777-777777777777';
    const deterministicRunId = '88888888-8888-4888-8888-888888888888';
    const geminiRunId = '99999999-9999-4999-8999-999999999999';
    const notebookId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const otherOrganizationId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const completedRuns: Record<string, unknown>[] = [];
    const notebookReferences: Record<string, unknown>[] = [];
    let reasoningStarts = 0;
    let uploadedBytes = 0;
    let finalized = false;

    const persistentDataset = {
      id: DATASET_ID,
      organizationId: ORGANIZATION_ID,
      projectId: PROJECT_ID,
      title: 'Mocked complete XRD',
      technique: 'xrd',
      displayFilename: 'sample.xy',
      declaredContentType: 'text/plain',
      byteSize: 120,
      clientChecksumSha256: 'a'.repeat(64),
      datasetStatus: 'valid',
      evidenceStatus: 'ready',
      failureCode: null,
      originalObjectId: objectId,
      currentEvidenceId: EVIDENCE_ID,
      measurementMetadata: { radiation: 'Cu K-alpha' },
      processingParameters: { smoothing: { method: 'savitzky_golay' } },
      experimentContext: { atmosphere: 'air' },
      createdAt: '2026-07-28T00:00:00.000Z',
      updatedAt: '2026-07-28T00:00:01.000Z',
      latestUpload: { id: uploadId, sessionStatus: 'finalized' },
      latestValidation: { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', status: 'passed' },
      evidence: {
        id: EVIDENCE_ID,
        version: 1,
        status: 'ready',
        contentSha256: 'a'.repeat(64),
        schemaVersion: 'phase2f-xrd-evidence-v1',
        processorVersion: 'test',
        validationWarnings: [],
        scientificLimitations: ['XRD does not independently establish composition.'],
        createdAt: '2026-07-28T00:00:01.000Z',
      },
    };

    const persistence = new FakePersistenceClient(serverConfig, (call) => {
      if (call.organizationId && call.organizationId !== ORGANIZATION_ID) {
        throw new HttpError(403, 'Organization access denied', 'ORGANIZATION_ACCESS_DENIED');
      }
      if (call.method === 'POST' && call.path === '/internal/phase2f/projects') {
        return {
          id: PROJECT_ID,
          organizationId: ORGANIZATION_ID,
          ownerUserId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          title: 'Mocked project',
          status: 'active',
          createdAt: '2026-07-28T00:00:00.000Z',
          updatedAt: '2026-07-28T00:00:00.000Z',
        };
      }
      if (call.method === 'POST' && call.path === `/internal/phase2f/projects/${PROJECT_ID}/datasets`) {
        return { ...persistentDataset, datasetStatus: 'allocated', evidenceStatus: 'unavailable', evidence: null };
      }
      if (call.method === 'POST' && call.path === `/internal/phase2f/datasets/${DATASET_ID}/uploads`) {
        return {
          datasetId: DATASET_ID,
          uploadId,
          uploadUrl: `/api/persistent/uploads/${uploadId}/content`,
          uploadStatus: 'created',
          validationStatus: 'pending',
        };
      }
      if (call.method === 'PUT' && call.path === `/internal/phase2f/uploads/${uploadId}/content`) {
        uploadedBytes = Buffer.isBuffer(call.body) ? call.body.length : 0;
        return { uploadId, byteSize: uploadedBytes, serverChecksumSha256: 'a'.repeat(64), uploadStatus: 'uploaded' };
      }
      if (call.method === 'POST' && call.path === `/internal/phase2f/uploads/${uploadId}/finalize`) {
        finalized = true;
        return {
          datasetId: DATASET_ID,
          uploadId,
          originalObjectId: objectId,
          uploadStatus: 'finalized',
          validationStatus: 'pending',
        };
      }
      if (call.method === 'GET' && call.path === `/internal/phase2f/datasets/${DATASET_ID}`) {
        return persistentDataset;
      }
      if (call.method === 'GET' && call.path === `/internal/phase2f/evidence/${EVIDENCE_ID}`) {
        return {
          id: EVIDENCE_ID,
          projectId: PROJECT_ID,
          datasetId: DATASET_ID,
          status: 'ready',
          content: { evidencePacket: packet },
        };
      }
      if (call.method === 'POST' && call.path === '/internal/phase2f/reasoning') {
        const id = reasoningStarts++ === 0 ? deterministicRunId : geminiRunId;
        return { id, status: 'running', created: true };
      }
      if (call.method === 'POST' && call.path.endsWith('/complete')) {
        const id = call.path.includes(deterministicRunId) ? deterministicRunId : geminiRunId;
        const completion = call.body as Record<string, unknown>;
        const run = {
          id,
          organizationId: ORGANIZATION_ID,
          projectId: PROJECT_ID,
          projectTitle: 'Mocked project',
          datasetId: DATASET_ID,
          datasetTitle: persistentDataset.title,
          evidenceSnapshotId: EVIDENCE_ID,
          evidenceContentSha256: 'a'.repeat(64),
          executionMode: id === deterministicRunId ? 'deterministic' : 'configured_gemini',
          status: completion.status,
          provider: id === deterministicRunId ? 'deterministic' : 'gemini-2.5-flash',
          model: id === deterministicRunId ? null : 'gemini-2.5-flash',
          promptVersion: 'phase2f-xrd-v1',
          policyVersion: 'phase2e-provider-policy-v1',
          structuredOutput: completion.structuredOutput,
          fallbackUsed: completion.fallbackUsed,
          quotaClassification: completion.quotaClassification,
          requestId: 'mocked-request',
          failureCode: null,
          failureMessage: null,
          createdAt: '2026-07-28T00:00:02.000Z',
          completedAt: '2026-07-28T00:00:03.000Z',
        };
        completedRuns.push(run);
        return run;
      }
      if (call.method === 'GET' && call.path.startsWith('/internal/phase2f/history?')) {
        return { items: [...completedRuns].reverse(), nextCursor: null, hasMore: false };
      }
      if (call.method === 'POST' && call.path === '/internal/phase2f/notebook-references') {
        const body = call.body as Record<string, unknown>;
        const reference = {
          id: notebookId,
          organizationId: ORGANIZATION_ID,
          projectId: PROJECT_ID,
          projectTitle: 'Mocked project',
          datasetId: DATASET_ID,
          datasetTitle: persistentDataset.title,
          evidenceSnapshotId: EVIDENCE_ID,
          reasoningRunId: body.reasoningRunId,
          reasoningStatus: 'succeeded',
          provider: 'gemini-2.5-flash',
          label: body.label,
          createdAt: '2026-07-28T00:00:04.000Z',
        };
        notebookReferences.push(reference);
        return reference;
      }
      if (call.method === 'GET' && call.path === '/internal/phase2f/notebook-references') {
        return { items: notebookReferences };
      }
      throw new Error(`Unexpected complete-slice call: ${call.method} ${call.path}`);
    });
    const baseOutput = generateDeterministicReasoning(packet);
    const provider = vi.fn(async (input: ReasoningRequest) => ({
      success: true as const,
      output: input.provider === 'deterministic'
        ? baseOutput
        : {
            ...baseOutput,
            metadata: {
              ...baseOutput.metadata,
              provider: 'gemini-2.5-flash' as const,
              model: 'gemini-2.5-flash',
            },
          },
      fallbackUsed: false,
    }));
    const createServer = () => createApp({
      config: serverConfig,
      sessionManager: verifiedSessionManager(),
      persistenceClient: persistence,
      quotaService: allowedQuotaService(),
      reasoningHandler: provider,
      logger: () => undefined,
    });
    const app = createServer();
    const authenticated = (verb: 'get' | 'post' | 'put', path: string) => (
      request(app)[verb](path)
        .set('Cookie', COOKIE)
        .set('Active-Organization', ORGANIZATION_ID)
    );

    const projectResponse = await authenticated('post', '/api/persistent/projects')
      .send({ title: 'Mocked project' });
    const datasetResponse = await authenticated('post', `/api/persistent/projects/${PROJECT_ID}/datasets`)
      .send({
        title: persistentDataset.title,
        measurementMetadata: persistentDataset.measurementMetadata,
        processingParameters: persistentDataset.processingParameters,
        experimentContext: persistentDataset.experimentContext,
      });
    const intentResponse = await authenticated('post', `/api/persistent/datasets/${DATASET_ID}/uploads`)
      .send({
        originalFilename: 'sample.xy',
        displayFilename: 'sample.xy',
        declaredContentType: 'text/plain',
        byteSize: 18,
        clientChecksumSha256: 'a'.repeat(64),
        idempotencyKey: 'complete-slice-upload',
      });
    const uploadResponse = await authenticated('put', `/api/persistent/uploads/${uploadId}/content`)
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.from('10 1\n11 2\n12 3\n', 'utf8'));
    const finalizeResponse = await authenticated('post', `/api/persistent/uploads/${uploadId}/finalize`)
      .send({});
    const deterministicResponse = await authenticated('post', '/api/persistent/reasoning')
      .send({
        projectId: PROJECT_ID,
        datasetId: DATASET_ID,
        evidenceSnapshotId: EVIDENCE_ID,
        provider: 'deterministic',
        idempotencyKey: 'complete-slice-deterministic',
      });
    const geminiResponse = await authenticated('post', '/api/persistent/reasoning')
      .send({
        projectId: PROJECT_ID,
        datasetId: DATASET_ID,
        evidenceSnapshotId: EVIDENCE_ID,
        provider: 'gemini-2.5-flash',
        idempotencyKey: 'complete-slice-gemini',
      });
    const historyResponse = await authenticated('get', `/api/persistent/history?projectId=${PROJECT_ID}`);
    const notebookResponse = await authenticated('post', '/api/persistent/notebook-references')
      .send({ reasoningRunId: geminiRunId, label: 'Persistent Gemini decision' });

    expect([
      projectResponse.status,
      datasetResponse.status,
      intentResponse.status,
      uploadResponse.status,
      finalizeResponse.status,
      deterministicResponse.status,
      geminiResponse.status,
      historyResponse.status,
      notebookResponse.status,
    ]).toEqual([201, 201, 201, 200, 200, 201, 201, 200, 201]);
    expect(uploadedBytes).toBeGreaterThan(0);
    expect(finalized).toBe(true);
    expect(completedRuns).toHaveLength(2);
    expect(completedRuns.map((run) => run.quotaClassification)).toEqual(['not_required', 'allowed']);
    expect(historyResponse.body.items).toHaveLength(2);
    expect(notebookReferences).toHaveLength(1);

    const refreshedApp = createServer();
    const refreshedDataset = await request(refreshedApp)
      .get(`/api/persistent/datasets/${DATASET_ID}`)
      .set('Cookie', COOKIE)
      .set('Active-Organization', ORGANIZATION_ID);
    const refreshedHistory = await request(refreshedApp)
      .get(`/api/persistent/history?datasetId=${DATASET_ID}`)
      .set('Cookie', COOKIE)
      .set('Active-Organization', ORGANIZATION_ID);
    const refreshedNotebook = await request(refreshedApp)
      .get('/api/persistent/notebook-references')
      .set('Cookie', COOKIE)
      .set('Active-Organization', ORGANIZATION_ID);
    const crossTenant = await request(refreshedApp)
      .get(`/api/persistent/datasets/${DATASET_ID}`)
      .set('Cookie', COOKIE)
      .set('Active-Organization', otherOrganizationId);

    expect(refreshedDataset.body.currentEvidenceId).toBe(EVIDENCE_ID);
    expect(refreshedHistory.body.items).toHaveLength(2);
    expect(refreshedNotebook.body.items).toHaveLength(1);
    expect(crossTenant.status).toBe(403);
  });
});
