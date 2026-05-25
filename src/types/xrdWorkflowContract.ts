/**
 * XRD Unified Workflow Contract (Phase X0)
 *
 * Bridge contract layer for XRD evidence workflow alignment.
 * Maps scattered frontend, backend, persistence, and handoff state
 * into a unified conceptual model.
 *
 * Purpose:
 * - Single source of truth for XRD workflow shape
 * - Alignment layer for frontend UI → backend → storage → Agent/Notebook/Report
 * - Migration target for consolidating duplicated fields
 * - Documentation of current state-of-the-world
 *
 * NOT a runtime replacement yet. Existing types remain active.
 * This is a planning/alignment contract for future migration.
 */

import type { XRDParameters } from './xrdParameters';
import type { XRDDatasetContext } from './xrdDatasetContext';
import type {
  XRDReferenceMatchV2,
  XRDNormalizedResult,
  ScientificEvidenceObject,
  XRDDatasetContextEcho,
  XRDProcessingProvenance,
} from './xrdBackend';
import type { XRDStoredLocalReferenceRecord } from '../data/xrdLocalReferences';

// ============================================================================
// Unified Workflow Run Context
// ============================================================================

/**
 * Complete XRD workflow run context.
 * Unifies project binding, dataset identity, processing parameters, and run metadata.
 */
export interface XRDWorkflowRunContext {
  /** Project this run belongs to */
  projectId: string;
  /** Uploaded run identifier (if dataset is uploaded) */
  uploadedRunId?: string;
  /** Original file name (if dataset is file-based) */
  fileName?: string;
  /** Run timestamp */
  timestamp: string;
  /** Dataset context (sample identity, elements, phases) */
  datasetContext: XRDWorkflowDatasetContext;
  /** Processing parameters (range, baseline, smoothing, peak detection, fitting, reference matching) */
  processingParameters: XRDWorkflowProcessingParameters;
  /** Reference matching context (curated sets and local references) */
  referenceContext: XRDWorkflowReferenceContext;
  /** Boundary gates and claim limitations */
  claimBoundary: XRDWorkflowClaimBoundary;
}

// ============================================================================
// Dataset Context (Sample Identity & Composition)
// ============================================================================

/**
 * Unified XRD dataset context.
 * Maps from: XRDDatasetContext (frontend), XRDBackendDatasetContext (backend payload).
 *
 * Source of truth: Frontend workspace state.
 * Handoff: Passed to backend, persisted in evidence records, forwarded to Agent/Notebook.
 */
export interface XRDWorkflowDatasetContext {
  /** Sample identifier */
  sampleId?: string;
  /** Human-readable sample name */
  sampleName?: string;
  /** Material classification */
  materialClass?: string;
  /** Batch identifier for traceability */
  batchId?: string;
  /** Known elements (confirmed by user or complementary techniques) */
  knownElements: string[];
  /** Expected elements (user hypothesis) */
  expectedElements: string[];
  /** Elements to exclude from screening */
  excludedElements: string[];
  /** User-declared phase identities */
  declaredPhases: string[];
  /** Candidate phase IDs for targeted matching */
  candidatePhaseIds: string[];
  /** Phase IDs to exclude from matching */
  excludedPhaseIds: string[];
  /** Reference source selection */
  referenceSource: 'internal_curated' | 'project_local_reference' | 'uploaded_reference';
  /** Active reference set ID */
  referenceSetId?: string;
  /** Source of sample identity */
  identitySource: 'user_declared' | 'project_registry' | 'filename_hint' | 'unknown';
  /** Confidence in identity */
  identityConfidence: 'declared' | 'inferred' | 'unknown';
}

// ============================================================================
// Processing Parameters (Signal → Peaks → Fitting)
// ============================================================================

/**
 * Unified XRD processing parameters.
 * Maps from: XRDParameters (frontend), XRDBackendGroupedParameters (backend payload).
 *
 * Source of truth: Frontend workspace state.
 * Handoff: Passed to backend, persisted in evidence records for provenance.
 */
