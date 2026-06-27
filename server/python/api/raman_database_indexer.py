"""
DIFARYX Raman Database Indexer (RRUFF & Literature Snapshot).

Builds a SQLite database with B-Tree indexed reference peaks for
high-speed Raman phase search-match using wavenumber range queries (BETWEEN).

Database Schema:
    reference_phases  — 1 row per phase (formula, provenance, excitation, caveats)
    reference_peaks   — 1 row per peak (position_cm1, relative_intensity, symmetry)
    B-Tree index on reference_peaks.position_cm1 for O(log N) range scans.

Author: DIFARYX Core Team
"""

from __future__ import annotations

import logging
import sys
import sqlite3
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# Default database path: server/python/data/raman_reference.db
_DEFAULT_DB_DIR = Path(__file__).resolve().parent.parent / "data"
_DEFAULT_DB_PATH = _DEFAULT_DB_DIR / "raman_reference.db"


# ============================================================================
# SQL Schema
# ============================================================================

_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS reference_phases (
    phase_id            TEXT PRIMARY KEY,
    phase_label         TEXT NOT NULL,
    formula             TEXT NOT NULL,
    db_source           TEXT NOT NULL,
    rruff_id            TEXT,
    source_doi          TEXT,
    excitation_nm       REAL NOT NULL,
    caveat              TEXT
);

