import { describe, expect, it, vi } from 'vitest';
import { createGeminiQuotaService } from '../quota/geminiQuotaService';
import {
  buildPseudonymousUserQuotaPrefix,
  hashVerifiedGoogleSubject,
} from '../quota/identityHash';
import type { GeminiQuotaConfig } from '../quota/quotaConfig';
import type { GeminiQuotaStoreInput } from '../quota/types';

const config: GeminiQuotaConfig = {
  redisRestUrl: 'https://synthetic-quota.upstash.io',
  redisRestToken: 'synthetic-rest-token',
  identityHashSecret: 'synthetic-independent-hmac-secret',
  userDailyLimit: 5,
  userBurstLimit: 2,
  userBurstWindowSeconds: 60,
  globalDailyLimit: 100,
};

describe('pseudonymous Gemini quota identity', () => {
  it('is stable for the same verified subject and secret', () => {
    const first = hashVerifiedGoogleSubject('secret-a', 'verified-subject-a');
    const second = hashVerifiedGoogleSubject('secret-a', 'verified-subject-a');

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  it('changes when the verified subject changes', () => {
    expect(hashVerifiedGoogleSubject('secret-a', 'verified-subject-a'))
      .not.toBe(hashVerifiedGoogleSubject('secret-a', 'verified-subject-b'));
  });

  it('changes when the HMAC secret changes', () => {
    expect(hashVerifiedGoogleSubject('secret-a', 'verified-subject-a'))
      .not.toBe(hashVerifiedGoogleSubject('secret-b', 'verified-subject-a'));
  });

  it('never passes the raw subject into Redis keys or logs', async () => {
    const rawSubject = 'raw-google-subject-must-not-escape';
    let storeInput: GeminiQuotaStoreInput | undefined;
    const logs: string[] = [];
    const store = {
      consume: vi.fn(async (input: GeminiQuotaStoreInput) => {
        storeInput = input;
        return { status: 'unavailable' as const };
      }),
    };
    const service = createGeminiQuotaService({
      config,
      store,
      clock: () => 0,
    });

    await service.consume(rawSubject);
    const keyPrefix = buildPseudonymousUserQuotaPrefix(
      storeInput?.identityDigest ?? '',
    );
    const serialized = JSON.stringify({ keyPrefix, logs, storeInput });

    expect(keyPrefix).toContain('difaryx:quota:v1:user:');
    expect(serialized).not.toContain(rawSubject);
    expect(logs).toEqual([]);
  });
});
