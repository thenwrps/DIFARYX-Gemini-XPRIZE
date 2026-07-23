import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type {
  AgentEvidencePacket,
  ReasoningRequest,
} from '../../src/agent/mcp/types';
import { generateDeterministicReasoning } from '../../src/services/api/deterministicReasoning';
import { createApp } from '../app';
import type { GoogleIdentityVerifier } from '../auth/types';
import { loadServerConfig } from '../config';
import type {
  GeminiQuotaDecision,
  GeminiQuotaService,
} from '../quota/types';

const packet: AgentEvidencePacket = {
  context: 'xrd',
  datasetId: 'quota-integration-dataset',
  datasetName: 'synthetic-public-data.csv',
  materialSystem: 'synthetic test material',
  signalSummary: { featureCount: 1, signalQuality: 'medium' },
  detectedFeatures: [{ position: 10, intensity: 100, confidence: 0.8 }],
  candidates: [{
    label: 'Candidate A',
    score: 0.8,
    matchedFeatures: 1,
    totalFeatures: 1,
    missingFeatures: [],
    unexplainedFeatures: [],
  }],
  fusedScore: 0.8,
  uncertaintyFlags: [],
  processingNotes: [],
  toolTrace: [],
};

function productionConfig(overrides: NodeJS.ProcessEnv = {}) {
  return loadServerConfig({
    NODE_ENV: 'production',
    ALLOWED_ORIGINS: 'https://app.example.test',
    GEMINI_PROVIDER_MODE: 'developer',
    GEMINI_API_KEY: 'synthetic-provider-key',
    GEMINI_MODEL: 'gemini-2.5-flash',
    GOOGLE_OAUTH_CLIENT_ID: 'synthetic-client-id',
    UPSTASH_REDIS_REST_URL: 'https://synthetic-quota.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'synthetic-rest-token',
    QUOTA_ID_HASH_SECRET: 'synthetic-independent-hmac-secret',
    GEMINI_GLOBAL_DAILY_LIMIT: '100',
    ...overrides,
  });
}

function verifiedIdentityVerifier(
  subject = 'canonical-verified-google-subject',
): GoogleIdentityVerifier {
  return {
    configured: true,
    verifyIdentityToken: vi.fn(async () => ({
      provider: 'google' as const,
      subject,
    })),
  };
}

function quotaService(decision: GeminiQuotaDecision): GeminiQuotaService {
  return {
    consume: vi.fn(async () => decision),
  };
}

function allowedDecision(): GeminiQuotaDecision {
  return {
    status: 'allowed',
    counters: [
      {
        dimension: 'user_burst',
        limit: 2,
        remaining: 1,
        resetAt: '2026-07-23T12:35:00.000Z',
        retryAfterSeconds: 30,
      },
      {
        dimension: 'user_daily',
        limit: 5,
        remaining: 4,
        resetAt: '2026-07-24T00:00:00.000Z',
        retryAfterSeconds: 41_000,
      },
      {
        dimension: 'global_daily',
        limit: 100,
        remaining: 99,
        resetAt: '2026-07-24T00:00:00.000Z',
        retryAfterSeconds: 41_000,
      },
    ],
  };
}

function exceededDecision(
  dimension: 'user_burst' | 'user_daily' | 'global_daily',
): GeminiQuotaDecision {
  return {
    status: dimension === 'user_burst'
      ? 'user_burst_exceeded'
      : dimension === 'user_daily'
        ? 'user_daily_exceeded'
        : 'global_daily_exceeded',
    dimension,
    limit: dimension === 'user_burst' ? 2 : dimension === 'user_daily' ? 5 : 100,
    remaining: 0,
    resetAt: dimension === 'user_burst'
      ? '2026-07-23T12:35:00.000Z'
      : '2026-07-24T00:00:00.000Z',
    retryAfterSeconds: dimension === 'user_burst' ? 30 : 41_000,
  };
}

function successfulReasoningHandler() {
  return vi.fn(async (
    _request: ReasoningRequest,
    _context: unknown,
  ) => ({
    success: true as const,
    output: generateDeterministicReasoning(packet),
    fallbackUsed: true,
  }));
}

