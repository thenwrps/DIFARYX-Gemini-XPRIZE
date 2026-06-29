import assert from 'node:assert/strict';
import { adaptFtirEvidence } from '../ftir/adapter.js';
import { adaptXrdEvidence } from '../xrd/adapter.js';
import { adaptRamanEvidence } from '../raman/adapter.js';
import { adaptXpsEvidence } from '../xps/adapter.js';
import type { FtirProcessingResult } from '../../agents/ftirAgent/types.js';
import type { XrdAgentResult } from '../../agents/xrdAgent/types.js';
import type { RamanProcessingResult } from '../../agents/ramanAgent/types.js';
import type { XpsProcessingResult } from '../../agents/xpsAgent/runner.js';

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

console.log('\nEvidence Adapters Tests');

test('FTIR Adapter preserves exact provenance and leaves missing fields undefined', () => {
  const mockFtir: FtirProcessingResult = {
    signal: { wavenumber: [1000], absorbance: [0.5] },
    baseline: [0],
    bands: [{ id: 'b1', wavenumber: 3400, intensity: 0.8, prominence: 0.5, fwhm: 50, area: 40, classification: 'broad' }],
    matches: [],
    functionalGroupCandidates: [
      {
        functionalGroup: 'Surface hydroxyl',
        assignment: 'O-H stretch',
        matches: [],
        supportingBands: [],
        score: 0.85,
        confidenceLevel: 'high',
        ambiguity: null,
        dbSource: 'literature',
        matchSource: 'Smith et al.',
        formula: 'OH-',
        summary: 'Hydroxyl group',
        rawConfidence: 0.85,
        // sourceId and sourceDoi deliberately omitted to test undefined preservation
      },
    ],
    interpretation: {
      dominantFunctionalGroups: ['Surface hydroxyl'],
      chemicalInterpretation: 'Hydroxyl present',
      decision: 'OK',
      confidenceScore: 85,
      confidenceLevel: 'high',
      evidence: [],
      ambiguities: [],
      caveats: [],
      summary: 'Hydroxyl present',
    },
    validation: { ok: true, errors: [], warnings: [], pointCount: 1, wavenumberRange: [400, 4000] },
    executionLog: [],
    parametersUsed: {},
  };

  const nodes = adaptFtirEvidence(mockFtir, 'ds-ftir', 'Sample A');
  assert.equal(nodes.length, 1);
  const node = nodes[0];
  assert.equal(node.technique, 'FTIR');
  assert.equal(node.label, 'Surface hydroxyl');
  assert.equal(node.provenance?.datasetId, 'ds-ftir');
  assert.equal(node.provenance?.sampleName, 'Sample A');
  assert.equal(node.provenance?.dbSource, 'literature');
  assert.equal(node.provenance?.matchSource, 'Smith et al.');
  assert.equal(node.provenance?.formula, 'OH-');
  assert.equal(node.provenance?.sourceId, undefined);
  assert.equal(node.provenance?.sourceDoi, undefined);
});

test('XRD Adapter preserves exact provenance and leaves missing fields undefined', () => {
  const mockXrd: XrdAgentResult = {
    input: { datasetId: 'ds-xrd', sampleName: 'Sample B', dataPoints: [] },
    validation: { ok: true, errors: [], warnings: [], pointCount: 0, xRange: null },
    preprocessedData: [],
    baselineData: [],
    detectedPeaks: [{ id: 'p1', position: 35.2, intensity: 100, rawIntensity: 100, prominence: 50, fwhm: 0.2, dSpacing: 2.5, classification: 'sharp', label: 'p1' }],
    candidates: [
      {
        phase: { id: 'c1', name: 'Magnetite', formula: 'Fe3O4', family: 'Spinel', crystalSystem: 'cubic', spaceGroup: 'Fd-3m', latticeParameters: { a: 8.39 }, referenceNote: 'COD 1011032', peaks: [] },
        matches: [],
        missingPeaks: [],
        explainedObservedPeakIds: ['p1'],
        matchedReferencePeakRatio: 1,
        strongestPeakAgreement: 1,
        missingStrongPeakPenalty: 0,
        unexplainedStrongPeakPenalty: 0,
        score: 0.92,
        confidenceLevel: 'high',
        dbSource: 'COD',
        sourceId: '1011032',
        formula: 'Fe3O4',
        summary: 'Magnetite (Fe3O4)',
        rawConfidence: 0.92,
        // sourceDoi and matchSource deliberately omitted
      },
    ],
    conflicts: { primaryCandidate: null, missingStrongPeaks: [], unexplainedPeaks: [], broadFeatures: [], possibleImpurities: [], ambiguousCandidates: [], notes: [] },
    interpretation: { primaryPhase: 'Magnetite', decision: 'OK', confidenceScore: 92, confidenceLevel: 'high', evidence: [], conflicts: [], caveats: [], summary: 'Magnetite' },
    executionLog: [],
  };

  const nodes = adaptXrdEvidence(mockXrd, 'ds-xrd', 'Sample B');
  assert.equal(nodes.length, 1);
  const node = nodes[0];
  assert.equal(node.technique, 'XRD');
  assert.equal(node.label, 'Magnetite');
  assert.equal(node.provenance?.dbSource, 'COD');
  assert.equal(node.provenance?.sourceId, '1011032');
  assert.equal(node.provenance?.formula, 'Fe3O4');
  assert.equal(node.provenance?.sourceDoi, undefined);
  assert.equal(node.provenance?.matchSource, undefined);
});

