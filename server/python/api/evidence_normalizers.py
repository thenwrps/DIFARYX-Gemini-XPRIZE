"""
XRD Result Normalizer for the Evidence Registry.

Converts existing XRD backend result dictionaries (as returned by the
/process and /skills/xrd/process endpoints) into EvidenceCreateRequest
instances compatible with the evidence registry.

Bounded scientific language is preserved:
  - "phase indication" is allowed
  - "phase-purity confirmation requires additional validation" is allowed
  - "confirmed phase purity" is forbidden
"""

from __future__ import annotations

import datetime
import hashlib
import uuid
from typing import Any, Dict, List, Optional

from api.evidence_schemas import EvidenceCreateRequest


# ============================================================================
# Helpers
# ============================================================================


def _safe_float(value: Any, default: float = 0.0) -> float:
    """
    Safely convert a value to float, returning *default* on failure.

    Guards against None, empty strings, NaN, and numpy inf values.
    """
    if value is None:
        return default
    try:
        result = float(value)
        if result != result:  # NaN check (NaN != NaN)
            return default
        if result == float("inf") or result == float("-inf"):
            return default
        return result
    except (TypeError, ValueError):
        return default


# ============================================================================
# Public API
# ============================================================================


def normalize_xrd_result(
    *,
    project_id: str,
    xrd_response: Dict[str, Any],
    processing_params: Optional[Dict[str, Any]] = None,
    sample_id: Optional[str] = None,
    source_file: Optional[str] = None,
    validation_status: str = "needs_review",
    agent_readiness: bool = False,
    tags: Optional[List[str]] = None,
) -> EvidenceCreateRequest:
    """
    Convert an XRD backend result dict into an EvidenceCreateRequest.

    This normalizer does NOT re-run the XRD pipeline. It wraps an
    existing result into the evidence schema.

    Args:
        project_id: The project this evidence belongs to.
        xrd_response: Dict from the /process or /skills/xrd/process endpoint.
            Expected keys: x, y_raw, detected_peaks, fitted_peaks,
            sn_ratio, baseline_deviation, peak_resolution, phase_match (optional).
        processing_params: Processing parameters that produced the result.
            If None, extracted from xrd_response metadata.
        sample_id: Optional sample identifier for provenance tracking.
        source_file: Optional source file path or name.
        validation_status: Review lifecycle status.
        agent_readiness: Whether this evidence is ready for agent consumption.
        tags: Optional tags for categorization.

    Returns:
        An EvidenceCreateRequest populated from the XRD result data.
    """
    evidence_id = str(uuid.uuid4())
    now = datetime.datetime.now(datetime.timezone.utc).strftime(
        "%Y-%m-%dT%H:%M:%SZ"
    )

    # --- Extract signal quality observations ---
    observations = _build_observations(xrd_response)

    # --- Build claim boundaries (bounded language) ---
    claim_boundaries = _build_claim_boundaries(xrd_response)

    # --- Build validation gaps ---
    validation_gaps = _build_validation_gaps()

    # --- Build agent-ready summary ---
    agent_ready_summary = _build_agent_ready_summary(xrd_response)

    # --- Build processing summary ---
    processing_summary = _build_processing_summary(processing_params)

    # --- Compute input reference hash ---
    input_reference = _compute_input_reference(xrd_response)

    # --- Build provenance ---
    provenance = _build_provenance(
        processing_params=processing_params,
        created_at=now,
    )

    # --- Preserve full raw_result ---
    raw_result = _build_raw_result(xrd_response)

    # --- Tags ---
    merged_tags = list(tags) if tags else []
    if "xrd" not in merged_tags:
        merged_tags.append("xrd")
    if "auto-ingested" not in merged_tags:
        merged_tags.append("auto-ingested")

    return EvidenceCreateRequest(
        project_id=project_id,
        technique="XRD",
        skill_id="xrd-science-skill",
        skill_label="XRD Science Skill",
        input_reference=input_reference,
        processing_summary=processing_summary,
        scientific_observations=observations,
        claim_boundaries=claim_boundaries,
        validation_gaps=validation_gaps,
        agent_ready_summary=agent_ready_summary,
        raw_result=raw_result,
        provenance=provenance,
        sample_id=sample_id,
        source_file=source_file,
        validation_status=validation_status,
        agent_readiness=agent_readiness,
        tags=merged_tags,
    )


