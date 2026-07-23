import { describe, expect, it } from 'vitest';
import {
  CONSUME_GEMINI_QUOTA_LUA,
  type RedisEvalClient,
  UpstashGeminiQuotaStore,
} from '../quota/upstashGeminiQuotaStore';
import type {
  GeminiQuotaLimits,
  GeminiQuotaStoreInput,
} from '../quota/types';

const USER_A = 'a'.repeat(64);
const USER_B = 'b'.repeat(64);
const DEFAULT_NOW = Date.parse('2026-07-23T12:34:45.500Z');
const DEFAULT_LIMITS: GeminiQuotaLimits = {
  userDailyLimit: 5,
  userBurstLimit: 2,
  userBurstWindowSeconds: 60,
  globalDailyLimit: 100,
};

interface EvalCall {
  script: string;
  keys: string[];
  args: string[];
}

class AtomicRedisDouble implements RedisEvalClient {
  readonly counters = new Map<string, number>();
  readonly expiryTtls = new Map<string, number>();
  readonly calls: EvalCall[] = [];
  private tail: Promise<unknown> = Promise.resolve();

  eval<TArgs extends unknown[], TData = unknown>(
    script: string,
    keys: string[],
    args: TArgs,
  ): Promise<TData> {
    const task = this.tail.then(() => this.execute(
      script,
      keys,
      args.map(String),
    ));
    this.tail = task.catch(() => undefined);
    return task as Promise<TData>;
  }

  private execute(script: string, keys: string[], args: string[]): number[] {
    this.calls.push({ script, keys: [...keys], args: [...args] });
    const [burstLimit, dailyLimit, globalLimit, burstTtl, dailyTtl] =
      args.map(Number);
    const burst = this.counters.get(keys[0]) ?? 0;
    const daily = this.counters.get(keys[1]) ?? 0;
    const global = this.counters.get(keys[2]) ?? 0;

    if (burst >= burstLimit) return [1, burst, daily, global];
    if (daily >= dailyLimit) return [2, burst, daily, global];
    if (global >= globalLimit) return [3, burst, daily, global];

    const counts = [burst + 1, daily + 1, global + 1];
    keys.forEach((key, index) => {
      const wasMissing = !this.counters.has(key);
      this.counters.set(key, counts[index]);
      if (wasMissing) {
        this.expiryTtls.set(key, index === 0 ? burstTtl : dailyTtl);
      }
    });
    return [0, ...counts];
  }
}

function input(
  identityDigest = USER_A,
  limits: GeminiQuotaLimits = DEFAULT_LIMITS,
  nowMs = DEFAULT_NOW,
): GeminiQuotaStoreInput {
  return { identityDigest, limits, nowMs };
}

