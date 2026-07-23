declare const googleIdentityTokenBrand: unique symbol;
declare const googleApiAccessTokenBrand: unique symbol;

export type GoogleIdentityToken = string & {
  readonly [googleIdentityTokenBrand]: 'google-identity-token';
};

export type GoogleApiAccessToken = string & {
  readonly [googleApiAccessTokenBrand]: 'google-api-access-token';
};

export function asGoogleIdentityToken(value: string): GoogleIdentityToken {
  if (!value.trim()) {
    throw new Error('Google identity credential is missing');
  }
  return value as GoogleIdentityToken;
}

export function asGoogleApiAccessToken(value: string): GoogleApiAccessToken {
  if (!value.trim()) {
    throw new Error('Google API access credential is missing');
  }
  return value as GoogleApiAccessToken;
}
