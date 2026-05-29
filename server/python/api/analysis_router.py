"""
DIFARYX Multi-Technique Analysis Upload Router.

Provides `POST /api/v1/analysis/upload` for uploading raw data files
from XRD, XPS, FTIR, and Raman techniques.

Strategy Pattern dispatch:
  - XRD   → Full signal processing pipeline (XRDSignalProcessor + reference matching)
  - XPS   → CSV parse + mock features stub
  - FTIR  → CSV parse + mock features stub
  - Raman  → CSV parse + mock features stub

All stub techniques return UniversalEvidenceNode objects conforming
to the Universal Research Evidence schema (universal_schemas.py).

Author: DIFARYX Core Team
"""

from __future__ import annotations

import io
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional

import numpy as np
import pandas as pd
from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from api.schemas import UploadAnalysisResponse
from api.universal_schemas import (
    ConfidenceLevel,
    Technique,
    UniversalEvidenceNode,
)

logger = logging.getLogger("difaryx.analysis_router")

# ============================================================================
# Router
# ============================================================================

router = APIRouter(prefix="/api/v1/analysis", tags=["Analysis Upload"])

# ============================================================================
# Allowed file extensions
# ============================================================================

ALLOWED_EXTENSIONS = {".csv", ".txt", ".raw"}


def _validate_file_extension(filename: str) -> None:
    """Raise 400 if the file extension is not supported."""
    import os
    _, ext = os.path.splitext(filename.lower())
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Unsupported file extension '{ext}'. "
                f"Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
            ),
        )


def _validate_technique(technique: str) -> str:
    """Validate and normalize the technique string. Returns uppercase technique."""
    valid = {"XRD", "XPS", "FTIR", "Raman"}
    normalized = technique.strip()
    if normalized not in valid:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Unsupported technique '{technique}'. "
                f"Allowed: {', '.join(sorted(valid))}"
            ),
        )
    return normalized


# ============================================================================
# CSV Parsing Utilities
# ============================================================================

def _parse_csv_two_columns(raw_bytes: bytes) -> tuple:
    """
    Parse a CSV/TXT file into two numeric columns (x, y).

    Returns:
        (x_list, y_list) as lists of floats.

    Raises:
        HTTPException(400) if parsing fails.
    """
    try:
        text = raw_bytes.decode("utf-8", errors="replace")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Failed to decode file: {exc}")

    try:
        # Try with header first
        df = pd.read_csv(io.StringIO(text))
        if df.shape[1] < 2:
            # Retry without header
            df = pd.read_csv(io.StringIO(text), header=None)
    except Exception:
        try:
            df = pd.read_csv(io.StringIO(text), header=None)
        except Exception as exc:
            raise HTTPException(
                status_code=400, detail=f"Failed to parse CSV: {exc}"
            )

    if df.shape[1] < 2:
        raise HTTPException(
            status_code=400,
            detail=f"CSV must have at least 2 columns. Got {df.shape[1]}.",
        )

    x = pd.to_numeric(df.iloc[:, 0], errors="coerce").dropna().tolist()
    y = pd.to_numeric(df.iloc[:, 1], errors="coerce").dropna().tolist()

    min_len = min(len(x), len(y))
    if min_len < 10:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient valid data points after parsing: {min_len}. Minimum 10 required.",
        )

    return x[:min_len], y[:min_len]


# ============================================================================
# Technique Handlers
# ============================================================================

# --- XRD Handler (full pipeline) ---

