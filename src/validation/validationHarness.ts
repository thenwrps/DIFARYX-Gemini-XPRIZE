import { runXrdPhaseIdentificationAgent } from '../agents/xrdAgent/runner.js';
import type { XrdPoint } from '../agents/xrdAgent/types.js';
import { evaluateFusionEngine } from '../engines/fusionEngine/fusionEngine.js';
import { XRD_GROUND_TRUTH_CASES, type XrdTestCaseInputPeak } from './groundTruth/xrd.cases.js';
import { FUSION_GROUND_TRUTH_CASES } from './groundTruth/fusion.cases.js';
import { evaluateRamanCases } from './groundTruth/raman.cases.js';
import { evaluateFtirCases } from './groundTruth/ftir.cases.js';
import { evaluateXpsCases } from './groundTruth/xps.cases.js';
import {
  computeTechniqueMetrics,
  computeFusionMetrics,
  type TechniqueCaseResult,
  type FusionCaseResult,
} from './metrics.js';
import {
  printValidationReport,
  saveValidationDump,
  MANDATORY_DISCLAIMER,
  type ValidationRunData,
} from './report.js';
import { enforceValidationGates } from './baselines.js';

function synthesizeTrace(peaks: XrdTestCaseInputPeak[]): XrdPoint[] {
  const points: XrdPoint[] = [];
  for (let x = 10; x <= 80; x += 0.05) {
    let y = 5; // Clean constant baseline
    for (const p of peaks) {
      if (Math.abs(x - p.position) < 0.8) {
        y += p.intensity * Math.exp(-Math.pow((x - p.position) / 0.12, 2));
      }
    }
    points.push({ x: Number(x.toFixed(2)), y });
  }
  return points;
}

export async function runValidationHarness(): Promise<ValidationRunData> {
  console.log('Starting DIFARYX Validation Harness execution...');

  // 1. Run XRD Technique Evaluation
  const xrdResults: TechniqueCaseResult[] = [];
  for (const tc of XRD_GROUND_TRUTH_CASES) {
    const trace = synthesizeTrace(tc.input);
    const agentResult = runXrdPhaseIdentificationAgent({
      datasetId: `val-${tc.id}`,
      sampleName: tc.description,
      dataPoints: trace,
    });

    const primary = agentResult.conflicts.primaryCandidate;
    const actualDidMatch = Boolean(primary && primary.score >= 0.65);
    const actualPhase = actualDidMatch && primary ? primary.phase.id : undefined;

    xrdResults.push({
      caseId: tc.id,
      expectedShouldMatch: tc.expected.shouldMatch,
      actualDidMatch,
      expectedPhase: tc.expected.topPhase,
      actualPhase,
      actualScore: primary ? primary.score : 0,
      perturbations: tc.perturbations,
      knownLimitation: tc.knownLimitation,
    });
  }

  const xrdMetrics = computeTechniqueMetrics(xrdResults, { technique: 'XRD' });

  // 2. Run Raman Technique Evaluation
  const ramanResults = evaluateRamanCases();
  const ramanMetrics = computeTechniqueMetrics(ramanResults, { technique: 'Raman' });

  // 3. Run FTIR Technique Evaluation
  const ftirResults = evaluateFtirCases();
  const ftirMetrics = computeTechniqueMetrics(ftirResults, { technique: 'FTIR' });

  // 4. Run XPS Technique Evaluation
  const xpsResults = evaluateXpsCases();
  const xpsMetrics = computeTechniqueMetrics(xpsResults, { technique: 'XPS' });

  // 5. Run Evidence Fusion Engine Evaluation
  const fusionResults: FusionCaseResult[] = [];
  for (const tc of FUSION_GROUND_TRUTH_CASES) {
    const findings = evaluateFusionEngine(tc.input);
    fusionResults.push({
      testCase: tc,
      actualFindings: findings,
    });
  }

  const fusionMetrics = computeFusionMetrics(fusionResults);

  // 6. Assemble report data
  const formattedFusionResults = fusionResults.map((r) => {
    const top = r.actualFindings[0];
    return {
      caseId: r.testCase.id,
      category: r.testCase.category,
      description: r.testCase.description,
      findingsCount: r.actualFindings.length,
      topFormula: top?.canonicalFormula,
      topFormulaTier: top?.formulaTier,
      topPolymorphTier: top?.polymorphTier,
      isSurfaceBulkDiscrepancy: top?.isSurfaceBulkDiscrepancy,
      caveats: top?.inheritedCaveats || [],
    };
  });

  const runData: ValidationRunData = {
    timestamp: new Date().toISOString(),
    disclaimer: MANDATORY_DISCLAIMER,
    xrd: {
      metrics: xrdMetrics,
      results: xrdResults,
    },
    raman: {
      metrics: ramanMetrics,
      results: ramanResults,
    },
    ftir: {
      metrics: ftirMetrics,
      results: ftirResults,
    },
    xps: {
      metrics: xpsMetrics,
      results: xpsResults,
    },
    fusion: {
      metrics: fusionMetrics,
      results: formattedFusionResults,
    },
  };

  printValidationReport(runData);
  saveValidationDump(runData);
  const passed = enforceValidationGates(runData);
  if (!passed) {
    process.exitCode = 1;
  }

  return runData;
}

// Execute if run directly via tsx / node
if (import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, '/').split('/').pop() || '')) {
  runValidationHarness().catch((err) => {
    console.error('Fatal error running validation harness:', err);
    process.exit(1);
  });
}
