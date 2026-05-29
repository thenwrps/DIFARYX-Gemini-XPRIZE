"""
Pydantic schemas for the XRD Gateway API.

Defines request/response models for all REST endpoints.
Separate from domain models to allow API-specific serialization
while maintaining strict domain validation.
"""

from __future__ import annotations

import math
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, field_validator, model_validator


# ============================================================================
# Legacy Enums (mirror domain enums for API contract)
# ============================================================================


class BaselineMethodAPI(str, Enum):
    ASYMMETRIC_LS = "Asymmetric LS"
    POLYNOMIAL = "Polynomial"
    ROLLING_BALL = "Rolling Ball"
    NONE = "None"


class SmoothingMethodAPI(str, Enum):
    SAVITZKY_GOLAY = "Savitzky-Golay"
    MOVING_AVERAGE = "Moving Average"
    NONE = "None"


class FitModelTypeAPI(str, Enum):
    PSEUDO_VOIGT = "Pseudo-Voigt"
    GAUSSIAN = "Gaussian"
    LORENTZIAN = "Lorentzian"


class ReferenceDBAPI(str, Enum):
    ICSD = "ICSD"
    PDF4_PLUS = "PDF-4+"
    LOCAL_REFERENCE = "Local Reference"


# ============================================================================
# Request schemas (legacy — kept for backward compatibility)
# ============================================================================


class BaselineConfigAPI(BaseModel):
    """Baseline correction configuration for API requests."""
    method: BaselineMethodAPI = Field(
        default=BaselineMethodAPI.ASYMMETRIC_LS,
        description="Baseline correction method.",
    )
    poly_order: int = Field(default=3, ge=1, le=10)
    half_window: int = Field(default=50, ge=5, le=500)


class SmoothingConfigAPI(BaseModel):
    """Smoothing configuration for API requests."""
    method: SmoothingMethodAPI = Field(
        default=SmoothingMethodAPI.SAVITZKY_GOLAY,
        description="Smoothing method.",
    )
    window_length: int = Field(default=11, ge=3, le=51)


class FitModelConfigAPI(BaseModel):
    """Peak fitting model configuration for API requests."""
    model_type: FitModelTypeAPI = Field(
        default=FitModelTypeAPI.PSEUDO_VOIGT,
        description="Peak profile model.",
    )


class DatabaseConfigAPI(BaseModel):
    """Reference database selection for API requests."""
    reference_db: ReferenceDBAPI = Field(
        default=ReferenceDBAPI.ICSD,
        description="Reference database to query.",
    )


class XRDLocalReferenceSourceType(str, Enum):
    UPLOADED_REFERENCE = "uploaded_reference"
    PROJECT_LOCAL_REFERENCE = "project_local_reference"


class XRDLocalReferencePeakRequest(BaseModel):
    """Request-scoped local reference peak for candidate matching."""
    two_theta: float = Field(..., gt=0.0, le=180.0)
    relative_intensity: Optional[float] = Field(default=None, ge=0.0)
    hkl: Optional[str] = None
    d_spacing: Optional[float] = Field(default=None, gt=0.0)

    @field_validator("two_theta", "relative_intensity", "d_spacing")
    @classmethod
    def _finite_number(cls, value: Optional[float]) -> Optional[float]:
        if value is not None and not math.isfinite(value):
            raise ValueError("Local reference numeric fields must be finite.")
        return value


class XRDLocalReferenceRequest(BaseModel):
    """Request-scoped uploaded/project-local reference pattern.

    Candidate evidence only.  This model never enables identity or phase-purity
    claims and is only used when ``enabled`` is explicitly true.
    """
    enabled: bool = Field(default=False)
    source_type: XRDLocalReferenceSourceType = Field(
        default=XRDLocalReferenceSourceType.UPLOADED_REFERENCE,
    )
    reference_label: str = Field(default="")
    formula: Optional[str] = None
    material_family: Optional[str] = None
    elements: List[str] = Field(default_factory=list)
    source_file_name: Optional[str] = None
    peaks: List[XRDLocalReferencePeakRequest] = Field(default_factory=list)
    import_status: Optional[str] = None
    validation_level: Optional[str] = None
    approval_status: Optional[str] = None
    user_approved_for_matching: bool = Field(default=False)
    is_eligible_for_backend_matching: bool = Field(default=False)
    source_file_kind: Optional[str] = None
    critical_errors: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def _validate_enabled_reference(self) -> "XRDLocalReferenceRequest":
        if not self.enabled:
            return self
        blocked_import_statuses = {
            "requires_converter",
            "requires_peak_extraction",
            "unsupported_format",
            "corrupted_file",
            "parse_error",
            "not_supported_yet",
        }
        if not self.reference_label.strip():
            raise ValueError(
                "local_reference.reference_label is required when local reference matching is enabled."
            )
        if self.approval_status != "approved_for_local_matching":
            raise ValueError(
                "local_reference.approval_status must be approved_for_local_matching when enabled."
            )
        if self.user_approved_for_matching is not True:
            raise ValueError(
                "local_reference.user_approved_for_matching must be true when enabled."
            )
        if self.is_eligible_for_backend_matching is not True:
            raise ValueError(
                "local_reference.is_eligible_for_backend_matching must be true when enabled."
            )
        if self.import_status in blocked_import_statuses:
            raise ValueError(
                f"local_reference.import_status {self.import_status} is not eligible for matching."
            )
        if self.critical_errors:
            raise ValueError(
                "local_reference.critical_errors must be empty when enabled."
            )
        if len(self.peaks) < 3:
            raise ValueError(
                "local_reference.peaks must include at least 3 peaks when enabled."
            )
        return self


