/**
 * FTIR Evidence Adapter — P0.2 (Contract-Focused)
 *
 * Maps `FtirProcessingResult` (produced by the FTIR processing agent) into
 * the DIFARYX-native `FtirEvidence` bundle so it can be consumed by the
 * reasoning, notebook, report, and fusion layers.
 *
 * Architecture rule (P0.2):
 *   The adapter is a TRANSPORT-ONLY boundary. It does NOT generate:
 *     - ValidationGap objects
 *     - scientific claims
 *     - recommendations
 *     - functional group assignments (those are the reasoning layer's job)
 *     - caveats
 *     - confidence.overall scoring
 *
 *   The reasoning layer is responsible for filling `functionalGroups`,
 *   `validationGaps`, `confidence`, and `caveats`. The adapter only preserves
 *   raw observational evidence (bands + signal metadata + provenance).
 *
 * Contract:
 *   - Pure function, no side effects, deterministic when `assembledAt` and
 *     `evidenceId` are provided.
 *   - Reuses canonical contracts (UniversalEvidenceNode, EvidenceProvenance,
 *     SignalQuality, ConfidenceLevel).
 *   - Throws `FtirAdapterContractError` on contract violations.
 *
 * @module evidence/ftir/adapter
 */

import type { FtirProcessingResult, FtirDetectedBand } from '../../agents/ftirAgent/types';
import type {
  UniversalEvidenceNode,
  EvidenceProvenance,
  SignalQuality,
} from '../../types/universalEvidence';
import type {
  FtirEvidence,
  FtirSignalDescriptor,
  FtirRawPoint,
  FtirSignalUnit,
} from './types';
import {
  detectFtirSignalUnit,
  FTIR_EVIDENCE_SCHEMA_VERSION,
} from './types';

// ---------------------------------------------------------------------------
// Public input contract
// ---------------------------------------------------------------------------

/**
 * Input for the FTIR evidence adapter.
 *
 * Carries the processing result plus the raw input points needed for
 * signal unit detection. The reasoning layer's outputs (functional groups,
 * gaps, caveats) are NOT in scope here.
 */
export interface FtirAdapterInput {
  /** The processing result from `runFtirProcessing()` */
  processingResult: FtirProcessingResult;

  /** Original raw input points (used for signal unit auto-detection) */
  rawPoints: ReadonlyArray<FtirRawPoint>;

  /** Optional hint from file header label or user declaration */
  signalHint?: {
    label?: string;
    declaredUnit?: FtirSignalUnit;
  };

  /** Stable sample identifier (used for evidenceId and provenance.datasetId) */
  sampleId: string;

  /** Optional human-readable sample name (preserved into provenance) */
  sampleName?: string;

  /** ISO 8601 timestamp of dataset creation; defaults to current time */
  datasetCreatedAt?: string;

  /** Optional material class label (preserved into provenance) */
  materialClass?: string;

  /**
   * Engine version string. Defaults to `ftir-agent/<schemaVersion>`.
   * Preserved into provenance.engineVersion.
   */
  engineVersion?: string;

  /**
   * ISO 8601 timestamp of evidence assembly.
   * Injectable for deterministic tests; defaults to current time.
   */
  assembledAt?: string;

  /**
   * Stable evidence identifier. Injectable for deterministic tests;
   * defaults to a content-derived string.
   */
  evidenceId?: string;
}

// ---------------------------------------------------------------------------
// Contract error
// ---------------------------------------------------------------------------

/**
 * Thrown when the adapter input violates the contract.
 * The `field` attribute names the specific field that failed validation
 * so the reasoning/UI layers can surface a precise error.
 */
export class FtirAdapterContractError extends Error {
  public readonly field: string;

  constructor(message: string, field: string) {
    super(`FtirAdapterContractError [${field}]: ${message}`);
    this.name = 'FtirAdapterContractError';
    this.field = field;
  }
}

// ---------------------------------------------------------------------------
// Internal mapping helpers
// ---------------------------------------------------------------------------

/**
 * Map the FTIR agent's `narrow|medium|broad` classification to the
 * canonical `FtirEvidenceMetadata.bandType` vocabulary
 * (`sharp|broad|shoulder`).
 *
 * Mapping rationale:
 *   - `narrow`  → `sharp`   : peaks with FWHM < 50 cm⁻¹ are spectroscopically sharp
 *   - `medium`  → `shoulder`: medium-width bands often appear as shoulders in real spectra
 *   - `broad`   → `broad`   : direct match
 */
function mapBandClassification(
  classification: FtirDetectedBand['classification'],
): 'sharp' | 'broad' | 'shoulder' {
  if (classification === 'narrow') return 'sharp';
  if (classification === 'medium') return 'shoulder';
  return 'broad';
}