export interface XRDWorkflowProcessingParameters {
  /** Analysis range */
  range: {
    twoThetaMin: number;
    twoThetaMax: number;
  };
  /** Radiation source and wavelength */
  radiation: {
    source: string;
    wavelengthAngstrom: number;
  };
  /** Baseline correction */
  baseline: {
    method: string;
    lambda: number;
    p: number;
  };
  /** Smoothing */
  smoothing: {
    method: string;
    windowSize: number;
    polynomialOrder: number;
  };
  /** Peak detection thresholds */
  peakDetection: {
    minProminence: number;
    minDistanceDeg: number;
    minHeightRatio: number;
    maxPeakCount: number;
  };
  /** Peak fitting */
  peakFitting: {
    model: string;
    fitWindowDeg: number;
    maxIterations: number;
    calculateCrystalliteSize: boolean;
  };
  /** Reference matching configuration */
  referenceMatch: {
    enabled: boolean;
    matchMode: string;
    referenceSource: string;
    referenceSetId?: string;
    candidatePhaseIds: string[];
    toleranceTwoTheta: number;
    minMatchedPeaks: number;
    minCoverageRatio: number;
    minScore: number;
    useRelativeIntensity: boolean;
    intensityToleranceRatio: number;
    allowUnknownSearch: boolean;
  };
  /** Boundary gates */
  boundary: {
    enabled: boolean;
    claimMode: string;
    requireComplementaryEvidence: boolean;
    requireReferenceSetForMatch: boolean;
    requireSampleContextForTargetedMatch: boolean;
  };
}

// ============================================================================
// Reference Context (Curated Sets + Local References)
// ============================================================================

/**
 * Unified reference matching context.
 * Combines curated reference set selection and local reference approval state.
 *
 * Source of truth: Frontend workspace + local reference storage.
 * Handoff: Reference set ID to backend, local reference peaks if approved.
 */
export interface XRDWorkflowReferenceContext {
  /** Active curated reference set */
  curatedReferenceSet?: {
    referenceSetId: string;
    label: string;
    databaseSource: string;
  };
  /** Local reference state (if enabled for backend matching) */
  localReference?: XRDWorkflowLocalReferenceContext;
}

/**
 * Unified local reference context.
 * Maps from: XRDStoredLocalReferenceRecord (frontend storage), XRDLocalReferencePayload (backend payload).
 *
 * Source of truth: Frontend localStorage (approval workflow).
 * Handoff: Approved local references sent to backend for request-scoped matching.
 */
export interface XRDWorkflowLocalReferenceContext {
  /** Whether local reference is enabled for this run */
  enabled: boolean;
  /** Source type */
  sourceType: 'uploaded_reference' | 'project_local_reference';
  /** Reference label */
  referenceLabel: string;
  /** Chemical formula */
  formula?: string;
  /** Material family */
  materialFamily?: string;
  /** Element list */
  elements: string[];
  /** Import status */
  importStatus: string;
  /** Validation level */
  validationLevel: string;
  /** Approval status */
  approvalStatus: string;
  /** User approval flag */
  userApprovedForMatching: boolean;
  /** Backend eligibility */
  isEligibleForBackendMatching: boolean;
  /** Reference peak list */
  peaks: Array<{
    twoTheta: number;
    relativeIntensity?: number;
    hkl?: string;
    dSpacing?: number;
  }>;
}

// ============================================================================
// Backend Evidence (Processing Results)
// ============================================================================

/**
 * Unified backend evidence shape.
 * Maps from: XRDNormalizedResult (frontend normalization), XRDBackendEvidenceRecord (storage).
 *
 * Source of truth: Backend processing result.
 * Handoff: Stored in localStorage, consumed by Agent/Notebook/Report.
 */
