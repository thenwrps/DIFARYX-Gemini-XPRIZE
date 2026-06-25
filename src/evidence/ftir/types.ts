/**
 * FTIR Evidence Contract
 *
 * Architecture: Evidence → Reasoning → Validation Gap → Decision
 * FTIR is a DEMONSTRATION evidence source for the DIFARYX workflow.
 * This module is consumed by reasoning, notebook, report, and future
 * multi-technique fusion layers.
 *
 * Scope (P0.1, intentionally minimal):
 *   1. FtirSignalUnit / FtirSignalDescriptor   — input contract only
 *   2. FtirEvidence                            — DIFARYX-native evidence bundle
 *   3. detectFtirSignalUnit()                  — deterministic unit detection
 *
 * Reused contracts (do NOT redefine):
 *   - UniversalEvidenceNode (src/types/universalEvidence.ts)
 *   - ValidationGap          (src/engines/reasoningEngine/types.ts)
 *   - EvidenceProvenance     (src/types/universalEvidence.ts)
 *   - ConfidenceLevel        (src/types/universalEvidence.ts)
 *   - SignalQuality          (src/types/universalEvidence.ts)
 *   - Technique              (src/types/universalTechnique.ts)
 *
 * Out of scope for P0.1 (deferred):
 *   - FTIR processing logic (runner.ts, agent internals)
 *   - Adapter from FtirProcessingResult to FtirEvidence
 *   - Notebook / Report / Fusion rendering
 *   - UI / pipeline visualization
 *   - Agent reasoning implementation
 *
 * Invariants:
 *   - FtirEvidence is JSON-serializable (no functions, no class instances).
 *   - All timestamps are ISO 8601 strings.
 *   - All confidence scores are [0, 1].
 *   - All wavenumber values are in cm⁻¹.
 *
 * @module evidence/ftir
 */

import type {
  UniversalEvidenceNode,
  EvidenceProvenance,
  ConfidenceLevel,
  SignalQuality,
} from '../../types/universalEvidence';
import type { Technique } from '../../types/universalTechnique';
import type { ValidationGap } from '../../engines/reasoningEngine/types';

// ---------------------------------------------------------------------------
// 1. Input contract — transmittance / absorbance
// ---------------------------------------------------------------------------

/**
 * Physical unit of the y-axis of a raw FTIR signal.
 *
 * - `transmittance`  : 0–100 (%) downward bands. Standard export from most
 *                      commercial FTIR software.
 * - `absorbance`     : 0–~1.5 (a.u.) upward bands. Used after baseline
 *                      correction or when A = -log10(T/100) is applied.
 * - `unknown`        : Cannot be determined from signal shape or headers.
 *                      Downstream must NOT extract bands from unknown signals.
 */
export type FtirSignalUnit = 'transmittance' | 'absorbance' | 'unknown';

/**
 * How the unit was determined. Records provenance for audit trails.
 */
export type FtirUnitDetectionSource =
  | 'inferred_from_range'
  | 'user_declared'
  | 'header_label'
  | 'default_absorbance';

/**
 * Descriptor of a raw FTIR signal input. Holds INPUT-level facts only
 * (no interpretation, no evidence claims, no validation).
 *
 * Use this to:
 *   - Auto-detect unit on upload
 *   - Drive band-search direction (minima for transmittance, maxima for absorbance)
 *   - Surface signal quality warnings before processing
 */
export interface FtirSignalDescriptor {
  /** Detected physical unit. */
  unit: FtirSignalUnit;

  /** [min, max] wavenumber covered by the raw signal, in cm⁻¹. */
  wavenumberRange: [number, number];

  /** Number of raw (x, y) data points. */
  pointCount: number;

  /** How the unit was determined. */
  unitDetection: FtirUnitDetectionSource;

  /** Confidence in the unit detection, [0, 1]. */
  unitDetectionConfidence: number;

  /** Overall quality of the raw signal before processing. */
  rawQuality: SignalQuality;

  /**
   * Wavenumber axis orientation.
   * FTIR convention is high→low (e.g., 4000 → 400 cm⁻¹) so that
   * characteristic groups (O–H, C–H) appear on the left of the plot.
   */
  axisReversed: boolean;
}

// ---------------------------------------------------------------------------
// 2. Unit detection — deterministic, pure function
// ---------------------------------------------------------------------------

/**
 * Minimal raw point required for unit detection.
 * Accepts either the engine's `FtirPoint` or any {x, y} record so this
 * function can be reused by both demo and upload code paths.
 */
