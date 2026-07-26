import { hashVerifiedGoogleSubject } from './identityHash';
import type { GeminiQuotaConfig } from './quotaConfig';
import type {
  GeminiQuotaService,
  GeminiQuotaStore,
} from './types';

export interface CreateGeminiQuotaServiceOptions {
  config: GeminiQuotaConfig;
  store: GeminiQuotaStore;
  clock?: () => number;
}

export function createGeminiQuotaService(
  options: CreateGeminiQuotaServiceOptions,
): GeminiQuotaService {
  const clock = options.clock ?? Date.now;
  return {
    async consume(verifiedGoogleSub) {
      try {
        const identityDigest = hashVerifiedGoogleSubject(
          options.config.identityHashSecret,
          verifiedGoogleSub,
        );
        return await options.store.consume({
          identityDigest,
          limits: {
            userDailyLimit: options.config.userDailyLimit,
            userBurstLimit: options.config.userBurstLimit,
            userBurstWindowSeconds: options.config.userBurstWindowSeconds,
            globalDailyLimit: options.config.globalDailyLimit,
          },
          nowMs: clock(),
        });
      } catch {
        return { status: 'unavailable' };
      }
    },
  };
}