describe('Gemini quota route enforcement', () => {
  it('returns 401 before quota or provider calls for unauthenticated Gemini', async () => {
    const quota = quotaService(allowedDecision());
    const provider = successfulReasoningHandler();
    const response = await request(createApp({
      config: productionConfig(),
      identityVerifier: verifiedIdentityVerifier(),
      quotaService: quota,
      reasoningHandler: provider,
      logger: () => undefined,
    }))
      .post('/api/reasoning')
      .send({ packet, provider: 'gemini-2.5-flash' });

    expect(response.status).toBe(401);
    expect(quota.consume).not.toHaveBeenCalled();
    expect(provider).not.toHaveBeenCalled();
  });

  it('returns quota-related 503 without a provider call when configuration is invalid', async () => {
    const quota = quotaService(allowedDecision());
    const provider = successfulReasoningHandler();
    const response = await request(createApp({
      config: productionConfig({ GEMINI_GLOBAL_DAILY_LIMIT: undefined }),
      identityVerifier: verifiedIdentityVerifier(),
      quotaService: quota,
      reasoningHandler: provider,
      logger: () => undefined,
    }))
      .post('/api/reasoning')
      .set('Authorization', 'Bearer synthetic-identity-credential')
      .send({ packet, provider: 'gemini-2.5-flash' });

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      success: false,
      error: 'Gemini quota service unavailable',
      errorCode: 'GEMINI_QUOTA_UNAVAILABLE',
    });
    expect(quota.consume).not.toHaveBeenCalled();
    expect(provider).not.toHaveBeenCalled();
  });

  it('returns quota-related 503 without a provider call when the store is unavailable', async () => {
    const quota = quotaService({ status: 'unavailable' });
    const provider = successfulReasoningHandler();
    const response = await request(createApp({
      config: productionConfig(),
      identityVerifier: verifiedIdentityVerifier(),
      quotaService: quota,
      reasoningHandler: provider,
      logger: () => undefined,
    }))
      .post('/api/reasoning')
      .set('Authorization', 'Bearer synthetic-identity-credential')
      .send({ packet, provider: 'gemini-2.5-flash' });

    expect(response.status).toBe(503);
    expect(response.body.errorCode).toBe('GEMINI_QUOTA_UNAVAILABLE');
    expect(quota.consume).toHaveBeenCalledOnce();
    expect(provider).not.toHaveBeenCalled();
  });

  it.each([
    'user_burst',
    'user_daily',
    'global_daily',
  ] as const)('returns 429 for exhausted %s quota without invoking Gemini', async (dimension) => {
    const quota = quotaService(exceededDecision(dimension));
    const provider = successfulReasoningHandler();
    const response = await request(createApp({
      config: productionConfig(),
      identityVerifier: verifiedIdentityVerifier(),
      quotaService: quota,
      reasoningHandler: provider,
      logger: () => undefined,
    }))
      .post('/api/reasoning')
      .set('Authorization', 'Bearer synthetic-identity-credential')
      .send({ packet, provider: 'gemini-2.5-flash' });

    expect(response.status).toBe(429);
    expect(response.headers['retry-after']).toBe(
      String(dimension === 'user_burst' ? 30 : 41_000),
    );
    expect(response.body).toMatchObject({
      success: false,
      errorCode: 'GEMINI_QUOTA_EXCEEDED',
      quota: {
        dimension,
        retryAfterSeconds: dimension === 'user_burst' ? 30 : 41_000,
      },
    });
    expect(response.body.quota).not.toHaveProperty('limit');
    expect(response.body.quota).not.toHaveProperty('remaining');
    expect(provider).not.toHaveBeenCalled();
  });

  it('invokes the Gemini reasoning boundary exactly once after an allowed decision', async () => {
    const quota = quotaService(allowedDecision());
    const provider = successfulReasoningHandler();
    const response = await request(createApp({
      config: productionConfig(),
      identityVerifier: verifiedIdentityVerifier(),
      quotaService: quota,
      reasoningHandler: provider,
      logger: () => undefined,
    }))
      .post('/api/reasoning')
      .set('Authorization', 'Bearer synthetic-identity-credential')
      .send({ packet, provider: 'gemini-2.5-flash' });

    expect(response.status).toBe(200);
    expect(quota.consume).toHaveBeenCalledOnce();
    expect(provider).toHaveBeenCalledOnce();
    expect(provider.mock.calls[0][1]).toMatchObject({
      geminiQuotaConsumed: true,
      executionPolicy: { mode: 'real_gemini' },
    });
  });

  it('preserves deterministic provider fallback after quota was consumed', async () => {
    const quota = quotaService(allowedDecision());
    const provider = successfulReasoningHandler();
    const response = await request(createApp({
      config: productionConfig(),
      identityVerifier: verifiedIdentityVerifier(),
      quotaService: quota,
      reasoningHandler: provider,
      logger: () => undefined,
    }))
      .post('/api/reasoning')
      .set('Authorization', 'Bearer synthetic-identity-credential')
      .send({ packet, provider: 'gemini-2.5-flash' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      fallbackUsed: true,
      output: { metadata: { provider: 'deterministic' } },
    });
    expect(quota.consume).toHaveBeenCalledOnce();
    expect(provider).toHaveBeenCalledOnce();
  });

  it('keeps deterministic execution public and quota-free', async () => {
    const verifier = verifiedIdentityVerifier();
    const quota = quotaService({ status: 'unavailable' });
    const response = await request(createApp({
      config: productionConfig({ GEMINI_GLOBAL_DAILY_LIMIT: undefined }),
      identityVerifier: verifier,
      quotaService: quota,
      logger: () => undefined,
    }))
      .post('/api/reasoning')
      .send({
        packet,
        provider: 'deterministic',
        subject: 'browser-supplied-subject',
      });

    expect(response.status).toBe(200);
    expect(response.body.output.metadata.provider).toBe('deterministic');
    expect(verifier.verifyIdentityToken).not.toHaveBeenCalled();
    expect(quota.consume).not.toHaveBeenCalled();
  });

  it.each([
    ['/api/reasoning', { packet, provider: 'gemini-2.5-flash' }],
    ['/api/llm/reason', { packet, modelMode: 'gemini' }],
  ])('enforces the same quota policy on %s', async (path, body) => {
    const quota = quotaService({ status: 'unavailable' });
    const provider = successfulReasoningHandler();
    const response = await request(createApp({
      config: productionConfig(),
      identityVerifier: verifiedIdentityVerifier(),
      quotaService: quota,
      reasoningHandler: provider,
      logger: () => undefined,
    }))
      .post(path)
      .set('Authorization', 'Bearer synthetic-identity-credential')
      .send(body);

    expect(response.status).toBe(503);
    expect(provider).not.toHaveBeenCalled();
  });

  it('keeps health and OPTIONS public and quota-free', async () => {
    const verifier = verifiedIdentityVerifier();
    const quota = quotaService({ status: 'unavailable' });
    const app = createApp({
      config: productionConfig(),
      identityVerifier: verifier,
      quotaService: quota,
      logger: () => undefined,
    });

    const [health, preflight] = await Promise.all([
      request(app).get('/api/health'),
      request(app)
        .options('/api/reasoning')
        .set('Origin', 'https://app.example.test')
        .set('Access-Control-Request-Method', 'POST'),
    ]);

    expect(health.status).toBe(200);
    expect(preflight.status).toBe(204);
    expect(verifier.verifyIdentityToken).not.toHaveBeenCalled();
    expect(quota.consume).not.toHaveBeenCalled();
  });

  it('uses only the verifier subject and excludes secrets and identity from responses and logs', async () => {
    const rawSubject = 'canonical-sensitive-google-subject';
    const browserSubject = 'browser-supplied-subject';
    const identityCredential = 'synthetic-sensitive-identity-credential';
    const entries: Record<string, unknown>[] = [];
    const quota = quotaService(exceededDecision('user_burst'));
    const response = await request(createApp({
      config: productionConfig(),
      identityVerifier: verifiedIdentityVerifier(rawSubject),
      quotaService: quota,
      logger: (entry) => entries.push(entry),
    }))
      .post('/api/reasoning')
      .set('Authorization', `Bearer ${identityCredential}`)
      .send({
        packet,
        provider: 'gemini-2.5-flash',
        subject: browserSubject,
        email: 'browser@example.invalid',
      });

    expect(quota.consume).toHaveBeenCalledWith(rawSubject);
    const serialized = JSON.stringify({ body: response.body, entries });
    for (const sensitive of [
      rawSubject,
      browserSubject,
      identityCredential,
      'synthetic-rest-token',
      'synthetic-independent-hmac-secret',
      'synthetic-quota.upstash.io',
      'browser@example.invalid',
    ]) {
      expect(serialized).not.toContain(sensitive);
    }
  });
});
