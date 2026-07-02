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
DEFAULT_MATCH_TOLERANCE: float = 0.2


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
    cod_id: Optional[str] = None


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
# DEPRECATED: Kept as fallback only for legacy unit tests.
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

    # Load markers dynamically from SQLite xrd_reference.db
    if not _DB_PATH.exists():
        try:
            from api.database_indexer import seed_mock_data
            seed_mock_data(_DB_PATH)
        except Exception as exc:
            logger.warning("Auto-seed failed in match_peaks: %s", exc)

    all_markers: List[ReferenceMarker] = []
    if _DB_PATH.exists():
        conn = _sqlite3.connect(str(_DB_PATH))
        try:
            cursor = conn.execute(
                "SELECT p.twotheta, p.d_spacing, p.relative_intensity, p.hkl, ph.phase_label, ph.database_ref "
                "FROM reference_peaks p JOIN reference_phases ph ON p.phase_id = ph.phase_id"
            )
            for tt, dsp, rel_int, hkl, plabel, db_ref in cursor:
                cod_id = None
                if db_ref and "COD-" in db_ref:
                    cod_id = db_ref.split("COD-")[1].split()[0].split("/")[0]
                all_markers.append(
                    ReferenceMarker(
                        hkl=hkl or "",
                        d_spacing=dsp or 0.0,
                        position_2theta=tt,
                        relative_intensity=rel_int or 0.0,
                        phase_label=plabel,
                        cod_id=cod_id,
                    )
                )
        finally:
            conn.close()
    else:
        # DEPRECATED fallback
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

    # =========================================================================
    # Hanawalt / Fink Search-Match Eligibility & Intensity-Weighted Coverage
    # =========================================================================
    MIN_MAJOR_INTENSITY_RATIO: float = 0.30        # Lines with relative intensity >= 30% of max are major
    MIN_MAJOR_LINE_COVERAGE_FRACTION: float = 0.40  # At least 40% of major lines must match
    MIN_PRIMARY_SCORE_THRESHOLD: float = 0.25       # Normalized weighted intensity-coverage score must be >= 0.25

    # Group markers by phase label
    markers_by_label: Dict[str, List[ReferenceMarker]] = {}
    for m in all_markers:
        markers_by_label.setdefault(m.phase_label, []).append(m)

    phase_weighted_scores: Dict[str, float] = {}
    eligible_phases: Dict[str, float] = {}

    for plabel, pmarkers in markers_by_label.items():
        max_int: float = max((m.relative_intensity for m in pmarkers), default=100.0)
        major_threshold: float = max_int * MIN_MAJOR_INTENSITY_RATIO
        major_markers = [m for m in pmarkers if m.relative_intensity >= major_threshold]

        # Matched peaks for this phase
        matched_for_phase = [pm for pm in matched if pm.reference_marker.phase_label == plabel]
        matched_positions = {pm.reference_marker.position_2theta for pm in matched_for_phase}

        # Gate A: Strongest line (>= 80% max intensity) must be matched within tolerance
        strong_markers = [m for m in pmarkers if m.relative_intensity >= 0.80 * max_int]
        has_strong_match: bool = any(m.position_2theta in matched_positions for m in strong_markers)

        # Gate B: Major lines coverage fraction
        matched_major_count: int = sum(1 for m in major_markers if m.position_2theta in matched_positions)
        major_coverage: float = matched_major_count / len(major_markers) if major_markers else 0.0

        # Gate C: Intensity-weighted coverage score calculation
        total_ref_int: float = sum(m.relative_intensity for m in pmarkers)
        matched_int_score: float = sum(pm.reference_marker.relative_intensity * pm.confidence for pm in matched_for_phase)
        weighted_score: float = round(matched_int_score / total_ref_int, 4) if total_ref_int > 0 else 0.0

        phase_weighted_scores[plabel] = weighted_score

        is_eligible: bool = (
            has_strong_match
            and (major_coverage >= MIN_MAJOR_LINE_COVERAGE_FRACTION)
            and (weighted_score >= MIN_PRIMARY_SCORE_THRESHOLD)
        )

        if is_eligible:
            eligible_phases[plabel] = weighted_score

    # Primary phase selection: highest weighted score among ELIGIBLE phases
    primary_phase: str = "Unknown"
    if eligible_phases:
        primary_phase = max(eligible_phases, key=eligible_phases.get)  # type: ignore[arg-type]


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


