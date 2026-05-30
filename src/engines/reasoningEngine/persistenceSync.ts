/**
 * ============================================================================
 * DIFARYX — Persistence Sync: Workspace Synchronization & State Persistence
 * ============================================================================
 *
 * Pillar 3 of the backend pipeline implementation.
 *
 * Maps engine execution traces, validation discrepancy structures, and
 * confidence boundaries back onto the parent AnalysisSession metadata.
 *
 * Enforces platform language rules during log formatting: uses exclusively
 * validation-aware statements (e.g., "reference-supported indication",
 * "evidence suggests") and throws on forbidden definitive phrases
 * (e.g., "confirmed phase", "proven composition").
 *
 * @module reasoningEngine/persistenceSync
 * ============================================================================
 */

import type { AnalysisSession } from '../../data/analysisSessions';
import type { UniversalEvidenceNode, XpsEvidenceMetadata } from '../../types/universalEvidence';
import type {
  ReasoningReport,
  DecisionReport,
  CrossValidationReport,
  GapAnalysisReport,
  ValidationGap,
  NextStepRecommendation,
} from './types';

// ---------------------------------------------------------------------------
// Forbidden Definitive Phrases — Language Rule Enforcement
// ---------------------------------------------------------------------------

/**
 * Phrases that must never appear in DIFARYX scientific language.
 * These imply absolute certainty that contradicts the evidence-based,
 * validation-aware reasoning model.
 */
export const FORBIDDEN_PHRASES: readonly RegExp[] = [
  /\bconfirmed\s+phase\b/gi,
  /\bconfirmed\s+composition\b/gi,
  /\bproven\s+phase\b/gi,
  /\bproven\s+composition\b/gi,
  /\bproven\s+structure\b/gi,
  /\bdefinitive\s+identification\b/gi,
  /\babsolute\s+certainty\b/gi,
  /\bconclusively\s+(identified|determined|established|confirmed)\b/gi,
  /\bproven\s+(to\s+be|that|the)\b/gi,
  /\bconfirmed\s+(to\s+be|that|the\s+presence)\b/gi,
  /\bwithout\s+(any\s+)?doubt\b/gi,
  /\bindisputable\b/gi,
];

/**
 * Enforce DIFARYX validation-aware language rules on a text string.
 *
 * Throws a compilation block if any forbidden definitive phrase is detected.
 * This ensures all output from the reasoning pipeline adheres to the platform
 * language standard: evidence-based, uncertainty-aware scientific statements.
 *
 * @param text - The text to validate.
 * @throws {Error} If a forbidden definitive phrase is found.
 */
