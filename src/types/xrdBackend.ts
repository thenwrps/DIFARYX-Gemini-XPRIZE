/**
 * TypeScript types for the XRD Python backend API.
 *
 * These mirror the Pydantic response schemas in `server/python/api/schemas.py`
 * but are kept permissive (index signatures, optional fields) so the frontend
 * won't break if the backend adds new fields.
 */

// ── Peak data ───────────────────────────────────────────────────────

import type { XRDDatasetContext } from './xrdDatasetContext';
import type { XRDParameters } from './xrdParameters';

export interface XRDDetectedPeak {
  position: number;
  intensity: number;
  index: number;
  prominence: number;
  fwhm: number;
  [key: string]: unknown;
}

export interface XRDFittedPeak {
  center: number;
  amplitude: number;
  fwhm: number;
  area: number;
  model_type: string;
  residual_rms: number;
  crystallite_size: number;
  [key: string]: unknown;
}

// ── Phase matching ──────────────────────────────────────────────────

export interface XRDReferenceMarker {
  hkl: string;
  d_spacing: number;
  position_2theta: number;
  relative_intensity: number;
  phase_label: string;
  [key: string]: unknown;
}

export interface XRDPeakMatch {
  measured_center: number;
  reference_marker: XRDReferenceMarker;
  delta_2theta: number;
  confidence: number;
  db_source: string;
  [key: string]: unknown;
}

export interface XRDPhaseMatch {
  primary_phase: string;
  matched_peaks: XRDPeakMatch[];
  db_source: string;
  catalog_id: string;
  summary: string;
  [key: string]: unknown;
}

export type XRDReferenceMatchV2Status =
  | 'candidate_match'
  | 'candidate_screening'
  | 'no_match'
  | 'unavailable'
  | 'blocked'
  | string;

export type XRDReferenceMatchV2ClaimLevel =
  | 'reference_supported_candidate'
  | 'structure_family_indication'
  | 'weak_candidate'
  | 'none'
  | string;

export interface XRDReferenceMatchV2MatchedPeak {
  measured_two_theta?: number | null;
  reference_two_theta?: number | null;
  delta_two_theta?: number | null;
  hkl?: string | null;
  reference_relative_intensity?: number | null;
  [key: string]: unknown;
}

export interface XRDReferenceMatchV2Candidate {
  phase_id?: string | null;
  phase_label?: string | null;
  formula?: string | null;
  structure_family?: string | null;
  elements?: string[] | null;
  database_ref?: string | null;
  matched_peak_count?: number | null;
  reference_peak_count?: number | null;
  coverage_ratio?: number | null;
  mean_delta_two_theta?: number | null;
  position_score?: number | null;
  coverage_score?: number | null;
  chemistry_score?: number | null;
  score?: number | null;
  matched_peaks?: XRDReferenceMatchV2MatchedPeak[];
  [key: string]: unknown;
}

export interface XRDReferenceMatchV2 {
  status?: XRDReferenceMatchV2Status | null;
  claim_level?: XRDReferenceMatchV2ClaimLevel | null;
  phase_confirmed?: boolean;
  phase_purity_confirmed?: boolean;
  reference_set_id?: string | null;
  candidate_count?: number | null;
  ranked_candidates?: XRDReferenceMatchV2Candidate[];
  primary_candidate?: XRDReferenceMatchV2Candidate | null;
  backend_available?: boolean;
  reason?: string | null;
  limitations?: string[];
  [key: string]: unknown;
}

// ── Full processing response ────────────────────────────────────────

export type XRDPeakResolution =
  | 'high-resolution'
  | 'publication-limited'
  | 'screening-grade'
  | string;

export interface XRDProcessResponse {
  x: number[];
  y_raw: number[];
  y_smoothed: number[];
  y_baseline: number[];
  y_corrected: number[];
  y_residual: number[];
  detected_peaks: XRDDetectedPeak[];
  fitted_peaks: XRDFittedPeak[];
  phase_match: XRDPhaseMatch | null;
  reference_match_v2?: XRDReferenceMatchV2 | null;
  sn_ratio: number;
  baseline_deviation: number;
  peak_resolution: XRDPeakResolution;
  [key: string]: unknown;
}

export interface ScientificEvidenceObject {
  evidence_id: string;
  schema_version: string;
  skill_id: string;
  skill_label: string;
  technique: string;
  input_reference: string;
  processing_summary: string;
  scientific_observations: string[];
  claim_boundaries: string[];
  validation_gaps: string[];
  agent_ready_summary: string;
  raw_result: Record<string, unknown>;
  created_at: string;
  [key: string]: unknown;
}