/**
 * Derive a coarse `SignalQuality` rating from raw signal statistics.
 *
 * Heuristic (deterministic, no LLM):
 *   - < 50 points                 → `insufficient`
 *   - very low std (< 0.01)       → `weak`     (essentially flat line)
 *   - low std on absorbance scale → `marginal`
 *   - high std (>= 50)            → `excellent` (noisy but real signal)
 *   - otherwise                   → `good`
 *
 * This is a SIGNAL-LEVEL rating only. It does NOT judge whether the
 * downstream processing produced meaningful bands.
 */
function rateRawSignal(
  pointCount: number,
  yStd: number,
  yMax: number,
): SignalQuality {
  if (pointCount < 50) return 'insufficient';
  if (yStd < 0.01) return 'weak';
  if (yMax < 2 && yStd < 0.1) return 'marginal';
  if (yStd >= 25) return 'excellent';
  return 'good';
}

// ---------------------------------------------------------------------------
// Public mapping functions
// ---------------------------------------------------------------------------

/**
 * Map a single `FtirDetectedBand` into a `UniversalEvidenceNode`.
 *
 * This is the SHAPE that downstream consumers (fusion, notebook, report)
 * read. The mapping is intentionally minimal:
 *   - `concept` and `confidence` are left undefined (set by reasoning)
 *   - `functionalGroup` in techniqueMetadata is left undefined (set by reasoning)
 *   - `vibrationalMode` is set to the agent's `assignment` if present
 *
 * @param band     Band produced by the FTIR processing agent.
 * @param index    Zero-based band index (used for deterministic node id).
 * @param provenance  Shared provenance object to embed in the node.
 * @returns        A `UniversalEvidenceNode` ready for downstream consumption.
 */
export function ftirBandToEvidenceNode(
  band: FtirDetectedBand,
  index: number,
  provenance: EvidenceProvenance,
): UniversalEvidenceNode {
  return {
    id: `ftir-band-${index + 1}`,
    technique: 'FTIR',
    primaryAxis: band.wavenumber,
    primaryAxisUnit: 'cm⁻¹',
    value: band.intensity,
    valueUnit: 'normalized_intensity',
    label:
      band.label
      ?? band.assignment
      ?? `Band at ${band.wavenumber.toFixed(1)} cm⁻¹`,
    // concept/confidence intentionally left undefined — reasoning layer
    concept: undefined,
    role: 'primary',
    confidence: undefined,
    techniqueMetadata: {
      vibrationalMode: band.assignment,
      // functionalGroup intentionally left undefined — reasoning layer
      functionalGroup: undefined,
      bandType: mapBandClassification(band.classification),
      intensityCategory:
        band.intensity > 0.5
          ? 'strong'
          : band.intensity > 0.2
            ? 'medium'
            : 'weak',
    },
    provenance,
  };
}

/**
 * Build a `FtirSignalDescriptor` from the raw input points + optional hint.
 *
 * @param rawPoints  Original raw (wavenumber, intensity) data points.
 * @param hint       Optional header label or user-declared unit.
 * @returns          Signal descriptor with auto-detected unit and quality.
 */
export function buildFtirSignalDescriptor(
  rawPoints: ReadonlyArray<FtirRawPoint>,
  hint?: { label?: string; declaredUnit?: FtirSignalUnit },
): FtirSignalDescriptor {
  const detection = detectFtirSignalUnit(rawPoints, hint);

  // Compute wavenumber range (ignoring non-finite values).
  let wnMin = Infinity;
  let wnMax = -Infinity;
  for (const p of rawPoints) {
    if (!Number.isFinite(p.x)) continue;
    if (p.x < wnMin) wnMin = p.x;
    if (p.x > wnMax) wnMax = p.x;
  }

  const quality = rateRawSignal(
    rawPoints.length,
    detection.statistics.yStd,
    detection.statistics.yMax,
  );

  // FTIR convention: high → low (4000 → 400 cm⁻¹).
  // Detected by comparing first and last points (not min/max, which only
  // gives the range regardless of direction).
  const first = rawPoints[0]?.x;
  const last = rawPoints[rawPoints.length - 1]?.x;
  const axisReversed =
    Number.isFinite(first) && Number.isFinite(last) && first > last;

  return {
    unit: detection.unit,
    wavenumberRange: [
      Number.isFinite(wnMin) ? wnMin : 0,
      Number.isFinite(wnMax) ? wnMax : 0,
    ],
    pointCount: rawPoints.length,
    unitDetection: detection.source,
    unitDetectionConfidence: detection.confidence,
    rawQuality: quality,
    axisReversed,
  };
}

