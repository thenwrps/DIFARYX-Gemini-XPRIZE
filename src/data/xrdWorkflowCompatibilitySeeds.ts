/**
 * XRD Workflow Compatibility Seeds
 *
 * Deterministic seeded records for verifying selector helper compatibility
 * across legacy summary, workflow field, and unified handoff record types.
 *
 * Phase X5B: Verification-focused seeded records for AgentDemo, NotebookLab, ReportBuilder.
 */

import type { XRDBackendEvidenceRecord } from './xrdBackendEvidence';
import type { NotebookEntry } from './workflowPipeline';

// ── Seed A: Legacy-Only Record ─────────────────────────────────────────

/**
 * Legacy-only XRD backend evidence record.
 * Contains only scientificEvidenceSummary and referenceMatchV2Summary (Tier 3 fields).
 * Simulates old evidence records before Phase X2/X3/X4.
 */
export const SEED_XRD_LEGACY_ONLY_RECORD: XRDBackendEvidenceRecord = {
  timestamp: '2024-01-15T10:30:00.000Z',
  projectId: 'compat-seed-legacy',
  uploadedRunId: 'legacy-only-run',
  fileName: 'legacy_xrd_pattern.xy',
  detectedPeakCount: 12,
  fittedPeakCount: 11,
  snRatio: 18.5,
  baselineDeviation: 0.032,
  peakResolution: 'moderate',
  primaryPhase: 'CoFe2O4 (spinel)',
  matchedPeakCount: 9,
  phaseSummary: 'Candidate phase: CoFe2O4 spinel structure; matched 9/12 detected peaks.',
  isPhaseMatched: true,
  yResidualCount: 2048,
  scientificEvidenceSummary: {
    skillLabel: 'XRD Phase Identification v1.2 (legacy)',
    evidenceId: 'xrd-legacy-sci-ev-20240115',
    inputReference: 'abc123def456',
    claimBoundary: 'validation-limited scientific claim',
  },
  referenceMatchV2Summary: {
    status: 'candidate_match',
    claimLevel: 'candidate evidence',
    referenceSetId: 'legacy_spinel_set',
    candidateCount: 3,
    primaryCandidate: {
      phaseId: 'cofe2o4_spinel_legacy',
      phaseLabel: 'CoFe2O4 (spinel)',
      formula: 'CoFe2O4',
      structureFamily: 'spinel',
      databaseRef: 'ICDD-00-022-1086',
      score: 0.82,
      coverageRatio: 0.75,
      meanDeltaTwoTheta: 0.08,
      matchedPeakCount: 9,
      referencePeakCount: 12,
    },
    matchedPeaksPreview: [
      { measuredTwoTheta: 30.12, referenceTwoTheta: 30.09, delta: 0.03, intensity: 100 },
      { measuredTwoTheta: 35.48, referenceTwoTheta: 35.50, delta: -0.02, intensity: 95 },
      { measuredTwoTheta: 43.15, referenceTwoTheta: 43.18, delta: -0.03, intensity: 78 },
    ],
    limitations: [
      'Candidate match is based on peak-position agreement.',
      'This is not chemical identity confirmation.',
      'This is not phase purity confirmation.',
      'Composition-sensitive evidence is required for stronger assignment.',
    ],
    phaseConfirmed: false,
    phasePurityConfirmed: false,
  },
};

/**
 * Legacy-only notebook entry for NotebookLab/ReportBuilder verification.
 */
