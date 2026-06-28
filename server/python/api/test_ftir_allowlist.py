import sys
import sqlite3
from pathlib import Path

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from api.ftir_database_indexer import _VERIFIED_ALLOWLIST, _DEFAULT_DB_PATH

GROUND_TRUTH = {
    "10.1038/physci230158a0": ("Fe3O4", "Magnetite"),
    "10.1021/am1004943#maghemite": ("gamma-Fe2O3", "Maghemite"),
    "10.1021/am1004943#hematite": ("alpha-Fe2O3", "Hematite"),
    "10.1103/PhysRevB.84.125202": ("ZnO", "Zincite"),
    "10.1103/PhysRevB.42.10060": ("CuO", "Tenorite"),
    "10.1103/PhysRevB.55.7014": ("TiO2", "Anatase"),
    "10.1103/PhysRev.126.1710": ("TiO2", "Rutile"),
}

def test_ftir_allowlist_integrity():
    # 1. Assert exactly 7 entries in allowlist and ground truth
    assert len(_VERIFIED_ALLOWLIST) == 7, f"Expected exactly 7 entries in _VERIFIED_ALLOWLIST, got {len(_VERIFIED_ALLOWLIST)}"
    assert len(GROUND_TRUTH) == 7, f"Expected exactly 7 entries in GROUND_TRUTH, got {len(GROUND_TRUTH)}"

    # 2. Assert tuples match EXACTLY 1-to-1
    allowlist_tuples = {src_id: (data["formula"], data["phase"]) for src_id, data in _VERIFIED_ALLOWLIST.items()}
    if allowlist_tuples != GROUND_TRUTH:
        raise AssertionError(f"Allowlist mismatch!\nExpected: {GROUND_TRUTH}\nGot: {allowlist_tuples}")

    # 3. Assert seeded DB rows count is 7
    assert _DEFAULT_DB_PATH.exists(), f"Database file not found at {_DEFAULT_DB_PATH}"
    conn = sqlite3.connect(str(_DEFAULT_DB_PATH))
    try:
        rows = conn.execute("SELECT phase_id FROM reference_phases").fetchall()
    finally:
        conn.close()

    assert len(rows) == 7, f"Expected exactly 7 seeded DB rows, got {len(rows)}"

    print("✓ FTIR allowlist integrity test passed successfully (7 ground-truth tuples verified against DB)")

if __name__ == "__main__":
    test_ftir_allowlist_integrity()
