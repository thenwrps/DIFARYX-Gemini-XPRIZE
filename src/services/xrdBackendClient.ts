/**
 * XRD Backend API Client
 *
 * Posts XRD signal data to the Python FastAPI backend for processing.
 * Returns normalized results suitable for frontend consumption.
 *
 * The backend endpoint is: POST /process
 * Base URL defaults to http://localhost:8000 and can be overridden
 * via the VITE_XRD_BACKEND_URL environment variable.
 */

import type {
  ScientificEvidenceObject,
  XRDBackendDatasetContext,
  XRDBackendGroupedParameters,
  XRDBackendLocalReferenceRequest,
  XRDProcessingParams,
  XRDProcessPayload,
  XRDProcessResponse,
  XRDNormalizedResult,
  XRDSkillProcessResponse,
} from '../types/xrdBackend';

// ── Configuration ───────────────────────────────────────────────────

const DEFAULT_BASE_URL = 'http://localhost:8000';
const REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_REFERENCE_SET_ID = 'spinel_ferrite_sba15_demo_set';

function getBackendBaseUrl(): string {
  return import.meta.env.VITE_XRD_BACKEND_URL || DEFAULT_BASE_URL;
}

function debugXrdBackendClient(message: string, details?: Record<string, unknown>) {
  if (import.meta.env.DEV) {
    console.info(`[xrd-backend-client] ${message}`, details ?? {});
  }
}

// ── Request mapping ─────────────────────────────────────────────────

