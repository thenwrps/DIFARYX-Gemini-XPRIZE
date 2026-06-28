"""
XPS Reference Database Service.

Provides SQLite-backed core-level and satellite binding energy search-match against
peer-reviewed literature reference tables. Configured with 7 verified oxidation-state phases.
Ferrites are deliberately excluded. O 1s is non-scored context.
"""

from __future__ import annotations

import json
import logging
import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional

from api.xps_database_indexer import XpsDatabaseIndexer, _DEFAULT_DB_PATH

logger = logging.getLogger(__name__)

DEFAULT_XPS_TOLERANCE: float = 0.5
XPS_FERRITE_CAVEAT: str = (
    "XPS sees oxidation states and elements present; it CANNOT distinguish a spinel ferrite "
    "(CuFe2O4 / NiFe2O4 / CoFe2O4) from a physical mixture of oxides. Spinel ferrites are deliberately excluded from Layer-2."
)


@dataclass(frozen=True)
class XpsObservedPeak:
    position: float
    intensity: float
    relative_intensity: float = 100.0
    prominence: float = 0.0


@dataclass(frozen=True)
class XpsReferenceMarker:
    phase_id: str
    phase_label: str
    formula: str
    db_source: str
    binding_energy_ev: float
    tolerance_ev: float
    peak_type: str
    orbital: str
    source_doi: Optional[str] = None
    caveat: Optional[str] = None


@dataclass(frozen=True)
class XpsBandMatch:
    measured_position: float
    reference_marker: XpsReferenceMarker
    delta_ev: float


@dataclass
class XpsPhaseCandidate:
    phase_id: str
    phase_label: str
    formula: str
    db_source: str
    source_doi: Optional[str]
    caveat: Optional[str]
    matched_bands: List[XpsBandMatch]
    total_reference_bands: int
    match_score: float
    confidence_level: str


@dataclass
class XpsMatchResponse:
    candidates: List[XpsPhaseCandidate]
    primary_candidate: Optional[XpsPhaseCandidate]
    status_summary: str
    is_calibrated: bool
    tolerance_used: float


def _ensure_db() -> Path:
    if not _DEFAULT_DB_PATH.exists() or _DEFAULT_DB_PATH.stat().st_size == 0:
        logger.info("XPS SQLite DB missing. Triggering auto-build...")
        XpsDatabaseIndexer.build_database()
    return _DEFAULT_DB_PATH


