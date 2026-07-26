declare const googleApiAccessTokenBrand: unique symbol;

export type GoogleApiAccessToken = string & {
  readonly [googleApiAccessTokenBrand]: 'google-api-access-token';
};

export function asGoogleApiAccessToken(value: string): GoogleApiAccessToken {
  if (!value.trim()) {
    throw new Error('Google API access credential is missing');
  }
  return value as GoogleApiAccessToken;
}
