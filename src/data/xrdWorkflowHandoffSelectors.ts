/**
 * XRD Workflow Handoff Selectors
 *
 * Centralized selector helpers for consuming XRD workflow handoff state.
 * Implements three-tier fallback: unified handoff → individual workflow fields → legacy summaries.
 *
 * Phase X5A: Runtime contract cleanup to eliminate duplicated selection logic
 * across Agent, Notebook, and Report.
 */

import type {
  XRDWorkflowHandoffState,
  XRDWorkflowScientificEvidence,
  XRDWorkflowReferenceMatchEvidence,
} from '../types/xrdWorkflowContract';
import type {
  XRDDatasetContextEcho,
  XRDProcessingProvenance,
} from '../types/xrdBackend';
import type {
  XRDBackendEvidenceRecord,
  XRDSkillEvidenceSummary,
  XRDReferenceMatchV2EvidenceSummary,
} from './xrdBackendEvidence';
import type { NotebookEntry } from './workflowPipeline';

/**
 * Normalized input interface for selector helpers.
 * Can be satisfied by XRDBackendEvidenceRecord or NotebookEntry.
 */
export interface XrdHandoffInput {
  xrdWorkflowHandoffState?: XRDWorkflowHandoffState;
  workflowScientificEvidence?: XRDWorkflowScientificEvidence;
  workflowReferenceMatchEvidence?: XRDWorkflowReferenceMatchEvidence;
  datasetContextEcho?: XRDDatasetContextEcho | null;
  processingProvenance?: XRDProcessingProvenance | null;
  scientificEvidenceSummary?: XRDSkillEvidenceSummary;
  referenceMatchV2Summary?: XRDReferenceMatchV2EvidenceSummary;
  xrdBackendEvidenceSummary?: NotebookEntry['xrdBackendEvidenceSummary'];
  xrdReferenceMatchV2Summary?: NotebookEntry['xrdReferenceMatchV2Summary'];
}

// ── Handoff State Selectors ─────────────────────────────────────────

/**
 * Select unified XRD workflow handoff state.
 * Returns handoff state if present, otherwise undefined.
 */
export function selectXrdWorkflowHandoffState(
  input: XrdHandoffInput | null | undefined,
): XRDWorkflowHandoffState | undefined {
  return input?.xrdWorkflowHandoffState;
}

// ── Scientific Evidence Selectors ───────────────────────────────────

/**
 * Select XRD workflow scientific evidence with three-tier fallback.
 *
 * Fallback order:
 * 1. xrdWorkflowHandoffState.workflowScientificEvidence
 * 2. workflowScientificEvidence
 * 3. scientificEvidenceSummary or xrdBackendEvidenceSummary.scientificEvidenceSummary
 *
 * Returns workflow evidence or legacy summary (both are compatible for UI consumption).
 */
export function selectXrdWorkflowScientificEvidence(
  input: XrdHandoffInput | null | undefined,
): XRDWorkflowScientificEvidence | XRDSkillEvidenceSummary | undefined {
  if (!input) return undefined;

  // Tier 1: Unified handoff state
  const fromHandoff = input.xrdWorkflowHandoffState?.workflowScientificEvidence;
  if (fromHandoff) return fromHandoff;

  // Tier 2: Individual workflow field
  if (input.workflowScientificEvidence) return input.workflowScientificEvidence;

  // Tier 3: Legacy summary (direct or nested in xrdBackendEvidenceSummary)
  if (input.scientificEvidenceSummary) return input.scientificEvidenceSummary;
  if (input.xrdBackendEvidenceSummary?.scientificEvidenceSummary) {
    return input.xrdBackendEvidenceSummary.scientificEvidenceSummary;
  }

  return undefined;
}

/**
 * Check if XRD workflow scientific evidence is present.
 */
export function hasXrdWorkflowScientificEvidence(
  input: XrdHandoffInput | null | undefined,
): boolean {
  return selectXrdWorkflowScientificEvidence(input) !== undefined;
}

// ── Reference Match Evidence Selectors ──────────────────────────────

/**
 * Select XRD workflow reference match evidence with three-tier fallback.
 *
 * Fallback order:
 * 1. xrdWorkflowHandoffState.workflowReferenceMatchEvidence
 * 2. workflowReferenceMatchEvidence
 * 3. referenceMatchV2Summary or xrdReferenceMatchV2Summary
 *
 * Returns workflow evidence or legacy summary (both are compatible for UI consumption).
 */
