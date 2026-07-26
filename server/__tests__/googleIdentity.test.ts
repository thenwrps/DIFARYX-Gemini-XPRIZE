import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type { AgentEvidencePacket } from '../../src/agent/mcp/types';
import { generateDeterministicReasoning } from '../../src/services/api/deterministicReasoning';
import { createApp } from '../app';
import { createGoogleIdentityVerifier } from '../auth/googleIdentityVerifier';
import { IdentityVerificationError } from '../auth/types';
import type {
  AuthenticatedSession,
  GoogleIdentityVerifier,
  GoogleOAuthClient,
  SessionManager,
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

const session: AuthenticatedSession = {
  identity: {
    provider: 'google',
    subject: 'verified-google-subject',
    displayName: 'Verified Researcher',
    email: 'verified@example.test',
  },
  user: {
    provider: 'google',
    displayName: 'Verified Researcher',
    email: 'verified@example.test',
  },
  expiresAt: '2026-07-26T00:00:00.000Z',
};

const SESSION_COOKIE = '__Host-difaryx_session=valid-session-token';

function productionConfig() {
  return loadServerConfig({
    NODE_ENV: 'production',
    ALLOWED_ORIGINS: 'https://app.example.test',
    APP_BASE_URL: 'https://app.example.test',
    GEMINI_PROVIDER_MODE: 'developer',
    GEMINI_API_KEY: 'test-only-placeholder',
    GEMINI_MODEL: 'gemini-2.5-flash',
    GOOGLE_OAUTH_CLIENT_ID: 'synthetic-client-id',
    GOOGLE_OAUTH_CLIENT_SECRET: 'synthetic-client-secret',
    GOOGLE_OAUTH_REDIRECT_URI: 'https://api.example.test/api/auth/google/callback',
    DIFARYX_SESSION_SECRET: 'synthetic-session-secret-at-least-32-characters',
    UPSTASH_REDIS_REST_URL: 'https://synthetic-quota.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'synthetic-rest-token',
    QUOTA_ID_HASH_SECRET: 'synthetic-independent-hmac-secret',
    GEMINI_GLOBAL_DAILY_LIMIT: '100',
  });
}

function identityVerifier(): GoogleIdentityVerifier {
  return {
    configured: true,
    verifyIdentityToken: vi.fn(async () => session.identity),
  };
}

function oauthClient(): GoogleOAuthClient {
  return {
    createAuthorizationUrl: vi.fn(({ state, codeChallenge }) => (
      `https://accounts.google.test/auth?state=${state}&code_challenge=${codeChallenge}`
    )),
    exchangeAuthorizationCode: vi.fn(async () => 'server-only-google-id-token'),
  };
}

function statefulSessionManager(initiallyValid = true): SessionManager {
  let valid = initiallyValid;
  return {
    create: vi.fn(async () => {
      valid = true;
      return { token: 'created-session-token', session };
    }),
    read: vi.fn(async () => valid ? session : null),
    revoke: vi.fn(async () => {
      valid = false;
    }),
  };
}

function allowedQuotaService(): GeminiQuotaService {
  return {
    consume: vi.fn(async () => ({
      status: 'allowed' as const,
      counters: [
        { dimension: 'user_burst' as const, limit: 2, remaining: 1, resetAt: '2026-07-26T00:00:00.000Z', retryAfterSeconds: 30 },
        { dimension: 'user_daily' as const, limit: 5, remaining: 4, resetAt: '2026-07-26T00:00:00.000Z', retryAfterSeconds: 100 },
        { dimension: 'global_daily' as const, limit: 100, remaining: 99, resetAt: '2026-07-26T00:00:00.000Z', retryAfterSeconds: 100 },
      ] as const,
    })),
  };
}

describe('server-controlled authentication boundary', () => {
  it('returns 401 for missing, malformed, expired, or revoked sessions without provider calls', async () => {
    const reasoningHandler = vi.fn();
    for (const cookie of [undefined, '__Host-difaryx_session=malformed']) {
      const agent = request(createApp({
        config: productionConfig(),
        identityVerifier: identityVerifier(),
        oauthClient: oauthClient(),
        sessionManager: statefulSessionManager(false),
        quotaService: allowedQuotaService(),
        reasoningHandler,
        logger: () => undefined,
      })).post('/api/reasoning');
      if (cookie) agent.set('Cookie', cookie);
      const response = await agent.send({ packet, provider: 'gemini-2.5-flash' });
      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Authentication required');
    }
    expect(reasoningHandler).not.toHaveBeenCalled();
  });

  it('permits protected reasoning only from a valid server session', async () => {
    const quota = allowedQuotaService();
    const reasoningHandler = vi.fn(async () => ({
      success: true as const,
      output: generateDeterministicReasoning(packet),
      fallbackUsed: true,
    }));
    const response = await request(createApp({
      config: productionConfig(),
      identityVerifier: identityVerifier(),
      oauthClient: oauthClient(),
      sessionManager: statefulSessionManager(),
      quotaService: quota,
      reasoningHandler,
      logger: () => undefined,
    }))
      .post('/api/reasoning')
      .set('Cookie', SESSION_COOKIE)
      .set('Authorization', 'Bearer browser-token-must-be-ignored')
      .send({
        packet,
        provider: 'gemini-2.5-flash',
        subject: 'browser-subject',
        email: 'fake@example.invalid',
        organizationId: 'browser-organization',
      });

    expect(response.status).toBe(200);
    expect(quota.consume).toHaveBeenCalledWith('verified-google-subject');
    expect(reasoningHandler).toHaveBeenCalledOnce();
    expect(JSON.stringify(response.body)).not.toContain('verified-google-subject');
    expect(JSON.stringify(response.body)).not.toContain('browser-subject');
  });

  it('does not let a fake email profile or guest request authorize Gemini', async () => {
    const quota = allowedQuotaService();
    const response = await request(createApp({
      config: productionConfig(),
      identityVerifier: identityVerifier(),
      oauthClient: oauthClient(),
      sessionManager: statefulSessionManager(false),
      quotaService: quota,
      logger: () => undefined,
    }))
      .post('/api/reasoning')
      .send({
        packet,
        provider: 'gemini-2.5-flash',
        email: 'guest@difaryx.local',
        providerName: 'google',
      });

    expect(response.status).toBe(401);
    expect(quota.consume).not.toHaveBeenCalled();
  });

  it('returns a sanitized current session and never returns the Google subject', async () => {
    const response = await request(createApp({
      config: productionConfig(),
      identityVerifier: identityVerifier(),
      oauthClient: oauthClient(),
      sessionManager: statefulSessionManager(),
      logger: () => undefined,
    }))
      .get('/api/session')
      .set('Cookie', SESSION_COOKIE);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      authenticated: true,
      user: {
        provider: 'google',
        displayName: 'Verified Researcher',
        email: 'verified@example.test',
      },
      expiresAt: '2026-07-26T00:00:00.000Z',
    });
    expect(JSON.stringify(response.body)).not.toContain('verified-google-subject');
  });

  it('logout revokes the session and the same cookie becomes unauthorized', async () => {
    const sessions = statefulSessionManager();
    const app = createApp({
      config: productionConfig(),
      identityVerifier: identityVerifier(),
      oauthClient: oauthClient(),
      sessionManager: sessions,
      quotaService: allowedQuotaService(),
      logger: () => undefined,
    });
    const logout = await request(app).post('/api/logout').set('Cookie', SESSION_COOKIE);
    const reasoning = await request(app)
      .post('/api/reasoning')
      .set('Cookie', SESSION_COOKIE)
      .send({ packet, provider: 'gemini-2.5-flash' });

    expect(logout.status).toBe(204);
    expect(sessions.revoke).toHaveBeenCalledOnce();
    expect(reasoning.status).toBe(401);
  });

  it('uses Authorization Code + PKCE and sets only secure HttpOnly cookies', async () => {
    const oauth = oauthClient();
    const verifier = identityVerifier();
    const sessions = statefulSessionManager(false);
    const app = createApp({
      config: productionConfig(),
      identityVerifier: verifier,
      oauthClient: oauth,
      sessionManager: sessions,
      logger: () => undefined,
    });
    const start = await request(app)
      .get('/api/auth/google/start')
      .query({ returnTo: '/workspace/xrd?run=1' });
    const location = new URL(start.headers.location);
    const transactionCookie = start.headers['set-cookie'][0].split(';')[0];
    const callback = await request(app)
      .get('/api/auth/google/callback')
      .set('Cookie', transactionCookie)
      .query({ code: 'synthetic-code', state: location.searchParams.get('state') });

    expect(start.status).toBe(302);
    expect(start.headers['set-cookie'][0]).toMatch(/HttpOnly/i);
    expect(start.headers['set-cookie'][0]).toMatch(/Secure/i);
    expect(start.headers['set-cookie'][0]).toMatch(/SameSite=Lax/i);
    expect(location.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(oauth.exchangeAuthorizationCode).toHaveBeenCalledOnce();
    expect(verifier.verifyIdentityToken).toHaveBeenCalledWith('server-only-google-id-token');
    expect(callback.status).toBe(302);
    expect(callback.headers.location).toBe('https://app.example.test/workspace/xrd?run=1');
    const callbackCookies = String(callback.headers['set-cookie']);
    expect(callbackCookies).toContain('__Host-difaryx_session=created-session-token');
    expect(callbackCookies).not.toContain('server-only-google-id-token');
  });

  it('rejects callback input without a matching transaction', async () => {
    const response = await request(createApp({
      config: productionConfig(),
      identityVerifier: identityVerifier(),
      oauthClient: oauthClient(),
      sessionManager: statefulSessionManager(false),
      logger: () => undefined,
    }))
      .get('/api/auth/google/callback')
      .query({ code: 'synthetic-code', state: 'untrusted-state' });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Authentication required');
  });

  it('returns 401 when Google returns an identity that fails verification', async () => {
    const oauth = oauthClient();
    const verifier: GoogleIdentityVerifier = {
      configured: true,
      verifyIdentityToken: vi.fn(async () => {
        throw new IdentityVerificationError('invalid');
      }),
    };
    const sessions = statefulSessionManager(false);
    const app = createApp({
      config: productionConfig(),
      identityVerifier: verifier,
      oauthClient: oauth,
      sessionManager: sessions,
      logger: () => undefined,
    });
    const start = await request(app).get('/api/auth/google/start');
    const location = new URL(start.headers.location);
    const transactionCookie = start.headers['set-cookie'][0].split(';')[0];
    const response = await request(app)
      .get('/api/auth/google/callback')
      .set('Cookie', transactionCookie)
      .query({ code: 'synthetic-code', state: location.searchParams.get('state') });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Authentication required');
    expect(sessions.create).not.toHaveBeenCalled();
  });

  it('allows health and CORS preflight without a session or quota', async () => {
    const quota = allowedQuotaService();
    const app = createApp({
      config: productionConfig(),
      identityVerifier: identityVerifier(),
      oauthClient: oauthClient(),
      sessionManager: statefulSessionManager(false),
      quotaService: quota,
      logger: () => undefined,
    });
    const [health, options] = await Promise.all([
      request(app).get('/api/health'),
      request(app)
        .options('/api/reasoning')
        .set('Origin', 'https://app.example.test')
        .set('Access-Control-Request-Method', 'POST'),
    ]);

    expect(health.status).toBe(200);
    expect(options.status).toBe(204);
    expect(options.headers['access-control-allow-credentials']).toBe('true');
    expect(quota.consume).not.toHaveBeenCalled();
  });
});

