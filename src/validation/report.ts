import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TechniqueMetrics, FusionMetrics, TechniqueCaseResult, FusionCaseResult } from './metrics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const MANDATORY_DISCLAIMER = 'V1 synthetic self-consistency validation against curated/perturbed labels — NOT real-instrument accuracy.';

export interface ValidationRunData {
  timestamp: string;
  disclaimer: string;
  xrd: {
    metrics: TechniqueMetrics;
    results: TechniqueCaseResult[];
  };
  raman?: {
    metrics: TechniqueMetrics;
    results: TechniqueCaseResult[];
  };
  ftir?: {
    metrics: TechniqueMetrics;
    results: TechniqueCaseResult[];
  };
  xps?: {
    metrics: TechniqueMetrics;
    results: TechniqueCaseResult[];
  };
  fusion: {
    metrics: FusionMetrics;
    results: Array<{
      caseId: string;
      category: string;
      description: string;
      findingsCount: number;
      topFormula?: string;
      topFormulaTier?: string;
      topPolymorphTier?: string;
      isSurfaceBulkDiscrepancy?: boolean;
      caveats: string[];
    }>;
  };
}

function printTechniqueBlock(
  title: string,
  index: number,
  techData: { metrics: TechniqueMetrics; results: TechniqueCaseResult[] },
  options?: { thresholdValue?: string; thresholdLabel?: string; note?: string; scoringNote?: string; familyLabel?: string; familyNote?: string }
): void {
  const xm = techData.metrics;
  const shortName = title.split(' ')[0];
  console.log('--------------------------------------------------------------------------------');
  console.log(` ${index}. TECHNIQUE EVALUATION: ${title}`);
  console.log('--------------------------------------------------------------------------------');
  console.log(`Confidence Threshold  : ${options?.thresholdValue || 'N/A'}`);
  console.log(`Total Cases Evaluated : ${xm.totalCases}`);
  console.log(`Top-1 Accuracy        : ${(xm.top1Accuracy * 100).toFixed(1)}%`);
  console.log(`Exact-Phase Precision : ${(xm.precision * 100).toFixed(1)}%${options?.scoringNote || ''}`);
  console.log(`Exact-Phase Recall    : ${(xm.recall * 100).toFixed(1)}%${options?.scoringNote || ''}`);
  console.log(`Exact-Phase F1 Score  : ${(xm.f1Score * 100).toFixed(1)}% (TP=${xm.truePositives}, FP=${xm.falsePositives}, TN=${xm.trueNegatives}, FN=${xm.falseNegatives})${options?.scoringNote || ''}`);
  
  if (options?.familyLabel) {
    console.log(`${options.familyLabel.padEnd(22)}: ${(xm.familyAware.f1Score * 100).toFixed(1)}% (TP=${xm.familyAware.tp}, FP=${xm.familyAware.fp}, TN=${xm.familyAware.tn}, FN=${xm.familyAware.fn}) ${options.familyNote || ''}`);
  } else {
    console.log(`Family-Aware F1 Score : ${(xm.familyAware.f1Score * 100).toFixed(1)}% (TP=${xm.familyAware.tp}, FP=${xm.familyAware.fp}, TN=${xm.familyAware.tn}, FN=${xm.familyAware.fn}) ${options?.familyNote || '[exact phase requires multi-technique fusion]'}`);
  }

  console.log(`\n${shortName} Positive Miss Decomposition:`);
  console.log(`  - Below Threshold (${options?.thresholdLabel || 'score < 0.65'})         : ${xm.missDecomposition.below_threshold}`);
  console.log(`  - Matched Isostructural/Family (expected): ${xm.missDecomposition.matched_isostructural_spinel}`);
  console.log(`  - Known Limitation (documented cap)      : ${xm.missDecomposition.known_limitation}`);
  console.log(`  - Beyond Tolerance Expected Degradation  : ${xm.missDecomposition.beyond_tolerance_expected}`);
  console.log(`  - Genuinely Wrong Phase                  : ${xm.missDecomposition.genuinely_wrong}`);

  console.log(`\n${shortName} Accuracy & Recall Split by Perturbation Type:`);
  for (const [tag, stats] of Object.entries(xm.perturbationBreakdown)) {
    console.log(`  - ${tag.padEnd(24)} | Total: ${String(stats.total).padStart(2)} | Accuracy: ${(stats.accuracy * 100).toFixed(1).padStart(5)}% | Pos Recall: ${(stats.recall * 100).toFixed(1).padStart(5)}%`);
  }

  if (xm.confusionPairs.length > 0) {
    console.log(`\n${shortName} Confusion Pairs (Expected -> Actual):`);
    for (const cp of xm.confusionPairs) {
      console.log(`  - ${cp.expected} -> ${cp.actual} (${cp.count} times)`);
    }
  }

  console.log(`\n${shortName} Individual Case Results:`);
  for (const r of techData.results) {
    const actLower = (r.actualPhase || '').toLowerCase();
    const expLower = (r.expectedPhase || '').toLowerCase();
    const isMatch = !r.expectedPhase || (Boolean(r.actualPhase) && (actLower === expLower || actLower.includes(expLower)));
    const status = (r.expectedShouldMatch === r.actualDidMatch) && (!r.expectedShouldMatch || isMatch) ? 'PASS' : 'FAIL';
    console.log(`  [${status}] ${r.caseId.padEnd(20)} | exp: ${String(r.expectedPhase || 'NONE').padEnd(22)} | act: ${String(r.actualPhase || 'NONE').padEnd(22)} | score: ${(r.actualScore ?? 0).toFixed(3)}`);
  }

  if (options?.note) {
    console.log(`\nNOTE: ${options.note}\n`);
  } else {
    console.log('');
  }
}

