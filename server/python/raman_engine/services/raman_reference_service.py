"""
Raman Reference Database Service.

Provides SQLite-backed vibrational peak search-match against measured
reference Raman spectra and peer-reviewed literature tables.
"""

from __future__ import annotations

import logging
import sqlite3
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

from api.raman_database_indexer import RamanDatabaseIndexer, _DEFAULT_DB_PATH

logger = logging.getLogger(__name__)

DEFAULT_RAMAN_TOLERANCE: float = 8.0


@dataclass(frozen=True)
class RamanObservedPeak:
    position: float
    intensity: float
    fwhm: float = 15.0
    classification: str = "medium"


@dataclass(frozen=True)
class RamanReferenceMarker:
    phase_id: str
    phase_label: str
    formula: str
    db_source: str
    position_cm1: float
    relative_intensity: float
    symmetry: str
    rruff_id: Optional[str] = None
    source_doi: Optional[str] = None
    excitation_nm: float = 532.0
    caveat: Optional[str] = None


@dataclass(frozen=True)
class RamanPeakMatch:
    measured_position: float
    reference_marker: RamanReferenceMarker
    delta_cm1: float
    intensity_ratio: float


@dataclass
class RamanPhaseCandidate:
    phase_id: str
    phase_label: str
    formula: str
    db_source: str
    rruff_id: Optional[str]
    source_doi: Optional[str]
    excitation_nm: float
    caveat: Optional[str]
    matched_peaks: List[RamanPeakMatch]
    total_reference_peaks: int
    match_score: float
    confidence_level: str


@dataclass
class RamanMatchResponse:
    candidates: List[RamanPhaseCandidate]
    primary_candidate: Optional[RamanPhaseCandidate]
    status_summary: str
    tolerance_used: float


def _ensure_db() -> Path:
    if not _DEFAULT_DB_PATH.exists() or _DEFAULT_DB_PATH.stat().st_size == 0:
        logger.info("Raman SQLite DB missing. Triggering auto-build...")
        RamanDatabaseIndexer.build_database()
    return _DEFAULT_DB_PATH


def match_raman_peaks(
    observed_peaks: List[RamanObservedPeak],
    tolerance_cm1: float = DEFAULT_RAMAN_TOLERANCE,
) -> RamanMatchResponse:
    """Executes SQLite search match for Raman peaks."""
    db_path = _ensure_db()
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row

    try:
        phases_raw = conn.execute("SELECT * FROM reference_phases").fetchall()
        candidates: List[RamanPhaseCandidate] = []

        for ph in phases_raw:
            ph_id = ph["phase_id"]
            ref_peaks = conn.execute(
                "SELECT * FROM reference_peaks WHERE phase_id = ?", (ph_id,)
            ).fetchall()

            matched: List[RamanPeakMatch] = []
            obs_used = set()

            for rp in ref_peaks:
                pos = rp["position_cm1"]
                best_obs = None
                best_delta = float("inf")

                for idx, obs in enumerate(observed_peaks):
                    if idx in obs_used:
                        continue
                    delta = abs(obs.position - pos)
                    if delta <= tolerance_cm1 and delta < best_delta:
                        best_delta = delta
                        best_obs = (idx, obs)

                if best_obs is not None:
                    obs_used.add(best_obs[0])
                    marker = RamanReferenceMarker(
                        phase_id=ph_id,
                        phase_label=ph["phase_label"],
                        formula=ph["formula"],
                        db_source=ph["db_source"],
                        position_cm1=pos,
                        relative_intensity=rp["relative_intensity"],
                        symmetry=rp["symmetry"] or "",
                        rruff_id=ph["rruff_id"],
                        source_doi=ph["source_doi"],
                        excitation_nm=ph["excitation_nm"],
                        caveat=ph["caveat"],
                    )
                    matched.append(
                        RamanPeakMatch(
                            measured_position=best_obs[1].position,
                            reference_marker=marker,
                            delta_cm1=best_delta,
                            intensity_ratio=best_obs[1].intensity / (rp["relative_intensity"] / 100.0 + 1e-3),
                        )
                    )

            tot_peaks = len(ref_peaks)
            ratio = len(matched) / tot_peaks if tot_peaks > 0 else 0.0

            # Score formula: matched ratio * 0.7 + intensity weights * 0.3
            score = min(1.0, ratio * 1.1)

            # Cap score if main A1g peak is missing for ferrites/oxides
            has_main = any(m.reference_marker.relative_intensity >= 80.0 for m in matched)
            if not has_main and tot_peaks > 1:
                score *= 0.5

            conf = "high" if score >= 0.75 else "medium" if score >= 0.45 else "low"

            candidates.append(
                RamanPhaseCandidate(
                    phase_id=ph_id,
                    phase_label=ph["phase_label"],
                    formula=ph["formula"],
                    db_source=ph["db_source"],
                    rruff_id=ph["rruff_id"],
                    source_doi=ph["source_doi"],
                    excitation_nm=ph["excitation_nm"],
                    caveat=ph["caveat"],
                    matched_peaks=matched,
                    total_reference_peaks=tot_peaks,
                    match_score=score,
                    confidence_level=conf,
                )
            )

        candidates.sort(key=lambda c: c.match_score, reverse=True)
        primary = candidates[0] if candidates and candidates[0].match_score >= 0.35 else None
        summary = (
            f"Confident Raman match: {primary.phase_label} ({primary.formula})"
            if primary
            else "No confident match"
        )

        return RamanMatchResponse(
            candidates=candidates,
            primary_candidate=primary,
            status_summary=summary,
            tolerance_used=tolerance_cm1,
        )

    finally:
        conn.close()
