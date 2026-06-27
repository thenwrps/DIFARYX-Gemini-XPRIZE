"""
DIFARYX XRD Database Indexer (COD Local Snapshot).

Builds a SQLite database with B-Tree indexed reference peaks for
high-speed XRD phase search-match using range queries (BETWEEN).

This module creates the local reference database from curated crystallographic
data. It does NOT require network access or external packages beyond the
Python standard library (sqlite3).

Database Schema:
    reference_phases  — 1 row per phase (lattice, space group, formula, etc.)
    reference_peaks   — 1 row per peak (twotheta, d_spacing, intensity, hkl)
    B-Tree index on reference_peaks.twotheta for O(log N) range scans.

Author: DIFARYX Core Team
"""

from __future__ import annotations

import json
import logging
import os
import sys
import sqlite3
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# Default database path: server/python/data/xrd_reference.db
_DEFAULT_DB_DIR = Path(__file__).resolve().parent.parent / "data"
_DEFAULT_DB_PATH = _DEFAULT_DB_DIR / "xrd_reference.db"


# ============================================================================
# SQL Schema
# ============================================================================

_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS reference_phases (
    phase_id            TEXT PRIMARY KEY,
    phase_label         TEXT NOT NULL,
    formula             TEXT,
    structure_family    TEXT,
    elements            TEXT,
    space_group         TEXT,
    crystal_system      TEXT,
    database_ref        TEXT,
    lattice_a           REAL,
    lattice_b           REAL,
    lattice_c           REAL,
    lattice_alpha       REAL,
    lattice_beta        REAL,
    lattice_gamma       REAL
);

CREATE TABLE IF NOT EXISTS reference_peaks (
    peak_id             INTEGER PRIMARY KEY AUTOINCREMENT,
    phase_id            TEXT NOT NULL,
    twotheta            REAL NOT NULL,
    d_spacing           REAL,
    relative_intensity  REAL,
    hkl                 TEXT,
    multiplicity        INTEGER DEFAULT 1,
    FOREIGN KEY (phase_id) REFERENCES reference_phases(phase_id)
);

CREATE INDEX IF NOT EXISTS idx_reference_peaks_twotheta
    ON reference_peaks (twotheta);

CREATE INDEX IF NOT EXISTS idx_reference_peaks_phase_id
    ON reference_peaks (phase_id);