describe('atomic Upstash Gemini quota store', () => {
  it('increments all three counters with one Lua evaluation', async () => {
    const redis = new AtomicRedisDouble();
    const store = new UpstashGeminiQuotaStore({ redis });

    const decision = await store.consume(input());

    expect(decision.status).toBe('allowed');
    expect([...redis.counters.values()]).toEqual([1, 1, 1]);
    expect(redis.calls).toHaveLength(1);
    expect(redis.calls[0].script).toBe(CONSUME_GEMINI_QUOTA_LUA);
    expect(redis.calls[0].keys).toHaveLength(3);
  });

  it('rejects exhausted burst quota without incrementing daily or global', async () => {
    const redis = new AtomicRedisDouble();
    const store = new UpstashGeminiQuotaStore({ redis });
    const limits = { ...DEFAULT_LIMITS, userBurstLimit: 1 };

    await store.consume(input(USER_A, limits));
    const rejected = await store.consume(input(USER_A, limits));

    expect(rejected.status).toBe('user_burst_exceeded');
    expect([...redis.counters.values()]).toEqual([1, 1, 1]);
  });

  it('rejects exhausted user daily quota without incrementing other counters', async () => {
    const redis = new AtomicRedisDouble();
    const store = new UpstashGeminiQuotaStore({ redis });
    const limits = {
      ...DEFAULT_LIMITS,
      userBurstLimit: 10,
      userDailyLimit: 1,
    };

    await store.consume(input(USER_A, limits));
    const rejected = await store.consume(input(
      USER_A,
      limits,
      DEFAULT_NOW + 60_000,
    ));

    expect(rejected.status).toBe('user_daily_exceeded');
    expect([...redis.counters.values()]).toEqual([1, 1, 1]);
  });

  it('rejects exhausted global daily quota without creating user counters', async () => {
    const redis = new AtomicRedisDouble();
    const store = new UpstashGeminiQuotaStore({ redis });
    const limits = { ...DEFAULT_LIMITS, globalDailyLimit: 1 };

    await store.consume(input(USER_A, limits));
    const rejected = await store.consume(input(USER_B, limits));

    expect(rejected.status).toBe('global_daily_exceeded');
    expect([...redis.counters.keys()].some((key) => key.includes(USER_B))).toBe(false);
    expect([...redis.counters.values()]).toEqual([1, 1, 1]);
  });

  it('does not permit concurrent over-allocation', async () => {
    const redis = new AtomicRedisDouble();
    const store = new UpstashGeminiQuotaStore({ redis });
    const decisions = await Promise.all(
      Array.from({ length: 20 }, () => store.consume(input())),
    );

    expect(decisions.filter((item) => item.status === 'allowed')).toHaveLength(2);
    expect(decisions.filter((item) => item.status === 'user_burst_exceeded'))
      .toHaveLength(18);
    expect([...redis.counters.values()]).toEqual([2, 2, 2]);
  });

  it('uses fixed-minute and UTC-day keys with cleanup expiry margins', async () => {
    const redis = new AtomicRedisDouble();
    const store = new UpstashGeminiQuotaStore({ redis });

    const decision = await store.consume(input());
    const call = redis.calls[0];
    const nowSeconds = Math.floor(DEFAULT_NOW / 1_000);
    const minuteStart = Math.floor(nowSeconds / 60) * 60;
    const dayStart = Date.parse('2026-07-23T00:00:00.000Z') / 1_000;
    const expectedBurstTtl = minuteStart + 60 - nowSeconds + 30;
    const expectedDailyTtl = dayStart + 86_400 - nowSeconds + 300;

    expect(call.keys[0].endsWith(`:burst:${minuteStart}`)).toBe(true);
    expect(call.keys[1].endsWith(`:day:${dayStart}`)).toBe(true);
    expect(call.keys[2]).toBe(`difaryx:quota:v1:global:day:${dayStart}`);
    expect(call.args.slice(3)).toEqual([
      String(expectedBurstTtl),
      String(expectedDailyTtl),
    ]);
    expect(decision.status === 'allowed' && decision.counters[0]).toMatchObject({
      dimension: 'user_burst',
      resetAt: '2026-07-23T12:35:00.000Z',
      retryAfterSeconds: 15,
    });
    expect(redis.expiryTtls.size).toBe(3);
  });

  it('resets burst keys at the next fixed window and daily keys at UTC midnight', async () => {
    const redis = new AtomicRedisDouble();
    const store = new UpstashGeminiQuotaStore({ redis });
    const generous = {
      ...DEFAULT_LIMITS,
      userDailyLimit: 10,
      globalDailyLimit: 10,
    };

    await store.consume(input(USER_A, generous));
    await store.consume(input(USER_A, generous, DEFAULT_NOW + 60_000));
    const nextDay = await store.consume(input(
      USER_A,
      generous,
      Date.parse('2026-07-24T00:00:01.000Z'),
    ));

    expect(nextDay.status).toBe('allowed');
    expect([...redis.counters.keys()].filter((key) => key.includes(':burst:')))
      .toHaveLength(3);
    expect([...redis.counters.keys()].filter((key) => key.includes(':day:')))
      .toHaveLength(4);
  });

  it.each([
    { response: 'not-numeric' },
    [0, 1, 1],
    [0, '1', 1, 1],
    [0, -1, 1, 1],
    [9, 1, 1, 1],
  ])('treats malformed Redis response %# as unavailable', async (response) => {
    const redis = {
      eval: async () => response,
    } as RedisEvalClient;
    const store = new UpstashGeminiQuotaStore({ redis });

    await expect(store.consume(input())).resolves.toEqual({
      status: 'unavailable',
    });
  });

  it('fails closed on Redis errors', async () => {
    const redis: RedisEvalClient = {
      eval: async () => {
        throw new Error('synthetic Redis failure with internal details');
      },
    };
    const store = new UpstashGeminiQuotaStore({ redis });

    await expect(store.consume(input())).resolves.toEqual({
      status: 'unavailable',
    });
  });

  it('fails closed on Redis timeouts', async () => {
    const redis: RedisEvalClient = {
      eval: async () => new Promise<never>(() => undefined),
    };
    const store = new UpstashGeminiQuotaStore({ redis, timeoutMs: 5 });

    await expect(store.consume(input())).resolves.toEqual({
      status: 'unavailable',
    });
  });
});