export const SEED_NOTEBOOK_LEGACY_ONLY: NotebookEntry = {
  id: 'notebook-legacy-only',
  projectId: 'compat-seed-legacy',
  technique: 'xrd',
  timestamp: '2024-01-15T10:35:00.000Z',
  decision: 'Phase candidate identified: CoFe2O4 spinel structure. Validation-limited claim.',
  interpretation: 'XRD pattern suggests CoFe2O4 spinel phase based on peak positions.',
  validationGaps: [
    'Chemical identity requires composition-sensitive evidence (XPS, EDS).',
    'Phase purity not confirmed by XRD matching alone.',
  ],
  xrdBackendEvidenceSummary: {
    detectedPeakCount: 12,
    fittedPeakCount: 11,
    snRatio: 18.5,
    baselineDeviation: 0.032,
    peakResolution: 'moderate',
    primaryPhase: 'CoFe2O4 (spinel)',
    matchedPeakCount: 9,
    phaseSummary: 'Candidate phase: CoFe2O4 spinel structure; matched 9/12 detected peaks.',
    savedAt: '2024-01-15T10:30:00.000Z',
    caveat: 'Phase purity requires reference validation and/or complementary evidence.',
    scientificEvidenceSummary: SEED_XRD_LEGACY_ONLY_RECORD.scientificEvidenceSummary,
  },
  xrdReferenceMatchV2Summary: {
    label: 'Reference candidate evidence',
    ...SEED_XRD_LEGACY_ONLY_RECORD.referenceMatchV2Summary!,
  },
  discussion: {
    methodology: {
      title: 'XRD Phase Identification (Legacy)',
      pipeline: ['Peak detection', 'Reference matching', 'Phase assignment'],
      peakDetection: 'Pseudo-Voigt fitting with baseline correction',
      phaseIdentification: 'Reference database matching (legacy algorithm)',
    },
    evidenceSummary: {
      createdAt: '2024-01-15T10:30:00.000Z',
      claimBoundary: 'validation-limited scientific claim',
    },
  },
};

// ── Seed B: Workflow-Field-Only Record ──────────────────────────────────

/**
 * Workflow-field-only XRD backend evidence record.
 * Contains workflowScientificEvidence and workflowReferenceMatchEvidence (Tier 2 fields).
 * Simulates Phase X2/X3 records before Phase X4 unified handoff.
 */
export const SEED_XRD_WORKFLOW_ONLY_RECORD: XRDBackendEvidenceRecord = {
  timestamp: '2024-03-20T14:15:00.000Z',
  projectId: 'compat-seed-workflow',
  uploadedRunId: 'workflow-only-run',
  fileName: 'workflow_xrd_pattern.xy',
  detectedPeakCount: 15,
  fittedPeakCount: 14,
  snRatio: 22.3,
  baselineDeviation: 0.025,
  peakResolution: 'high',
  primaryPhase: 'Fe3O4 (magnetite)',
  matchedPeakCount: 12,
  phaseSummary: 'Candidate phase: Fe3O4 magnetite structure; matched 12/15 detected peaks.',
  isPhaseMatched: true,
  yResidualCount: 2048,
  workflowScientificEvidence: {
    evidenceId: 'xrd-workflow-sci-ev-20240320',
    schemaVersion: '2.1.0',
    skillId: 'xrd_phase_identification',
    skillLabel: 'XRD Phase Identification v2.1',
    inputReference: 'def789ghi012',
    technique: 'xrd',
    claimBoundaries: [
      'Peak-position-based phase indication',
      'Not chemical identity confirmation',
      'Not phase purity confirmation',
    ],
    keyEvidence: [
      'Detected 15 peaks with high S/N ratio',
      'Matched 12 peaks to Fe3O4 magnetite reference',
      'Peak positions consistent with inverse spinel structure',
    ],
    limitations: [
      'Requires composition-sensitive evidence for stronger assignment',
      'Phase purity not confirmed by XRD alone',
    ],
    createdAt: '2024-03-20T14:15:00.000Z',
  },
  workflowReferenceMatchEvidence: {
    source: 'curated_reference',
    status: 'candidate_match',
    claimLevel: 'candidate evidence',
    backendAvailable: true,
    referenceSetId: 'magnetite_oxide_set',
    candidateCount: 2,
    primaryCandidate: {
      phaseId: 'fe3o4_magnetite_workflow',
      phaseLabel: 'Fe3O4 (magnetite)',
      formula: 'Fe3O4',
      structureFamily: 'inverse spinel',
      databaseRef: 'ICDD-00-019-0629',
      matchedPeakCount: 12,
      referencePeakCount: 14,
      coverageRatio: 0.857,
      meanDeltaTwoTheta: 0.06,
      score: 0.89,
    },
    matchedPeaksPreview: [
      { measuredTwoTheta: 30.15, referenceTwoTheta: 30.13, deltaTwoTheta: 0.02, hkl: '220', referenceRelativeIntensity: 30 },
      { measuredTwoTheta: 35.52, referenceTwoTheta: 35.54, deltaTwoTheta: -0.02, hkl: '311', referenceRelativeIntensity: 100 },
      { measuredTwoTheta: 43.18, referenceTwoTheta: 43.16, deltaTwoTheta: 0.02, hkl: '400', referenceRelativeIntensity: 20 },
    ],
    phaseConfirmed: false,
    phasePurityConfirmed: false,
    limitations: [
      'Candidate match is based on peak-position agreement.',
      'This is not chemical identity confirmation.',
      'This is not phase purity confirmation.',
      'Composition-sensitive evidence is required for stronger assignment.',
    ],
    mappedAt: '2024-03-20T14:15:00.000Z',
  },
};