# ============================================================================
# Phase 5 — SQLite-backed FOM Search-Match (COD Local Snapshot)
#
# This section adds a high-speed Figure-of-Merit (FOM) search-match engine
# backed by a B-Tree indexed SQLite database of reference XRD phases.
#
# It does NOT replace any existing functions above.  It provides a new
# XRDFOMCalculator class that queries the local COD snapshot database
# and scores candidate phases using a 3-component FOM algorithm:
#   S_pos  — Gaussian position penalty
#   S_int  — Cosine similarity on intensity vectors
#   P      — Unmatched strong-peak penalty
#
# All results use probabilistic language consistent with DIFARYX scientific
# uncertainty guardrails.  No result ever claims 100% certainty or purity.
# ============================================================================

import json as _json
import os as _os
import sqlite3 as _sqlite3
from pathlib import Path as _Path

# Default path to the local reference database
_DB_DIR: _Path = _Path(__file__).resolve().parent.parent.parent / "data"
_DB_PATH: _Path = _DB_DIR / "xrd_reference.db"

# FOM algorithm constants
_SIGMA_DIVISOR: float = 2.0          # σ = tolerance / SIGMA_DIVISOR
_STRONG_PEAK_THRESHOLD: float = 70.0 # intensity threshold for unmatched penalty
_DEFAULT_POSITION_WEIGHT: float = 0.60
_DEFAULT_INTENSITY_WEIGHT: float = 0.40

# Scientific wording guardrails — terms that must appear in all FOM responses
_FOM_LIMITATIONS: List[str] = [
    "Match is probabilistic, not deterministic identification of phase identity.",
    "Phase purity cannot be assessed by XRD pattern matching alone.",
    "Overlapping peak profiles in multi-phase systems may reduce discrimination.",
    "Figure of Merit (FOM) reflects pattern similarity, not compositional analysis.",
    "Additional characterization (XPS, FTIR, Raman) is recommended for validation.",
]


# ── FOM Mock Fallback Data ─────────────────────────────────────────────────


