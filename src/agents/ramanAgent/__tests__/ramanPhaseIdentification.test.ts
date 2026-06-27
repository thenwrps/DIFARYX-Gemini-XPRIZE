import assert from 'node:assert/strict';
import { runRamanProcessing } from '../runner.js';

console.log('--- Running ramanPhaseIdentification tests ---');

// 1. Positive match trace: Fe3O4 Magnetite peaks at 668, 538, 306 cm⁻¹
const magShifts: number[] = [];
const magIntensities: number[] = [];
for (let x = 100; x <= 1000; x += 1) {
  let y = 10;
  if (Math.abs(x - 668) < 8) y += 100 * Math.exp(-Math.pow((x - 668) / 4, 2));
  if (Math.abs(x - 538) < 8) y += 40 * Math.exp(-Math.pow((x - 538) / 4, 2));
  if (Math.abs(x - 306) < 8) y += 30 * Math.exp(-Math.pow((x - 306) / 4, 2));
  magShifts.push(x);
  magIntensities.push(y);
}

const posResult = runRamanProcessing({
  id: 'test-mag',
  label: 'mag.txt',
  sampleName: 'Test Magnetite',
  fileName: 'mag.txt',
  signal: {
    ramanShift: magShifts,
    intensity: magIntensities
  },
  baseline: [],
  peaks: []
});

assert.ok(posResult.interpretation.dominantModes.length > 0, 'Must return dominant modes');
assert.equal(posResult.interpretation.primaryPhase, 'Magnetite', 'Positive match must return Magnetite primaryPhase');
assert.equal(posResult.interpretation.catalogId, 'R080025', 'Positive match must return RRUFF ID R080025');
assert.equal(posResult.interpretation.dbSource, 'RRUFF', 'Positive match must return dbSource RRUFF');
assert.ok(
  posResult.interpretation.caveats.some(c => c.includes('Raman supports phase EVIDENCE; it CANNOT assert phase purity without reference validation.')),
  'Must include mandatory scientific purity caveat'
);
console.log('✓ Positive Magnetite match verified OK');

// 2. Negative match trace: Quartz (SiO2) peaks at 464, 206, 128 cm⁻¹ (out-of-set)
const quartzShifts: number[] = [];
const quartzIntensities: number[] = [];
for (let x = 100; x <= 1000; x += 1) {
  let y = 10;
  if (Math.abs(x - 464) < 8) y += 100 * Math.exp(-Math.pow((x - 464) / 4, 2));
  if (Math.abs(x - 206) < 8) y += 50 * Math.exp(-Math.pow((x - 206) / 4, 2));
  if (Math.abs(x - 128) < 8) y += 40 * Math.exp(-Math.pow((x - 128) / 4, 2));
  quartzShifts.push(x);
  quartzIntensities.push(y);
}

const negResult = runRamanProcessing({
  id: 'test-quartz',
  label: 'quartz.txt',
  sampleName: 'Out of set Quartz',
  fileName: 'quartz.txt',
  signal: {
    ramanShift: quartzShifts,
    intensity: quartzIntensities
  },
  baseline: [],
  peaks: []
});

assert.ok(
  negResult.interpretation.confidenceScore < 50 || negResult.interpretation.decision.includes('inconclusive'),
  'Out-of-set Quartz trace must return low confidence or inconclusive'
);
console.log('✓ Out-of-set Quartz negative match verified OK');

// 3. Carbon contamination trace: CuFe2O4 + D band (1350) + G band (1580)
const carbonShifts: number[] = [];
const carbonIntensities: number[] = [];
for (let x = 100; x <= 1800; x += 1) {
  let y = 10;
  if (Math.abs(x - 656) < 8) y += 100 * Math.exp(-Math.pow((x - 656) / 4, 2));
  if (Math.abs(x - 1350) < 8) y += 80 * Math.exp(-Math.pow((x - 1350) / 4, 2));
  if (Math.abs(x - 1580) < 8) y += 90 * Math.exp(-Math.pow((x - 1580) / 4, 2));
  carbonShifts.push(x);
  carbonIntensities.push(y);
}

const carbonResult = runRamanProcessing({
  id: 'test-carbon',
  label: 'carbon.txt',
  sampleName: 'Carbon contaminated ferrite',
  fileName: 'carbon.txt',
  signal: {
    ramanShift: carbonShifts,
    intensity: carbonIntensities
  },
  baseline: [],
  peaks: []
});

assert.notEqual(carbonResult.interpretation.confidenceLevel, 'high', 'Confidence level must not be high when carbon D/G bands present');
assert.ok(
  carbonResult.interpretation.caveats.some(c => c.includes('carbonaceous species')),
  'Must include carbonaceous species caveat'
);
console.log('✓ Carbon contamination trace verified OK');

// 4. Ferrite caveat assertion trace: CuFe2O4 peaks at 656, 481, 278 cm⁻¹
const ferriteShifts: number[] = [];
const ferriteIntensities: number[] = [];
for (let x = 100; x <= 1000; x += 1) {
  let y = 10;
  if (Math.abs(x - 656) < 8) y += 100 * Math.exp(-Math.pow((x - 656) / 4, 2));
  if (Math.abs(x - 481) < 8) y += 50 * Math.exp(-Math.pow((x - 481) / 4, 2));
  if (Math.abs(x - 278) < 8) y += 40 * Math.exp(-Math.pow((x - 278) / 4, 2));
  ferriteShifts.push(x);
  ferriteIntensities.push(y);
}

const ferriteResult = runRamanProcessing({
  id: 'test-ferrite',
  label: 'ferrite.txt',
  sampleName: 'Pure CuFe2O4 ferrite',
  fileName: 'ferrite.txt',
  signal: {
    ramanShift: ferriteShifts,
    intensity: ferriteIntensities
  },
  baseline: [],
  peaks: []
});

assert.ok(
  ferriteResult.interpretation.caveats.some(c => c.includes('cannot definitively discriminate ferrite composition') || c.includes('cannot distinguish between isostructural spinel ferrites')),
  'Must include Graves ferrite composition discrimination caveat'
);
console.log('✓ Ferrite caveat assertion test verified OK');
console.log('✓ All ramanPhaseIdentification tests passed successfully');