/**
 * Workflow-field-only notebook entry for NotebookLab/ReportBuilder verification.
 */
export const SEED_NOTEBOOK_WORKFLOW_ONLY: NotebookEntry = {
  id: 'notebook-workflow-only',
  projectId: 'compat-seed-workflow',
  technique: 'xrd',
  timestamp: '2024-03-20T14:20:00.000Z',
  decision: 'Phase candidate identified: Fe3O4 magnetite structure. Validation-limited claim.',
  interpretation: 'XRD pattern suggests Fe3O4 magnetite phase based on peak positions and inverse spinel structure.',
  validationGaps: [
    'Chemical identity requires composition-sensitive evidence (XPS, EDS).',
    'Phase purity not confirmed by XRD matching alone.',
  ],
  xrdBackendEvidenceSummary: {
    detectedPeakCount: 15,
    fittedPeakCount: 14,
    snRatio: 22.3,
    baselineDeviation: 0.025,
    peakResolution: 'high',
    primaryPhase: 'Fe3O4 (magnetite)',
    matchedPeakCount: 12,
    phaseSummary: 'Candidate phase: Fe3O4 magnetite structure; matched 12/15 detected peaks.',
    savedAt: '2024-03-20T14:15:00.000Z',
    caveat: 'Phase purity requires reference validation and/or complementary evidence.',
  },
  workflowScientificEvidence: SEED_XRD_WORKFLOW_ONLY_RECORD.workflowScientificEvidence,
  workflowReferenceMatchEvidence: SEED_XRD_WORKFLOW_ONLY_RECORD.workflowReferenceMatchEvidence,
  discussion: {
    methodology: {
      title: 'XRD Phase Identification (Workflow)',
      pipeline: ['Peak detection', 'Reference matching', 'Phase assignment', 'Evidence structuring'],
      peakDetection: 'Pseudo-Voigt fitting with baseline correction',
      phaseIdentification: 'Reference database matching with structured evidence',
    },
    evidenceSummary: {
      createdAt: '2024-03-20T14:15:00.000Z',
      claimBoundary: 'validation-limited scientific claim',
    },
  },
};

// ── Seed C: Unified Handoff Record ─────────────────────────────────────

/**
 * Unified handoff XRD backend evidence record.
 * Contains xrdWorkflowHandoffState (Tier 1 field) with all evidence consolidated.
 * Simulates Phase X4 records with complete unified handoff.
 */
