/**
 * Reasoning Engine — Public API
 *
 * Re-exports the ReasoningEngine class and all related types for
 * cross-technique scientific reasoning, gap analysis, and decision intelligence.
 *
 * @module reasoningEngine
 */

// Main orchestrator class
export { ReasoningEngine } from './reasoningEngine';

// Sub-module functions (for advanced/standalone use)
export { runCrossValidation } from './crossValidation';
export { runGapAnalysis } from './gapAnalysis';
export { generateDecision, generateNextSteps } from './decisionIntelligence';

// Knowledge base
export {
  CROSS_VALIDATION_RULES,
  TIO2_RECOMMENDATIONS,
  ANATASE_PHASE,
  RUTILE_PHASE,
  ANATASE_XRD,
  RUTILE_XRD,
  ANATASE_RAMAN,
  RUTILE_RAMAN,
  TIO2_RAMAN_OVERLAP_ZONE,
  TI4_PLUS_XPS,
  TI3_PLUS_XPS,
  ANATASE_FTIR,
  RUTILE_FTIR,
  getTiO2XrdPhase,
  getTiO2RamanPhase,
  getTiO2FtirPhase,
  getRulesForMaterial,
} from './knowledgeBase';

// Knowledge base types
export type {
  XrdPeakReference,
  XrdPhaseReference,
  RamanModeReference,
  RamanPhaseReference,
  XpsPeakReference,
  XpsMaterialReference,
  FtirBandReference,
  FtirMaterialReference,
  CrossValidationRule,
} from './knowledgeBase';

// Backend pipeline — Agent workflow orchestrator
export {
  executeAgentReasoningWorkflow,
  getWorkflowPhases,
  getSessionById,
} from './agentHandler';

// Backend pipeline — Data transformer
export { transformSessionToEvidenceNodes } from './transformer';

// Backend pipeline — Workspace sync & persistence layer
export {
  formatAgentLog,
  enforceLanguageRules,
  buildSessionUpdate,
  FORBIDDEN_PHRASES,
  generateXpsEvidenceSummary,
  generateFtirEvidenceSummary,
  generateRamanEvidenceSummary,
  generateTechniqueEvidenceSummary,
} from './persistenceSync';

// Type exports
export type {
  // Material system
  MaterialSystem,
  CrystalPhase,

  // Evidence bundle
  TechniqueEvidenceBundle,

  // Cross-validation
  TechniquePair,
  CorrelationStatus,
  CorrelationResult,
  CrossValidationReport,

  // Gap analysis
  GapSeverity,
  GapCategory,
  ValidationGap,
  GapAnalysisReport,

  // Decision intelligence
  ResearchConfidenceLevel,
  ClaimConfidence,
  ConfidenceScore,
  NextStepType,
  NextStepRecommendation,
  DecisionReport,

  // Full report
  ReasoningReport,

  // Configuration
  ReasoningEngineOptions,
} from './types';

