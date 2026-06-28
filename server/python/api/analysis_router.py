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
from ftir_engine.services.ftir_reference_service import FtirObservedBand, match_ftir_bands
from xps_engine.services.xps_reference_service import XpsObservedPeak, match_xps_peaks

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
    """Validate and normalize the technique string. Returns registered technique casing."""
    valid_map = {
        "xrd": "XRD",
        "xps": "XPS",
        "ftir": "FTIR",
        "raman": "Raman"
    }
    normalized = technique.strip().lower()
    if normalized not in valid_map:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Unsupported technique '{technique}'. "
                f"Allowed: {', '.join(sorted(valid_map.values()))}"
            ),
        )
    return valid_map[normalized]


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


def _find_peaks_in_signal(x: List[float], y: List[float], technique: str) -> List[dict]:
    """
    Find peaks in a 1D signal with technique-specific settings.
    Automatically handles descending/unsorted x axes and FTIR transmittance dips.
    """
    x_arr = np.array(x)
    y_arr = np.array(y)

    # Normalize axis ordering (ascending) for peak finding
    sort_idx = np.argsort(x_arr)
    x_sorted = x_arr[sort_idx]
    y_sorted = y_arr[sort_idx]

    # FTIR transmittance check and auto-inversion
    if technique == "FTIR":
        y_min, y_max = np.min(y_sorted), np.max(y_sorted)
        y_range = y_max - y_min
        # If median is in the upper half of the range, it's transmittance (dips)
        if y_range > 0 and np.median(y_sorted) > (y_min + y_range * 0.5):
            signal = y_max - y_sorted
        else:
            signal = y_sorted
    else:
        signal = y_sorted

    min_sig = float(np.min(signal))
    max_sig = float(np.max(signal))
    variation = max_sig - min_sig
    if variation <= 0:
        return []

    x_min, x_max = float(np.min(x_sorted)), float(np.max(x_sorted))
    x_range = x_max - x_min

    # Technique-specific detection parameters
    if technique == "XRD":
        prominence_threshold = 0.02 * variation
        height_threshold = min_sig + 0.05 * variation
        min_spacing = x_range / 150.0 if x_range > 0 else 0.0
    elif technique == "XPS":
        prominence_threshold = 0.04 * variation
        height_threshold = min_sig + 0.08 * variation
        min_spacing = x_range / 100.0 if x_range > 0 else 0.0
    elif technique == "FTIR":
        prominence_threshold = 0.025 * variation
        height_threshold = min_sig + 0.06 * variation
        min_spacing = x_range / 120.0 if x_range > 0 else 0.0
    elif technique == "Raman":
        prominence_threshold = 0.03 * variation
        height_threshold = min_sig + 0.08 * variation
        min_spacing = x_range / 120.0 if x_range > 0 else 0.0
    else:
        prominence_threshold = 0.03 * variation
        height_threshold = min_sig + 0.05 * variation
        min_spacing = x_range / 120.0 if x_range > 0 else 0.0

    from scipy.signal import find_peaks
    avg_spacing = x_range / len(x_sorted) if len(x_sorted) > 1 else 1.0
    min_dist_indices = max(1, int(min_spacing / avg_spacing)) if avg_spacing > 0 else 1

    peaks_indices, properties = find_peaks(
        signal,
        prominence=prominence_threshold,
        height=height_threshold,
        distance=min_dist_indices
    )

    peak_list = []
    for idx_in_peaks, idx in enumerate(peaks_indices):
        px = float(x_sorted[idx])
        py = float(y_sorted[idx])
        prominence = float(properties["prominences"][idx_in_peaks])
        rel_intensity = float(((signal[idx] - min_sig) / variation) * 100) if variation > 0 else 0.0

        peak_list.append({
            "position": px,
            "intensity": py,
            "prominence": prominence,
            "relative_intensity": rel_intensity
        })

    # Sort descending by prominence
    peak_list.sort(key=lambda p: -p["prominence"])
    return peak_list



