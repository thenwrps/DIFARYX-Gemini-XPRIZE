"""
FTIR Reference Database Service.

Provides SQLite-backed vibrational band search-match against measured
reference FTIR spectra and peer-reviewed literature tables.
Currently configured for empty Layer-2 reference matching until sources are verified.
"""

from __future__ import annotations

import logging
import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional

from api.ftir_database_indexer import FtirDatabaseIndexer, _DEFAULT_DB_PATH

logger = logging.getLogger(__name__)

DEFAULT_FTIR_TOLERANCE: float = 25.0
FTIR_FERRITE_CAVEAT: str = (
    "All spinel ferrites show only two broad IR bands (~600 and ~400 cm⁻¹) "
    "that are largely composition-insensitive; FTIR alone CANNOT reliably "
    "discriminate among CuFe₂O₄, NiFe₂O₄, and CoFe₂O₄."
)


@dataclass(frozen=True)
class FtirObservedBand:
    position: float
    intensity: float
    fwhm: float = 40.0
    classification: str = "medium"


@dataclass(frozen=True)
class FtirReferenceMarker:
    phase_id: str
    phase_label: str
    formula: str
    db_source: str
    position_cm1: float
    relative_intensity: float
    assignment: str
    rruff_id: Optional[str] = None
    source_doi: Optional[str] = None
    caveat: Optional[str] = None


@dataclass(frozen=True)
class FtirBandMatch:
    measured_position: float
    reference_marker: FtirReferenceMarker
    delta_cm1: float
    intensity_ratio: float


@dataclass
class FtirPhaseCandidate:
    phase_id: str
    phase_label: str
    formula: str
    db_source: str
    rruff_id: Optional[str]
    source_doi: Optional[str]
    caveat: Optional[str]
    matched_bands: List[FtirBandMatch]
    total_reference_bands: int
    match_score: float
    confidence_level: str


@dataclass
class FtirMatchResponse:
    candidates: List[FtirPhaseCandidate]
    primary_candidate: Optional[FtirPhaseCandidate]
    status_summary: str
    tolerance_used: float


def _ensure_db() -> Path:
    if not _DEFAULT_DB_PATH.exists() or _DEFAULT_DB_PATH.stat().st_size == 0:
        logger.info("FTIR SQLite DB missing. Triggering auto-build...")
        FtirDatabaseIndexer.build_database()
    return _DEFAULT_DB_PATH


def match_ftir_bands(
    observed_bands: List[FtirObservedBand],
    tolerance_cm1: float = DEFAULT_FTIR_TOLERANCE,
) -> FtirMatchResponse:
    """Executes SQLite search match for FTIR bands against Layer-2 database."""
    db_path = _ensure_db()
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row

    try:
        phases_raw = conn.execute("SELECT * FROM reference_phases").fetchall()
        formula_counts: dict[str, set] = {}
        for ph in phases_raw:
            formula_counts.setdefault(ph["formula"], set()).add(ph["phase_label"])

        candidates: List[FtirPhaseCandidate] = []

        for ph in phases_raw:
            ph_id = ph["phase_id"]
            ref_bands = conn.execute(
                "SELECT * FROM reference_peaks WHERE phase_id = ?", (ph_id,)
            ).fetchall()

            matched: List[FtirBandMatch] = []
            obs_used = set()

            for rb in ref_bands:
                pos = rb["position_cm1"]
                best_obs = None
                best_delta = float("inf")

                for idx, obs in enumerate(observed_bands):
                    if idx in obs_used:
                        continue
                    delta = abs(obs.position - pos)
                    if delta <= tolerance_cm1 and delta < best_delta:
                        best_delta = delta
                        best_obs = (idx, obs)

                if best_obs is not None:
                    obs_used.add(best_obs[0])
                    marker = FtirReferenceMarker(
                        phase_id=ph_id,
                        phase_label=ph["phase_label"],
                        formula=ph["formula"],
                        db_source=ph["db_source"],
                        position_cm1=pos,
                        relative_intensity=rb["relative_intensity"],
                        assignment=rb["symmetry"] or "IR vibration",
                        rruff_id=ph["rruff_id"],
                        source_doi=ph["source_doi"],
                        caveat=ph["caveat"],
                    )
                    matched.append(
                        FtirBandMatch(
                            measured_position=best_obs[1].position,
                            reference_marker=marker,
                            delta_cm1=best_delta,
                            intensity_ratio=best_obs[1].intensity / (rb["relative_intensity"] / 100.0 + 1e-3),
                        )
                    )

            tot_bands = len(ref_bands)
            ratio = len(matched) / tot_bands if tot_bands > 0 else 0.0

            score = min(1.0, ratio * 1.1)

            # Check if ferrite caveat applies
            caveat_str = ph["caveat"]
            if "Fe" in ph["formula"] and "O" in ph["formula"] and "ferrite" in ph["phase_label"].lower():
                caveat_str = (caveat_str + "; " if caveat_str else "") + FTIR_FERRITE_CAVEAT

            conf = "high" if score >= 0.75 else "medium" if score >= 0.45 else "low"

            if len(formula_counts.get(ph["formula"], set())) > 1:
                conf = "low"
                poly_msg = (
                    "TiO2 polymorph; FTIR weakly discriminates anatase vs rutile — confirm by Raman/XRD."
                    if ph["formula"] == "TiO2"
                    else f"{ph['formula']} polymorph; FTIR weakly discriminates polymorphs — confirm by Raman/XRD."
                )
                if not caveat_str or "polymorph" not in caveat_str.lower():
                    caveat_str = (caveat_str + "; " if caveat_str else "") + poly_msg

            candidates.append(
                FtirPhaseCandidate(
                    phase_id=ph_id,
                    phase_label=ph["phase_label"],
                    formula=ph["formula"],
                    db_source=ph["db_source"],
                    rruff_id=ph["rruff_id"],
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
            f"Confident FTIR match: {primary.phase_label} ({primary.formula})"
            if primary
            else "No confident Layer-2 phase match"
        )

        return FtirMatchResponse(
            candidates=candidates,
            primary_candidate=primary,
            status_summary=summary,
            tolerance_used=tolerance_cm1,
        )

    finally:
        conn.close()
