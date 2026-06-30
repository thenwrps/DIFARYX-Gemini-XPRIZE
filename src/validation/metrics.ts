import type { FusedFinding } from '../agents/fusionAgent/types.js';
import type { FusionTestCase } from './groundTruth/fusion.cases.js';
import type { PerturbationType } from './groundTruth/xrd.cases.js';

export interface TechniqueCaseResult {
  caseId: string;
  expectedShouldMatch: boolean;
  actualDidMatch: boolean;
  expectedPhase?: string;
  actualPhase?: string;
  actualScore?: number;
  perturbations?: PerturbationType[];
  knownLimitation?: { reason: string };
}

export interface TechniqueMetrics {
  totalCases: number;
  top1Accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  truePositives: number;
  falsePositives: number;
  trueNegatives: number;
  falseNegatives: number;
  confusionPairs: Array<{ expected: string; actual: string; count: number }>;
  familyAware: {
    f1Score: number;
    precision: number;
    recall: number;
    tp: number;
    fp: number;
    tn: number;
    fn: number;
  };
  missDecomposition: {
    below_threshold: number;
    matched_isostructural_spinel: number;
    known_limitation: number;
    beyond_tolerance_expected: number;
    genuinely_wrong: number;
  };
  perturbationBreakdown: Record<string, { total: number; correct: number; accuracy: number; recall: number }>;
}

export interface FusionCaseResult {
  testCase: FusionTestCase;
  actualFindings: FusedFinding[];
}

export interface FusionMetrics {
  totalCases: number;
  formulaAccuracy: number;
  tierConfusionMatrix: Record<string, Record<string, number>>;
  contradiction: {
    tp: number;
    fp: number;
    fn: number;
    tn: number;
    recall: number;
    falseContradictionRate: number;
  };
  surfaceDetection: {
    tp: number;
    fp: number;
    fn: number;
    tn: number;
    rate: number;
  };
  polymorphCapAdherence: number;
  independenceGuardCorrectness: number;
}

const XRD_SPINEL_FAMILY = new Set(['fe3o4', 'maghemite_gamma_fe2o3', 'cofe2o4', 'nife2o4', 'cufe2o4']);
const RAMAN_SPINEL_FAMILY = new Set(['cufe2o4', 'cofe2o4', 'nife2o4', 'copper ferrite', 'cobalt ferrite', 'nickel ferrite']);

export interface TechniqueMetricsOptions {
  technique?: 'XRD' | 'Raman' | 'FTIR' | 'XPS';
}

