export interface VerifiedGoogleIdentity {
  provider: 'google';
  subject: string;
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