# ============================================================================
# Internal helpers
# ============================================================================


def _build_observations(xrd_response: Dict[str, Any]) -> List[str]:
    """
    Build bounded scientific observations from the XRD result.

    Observations describe what the data shows without making absolute claims.
    """
    observations: List[str] = []

    detected_peaks = xrd_response.get("detected_peaks", [])
    fitted_peaks = xrd_response.get("fitted_peaks", [])
    theta_min = xrd_response.get("theta_min", 10.0)
    theta_max = xrd_response.get("theta_max", 80.0)
    sn_ratio = _safe_float(xrd_response.get("sn_ratio"), 0.0)
    peak_resolution = xrd_response.get("peak_resolution", "screening-grade")

    observations.append(
        f"Detected {len(detected_peaks)} peaks in the 2\u03b8 range "
        f"[{theta_min}\u00b0, {theta_max}\u00b0]."
    )
    observations.append(
        f"Successfully fitted {len(fitted_peaks)} peaks. "
        f"Signal-to-noise ratio: {sn_ratio:.2f}. "
        f"Peak resolution classification: {peak_resolution}."
    )

    # Phase match observations (bounded language)
    phase_match = xrd_response.get("phase_match")
    if phase_match is not None:
        primary_phase = phase_match.get("primary_phase", "unknown")
        db_source = phase_match.get("db_source", "unknown")
        catalog_id = phase_match.get("catalog_id", "unknown")
        matched_count = len(phase_match.get("matched_peaks", []))
        observations.append(
            f"Phase match identification suggests a reference-supported "
            f"phase indication matching {primary_phase} in the {db_source} "
            f"catalog (ID: {catalog_id}), with {matched_count} matched peaks."
        )
    else:
        observations.append(
            "No reference-supported phase indication could be resolved "
            "from the current database catalog."
        )

    return observations


def _build_claim_boundaries(xrd_response: Dict[str, Any]) -> List[str]:
    """
    Build validation constraints using bounded scientific language.

    Allowed: "phase-purity confirmation requires additional validation"
    Forbidden: "confirmed phase purity"
    """
    boundaries = [
        (
            "The resolved phase labels represent a reference-supported "
            "phase indication rather than a definitive phase confirmation."
        ),
        (
            "The claim is a validation-limited scientific claim based "
            "solely on 1D bulk diffraction geometry."
        ),
        (
            "Phase-purity confirmation requires additional validation "
            "and complementary evidence."
        ),
    ]
    return boundaries


def _build_validation_gaps() -> List[str]:
    """
    Build default validation gaps for XRD evidence.

    These represent open validation questions that require complementary
    evidence to resolve.
    """
    return [
        (
            "Bulk crystallography cannot resolve surface-state oxidation "
            "states or localized grain boundaries; complementary XPS, FTIR, "
            "or Raman evidence is recommended."
        ),
        (
            "Lattice parameter matching is limited by database reference "
            "variations and potential solid-solution shift errors."
        ),
    ]


def _build_agent_ready_summary(xrd_response: Dict[str, Any]) -> str:
    """
    Build an LLM-optimized summary using bounded scientific language.
    """
    fitted_peaks = xrd_response.get("fitted_peaks", [])
    sn_ratio = _safe_float(xrd_response.get("sn_ratio"), 0.0)
    phase_match = xrd_response.get("phase_match")

    n_fit = len(fitted_peaks)

    if phase_match is not None:
        primary_phase = phase_match.get("primary_phase", "unknown")
        phase_str = (
            f"a reference-supported phase indication for '{primary_phase}'"
        )
    else:
        phase_str = "no resolved phase match"

    summary = (
        f"XRD analysis resolved {n_fit} fitted peaks with a signal-to-noise "
        f"ratio (SNR) of {sn_ratio:.2f}. Phase matching yields {phase_str}. "
        f"This is a validation-limited scientific claim. "
        f"Phase-purity confirmation requires additional validation and "
        f"complementary evidence; complementary XPS, FTIR, or Raman evidence "
        f"is recommended."
    )
    return summary


