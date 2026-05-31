"""
DIFARYX XRD Processing Engine — FastAPI Gateway.

REST API for XRD data processing, peak detection, peak fitting,
and reference database phase matching.

Endpoints:
    GET  /health                — Service health check
    POST /process               — Full XRD processing pipeline (JSON body)
    POST /process/upload        — Full XRD processing pipeline (CSV upload)
    POST /match                 — Reference database phase matching

Launch:
    uvicorn api.gateway:app --host 0.0.0.0 --port 8000 --reload
"""

from __future__ import annotations

import io
import json
import logging
import sys
import time
import uuid
import datetime
import hashlib
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Optional
from contextvars import ContextVar

import numpy as np
import pandas as pd
from fastapi import FastAPI, File, Form, HTTPException, UploadFile, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from api.schemas import (
    DetectedPeakResponse,
    ErrorResponse,
    FittedPeakResponse,
    HealthResponse,
    MatchRequest,
    PeakMatchResponse,
    PhaseMatchResponse,
    ReferenceMarkerResponse,
    XRDClaimBoundary,
    XRDGeneralSampleAssessment,
    XRDProcessRequest,
    XRDProcessResponse,
    ScienceSkill,
    ScientificEvidenceObject,
    XRDSkillProcessResponse,
)
from xrd_engine.domain.models.xrd_params import (
    BaselineParams,
    DatabaseParams,
    FitModelParams,
    SmoothingParams,
    XRDPipelineConfig,
)
from xrd_engine.services.reference_db_service import (
    FittedPeak,
    match_local_reference_candidate,
    match_peaks,
    match_reference_candidates,
)
from xrd_engine.services.xrd_engine import XRDSignalProcessor
from xrd_engine.services.general_sample_assessment import (
    assess_general_sample,
    compute_claim_boundary,
)
from api.evidence_router import router as evidence_router
from api.analysis_router import router as analysis_router

# ============================================================================
# Production-Ready Configuration (Step 5)
# ============================================================================

# Schema version for all responses
BACKEND_SCHEMA_VERSION = "1.1.0"

# Request safety limits
MAX_DATA_POINTS = 10000
MIN_DATA_POINTS = 10

# Context variable for request tracking
request_id_var: ContextVar[str] = ContextVar("request_id", default="")

# ============================================================================
# Structured JSON Logging (Step 5)
# ============================================================================

class StructuredLogger:
    """Structured JSON logger for production observability."""
    
    def __init__(self, name: str):
        self.logger = logging.getLogger(name)
        self.logger.setLevel(logging.INFO)
        
        # JSON formatter
        if not self.logger.handlers:
            handler = logging.StreamHandler(sys.stdout)
            handler.setFormatter(logging.Formatter(
                '{"timestamp": "%(asctime)s", "level": "%(levelname)s", '
                '"logger": "%(name)s", "message": "%(message)s", %(extra)s}'
            ))
            self.logger.addHandler(handler)
    
    def _get_request_id(self) -> str:
        """Get current request ID from context."""
        return request_id_var.get()
    
    def _format_extra(self, **kwargs) -> str:
        """Format extra fields as JSON."""
        request_id = self._get_request_id()
        if request_id:
            kwargs["request_id"] = request_id
        
        # Convert to JSON string without outer braces
        if kwargs:
            pairs = [f'"{k}": {json.dumps(v)}' for k, v in kwargs.items()]
            return ", ".join(pairs)
        return '"context": "none"'
    
    def info(self, msg: str, **kwargs):
        """Log info with structured context."""
        extra_str = self._format_extra(**kwargs)
        # Use old-style formatting to inject extra into LogRecord
        self.logger.info(msg, extra={"extra": extra_str})
    
    def warning(self, msg: str, **kwargs):
        """Log warning with structured context."""
        extra_str = self._format_extra(**kwargs)
        self.logger.warning(msg, extra={"extra": extra_str})
    
    def error(self, msg: str, **kwargs):
        """Log error with structured context."""
        extra_str = self._format_extra(**kwargs)
        self.logger.error(msg, extra={"extra": extra_str})
    
    def exception(self, msg: str, **kwargs):
        """Log exception with structured context."""
        extra_str = self._format_extra(**kwargs)
        self.logger.exception(msg, extra={"extra": extra_str})

logger = StructuredLogger("difaryx.xrd.gateway")


# ============================================================================
# Application lifecycle
# ============================================================================