def _get_mock_fallback_data() -> dict:
    """
    Return mock FOM search results when the SQLite database is not available.

    This prevents Exception errors when the database file has not been built.
    Returns realistic candidate phase data for TiO2 Anatase and Ag NP using
    crystallographic reference data from ICSD cards.

    Returns:
        dict with keys: status, match_type, candidate_phases, primary_candidate,
                        limitations, db_source, fallback_active.
    """
    logger.warning(
        "Reference database not found at %s. Using mock fallback data.",
        _DB_PATH,
    )

    mock_candidates = [
        {
            "phase_id": "tio2_anatase_icsd_9852",
            "phase_label": "TiO2 Anatase (ICSD 9852)",
            "formula": "TiO2",
            "structure_family": "anatase",
            "elements": ["Ti", "O"],
            "space_group": "I41/amd",
            "crystal_system": "tetragonal",
            "database_ref": "ICSD-9852",
            "fom_score": 0.7200,
            "position_score": 0.7500,
            "intensity_score": 0.6800,
            "unmatched_penalty": 0.9600,
            "consistent_with_profile": True,
            "matched_peak_count": 5,
            "reference_peak_count": 10,
            "matched_peaks": [
                {
                    "measured_two_theta": 25.30,
                    "reference_two_theta": 25.28,
                    "delta_two_theta": 0.02,
                    "hkl": "(101)",
                    "reference_relative_intensity": 100.0,
                    "gaussian_score": 0.997,
                },
                {
                    "measured_two_theta": 37.82,
                    "reference_two_theta": 37.80,
                    "delta_two_theta": 0.02,
                    "hkl": "(103)",
                    "reference_relative_intensity": 10.0,
                    "gaussian_score": 0.997,
                },
                {
                    "measured_two_theta": 48.10,
                    "reference_two_theta": 48.05,
                    "delta_two_theta": 0.05,
                    "hkl": "(200)",
                    "reference_relative_intensity": 35.0,
                    "gaussian_score": 0.990,
                },
                {
                    "measured_two_theta": 53.95,
                    "reference_two_theta": 53.89,
                    "delta_two_theta": 0.06,
                    "hkl": "(105)",
                    "reference_relative_intensity": 20.0,
                    "gaussian_score": 0.986,
                },
                {
                    "measured_two_theta": 55.10,
                    "reference_two_theta": 55.06,
                    "delta_two_theta": 0.04,
                    "hkl": "(211)",
                    "reference_relative_intensity": 20.0,
                    "gaussian_score": 0.992,
                },
            ],
            "unmatched_strong_peaks": [],
            "claim_level": "probabilistic_match",
        },
        {
            "phase_id": "ag_cubic_icsd_44387",
            "phase_label": "Ag Nanoparticle (ICSD 44387)",
            "formula": "Ag",
            "structure_family": "fcc_metal",
            "elements": ["Ag"],
            "space_group": "Fm-3m",
            "crystal_system": "cubic",
            "database_ref": "ICSD-44387",
            "fom_score": 0.5800,
            "position_score": 0.6200,
            "intensity_score": 0.5100,
            "unmatched_penalty": 0.9400,
            "consistent_with_profile": False,
            "matched_peak_count": 3,
            "reference_peak_count": 5,
            "matched_peaks": [
                {
                    "measured_two_theta": 38.15,
                    "reference_two_theta": 38.12,
                    "delta_two_theta": 0.03,
                    "hkl": "(111)",
                    "reference_relative_intensity": 100.0,
                    "gaussian_score": 0.996,
                },
                {
                    "measured_two_theta": 44.32,
                    "reference_two_theta": 44.28,
                    "delta_two_theta": 0.04,
                    "hkl": "(200)",
                    "reference_relative_intensity": 40.0,
                    "gaussian_score": 0.994,
                },
                {
                    "measured_two_theta": 64.48,
                    "reference_two_theta": 64.43,
                    "delta_two_theta": 0.05,
                    "hkl": "(220)",
                    "reference_relative_intensity": 25.0,
                    "gaussian_score": 0.990,
                },
            ],
            "unmatched_strong_peaks": [],
            "claim_level": "probabilistic_match",
        },
    ]

    return {
        "status": "candidate_match",
        "match_type": "probabilistic_match",
        "candidate_phases": mock_candidates,
        "primary_candidate": mock_candidates[0],
        "candidate_count": len(mock_candidates),
        "limitations": _FOM_LIMITATIONS,
        "db_source": "Mock Fallback (COD snapshot not initialized)",
        "fallback_active": True,
    }


# ── FOM Scoring Functions ──────────────────────────────────────────────────


def _gaussian_position_score(delta_2theta: float, sigma: float) -> float:
    """
    Gaussian penalty function for peak-position deviation.

    S_pos = exp(-(Δ2θ)² / (2σ²))

    Args:
        delta_2theta: Absolute difference between measured and reference 2θ (degrees).
        sigma:        Gaussian width parameter (σ = tolerance / 2).

    Returns:
        Position score in [0.0, 1.0].  1.0 = exact match, decays with distance.
    """
    if sigma <= 0.0:
        return 1.0 if abs(delta_2theta) < 1e-9 else 0.0
    return math.exp(-(delta_2theta ** 2) / (2.0 * sigma ** 2))


def _cosine_intensity_score(
    experimental_intensities: List[float],
    reference_intensities: List[float],
) -> float:
    """
    Cosine similarity between experimental and reference intensity vectors.

    cos(θ) = (I_exp · I_ref) / (‖I_exp‖ × ‖I_ref‖)

    Args:
        experimental_intensities: List of experimental relative intensities.
        reference_intensities:    List of reference relative intensities (same order).

    Returns:
        Cosine similarity in [0.0, 1.0].
    """
    n = min(len(experimental_intensities), len(reference_intensities))
    if n == 0:
        return 0.0

    exp_vec = experimental_intensities[:n]
    ref_vec = reference_intensities[:n]

    dot_product = sum(a * b for a, b in zip(exp_vec, ref_vec))
    norm_exp = math.sqrt(sum(a * a for a in exp_vec))
    norm_ref = math.sqrt(sum(b * b for b in ref_vec))

    if norm_exp < 1e-12 or norm_ref < 1e-12:
        return 0.0

    cosine = dot_product / (norm_exp * norm_ref)
    # Clamp to [0, 1] — negative cosine indicates anti-correlation
    return max(0.0, min(1.0, cosine))


