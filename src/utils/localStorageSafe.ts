/**
 * Centralized localStorage persistence helper with quota-safety,
 * corrupt-JSON recovery, and FIFO eviction.
 *
 * All reads/writes for difaryx.uploadedSignalRuns.v1 go through
 * this module to prevent demo crashes from QuotaExceededError.
 */

import { MAX_PERSISTED_RUNS, MAX_PERSISTED_POINTS, type UploadedSignalRun } from '../data/uploadedSignalRuns';

// ---------------------------------------------------------------------------
// Storage accessor — swappable for tests / SSR
// ---------------------------------------------------------------------------

let _storage: Storage | null | undefined;

export function getStorage(): Storage | null {
  if (_storage !== undefined) return _storage;
  if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
    _storage = globalThis.localStorage;
  } else if (typeof window !== 'undefined' && window.localStorage) {
    _storage = window.localStorage;
  } else {
    _storage = null;
  }
  return _storage;
}

/** Install a mock storage (for tests). Pass null to explicitly disable. */
export function setStorage(storage: Storage | null): void {
  _storage = storage;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function isQuotaError(e: unknown): boolean {
  if (e == null || (typeof e !== 'object' && typeof e !== 'string')) return false;

  const name: string =
    typeof e === 'object' && 'name' in e
      ? String((e as Record<string, unknown>).name)
      : '';
  const msg: string =
    typeof e === 'object' && 'message' in e
      ? String((e as Record<string, unknown>).message)
      : typeof e === 'string'
        ? e
        : '';

  return (
    name === 'QuotaExceededError' ||
    name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    msg.includes('quota') ||
    msg.includes('QuotaExceededError') ||
    msg.includes('NS_ERROR_DOM_QUOTA_REACHED')
  );
}

/**
 * Downsample a run's points to fit the per-run budget.
 */
export function compactRunForStorage(
  run: UploadedSignalRun,
  maxPoints = MAX_PERSISTED_POINTS,
): UploadedSignalRun {
  const finitePoints = run.points.filter(
    (p) => Number.isFinite(p.x) && Number.isFinite(p.y),
  );
  let points = finitePoints;
  if (finitePoints.length > maxPoints) {
    const step = (finitePoints.length - 1) / (maxPoints - 1);
    points = Array.from({ length: maxPoints }, (_, i) =>
      finitePoints[Math.round(i * step)],
    );
  }
  return {
    ...run,
    points,
    extractedFeatures: run.extractedFeatures.slice(0, 12),
  };
}

// ---------------------------------------------------------------------------
// Safe read
// ---------------------------------------------------------------------------

/**
 * Safely read a JSON value from localStorage.
 * If the stored value is corrupt/unparseable, it is reset to the fallback.
 * Returns `fallback` when storage is unavailable.
 */
export function safeGetItem<T>(key: string, fallback: T): T {
  const storage = getStorage();
  if (!storage) return fallback;

  try {
    const raw = storage.getItem(key);
    if (raw === null || raw === '') return fallback;
    const parsed: unknown = JSON.parse(raw);
    // Validate parsed type matches the fallback's type so callers don't
    // receive a string where they expected an array, etc.
    if (Array.isArray(fallback) && !Array.isArray(parsed)) return fallback;
    if (
      fallback !== null &&
      typeof fallback === 'object' &&
      !Array.isArray(fallback) &&
      (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
    )
      return fallback;
    if (
      typeof fallback === 'string' ||
      typeof fallback === 'number' ||
      typeof fallback === 'boolean'
    ) {
      if (typeof parsed !== typeof fallback) return fallback;
    }
    return parsed as T;
  } catch {
    // Corrupt / unparseable JSON — reset cleanly
    try {
      storage.removeItem(key);
    } catch {
      // Best-effort cleanup
    }
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Safe write with FIFO eviction
// ---------------------------------------------------------------------------

export interface SafeSetItemResult {
  ok: boolean;
  notice: string | null;
}

/**
 * Safely write a JSON value to localStorage.
 *
 * On QuotaExceededError the oldest runs are evicted (FIFO) and the write
 * retried, up to `maxEvictions` times.  If it still fails the incoming
 * value is silently dropped and `notice` is set to a user-facing message.
 *
 * @param runs       The full ordered array to persist (newest first).
 * @param maxRuns    Hard cap on persisted runs (default MAX_PERSISTED_RUNS).
 * @param maxEvictions  Max eviction retries before giving up.
 */
export function safeSetRuns(
  key: string,
  runs: UploadedSignalRun[],
  maxRuns = MAX_PERSISTED_RUNS,
  maxEvictions = 4,
): SafeSetItemResult {
  const storage = getStorage();
  if (!storage) return { ok: false, notice: null };

  // Enforce hard cap before writing
  const capped = runs.slice(0, maxRuns);

  let payload: string;
  try {
    payload = JSON.stringify(capped);
  } catch {
    return { ok: false, notice: null };
  }

  // First attempt
  try {
    storage.setItem(key, payload);
    return { ok: true, notice: null };
  } catch (e) {
    if (!isQuotaError(e)) return { ok: false, notice: null };

    // Quota exceeded — evict oldest runs (end of array) and retry
    let current = [...capped];
    for (let i = 0; i < maxEvictions; i++) {
      if (current.length === 0) break;
      // Evict the oldest run (last element — runs are newest-first)
      current = current.slice(0, -1);
      try {
        payload = JSON.stringify(current);
        storage.setItem(key, payload);
        return {
          ok: true,
          notice:
            'Storage full — oldest runs were removed.',
        };
      } catch (retryErr) {
        if (!isQuotaError(retryErr)) return { ok: false, notice: null };
        // Continue evicting
      }
    }

    // All evictions exhausted — drop incoming run gracefully
    return {
      ok: false,
      notice: 'Storage full — oldest runs were removed.',
    };
  }
}