export const SEED_XRD_UNIFIED_HANDOFF_RECORD: XRDBackendEvidenceRecord = {
  timestamp: '2024-05-25T18:00:00.000Z',
  projectId: 'compat-seed-unified',
  uploadedRunId: 'unified-handoff-run',
  fileName: 'unified_xrd_pattern.xy',
  detectedPeakCount: 18,
  fittedPeakCount: 17,
  snRatio: 25.8,
  baselineDeviation: 0.018,
  peakResolution: 'very high',
  primaryPhase: 'NiFe2O4 (trevorite)',
  matchedPeakCount: 15,
  phaseSummary: 'Candidate phase: NiFe2O4 trevorite structure; matched 15/18 detected peaks.',
  isPhaseMatched: true,
  yResidualCount: 2048,
  xrdWorkflowHandoffState: {
    handoffId: 'xrd-unified-handoff-20240525-abc',
    runId: 'unified-handoff-run',
    projectId: 'compat-seed-unified',
    uploadedRunId: 'unified-handoff-run',
    fileName: 'unified_xrd_pattern.xy',
    timestamp: '2024-05-25T18:00:00.000Z',
    technique: 'xrd',
    createdAt: '2024-05-25T18:00:00.000Z',
    mappedAt: '2024-05-25T18:00:30.000Z',
    sourceEvidenceRecordId: 'xrd-backend-ev-20240525',
    datasetContextEcho: {
      sampleId: 'unified-sample-001',
      sampleName: 'NiFe2O4 Spinel Synthesis',
      materialClass: 'transition metal oxide',
      knownElements: ['Ni', 'Fe', 'O'],
      declaredPhases: ['NiFe2O4 trevorite'],
      radiationSource: 'Cu Kα',
      wavelength: 1.5406,
      twoThetaRange: '10-80°',
    },
    processingProvenance: {
      radiationSource: 'Cu Kα',
      wavelength: 1.5406,
      twoThetaRange: '10-80°',
      baselineMethod: 'polynomial',
      smoothingMethod: 'Savitzky-Golay',
      peakFitModel: 'Pseudo-Voigt',
      referenceMatchEnabled: true,
      referenceSetId: 'nickel_ferrite_set',
    },
    workflowScientificEvidence: {
      evidenceId: 'xrd-unified-sci-ev-20240525',
      schemaVersion: '2.2.0',
      skillId: 'xrd_phase_identification',
      skillLabel: 'XRD Phase Identification v2.2',
      inputReference: 'ghi345jkl678',
      technique: 'xrd',
      claimBoundaries: [
        'Peak-position-based phase indication',
        'Not chemical identity confirmation',
        'Not phase purity confirmation',
      ],
      keyEvidence: [
        'Detected 18 peaks with very high S/N ratio (25.8)',
        'Matched 15 peaks to NiFe2O4 trevorite reference',
        'Peak positions consistent with inverse spinel structure',
        'Very high peak resolution with minimal baseline deviation',
      ],
      limitations: [
        'Requires composition-sensitive evidence for stronger assignment',
        'Phase purity not confirmed by XRD alone',
      ],
      createdAt: '2024-05-25T18:00:00.000Z',
    },
    workflowReferenceMatchEvidence: {
      source: 'curated_reference',
      status: 'candidate_match',
      claimLevel: 'candidate evidence',
      backendAvailable: true,
      referenceSetId: 'nickel_ferrite_set',
      candidateCount: 1,
      primaryCandidate: {
        phaseId: 'nife2o4_trevorite_unified',
        phaseLabel: 'NiFe2O4 (trevorite)',
        formula: 'NiFe2O4',
        structureFamily: 'inverse spinel',
        databaseRef: 'ICDD-00-010-0325',
        matchedPeakCount: 15,
        referencePeakCount: 16,
        coverageRatio: 0.938,
        meanDeltaTwoTheta: 0.04,
        score: 0.94,
      },
      matchedPeaksPreview: [
        { measuredTwoTheta: 30.18, referenceTwoTheta: 30.17, deltaTwoTheta: 0.01, hkl: '220', referenceRelativeIntensity: 35 },
        { measuredTwoTheta: 35.56, referenceTwoTheta: 35.55, deltaTwoTheta: 0.01, hkl: '311', referenceRelativeIntensity: 100 },
        { measuredTwoTheta: 43.21, referenceTwoTheta: 43.20, deltaTwoTheta: 0.01, hkl: '400', referenceRelativeIntensity: 25 },
        { measuredTwoTheta: 57.08, referenceTwoTheta: 57.09, deltaTwoTheta: -0.01, hkl: '511', referenceRelativeIntensity: 45 },
      ],
      phaseConfirmed: false,
      phasePurityConfirmed: false,
      limitations: [
        'Candidate match is based on peak-position agreement.',
        'This is not chemical identity confirmation.',
        'This is not phase purity confirmation.',
        'Composition-sensitive evidence is required for stronger assignment.',
      ],
      mappedAt: '2024-05-25T18:00:00.000Z',
    },
    qualityMetrics: {
      detectedPeakCount: 18,
      fittedPeakCount: 17,
      snRatio: 25.8,
      baselineDeviation: 0.018,
      peakResolution: 'very high',
    },
    phaseMatchSummary: {
      isPhaseMatched: true,
      primaryPhase: 'NiFe2O4 (trevorite)',
      matchedPeakCount: 15,
      phaseSummary: 'Candidate phase: NiFe2O4 trevorite structure; matched 15/18 detected peaks with very high confidence.',
    },
    claimBoundary: 'validation-limited',
    validationGaps: [
      'Chemical identity requires composition-sensitive evidence (XPS, EDS).',
      'Phase purity not confirmed by XRD matching alone.',
      'Requires complementary evidence for stronger assignment.',
    ],
  },
};