export interface XRDWorkflowBackendEvidence {
  /** Processing quality metrics */
  quality: {
    detectedPeakCount: number;
    fittedPeakCount: number;
    snRatio: number;
    baselineDeviation: number;
    peakResolution: string;
  };
  /** Phase matching results */
  phaseMatch?: {
    primaryPhase: string | null;
    matchedPeakCount: number;
    phaseSummary: string | null;
    isPhaseMatched: boolean;
  };
  /** Reference match v2 evidence */
  referenceMatchV2?: XRDWorkflowReferenceMatchEvidence;
  /** Scientific evidence object (skill handoff) */
  scientificEvidence?: XRDWorkflowScientificEvidence;
  /** Raw backend arrays (excluded from handoff for size) */
  rawSignal?: {
    x: number[];
    yRaw: number[];
    ySmoothed: number[];
    yBaseline: number[];
    yCorrected: number[];
    yResidual: number[];
  };
}

/**
 * Unified reference match v2 evidence.
 * Maps from: XRDReferenceMatchV2 (backend), XRDReferenceMatchV2EvidenceSummary (storage).
 *
 * Source of truth: Backend reference matching service.
 * Handoff: Compact summary to Agent/Notebook, full object excluded for size.
 */
export interface XRDWorkflowReferenceMatchEvidence {
  source: 'curated_reference' | 'local_reference' | 'unknown';
  status: string;
  claimLevel: string;
  backendAvailable: boolean;
  reason?: string;
  referenceSetId?: string;
  candidateCount: number;
  primaryCandidate?: {
    phaseId: string;
    phaseLabel: string;
    formula?: string;
    structureFamily?: string;
    databaseRef?: string;
    matchedPeakCount: number;
    referencePeakCount?: number;
    coverageRatio: number;
    meanDeltaTwoTheta?: number | null;
    positionScore?: number;
    coverageScore?: number;
    chemistryScore?: number;
    score: number;
  };
  matchedPeaksPreview?: Array<{
    measuredTwoTheta: number;
    referenceTwoTheta: number;
    deltaTwoTheta: number;
    hkl?: string | null;
    referenceRelativeIntensity?: number | null;
  }>;
  phaseConfirmed: false;
  phasePurityConfirmed: false;
  limitations: string[];
  mappedAt: string;
}

/**
 * Unified scientific evidence object.
 * Maps from: ScientificEvidenceObject (backend), XRDSkillEvidenceSummary (storage).
 *
 * Source of truth: Backend skill handoff.
 * Handoff: Compact summary to Agent/Notebook for reasoning, full object excluded for size.
 */
export interface XRDWorkflowScientificEvidence {
  evidenceId: string;
  schemaVersion: string;
  skillId: string;
  skillLabel: string;
  technique: string;
  inputReference: string;
  processingSummary: string;
  scientificObservations: string[];
  claimBoundaries: string[];
  validationGaps: string[];
  agentReadySummary: string;
  createdAt: string;
  mappedAt: string;
}

// ============================================================================
// Claim Boundary (Safety Gates)
// ============================================================================

/**
 * Unified claim boundary configuration.
 * Maps from: XRDBoundaryParameters (frontend), boundary fields in backend result.
 *
 * Source of truth: Frontend boundary panel + backend enforcement.
 * Handoff: Limitations included in Agent/Notebook reasoning.
 */
export interface XRDWorkflowClaimBoundary {
  /** Boundary gate enabled */
  enabled: boolean;
  /** Claim mode (conservative | standard | exploratory) */
  claimMode: string;
  /** Identity claim allowed */
  allowIdentityClaim: boolean;
  /** Phase purity claim allowed */
  allowPhasePurityClaim: boolean;
  /** Require complementary evidence for identity */
  requireComplementaryEvidence: boolean;
  /** Require reference set for matching */
  requireReferenceSetForMatch: boolean;
  /** Require sample context for targeted matching */
  requireSampleContextForTargetedMatch: boolean;
  /** Computed limitations (from backend and frontend) */
  limitations: string[];
}

// ============================================================================
// Handoff State (Agent/Notebook/Report)
// ============================================================================

/**
 * Unified handoff state for Agent, Notebook, and Report.
 * Consolidates all evidence and provenance needed for downstream reasoning.
 *
 * Source of truth: Aggregated from workflow run context + backend evidence.
 * Handoff: Passed to Agent demo, Notebook template, Report builder.
 *
 * Phase X4: Combines X1 (dataset/provenance echo), X2 (reference match), X3 (scientific evidence).
 */
