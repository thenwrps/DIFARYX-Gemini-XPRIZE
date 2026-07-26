import { getAgentApiUrl } from '../api/agentApiUrl';

export interface ServerSessionUser {
  provider: 'google';
  displayName: string;
  email?: string;
}

export type ServerSessionResponse =
  | { authenticated: false; user: null }
  | { authenticated: true; user: ServerSessionUser; expiresAt: string };

export type SessionInvalidationReason = 'session' | 'logout';

const invalidationListeners = new Set<(reason: SessionInvalidationReason) => void>();

export async function fetchCurrentSession(): Promise<ServerSessionResponse> {
  const response = await fetch(getAgentApiUrl('/api/session'), {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error('Authentication service unavailable');
  return validateSessionResponse(await response.json());
}

export async function revokeCurrentSession(): Promise<void> {
  const response = await fetch(getAgentApiUrl('/api/logout'), {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok && response.status !== 401) {
    throw new Error('Unable to sign out');
  }
  notifySessionInvalidated('logout');
}

export function notifySessionInvalidated(reason: SessionInvalidationReason = 'session'): void {
  for (const listener of invalidationListeners) listener(reason);
}

export function subscribeSessionInvalidation(
  listener: (reason: SessionInvalidationReason) => void,
): () => void {
  invalidationListeners.add(listener);
  return () => invalidationListeners.delete(listener);
}

export function createGoogleSignInUrl(returnTo: string): string {
  const safeReturnTo = sanitizeRedirectTarget(returnTo);
  return getAgentApiUrl(
    `/api/auth/google/start?returnTo=${encodeURIComponent(safeReturnTo)}`,
  );
}

export function sanitizeRedirectTarget(value: unknown): string {
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

export function validateSessionResponse(value: unknown): ServerSessionResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid session response');
  }
  const record = value as Record<string, unknown>;
  if (record.authenticated === false && record.user === null) {
    return { authenticated: false, user: null };
  }
  if (
    record.authenticated !== true
    || !record.user
    || typeof record.user !== 'object'
    || Array.isArray(record.user)
    || typeof record.expiresAt !== 'string'
    || !Number.isFinite(Date.parse(record.expiresAt))
  ) {
    throw new Error('Invalid session response');
  }
  const user = record.user as Record<string, unknown>;
  if (
    user.provider !== 'google'
    || typeof user.displayName !== 'string'
    || !user.displayName
    || user.displayName.length > 200
    || (user.email !== undefined
      && (typeof user.email !== 'string' || user.email.length > 320))
  ) {
    throw new Error('Invalid session response');
  }
  return {
    authenticated: true,
    user: {
      provider: 'google',
      displayName: user.displayName,
      ...(typeof user.email === 'string' ? { email: user.email } : {}),
    },
    expiresAt: record.expiresAt,
  };
}
