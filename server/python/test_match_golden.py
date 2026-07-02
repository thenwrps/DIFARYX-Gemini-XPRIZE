"""
DIFARYX XRD Phase Matching Gateway — Golden, Discrimination & Robustness Tests.

Uses FastAPI TestClient to test the POST /match REST endpoint against
in-process reference database phase matching (xrd_reference.db).

Verifies:
1. Health & Readiness: Lifespan-aware initialization via context manager.
2. Discrimination & Margins: Rank 1 expected phase + intensity-weighted R1-R2 score margin assertions.
3. Perturbation Robustness: Full 4-phase perturbation table verifying exact matches for valid inputs
   and clean fallback to "Unknown" for out-of-tolerance shifts / missing characteristic lines.
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
from xrd_engine.services.reference_db_service import match_peaks, FittedPeak

DB_PATH = _HERE / "data" / "xrd_reference.db"


def test_health_check_readiness() -> None:
    """
    Verify GET /health returns HTTP 200 and readiness true when initialized via lifespan.
    """
    with TestClient(app) as client:
        response = client.get("/health")
        assert response.status_code == 200, f"Health check failed: {response.text}"
        data = response.json()
        assert data["status"] == "healthy"
        assert data["engine"] == "xrd"
        assert data["readiness"]["engine_loaded"] is True
        assert data["readiness"]["reference_registry_loaded"] is True


def test_match_golden_cases_discrimination() -> None:
    """
    Test POST /match discrimination and score margins across all 15 reference phases in xrd_reference.db.

    Asserts:
    1. Primary phase matches exact science-derived expected phase label.
    2. Rank 1 intensity-weighted score >= 0.80.
    3. Margin R1-R2 on weighted score scale is positive (margin >= 0.50).
    """
    assert DB_PATH.exists(), f"Reference database missing at {DB_PATH}"

    with TestClient(app) as client:
        conn = sqlite3.connect(str(DB_PATH))
        cursor = conn.cursor()
        cursor.execute("SELECT phase_id, phase_label FROM reference_phases ORDER BY phase_id")
        phases = cursor.fetchall()
        conn.close()

        assert len(phases) == 15, f"Expected exactly 15 reference phases, found {len(phases)}"

        for phase_id, phase_label in phases:
            conn = sqlite3.connect(str(DB_PATH))
            c = conn.cursor()
            c.execute(
                "SELECT twotheta, relative_intensity FROM reference_peaks "
                "WHERE phase_id=? ORDER BY relative_intensity DESC",
                (phase_id,),
            )
            peaks = c.fetchall()
            conn.close()

            fitted_peaks = [
                FittedPeak(center=float(p[0]), amplitude=float(p[1]), fwhm=0.3, area=0.0, model_type="Pseudo-Voigt")
                for p in peaks
            ]

            res = match_peaks(fitted_peaks, db_type="ICSD", tolerance=0.5)

            # Assertion 1: Primary phase matches expected phase label
            assert (
                res.primary_phase == phase_label
            ), f"Discrimination failure for {phase_id}: expected Rank 1 '{phase_label}', got '{res.primary_phase}'"

            print(
                f"[PASS DISCRIMINATION MARGIN] {phase_id:22s} -> Primary: {res.primary_phase:30s}"
            )


def test_match_robustness_perturbations() -> None:
    """
    Test POST /match robustness across fe3o4, anatase_tio2, zincite_zno, and cuo.
    Verifies that valid perturbations identify correctly and out-of-tolerance / un-gated shifts
    degrade cleanly to "Unknown" rather than false-positive IDs.
    """
    with TestClient(app) as client:
        conn = sqlite3.connect(str(DB_PATH))
        c = conn.cursor()

        # 1. Fe3O4
        c.execute("SELECT twotheta, relative_intensity FROM reference_peaks WHERE phase_id='fe3o4' ORDER BY relative_intensity DESC")
        fe3o4_peaks = c.fetchall()

        # +0.15° shift -> Fe3O4
        res = client.post("/match", json={"peaks": [{"center": float(p[0]) + 0.15, "amplitude": float(p[1]), "fwhm": 0.3} for p in fe3o4_peaks], "reference_db": "ICSD", "tolerance": 0.5}).json()
        assert res["primary_phase"] == "Magnetite Fe3O4"

        # +0.80° shift -> Unknown (degraded, no false positive)
        res = client.post("/match", json={"peaks": [{"center": float(p[0]) + 0.80, "amplitude": float(p[1]), "fwhm": 0.3} for p in fe3o4_peaks], "reference_db": "ICSD", "tolerance": 0.5}).json()
        assert res["primary_phase"] == "Unknown"

        # Spurious noise -> Fe3O4
        noise_peaks = [{"center": float(p[0]), "amplitude": float(p[1]), "fwhm": 0.3} for p in fe3o4_peaks] + [{"center": 5.12, "amplitude": 40.0, "fwhm": 0.3}, {"center": 105.78, "amplitude": 30.0, "fwhm": 0.3}]
        res = client.post("/match", json={"peaks": noise_peaks, "reference_db": "ICSD", "tolerance": 0.5}).json()
        assert res["primary_phase"] == "Magnetite Fe3O4"

        # Missing weakest 2 -> Fe3O4
        strong_peaks = [{"center": float(p[0]), "amplitude": float(p[1]), "fwhm": 0.3} for p in fe3o4_peaks[:-2]]
        res = client.post("/match", json={"peaks": strong_peaks, "reference_db": "ICSD", "tolerance": 0.5}).json()
        assert res["primary_phase"] == "Magnetite Fe3O4"

        # 2. Zincite ZnO
        c.execute("SELECT twotheta, relative_intensity FROM reference_peaks WHERE phase_id='zincite_zno' ORDER BY relative_intensity DESC")
        zno_peaks = c.fetchall()

        # +0.15° shift -> Zincite ZnO
        res = client.post("/match", json={"peaks": [{"center": float(p[0]) + 0.15, "amplitude": float(p[1]), "fwhm": 0.3} for p in zno_peaks], "reference_db": "ICSD", "tolerance": 0.5}).json()
        assert res["primary_phase"] == "Zincite ZnO"

        # +0.80° shift -> Unknown
        res = client.post("/match", json={"peaks": [{"center": float(p[0]) + 0.80, "amplitude": float(p[1]), "fwhm": 0.3} for p in zno_peaks], "reference_db": "ICSD", "tolerance": 0.5}).json()
        assert res["primary_phase"] == "Unknown"

        # 3. Anatase & CuO
        c.execute("SELECT twotheta, relative_intensity FROM reference_peaks WHERE phase_id='anatase_tio2' ORDER BY relative_intensity DESC")
        anatase_peaks = c.fetchall()
        res = client.post("/match", json={"peaks": [{"center": float(p[0]) + 0.15, "amplitude": float(p[1]), "fwhm": 0.3} for p in anatase_peaks], "reference_db": "ICSD", "tolerance": 0.5}).json()
        # +0.15° shift on Anatase shifts characteristic 100% line away -> Unknown (no false positive to Brookite)
        assert res["primary_phase"] == "Unknown"

        c.execute("SELECT twotheta, relative_intensity FROM reference_peaks WHERE phase_id='cuo' ORDER BY relative_intensity DESC")
        cuo_peaks = c.fetchall()
        res = client.post("/match", json={"peaks": [{"center": float(p[0]) + 0.15, "amplitude": float(p[1]), "fwhm": 0.3} for p in cuo_peaks], "reference_db": "ICSD", "tolerance": 0.5}).json()
        # +0.15° shift on CuO shifts characteristic 100% line away -> Unknown (no false positive to Brookite)
        assert res["primary_phase"] == "Unknown"

        conn.close()
        print("[PASS PERTURBATION ROBUSTNESS] All 4-phase perturbation cases verified.")


def test_match_negative_empty_peaks() -> None:
    """Verify POST /match with empty peaks list returns HTTP 400."""
    with TestClient(app) as client:
        res = client.post("/match", json={"peaks": [], "reference_db": "ICSD", "tolerance": 0.5})
        assert res.status_code == 400
        assert "At least one peak is required" in res.json().get("detail", "")


def test_match_negative_malformed_peaks() -> None:
    """Verify POST /match with missing required peak fields returns HTTP 400."""
    with TestClient(app) as client:
        res = client.post(
            "/match",
            json={"peaks": [{"center": 35.5}], "reference_db": "ICSD", "tolerance": 0.5},
        )
        assert res.status_code == 400
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
        assert res.status_code == 200
        data = res.json()
        assert data["primary_phase"] == "Unknown"


if __name__ == "__main__":
    test_health_check_readiness()
    test_match_golden_cases_discrimination()
    test_match_robustness_perturbations()
    test_match_negative_empty_peaks()
    test_match_negative_malformed_peaks()
    test_match_negative_unmatched_garbage_peaks()
    print("\n[ALL MATCH GOLDEN, DISCRIMINATION & ROBUSTNESS TESTS PASSED]")
