import {
  asGoogleIdentityToken,
  type GoogleIdentityToken,
} from '../google/tokenTypes';

const LEGACY_IDENTITY_STORAGE_KEYS = [
  'demoAuth',
  'demoProfile',
  'difaryx_google_demo_user',
  'difaryx_google_user_token',
] as const;

export interface GoogleIdentityDisplayClaims {
  name: string;
  email: string;
  picture?: string;
  expiresAtMs: number;
}

interface IdentitySession {
  identityToken: GoogleIdentityToken;
  expiresAtMs: number;
}

interface RemovableStorage {
  removeItem(key: string): void;
}

let identitySession: IdentitySession | null = null;
let expiryTimer: number | null = null;
const listeners = new Set<() => void>();

export function establishIdentitySession(
  identityToken: GoogleIdentityToken,
  expiresAtMs: number,
): void {
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
    throw new Error('Google identity credential has expired');
  }
  identitySession = { identityToken, expiresAtMs };
  if (typeof window !== 'undefined') {
    if (expiryTimer !== null) window.clearTimeout(expiryTimer);
    expiryTimer = window.setTimeout(
      clearIdentitySession,
      Math.min(expiresAtMs - Date.now(), 2_147_483_647),
    );
  }
  notifyListeners();
}

export function establishIdentitySessionFromCredential(
  credential: string,
): GoogleIdentityDisplayClaims {
  const identityToken = asGoogleIdentityToken(credential);
  const claims = decodeDisplayClaims(identityToken);
  establishIdentitySession(identityToken, claims.expiresAtMs);
  return claims;
}

export function getIdentityToken(): GoogleIdentityToken | null {
  if (!identitySession) return null;
  if (identitySession.expiresAtMs <= Date.now()) {
    clearIdentitySession();
    return null;
  }
  return identitySession.identityToken;
}

export function clearIdentitySession(): void {
  if (typeof window !== 'undefined' && expiryTimer !== null) {
    window.clearTimeout(expiryTimer);
  }
  expiryTimer = null;
  if (!identitySession) return;
  identitySession = null;
  notifyListeners();
}

export function subscribeIdentitySession(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function invalidateLegacyBrowserAuthState(storage: RemovableStorage): void {
  for (const key of LEGACY_IDENTITY_STORAGE_KEYS) {
    storage.removeItem(key);
  }
}

function notifyListeners(): void {
  for (const listener of listeners) listener();
}

function decodeDisplayClaims(
  identityToken: GoogleIdentityToken,
): GoogleIdentityDisplayClaims {
  const parts = identityToken.split('.');
  if (parts.length !== 3) {
    throw new Error('Google identity credential is malformed');
  }

  let claims: Record<string, unknown>;
  try {
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
    claims = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
  } catch {
    throw new Error('Google identity credential is malformed');
  }

  const name = typeof claims.name === 'string' ? claims.name.trim() : '';
  const email = typeof claims.email === 'string' ? claims.email.trim() : '';
  const picture = typeof claims.picture === 'string' ? claims.picture : undefined;
  const expiresAtMs = typeof claims.exp === 'number' ? claims.exp * 1000 : Number.NaN;

  if (!name || !email || !Number.isFinite(expiresAtMs)) {
    throw new Error('Google identity credential is missing display claims');
  }

  return { name, email, picture, expiresAtMs };
}
