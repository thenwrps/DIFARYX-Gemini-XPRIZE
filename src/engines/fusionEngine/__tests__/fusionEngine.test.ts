import assert from 'node:assert/strict';
import { evaluateFusionEngine } from '../fusionEngine.js';
import type { UniversalEvidenceNode } from '../../../types/universalEvidence.js';

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

console.log('Running Transparent Fusion Engine Phase 2a tests...');

test('Independence Guard test: two nodes with the same processingHash do NOT produce CORROBORATED', () => {
  const nodes: UniversalEvidenceNode[] = [
    {
      id: 'xrd-1',
      technique: 'XRD',
      primaryAxis: 25.3,
      primaryAxisUnit: '°2θ',
      value: 0.9,
      valueUnit: 'score',
      label: 'Anatase',
      concept: 'crystalline',
      role: 'primary',
      confidence: 'high',
      provenance: {
        createdAt: new Date().toISOString(),
        datasetId: 'ds-1',
        processingHash: 'shared-hash-123',
        formula: 'TiO2',
      },
    },
    {
      id: 'raman-1',
      technique: 'Raman',
      primaryAxis: 144,
      primaryAxisUnit: 'cm⁻¹',
      value: 0.88,
      valueUnit: 'score',
      label: 'Anatase',
      concept: 'crystalline',
      role: 'primary',
      confidence: 'high',
      provenance: {
        createdAt: new Date().toISOString(),
        datasetId: 'ds-1',
        processingHash: 'shared-hash-123',
        formula: 'TiO2',
      },
    },
  ];

  const findings = evaluateFusionEngine(nodes);
  assert.equal(findings.length, 1, 'Should produce exactly 1 finding for TiO2 Anatase');
  const finding = findings[0];

  assert.notEqual(finding.formulaTier, 'CORROBORATED', 'Formula tier must not be CORROBORATED when origins match');
  assert.equal(finding.formulaTier, 'SINGLE-SOURCE', 'Formula tier should be SINGLE-SOURCE when origins.size <= 1');
  assert.ok(
    finding.inheritedCaveats.includes('Demonstration Mode: Same-Origin Synthetic Data'),
    'Must include Same-Origin Synthetic Data caveat'
  );
});

test('Multiple contributions from ONE technique (origins.size <= 1) cap out at SINGLE-SOURCE', () => {
  const nodes: UniversalEvidenceNode[] = [
    {
      id: 'xrd-peak-1',
      technique: 'XRD',
      primaryAxis: 25.3,
      primaryAxisUnit: '°2θ',
      value: 0.95,
      valueUnit: 'score',
      label: 'Anatase (101)',
      concept: 'crystalline',
      role: 'primary',
      confidence: 'high',
      provenance: {
        createdAt: new Date().toISOString(),
        datasetId: 'ds-xrd-single',
        processingHash: 'hash-xrd-single',
        formula: 'TiO2',
      },
    },
    {
      id: 'xrd-peak-2',
      technique: 'XRD',
      primaryAxis: 48.0,
      primaryAxisUnit: '°2θ',
      value: 0.90,
      valueUnit: 'score',
      label: 'Anatase (200)',
      concept: 'crystalline',
      role: 'primary',
      confidence: 'high',
      provenance: {
        createdAt: new Date().toISOString(),
        datasetId: 'ds-xrd-single',
        processingHash: 'hash-xrd-single',
        formula: 'TiO2',
      },
    },
  ];

  const findings = evaluateFusionEngine(nodes);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].formulaTier, 'SINGLE-SOURCE', 'Multiple XRD peaks from one dataset must cap out at SINGLE-SOURCE');
});

test('Polymorph Cap Enforcement test: XPS formula-level evidence cannot raise polymorphTier above registry cap', () => {
  const nodes: UniversalEvidenceNode[] = [
    {
      id: 'xrd-2',
      technique: 'XRD',
      primaryAxis: 25.3,
      primaryAxisUnit: '°2θ',
      value: 0.95,
      valueUnit: 'score',
      label: 'Anatase',
      concept: 'crystalline',
      role: 'primary',
      confidence: 'high',
      provenance: {
        createdAt: new Date().toISOString(),
        datasetId: 'ds-xrd',
        processingHash: 'hash-xrd-indep',
        formula: 'TiO2',
      },
    },
    {
      id: 'xps-2',
      technique: 'XPS',
      primaryAxis: 458.6,
      primaryAxisUnit: 'eV',
      value: 0.92,
      valueUnit: 'score',
      label: 'Ti4+',
      concept: 'oxidation_state',
      role: 'primary',
      confidence: 'high',
      provenance: {
        createdAt: new Date().toISOString(),
        datasetId: 'ds-xps',
        processingHash: 'hash-xps-indep',
        summary: 'Ti4+ 2p3/2 peak at 458.6 eV',
      },
    },
  ];

  const findings = evaluateFusionEngine(nodes);
  assert.equal(findings.length, 1, 'Should produce exactly 1 finding for TiO2 Anatase');
  const finding = findings[0];

  assert.equal(finding.formulaTier, 'CORROBORATED', 'Formula tier should be CORROBORATED by independent XRD + XPS');
  assert.notEqual(finding.polymorphTier, 'CORROBORATED', 'Polymorph tier must never be CORROBORATED by XPS');
  assert.equal(finding.polymorphTier, 'SINGLE-SOURCE', 'Polymorph tier should be SINGLE-SOURCE supported by XRD alone');
  assert.ok(
    finding.inheritedCaveats.includes('Requires XRD or Raman for polymorph resolution (anatase vs rutile)'),
    'Must include polymorph resolution cap caveat'
  );
});

