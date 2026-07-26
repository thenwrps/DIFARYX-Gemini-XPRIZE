export interface AuthConfig {
  appBaseUrl: string;
  googleClientId: string;
  googleClientSecret: string;
  googleRedirectUri: string;
  redisRestUrl: string;
  redisRestToken: string;
  sessionSecret: string;
  sessionTtlSeconds: number;
  secureCookies: boolean;
}

export type AuthConfigIssue =
  | 'app_base_url'
  | 'google_client_id'
  | 'google_client_secret'
  | 'google_redirect_uri'
  | 'redis_url'
  | 'redis_token'
  | 'session_secret'
  | 'session_ttl_seconds';

export type AuthConfigResult =
  | { ok: true; value: AuthConfig }
  | { ok: false; issues: readonly AuthConfigIssue[] };

const DEFAULT_SESSION_TTL_SECONDS = 8 * 60 * 60;

export function loadAuthConfig(
  environment: NodeJS.ProcessEnv,
  nodeEnv: string,
): AuthConfigResult {
  const issues: AuthConfigIssue[] = [];
  const appBaseUrl = readAppBaseUrl(environment.APP_BASE_URL);
  const googleClientId = readValue(environment.GOOGLE_OAUTH_CLIENT_ID);
  const googleClientSecret = readValue(environment.GOOGLE_OAUTH_CLIENT_SECRET);
  const googleRedirectUri = readRedirectUrl(environment.GOOGLE_OAUTH_REDIRECT_URI);
  const redisRestUrl = readHttpsUrl(environment.UPSTASH_REDIS_REST_URL);
  const redisRestToken = readValue(environment.UPSTASH_REDIS_REST_TOKEN);
  const sessionSecret = readSecret(environment.DIFARYX_SESSION_SECRET);
  const sessionTtlSeconds = readPositiveInteger(
    environment.DIFARYX_SESSION_TTL_SECONDS,
    DEFAULT_SESSION_TTL_SECONDS,
  );

  if (!appBaseUrl) issues.push('app_base_url');
  if (!googleClientId) issues.push('google_client_id');
  if (!googleClientSecret) issues.push('google_client_secret');
  if (!googleRedirectUri) issues.push('google_redirect_uri');
  if (!redisRestUrl) issues.push('redis_url');
  if (!redisRestToken) issues.push('redis_token');
  if (!sessionSecret) issues.push('session_secret');
  if (!sessionTtlSeconds) issues.push('session_ttl_seconds');

  if (
    issues.length > 0
    || !appBaseUrl
    || !googleClientId
    || !googleClientSecret
    || !googleRedirectUri
    || !redisRestUrl
    || !redisRestToken
    || !sessionSecret
    || !sessionTtlSeconds
  ) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    value: {
      appBaseUrl,
      googleClientId,
      googleClientSecret,
      googleRedirectUri,
      redisRestUrl,
      redisRestToken,
      sessionSecret,
      sessionTtlSeconds,
      secureCookies: nodeEnv === 'production',
    },
  };
}

function readValue(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function readSecret(value: string | undefined): string | undefined {
  const normalized = readValue(value);
  return normalized && normalized.length >= 32 ? normalized : undefined;
}

function readPositiveInteger(value: string | undefined, fallback: number): number | undefined {
  if (value === undefined || value.trim() === '') return fallback;
  if (!/^[1-9]\d*$/.test(value.trim())) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= 7 * 24 * 60 * 60
    ? parsed
    : undefined;
}

function readHttpsUrl(value: string | undefined): string | undefined {
  const url = readWebUrl(value);
  if (!url || url.protocol !== 'https:' || url.search || url.hash) return undefined;
  return url.toString().replace(/\/$/, '');
}

function readAppBaseUrl(value: string | undefined): string | undefined {
  const url = readWebUrl(value);
  if (!url || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) {
    return undefined;
  }
  return url.origin;
}

function readRedirectUrl(value: string | undefined): string | undefined {
  const url = readWebUrl(value);
  if (!url || url.search || url.hash || url.pathname === '/') return undefined;
  return url.toString();
}

function readWebUrl(value: string | undefined): URL | undefined {
  const normalized = readValue(value);
  if (!normalized) return undefined;
  try {
    const parsed = new URL(normalized);
    const localHttp = parsed.protocol === 'http:'
      && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');
    if ((parsed.protocol !== 'https:' && !localHttp) || parsed.username || parsed.password) {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}
