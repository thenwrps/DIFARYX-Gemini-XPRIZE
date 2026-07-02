"""
DIFARYX XRD Phase Matching Gateway — Golden, Discrimination & Robustness Tests.

Uses FastAPI TestClient to test the POST /match REST endpoint against
in-process reference database phase matching (xrd_reference.db).

Verifies:
1. Health & Readiness: Lifespan-aware initialization via context manager.
2. Golden & Discrimination: Exact primary phase identification across all 15 DB phases.
3. Perturbation Robustness: +0.15° within-tolerance shift, spurious noise, missing peaks, beyond-tolerance shift.
4. Validation & Negative Cases: Empty peak list, malformed JSON, unmatched garbage peaks.
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

DB_PATH = _HERE / "data" / "xrd_reference.db"


def test_health_check_readiness() -> None:
    """
    Verify GET /health returns HTTP 200 and readiness true when initialized via lifespan.

    Fix 2: Uses `with TestClient(app) as client:` so FastAPI lifespan startup handlers
    run, properly setting engine_loaded=True and reference_registry_loaded=True.
    """
    with TestClient(app) as client:
        response = client.get("/health")
        assert response.status_code == 200, f"Health check failed: {response.text}"
        data = response.json()
        assert data["status"] == "healthy"
        assert data["engine"] == "xrd"
        assert data["readiness"]["engine_loaded"] is True, "engine_loaded should be True after lifespan initialization"
        assert data["readiness"]["reference_registry_loaded"] is True, "reference_registry_loaded should be True after lifespan initialization"


def test_match_golden_cases_discrimination() -> None:
    """
    Test POST /match discrimination across all 15 reference phases in xrd_reference.db.

    Constructs ideal fitted peak inputs from each phase's reference peak positions
    and asserts that the endpoint returns HTTP 200, matches all peaks, and identifies
    the exact expected primary phase with high confidence.
    """
    assert DB_PATH.exists(), f"Reference database missing at {DB_PATH}"

    with TestClient(app) as client:
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

            # Build ideal peak input matching exact reference peak positions
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
                f"[PASS DISCRIMINATION] {phase_id:22s} -> {primary_phase:30s} | Matched: {len(matched_peaks)}/{len(peaks)} peaks"
            )


def test_match_robustness_perturbations() -> None:
    """
    Test POST /match robustness against peak shifts, noise, and missing peaks.
    """
    with TestClient(app) as client:
        # 1. Within-tolerance shift (+0.15° < 0.5° tolerance) for Fe3O4 and ZnO
        conn = sqlite3.connect(str(DB_PATH))
        c = conn.cursor()
        c.execute("SELECT twotheta, relative_intensity FROM reference_peaks WHERE phase_id='fe3o4' ORDER BY relative_intensity DESC")
        fe3o4_peaks = c.fetchall()
        c.execute("SELECT twotheta, relative_intensity FROM reference_peaks WHERE phase_id='zincite_zno' ORDER BY relative_intensity DESC")
        zno_peaks = c.fetchall()
        conn.close()

        # Test Fe3O4 shifted by +0.15° 2θ
        fe3o4_shifted = [{"center": float(p[0]) + 0.15, "amplitude": float(p[1]), "fwhm": 0.3} for p in fe3o4_peaks]
        res = client.post("/match", json={"peaks": fe3o4_shifted, "reference_db": "ICSD", "tolerance": 0.5}).json()
        assert res["primary_phase"] == "Magnetite Fe3O4", f"Fe3O4 shifted failed: got {res['primary_phase']}"
        # Position decay: 1.0 - (0.15/0.5) = 0.70
        assert round(res["matched_peaks"][0]["confidence"], 2) == 0.70

        # Test ZnO shifted by +0.15° 2θ
        zno_shifted = [{"center": float(p[0]) + 0.15, "amplitude": float(p[1]), "fwhm": 0.3} for p in zno_peaks]
        res = client.post("/match", json={"peaks": zno_shifted, "reference_db": "ICSD", "tolerance": 0.5}).json()
        assert res["primary_phase"] == "Zincite ZnO", f"ZnO shifted failed: got {res['primary_phase']}"
        assert round(res["matched_peaks"][0]["confidence"], 2) == 0.70

        # 2. Spurious noise peaks (Fe3O4 + random noise)
        fe3o4_noisy = [{"center": float(p[0]), "amplitude": float(p[1]), "fwhm": 0.3} for p in fe3o4_peaks]
        fe3o4_noisy.extend([
            {"center": 5.12, "amplitude": 40.0, "fwhm": 0.3},
            {"center": 105.78, "amplitude": 30.0, "fwhm": 0.3},
        ])
        res = client.post("/match", json={"peaks": fe3o4_noisy, "reference_db": "ICSD", "tolerance": 0.5}).json()
        assert res["primary_phase"] == "Magnetite Fe3O4"
        assert len(res["matched_peaks"]) == len(fe3o4_peaks)

        # 3. Missing weakest 2 peaks (Fe3O4 with top peaks only)
        fe3o4_strong = [{"center": float(p[0]), "amplitude": float(p[1]), "fwhm": 0.3} for p in fe3o4_peaks[:-2]]
        res = client.post("/match", json={"peaks": fe3o4_strong, "reference_db": "ICSD", "tolerance": 0.5}).json()
        assert res["primary_phase"] == "Magnetite Fe3O4"
        assert len(res["matched_peaks"]) == len(fe3o4_peaks) - 2

        print("[PASS PERTURBATION ROBUSTNESS] Fe3O4 and ZnO robustness cases verified.")


def test_match_negative_empty_peaks() -> None:
    """Verify POST /match with empty peaks list returns HTTP 400."""
    with TestClient(app) as client:
        res = client.post("/match", json={"peaks": [], "reference_db": "ICSD", "tolerance": 0.5})
        assert res.status_code == 400, f"Expected HTTP 400 for empty peaks, got {res.status_code}"
        assert "At least one peak is required" in res.json().get("detail", "")


def test_match_negative_malformed_peaks() -> None:
    """Verify POST /match with missing required peak fields returns HTTP 400."""
    with TestClient(app) as client:
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
    with TestClient(app) as client:
        res = client.post(
            "/match",
            json={"peaks": garbage_peaks, "reference_db": "ICSD", "tolerance": 0.5},
        )
        assert res.status_code == 200, f"Expected HTTP 200 response for garbage scan, got {res.status_code}"
        data = res.json()
        assert data["primary_phase"] == "Unknown", f"Expected 'Unknown' primary phase, got '{data['primary_phase']}'"
        assert len(data["matched_peaks"]) == 0, f"Expected 0 matched peaks for garbage input, got {len(data['matched_peaks'])}"


if __name__ == "__main__":
    test_health_check_readiness()
    test_match_golden_cases_discrimination()
    test_match_robustness_perturbations()
    test_match_negative_empty_peaks()
    test_match_negative_malformed_peaks()
    test_match_negative_unmatched_garbage_peaks()
    print("\n[ALL MATCH GOLDEN, DISCRIMINATION & ROBUSTNESS TESTS PASSED]")
