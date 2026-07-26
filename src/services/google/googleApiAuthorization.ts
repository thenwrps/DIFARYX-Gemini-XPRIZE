import {
  getLoadedGoogleAccounts,
  loadGoogleIdentityServices,
  type GoogleAccounts,
  type GoogleTokenResponse,
} from './googleIdentityServices';
import {
  asGoogleApiAccessToken,
  type GoogleApiAccessToken,
} from './tokenTypes';

export const GOOGLE_DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const GOOGLE_SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
export const GOOGLE_GMAIL_READ_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
export const GOOGLE_GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
export const GOOGLE_CLOUD_PLATFORM_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';

export const CURRENT_GOOGLE_WORKSPACE_SCOPES = [
  GOOGLE_GMAIL_READ_SCOPE,
  GOOGLE_GMAIL_SEND_SCOPE,
  GOOGLE_DRIVE_FILE_SCOPE,
  GOOGLE_CLOUD_PLATFORM_SCOPE,
  'openid',
  'email',
  'profile',
] as const;

interface GoogleApiAccessSession {
  accessToken: GoogleApiAccessToken;
  expiresAtMs: number;
  grantedScopes: string[];
}

export interface GoogleApiAuthorizationOptions {
  clientId: string;
  scopes: readonly string[];
  accounts?: GoogleAccounts;
}

let accessSession: GoogleApiAccessSession | null = null;
let accessExpiryTimer: number | null = null;
const listeners = new Set<() => void>();

export function getGoogleApiAccessToken(): GoogleApiAccessToken | null {
  if (!accessSession) return null;
  if (accessSession.expiresAtMs <= Date.now()) {
    clearGoogleApiAccessSession();
    return null;
  }
  return accessSession.accessToken;
}

export function hasGoogleApiAccess(): boolean {
  return getGoogleApiAccessToken() !== null;
}

export function clearGoogleApiAccessSession(): void {
  if (typeof window !== 'undefined' && accessExpiryTimer !== null) {
    window.clearTimeout(accessExpiryTimer);
  }
  accessExpiryTimer = null;
  if (!accessSession) return;
  accessSession = null;
  notifyListeners();
}

export function subscribeGoogleApiAccess(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function requestGoogleApiAccess(
  options: GoogleApiAuthorizationOptions,
): Promise<void> {
  if (!options.clientId.trim()) {
    throw new Error('Google API authorization is not configured');
  }
  const scopes = [...new Set(options.scopes.map((scope) => scope.trim()).filter(Boolean))];
  if (scopes.length === 0) {
    throw new Error('Google API authorization scopes are missing');
  }

  const accounts = options.accounts ?? await loadGoogleIdentityServices();
  await new Promise<void>((resolve, reject) => {
    const client = accounts.oauth2.initTokenClient({
      client_id: options.clientId,
      scope: scopes.join(' '),
      callback(response) {
        try {
          setGoogleApiAccessResponse(response);
          resolve();
        } catch {
          reject(new Error('Google API authorization failed'));
        }
      },
      error_callback() {
        reject(new Error('Google API authorization was not completed'));
      },
      include_granted_scopes: true,
    });
    client.requestAccessToken({ prompt: 'consent' });
  });
}

export async function revokeGoogleApiAccess(): Promise<void> {
  const accessToken = getGoogleApiAccessToken();
  clearGoogleApiAccessSession();
  if (!accessToken) return;

  const accounts = getLoadedGoogleAccounts() ?? await loadGoogleIdentityServices();
  await new Promise<void>((resolve) => {
    accounts.oauth2.revoke(accessToken, resolve);
  });
}

function setGoogleApiAccessResponse(response: GoogleTokenResponse): void {
  if (response.error || !response.access_token) {
    throw new Error('Google API authorization failed');
  }
  const expiresInSeconds = Number(response.expires_in);
  if (!Number.isFinite(expiresInSeconds) || expiresInSeconds <= 0) {
    throw new Error('Google API authorization returned an invalid expiry');
  }

  accessSession = {
    accessToken: asGoogleApiAccessToken(response.access_token),
    expiresAtMs: Date.now() + expiresInSeconds * 1000,
    grantedScopes: response.scope?.split(/\s+/).filter(Boolean) ?? [],
  };
  if (typeof window !== 'undefined') {
    if (accessExpiryTimer !== null) window.clearTimeout(accessExpiryTimer);
    accessExpiryTimer = window.setTimeout(
      clearGoogleApiAccessSession,
      Math.min(expiresInSeconds * 1000, 2_147_483_647),
    );
  }
  notifyListeners();
}

function notifyListeners(): void {
  for (const listener of listeners) listener();
}
