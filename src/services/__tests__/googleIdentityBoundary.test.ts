import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentEvidencePacket } from '../../agent/mcp/types';
import { callReasoningAPI } from '../api/reasoningClient';
import {
  createGoogleSignInUrl,
  fetchCurrentSession,
  revokeCurrentSession,
  sanitizeRedirectTarget,
  subscribeSessionInvalidation,
  validateSessionResponse,
} from '../auth/serverSession';
import {
  clearGoogleApiAccessSession,
  requestGoogleApiAccess,
} from '../google/googleApiAuthorization';
import type { GoogleAccounts } from '../google/googleIdentityServices';

const packet: AgentEvidencePacket = {
  context: 'xrd',
  datasetId: 'frontend-session-test',
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

afterEach(() => {
  clearGoogleApiAccessSession();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function successfulReasoningResponse() {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      success: true,
      fallbackUsed: true,
      output: {
        primaryResult: 'Candidate A',
        metadata: { provider: 'deterministic' },
      },
    }),
  };
}

function fakeGoogleAccounts(accessCredential = 'synthetic-google-api-access'): GoogleAccounts {
  return {
    id: {
      initialize: vi.fn(),
      renderButton: vi.fn(),
      disableAutoSelect: vi.fn(),
    },
    oauth2: {
      initTokenClient: vi.fn((config) => ({
        requestAccessToken: () => config.callback({
          access_token: accessCredential,
          expires_in: 3600,
          scope: 'https://www.googleapis.com/auth/drive.file',
          token_type: 'Bearer',
        }),
      })),
      revoke: vi.fn((_accessToken, callback) => callback?.()),
    },
  };
}

describe('server-session frontend boundary', () => {
  it('bootstraps and validates the current server session with credentials', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        authenticated: true,
        user: {
          provider: 'google',
          displayName: 'Verified Researcher',
          email: 'verified@example.test',
        },
        expiresAt: '2026-07-26T00:00:00.000Z',
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchCurrentSession()).resolves.toMatchObject({
      authenticated: true,
      user: { provider: 'google', displayName: 'Verified Researcher' },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/session'),
      expect.objectContaining({ credentials: 'include', cache: 'no-store' }),
    );
  });

  it('rejects malformed current-session responses at runtime', () => {
    expect(() => validateSessionResponse({
      authenticated: true,
      user: { provider: 'google', subject: 'raw-subject' },
    })).toThrow('Invalid session response');
  });

  it('cannot create a verified session from localStorage or a fake browser profile', () => {
    const authContextPath = fileURLToPath(new URL('../../contexts/AuthContext.tsx', import.meta.url));
    const authSource = readFileSync(authContextPath, 'utf8');

    expect(authSource).not.toContain('localStorage.getItem');
    expect(authSource).not.toContain('signInWithGoogleCredential');
    expect(authSource).not.toContain('getIdentityToken');
    expect(authSource).toContain("user.provider !== 'guest'");
    expect(authSource).toContain('fetchCurrentSession');
  });

  it('keeps guest state explicitly demo-only in the sign-in UI', () => {
    const signInPath = fileURLToPath(
      new URL('../../features/auth/pages/SignIn.tsx', import.meta.url),
    );
    const source = readFileSync(signInPath, 'utf8');

    expect(source).toContain("provider: 'guest'");
    expect(source).toContain('cannot authorize Gemini');
    expect(source).toContain('Email/password account simulation is disabled');
  });

  it('logs out through the server and invalidates frontend authenticated state', async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeSessionInvalidation(listener);
    const fetchMock = vi.fn(async () => ({ ok: true, status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await revokeCurrentSession();
    unsubscribe();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/logout'),
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
    expect(listener).toHaveBeenCalledOnce();
  });
});

describe('protected reasoning client behavior', () => {
  it('uses only the HttpOnly server session boundary for Gemini requests', async () => {
    const fetchMock = vi.fn(async () => successfulReasoningResponse());
    vi.stubGlobal('fetch', fetchMock);

    await callReasoningAPI({ packet, provider: 'gemini-2.5-flash' });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty('Authorization');
  });

  it('maps 401 to sign-in-required state without retrying', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 401 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(callReasoningAPI({ packet, provider: 'gemini-2.5-flash' }))
      .resolves.toEqual({
        success: false,
        error: 'Sign in with Google to use Gemini reasoning',
        errorCode: 'AUTH_REQUIRED',
      });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('maps 429 to beta-limit state without retry loops', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 429 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(callReasoningAPI({ packet, provider: 'gemini-2.5-flash' }))
      .resolves.toMatchObject({ success: false, errorCode: 'GEMINI_QUOTA_EXCEEDED' });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('maps quota 503 to temporarily-unavailable state without retry loops', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 503,
      json: async () => ({ errorCode: 'GEMINI_QUOTA_UNAVAILABLE' }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(callReasoningAPI({ packet, provider: 'gemini-2.5-flash' }))
      .resolves.toMatchObject({ success: false, errorCode: 'GEMINI_QUOTA_UNAVAILABLE' });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('maps authentication 503 without retrying or local fallback', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 503,
      json: async () => ({ error: 'Authentication service unavailable' }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(callReasoningAPI({ packet, provider: 'gemini-2.5-flash' }))
      .resolves.toMatchObject({ success: false, errorCode: 'AUTH_SERVICE_UNAVAILABLE' });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe('redirect and credential-storage safety', () => {
  it('restores only safe same-origin route targets', () => {
    expect(sanitizeRedirectTarget('/workspace/xrd?run=1#result')).toBe(
      '/workspace/xrd?run=1#result',
    );
    expect(createGoogleSignInUrl('/workspace/xrd')).toContain(
      'returnTo=%2Fworkspace%2Fxrd',
    );
  });

  it.each([
    'https://attacker.invalid/path',
    '//attacker.invalid/path',
    '/\\attacker.invalid/path',
    'javascript:alert(1)',
  ])('rejects invalid redirect target %s', (target) => {
    expect(sanitizeRedirectTarget(target)).toBe('/dashboard');
  });

  it('never writes Google API access tokens to localStorage', async () => {
    const localStorage = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    vi.stubGlobal('localStorage', localStorage);

    await requestGoogleApiAccess({
      clientId: 'synthetic-client-id',
      scopes: ['https://www.googleapis.com/auth/drive.file'],
      accounts: fakeGoogleAccounts(),
    });

    expect(localStorage.setItem).not.toHaveBeenCalled();
  });
});