export function computeTechniqueMetrics(results: TechniqueCaseResult[], options?: TechniqueMetricsOptions): TechniqueMetrics {
  const tech = options?.technique || 'XRD';
  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;
  let top1Correct = 0;
  const confusionMap = new Map<string, number>();

  let famTp = 0;
  let famFp = 0;
  let famTn = 0;
  let famFn = 0;

  let below_threshold = 0;
  let matched_isostructural_spinel = 0;
  let known_limitation = 0;
  let beyond_tolerance_expected = 0;
  let genuinely_wrong = 0;

  for (const res of results) {
    const actLower = res.actualPhase?.toLowerCase() || '';
    const expLower = res.expectedPhase?.toLowerCase() || '';
    const isPhaseMatch = !res.expectedPhase || (
      Boolean(res.actualPhase) && (
        actLower === expLower || actLower.includes(expLower)
      )
    );

    let isSpinelTarget = false;
    let isSpinelActual = false;
    if (tech === 'XRD') {
      isSpinelTarget = XRD_SPINEL_FAMILY.has(expLower);
      isSpinelActual = XRD_SPINEL_FAMILY.has(actLower);
    } else if (tech === 'Raman') {
      isSpinelTarget = RAMAN_SPINEL_FAMILY.has(expLower);
      isSpinelActual = RAMAN_SPINEL_FAMILY.has(actLower);
    }

    // Family-aware match check
    let isFamilyMatch = isPhaseMatch;
    if (res.actualDidMatch) {
      if (tech === 'FTIR' && Boolean(res.actualPhase)) {
        isFamilyMatch = true;
      } else if (isSpinelTarget && isSpinelActual) {
        isFamilyMatch = true;
      }
    } else {
      isFamilyMatch = false;
    }

    const isOnlyBeyondTol = res.perturbations?.length === 1 && res.perturbations[0] === 'beyond_tolerance_shift';
    const isSpinelGeneralExp = XRD_SPINEL_FAMILY.has(expLower) || RAMAN_SPINEL_FAMILY.has(expLower);
    const isSpinelGeneralAct = XRD_SPINEL_FAMILY.has(actLower) || RAMAN_SPINEL_FAMILY.has(actLower);
    const isBeyondTolExpected = res.actualDidMatch && isOnlyBeyondTol && isSpinelGeneralExp && isSpinelGeneralAct;

    if (res.expectedShouldMatch) {
      if (res.actualDidMatch && isPhaseMatch) {
        // 1. exact_pass
        tp++;
        top1Correct++;
        famTp++;
      } else if (res.actualDidMatch && isFamilyMatch) {
        // 2. family_pass
        fn++;
        famTp++;
        matched_isostructural_spinel++;
        const key = `${res.expectedPhase || 'UNKNOWN'} -> ${res.actualPhase || 'NONE'}`;
        confusionMap.set(key, (confusionMap.get(key) || 0) + 1);
      } else if (res.knownLimitation) {
        // 3. known_limitation (data-flag driven; see knownLimitation.reason on the case)
        fn++;
        famFn++;
        known_limitation++;
        if (res.actualDidMatch) {
          const key = `${res.expectedPhase || 'UNKNOWN'} -> ${res.actualPhase || 'NONE'}`;
          confusionMap.set(key, (confusionMap.get(key) || 0) + 1);
        }
      } else if (!res.actualDidMatch) {
        // 4. below_threshold
        fn++;
        famFn++;
        below_threshold++;
      } else if (isBeyondTolExpected) {
        // 5. beyond_tolerance_expected
        fn++;
        famFn++;
        beyond_tolerance_expected++;
        const key = `${res.expectedPhase || 'UNKNOWN'} -> ${res.actualPhase || 'NONE'}`;
        confusionMap.set(key, (confusionMap.get(key) || 0) + 1);
      } else {
        // 6. genuinely_wrong
        fn++;
        famFn++;
        genuinely_wrong++;
        const key = `${res.expectedPhase || 'UNKNOWN'} -> ${res.actualPhase || 'NONE'}`;
        confusionMap.set(key, (confusionMap.get(key) || 0) + 1);
      }
    } else {
      if (!res.actualDidMatch) {
        tn++;
        top1Correct++;
        famTn++;
      } else {
        fp++;
        famFp++;
        const key = `NONE -> ${res.actualPhase || 'UNKNOWN'}`;
        confusionMap.set(key, (confusionMap.get(key) || 0) + 1);
      }
    }
  }

  const totalCases = results.length;
  const top1Accuracy = totalCases > 0 ? top1Correct / totalCases : 0;
  const precision = (tp + fp) > 0 ? tp / (tp + fp) : 0;
  const recall = (tp + fn) > 0 ? tp / (tp + fn) : 0;
  const f1Score = (precision + recall) > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  const famPrecision = (famTp + famFp) > 0 ? famTp / (famTp + famFp) : 0;
  const famRecall = (famTp + famFn) > 0 ? famTp / (famTp + famFn) : 0;
  const famF1Score = (famPrecision + famRecall) > 0 ? (2 * famPrecision * famRecall) / (famPrecision + famRecall) : 0;

  const confusionPairs: Array<{ expected: string; actual: string; count: number }> = [];
  for (const [key, count] of confusionMap.entries()) {
    const [expected, actual] = key.split(' -> ');
    confusionPairs.push({ expected, actual, count });
  }

  const perturbationTags = ['within_tolerance_shift', 'beyond_tolerance_shift', 'noise', 'missing_peak', 'extra_peak', 'combined'];
  const perturbationBreakdown: Record<string, { total: number; correct: number; accuracy: number; recall: number }> = {};

  for (const tag of perturbationTags) {
    const taggedCases = results.filter(r => r.perturbations?.includes(tag as PerturbationType));
    const total = taggedCases.length;
    const correct = taggedCases.filter(r => {
      const actL = r.actualPhase?.toLowerCase() || '';
      const expL = r.expectedPhase?.toLowerCase() || '';
      const isMatch = !r.expectedPhase || (Boolean(r.actualPhase) && (actL === expL || actL.includes(expL)));
      return r.expectedShouldMatch ? (r.actualDidMatch && isMatch) : !r.actualDidMatch;
    }).length;
    const posCases = taggedCases.filter(r => r.expectedShouldMatch);
    const posCorrect = posCases.filter(r => {
      const actL = r.actualPhase?.toLowerCase() || '';
      const expL = r.expectedPhase?.toLowerCase() || '';
      const isMatch = !r.expectedPhase || (Boolean(r.actualPhase) && (actL === expL || actL.includes(expL)));
      return r.actualDidMatch && isMatch;
    }).length;

    const accuracy = total > 0 ? correct / total : 0;
    const recall = posCases.length > 0 ? posCorrect / posCases.length : 0;

    perturbationBreakdown[tag] = { total, correct, accuracy, recall };
  }

  return {
    totalCases,
    top1Accuracy,
    precision,
    recall,
    f1Score,
    truePositives: tp,
    falsePositives: fp,
    trueNegatives: tn,
    falseNegatives: fn,
    confusionPairs,
    familyAware: {
      f1Score: famF1Score,
      precision: famPrecision,
      recall: famRecall,
      tp: famTp,
      fp: famFp,
      tn: famTn,
      fn: famFn,
    },
    missDecomposition: {
      below_threshold,
      matched_isostructural_spinel,
      known_limitation,
      beyond_tolerance_expected,
      genuinely_wrong,
    },
    perturbationBreakdown,
  };
}