export function enforceLanguageRules(text: string): void {
  for (const pattern of FORBIDDEN_PHRASES) {
    // Reset regex lastIndex for global patterns
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    if (match) {
      throw new Error(
        `[DIFARYX Language Rule Violation] Forbidden definitive phrase detected: "${match[0]}" — ` +
        `Use validation-aware alternatives such as "reference-supported indication", "evidence suggests", ` +
        `"consistent with", or "indicates possible". Original text: "${text.substring(0, 120)}..."`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Agent Log Formatting
// ---------------------------------------------------------------------------

interface WorkflowLogEntry {
  phase: string;
  timestamp: string;
  message: string;
  data?: Record<string, unknown>;
}

/**
 * Format raw workflow log entries into validation-aware string messages.
 *
 * Each log entry is sanitized through language rule enforcement to ensure
 * no forbidden definitive phrases appear in the persisted log.
 *
 * @param logEntries - Raw workflow log entries from the agent handler.
 * @returns Array of formatted, language-safe log strings.
 */
export function formatAgentLog(logEntries: WorkflowLogEntry[]): string[] {
  return logEntries.map((entry) => {
    // Enforce language rules on each log message
    enforceLanguageRules(entry.message);

    const phaseTag = `[${entry.phase.toUpperCase()}]`;
    const timestamp = entry.timestamp;
    return `${timestamp} ${phaseTag} ${entry.message}`;
  });
}

// ---------------------------------------------------------------------------
// Session Update Builder
// ---------------------------------------------------------------------------

/** Metadata injected into the session from the agent workflow. */
export interface AgentWorkflowMeta {
  objective: string;
  hasRuleSet: boolean;
  ruleSetId?: string;
}

/**
 * Build a partial AnalysisSession update from the reasoning engine outputs.
 *
 * Maps the execution trace arrays, validation discrepancy structures, and
 * confidence boundaries back onto the parent AnalysisSession metadata
 * parameters in a type-safe manner.
 *
 * @param report - The complete ReasoningReport from the engine.
 * @param formattedLogs - Pre-formatted, language-safe agent log strings.
 * @param meta - Workflow metadata (objective, ruleset info).
 * @returns A partial AnalysisSession with updated metadata fields.
 */
export function buildSessionUpdate(
  report: ReasoningReport,
  formattedLogs: string[],
  meta: AgentWorkflowMeta,
): Partial<AnalysisSession> {
  // Build a validation-aware interpretation from the report
  const interpretation = buildInterpretation(report);

  // Build processing log entries from agent workflow logs
  const processingLog = [
    ...formattedLogs,
  ];

  // Build quality checks from gap analysis
  const qualityChecks = buildQualityChecks(report);

  return {
    processingState: report.decision.objectiveMet ? 'completed' : 'needs-review',
    processingLog,
    qualityChecks,
    interpretation,
    status: report.decision.objectiveMet ? 'completed' : 'needs-review',
    claimStatus: buildClaimStatus(report),
  } satisfies Partial<AnalysisSession>;
}

// ---------------------------------------------------------------------------
// Interpretation Builder
// ---------------------------------------------------------------------------

function buildInterpretation(report: ReasoningReport): import('../../data/analysisSessions').AnalysisInterpretation {
  const confidence = report.decision.confidence;
  const gaps = report.gapAnalysis.gaps;
  const correlations = report.crossValidation.correlations;

  // Build quick summary lines
  const quick: string[] = [];
  quick.push(
    `Overall research confidence: ${(confidence.overallScore * 100).toFixed(1)}% (${confidence.level})`,
  );
  quick.push(
    `Cross-validation: ${correlations.length} correlation(s) evaluated, ${report.crossValidation.consistentCount} consistent`,
  );
  if (gaps.length > 0) {
    quick.push(
      `Validation gaps: ${gaps.length} gap(s) identified (${report.gapAnalysis.gapsBySeverity.critical} critical, ${report.gapAnalysis.gapsBySeverity.high} high)`,
    );
  } else {
    quick.push('No validation gaps identified');
  }

  // Evidence contribution summary
  const evidenceContribution = buildEvidenceContribution(report);

  // Confidence summary
  const confidenceSummary = confidence.summary || `${confidence.level} confidence`;

  // Validation impact
  const validationImpact = buildValidationImpact(gaps);

  // Quality flags from critical/high gaps
  const qualityFlags: string[] = [];
  for (const gap of gaps) {
    if (gap.severity === 'critical' || gap.severity === 'high') {
      qualityFlags.push(`[${gap.severity.toUpperCase()}] ${gap.description}`);
    }
  }

  // Recommended next steps from decision
  const recommendedNextSteps = report.decision.recommendations.map(
    (rec) => rec.description,
  );

  return {
    quick,
    evidenceContribution,
    confidence: confidenceSummary,
    validationImpact,
    qualityFlags,
    recommendedNextSteps,
  };
}

function buildEvidenceContribution(report: ReasoningReport): string {
  const techniques = report.techniquesAnalyzed;
  const consistent = report.crossValidation.consistentCount;
  const total = report.crossValidation.rulesEvaluated;

  const parts: string[] = [];
  parts.push(`${techniques.length} technique(s) analyzed: ${techniques.join(', ')}.`);
  parts.push(`${consistent}/${total} cross-validation rule(s) show consistent evidence.`);
  parts.push(`Technique coverage factor: ${(report.decision.confidence.techniqueCoverageFactor * 100).toFixed(0)}%.`);

  return parts.join(' ');
}

function buildValidationImpact(gaps: ValidationGap[]): string {
  if (gaps.length === 0) {
    return 'No validation gaps indicate strong evidence consistency across techniques.';
  }

  const criticalCount = gaps.filter((g) => g.severity === 'critical').length;
  const highCount = gaps.filter((g) => g.severity === 'high').length;

  if (criticalCount > 0) {
    return `Critical validation gaps (${criticalCount}) suggest significant evidence conflicts that require resolution before proceeding.`;
  }
  if (highCount > 0) {
    return `High-severity gaps (${highCount}) indicate areas where evidence is insufficient or partially inconsistent.`;
  }
  return `Minor validation gaps (${gaps.length}) detected; evidence suggests overall consistency with some areas for refinement.`;
}

// ---------------------------------------------------------------------------
// Quality Checks Builder
// ---------------------------------------------------------------------------

function buildQualityChecks(
  report: ReasoningReport,
): import('../../data/analysisSessions').ProcessingQualityMetric[] {
  const checks: import('../../data/analysisSessions').ProcessingQualityMetric[] = [];

  // Cross-validation quality
  const cv = report.crossValidation;
  if (cv.inconsistentCount > 0) {
    checks.push({
      label: 'Cross-Validation Consistency',
      value: `${cv.inconsistentCount} inconsistent rule(s) detected`,
      state: cv.inconsistentCount > 2 ? 'error' : 'warning',
    });
  } else {
    checks.push({
      label: 'Cross-Validation Consistency',
      value: `${cv.consistentCount} rule(s) consistent`,
      state: 'good',
    });
  }

  // Gap analysis quality
  const gaps = report.gapAnalysis;
  if (gaps.hasCriticalGaps) {
    checks.push({
      label: 'Validation Gap Status',
      value: `${gaps.gapsBySeverity.critical} critical gap(s)`,
      state: 'error',
    });
  } else if (gaps.totalGaps > 0) {
    checks.push({
      label: 'Validation Gap Status',
      value: `${gaps.totalGaps} non-critical gap(s)`,
      state: 'warning',
    });
  } else {
    checks.push({
      label: 'Validation Gap Status',
      value: 'No gaps identified',
      state: 'good',
    });
  }

  // Confidence quality
  const conf = report.decision.confidence;
  if (conf.level === 'HIGH') {
    checks.push({
      label: 'Research Confidence',
      value: `${(conf.overallScore * 100).toFixed(1)}% — HIGH`,
      state: 'good',
    });
  } else if (conf.level === 'MEDIUM') {
    checks.push({
      label: 'Research Confidence',
      value: `${(conf.overallScore * 100).toFixed(1)}% — MEDIUM`,
      state: 'warning',
    });
  } else {
    checks.push({
      label: 'Research Confidence',
      value: `${(conf.overallScore * 100).toFixed(1)}% — ${conf.level}`,
      state: 'error',
    });
  }

  return checks;
}

// ---------------------------------------------------------------------------
// Claim Status Builder
// ---------------------------------------------------------------------------

function buildClaimStatus(report: ReasoningReport): string {
  const level = report.decision.confidence.level;
  const objectiveMet = report.decision.objectiveMet;

  if (objectiveMet) {
    return `Reference-supported indication: research objective criteria met (${level} confidence)`;
  }

  const topRec = report.decision.recommendations[0];
  if (topRec) {
    return `Evidence suggests further validation needed — ${topRec.description}`;
  }

  return `Validation status: ${level} — evidence suggests continued investigation`;
}

// ---------------------------------------------------------------------------
// Technique-Specific Evidence Summary Generators
// ---------------------------------------------------------------------------

/**
 * Generate a scientific, validation-aware XPS evidence summary string.
 *
 * Surfaces core-level analysis details including binding energy attributes,
 * chemical state assignments, and mixed-valence indicators rather than
 * generic peak arrays.
 *
 * @param nodes - XPS evidence nodes to summarize.
 * @returns A language-safe XPS evidence summary string.
 */
export function generateXpsEvidenceSummary(nodes: UniversalEvidenceNode[]): string {
  const xpsNodes = nodes.filter((n) => n.technique === 'XPS');
  if (xpsNodes.length === 0) return 'No XPS evidence available.';

  const parts: string[] = [];

  for (const node of xpsNodes) {
    const meta = node.techniqueMetadata as XpsEvidenceMetadata | undefined;
    const beLabel = node.primaryAxis ? `${node.primaryAxis.toFixed(1)} eV` : 'observed binding energy';

    // ── Registry-Enriched Sentence Construction ──────────────────────────
    // When the global XPS registry has resolved element identity, core-level
    // shell, and bonding assignment, construct the high-fidelity sentence:
    // "XPS core-level analysis detected sub-component state distribution
    //  consistent with a localized [Bonding Assignment] chemical environment
    //  at [Observed BE] eV."
    if (meta?.element && meta?.shell && meta?.bondingAssignment) {
      const elementShell = `${meta.element} ${meta.shell}`;
      let sentence = `XPS core-level analysis of the ${elementShell} region detected sub-component state distribution ` +
        `consistent with a localized ${meta.bondingAssignment} chemical environment at ${beLabel}`;

      if (meta.doubletSplitting) {
        sentence += ` (ΔE = ${meta.doubletSplitting.toFixed(1)} eV)`;
      }

      if (meta.chargingCalibrationOffset !== undefined && meta.chargingCalibrationOffset !== 0) {
        const sign = meta.chargingCalibrationOffset >= 0 ? '+' : '';
        sentence += ` | C 1s charging calibration offset: ${sign}${meta.chargingCalibrationOffset.toFixed(1)} eV`;
      }

      sentence += '.';
      parts.push(sentence);
      continue;
    }

    // ── Legacy Field-Based Fallback ──────────────────────────────────────
    const segments: string[] = [];

    if (meta?.orbital) {
      segments.push(`core-level ${meta.orbital}`);
    }

    if (meta?.chemicalState) {
      segments.push(`chemical state ${meta.chemicalState}`);
    }

    if (meta?.spinOrbitSplitting) {
      segments.push(`spin-orbit splitting ${meta.spinOrbitSplitting.toFixed(1)} eV`);
    }

    if (meta?.fwhm) {
      segments.push(`FWHM ${meta.fwhm.toFixed(2)} eV`);
    }

    if (meta?.atomicPercent) {
      segments.push(`atomic concentration ${meta.atomicPercent.toFixed(1)}%`);
    }

    const detail = segments.length > 0 ? segments.join(', ') : 'spectral feature';
    parts.push(`XPS core-level analysis suggests binding energy attributes (${beLabel}) consistent with ${detail}`);
  }

  const summary = parts.join('; ');
  enforceLanguageRules(summary);
  return summary;
}

/**
 * Generate a scientific, validation-aware FTIR evidence summary string.
 *
 * Maps detected bands to functional group assignments and vibrational modes.
 *
 * @param nodes - FTIR evidence nodes to summarize.
 * @returns A language-safe FTIR evidence summary string.
 */
export function generateFtirEvidenceSummary(nodes: UniversalEvidenceNode[]): string {
  const ftirNodes = nodes.filter((n) => n.technique === 'FTIR');
  if (ftirNodes.length === 0) return 'No FTIR evidence available.';

  const parts: string[] = [];

  for (const node of ftirNodes) {
    const meta = node.techniqueMetadata as import('../../types/universalEvidence').FtirEvidenceMetadata | undefined;
    const segments: string[] = [];

    if (meta?.functionalGroup) {
      segments.push(`functional group ${meta.functionalGroup}`);
    }

    if (meta?.vibrationalMode) {
      segments.push(`vibrational mode ${meta.vibrationalMode}`);
    }

    if (meta?.bondingEnvironment) {
      segments.push(`bonding environment: ${meta.bondingEnvironment}`);
    }

    if (meta?.intensityCategory) {
      segments.push(`${meta.intensityCategory} intensity`);
    }

    if (meta?.bandType) {
      segments.push(`${meta.bandType} band profile`);
    }

    const wnLabel = node.primaryAxis ? `wavenumber ${node.primaryAxis.toFixed(0)} cm⁻¹` : '';

    const detail = segments.length > 0 ? segments.join(', ') : 'spectral feature';
    parts.push(`FTIR band analysis at ${wnLabel} suggests ${detail}`);
  }

  const summary = parts.join('; ');
  enforceLanguageRules(summary);
  return summary;
}

/**
 * Generate a scientific, validation-aware Raman evidence summary string.
 *
 * Maps Raman shifts to phonon mode assignments and crystalline vibrational
 * symmetries (A1g, Eg, T2g) for fingerprint-level identification support.
 *
 * @param nodes - Raman evidence nodes to summarize.
 * @returns A language-safe Raman evidence summary string.
 */
export function generateRamanEvidenceSummary(nodes: UniversalEvidenceNode[]): string {
  const ramanNodes = nodes.filter((n) => n.technique === 'Raman');
  if (ramanNodes.length === 0) return 'No Raman evidence available.';

  const parts: string[] = [];

  for (const node of ramanNodes) {
    const meta = node.techniqueMetadata as import('../../types/universalEvidence').RamanEvidenceMetadata | undefined;
    const segments: string[] = [];

    if (meta?.phononMode) {
      segments.push(`phonon mode ${meta.phononMode}`);
    }

    if (meta?.modeAssignment) {
      segments.push(`mode assignment ${meta.modeAssignment}`);
    }

    if (meta?.symmetry) {
      segments.push(`symmetry: ${meta.symmetry}`);
    }

    if (meta?.bandType) {
      segments.push(`${meta.bandType} band profile`);
    }

    const shiftLabel = node.primaryAxis ? `Raman shift ${node.primaryAxis.toFixed(0)} cm⁻¹` : '';

    const detail = segments.length > 0 ? segments.join(', ') : 'spectral feature';
    parts.push(`Raman phonon mode analysis at ${shiftLabel} suggests ${detail}`);
  }

  const summary = parts.join('; ');
  enforceLanguageRules(summary);
  return summary;
}

// ---------------------------------------------------------------------------
// Technique Evidence Summary Dispatcher
// ---------------------------------------------------------------------------

/**
 * Generate a technique-specific evidence summary by dispatching to the
 * appropriate technique-aware generator based on the first node's technique.
 *
 * This is a convenience function consumed by the agent handler report phase
 * and downstream UI components (EvidenceVerificationTable, NotebookLab).
 *
 * All generated text passes through enforceLanguageRules() internally.
 *
 * @param nodes - Evidence nodes (mixed techniques allowed; auto-filtered).
 * @param technique - Explicit technique selector for the summary.
 * @returns A language-safe, technique-specific evidence summary string.
 */
export function generateTechniqueEvidenceSummary(
  nodes: UniversalEvidenceNode[],
  technique: string,
): string {
  const normalizedTechnique = technique.toUpperCase();

  switch (normalizedTechnique) {
    case 'XPS':
      return generateXpsEvidenceSummary(nodes);
    case 'FTIR':
      return generateFtirEvidenceSummary(nodes);
    case 'RAMAN':
      return generateRamanEvidenceSummary(nodes);
    case 'XRD':
      return generateXrdEvidenceSummary(nodes);
    default:
      return `No specialized evidence summary available for technique: ${technique}.`;
  }
}

/**
 * Generate a scientific, validation-aware XRD evidence summary string.
 *
 * Maps detected peaks to crystallographic planes and phase assignments.
 *
 * @param nodes - XRD evidence nodes to summarize.
 * @returns A language-safe XRD evidence summary string.
 */
function generateXrdEvidenceSummary(nodes: UniversalEvidenceNode[]): string {
  const xrdNodes = nodes.filter((n) => n.technique === 'XRD');
  if (xrdNodes.length === 0) return 'No XRD evidence available.';

  const parts: string[] = [];

  for (const node of xrdNodes) {
    const segments: string[] = [];

    if (node.label) {
      segments.push(`diffraction feature "${node.label}"`);
    }

    if (node.primaryAxisUnit === 'deg 2θ' && node.primaryAxis) {
      segments.push(`at ${node.primaryAxis.toFixed(2)}° 2θ`);
    }

    if (node.role) {
      segments.push(`role: ${node.role}`);
    }

    const detail = segments.length > 0 ? segments.join(', ') : 'structural reflection';
    parts.push(`XRD evidence suggests ${detail}`);
  }

  const summary = parts.join('; ');
  enforceLanguageRules(summary);
  return summary;
}

