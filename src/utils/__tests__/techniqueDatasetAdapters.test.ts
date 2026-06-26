/**
 * Unit tests for techniqueDatasetAdapters.ts
 *
 * Run with:  npm run test
 *   (uses `tsx` to execute this file directly — no external test framework)
 *
 * Coverage:
 *  - Normal conversion for Raman, XPS, FTIR
 *  - Empty dataPoints guard (Q1: adapters return empty arrays; callers skip runner)
 *  - XPS axis ordering guard (Q2: descending BE preserved; ascending input corrected)
 */
import assert from 'node:assert/strict';
import {
  demoDatasetToRamanDataset,
  demoDatasetToXpsDataset,
  demoDatasetToFtirDataset,
} from '../techniqueDatasetAdapters.js';
import type { DemoDataset } from '../../data/demoProjects.js';

// ---------------------------------------------------------------------------
// Minimal DemoDataset factory — only populates fields the adapters consume.
// ---------------------------------------------------------------------------
function makeDataset(
  points: { x: number; y: number }[],
  overrides: Partial<DemoDataset> = {},
): DemoDataset {
  return {
    id: 'ds-test',
    projectId: 'proj-test',
    technique: 'Raman',
    fileName: 'test.csv',
    sampleName: 'Test Sample',
    xLabel: 'x',
    yLabel: 'y',
    dataPoints: points,
    metadata: {
      experimentTitle: 'Test',
      sampleName: 'Test Sample',
      materialSystem: 'Test',
      operator: 'Test',
      date: '2024-01-01',
      notes: '',
    },
    processingState: {
      imported: false,
      baseline: false,
      smoothing: false,
      normalize: false,
    },
    detectedFeatures: [],
    evidence: [],
    savedRuns: [],
    ...overrides,
  };
}

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
// demoDatasetToRamanDataset
// ===========================================================================
console.log('\ndemoDatasetToRamanDataset');

const RAMAN_PTS = [
  { x: 690, y: 0.85 },
  { x: 470, y: 0.45 },
  { x: 330, y: 0.35 },
];

test('maps x → ramanShift and y → intensity', () => {
  const result = demoDatasetToRamanDataset(makeDataset(RAMAN_PTS));
  assert.deepEqual(result.signal.ramanShift, [690, 470, 330]);
  assert.deepEqual(result.signal.intensity, [0.85, 0.45, 0.35]);
});

test('preserves id, sampleName, fileName', () => {
  const result = demoDatasetToRamanDataset(makeDataset(RAMAN_PTS));
  assert.equal(result.id, 'ds-test');
  assert.equal(result.sampleName, 'Test Sample');
  assert.equal(result.fileName, 'test.csv');
});

test('baseline and peaks are empty arrays (runner initialises them)', () => {
  const result = demoDatasetToRamanDataset(makeDataset(RAMAN_PTS));
  assert.deepEqual(result.baseline, []);
  assert.deepEqual(result.peaks, []);
});

// Q1: empty dataPoints guard
test('empty dataPoints → empty signal arrays (caller must skip runner)', () => {
  const result = demoDatasetToRamanDataset(makeDataset([]));
  assert.deepEqual(result.signal.ramanShift, []);
  assert.deepEqual(result.signal.intensity, []);
  assert.equal(result.signal.ramanShift.length, 0, 'caller can guard with .length === 0');
});

// ===========================================================================
// demoDatasetToXpsDataset
// ===========================================================================
console.log('\ndemoDatasetToXpsDataset');

// XPS convention: high → low binding energy
const XPS_PTS_DESC = [
  { x: 965, y: 1200 },
  { x: 940, y: 5000 },
  { x: 925, y: 1400 },
];
// Wrong order (ascending) — adapter must correct silently
const XPS_PTS_ASC = [...XPS_PTS_DESC].reverse();

test('maps x → bindingEnergy and y → intensity', () => {
  const result = demoDatasetToXpsDataset(makeDataset(XPS_PTS_DESC));
  assert.deepEqual(result.signal.bindingEnergy, [965, 940, 925]);
  assert.deepEqual(result.signal.intensity, [1200, 5000, 1400]);
});

test('region is always "Survey"', () => {
  const result = demoDatasetToXpsDataset(makeDataset(XPS_PTS_DESC));
  assert.equal(result.region, 'Survey');
});

// Q2: axis ordering guard — descending order preserved
test('descending input: bindingEnergy stays high→low (XPS convention)', () => {
  const result = demoDatasetToXpsDataset(makeDataset(XPS_PTS_DESC));
  const be = result.signal.bindingEnergy;
  assert.ok(
    be.every((v, i) => i === 0 || v <= be[i - 1]),
    'bindingEnergy must be non-increasing (XPS convention)',
  );
});

// Q2: axis ordering guard — ascending input is silently corrected
test('ascending input: silently sorted to descending (XPS convention)', () => {
  const result = demoDatasetToXpsDataset(makeDataset(XPS_PTS_ASC));
  const be = result.signal.bindingEnergy;
  assert.ok(
    be.every((v, i) => i === 0 || v <= be[i - 1]),
    'ascending input must be corrected to descending',
  );
  // Values should be identical after sorting
  const sortedX = [...XPS_PTS_ASC].sort((a, b) => b.x - a.x).map((p) => p.x);
  assert.deepEqual(be, sortedX);
});

// Q1: empty dataPoints guard
test('empty dataPoints → empty signal arrays', () => {
  const result = demoDatasetToXpsDataset(makeDataset([]));
  assert.deepEqual(result.signal.bindingEnergy, []);
  assert.deepEqual(result.signal.intensity, []);
});

test('peaks and matches are empty arrays', () => {
  const result = demoDatasetToXpsDataset(makeDataset(XPS_PTS_DESC));
  assert.deepEqual(result.peaks, []);
  assert.deepEqual(result.matches, []);
});

// ===========================================================================
// demoDatasetToFtirDataset
// ===========================================================================
console.log('\ndemoDatasetToFtirDataset');

// FTIR convention: high → low wavenumber
const FTIR_PTS = [
  { x: 3400, y: 0.45 },
  { x: 1630, y: 0.25 },
  { x: 550, y: 0.30 },
];

test('maps x → wavenumber and y → absorbance', () => {
  const result = demoDatasetToFtirDataset(makeDataset(FTIR_PTS));
  assert.deepEqual(result.signal.wavenumber, [3400, 1630, 550]);
  assert.deepEqual(result.signal.absorbance, [0.45, 0.25, 0.30]);
});

test('baseline, bands, and matches are empty arrays', () => {
  const result = demoDatasetToFtirDataset(makeDataset(FTIR_PTS));
  assert.deepEqual(result.baseline, []);
  assert.deepEqual(result.bands, []);
  assert.deepEqual(result.matches, []);
});

test('preserves id and fileName', () => {
  const result = demoDatasetToFtirDataset(makeDataset(FTIR_PTS));
  assert.equal(result.id, 'ds-test');
  assert.equal(result.fileName, 'test.csv');
});

// Q1: empty dataPoints guard
test('empty dataPoints → empty signal arrays', () => {
  const result = demoDatasetToFtirDataset(makeDataset([]));
  assert.deepEqual(result.signal.wavenumber, []);
  assert.deepEqual(result.signal.absorbance, []);
});

// ===========================================================================
// Summary
// ===========================================================================
console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) {
  process.exit(1);
}