/**
 * Build a `EvidenceProvenance` for the FTIR evidence bundle.
 *
 * Preserves:
 *   - sampleId  → datasetId
 *   - sampleName, materialClass
 *   - processingParameters (only the JSON-serializable subset of params)
 *   - createdAt (defaults to current time)
 *   - engineVersion (defaults to schema version)
 *
 * `processingHash` is intentionally NOT set by the adapter — it is the
 * responsibility of the calling layer to compute a hash of the raw input
 * if integrity verification is required.
 */
export function buildFtirProvenance(
  input: FtirAdapterInput,
  defaultTimestamp: string,
): EvidenceProvenance {
  const params = input.processingResult.parametersUsed;
  return {
    datasetId: input.sampleId,
    sampleName: input.sampleName,
    materialClass: input.materialClass,
    processingHash: undefined, // ← caller's responsibility
    processingParameters: {
      baselineMethod: params.baselineMethod,
      polynomialOrder: params.polynomialOrder,
      baselineIterations: params.baselineIterations,
      smoothingMethod: params.smoothingMethod,
      smoothingWindowSize: params.smoothingWindowSize,
      smoothingPolynomialOrder: params.smoothingPolynomialOrder,
      bandProminence: params.bandProminence,
      bandMinDistance: params.bandMinDistance,
      bandMinHeight: params.bandMinHeight,
      wavenumberTolerance: params.wavenumberTolerance,
      ambiguityThreshold: params.ambiguityThreshold,
    },
    createdAt: input.datasetCreatedAt ?? defaultTimestamp,
    engineVersion:
      input.engineVersion ?? `ftir-agent/${FTIR_EVIDENCE_SCHEMA_VERSION}`,
  };
}

// ---------------------------------------------------------------------------
// Main adapter
// ---------------------------------------------------------------------------

/**
 * Adapt a `FtirProcessingResult` into a DIFARYX-native `FtirEvidence` bundle.
 *
 * This is a PURE FUNCTION. It does not call into reasoning, notebook, or
 * fusion. It does not generate ValidationGaps, claims, or caveats.
 *
 * The returned bundle is a TRANSPORT object:
 *   - `bands`               : mapped from `processingResult.bands`
 *   - `signal`              : built from raw points
 *   - `provenance`          : built from input metadata
 *   - `functionalGroups`    : []   (filled by reasoning layer)
 *   - `validationGaps`      : []   (filled by reasoning layer)
 *   - `caveats`             : []   (filled by reasoning layer)
 *   - `confidence.overall`  : 'uncertain' (set by reasoning layer)
 *   - `confidence.overallScore` : 0 (set by reasoning layer)
 *
 * @throws FtirAdapterContractError when input violates the contract.
 */
export function adaptFtirProcessingResult(
  input: FtirAdapterInput,
): FtirEvidence {
  // ── Contract validation ─────────────────────────────────────────────
  if (!input || typeof input !== 'object') {
    throw new FtirAdapterContractError('input must be an object', 'input');
  }
  if (!input.processingResult) {
    throw new FtirAdapterContractError(
      'processingResult is required',
      'processingResult',
    );
  }
  if (!Array.isArray(input.rawPoints) || input.rawPoints.length === 0) {
    throw new FtirAdapterContractError(
      'rawPoints must be a non-empty array',
      'rawPoints',
    );
  }
  if (!input.sampleId || typeof input.sampleId !== 'string') {
    throw new FtirAdapterContractError(
      'sampleId must be a non-empty string',
      'sampleId',
    );
  }
  if (!Array.isArray(input.processingResult.bands)) {
    throw new FtirAdapterContractError(
      'processingResult.bands must be an array',
      'processingResult.bands',
    );
  }

  // ── Time / id resolution (injectable for determinism) ──────────────
  const nowIso = input.assembledAt ?? new Date().toISOString();
  const evidenceId =
    input.evidenceId
    ?? `ftir-ev-${input.sampleId}-${input.processingResult.bands.length}-${nowIso}`;

  // ── Build the three evidence components ────────────────────────────
  const signal = buildFtirSignalDescriptor(input.rawPoints, input.signalHint);
  const provenance = buildFtirProvenance(input, nowIso);
  const bands: UniversalEvidenceNode[] = input.processingResult.bands.map(
    (band, index) => ftirBandToEvidenceNode(band, index, provenance),
  );

  // ── Assemble the transport bundle ──────────────────────────────────
  return {
    evidenceId,
    technique: 'FTIR',
    assembledAt: nowIso,
    bands,
    functionalGroups: [], // ← reasoning layer's responsibility
    signal,
    confidence: {
      overall: 'uncertain', // ← reasoning layer's responsibility
      overallScore: 0, // ← reasoning layer's responsibility
      byGroup: {}, // ← reasoning layer's responsibility
      reasons: ['Adapter-only bundle; reasoning layer has not been applied.'],
    },
    validationGaps: [], // ← reasoning layer's responsibility
    provenance,
    caveats: [], // ← reasoning layer's responsibility
  };
}
