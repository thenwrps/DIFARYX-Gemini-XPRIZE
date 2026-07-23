import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentEvidencePacket } from '../../agent/mcp/types';
import {
  clearIdentitySession,
  establishIdentitySession,
  getIdentityToken,
  invalidateLegacyBrowserAuthState,
} from '../auth/identitySession';
import { callReasoningAPI } from '../api/reasoningClient';
import {
  clearGoogleApiAccessSession,
  getGoogleApiAccessToken,
  requestGoogleApiAccess,
  type GoogleApiAuthorizationOptions,
} from '../google/googleApiAuthorization';
import type { GoogleAccounts } from '../google/googleIdentityServices';
import {
  asGoogleIdentityToken,
} from '../google/tokenTypes';

const packet: AgentEvidencePacket = {
  context: 'xrd',
  datasetId: 'frontend-identity-test',
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
  clearIdentitySession();
  clearGoogleApiAccessSession();
  vi.unstubAllGlobals();
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
        claims: [],
        supportingEvidence: [],
        contradictingEvidence: [],
        interpretation: '',
        validationStatus: 'validation_limited',
        validationGap: [],
        confidence: { measurementQuality: 0.8, interpretation: 0.7 },
        missingInformation: [],
        requiredNextAction: [],
        metadata: {
          provider: 'deterministic',
          model: 'deterministic-v1',
          timestamp: new Date(0).toISOString(),
        },
      },
    }),
  };
}

function fakeGoogleAccounts(
  accessCredential = 'synthetic-google-api-access',
): GoogleAccounts {
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

describe('DIFARYX identity-token request boundary', () => {
  it('attaches only the in-memory identity credential to Gemini requests', async () => {
    const fetchMock = vi.fn(async () => successfulReasoningResponse());
    vi.stubGlobal('fetch', fetchMock);
    establishIdentitySession(
      asGoogleIdentityToken('synthetic-google-id-credential'),
      Date.now() + 60_000,
    );

    await callReasoningAPI({
      packet,
      provider: 'gemini-2.5-flash',
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer synthetic-google-id-credential',
      },
    });
  });

  it('never attaches a Google API access credential to DIFARYX reasoning', async () => {
    const accounts = fakeGoogleAccounts();
    const options: GoogleApiAuthorizationOptions = {
      clientId: 'synthetic-client-id',
      scopes: ['https://www.googleapis.com/auth/drive.file'],
      accounts,
    };
    await requestGoogleApiAccess(options);
    const fetchMock = vi.fn(async () => successfulReasoningResponse());
    vi.stubGlobal('fetch', fetchMock);

    await callReasoningAPI({
      packet,
      provider: 'gemini-2.5-flash',
    });

    expect(getGoogleApiAccessToken()).toBe('synthetic-google-api-access');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      headers: {
        'Content-Type': 'application/json',
      },
    });
    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty('Authorization');
  });

  it('does not expose an identity credential as Google API authorization', () => {
    establishIdentitySession(
      asGoogleIdentityToken('synthetic-google-id-credential'),
      Date.now() + 60_000,
    );

    expect(getIdentityToken()).toBe('synthetic-google-id-credential');
    expect(getGoogleApiAccessToken()).toBeNull();
  });

  it('clears stale identity after one 401 without retrying', async () => {
    establishIdentitySession(
      asGoogleIdentityToken('synthetic-stale-id-credential'),
      Date.now() + 60_000,
    );
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 401,
    }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await callReasoningAPI({
      packet,
      provider: 'gemini-2.5-flash',
    });

    expect(response).toEqual({
      success: false,
      error: 'Sign in with Google to use Gemini reasoning',
    });
    expect(getIdentityToken()).toBeNull();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('surfaces a 429 beta limit without retrying or clearing identity', async () => {
    establishIdentitySession(
      asGoogleIdentityToken('synthetic-google-id-credential'),
      Date.now() + 60_000,
    );
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 429,
      json: async () => ({
        errorCode: 'GEMINI_QUOTA_EXCEEDED',
        quota: {
          dimension: 'user_burst',
          retryAfterSeconds: 30,
        },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await callReasoningAPI({
      packet,
      provider: 'gemini-2.5-flash',
    });

    expect(response).toEqual({
      success: false,
      error: 'Gemini beta limit reached. Please try again after the reset, or use Scientific Baseline Mode now.',
      errorCode: 'GEMINI_QUOTA_EXCEEDED',
    });
    expect(getIdentityToken()).toBe('synthetic-google-id-credential');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('surfaces quota-related 503 without retrying', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 503,
      json: async () => ({
        errorCode: 'GEMINI_QUOTA_UNAVAILABLE',
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await callReasoningAPI({
      packet,
      provider: 'gemini-2.5-flash',
    });

    expect(response).toEqual({
      success: false,
      error: 'Gemini beta usage is temporarily unavailable. Scientific Baseline Mode is still available.',
      errorCode: 'GEMINI_QUOTA_UNAVAILABLE',
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('does not attach identity to deterministic requests', async () => {
    establishIdentitySession(
      asGoogleIdentityToken('synthetic-google-id-credential'),
      Date.now() + 60_000,
    );
    const fetchMock = vi.fn(async () => successfulReasoningResponse());
    vi.stubGlobal('fetch', fetchMock);

    await callReasoningAPI({ packet, provider: 'deterministic' });

    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty('Authorization');
  });
});

describe('in-memory credential lifecycle', () => {
  it('invalidates only obsolete authentication storage keys', () => {
    const values = new Map([
      ['demoAuth', 'true'],
      ['demoProfile', 'profile'],
      ['difaryx_google_demo_user', 'legacy-profile'],
      ['difaryx_google_user_token', 'legacy-access'],
      ['difaryx-project-data', 'preserve'],
    ]);
    invalidateLegacyBrowserAuthState({
      removeItem: (key) => values.delete(key),
    });

    expect(values).toEqual(new Map([['difaryx-project-data', 'preserve']]));
  });

  it('contains no active callback-fragment or credential persistence code', () => {
    const signInPath = fileURLToPath(
      new URL('../../features/auth/pages/SignIn.tsx', import.meta.url),
    );
    const authContextPath = fileURLToPath(
      new URL('../../contexts/AuthContext.tsx', import.meta.url),
    );
    const workspaceHookPath = fileURLToPath(
      new URL('../../hooks/useX7UniversalHook.ts', import.meta.url),
    );
    const activeSource = [
      readFileSync(signInPath, 'utf8'),
      readFileSync(authContextPath, 'utf8'),
      readFileSync(workspaceHookPath, 'utf8'),
    ].join('\n');

    expect(activeSource).not.toContain('response_type=token');
    expect(activeSource).not.toContain('window.location.hash');
    expect(activeSource).not.toContain('localStorage.setItem("difaryx_google_user_token"');
    expect(activeSource).not.toContain("localStorage.setItem('difaryx_google_user_token'");
    expect(activeSource).not.toContain('[AuthCallback] Full URL');
  });
});