class XRDProcessRequest(BaseModel):
    """
    Full XRD processing pipeline request.

    All parameters are optional; omitted fields use sensible defaults.
    Raw data can be provided inline or uploaded as CSV.

    Phase 3 additions (backward-compatible):
        - dataset_context: optional XRDDatasetContext metadata
        - parameters: optional grouped XRDParameters contract

    These new fields are accepted and validated but do NOT yet drive
    the scientific engine. The legacy flat fields remain authoritative
    for engine behavior.
    """
    x: Optional[List[float]] = Field(
        default=None,
        description="2θ angle array in degrees. Required if no CSV uploaded.",
    )
    y: Optional[List[float]] = Field(
        default=None,
        description="Intensity array (arbitrary units). Required if no CSV uploaded.",
    )
    baseline: BaselineConfigAPI = Field(
        default_factory=BaselineConfigAPI,
        description="Baseline correction configuration.",
    )
    smoothing: SmoothingConfigAPI = Field(
        default_factory=SmoothingConfigAPI,
        description="Smoothing configuration.",
    )
    fit_model: FitModelConfigAPI = Field(
        default_factory=FitModelConfigAPI,
        description="Peak fitting model configuration.",
    )
    database: DatabaseConfigAPI = Field(
        default_factory=DatabaseConfigAPI,
        description="Reference database configuration.",
    )
    wavelength: float = Field(default=1.5406, gt=0.0, lt=10.0)
    theta_min: float = Field(default=10.0, ge=0.0, le=180.0)
    theta_max: float = Field(default=80.0, ge=0.0, le=180.0)
    peak_threshold: float = Field(default=0.12, ge=0.01, le=1.0)
    min_prominence: float = Field(default=0.08, ge=0.0, le=1.0)

    # ── Phase 3 optional fields ─────────────────────────────────────────
    dataset_context: Optional["XRDDatasetContext"] = Field(
        default=None,
        description="Phase 3: optional dataset context metadata.",
    )
    parameters: Optional["XRDParameters"] = Field(
        default=None,
        description="Phase 3: optional grouped XRD parameter contract.",
    )
    local_reference: Optional[XRDLocalReferenceRequest] = Field(
        default=None,
        description="Phase 7D.5: optional request-scoped local reference candidate matching input.",
    )


class MatchRequest(BaseModel):
    """
    Reference database matching request.

    Sends fitted peak data to the reference DB service for phase matching.
    """
    peaks: List[Dict[str, Any]] = Field(
        description=(
            "List of fitted peaks. Each must contain 'center', 'amplitude', "
            "and 'fwhm' keys."
        ),
    )
    reference_db: ReferenceDBAPI = Field(
        default=ReferenceDBAPI.ICSD,
        description="Reference database to query.",
    )
    tolerance: float = Field(
        default=0.5,
        gt=0.0,
        le=5.0,
        description="2θ matching tolerance in degrees.",
    )


# ============================================================================
# Response schemas
# ============================================================================


class XRDDominantPeakRegion(BaseModel):
    """A region in 2θ space where peaks cluster."""
    range_label: str = Field(
        ..., description="2θ range label, e.g. '20–22°'"
    )
    peak_count: int = Field(..., description="Number of peaks in this region")
    character: str = Field(
        ..., description="Peak character: sharp | broad | mixed"
    )
    representative_2theta: Optional[float] = Field(
        None, description="Representative 2θ position (strongest peak)"
    )


class XRDUnmatchedPeak(BaseModel):
    """A measured peak not explained by top reference candidates."""
    position_2theta: float = Field(
        ..., description="2θ position of the unmatched peak"
    )
    intensity: float = Field(..., description="Peak intensity")
    nearest_match_2theta: Optional[float] = Field(
        None, description="Nearest reference-line position"
    )
    delta_2theta: Optional[float] = Field(
        None, description="Distance to nearest reference line (°2θ)"
    )


