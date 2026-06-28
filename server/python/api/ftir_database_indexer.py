"""
DIFARYX FTIR Database Indexer.

Builds a SQLite database with B-Tree indexed reference bands for
high-speed FTIR phase search-match using wavenumber range queries.

Currently configured with an empty verified allowlist and starter dataset
per strict provenance and non-fabrication guardrails.

Database Schema:
    reference_phases  — 1 row per phase (formula, provenance, excitation, caveats)
    reference_peaks   — 1 row per band (position_cm1, relative_intensity, symmetry)
    B-Tree index on reference_peaks.position_cm1 for O(log N) range scans.
"""

from __future__ import annotations

import logging
import sys
import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Union

logger = logging.getLogger(__name__)

# Default database path: server/python/data/ftir_reference.db
_DEFAULT_DB_DIR = Path(__file__).resolve().parent.parent / "data"
_DEFAULT_DB_PATH = _DEFAULT_DB_DIR / "ftir_reference.db"


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

CREATE INDEX IF NOT EXISTS idx_ftir_peaks_position ON reference_peaks(position_cm1);
CREATE INDEX IF NOT EXISTS idx_ftir_peaks_phase ON reference_peaks(phase_id);
"""


# ============================================================================
# Dataclasses
# ============================================================================

@dataclass
class FtirBandSeed:
    position: float
    intensity: float
    symmetry: str = ""


@dataclass
class FtirPhaseSeed:
    phase_id: str
    phase_label: str
    formula: str
    db_source: str  # 'RRUFF' | 'literature' | 'synthetic'
    excitation_nm: float
    peaks: List[FtirBandSeed]
    rruff_id: Optional[str] = None
    source_doi: Optional[str] = None
    caveat: Optional[str] = None


# ============================================================================
# Verified Allowlist & Starter Dataset (7 Externally Verified Phases)
# ============================================================================

_VERIFIED_ALLOWLIST: Dict[str, Dict[str, str]] = {
    "10.1038/physci230158a0": {"formula": "Fe3O4", "phase": "Magnetite"},
    "10.1021/am1004943#maghemite": {"formula": "gamma-Fe2O3", "phase": "Maghemite"},
    "10.1021/am1004943#hematite": {"formula": "alpha-Fe2O3", "phase": "Hematite"},
    "10.1103/PhysRevB.84.125202": {"formula": "ZnO", "phase": "Zincite"},
    "10.1103/PhysRevB.42.10060": {"formula": "CuO", "phase": "Tenorite"},
    "10.1103/PhysRevB.55.7014": {"formula": "TiO2", "phase": "Anatase"},
    "10.1103/PhysRev.126.1710": {"formula": "TiO2", "phase": "Rutile"},
}

FTIR_STARTER_PHASES: List[FtirPhaseSeed] = [
    FtirPhaseSeed(
        phase_id="magnetite",
        phase_label="Magnetite",
        formula="Fe3O4",
        db_source="literature",
        source_doi="10.1038/physci230158a0",
        excitation_nm=0.0,
        caveat="Spinel Fe-O; ferrites largely indistinguishable by FTIR.",
        peaks=[
            FtirBandSeed(570.0, 100.0),
            FtirBandSeed(390.0, 80.0),
        ],
    ),
    FtirPhaseSeed(
        phase_id="maghemite",
        phase_label="Maghemite",
        formula="gamma-Fe2O3",
        db_source="literature",
        source_doi="10.1021/am1004943#maghemite",
        excitation_nm=0.0,
        caveat="Vacancy-ordered defect spinel.",
        peaks=[
            FtirBandSeed(630.0, 100.0),
            FtirBandSeed(560.0, 80.0),
            FtirBandSeed(440.0, 60.0),
        ],
    ),
    FtirPhaseSeed(
        phase_id="hematite",
        phase_label="Hematite",
        formula="alpha-Fe2O3",
        db_source="literature",
        source_doi="10.1021/am1004943#hematite",
        excitation_nm=0.0,
        caveat="Corundum-type Fe-O (distinct from spinel iron oxides).",
        peaks=[
            FtirBandSeed(540.0, 100.0),
            FtirBandSeed(470.0, 80.0),
        ],
    ),
    FtirPhaseSeed(
        phase_id="zincite",
        phase_label="Zincite",
        formula="ZnO",
        db_source="literature",
        source_doi="10.1103/PhysRevB.84.125202",
        excitation_nm=0.0,
        caveat="E1(TO)/A1(TO) wurtzite phonons; observed powder band broad ~430-450.",
        peaks=[
            FtirBandSeed(410.0, 100.0),
            FtirBandSeed(380.0, 80.0),
        ],
    ),
    FtirPhaseSeed(
        phase_id="tenorite",
        phase_label="Tenorite",
        formula="CuO",
        db_source="literature",
        source_doi="10.1103/PhysRevB.42.10060",
        excitation_nm=0.0,
        caveat="Monoclinic Au/Bu modes.",
        peaks=[
            FtirBandSeed(590.0, 100.0),
            FtirBandSeed(530.0, 80.0),
            FtirBandSeed(480.0, 60.0),
        ],
    ),
    FtirPhaseSeed(
        phase_id="anatase",
        phase_label="Anatase",
        formula="TiO2",
        db_source="literature",
        source_doi="10.1103/PhysRevB.55.7014",
        excitation_nm=0.0,
        caveat="TiO2 polymorph; FTIR weakly discriminates anatase vs rutile — confirm by Raman/XRD.",
        peaks=[
            FtirBandSeed(435.0, 100.0),
            FtirBandSeed(367.0, 80.0),
        ],
    ),
    FtirPhaseSeed(
        phase_id="rutile",
        phase_label="Rutile",
        formula="TiO2",
        db_source="literature",
        source_doi="10.1103/PhysRev.126.1710",
        excitation_nm=0.0,
        caveat="TiO2 polymorph; FTIR weakly discriminates anatase vs rutile — confirm by Raman/XRD.",
        peaks=[
            FtirBandSeed(500.0, 100.0),
            FtirBandSeed(388.0, 80.0),
        ],
    ),
]


def verify_reference_metadata(phases: List[FtirPhaseSeed]) -> None:
    """
    Metadata verification gate. Enforces that at seed time:
    1. Every source ID (RRUFF ID or DOI) is in the human-verified allowlist.
    2. The formula and phase label strictly match the verified allowlist entries.
    Fails the build with ValueError if unknown or mismatched entries are passed.
    """
    logger.info("Executing seed-time FTIR metadata verification gate (allowlist check)...")
    for phase in phases:
        source_id = f"RRUFF {phase.rruff_id}" if phase.db_source == "RRUFF" else (phase.source_doi or "")
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
    logger.info("✓ All FTIR reference phases passed allowlist verification gate.")


# ============================================================================
# Database Builder
# ============================================================================

class FtirDatabaseIndexer:
    """Seeder and SQLite builder for FTIR phase identification."""

    @classmethod
    def build_database(
        cls,
        output_path: Optional[Union[str, Path]] = None,
        phases: Optional[List[FtirPhaseSeed]] = None,
    ) -> Dict[str, int]:
        """Builds ftir_reference.db SQLite database."""
        db_path = Path(output_path) if output_path else _DEFAULT_DB_PATH
        seed_phases = phases if phases is not None else FTIR_STARTER_PHASES

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
                f"Successfully built FTIR reference database at {db_path} "
                f"({phase_count} phases, {peak_count} peaks)."
            )
            return {"phase_count": phase_count, "peak_count": peak_count}

        finally:
            conn.close()


if __name__ == "__main__":
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    logging.basicConfig(level=logging.INFO, stream=sys.stdout)
    stats = FtirDatabaseIndexer.build_database()
    print(f"FTIR Database Indexer stats: {stats}")