export interface FtirRawPoint {
  x: number; // wavenumber (cm⁻¹)
  y: number; // intensity
}

/**
 * Result of unit auto-detection.
 */
export interface FtirUnitDetectionResult {
  unit: FtirSignalUnit;
  source: FtirUnitDetectionSource;
  confidence: number; // [0, 1]
  /**
   * The empirical statistics that drove the decision.
   * Preserved for audit trails and UI explanations.
   */
  statistics: {
    yMin: number;
    yMax: number;
    yMean: number;
    yStd: number;
  };
}

/**
 * Auto-detect whether a raw FTIR signal is transmittance or absorbance.
 *
 * Heuristic (deterministic, no LLM):
 *   - y values in [0, 100]    → transmittance
 *   - y values in [0, ~1.5]   → absorbance
 *   - anything else            → unknown (caller must not extract bands)
 *
 * @param points   Raw (wavenumber, intensity) data points.
 * @param hint     Optional explicit hint from the user or file header.
 *                 When provided, takes priority over range-based inference.
 * @returns        Detection result with statistics and confidence.
 */
export function detectFtirSignalUnit(
  points: ReadonlyArray<FtirRawPoint>,
  hint?: { label?: string; declaredUnit?: FtirSignalUnit },
): FtirUnitDetectionResult {
  if (points.length === 0) {
    return {
      unit: 'unknown',
      source: 'inferred_from_range',
      confidence: 0,
      statistics: { yMin: 0, yMax: 0, yMean: 0, yStd: 0 },
    };
  }

  // 1. Honor explicit declaration (highest confidence)
  if (hint?.declaredUnit && hint.declaredUnit !== 'unknown') {
    return {
      unit: hint.declaredUnit,
      source: 'user_declared',
      confidence: 1.0,
      statistics: summarize(points),
    };
  }

  // 2. Honor header label (high confidence, regex-based)
  if (hint?.label) {
    const label = hint.label.toLowerCase();
    if (label.includes('transmittance') || /\b%\b/.test(label) || label.includes('%t')) {
      return {
        unit: 'transmittance',
        source: 'header_label',
        confidence: 0.95,
        statistics: summarize(points),
      };
    }
    if (label.includes('absorbance') || label.includes('a.u.') || label.includes('a\\.u\\.')) {
      return {
        unit: 'absorbance',
        source: 'header_label',
        confidence: 0.95,
        statistics: summarize(points),
      };
    }
  }

  // 3. Range-based inference (lower confidence, but deterministic)
  const stats = summarize(points);
  const { yMin, yMax, yMean } = stats;

  if (yMin >= 0 && yMax <= 100.5 && yMean > 30) {
    return {
      unit: 'transmittance',
      source: 'inferred_from_range',
      confidence: 0.75,
      statistics: stats,
    };
  }

  if (yMin >= 0 && yMax <= 2.0 && yMean < 2.0) {
    return {
      unit: 'absorbance',
      source: 'inferred_from_range',
      confidence: 0.70,
      statistics: stats,
    };
  }

  return {
    unit: 'unknown',
    source: 'inferred_from_range',
    confidence: 0.0,
    statistics: stats,
  };
}

/**
 * Compute basic descriptive statistics for unit detection and quality checks.
 * Exposed for testing only — downstream code MUST go through
 * `detectFtirSignalUnit` to get a `FtirUnitDetectionResult`.
 */
export function summarize(points: ReadonlyArray<FtirRawPoint>): {
  yMin: number;
  yMax: number;
  yMean: number;
  yStd: number;
} {
  let yMin = Infinity;
  let yMax = -Infinity;
  let sum = 0;
  let validCount = 0;
  for (const p of points) {
    if (!Number.isFinite(p.y)) continue;
    if (p.y < yMin) yMin = p.y;
    if (p.y > yMax) yMax = p.y;
    sum += p.y;
    validCount += 1;
  }
  const yMean = validCount > 0 ? sum / validCount : 0;
  let sqSum = 0;
  for (const p of points) {
    if (!Number.isFinite(p.y)) continue;
    sqSum += (p.y - yMean) ** 2;
  }
  const yStd = validCount > 0 ? Math.sqrt(sqSum / validCount) : 0;
  return {
    yMin: Number.isFinite(yMin) ? yMin : 0,
    yMax: Number.isFinite(yMax) ? yMax : 0,
    yMean,
    yStd,
  };
}

// ---------------------------------------------------------------------------
// 3. FtirEvidence — DIFARYX-native evidence bundle
// ---------------------------------------------------------------------------

