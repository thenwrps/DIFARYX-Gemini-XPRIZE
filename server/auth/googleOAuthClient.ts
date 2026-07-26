import { CodeChallengeMethod, OAuth2Client } from 'google-auth-library';
import type { AuthConfig } from './authConfig';
import type { GoogleOAuthClient } from './types';

export function createGoogleOAuthClient(config: AuthConfig): GoogleOAuthClient {
  const client = new OAuth2Client({
    clientId: config.googleClientId,
    clientSecret: config.googleClientSecret,
    redirectUri: config.googleRedirectUri,
  });

  return {
    createAuthorizationUrl({ state, codeChallenge }) {
      return client.generateAuthUrl({
        access_type: 'online',
        scope: ['openid', 'email', 'profile'],
        include_granted_scopes: true,
        prompt: 'select_account',
        state,
        code_challenge: codeChallenge,
        code_challenge_method: CodeChallengeMethod.S256,
      });
    },

    async exchangeAuthorizationCode(code, codeVerifier) {
      try {
        const { tokens } = await client.getToken({
          code,
          codeVerifier,
          redirect_uri: config.googleRedirectUri,
        });
        if (!tokens.id_token) throw new Error('Missing identity token');
        return tokens.id_token;
      } catch {
        throw new Error('Google authorization exchange failed');
      }
    },
  };
}
