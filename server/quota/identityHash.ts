import { createHmac } from 'node:crypto';
import { GEMINI_QUOTA_NAMESPACE } from './types';

const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/;

/**
 * HMAC key rotation intentionally changes every effective quota identity,
 * resetting per-user counters from the application's perspective.
 */
export function hashVerifiedGoogleSubject(
  identityHashSecret: string,
  verifiedGoogleSub: string,
): string {
  if (!identityHashSecret || !verifiedGoogleSub) {
    throw new Error('Quota identity hashing is unavailable');
  }
  return createHmac('sha256', identityHashSecret)
    .update(verifiedGoogleSub, 'utf8')
    .digest('hex');
}

export function buildPseudonymousUserQuotaPrefix(identityDigest: string): string {
  if (!SHA256_HEX_PATTERN.test(identityDigest)) {
    throw new Error('Invalid quota identity digest');
  }
  return `${GEMINI_QUOTA_NAMESPACE}:user:${identityDigest}`;
}
