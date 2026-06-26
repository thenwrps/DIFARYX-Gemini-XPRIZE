import assert from 'node:assert/strict';
import { runXrdPhaseIdentificationAgent } from '../runner.js';
import type { XrdPoint } from '../types.js';

console.log('--- Running codMatching tests ---');

// Positive match trace: CuFe2O4 peaks
const cufePoints: XrdPoint[] = [];
for (let x = 10; x <= 80; x += 0.1) {
  let y = 5;
  if (Math.abs(x - 35.5) < 0.5) y += 100 * Math.exp(-Math.pow((x - 35.5) / 0.15, 2));
  if (Math.abs(x - 30.1) < 0.5) y += 58 * Math.exp(-Math.pow((x - 30.1) / 0.15, 2));
  if (Math.abs(x - 43.2) < 0.5) y += 47 * Math.exp(-Math.pow((x - 43.2) / 0.15, 2));
  cufePoints.push({ x: Number(x.toFixed(1)), y });
}

const posResult = runXrdPhaseIdentificationAgent({
  datasetId: 'test-cufe',
  sampleName: 'Test CuFe2O4',
  dataPoints: cufePoints
});

assert.ok(posResult.candidates.length > 0, 'Must return candidates');
const topCandidate = posResult.candidates[0];
assert.equal(topCandidate.phase.codId, '5910028', 'Positive match must return VERIFIED cubic CuFe2O4 COD ID 5910028');
assert.equal(topCandidate.phase.spaceGroup, 'Fd-3m', 'Positive match must return space group Fd-3m');
console.log('✓ Positive CuFe2O4 match verified OK');

// Negative match trace: BaTiO3 peaks at 22.1, 31.5, 38.9, 45.2
const batioPoints: XrdPoint[] = [];
for (let x = 10; x <= 80; x += 0.1) {
  let y = 5;
  if (Math.abs(x - 22.1) < 0.5) y += 100 * Math.exp(-Math.pow((x - 22.1) / 0.15, 2));
  if (Math.abs(x - 31.5) < 0.5) y += 80 * Math.exp(-Math.pow((x - 31.5) / 0.15, 2));
  if (Math.abs(x - 38.9) < 0.5) y += 60 * Math.exp(-Math.pow((x - 38.9) / 0.15, 2));
  if (Math.abs(x - 45.2) < 0.5) y += 50 * Math.exp(-Math.pow((x - 45.2) / 0.15, 2));
  batioPoints.push({ x: Number(x.toFixed(1)), y });
}

const negResult = runXrdPhaseIdentificationAgent({
  datasetId: 'test-batio3',
  sampleName: 'Out of set BaTiO3',
  dataPoints: batioPoints
});

assert.ok(
  negResult.conflicts.primaryCandidate === null || negResult.conflicts.primaryCandidate.score < 0.65 || negResult.decision.includes('No confident phase claim'),
  'BaTiO3 out-of-set trace must return no confident match'
);
console.log('✓ Out-of-set BaTiO3 negative match verified OK');
console.log('✓ All codMatching tests passed successfully');
