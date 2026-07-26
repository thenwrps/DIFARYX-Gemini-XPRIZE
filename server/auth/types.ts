export interface VerifiedGoogleIdentity {
  provider: 'google';
  subject: string;
  displayName: string;
  email?: string;
}

export interface GoogleIdentityVerifier {
  readonly configured: boolean;
  verifyIdentityToken(identityToken: string): Promise<VerifiedGoogleIdentity>;
}

export class IdentityVerificationError extends Error {
  constructor(
    public readonly category: 'invalid' | 'unavailable',
  ) {
    super(category === 'unavailable'
      ? 'Identity verification unavailable'
      : 'Invalid identity credential');
  }
}

export interface PublicSessionUser {
  provider: 'google';
  displayName: string;
  email?: string;
}

export interface AuthenticatedSession {
  identity: VerifiedGoogleIdentity;
  user: PublicSessionUser;
  expiresAt: string;
}

export interface SessionManager {
  create(identity: VerifiedGoogleIdentity): Promise<{
    token: string;
    session: AuthenticatedSession;
  }>;
  read(token: string): Promise<AuthenticatedSession | null>;
  revoke(token: string): Promise<void>;
}

export interface SessionStore {
  set(key: string, sealedSession: string, ttlSeconds: number): Promise<void>;
  get(key: string): Promise<string | null>;
  delete(key: string): Promise<void>;
}

export interface GoogleOAuthClient {
  createAuthorizationUrl(input: {
    state: string;
    codeChallenge: string;
  }): string;
  exchangeAuthorizationCode(code: string, codeVerifier: string): Promise<string>;
}
