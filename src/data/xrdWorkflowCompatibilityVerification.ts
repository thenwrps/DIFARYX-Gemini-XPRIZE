/**
 * XRD Workflow Compatibility Verification
 *
 * Verification helpers for XRD workflow handoff selector compatibility.
 * Detects source tier, checks for duplicate evidence risks, and validates
 * selector behavior across legacy, workflow, and unified handoff records.
 *
 * Phase X5B: Verification-focused utilities for AgentDemo, NotebookLab, ReportBuilder.
 */

import type { XRDBackendEvidenceRecord } from './xrdBackendEvidence';
import type { NotebookEntry } from './workflowPipeline';
import {
  selectXrdWorkflowScientificEvidence,
  selectXrdWorkflowReferenceMatchEvidence,
  hasXrdWorkflowScientificEvidence,
  hasXrdWorkflowReferenceMatchEvidence,
} from './xrdWorkflowHandoffSelectors';

/**
 * Source tier for XRD workflow evidence.
 * Indicates which tier the selector will resolve to.
 */
export type XrdWorkflowSourceTier = 'unified' | 'workflow' | 'legacy' | 'none';

/**
 * Verification result for XRD workflow compatibility.
 */
export interface XrdWorkflowVerificationResult {
  /** Evidence source tier detected */
  sourceTier: XrdWorkflowSourceTier;
  /** Scientific evidence resolvable */
  hasScientificEvidence: boolean;
  /** Reference match evidence resolvable */
  hasReferenceEvidence: boolean;
  /** Required claim boundary wording present */
  hasRequiredClaimWording: boolean;
  /** Risk of duplicate evidence rendering */
  duplicateRisk: boolean;
  /** Verification passed */
  passed: boolean;
  /** Verification notes */
  notes: string[];
}

/**
 * Detect XRD workflow source tier for a given record.
 *
 * Priority order:
 * 1. Unified: xrdWorkflowHandoffState present
 * 2. Workflow: workflowScientificEvidence or workflowReferenceMatchEvidence present
 * 3. Legacy: scientificEvidenceSummary or referenceMatchV2Summary present
 * 4. None: no evidence fields present
 */
export function detectXrdWorkflowSourceTier(
  record: XRDBackendEvidenceRecord | NotebookEntry | null | undefined,
): XrdWorkflowSourceTier {
  if (!record) return 'none';

  // Tier 1: Unified handoff
  if (record.xrdWorkflowHandoffState) {
    return 'unified';
  }

  // Tier 2: Workflow fields
  if (record.workflowScientificEvidence || record.workflowReferenceMatchEvidence) {
    return 'workflow';
  }

  // Tier 3: Legacy summaries
  if ('scientificEvidenceSummary' in record && record.scientificEvidenceSummary) {
    return 'legacy';
  }
  if ('referenceMatchV2Summary' in record && record.referenceMatchV2Summary) {
    return 'legacy';
  }
  if ('xrdReferenceMatchV2Summary' in record && record.xrdReferenceMatchV2Summary) {
    return 'legacy';
  }
  if ('xrdBackendEvidenceSummary' in record && record.xrdBackendEvidenceSummary?.scientificEvidenceSummary) {
    return 'legacy';
  }

  return 'none';
}

/**
 * Check if record has risk of duplicate evidence rendering.
 *
 * Duplicate risk exists if multiple tiers contain evidence fields.
 * Selectors should prevent this, but this checks the raw record structure.
 */
export function hasDuplicateXrdEvidenceRisk(
  record: XRDBackendEvidenceRecord | NotebookEntry | null | undefined,
): boolean {
  if (!record) return false;

  let tierCount = 0;

  // Check Tier 1
  if (record.xrdWorkflowHandoffState) {
    tierCount++;
  }

  // Check Tier 2
  if (record.workflowScientificEvidence || record.workflowReferenceMatchEvidence) {
    tierCount++;
  }

  // Check Tier 3
  const hasLegacy = 
    ('scientificEvidenceSummary' in record && record.scientificEvidenceSummary) ||
    ('referenceMatchV2Summary' in record && record.referenceMatchV2Summary) ||
    ('xrdReferenceMatchV2Summary' in record && record.xrdReferenceMatchV2Summary) ||
    ('xrdBackendEvidenceSummary' in record && record.xrdBackendEvidenceSummary?.scientificEvidenceSummary);

  if (hasLegacy) {
    tierCount++;
  }

  // Risk if multiple tiers present (though this is expected for backward compatibility)
  // The key is that selectors should only use one tier
  return tierCount > 1;
}

/**
 * Check if required claim boundary wording is present in evidence.
 */
