const GOOGLE_CLIENT_ID_ENV_KEYS = [
  'VITE_GOOGLE_API_CLIENT_ID',
] as const;

export type GoogleClientIdEnvKey = (typeof GOOGLE_CLIENT_ID_ENV_KEYS)[number];

export function getGoogleOAuthClientId(
  env: Pick<ImportMetaEnv, GoogleClientIdEnvKey> = import.meta.env,
): string | null {
  for (const key of GOOGLE_CLIENT_ID_ENV_KEYS) {
    const value = env[key]?.trim();
    if (value) return value;
  }

  return null;
}

export function getGoogleOAuthClientIdSource(
  env: Pick<ImportMetaEnv, GoogleClientIdEnvKey> = import.meta.env,
): GoogleClientIdEnvKey | null {
  for (const key of GOOGLE_CLIENT_ID_ENV_KEYS) {
    if (env[key]?.trim()) return key;
  }

  return null;
}