class XRDGeneralSampleAssessment(BaseModel):
    """General-purpose XRD signal quality and sample characterization."""
    signal_quality: str = Field(
        ..., description="Signal quality: good | marginal | weak"
    )
    crystallinity_indicator: str = Field(
        ...,
        description=(
            "Crystallinity characterization: "
            "crystalline_like | amorphous_like | mixed | insufficient"
        ),
    )
    peak_density: float = Field(
        ..., description="Peaks per degree 2θ in measured range"
    )
    dominant_peak_regions: List[XRDDominantPeakRegion] = Field(
        default_factory=list,
        description="Regions where peaks cluster",
    )
    unmatched_peak_count: int = Field(
        ..., description="Number of measured peaks not explained by top candidates"
    )
    unmatched_peaks: List[XRDUnmatchedPeak] = Field(
        default_factory=list,
        description="Preview of unmatched peak positions",
    )
    interpretation_mode: str = Field(
        ...,
        description=(
            "Interpretation capability: "
            "phase_screening | feature_only | insufficient_data"
        ),
    )


class XRDClaimBoundary(BaseModel):
    """Backend-safe claim boundary output for XRD evidence."""
    allowed_claims: List[str] = Field(
        default_factory=list, description="Claims supported by the evidence"
    )
    blocked_claims: List[str] = Field(
        default_factory=list,
        description="Claims that must NOT be asserted from XRD alone",
    )
    required_validation: List[str] = Field(
        default_factory=list,
        description="Complementary techniques needed for stronger claims",
    )
    limitations: List[str] = Field(
        default_factory=list,
        description="Technical limitations identified for this sample",
    )


class DetectedPeakResponse(BaseModel):
    """Detected peak data in API response."""
    position: float = Field(description="2θ position in degrees.")
    intensity: float = Field(description="Peak intensity (processed).")
    index: int = Field(description="Index into data array.")
    prominence: float = Field(default=0.0)
    fwhm: float = Field(default=0.0, description="Estimated FWHM in °2θ.")


class FittedPeakResponse(BaseModel):
    """Fitted peak data in API response."""
    center: float = Field(description="Refined 2θ position in degrees.")
    amplitude: float = Field(description="Fitted amplitude.")
    fwhm: float = Field(description="Fitted FWHM in °2θ.")
    area: float = Field(description="Integrated area under fitted profile.")
    model_type: str = Field(description="Model used for fitting.")
    residual_rms: float = Field(default=0.0, description="RMS residual of fit.")
    crystallite_size: float = Field(
        default=0.0,
        description="Crystallite size in nm (Scherrer equation).",
    )


class ReferenceMarkerResponse(BaseModel):
    """Reference marker from a crystallographic database."""
    hkl: str
    d_spacing: float
    position_2theta: float
    relative_intensity: float
    phase_label: str


class PeakMatchResponse(BaseModel):
    """A single peak match result."""
    measured_center: float
    reference_marker: ReferenceMarkerResponse
    delta_2theta: float
    confidence: float
    db_source: str


class PhaseMatchResponse(BaseModel):
    """Aggregate phase matching result."""
    primary_phase: str
    matched_peaks: List[PeakMatchResponse] = Field(default_factory=list)
    db_source: str
    catalog_id: str
    summary: str




class XRDDatasetContextEcho(BaseModel):
    """
    Dataset context echo response (Phase X1).

    Returns normalized dataset context from the request so evidence records
    become self-contained and downstream handoff doesn't need to re-read
    workspace state.
    """
    sample_id: Optional[str] = None
    sample_name: Optional[str] = None
    material_class: Optional[str] = None
    known_elements: List[str] = Field(default_factory=list)
    declared_phases: List[str] = Field(default_factory=list)
    candidate_phase_ids: List[str] = Field(default_factory=list)
    excluded_phase_ids: List[str] = Field(default_factory=list)
    reference_source: Optional[str] = None
    reference_set_id: Optional[str] = None
    identity_source: Optional[str] = None
    identity_confidence: Optional[str] = None