CREATE TABLE IF NOT EXISTS reference_peaks (
    peak_id             INTEGER PRIMARY KEY AUTOINCREMENT,
    phase_id            TEXT NOT NULL,
    position_cm1        REAL NOT NULL,
    relative_intensity  REAL NOT NULL,
    symmetry            TEXT,
    FOREIGN KEY(phase_id) REFERENCES reference_phases(phase_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_peaks_position ON reference_peaks(position_cm1);
CREATE INDEX IF NOT EXISTS idx_peaks_phase ON reference_peaks(phase_id);
"""


# ============================================================================
# Dataclasses
# ============================================================================

@dataclass
class RamanPeakSeed:
    position: float
    intensity: float
    symmetry: str = ""


@dataclass
class RamanPhaseSeed:
    phase_id: str
    phase_label: str
    formula: str
    db_source: str  # 'RRUFF' | 'literature' | 'synthetic'
    excitation_nm: float
    peaks: List[RamanPeakSeed]
    rruff_id: Optional[str] = None
    source_doi: Optional[str] = None
    caveat: Optional[str] = None


# ============================================================================
# Verified Starter Dataset (Single Source of Truth)
# ============================================================================

_GRAVES_CAVEAT = (
    "Spinel ferrite phases (Cu/Co/Ni-Fe₂O₄) have strongly overlapping A1g/T2g modes; "
    "per Graves et al. (1988), simple Raman fingerprinting cannot definitively discriminate "
    "ferrite composition. Treat ferrite matches as supporting evidence requiring XRD/EDX confirmation."
)

RAMAN_STARTER_PHASES: List[RamanPhaseSeed] = [
    # --- RRUFF Minerals ---
    RamanPhaseSeed(
        phase_id="magnetite",
        phase_label="cubic spinel",
        formula="Fe₃O₄",
        db_source="RRUFF",
        rruff_id="R080025",
        excitation_nm=532.0,
        caveat="Magnetite may photothermally oxidize to hematite under excessive laser irradiance.",
        peaks=[
            RamanPeakSeed(668.0, 100.0, "A1g"),
            RamanPeakSeed(538.0, 35.0, "T2g"),
            RamanPeakSeed(306.0, 25.0, "Eg"),
        ],
    ),
    RamanPhaseSeed(
        phase_id="hematite",
        phase_label="hematite",
        formula="α-Fe₂O₃",
        db_source="RRUFF",
        rruff_id="R040024",
        excitation_nm=532.0,
        peaks=[
            RamanPeakSeed(226.0, 80.0, "A1g"),
            RamanPeakSeed(245.0, 30.0, "Eg"),
            RamanPeakSeed(292.0, 100.0, "Eg"),
            RamanPeakSeed(411.0, 45.0, "Eg"),
            RamanPeakSeed(613.0, 35.0, "Eg"),
            RamanPeakSeed(1320.0, 40.0, "2-magnon"),
        ],
    ),
    RamanPhaseSeed(
        phase_id="maghemite",
        phase_label="maghemite",
        formula="γ-Fe₂O₃",
        db_source="RRUFF",
        rruff_id="R140712",
        excitation_nm=532.0,
        peaks=[
            RamanPeakSeed(350.0, 40.0, "defect-broad"),
            RamanPeakSeed(500.0, 60.0, "defect-broad"),
            RamanPeakSeed(700.0, 100.0, "defect-broad"),
        ],
    ),
    RamanPhaseSeed(
        phase_id="anatase",
        phase_label="anatase",
        formula="TiO₂",
        db_source="RRUFF",
        rruff_id="R060277",
        excitation_nm=532.0,
        peaks=[
            RamanPeakSeed(144.0, 100.0, "Eg"),
            RamanPeakSeed(197.0, 30.0, "Eg"),
            RamanPeakSeed(399.0, 45.0, "B1g"),
            RamanPeakSeed(515.0, 55.0, "A1g/B1g"),
            RamanPeakSeed(639.0, 40.0, "Eg"),
        ],
    ),
    RamanPhaseSeed(
        phase_id="rutile",
        phase_label="rutile",
        formula="TiO₂",
        db_source="RRUFF",
        rruff_id="R060745",
        excitation_nm=532.0,
        peaks=[
            RamanPeakSeed(447.0, 100.0, "Eg"),
            RamanPeakSeed(612.0, 70.0, "A1g"),
            RamanPeakSeed(235.0, 30.0, "multi-phonon"),
        ],
    ),
    RamanPhaseSeed(
        phase_id="zincite",
        phase_label="zincite",
        formula="ZnO",
        db_source="RRUFF",
        rruff_id="R060027",
        excitation_nm=532.0,
        peaks=[
            RamanPeakSeed(437.0, 100.0, "E2(high)"),
            RamanPeakSeed(380.0, 50.0, "A1(TO)"),
            RamanPeakSeed(332.0, 20.0, "multi-phonon"),
        ],
    ),
    RamanPhaseSeed(
        phase_id="tenorite",
        phase_label="tenorite",
        formula="CuO",
        db_source="RRUFF",
        rruff_id="R120076",
        excitation_nm=532.0,
        peaks=[
            RamanPeakSeed(298.0, 100.0, "Ag"),
            RamanPeakSeed(345.0, 60.0, "B1g"),
            RamanPeakSeed(630.0, 40.0, "B2g"),
        ],
    ),
    # --- Peer-Reviewed Literature ---
    RamanPhaseSeed(
        phase_id="cufe2o4",
        phase_label="cubic inverse spinel",
        formula="CuFe₂O₄",
        db_source="literature",
        source_doi="10.1021/acsomega.9b01477",
        excitation_nm=632.0,
        caveat=_GRAVES_CAVEAT,
        peaks=[
            RamanPeakSeed(656.0, 100.0, "A1g"),
            RamanPeakSeed(586.0, 60.0, "F2g(3)"),
            RamanPeakSeed(481.0, 50.0, "F2g(2)"),
            RamanPeakSeed(278.0, 40.0, "Eg"),
            RamanPeakSeed(215.0, 20.0, "F2g(1)"),
        ],
    ),
    RamanPhaseSeed(
        phase_id="cofe2o4",
        phase_label="cubic spinel",
        formula="CoFe₂O₄",
        db_source="literature",
        source_doi="10.1021/acsphyschemau.4c00088",
        excitation_nm=532.0,
        caveat=_GRAVES_CAVEAT + " Note: source modes computational+experimental.",
        peaks=[
            RamanPeakSeed(685.0, 100.0, "A1g"),
            RamanPeakSeed(470.0, 55.0, "T2g"),
            RamanPeakSeed(565.0, 45.0, "T2g"),
            RamanPeakSeed(310.0, 35.0, "Eg"),
        ],
    ),
    RamanPhaseSeed(
        phase_id="nife2o4",
        phase_label="cubic inverse spinel",
        formula="NiFe₂O₄",
        db_source="literature",
        source_doi="10.1016/0025-5408(88)90255-3",
        excitation_nm=532.0,
        caveat=_GRAVES_CAVEAT,
        peaks=[
            RamanPeakSeed(702.0, 100.0, "A1g"),
            RamanPeakSeed(485.0, 50.0, "T2g"),
            RamanPeakSeed(560.0, 45.0, "T2g"),
            RamanPeakSeed(325.0, 30.0, "Eg"),
        ],
    ),
]


# ============================================================================
# Metadata Verification Gate
# ============================================================================

_VERIFIED_ALLOWLIST: Dict[str, Dict[str, str]] = {
    "RRUFF R080025": {"formula": "Fe₃O₄", "phase": "cubic spinel"},
    "RRUFF R040024": {"formula": "α-Fe₂O₃", "phase": "hematite"},
    "RRUFF R140712": {"formula": "γ-Fe₂O₃", "phase": "maghemite"},
    "RRUFF R060277": {"formula": "TiO₂", "phase": "anatase"},
    "RRUFF R060745": {"formula": "TiO₂", "phase": "rutile"},
    "RRUFF R060027": {"formula": "ZnO", "phase": "zincite"},
    "RRUFF R120076": {"formula": "CuO", "phase": "tenorite"},
    "DOI 10.1021/acsomega.9b01477": {"formula": "CuFe₂O₄", "phase": "cubic inverse spinel"},
    "DOI 10.1021/acsphyschemau.4c00088": {"formula": "CoFe₂O₄", "phase": "cubic spinel"},
    "DOI 10.1016/0025-5408(88)90255-3": {"formula": "NiFe₂O₄", "phase": "cubic inverse spinel"},
}


def verify_reference_metadata(phases: List[RamanPhaseSeed]) -> None:
    """
    Metadata verification gate (§3.1). Enforces that at seed time:
    1. Every source ID (RRUFF ID or DOI) is in the human-verified allowlist.
    2. The formula and phase label strictly match the verified allowlist entries.
    Fails the build with ValueError if unknown or mismatched entries are passed.
    """
    logger.info("Executing seed-time Raman metadata verification gate (allowlist check)...")
    for phase in phases:
        source_id = f"RRUFF {phase.rruff_id}" if phase.db_source == "RRUFF" else f"DOI {phase.source_doi}"
        if not source_id or source_id not in _VERIFIED_ALLOWLIST:
            raise ValueError(
                f"Metadata Gate Failure: Source ID '{source_id}' for phase '{phase.phase_label}' "
                f"is not in the verified human allowlist."
            )
        expected = _VERIFIED_ALLOWLIST[source_id]
        if phase.formula != expected["formula"] or phase.phase_label != expected["phase"]:
            raise ValueError(
                f"Metadata Gate Failure: Formula/phase mismatch for source '{source_id}'. "
                f"Expected ({expected['formula']}, {expected['phase']}), got ({phase.formula}, {phase.phase_label})."
            )
    logger.info("✓ All Raman reference phases passed allowlist verification gate.")


# ============================================================================
# Database Builder
# ============================================================================

class RamanDatabaseIndexer:
    """Seeder and SQLite builder for Raman phase identification."""

    @classmethod
    def build_database(
        cls,
        output_path: Optional[Union[str, Path]] = None,
        phases: Optional[List[RamanPhaseSeed]] = None,
    ) -> Dict[str, int]:
        """Builds raman_reference.db SQLite database."""
        db_path = Path(output_path) if output_path else _DEFAULT_DB_PATH
        seed_phases = phases if phases is not None else RAMAN_STARTER_PHASES

        verify_reference_metadata(seed_phases)

        db_path.parent.mkdir(parents=True, exist_ok=True)
        if db_path.exists():
            db_path.unlink()

        conn = sqlite3.connect(str(db_path))
        conn.execute("PRAGMA foreign_keys = ON;")

        try:
            conn.executescript(_SCHEMA_SQL)
            phase_count = 0
            peak_count = 0

            for p in seed_phases:
                conn.execute(
                    """
                    INSERT INTO reference_phases (
                        phase_id, phase_label, formula, db_source, rruff_id,
                        source_doi, excitation_nm, caveat
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);
                    """,
                    (
                        p.phase_id,
                        p.phase_label,
                        p.formula,
                        p.db_source,
                        p.rruff_id,
                        p.source_doi,
                        p.excitation_nm,
                        p.caveat,
                    ),
                )
                phase_count += 1

                for pk in p.peaks:
                    conn.execute(
                        """
                        INSERT INTO reference_peaks (
                            phase_id, position_cm1, relative_intensity, symmetry
                        ) VALUES (?, ?, ?, ?);
                        """,
                        (p.phase_id, pk.position, pk.intensity, pk.symmetry),
                    )
                    peak_count += 1

            conn.commit()
            logger.info(
                f"Successfully built Raman reference database at {db_path} "
                f"({phase_count} phases, {peak_count} peaks)."
            )
            return {"phase_count": phase_count, "peak_count": peak_count}

        finally:
            conn.close()


if __name__ == "__main__":
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    logging.basicConfig(level=logging.INFO, stream=sys.stdout)
    stats = RamanDatabaseIndexer.build_database()
    print(f"Raman Database Indexer stats: {stats}")