export function computeFusionMetrics(results: FusionCaseResult[]): FusionMetrics {
  let formulaTotal = 0;
  let formulaCorrect = 0;

  const tierConfusionMatrix: Record<string, Record<string, number>> = {};
  const tiers = ['CORROBORATED', 'SUPPORTED', 'SINGLE-SOURCE', 'CONTESTED', 'UNVERIFIED', 'NONE'];
  for (const t1 of tiers) {
    tierConfusionMatrix[t1] = {};
    for (const t2 of tiers) {
      tierConfusionMatrix[t1][t2] = 0;
    }
  }

  let contraTp = 0;
  let contraFp = 0;
  let contraFn = 0;
  let contraTn = 0;

  let surfTp = 0;
  let surfFp = 0;
  let surfFn = 0;
  let surfTn = 0;

  let polymorphTotal = 0;
  let polymorphCorrect = 0;

  let guardTotal = 0;
  let guardCorrect = 0;

  for (const res of results) {
    const { testCase, actualFindings } = res;
    const topFinding = actualFindings[0];

    // Formula accuracy
    if (testCase.expected.canonicalFormula) {
      formulaTotal++;
      const matched = actualFindings.some(
        f => f.canonicalFormula.replace(/\s+/g, '').toUpperCase() === testCase.expected.canonicalFormula?.replace(/\s+/g, '').toUpperCase()
      );
      if (matched) formulaCorrect++;
    }

    // Tier confusion matrix
    if (testCase.expected.formulaTier) {
      const expTier = testCase.expected.formulaTier;
      const actTier = topFinding ? topFinding.formulaTier : 'NONE';
      if (tierConfusionMatrix[expTier] && tierConfusionMatrix[expTier][actTier] !== undefined) {
        tierConfusionMatrix[expTier][actTier]++;
      }
    }

    // Contradiction detection
    const expContra = Boolean(testCase.expected.hasContradiction || testCase.category === 'E');
    const actContra = actualFindings.some(f => f.formulaTier === 'CONTESTED');
    if (expContra && actContra) contraTp++;
    else if (expContra && !actContra) contraFn++;
    else if (!expContra && actContra) contraFp++;
    else contraTn++;

    // Surface detection rate
    const expSurf = Boolean(testCase.expected.isSurfaceBulkDiscrepancy);
    const actSurf = actualFindings.some(f => f.isSurfaceBulkDiscrepancy);
    if (expSurf && actSurf) surfTp++;
    else if (expSurf && !actSurf) surfFn++;
    else if (!expSurf && actSurf) surfFp++;
    else surfTn++;

    // Polymorph cap adherence
    if (testCase.category === 'H' || testCase.expected.polymorphNotCorroborated) {
      polymorphTotal++;
      if (actualFindings.every(f => f.polymorphTier !== 'CORROBORATED')) {
        polymorphCorrect++;
      }
    }

    // Independence guard correctness
    if (testCase.category === 'G' || testCase.expected.hasSameOriginCaveat) {
      guardTotal++;
      const notCorroborated = actualFindings.every(f => f.formulaTier !== 'CORROBORATED');
      const hasCaveat = Boolean(topFinding && topFinding.inheritedCaveats.some(c => c.toLowerCase().includes('same-origin')));
      if (notCorroborated && hasCaveat) {
        guardCorrect++;
      }
    }
  }

  const contraRecall = (contraTp + contraFn) > 0 ? contraTp / (contraTp + contraFn) : 0;
  const falseContradictionRate = (contraFp + contraTn) > 0 ? contraFp / (contraFp + contraTn) : 0;
  const surfRate = (surfTp + surfFn) > 0 ? surfTp / (surfTp + surfFn) : 0;

  return {
    totalCases: results.length,
    formulaAccuracy: formulaTotal > 0 ? formulaCorrect / formulaTotal : 0,
    tierConfusionMatrix,
    contradiction: {
      tp: contraTp,
      fp: contraFp,
      fn: contraFn,
      tn: contraTn,
      recall: contraRecall,
      falseContradictionRate,
    },
    surfaceDetection: {
      tp: surfTp,
      fp: surfFp,
      fn: surfFn,
      tn: surfTn,
      rate: surfRate,
    },
    polymorphCapAdherence: polymorphTotal > 0 ? polymorphCorrect / polymorphTotal : 0,
    independenceGuardCorrectness: guardTotal > 0 ? guardCorrect / guardTotal : 0,
  };
}
