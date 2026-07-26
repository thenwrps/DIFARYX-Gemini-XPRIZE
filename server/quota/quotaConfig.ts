import type { GeminiQuotaLimits } from './types';

export interface GeminiQuotaConfig extends GeminiQuotaLimits {
  redisRestUrl: string;
  redisRestToken: string;
  identityHashSecret: string;
}

export type GeminiQuotaConfigIssue =
  | 'redis_url'
  | 'redis_token'
  | 'identity_hash_secret'
  | 'user_daily_limit'
  | 'user_burst_limit'
  | 'user_burst_window_seconds'
  | 'global_daily_limit';

export type GeminiQuotaConfigResult =
  | { ok: true; value: GeminiQuotaConfig }
  | { ok: false; issues: readonly GeminiQuotaConfigIssue[] };

const DEFAULT_USER_DAILY_LIMIT = 5;
const DEFAULT_USER_BURST_LIMIT = 2;
const DEFAULT_USER_BURST_WINDOW_SECONDS = 60;

/**
 * Quota configuration is parsed without throwing so health and deterministic
 * execution stay available. Real Gemini execution checks `ok` and fails closed.
 */
export function loadGeminiQuotaConfig(
  environment: NodeJS.ProcessEnv = process.env,
): GeminiQuotaConfigResult {
  const issues: GeminiQuotaConfigIssue[] = [];
  const redisRestUrl = readHttpsUrl(environment.UPSTASH_REDIS_REST_URL);
  const redisRestToken = readRequiredValue(environment.UPSTASH_REDIS_REST_TOKEN);
  const identityHashSecret = readRequiredValue(environment.QUOTA_ID_HASH_SECRET);
  const userDailyLimit = readPositiveSafeInteger(
    environment.GEMINI_USER_DAILY_LIMIT,
    DEFAULT_USER_DAILY_LIMIT,
  );
  const userBurstLimit = readPositiveSafeInteger(
    environment.GEMINI_USER_BURST_LIMIT,
    DEFAULT_USER_BURST_LIMIT,
  );
  const userBurstWindowSeconds = readPositiveSafeInteger(
    environment.GEMINI_USER_BURST_WINDOW_SECONDS,
    DEFAULT_USER_BURST_WINDOW_SECONDS,
  );
  const globalDailyLimit = readPositiveSafeInteger(
    environment.GEMINI_GLOBAL_DAILY_LIMIT,
  );

  if (!redisRestUrl) issues.push('redis_url');
  if (!redisRestToken) issues.push('redis_token');
  if (!identityHashSecret) issues.push('identity_hash_secret');
  if (!userDailyLimit) issues.push('user_daily_limit');
  if (!userBurstLimit) issues.push('user_burst_limit');
  if (!userBurstWindowSeconds) issues.push('user_burst_window_seconds');
  if (!globalDailyLimit) issues.push('global_daily_limit');

  if (
    issues.length > 0
    || !redisRestUrl
    || !redisRestToken
    || !identityHashSecret
    || !userDailyLimit
    || !userBurstLimit
    || !userBurstWindowSeconds
    || !globalDailyLimit
  ) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    value: {
      redisRestUrl,
      redisRestToken,
      identityHashSecret,
      userDailyLimit,
      userBurstLimit,
      userBurstWindowSeconds,
      globalDailyLimit,
    },
  };
}

function readRequiredValue(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function readHttpsUrl(value: string | undefined): string | undefined {
  const normalized = readRequiredValue(value);
  if (!normalized) return undefined;
  try {
    const parsed = new URL(normalized);
    if (
      parsed.protocol !== 'https:'
      || parsed.username
      || parsed.password
      || parsed.search
      || parsed.hash
    ) {
      return undefined;
    }
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return undefined;
  }
}

function readPositiveSafeInteger(
  value: string | undefined,
  fallback?: number,
): number | undefined {
  if (value === undefined || value.trim() === '') return fallback;
  const normalized = value.trim();
  if (!/^[1-9]\d*$/.test(normalized)) return undefined;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}
