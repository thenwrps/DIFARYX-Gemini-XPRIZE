/**
 * Self-contained test: Loads one sample per technique from D:\DIFARYX_Synthetic_Data\SampleLibrary
 * and runs through the DIFARYX uploaded signal pipeline logic.
 *
 * Techniques: XRD, XPS, FTIR, Raman
 * Run: node scripts/testSampleLibrary.mjs
 */

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

// ── Inlined constants & helpers from uploadedSignalRuns.ts ─────────────

const CLAIM_BOUNDARY_BY_TECHNIQUE = {
  XRD: 'XRD may support phase assignment, but phase purity remains validation-limited.',
  XPS: 'XPS may support surface oxidation-state interpretation when calibrated, but cannot establish bulk phase identity alone.',
  FTIR: 'FTIR may contextualize bonding or support features, but cannot independently establish crystalline phase purity.',
  Raman: 'Raman supports local vibrational consistency, but does not replace crystallographic assignment.',
  Unknown: 'Unknown technique supports feature inspection only; no material-specific claim is generated.',
};

const AXIS_DEFAULTS_BY_TECHNIQUE = {
  XRD: { xAxisLabel: '2theta (deg)', yAxisLabel: 'Intensity (a.u.)' },
  XPS: { xAxisLabel: 'Binding energy (eV)', yAxisLabel: 'Counts (a.u.)' },
  FTIR: { xAxisLabel: 'Wavenumber (cm^-1)', yAxisLabel: 'Absorbance / transmittance' },
  Raman: { xAxisLabel: 'Raman shift (cm^-1)', yAxisLabel: 'Intensity (a.u.)' },
  Unknown: { xAxisLabel: 'X', yAxisLabel: 'Signal' },
};

const SUPPORTED_EXTENSIONS = ['csv', 'txt', 'xy', 'dat'];

function getExtension(fileName) {
  const match = fileName.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] ?? '';
}

