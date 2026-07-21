import assert from 'node:assert/strict';
import {
  buildAggregateUploadedSnapshot,
  hasValidScientificObjective,
  isSupportedEvidenceFile,
} from '../standaloneEvidenceIntakeService.js';
import { saveUploadedSignalRun, type Technique, type UploadedSignalRun } from '../../../data/uploadedSignalRuns.js';
import { setStorage } from '../../../utils/localStorageSafe.js';
import { createEvidenceBundleFromSnapshot, mergeEvidenceFilesIntoBundle } from '../../../runtime/evidenceBundle.js';
import { normalizeUploadTechnique } from '../../../services/uploadService.js';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  PASS ${name}`);
    passed += 1;
  } catch (error) {
    console.error(`  FAIL ${name}`);
    console.error(`    ${error instanceof Error ? error.message : String(error)}`);
    failed += 1;
  }
}

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

function readyRun(id: string, technique: Technique, fileName: string): UploadedSignalRun {
  const createdAt = '2026-07-21T00:00:00.000Z';
  return {
    id,
    sourceType: 'uploaded',
    fileName,
    technique,
    sampleIdentity: 'Standalone sample',
    xAxisLabel: technique === 'XRD' ? '2theta (degrees)' : 'Raman shift (cm-1)',
    yAxisLabel: 'Intensity',
    points: [{ x: 10, y: 1 }, { x: 20, y: 5 }, { x: 30, y: 1 }],
    extractedFeatures: [{
      id: `${id}-feature`,
      technique,
      label: `${technique} feature`,
      position: 20,
      intensity: 5,
      relativeIntensity: 1,
      prominence: 4,
      context: 'Parser-derived bounded feature',
    }],
    evidenceQuality: { state: 'ready', label: 'Ready', canInterpret: true, messages: ['Evidence gate passed.'] },
    claimBoundary: [`${technique} evidence remains technique-bounded.`],
    lockedContext: {
      sampleIdentity: 'Standalone sample',
      technique,
      sourceDataset: fileName,
      xAxisLabel: 'Position',
      yAxisLabel: 'Intensity',
      referenceScope: 'Test evidence',
      claimBoundary: 'Technique-bounded evidence only.',
      confirmedAt: createdAt,
    },
    createdAt,
  };
}

const storage = memoryStorage();
setStorage(storage);
(globalThis as typeof globalThis & { window: { localStorage: Storage } }).window = { localStorage: storage };

console.log('\nstandalone evidence intake');

test('requires a meaningful scientific objective', () => {
  assert.equal(hasValidScientificObjective('short'), false);
  assert.equal(hasValidScientificObjective('Evaluate spinel phase evidence'), true);
});

test('accepts only repository-supported parser formats', () => {
  ['sample.csv', 'sample.txt', 'sample.xy', 'sample.dat'].forEach((name) => assert.equal(isSupportedEvidenceFile(name), true));
  ['sample.pdf', 'sample.xlsx', 'sample.raw'].forEach((name) => assert.equal(isSupportedEvidenceFile(name), false));
});

test('preserves the canonical Raman technique label through the upload adapter', () => {
  assert.equal(normalizeUploadTechnique('raman'), 'Raman');
  assert.equal(normalizeUploadTechnique('RAMAN'), 'Raman');
});

test('extends a standalone bundle with an additional technique', () => {
  const metadata = {
    objective: 'Evaluate whether the evidence supports a spinel structure',
    materialSystem: 'Cu-Fe-O',
    decisionRequired: 'Select the next validation experiment',
  };
  const xrd = readyRun('upload-xrd', 'XRD', 'sample_xrd.xy');
  const raman = readyRun('upload-raman', 'Raman', 'sample_raman.txt');
  assert.equal(saveUploadedSignalRun(xrd), true);
  assert.equal(saveUploadedSignalRun(raman), true);

  const initialSnapshot = buildAggregateUploadedSnapshot([xrd], metadata);
  const initialBundle = createEvidenceBundleFromSnapshot(initialSnapshot, { creationReason: 'user_selected_multiple_files' });
  assert.deepEqual(initialSnapshot.availableTechniques, ['XRD']);

  const extendedSnapshot = buildAggregateUploadedSnapshot([xrd, raman], metadata);
  const extendedBase = createEvidenceBundleFromSnapshot(extendedSnapshot, { creationReason: 'uploaded_multi_file' });
  const extendedBundle = mergeEvidenceFilesIntoBundle(
    extendedBase,
    initialBundle.files.filter((file) => file.status !== 'missing_required'),
  );

  assert.deepEqual(extendedSnapshot.availableTechniques, ['XRD', 'Raman']);
  assert.equal(extendedSnapshot.evidenceEntries.length, 2);
  assert.equal(extendedBundle.availableTechniques.includes('XRD'), true);
  assert.equal(extendedBundle.availableTechniques.includes('Raman'), true);
  assert.equal(extendedBundle.files.some((file) => file.fileId === xrd.id), true);
  assert.equal(extendedBundle.files.some((file) => file.fileId === raman.id), true);
});

if (failed > 0) {
  console.error(`\n${failed} standalone evidence intake test(s) failed.`);
  process.exit(1);
}

console.log(`\n${passed} standalone evidence intake tests passed.`);
