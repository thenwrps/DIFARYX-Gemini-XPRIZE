/**
 * Reasoning Engine — Main Orchestrator
 *
 * Orchestrates the full reasoning pipeline:
 *   Stage 4: Cross-Validation
 *   Stage 5: Gap Analysis
 *   Stage 6: Decision Intelligence
 *
 * Ingests evidence bundles from multiple techniques and produces
 * a complete ReasoningReport.
 *
 * @module reasoningEngine/reasoningEngine
 */

import type { Technique } from '../../types/universalTechnique';
import type { UniversalEvidenceNode } from '../../types/universalEvidence';
import type {
  TechniqueEvidenceBundle,
  CrossValidationReport,
  GapAnalysisReport,
  DecisionReport,
  ReasoningReport,
  ReasoningEngineOptions,
  MaterialSystem,
} from './types';
import type { MaterialRuleSet } from './knowledgeBase/index';
import { resolveMaterialRuleSet, getAllMaterialIds, getAllRuleSets } from './knowledgeBase/index';
import { runCrossValidation } from './crossValidation';
import { runGapAnalysis } from './gapAnalysis';
import { generateDecision } from './decisionIntelligence';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _reportCounter = 0;

function generateReportId(): string {
  _reportCounter++;
  return `REASONING-${Date.now()}-${String(_reportCounter).padStart(4, '0')}`;
}

function now(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// ReasoningEngine Class
// ---------------------------------------------------------------------------

/**
 * The ReasoningEngine orchestrates cross-technique scientific reasoning.
 *
 * Usage:
 * ```ts
 * const engine = new ReasoningEngine({ materialSystem: 'TiO2' });
 *
 * // Ingest evidence from each technique
 * engine.ingestEvidence('XRD', xrdNodes);
 * engine.ingestEvidence('XPS', xpsNodes);
 * engine.ingestEvidence('FTIR', ftirNodes);
 * engine.ingestEvidence('Raman', ramanNodes);
 *
 * // Run the full pipeline
 * const report = engine.analyze();
 * console.log(report.decision.confidence.overallScore); // 0.0–1.0
 * console.log(report.decision.recommendations);          // next steps
 * ```
 */
export class ReasoningEngine {
  private options: Required<ReasoningEngineOptions>;
  private evidenceByTechnique: Partial<Record<Technique, UniversalEvidenceNode[]>> = {};
  private sampleId: string;

  constructor(options: ReasoningEngineOptions = {}) {
    this.options = {
      materialSystem: options.materialSystem ?? 'TiO2',
      highConfidenceThreshold: options.highConfidenceThreshold ?? 0.85,
      mediumConfidenceThreshold: options.mediumConfidenceThreshold ?? 0.65,
      lowConfidenceThreshold: options.lowConfidenceThreshold ?? 0.40,
      maxRecommendations: options.maxRecommendations ?? 5,
      expectedTechniques: options.expectedTechniques ?? ['XRD', 'XPS', 'FTIR', 'Raman'],
      ruleWeights: options.ruleWeights ?? {},
    };
    this.sampleId = `SAMPLE-${Date.now()}`;
  }

  // -------------------------------------------------------------------------
  // Evidence Ingestion
  // -------------------------------------------------------------------------

  /**
   * Set or replace the sample identifier for subsequent analyses.
   */
  setSampleId(sampleId: string): void {
    this.sampleId = sampleId;
  }

  /**
   * Ingest evidence nodes from a single technique.
   * Replaces any previously ingested evidence for that technique.
   */
  ingestEvidence(technique: Technique, nodes: UniversalEvidenceNode[]): void {
    this.evidenceByTechnique[technique] = [...nodes];
  }

  /**
   * Bulk-ingest evidence from all techniques at once.
   */
  ingestAllEvidence(evidence: Partial<Record<Technique, UniversalEvidenceNode[]>>): void {
    for (const [tech, nodes] of Object.entries(evidence)) {
      if (nodes && nodes.length > 0) {
        this.evidenceByTechnique[tech as Technique] = [...nodes];
      }
    }
  }

  /**
   * Clear all ingested evidence.
   */
  clearEvidence(): void {
    this.evidenceByTechnique = {};
  }

  /**
   * Get the list of techniques that have evidence.
   */
  getAvailableTechniques(): Technique[] {
    return Object.keys(this.evidenceByTechnique).filter(
      (k) => (this.evidenceByTechnique[k as Technique]?.length ?? 0) > 0,
    ) as Technique[];
  }

  /**
   * Get the number of evidence nodes for a specific technique.
   */
  getEvidenceCount(technique: Technique): number {
    return this.evidenceByTechnique[technique]?.length ?? 0;
  }

  // -------------------------------------------------------------------------
  // Pipeline Execution
  // -------------------------------------------------------------------------

  /**
   * Build the evidence bundle from currently ingested data.
   */
  private buildBundle(): TechniqueEvidenceBundle {
    return {
      sampleId: this.sampleId,
      materialSystem: this.options.materialSystem,
      evidenceByTechnique: { ...this.evidenceByTechnique },
      assembledAt: now(),
    };
  }

  /**
   * Run the full reasoning pipeline: Stage 4 → Stage 5 → Stage 6.
   *
   * @returns A complete ReasoningReport.
   */
  analyze(): ReasoningReport {
    const bundle = this.buildBundle();
    const materialSystem = this.options.materialSystem;

    // Stage 4: Cross-Validation
    const crossValidation: CrossValidationReport = runCrossValidation(bundle, materialSystem);

    // Stage 5: Gap Analysis
    const gapAnalysis: GapAnalysisReport = runGapAnalysis(
      crossValidation,
      bundle,
      this.options.expectedTechniques,
    );

    // Stage 6: Decision Intelligence
    const decision: DecisionReport = generateDecision(
      crossValidation,
      gapAnalysis,
      bundle,
      materialSystem,
      this.options.maxRecommendations,
    );

    return {
      reportId: generateReportId(),
      sampleId: this.sampleId,
      materialSystem,
      techniquesAnalyzed: this.getAvailableTechniques(),
      crossValidation,
      gapAnalysis,
      decision,
      generatedAt: now(),
      engineVersion: '1.0.0',
    };
  }

  /**
   * Run only Stage 4 (Cross-Validation) without gap analysis or decision.
   */
  analyzeCrossValidationOnly(): CrossValidationReport {
    const bundle = this.buildBundle();
    return runCrossValidation(bundle, this.options.materialSystem);
  }

  /**
   * Run Stages 4+5 (Cross-Validation + Gap Analysis) without decision.
   */
  analyzeWithGaps(): { crossValidation: CrossValidationReport; gapAnalysis: GapAnalysisReport } {
    const bundle = this.buildBundle();
    const crossValidation = runCrossValidation(bundle, this.options.materialSystem);
    const gapAnalysis = runGapAnalysis(
      crossValidation,
      bundle,
      this.options.expectedTechniques,
    );
    return { crossValidation, gapAnalysis };
  }
}