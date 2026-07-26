import { Redis } from '@upstash/redis';
import { buildPseudonymousUserQuotaPrefix } from './identityHash';
import type { GeminiQuotaConfig } from './quotaConfig';
import {
  GEMINI_QUOTA_NAMESPACE,
  type GeminiQuotaCounterState,
  type GeminiQuotaDecision,
  type GeminiQuotaDimension,
  type GeminiQuotaLimits,
  type GeminiQuotaStore,
  type GeminiQuotaStoreInput,
} from './types';

const BURST_CLEANUP_MARGIN_SECONDS = 30;
const DAILY_CLEANUP_MARGIN_SECONDS = 300;
const DEFAULT_REDIS_TIMEOUT_MS = 2_000;

/**
 * Fixed-window beta limiter. Redis executes the complete check-and-increment
 * operation as one Lua script, so rejection never increments another counter.
 */
export const CONSUME_GEMINI_QUOTA_LUA = `
local burst = tonumber(redis.call("GET", KEYS[1]) or "0")
local user_daily = tonumber(redis.call("GET", KEYS[2]) or "0")
local global_daily = tonumber(redis.call("GET", KEYS[3]) or "0")

if burst >= tonumber(ARGV[1]) then
  return {1, burst, user_daily, global_daily}
end
if user_daily >= tonumber(ARGV[2]) then
  return {2, burst, user_daily, global_daily}
end
if global_daily >= tonumber(ARGV[3]) then
  return {3, burst, user_daily, global_daily}
end

burst = redis.call("INCR", KEYS[1])
if burst == 1 then redis.call("EXPIRE", KEYS[1], tonumber(ARGV[4])) end
user_daily = redis.call("INCR", KEYS[2])
if user_daily == 1 then redis.call("EXPIRE", KEYS[2], tonumber(ARGV[5])) end
global_daily = redis.call("INCR", KEYS[3])
if global_daily == 1 then redis.call("EXPIRE", KEYS[3], tonumber(ARGV[5])) end

return {0, burst, user_daily, global_daily}
`.trim();

export interface RedisEvalClient {
  eval<TArgs extends unknown[], TData = unknown>(
    script: string,
    keys: string[],
    args: TArgs,
  ): Promise<TData>;
}

export interface UpstashGeminiQuotaStoreOptions {
  redis: RedisEvalClient;
  timeoutMs?: number;
}

interface QuotaWindow {
  keys: [string, string, string];
  burstResetAtMs: number;
  dailyResetAtMs: number;
  burstTtlSeconds: number;
  dailyTtlSeconds: number;
}

export class UpstashGeminiQuotaStore implements GeminiQuotaStore {
  private readonly redis: RedisEvalClient;
  private readonly timeoutMs: number;

  constructor(options: UpstashGeminiQuotaStoreOptions) {
    this.redis = options.redis;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_REDIS_TIMEOUT_MS;
  }

  async consume(input: GeminiQuotaStoreInput): Promise<GeminiQuotaDecision> {
    try {
      const window = buildQuotaWindow(input);
      const raw = await withTimeout(
        this.redis.eval(
          CONSUME_GEMINI_QUOTA_LUA,
          window.keys,
          [
            String(input.limits.userBurstLimit),
            String(input.limits.userDailyLimit),
            String(input.limits.globalDailyLimit),
            String(window.burstTtlSeconds),
            String(window.dailyTtlSeconds),
          ],
        ),
        this.timeoutMs,
      );
      return parseRedisDecision(raw, input.limits, input.nowMs, window);
    } catch {
      return { status: 'unavailable' };
    }
  }
}

export function createUpstashGeminiQuotaStore(
  config: GeminiQuotaConfig,
): GeminiQuotaStore {
  return new UpstashGeminiQuotaStore({
    redis: new Redis({
      url: config.redisRestUrl,
      token: config.redisRestToken,
    }),
  });
}