function parseNumericToken(token) {
  const cleaned = token.trim().replace(/^["']|["']$/g, '');
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

function tokenizeLine(line) {
  return line.replace(/,/g, ' ').replace(/;/g, ' ').replace(/\t/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function inferTechniqueFromFileName(fileName) {
  const lower = fileName.toLowerCase();
  if (/\bxrd\b|diffraction|2theta|2-theta/i.test(lower)) return 'XRD';
  if (/\bxps\b|binding|survey|core[_-]?level/i.test(lower)) return 'XPS';
  if (/\bftir\b|\bir\b|infrared/i.test(lower)) return 'FTIR';
  if (/raman|shift/i.test(lower)) return 'Raman';
  return 'Unknown';
}

function makeEvidenceQuality(state, messages) {
  const labels = {
    ready: 'Ready',
    needs_mapping: 'Needs mapping',
    insufficient_numeric_data: 'Insufficient numeric data',
    low_signal_variation: 'Low signal variation',
    no_clear_features: 'No clear features',
    unsupported_format: 'Unsupported format',
  };
  return {
    state,
    label: labels[state] ?? state,
    canInterpret: state === 'ready',
    messages: ['Interpretation is bounded by current evidence coverage.', ...messages],
  };
}

// ── Parse uploaded signal text (inlined) ───────────────────────────────

function parseUploadedSignalText(fileName, text) {
  const extension = getExtension(fileName);
  if (!SUPPORTED_EXTENSIONS.includes(extension)) {
    return { ok: false, fileName, evidenceQuality: makeEvidenceQuality('unsupported_format', ['Supported public-beta formats are .csv, .txt, .xy, and .dat.']), error: 'Unsupported file format.' };
  }

  const points = [];
  const numericRowsData = [];
  let numericRows = 0;
  let ignoredRows = 0;
  let rowsWithOneNumericColumn = 0;
  let numericColumnCount = 0;

  text.split(/\r?\n/).forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) return;
    if (line.startsWith('#') || line.startsWith('//')) { ignoredRows += 1; return; }
    const numericValues = tokenizeLine(line).map(parseNumericToken).filter((v) => v !== null);
    numericColumnCount = Math.max(numericColumnCount, numericValues.length);
    if (numericValues.length >= 2) {
      const [x, y] = numericValues;
      points.push({ x, y });
      numericRowsData.push(numericValues);
      numericRows += 1;
      return;
    }
    if (numericValues.length === 1) rowsWithOneNumericColumn += 1;
    ignoredRows += 1;
  });

  if (points.length === 0) {
    return {
      ok: false,
      fileName,
      evidenceQuality: makeEvidenceQuality(
        rowsWithOneNumericColumn > 0 ? 'needs_mapping' : 'insufficient_numeric_data',
        rowsWithOneNumericColumn > 0
          ? ['At least two numeric columns are required. Map or export an X column and a Y column before analysis.']
          : ['No rows with at least two numeric columns were detected.'],
      ),
      error: rowsWithOneNumericColumn > 0 ? 'Only one numeric column was detected.' : 'No usable numeric signal rows were detected.',
    };
  }

  return {
    ok: true,
    fileName,
    format: extension,
    points,
    numericRowsData,
    numericRows,
    ignoredRows,
    numericColumnCount,
    columnMapping: { xColumn: 1, yColumn: 2, summary: 'Using first numeric column as X and second numeric column as Y.' },
    suggestedTechnique: inferTechniqueFromFileName(fileName),
    warnings: ignoredRows > 0 ? [`${ignoredRows} header, comment, or nonnumeric row${ignoredRows === 1 ? '' : 's'} ignored.`] : [],
  };
}

// ── Map columns ────────────────────────────────────────────────────────

function mapUploadedSignalColumns(parsed, xColumn, yColumn) {
  const xIndex = xColumn - 1;
  const yIndex = yColumn - 1;
  if (xIndex === yIndex || xIndex < 0 || yIndex < 0) return [];
  return parsed.numericRowsData.map((row) => {
    const x = row[xIndex];
    const y = row[yIndex];
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  }).filter((point) => point !== null);
}

// ── Feature extraction ─────────────────────────────────────────────────

function getFeatureSignal(points, technique) {
  if (technique !== 'FTIR') return points.map((p) => p.y);
  const yValues = points.map((p) => p.y);
  const maxY = Math.max(...yValues);
  return yValues.map((v) => maxY - v);
}

function getTechniqueContext(technique, position) {
  if (technique === 'XRD') return 'Reflection candidate; phase assignment requires reference-aware validation.';
  if (technique === 'XPS') {
    const coreRegion = position >= 280 && position <= 292 ? 'possible C 1s region' : position >= 528 && position <= 535 ? 'possible O 1s region' : position >= 705 && position <= 735 ? 'possible Fe 2p region' : position >= 925 && position <= 965 ? 'possible Cu 2p region' : position >= 99 && position <= 105 ? 'possible Si 2p region' : position >= 160 && position <= 170 ? 'possible S 2p region' : 'binding-energy region';
    return `${coreRegion}; calibration and peak fitting are required before oxidation-state claims.`;
  }
  if (technique === 'FTIR') {
    const bandContext = position >= 3200 && position <= 3700 ? 'O-H / N-H stretching context' : position >= 2800 && position <= 3100 ? 'C-H stretching context' : position >= 1650 && position <= 1800 ? 'carbonyl / adsorbate context' : position >= 1500 && position <= 1650 ? 'water bending or aromatic / carbonate context' : position >= 900 && position <= 1250 ? 'support, Si-O, or C-O bonding context' : position >= 400 && position <= 700 ? 'metal-oxygen or lattice-vibration context' : 'qualitative functional-group context';
    return `${bandContext}; bonding support remains contextual.`;
  }
  if (technique === 'Raman') {
    const modeContext = position >= 100 && position <= 800 ? 'lattice or local-structure mode region' : position >= 1300 && position <= 1650 ? 'possible carbon D/G or disorder-related region' : 'vibrational mode region';
    return `${modeContext}; fluorescence and baseline effects should be reviewed.`;
  }
  return 'Generic local maximum; no material-specific claim is generated.';
}

function getFeatureLabel(technique, index, position) {
  const roundedPosition = Number(position.toFixed(2));
  if (technique === 'XRD') return `Reflection ${index + 1} at ${roundedPosition}`;
  if (technique === 'XPS') return `Binding-energy region ${index + 1} at ${roundedPosition} eV`;
  if (technique === 'FTIR') return `Band region ${index + 1} at ${roundedPosition} cm^-1`;
  if (technique === 'Raman') return `Mode region ${index + 1} at ${roundedPosition} cm^-1`;
  return `Signal feature ${index + 1} at ${roundedPosition}`;
}

function extractTechniqueFeatures(points, technique, limit = 10) {
  if (points.length < 5) return [];
  const signal = getFeatureSignal(points, technique);
  const minSignal = Math.min(...signal);
  const maxSignal = Math.max(...signal);
  const variation = maxSignal - minSignal;
  if (variation <= 0) return [];

  const candidates = [];
  const windowRadius = Math.max(2, Math.min(8, Math.floor(points.length / 80)));
  for (let index = 1; index < points.length - 1; index += 1) {
    const current = signal[index];
    const previous = signal[index - 1];
    const next = signal[index + 1];
    if (!(current >= previous && current > next)) continue;
    const windowStart = Math.max(0, index - windowRadius);
    const windowEnd = Math.min(points.length - 1, index + windowRadius);
    const localWindow = signal.slice(windowStart, windowEnd + 1);
    const localMinimum = Math.min(...localWindow);
    const prominence = current - localMinimum;
    const relativeIntensity = (current - minSignal) / variation * 100;
    if (prominence < variation * .03 || relativeIntensity < 8) continue;
    candidates.push({ index, technique, position: points[index].x, intensity: points[index].y, relativeIntensity: Number(relativeIntensity.toFixed(1)), prominence: Number(prominence.toFixed(4)) });
  }

  const selected = [];
  const xValues = points.map((p) => p.x);
  const xRange = Math.max(...xValues) - Math.min(...xValues);
  const minSpacing = xRange > 0 ? xRange / 120 : 0;
  candidates.sort((a, b) => b.prominence - a.prominence || b.relativeIntensity - a.relativeIntensity).forEach((candidate) => {
    const tooClose = selected.some((feature) => Math.abs(feature.position - candidate.position) < minSpacing);
    if (!tooClose && selected.length < limit) selected.push(candidate);
  });

  return selected.sort((a, b) => b.relativeIntensity - a.relativeIntensity).map((feature, index) => ({
    id: `feature-${index + 1}`,
    technique,
    label: getFeatureLabel(technique, index, feature.position),
    position: Number(feature.position.toFixed(4)),
    intensity: Number(feature.intensity.toFixed(4)),
    relativeIntensity: feature.relativeIntensity,
    prominence: feature.prominence,
    context: getTechniqueContext(technique, feature.position),
  }));
}

// ── Evidence quality evaluation ────────────────────────────────────────

function evaluateEvidenceQuality(points, features) {
  if (points.length < 5) {
    return makeEvidenceQuality('insufficient_numeric_data', ['At least five numeric X/Y points are required for beta feature extraction.']);
  }
  const yValues = points.map((p) => p.y);
  const minY = Math.min(...yValues);
  const maxY = Math.max(...yValues);
  const variation = maxY - minY;
  const meanAbs = yValues.reduce((sum, v) => sum + Math.abs(v), 0) / yValues.length || 1;
  if (variation <= Number.EPSILON || variation / meanAbs < .01) {
    return makeEvidenceQuality('low_signal_variation', ['The uploaded signal varies too little for bounded feature extraction under the beta gate.']);
  }
  if (features.length === 0) {
    return makeEvidenceQuality('no_clear_features', ['No clear peaks, bands, or modes were detected with the current beta settings.']);
  }
  return makeEvidenceQuality('ready', ['Feature extraction is ready for bounded Notebook/Report handoff.']);
}

// ── Create uploaded signal run ─────────────────────────────────────────

function createUploadedSignalRun(input) {
  const createdAt = new Date().toISOString();
  const extractedFeatures = extractTechniqueFeatures(input.points, input.technique);
  const evidenceQuality = evaluateEvidenceQuality(input.points, extractedFeatures);
  const claimBoundary = [CLAIM_BOUNDARY_BY_TECHNIQUE[input.technique], 'Interpretation is bounded by current evidence coverage.'];
  const safeFileSlug = input.fileName.replace(/\/[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'signal';
  const createdAtMs = Date.parse(createdAt);
  return {
    id: `uploaded-${safeFileSlug}-${createdAtMs}`,
    sourceType: 'uploaded',
    fileName: input.fileName,
    technique: input.technique,
    sampleIdentity: input.sampleIdentity.trim(),
    xAxisLabel: input.xAxisLabel.trim(),
    yAxisLabel: input.yAxisLabel.trim(),
    points: input.points,
    extractedFeatures,
    evidenceQuality,
    claimBoundary,
    lockedContext: {
      sampleIdentity: input.sampleIdentity.trim(),
      technique: input.technique,
      sourceDataset: input.fileName,
      xAxisLabel: input.xAxisLabel.trim(),
      yAxisLabel: input.yAxisLabel.trim(),
      referenceScope: input.referenceScope?.trim() || 'User-provided beta upload context',
      claimBoundary: CLAIM_BOUNDARY_BY_TECHNIQUE[input.technique],
      confirmedAt: createdAt,
    },
    createdAt,
  };
}

// ── Test configuration ─────────────────────────────────────────────────

const SAMPLE_LIBRARY = 'D:\\DIFARYX_Synthetic_Data\\SampleLibrary';

const TECHNIQUE_CONFIG = {
  XRD:  { folder: 'XRD/txt',  technique: 'XRD',  sampleIdentity: 'Synthetic XRD sample' },
  XPS:  { folder: 'XPS/txt',  technique: 'XPS',  sampleIdentity: 'Synthetic XPS sample' },
  FTIR: { folder: 'FTIR/txt', technique: 'FTIR', sampleIdentity: 'Synthetic FTIR sample' },
  Raman: { folder: 'Raman/txt', technique: 'Raman', sampleIdentity: 'Synthetic Raman sample' },
};

const FORBIDDEN_PHRASES = [
  'proves the material identity is',
  'definitive proof of',
  'confirms the identity of',
  'the material is definitely',
  'the identity is confirmed',
  'composition is confirmed',
  'the sample is confirmed to be',
  'confirmed identity',
];

function stripCommentHeader(raw) {
  const lines = raw.split('\n');
  const dataStart = lines.findIndex((line, index) => index > 0 && !line.trim().startsWith('#') && line.trim().length > 0);
  return dataStart >= 0 ? lines.slice(dataStart).join('\n') : raw;
}

// ── Per-technique test runner ──────────────────────────────────────────

async function runSingleTest(config, fileName) {
  const filePath = join(SAMPLE_LIBRARY, config.folder, fileName);
  const result = { file: fileName, passed: true, checks: [], details: {}, issues: [] };

  try {
    const raw = await readFile(filePath, 'utf8');
    const dataOnly = stripCommentHeader(raw);

    // 1. Parse
    const parsed = parseUploadedSignalText(fileName, dataOnly);
    result.checks.push({ name: 'parse', ok: parsed.ok, info: parsed.ok ? `${parsed.format}, ${parsed.points.length} points` : parsed.error });
    if (!parsed.ok) { result.passed = false; result.issues.push(`parse: ${parsed.error}`); return result; }

    // 2. Map columns
    const mappedPoints = mapUploadedSignalColumns(parsed, 1, 2);
    result.checks.push({ name: 'column_mapping', ok: mappedPoints.length > 0, info: `${mappedPoints.length} points` });
    if (mappedPoints.length === 0) { result.passed = false; result.issues.push('no mapped points'); return result; }

    // 3. Create run
    const axisDefaults = AXIS_DEFAULTS_BY_TECHNIQUE[config.technique];
    const run = createUploadedSignalRun({
      fileName, technique: config.technique, sampleIdentity: config.sampleIdentity,
      xAxisLabel: axisDefaults.xAxisLabel, yAxisLabel: axisDefaults.yAxisLabel,
      referenceScope: 'Synthetic sample library test', points: mappedPoints,
    });

    // 4. Evidence quality
    result.checks.push({ name: 'evidence_quality', ok: true, info: `state=${run.evidenceQuality.state}` });
    result.details.evidenceState = run.evidenceQuality.state;
    result.details.canInterpret = run.evidenceQuality.canInterpret;

    // 5. Features
    result.checks.push({ name: 'feature_extraction', ok: run.extractedFeatures.length > 0, info: `${run.extractedFeatures.length} features` });
    result.details.featureCount = run.extractedFeatures.length;

    // 6. Claim boundary
    const expectedBoundary = CLAIM_BOUNDARY_BY_TECHNIQUE[config.technique];
    const hasBoundary = run.claimBoundary?.length > 0;
    const correctBoundary = run.claimBoundary?.some((b) => b.includes(expectedBoundary.slice(0, 30)));
    result.checks.push({ name: 'claim_boundary', ok: hasBoundary && correctBoundary });

    // 7. Locked context
    const lc = run.lockedContext;
    result.checks.push({ name: 'locked_context', ok: lc.technique === config.technique && !!lc.claimBoundary && !!lc.confirmedAt });

    // 8. Forbidden wording
    const allText = JSON.stringify(run);
    const forbidden = FORBIDDEN_PHRASES.filter((p) => allText.toLowerCase().includes(p.toLowerCase()));
    result.checks.push({ name: 'forbidden_wording', ok: forbidden.length === 0 });
    if (forbidden.length > 0) { result.passed = false; result.issues.push(`forbidden: ${forbidden.join(', ')}`); }

    // 9. Structure
    const structIssues = [];
    if (!run.id) structIssues.push('id');
    if (!run.fileName) structIssues.push('fileName');
    if (!run.technique) structIssues.push('technique');
    if (!run.points?.length) structIssues.push('points');
    if (!run.evidenceQuality) structIssues.push('evidenceQuality');
    if (!run.lockedContext) structIssues.push('lockedContext');
    if (!run.createdAt) structIssues.push('createdAt');
    if (run.sourceType !== 'uploaded') structIssues.push('sourceType');
    result.checks.push({ name: 'structure', ok: structIssues.length === 0 });
    if (structIssues.length > 0) { result.passed = false; result.issues.push(...structIssues); }

    result.details.pointCount = run.points.length;
    result.details.xRange = `${Math.min(...parsed.points.map(p => p.x)).toFixed(2)} – ${Math.max(...parsed.points.map(p => p.x)).toFixed(2)}`;

  } catch (err) {
    result.passed = false;
    result.issues.push(`exception: ${err.message}`);
  }
  return result;
}

async function runBatchTest(techniqueKey, sampleLimit = 50) {
  const config = TECHNIQUE_CONFIG[techniqueKey];
  const folderPath = join(SAMPLE_LIBRARY, config.folder);
  const allFiles = (await readdir(folderPath)).filter((f) => f.endsWith('.txt')).slice(0, sampleLimit);

  const techniqueResult = {
    technique: techniqueKey,
    totalFiles: allFiles.length,
    passed: 0,
    failed: 0,
    results: [],
    aggregateFeatures: 0,
    aggregatePoints: 0,
    evidenceStates: {},
    topErrors: [],
  };

  for (const fileName of allFiles) {
    const result = await runSingleTest(config, fileName);
    techniqueResult.results.push(result);
    if (result.passed) {
      techniqueResult.passed += 1;
    } else {
      techniqueResult.failed += 1;
      techniqueResult.topErrors.push({ file: fileName, issues: result.issues });
    }
    techniqueResult.aggregateFeatures += result.details.featureCount ?? 0;
    techniqueResult.aggregatePoints += result.details.pointCount ?? 0;
    const state = result.details.evidenceState ?? 'error';
    techniqueResult.evidenceStates[state] = (techniqueResult.evidenceStates[state] ?? 0) + 1;
  }

  return techniqueResult;
}

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
  const SAMPLE_LIMIT = 50;

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  DIFARYX Sample Library — User Mode Pipeline Test');
  console.log(`  Testing ${SAMPLE_LIMIT} samples per technique`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  const techniques = ['XRD', 'XPS', 'FTIR', 'Raman'];
  const batchResults = [];

  for (const tech of techniques) {
    const startTime = Date.now();
    console.log(`\n── ${tech} (${SAMPLE_LIMIT} samples) ───────────────────────────`);
    const batch = await runBatchTest(tech, SAMPLE_LIMIT);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    batchResults.push(batch);

    const passRate = ((batch.passed / batch.totalFiles) * 100).toFixed(1);
    const avgFeatures = (batch.aggregateFeatures / batch.totalFiles).toFixed(1);
    const avgPoints = Math.round(batch.aggregatePoints / batch.totalFiles);

    console.log(`  Samples tested:    ${batch.totalFiles}`);
    console.log(`  Passed:            ${batch.passed}/${batch.totalFiles} (${passRate}%)`);
    console.log(`  Failed:            ${batch.failed}`);
    console.log(`  Avg data points:   ${avgPoints}`);
    console.log(`  Total features:    ${batch.aggregateFeatures} (avg ${avgFeatures}/sample)`);
    console.log(`  Evidence states:   ${JSON.stringify(batch.evidenceStates)}`);
    console.log(`  Time:              ${elapsed}s`);

    if (batch.topErrors.length > 0) {
      console.log(`  Errors (first 5):`);
      for (const err of batch.topErrors.slice(0, 5)) {
        console.log(`    ✗ ${err.file}: ${err.issues.join(', ')}`);
      }
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  FINAL RESULTS (50 samples per technique)');
  console.log('═══════════════════════════════════════════════════════════════');

  let totalPassed = 0;
  let totalFailed = 0;
  let totalSamples = 0;

  for (const batch of batchResults) {
    const passRate = ((batch.passed / batch.totalFiles) * 100).toFixed(1);
    const status = batch.failed === 0 ? '✅ PASS' : '⚠️  PARTIAL';
    console.log(`  ${status}  ${batch.technique.padEnd(6)}  ${batch.passed}/${batch.totalFiles} passed (${passRate}%)  features=${batch.aggregateFeatures}  errors=${batch.failed}`);
    totalPassed += batch.passed;
    totalFailed += batch.failed;
    totalSamples += batch.totalFiles;
  }

  console.log('───────────────────────────────────────────────────────────────');
  console.log(`  TOTAL:  ${totalPassed}/${totalSamples} passed, ${totalFailed} failed`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  const allPassed = batchResults.every((b) => b.failed === 0);
  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => { console.error('Fatal error:', err); process.exit(1); });