describe('Google identity verifier', () => {
  it('uses the configured audience and returns only validated display claims', async () => {
    const verifyIdToken = vi.fn(async () => ({
      getPayload: () => ({
        iss: 'https://accounts.google.com',
        sub: 'stable-google-subject',
        exp: 2_000_000_000,
        name: 'Verified Researcher',
        email: 'verified@example.test',
        email_verified: true,
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
      displayName: 'Verified Researcher',
      email: 'verified@example.test',
    });
    expect(verifyIdToken).toHaveBeenCalledWith({
      idToken: 'synthetic-credential',
      audience: 'expected-client-id',
    });
  });

  it.each([
    ['wrong issuer', { iss: 'https://issuer.invalid', sub: 'subject', exp: 2_000_000_000 }],
    ['expired identity', { iss: 'accounts.google.com', sub: 'subject', exp: 100 }],
  ])('rejects %s', async (_label, payload) => {
    const verifier = createGoogleIdentityVerifier({
      clientId: 'expected-client-id',
      client: { verifyIdToken: async () => ({ getPayload: () => payload }) },
      now: () => 101_000,
    });
    await expect(verifier.verifyIdentityToken('synthetic-credential'))
      .rejects.toMatchObject({ category: 'invalid' });
  });

  it('maps wrong-audience verification failure to invalid identity', async () => {
    const verifier = createGoogleIdentityVerifier({
      clientId: 'expected-client-id',
      client: { verifyIdToken: async () => { throw new Error('wrong audience'); } },
    });
    await expect(verifier.verifyIdentityToken('synthetic-credential'))
      .rejects.toMatchObject({ category: 'invalid' });
  });
});
