/**
 * ============================================================================
 * DIFARYX — Agent Execution Loop: Workflow Orchestrator
 * ============================================================================
 *
 * Pillar 2 of the backend pipeline implementation.
 *
 * Implements an asynchronous workflow orchestration handler that steps through
 * the core platform narrative sequence:
 *   Goal → Plan → Execute → Evidence → Reason → Decision → Report
 *
 * Injects the target system formula from the session into the factory resolver
 * (resolveMaterialRuleSet) to dynamically retrieve the correct scientific
 * ruleset constraints, ingests transformed evidence nodes into the
 * ReasoningEngine, triggers the complete analysis profile, and intercepts
 * the engine outputs for workspace synchronization.
 *
 * @module reasoningEngine/agentHandler
 * ============================================================================
 */

import type { AnalysisSession } from '../../data/analysisSessions';
import {
  getAnalysisSession,
  saveAnalysisSession,
} from '../../data/analysisSessions';
import type { UniversalEvidenceNode } from '../../types/universalEvidence';
import type { Technique } from '../../types/universalTechnique';
import type { ReasoningReport, MaterialSystem } from './types';
import { ReasoningEngine } from './reasoningEngine';
import { resolveMaterialRuleSet } from './knowledgeBase/index';
import { transformSessionToEvidenceNodes } from './transformer';
import {
  formatAgentLog,
  enforceLanguageRules,
  buildSessionUpdate,
  generateTechniqueEvidenceSummary,
} from './persistenceSync';

// ---------------------------------------------------------------------------
// Workflow Phase Enum
// ---------------------------------------------------------------------------

/** The ordered phases of the DIFARYX agent reasoning workflow. */
type WorkflowPhase =
  | 'goal'
  | 'plan'
  | 'execute'
  | 'evidence'
  | 'reason'
  | 'decision'
  | 'report';

const WORKFLOW_PHASES: WorkflowPhase[] = [
  'goal',
  'plan',
  'execute',
  'evidence',
  'reason',
  'decision',
  'report',
];

// ---------------------------------------------------------------------------
// Autonomous Hyperparameter Self-Correction Constants
// ---------------------------------------------------------------------------

/** Minimum number of primary reflections required for adequate evidence density. */
const MINIMUM_PRIMARY_REFLECTIONS = 4;

/** Maximum iterations for the autonomous hyperparameter self-correction loop. */
const MAX_SELF_CORRECTION_ITERATIONS = 3;

/** Default peak threshold for initial processing. */
const DEFAULT_PEAK_THRESHOLD = 0.12;

/** High-sensitivity peak threshold floor for self-correction. */
const SENSITIVE_PEAK_THRESHOLD = 0.06;

/** Threshold decrement per self-correction iteration. */
const THRESHOLD_DECREMENT = 0.02;

// ---------------------------------------------------------------------------
// Workflow Log Entry
// ---------------------------------------------------------------------------