def _unmatched_penalty(
    matched_ref_intensities: List[float],
    all_ref_intensities: List[float],
    threshold: float = _STRONG_PEAK_THRESHOLD,
) -> float:
    """
    Penalty factor for unmatched strong reference peaks.

    P = 1 - (count of unmatched strong peaks) / (count of all strong peaks)

    A "strong peak" has relative_intensity > threshold (default 70%).
    If all strong peaks are matched, P = 1.0 (no penalty).

    Args:
        matched_ref_intensities: Intensities of reference peaks that were matched.
        all_ref_intensities:     Intensities of ALL reference peaks for the phase.
        threshold:               Intensity threshold for "strong peak" classification.

    Returns:
        Penalty multiplier in [0.0, 1.0].  1.0 = no penalty.
    """
    strong_all = [i for i in all_ref_intensities if i >= threshold]
    if not strong_all:
        return 1.0  # No strong peaks → no penalty

    strong_matched = [i for i in matched_ref_intensities if i >= threshold]
    unmatched_count = len(strong_all) - len(strong_matched)

    # Ensure non-negative (defensive)
    unmatched_count = max(0, unmatched_count)

    penalty = 1.0 - (unmatched_count / len(strong_all))
    return max(0.0, min(1.0, penalty))


# ── XRDFOMCalculator ───────────────────────────────────────────────────────