export function selectXrdWorkflowReferenceMatchEvidence(
  input: XrdHandoffInput | null | undefined,
): XRDWorkflowReferenceMatchEvidence | XRDReferenceMatchV2EvidenceSummary | NotebookEntry['xrdReferenceMatchV2Summary'] | undefined {
  if (!input) return undefined;

  // Tier 1: Unified handoff state
  const fromHandoff = input.xrdWorkflowHandoffState?.workflowReferenceMatchEvidence;
  if (fromHandoff) return fromHandoff;

  // Tier 2: Individual workflow field
  if (input.workflowReferenceMatchEvidence) return input.workflowReferenceMatchEvidence;

  // Tier 3: Legacy summary (direct or notebook-specific)
  if (input.referenceMatchV2Summary) return input.referenceMatchV2Summary;
  if (input.xrdReferenceMatchV2Summary) return input.xrdReferenceMatchV2Summary;

  return undefined;
}

/**
 * Check if XRD workflow reference match evidence is present.
 */
export function hasXrdWorkflowReferenceMatchEvidence(
  input: XrdHandoffInput | null | undefined,
): boolean {
  return selectXrdWorkflowReferenceMatchEvidence(input) !== undefined;
}

// ── Dataset Context and Provenance Selectors ────────────────────────

/**
 * Select XRD dataset context echo with two-tier fallback.
 *
 * Fallback order:
 * 1. xrdWorkflowHandoffState.datasetContextEcho
 * 2. datasetContextEcho
 */
export function selectXrdDatasetContextEcho(
  input: XrdHandoffInput | null | undefined,
): XRDDatasetContextEcho | undefined {
  if (!input) return undefined;

  // Tier 1: Unified handoff state
  const fromHandoff = input.xrdWorkflowHandoffState?.datasetContextEcho;
  if (fromHandoff) return fromHandoff;

  // Tier 2: Individual field
  if (input.datasetContextEcho) return input.datasetContextEcho;

  return undefined;
}

/**
 * Select XRD processing provenance with two-tier fallback.
 *
 * Fallback order:
 * 1. xrdWorkflowHandoffState.processingProvenance
 * 2. processingProvenance
 */
export function selectXrdProcessingProvenance(
  input: XrdHandoffInput | null | undefined,
): XRDProcessingProvenance | undefined {
  if (!input) return undefined;

  // Tier 1: Unified handoff state
  const fromHandoff = input.xrdWorkflowHandoffState?.processingProvenance;
  if (fromHandoff) return fromHandoff;

  // Tier 2: Individual field
  if (input.processingProvenance) return input.processingProvenance;

  return undefined;
}

// ── Type-Safe Extraction Helpers ────────────────────────────────────

/**
 * Extract scientific evidence fields in a type-safe manner.
 * Handles differences between XRDWorkflowScientificEvidence and XRDSkillEvidenceSummary.
 */
export function extractScientificEvidenceFields(
  evidence: XRDWorkflowScientificEvidence | XRDSkillEvidenceSummary | undefined,
): {
  skillLabel: string;
  evidenceId: string;
  inputReference: string;
  claimBoundary: string;
} | null {
  if (!evidence) return null;

  const skillLabel = 'skillLabel' in evidence ? evidence.skillLabel : '';
  const evidenceId = 'evidenceId' in evidence ? evidence.evidenceId : '';
  const inputReference = 'inputReference' in evidence ? evidence.inputReference : '';
  const claimBoundary = 'claimBoundaries' in evidence
    ? evidence.claimBoundaries.join('; ')
    : ('claimBoundary' in evidence ? evidence.claimBoundary : 'validation-limited scientific claim');

  return {
    skillLabel,
    evidenceId,
    inputReference,
    claimBoundary,
  };
}

/**
 * Extract reference match evidence fields in a type-safe manner.
 * Handles differences between XRDWorkflowReferenceMatchEvidence and legacy summaries.
 * Returns evidence as-is for consumption by Agent/Notebook/Report.
 */
export function extractReferenceMatchFields(
  evidence: XRDWorkflowReferenceMatchEvidence | XRDReferenceMatchV2EvidenceSummary | NotebookEntry['xrdReferenceMatchV2Summary'] | undefined,
) {
  if (!evidence) return null;

  return {
    status: evidence.status,
    claimLevel: evidence.claimLevel,
    referenceSetId: evidence.referenceSetId,
    candidateCount: evidence.candidateCount,
    primaryCandidate: evidence.primaryCandidate,
    matchedPeaksPreview: evidence.matchedPeaksPreview,
    limitations: evidence.limitations || [],
    phaseConfirmed: 'phaseConfirmed' in evidence ? evidence.phaseConfirmed : false,
    phasePurityConfirmed: 'phasePurityConfirmed' in evidence ? evidence.phasePurityConfirmed : false,
  };
}
