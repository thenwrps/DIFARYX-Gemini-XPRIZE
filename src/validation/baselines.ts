import type { ValidationRunData } from './report.js';

/**
 * Central locked baseline configuration for DIFARYX Validation Harness V1-b.
 *
 * Contains exact baseline numbers locked after Step 1 diagnosis and input correction.
 * Enforces hard safety gates, regression guards against historical floors, and case-floor criteria.
 */

// ============================================================================
// V2 TECH-DEBT — XPS scorer kernel / tolerance consistency (tracked, NOT fixed in V1-b)
// ============================================================================
// Finding (2026-07-01 honest re-audit): the XPS match kernel in
// xpsAgent/runner.ts#calculateMatchScore uses sigma = tolerance/2, so the
// effective single-peak detection window (score >= 0.25 threshold) is
//   ±sigma*sqrt(-2*ln(0.25)) = ±0.25 eV for a 0.3 eV uncertainty ref (Zn),
//   which is NARROWER than the declared 0.3 eV tolerance.
// Consequence: a within_tolerance_shift that lands deltaBE at the tolerance
// edge (e.g. xps-a5-zn2p, +0.2 eV -> deltaBE 0.3 -> score 0.135) fails
// detection even though it is nominally "within tolerance." This is documented
// on the case (xps.cases.ts xps-a5-zn2p) and counted as known_limitation.
// Reference-exact Zn (probe A) scores 0.411 -> PASS, proving the failure is a
// kernel/tolerance inconsistency, NOT a material limitation.
//
// FIX (requires authorization — engine change, diagnose-only in V1-b):
//   reconcile sigma vs declared tolerance (e.g. sigma = tolerance so the kernel
//   spans the full declared window, or raise/lower the 0.25 threshold).
// MANDATORY re-validation before adoption — must NOT regress:
//   * xps-c2-out-tolerance (Cu²⁺ +0.8 eV) must STILL be rejected,
//   * xps-b1..b4 negatives must stay FP = 0,
//   * xps-a13-beyond-cu2p / xps-a14-beyond-fe3p must STILL miss,
//   * XPS State F1 must not drop below the then-locked value.
// ============================================================================

export interface ValidationBaselines {
  safety: {
    multiTech: {
      formulaAccuracy: number;
      contradictionRecall: number;
      falseContradictionRate: number;
      polymorphCapAdherence: number;
      independenceGuardCorrectness: number;
    };
    perTechnique: {
      genuinelyWrongCount: number;
    };
  };
  regressionGuards: {
    XRD: {
      exactPhaseF1: number;
      familyAwareF1: number;
    };
    Raman: {
      exactPhaseF1: number;
      familyAwareF1: number;
    };
    FTIR: {
      bandFamilyF1: number;
    };
    XPS: {
      exactPhaseF1: number;
    };
  };
  caseFloors: {
    categoryAPositiveRecall: {
      XRD: number;
      Raman: number;
      FTIR: number;
      XPS: number;
    };
    categoryBFalsePositiveRate: number;
  };
}

export const LOCKED_VALIDATION_BASELINES: ValidationBaselines = {
  safety: {
    multiTech: {
      formulaAccuracy: 1.0, // >= 100%
      contradictionRecall: 1.0, // >= 100%
      falseContradictionRate: 0.0, // == 0%
      polymorphCapAdherence: 1.0, // >= 100%
      independenceGuardCorrectness: 1.0, // >= 100%
    },
    perTechnique: {
      genuinelyWrongCount: 0, // == 0 for ALL 4 techniques
    },
  },
  regressionGuards: {
    XRD: {
      exactPhaseF1: 0.667, // >= 66.7%
      familyAwareF1: 0.815, // >= 81.5%
    },
    Raman: {
      exactPhaseF1: 0.667, // >= 66.7% (locked from corrected run)
      familyAwareF1: 0.667, // >= 66.7% (locked from corrected run)
    },
    FTIR: {
      bandFamilyF1: 0.897, // >= 89.7% (locked from corrected run)
    },
    XPS: {
      // Locked 2026-06-30 (V1-b post-honesty pass): Top-1 81.0%, Exact F1 85.7%.
      // Co/Ni/Zn ground-truth settled: Co labeled Co(II/III) (mixed-valence by design),
      // Ni 855.6 eV reference-aligned (Verdict A), Zn 1021.8 eV / Fe²⁺ 709.5 eV tagged
      // as known_limitation (Verdict B, data-flag via XpsTestCase.knownLimitation).
      exactPhaseF1: 0.857, // >= 85.7%
    },
  },
  caseFloors: {
    categoryAPositiveRecall: {
      XRD: 0.667, // 10/15
      Raman: 0.579, // 11/19
      FTIR: 0.867, // 13/15
      XPS: 0.733, // 11/15
    },
    categoryBFalsePositiveRate: 0.0, // == 0% for ALL techniques
  },
};