def _handle_xrd_upload(file_bytes: bytes, filename: str) -> dict:
    """
    XRD: Parse CSV and run the full XRD signal processing pipeline.

    Reuses XRDSignalProcessor and match_peaks from the existing engine.
    """
    from xrd_engine.domain.models.xrd_params import XRDPipelineConfig
    from xrd_engine.services.reference_db_service import match_peaks
    from xrd_engine.services.xrd_engine import XRDSignalProcessor
    from xrd_engine.services.general_sample_assessment import (
        assess_general_sample,
        compute_claim_boundary,
    )

    x_data, y_data = _parse_csv_two_columns(file_bytes)

    # Build default config
    config = XRDPipelineConfig()
    processor = XRDSignalProcessor(config)
    result = processor.run(x_data, y_data)

    # Phase matching
    phase_match_result = None
    if result.fitted_peaks:
        phase_match_result = match_peaks(
            evidence_peaks=result.fitted_peaks,
            db_type=config.database.reference_db,
        )

    # General sample assessment
    assessment_dict = assess_general_sample(
        detected_peaks=result.detected_peaks,
        fitted_peaks=result.fitted_peaks,
        sn_ratio=result.sn_ratio,
        theta_min=config.theta_min,
        theta_max=config.theta_max,
    )
    claim_boundary_dict = compute_claim_boundary(assessment=assessment_dict)

    # Build detected peaks list
    detected_peaks = [
        {
            "position": p.position,
            "intensity": p.intensity,
            "prominence": p.prominence,
            "fwhm": p.fwhm,
        }
        for p in result.detected_peaks
    ]

    # Build fitted peaks list
    fitted_peaks = [
        {
            "center": p.center,
            "amplitude": p.amplitude,
            "fwhm": p.fwhm,
            "area": p.area,
            "model_type": p.model_type,
        }
        for p in result.fitted_peaks
    ]

    # Build phase match summary
    phase_match_summary = None
    if phase_match_result:
        phase_match_summary = {
            "primary_phase": phase_match_result.primary_phase,
            "db_source": phase_match_result.db_source,
            "catalog_id": phase_match_result.catalog_id,
            "matched_peak_count": len(phase_match_result.matched_peaks),
            "summary": phase_match_result.summary,
        }

    # Build UniversalEvidenceNode list from fitted peaks
    parsed_features = []
    for i, fp in enumerate(result.fitted_peaks):
        node = UniversalEvidenceNode(
            id=f"xrd-peak-{i+1:03d}",
            technique=Technique.XRD,
            primaryAxis=fp.center,
            primaryAxisUnit="°",
            value=fp.intensity if hasattr(fp, "intensity") else fp.amplitude,
            valueUnit="a.u.",
            label=f"Peak at {fp.center:.2f}° (FWHM={fp.fwhm:.3f}°)",
            role="primary",
            confidence=ConfidenceLevel.MEDIUM,
        )
        parsed_features.append(node.model_dump())

    return {
        "detected_peaks": detected_peaks,
        "fitted_peaks": fitted_peaks,
        "phase_match": phase_match_summary,
        "sn_ratio": round(result.sn_ratio, 4),
        "baseline_deviation": round(result.baseline_deviation, 6),
        "peak_resolution": round(result.peak_resolution, 4),
        "assessment": assessment_dict,
        "claim_boundary": claim_boundary_dict,
        "parsed_features": parsed_features,
    }


# --- XPS Stub Handler ---

def _handle_xps_upload_stub(file_bytes: bytes, filename: str) -> dict:
    """
    XPS Stub: Parse CSV (binding_energy, intensity) and return mock features.

    Mock features represent typical XPS core-level photoemission peaks
    found in common surface analysis scenarios.
    """
    x_data, y_data = _parse_csv_two_columns(file_bytes)
    point_count = len(x_data)

    # Mock XPS features based on common binding energies
    mock_xps_features = [
        {
            "binding_energy_eV": 284.8,
            "assignment": "C 1s (adventitious carbon)",
            "confidence": "high",
        },
        {
            "binding_energy_eV": 532.0,
            "assignment": "O 1s (metal oxide / hydroxide)",
            "confidence": "medium",
        },
        {
            "binding_energy_eV": 399.5,
            "assignment": "N 1s (amine / pyridinic nitrogen)",
            "confidence": "low",
        },
    ]

    parsed_features = []
    for i, feat in enumerate(mock_xps_features):
        conf_map = {"high": ConfidenceLevel.HIGH, "medium": ConfidenceLevel.MEDIUM, "low": ConfidenceLevel.LOW}
        node = UniversalEvidenceNode(
            id=f"xps-peak-{i+1:03d}",
            technique=Technique.XPS,
            primaryAxis=feat["binding_energy_eV"],
            primaryAxisUnit="eV",
            value=0.0,  # Mock: no real intensity computed
            valueUnit="counts/s",
            label=feat["assignment"],
            role="primary",
            confidence=conf_map.get(feat["confidence"], ConfidenceLevel.UNCERTAIN),
        )
        parsed_features.append(node.model_dump())

    return {
        "point_count": point_count,
        "axis_range": [min(x_data), max(x_data)],
        "axis_unit": "eV",
        "value_unit": "counts/s",
        "mock_peaks": mock_xps_features,
        "parsed_features": parsed_features,
        "stub": True,
        "message": (
            "XPS analysis stub — mock surface-state features returned. "
            "Full XPS signal processing is not yet implemented."
        ),
    }


