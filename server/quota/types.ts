export const GEMINI_QUOTA_NAMESPACE = 'difaryx:quota:v1';

export type GeminiQuotaDimension =
  | 'user_burst'
  | 'user_daily'
  | 'global_daily';

export interface GeminiQuotaCounterState {
  dimension: GeminiQuotaDimension;
  limit: number;
  remaining: number;
  resetAt: string;
  retryAfterSeconds: number;
}

export interface GeminiQuotaAllowed {
  status: 'allowed';
  counters: readonly [
    GeminiQuotaCounterState,
    GeminiQuotaCounterState,
    GeminiQuotaCounterState,
  ];
}

export interface GeminiQuotaExceeded extends GeminiQuotaCounterState {
  status:
    | 'user_burst_exceeded'
    | 'user_daily_exceeded'
    | 'global_daily_exceeded';
}

export interface GeminiQuotaUnavailable {
  status: 'unavailable';
}

export type GeminiQuotaDecision =
  | GeminiQuotaAllowed
  | GeminiQuotaExceeded
  | GeminiQuotaUnavailable;

export interface GeminiQuotaLimits {
  userDailyLimit: number;
  userBurstLimit: number;
  userBurstWindowSeconds: number;
  globalDailyLimit: number;
}

export interface GeminiQuotaStoreInput {
  identityDigest: string;
  limits: GeminiQuotaLimits;
  nowMs: number;
}

export interface GeminiQuotaStore {
  consume(input: GeminiQuotaStoreInput): Promise<GeminiQuotaDecision>;
}

export interface GeminiQuotaService {
  consume(verifiedGoogleSub: string): Promise<GeminiQuotaDecision>;
}