class XRDProcessingProvenance(BaseModel):
    """
    Processing provenance metadata (Phase X1).

    Documents which parameter contract version was used, what was received
    from the request, and key processing configuration for downstream
    citation and reproducibility.
    """
    parameter_contract_version: str = Field(
        default="grouped_v1",
        description="Parameter contract version: legacy_flat | grouped_v1 | mixed",
    )
    backend_schema_version: str = Field(
        default="1.0.0",
        description="Backend schema version",
    )
    processing_mode: str = Field(
        default="legacy_flat",
        description="Processing mode: legacy_flat | grouped_parameters | mixed_legacy_grouped",
    )
    received_grouped_parameters: bool = Field(
        default=False,
        description="Whether request included grouped parameters field",
    )
    received_dataset_context: bool = Field(
        default=False,
        description="Whether request included dataset_context field",
    )
    received_local_reference: bool = Field(
        default=False,
        description="Whether request included local_reference field",
    )
    local_reference_enabled: bool = Field(
        default=False,
        description="Whether local reference matching was enabled",
    )
    reference_match_enabled: bool = Field(
        default=False,
        description="Whether reference matching was enabled",
    )
    reference_set_id: Optional[str] = Field(
        default=None,
        description="Active reference set ID",
    )
    radiation_source: Optional[str] = Field(
        default=None,
        description="Radiation source identifier",
    )
    wavelength_angstrom: Optional[float] = Field(
        default=None,
        description="Wavelength in angstroms",
    )
    two_theta_min: Optional[float] = Field(
        default=None,
        description="2theta range minimum",
    )
    two_theta_max: Optional[float] = Field(
        default=None,
        description="2theta range maximum",
    )
    baseline_method: Optional[str] = Field(
        default=None,
        description="Baseline correction method",
    )
    smoothing_method: Optional[str] = Field(
        default=None,
        description="Smoothing method",
    )
    peak_fit_model: Optional[str] = Field(
        default=None,
        description="Peak fitting model",
    )
    peak_detection_min_prominence: Optional[float] = Field(
        default=None,
        description="Peak detection minimum prominence threshold",
    )
    max_peak_count: Optional[int] = Field(
        default=None,
        description="Maximum peak count limit",
    )
    created_at: Optional[str] = Field(
        default=None,
        description="ISO timestamp of processing",
    )

class XRDProcessResponse(BaseModel):
    """Full XRD processing pipeline response."""
    x: List[float] = Field(description="2θ angle array.")
    y_raw: List[float] = Field(description="Raw intensity array.")
    y_smoothed: List[float] = Field(description="Smoothed intensity array.")
    y_baseline: List[float] = Field(description="Estimated baseline.")
    y_corrected: List[float] = Field(description="Baseline-corrected intensity.")
    y_residual: List[float] = Field(
        default_factory=list,
        description="Fit residual array (y_observed - y_fitted).",
    )
    detected_peaks: List[DetectedPeakResponse] = Field(default_factory=list)
    fitted_peaks: List[FittedPeakResponse] = Field(default_factory=list)
    phase_match: Optional[PhaseMatchResponse] = Field(
        default=None,
        description="Phase matching result (if database specified).",
    )
    reference_match_v2: Optional["XRDReferenceMatchResult"] = Field(
        default=None,
        description="Phase 4: v2 reference-match candidate evidence (additive, candidate-only).",
    )
    sn_ratio: float = Field(
        default=0.0,
        description="Signal-to-noise ratio (max smoothed / noise-floor std).",
    )
    baseline_deviation: float = Field(
        default=0.0,
        description="Baseline contribution as percentage of total raw intensity.",
    )
    general_sample_assessment: Optional[XRDGeneralSampleAssessment] = Field(
        default=None,
        description="General-purpose XRD signal quality and sample characterization",
    )
    xrd_claim_boundary: Optional[XRDClaimBoundary] = Field(
        default=None,
        description="Backend-safe claim boundaries for XRD evidence",
    )
    peak_resolution: str = Field(
        default="screening-grade",
        description="Peak resolution classification: high-resolution | publication-limited | screening-grade.",
    )
    dataset_context_echo: Optional[XRDDatasetContextEcho] = Field(
        default=None,
        description="Phase X1: Echoed dataset context from request for self-contained evidence records.",
    )
    processing_provenance: Optional[XRDProcessingProvenance] = Field(
        default=None,
        description="Phase X1: Processing provenance metadata for reproducibility and citation.",
    )


class HealthResponse(BaseModel):
    """
    Production-ready health check response (Step 5).
    
    Differentiates between liveness (service running) and readiness
    (dependencies loaded and ready to serve requests).
    """
    status: str = Field(
        default="healthy",
        description="Liveness status: 'healthy' if service is running"
    )
    engine: str = Field(default="xrd", description="Engine identifier")
    version: str = Field(default="1.1.0", description="API version")
    schema_version: Optional[str] = Field(
        default="1.1.0",
        description="Backend schema version for response compatibility"
    )
    readiness: Optional[Dict[str, bool]] = Field(
        default=None,
        description="Readiness checks: engine_loaded, reference_registry_loaded"
    )


class ErrorResponse(BaseModel):
    """Standard error response."""
    detail: str
    error_type: Optional[str] = None


class ScienceSkill(BaseModel):
    """Metadata schema representing a registered Science Skill."""
    skill_id: str = Field(description="Unique string identifier for the skill.")
    skill_label: str = Field(description="Display label of the skill.")
    technique: str = Field(description="Associated experimental technique.")
    description: str = Field(description="Summary of the skill's purpose.")
    inputs: str = Field(description="Description of expected inputs.")
    outputs: str = Field(description="Description of generated outputs.")
    status: str = Field(description="Current status: active or inactive.")