test('Raman Adapter preserves exact provenance and leaves missing fields undefined', () => {
  const mockRaman: RamanProcessingResult = {
    signal: { ramanShift: [], intensity: [] },
    baseline: [],
    peaks: [{ id: 'rp1', ramanShift: 668, intensity: 100, rawIntensity: 100, prominence: 50, fwhm: 15, area: 1500, classification: 'sharp', label: 'A1g' }],
    matches: [],
    modeCandidate: [
      {
        modeName: 'A1g spinel ferrite',
        assignment: 'Fe-O symmetric stretch',
        matches: [],
        supportingModes: [],
        score: 0.88,
        confidenceLevel: 'high',
        ambiguity: null,
        phaseType: 'ferrite',
        dbSource: 'RRUFF',
        sourceId: 'R060191',
        formula: 'Fe3O4',
        summary: 'Magnetite Raman match',
        rawConfidence: 0.88,
        // sourceDoi omitted
      },
    ],
    interpretation: { dominantModes: ['A1g'], phaseInterpretation: 'Magnetite', decision: 'OK', confidenceScore: 88, confidenceLevel: 'high', evidence: [], ambiguities: [], caveats: [], summary: 'Magnetite' },
    validation: { ok: true, errors: [], warnings: [], pointCount: 0, ramanShiftRange: [100, 1000] },
    executionLog: [],
    parametersUsed: {},
  };

  const nodes = adaptRamanEvidence(mockRaman, 'ds-raman', 'Sample C');
  assert.equal(nodes.length, 1);
  const node = nodes[0];
  assert.equal(node.technique, 'Raman');
  assert.equal(node.label, 'A1g spinel ferrite');
  assert.equal(node.provenance?.dbSource, 'RRUFF');
  assert.equal(node.provenance?.sourceId, 'R060191');
  assert.equal(node.provenance?.sourceDoi, undefined);
});

test('XPS Adapter preserves exact provenance and leaves missing fields undefined', () => {
  const mockXps: XpsProcessingResult = {
    signal: { bindingEnergy: [], intensity: [] },
    baseline: [],
    peaks: [],
    matches: [
      {
        peakId: 'xp1',
        observedBE: 711.0,
        referenceBE: 711.0,
        deltaBE: 0.0,
        element: 'Fe',
        oxidationState: 'Fe(III) oxide',
        assignment: 'Fe 2p3/2 Fe(III) oxide',
        confidence: 0.85,
        dbSource: 'NIST',
        sourceId: 'SRD 20',
        formula: 'Fe2O3',
        summary: 'Fe(III) in Fe2O3',
        // sourceDoi omitted
      },
    ],
    stateAggregations: [],
    confidence: 'high',
    caveats: [],
    scientificSummary: 'Fe2O3 detected',
  };

  const nodes = adaptXpsEvidence(mockXps, 'ds-xps', 'Sample D');
  assert.equal(nodes.length, 1);
  const node = nodes[0];
  assert.equal(node.technique, 'XPS');
  assert.equal(node.label, 'Fe(III) oxide');
  assert.equal(node.provenance?.dbSource, 'NIST');
  assert.equal(node.provenance?.sourceId, 'SRD 20');
  assert.equal(node.provenance?.formula, 'Fe2O3');
  assert.equal(node.provenance?.sourceDoi, undefined);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) {
  process.exit(1);
}