# --- FTIR Stub Handler ---

def _handle_ftir_upload_stub(file_bytes: bytes, filename: str) -> dict:
    """
    FTIR Stub: Parse CSV (wavenumber, transmittance) and return mock features.

    Mock features represent typical FTIR vibrational bands for common
    functional groups and bonding environments.
    """
    x_data, y_data = _parse_csv_two_columns(file_bytes)
    point_count = len(x_data)

    # Mock FTIR features based on common IR absorption bands
    mock_ftir_features = [
        {
            "wavenumber_cm1": 3400.0,
            "assignment": "O-H stretch (hydroxyl / water)",
            "confidence": "high",
        },
        {
            "wavenumber_cm1": 1630.0,
            "assignment": "O-H bend (adsorbed water)",
            "confidence": "medium",
        },
        {
            "wavenumber_cm1": 1050.0,
            "assignment": "Si-O-Si asymmetric stretch (siloxane)",
            "confidence": "high",
        },
        {
            "wavenumber_cm1": 800.0,
            "assignment": "Si-O-Si symmetric stretch / Si-O bending",
            "confidence": "medium",
        },
        {
            "wavenumber_cm1": 2920.0,
            "assignment": "C-H asymmetric stretch (alkyl chain)",
            "confidence": "low",
        },
    ]

    parsed_features = []
    for i, feat in enumerate(mock_ftir_features):
        conf_map = {"high": ConfidenceLevel.HIGH, "medium": ConfidenceLevel.MEDIUM, "low": ConfidenceLevel.LOW}
        node = UniversalEvidenceNode(
            id=f"ftir-band-{i+1:03d}",
            technique=Technique.FTIR,
            primaryAxis=feat["wavenumber_cm1"],
            primaryAxisUnit="cm⁻¹",
            value=0.0,  # Mock: no real transmittance computed
            valueUnit="%",
            label=feat["assignment"],
            role="primary",
            confidence=conf_map.get(feat["confidence"], ConfidenceLevel.UNCERTAIN),
        )
        parsed_features.append(node.model_dump())

    return {
        "point_count": point_count,
        "axis_range": [min(x_data), max(x_data)],
        "axis_unit": "cm⁻¹",
        "value_unit": "%",
        "mock_bands": mock_ftir_features,
        "parsed_features": parsed_features,
        "stub": True,
        "message": (
            "FTIR analysis stub — mock vibrational band features returned. "
            "Full FTIR signal processing is not yet implemented."
        ),
    }


# --- Raman Stub Handler ---

def _handle_raman_upload_stub(file_bytes: bytes, filename: str) -> dict:
    """
    Raman Stub: Parse CSV (raman_shift, intensity) and return mock features.

    Mock features represent typical Raman vibrational modes for common
    materials (e.g., silicon, carbon allotropes, metal oxides).
    """
    x_data, y_data = _parse_csv_two_columns(file_bytes)
    point_count = len(x_data)

    # Mock Raman features based on common vibrational modes
    mock_raman_features = [
        {
            "raman_shift_cm1": 520.0,
            "assignment": "Si TO mode (crystalline silicon)",
            "confidence": "high",
        },
        {
            "raman_shift_cm1": 1350.0,
            "assignment": "D-band (disordered sp² carbon)",
            "confidence": "high",
        },
        {
            "raman_shift_cm1": 1580.0,
            "assignment": "G-band (graphitic sp² carbon)",
            "confidence": "high",
        },
        {
            "raman_shift_cm1": 2700.0,
            "assignment": "2D-band (graphene / few-layer graphite)",
            "confidence": "medium",
        },
        {
            "raman_shift_cm1": 440.0,
            "assignment": "E₂g mode (rutile TiO₂)",
            "confidence": "low",
        },
    ]

    parsed_features = []
    for i, feat in enumerate(mock_raman_features):
        conf_map = {"high": ConfidenceLevel.HIGH, "medium": ConfidenceLevel.MEDIUM, "low": ConfidenceLevel.LOW}
        node = UniversalEvidenceNode(
            id=f"raman-mode-{i+1:03d}",
            technique=Technique.RAMAN,
            primaryAxis=feat["raman_shift_cm1"],
            primaryAxisUnit="cm⁻¹",
            value=0.0,  # Mock: no real intensity computed
            valueUnit="a.u.",
            label=feat["assignment"],
            role="primary",
            confidence=conf_map.get(feat["confidence"], ConfidenceLevel.UNCERTAIN),
        )
        parsed_features.append(node.model_dump())

    return {
        "point_count": point_count,
        "axis_range": [min(x_data), max(x_data)],
        "axis_unit": "cm⁻¹",
        "value_unit": "a.u.",
        "mock_modes": mock_raman_features,
        "parsed_features": parsed_features,
        "stub": True,
        "message": (
            "Raman analysis stub — mock vibrational mode features returned. "
            "Full Raman signal processing is not yet implemented."
        ),
    }


