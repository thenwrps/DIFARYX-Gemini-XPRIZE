import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type { AgentEvidencePacket } from '../../src/agent/mcp/types';
import { generateDeterministicReasoning } from '../../src/services/api/deterministicReasoning';
import { createApp } from '../app';
import { createGoogleIdentityVerifier } from '../auth/googleIdentityVerifier';
import {
  IdentityVerificationError,
  type GoogleIdentityVerifier,
} from '../auth/types';
import { loadServerConfig } from '../config';
import type { GeminiQuotaService } from '../quota/types';

const packet: AgentEvidencePacket = {
  context: 'xrd',
  datasetId: 'identity-test-dataset',
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

function productionConfig(includeClientId = true) {
  return loadServerConfig({
    NODE_ENV: 'production',
    ALLOWED_ORIGINS: 'https://app.example.test',
    GEMINI_PROVIDER_MODE: 'developer',
    GEMINI_API_KEY: 'test-only-placeholder',
    GEMINI_MODEL: 'gemini-2.5-flash',
    GOOGLE_OAUTH_CLIENT_ID: includeClientId ? 'synthetic-client-id' : undefined,
    UPSTASH_REDIS_REST_URL: 'https://synthetic-quota.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'synthetic-rest-token',
    QUOTA_ID_HASH_SECRET: 'synthetic-independent-hmac-secret',
    GEMINI_GLOBAL_DAILY_LIMIT: '100',
  });
}

function verifiedIdentityVerifier(subject = 'verified-google-subject'): GoogleIdentityVerifier {
  return {
    configured: true,
    verifyIdentityToken: vi.fn(async () => ({
      provider: 'google' as const,
      subject,
    })),
  };
}

function rejectedIdentityVerifier(): GoogleIdentityVerifier {
  return {
    configured: true,
    verifyIdentityToken: vi.fn(async () => {
      throw new IdentityVerificationError('invalid');
    }),
  };
}

function allowedQuotaService(): GeminiQuotaService {
  return {
    consume: vi.fn(async () => ({
      status: 'allowed' as const,
      counters: [
        {
          dimension: 'user_burst' as const,
          limit: 2,
          remaining: 1,
          resetAt: '2026-07-23T12:35:00.000Z',
          retryAfterSeconds: 30,
        },
        {
          dimension: 'user_daily' as const,
          limit: 5,
          remaining: 4,
          resetAt: '2026-07-24T00:00:00.000Z',
          retryAfterSeconds: 41_000,
        },
        {
          dimension: 'global_daily' as const,
          limit: 100,
          remaining: 99,
          resetAt: '2026-07-24T00:00:00.000Z',
          retryAfterSeconds: 41_000,
        },
      ] as const,
    })),
  };
}

describe('Google identity protection for Gemini execution', () => {
  it('returns 401 when a Gemini request has no Authorization header', async () => {
    const response = await request(createApp({
      config: productionConfig(),
      identityVerifier: verifiedIdentityVerifier(),
      logger: () => undefined,
    }))
      .post('/api/reasoning')
      .send({ packet, provider: 'gemini-2.5-flash' });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Authentication required');
  });

  it('returns 401 for malformed Bearer syntax', async () => {
    const response = await request(createApp({
      config: productionConfig(),
      identityVerifier: verifiedIdentityVerifier(),
      logger: () => undefined,
    }))
      .post('/api/reasoning')
      .set('Authorization', 'Basic synthetic-credential')
      .send({ packet, provider: 'gemini-2.5-flash' });

    expect(response.status).toBe(401);
  });

  it.each(['invalid', 'expired', 'wrong-audience'])(
    'returns 401 for an %s identity credential',
    async () => {
      const response = await request(createApp({
        config: productionConfig(),
        identityVerifier: rejectedIdentityVerifier(),
        logger: () => undefined,
      }))
        .post('/api/reasoning')
        .set('Authorization', 'Bearer synthetic-invalid-credential')
        .send({ packet, provider: 'gemini-2.5-flash' });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Authentication required');
    },
  );

  it('passes only the verified subject to the Gemini reasoning boundary', async () => {
    const reasoningHandler = vi.fn(async (_reasoningRequest, context) => ({
      success: true as const,
      output: generateDeterministicReasoning(packet),
      fallbackUsed: true,
      context,
    }));
    const response = await request(createApp({
      config: productionConfig(),
      identityVerifier: verifiedIdentityVerifier('canonical-verified-subject'),
      quotaService: allowedQuotaService(),
      reasoningHandler,
      logger: () => undefined,
    }))
      .post('/api/reasoning')
      .set('Authorization', 'Bearer synthetic-valid-credential')
      .send({
        packet,
        provider: 'gemini-2.5-flash',
        email: 'browser-claim@example.invalid',
        subject: 'browser-supplied-subject',
      });

    expect(response.status).toBe(200);
    expect(reasoningHandler).toHaveBeenCalledOnce();
    expect(reasoningHandler.mock.calls[0][1]).toMatchObject({
      identity: {
        provider: 'google',
        subject: 'canonical-verified-subject',
      },
      geminiQuotaConsumed: true,
    });
  });

  it('keeps deterministic reasoning public and does not invoke the verifier', async () => {
    const verifier = verifiedIdentityVerifier();
    const response = await request(createApp({
      config: productionConfig(),
      identityVerifier: verifier,
      logger: () => undefined,
    }))
      .post('/api/reasoning')
      .send({ packet, provider: 'deterministic' });

    expect(response.status).toBe(200);
    expect(verifier.verifyIdentityToken).not.toHaveBeenCalled();
    expect(response.body.output.metadata.provider).toBe('deterministic');
  });

  it('protects the legacy Gemini endpoint contract too', async () => {
    const response = await request(createApp({
      config: productionConfig(),
      identityVerifier: verifiedIdentityVerifier(),
      logger: () => undefined,
    }))
      .post('/api/llm/reason')
      .send({ packet, modelMode: 'gemini' });

    expect(response.status).toBe(401);
  });

  it('allows CORS preflight without authentication', async () => {
    const response = await request(createApp({
      config: productionConfig(),
      identityVerifier: verifiedIdentityVerifier(),
      logger: () => undefined,
    }))
      .options('/api/reasoning')
      .set('Origin', 'https://app.example.test')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'authorization,content-type');

    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('https://app.example.test');
  });

  it('fails closed when the verifier client ID is not configured', async () => {
    const response = await request(createApp({
      config: productionConfig(false),
      logger: () => undefined,
    }))
      .post('/api/reasoning')
      .set('Authorization', 'Bearer synthetic-credential')
      .send({ packet, provider: 'gemini-2.5-flash' });

    expect(response.status).toBe(503);
    expect(response.body.error).toBe('Identity verification unavailable');
  });

  it('does not expose a rejected credential in logs or responses', async () => {
    const entries: Record<string, unknown>[] = [];
    const credential = 'synthetic-sensitive-credential';
    const response = await request(createApp({
      config: productionConfig(),
      identityVerifier: rejectedIdentityVerifier(),
      logger: (entry) => entries.push(entry),
    }))
      .post('/api/reasoning')
      .set('Authorization', `Bearer ${credential}`)
      .send({ packet, provider: 'gemini-2.5-flash' });

    const serialized = JSON.stringify({ body: response.body, entries });
    expect(serialized).not.toContain(credential);
    expect(serialized).not.toContain('Authorization');
  });
});

