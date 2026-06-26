/**
 * Unit tests for XRD spinel Miller index mapping and tolerance reconciliation.
 *
 * Run with: npm test
 */
import assert from 'node:assert/strict';
import { search_phase_database, MATCH_TOLERANCE } from '../runner.js';
import { XRD_PHASE_DATABASE } from '../../../data/xrdPhaseDatabase.js';
import type { XrdDetectedPeak } from '../types.js';

function makePeak(id: string, pos: number, intensity = 50): XrdDetectedPeak {
  return {
    id,
    position: pos,
    intensity,
    rawIntensity: intensity,
    prominence: intensity * 0.8,
    fwhm: 0.15,
    dSpacing: Number((1.5406 / (2 * Math.sin((pos * Math.PI) / 360))).toFixed(3)),
    classification: 'sharp',
    label: `peak-${pos}`,
  };
}

console.log('--- Running spinelMillerIndexing tests ---');

// Test 1: Assert MATCH_TOLERANCE reconciled to ±0.2°
assert.equal(MATCH_TOLERANCE, 0.2, 'MATCH_TOLERANCE must be 0.2 degrees 2theta');

// Test 2: Canonical CuFe2O4 reflection mapping
const canonicalPeaks = [
  makePeak('p1', 18.3, 22),
  makePeak('p2', 30.1, 58),
  makePeak('p3', 35.5, 100),
  makePeak('p4', 37.1, 10),
  makePeak('p5', 43.2, 47),
  makePeak('p6', 53.6, 29),
  makePeak('p7', 57.1, 39),
  makePeak('p8', 62.7, 46),
];

const results = search_phase_database(canonicalPeaks, XRD_PHASE_DATABASE);
const cufe2o4Match = results.find((r) => r.phase.id === 'cufe2o4');

assert.ok(cufe2o4Match, 'CuFe2O4 phase must be found in search results');
const missingCanonical = cufe2o4Match.missingPeaks.filter((p) => p.relativeIntensity >= 10);
assert.equal(missingCanonical.length, 0, 'All canonical CuFe2O4 reference peaks should be matched');
assert.equal(cufe2o4Match.matches.length, 8, 'Should match exactly 8 canonical peaks');

// Map observed peak position to matched reference hkl
const indexMap = new Map<number, string>();
cufe2o4Match.matches.forEach((m) => {
  indexMap.set(m.observedPeak.position, m.referencePeak.hkl);
});

assert.equal(indexMap.get(18.3), '(111)');
assert.equal(indexMap.get(30.1), '(220)');
assert.equal(indexMap.get(35.5), '(311)', '~35.5° peak must map to canonical (311)');
assert.equal(indexMap.get(37.1), '(222)', '~37.1° peak must map to canonical (222)');
assert.equal(indexMap.get(43.2), '(400)', '~43.2° peak must map to canonical (400)');
assert.equal(indexMap.get(53.6), '(422)');
assert.equal(indexMap.get(57.1), '(511)');
assert.equal(indexMap.get(62.7), '(440)');

// Test 3: Tolerance guard near 35.5° (311) and 37.1° (222) pair (~1.6° apart)
// With ±0.2° tolerance, shifted peaks at 35.65° (+0.15°) and 36.95° (-0.15°) must index cleanly
const shiftedPair = [makePeak('s1', 35.65, 100), makePeak('s2', 37.05, 10)];
const shiftedResults = search_phase_database(shiftedPair, XRD_PHASE_DATABASE);
const cufeShifted = shiftedResults.find((r) => r.phase.id === 'cufe2o4');
assert.ok(cufeShifted);

const shiftedMap = new Map<number, string>();
cufeShifted.matches.forEach((m) => shiftedMap.set(m.observedPeak.position, m.referencePeak.hkl));
assert.equal(shiftedMap.get(35.65), '(311)', '35.65° (+0.15° shift) must match (311)');
assert.equal(shiftedMap.get(37.05), '(222)', '37.05° must match (222)');

// Test 4: Peak outside tolerance (36.3°, sitting halfway between 35.5 and 37.1) must not match either
const outlier = [makePeak('out1', 36.3, 50)];
const outlierResults = search_phase_database(outlier, XRD_PHASE_DATABASE);
const cufeOutlier = outlierResults.find((r) => r.phase.id === 'cufe2o4');
assert.ok(cufeOutlier);
assert.equal(cufeOutlier.matches.length, 0, '36.3° outlier must not match (311) or (222)');

console.log('✓ spinelMillerIndexing tests passed successfully');