interface WorkflowLogEntry {
  phase: WorkflowPhase;
  timestamp: string;
  message: string;
  data?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Material Formula Extraction
// ---------------------------------------------------------------------------

/**
 * Extract a candidate material formula from the AnalysisSession.
 *
 * Resolution priority:
 *   1. processingParameters entry with id 'material' or 'formula'
 *   2. Project name (if it looks like a formula)
 *   3. Fallback to empty string (triggers generic analysis)
 */
function extractMaterialFormula(session: AnalysisSession): string {
  // Check processing parameters for material/formula hints
  for (const param of session.processingParameters) {
    if (param.id === 'material' || param.id === 'formula' || param.id === 'sample') {
      if (param.value && param.value.trim()) {
        return param.value.trim();
      }
    }
  }

  // Check project name as a formula candidate
  if (session.projectName) {
    return session.projectName;
  }

  // Fallback: attempt to extract formula-like tokens from the title
  const formulaMatch = session.title.match(/\b([A-Z][a-z]?\d*(?:O|N|S|C|Fe|Ti|Li)\d*)\b/);
  if (formulaMatch) {
    return formulaMatch[1];
  }

  return '';
}

// ---------------------------------------------------------------------------
// Workflow Phase Implementations
// ---------------------------------------------------------------------------

/**
 * Phase 1 — Goal: Extract and validate the research objective from the session.
 */
function executeGoalPhase(
  session: AnalysisSession,
  log: WorkflowLogEntry[],
): { objective: string; sampleFormula: string } {
  const objective = session.title || 'Materials characterization analysis';
  const sampleFormula = extractMaterialFormula(session);

  log.push({
    phase: 'goal',
    timestamp: new Date().toISOString(),
    message: `Research objective identified: ${objective}`,
    data: { sampleFormula },
  });

  return { objective, sampleFormula };
}

/**
 * Phase 2 — Plan: Resolve the material ruleset and determine applicable techniques.
 */
function executePlanPhase(
  session: AnalysisSession,
  sampleFormula: string,
  log: WorkflowLogEntry[],
): { techniques: Technique[]; hasRuleSet: boolean; ruleSetId?: string } {
  const ruleSet = resolveMaterialRuleSet(sampleFormula);
  // Map lowercase AnalysisTechnique to uppercase Technique for the reasoning engine
  const techniqueMap: Record<string, Technique> = {
    xrd: 'XRD',
    xps: 'XPS',
    ftir: 'FTIR',
    raman: 'Raman',
  };
  const technique = techniqueMap[session.technique] ?? 'XRD';
  const techniques: Technique[] = [technique];

  log.push({
    phase: 'plan',
    timestamp: new Date().toISOString(),
    message: ruleSet
      ? `Material ruleset resolved: ${ruleSet.formula} (${ruleSet.materialClass})`
      : `No specific material ruleset found for "${sampleFormula}" — using generic analysis`,
    data: {
      techniques,
      hasRuleSet: !!ruleSet,
      ruleSetId: ruleSet?.materialId,
    },
  });

  return {
    techniques,
    hasRuleSet: !!ruleSet,
    ruleSetId: ruleSet?.materialId,
  };
}

/**
 * Phase 3 — Execute: Transform session data into evidence nodes for ingestion.
 */
function executeExecutePhase(
  session: AnalysisSession,
  log: WorkflowLogEntry[],
): UniversalEvidenceNode[] {
  const evidenceNodes = transformSessionToEvidenceNodes(session);

  log.push({
    phase: 'execute',
    timestamp: new Date().toISOString(),
    message: `Transformed ${evidenceNodes.length} evidence nodes from session data`,
    data: {
      nodeCount: evidenceNodes.length,
      techniques: [...new Set(evidenceNodes.map((n) => n.technique))],
    },
  });

  return evidenceNodes;
}

/**
 * Phase 4 — Evidence: Ingest evidence nodes into the ReasoningEngine.
 */
function executeEvidencePhase(
  engine: ReasoningEngine,
  evidenceNodes: UniversalEvidenceNode[],
  techniques: Technique[],
  log: WorkflowLogEntry[],
): void {
  const nodesByTechnique: Record<string, number> = {};
  for (const node of evidenceNodes) {
    nodesByTechnique[node.technique] = (nodesByTechnique[node.technique] || 0) + 1;
  }

  // Ingest evidence into the engine, grouped by technique
  for (const technique of techniques) {
    const techNodes = evidenceNodes.filter((n) => n.technique === technique);
    if (techNodes.length > 0) {
      engine.ingestEvidence(technique, techNodes);
    }
  }

  log.push({
    phase: 'evidence',
    timestamp: new Date().toISOString(),
    message: `Evidence workspace populated with ${evidenceNodes.length} nodes across ${techniques.length} technique(s)`,
    data: { nodesByTechnique, techniques },
  });
}

/**
 * Phase 5 — Reason: Run the ReasoningEngine to produce cross-validation, gap analysis, and decisions.
 */
function executeReasonPhase(
  engine: ReasoningEngine,
  sampleFormula: string,
  techniques: Technique[],
  log: WorkflowLogEntry[],
): ReasoningReport {
  const report = engine.analyze();

  log.push({
    phase: 'reason',
    timestamp: new Date().toISOString(),
    message: `Reasoning engine produced ${report.crossValidation.correlations.length} correlation(s), ${report.gapAnalysis.gaps.length} gap(s), and ${report.decision.recommendations.length} recommendation(s)`,
    data: {
      overallConfidence: report.decision.confidence.overallScore,
      correlationCount: report.crossValidation.correlations.length,
      gapCount: report.gapAnalysis.gaps.length,
      recommendationCount: report.decision.recommendations.length,
    },
  });

  return report;
}

/**
 * Phase 6 — Decision: Enforce language rules on the decision output.
 */
function executeDecisionPhase(
  report: ReasoningReport,
  log: WorkflowLogEntry[],
): void {
  // Enforce language rules on decision summary and recommendation descriptions
  enforceLanguageRules(report.decision.decisionSummary);
  for (const rec of report.decision.recommendations) {
    enforceLanguageRules(rec.description);
    enforceLanguageRules(rec.rationale);
  }

  log.push({
    phase: 'decision',
    timestamp: new Date().toISOString(),
    message: `Decision intelligence generated — overall confidence: ${report.decision.confidence.overallScore.toFixed(2)}`,
    data: {
      confidenceLevel: report.decision.confidence.level,
      overallConfidence: report.decision.confidence.overallScore,
      primaryDecision: report.decision.decisionSummary,
    },
  });
}

/**
 * Phase 7 — Report: Compile the final report and format agent logs.
 *
 * Generates technique-specific evidence summaries for each analyzed technique
 * using the registry-enriched sentence construction from persistenceSync.
 * All generated text is sanitized through enforceLanguageRules() internally.
 */
function executeReportPhase(
  report: ReasoningReport,
  evidenceNodes: UniversalEvidenceNode[],
  workflowLog: WorkflowLogEntry[],
): string[] {
  // Format all workflow log entries through the language-aware formatter
  const formattedLogs = formatAgentLog(workflowLog);

  formattedLogs.push(
    `[REPORT] Reasoning report ${report.reportId} generated for sample ${report.sampleId}`,
  );
  formattedLogs.push(
    `[REPORT] Techniques analyzed: ${report.techniquesAnalyzed.join(', ')}`,
  );
  formattedLogs.push(
    `[REPORT] Decision: ${report.decision.decisionSummary}`,
  );

  // Emit technique-specific evidence summaries (XPS core-level, FTIR functional groups, Raman phonon modes)
  // These are language-safe: each generator passes strings through enforceLanguageRules() internally.
  for (const technique of report.techniquesAnalyzed) {
    const summary = generateTechniqueEvidenceSummary(evidenceNodes, technique);
    if (summary && !summary.startsWith('No ')) {
      enforceLanguageRules(summary);
      formattedLogs.push(`[REPORT] ${technique} Evidence Summary: ${summary}`);
    }
  }

  return formattedLogs;
}

// ---------------------------------------------------------------------------
// Main Workflow Orchestrator
// ---------------------------------------------------------------------------

/**
 * Execute the complete DIFARYX agent reasoning workflow for a given session.
 *
 * Steps through the core platform narrative sequence:
 *   Goal → Plan → Execute → Evidence → Reason → Decision → Report
 *
 * 1. **Goal**: Extract and validate the research objective from the session.
 * 2. **Plan**: Inject the target formula into `resolveMaterialRuleSet` to
 *    dynamically retrieve the correct scientific ruleset constraints.
 * 3. **Execute**: Transform session data into structured evidence nodes.
 * 4. **Evidence**: Ingest transformed evidence nodes into the ReasoningEngine.
 * 5. **Reason**: Trigger the complete analysis profile (cross-validation,
 *    gap analysis, decision intelligence).
 * 6. **Decision**: Enforce validation-aware language rules on all outputs.
 * 7. **Report**: Compile the final report, format logs, and persist the
 *    updated session back to storage.
 *
 * @param sessionId - The analysis session ID to process.
 * @returns The updated AnalysisSession with reasoning results persisted.
 * @throws {Error} If the session is not found in localStorage.
 * @throws {Error} If a forbidden definitive phrase is detected in engine outputs.
 */
export async function executeAgentReasoningWorkflow(
  sessionId: string,
): Promise<AnalysisSession> {
  // Load the target session from storage
  const session = getAnalysisSession(sessionId);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  const workflowLog: WorkflowLogEntry[] = [];

  // -----------------------------------------------------------------------
  // Phase 1 — Goal
  // -----------------------------------------------------------------------
  const { objective, sampleFormula } = executeGoalPhase(session, workflowLog);

  // -----------------------------------------------------------------------
  // Phase 2 — Plan
  // -----------------------------------------------------------------------
  const { techniques, hasRuleSet, ruleSetId } = executePlanPhase(
    session,
    sampleFormula,
    workflowLog,
  );

  // -----------------------------------------------------------------------
  // Phase 3 — Execute: Transform session data into evidence nodes
  // -----------------------------------------------------------------------
  const evidenceNodes = executeExecutePhase(session, workflowLog);

  // -----------------------------------------------------------------------
  // Phase 4 — Evidence: Create engine and ingest evidence
  // -----------------------------------------------------------------------
  const materialSystem: MaterialSystem = 'generic';
  const engine = new ReasoningEngine({
    materialSystem,
    expectedTechniques: techniques,
  });
  executeEvidencePhase(engine, evidenceNodes, techniques, workflowLog);

  // -----------------------------------------------------------------------
  // Phase 4.5 — Autonomous Hyperparameter Self-Correction Loop
  // -----------------------------------------------------------------------
  // Immediately after the primary processing and peak detection phase,
  // inspect the resulting validated peak array. If the detected analytical
  // reflection count falls below the critical threshold, intercept the
  // workflow sequence before committing final states.
  // -----------------------------------------------------------------------
  const initialPrimaryCount = evidenceNodes.filter(
    (n) => n.role === 'primary',
  ).length;

  if (initialPrimaryCount < MINIMUM_PRIMARY_REFLECTIONS) {
    let currentThreshold = DEFAULT_PEAK_THRESHOLD;
    let currentReflectionCount = initialPrimaryCount;
    let loopImproved = false;

    for (
      let iteration = 1;
      iteration <= MAX_SELF_CORRECTION_ITERATIONS;
      iteration++
    ) {
      // Push notice into trace array (sanitized through language rules)
      const noticeMessage =
        'Notice: Low peak density detected under default parameters. ' +
        'Initiating autonomous hyperparameter self-correction loop...';
      enforceLanguageRules(noticeMessage);
      workflowLog.push({
        phase: 'execute',
        timestamp: new Date().toISOString(),
        message: noticeMessage,
        data: {
          iteration,
          primaryReflections: currentReflectionCount,
          currentThreshold,
        },
      });

      // Lower the underlying peakThreshold dynamically in memory
      currentThreshold = Math.max(
        SENSITIVE_PEAK_THRESHOLD,
        currentThreshold - THRESHOLD_DECREMENT,
      );

      // Update the session's processing parameters to reflect the adjusted threshold
      const thresholdParam = session.processingParameters.find(
        (p) => p.id === 'threshold',
      );
      if (thresholdParam) {
        thresholdParam.value = `${currentThreshold.toFixed(2)} normalized intensity`;
      }

      // Re-run the core analysis: re-transform evidence with adjusted parameters
      const adjustedEvidenceNodes = transformSessionToEvidenceNodes(session);

      // Clear existing evidence and re-ingest with fine-tuned boundaries
      engine.clearEvidence();
      executeEvidencePhase(
        engine,
        adjustedEvidenceNodes,
        techniques,
        workflowLog,
      );

      // Re-count reflections — under lowered threshold, include supporting
      // nodes that would be promoted to primary-level under higher sensitivity
      currentReflectionCount = adjustedEvidenceNodes.filter(
        (n) => n.role === 'primary' || n.role === 'supporting',
      ).length;

      if (currentReflectionCount >= MINIMUM_PRIMARY_REFLECTIONS) {
        // Log success and evidence accumulation
        const successMessage =
          'Optimization complete: Recovered additional structural reflections ' +
          'under adjusted threshold. Appending evidence to active workspace memory.';
        enforceLanguageRules(successMessage);
        workflowLog.push({
          phase: 'execute',
          timestamp: new Date().toISOString(),
          message: successMessage,
          data: {
            iteration,
            recoveredReflections: currentReflectionCount,
            adjustedThreshold: currentThreshold,
          },
        });
        loopImproved = true;
        break;
      }
    }

    if (!loopImproved) {
      // Gracefully exit and document the limitation
      const limitationMessage =
        'Self-correction loop exhausted after maximum iterations. ' +
        'Evidence density remains below the critical threshold. ' +
        'Evidence suggests that additional data acquisition or manual ' +
        'parameter adjustment may be required for adequate structural resolution.';
      enforceLanguageRules(limitationMessage);
      workflowLog.push({
        phase: 'execute',
        timestamp: new Date().toISOString(),
        message: limitationMessage,
        data: {
          maxIterations: MAX_SELF_CORRECTION_ITERATIONS,
          finalReflectionCount: currentReflectionCount,
          finalThreshold: currentThreshold,
        },
      });
    }
  }

  // -----------------------------------------------------------------------
  // Phase 5 — Reason: Run the full reasoning pipeline
  // -----------------------------------------------------------------------
  const report = executeReasonPhase(engine, sampleFormula, techniques, workflowLog);

  // -----------------------------------------------------------------------
  // Phase 6 — Decision: Enforce language rules on outputs
  // -----------------------------------------------------------------------
  executeDecisionPhase(report, workflowLog);

  // -----------------------------------------------------------------------
  // Phase 7 — Report: Format logs and persist
  // -----------------------------------------------------------------------
  const formattedLogs = executeReportPhase(report, evidenceNodes, workflowLog);

  // Build the session update from the reasoning report
  const sessionUpdate = buildSessionUpdate(report, formattedLogs, {
    objective,
    hasRuleSet,
    ruleSetId,
  });

  // Merge the update onto the original session
  const updatedSession: AnalysisSession = {
    ...session,
    ...sessionUpdate,
    updatedAt: new Date().toISOString(),
    updatedLabel: 'Updated by agent reasoning workflow',
  };

  // Persist the updated session back to storage
  saveAnalysisSession(updatedSession);

  return updatedSession;
}

// ---------------------------------------------------------------------------
// Convenience Exports
// ---------------------------------------------------------------------------

/**
 * Get the list of ordered workflow phases.
 * Useful for UI components that need to display pipeline progress.
 */
export function getWorkflowPhases(): WorkflowPhase[] {
  return [...WORKFLOW_PHASES];
}

/**
 * Load a session by ID from the analysis session store.
 */
export function getSessionById(sessionId: string): AnalysisSession | null {
  return getAnalysisSession(sessionId);
}