export interface XRDSkillProcessResponse {
  legacy_result: XRDProcessResponse;
  evidence_object: ScientificEvidenceObject;
  [key: string]: unknown;
}

// ── Request payload ─────────────────────────────────────────────────

export interface XRDBaselineConfig {
  method?: string;
  poly_order?: number;
  half_window?: number;
}

export interface XRDProcessingParams {
  baseline?: XRDBaselineConfig;
  smoothing?: { method?: string; window_length?: number };
  fit_model?: { model_type?: string };
  database?: { reference_db?: string };
  wavelength?: number;
  theta_min?: number;
  theta_max?: number;
  peak_threshold?: number;
  min_prominence?: number;
}

export interface XRDBackendDatasetContext {
  sample_id?: string;
  sample_name?: string;
  material_class?: string;
  batch_id?: string;
  known_elements: string[];
  expected_elements: string[];
  excluded_elements: string[];
  declared_phases: string[];
  candidate_phase_ids: string[];
  excluded_phase_ids: string[];
  reference_source: string;
  reference_set_id?: string;
  identity_source: string;
  identity_confidence: string;
  [key: string]: unknown;
}

export interface XRDBackendGroupedParameters {
  range: {
    two_theta_min: number;
    two_theta_max: number;
  };
  radiation: {
    source: string;
    wavelength_angstrom: number;
  };
  baseline: {
    method: string;
    lambda: number;
    p: number;
  };
  smoothing: {
    method: string;
    window_size: number;
    polynomial_order: number;
  };
  peak_detection: {
    min_prominence: number;
    min_distance_deg: number;
    min_height_ratio: number;
    max_peak_count: number;
  };
  peak_fitting: {
    model: string;
    fit_window_deg: number;
    max_iterations: number;
    calculate_crystallite_size: boolean;
  };
  reference_match: {
    enabled: boolean;
    match_mode: string;
    reference_source: string;
    reference_set_id: string;
    candidate_phase_ids: string[];
    tolerance_two_theta: number;
    min_matched_peaks: number;
    min_coverage_ratio: number;
    min_score: number;
    use_relative_intensity: boolean;
    intensity_tolerance_ratio: number;
    allow_unknown_search: boolean;
    allow_identity_claim: false;
    allow_phase_purity_claim: false;
  };
  boundary: {
    enabled: boolean;
    claim_mode: string;
    allow_identity_claim: false;
    allow_phase_purity_claim: false;
    require_complementary_evidence: boolean;
    require_reference_set_for_match: boolean;
    require_sample_context_for_targeted_match: boolean;
  };
  [key: string]: unknown;
}

export type XRDLocalReferenceSourceType = 'uploaded_reference' | 'project_local_reference';

export interface XRDLocalReferencePeakPayload {
  twoTheta: number;
  relativeIntensity?: number;
  hkl?: string;
  dSpacing?: number;
}

export interface XRDLocalReferencePayload {
  enabled: boolean;
  sourceType: XRDLocalReferenceSourceType;
  referenceLabel: string;
  formula?: string;
  materialFamily?: string;
  elements: string[];
  sourceFileName?: string;
  peaks: XRDLocalReferencePeakPayload[];
}

export interface XRDBackendLocalReferenceRequest {
  enabled: boolean;
  source_type: XRDLocalReferenceSourceType;
  reference_label: string;
  formula?: string;
  material_family?: string;
  elements: string[];
  source_file_name?: string;
  peaks: Array<{
    two_theta: number;
    relative_intensity?: number;
    hkl?: string;
    d_spacing?: number;
  }>;
}

export interface XRDProcessPayload {
  x: number[];
  y: number[];
  params?: XRDProcessingParams;
  datasetContext?: XRDDatasetContext;
  parameters?: XRDParameters;
  localReference?: XRDLocalReferencePayload;
}

// ── Normalized frontend result ──────────────────────────────────────

export interface XRDNormalizedResult {
  raw: XRDProcessResponse;
  scientificEvidenceObject?: ScientificEvidenceObject;
  referenceMatchV2?: XRDReferenceMatchV2 | null;
  detectedPeakCount: number;
  fittedPeakCount: number;
  snRatio: number;
  baselineDeviation: number;
  peakResolution: XRDPeakResolution;
  primaryPhase: string | null;
  matchedPeakCount: number;
  phaseSummary: string | null;
  yResidual: number[];
  isPhaseMatched: boolean;
}
