import sys
import sqlite3
from pathlib import Path

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from api.xps_database_indexer import _VERIFIED_ALLOWLIST, _DEFAULT_DB_PATH, XpsDatabaseIndexer

GROUND_TRUTH = {
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

def test_xps_allowlist_integrity():
    # 1. Assert exactly 7 entries in allowlist and ground truth
    assert len(_VERIFIED_ALLOWLIST) == 7, f"Expected exactly 7 entries in _VERIFIED_ALLOWLIST, got {len(_VERIFIED_ALLOWLIST)}"
    assert len(GROUND_TRUTH) == 7, f"Expected exactly 7 entries in GROUND_TRUTH, got {len(GROUND_TRUTH)}"

    # 2. Assert tuples match EXACTLY 1-to-1 (source_id -> formula, phase_label, bands, forbiddenSatellites)
    if _VERIFIED_ALLOWLIST != GROUND_TRUTH:
        raise AssertionError(f"Allowlist mismatch!\nExpected: {GROUND_TRUTH}\nGot: {_VERIFIED_ALLOWLIST}")

    # 3. Build DB and assert seeded DB rows count is 7
    XpsDatabaseIndexer.build_database()
    assert _DEFAULT_DB_PATH.exists(), f"Database file not found at {_DEFAULT_DB_PATH}"
    conn = sqlite3.connect(str(_DEFAULT_DB_PATH))
    try:
        rows = conn.execute("SELECT phase_id FROM reference_phases").fetchall()
    finally:
        conn.close()

    assert len(rows) == 7, f"Expected exactly 7 seeded DB rows, got {len(rows)}"

    print("✓ XPS allowlist integrity test passed successfully (7 ground-truth tuples verified against DB)")

if __name__ == "__main__":
    test_xps_allowlist_integrity()
