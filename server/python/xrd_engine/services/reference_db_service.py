"""
Reference Database Service.

Provides phase matching against reference XRD databases for the DIFARYX
XRD processing engine. Contains a realistic reference registry with
structural markers (2θ, I_rel, hkl) for common nanomaterial phases.

Supported databases (matching frontend UI dropdowns):
    - "ICSD"             → Inorganic Crystal Structure Database
    - "PDF-4+"           → Powder Diffraction File 4+
    - "Local Reference"  → User-curated local reference set

Phases in registry:
    - CuFe₂O₄  Spinel   (tetragonal/ cubic, JCPDS 34-0428 / ICSD-65363)
    - CoFe₂O₄  Spinel   (cubic Fd-3m, JCPDS 22-1086 / ICSD-15342)
    - Amorphous SBA-15   (broad SiO₂ humps at ~20–22° 2θ)
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from xrd_engine.services.xrd_engine import FittedPeak

logger = logging.getLogger(__name__)

# Tolerance for matching a measured peak to a reference marker (degrees 2θ)
DEFAULT_MATCH_TOLERANCE: float = 0.5


# ============================================================================
# Data classes
# ============================================================================


@dataclass(frozen=True)
class ReferenceMarker:
    """
    A single reference diffraction marker from a crystallographic database.

    Attributes:
        hkl:            Miller indices (e.g., "(311)").
        d_spacing:      Interplanar spacing in Ångströms.
        position_2theta: Expected 2θ position in degrees (Cu Kα).
        relative_intensity: Relative intensity on a 0–100 scale.
        phase_label:    Human-readable phase name (e.g., "CoFe2O4 Spinel").
    """
    hkl: str
    d_spacing: float
    position_2theta: float
    relative_intensity: float
    phase_label: str


@dataclass(frozen=True)
class PeakMatch:
    """
    Result of matching a measured peak against a reference marker.

    Attributes:
        measured_center:   Fitted 2θ position of the measured peak.
        reference_marker:  The closest matching reference marker.
        delta_2theta:      Difference (measured − reference) in degrees.
        confidence:        Match confidence score in [0, 1].
        db_source:         Which database the match came from.
    """
    measured_center: float
    reference_marker: ReferenceMarker
    delta_2theta: float
    confidence: float
    db_source: str


@dataclass
class PhaseMatchResult:
    """
    Aggregate result of phase matching for all detected peaks.

    Attributes:
        primary_phase:   Best-matching phase label.
        matched_peaks:   List of individual peak matches.
        db_source:       Database used for matching.
        catalog_id:      Catalog identifier (e.g., ICSD collection code).
        summary:         Human-readable match summary.
    """
    primary_phase: str
    matched_peaks: List[PeakMatch] = field(default_factory=list)
    db_source: str = ""
    catalog_id: str = ""
    summary: str = ""


# ============================================================================
# Reference registry — multi-phase marker library
# ============================================================================

# CuFe₂O₄ spinel (tetragonal / cubic, Cu Kα λ = 1.5406 Å)
# Reference: JCPDS 34-0428 / ICSD-65363
CUFE2O4_SPINEL_MARKERS: List[ReferenceMarker] = [
    ReferenceMarker(
        hkl="(111)",
        d_spacing=4.8500,
        position_2theta=18.33,
        relative_intensity=15.0,
        phase_label="CuFe2O4 Spinel",
    ),
    ReferenceMarker(
        hkl="(220)",
        d_spacing=2.9700,
        position_2theta=30.08,
        relative_intensity=30.0,
        phase_label="CuFe2O4 Spinel",
    ),
    ReferenceMarker(
        hkl="(311)",
        d_spacing=2.5350,
        position_2theta=35.45,
        relative_intensity=100.0,
        phase_label="CuFe2O4 Spinel",
    ),
    ReferenceMarker(
        hkl="(222)",
        d_spacing=2.4250,
        position_2theta=37.06,
        relative_intensity=10.0,
        phase_label="CuFe2O4 Spinel",
    ),
    ReferenceMarker(
        hkl="(400)",
        d_spacing=2.1000,
        position_2theta=43.18,
        relative_intensity=25.0,
        phase_label="CuFe2O4 Spinel",
    ),
    ReferenceMarker(
        hkl="(422)",
        d_spacing=1.7150,
        position_2theta=53.48,
        relative_intensity=12.0,
        phase_label="CuFe2O4 Spinel",
    ),
    ReferenceMarker(
        hkl="(511)",
        d_spacing=1.6160,
        position_2theta=56.98,
        relative_intensity=35.0,
        phase_label="CuFe2O4 Spinel",
    ),
    ReferenceMarker(
        hkl="(440)",
        d_spacing=1.4850,
        position_2theta=62.68,
        relative_intensity=45.0,
        phase_label="CuFe2O4 Spinel",
    ),
]

# CoFe₂O₄ spinel (cubic Fd-3m, Cu Kα λ = 1.5406 Å)
# Reference: JCPDS 22-1086 / ICSD-15342
# Slight lattice parameter shift vs CuFe₂O₄ (a=8.3919 Å vs ~8.44 Å)
COFE2O4_SPINEL_MARKERS: List[ReferenceMarker] = [
    ReferenceMarker(
        hkl="(111)",
        d_spacing=4.8430,
        position_2theta=18.37,
        relative_intensity=12.0,
        phase_label="CoFe2O4 Spinel",
    ),
    ReferenceMarker(
        hkl="(220)",
        d_spacing=2.9660,
        position_2theta=30.12,
        relative_intensity=30.0,
        phase_label="CoFe2O4 Spinel",
    ),
    ReferenceMarker(
        hkl="(311)",
        d_spacing=2.5320,
        position_2theta=35.48,
        relative_intensity=100.0,
        phase_label="CoFe2O4 Spinel",
    ),
    ReferenceMarker(
        hkl="(222)",
        d_spacing=2.4220,
        position_2theta=37.10,
        relative_intensity=8.0,
        phase_label="CoFe2O4 Spinel",
    ),
    ReferenceMarker(
        hkl="(400)",
        d_spacing=2.0970,
        position_2theta=43.12,
        relative_intensity=20.0,
        phase_label="CoFe2O4 Spinel",
    ),
    ReferenceMarker(
        hkl="(422)",
        d_spacing=1.7130,
        position_2theta=53.52,
        relative_intensity=10.0,
        phase_label="CoFe2O4 Spinel",
    ),
    ReferenceMarker(
        hkl="(511)",
        d_spacing=1.6140,
        position_2theta=57.02,
        relative_intensity=30.0,
        phase_label="CoFe2O4 Spinel",
    ),
    ReferenceMarker(
        hkl="(440)",
        d_spacing=1.4830,
        position_2theta=62.62,
        relative_intensity=40.0,
        phase_label="CoFe2O4 Spinel",
    ),
]

# Amorphous SBA-15 silica (mesoporous SiO₂)
# Broad humps characteristic of amorphous / low-order SiO₂ frameworks.
# hkl fields use descriptive labels since long-range order is absent.
SBA15_AMORPHOUS_MARKERS: List[ReferenceMarker] = [
    ReferenceMarker(
        hkl="(SiO₂ amorphous hump)",
        d_spacing=4.4400,
        position_2theta=20.00,
        relative_intensity=100.0,
        phase_label="SBA-15 Amorphous",
    ),
    ReferenceMarker(
        hkl="(SiO₂ amorphous shoulder)",
        d_spacing=4.0400,
        position_2theta=22.00,
        relative_intensity=70.0,
        phase_label="SBA-15 Amorphous",
    ),
    ReferenceMarker(
        hkl="(100 mesopore)",
        d_spacing=9.5000,
        position_2theta=9.30,
        relative_intensity=40.0,
        phase_label="SBA-15 Amorphous",
    ),
]

# Master registry: phase_label → list of markers
REFERENCE_REGISTRY: Dict[str, List[ReferenceMarker]] = {
    "CuFe2O4 Spinel": CUFE2O4_SPINEL_MARKERS,
    "CoFe2O4 Spinel": COFE2O4_SPINEL_MARKERS,
    "SBA-15 Amorphous": SBA15_AMORPHOUS_MARKERS,
}


# ============================================================================
# Database-specific metadata generators
# ============================================================================


def _get_db_metadata(db_type: str) -> dict:
    """
    Return database-specific metadata for a given reference source.

    Each database reports different catalog identifiers and formatting
    conventions to reflect real-world differences.

    Args:
        db_type: One of "ICSD", "PDF-4+", "Local Reference".

    Returns:
        Dictionary with keys: catalog_id, summary_template, confidence_scale.
    """
    if db_type == "ICSD":
        return {
            "catalog_id": "ICSD-15342",
            "summary_template": (
                "Matched against ICSD entries (15342 CoFe2O4 / 65363 CuFe2O4). "
                "{n_matched}/{n_total} markers above threshold."
            ),
            "confidence_scale": 1.0,
        }
    elif db_type == "PDF-4+":
        return {
            "catalog_id": "PDF-00-022-1086",
            "summary_template": (
                "Matched against PDF-4+ entries (00-022-1086 CoFe2O4, "
                "00-034-0428 CuFe2O4, broad SiO₂ SBA-15). "
                "{n_matched}/{n_total} markers above threshold."
            ),
            "confidence_scale": 0.95,
        }
    elif db_type == "Local Reference":
        return {
            "catalog_id": "LOCAL-MULTI-001",
            "summary_template": (
                "Matched against local reference library (spinel ferrites "
                "+ amorphous silica standards). "
                "{n_matched}/{n_total} markers above threshold."
            ),
            "confidence_scale": 0.85,
        }
    else:
        logger.warning("Unknown database type '%s'; using generic metadata.", db_type)
        return {
            "catalog_id": "UNKNOWN",
            "summary_template": "Matched against unknown database '{db_type}'. {n_matched}/{n_total} markers above threshold.",
            "confidence_scale": 0.5,
        }


# ============================================================================
# Peak matching service
# ============================================================================


def match_peaks(
    evidence_peaks: List[FittedPeak],
    db_type: str,
    tolerance: float = DEFAULT_MATCH_TOLERANCE,
) -> PhaseMatchResult:
    """
    Match fitted XRD peaks against reference database markers.

    Scans all phases in the reference registry and finds the closest marker
    within tolerance for each evidence peak. The phase with the most matched
    markers (weighted by confidence) is selected as the primary phase.

    Confidence scoring:
        proximity_score = 1.0 - (|Δ2θ| / tolerance)
        → 1.0 when Δ2θ = 0 (exact match)
        → 0.0 when |Δ2θ| = tolerance (edge of window)

    Args:
        evidence_peaks: Fitted peaks from the XRD processing engine.
        db_type: Reference database identifier
                 ("ICSD", "PDF-4+", or "Local Reference").
        tolerance: Maximum allowed |Δ2θ| for a match (default 0.5°).

    Returns:
        PhaseMatchResult with matched markers and metadata.
    """
    db_meta: dict = _get_db_metadata(db_type)
    confidence_scale: float = db_meta["confidence_scale"]

    # Flatten all markers from the registry into a single list,
    # keeping the phase_label attached to each marker.
    all_markers: List[ReferenceMarker] = []
    for phase_markers in REFERENCE_REGISTRY.values():
        all_markers.extend(phase_markers)

    matched: List[PeakMatch] = []

    for peak in evidence_peaks:
        best_marker: ReferenceMarker | None = None
        best_delta: float = float("inf")

        # Scan every marker across all phases
        for marker in all_markers:
            delta: float = abs(peak.center - marker.position_2theta)
            if delta < best_delta:
                best_delta = delta
                best_marker = marker

        if best_marker is not None and best_delta <= tolerance:
            # Confidence: purely position-based decay
            proximity_score: float = 1.0 - (best_delta / tolerance)
            proximity_score = max(0.0, min(1.0, proximity_score))

            # Apply database-specific confidence scaling
            confidence: float = round(
                max(0.0, min(1.0, proximity_score * confidence_scale)),
                4,
            )

            matched.append(
                PeakMatch(
                    measured_center=peak.center,
                    reference_marker=best_marker,
                    delta_2theta=round(peak.center - best_marker.position_2theta, 4),
                    confidence=confidence,
                    db_source=db_type,
                )
            )
            logger.debug(
                "Peak at %.2f° → %s %s (Δ=%.3f°, conf=%.3f)",
                peak.center,
                best_marker.phase_label,
                best_marker.hkl,
                best_delta,
                confidence,
            )
        else:
            logger.debug(
                "Peak at %.2f°: no reference match within %.2f° tolerance.",
                peak.center,
                tolerance,
            )

    # Determine primary phase: the phase with the highest total confidence
    primary_phase: str = "Unknown"
    if matched:
        phase_scores: Dict[str, float] = {}
        for pm in matched:
            label: str = pm.reference_marker.phase_label
            phase_scores[label] = phase_scores.get(label, 0.0) + pm.confidence
        primary_phase = max(phase_scores, key=phase_scores.get)  # type: ignore[arg-type]

    # Build summary
    n_matched: int = len(matched)
    n_total: int = len(evidence_peaks)
    summary_template: str = db_meta["summary_template"]
    summary: str = summary_template.format(
        n_matched=n_matched,
        n_total=n_total,
        db_type=db_type,
    )

    result = PhaseMatchResult(
        primary_phase=primary_phase,
        matched_peaks=matched,
        db_source=db_type,
        catalog_id=db_meta["catalog_id"],
        summary=summary,
    )

    logger.info(
        "Phase matching complete: %d/%d peaks matched to '%s' via %s.",
        n_matched,
        n_total,
        primary_phase,
        db_type,
    )

    return result


# ============================================================================
# Phase 4A/4B — Curated reference set + candidate matching
#
# This section adds a curated reference set for evidence-based candidate
# matching.  It does NOT replace the legacy match_peaks() function above.
# All results are candidate evidence only: phase_confirmed and
# phase_purity_confirmed are always False.
# ============================================================================


# ── Curated reference set: spinel_ferrite_sba15_demo_set ───────────────────

# Each entry uses real curated reference peaks from JCPDS/ICSD cards.
# Relative intensities are on a 0-100 scale relative to the strongest peak.

_CURATED_PHASES: List[dict] = [
    {
        "phase_id": "cofe2o4_icsd_15342",
        "phase_label": "CoFe2O4 Spinel (ICSD 15342)",
        "formula": "CoFe2O4",
        "structure_family": "spinel",
        "elements": ["Co", "Fe", "O"],
        "database_ref": "ICSD-15342 / JCPDS 22-1086",
        "peaks": [
            {"two_theta": 18.37, "relative_intensity": 12.0, "hkl": "(111)", "d_spacing": 4.843},
            {"two_theta": 30.12, "relative_intensity": 30.0, "hkl": "(220)", "d_spacing": 2.966},
            {"two_theta": 35.48, "relative_intensity": 100.0, "hkl": "(311)", "d_spacing": 2.532},
            {"two_theta": 37.10, "relative_intensity": 8.0, "hkl": "(222)", "d_spacing": 2.422},
            {"two_theta": 43.12, "relative_intensity": 20.0, "hkl": "(400)", "d_spacing": 2.097},
            {"two_theta": 53.52, "relative_intensity": 10.0, "hkl": "(422)", "d_spacing": 1.713},
            {"two_theta": 57.02, "relative_intensity": 30.0, "hkl": "(511)", "d_spacing": 1.614},
            {"two_theta": 62.62, "relative_intensity": 40.0, "hkl": "(440)", "d_spacing": 1.483},
        ],
    },
    {
        "phase_id": "fe3o4_reference",
        "phase_label": "Fe3O4 Magnetite",
        "formula": "Fe3O4",
        "structure_family": "spinel",
        "elements": ["Fe", "O"],
        "database_ref": "JCPDS 19-0629 / ICSD-65362",
        "peaks": [
            {"two_theta": 18.30, "relative_intensity": 10.0, "hkl": "(111)", "d_spacing": 4.845},
            {"two_theta": 30.10, "relative_intensity": 30.0, "hkl": "(220)", "d_spacing": 2.967},
            {"two_theta": 35.42, "relative_intensity": 100.0, "hkl": "(311)", "d_spacing": 2.532},
            {"two_theta": 37.08, "relative_intensity": 8.0, "hkl": "(222)", "d_spacing": 2.424},
            {"two_theta": 43.08, "relative_intensity": 20.0, "hkl": "(400)", "d_spacing": 2.099},
            {"two_theta": 53.44, "relative_intensity": 10.0, "hkl": "(422)", "d_spacing": 1.715},
            {"two_theta": 56.96, "relative_intensity": 30.0, "hkl": "(511)", "d_spacing": 1.616},
            {"two_theta": 62.56, "relative_intensity": 40.0, "hkl": "(440)", "d_spacing": 1.484},
        ],
    },
    {
        "phase_id": "gamma_fe2o3_reference",
        "phase_label": "gamma-Fe2O3 Maghemite",
        "formula": "Fe2O3",
        "structure_family": "spinel",
        "elements": ["Fe", "O"],
        "database_ref": "JCPDS 39-1346",
        "peaks": [
            {"two_theta": 18.38, "relative_intensity": 10.0, "hkl": "(110)", "d_spacing": 4.823},
            {"two_theta": 30.24, "relative_intensity": 25.0, "hkl": "(220)", "d_spacing": 2.953},
            {"two_theta": 35.62, "relative_intensity": 100.0, "hkl": "(311)", "d_spacing": 2.519},
            {"two_theta": 37.24, "relative_intensity": 8.0, "hkl": "(222)", "d_spacing": 2.414},
            {"two_theta": 43.28, "relative_intensity": 20.0, "hkl": "(400)", "d_spacing": 2.090},
            {"two_theta": 53.70, "relative_intensity": 10.0, "hkl": "(422)", "d_spacing": 1.706},
            {"two_theta": 57.20, "relative_intensity": 30.0, "hkl": "(511)", "d_spacing": 1.610},
            {"two_theta": 62.82, "relative_intensity": 35.0, "hkl": "(440)", "d_spacing": 1.479},
        ],
    },
    {
        "phase_id": "sba15_amorphous_reference",
        "phase_label": "SBA-15 Amorphous Silica",
        "formula": "SiO2",
        "structure_family": "amorphous",
        "elements": ["Si", "O"],
        "database_ref": "Local reference (broad hump)",
        "peaks": [
            {"two_theta": 9.30, "relative_intensity": 40.0, "hkl": "(100 mesopore)", "d_spacing": 9.500},
            {"two_theta": 20.00, "relative_intensity": 100.0, "hkl": "(SiO2 amorphous hump)", "d_spacing": 4.440},
            {"two_theta": 22.00, "relative_intensity": 70.0, "hkl": "(SiO2 amorphous shoulder)", "d_spacing": 4.040},
        ],
    },
]

# Registry mapping reference_set_id → list of curated phase dicts
CURATED_REFERENCE_SETS: Dict[str, List[dict]] = {
    "spinel_ferrite_sba15_demo_set": _CURATED_PHASES,
}

DEFAULT_REFERENCE_MATCH_LIMITATIONS = [
    "Candidate match is based on peak-position agreement.",
    "Chemical identity requires composition-sensitive evidence.",
    "Phase purity is not confirmed by XRD matching alone.",
]

LOCAL_REFERENCE_MATCH_LIMITATIONS = [
    "Uploaded local reference matching is request-scoped candidate evidence.",
    "Local reference provenance must be validated before stronger assignment.",
    "Chemical identity requires composition-sensitive evidence.",
    "Phase purity is not confirmed by XRD matching alone.",
]


def get_reference_set(reference_set_id: str) -> List[dict]:
    """Return the curated phases for a given reference_set_id, or empty list."""
    return CURATED_REFERENCE_SETS.get(reference_set_id, [])


def _extract_measured_peak_positions(measured_peaks: List[dict]) -> List[float]:
    """Extract finite measured peak positions from backend peak dictionaries."""
    positions: List[float] = []
    for peak in measured_peaks:
        pos = peak.get("center")
        if pos is None:
            pos = peak.get("position")
        if pos is None:
            pos = peak.get("two_theta")
        try:
            value = float(pos)
        except (TypeError, ValueError):
            continue
        if math.isfinite(value):
            positions.append(value)
    return positions


def _score_reference_phase(
    phase: dict,
    measured_positions: List[float],
    tolerance_two_theta: float,
    known_elem_set: set[str],
) -> dict:
    """Score one reference phase against measured peak positions."""
    ref_peaks = phase.get("peaks", [])
    matched_peaks_list: List[dict] = []

    for ref_peak in ref_peaks:
        ref_2theta = float(ref_peak["two_theta"])
        best_delta = float("inf")
        best_measured = None
        for measured_position in measured_positions:
            delta = abs(measured_position - ref_2theta)
            if delta < best_delta:
                best_delta = delta
                best_measured = measured_position

        if best_measured is not None and best_delta <= tolerance_two_theta:
            matched_peaks_list.append({
                "measured_two_theta": round(best_measured, 4),
                "reference_two_theta": round(ref_2theta, 4),
                "delta_two_theta": round(best_measured - ref_2theta, 4),
                "hkl": ref_peak.get("hkl"),
                "reference_relative_intensity": ref_peak.get("relative_intensity"),
            })

    ref_peak_count = len(ref_peaks)
    matched_peak_count = len(matched_peaks_list)
    coverage_ratio = round(matched_peak_count / ref_peak_count, 4) if ref_peak_count > 0 else 0.0

    if matched_peaks_list:
        position_scores = [
            max(0.0, 1.0 - abs(match["delta_two_theta"]) / tolerance_two_theta)
            for match in matched_peaks_list
        ]
        position_score = round(sum(position_scores) / len(position_scores), 4)
        mean_delta = round(
            sum(abs(match["delta_two_theta"]) for match in matched_peaks_list) / len(matched_peaks_list),
            4,
        )
    else:
        position_score = 0.0
        mean_delta = None

    coverage_score = coverage_ratio
    phase_elements = set(str(element).upper() for element in phase.get("elements", []))
    if known_elem_set and phase_elements:
        overlap = phase_elements & known_elem_set
        chemistry_score = round(len(overlap) / len(phase_elements), 4)
    else:
        chemistry_score = 1.0

    final_score = round(
        0.50 * position_score + 0.35 * coverage_score + 0.15 * chemistry_score,
        4,
    )

    return {
        "phase_id": phase.get("phase_id", "local_reference_candidate"),
        "phase_label": phase.get("phase_label", "Local reference candidate"),
        "formula": phase.get("formula") or "Not provided",
        "structure_family": phase.get("structure_family") or "local_reference",
        "elements": phase.get("elements", []),
        "database_ref": phase.get("database_ref"),
        "matched_peak_count": matched_peak_count,
        "reference_peak_count": ref_peak_count,
        "coverage_ratio": coverage_ratio,
        "mean_delta_two_theta": mean_delta,
        "position_score": position_score,
        "coverage_score": coverage_score,
        "chemistry_score": chemistry_score,
        "score": final_score,
        "matched_peaks": matched_peaks_list,
    }


def _local_ref_get(value: Any, key: str, default: Any = None) -> Any:
    if isinstance(value, dict):
        return value.get(key, default)
    return getattr(value, key, default)


def _safe_local_reference_id(label: str) -> str:
    safe = "".join(ch.lower() if ch.isalnum() else "_" for ch in label).strip("_")
    while "__" in safe:
        safe = safe.replace("__", "_")
    return safe[:64] or "local_reference"


def match_local_reference_candidate(
    measured_peaks: List[dict],
    local_reference: Any,
    tolerance_two_theta: float = 0.5,
    min_score: float = 0.65,
) -> dict:
    """
    Match measured/fitted peaks against an explicitly supplied local reference.

    The result is request-scoped candidate evidence only.  It never confirms
    chemical identity or phase purity and does not alter curated reference-set
    behavior.
    """
    reference_label = str(_local_ref_get(local_reference, "reference_label", "") or "").strip()
    source_file_name = _local_ref_get(local_reference, "source_file_name", None)
    source_label = str(source_file_name or reference_label or "local_reference")
    reference_set_id = f"local_reference:{_safe_local_reference_id(source_label)}"

    reference_peaks: List[dict] = []
    for peak in _local_ref_get(local_reference, "peaks", []) or []:
        two_theta = float(_local_ref_get(peak, "two_theta"))
        if not math.isfinite(two_theta):
            continue
        reference_peaks.append({
            "two_theta": two_theta,
            "relative_intensity": _local_ref_get(peak, "relative_intensity", None),
            "hkl": _local_ref_get(peak, "hkl", None),
            "d_spacing": _local_ref_get(peak, "d_spacing", None),
        })

    if len(reference_peaks) < 3:
        return {
            "status": "blocked",
            "claim_level": "none",
            "phase_confirmed": False,
            "phase_purity_confirmed": False,
            "reference_set_id": reference_set_id,
            "candidate_count": 0,
            "ranked_candidates": [],
            "primary_candidate": None,
            "backend_available": True,
            "reason": "Local reference matching requires at least 3 reference peaks.",
            "limitations": LOCAL_REFERENCE_MATCH_LIMITATIONS,
        }

    measured_positions = _extract_measured_peak_positions(measured_peaks)
    if not measured_positions:
        return {
            "status": "no_match",
            "claim_level": "none",
            "phase_confirmed": False,
            "phase_purity_confirmed": False,
            "reference_set_id": reference_set_id,
            "candidate_count": 0,
            "ranked_candidates": [],
            "primary_candidate": None,
            "backend_available": True,
            "reason": "No measured peak positions available for local reference matching.",
            "limitations": LOCAL_REFERENCE_MATCH_LIMITATIONS,
        }

    elements = [
        str(element).strip()
        for element in (_local_ref_get(local_reference, "elements", []) or [])
        if str(element).strip()
    ]
    phase = {
        "phase_id": f"local_reference_{_safe_local_reference_id(reference_label or source_label)}",
        "phase_label": reference_label or "Local reference candidate",
        "formula": _local_ref_get(local_reference, "formula", None) or "Not provided",
        "structure_family": _local_ref_get(local_reference, "material_family", None) or "local_reference",
        "elements": elements,
        "database_ref": f"Request-scoped local reference: {source_label}",
        "peaks": reference_peaks,
    }

    candidate = _score_reference_phase(
        phase=phase,
        measured_positions=measured_positions,
        tolerance_two_theta=tolerance_two_theta,
        known_elem_set=set(),
    )

    if candidate["score"] >= min_score:
        status = "candidate_match"
        claim_level = "reference_supported_candidate"
        reason = None
    elif candidate["matched_peak_count"] > 0:
        status = "no_match"
        claim_level = "weak_candidate"
        reason = "Local reference candidate did not meet the configured score threshold."
    else:
        status = "no_match"
        claim_level = "none"
        reason = "No local reference peaks matched measured peak positions within tolerance."

    return {
        "status": status,
        "claim_level": claim_level,
        "phase_confirmed": False,
        "phase_purity_confirmed": False,
        "reference_set_id": reference_set_id,
        "candidate_count": 1,
        "ranked_candidates": [candidate],
        "primary_candidate": candidate,
        "backend_available": True,
        "reason": reason,
        "limitations": LOCAL_REFERENCE_MATCH_LIMITATIONS,
    }


def match_reference_candidates(
    measured_peaks: List[dict],
    reference_set_id: str = "spinel_ferrite_sba15_demo_set",
    tolerance_two_theta: float = 0.5,
    candidate_phase_ids: Optional[List[str]] = None,
    excluded_phase_ids: Optional[List[str]] = None,
    known_elements: Optional[List[str]] = None,
    min_score: float = 0.65,
) -> dict:
    """
    Match measured/fitted peaks against curated reference phases and return
    ranked candidate results.

    This is evidence-based candidate screening only.  It does NOT confirm
    phase identity or phase purity.

    Args:
        measured_peaks: List of dicts with 'center' or 'position' (2θ) and
                        optionally 'amplitude' or 'intensity'.
        reference_set_id: Which curated set to use.
        tolerance_two_theta: Max |Δ2θ| for a peak pair match (default 0.5°).
        candidate_phase_ids: If provided, restrict to these phase IDs.
        excluded_phase_ids: Phase IDs to exclude.
        known_elements: Elements known to be present (used for chemistry scoring).
        min_score: Minimum final score threshold (informational).

    Returns:
        dict compatible with XRDReferenceMatchResult schema.
    """
    # Case A: missing or unknown reference set
    phases = get_reference_set(reference_set_id)
    if not phases:
        return {
            "status": "unavailable",
            "claim_level": "none",
            "phase_confirmed": False,
            "phase_purity_confirmed": False,
            "reference_set_id": reference_set_id,
            "candidate_count": 0,
            "ranked_candidates": [],
            "primary_candidate": None,
            "backend_available": False,
            "reason": f"Reference set '{reference_set_id}' is not available in the backend reference registry.",
            "limitations": DEFAULT_REFERENCE_MATCH_LIMITATIONS,
        }

    # Filter phases by candidate_phase_ids / excluded_phase_ids
    excluded = set(excluded_phase_ids or [])
    if candidate_phase_ids:
        allowed = set(candidate_phase_ids)
        phases = [p for p in phases if p["phase_id"] in allowed and p["phase_id"] not in excluded]
    else:
        phases = [p for p in phases if p["phase_id"] not in excluded]

    # Case B: no phases after filtering
    if not phases:
        return {
            "status": "no_match",
            "claim_level": "none",
            "phase_confirmed": False,
            "phase_purity_confirmed": False,
            "reference_set_id": reference_set_id,
            "candidate_count": 0,
            "ranked_candidates": [],
            "primary_candidate": None,
            "backend_available": True,
            "reason": "No reference phases available after candidate/exclusion filtering.",
            "limitations": DEFAULT_REFERENCE_MATCH_LIMITATIONS,
        }

    # Extract measured peak positions
    mp_positions = _extract_measured_peak_positions(measured_peaks)

    # Case C: no measured peaks
    if not mp_positions:
        return {
            "status": "no_match",
            "claim_level": "none",
            "phase_confirmed": False,
            "phase_purity_confirmed": False,
            "reference_set_id": reference_set_id,
            "candidate_count": 0,
            "ranked_candidates": [],
            "primary_candidate": None,
            "backend_available": True,
            "reason": "No measured peak positions available for reference matching.",
            "limitations": DEFAULT_REFERENCE_MATCH_LIMITATIONS,
        }

    candidates: List[dict] = []
    known_elem_set = set(e.upper() for e in (known_elements or []))

    for phase in phases:
        ref_peaks = phase.get("peaks", [])
        if not ref_peaks:
            continue

        matched_peaks_list: List[dict] = []
        for rp in ref_peaks:
            ref_2theta = rp["two_theta"]
            best_delta = float("inf")
            best_measured = None
            for mp in mp_positions:
                delta = abs(mp - ref_2theta)
                if delta < best_delta:
                    best_delta = delta
                    best_measured = mp

            if best_measured is not None and best_delta <= tolerance_two_theta:
                matched_peaks_list.append({
                    "measured_two_theta": round(best_measured, 4),
                    "reference_two_theta": round(ref_2theta, 4),
                    "delta_two_theta": round(best_measured - ref_2theta, 4),
                    "hkl": rp.get("hkl"),
                    "reference_relative_intensity": rp.get("relative_intensity"),
                })

        ref_peak_count = len(ref_peaks)
        matched_peak_count = len(matched_peaks_list)
        coverage_ratio = round(matched_peak_count / ref_peak_count, 4) if ref_peak_count > 0 else 0.0

        # Position score: mean of (1 - |delta|/tolerance) for matched peaks
        if matched_peaks_list:
            position_scores = [
                max(0.0, 1.0 - abs(mp["delta_two_theta"]) / tolerance_two_theta)
                for mp in matched_peaks_list
            ]
            position_score = round(sum(position_scores) / len(position_scores), 4)
            mean_delta = round(
                sum(abs(mp["delta_two_theta"]) for mp in matched_peaks_list) / len(matched_peaks_list),
                4,
            )
        else:
            position_score = 0.0
            mean_delta = None

        # Coverage score: ratio of matched to total reference peaks
        coverage_score = coverage_ratio

        # Chemistry score: 1.0 if no known_elements, else fraction of phase elements in known set
        phase_elements = set(e.upper() for e in phase.get("elements", []))
        if known_elem_set and phase_elements:
            overlap = phase_elements & known_elem_set
            chemistry_score = round(len(overlap) / len(phase_elements), 4)
        else:
            chemistry_score = 1.0  # No constraint → perfect chemistry score

        # Final score: weighted combination
        # Weights: position=0.50, coverage=0.35, chemistry=0.15
        final_score = round(
            0.50 * position_score + 0.35 * coverage_score + 0.15 * chemistry_score,
            4,
        )

        candidates.append({
            "phase_id": phase["phase_id"],
            "phase_label": phase["phase_label"],
            "formula": phase["formula"],
            "structure_family": phase["structure_family"],
            "elements": phase.get("elements", []),
            "database_ref": phase.get("database_ref"),
            "matched_peak_count": matched_peak_count,
            "reference_peak_count": ref_peak_count,
            "coverage_ratio": coverage_ratio,
            "mean_delta_two_theta": mean_delta,
            "position_score": position_score,
            "coverage_score": coverage_score,
            "chemistry_score": chemistry_score,
            "score": final_score,
            "matched_peaks": matched_peaks_list,
        })

    # Sort by final score descending
    candidates.sort(key=lambda c: c["score"], reverse=True)

    # Determine status and claim_level
    if not candidates:
        status = "no_match"
        claim_level = "none"
    elif candidates[0]["score"] < min_score:
        status = "no_match"
        claim_level = "weak_candidate" if candidates[0]["matched_peak_count"] > 0 else "none"
    elif known_elements and len(known_elements) > 0:
        status = "candidate_match"
        claim_level = "reference_supported_candidate"
    else:
        status = "candidate_screening"
        claim_level = "structure_family_indication"

    primary = candidates[0] if candidates else None

    return {
        "status": status,
        "claim_level": claim_level,
        "phase_confirmed": False,
        "phase_purity_confirmed": False,
        "reference_set_id": reference_set_id,
        "candidate_count": len(candidates),
        "ranked_candidates": candidates,
        "primary_candidate": primary,
        "limitations": DEFAULT_REFERENCE_MATCH_LIMITATIONS,
    }