describe('Google identity verifier', () => {
  it('uses the configured audience and returns only the stable subject', async () => {
    const verifyIdToken = vi.fn(async () => ({
      getPayload: () => ({
        iss: 'https://accounts.google.com',
        sub: 'stable-google-subject',
        exp: 2_000_000_000,
        email: 'ignored@example.invalid',
      }),
    }));
    const verifier = createGoogleIdentityVerifier({
      clientId: 'expected-client-id',
      client: { verifyIdToken },
      now: () => 1_900_000_000_000,
    });

    await expect(verifier.verifyIdentityToken('synthetic-credential')).resolves.toEqual({
      provider: 'google',
      subject: 'stable-google-subject',
    });
    expect(verifyIdToken).toHaveBeenCalledWith({
      idToken: 'synthetic-credential',
      audience: 'expected-client-id',
    });
  });

  it('rejects an expired payload after library verification', async () => {
    const verifier = createGoogleIdentityVerifier({
      clientId: 'expected-client-id',
      client: {
        verifyIdToken: async () => ({
          getPayload: () => ({
            iss: 'accounts.google.com',
            sub: 'stable-google-subject',
            exp: 100,
          }),
        }),
      },
      now: () => 101_000,
    });

    await expect(verifier.verifyIdentityToken('synthetic-credential'))
      .rejects.toMatchObject({ category: 'invalid' });
  });
});
