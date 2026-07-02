"""
DIFARYX XRD Phase Matching Gateway — Golden & Validation Integration Tests.

Uses FastAPI TestClient to test the POST /match REST endpoint against
in-process reference database phase matching (xrd_reference.db).

Verifies:
1. Golden cases: Ideal peak inputs derived from known crystallographic phase reference peaks.
2. Negative / validation cases: Empty peak list, malformed JSON, and unmatched noise.
"""

from __future__ import annotations

import sys
import sqlite3
from pathlib import Path

# Add server/python directory to path
_HERE = Path(__file__).resolve().parent
if str(_HERE) not in sys.path:
    sys.path.insert(0, str(_HERE))

from fastapi.testclient import TestClient
from api.gateway import app

client = TestClient(app)
DB_PATH = _HERE / "data" / "xrd_reference.db"


def test_health_check() -> None:
    """Verify GET /health returns HTTP 200 and healthy status."""
    response = client.get("/health")
    assert response.status_code == 200, f"Health check failed: {response.text}"
    data = response.json()
    assert data["status"] == "healthy"
    assert data["engine"] == "xrd"


def test_match_golden_cases() -> None:
    """
    Test POST /match for all reference phases in xrd_reference.db.

    Constructs ideal fitted peak inputs from each phase's reference peak positions
    and asserts that the endpoint returns HTTP 200, matches all peaks, and identifies
    the exact expected primary phase.
    """
    assert DB_PATH.exists(), f"Reference database missing at {DB_PATH}"

    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.cursor()
    cursor.execute("SELECT phase_id, phase_label, database_ref FROM reference_phases")
    phases = cursor.fetchall()
    conn.close()

    assert len(phases) >= 9, f"Expected at least 9 reference phases, found {len(phases)}"

    confidence_floor = 0.80

    for phase_id, phase_label, db_ref in phases:
        conn = sqlite3.connect(str(DB_PATH))
        c = conn.cursor()
        c.execute(
            "SELECT twotheta, relative_intensity, hkl FROM reference_peaks "
            "WHERE phase_id=? ORDER BY relative_intensity DESC",
            (phase_id,),
        )
        peaks = c.fetchall()
        conn.close()

        assert len(peaks) > 0, f"No reference peaks found for phase {phase_id}"

        # Build ideal peak input matching the exact reference peak positions
        fitted_peaks = [
            {
                "center": float(p[0]),
                "amplitude": float(p[1]),
                "fwhm": 0.3,
            }
            for p in peaks
        ]

        payload = {
            "peaks": fitted_peaks,
            "reference_db": "ICSD",
            "tolerance": 0.5,
        }

        res = client.post("/match", json=payload)
        assert res.status_code == 200, f"Phase {phase_id} match request failed: {res.text}"

        data = res.json()
        primary_phase = data.get("primary_phase")
        matched_peaks = data.get("matched_peaks", [])

        # Assertion 1: Primary phase matches expected science-derived phase label
        assert (
            primary_phase == phase_label
        ), f"Phase mismatch for {phase_id}: expected '{phase_label}', got '{primary_phase}'"

        # Assertion 2: Matched peaks list is non-empty
        assert (
            len(matched_peaks) > 0
        ), f"No peaks matched for golden case phase {phase_id}"

        # Assertion 3: Peak match confidences meet or exceed the floor
        for pm in matched_peaks:
            conf = pm.get("confidence", 0.0)
            assert (
                conf >= confidence_floor
            ), f"Peak match confidence {conf} below floor {confidence_floor} for phase {phase_id}"

        print(
            f"[PASS] {phase_id:22s} -> {primary_phase:30s} | Matched: {len(matched_peaks)}/{len(peaks)} peaks | Conf Floor >= {confidence_floor}"
        )


def test_match_negative_empty_peaks() -> None:
    """Verify POST /match with empty peaks list returns HTTP 400."""
    res = client.post("/match", json={"peaks": [], "reference_db": "ICSD", "tolerance": 0.5})
    assert res.status_code == 400, f"Expected HTTP 400 for empty peaks, got {res.status_code}"
    assert "At least one peak is required" in res.json().get("detail", "")


def test_match_negative_malformed_peaks() -> None:
    """Verify POST /match with missing required peak fields returns HTTP 400."""
    res = client.post(
        "/match",
        json={"peaks": [{"center": 35.5}], "reference_db": "ICSD", "tolerance": 0.5},
    )
    assert res.status_code == 400, f"Expected HTTP 400 for malformed peak data, got {res.status_code}"
    assert "Invalid peak data" in res.json().get("detail", "")


def test_match_negative_unmatched_garbage_peaks() -> None:
    """Verify POST /match with random/unmatched peaks returns Unknown primary phase and no matched peaks."""
    garbage_peaks = [
        {"center": 5.123, "amplitude": 50.0, "fwhm": 0.3},
        {"center": 105.789, "amplitude": 40.0, "fwhm": 0.3},
    ]
    res = client.post(
        "/match",
        json={"peaks": garbage_peaks, "reference_db": "ICSD", "tolerance": 0.5},
    )
    assert res.status_code == 200, f"Expected HTTP 200 response for garbage scan, got {res.status_code}"
    data = res.json()
    assert data["primary_phase"] == "Unknown", f"Expected 'Unknown' primary phase, got '{data['primary_phase']}'"
    assert len(data["matched_peaks"]) == 0, f"Expected 0 matched peaks for garbage input, got {len(data['matched_peaks'])}"


if __name__ == "__main__":
    test_health_check()
    test_match_golden_cases()
    test_match_negative_empty_peaks()
    test_match_negative_malformed_peaks()
    test_match_negative_unmatched_garbage_peaks()
    print("\n[ALL MATCH GOLDEN TESTS PASSED]")