test('Zero-Weight Absence test: technique producing no match contributes nothing and appears in absentTechniques', () => {
  const nodes: UniversalEvidenceNode[] = [
    {
      id: 'xrd-3',
      technique: 'XRD',
      primaryAxis: 25.3,
      primaryAxisUnit: '°2θ',
      value: 0.9,
      valueUnit: 'score',
      label: 'Anatase',
      concept: 'crystalline',
      role: 'primary',
      confidence: 'high',
      provenance: {
        createdAt: new Date().toISOString(),
        datasetId: 'ds-xrd-only',
        processingHash: 'hash-xrd-only',
        formula: 'TiO2',
      },
    },
  ];

  const findings = evaluateFusionEngine(nodes);
  assert.equal(findings.length, 1);
  const finding = findings[0];

  assert.deepEqual(finding.absentTechniques, ['FTIR', 'Raman', 'XPS'], 'Absent techniques must list all non-matching techniques');
  assert.equal(finding.supportingContributions.length, 1, 'Only XRD should be in supporting contributions');
  assert.equal(finding.contestingContributions.length, 0, 'No contesting contributions in absence');
});

test('No Silent Winner test: two contradictory INDEPENDENT contributions for one formula -> tier CONTESTED, with BOTH retained in contestingContributions', () => {
  const nodes: UniversalEvidenceNode[] = [
    {
      id: 'xrd-tio2',
      technique: 'XRD',
      primaryAxis: 25.3,
      primaryAxisUnit: '°2θ',
      value: 0.9,
      valueUnit: 'score',
      label: 'Anatase',
      concept: 'crystalline',
      role: 'primary',
      confidence: 'high',
      provenance: {
        createdAt: new Date().toISOString(),
        datasetId: 'ds-xrd',
        processingHash: 'hash-xrd',
        formula: 'TiO2',
      },
    },
    {
      id: 'xps-ti0',
      technique: 'XPS',
      primaryAxis: 454.0,
      primaryAxisUnit: 'eV',
      value: 0.85,
      valueUnit: 'score',
      label: 'Ti0',
      concept: 'oxidation_state',
      role: 'primary',
      confidence: 'high',
      provenance: {
        createdAt: new Date().toISOString(),
        datasetId: 'ds-xps',
        processingHash: 'hash-xps-indep',
        summary: 'Ti0 metallic peak at 454.0 eV',
      },
    },
  ];

  const findings = evaluateFusionEngine(nodes);
  assert.equal(findings.length, 1);
  const finding = findings[0];

  assert.equal(finding.formulaTier, 'CONTESTED', 'Formula tier should be CONTESTED due to forbidden oxidation state match');
  assert.equal(finding.supportingContributions.length, 1, 'Supporting contributions must have the asserting side');
  assert.equal(finding.contestingContributions.length, 1, 'Contesting contributions must have ONLY the contradicting side');
  assert.ok(finding.supportingContributions.some(c => c.technique === 'XRD'), 'Supporting contributions must include XRD');
  assert.ok(finding.contestingContributions.some(c => c.technique === 'XPS'), 'Contesting contributions must include XPS');
});

test('Surface Stratification test: XPS surface state vs XRD bulk phase -> isSurfaceBulkDiscrepancy=true and tier is NOT CONTESTED', () => {
  const nodes: UniversalEvidenceNode[] = [
    {
      id: 'xrd-cu2o',
      technique: 'XRD',
      primaryAxis: 36.4,
      primaryAxisUnit: '°2θ',
      value: 0.92,
      valueUnit: 'score',
      label: 'Cuprite',
      concept: 'crystalline',
      role: 'primary',
      confidence: 'high',
      provenance: {
        createdAt: new Date().toISOString(),
        datasetId: 'ds-xrd-cu',
        processingHash: 'hash-xrd-cu',
        formula: 'Cu2O',
      },
    },
    {
      id: 'xps-cu2plus',
      technique: 'XPS',
      primaryAxis: 933.6,
      primaryAxisUnit: 'eV',
      value: 0.88,
      valueUnit: 'score',
      label: 'Cu2+',
      concept: 'oxidation_state',
      role: 'primary',
      confidence: 'high',
      provenance: {
        createdAt: new Date().toISOString(),
        datasetId: 'ds-xps-cu',
        processingHash: 'hash-xps-cu',
        summary: 'Cu2+ oxide surface layer at 933.6 eV',
        dbSource: 'literature',
        sourceId: 'biesinger-2010-cu',
        sourceDoi: '10.1016/j.apsusc.2010.07.086',
      },
    },
  ];

  const findings = evaluateFusionEngine(nodes);
  assert.equal(findings.length, 1);
  const finding = findings[0];

  assert.equal(finding.isSurfaceBulkDiscrepancy, true, 'Must flag surface/bulk discrepancy');
  assert.notEqual(finding.formulaTier, 'CONTESTED', 'Surface stratification must NOT mark tier as CONTESTED');
  assert.ok(
    finding.inheritedCaveats.some(c => c.includes('Surface/bulk stratification detected')),
    'Must include surface stratification caveat'
  );
  const xpsContrib = finding.supportingContributions.find(c => c.technique === 'XPS');
  assert.ok(xpsContrib, 'Must record XPS surface evidence as a structured contribution');
  assert.equal(xpsContrib?.sourceNode.provenance?.dbSource, 'literature');
  assert.equal(xpsContrib?.sourceNode.provenance?.sourceId, 'biesinger-2010-cu');
  assert.equal(xpsContrib?.sourceNode.provenance?.sourceDoi, '10.1016/j.apsusc.2010.07.086');
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) {
  process.exit(1);
}