function optionalString(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

export function mapXrdDatasetContextToBackend(
  datasetContext: XRDProcessPayload['datasetContext'],
): XRDBackendDatasetContext | undefined {
  if (!datasetContext) return undefined;

  return {
    sample_id: optionalString(datasetContext.sampleId),
    sample_name: optionalString(datasetContext.sampleName),
    material_class: optionalString(datasetContext.materialClass),
    batch_id: optionalString(datasetContext.batchId),
    known_elements: datasetContext.knownElements,
    expected_elements: datasetContext.expectedElements,
    excluded_elements: datasetContext.excludedElements,
    declared_phases: datasetContext.declaredPhases,
    candidate_phase_ids: datasetContext.candidatePhaseIds,
    excluded_phase_ids: datasetContext.excludedPhaseIds,
    reference_source: datasetContext.referenceSource,
    reference_set_id: optionalString(datasetContext.referenceSetId) ?? DEFAULT_REFERENCE_SET_ID,
    identity_source: datasetContext.identitySource,
    identity_confidence: datasetContext.identityConfidence,
  };
}

export function mapXrdParametersToBackend(
  parameters: XRDProcessPayload['parameters'],
): XRDBackendGroupedParameters | undefined {
  if (!parameters) return undefined;

  const referenceSetId = optionalString(parameters.referenceMatch.referenceSetId) ?? DEFAULT_REFERENCE_SET_ID;

  return {
    range: {
      two_theta_min: parameters.range.twoThetaMin,
      two_theta_max: parameters.range.twoThetaMax,
    },
    radiation: {
      source: parameters.radiation.source,
      wavelength_angstrom: parameters.radiation.wavelengthAngstrom,
    },
    baseline: {
      method: parameters.baseline.method,
      lambda: parameters.baseline.lambda,
      p: parameters.baseline.p,
    },
    smoothing: {
      method: parameters.smoothing.method,
      window_size: parameters.smoothing.windowSize,
      polynomial_order: parameters.smoothing.polynomialOrder,
    },
    peak_detection: {
      min_prominence: parameters.peakDetection.minProminence,
      min_distance_deg: parameters.peakDetection.minDistanceDeg,
      min_height_ratio: parameters.peakDetection.minHeightRatio,
      max_peak_count: parameters.peakDetection.maxPeakCount,
    },
    peak_fitting: {
      model: parameters.peakFitting.model,
      fit_window_deg: parameters.peakFitting.fitWindowDeg,
      max_iterations: parameters.peakFitting.maxIterations,
      calculate_crystallite_size: parameters.peakFitting.calculateCrystalliteSize,
    },
    reference_match: {
      enabled: parameters.referenceMatch.enabled,
      match_mode: parameters.referenceMatch.matchMode,
      reference_source: parameters.referenceMatch.referenceSource,
      reference_set_id: referenceSetId,
      candidate_phase_ids: parameters.referenceMatch.candidatePhaseIds,
      tolerance_two_theta: parameters.referenceMatch.toleranceTwoTheta,
      min_matched_peaks: parameters.referenceMatch.minMatchedPeaks,
      min_coverage_ratio: parameters.referenceMatch.minCoverageRatio,
      min_score: parameters.referenceMatch.minScore,
      use_relative_intensity: parameters.referenceMatch.useRelativeIntensity,
      intensity_tolerance_ratio: parameters.referenceMatch.intensityToleranceRatio,
      allow_unknown_search: parameters.referenceMatch.allowUnknownSearch,
      allow_identity_claim: false,
      allow_phase_purity_claim: false,
    },
    boundary: {
      enabled: parameters.boundary.enabled,
      claim_mode: parameters.boundary.claimMode,
      allow_identity_claim: false,
      allow_phase_purity_claim: false,
      require_complementary_evidence: parameters.boundary.requireComplementaryEvidence,
      require_reference_set_for_match: parameters.boundary.requireReferenceSetForMatch,
      require_sample_context_for_targeted_match: parameters.boundary.requireSampleContextForTargetedMatch,
    },
  };
}

export function mapXrdParametersToLegacyParams(
  parameters: XRDProcessPayload['parameters'],
): XRDProcessingParams | undefined {
  if (!parameters) return undefined;

  return {
    theta_min: parameters.range.twoThetaMin,
    theta_max: parameters.range.twoThetaMax,
    wavelength: parameters.radiation.wavelengthAngstrom,
    min_prominence: parameters.peakDetection.minProminence,
    peak_threshold: parameters.peakDetection.minHeightRatio,
    baseline: {
      method: parameters.baseline.method,
    },
    smoothing: {
      method: parameters.smoothing.method,
      window_length: parameters.smoothing.windowSize,
    },
    fit_model: {
      model_type: parameters.peakFitting.model,
    },
    database: {
      reference_db: optionalString(parameters.referenceMatch.referenceSetId) ?? DEFAULT_REFERENCE_SET_ID,
    },
  };
}

export function mapXrdLocalReferenceToBackend(
  localReference: XRDProcessPayload['localReference'],
): XRDBackendLocalReferenceRequest | undefined {
  if (!localReference?.enabled) return undefined;

  return {
    enabled: true,
    source_type: localReference.sourceType,
    reference_label: localReference.referenceLabel,
    ...(optionalString(localReference.formula) ? { formula: optionalString(localReference.formula) } : {}),
    ...(optionalString(localReference.materialFamily) ? { material_family: optionalString(localReference.materialFamily) } : {}),
    elements: localReference.elements,
    ...(optionalString(localReference.sourceFileName) ? { source_file_name: optionalString(localReference.sourceFileName) } : {}),
    ...(optionalString(localReference.importStatus) ? { import_status: optionalString(localReference.importStatus) } : {}),
    ...(optionalString(localReference.validationLevel) ? { validation_level: optionalString(localReference.validationLevel) } : {}),
    ...(optionalString(localReference.approvalStatus) ? { approval_status: optionalString(localReference.approvalStatus) } : {}),
    ...(localReference.userApprovedForMatching !== undefined
      ? { user_approved_for_matching: localReference.userApprovedForMatching }
      : {}),
    ...(localReference.isEligibleForBackendMatching !== undefined
      ? { is_eligible_for_backend_matching: localReference.isEligibleForBackendMatching }
      : {}),
    ...(optionalString(localReference.sourceFileKind) ? { source_file_kind: optionalString(localReference.sourceFileKind) } : {}),
    ...(localReference.criticalErrors ? { critical_errors: localReference.criticalErrors } : {}),
    ...(localReference.warnings ? { warnings: localReference.warnings } : {}),
    peaks: localReference.peaks.map((peak) => ({
      two_theta: peak.twoTheta,
      ...(Number.isFinite(peak.relativeIntensity) ? { relative_intensity: peak.relativeIntensity } : {}),
      ...(optionalString(peak.hkl) ? { hkl: optionalString(peak.hkl) } : {}),
      ...(Number.isFinite(peak.dSpacing) ? { d_spacing: peak.dSpacing } : {}),
    })),
  };
}

function buildXrdProcessRequestBody(payload: XRDProcessPayload): Record<string, unknown> {
  const datasetContext = mapXrdDatasetContextToBackend(payload.datasetContext);
  const parameters = mapXrdParametersToBackend(payload.parameters);
  const legacyParams = payload.params ?? mapXrdParametersToLegacyParams(payload.parameters);
  const localReference = mapXrdLocalReferenceToBackend(payload.localReference);

  return {
    x: payload.x,
    y: payload.y,
    ...(legacyParams ? { params: legacyParams } : {}),
    ...(datasetContext ? { dataset_context: datasetContext } : {}),
    ...(parameters ? { parameters } : {}),
    ...(localReference ? { local_reference: localReference } : {}),
  };
}

// ── Health check ────────────────────────────────────────────────────

export interface XRDHealthStatus {
  ok: boolean;
  status?: string;
  engine?: string;
  version?: string;
  error?: string;
}

export async function checkXrdBackendHealth(): Promise<XRDHealthStatus> {
  const baseUrl = getBackendBaseUrl();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5_000);

    const response = await fetch(`${baseUrl}/health`, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status}` };
    }

    const data = await response.json();
    return {
      ok: true,
      status: data.status,
      engine: data.engine,
      version: data.version,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Connection failed',
    };
  }
}

// ── Normalization (exported for tests and UI) ───────────────────────

export function normalizeXrdBackendResponse(
  raw: XRDProcessResponse,
): XRDNormalizedResult {
  const phaseMatch = raw.phase_match;
  return {
    raw,
    referenceMatchV2: raw.reference_match_v2 ?? null,
    datasetContextEcho: raw.dataset_context_echo ?? null,
    processingProvenance: raw.processing_provenance ?? null,
    detectedPeakCount: raw.detected_peaks?.length ?? 0,
    fittedPeakCount: raw.fitted_peaks?.length ?? 0,
    snRatio: raw.sn_ratio ?? 0,
    baselineDeviation: raw.baseline_deviation ?? 0,
    peakResolution: raw.peak_resolution ?? 'screening-grade',
    primaryPhase: phaseMatch?.primary_phase ?? null,
    matchedPeakCount: phaseMatch?.matched_peaks?.length ?? 0,
    phaseSummary: phaseMatch?.summary ?? null,
    yResidual: raw.y_residual ?? [],
    isPhaseMatched: !!phaseMatch,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isXrdProcessResponse(value: unknown): value is XRDProcessResponse {
  return isRecord(value)
    && Array.isArray(value.x)
    && Array.isArray(value.y_raw)
    && Array.isArray(value.detected_peaks)
    && Array.isArray(value.fitted_peaks)
    && typeof value.sn_ratio === 'number'
    && typeof value.baseline_deviation === 'number';
}

function isScientificEvidenceObject(value: unknown): value is ScientificEvidenceObject {
  return isRecord(value)
    && typeof value.evidence_id === 'string'
    && typeof value.schema_version === 'string'
    && typeof value.skill_id === 'string'
    && typeof value.skill_label === 'string'
    && typeof value.technique === 'string'
    && typeof value.input_reference === 'string'
    && typeof value.processing_summary === 'string'
    && hasStringList(value.scientific_observations)
    && hasStringList(value.claim_boundaries)
    && hasStringList(value.validation_gaps)
    && typeof value.agent_ready_summary === 'string'
    && isRecord(value.raw_result)
    && typeof value.created_at === 'string';
}

function isXrdSkillProcessResponse(value: unknown): value is XRDSkillProcessResponse {
  return isRecord(value)
    && isXrdProcessResponse(value.legacy_result)
    && isScientificEvidenceObject(value.evidence_object);
}

// ── Processing ──────────────────────────────────────────────────────

export interface ProcessXrdSignalOptions {
  /** Override backend base URL for this request only. */
  baseUrl?: string;
  /** Override request timeout in ms. */
  timeoutMs?: number;
}

export class XRDBackendError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'XRDBackendError';
  }
}

/**
 * Send XRD signal data to the backend for processing.
 *
 * @param payload - Two-theta (x) and intensity (y) arrays plus optional params
 * @param options - Optional overrides for base URL and timeout
 * @returns Normalized processing result
 * @throws XRDBackendError on network failure, timeout, or non-2xx response
 */
export async function processXrdSignal(
  payload: XRDProcessPayload,
  options?: ProcessXrdSignalOptions,
): Promise<XRDNormalizedResult> {
  const baseUrl = options?.baseUrl ?? getBackendBaseUrl();
  const timeoutMs = options?.timeoutMs ?? REQUEST_TIMEOUT_MS;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = `${baseUrl}/process`;
    debugXrdBackendClient('endpoint used', {
      endpoint: url,
      xLength: payload.x.length,
      yLength: payload.y.length,
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildXrdProcessRequestBody(payload)),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      let detail = `XRD backend returned HTTP ${response.status}`;
      try {
        const errBody = await response.json();
        if (errBody?.detail) {
          detail = errBody.detail;
        }
      } catch {
        // ignore parse failure
      }
      throw new XRDBackendError(detail, response.status);
    }

    const raw: XRDProcessResponse = await response.json();
    return normalizeXrdBackendResponse(raw);
  } catch (err) {
    clearTimeout(timeoutId);

    if (err instanceof XRDBackendError) {
      throw err;
    }

    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new XRDBackendError(
        `XRD backend request timed out after ${timeoutMs}ms`,
        undefined,
        err,
      );
    }

    throw new XRDBackendError(
      err instanceof Error ? err.message : 'Unknown XRD backend error',
      undefined,
      err,
    );
  }
}

/**
 * Prefer the XRD Scientific Skill endpoint and fall back to the legacy
 * processor endpoint when an older or unavailable backend cannot serve it.
 */
export async function processXrdSkillEvidence(
  payload: XRDProcessPayload,
  options?: ProcessXrdSignalOptions,
): Promise<XRDNormalizedResult> {
  const baseUrl = options?.baseUrl ?? getBackendBaseUrl();
  const timeoutMs = options?.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = `${baseUrl}/skills/xrd/process`;
    debugXrdBackendClient('endpoint used', {
      endpoint: url,
      xLength: payload.x.length,
      yLength: payload.y.length,
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildXrdProcessRequestBody(payload)),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new XRDBackendError(`XRD skill endpoint returned HTTP ${response.status}`, response.status);
    }

    const data: unknown = await response.json();
    if (!isXrdSkillProcessResponse(data)) {
      throw new XRDBackendError('XRD skill endpoint returned an unexpected response shape');
    }

    return {
      ...normalizeXrdBackendResponse(data.legacy_result),
      scientificEvidenceObject: data.evidence_object,
    };
  } catch (err) {
    debugXrdBackendClient('skill endpoint unavailable; falling back to legacy process endpoint', {
      baseUrl,
      error: err instanceof Error ? err.message : 'Unknown XRD backend error',
    });
    return processXrdSignal(payload, options);
  } finally {
    clearTimeout(timeoutId);
  }
}