# Engine readiness state
_engine_loaded = False
_reference_registry_loaded = False

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown lifecycle events."""
    global _engine_loaded, _reference_registry_loaded
    
    logger.info("DIFARYX XRD Gateway starting up", version=BACKEND_SCHEMA_VERSION)
    
    # Check engine initialization
    try:
        # Test engine instantiation
        from xrd_engine.domain.models.xrd_params import XRDPipelineConfig
        config = XRDPipelineConfig()
        _ = XRDSignalProcessor(config)
        _engine_loaded = True
        logger.info("XRD processing engine loaded successfully")
    except Exception as e:
        logger.error("Failed to load XRD processing engine", error=str(e))
    
    # Check reference registry
    try:
        from xrd_engine.services.reference_db_service import match_peaks
        _reference_registry_loaded = True
        logger.info("Reference registry loaded successfully")
    except Exception as e:
        logger.error("Failed to load reference registry", error=str(e))
    
    yield
    logger.info("DIFARYX XRD Gateway shutting down")


# ============================================================================
# FastAPI application
# ============================================================================

app = FastAPI(
    title="DIFARYX XRD Processing Engine",
    description=(
        "REST API for autonomous X-ray Diffraction signal processing, "
        "peak detection, non-linear peak fitting, and crystallographic "
        "reference database matching."
    ),
    version=BACKEND_SCHEMA_VERSION,
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# ============================================================================
# Middleware: Request ID tracking (Step 5)
# ============================================================================

@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    """Generate and inject request_id for every transaction."""
    req_id = str(uuid.uuid4())
    request_id_var.set(req_id)
    
    logger.info(
        f"Request started: {request.method} {request.url.path}",
        method=request.method,
        path=request.url.path,
        client=str(request.client.host) if request.client else "unknown"
    )
    
    start_time = time.perf_counter()
    response = await call_next(request)
    duration = time.perf_counter() - start_time
    
    logger.info(
        f"Request completed: {request.method} {request.url.path}",
        method=request.method,
        path=request.url.path,
        status_code=response.status_code,
        duration_ms=round(duration * 1000, 2)
    )
    
    # Inject request ID into response headers
    response.headers["X-Request-ID"] = req_id
    return response


# CORS — allow frontend dev server and production origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5174",  # Frontend React dev server (Vite)
        "*",  # Allow all origins (tighten in production)
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register the Evidence Registry router
app.include_router(evidence_router)

# Register the Multi-Technique Analysis Upload router
app.include_router(analysis_router)


# ============================================================================
# Request Validation Utilities (Step 5)
# ============================================================================

def validate_signal_arrays(x: List[float], y: List[float]) -> None:
    """
    Validate XRD signal arrays for production safety.
    
    Raises:
        HTTPException(400): Invalid array structure or dimensions
        HTTPException(422): Mathematically non-compliant signal
    """
    # Check presence
    if x is None or y is None:
        raise HTTPException(
            status_code=400,
            detail="Both 'x' (2θ array) and 'y' (intensity array) are required."
        )
    
    # Check types
    if not isinstance(x, list) or not isinstance(y, list):
        raise HTTPException(
            status_code=400,
            detail="Arrays must be lists of numeric values."
        )
    
    # Check length match
    if len(x) != len(y):
        raise HTTPException(
            status_code=400,
            detail=(
                f"Array length mismatch: x has {len(x)} elements, "
                f"y has {len(y)} elements."
            ),
        )
    
    # Check minimum points
    if len(x) < MIN_DATA_POINTS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Insufficient data points. Minimum {MIN_DATA_POINTS} required, "
                f"got {len(x)}."
            ),
        )
    
    # Step 5: Enforce maximum points safety limit
    if len(x) > MAX_DATA_POINTS:
        logger.warning(
            f"Signal exceeds maximum point limit",
            received_points=len(x),
            max_points=MAX_DATA_POINTS
        )
        raise HTTPException(
            status_code=400,
            detail=(
                f"Signal exceeds maximum point limit. Maximum {MAX_DATA_POINTS} points allowed, "
                f"got {len(x)} points. Please downsample the signal before processing."
            ),
        )
    
    # Check for NaN/Inf values
    try:
        x_arr = np.array(x, dtype=float)
        y_arr = np.array(y, dtype=float)
        
        if not np.all(np.isfinite(x_arr)):
            raise HTTPException(
                status_code=422,
                detail="2-theta array contains NaN or Inf values."
            )
        
        if not np.all(np.isfinite(y_arr)):
            raise HTTPException(
                status_code=422,
                detail="Intensity array contains NaN or Inf values."
            )
        
        # Check for monotonicity in x (2-theta should be increasing)
        if not np.all(np.diff(x_arr) > 0):
            logger.warning("2-theta array is not strictly monotonically increasing")
            raise HTTPException(
                status_code=422,
                detail=(
                    "2-theta array must be strictly monotonically increasing. "
                    "Signal appears corrupted or misordered."
                ),
            )
        
    except (ValueError, TypeError) as e:
        raise HTTPException(
            status_code=400,
            detail=f"Array contains non-numeric values: {str(e)}"
        )


# ============================================================================
# Health check (Step 5: Production-ready with readiness checks)
# ============================================================================


@app.get("/health", response_model=HealthResponse, tags=["System"])
async def health_check():
    """
    Production-ready health check endpoint.
    
    Differentiates between liveness (service is running) and readiness
    (service dependencies are loaded and ready to serve requests).
    
    Returns:
        HealthResponse with status, schema_version, and readiness checks.
    """
    # Liveness: service is running
    status = "healthy"
    
    # Readiness: check if engines are loaded
    readiness = {
        "engine_loaded": _engine_loaded,
        "reference_registry_loaded": _reference_registry_loaded,
    }
    
    logger.info(
        "Health check executed",
        status=status,
        engine_loaded=_engine_loaded,
        registry_loaded=_reference_registry_loaded
    )
    
    return HealthResponse(
        status=status,
        engine="xrd",
        version=BACKEND_SCHEMA_VERSION,
        schema_version=BACKEND_SCHEMA_VERSION,
        readiness=readiness,
    )


# ============================================================================
# Helper: build domain config from API request
# ============================================================================

_SAFE_TO_LABEL = {
    "asymmetric_ls": "Asymmetric LS",
    "polynomial": "Polynomial",
    "rolling_ball": "Rolling Ball",
    "none": "None",
    "savitzky_golay": "Savitzky-Golay",
    "moving_average": "Moving Average",
    "pseudo_voigt": "Pseudo-Voigt",
    "gaussian": "Gaussian",
    "lorentzian": "Lorentzian",
}

def _to_legacy_label(val: str) -> str:
    return _SAFE_TO_LABEL.get(val, val)


def _build_config(request: XRDProcessRequest) -> XRDPipelineConfig:
    """
    Convert an API request schema into a validated domain config.

    Args:
        request: Incoming API processing request.

    Returns:
        Validated XRDPipelineConfig for the engine.
    """
    baseline = BaselineParams(
        method=request.baseline.method.value,
        poly_order=request.baseline.poly_order,
        half_window=request.baseline.half_window,
    )
    smoothing = SmoothingParams(
        method=request.smoothing.method.value,
        window_length=request.smoothing.window_length,
    )
    fit_model = FitModelParams(
        model_type=request.fit_model.model_type.value,
    )
    database = DatabaseParams(
        reference_db=request.database.reference_db.value,
    )

    wavelength = request.wavelength
    theta_min = request.theta_min
    theta_max = request.theta_max
    peak_threshold = request.peak_threshold
    min_prominence = request.min_prominence

    if request.parameters:
        p = request.parameters
        if p.radiation:
            wavelength = p.radiation.wavelength_angstrom
        if p.range:
            theta_min = p.range.two_theta_min
            theta_max = p.range.two_theta_max
        if p.peak_detection:
            peak_threshold = p.peak_detection.min_height_ratio
            min_prominence = p.peak_detection.min_prominence
        if p.baseline:
            baseline = BaselineParams(
                method=_to_legacy_label(p.baseline.method.value),
                poly_order=request.baseline.poly_order,
                half_window=request.baseline.half_window,
            )
        if p.smoothing:
            smoothing = SmoothingParams(
                method=_to_legacy_label(p.smoothing.method.value),
                window_length=p.smoothing.window_size,
            )
        if p.peak_fitting:
            fit_model = FitModelParams(
                model_type=_to_legacy_label(p.peak_fitting.model.value),
            )

    return XRDPipelineConfig(
        baseline=baseline,
        smoothing=smoothing,
        fit_model=fit_model,
        database=database,
        wavelength=wavelength,
        theta_min=theta_min,
        theta_max=theta_max,
        peak_threshold=peak_threshold,
        min_prominence=min_prominence,
    )




# ============================================================================
# Phase X1: Helper functions for dataset context echo and processing provenance
# ============================================================================

def _build_dataset_context_echo(request):
    """Build dataset context echo from request (Phase X1)."""
    from api.schemas import XRDDatasetContextEcho

    if not request.dataset_context:
        return None

    ctx = request.dataset_context
    return XRDDatasetContextEcho(
        sample_id=ctx.sample_id,
        sample_name=ctx.sample_name,
        material_class=ctx.material_class,
        known_elements=list(ctx.known_elements) if ctx.known_elements else [],
        declared_phases=list(ctx.declared_phases) if ctx.declared_phases else [],
        candidate_phase_ids=list(ctx.candidate_phase_ids) if ctx.candidate_phase_ids else [],
        excluded_phase_ids=list(ctx.excluded_phase_ids) if ctx.excluded_phase_ids else [],
        reference_source=ctx.reference_source.value if ctx.reference_source else None,
        reference_set_id=ctx.reference_set_id,
        identity_source=ctx.identity_source.value if ctx.identity_source else None,
        identity_confidence=ctx.identity_confidence.value if ctx.identity_confidence else None,
    )


def _build_processing_provenance(request):
    """Build processing provenance from request (Phase X1)."""
    from api.schemas import XRDProcessingProvenance

    # Determine processing mode
    has_grouped = request.parameters is not None
    has_dataset_ctx = request.dataset_context is not None
    has_local_ref = request.local_reference is not None and request.local_reference.enabled

    # Determine which parameters source to use
    if has_grouped:
        processing_mode = "grouped_parameters"
        param_contract = "grouped_v1"
        params = request.parameters

        # Extract reference match enabled
        ref_match_enabled = params.reference_match.enabled if params.reference_match else False
        ref_set_id = (params.reference_match.reference_set_id
                      if params.reference_match and params.reference_match.enabled
                      else None)

        return XRDProcessingProvenance(
            parameter_contract_version=param_contract,
            backend_schema_version=BACKEND_SCHEMA_VERSION,
            processing_mode=processing_mode,
            received_grouped_parameters=True,
            received_dataset_context=has_dataset_ctx,
            received_local_reference=has_local_ref,
            local_reference_enabled=has_local_ref,
            reference_match_enabled=ref_match_enabled,
            reference_set_id=ref_set_id,
            radiation_source=params.radiation.source.value if params.radiation else None,
            wavelength_angstrom=params.radiation.wavelength_angstrom if params.radiation else None,
            two_theta_min=params.range.two_theta_min if params.range else None,
            two_theta_max=params.range.two_theta_max if params.range else None,
            baseline_method=params.baseline.method.value if params.baseline else None,
            smoothing_method=params.smoothing.method.value if params.smoothing else None,
            peak_fit_model=params.peak_fitting.model.value if params.peak_fitting else None,
            peak_detection_min_prominence=params.peak_detection.min_prominence if params.peak_detection else None,
            max_peak_count=params.peak_detection.max_peak_count if params.peak_detection else None,
            created_at=datetime.datetime.utcnow().isoformat() + "Z",
        )
    else:
        # Legacy flat parameters
        processing_mode = "legacy_flat"
        param_contract = "legacy_flat"

        # Extract legacy fields from request
        wavelength = getattr(request, 'wavelength', None)
        theta_min = getattr(request, 'theta_min', None)
        theta_max = getattr(request, 'theta_max', None)

        return XRDProcessingProvenance(
            parameter_contract_version=param_contract,
            backend_schema_version=BACKEND_SCHEMA_VERSION,
            processing_mode=processing_mode,
            received_grouped_parameters=False,
            received_dataset_context=has_dataset_ctx,
            received_local_reference=has_local_ref,
            local_reference_enabled=has_local_ref,
            reference_match_enabled=False,  # Legacy doesn't have explicit reference match toggle
            reference_set_id=None,
            radiation_source=None,  # Not available in legacy
            wavelength_angstrom=wavelength,
            two_theta_min=theta_min,
            two_theta_max=theta_max,
            baseline_method=None,  # Would need to extract from config if needed
            smoothing_method=None,
            peak_fit_model=None,
            peak_detection_min_prominence=None,
            max_peak_count=None,
            created_at=datetime.datetime.utcnow().isoformat() + "Z",
        )


# ============================================================================
# Helper: convert engine results to API response
# ============================================================================


def _build_response(
    result,
    phase_match_result=None,
    reference_match_v2_result=None,
    general_sample_assessment=None,
    xrd_claim_boundary=None,
    request=None,
) -> XRDProcessResponse:
    """
    Convert engine ProcessingResult to an API response model.

    Args:
        result: ProcessingResult from XRDSignalProcessor.run().
        phase_match_result: Optional PhaseMatchResult from reference_db_service.
        reference_match_v2_result: Optional dict from match_reference_candidates.
        general_sample_assessment: Optional general-sample assessment dict.
        xrd_claim_boundary: Optional claim boundary dict.

    Returns:
        Serialized XRDProcessResponse.
    """
    detected = [
        DetectedPeakResponse(
            position=p.position,
            intensity=p.intensity,
            index=p.index,
            prominence=p.prominence,
            fwhm=p.fwhm,
        )
        for p in result.detected_peaks
    ]

    fitted = [
        FittedPeakResponse(
            center=p.center,
            amplitude=p.amplitude,
            fwhm=p.fwhm,
            area=p.area,
            model_type=p.model_type,
            residual_rms=p.residual_rms,
            crystallite_size=p.crystallite_size,
        )
        for p in result.fitted_peaks
    ]

    phase_match_resp: Optional[PhaseMatchResponse] = None
    if phase_match_result is not None:
        peak_matches = [
            PeakMatchResponse(
                measured_center=pm.measured_center,
                reference_marker=ReferenceMarkerResponse(
                    hkl=pm.reference_marker.hkl,
                    d_spacing=pm.reference_marker.d_spacing,
                    position_2theta=pm.reference_marker.position_2theta,
                    relative_intensity=pm.reference_marker.relative_intensity,
                    phase_label=pm.reference_marker.phase_label,
                ),
                delta_2theta=pm.delta_2theta,
                confidence=pm.confidence,
                db_source=pm.db_source,
            )
            for pm in phase_match_result.matched_peaks
        ]
        phase_match_resp = PhaseMatchResponse(
            primary_phase=phase_match_result.primary_phase,
            matched_peaks=peak_matches,
            db_source=phase_match_result.db_source,
            catalog_id=phase_match_result.catalog_id,
            summary=phase_match_result.summary,
        )

    from api.schemas import XRDReferenceMatchResult

    ref_match_v2_resp: Optional[XRDReferenceMatchResult] = None
    if reference_match_v2_result is not None:
        ref_match_v2_resp = XRDReferenceMatchResult(**reference_match_v2_result)

    # Phase X1: Build echo and provenance
    dataset_context_echo = _build_dataset_context_echo(request) if request else None
    processing_provenance = _build_processing_provenance(request) if request else None

    return XRDProcessResponse(
        x=result.x.tolist(),
        y_raw=result.y_raw.tolist(),
        y_smoothed=result.y_smoothed.tolist(),
        y_baseline=result.y_baseline.tolist(),
        y_corrected=result.y_corrected.tolist(),
        y_residual=result.y_residual.tolist(),
        detected_peaks=detected,
        fitted_peaks=fitted,
        phase_match=phase_match_resp,
        reference_match_v2=ref_match_v2_resp,
        general_sample_assessment=general_sample_assessment,
        xrd_claim_boundary=xrd_claim_boundary,
        sn_ratio=result.sn_ratio,
        baseline_deviation=result.baseline_deviation,
        peak_resolution=result.peak_resolution,
        dataset_context_echo=dataset_context_echo,
        processing_provenance=processing_provenance,
    )


# ============================================================================
# POST /process — Full XRD pipeline (JSON body)
# ============================================================================

def _extract_reference_match_measured_peaks(result) -> List[dict]:
    """Prefer fitted centers for reference matching; fall back to detected positions."""
    if result.fitted_peaks:
        return [{"center": fp.center} for fp in result.fitted_peaks]
    if result.detected_peaks:
        return [{"center": dp.position} for dp in result.detected_peaks]
    return []


@app.post(
    "/process",
    response_model=XRDProcessResponse,
    responses={400: {"model": ErrorResponse}, 422: {"model": ErrorResponse}},
    tags=["XRD Processing"],
)
async def process_xrd(request: XRDProcessRequest):
    """
    Run the full XRD processing pipeline on inline JSON data.

    Steps executed:
        1. Baseline correction (configurable method)
        2. Smoothing (configurable method)
        3. Peak detection (scipy find_peaks)
        4. Peak fitting (lmfit, configurable model)
        5. Phase matching (reference database)

    Data can be provided as `x` and `y` arrays in the JSON body,
    or uploaded separately via the `/process/upload` endpoint.
    """
    # Step 5: Log request arrival
    logger.info(
        "Processing XRD signal",
        stage="request_received",
        data_points=len(request.x) if request.x else 0
    )
    
    # Step 5: Use centralized validation with production guardrails
    validate_signal_arrays(request.x, request.y)

    try:
        # Build domain config
        t0 = time.perf_counter()
        logger.info("Building pipeline configuration", stage="config_build")
        config = _build_config(request)

        # Run processor
        logger.info("Starting XRD signal processing", stage="processing_start")
        processor = XRDSignalProcessor(config)
        result = processor.run(request.x, request.y)
        t_process = time.perf_counter()
        logger.info(
            "Signal processing completed",
            stage="processing_complete",
            detected_peaks=len(result.detected_peaks),
            fitted_peaks=len(result.fitted_peaks),
            duration_ms=round((t_process - t0) * 1000, 2)
        )

        # Run phase matching against fitted peaks
        logger.info("Starting phase matching", stage="phase_match_start")
        phase_match_result = None
        if result.fitted_peaks:
            phase_match_result = match_peaks(
                evidence_peaks=result.fitted_peaks,
                db_type=config.database.reference_db,
            )
        t_match = time.perf_counter()
        logger.info(
            "Phase matching completed",
            stage="phase_match_complete",
            duration_ms=round((t_match - t_process) * 1000, 2)
        )

        # Phase 4: v2 reference-match candidate evidence (additive)
        reference_match_v2_result = None
        try:
            ref_params = (request.parameters.reference_match
                          if request.parameters else None)
            ctx = request.dataset_context
            measured_peaks = _extract_reference_match_measured_peaks(result)

            # Case: enabled but no reference_set_id → blocked
            # Explicit request-scoped local reference takes precedence only when enabled.
            if request.local_reference and request.local_reference.enabled:
                tolerance_two_theta = (
                    ref_params.tolerance_two_theta
                    if ref_params else 0.5
                )
                min_score = ref_params.min_score if ref_params else 0.65
                reference_match_v2_result = match_local_reference_candidate(
                    measured_peaks=measured_peaks,
                    local_reference=request.local_reference,
                    tolerance_two_theta=tolerance_two_theta,
                    min_score=min_score,
                )
            elif ref_params and ref_params.enabled and not ref_params.reference_set_id:
                reference_match_v2_result = {
                    "status": "blocked",
                    "claim_level": "none",
                    "phase_confirmed": False,
                    "phase_purity_confirmed": False,
                    "reference_set_id": "",
                    "candidate_count": 0,
                    "ranked_candidates": [],
                    "primary_candidate": None,
                    "backend_available": False,
                    "reason": "Reference matching requires a selected reference set.",
                    "limitations": [
                        "Candidate match is based on peak-position agreement.",
                        "Chemical identity requires composition-sensitive evidence.",
                        "Phase purity is not confirmed by XRD matching alone.",
                    ],
                }
            elif ref_params and ref_params.enabled and ref_params.reference_set_id:
                # Prefer fitted_peaks center; fallback to detected_peaks position
                measured_peaks: List[dict] = []
                if result.fitted_peaks:
                    measured_peaks = [
                        {"center": fp.center}
                        for fp in result.fitted_peaks
                    ]
                elif result.detected_peaks:
                    measured_peaks = [
                        {"center": dp.position}
                        for dp in result.detected_peaks
                    ]

                # Merge candidate phase IDs from parameters + dataset context
                candidate_ids = list(ref_params.candidate_phase_ids or [])
                if ctx and ctx.candidate_phase_ids:
                    for pid in ctx.candidate_phase_ids:
                        if pid not in candidate_ids:
                            candidate_ids.append(pid)

                excluded_ids = list(ctx.excluded_phase_ids) if ctx else []

                reference_match_v2_result = match_reference_candidates(
                    measured_peaks=measured_peaks,
                    reference_set_id=ref_params.reference_set_id,
                    tolerance_two_theta=ref_params.tolerance_two_theta,
                    candidate_phase_ids=candidate_ids or None,
                    excluded_phase_ids=excluded_ids or None,
                    known_elements=list(ctx.known_elements) if ctx else None,
                    min_score=ref_params.min_score,
                )
        except Exception as exc:
            logger.warning("Phase 4 reference_match_v2 failed (non-fatal)", error=str(exc), stage="ref_v2_warning")
            reference_match_v2_result = None

        t_ref_v2 = time.perf_counter()

        # Phase 7A: general-sample assessment + claim boundary (always computed)
        assessment_dict = assess_general_sample(
            detected_peaks=result.detected_peaks,
            fitted_peaks=result.fitted_peaks,
            sn_ratio=result.sn_ratio,
            theta_min=request.theta_min,
            theta_max=request.theta_max,
            reference_match_v2=reference_match_v2_result,
        )
        claim_boundary_dict = compute_claim_boundary(
            assessment=assessment_dict,
            reference_match_v2=reference_match_v2_result,
        )
        general_assessment_model = XRDGeneralSampleAssessment(**assessment_dict)
        claim_boundary_model = XRDClaimBoundary(**claim_boundary_dict)
        t_assess = time.perf_counter()

        n_points = len(request.x)
        n_det = len(result.detected_peaks)
        n_fit = len(result.fitted_peaks)
        logger.info(
            "XRD pipeline summary",
            stage="assessment_complete",
            data_points=n_points,
            detected_peaks=n_det,
            fitted_peaks=n_fit,
            process_ms=round((t_process - t0) * 1000, 2),
            match_ms=round((t_match - t_process) * 1000, 2),
            ref_v2_ms=round((t_ref_v2 - t_match) * 1000, 2),
            assess_ms=round((t_assess - t_ref_v2) * 1000, 2),
            total_ms=round((t_assess - t0) * 1000, 2)
        )

        # Step 5: Inject schema version into response via processing provenance
        response = _build_response(
            result,
            phase_match_result,
            reference_match_v2_result,
            general_assessment_model,
            claim_boundary_model,
            request=request,
        )
        
        # Override backend_schema_version in provenance
        if response.processing_provenance:
            response.processing_provenance.backend_schema_version = BACKEND_SCHEMA_VERSION
        
        logger.info(
            "Request completed successfully",
            stage="complete",
            total_duration_ms=round((t_assess - t0) * 1000, 2)
        )
        
        return response

    except HTTPException:
        # Re-raise HTTP exceptions (already properly formatted)
        raise
    except ValueError as exc:
        logger.error("Validation error during processing", error=str(exc), stage="error")
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.exception("Unexpected error during XRD processing", stage="fatal_error")
        raise HTTPException(
            status_code=500,
            detail=f"Internal processing error: {exc}",
        )


# ============================================================================
# POST /process/upload — Full XRD pipeline (CSV file upload)
# ============================================================================


@app.post(
    "/process/upload",
    response_model=XRDProcessResponse,
    responses={400: {"model": ErrorResponse}, 422: {"model": ErrorResponse}},
    tags=["XRD Processing"],
)
async def process_xrd_upload(
    file: UploadFile = File(
        ...,
        description=(
            "CSV file with XRD data. Expected columns: '2theta' (or 'x') "
            "and 'intensity' (or 'y'). If headers are absent, first column "
            "is treated as 2θ and second as intensity."
        ),
    ),
    baseline_method: str = Form(default="Asymmetric LS"),
    poly_order: int = Form(default=3),
    half_window: int = Form(default=50),
    smoothing_method: str = Form(default="Savitzky-Golay"),
    window_length: int = Form(default=11),
    fit_model: str = Form(default="Pseudo-Voigt"),
    reference_db: str = Form(default="ICSD"),
    wavelength: float = Form(default=1.5406),
    theta_min: float = Form(default=10.0),
    theta_max: float = Form(default=80.0),
    peak_threshold: float = Form(default=0.12),
    min_prominence: float = Form(default=0.08),
):
    """
    Run the full XRD processing pipeline on uploaded CSV data.

    Accepts a CSV file via multipart/form-data with processing
    parameters as form fields.
    """
    # Read and parse CSV
    try:
        contents = await file.read()
        csv_text = contents.decode("utf-8", errors="replace")
        df = pd.read_csv(
            io.StringIO(csv_text),
            header=None if _has_no_header(csv_text) else "infer",
        )
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to parse CSV file: {exc}",
        )

    # Extract x and y columns
    try:
        x_data, y_data = _extract_xy_from_dataframe(df)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    # Build request object from form parameters
    from api.schemas import (
        BaselineConfigAPI,
        BaselineMethodAPI,
        DatabaseConfigAPI,
        FitModelConfigAPI,
        FitModelTypeAPI,
        ReferenceDBAPI,
        SmoothingConfigAPI,
        SmoothingMethodAPI,
    )

    request = XRDProcessRequest(
        x=x_data,
        y=y_data,
        baseline=BaselineConfigAPI(
            method=BaselineMethodAPI(baseline_method),
            poly_order=poly_order,
            half_window=half_window,
        ),
        smoothing=SmoothingConfigAPI(
            method=SmoothingMethodAPI(smoothing_method),
            window_length=window_length,
        ),
        fit_model=FitModelConfigAPI(
            model_type=FitModelTypeAPI(fit_model),
        ),
        database=DatabaseConfigAPI(
            reference_db=ReferenceDBAPI(reference_db),
        ),
        wavelength=wavelength,
        theta_min=theta_min,
        theta_max=theta_max,
        peak_threshold=peak_threshold,
        min_prominence=min_prominence,
    )

    # Delegate to the JSON endpoint logic
    return await process_xrd(request)


def _has_no_header(csv_text: str) -> bool:
    """
    Heuristic: check if the first row contains non-numeric values,
    suggesting it's a header row.
    """
    first_line = csv_text.strip().split("\n")[0]
    parts = first_line.split(",")
    for part in parts:
        try:
            float(part.strip().strip('"'))
        except ValueError:
            return False  # found a non-numeric token → has header
    return True  # all numeric → no header


def _extract_xy_from_dataframe(df: pd.DataFrame):
    """
    Extract x (2θ) and y (intensity) arrays from a DataFrame.

    Supports various column naming conventions.

    Returns:
        Tuple of (x_list, y_list) as Python floats.

    Raises:
        ValueError: If the DataFrame doesn't have at least 2 columns.
    """
    if df.shape[1] < 2:
        raise ValueError(
            "CSV must contain at least 2 columns (2θ and intensity). "
            f"Got {df.shape[1]} column(s)."
        )

    # Try to find columns by name
    x_col = None
    y_col = None
    col_names_lower = [str(c).strip().lower() for c in df.columns]

    for i, name in enumerate(col_names_lower):
        if name in ("2theta", "2θ", "theta", "x", "angle"):
            x_col = i
        elif name in ("intensity", "counts", "y", "i"):
            y_col = i

    # Fallback: first column = x, second = y
    if x_col is None:
        x_col = 0
    if y_col is None:
        y_col = 1

    x_arr = pd.to_numeric(df.iloc[:, x_col], errors="coerce").dropna().tolist()
    y_arr = pd.to_numeric(df.iloc[:, y_col], errors="coerce").dropna().tolist()

    # Trim to matching length
    min_len = min(len(x_arr), len(y_arr))
    if min_len < 10:
        raise ValueError(
            f"Insufficient valid data points after parsing: {min_len}. "
            "Minimum 10 required."
        )

    return x_arr[:min_len], y_arr[:min_len]


# ============================================================================
# POST /match — Reference database phase matching
# ============================================================================


@app.post(
    "/match",
    response_model=PhaseMatchResponse,
    responses={400: {"model": ErrorResponse}},
    tags=["XRD Processing"],
)
async def match_reference(request: MatchRequest):
    """
    Match fitted peaks against a crystallographic reference database.

    Accepts a list of fitted peak objects (with center, amplitude, fwhm)
    and returns phase identification results.
    """
    if not request.peaks:
        raise HTTPException(
            status_code=400,
            detail="At least one peak is required for matching.",
        )

    # Convert dict peaks to FittedPeak dataclass instances
    try:
        evidence_peaks = [
            FittedPeak(
                center=float(p["center"]),
                amplitude=float(p["amplitude"]),
                fwhm=float(p["fwhm"]),
                area=float(p.get("area", 0.0)),
                model_type=str(p.get("model_type", "Unknown")),
                residual_rms=float(p.get("residual_rms", 0.0)),
            )
            for p in request.peaks
        ]
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Invalid peak data: {exc}. Each peak must contain "
                "'center', 'amplitude', and 'fwhm' keys with numeric values."
            ),
        )

    try:
        result = match_peaks(
            evidence_peaks=evidence_peaks,
            db_type=request.reference_db.value,
            tolerance=request.tolerance,
        )

        peak_matches = [
            PeakMatchResponse(
                measured_center=pm.measured_center,
                reference_marker=ReferenceMarkerResponse(
                    hkl=pm.reference_marker.hkl,
                    d_spacing=pm.reference_marker.d_spacing,
                    position_2theta=pm.reference_marker.position_2theta,
                    relative_intensity=pm.reference_marker.relative_intensity,
                    phase_label=pm.reference_marker.phase_label,
                ),
                delta_2theta=pm.delta_2theta,
                confidence=pm.confidence,
                db_source=pm.db_source,
            )
            for pm in result.matched_peaks
        ]

        return PhaseMatchResponse(
            primary_phase=result.primary_phase,
            matched_peaks=peak_matches,
            db_source=result.db_source,
            catalog_id=result.catalog_id,
            summary=result.summary,
        )

    except Exception as exc:
        logger.exception("Unexpected error during phase matching.")
        raise HTTPException(
            status_code=500,
            detail=f"Phase matching failed: {exc}",
        )


# ============================================================================
# Scientific Skill Layer
# ============================================================================


SKILL_REGISTRY: Dict[str, ScienceSkill] = {
    "xrd-science-skill": ScienceSkill(
        skill_id="xrd-science-skill",
        skill_label="XRD Science Skill",
        technique="XRD",
        description="Processes bulk diffraction patterns to resolve phase indications.",
        inputs="Raw 1D diffraction pattern (.raw, .xy)",
        outputs="Skill-derived peak positions & reference matching",
        status="active",
    ),
    "xps-science-skill": ScienceSkill(
        skill_id="xps-science-skill",
        skill_label="XPS Science Skill",
        technique="XPS",
        description="Deconstructs surface photoemission envelopes into chemical assignments.",
        inputs="Core-level photoemission spectra",
        outputs="Skill-derived chemical state and oxidation envelopes",
        status="inactive",
    ),
    "ftir-science-skill": ScienceSkill(
        skill_id="ftir-science-skill",
        skill_label="FTIR Science Skill",
        technique="FTIR",
        description="Analyzes IR transmittance patterns for functional groups.",
        inputs="Transmittance/absorbance IR spectra",
        outputs="Skill-derived vibrational bands and functional bonds",
        status="inactive",
    ),
    "raman-science-skill": ScienceSkill(
        skill_id="raman-science-skill",
        skill_label="Raman Science Skill",
        technique="Raman",
        description="Identifies active vibrational modes to fingerprint local lattice structures.",
        inputs="Raman shift-intensity signal",
        outputs="Skill-derived vibrational modes and local symmetries",
        status="inactive",
    ),
    "cross-fusion-skill": ScienceSkill(
        skill_id="cross-fusion-skill",
        skill_label="Cross-Technique Fusion Skill",
        technique="Fusion",
        description="Fuses evidence from multiple experimental methods to check for consistency and resolve validation gaps.",
        inputs="Multiple technique evidence objects (XRD, XPS, FTIR, Raman)",
        outputs="Fused multi-tech scientific claim boundaries",
        status="inactive",
    ),
    "validation-boundary-skill": ScienceSkill(
        skill_id="validation-boundary-skill",
        skill_label="Validation Boundary Skill",
        technique="Validation",
        description="Delineates the scientific limits and validation boundaries of current claims.",
        inputs="Claim evidence objects",
        outputs="Defined validation boundaries and identified instrumentation gaps",
        status="inactive",
    ),
    "evidence-to-report-skill": ScienceSkill(
        skill_id="evidence-to-report-skill",
        skill_label="Evidence-to-Report Skill",
        technique="Report",
        description="Assembles evidence and validation boundaries into reproducible scientific reports.",
        inputs="Fused claim boundaries and provenance records",
        outputs="Notebook memory ready for scientific archival",
        status="inactive",
    ),
}


def _compute_input_reference(x: List[float], y: List[float]) -> str:
    """Compute a deterministic SHA-256 hash representation of the input dataset coordinates."""
    hasher = hashlib.sha256()
    data_str = f"x:{[float(v) for v in x]},y:{[float(v) for v in y]}"
    hasher.update(data_str.encode("utf-8"))
    return hasher.hexdigest()


@app.get(
    "/skills",
    response_model=List[ScienceSkill],
    tags=["Scientific Skills"],
)
async def list_skills():
    """
    List all registered Scientific Skills in DIFARYX.
    """
    return list(SKILL_REGISTRY.values())


@app.get(
    "/skills/{technique}",
    response_model=ScienceSkill,
    responses={404: {"model": ErrorResponse}},
    tags=["Scientific Skills"],
)
async def get_skill(technique: str):
    """
    Retrieve skill metadata by technique name or skill ID (case-insensitive).
    """
    search_term = technique.strip().lower()
    for skill in SKILL_REGISTRY.values():
        if (
            skill.skill_id.lower() == search_term
            or skill.technique.lower() == search_term
        ):
            return skill

    raise HTTPException(
        status_code=404,
        detail=f"Science Skill not found for technique/ID: '{technique}'",
    )


@app.post(
    "/skills/xrd/process",
    response_model=XRDSkillProcessResponse,
    responses={400: {"model": ErrorResponse}, 422: {"model": ErrorResponse}},
    tags=["Scientific Skills"],
)
async def process_xrd_skill(request: XRDProcessRequest):
    """
    Wrap the existing XRD signal processor as a Science Skill,
    returning a validation-bounded ScientificEvidenceObject alongside
    the legacy processor result.
    """
    # Execute XRD pipeline processing
    legacy_res = await process_xrd(request)

    # Compute coordinate-based input reference hash
    x_list = request.x or []
    y_list = request.y or []
    input_ref = _compute_input_reference(x_list, y_list)

    # Compile observations
    observations = [
        f"Detected {len(legacy_res.detected_peaks)} peaks in the 2θ range [{request.theta_min}°, {request.theta_max}°].",
        f"Successfully fitted {len(legacy_res.fitted_peaks)} peaks using {request.fit_model.model_type.value} profiles."
    ]
    if legacy_res.phase_match:
        primary_phase = legacy_res.phase_match.primary_phase
        observations.append(
            f"Phase match identification suggests a reference-supported phase indication matching {primary_phase} in the {legacy_res.phase_match.db_source} catalog (ID: {legacy_res.phase_match.catalog_id})."
        )
    else:
        observations.append("No reference-supported phase indication could be resolved from the current database catalog.")

    # Strictly use bounded language and avoid absolute phase or purity claims.
    claim_boundaries = [
        "The resolved phase labels represent a reference-supported phase indication rather than a definitive phase confirmation.",
        "The claim is a validation-limited scientific claim based solely on 1D bulk diffraction geometry.",
        "Phase-purity confirmation requires additional validation and complementary evidence."
    ]

    validation_gaps = [
        "Bulk crystallography cannot resolve surface-state oxidation states or localized grain boundaries; complementary XPS, FTIR, or Raman evidence is recommended.",
        "Lattice parameter matching is limited by database reference variations and potential solid-solution shift errors."
    ]

    phase_str = f"reference-supported phase indication for '{legacy_res.phase_match.primary_phase}'" if legacy_res.phase_match else "no resolved phase match"
    agent_ready_summary = (
        f"XRD analysis resolved {len(legacy_res.fitted_peaks)} fitted peaks with a signal-to-noise ratio (SNR) of {legacy_res.sn_ratio:.2f}. "
        f"Phase matching yields a {phase_str}. This is a validation-limited scientific claim. "
        f"Phase-purity confirmation requires additional validation and complementary evidence; complementary XPS, FTIR, or Raman evidence is recommended."
    )

    # Convert to JSON-safe dictionary
    raw_result = json.loads(legacy_res.json())

    # Build the evidence object
    evidence = ScientificEvidenceObject(
        evidence_id=str(uuid.uuid4()),
        schema_version=BACKEND_SCHEMA_VERSION,
        skill_id="xrd-science-skill",
        skill_label="XRD Science Skill",
        technique="XRD",
        input_reference=input_ref,
        processing_summary=(
            f"Baseline correction method: {request.baseline.method.value} (poly_order={request.baseline.poly_order}, half_window={request.baseline.half_window}); "
            f"Smoothing method: {request.smoothing.method.value} (window_length={request.smoothing.window_length}); "
            f"Peak fitting model: {request.fit_model.model_type.value}; "
            f"Reference database: {request.database.reference_db.value}."
        ),
        scientific_observations=observations,
        claim_boundaries=claim_boundaries,
        validation_gaps=validation_gaps,
        agent_ready_summary=agent_ready_summary,
        raw_result=raw_result,
        created_at=datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    )

    return XRDSkillProcessResponse(
        legacy_result=legacy_res,
        evidence_object=evidence,
    )


# ============================================================================
# Error handlers
# ============================================================================


@app.exception_handler(ValueError)
async def value_error_handler(request, exc: ValueError):
    """Handle validation errors from domain layer."""
    return JSONResponse(
        status_code=400,
        content={"detail": str(exc), "error_type": "ValidationError"},
    )


# ============================================================================
# Entrypoint
# ============================================================================

if __name__ == "__main__":
    import uvicorn

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
        stream=sys.stdout,
    )
    uvicorn.run(
        "api.gateway:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info",
    )