def _get_xps_peak_label(position: float) -> tuple[str, ConfidenceLevel]:
    """descriptive region labeling for XPS peak positions, preserving scientific uncertainty."""
    if 280.0 <= position <= 292.0:
        return "XPS peak in C 1s region", ConfidenceLevel.MEDIUM
    elif 525.0 <= position <= 540.0:
        return "XPS peak in O 1s region", ConfidenceLevel.MEDIUM
    elif 705.0 <= position <= 735.0:
        return "XPS peak in Fe 2p region", ConfidenceLevel.MEDIUM
    elif 925.0 <= position <= 965.0:
        return "XPS peak in Cu 2p region", ConfidenceLevel.MEDIUM
    elif 99.0 <= position <= 105.0:
        return "XPS peak in Si 2p region", ConfidenceLevel.MEDIUM
    elif 160.0 <= position <= 170.0:
        return "XPS peak in S 2p region", ConfidenceLevel.MEDIUM
    else:
        return f"XPS peak at {position:.1f} eV", ConfidenceLevel.LOW


def _get_ftir_band_label(position: float) -> tuple[str, ConfidenceLevel]:
    """descriptive region labeling for FTIR band positions, preserving scientific uncertainty."""
    if 3200.0 <= position <= 3700.0:
        return "FTIR band in O-H / N-H stretching region", ConfidenceLevel.HIGH
    elif 2800.0 <= position <= 3100.0:
        return "FTIR band in C-H stretching region", ConfidenceLevel.MEDIUM
    elif 1650.0 <= position <= 1800.0:
        return "FTIR band in carbonyl / carboxyl stretching region", ConfidenceLevel.HIGH
    elif 1500.0 <= position <= 1650.0:
        return "FTIR band in OH bending / carbonate region", ConfidenceLevel.MEDIUM
    elif 900.0 <= position <= 1250.0:
        return "FTIR band in support / silicate / C-O stretching region", ConfidenceLevel.HIGH
    elif 400.0 <= position <= 700.0:
        return "FTIR band in metal-oxygen stretch / lattice vibration region", ConfidenceLevel.MEDIUM
    else:
        return f"FTIR band at {position:.1f} cm⁻¹", ConfidenceLevel.LOW


def _get_raman_mode_label(position: float) -> tuple[str, ConfidenceLevel]:
    """descriptive region labeling for Raman mode positions, preserving scientific uncertainty."""
    if 100.0 <= position <= 800.0:
        return "Raman mode in lattice / local-structure region", ConfidenceLevel.MEDIUM
    elif 1300.0 <= position <= 1650.0:
        return "Raman mode in carbon D/G band region", ConfidenceLevel.HIGH
    else:
        return f"Raman mode at {position:.1f} cm⁻¹", ConfidenceLevel.LOW



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
        "sn_ratio": round(result.sn_ratio, 4) if isinstance(result.sn_ratio, (int, float)) else result.sn_ratio,
        "baseline_deviation": round(result.baseline_deviation, 6) if isinstance(result.baseline_deviation, (int, float)) else result.baseline_deviation,
        "peak_resolution": round(result.peak_resolution, 4) if isinstance(result.peak_resolution, (int, float)) else result.peak_resolution,
        "assessment": assessment_dict,
        "claim_boundary": claim_boundary_dict,
        "parsed_features": parsed_features,
        "x": x_data,
        "y": y_data,
    }



