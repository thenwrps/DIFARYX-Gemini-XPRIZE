/**
 * Unit tests for localStorageSafe.ts
 *
 * Run with:  npm run test
 *   (uses `tsx` to execute this file directly — no external test framework)
 *
 * Coverage (15 tests):
 *  - isQuotaError: detects quota errors by name and message
 *  - safeGetItem: reads, parses, handles corrupt JSON, wrong types, unavailable storage
 *  - safeSetRuns: writes, caps, FIFO eviction, always-fail storage, unavailable storage
 */
import assert from 'node:assert/strict';
import {
  safeGetItem,
  safeSetRuns,
  isQuotaError,
  setStorage,
} from '../localStorageSafe.js';
import type { UploadedSignalRun } from '../../data/uploadedSignalRuns.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRuns(n: number): UploadedSignalRun[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `run-${i}`,
    sourceType: 'uploaded' as const,
    fileName: `file${i}.csv`,
    technique: 'XRD' as const,
    sampleIdentity: `sample-${i}`,
    xAxisLabel: '2theta',
    yAxisLabel: 'Intensity',
    points: [{ x: 10 + i, y: 100 + i }],
    extractedFeatures: [],
    evidenceQuality: {
      state: 'ready' as const,
      label: 'Ready',
      canInterpret: true,
      messages: [],
    },
    claimBoundary: [],
    lockedContext: {
      sampleIdentity: `sample-${i}`,
      technique: 'XRD' as const,
      sourceDataset: `file${i}.csv`,
      xAxisLabel: '2theta',
      yAxisLabel: 'Intensity',
      referenceScope: '',
      claimBoundary: '',
      confirmedAt: new Date(i).toISOString(),
    },
    createdAt: new Date(i).toISOString(),
  }));
}

/**
 * Make a plain-object quota error without using DOMException.
 * localStorageSafe.isQuotaError() detects by name/message only.
 */
function makeQuotaError(name: string): Error {
  const err = new Error(name);
  err.name = name;
  return err;
}

/**
 * Create a mock Storage backed by an in-memory Map.
 * When throwOnce=true the FIRST setItem call throws a QuotaExceededError;
 * subsequent calls succeed.
 */
function createMockStorage(throwOnce = false): Storage {
  const map = new Map<string, string>();
  let callCount = 0;

  return {
    get length() {
      return map.size;
    },
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      callCount++;
      if (throwOnce && callCount === 1) {
        throw makeQuotaError('QuotaExceededError');
      }
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    clear: () => {
      map.clear();
    },
    key: (index: number) => Array.from(map.keys())[index] ?? null,
  };
}

/**
 * Create a mock Storage whose setItem always throws a QuotaExceededError.
 */
function createAlwaysFailStorage(): Storage {
  return {
    get length() {
      return 0;
    },
    getItem: () => null,
    setItem: () => {
      throw makeQuotaError('QuotaExceededError');
    },
    removeItem: () => {},
    clear: () => {},
    key: () => null,
  };
}

// ---------------------------------------------------------------------------
// Test harness (matches techniqueDatasetAdapters.test.ts style)
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err instanceof Error ? err.message : String(err)}`);
    failed++;
  }
}

// ===========================================================================
// isQuotaError
// ===========================================================================
console.log('\nisQuotaError');

test('detects QuotaExceededError by name', () => {
  const err = makeQuotaError('QuotaExceededError');
  assert.ok(isQuotaError(err));
});

test('detects Firefox NS_ERROR_DOM_QUOTA_REACHED by name', () => {
  const err = makeQuotaError('NS_ERROR_DOM_QUOTA_REACHED');
  assert.ok(isQuotaError(err));
});

test('detects quota in message', () => {
  assert.ok(isQuotaError(new Error('quota exceeded for storage')));
});

test('returns false for unrelated errors', () => {
  assert.ok(!isQuotaError(new Error('SyntaxError')));
});

test('returns false for non-Error values', () => {
  assert.ok(!isQuotaError('string'));
  assert.ok(!isQuotaError(null));
  assert.ok(!isQuotaError(undefined));
});

// ===========================================================================
// safeGetItem
// ===========================================================================
console.log('\nsafeGetItem');

test('returns default when key is absent', () => {
  const mock = createMockStorage();
  setStorage(mock);
  assert.deepEqual(safeGetItem('missing', []), []);
  setStorage(null);
});

test('parses valid JSON', () => {
  const mock = createMockStorage();
  setStorage(mock);
  mock.setItem('test', JSON.stringify([1, 2, 3]));
  assert.deepEqual(safeGetItem('test', []), [1, 2, 3]);
  setStorage(null);
});

test('returns default and removes key on corrupt JSON', () => {
  const mock = createMockStorage();
  setStorage(mock);
  mock.setItem('test', '{bad json!!');
  const result = safeGetItem('test', []);
  assert.deepEqual(result, []);
  assert.equal(mock.getItem('test'), null);
  setStorage(null);
});

test('returns default when stored value is wrong type', () => {
  const mock = createMockStorage();
  setStorage(mock);
  mock.setItem('test', JSON.stringify('just a string'));
  assert.deepEqual(safeGetItem('test', []), []);
  setStorage(null);
});

test('returns default when storage is unavailable', () => {
  setStorage(null);
  assert.equal(safeGetItem('any', 'fallback'), 'fallback');
});

// ===========================================================================
// safeSetRuns
// ===========================================================================
console.log('\nsafeSetRuns');

test('writes runs successfully', () => {
  const mock = createMockStorage();
  setStorage(mock);
  const runs = makeRuns(3);
  const { ok, notice } = safeSetRuns('runs', runs, 12, 3);
  assert.ok(ok);
  assert.equal(notice, null);
  const stored = JSON.parse(mock.getItem('runs')!);
  assert.equal(stored.length, 3);
  setStorage(null);
});

test('enforces hard cap before writing', () => {
  const mock = createMockStorage();
  setStorage(mock);
  const runs = makeRuns(10);
  const { ok } = safeSetRuns('runs', runs, 6, 3);
  assert.ok(ok);
  const stored = JSON.parse(mock.getItem('runs')!);
  assert.ok(stored.length <= 6);
  setStorage(null);
});

test('evicts oldest runs via FIFO when quota exceeded', () => {
  const mock = createMockStorage(true); // throw once, then succeed
  setStorage(mock);

  const existing = makeRuns(10);
  const incoming = makeRuns(2);
  const all = [...incoming, ...existing];

  const { ok, notice } = safeSetRuns('runs', all, 12, 5);
  assert.ok(ok);
  assert.equal(notice, 'Storage full — oldest runs were removed.');

  const stored = JSON.parse(mock.getItem('runs')!);
  assert.equal(stored.length, all.length - 1);
  setStorage(null);
});

test('returns ok:false if still failing after max evictions', () => {
  const mock = createAlwaysFailStorage();
  setStorage(mock);
  const runs = makeRuns(5);
  const { ok } = safeSetRuns('runs', runs, 12, 3);
  assert.ok(!ok);
  setStorage(null);
});

test('returns ok:false when storage is unavailable', () => {
  setStorage(null);
  const runs = makeRuns(3);
  const { ok } = safeSetRuns('runs', runs);
  assert.ok(!ok);
});

// ===========================================================================
// Summary
// ===========================================================================
console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) {
  process.exit(1);
}