# ============================================================================
# Strategy Dispatch Map
# ============================================================================

TECHNIQUE_HANDLERS: Dict[str, Callable] = {
    "XRD": _handle_xrd_upload,
    "XPS": _handle_xps_upload_stub,
    "FTIR": _handle_ftir_upload_stub,
    "Raman": _handle_raman_upload_stub,
}


# ============================================================================
# POST /api/v1/analysis/upload
# ============================================================================


@router.post(
    "/upload",
    response_model=UploadAnalysisResponse,
    responses={400: {"model": dict}, 422: {"model": dict}},
    summary="Upload raw data for multi-technique analysis",
    description=(
        "Accepts a raw data file (.csv, .txt, .raw) and a technique identifier. "
        "Routes to the appropriate analysis handler. XRD runs the full signal "
        "processing pipeline; XPS, FTIR, and Raman return stub features."
    ),
)
async def upload_analysis(
    file: UploadFile = File(
        ...,
        description="Raw data file (.csv, .txt, .raw) with 2+ numeric columns.",
    ),
    technique: str = Form(
        ...,
        description="Characterization technique: XRD, XPS, FTIR, or Raman.",
    ),
):
    """
    Upload raw experimental data for technique-specific analysis.

    **Supported techniques:**
    - `XRD`  — Full XRD signal processing pipeline (peak detection, fitting, phase matching)
    - `XPS`  — Stub: returns mock surface-state photoemission features
    - `FTIR` — Stub: returns mock vibrational band features
    - `Raman` — Stub: returns mock vibrational mode features

    **File formats:** .csv, .txt, .raw (2+ numeric columns)
    """
    # ── Validate inputs ────────────────────────────────────────────────
    filename = file.filename or "unnamed"
    _validate_file_extension(filename)
    technique = _validate_technique(technique)

    # ── Read file ──────────────────────────────────────────────────────
    try:
        file_bytes = await file.read()
    except Exception as exc:
        raise HTTPException(
            status_code=400, detail=f"Failed to read uploaded file: {exc}"
        )

    file_size = len(file_bytes)

    # ── Dispatch to technique handler ──────────────────────────────────
    handler = TECHNIQUE_HANDLERS.get(technique)
    if handler is None:
        raise HTTPException(
            status_code=400,
            detail=f"No handler registered for technique '{technique}'.",
        )

    file_id = str(uuid.uuid4())
    logger.info(
        "Processing upload: file=%s, technique=%s, size=%d, fileId=%s",
        filename, technique, file_size, file_id,
    )

    try:
        result = handler(file_bytes, filename)
    except HTTPException:
        raise  # Re-raise HTTP exceptions as-is
    except Exception as exc:
        logger.exception("Analysis handler failed for technique=%s", technique)
        raise HTTPException(
            status_code=500,
            detail=f"Internal error during {technique} analysis: {exc}",
        )

    # ── Build response ─────────────────────────────────────────────────
    metadata = {
        "fileName": filename,
        "fileSize": file_size,
        "contentType": file.content_type or "application/octet-stream",
        "pointCount": result.get("point_count"),
    }

    response = UploadAnalysisResponse(
        success=True,
        fileId=file_id,
        technique=technique,
        metadata=metadata,
        parsed_features=result.get("parsed_features", []),
        message=result.get("message", f"{technique} analysis completed successfully."),
    )

    # Attach additional analysis details as extra fields
    response_dict = response.model_dump()
    # Include technique-specific analysis data for frontend consumption
    response_dict["analysis"] = {
        k: v for k, v in result.items()
        if k not in ("parsed_features", "message")
    }

    return response_dict