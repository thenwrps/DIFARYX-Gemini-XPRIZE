import { describe, expect, it, vi } from 'vitest';
import type { AuthConfig } from '../auth/authConfig';
import { loadAuthConfig } from '../auth/authConfig';
import { createSessionManager } from '../auth/sessionManager';
import type { SessionStore } from '../auth/types';

const config: AuthConfig = {
  appBaseUrl: 'https://app.example.test',
  googleClientId: 'synthetic-client-id',
  googleClientSecret: 'synthetic-client-secret',
  googleRedirectUri: 'https://api.example.test/api/auth/google/callback',
  redisRestUrl: 'https://synthetic-redis.upstash.io',
  redisRestToken: 'synthetic-rest-token',
  sessionSecret: 'synthetic-session-secret-at-least-32-characters',
  sessionTtlSeconds: 3600,
  secureCookies: true,
};

function memoryStore(): SessionStore & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    set: vi.fn(async (key, value) => { values.set(key, value); }),
    get: vi.fn(async (key) => values.get(key) ?? null),
    delete: vi.fn(async (key) => { values.delete(key); }),
  };
}

describe('DIFARYX server session manager', () => {
  it('stores an encrypted identity behind a pseudonymous key and restores it', async () => {
    const rawSubject = 'raw-google-subject-must-not-appear';
    const store = memoryStore();
    const manager = createSessionManager(config, store, () => 1_000);
    const created = await manager.create({
      provider: 'google',
      subject: rawSubject,
      displayName: 'Verified Researcher',
      email: 'verified@example.test',
    });
    const serializedStore = JSON.stringify([...store.values.entries()]);

    expect(created.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(serializedStore).not.toContain(rawSubject);
    expect(serializedStore).not.toContain('verified@example.test');
    expect([...store.values.keys()][0]).toMatch(/^difaryx:auth:v1:session:[a-f0-9]{64}$/);
    await expect(manager.read(created.token)).resolves.toEqual(created.session);
  });

  it('revokes a session by deleting its shared-store record', async () => {
    const store = memoryStore();
    const manager = createSessionManager(config, store, () => 1_000);
    const created = await manager.create({
      provider: 'google',
      subject: 'verified-subject',
      displayName: 'Verified Researcher',
    });
    await manager.revoke(created.token);

    await expect(manager.read(created.token)).resolves.toBeNull();
    expect(store.values.size).toBe(0);
  });

  it('rejects an expired encrypted session even if storage has not evicted it', async () => {
    const store = memoryStore();
    const createManager = createSessionManager(config, store, () => 1_000);
    const created = await createManager.create({
      provider: 'google',
      subject: 'verified-subject',
      displayName: 'Verified Researcher',
    });
    const expiredManager = createSessionManager(config, store, () => 3_602_000);

    await expect(expiredManager.read(created.token)).resolves.toBeNull();
    expect(store.values.size).toBe(0);
  });
});

describe('authentication configuration', () => {
  it('requires all server-only OAuth and session settings', () => {
    expect(loadAuthConfig({}, 'production')).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        'app_base_url',
        'google_client_id',
        'google_client_secret',
        'google_redirect_uri',
        'redis_url',
        'redis_token',
        'session_secret',
      ]),
    });
  });

  it('rejects short secrets and insecure non-local production URLs', () => {
    const result = loadAuthConfig({
      APP_BASE_URL: 'http://app.example.test',
      GOOGLE_OAUTH_CLIENT_ID: 'client',
      GOOGLE_OAUTH_CLIENT_SECRET: 'secret',
      GOOGLE_OAUTH_REDIRECT_URI: 'http://api.example.test/callback',
      UPSTASH_REDIS_REST_URL: 'https://redis.example.test',
      UPSTASH_REDIS_REST_TOKEN: 'token',
      DIFARYX_SESSION_SECRET: 'short',
    }, 'production');

    expect(result).toMatchObject({
      ok: false,
      issues: expect.arrayContaining(['app_base_url', 'google_redirect_uri', 'session_secret']),
    });
  });
});