def _handle_xps_upload(file_bytes: bytes, filename: str) -> dict:
    """
    XPS Handler: Parse CSV (binding_energy, intensity), run peak detection,
    apply adventitious C 1s energy calibration shift if eligible, and execute Layer-2 matching.
    """
    x_data, y_data = _parse_csv_two_columns(file_bytes)
    point_count = len(x_data)
    y_min, y_max = min(y_data), max(y_data)
    y_range = y_max - y_min

    # Detect raw peaks first
    raw_peaks = _find_peaks_in_signal(x_data, y_data, "XPS")

    # Find calibration candidate reference peaks (C 1s only)
    min_ref_prominence = 0.05 * y_range if y_range > 0 else 0.0

    c1s_candidates = []
    if y_range >= 15.0:
        c1s_candidates = [p for p in raw_peaks if 282.0 <= p["position"] <= 288.0 and p["prominence"] >= min_ref_prominence]

    energy_shift = 0.0
    ref_peak = None
    ref_type = "None"
    is_calibrated = False

    if c1s_candidates:
        ref_peak = c1s_candidates[0]
        ref_type = "C 1s"
        raw_pos = ref_peak["position"]
        energy_shift = 284.8 - raw_pos
        is_calibrated = True
        if abs(energy_shift) <= 0.1:
            energy_shift = 0.0
            status = "already_calibrated"
            confidence = ConfidenceLevel.HIGH
            message = f"C 1s reference peak detected at {raw_pos:.2f} eV (close to 284.8 eV). Spectrum is already calibrated."
        else:
            status = "calibrated"
            confidence = ConfidenceLevel.HIGH
            message = f"Shifted XPS energy scale by {energy_shift:+.2f} eV to align C 1s reference peak ({raw_pos:.2f} eV -> 284.8 eV)."
    else:
        status = "uncalibrated"
        confidence = ConfidenceLevel.LOW
        message = "No eligible C 1s reference peak detected in [282.0, 288.0] eV. Defaulting to uncalibrated path (deltaE=0). Confidence capped at LOW."

    # Apply energy shift to x coordinates
    x_calibrated = [float(val + energy_shift) for val in x_data]

    # Re-run peak finding on the calibrated scale
    calibrated_peaks = _find_peaks_in_signal(x_calibrated, y_data, "XPS")

    # Generate UniversalEvidenceNodes for calibrated peaks
    parsed_features = []
    observed_peaks_for_match = []
    for i, peak in enumerate(calibrated_peaks):
        label, conf = _get_xps_peak_label(peak["position"])
        full_label = f"{label} ({peak['relative_intensity']:.1f}% rel)"
        node = UniversalEvidenceNode(
            id=f"xps-peak-{i+1:03d}",
            technique=Technique.XPS,
            primaryAxis=peak["position"],
            primaryAxisUnit="eV",
            value=peak["intensity"],
            valueUnit="counts/s",
            label=full_label,
            role="primary",
            confidence=conf,
        )
        parsed_features.append(node.model_dump())
        observed_peaks_for_match.append(
            XpsObservedPeak(
                position=peak["position"],
                intensity=peak["intensity"],
                relative_intensity=peak["relative_intensity"],
                prominence=peak["prominence"],
            )
        )

    # Execute Layer-2 Phase Matching
    match_response = match_xps_peaks(observed_peaks_for_match, is_calibrated=is_calibrated)
    candidates_data = [
        {
            "phase_id": c.phase_id,
            "phase_label": c.phase_label,
            "formula": c.formula,
            "db_source": c.db_source,
            "match_score": round(c.match_score * 100, 1),
            "confidence_level": c.confidence_level,
            "caveat": c.caveat,
        }
        for c in match_response.candidates
    ]

    # Build calibration metadata object
    calibration_metadata = {
        "energy_shift": energy_shift,
        "reference_type": ref_type,
        "reference_peak": {
            "position": ref_peak["position"],
            "intensity": ref_peak["intensity"],
            "prominence": ref_peak["prominence"],
        } if ref_peak else None,
        "confidence": confidence.value if hasattr(confidence, "value") else str(confidence),
        "status": status,
        "message": message,
    }

    return {
        "point_count": point_count,
        "x": x_calibrated,
        "y": y_data,
        "axis_range": [min(x_calibrated), max(x_calibrated)],
        "axis_unit": "eV",
        "value_unit": "counts/s",
        "calibration_metadata": calibration_metadata,
        "parsed_features": parsed_features,
        "layer2_match": {
            "status_summary": match_response.status_summary,
            "candidates": candidates_data,
        },
        "stub": False,
        "message": f"XPS analysis completed. Extracted {len(calibrated_peaks)} peaks. {match_response.status_summary}.",
    }



# --- FTIR Handler ---

