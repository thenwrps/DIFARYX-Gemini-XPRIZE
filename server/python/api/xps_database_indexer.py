"""
DIFARYX XPS Database Indexer.

Builds a SQLite database with B-Tree indexed reference core-level bands and satellites
for high-speed XPS chemical state and phase search-match.

Configured with exactly 7 verified oxidation-state phases per strict provenance guardrails.
Spinel ferrites are excluded. O 1s is non-scored context.
"""

from __future__ import annotations

import json
import logging
import sqlite3
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

logger = logging.getLogger(__name__)

# Default database path: server/python/data/xps_reference.db
_DEFAULT_DB_DIR = Path(__file__).resolve().parent.parent / "data"
_DEFAULT_DB_PATH = _DEFAULT_DB_DIR / "xps_reference.db"


# ============================================================================
# SQL Schema
# ============================================================================

_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS reference_phases (
    phase_id            TEXT PRIMARY KEY,
    phase_label         TEXT NOT NULL,
    formula             TEXT NOT NULL,
    db_source           TEXT NOT NULL,
    source_doi          TEXT NOT NULL,
    o1s_context_be      REAL,
    forbidden_satellites_json TEXT,
    caveat              TEXT
);

CREATE TABLE IF NOT EXISTS reference_peaks (
    peak_id             INTEGER PRIMARY KEY AUTOINCREMENT,
    phase_id            TEXT NOT NULL,
    binding_energy_ev   REAL NOT NULL,
    tolerance_ev        REAL NOT NULL,
    peak_type           TEXT NOT NULL,
    orbital             TEXT NOT NULL,
    FOREIGN KEY(phase_id) REFERENCES reference_phases(phase_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_xps_peaks_be ON reference_peaks(binding_energy_ev);
CREATE INDEX IF NOT EXISTS idx_xps_peaks_phase ON reference_peaks(phase_id);
"""


# ============================================================================
# Dataclasses
# ============================================================================

@dataclass
class XpsBandSeed:
    be: float
    tol: float
    peak_type: str  # 'main' | 'satellite'
    orbital: str


@dataclass
class XpsPhaseSeed:
    phase_id: str
    phase_label: str
    formula: str
    db_source: str  # 'literature'
    source_doi: str
    bands: List[XpsBandSeed]
    o1s_context_be: Optional[float] = None
    forbidden_satellites: List[Dict[str, Any]] = field(default_factory=list)
    caveat: Optional[str] = None


# ============================================================================
# Verified Allowlist & Starter Dataset (7 Externally Verified Phases)
# ============================================================================

_VERIFIED_ALLOWLIST: Dict[str, Dict[str, Any]] = {
    "10.1016/j.apsusc.2010.10.051#magnetite": {
        "formula": "Fe3O4",
        "phase": "Magnetite",
        "bands": [
            {"be": 710.6, "tol": 0.5, "peak_type": "main", "orbital": "Fe 2p3/2"}
        ],
        "forbiddenSatellites": [
            {
                "range": [718.0, 720.0],
                "maxRelIntensity": 0.05,
                "reason": "Sharp ~719 eV Fe3+ shake-up indicates Fe2O3, incompatible with Fe3O4"
            }
        ]
    },
    "10.1016/j.apsusc.2010.10.051#maghemite": {
        "formula": "Fe2O3",
        "phase": "Maghemite",
        "bands": [
            {"be": 711.0, "tol": 0.5, "peak_type": "main", "orbital": "Fe 2p3/2"},
            {"be": 718.8, "tol": 0.5, "peak_type": "satellite", "orbital": "Fe 2p3/2 sat"}
        ],
        "forbiddenSatellites": []
    },
    "10.1016/j.apsusc.2010.10.051#hematite": {
        "formula": "Fe2O3",
        "phase": "Hematite",
        "bands": [
            {"be": 711.0, "tol": 0.5, "peak_type": "main", "orbital": "Fe 2p3/2"},
            {"be": 718.8, "tol": 0.5, "peak_type": "satellite", "orbital": "Fe 2p3/2 sat"}
        ],
        "forbiddenSatellites": []
    },
    "10.1016/j.apsusc.2010.07.086#zincite": {
        "formula": "ZnO",
        "phase": "Zincite",
        "bands": [
            {"be": 1021.7, "tol": 0.5, "peak_type": "main", "orbital": "Zn 2p3/2"}
        ],
        "forbiddenSatellites": []
    },
    "10.1016/j.apsusc.2010.07.086#tenorite": {
        "formula": "CuO",
        "phase": "Tenorite",
        "bands": [
            {"be": 933.6, "tol": 0.5, "peak_type": "main", "orbital": "Cu 2p3/2"},
            {"be": 942.2, "tol": 0.5, "peak_type": "satellite", "orbital": "Cu 2p3/2 shake-up"}
        ],
        "forbiddenSatellites": []
    },
    "10.1016/j.apsusc.2010.07.086#anatase": {
        "formula": "TiO2",
        "phase": "Anatase",
        "bands": [
            {"be": 458.6, "tol": 0.5, "peak_type": "main", "orbital": "Ti 2p3/2"},
            {"be": 464.3, "tol": 0.5, "peak_type": "main", "orbital": "Ti 2p1/2"}
        ],
        "forbiddenSatellites": []
    },
    "10.1016/j.apsusc.2010.07.086#rutile": {
        "formula": "TiO2",
        "phase": "Rutile",
        "bands": [
            {"be": 458.6, "tol": 0.5, "peak_type": "main", "orbital": "Ti 2p3/2"},
            {"be": 464.3, "tol": 0.5, "peak_type": "main", "orbital": "Ti 2p1/2"}
        ],
        "forbiddenSatellites": []
    }
}

XPS_STARTER_PHASES: List[XpsPhaseSeed] = [
    XpsPhaseSeed(
        phase_id="magnetite",
        phase_label="Magnetite",
        formula="Fe3O4",
        db_source="literature",
        source_doi="10.1016/j.apsusc.2010.10.051#magnetite",
        o1s_context_be=530.1,
        forbidden_satellites=[
            {
                "range": [718.0, 720.0],
                "maxRelIntensity": 0.05,
                "reason": "Sharp ~719 eV Fe3+ shake-up indicates Fe2O3, incompatible with Fe3O4"
            }
        ],
        caveat="Mixed Fe2+/Fe3+; distinguished from Fe2O3 by ABSENCE of the sharp ~719 eV satellite (broad 715-718 plateau is allowed).",
        bands=[
            XpsBandSeed(710.6, 0.5, "main", "Fe 2p3/2")
        ]
    ),
    XpsPhaseSeed(
        phase_id="maghemite",
        phase_label="Maghemite",
        formula="Fe2O3",
        db_source="literature",
        source_doi="10.1016/j.apsusc.2010.10.051#maghemite",
        o1s_context_be=530.0,
        forbidden_satellites=[],
        caveat=None,
        bands=[
            XpsBandSeed(711.0, 0.5, "main", "Fe 2p3/2"),
            XpsBandSeed(718.8, 0.5, "satellite", "Fe 2p3/2 sat")
        ]
    ),
    XpsPhaseSeed(
        phase_id="hematite",
        phase_label="Hematite",
        formula="Fe2O3",
        db_source="literature",
        source_doi="10.1016/j.apsusc.2010.10.051#hematite",
        o1s_context_be=530.0,
        forbidden_satellites=[],
        caveat=None,
        bands=[
            XpsBandSeed(711.0, 0.5, "main", "Fe 2p3/2"),
            XpsBandSeed(718.8, 0.5, "satellite", "Fe 2p3/2 sat")
        ]
    ),
    XpsPhaseSeed(
        phase_id="zincite",
        phase_label="Zincite",
        formula="ZnO",
        db_source="literature",
        source_doi="10.1016/j.apsusc.2010.07.086#zincite",
        o1s_context_be=530.2,
        forbidden_satellites=[],
        caveat="Zn is exclusively Zn2+; elemental/oxidation confirmation, not phase discrimination.",
        bands=[
            XpsBandSeed(1021.7, 0.5, "main", "Zn 2p3/2")
        ]
    ),
    XpsPhaseSeed(
        phase_id="tenorite",
        phase_label="Tenorite",
        formula="CuO",
        db_source="literature",
        source_doi="10.1016/j.apsusc.2010.07.086#tenorite",
        o1s_context_be=529.7,
        forbidden_satellites=[],
        caveat="Cu2+ confirmed by ~942 eV shake-up; distinguishing Cu+ vs Cu0 requires the Cu LMM Auger line, not Cu 2p alone.",
        bands=[
            XpsBandSeed(933.6, 0.5, "main", "Cu 2p3/2"),
            XpsBandSeed(942.2, 0.5, "satellite", "Cu 2p3/2 shake-up")
        ]
    ),
    XpsPhaseSeed(
        phase_id="anatase",
        phase_label="Anatase",
        formula="TiO2",
        db_source="literature",
        source_doi="10.1016/j.apsusc.2010.07.086#anatase",
        o1s_context_be=529.9,
        forbidden_satellites=[],
        caveat=None,
        bands=[
            XpsBandSeed(458.6, 0.5, "main", "Ti 2p3/2"),
            XpsBandSeed(464.3, 0.5, "main", "Ti 2p1/2")
        ]
    ),
    XpsPhaseSeed(
        phase_id="rutile",
        phase_label="Rutile",
        formula="TiO2",
        db_source="literature",
        source_doi="10.1016/j.apsusc.2010.07.086#rutile",
        o1s_context_be=529.9,
        forbidden_satellites=[],
        caveat=None,
        bands=[
            XpsBandSeed(458.6, 0.5, "main", "Ti 2p3/2"),
            XpsBandSeed(464.3, 0.5, "main", "Ti 2p1/2")
        ]
    )
]


def verify_reference_metadata(phases: List[XpsPhaseSeed]) -> None:
    """
    Metadata verification gate. Enforces that at seed time:
    1. Every source ID is in the human-verified allowlist.
    2. Exactly 7 phases exist in starter dataset and allowlist.
    3. Formula, phase label, bands, and forbiddenSatellites strictly match allowlist entries.
    Fails the build with ValueError if unknown or mismatched entries are passed.
    """
    logger.info("Executing seed-time XPS metadata verification gate (allowlist check)...")
    if len(phases) != len(_VERIFIED_ALLOWLIST):
        raise ValueError(
            f"Metadata Gate Failure: Expected {len(_VERIFIED_ALLOWLIST)} starter phases, got {len(phases)}."
        )

    seen_sources = set()
    for phase in phases:
        source_id = phase.source_doi
        if not source_id or source_id not in _VERIFIED_ALLOWLIST:
            raise ValueError(
                f"Metadata Gate Failure: Source ID '{source_id}' for phase '{phase.phase_label}' "
                f"is not in the verified human allowlist."
            )
        seen_sources.add(source_id)
        expected = _VERIFIED_ALLOWLIST[source_id]
        if phase.formula != expected["formula"] or phase.phase_label != expected["phase"]:
            raise ValueError(
                f"Metadata Gate Failure: Formula/phase mismatch for source '{source_id}'. "
                f"Expected ({expected['formula']}, {expected['phase']}), got ({phase.formula}, {phase.phase_label})."
            )

        # Check bands match
        expected_bands = expected["bands"]
        if len(phase.bands) != len(expected_bands):
            raise ValueError(
                f"Metadata Gate Failure: Band count mismatch for source '{source_id}'."
            )
        for b, exp_b in zip(phase.bands, expected_bands):
            if b.be != exp_b["be"] or b.tol != exp_b["tol"] or b.peak_type != exp_b["peak_type"] or b.orbital != exp_b["orbital"]:
                raise ValueError(
                    f"Metadata Gate Failure: Band data mismatch for source '{source_id}'."
                )

        # Check forbiddenSatellites match
        if phase.forbidden_satellites != expected["forbiddenSatellites"]:
            raise ValueError(
                f"Metadata Gate Failure: forbiddenSatellites mismatch for source '{source_id}'."
            )

    if len(seen_sources) != len(_VERIFIED_ALLOWLIST):
        raise ValueError("Metadata Gate Failure: Duplicate or missing source_id in starter phases.")

    logger.info("✓ All XPS reference phases passed allowlist verification gate.")


# ============================================================================
# Database Builder
# ============================================================================

class XpsDatabaseIndexer:
    """Seeder and SQLite builder for XPS phase identification."""

    @classmethod
    def build_database(
        cls,
        output_path: Optional[Union[str, Path]] = None,
        phases: Optional[List[XpsPhaseSeed]] = None,
    ) -> Dict[str, int]:
        """Builds xps_reference.db SQLite database."""
        db_path = Path(output_path) if output_path else _DEFAULT_DB_PATH
        seed_phases = phases if phases is not None else XPS_STARTER_PHASES

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
                forbidden_json = json.dumps(p.forbidden_satellites) if p.forbidden_satellites else None
                conn.execute(
                    """
                    INSERT INTO reference_phases (
                        phase_id, phase_label, formula, db_source, source_doi,
                        o1s_context_be, forbidden_satellites_json, caveat
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);
                    """,
                    (
                        p.phase_id,
                        p.phase_label,
                        p.formula,
                        p.db_source,
                        p.source_doi,
                        p.o1s_context_be,
                        forbidden_json,
                        p.caveat,
                    ),
                )
                phase_count += 1

                for pk in p.bands:
                    conn.execute(
                        """
                        INSERT INTO reference_peaks (
                            phase_id, binding_energy_ev, tolerance_ev, peak_type, orbital
                        ) VALUES (?, ?, ?, ?, ?);
                        """,
                        (p.phase_id, pk.be, pk.tol, pk.peak_type, pk.orbital),
                    )
                    peak_count += 1

            conn.commit()
            logger.info(
                f"Successfully built XPS reference database at {db_path} "
                f"({phase_count} phases, {peak_count} peaks)."
            )
            return {"phase_count": phase_count, "peak_count": peak_count}

        finally:
            conn.close()


if __name__ == "__main__":
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    logging.basicConfig(level=logging.INFO, stream=sys.stdout)
    stats = XpsDatabaseIndexer.build_database()
    print(f"XPS Database Indexer stats: {stats}")