function buildQuotaWindow(input: GeminiQuotaStoreInput): QuotaWindow {
  if (!Number.isSafeInteger(input.nowMs) || input.nowMs < 0) {
    throw new Error('Invalid quota clock');
  }
  const userPrefix = buildPseudonymousUserQuotaPrefix(input.identityDigest);
  const nowSeconds = Math.floor(input.nowMs / 1_000);
  const burstStartSeconds = Math.floor(
    nowSeconds / input.limits.userBurstWindowSeconds,
  ) * input.limits.userBurstWindowSeconds;
  const burstResetSeconds = burstStartSeconds + input.limits.userBurstWindowSeconds;

  const now = new Date(input.nowMs);
  const dayStartSeconds = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  ) / 1_000;
  const dailyResetSeconds = dayStartSeconds + 86_400;

  return {
    keys: [
      `${userPrefix}:burst:${burstStartSeconds}`,
      `${userPrefix}:day:${dayStartSeconds}`,
      `${GEMINI_QUOTA_NAMESPACE}:global:day:${dayStartSeconds}`,
    ],
    burstResetAtMs: burstResetSeconds * 1_000,
    dailyResetAtMs: dailyResetSeconds * 1_000,
    burstTtlSeconds: Math.max(
      1,
      burstResetSeconds - nowSeconds + BURST_CLEANUP_MARGIN_SECONDS,
    ),
    dailyTtlSeconds: Math.max(
      1,
      dailyResetSeconds - nowSeconds + DAILY_CLEANUP_MARGIN_SECONDS,
    ),
  };
}

function parseRedisDecision(
  raw: unknown,
  limits: GeminiQuotaLimits,
  nowMs: number,
  window: QuotaWindow,
): GeminiQuotaDecision {
  if (
    !Array.isArray(raw)
    || raw.length !== 4
    || !raw.every((value) => Number.isSafeInteger(value) && value >= 0)
  ) {
    return { status: 'unavailable' };
  }

  const [code, burstCount, userDailyCount, globalDailyCount] = raw as number[];
  const counters = [
    counterState(
      'user_burst',
      limits.userBurstLimit,
      burstCount,
      window.burstResetAtMs,
      nowMs,
    ),
    counterState(
      'user_daily',
      limits.userDailyLimit,
      userDailyCount,
      window.dailyResetAtMs,
      nowMs,
    ),
    counterState(
      'global_daily',
      limits.globalDailyLimit,
      globalDailyCount,
      window.dailyResetAtMs,
      nowMs,
    ),
  ] as const;

  if (code === 0) {
    if (
      burstCount < 1
      || userDailyCount < 1
      || globalDailyCount < 1
      || burstCount > limits.userBurstLimit
      || userDailyCount > limits.userDailyLimit
      || globalDailyCount > limits.globalDailyLimit
    ) {
      return { status: 'unavailable' };
    }
    return { status: 'allowed', counters };
  }

  const exceeded = code === 1
    ? counters[0]
    : code === 2
      ? counters[1]
      : code === 3
        ? counters[2]
        : undefined;
  if (!exceeded || exceeded.remaining !== 0) {
    return { status: 'unavailable' };
  }

  return {
    ...exceeded,
    status: exceededStatus(exceeded.dimension),
  };
}

function counterState(
  dimension: GeminiQuotaDimension,
  limit: number,
  count: number,
  resetAtMs: number,
  nowMs: number,
): GeminiQuotaCounterState {
  return {
    dimension,
    limit,
    remaining: Math.max(0, limit - count),
    resetAt: new Date(resetAtMs).toISOString(),
    retryAfterSeconds: Math.max(1, Math.ceil((resetAtMs - nowMs) / 1_000)),
  };
}

function exceededStatus(
  dimension: GeminiQuotaDimension,
): 'user_burst_exceeded' | 'user_daily_exceeded' | 'global_daily_exceeded' {
  if (dimension === 'user_burst') return 'user_burst_exceeded';
  if (dimension === 'user_daily') return 'user_daily_exceeded';
  return 'global_daily_exceeded';
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error('Quota store request timed out')),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