function hasRequiredClaimBoundaryWording(
  record: XRDBackendEvidenceRecord | NotebookEntry | null | undefined,
): boolean {
  if (!record) return false;

  const scientificEvidence = selectXrdWorkflowScientificEvidence(record);
  const referenceEvidence = selectXrdWorkflowReferenceMatchEvidence(record);

  const requiredPhrases = [
    'not chemical identity confirmation',
    'not phase purity confirmation',
    'validation-limited',
  ];

  // Check scientific evidence claim boundaries
  if (scientificEvidence) {
    const sciText = JSON.stringify(scientificEvidence).toLowerCase();
    const hasAllPhrases = requiredPhrases.every(phrase => sciText.includes(phrase));
    if (hasAllPhrases) return true;
  }

  // Check reference evidence limitations
  if (referenceEvidence && 'limitations' in referenceEvidence && referenceEvidence.limitations) {
    const refText = JSON.stringify(referenceEvidence.limitations).toLowerCase();
    const hasAllPhrases = requiredPhrases.slice(0, 2).every(phrase => refText.includes(phrase));
    if (hasAllPhrases) return true;
  }

  return false;
}

/**
 * Verify XRD workflow compatibility for a given record.
 *
 * Checks:
 * - Source tier detection
 * - Scientific evidence resolvable
 * - Reference evidence resolvable
 * - Required claim boundary wording present
 * - Duplicate evidence risk (informational, not a failure)
 *
 * Returns verification result with pass/fail status and notes.
 */
export function verifyXrdWorkflowCompatibility(
  record: XRDBackendEvidenceRecord | NotebookEntry | null | undefined,
): XrdWorkflowVerificationResult {
  const sourceTier = detectXrdWorkflowSourceTier(record);
  const hasScientificEvidence = hasXrdWorkflowScientificEvidence(record);
  const hasReferenceEvidence = hasXrdWorkflowReferenceMatchEvidence(record);
  const hasRequiredClaimWording = hasRequiredClaimBoundaryWording(record);
  const duplicateRisk = hasDuplicateXrdEvidenceRisk(record);

  const notes: string[] = [];

  // Tier detection
  if (sourceTier === 'none') {
    notes.push('No evidence fields detected');
  } else {
    notes.push(`Source tier: ${sourceTier}`);
  }

  // Scientific evidence
  if (hasScientificEvidence) {
    notes.push('Scientific evidence resolvable');
  } else {
    notes.push('No scientific evidence found');
  }

  // Reference evidence
  if (hasReferenceEvidence) {
    notes.push('Reference match evidence resolvable');
  } else {
    notes.push('No reference match evidence found');
  }

  // Claim wording
  if (hasRequiredClaimWording) {
    notes.push('Required claim boundary wording present');
  } else if (hasScientificEvidence || hasReferenceEvidence) {
    notes.push('WARNING: Required claim boundary wording missing');
  }

  // Duplicate risk
  if (duplicateRisk) {
    notes.push('INFO: Multiple evidence tiers present (expected for backward compatibility)');
  }

  // Pass criteria:
  // - Source tier detected (not 'none')
  // - At least one evidence type resolvable
  // - Required claim wording present (if evidence exists)
  const passed = 
    sourceTier !== 'none' &&
    (hasScientificEvidence || hasReferenceEvidence) &&
    hasRequiredClaimWording;

  return {
    sourceTier,
    hasScientificEvidence,
    hasReferenceEvidence,
    hasRequiredClaimWording,
    duplicateRisk,
    passed,
    notes,
  };
}

/**
 * Log compact verification summary to console (development only).
 * No-op in production.
 */
export function logXrdWorkflowVerification(
  label: string,
  result: XrdWorkflowVerificationResult,
): void {
  if (import.meta.env?.MODE !== 'development') return;

  const status = result.passed ? '✅' : '❌';
  const tierBadge = result.sourceTier === 'unified' ? '🔵' : result.sourceTier === 'workflow' ? '🟢' : result.sourceTier === 'legacy' ? '🟡' : '⚪';
  
  console.log(
    `[XRD Compat] ${status} ${tierBadge} ${label}`,
    `| Tier: ${result.sourceTier}`,
    `| Sci: ${result.hasScientificEvidence ? '✓' : '✗'}`,
    `| Ref: ${result.hasReferenceEvidence ? '✓' : '✗'}`,
    `| Claim: ${result.hasRequiredClaimWording ? '✓' : '✗'}`,
  );

  if (!result.passed || result.duplicateRisk) {
    console.log('  Notes:', result.notes.join('; '));
  }
}

/**
 * Verify all XRD compatibility seeds and log results (development only).
 * Can be called from AgentDemo, NotebookLab, or ReportBuilder during initialization.
 */
export function verifyAllXrdCompatibilitySeeds(seeds: {
  legacy?: XRDBackendEvidenceRecord | NotebookEntry;
  workflow?: XRDBackendEvidenceRecord | NotebookEntry;
  unified?: XRDBackendEvidenceRecord | NotebookEntry;
}): void {
  if (import.meta.env?.MODE !== 'development') return;

  console.group('[XRD Workflow Compatibility Verification]');

  if (seeds.legacy) {
    const result = verifyXrdWorkflowCompatibility(seeds.legacy);
    logXrdWorkflowVerification('Legacy Seed', result);
  }

  if (seeds.workflow) {
    const result = verifyXrdWorkflowCompatibility(seeds.workflow);
    logXrdWorkflowVerification('Workflow Seed', result);
  }

  if (seeds.unified) {
    const result = verifyXrdWorkflowCompatibility(seeds.unified);
    logXrdWorkflowVerification('Unified Seed', result);
  }

  console.groupEnd();
}