export interface XRDWorkflowHandoffState {
  /** Handoff metadata */
  handoffId: string;
  technique: 'xrd';
  createdAt: string;
  mappedAt: string;
  /** Run identification */
  runId: string;
  projectId: string;
  uploadedRunId?: string;
  fileName?: string;
  sourceEvidenceRecordId?: string;
  /** Phase X1: Dataset context echo */
  datasetContextEcho?: XRDDatasetContextEcho;
  /** Phase X1: Processing provenance */
  processingProvenance?: XRDProcessingProvenance;
  /** Phase X2: Structured reference match evidence */
  workflowReferenceMatchEvidence?: XRDWorkflowReferenceMatchEvidence;
  /** Phase X3: Structured scientific evidence */
  workflowScientificEvidence?: XRDWorkflowScientificEvidence;
  /** Quality metrics summary */
  qualityMetrics: {
    detectedPeakCount: number;
    fittedPeakCount: number;
    snRatio: number;
    baselineDeviation: number;
    peakResolution: string | null;
  };
  /** Phase matching summary */
  phaseMatchSummary?: {
    isPhaseMatched: boolean;
    primaryPhase: string | null;
    matchedPeakCount: number;
    phaseSummary: string | null;
  };
  /** Claim boundary mode */
  claimBoundary: 'validation-limited' | 'research-grade' | 'exploratory';
  /** Validation gaps aggregated from all evidence sources */
  validationGaps: string[];
}

// ============================================================================
// Mapping Utilities (Alignment Layer)
// ============================================================================

/**
 * Maps frontend XRDDatasetContext to unified workflow dataset context.
 */
export function mapDatasetContextToWorkflow(
  datasetContext: XRDDatasetContext
): XRDWorkflowDatasetContext {
  return {
    sampleId: datasetContext.sampleId,
    sampleName: datasetContext.sampleName,
    materialClass: datasetContext.materialClass,
    batchId: datasetContext.batchId,
    knownElements: datasetContext.knownElements,
    expectedElements: datasetContext.expectedElements,
    excludedElements: datasetContext.excludedElements,
    declaredPhases: datasetContext.declaredPhases,
    candidatePhaseIds: datasetContext.candidatePhaseIds,
    excludedPhaseIds: datasetContext.excludedPhaseIds,
    referenceSource: datasetContext.referenceSource,
    referenceSetId: datasetContext.referenceSetId,
    identitySource: datasetContext.identitySource,
    identityConfidence: datasetContext.identityConfidence,
  };
}

/**
 * Maps frontend XRDParameters to unified workflow processing parameters.
 */
