import { createHmac, randomBytes } from 'node:crypto';
import { Redis } from '@upstash/redis';
import type { AuthConfig } from './authConfig';
import { openPayload, sealPayload } from './securePayload';
import type {
  AuthenticatedSession,
  SessionManager,
  SessionStore,
  VerifiedGoogleIdentity,
} from './types';

const AUTH_SESSION_NAMESPACE = 'difaryx:auth:v1:session';
const SESSION_PAYLOAD_PURPOSE = 'difaryx-auth-session-v1';

interface StoredSession {
  subject: string;
  displayName: string;
  email?: string;
  expiresAtMs: number;
}

export function createSessionManager(
  config: AuthConfig,
  store: SessionStore = createUpstashSessionStore(config),
  clock: () => number = Date.now,
): SessionManager {
  return {
    async create(identity) {
      const token = randomBytes(32).toString('base64url');
      const expiresAtMs = clock() + config.sessionTtlSeconds * 1000;
      const stored: StoredSession = {
        subject: identity.subject,
        displayName: identity.displayName,
        ...(identity.email ? { email: identity.email } : {}),
        expiresAtMs,
      };
      await store.set(
        sessionKey(config.sessionSecret, token),
        sealPayload(stored, config.sessionSecret, SESSION_PAYLOAD_PURPOSE),
        config.sessionTtlSeconds,
      );
      return {
        token,
        session: toAuthenticatedSession(stored),
      };
    },

    async read(token) {
      if (!isSessionToken(token)) return null;
      const key = sessionKey(config.sessionSecret, token);
      const sealed = await store.get(key);
      if (!sealed) return null;
      try {
        const stored = readStoredSession(
          openPayload(sealed, config.sessionSecret, SESSION_PAYLOAD_PURPOSE),
        );
        if (stored.expiresAtMs <= clock()) {
          await store.delete(key);
          return null;
        }
        return toAuthenticatedSession(stored);
      } catch {
        await store.delete(key);
        return null;
      }
    },

    async revoke(token) {
      if (!isSessionToken(token)) return;
      await store.delete(sessionKey(config.sessionSecret, token));
    },
  };
}

export function createUpstashSessionStore(config: AuthConfig): SessionStore {
  const redis = new Redis({
    url: config.redisRestUrl,
    token: config.redisRestToken,
  });
  return {
    async set(key, sealedSession, ttlSeconds) {
      await redis.set(key, sealedSession, { ex: ttlSeconds });
    },
    async get(key) {
      const value = await redis.get<unknown>(key);
      return typeof value === 'string' ? value : null;
    },
    async delete(key) {
      await redis.del(key);
    },
  };
}

function sessionKey(secret: string, token: string): string {
  const digest = createHmac('sha256', secret).update(token, 'utf8').digest('hex');
  return `${AUTH_SESSION_NAMESPACE}:${digest}`;
}

function isSessionToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(value);
}

function readStoredSession(value: unknown): StoredSession {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid session payload');
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.subject !== 'string'
    || !record.subject
    || typeof record.displayName !== 'string'
    || !record.displayName
    || (record.email !== undefined && typeof record.email !== 'string')
    || typeof record.expiresAtMs !== 'number'
    || !Number.isFinite(record.expiresAtMs)
  ) {
    throw new Error('Invalid session payload');
  }
  return {
    subject: record.subject,
    displayName: record.displayName,
    ...(typeof record.email === 'string' ? { email: record.email } : {}),
    expiresAtMs: record.expiresAtMs,
  };
}

function toAuthenticatedSession(stored: StoredSession): AuthenticatedSession {
  const identity: VerifiedGoogleIdentity = {
    provider: 'google',
    subject: stored.subject,
    displayName: stored.displayName,
    ...(stored.email ? { email: stored.email } : {}),
  };
  return {
    identity,
    user: {
      provider: 'google',
      displayName: stored.displayName,
      ...(stored.email ? { email: stored.email } : {}),
    },
    expiresAt: new Date(stored.expiresAtMs).toISOString(),
  };
}