/**
 * Unified handoff notebook entry for NotebookLab/ReportBuilder verification.
 */
export const SEED_NOTEBOOK_UNIFIED_HANDOFF: NotebookEntry = {
  id: 'notebook-unified-handoff',
  projectId: 'compat-seed-unified',
  technique: 'xrd',
  timestamp: '2024-05-25T18:05:00.000Z',
  decision: 'Phase candidate identified: NiFe2O4 trevorite structure. Validation-limited claim.',
  interpretation: 'XRD pattern suggests NiFe2O4 trevorite phase based on peak positions, inverse spinel structure, and very high quality metrics.',
  validationGaps: [
    'Chemical identity requires composition-sensitive evidence (XPS, EDS).',
    'Phase purity not confirmed by XRD matching alone.',
    'Requires complementary evidence for stronger assignment.',
  ],
  xrdBackendEvidenceSummary: {
    detectedPeakCount: 18,
    fittedPeakCount: 17,
    snRatio: 25.8,
    baselineDeviation: 0.018,
    peakResolution: 'very high',
    primaryPhase: 'NiFe2O4 (trevorite)',
    matchedPeakCount: 15,
    phaseSummary: 'Candidate phase: NiFe2O4 trevorite structure; matched 15/18 detected peaks with very high confidence.',
    savedAt: '2024-05-25T18:00:00.000Z',
    caveat: 'Phase purity requires reference validation and/or complementary evidence.',
  },
  xrdWorkflowHandoffState: SEED_XRD_UNIFIED_HANDOFF_RECORD.xrdWorkflowHandoffState,
  discussion: {
    methodology: {
      title: 'XRD Phase Identification (Unified Handoff)',
      pipeline: ['Peak detection', 'Reference matching', 'Phase assignment', 'Evidence consolidation', 'Unified handoff'],
      peakDetection: 'Pseudo-Voigt fitting with polynomial baseline',
      phaseIdentification: 'Reference database matching with unified evidence handoff',
    },
    evidenceSummary: {
      createdAt: '2024-05-25T18:00:00.000Z',
      claimBoundary: 'validation-limited scientific claim',
    },
  },
};

// ── Export Collections ──────────────────────────────────────────────────

/**
 * All seeded XRD backend evidence records for compatibility verification.
 */
export const XRD_COMPATIBILITY_SEEDS = {
  legacy: SEED_XRD_LEGACY_ONLY_RECORD,
  workflow: SEED_XRD_WORKFLOW_ONLY_RECORD,
  unified: SEED_XRD_UNIFIED_HANDOFF_RECORD,
} as const;

/**
 * All seeded notebook entries for NotebookLab/ReportBuilder compatibility verification.
 */
export const NOTEBOOK_COMPATIBILITY_SEEDS = {
  legacy: SEED_NOTEBOOK_LEGACY_ONLY,
  workflow: SEED_NOTEBOOK_WORKFLOW_ONLY,
  unified: SEED_NOTEBOOK_UNIFIED_HANDOFF,
} as const;