def match_xps_peaks(
    observed_peaks: List[XpsObservedPeak],
    is_calibrated: bool = True,
    tolerance_ev: float = DEFAULT_XPS_TOLERANCE,
) -> XpsMatchResponse:
    """Executes SQLite search match for XPS binding energies against Layer-2 database."""
    db_path = _ensure_db()
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row

    try:
        phases_raw = conn.execute("SELECT * FROM reference_phases").fetchall()
        formula_counts: dict[str, set] = {}
        for ph in phases_raw:
            formula_counts.setdefault(ph["formula"], set()).add(ph["phase_label"])

        candidates: List[XpsPhaseCandidate] = []

        for ph in phases_raw:
            ph_id = ph["phase_id"]
            ref_bands = conn.execute(
                "SELECT * FROM reference_peaks WHERE phase_id = ?", (ph_id,)
            ).fetchall()

            matched: List[XpsBandMatch] = []
            obs_used = set()

            for rb in ref_bands:
                pos = rb["binding_energy_ev"]
                tol = rb["tolerance_ev"]
                best_obs = None
                best_delta = float("inf")

                for idx, obs in enumerate(observed_peaks):
                    if idx in obs_used:
                        continue
                    delta = abs(obs.position - pos)
                    if delta <= tol and delta < best_delta:
                        best_delta = delta
                        best_obs = (idx, obs)

                if best_obs is not None:
                    obs_used.add(best_obs[0])
                    marker = XpsReferenceMarker(
                        phase_id=ph_id,
                        phase_label=ph["phase_label"],
                        formula=ph["formula"],
                        db_source=ph["db_source"],
                        binding_energy_ev=pos,
                        tolerance_ev=tol,
                        peak_type=rb["peak_type"],
                        orbital=rb["orbital"],
                        source_doi=ph["source_doi"],
                        caveat=ph["caveat"],
                    )
                    matched.append(
                        XpsBandMatch(
                            measured_position=best_obs[1].position,
                            reference_marker=marker,
                            delta_ev=best_delta,
                        )
                    )

            tot_bands = len(ref_bands)
            ratio = len(matched) / tot_bands if tot_bands > 0 else 0.0
            score = min(1.0, ratio * 1.1)

            caveat_str = ph["caveat"]
            forbidden_triggered = False

            # Check forbiddenSatellites
            if ph["forbidden_satellites_json"]:
                forbidden_rules = json.loads(ph["forbidden_satellites_json"])
                for rule in forbidden_rules:
                    f_range = rule["range"]
                    max_rel = rule["maxRelIntensity"]
                    reason = rule["reason"]

                    for obs in observed_peaks:
                        if f_range[0] <= obs.position <= f_range[1]:
                            obs_rel = obs.relative_intensity / 100.0 if obs.relative_intensity > 1.0 else obs.relative_intensity
                            if obs_rel >= max_rel:
                                forbidden_triggered = True
                                caveat_str = (caveat_str + "; " if caveat_str else "") + f"Forbidden satellite detected: {reason}"
                                break
                    if forbidden_triggered:
                        break

            if forbidden_triggered:
                score = score * 0.2

            conf = "high" if score >= 0.75 else "medium" if score >= 0.45 else "low"

            if forbidden_triggered:
                conf = "low"

            # Requirement 5: Uncalibrated confidence cap
            if not is_calibrated:
                conf = "low"
                uncal_msg = "Uncalibrated spectrum (no C 1s = 284.8 eV reference found in [282.0, 288.0] eV). Confidence capped at LOW."
                if not caveat_str or "Uncalibrated" not in caveat_str:
                    caveat_str = (caveat_str + "; " if caveat_str else "") + uncal_msg

            # Requirement 3: Same-formula confidence cap
            if len(formula_counts.get(ph["formula"], set())) > 1:
                conf = "low"
                if ph["formula"] == "Fe2O3":
                    poly_msg = "XPS cannot resolve gamma- vs alpha-Fe2O3 polymorph; confirm by XRD/Raman."
                elif ph["formula"] == "TiO2":
                    poly_msg = "XPS cannot resolve anatase vs rutile; confirm by Raman/XRD."
                else:
                    poly_msg = f"XPS cannot resolve {ph['formula']} polymorphs; confirm by XRD/Raman."
                if not caveat_str or poly_msg not in caveat_str:
                    caveat_str = (caveat_str + "; " if caveat_str else "") + poly_msg

            candidates.append(
                XpsPhaseCandidate(
                    phase_id=ph_id,
                    phase_label=ph["phase_label"],
                    formula=ph["formula"],
                    db_source=ph["db_source"],
                    source_doi=ph["source_doi"],
                    caveat=caveat_str,
                    matched_bands=matched,
                    total_reference_bands=tot_bands,
                    match_score=score,
                    confidence_level=conf,
                )
            )

        candidates.sort(key=lambda c: c.match_score, reverse=True)
        primary = candidates[0] if candidates and candidates[0].match_score >= 0.35 else None
        summary = (
            f"Confident XPS match: {primary.phase_label} ({primary.formula})"
            if primary
            else "No confident Layer-2 phase match"
        )

        return XpsMatchResponse(
            candidates=candidates,
            primary_candidate=primary,
            status_summary=summary,
            is_calibrated=is_calibrated,
            tolerance_used=tolerance_ev,
        )

    finally:
        conn.close()