class ScientificEvidenceObject(BaseModel):
    """Structured container representing skill-derived scientific evidence."""
    evidence_id: str = Field(description="UUIDv4 identifier for the evidence snapshot.")
    schema_version: str = Field(default="1.0.0", description="Schema version identifier.")
    skill_id: str = Field(description="ID of the executing skill.")
    skill_label: str = Field(description="Label of the executing skill.")
    technique: str = Field(description="Associated technique.")
    input_reference: str = Field(description="SHA-256 hash representation of the input dataset.")
    processing_summary: str = Field(description="Summary of active processing parameters.")
    scientific_observations: List[str] = Field(default_factory=list, description="List of peak details and phase indications.")
    claim_boundaries: List[str] = Field(default_factory=list, description="Validation constraints and limitations.")
    validation_gaps: List[str] = Field(default_factory=list, description="Open validation gaps or next steps.")
    agent_ready_summary: str = Field(description="LLM-optimized summary of findings.")
    raw_result: Dict[str, Any] = Field(description="JSON-safe dictionary of raw processor outputs.")
    created_at: str = Field(description="ISO UTC timestamp of creation.")


class XRDSkillProcessResponse(BaseModel):
    """Response model for the XRD Science Skill processing endpoint."""
    legacy_result: XRDProcessResponse = Field(description="Legacy XRD processor output.")
    evidence_object: ScientificEvidenceObject = Field(description="Validation-bounded scientific evidence object.")


# ============================================================================
# Phase 3 — Grouped XRD contract (machine-safe enums + dataset context)
#
# These models mirror the frontend TypeScript interfaces introduced in
# Phase 1/2:
#   - src/types/xrdParameters.ts
#   - src/types/xrdDatasetContext.ts
#
# All enum values use machine-safe snake_case identifiers.
# Display-label normalizers accept old UI labels and coerce to the
# machine-safe equivalent so both old and new payloads work.
#
# Defaults mirror DEFAULT_XRD_PARAMETERS from src/config/xrdDefaults.ts.
# ============================================================================


# ── Machine-safe enums ──────────────────────────────────────────────────────


class BaselineMethodV2(str, Enum):
    ASYMMETRIC_LS = "asymmetric_ls"
    POLYNOMIAL = "polynomial"
    ROLLING_BALL = "rolling_ball"
    NONE = "none"


class SmoothingMethodV2(str, Enum):
    SAVITZKY_GOLAY = "savitzky_golay"
    MOVING_AVERAGE = "moving_average"
    NONE = "none"


class FitModelTypeV2(str, Enum):
    PSEUDO_VOIGT = "pseudo_voigt"
    GAUSSIAN = "gaussian"
    LORENTZIAN = "lorentzian"


class RadiationSource(str, Enum):
    CU_KA = "cu_ka"
    CO_KA = "co_ka"
    MO_KA = "mo_ka"
    CUSTOM = "custom"


class ReferenceSourceV2(str, Enum):
    INTERNAL_CURATED = "internal_curated"
    PROJECT_LOCAL_REFERENCE = "project_local_reference"
    UPLOADED_REFERENCE = "uploaded_reference"


class MatchMode(str, Enum):
    DISABLED = "disabled"
    CANDIDATE_SCREENING = "candidate_screening"
    TARGETED_CANDIDATE_MATCH = "targeted_candidate_match"


class ClaimMode(str, Enum):
    CONSERVATIVE = "conservative"
    STANDARD = "standard"
    EXPLORATORY = "exploratory"


class IdentitySource(str, Enum):
    USER_DECLARED = "user_declared"
    PROJECT_REGISTRY = "project_registry"
    FILENAME_HINT = "filename_hint"
    UNKNOWN = "unknown"


class IdentityConfidence(str, Enum):
    DECLARED = "declared"
    INFERRED = "inferred"
    UNKNOWN = "unknown"


# ── Display-label → machine-safe normalizer ─────────────────────────────────

_LABEL_TO_SAFE: Dict[str, str] = {
    # Baseline
    "Asymmetric LS": "asymmetric_ls",
    "Polynomial": "polynomial",
    "Rolling Ball": "rolling_ball",
    "None": "none",
    # Smoothing
    "Savitzky-Golay": "savitzky_golay",
    "Moving Average": "moving_average",
    # Fit model
    "Pseudo-Voigt": "pseudo_voigt",
    "Gaussian": "gaussian",
    "Lorentzian": "lorentzian",
    # Reference source
    "Internal Curated": "internal_curated",
    "Project Local Reference": "project_local_reference",
    "Uploaded Reference": "uploaded_reference",
    # Match mode
    "Targeted Candidate Match": "targeted_candidate_match",
    "Candidate Screening": "candidate_screening",
    # Radiation
    "Cu Kα": "cu_ka",
    "Co Kα": "co_ka",
    "Mo Kα": "mo_ka",
    # Claim mode
    "Conservative": "conservative",
    "Standard": "standard",
    "Exploratory": "exploratory",
}


