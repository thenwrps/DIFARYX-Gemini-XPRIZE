import assert from 'node:assert/strict';
import { matchesPhase, matchesElement, matchesOxidationState, CANONICAL_PHASE_REGISTRY } from '../consistencyRegistry.js';
import type { UniversalEvidenceNode } from '../../../types/universalEvidence.js';
import { XPS_REFERENCE_DATA } from '../../../data/xpsReferenceData.js';

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

console.log('\nConsistency Registry Tests');

const xrdMagnetite: UniversalEvidenceNode = {
  id: 'xrd-1',
  technique: 'XRD',
  primaryAxis: 35.2,
  primaryAxisUnit: '°2θ',
  value: 0.95,
  valueUnit: 'confidence_score',
  label: 'Magnetite',
  concept: 'crystalline',
  role: 'primary',
  provenance: { datasetId: 'd1', dbSource: 'COD', sourceId: '1011032', formula: 'Fe3O4', createdAt: '2026-06-29T00:00:00.000Z' },
};

const ramanMagnetite: UniversalEvidenceNode = {
  id: 'raman-1',
  technique: 'Raman',
  primaryAxis: 668,
  primaryAxisUnit: 'cm⁻¹',
  value: 0.88,
  valueUnit: 'confidence_score',
  label: 'A1g spinel ferrite (Magnetite)',
  concept: 'crystalline',
  role: 'primary',
  provenance: { datasetId: 'd2', dbSource: 'RRUFF', sourceId: 'R060191', formula: 'Fe3O4', createdAt: '2026-06-29T00:00:00.000Z' },
};

const xrdQuartz: UniversalEvidenceNode = {
  id: 'xrd-2',
  technique: 'XRD',
  primaryAxis: 26.6,
  primaryAxisUnit: '°2θ',
  value: 0.9,
  valueUnit: 'confidence_score',
  label: 'Quartz',
  concept: 'crystalline',
  role: 'primary',
  provenance: { datasetId: 'd3', dbSource: 'COD', sourceId: '9000010', formula: 'SiO2', createdAt: '2026-06-29T00:00:00.000Z' },
};

const xpsFe3: UniversalEvidenceNode = {
  id: 'xps-1',
  technique: 'XPS',
  primaryAxis: 711.0,
  primaryAxisUnit: 'eV',
  value: 0.85,
  valueUnit: 'confidence_score',
  label: 'Fe(III) oxide',
  concept: 'oxidation_state',
  role: 'primary',
  provenance: { datasetId: 'd4', dbSource: 'NIST', formula: 'Fe2O3', summary: 'Fe³⁺ in Fe2O3', createdAt: '2026-06-29T00:00:00.000Z' },
};

test('matchesPhase correlates same phase across different DB sources and IDs', () => {
  assert.equal(matchesPhase(xrdMagnetite, ramanMagnetite), true);
  assert.equal(matchesPhase(xrdMagnetite, xrdQuartz), false);
});

test('matchesElement identifies correct element symbols in formula or label', () => {
  assert.equal(matchesElement(xrdMagnetite, 'Fe'), true);
  assert.equal(matchesElement(xrdMagnetite, 'O'), true);
  assert.equal(matchesElement(xrdMagnetite, 'Si'), false);
  assert.equal(matchesElement(xpsFe3, 'Fe'), true);
  // Ensure C is not mistakenly found inside Cu or COD
  assert.equal(matchesElement(xrdMagnetite, 'C'), false);
});

test('matchesOxidationState correlates equivalent representations (III vs 3+ vs ³⁺)', () => {
  assert.equal(matchesOxidationState(xpsFe3, 'Fe³⁺'), true);
  assert.equal(matchesOxidationState(xpsFe3, '3+'), true);
  assert.equal(matchesOxidationState(xpsFe3, 'III'), true);
  assert.equal(matchesOxidationState(xpsFe3, 'Fe²⁺'), false);
});

test('CANONICAL_PHASE_REGISTRY contains all canonical formulas with states and polymorph caps', () => {
  const expectedFormulas = ['TIO2', 'FE2O3', 'FE3O4', 'CUFE2O4', 'CUO', 'CU2O', 'ZNO'];
  for (const key of expectedFormulas) {
    const entry = CANONICAL_PHASE_REGISTRY[key];
    assert.ok(entry, `Missing registry entry for ${key}`);
    assert.ok(entry.compatibleOxidationStates.length > 0, `${key} missing compatibleOxidationStates`);
    assert.ok(entry.forbiddenStates.length > 0, `${key} missing forbiddenStates`);
    assert.ok(entry.polymorphResolutionCap.length > 0, `${key} missing polymorphResolutionCap`);
  }
});