"""


# ============================================================================
# Mock Reference Data — Seed Phases
# ============================================================================

# DEPRECATED: Kept as fallback only for legacy unit tests.
_SEED_PHASES: List[dict] = [
    # ── TiO₂ Anatase (ICSD-9852, tetragonal I41/amd) ─────────────────────
    {
        "phase_id": "tio2_anatase_icsd_9852",
        "phase_label": "TiO2 Anatase (ICSD 9852)",
        "formula": "TiO2",
        "structure_family": "anatase",
        "elements": ["Ti", "O"],
        "space_group": "I41/amd",
        "crystal_system": "tetragonal",
        "database_ref": "ICSD-9852",
        "lattice_a": 3.7842,
        "lattice_b": 3.7842,
        "lattice_c": 9.5146,
        "lattice_alpha": 90.0,
        "lattice_beta": 90.0,
        "lattice_gamma": 90.0,
        "peaks": [
            {"twotheta": 25.28, "d_spacing": 3.5200, "relative_intensity": 100.0, "hkl": "(101)", "multiplicity": 8},
            {"twotheta": 37.80, "d_spacing": 2.3780, "relative_intensity": 10.0, "hkl": "(103)", "multiplicity": 8},
            {"twotheta": 38.57, "d_spacing": 2.3320, "relative_intensity": 10.0, "hkl": "(004)", "multiplicity": 4},
            {"twotheta": 48.05, "d_spacing": 1.8920, "relative_intensity": 35.0, "hkl": "(200)", "multiplicity": 4},
            {"twotheta": 53.89, "d_spacing": 1.6999, "relative_intensity": 20.0, "hkl": "(105)", "multiplicity": 8},
            {"twotheta": 55.06, "d_spacing": 1.6665, "relative_intensity": 20.0, "hkl": "(211)", "multiplicity": 8},
            {"twotheta": 62.69, "d_spacing": 1.4808, "relative_intensity": 14.0, "hkl": "(204)", "multiplicity": 8},
            {"twotheta": 68.76, "d_spacing": 1.3628, "relative_intensity": 10.0, "hkl": "(116)", "multiplicity": 8},
            {"twotheta": 70.31, "d_spacing": 1.3380, "relative_intensity": 7.0, "hkl": "(220)", "multiplicity": 4},
            {"twotheta": 75.03, "d_spacing": 1.2650, "relative_intensity": 5.0, "hkl": "(215)", "multiplicity": 8},
        ],
    },
    # ── Silver Nanoparticle (ICSD-44387, cubic Fm-3m) ─────────────────────
    {
        "phase_id": "ag_cubic_icsd_44387",
        "phase_label": "Ag Nanoparticle (ICSD 44387)",
        "formula": "Ag",
        "structure_family": "fcc_metal",
        "elements": ["Ag"],
        "space_group": "Fm-3m",
        "crystal_system": "cubic",
        "database_ref": "ICSD-44387",
        "lattice_a": 4.0862,
        "lattice_b": 4.0862,
        "lattice_c": 4.0862,
        "lattice_alpha": 90.0,
        "lattice_beta": 90.0,
        "lattice_gamma": 90.0,
        "peaks": [
            {"twotheta": 38.12, "d_spacing": 2.3590, "relative_intensity": 100.0, "hkl": "(111)", "multiplicity": 8},
            {"twotheta": 44.28, "d_spacing": 2.0440, "relative_intensity": 40.0, "hkl": "(200)", "multiplicity": 6},
            {"twotheta": 64.43, "d_spacing": 1.4450, "relative_intensity": 25.0, "hkl": "(220)", "multiplicity": 12},
            {"twotheta": 77.40, "d_spacing": 1.2310, "relative_intensity": 26.0, "hkl": "(311)", "multiplicity": 24},
            {"twotheta": 81.54, "d_spacing": 1.1796, "relative_intensity": 12.0, "hkl": "(222)", "multiplicity": 8},
        ],
    },
    # ── CoFe₂O₄ Spinel (ICSD-15342, cubic Fd-3m) ─────────────────────────
    {
        "phase_id": "cofe2o4_spinel_icsd_15342",
        "phase_label": "CoFe2O4 Spinel (ICSD 15342)",
        "formula": "CoFe2O4",
        "structure_family": "spinel",
        "elements": ["Co", "Fe", "O"],
        "space_group": "Fd-3m",
        "crystal_system": "cubic",
        "database_ref": "ICSD-15342 / JCPDS 22-1086",
        "lattice_a": 8.3919,
        "lattice_b": 8.3919,
        "lattice_c": 8.3919,
        "lattice_alpha": 90.0,
        "lattice_beta": 90.0,
        "lattice_gamma": 90.0,
        "peaks": [
            {"twotheta": 18.37, "d_spacing": 4.8430, "relative_intensity": 12.0, "hkl": "(111)", "multiplicity": 8},
            {"twotheta": 30.12, "d_spacing": 2.9660, "relative_intensity": 30.0, "hkl": "(220)", "multiplicity": 12},
            {"twotheta": 35.48, "d_spacing": 2.5320, "relative_intensity": 100.0, "hkl": "(311)", "multiplicity": 24},
            {"twotheta": 37.10, "d_spacing": 2.4220, "relative_intensity": 8.0, "hkl": "(222)", "multiplicity": 8},
            {"twotheta": 43.12, "d_spacing": 2.0970, "relative_intensity": 20.0, "hkl": "(400)", "multiplicity": 6},
            {"twotheta": 53.52, "d_spacing": 1.7130, "relative_intensity": 10.0, "hkl": "(422)", "multiplicity": 24},
            {"twotheta": 57.02, "d_spacing": 1.6140, "relative_intensity": 30.0, "hkl": "(511)", "multiplicity": 24},
            {"twotheta": 62.62, "d_spacing": 1.4830, "relative_intensity": 40.0, "hkl": "(440)", "multiplicity": 24},
        ],
    },
    # ── CuFe₂O₄ Spinel (ICSD-65363, tetragonal/cubic) ─────────────────────
    {
        "phase_id": "cufe2o4_spinel_icsd_65363",
        "phase_label": "CuFe2O4 Spinel (ICSD 65363)",
        "formula": "CuFe2O4",
        "structure_family": "spinel",
        "elements": ["Cu", "Fe", "O"],
        "space_group": "Fd-3m",
        "crystal_system": "cubic",
        "database_ref": "ICSD-65363 / JCPDS 34-0428",
        "lattice_a": 8.4400,
        "lattice_b": 8.4400,
        "lattice_c": 8.4400,
        "lattice_alpha": 90.0,
        "lattice_beta": 90.0,
        "lattice_gamma": 90.0,
        "peaks": [
            {"twotheta": 18.33, "d_spacing": 4.8500, "relative_intensity": 15.0, "hkl": "(111)", "multiplicity": 8},
            {"twotheta": 30.08, "d_spacing": 2.9700, "relative_intensity": 30.0, "hkl": "(220)", "multiplicity": 12},
            {"twotheta": 35.45, "d_spacing": 2.5350, "relative_intensity": 100.0, "hkl": "(311)", "multiplicity": 24},
            {"twotheta": 37.06, "d_spacing": 2.4250, "relative_intensity": 10.0, "hkl": "(222)", "multiplicity": 8},
            {"twotheta": 43.18, "d_spacing": 2.1000, "relative_intensity": 25.0, "hkl": "(400)", "multiplicity": 6},
            {"twotheta": 53.48, "d_spacing": 1.7150, "relative_intensity": 12.0, "hkl": "(422)", "multiplicity": 24},
            {"twotheta": 56.98, "d_spacing": 1.6160, "relative_intensity": 35.0, "hkl": "(511)", "multiplicity": 24},
            {"twotheta": 62.68, "d_spacing": 1.4850, "relative_intensity": 45.0, "hkl": "(440)", "multiplicity": 24},
        ],
    },
    # ── Fe₃O₄ Magnetite (ICSD-65362, cubic Fd-3m) ─────────────────────────
    {
        "phase_id": "fe3o4_magnetite_icsd_65362",
        "phase_label": "Fe3O4 Magnetite (ICSD 65362)",
        "formula": "Fe3O4",
        "structure_family": "spinel",
        "elements": ["Fe", "O"],
        "space_group": "Fd-3m",
        "crystal_system": "cubic",
        "database_ref": "ICSD-65362 / JCPDS 19-0629",
        "lattice_a": 8.3960,
        "lattice_b": 8.3960,
        "lattice_c": 8.3960,
        "lattice_alpha": 90.0,
        "lattice_beta": 90.0,
        "lattice_gamma": 90.0,
        "peaks": [
            {"twotheta": 18.30, "d_spacing": 4.8450, "relative_intensity": 10.0, "hkl": "(111)", "multiplicity": 8},
            {"twotheta": 30.10, "d_spacing": 2.9670, "relative_intensity": 30.0, "hkl": "(220)", "multiplicity": 12},
            {"twotheta": 35.42, "d_spacing": 2.5320, "relative_intensity": 100.0, "hkl": "(311)", "multiplicity": 24},
            {"twotheta": 37.08, "d_spacing": 2.4240, "relative_intensity": 8.0, "hkl": "(222)", "multiplicity": 8},
            {"twotheta": 43.08, "d_spacing": 2.0990, "relative_intensity": 20.0, "hkl": "(400)", "multiplicity": 6},
            {"twotheta": 53.44, "d_spacing": 1.7150, "relative_intensity": 10.0, "hkl": "(422)", "multiplicity": 24},
            {"twotheta": 56.96, "d_spacing": 1.6160, "relative_intensity": 30.0, "hkl": "(511)", "multiplicity": 24},
            {"twotheta": 62.56, "d_spacing": 1.4840, "relative_intensity": 40.0, "hkl": "(440)", "multiplicity": 24},
        ],
    },
    # ── γ-Fe₂O₃ Maghemite (JCPDS 39-1346) ─────────────────────────────────
    {
        "phase_id": "gamma_fe2o3_maghemite_jcpds_39_1346",
        "phase_label": "gamma-Fe2O3 Maghemite (JCPDS 39-1346)",
        "formula": "Fe2O3",
        "structure_family": "spinel",
        "elements": ["Fe", "O"],
        "space_group": "P4132",
        "crystal_system": "cubic",
        "database_ref": "JCPDS 39-1346",
        "lattice_a": 8.3510,
        "lattice_b": 8.3510,
        "lattice_c": 8.3510,
        "lattice_alpha": 90.0,
        "lattice_beta": 90.0,
        "lattice_gamma": 90.0,
        "peaks": [
            {"twotheta": 18.38, "d_spacing": 4.8230, "relative_intensity": 10.0, "hkl": "(110)", "multiplicity": 8},
            {"twotheta": 30.24, "d_spacing": 2.9530, "relative_intensity": 25.0, "hkl": "(220)", "multiplicity": 12},
            {"twotheta": 35.62, "d_spacing": 2.5190, "relative_intensity": 100.0, "hkl": "(311)", "multiplicity": 24},
            {"twotheta": 37.24, "d_spacing": 2.4140, "relative_intensity": 8.0, "hkl": "(222)", "multiplicity": 8},
            {"twotheta": 43.28, "d_spacing": 2.0900, "relative_intensity": 20.0, "hkl": "(400)", "multiplicity": 6},
            {"twotheta": 53.70, "d_spacing": 1.7060, "relative_intensity": 10.0, "hkl": "(422)", "multiplicity": 24},
            {"twotheta": 57.20, "d_spacing": 1.6100, "relative_intensity": 30.0, "hkl": "(511)", "multiplicity": 24},
            {"twotheta": 62.82, "d_spacing": 1.4790, "relative_intensity": 35.0, "hkl": "(440)", "multiplicity": 24},
        ],
    },
    # ── SBA-15 Amorphous Silica ─────────────────────────────────────────────
    {
        "phase_id": "sba15_amorphous_silica",
        "phase_label": "SBA-15 Amorphous Silica",
        "formula": "SiO2",
        "structure_family": "amorphous",
        "elements": ["Si", "O"],
        "space_group": "N/A (amorphous)",
        "crystal_system": "amorphous",
        "database_ref": "Local reference (broad hump)",
        "lattice_a": None,
        "lattice_b": None,
        "lattice_c": None,
        "lattice_alpha": None,
        "lattice_beta": None,
        "lattice_gamma": None,
        "peaks": [
            {"twotheta": 9.30, "d_spacing": 9.5000, "relative_intensity": 40.0, "hkl": "(100 mesopore)", "multiplicity": 1},
            {"twotheta": 20.00, "d_spacing": 4.4400, "relative_intensity": 100.0, "hkl": "(SiO2 amorphous hump)", "multiplicity": 1},
            {"twotheta": 22.00, "d_spacing": 4.0400, "relative_intensity": 70.0, "hkl": "(SiO2 amorphous shoulder)", "multiplicity": 1},
        ],
    },
]


# ============================================================================
# CODDatabaseIndexer
# ============================================================================


def seed_from_cifs(cifs_dir: Optional[Path] = None) -> List[dict]:
    """Seed reference database from 14 COD CIF files plus 1 synthetic profile."""
    import math
    import re
    import pymatgen.analysis.diffraction.xrd as xrd
    import pymatgen.io.cif as cif

    if cifs_dir is None:
        cifs_dir = Path(__file__).resolve().parent.parent / "data" / "cifs"

    configs = [
        ("1011032", "Fe3 O4", "fe3o4", "Magnetite Fe3O4", "spinel ferrite", "cubic", "ICDD-PDF 01-088-0315"),
        ("5910028", "Cu Fe2 O4", "cufe2o4", "Copper Ferrite (Cubic)", "spinel ferrite", "cubic", "JCPDS 25-0283"),
        ("9011012", "Cu Fe2 O4", "cufe2o4_tetragonal", "Copper Ferrite (Tetragonal)", "spinel ferrite", "tetragonal", "JCPDS 34-0425"),
        ("5910063", "Co Fe2 O4", "cofe2o4", "Cobalt Ferrite", "spinel ferrite", "cubic", "JCPDS 22-1086"),
        ("5910064", "Fe2 Ni O4", "nife2o4", "Nickel Ferrite", "spinel ferrite", "cubic", "JCPDS 10-0325"),
        ("1011240", "Fe2 O3", "alpha-fe2o3", "Hematite alpha-Fe2O3", "hematite", "rhombohedral", "JCPDS 33-0664"),
        ("9006316", "Fe2 O3", "maghemite_gamma_fe2o3", "Maghemite gamma-Fe2O3", "spinel ferrite", "cubic", "JCPDS 39-1346"),
        ("9009086", "O2 Ti", "anatase_tio2", "Anatase TiO2", "anatase", "tetragonal", "JCPDS 21-1272"),
        ("9009087", "O2 Ti", "brookite_tio2", "Brookite TiO2", "brookite", "orthorhombic", "JCPDS 29-1360"),
        ("1010944", "O2 Si", "cristobalite_sio2", "Cristobalite SiO2", "cristobalite", "tetragonal", "JCPDS 39-1425"),
        ("1011258", "O Zn", "zincite_zno", "Zincite ZnO", "wurtzite", "hexagonal", "JCPDS 36-1451"),
        ("1011148", "Cu O", "cuo", "Tenorite CuO", "tenorite", "monoclinic", "JCPDS 48-1548"),
        ("9008459", "Ag", "silver_ag", "Silver Metal", "fcc_metal", "cubic", "JCPDS 04-0783"),
        ("9008463", "Au", "gold_au", "Gold Metal", "fcc_metal", "cubic", "JCPDS 04-0784"),
    ]

    calc = xrd.XRDCalculator(wavelength="CuKa")
    phases = []

    for cid, exp_formula, pid, pname, family, csys, ref_card in configs:
        cif_path = cifs_dir / f"{cid}.cif"
        if not cif_path.exists():
            raise FileNotFoundError(f"Missing CIF file: {cif_path}")

        text = cif_path.read_text(encoding="utf-8", errors="ignore")
        m = re.search(r"_chemical_formula_sum\s+([^\r\n]+)", text)
        parsed_formula = m.group(1).strip().strip("'").strip('"') if m else ""
        if " ".join(parsed_formula.split()) != " ".join(exp_formula.split()):
            raise AssertionError(f"Formula gate failed for {cid}: expected '{exp_formula}', got '{parsed_formula}'")

        parser = cif.CifParser(str(cif_path))
        struct = parser.parse_structures(primitive=False)[0]
        space_group = struct.get_space_group_info()[0]
        lat = struct.lattice

        pattern = calc.get_pattern(struct, two_theta_range=(10, 80))
        peaks = []
        for x, y, h in zip(pattern.x, pattern.y, pattern.hkls):
            if y >= 1.0:
                hkl_tuple = h[0]["hkl"]
                hkl_str = f"({hkl_tuple[0]}{hkl_tuple[1]}{hkl_tuple[2]})"
                theta_rad = math.radians(float(x) / 2.0)
                d_sp = round(1.5406 / (2.0 * math.sin(theta_rad)), 4)
                peaks.append({
                    "twotheta": round(float(x), 2),
                    "d_spacing": d_sp,
                    "relative_intensity": round(float(y), 1),
                    "hkl": hkl_str,
                    "multiplicity": h[0].get("multiplicity", 1),
                })

        elements = [str(el) for el in struct.composition.elements]

        phases.append({
            "phase_id": pid,
            "phase_label": pname,
            "formula": struct.composition.reduced_formula,
            "structure_family": family,
            "elements": elements,
            "space_group": space_group,
            "crystal_system": csys,
            "database_ref": f"COD-{cid} / {ref_card}",
            "lattice_a": round(float(lat.a), 4),
            "lattice_b": round(float(lat.b), 4),
            "lattice_c": round(float(lat.c), 4),
            "lattice_alpha": round(float(lat.alpha), 2),
            "lattice_beta": round(float(lat.beta), 2),
            "lattice_gamma": round(float(lat.gamma), 2),
            "peaks": peaks,
        })

    # Add 15th synthetic reference
    phases.append({
        "phase_id": "sba15_amorphous_silica",
        "phase_label": "SBA-15 Amorphous Silica",
        "formula": "SiO2",
        "structure_family": "amorphous",
        "elements": ["Si", "O"],
        "space_group": "Amorphous",
        "crystal_system": "amorphous",
        "database_ref": "Synthetic Profile",
        "lattice_a": 0.0,
        "lattice_b": 0.0,
        "lattice_c": 0.0,
        "lattice_alpha": 90.0,
        "lattice_beta": 90.0,
        "lattice_gamma": 90.0,
        "peaks": [{
            "twotheta": 22.5,
            "d_spacing": 3.948,
            "relative_intensity": 100.0,
            "hkl": "broad-halo",
            "multiplicity": 1,
        }],
    })

    return phases


class CODDatabaseIndexer:
    """
    Creates and populates a SQLite database of crystallographic reference
    phases with B-Tree indexed peak positions for high-speed XRD search-match.

    Usage:
        indexer = CODDatabaseIndexer()
        indexer.build_database()           # builds with default mock data
        indexer.build_database(output_path="/custom/path.db", phases=my_phases)
    """

    def __init__(self, db_path: Optional[str | Path] = None):
        """
        Args:
            db_path: Path to SQLite database file. Defaults to
                     server/python/data/xrd_reference.db
        """
        self._db_path: Path = Path(db_path) if db_path else _DEFAULT_DB_PATH

    @property
    def db_path(self) -> Path:
        return self._db_path

    def build_database(
        self,
        output_path: Optional[str | Path] = None,
        phases: Optional[List[dict]] = None,
    ) -> Path:
        """
        Build (or rebuild) the SQLite reference database.

        Creates tables, inserts reference phases and their peaks,
        and ensures B-Tree indexes exist on the twotheta column.

        Args:
            output_path: Override output path for the .db file.
            phases:      List of phase dicts to insert. If None, uses
                         the built-in _SEED_PHASES (mock fallback data).

        Returns:
            Path to the created database file.
        """
        target_path = Path(output_path) if output_path else self._db_path
        target_path.parent.mkdir(parents=True, exist_ok=True)

        # Remove existing DB to ensure clean build
        if target_path.exists():
            target_path.unlink()
            logger.info("Removed existing database: %s", target_path)

        data = phases if phases is not None else seed_from_cifs()

        conn = sqlite3.connect(str(target_path))
        try:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA synchronous=NORMAL")
            conn.executescript(_SCHEMA_SQL)

            phase_count = 0
            peak_count = 0

            for phase in data:
                # Insert phase metadata
                conn.execute(
                    """
                    INSERT OR REPLACE INTO reference_phases
                        (phase_id, phase_label, formula, structure_family,
                         elements, space_group, crystal_system, database_ref,
                         lattice_a, lattice_b, lattice_c,
                         lattice_alpha, lattice_beta, lattice_gamma)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        phase["phase_id"],
                        phase["phase_label"],
                        phase.get("formula"),
                        phase.get("structure_family"),
                        json.dumps(phase.get("elements", [])),
                        phase.get("space_group"),
                        phase.get("crystal_system"),
                        phase.get("database_ref"),
                        phase.get("lattice_a"),
                        phase.get("lattice_b"),
                        phase.get("lattice_c"),
                        phase.get("lattice_alpha"),
                        phase.get("lattice_beta"),
                        phase.get("lattice_gamma"),
                    ),
                )
                phase_count += 1

                # Bulk insert peaks
                peaks = phase.get("peaks", [])
                peak_rows = [
                    (
                        phase["phase_id"],
                        peak["twotheta"],
                        peak.get("d_spacing"),
                        peak.get("relative_intensity"),
                        peak.get("hkl"),
                        peak.get("multiplicity", 1),
                    )
                    for peak in peaks
                ]
                conn.executemany(
                    """
                    INSERT INTO reference_peaks
                        (phase_id, twotheta, d_spacing, relative_intensity,
                         hkl, multiplicity)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    peak_rows,
                )
                peak_count += len(peak_rows)

            conn.commit()

            # Verify indexes
            cursor = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='index' "
                "AND name='idx_reference_peaks_twotheta'"
            )
            index_exists = cursor.fetchone() is not None

            logger.info(
                "Database built successfully: %d phases, %d peaks, "
                "B-Tree index on twotheta: %s → %s",
                phase_count,
                peak_count,
                "OK" if index_exists else "MISSING",
                target_path,
            )

        finally:
            conn.close()

        return target_path

    @staticmethod
    def verify_index(db_path: Optional[str | Path] = None) -> dict:
        """
        Verify that the database exists and has proper indexes.

        Returns:
            dict with keys: exists, phase_count, peak_count, index_present.
        """
        path = Path(db_path) if db_path else _DEFAULT_DB_PATH

        if not path.exists():
            return {
                "exists": False,
                "phase_count": 0,
                "peak_count": 0,
                "index_present": False,
                "path": str(path),
            }

        conn = sqlite3.connect(str(path))
        try:
            phase_count = conn.execute(
                "SELECT COUNT(*) FROM reference_phases"
            ).fetchone()[0]
            peak_count = conn.execute(
                "SELECT COUNT(*) FROM reference_peaks"
            ).fetchone()[0]
            cursor = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='index' "
                "AND name='idx_reference_peaks_twotheta'"
            )
            index_present = cursor.fetchone() is not None
        finally:
            conn.close()

        return {
            "exists": True,
            "phase_count": phase_count,
            "peak_count": peak_count,
            "index_present": index_present,
            "path": str(path),
        }


def seed_mock_data(db_path: Optional[str | Path] = None) -> Path:
    """
    Convenience function: build the database with built-in mock fallback data.

    Args:
        db_path: Override output path. Defaults to server/python/data/xrd_reference.db

    Returns:
        Path to the created database file.
    """
    indexer = CODDatabaseIndexer(db_path=db_path)
    return indexer.build_database()


# ============================================================================
# CLI entry point
# ============================================================================

if __name__ == "__main__":
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s", stream=sys.stdout)
    result_path = seed_mock_data()
    print(f"\nDatabase created at: {result_path}")
    status = CODDatabaseIndexer.verify_index(result_path)
    for key, val in status.items():
        print(f"  {key}: {val}")