export function mapParametersToWorkflow(
  parameters: XRDParameters
): XRDWorkflowProcessingParameters {
  return {
    range: {
      twoThetaMin: parameters.range.twoThetaMin,
      twoThetaMax: parameters.range.twoThetaMax,
    },
    radiation: {
      source: parameters.radiation.source,
      wavelengthAngstrom: parameters.radiation.wavelengthAngstrom,
    },
    baseline: {
      method: parameters.baseline.method,
      lambda: parameters.baseline.lambda,
      p: parameters.baseline.p,
    },
    smoothing: {
      method: parameters.smoothing.method,
      windowSize: parameters.smoothing.windowSize,
      polynomialOrder: parameters.smoothing.polynomialOrder,
    },
    peakDetection: {
      minProminence: parameters.peakDetection.minProminence,
      minDistanceDeg: parameters.peakDetection.minDistanceDeg,
      minHeightRatio: parameters.peakDetection.minHeightRatio,
      maxPeakCount: parameters.peakDetection.maxPeakCount,
    },
    peakFitting: {
      model: parameters.peakFitting.model,
      fitWindowDeg: parameters.peakFitting.fitWindowDeg,
      maxIterations: parameters.peakFitting.maxIterations,
      calculateCrystalliteSize: parameters.peakFitting.calculateCrystalliteSize,
    },
    referenceMatch: {
      enabled: parameters.referenceMatch.enabled,
      matchMode: parameters.referenceMatch.matchMode,
      referenceSource: parameters.referenceMatch.referenceSource,
      referenceSetId: parameters.referenceMatch.referenceSetId,
      candidatePhaseIds: parameters.referenceMatch.candidatePhaseIds,
      toleranceTwoTheta: parameters.referenceMatch.toleranceTwoTheta,
      minMatchedPeaks: parameters.referenceMatch.minMatchedPeaks,
      minCoverageRatio: parameters.referenceMatch.minCoverageRatio,
      minScore: parameters.referenceMatch.minScore,
      useRelativeIntensity: parameters.referenceMatch.useRelativeIntensity,
      intensityToleranceRatio: parameters.referenceMatch.intensityToleranceRatio,
      allowUnknownSearch: parameters.referenceMatch.allowUnknownSearch,
    },
    boundary: {
      enabled: parameters.boundary.enabled,
      claimMode: parameters.boundary.claimMode,
      requireComplementaryEvidence: parameters.boundary.requireComplementaryEvidence,
      requireReferenceSetForMatch: parameters.boundary.requireReferenceSetForMatch,
      requireSampleContextForTargetedMatch: parameters.boundary.requireSampleContextForTargetedMatch,
    },
  };
}

/**
 * Maps backend XRDNormalizedResult to unified workflow backend evidence.
 */
export function mapBackendResultToWorkflowEvidence(
  result: XRDNormalizedResult
): XRDWorkflowBackendEvidence {
  return {
    quality: {
      detectedPeakCount: result.detectedPeakCount,
      fittedPeakCount: result.fittedPeakCount,
      snRatio: result.snRatio,
      baselineDeviation: result.baselineDeviation,
      peakResolution: result.peakResolution,
    },
    phaseMatch: {
      primaryPhase: result.primaryPhase,
      matchedPeakCount: result.matchedPeakCount,
      phaseSummary: result.phaseSummary,
      isPhaseMatched: result.isPhaseMatched,
    },
    referenceMatchV2: result.referenceMatchV2 ? mapReferenceMatchV2ToWorkflow(result.referenceMatchV2) : undefined,
    scientificEvidence: result.scientificEvidenceObject ? mapScientificEvidenceToWorkflow(result.scientificEvidenceObject) : undefined,
    rawSignal: {
      x: result.raw.x,
      yRaw: result.raw.y_raw,
      ySmoothed: result.raw.y_smoothed,
      yBaseline: result.raw.y_baseline,
      yCorrected: result.raw.y_corrected,
      yResidual: result.yResidual,
    },
  };
}

/**
 * Maps backend XRDReferenceMatchV2 to unified workflow reference match evidence.
 */
