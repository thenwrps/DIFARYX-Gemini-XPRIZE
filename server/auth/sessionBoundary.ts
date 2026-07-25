import { createHash, randomBytes } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import type { AuthConfig } from './authConfig';
import { constantTimeEqual, openPayload, sealPayload } from './securePayload';
import type {
  GoogleIdentityVerifier,
  GoogleOAuthClient,
  SessionManager,
  VerifiedGoogleIdentity,
} from './types';
import { IdentityVerificationError } from './types';
import { HttpError } from '../middleware/errorHandler';

const OAUTH_TRANSACTION_TTL_MS = 10 * 60 * 1000;
const OAUTH_PAYLOAD_PURPOSE = 'difaryx-oauth-transaction-v1';

interface OAuthTransaction {
  state: string;
  codeVerifier: string;
  returnTo: string;
  expiresAtMs: number;
}

export interface AuthBoundaryDependencies {
  config: AuthConfig;
  oauthClient: GoogleOAuthClient;
  identityVerifier: GoogleIdentityVerifier;
  sessionManager: SessionManager;
  now?: () => number;
}

export function registerAuthRoutes(app: Express, dependencies: AuthBoundaryDependencies): void {
  const now = dependencies.now ?? Date.now;

  app.get('/api/auth/google/start', (request, response, next) => {
    try {
      const returnTo = readSafeReturnTo(request.query.returnTo);
      const transaction = createOAuthTransaction(returnTo, now());
      setOAuthCookie(
        response,
        dependencies.config,
        sealPayload(
          transaction,
          dependencies.config.sessionSecret,
          OAUTH_PAYLOAD_PURPOSE,
        ),
      );
      response.redirect(302, dependencies.oauthClient.createAuthorizationUrl({
        state: transaction.state,
        codeChallenge: createCodeChallenge(transaction.codeVerifier),
      }));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/auth/google/callback', async (request, response, next) => {
    try {
      const code = readBoundedQueryString(request.query.code, 'Invalid authorization callback');
      const state = readBoundedQueryString(request.query.state, 'Invalid authorization callback');
      const sealedTransaction = readCookie(
        request,
        oauthCookieName(dependencies.config),
      );
      clearOAuthCookie(response, dependencies.config);
      if (!sealedTransaction) throw new HttpError(401, 'Authentication required');

      const transaction = readOAuthTransaction(openPayload(
        sealedTransaction,
        dependencies.config.sessionSecret,
        OAUTH_PAYLOAD_PURPOSE,
      ));
      if (
        transaction.expiresAtMs <= now()
        || !constantTimeEqual(transaction.state, state)
      ) {
        throw new HttpError(401, 'Authentication required');
      }

      let identityToken: string;
      try {
        identityToken = await dependencies.oauthClient
          .exchangeAuthorizationCode(code, transaction.codeVerifier);
      } catch {
        throw new HttpError(401, 'Authentication required');
      }
      let identity: VerifiedGoogleIdentity;
      try {
        identity = await dependencies.identityVerifier.verifyIdentityToken(identityToken);
      } catch (error) {
        if (error instanceof IdentityVerificationError && error.category === 'unavailable') {
          throw new HttpError(503, 'Authentication service unavailable');
        }
        throw new HttpError(401, 'Authentication required');
      }
      let token: string;
      try {
        ({ token } = await dependencies.sessionManager.create(identity));
      } catch {
        throw new HttpError(503, 'Authentication service unavailable');
      }
      setSessionCookie(response, dependencies.config, token);
      response.redirect(302, new URL(transaction.returnTo, dependencies.config.appBaseUrl).toString());
    } catch (error) {
      if (error instanceof HttpError) {
        next(error);
        return;
      }
      response.locals.authOutcome = 'invalid';
      next(new HttpError(401, 'Authentication required'));
    }
  });

  app.get('/api/session', async (request, response, next) => {
    try {
      const token = readCookie(request, sessionCookieName(dependencies.config));
      if (!token) {
        response.json({ authenticated: false, user: null });
        return;
      }
      const session = await dependencies.sessionManager.read(token);
      if (!session) {
        clearSessionCookie(response, dependencies.config);
        response.json({ authenticated: false, user: null });
        return;
      }
      response.json({
        authenticated: true,
        user: session.user,
        expiresAt: session.expiresAt,
      });
    } catch {
      next(new HttpError(503, 'Authentication service unavailable'));
    }
  });

  app.post('/api/logout', async (request, response, next) => {
    try {
      const token = readCookie(request, sessionCookieName(dependencies.config));
      if (token) await dependencies.sessionManager.revoke(token);
      clearSessionCookie(response, dependencies.config);
      response.status(204).end();
    } catch {
      next(new HttpError(503, 'Authentication service unavailable'));
    }
  });
}

export async function requireAuthenticatedSession(
  request: Request,
  response: Response,
  config: AuthConfig,
  sessionManager: SessionManager,
): Promise<VerifiedGoogleIdentity> {
  const token = readCookie(request, sessionCookieName(config));
  if (!token) {
    response.locals.authOutcome = 'missing';
    throw new HttpError(401, 'Authentication required');
  }
  try {
    const session = await sessionManager.read(token);
    if (!session) {
      clearSessionCookie(response, config);
      response.locals.authOutcome = 'invalid';
      throw new HttpError(401, 'Authentication required');
    }
    response.locals.authOutcome = 'verified_session';
    return session.identity;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    response.locals.authOutcome = 'unavailable';
    throw new HttpError(503, 'Authentication service unavailable');
  }
}

export function readSafeReturnTo(value: unknown): string {
  if (value === undefined) return '/dashboard';
  if (typeof value !== 'string' || value.length > 2048) return '/dashboard';
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return '/dashboard';
  }
  try {
    const parsed = new URL(value, 'https://return.invalid');
    return parsed.origin === 'https://return.invalid'
      ? `${parsed.pathname}${parsed.search}${parsed.hash}`
      : '/dashboard';
  } catch {
    return '/dashboard';
  }
}