def _handle_ftir_upload(file_bytes: bytes, filename: str) -> dict:
    """
    FTIR Handler: Parse CSV (wavenumber, transmittance/absorbance),
    detect band regions (handling transmittance dips automatically),
    run Layer-2 database search match, and return real coordinate arrays.
    """
    x_data, y_data = _parse_csv_two_columns(file_bytes)
    point_count = len(x_data)

    detected_bands = _find_peaks_in_signal(x_data, y_data, "FTIR")

    parsed_features = []
    observed_bands_for_match = []
    for i, band in enumerate(detected_bands):
        label, conf = _get_ftir_band_label(band["position"])
        full_label = f"{label} ({band['relative_intensity']:.1f}% rel)"
        node = UniversalEvidenceNode(
            id=f"ftir-band-{i+1:03d}",
            technique=Technique.FTIR,
            primaryAxis=band["position"],
            primaryAxisUnit="cm⁻¹",
            value=band["intensity"],
            valueUnit="%",
            label=full_label,
            role="primary",
            confidence=conf,
        )
        parsed_features.append(node.model_dump())
        observed_bands_for_match.append(
            FtirObservedBand(
                position=band["position"],
                intensity=band["intensity"],
                fwhm=band.get("fwhm", 40.0),
            )
        )

    match_response = match_ftir_bands(observed_bands_for_match)
    candidates_data = [
        {
            "phase_id": c.phase_id,
            "phase_label": c.phase_label,
            "formula": c.formula,
            "db_source": c.db_source,
            "match_score": round(c.match_score * 100, 1),
            "confidence_level": c.confidence_level,
            "caveat": c.caveat,
        }
        for c in match_response.candidates
    ]

    return {
        "point_count": point_count,
        "x": x_data,
        "y": y_data,
        "axis_range": [min(x_data), max(x_data)],
        "axis_unit": "cm⁻¹",
        "value_unit": "%",
        "parsed_features": parsed_features,
        "layer2_match": {
            "status_summary": match_response.status_summary,
            "candidates": candidates_data,
        },
        "stub": False,
        "message": f"FTIR analysis completed. Extracted {len(detected_bands)} band regions. {match_response.status_summary}.",
    }


# --- Raman Stub Handler ---

def _handle_raman_upload_stub(file_bytes: bytes, filename: str) -> dict:
    """
    Raman Handler: Parse CSV (raman_shift, intensity), detect modes,
    and return real coordinate arrays and evidence-bound features.
    """
    x_data, y_data = _parse_csv_two_columns(file_bytes)
    point_count = len(x_data)

    detected_modes = _find_peaks_in_signal(x_data, y_data, "Raman")

    parsed_features = []
    for i, mode in enumerate(detected_modes):
        label, conf = _get_raman_mode_label(mode["position"])
        full_label = f"{label} ({mode['relative_intensity']:.1f}% rel)"
        node = UniversalEvidenceNode(
            id=f"raman-mode-{i+1:03d}",
            technique=Technique.RAMAN,
            primaryAxis=mode["position"],
            primaryAxisUnit="cm⁻¹",
            value=mode["intensity"],
            valueUnit="a.u.",
            label=full_label,
            role="primary",
            confidence=conf,
        )
        parsed_features.append(node.model_dump())

    return {
        "point_count": point_count,
        "x": x_data,
        "y": y_data,
        "axis_range": [min(x_data), max(x_data)],
        "axis_unit": "cm⁻¹",
        "value_unit": "a.u.",
        "parsed_features": parsed_features,
        "stub": False,
        "message": f"Raman analysis completed. Extracted {len(detected_modes)} mode regions from raw data.",
    }



# ============================================================================
# Strategy Dispatch Map
# ============================================================================

TECHNIQUE_HANDLERS: Dict[str, Callable] = {
    "XRD": _handle_xrd_upload,
    "XPS": _handle_xps_upload,
    "FTIR": _handle_ftir_upload,
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
        "pointCount": result.get("point_count") or (len(result.get("x")) if result.get("x") else 0),
    }

    response = UploadAnalysisResponse(
        success=True,
        fileId=file_id,
        technique=technique,
        metadata=metadata,
        parsed_features=result.get("parsed_features", []),
        message=result.get("message", f"{technique} analysis completed successfully."),
        x=result.get("x"),
        y=result.get("y"),
        calibration_metadata=result.get("calibration_metadata"),
    )

    # Attach additional analysis details as extra fields
    response_dict = response.model_dump()
    response_dict["analysis"] = {
        k: v for k, v in result.items()
        if k not in ("parsed_features", "message", "x", "y", "calibration_metadata")
    }

    return response_dict