def _normalize_label(value: str, _enum_cls: type) -> str:
    """Return *value* as a valid enum value, normalizing display labels."""
    if value in _LABEL_TO_SAFE:
        return _LABEL_TO_SAFE[value]
    return value


# ── Phase 3 grouped sub-parameter models ───────────────────────────────────


class XRDRangeParameters(BaseModel):
    """2θ acquisition range."""
    two_theta_min: float = Field(default=10.0, ge=0.0, le=180.0)
    two_theta_max: float = Field(default=80.0, ge=0.0, le=180.0)

    @model_validator(mode="after")
    def _validate_range(self) -> "XRDRangeParameters":
        if self.two_theta_max <= self.two_theta_min:
            raise ValueError(
                f"two_theta_max ({self.two_theta_max}) must be greater than "
                f"two_theta_min ({self.two_theta_min})."
            )
        return self


class XRDRadiationParameters(BaseModel):
    """X-ray radiation source configuration."""
    source: RadiationSource = Field(
        default=RadiationSource.CU_KA,
        description="Radiation source identifier.",
    )
    wavelength_angstrom: float = Field(
        default=1.5406,
        gt=0.0,
        description="X-ray wavelength in Ångströms.",
    )

    @field_validator("source", mode="before")
    @classmethod
    def _normalize_source(cls, v: str) -> str:
        return _normalize_label(v, RadiationSource)


class XRDBaselineParameters(BaseModel):
    """Baseline correction parameters (grouped contract)."""
    method: BaselineMethodV2 = Field(
        default=BaselineMethodV2.ASYMMETRIC_LS,
        description="Baseline correction method.",
    )
    lambda_: float = Field(
        default=100000.0,
        alias="lambda",
        gt=0.0,
        description="Baseline smoothing parameter (λ).",
    )
    p: float = Field(
        default=0.01,
        gt=0.0,
        lt=1.0,
        description="Asymmetry parameter (p).",
    )

    @field_validator("method", mode="before")
    @classmethod
    def _normalize_method(cls, v: str) -> str:
        return _normalize_label(v, BaselineMethodV2)


class XRDSmoothingParameters(BaseModel):
    """Smoothing parameters (grouped contract)."""
    method: SmoothingMethodV2 = Field(
        default=SmoothingMethodV2.SAVITZKY_GOLAY,
        description="Smoothing method.",
    )
    window_size: int = Field(
        default=11,
        ge=3,
        le=101,
        description="Smoothing window size (must be odd).",
    )
    polynomial_order: int = Field(
        default=3,
        ge=1,
        le=10,
        description="Polynomial order for Savitzky-Golay.",
    )

    @field_validator("method", mode="before")
    @classmethod
    def _normalize_method(cls, v: str) -> str:
        return _normalize_label(v, SmoothingMethodV2)

    @model_validator(mode="after")
    def _validate_window(self) -> "XRDSmoothingParameters":
        if self.window_size % 2 == 0:
            raise ValueError(
                f"smoothing window_size must be odd, got {self.window_size}."
            )
        if self.polynomial_order >= self.window_size:
            raise ValueError(
                f"polynomial_order ({self.polynomial_order}) must be smaller "
                f"than window_size ({self.window_size})."
            )
        return self


class XRDPeakDetectionParameters(BaseModel):
    """Peak detection parameters (grouped contract).

    Defaults mirror DEFAULT_XRD_PARAMETERS.peakDetection from
    src/config/xrdDefaults.ts.
    """
    min_prominence: float = Field(default=0.03, ge=0.0, le=1.0)
    min_distance_deg: float = Field(default=0.15, gt=0.0, le=10.0)
    min_height_ratio: float = Field(default=0.02, ge=0.0, le=1.0)
    max_peak_count: int = Field(default=40, ge=1, le=200)


class XRDPeakFittingParameters(BaseModel):
    """Peak fitting parameters (grouped contract).

    Defaults mirror DEFAULT_XRD_PARAMETERS.peakFitting from
    src/config/xrdDefaults.ts.
    """
    model: FitModelTypeV2 = Field(
        default=FitModelTypeV2.PSEUDO_VOIGT,
        description="Peak profile model.",
    )
    fit_window_deg: float = Field(default=0.8, gt=0.0, le=10.0)
    max_iterations: int = Field(default=500, ge=1, le=5000)
    calculate_crystallite_size: bool = Field(default=True)

    @field_validator("model", mode="before")
    @classmethod
    def _normalize_model(cls, v: str) -> str:
        return _normalize_label(v, FitModelTypeV2)