export function sessionCookieName(config: AuthConfig): string {
  return config.secureCookies ? '__Host-difaryx_session' : 'difaryx_session';
}

function oauthCookieName(config: AuthConfig): string {
  return config.secureCookies ? '__Host-difaryx_oauth' : 'difaryx_oauth';
}

function createOAuthTransaction(returnTo: string, nowMs: number): OAuthTransaction {
  return {
    state: randomBytes(32).toString('base64url'),
    codeVerifier: randomBytes(32).toString('base64url'),
    returnTo,
    expiresAtMs: nowMs + OAUTH_TRANSACTION_TTL_MS,
  };
}

function createCodeChallenge(codeVerifier: string): string {
  return createHash('sha256').update(codeVerifier, 'ascii').digest('base64url');
}

function readOAuthTransaction(value: unknown): OAuthTransaction {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(401, 'Authentication required');
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.state !== 'string'
    || typeof record.codeVerifier !== 'string'
    || typeof record.returnTo !== 'string'
    || typeof record.expiresAtMs !== 'number'
    || !Number.isFinite(record.expiresAtMs)
    || !/^[A-Za-z0-9_-]{43}$/.test(record.state)
    || !/^[A-Za-z0-9_-]{43}$/.test(record.codeVerifier)
  ) {
    throw new HttpError(401, 'Authentication required');
  }
  return {
    state: record.state,
    codeVerifier: record.codeVerifier,
    returnTo: readSafeReturnTo(record.returnTo),
    expiresAtMs: record.expiresAtMs,
  };
}

function readBoundedQueryString(value: unknown, message: string): string {
  if (typeof value !== 'string' || !value || value.length > 4096) {
    throw new HttpError(400, message);
  }
  return value;
}

function readCookie(request: Request, name: string): string | undefined {
  const header = request.header('Cookie');
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    if (key !== name) continue;
    const value = part.slice(separator + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function setOAuthCookie(response: Response, config: AuthConfig, value: string): void {
  response.cookie(oauthCookieName(config), value, {
    httpOnly: true,
    secure: config.secureCookies,
    sameSite: 'lax',
    path: '/',
    maxAge: OAUTH_TRANSACTION_TTL_MS,
  });
}

function clearOAuthCookie(response: Response, config: AuthConfig): void {
  response.clearCookie(oauthCookieName(config), cookieClearOptions(config));
}

function setSessionCookie(response: Response, config: AuthConfig, value: string): void {
  response.cookie(sessionCookieName(config), value, {
    httpOnly: true,
    secure: config.secureCookies,
    sameSite: 'lax',
    path: '/',
    maxAge: config.sessionTtlSeconds * 1000,
  });
}

function clearSessionCookie(response: Response, config: AuthConfig): void {
  response.clearCookie(sessionCookieName(config), cookieClearOptions(config));
}

function cookieClearOptions(config: AuthConfig) {
  return {
    httpOnly: true,
    secure: config.secureCookies,
    sameSite: 'lax' as const,
    path: '/',
  };
}