class XRDFOMCalculator:
    """
    Figure-of-Merit (FOM) calculator for XRD phase search-match against a
    B-Tree indexed SQLite reference database.

    The calculator queries the local COD snapshot database using high-speed
    range scans (O(log N)) to retrieve candidate phases, then scores each
    candidate using a 3-component FOM algorithm:

        FOM = (w_pos × S_pos + w_int × S_int) × P

    where:
        S_pos = Gaussian position score (peak proximity)
        S_int = Cosine similarity on intensity vectors
        P     = Unmatched strong-peak penalty
        w_pos = 0.60 (position weight, default)
        w_int = 0.40 (intensity weight, default)

    The final FOM is clamped to [0.0, 1.0].

    If the SQLite database file does not exist, the calculator automatically
    activates fallback mode and returns mock candidate data to prevent
    application errors.

    Usage:
        calc = XRDFOMCalculator()
        result = calc.search_and_score(experimental_peaks, tolerance=0.5)
    """

    def __init__(
        self,
        db_path: Optional[str] = None,
        position_weight: float = _DEFAULT_POSITION_WEIGHT,
        intensity_weight: float = _DEFAULT_INTENSITY_WEIGHT,
    ):
        """
        Args:
            db_path:         Path to SQLite reference database.
                             Defaults to server/python/data/xrd_reference.db.
            position_weight: Weight for position score component (default 0.60).
            intensity_weight: Weight for intensity score component (default 0.40).
        """
        self._db_path: _Path = _Path(db_path) if db_path else _DB_PATH
        self._db_exists: bool = self._db_path.exists()
        self._position_weight = position_weight
        self._intensity_weight = intensity_weight

        if not self._db_exists:
            logger.warning(
                "XRDFOMCalculator: Database not found at %s. "
                "Fallback mode will activate on search.",
                self._db_path,
            )

    @property
    def db_available(self) -> bool:
        """Check if the SQLite database file exists."""
        return self._db_path.exists()

    def _ensure_db(self) -> bool:
        """Refresh the database availability flag."""
        self._db_exists = self._db_path.exists()
        return self._db_exists

    def _query_candidate_phases(
        self,
        min_twotheta: float,
        max_twotheta: float,
        tolerance: float,
    ) -> List[str]:
        """
        Query the database for phase_ids that have at least one peak
        within the experimental 2θ range ± tolerance.

        Uses B-Tree index: O(log N) per bound scan.

        Returns:
            List of phase_id strings.
        """
        conn = _sqlite3.connect(str(self._db_path))
        try:
            cursor = conn.execute(
                """
                SELECT DISTINCT phase_id
                FROM reference_peaks
                WHERE twotheta BETWEEN ? AND ?
                """,
                (min_twotheta - tolerance, max_twotheta + tolerance),
            )
            return [row[0] for row in cursor.fetchall()]
        finally:
            conn.close()

    def _get_phase_metadata(self, phase_id: str) -> Optional[dict]:
        """Fetch phase metadata from reference_phases table."""
        conn = _sqlite3.connect(str(self._db_path))
        try:
            cursor = conn.execute(
                """
                SELECT phase_id, phase_label, formula, structure_family,
                       elements, space_group, crystal_system, database_ref,
                       lattice_a, lattice_b, lattice_c,
                       lattice_alpha, lattice_beta, lattice_gamma
                FROM reference_phases
                WHERE phase_id = ?
                """,
                (phase_id,),
            )
            row = cursor.fetchone()
            if row is None:
                return None

            elements_raw = row[4]
            try:
                elements = _json.loads(elements_raw) if elements_raw else []
            except (ValueError, TypeError):
                elements = []

            return {
                "phase_id": row[0],
                "phase_label": row[1],
                "formula": row[2],
                "structure_family": row[3],
                "elements": elements,
                "space_group": row[5],
                "crystal_system": row[6],
                "database_ref": row[7],
                "lattice_a": row[8],
                "lattice_b": row[9],
                "lattice_c": row[10],
                "lattice_alpha": row[11],
                "lattice_beta": row[12],
                "lattice_gamma": row[13],
            }
        finally:
            conn.close()

    def _get_phase_peaks(self, phase_id: str) -> List[dict]:
        """Fetch all reference peaks for a given phase."""
        conn = _sqlite3.connect(str(self._db_path))
        try:
            cursor = conn.execute(
                """
                SELECT twotheta, d_spacing, relative_intensity, hkl, multiplicity
                FROM reference_peaks
                WHERE phase_id = ?
                ORDER BY twotheta ASC
                """,
                (phase_id,),
            )
            return [
                {
                    "twotheta": row[0],
                    "d_spacing": row[1],
                    "relative_intensity": row[2],
                    "hkl": row[3],
                    "multiplicity": row[4],
                }
                for row in cursor.fetchall()
            ]
        finally:
            conn.close()

    def search_and_score(
        self,
        experimental_peaks: List[dict],
        tolerance: float = 0.5,
    ) -> dict:
        """
        Search the reference database and score candidate phases using FOM.

        Args:
            experimental_peaks: List of dicts with 'twotheta' (or 'center',
                                'position') and optionally 'intensity',
                                'amplitude', 'relative_intensity'.
            tolerance:          Maximum |Δ2θ| for peak matching (degrees).

        Returns:
            dict with keys:
                status, match_type, candidate_phases, primary_candidate,
                candidate_count, limitations, db_source, fallback_active,
                algorithm_info.
        """
        # ── Fallback mode check ────────────────────────────────────────────
        if not self._ensure_db():
            return _get_mock_fallback_data()

        # ── Extract experimental peak positions and intensities ─────────────
        exp_peaks: List[dict] = []
        for peak in experimental_peaks:
            pos = peak.get("twotheta") or peak.get("center") or peak.get("position")
            if pos is None:
                continue
            try:
                pos_val = float(pos)
            except (TypeError, ValueError):
                continue
            if not math.isfinite(pos_val):
                continue

            # Extract intensity (try multiple keys)
            intensity = (
                peak.get("relative_intensity")
                or peak.get("intensity")
                or peak.get("amplitude")
                or 50.0  # default if not provided
            )
            try:
                intensity_val = float(intensity)
            except (TypeError, ValueError):
                intensity_val = 50.0

            exp_peaks.append({
                "twotheta": pos_val,
                "intensity": max(0.0, intensity_val),
            })

        if not exp_peaks:
            return {
                "status": "no_match",
                "match_type": "probabilistic_match",
                "candidate_phases": [],
                "primary_candidate": None,
                "candidate_count": 0,
                "limitations": _FOM_LIMITATIONS,
                "db_source": "COD Local Snapshot",
                "fallback_active": False,
                "algorithm_info": _get_algorithm_info(self),
            }

        # ── Determine experimental 2θ range ────────────────────────────────
        all_positions = [p["twotheta"] for p in exp_peaks]
        min_2theta = min(all_positions)
        max_2theta = max(all_positions)

        # ── Query candidate phase IDs via B-Tree index ──────────────────────
        candidate_phase_ids = self._query_candidate_phases(
            min_2theta, max_2theta, tolerance
        )

        if not candidate_phase_ids:
            return {
                "status": "no_match",
                "match_type": "probabilistic_match",
                "candidate_phases": [],
                "primary_candidate": None,
                "candidate_count": 0,
                "limitations": _FOM_LIMITATIONS,
                "db_source": "COD Local Snapshot",
                "fallback_active": False,
                "algorithm_info": _get_algorithm_info(self),
            }

        # ── Score each candidate phase ─────────────────────────────────────
        sigma = tolerance / _SIGMA_DIVISOR
        scored_candidates: List[dict] = []

        for phase_id in candidate_phase_ids:
            meta = self._get_phase_metadata(phase_id)
            if meta is None:
                continue

            ref_peaks = self._get_phase_peaks(phase_id)
            if not ref_peaks:
                continue

            # ── Peak matching (greedy nearest-neighbor) ─────────────────────
            matched_pairs: List[dict] = []
            matched_ref_intensities: List[float] = []
            used_exp_indices: set = set()

            for ref_peak in ref_peaks:
                ref_pos = ref_peak["twotheta"]
                ref_int = ref_peak["relative_intensity"] or 0.0

                best_delta = float("inf")
                best_exp_idx = -1

                for idx, exp_peak in enumerate(exp_peaks):
                    if idx in used_exp_indices:
                        continue
                    delta = abs(exp_peak["twotheta"] - ref_pos)
                    if delta < best_delta:
                        best_delta = delta
                        best_exp_idx = idx

                if best_exp_idx >= 0 and best_delta <= tolerance:
                    exp_peak = exp_peaks[best_exp_idx]
                    gauss_score = _gaussian_position_score(best_delta, sigma)
                    matched_pairs.append({
                        "measured_two_theta": round(exp_peak["twotheta"], 4),
                        "reference_two_theta": round(ref_pos, 4),
                        "delta_two_theta": round(
                            exp_peak["twotheta"] - ref_pos, 4
                        ),
                        "hkl": ref_peak["hkl"],
                        "reference_relative_intensity": round(ref_int, 2),
                        "gaussian_score": round(gauss_score, 4),
                    })
                    matched_ref_intensities.append(ref_int)
                    used_exp_indices.add(best_exp_idx)

            # ── S_pos: Mean Gaussian position score ─────────────────────────
            if matched_pairs:
                s_pos = sum(p["gaussian_score"] for p in matched_pairs) / len(
                    matched_pairs
                )
            else:
                s_pos = 0.0

            # ── S_int: Cosine similarity on intensity vectors ───────────────
            # Build vectors: for each matched pair, collect exp & ref intensities
            exp_int_vec: List[float] = []
            ref_int_vec: List[float] = []
            for pair in matched_pairs:
                # Find the experimental intensity for this match
                exp_pos = pair["measured_two_theta"]
                for exp_peak in exp_peaks:
                    if abs(exp_peak["twotheta"] - exp_pos) < 1e-6:
                        exp_int_vec.append(exp_peak["intensity"])
                        break
                ref_int_vec.append(pair["reference_relative_intensity"])

            s_int = _cosine_intensity_score(exp_int_vec, ref_int_vec)

            # ── P: Unmatched strong-peak penalty ────────────────────────────
            all_ref_intensities = [
                rp["relative_intensity"] or 0.0 for rp in ref_peaks
            ]
            penalty = _unmatched_penalty(
                matched_ref_intensities, all_ref_intensities
            )

            # ── Identify unmatched strong peaks ─────────────────────────────
            unmatched_strong: List[dict] = []
            matched_ref_positions = {pair["reference_two_theta"] for pair in matched_pairs}
            for rp in ref_peaks:
                ref_int = rp["relative_intensity"] or 0.0
                if ref_int >= _STRONG_PEAK_THRESHOLD:
                    if rp["twotheta"] not in matched_ref_positions:
                        unmatched_strong.append({
                            "reference_two_theta": round(rp["twotheta"], 4),
                            "hkl": rp["hkl"],
                            "reference_relative_intensity": round(ref_int, 2),
                        })

            # ── FOM: Weighted combination × penalty ─────────────────────────
            raw_fom = (
                self._position_weight * s_pos
                + self._intensity_weight * s_int
            )
            fom = max(0.0, min(1.0, raw_fom * penalty))

            # ── Determine claim_level based on FOM ──────────────────────────
            if fom >= 0.70:
                claim_level = "probabilistic_match"
                consistent = True
            elif fom >= 0.40:
                claim_level = "candidate_phase"
                consistent = True
            else:
                claim_level = "weak_candidate"
                consistent = False

            scored_candidates.append({
                "phase_id": meta["phase_id"],
                "phase_label": meta["phase_label"],
                "formula": meta["formula"],
                "structure_family": meta["structure_family"],
                "elements": meta["elements"],
                "space_group": meta.get("space_group"),
                "crystal_system": meta.get("crystal_system"),
                "database_ref": meta.get("database_ref"),
                "fom_score": round(fom, 4),
                "position_score": round(s_pos, 4),
                "intensity_score": round(s_int, 4),
                "unmatched_penalty": round(penalty, 4),
                "consistent_with_profile": consistent,
                "matched_peak_count": len(matched_pairs),
                "reference_peak_count": len(ref_peaks),
                "matched_peaks": matched_pairs,
                "unmatched_strong_peaks": unmatched_strong,
                "claim_level": claim_level,
            })

        # ── Rank by FOM descending ─────────────────────────────────────────
        scored_candidates.sort(key=lambda c: c["fom_score"], reverse=True)

        # ── Determine top-level status ─────────────────────────────────────
        if scored_candidates and scored_candidates[0]["fom_score"] >= 0.40:
            status = "candidate_match"
            match_type = "probabilistic_match"
        elif scored_candidates and scored_candidates[0]["fom_score"] > 0.0:
            status = "weak_match"
            match_type = "probabilistic_match"
        else:
            status = "no_match"
            match_type = "probabilistic_match"

        primary = scored_candidates[0] if scored_candidates else None

        return {
            "status": status,
            "match_type": match_type,
            "candidate_phases": scored_candidates,
            "primary_candidate": primary,
            "candidate_count": len(scored_candidates),
            "limitations": _FOM_LIMITATIONS,
            "db_source": "COD Local Snapshot",
            "fallback_active": False,
            "algorithm_info": _get_algorithm_info(self),
        }


def _get_algorithm_info(calc: XRDFOMCalculator) -> dict:
    """Return metadata about the FOM algorithm configuration."""
    return {
        "algorithm": "Figure of Merit (FOM)",
        "position_score": "Gaussian penalty: exp(-(Δ2θ)² / (2σ²))",
        "intensity_score": "Cosine similarity on matched intensity vectors",
        "unmatched_penalty": "Penalty for strong reference peaks (>70% I_rel) not matched",
        "weights": {
            "position": calc._position_weight,
            "intensity": calc._intensity_weight,
        },
        "sigma": "tolerance / 2.0",
        "fom_range": "[0.0, 1.0]",
        "claim_levels": {
            "probabilistic_match": "FOM >= 0.70",
            "candidate_phase": "0.40 <= FOM < 0.70",
            "weak_candidate": "FOM < 0.40",
        },
        "disclaimer": (
            "FOM reflects pattern similarity under controlled assumptions. "
            "It is not a compositional proof. Additional characterization "
            "(XPS, FTIR, Raman) is recommended for validation."
        ),
    }
