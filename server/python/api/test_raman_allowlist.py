import sys
import sqlite3
from pathlib import Path

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from api.raman_database_indexer import _VERIFIED_ALLOWLIST, _DEFAULT_DB_PATH

GROUND_TRUTH = {
    "RRUFF R080025": ("Fe₃O₄", "cubic spinel"),
    "RRUFF R140712": ("γ-Fe₂O₃", "maghemite"),
    "RRUFF R040024": ("α-Fe₂O₃", "hematite"),
    "RRUFF R060277": ("TiO₂", "anatase"),
    "RRUFF R060745": ("TiO₂", "rutile"),
    "RRUFF R060027": ("ZnO", "zincite"),
    "RRUFF R120076": ("CuO", "tenorite"),
    "DOI 10.1021/acsomega.9b01477": ("CuFe₂O₄", "cubic inverse spinel"),
    "DOI 10.1021/acsphyschemau.4c00088": ("CoFe₂O₄", "cubic spinel"),
    "DOI 10.1016/0025-5408(88)90255-3": ("NiFe₂O₄", "cubic inverse spinel"),
}

def test_raman_allowlist_integrity():
    # 1. Assert exactly 10 entries in allowlist
    assert len(_VERIFIED_ALLOWLIST) == 10, f"Expected exactly 10 entries in _VERIFIED_ALLOWLIST, got {len(_VERIFIED_ALLOWLIST)}"
    assert len(GROUND_TRUTH) == 10, f"Expected exactly 10 entries in GROUND_TRUTH, got {len(GROUND_TRUTH)}"

    # 2. Assert tuples match EXACTLY
    allowlist_tuples = {src_id: (data["formula"], data["phase"]) for src_id, data in _VERIFIED_ALLOWLIST.items()}
    if allowlist_tuples != GROUND_TRUTH:
        missing = set(GROUND_TRUTH.items()) - set(allowlist_tuples.items())
        extra = set(allowlist_tuples.items()) - set(GROUND_TRUTH.items())
        raise AssertionError(f"Allowlist mismatch!\nMissing/Wrong: {missing}\nExtra/Got: {extra}")

    # 3. Assert seeded DB rows reference only these source IDs and count is 10
    assert _DEFAULT_DB_PATH.exists(), f"Database file not found at {_DEFAULT_DB_PATH}"
    conn = sqlite3.connect(str(_DEFAULT_DB_PATH))
    try:
        rows = conn.execute("SELECT db_source, rruff_id, source_doi FROM reference_phases").fetchall()
    finally:
        conn.close()

    assert len(rows) == 10, f"Expected exactly 10 seeded DB rows, got {len(rows)}"

    db_source_ids = set()
    for db_src, rruff_id, source_doi in rows:
        if db_src == "RRUFF":
            db_source_ids.add(f"RRUFF {rruff_id}")
        else:
            db_source_ids.add(f"DOI {source_doi}")

    if db_source_ids != set(GROUND_TRUTH.keys()):
        raise AssertionError(f"Seeded DB source IDs mismatch!\nExpected: {set(GROUND_TRUTH.keys())}\nGot: {db_source_ids}")

    print("✓ Raman allowlist integrity test passed successfully (10 ground-truth tuples verified against DB)")

if __name__ == "__main__":
    test_raman_allowlist_integrity()