/**
 * Enforces all locked validation gates against the evaluation run results.
 * Prints the GATE ENFORCEMENT SUMMARY section and returns true if all gates pass.
 */
export function enforceValidationGates(runData: ValidationRunData): boolean {
  let violations = 0;

  console.log('\n================================================================================');
  console.log(' GATE ENFORCEMENT SUMMARY (V1-b Category-Aware Gate)');
  console.log('================================================================================');

  const checkGate = (label: string, pass: boolean, expectedStr: string, actualStr: string) => {
    const status = pass ? '[PASS]' : '[FAIL]';
    console.log(`  ${status} ${label.padEnd(50)} | Exp: ${expectedStr.padEnd(14)} | Act: ${actualStr}`);
    if (!pass) violations++;
  };

  // 1. SAFETY CRITERIA
  console.log('\n[SAFETY CRITERIA]');
  const fusion = runData.fusion.metrics;
  checkGate(
    'Multi-Tech Formula Accuracy',
    fusion.formulaAccuracy >= LOCKED_VALIDATION_BASELINES.safety.multiTech.formulaAccuracy - 1e-4,
    '>= 100.0%',
    `${(fusion.formulaAccuracy * 100).toFixed(1)}%`
  );
  checkGate(
    'Multi-Tech Contradiction Recall',
    fusion.contradiction.recall >= LOCKED_VALIDATION_BASELINES.safety.multiTech.contradictionRecall - 1e-4,
    '>= 100.0%',
    `${(fusion.contradiction.recall * 100).toFixed(1)}%`
  );
  checkGate(
    'Multi-Tech False Contradiction Rate',
    fusion.contradiction.falseContradictionRate === LOCKED_VALIDATION_BASELINES.safety.multiTech.falseContradictionRate,
    '== 0.0%',
    `${(fusion.contradiction.falseContradictionRate * 100).toFixed(1)}%`
  );
  checkGate(
    'Multi-Tech Polymorph Cap Adherence',
    fusion.polymorphCapAdherence >= LOCKED_VALIDATION_BASELINES.safety.multiTech.polymorphCapAdherence - 1e-4,
    '>= 100.0%',
    `${(fusion.polymorphCapAdherence * 100).toFixed(1)}%`
  );
  checkGate(
    'Multi-Tech Independence Guard Correctness',
    fusion.independenceGuardCorrectness >= LOCKED_VALIDATION_BASELINES.safety.multiTech.independenceGuardCorrectness - 1e-4,
    '>= 100.0%',
    `${(fusion.independenceGuardCorrectness * 100).toFixed(1)}%`
  );

  const techniques: Array<{ name: string; key: 'xrd' | 'raman' | 'ftir' | 'xps' }> = [
    { name: 'XRD', key: 'xrd' },
    { name: 'Raman', key: 'raman' },
    { name: 'FTIR', key: 'ftir' },
    { name: 'XPS', key: 'xps' },
  ];

  for (const { name, key } of techniques) {
    const techData = runData[key];
    const gw = techData?.metrics.missDecomposition.genuinely_wrong ?? 0;
    checkGate(
      `${name} Genuinely Wrong Phase Count`,
      gw === LOCKED_VALIDATION_BASELINES.safety.perTechnique.genuinelyWrongCount,
      '== 0',
      `${gw}`
    );
  }

  // 2. REGRESSION GUARDS
  console.log('\n[REGRESSION GUARDS]');
  const xrdM = runData.xrd.metrics;
  checkGate(
    'XRD Exact-Phase F1 Score',
    xrdM.f1Score >= LOCKED_VALIDATION_BASELINES.regressionGuards.XRD.exactPhaseF1 - 5e-4,
    `>= ${(LOCKED_VALIDATION_BASELINES.regressionGuards.XRD.exactPhaseF1 * 100).toFixed(1)}%`,
    `${(xrdM.f1Score * 100).toFixed(1)}%`
  );
  checkGate(
    'XRD Family-Aware F1 Score',
    xrdM.familyAware.f1Score >= LOCKED_VALIDATION_BASELINES.regressionGuards.XRD.familyAwareF1 - 5e-4,
    `>= ${(LOCKED_VALIDATION_BASELINES.regressionGuards.XRD.familyAwareF1 * 100).toFixed(1)}%`,
    `${(xrdM.familyAware.f1Score * 100).toFixed(1)}%`
  );

  if (runData.raman) {
    const ramanM = runData.raman.metrics;
    checkGate(
      'Raman Exact-Phase F1 Score',
      ramanM.f1Score >= LOCKED_VALIDATION_BASELINES.regressionGuards.Raman.exactPhaseF1 - 5e-4,
      `>= ${(LOCKED_VALIDATION_BASELINES.regressionGuards.Raman.exactPhaseF1 * 100).toFixed(1)}%`,
      `${(ramanM.f1Score * 100).toFixed(1)}%`
    );
    checkGate(
      'Raman Family-Aware F1 Score',
      ramanM.familyAware.f1Score >= LOCKED_VALIDATION_BASELINES.regressionGuards.Raman.familyAwareF1 - 5e-4,
      `>= ${(LOCKED_VALIDATION_BASELINES.regressionGuards.Raman.familyAwareF1 * 100).toFixed(1)}%`,
      `${(ramanM.familyAware.f1Score * 100).toFixed(1)}%`
    );
  }

  if (runData.ftir) {
    const ftirM = runData.ftir.metrics;
    checkGate(
      'FTIR Band-Family F1 Score',
      ftirM.familyAware.f1Score >= LOCKED_VALIDATION_BASELINES.regressionGuards.FTIR.bandFamilyF1 - 5e-4,
      `>= ${(LOCKED_VALIDATION_BASELINES.regressionGuards.FTIR.bandFamilyF1 * 100).toFixed(1)}%`,
      `${(ftirM.familyAware.f1Score * 100).toFixed(1)}%`
    );
    console.log('  [NOTE] FTIR Exact-Phase F1 not gated: exact phase recall is 0% by design due to broad M-O vibration overlap.');
  }

  if (runData.xps) {
    const xpsM = runData.xps.metrics;
    checkGate(
      'XPS Chemical State F1 Score',
      xpsM.f1Score >= LOCKED_VALIDATION_BASELINES.regressionGuards.XPS.exactPhaseF1 - 5e-4,
      `>= ${(LOCKED_VALIDATION_BASELINES.regressionGuards.XPS.exactPhaseF1 * 100).toFixed(1)}%`,
      `${(xpsM.f1Score * 100).toFixed(1)}%`
    );
  }

  // 3. CASE FLOORS
  console.log('\n[CASE FLOORS]');
  for (const { name, key } of techniques) {
    const results = runData[key]?.results ?? [];
    const catA = results.filter((r) => r.caseId.match(/^[a-z]+-a\d+/));
    const aPass = catA.filter((r) => r.actualDidMatch).length;
    const aRecall = catA.length > 0 ? aPass / catA.length : 0;
    const floorA = LOCKED_VALIDATION_BASELINES.caseFloors.categoryAPositiveRecall[name as keyof typeof LOCKED_VALIDATION_BASELINES.caseFloors.categoryAPositiveRecall];

    checkGate(
      `${name} Category A Positive Recall`,
      aRecall >= floorA - 5e-4,
      `>= ${(floorA * 100).toFixed(1)}%`,
      `${(aRecall * 100).toFixed(1)}% (${aPass}/${catA.length})`
    );

    const catB = results.filter((r) => r.caseId.match(/^[a-z]+-b\d+/));
    const bFP = catB.filter((r) => r.actualDidMatch).length;
    const bFPRate = catB.length > 0 ? bFP / catB.length : 0;

    checkGate(
      `${name} Category B False-Positive Rate`,
      bFPRate === LOCKED_VALIDATION_BASELINES.caseFloors.categoryBFalsePositiveRate,
      '== 0.0%',
      `${(bFPRate * 100).toFixed(1)}% (${bFP}/${catB.length})`
    );
  }

  console.log('================================================================================\n');

  if (violations > 0) {
    console.error(`\x1b[31m\x1b[1mFINAL VERDICT: FAIL (${violations} gate violation${violations > 1 ? 's' : ''} detected)\x1b[0m\n`);
    return false;
  } else {
    console.log(`\x1b[32m\x1b[1mFINAL VERDICT: PASS (All safety, regression, and case-floor gates satisfied)\x1b[0m\n`);
    return true;
  }
}