export function printValidationReport(runData: ValidationRunData): void {
  console.log('\n================================================================================');
  console.log('                        DIFARYX VALIDATION HARNESS (V1-a)');
  console.log('================================================================================');
  console.log(`Timestamp: ${runData.timestamp}`);
  console.log(`\nIMPORTANT DISCLAIMER:\n  *** ${runData.disclaimer} ***\n`);

  let sectionIdx = 1;

  // 1. XRD Block
  printTechniqueBlock('XRD PHASE IDENTIFICATION', sectionIdx++, runData.xrd, {
    thresholdValue: '0.65',
    thresholdLabel: 'score < 0.65',
    familyNote: '[exact phase requires multi-technique fusion]',
    note: 'Rutile TiO2 absent from XRD reference DB — anatase identifiable, rutile not; candidate for a future COD rutile entry (V2).',
  });

  // 2. Raman Block
  if (runData.raman) {
    printTechniqueBlock('RAMAN SPECTROSCOPY IDENTIFICATION', sectionIdx++, runData.raman, {
      thresholdValue: '0.50',
      thresholdLabel: 'score < 0.50',
      familyNote: '[spinel ferrites share Raman mode envelope]',
      note: 'Magnetite/maghemite/hematite are Raman-distinguishable; spinel ferrites (CuFe2O4/CoFe2O4/NiFe2O4) share mode envelope.',
    });
  }

  // 3. FTIR Block
  if (runData.ftir) {
    printTechniqueBlock('FTIR FUNCTIONAL GROUP & BAND IDENTIFICATION', sectionIdx++, runData.ftir, {
      thresholdValue: '40',
      thresholdLabel: 'score < 40',
      familyLabel: 'Band-Family F1 Score  ',
      familyNote: '[M-O bands are non-discriminating for spinel ferrites by design]',
      note: 'Exact-phase recall is expected to be low by design due to broad M-O vibration overlap in spinel ferrites.',
    });
  }

  // 4. XPS Block
  if (runData.xps) {
    printTechniqueBlock('XPS CHEMICAL STATE IDENTIFICATION', sectionIdx++, runData.xps, {
      thresholdValue: '0.25',
      thresholdLabel: 'score < 0.25',
      scoringNote: ' [scored over (element, oxidationState)]',
      familyLabel: 'State F1 Score        ',
      familyNote: '[scored over (element, oxidationState)]',
      note: 'XPS is not a phase technique; scored by correctness of (element, oxidationState) rather than phase.',
    });
  }

  // Fusion Summary Table
  const fm = runData.fusion.metrics;
  console.log('--------------------------------------------------------------------------------');
  console.log(` ${sectionIdx}. MULTI-TECH EVALUATION: EVIDENCE FUSION ENGINE`);
  console.log('--------------------------------------------------------------------------------');
  console.log(`Total Fusion Cases            : ${fm.totalCases}`);
  console.log(`Formula Accuracy              : ${(fm.formulaAccuracy * 100).toFixed(1)}%`);
  console.log(`Contradiction Recall          : ${(fm.contradiction.recall * 100).toFixed(1)}% (TP=${fm.contradiction.tp}, FN=${fm.contradiction.fn})`);
  console.log(`False Contradiction Rate      : ${(fm.contradiction.falseContradictionRate * 100).toFixed(1)}% (FP=${fm.contradiction.fp}, TN=${fm.contradiction.tn})`);
  console.log(`Surface Detection Rate        : ${(fm.surfaceDetection.rate * 100).toFixed(1)}% (TP=${fm.surfaceDetection.tp}, FP=${fm.surfaceDetection.fp}, TN=${fm.surfaceDetection.tn}, FN=${fm.surfaceDetection.fn})`);
  console.log(`Polymorph Cap Adherence       : ${(fm.polymorphCapAdherence * 100).toFixed(1)}%`);
  console.log(`Independence Guard Correctness: ${(fm.independenceGuardCorrectness * 100).toFixed(1)}%`);

  console.log('\nTier Confusion Matrix (Expected row vs Actual col):');
  const tiers = ['CORROBORATED', 'SUPPORTED', 'SINGLE-SOURCE', 'CONTESTED', 'UNVERIFIED', 'NONE'];
  const header = 'Expected \\ Actual'.padEnd(16) + tiers.map(t => t.slice(0, 9).padStart(10)).join('');
  console.log(header);
  for (const exp of tiers) {
    const row = fm.tierConfusionMatrix[exp];
    if (!row) continue;
    const hasVals = Object.values(row).some(v => v > 0);
    if (!hasVals && exp === 'NONE') continue;
    const rowStr = exp.padEnd(16) + tiers.map(act => String(row[act] || 0).padStart(10)).join('');
    console.log(rowStr);
  }

  console.log('\n================================================================================\n');
}

export function saveValidationDump(runData: ValidationRunData): string {
  const dumpPath = path.resolve(__dirname, 'lastRun.json');
  fs.writeFileSync(dumpPath, JSON.stringify(runData, null, 2), 'utf-8');
  console.log(`Structured JSON dump saved to: ${dumpPath}\n`);
  return dumpPath;
}