class XRDReferenceMatchParameters(BaseModel):
    """Reference match parameters (grouped contract).

    Defaults mirror DEFAULT_XRD_PARAMETERS.referenceMatch from
    src/config/xrdDefaults.ts.
    """
    enabled: bool = Field(default=True)
    match_mode: MatchMode = Field(default=MatchMode.TARGETED_CANDIDATE_MATCH)
    reference_source: ReferenceSourceV2 = Field(
        default=ReferenceSourceV2.INTERNAL_CURATED,
    )
    reference_set_id: Optional[str] = Field(
        default="spinel_ferrite_sba15_demo_set",
    )
    candidate_phase_ids: List[str] = Field(default_factory=list)
    tolerance_two_theta: float = Field(default=0.5, gt=0.0, le=5.0)
    min_matched_peaks: int = Field(default=3, ge=1, le=50)
    min_coverage_ratio: float = Field(default=0.5, ge=0.0, le=1.0)
    min_score: float = Field(default=0.65, ge=0.0, le=1.0)
    use_relative_intensity: bool = Field(default=False)
    intensity_tolerance_ratio: float = Field(default=0.5, ge=0.0, le=1.0)
    allow_unknown_search: bool = Field(default=False)
    allow_identity_claim: bool = Field(default=False)
    allow_phase_purity_claim: bool = Field(default=False)

    @field_validator("match_mode", mode="before")
    @classmethod
    def _normalize_match_mode(cls, v: str) -> str:
        return _normalize_label(v, MatchMode)

    @field_validator("reference_source", mode="before")
    @classmethod
    def _normalize_ref_source(cls, v: str) -> str:
        return _normalize_label(v, ReferenceSourceV2)


# ============================================================================
# Multi-Technique Upload Response Schema
# ============================================================================


class UploadAnalysisResponse(BaseModel):
    """Response schema for the multi-technique analysis upload endpoint."""

    success: bool = Field(
        ...,
        description="Whether the upload and parsing succeeded.",
    )
    fileId: str = Field(
        ...,
        description="Unique identifier (UUID) assigned to this upload.",
    )
    technique: str = Field(
        ...,
        description="The characterization technique used (XRD, XPS, FTIR, Raman).",
    )
    metadata: Dict[str, Any] = Field(
        ...,
        description=(
            "File metadata including fileName, fileSize, contentType, and pointCount."
        ),
    )
    parsed_features: List[Dict[str, Any]] = Field(
        default_factory=list,
        description=(
            "List of parsed features / evidence nodes in Universal Schema format."
        ),
    )
    message: str = Field(
        default="",
        description="Human-readable status message.",
    )


# ============================================================================
# Phase 4A/4B — Reference-match v2 response models
#
# Candidate evidence only.  phase_confirmed and phase_purity_confirmed are
# ALWAYS false in these models; the system does not yet make confirmed
# identity or phase-purity claims.
# ============================================================================


class XRDReferencePeak(BaseModel):
    """A single curated reference peak."""
    two_theta: float
    relative_intensity: float = Field(default=100.0, ge=0, le=100)
    hkl: Optional[str] = None
    d_spacing: Optional[float] = None


class XRDReferencePhase(BaseModel):
    """A curated reference phase with its peaks."""
    phase_id: str
    phase_label: str
    formula: str
    structure_family: str
    elements: List[str] = Field(default_factory=list)
    database_ref: Optional[str] = None
    peaks: List[XRDReferencePeak] = Field(default_factory=list)


class XRDReferenceSet(BaseModel):
    """A curated reference set for matching."""
    reference_set_id: str
    label: str
    phases: List[XRDReferencePhase] = Field(default_factory=list)


class XRDMatchedPeak(BaseModel):
    """A paired match between a measured peak and a reference peak."""
    measured_two_theta: float
    reference_two_theta: float
    delta_two_theta: float
    hkl: Optional[str] = None
    reference_relative_intensity: Optional[float] = None


class XRDReferenceCandidateResult(BaseModel):
    """Ranking and evidence for a single reference candidate."""
    phase_id: str
    phase_label: str
    formula: str
    structure_family: str
    elements: List[str] = Field(default_factory=list)
    database_ref: Optional[str] = None
    matched_peak_count: int = 0
    reference_peak_count: int = 0
    coverage_ratio: float = 0.0
    mean_delta_two_theta: Optional[float] = None
    position_score: float = 0.0
    coverage_score: float = 0.0
    chemistry_score: float = 0.0
    score: float = 0.0
    matched_peaks: List[XRDMatchedPeak] = Field(default_factory=list)