/**
 * DIFARYX-native FTIR evidence bundle.
 *
 * Consumed by:
 *   - Reasoning Engine  (gap analysis, cross-validation)
 *   - Notebook          (scientific memory entry)
 *   - Report Builder    (evidence section, validation gap section)
 *   - Fusion Engine     (multi-technique correlation)
 *   - Next-Experiment   (recommended action)
 *
 * Design rules (DIFARYX):
 *   - Evidence precedes interpretation.
 *   - Bands and functional groups are `UniversalEvidenceNode`s, not free text.
 *   - Validation gaps are first-class and use the engine's `ValidationGap`
 *     schema (no FTIR-specific gap format).
 *   - Confidence uses `ConfidenceLevel` vocabulary.
 *   - All claims must be traceable to provenance.
 *
 * Structural contract:
 *   - JSON-serializable.
 *   - `bands` are ordered by wavenumber (descending — FTIR convention).
 *   - `functionalGroups` are ordered by confidence score (descending).
 *   - `validationGaps` are ordered by severity (critical first).
 *   - `caveats` use evidence-first language
 *     ("evidence supports", "consistent with", "may indicate").
 *     They MUST NOT use "proves", "confirms", "guarantees".
 */
export interface FtirEvidence {
  /** Stable unique identifier for this evidence bundle. */
  evidenceId: string;

  /** Technique tag — fixed to 'FTIR'. */
  technique: 'FTIR';

  /** ISO 8601 timestamp when this bundle was assembled. */
  assembledAt: string;

  /**
   * Detected band evidence. Each node is a `UniversalEvidenceNode` whose
   * `techniqueMetadata` conforms to `FtirEvidenceMetadata`. Downstream
   * consumers (fusion, notebook) can read these nodes without knowing
   * anything FTIR-specific.
   */
  bands: UniversalEvidenceNode[];

  /**
   * Functional-group evidence. Same shape as `bands` but with the
   * `concept` field set to a functional-group vocabulary
   * (e.g., 'hydroxyl', 'carbonyl', 'metal_oxygen').
   */
  functionalGroups: UniversalEvidenceNode[];

  /** Input descriptor for the raw signal (unit, range, quality). */
  signal: FtirSignalDescriptor;

  /**
   * Confidence summary, broken down per functional group.
   * Reuses `ConfidenceLevel` vocabulary.
   */
  confidence: {
    overall: ConfidenceLevel;
    /** Overall confidence score [0, 1]. */
    overallScore: number;
    /** Per-group confidence scores, keyed by functional-group name. */
    byGroup: Record<string, number>;
    /** Short, human-readable reasons for the overall level. */
    reasons: string[];
  };

  /**
   * First-class validation gaps for this FTIR evidence.
   * Reuses the engine's `ValidationGap` schema. FTIR-specific gaps
   * (e.g., carbonate/carboxylate ambiguity) use the `ambiguity` category;
   * FTIR quality issues use `data_quality`; missing evidence for bulk
   * properties uses `missing_technique`.
   */
  validationGaps: ValidationGap[];

  /** Provenance of the underlying raw dataset and processing run. */
  provenance: EvidenceProvenance;

  /**
   * Evidence-first caveats, free-form but constrained in language.
   * Examples (acceptable wording):
   *   - "Broad O–H band may include contributions from surface hydroxyl
   *      and adsorbed water"
   *   - "FTIR alone cannot distinguish carbonate from carboxylate in the
   *      1400–1650 cm⁻¹ region"
   * Forbidden wording: "proves", "confirms", "guarantees", "definitely is".
   */
  caveats: string[];
}

// ---------------------------------------------------------------------------
// 4. Constants — shared by downstream adapters and tests
// ---------------------------------------------------------------------------

/** Stable technique tag used across the platform. Re-exported for convenience. */
export const FTIR_TECHNIQUE: Technique = 'FTIR';

/** FTIR evidence schema version, bumped when breaking changes are introduced. */
export const FTIR_EVIDENCE_SCHEMA_VERSION = '0.1.0';

/**
 * Confidence band that triggers a "review" status (medium confidence).
 * Centralized so notebook and report renderers agree with the contract.
 */
export const FTIR_MEDIUM_CONFIDENCE_THRESHOLD = 0.6;

/**
 * Confidence band that triggers a "complete" status (high confidence).
 * Below this, downstream must surface validation gaps prominently.
 */
export const FTIR_HIGH_CONFIDENCE_THRESHOLD = 0.8;