export function mapReferenceMatchV2ToWorkflow(
  refMatch: XRDReferenceMatchV2
): XRDWorkflowReferenceMatchEvidence {
  const primaryCandidate = refMatch.primary_candidate || refMatch.ranked_candidates?.[0];

  // Detect source from reference_set_id
  const referenceSetId = refMatch.reference_set_id || undefined;
  let source: 'curated_reference' | 'local_reference' | 'unknown' = 'unknown';
  if (referenceSetId) {
    if (referenceSetId.startsWith('local_reference:')) {
      source = 'local_reference';
    } else {
      source = 'curated_reference';
    }
  }

  // Extract matched peaks preview (limit to 5)
  const matchedPeaksPreview = primaryCandidate?.matched_peaks
    ?.map((peak) => {
      const measuredTwoTheta = peak.measured_two_theta;
      const referenceTwoTheta = peak.reference_two_theta;
      const deltaTwoTheta = peak.delta_two_theta;

      if (
        typeof measuredTwoTheta !== 'number' ||
        typeof referenceTwoTheta !== 'number' ||
        typeof deltaTwoTheta !== 'number'
      ) {
        return null;
      }

      return {
        measuredTwoTheta,
        referenceTwoTheta,
        deltaTwoTheta,
        hkl: peak.hkl ?? null,
        referenceRelativeIntensity: peak.reference_relative_intensity ?? null,
      };
    })
    .filter((peak): peak is NonNullable<typeof peak> => peak !== null)
    .slice(0, 5);

  return {
    source,
    status: refMatch.status || 'unavailable',
    claimLevel: refMatch.claim_level || 'none',
    backendAvailable: refMatch.backend_available !== false,
    reason: refMatch.reason || undefined,
    referenceSetId,
    candidateCount: refMatch.candidate_count || 0,
    primaryCandidate: primaryCandidate ? {
      phaseId: primaryCandidate.phase_id || 'unknown',
      phaseLabel: primaryCandidate.phase_label || 'Unknown phase',
      formula: primaryCandidate.formula || undefined,
      structureFamily: primaryCandidate.structure_family || undefined,
      databaseRef: primaryCandidate.database_ref || undefined,
      matchedPeakCount: primaryCandidate.matched_peak_count || 0,
      referencePeakCount: primaryCandidate.reference_peak_count || undefined,
      coverageRatio: primaryCandidate.coverage_ratio || 0,
      meanDeltaTwoTheta: primaryCandidate.mean_delta_two_theta ?? undefined,
      positionScore: primaryCandidate.position_score || undefined,
      coverageScore: primaryCandidate.coverage_score || undefined,
      chemistryScore: primaryCandidate.chemistry_score || undefined,
      score: primaryCandidate.score || 0,
    } : undefined,
    matchedPeaksPreview: matchedPeaksPreview && matchedPeaksPreview.length > 0 ? matchedPeaksPreview : undefined,
    phaseConfirmed: false,
    phasePurityConfirmed: false,
    limitations: refMatch.limitations || [],
    mappedAt: new Date().toISOString(),
  };
}

/**
 * Maps backend ScientificEvidenceObject to unified workflow scientific evidence.
 */
export function mapScientificEvidenceToWorkflow(
  evidence: ScientificEvidenceObject
): XRDWorkflowScientificEvidence {
  return {
    evidenceId: evidence.evidence_id,
    schemaVersion: evidence.schema_version,
    skillId: evidence.skill_id,
    skillLabel: evidence.skill_label,
    technique: evidence.technique,
    inputReference: evidence.input_reference,
    processingSummary: evidence.processing_summary,
    scientificObservations: evidence.scientific_observations,
    claimBoundaries: evidence.claim_boundaries,
    validationGaps: evidence.validation_gaps,
    agentReadySummary: evidence.agent_ready_summary,
    createdAt: evidence.created_at,
    mappedAt: new Date().toISOString(),
  };
}

/**
 * Maps stored local reference record to unified workflow local reference context.
 * Note: XRDStoredLocalReferenceRecord has a nested parseResult structure.
 *
 * TODO (Phase X1): Complete mapping once XRDStoredLocalReferenceRecord structure is finalized.
 * Currently sourceType is not stored in parseResult but should be added for full provenance.
 */
export function mapLocalReferenceToWorkflow(
  localRef: XRDStoredLocalReferenceRecord
): XRDWorkflowLocalReferenceContext {
  const parseResult = localRef.parseResult;
  return {
    enabled: true,
    // TODO: sourceType should be stored in XRDStoredLocalReferenceRecord for provenance
    sourceType: 'uploaded_reference', // Default until storage structure includes sourceType
    referenceLabel: parseResult.referenceLabel || localRef.sourceFileName || 'Unknown reference',
    formula: parseResult.formula,
    materialFamily: parseResult.materialFamily,
    elements: parseResult.elements || [],
    importStatus: parseResult.status,
    validationLevel: localRef.validationLevel,
    approvalStatus: localRef.approvalStatus,
    userApprovedForMatching: localRef.userApprovedForMatching,
    isEligibleForBackendMatching: parseResult.isEligibleForBackendMatching || false,
    peaks: parseResult.peaks || [],
  };
}