class XRDReferenceMatchResult(BaseModel):
    """V2 reference-match result.  Candidate evidence only; never confirms phase identity.

    Phase 7C additions:
        - backend_available: False if reference set missing/unavailable
        - reason: Explicit message for unavailable/blocked/no_match cases
    """
    status: str = "candidate_match"
    claim_level: str = "reference_supported_candidate"
    phase_confirmed: bool = False
    phase_purity_confirmed: bool = False
    reference_set_id: str = ""
    candidate_count: int = 0
    ranked_candidates: List[XRDReferenceCandidateResult] = Field(default_factory=list)
    primary_candidate: Optional[XRDReferenceCandidateResult] = None
    backend_available: bool = Field(
        default=True,
        description="False if reference set is missing or unavailable in backend registry."
    )
    reason: Optional[str] = Field(
        default=None,
        description="Explicit status reason for unavailable/blocked/no_match cases."
    )
    limitations: List[str] = Field(default_factory=lambda: [
        "Candidate match is based on peak-position agreement.",
        "Chemical identity requires composition-sensitive evidence.",
        "Phase purity is not confirmed by XRD matching alone.",
    ])


class XRDBoundaryParameters(BaseModel):
    """Boundary / claim-limiting parameters (grouped contract).

    Defaults mirror DEFAULT_XRD_PARAMETERS.boundary from
    src/config/xrdDefaults.ts.
    """
    enabled: bool = Field(default=True)
    claim_mode: ClaimMode = Field(default=ClaimMode.STANDARD)
    allow_identity_claim: bool = Field(default=False)
    allow_phase_purity_claim: bool = Field(default=False)
    require_complementary_evidence: bool = Field(default=True)
    require_reference_set_for_match: bool = Field(default=True)
    require_sample_context_for_targeted_match: bool = Field(default=True)

    @field_validator("claim_mode", mode="before")
    @classmethod
    def _normalize_claim_mode(cls, v: str) -> str:
        return _normalize_label(v, ClaimMode)

    @model_validator(mode="after")
    def _enforce_boundary_flags(self) -> "XRDBoundaryParameters":
        if self.allow_identity_claim is True:
            raise ValueError(
                "allow_identity_claim must remain false; "
                "phase identity claims are not yet validated."
            )
        if self.allow_phase_purity_claim is True:
            raise ValueError(
                "allow_phase_purity_claim must remain false; "
                "phase purity claims are not yet validated."
            )
        return self


# ── Top-level grouped parameters ───────────────────────────────────────────


class XRDParameters(BaseModel):
    """
    Complete grouped XRD parameter contract.

    Mirrors the frontend ``XRDParameters`` interface from
    ``src/types/xrdParameters.ts`` with defaults from
    ``src/config/xrdDefaults.ts``.
    """
    range: XRDRangeParameters = Field(default_factory=XRDRangeParameters)
    radiation: XRDRadiationParameters = Field(default_factory=XRDRadiationParameters)
    baseline: XRDBaselineParameters = Field(default_factory=XRDBaselineParameters)
    smoothing: XRDSmoothingParameters = Field(default_factory=XRDSmoothingParameters)
    peak_detection: XRDPeakDetectionParameters = Field(
        default_factory=XRDPeakDetectionParameters,
    )
    peak_fitting: XRDPeakFittingParameters = Field(
        default_factory=XRDPeakFittingParameters,
    )
    reference_match: XRDReferenceMatchParameters = Field(
        default_factory=XRDReferenceMatchParameters,
    )
    boundary: XRDBoundaryParameters = Field(default_factory=XRDBoundaryParameters)


class XRDDatasetContext(BaseModel):
    """
    Dataset context metadata for XRD processing.

    Mirrors the frontend ``XRDDatasetContext`` interface from
    ``src/types/xrdDatasetContext.ts``.
    """
    sample_id: Optional[str] = Field(default=None)
    sample_name: Optional[str] = Field(default=None)
    material_class: Optional[str] = Field(default=None)
    batch_id: Optional[str] = Field(default=None)
    known_elements: List[str] = Field(default_factory=list)
    expected_elements: List[str] = Field(default_factory=list)
    excluded_elements: List[str] = Field(default_factory=list)
    declared_phases: List[str] = Field(default_factory=list)
    candidate_phase_ids: List[str] = Field(default_factory=list)
    excluded_phase_ids: List[str] = Field(default_factory=list)
    reference_source: ReferenceSourceV2 = Field(
        default=ReferenceSourceV2.INTERNAL_CURATED,
    )
    reference_set_id: Optional[str] = Field(default=None)
    identity_source: IdentitySource = Field(default=IdentitySource.UNKNOWN)
    identity_confidence: IdentityConfidence = Field(
        default=IdentityConfidence.UNKNOWN,
    )

    @field_validator("reference_source", mode="before")
    @classmethod
    def _normalize_ref_source(cls, v: str) -> str:
        return _normalize_label(v, ReferenceSourceV2)
