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

import numpy as np
import pandas as pd
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
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

logger = logging.getLogger("difaryx.xrd.gateway")


# ============================================================================
# Application lifecycle
# ============================================================================


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown lifecycle events."""
    logger.info("DIFARYX XRD Gateway starting up...")
    yield
    logger.info("DIFARYX XRD Gateway shutting down.")


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
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS — allow frontend dev server and production origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register the Evidence Registry router
app.include_router(evidence_router)


# ============================================================================
# Health check
# ============================================================================


@app.get("/health", response_model=HealthResponse, tags=["System"])
async def health_check():
    """
    Service health check.

    Returns engine status, identifier, and version.
    """
    return HealthResponse(status="ok", engine="xrd", version="1.0.0")


# ============================================================================
# Helper: build domain config from API request
# ============================================================================


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
    return XRDPipelineConfig(
        baseline=baseline,
        smoothing=smoothing,
        fit_model=fit_model,
        database=database,
        wavelength=request.wavelength,
        theta_min=request.theta_min,
        theta_max=request.theta_max,
        peak_threshold=request.peak_threshold,
        min_prominence=request.min_prominence,
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
    # Validate data presence
    if request.x is None or request.y is None:
        raise HTTPException(
            status_code=400,
            detail=(
                "Both 'x' (2θ array) and 'y' (intensity array) are required "
                "when using the JSON endpoint. For CSV upload, use /process/upload."
            ),
        )

    if len(request.x) != len(request.y):
        raise HTTPException(
            status_code=400,
            detail=(
                f"Array length mismatch: x has {len(request.x)} elements, "
                f"y has {len(request.y)} elements."
            ),
        )

    if len(request.x) < 10:
        raise HTTPException(
            status_code=400,
            detail="Insufficient data points. Minimum 10 required for processing.",
        )

    try:
        # Build domain config
        t0 = time.perf_counter()
        config = _build_config(request)

        # Run processor
        processor = XRDSignalProcessor(config)
        result = processor.run(request.x, request.y)
        t_process = time.perf_counter()

        # Run phase matching against fitted peaks
        phase_match_result = None
        if result.fitted_peaks:
            phase_match_result = match_peaks(
                evidence_peaks=result.fitted_peaks,
                db_type=config.database.reference_db,
            )
        t_match = time.perf_counter()

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
            logger.warning("Phase 4 reference_match_v2 failed (non-fatal): %s", exc)
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
            "XRD pipeline: %d points → %d detected, %d fitted | "
            "process=%.3fs, match=%.3fs, ref_v2=%.3fs, assess=%.3fs, total=%.3fs",
            n_points, n_det, n_fit,
            t_process - t0,
            t_match - t_process,
            t_ref_v2 - t_match,
            t_assess - t_ref_v2,
            t_assess - t0,
        )

        return _build_response(
            result,
            phase_match_result,
            reference_match_v2_result,
            general_assessment_model,
            claim_boundary_model,
        )

    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.exception("Unexpected error during XRD processing.")
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
        schema_version="1.0.0",
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