test('BE-PIN: assert registry XPS BE and satellite anchor values equal seeded source-of-truth', () => {
  // Fe3O4 710.6 + forbidden sat [718.0, 720.0]
  assert.deepEqual(CANONICAL_PHASE_REGISTRY['FE3O4'].xpsMainBE, [710.6]);
  assert.equal(CANONICAL_PHASE_REGISTRY['FE3O4'].xpsSatellite.expected, false);
  assert.deepEqual(CANONICAL_PHASE_REGISTRY['FE3O4'].xpsSatellite.forbiddenRange, [718.0, 720.0]);

  // Fe2O3 711.0 / sat 718.8
  assert.deepEqual(CANONICAL_PHASE_REGISTRY['FE2O3'].xpsMainBE, [711.0]);
  assert.equal(CANONICAL_PHASE_REGISTRY['FE2O3'].xpsSatellite.expected, true);
  assert.equal(CANONICAL_PHASE_REGISTRY['FE2O3'].xpsSatellite.expectedBE, 718.8);

  // CuO 933.6 / sat 942.2
  assert.deepEqual(CANONICAL_PHASE_REGISTRY['CUO'].xpsMainBE, [933.6]);
  assert.equal(CANONICAL_PHASE_REGISTRY['CUO'].xpsSatellite.expected, true);
  assert.equal(CANONICAL_PHASE_REGISTRY['CUO'].xpsSatellite.expectedBE, 942.2);

  // ZnO 1021.7
  assert.deepEqual(CANONICAL_PHASE_REGISTRY['ZNO'].xpsMainBE, [1021.7]);
  assert.equal(CANONICAL_PHASE_REGISTRY['ZNO'].xpsSatellite.expected, false);

  // TiO2 458.6 / 464.3
  assert.deepEqual(CANONICAL_PHASE_REGISTRY['TIO2'].xpsMainBE, [458.6, 464.3]);
  assert.equal(CANONICAL_PHASE_REGISTRY['TIO2'].xpsSatellite.expected, false);
});

test('CROSS-CHECK: assert xpsReferenceData.ts main binding energies and satellites equal registry pinned values', () => {
  // Explicitly pin satellite values against canonical anchor drift
  assert.equal(CANONICAL_PHASE_REGISTRY['CUO'].xpsSatellite.expectedBE, 942.2, 'CuO satellite must resolve to 942.2 eV');
  assert.equal(CANONICAL_PHASE_REGISTRY['FE2O3'].xpsSatellite.expectedBE, 718.8, 'Fe2O3 satellite must resolve to 718.8 eV');
  assert.deepEqual(CANONICAL_PHASE_REGISTRY['FE3O4'].xpsSatellite.forbiddenRange, [718.0, 720.0], 'Fe3O4 forbidden satellite range must be [718.0, 720.0]');

  const checkFormulas = ['CuO', 'Fe2O3', 'ZnO', 'TiO2'];
  for (const formula of checkFormulas) {
    const refEntry = XPS_REFERENCE_DATA.find(r => r.formula === formula && r.coreLevel === '2p3/2');
    assert.ok(refEntry, `Missing 2p3/2 reference entry for ${formula} in XPS_REFERENCE_DATA`);
    const registryEntry = CANONICAL_PHASE_REGISTRY[formula.toUpperCase()];
    assert.ok(registryEntry, `Missing registry entry for ${formula}`);
    assert.equal(refEntry.bindingEnergy, registryEntry.xpsMainBE[0], `BE drift for ${formula}: ${refEntry.bindingEnergy} !== ${registryEntry.xpsMainBE[0]}`);
    
    const expectedDoi = formula === 'Fe2O3'
      ? '10.1016/j.apsusc.2010.10.051'
      : '10.1016/j.apsusc.2010.07.086';
    assert.equal(refEntry.sourceDoi, expectedDoi, `DOI drift for ${formula}: ${refEntry.sourceDoi} !== ${expectedDoi}`);
    
    if (registryEntry.xpsSatellite.expectedBE && refEntry.satelliteOffset !== undefined) {
      const satBE = Number((refEntry.bindingEnergy + refEntry.satelliteOffset).toFixed(1));
      assert.equal(satBE, registryEntry.xpsSatellite.expectedBE, `Satellite BE drift for ${formula}: ${satBE} !== ${registryEntry.xpsSatellite.expectedBE}`);
    } else if (!registryEntry.xpsSatellite.expected) {
      assert.equal(refEntry.satelliteOffset, undefined, `Unexpected satellite offset for ${formula}`);
    }
  }
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) {
  process.exit(1);
}
