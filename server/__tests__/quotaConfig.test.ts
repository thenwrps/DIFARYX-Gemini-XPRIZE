import { describe, expect, it } from 'vitest';
import { loadServerConfig } from '../config';
import { resolveReasoningExecutionPolicy } from '../llm/executionPolicy';
import { loadGeminiQuotaConfig } from '../quota/quotaConfig';

const VALID_ENVIRONMENT: NodeJS.ProcessEnv = {
  UPSTASH_REDIS_REST_URL: 'https://synthetic-quota.upstash.io',
  UPSTASH_REDIS_REST_TOKEN: 'synthetic-rest-token',
  QUOTA_ID_HASH_SECRET: 'synthetic-independent-hmac-secret',
  GEMINI_GLOBAL_DAILY_LIMIT: '100',
};

describe('Gemini quota configuration', () => {
  it('accepts explicit server configuration with safe beta defaults', () => {
    expect(loadGeminiQuotaConfig(VALID_ENVIRONMENT)).toEqual({
      ok: true,
      value: {
        redisRestUrl: 'https://synthetic-quota.upstash.io',
        redisRestToken: 'synthetic-rest-token',
        identityHashSecret: 'synthetic-independent-hmac-secret',
        userDailyLimit: 5,
        userBurstLimit: 2,
        userBurstWindowSeconds: 60,
        globalDailyLimit: 100,
      },
    });
  });

  it('requires an explicit global daily limit', () => {
    const result = loadGeminiQuotaConfig({
      ...VALID_ENVIRONMENT,
      GEMINI_GLOBAL_DAILY_LIMIT: undefined,
    });

    expect(result).toMatchObject({
      ok: false,
      issues: ['global_daily_limit'],
    });
  });

  it.each([
    ['UPSTASH_REDIS_REST_URL', undefined],
    ['UPSTASH_REDIS_REST_URL', 'http://insecure.example.test'],
    ['UPSTASH_REDIS_REST_URL', 'not-a-url'],
    ['UPSTASH_REDIS_REST_TOKEN', undefined],
  ])('rejects missing or invalid Redis setting %s', (name, value) => {
    const result = loadGeminiQuotaConfig({
      ...VALID_ENVIRONMENT,
      [name]: value,
    });

    expect(result.ok).toBe(false);
  });

  it('requires a distinct quota identity hash secret setting', () => {
    const result = loadGeminiQuotaConfig({
      ...VALID_ENVIRONMENT,
      QUOTA_ID_HASH_SECRET: undefined,
      GEMINI_API_KEY: 'synthetic-provider-key',
    });

    expect(result).toMatchObject({
      ok: false,
      issues: ['identity_hash_secret'],
    });
  });

  it.each([
    'GEMINI_USER_DAILY_LIMIT',
    'GEMINI_USER_BURST_LIMIT',
    'GEMINI_USER_BURST_WINDOW_SECONDS',
    'GEMINI_GLOBAL_DAILY_LIMIT',
  ])('rejects malformed values for %s', (name) => {
    for (const invalid of [
      'invalid',
      '0',
      '-1',
      '1.5',
      '9007199254740992',
    ]) {
      const result = loadGeminiQuotaConfig({
        ...VALID_ENVIRONMENT,
        [name]: invalid,
      });
      expect(result.ok, `${name} accepted ${invalid}`).toBe(false);
    }
  });

  it('does not require quota configuration for deterministic execution', () => {
    const config = loadServerConfig({
      NODE_ENV: 'production',
      GEMINI_PROVIDER_MODE: 'developer',
      GEMINI_API_KEY: 'synthetic-provider-key',
      GEMINI_MODEL: 'gemini-2.5-flash',
    });

    expect(config.geminiQuota.ok).toBe(false);
    expect(resolveReasoningExecutionPolicy('deterministic', config)).toEqual({
      mode: 'no_gemini',
      requiresGoogleIdentity: false,
      consumesGeminiQuota: false,
    });
  });
});
