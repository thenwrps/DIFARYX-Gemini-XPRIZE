import { OAuth2Client } from 'google-auth-library';
import {
  IdentityVerificationError,
  type GoogleIdentityVerifier,
  type VerifiedGoogleIdentity,
} from './types';

const GOOGLE_IDENTITY_ISSUERS = new Set([
  'accounts.google.com',
  'https://accounts.google.com',
]);

interface GoogleLoginTicket {
  getPayload(): {
    iss?: string;
    sub?: string;
    exp?: number;
  } | undefined;
}

interface GoogleIdTokenClient {
  verifyIdToken(options: {
    idToken: string;
    audience: string;
  }): Promise<GoogleLoginTicket>;
}

export interface GoogleIdentityVerifierOptions {
  clientId?: string;
  client?: GoogleIdTokenClient;
  now?: () => number;
}

export function createGoogleIdentityVerifier(
  options: GoogleIdentityVerifierOptions,
): GoogleIdentityVerifier {
  const clientId = options.clientId?.trim();
  if (!clientId) {
    return {
      configured: false,
      async verifyIdentityToken() {
        throw new IdentityVerificationError('unavailable');
      },
    };
  }

  const client = options.client ?? new OAuth2Client();
  const now = options.now ?? Date.now;

  return {
    configured: true,
    async verifyIdentityToken(identityToken: string): Promise<VerifiedGoogleIdentity> {
      try {
        const ticket = await client.verifyIdToken({
          idToken: identityToken,
          audience: clientId,
        });
        const payload = ticket.getPayload();
        if (
          !payload?.sub
          || !payload.iss
          || !GOOGLE_IDENTITY_ISSUERS.has(payload.iss)
          || typeof payload.exp !== 'number'
          || payload.exp * 1000 <= now()
        ) {
          throw new IdentityVerificationError('invalid');
        }
        return {
          provider: 'google',
          subject: payload.sub,
        };
      } catch (error) {
        if (error instanceof IdentityVerificationError) throw error;
        throw new IdentityVerificationError('invalid');
      }
    },
  };
}