def _build_processing_summary(
    processing_params: Optional[Dict[str, Any]],
) -> str:
    """
    Build a human-readable summary of the processing parameters used.
    """
    if not processing_params:
        return "Processing parameters not recorded."

    parts: List[str] = []

    baseline = processing_params.get("baseline", {})
    if isinstance(baseline, dict) and baseline:
        method = baseline.get("method", "unknown")
        poly_order = baseline.get("poly_order", "")
        half_window = baseline.get("half_window", "")
        parts.append(
            f"Baseline correction: {method} "
            f"(poly_order={poly_order}, half_window={half_window})"
        )

    smoothing = processing_params.get("smoothing", {})
    if isinstance(smoothing, dict) and smoothing:
        method = smoothing.get("method", "unknown")
        window_length = smoothing.get("window_length", "")
        parts.append(
            f"Smoothing: {method} (window_length={window_length})"
        )

    fit_model = processing_params.get("fit_model", {})
    if fit_model:
        if isinstance(fit_model, dict):
            model_type = fit_model.get("model_type", "unknown")
        else:
            model_type = str(fit_model)
        parts.append(f"Peak fitting model: {model_type}")

    database = processing_params.get("database", {})
    if isinstance(database, dict) and database:
        ref_db = database.get("reference_db", "unknown")
        parts.append(f"Reference database: {ref_db}")

    wavelength = processing_params.get("wavelength")
    if wavelength is not None:
        parts.append(f"Wavelength: {wavelength} \u00c5")

    theta_min = processing_params.get("theta_min")
    theta_max = processing_params.get("theta_max")
    if theta_min is not None and theta_max is not None:
        parts.append(f"2\u03b8 range: [{theta_min}\u00b0, {theta_max}\u00b0]")

    if not parts:
        return "Processing parameters not recorded."

    return "; ".join(parts) + "."


def _compute_input_reference(xrd_response: Dict[str, Any]) -> str:
    """
    Compute a deterministic SHA-256 hash of the input data arrays.

    Uses x and y_raw arrays from the result to create a reproducible
    reference identifier.
    """
    x = xrd_response.get("x", [])
    y_raw = xrd_response.get("y_raw", [])

    if len(x) == 0 or len(y_raw) == 0:
        return hashlib.sha256(b"empty-xrd-data").hexdigest()

    # Use a compact representation: first 10 and last 10 points
    # to keep the hash computation bounded for large datasets
    n = len(x)
    sample_indices = list(range(min(10, n))) + list(range(max(0, n - 10), n))
    sample_indices = sorted(set(sample_indices))

    data_str = (
        f"n={n},"
        f"x_sample={[round(x[i], 6) for i in sample_indices if i < len(x)]},"
        f"y_sample={[round(y_raw[i], 6) for i in sample_indices if i < len(y_raw)]}"
    )
    return hashlib.sha256(data_str.encode("utf-8")).hexdigest()


def _build_provenance(
    processing_params: Optional[Dict[str, Any]],
    created_at: str,
) -> Dict[str, Any]:
    """
    Build provenance metadata dict.
    """
    return {
        "source": "xrd-backend-normalizer",
        "created_at": created_at,
        "processing_params": processing_params or {},
    }


def _build_raw_result(xrd_response: Dict[str, Any]) -> Dict[str, Any]:
    """
    Build the raw result dict, preserving the full XRD response.

    The signal arrays (x, y_raw, y_smoothed, etc.) are included as-is
    to preserve complete provenance. Consumers can choose to truncate
    or compress at the storage layer if needed.
    """
    return dict(xrd_response)