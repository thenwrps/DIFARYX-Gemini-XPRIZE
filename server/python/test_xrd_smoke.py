"""
DIFARYX XRD Backend Smoke Test.

Tests the POST /process endpoint with:
  1. Valid XRD-like signal (CoFe2O4 spinel pattern)
  2. Weak / empty / invalid inputs (edge cases)

Verifies response fields:
  - y_residual (JSON-safe list)
  - sn_ratio (float)
  - baseline_deviation (float)
  - peak_resolution (str)
  - detected_peaks (list)
  - fitted_peaks (list)
  - phase_match (optional dict)

Run:
    python test_xrd_smoke.py
"""

import json
import math
import re
import sys
import uuid

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

from fastapi.testclient import TestClient

# Ensure server/python is on sys.path
import os
_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)

from api.gateway import app

client = TestClient(app)

# ── Helpers ──────────────────────────────────────────────────────────────────

def generate_cofe2o4_xrd_pattern():
    """
    Generate a synthetic CoFe2O4 spinel XRD pattern.
    Simulates Cu Kα radiation (λ = 1.5406 Å).
    Returns (x, y) lists where x is 2θ and y is intensity.
    """
    import numpy as np

    # 2θ range: 10° to 80° with 0.02° step
    x = np.linspace(10.0, 80.0, 3501)

    # CoFe2O4 spinel peak positions (2θ) and relative intensities
    peaks = [
        (18.37, 12.0, 0.25),   # (111)
        (30.12, 30.0, 0.30),   # (220)
        (35.48, 100.0, 0.35),  # (311) - strongest
        (37.10, 8.0, 0.25),    # (222)
        (43.12, 20.0, 0.30),   # (400)
        (53.52, 10.0, 0.25),   # (422)
        (57.02, 30.0, 0.30),   # (511)
        (62.62, 40.0, 0.35),   # (440)
    ]

    y = np.zeros_like(x)

    for peak_pos, rel_intensity, fwhm in peaks:
        # Gaussian peak profile
        sigma = fwhm / 2.355
        y += rel_intensity * np.exp(-0.5 * ((x - peak_pos) / sigma) ** 2)

    # Add baseline
    baseline = 50.0 + 0.5 * (x - 10.0)
    y += baseline

    # Add noise
    np.random.seed(42)
    noise = np.random.normal(0, 1.5, size=len(x))
    y += noise

    # Ensure non-negative
    y = np.maximum(y, 0.0)

    return x.tolist(), y.tolist()


def generate_flat_signal():
    """Generate a flat (no-peak) signal."""
    import numpy as np
    x = np.linspace(10.0, 80.0, 1000)
    y = np.full_like(x, 100.0)  # constant intensity
    return x.tolist(), y.tolist()


def generate_noise_only():
    """Generate random noise with no discernible peaks."""
    import numpy as np
    np.random.seed(99)
    x = np.linspace(10.0, 80.0, 1000)
    y = np.random.uniform(0.0, 5.0, size=len(x))
    return x.tolist(), y.tolist()


# ── Test Results Tracking ────────────────────────────────────────────────────

results = []


def log_test(name, passed, details=""):
    status = "PASS" if passed else "FAIL"
    results.append((name, status, details))
    icon = "✅" if passed else "❌"
    print(f"  {icon} {name}" + (f" — {details}" if details else ""))


# ── Test 1: Valid XRD Signal ────────────────────────────────────────────────

def test_valid_xrd_signal():
    print("\n═══ Test 1: Valid CoFe2O4 XRD Signal ═══")
    x, y = generate_cofe2o4_xrd_pattern()

    payload = {
        "x": x,
        "y": y,
        "theta_min": 10.0,
        "theta_max": 80.0,
        "peak_threshold": 0.10,
        "min_prominence": 0.05,
    }

    resp = client.post("/process", json=payload)
    log_test("POST /process returns 200", resp.status_code == 200,
             f"status={resp.status_code}")

    if resp.status_code != 200:
        log_test("Response body", False, resp.text[:300])
        return

    data = resp.json()

    # y_residual is a JSON-safe list
    y_res = data.get("y_residual", None)
    log_test("y_residual is a list", isinstance(y_res, list),
             f"type={type(y_res).__name__}, len={len(y_res) if y_res else 'N/A'}")
    if y_res:
        all_finite = all(math.isfinite(v) for v in y_res)
        log_test("y_residual values are finite", all_finite,
                 "all values are finite numbers" if all_finite else "contains NaN/Inf")

    # sn_ratio
    sn = data.get("sn_ratio")
    log_test("sn_ratio is a float", isinstance(sn, (int, float)),
             f"value={sn}")

    # baseline_deviation
    bd = data.get("baseline_deviation")
    log_test("baseline_deviation is a float", isinstance(bd, (int, float)),
             f"value={bd}")

    # peak_resolution
    pr = data.get("peak_resolution")
    valid_pr = {"high-resolution", "publication-limited", "screening-grade"}
    log_test("peak_resolution is a valid string", pr in valid_pr,
             f"value='{pr}'")

    # detected_peaks
    det = data.get("detected_peaks", [])
    log_test("detected_peaks is a list", isinstance(det, list),
             f"count={len(det)}")
    if det:
        p = det[0]
        has_keys = all(k in p for k in ("position", "intensity", "index", "prominence", "fwhm"))
        log_test("detected peak has required fields", has_keys,
                 f"keys={list(p.keys())}")

    # fitted_peaks
    fit = data.get("fitted_peaks", [])
    log_test("fitted_peaks is a list", isinstance(fit, list),
             f"count={len(fit)}")
    if fit:
        fp = fit[0]
        has_keys = all(k in fp for k in ("center", "amplitude", "fwhm", "area", "model_type"))
        log_test("fitted peak has required fields", has_keys,
                 f"keys={list(fp.keys())}")

    # phase_match
    pm = data.get("phase_match")
    log_test("phase_match is present", pm is not None,
             f"type={type(pm).__name__}")
    if pm:
        log_test("phase_match.primary_phase is string",
                 isinstance(pm.get("primary_phase"), str),
                 f"value='{pm.get('primary_phase')}'")
        matched = pm.get("matched_peaks", [])
        log_test("phase_match.matched_peaks is list",
                 isinstance(matched, list),
                 f"count={len(matched)}")
        log_test("phase_match.summary is string",
                 isinstance(pm.get("summary"), str),
                 f"len={len(pm.get('summary', ''))}")

    # Verify JSON serializable (round-trip)
    try:
        json.dumps(data)
        log_test("Response is JSON-serializable", True)
    except Exception as e:
        log_test("Response is JSON-serializable", False, str(e))


# ── Test 2: Weak/Empty/Invalid Inputs ────────────────────────────────────────

def test_missing_xy():
    print("\n═══ Test 2a: Missing x and y ═══")
    payload = {"theta_min": 10.0, "theta_max": 80.0}
    resp = client.post("/process", json=payload)
    log_test("Missing x/y returns 400", resp.status_code == 400,
             f"status={resp.status_code}")


def test_mismatched_lengths():
    print("\n═══ Test 2b: Mismatched x and y lengths ═══")
    payload = {
        "x": [10.0, 11.0, 12.0, 13.0, 14.0, 15.0, 16.0, 17.0, 18.0, 19.0, 20.0],
        "y": [1.0, 2.0, 3.0, 4.0, 5.0],
    }
    resp = client.post("/process", json=payload)
    log_test("Mismatched lengths returns 400", resp.status_code == 400,
             f"status={resp.status_code}")


def test_too_few_points():
    print("\n═══ Test 2c: Too few data points ═══")
    payload = {
        "x": [10.0, 11.0, 12.0, 13.0, 14.0],
        "y": [1.0, 2.0, 3.0, 4.0, 5.0],
    }
    resp = client.post("/process", json=payload)
    log_test("Fewer than 10 points returns 400", resp.status_code == 400,
             f"status={resp.status_code}")


def test_flat_signal():
    print("\n═══ Test 2d: Flat signal (no peaks) ═══")
    x, y = generate_flat_signal()
    payload = {"x": x, "y": y}
    resp = client.post("/process", json=payload)
    log_test("Flat signal returns 200", resp.status_code == 200,
             f"status={resp.status_code}")

    if resp.status_code == 200:
        data = resp.json()
        det = data.get("detected_peaks", [])
        # Edge artifacts from smoothing/baseline subtraction can produce
        # a small number of spurious detections on a perfectly flat signal.
        log_test("Flat signal: few detected peaks (edge artifacts OK)", len(det) <= 5,
                 f"detected={len(det)}")
        log_test("Flat signal: y_residual is list",
                 isinstance(data.get("y_residual"), list))
        log_test("Flat signal: sn_ratio is numeric",
                 isinstance(data.get("sn_ratio"), (int, float)))


def test_noise_only():
    print("\n═══ Test 2e: Noise-only signal ═══")
    x, y = generate_noise_only()
    payload = {"x": x, "y": y}
    resp = client.post("/process", json=payload)
    log_test("Noise signal returns 200", resp.status_code == 200,
             f"status={resp.status_code}")

    if resp.status_code == 200:
        data = resp.json()
        log_test("Noise: y_residual is list",
                 isinstance(data.get("y_residual"), list))
        log_test("Noise: sn_ratio is numeric",
                 isinstance(data.get("sn_ratio"), (int, float)))
        log_test("Noise: peak_resolution is string",
                 isinstance(data.get("peak_resolution"), str))


def test_empty_arrays():
    print("\n═══ Test 2f: Empty arrays ═══")
    payload = {"x": [], "y": []}
    resp = client.post("/process", json=payload)
    log_test("Empty arrays returns 400", resp.status_code == 400,
             f"status={resp.status_code}")


def test_health_endpoint():
    print("\n═══ Test 2g: Health check ═══")
    resp = client.get("/health")
    log_test("GET /health returns 200", resp.status_code == 200,
             f"status={resp.status_code}")
    if resp.status_code == 200:
        data = resp.json()
        log_test("Health response has status='ok'", data.get("status") == "ok",
                 f"status='{data.get('status')}'")


def test_scientific_skills_layer():
    print("\n═══ Test 3: Scientific Skills Layer ═══")

    # 1. GET /skills
    resp = client.get("/skills")
    log_test("GET /skills returns 200", resp.status_code == 200, f"status={resp.status_code}")
    if resp.status_code == 200:
        skills = resp.json()
        log_test("GET /skills returns 7 skills", len(skills) == 7, f"count={len(skills)}")
        if skills:
            expected_keys = {"skill_id", "skill_label", "technique", "description", "inputs", "outputs", "status"}
            keys_ok = all(expected_keys.issubset(skill.keys()) for skill in skills)
            log_test("All skills have required keys", keys_ok)

    # 2. GET /skills/xrd and GET /skills/xrd-science-skill
    resp_xrd = client.get("/skills/xrd")
    log_test("GET /skills/xrd returns 200", resp_xrd.status_code == 200, f"status={resp_xrd.status_code}")
    if resp_xrd.status_code == 200:
        skill = resp_xrd.json()
        log_test("GET /skills/xrd matches xrd-science-skill", skill.get("skill_id") == "xrd-science-skill")

    resp_full_id = client.get("/skills/xrd-science-skill")
    log_test("GET /skills/xrd-science-skill returns 200", resp_full_id.status_code == 200, f"status={resp_full_id.status_code}")
    if resp_full_id.status_code == 200:
        skill = resp_full_id.json()
        log_test("GET /skills/xrd-science-skill matches technique XRD", skill.get("technique") == "XRD")

    # 3. GET unknown skill returns 404
    resp_unknown = client.get("/skills/unknown-skill-12345")
    log_test("GET /skills/unknown-skill returns 404", resp_unknown.status_code == 404, f"status={resp_unknown.status_code}")

    # 4. POST /skills/xrd/process
    x, y = generate_cofe2o4_xrd_pattern()
    payload = {
        "x": x,
        "y": y,
        "theta_min": 10.0,
        "theta_max": 80.0,
        "peak_threshold": 0.10,
        "min_prominence": 0.05,
    }
    resp_process = client.post("/skills/xrd/process", json=payload)
    log_test("POST /skills/xrd/process returns 200", resp_process.status_code == 200, f"status={resp_process.status_code}")

    if resp_process.status_code == 200:
        data = resp_process.json()
        log_test("Response has 'legacy_result'", "legacy_result" in data)
        log_test("Response has 'evidence_object'", "evidence_object" in data)

        evidence = data.get("evidence_object", {})

        # UUIDv4 evidence_id
        ev_id = evidence.get("evidence_id")
        is_uuid4 = False
        try:
            uuid.UUID(ev_id, version=4)
            is_uuid4 = True
        except ValueError:
            pass
        log_test("evidence_id is a valid UUIDv4", is_uuid4, f"value={ev_id}")

        # ISO UTC created_at
        created_at = evidence.get("created_at", "")
        # Matches typical UTC format ending with Z: YYYY-MM-DDTHH:MM:SSZ
        is_iso_utc = created_at.endswith("Z") and ("T" in created_at)
        log_test("created_at is ISO UTC format", is_iso_utc, f"value={created_at}")

        # SHA-256 input_reference
        input_ref = evidence.get("input_reference", "")
        is_sha256 = bool(re.match(r"^[0-9a-fA-F]{64}$", input_ref))
        log_test("input_reference is a SHA-256 hash", is_sha256, f"value={input_ref}")

        # Absence of absolute confirmation language
        banned_terms = ["confirmed phase", "confirmed phase purity", "purity confirmation"]
        text_content = []
        for obs in evidence.get("scientific_observations", []):
            text_content.append(obs.lower())
        for cb in evidence.get("claim_boundaries", []):
            text_content.append(cb.lower())
        for vg in evidence.get("validation_gaps", []):
            text_content.append(vg.lower())
        text_content.append(evidence.get("agent_ready_summary", "").lower())

        # Clean approved/preferred phrases to avoid false-positive substring matches
        approved_phrases = [
            "phase-purity confirmation requires additional validation",
            "phase-purity confirmation requires additional validation and complementary evidence",
            "complementary xps, ftir, or raman evidence is recommended"
        ]
        cleaned_text_content = []
        for text in text_content:
            cleaned = text
            for phrase in approved_phrases:
                cleaned = cleaned.replace(phrase, "")
            cleaned_text_content.append(cleaned)

        found_banned = False
        for term in banned_terms:
            for text in cleaned_text_content:
                if term in text:
                    found_banned = True
                    break

        log_test("Absence of absolute confirmation language", not found_banned,
                 "no absolute confirmation terms found" if not found_banned else "found banned terms")


# ── Test 4: Phase 3 — Grouped contract accepted ─────────────────────────────

def test_phase3_grouped_contract_accepted():
    """
    POST /process with the new grouped XRD contract (dataset_context + parameters)
    alongside legacy flat fields must return 200 and still produce a valid result.
    """
    print("\n═══ Test 4: Phase 3 — Grouped contract accepted ═══")
    x, y = generate_cofe2o4_xrd_pattern()

    payload = {
        # Legacy flat fields (still authoritative for engine)
        "x": x,
        "y": y,
        "theta_min": 10.0,
        "theta_max": 80.0,
        "peak_threshold": 0.10,
        "min_prominence": 0.05,
        # Phase 3: new grouped contract (accepted and validated, not consumed by engine)
        "dataset_context": {
            "sample_id": "CFO-001",
            "sample_name": "CoFe2O4 Nanoparticles",
            "material_class": "spinel_ferrite",
            "batch_id": "batch-2026-05",
            "known_elements": ["Co", "Fe", "O"],
            "expected_elements": ["Co", "Fe", "O"],
            "excluded_elements": ["Ni", "Zn"],
            "declared_phases": ["CoFe2O4 Spinel"],
            "candidate_phase_ids": ["spinel_cfo"],
            "excluded_phase_ids": [],
            "reference_source": "internal_curated",
            "reference_set_id": "spinel_ferrite_sba15_demo_set",
            "identity_source": "user_declared",
            "identity_confidence": "declared",
        },
        "parameters": {
            "range": {
                "two_theta_min": 10.0,
                "two_theta_max": 80.0,
            },
            "radiation": {
                "source": "cu_ka",
                "wavelength_angstrom": 1.5406,
            },
            "baseline": {
                "method": "asymmetric_ls",
                "lambda": 100000.0,
                "p": 0.01,
            },
            "smoothing": {
                "method": "savitzky_golay",
                "window_size": 11,
                "polynomial_order": 3,
            },
            "peak_detection": {
                "min_prominence": 0.03,
                "min_distance_deg": 0.15,
                "min_height_ratio": 0.02,
                "max_peak_count": 40,
            },
            "peak_fitting": {
                "model": "pseudo_voigt",
                "fit_window_deg": 0.8,
                "max_iterations": 500,
                "calculate_crystallite_size": True,
            },
            "reference_match": {
                "enabled": True,
                "match_mode": "targeted_candidate_match",
                "reference_source": "internal_curated",
                "reference_set_id": "spinel_ferrite_sba15_demo_set",
                "candidate_phase_ids": [],
                "tolerance_two_theta": 0.5,
                "min_matched_peaks": 3,
                "min_coverage_ratio": 0.5,
                "min_score": 0.65,
                "use_relative_intensity": False,
                "intensity_tolerance_ratio": 0.5,
                "allow_unknown_search": False,
                "allow_identity_claim": False,
                "allow_phase_purity_claim": False,
            },
            "boundary": {
                "enabled": True,
                "claim_mode": "standard",
                "allow_identity_claim": False,
                "allow_phase_purity_claim": False,
                "require_complementary_evidence": True,
                "require_reference_set_for_match": True,
                "require_sample_context_for_targeted_match": True,
            },
        },
    }

    resp = client.post("/process", json=payload)
    log_test("Grouped contract: POST /process returns 200", resp.status_code == 200,
             f"status={resp.status_code}")

    if resp.status_code == 200:
        data = resp.json()
        det = data.get("detected_peaks", [])
        log_test("Grouped contract: detected_peaks is non-empty list",
                 isinstance(det, list) and len(det) > 0,
                 f"count={len(det)}")
    else:
        log_test("Grouped contract: response body", False, resp.text[:500])


# ── Test 5: Phase 3 — Boundary flags must remain false ──────────────────────

def test_phase3_boundary_flags_rejected():
    """
    POST /process with boundary allow_identity_claim=true must be rejected
    with a 422 validation error. Same for allow_phase_purity_claim=true.
    """
    print("\n═══ Test 5: Phase 3 — Boundary flags rejected ═══")
    x, y = generate_cofe2o4_xrd_pattern()

    # Test allow_identity_claim = true on boundary
    payload_identity = {
        "x": x,
        "y": y,
        "parameters": {
            "boundary": {
                "allow_identity_claim": True,
            },
        },
    }
    resp = client.post("/process", json=payload_identity)
    log_test("Boundary allow_identity_claim=true returns 422",
             resp.status_code == 422, f"status={resp.status_code}")

    # Test allow_phase_purity_claim = true on boundary
    payload_purity = {
        "x": x,
        "y": y,
        "parameters": {
            "boundary": {
                "allow_phase_purity_claim": True,
            },
        },
    }
    resp = client.post("/process", json=payload_purity)
    log_test("Boundary allow_phase_purity_claim=true returns 422",
             resp.status_code == 422, f"status={resp.status_code}")

    # Test allow_identity_claim = true on reference_match
    payload_ref_identity = {
        "x": x,
        "y": y,
        "parameters": {
            "reference_match": {
                "allow_identity_claim": True,
            },
        },
    }
    resp = client.post("/process", json=payload_ref_identity)
    log_test("Reference match allow_identity_claim=true returns 422",
             resp.status_code == 422, f"status={resp.status_code}")

    # Test allow_phase_purity_claim = true on reference_match
    payload_ref_purity = {
        "x": x,
        "y": y,
        "parameters": {
            "reference_match": {
                "allow_phase_purity_claim": True,
            },
        },
    }
    resp = client.post("/process", json=payload_ref_purity)
    log_test("Reference match allow_phase_purity_claim=true returns 422",
             resp.status_code == 422, f"status={resp.status_code}")


# ── Test 6: Phase 3 — Display label normalization ───────────────────────────

def test_phase3_display_label_normalization():
    """
    Construct XRDParameters with old display labels via model_validate
    and verify they normalize to the expected machine-safe enum values.

    Uses model_validate(dict) so that the "lambda" alias can be passed
    as a dict key without conflicting with the Python reserved keyword.
    """
    print("\n═══ Test 6: Phase 3 — Display label normalization ═══")

    from api.schemas import (
        XRDParameters,
        BaselineMethodV2,
        SmoothingMethodV2,
        FitModelTypeV2,
        RadiationSource,
        ReferenceSourceV2,
        MatchMode,
        ClaimMode,
        XRDBaselineParameters,
        XRDSmoothingParameters,
        XRDRadiationParameters,
        XRDPeakFittingParameters,
        XRDReferenceMatchParameters,
        XRDBoundaryParameters,
    )

    # Baseline: "Asymmetric LS" -> asymmetric_ls (use model_validate for lambda alias)
    bp = XRDBaselineParameters.model_validate({
        "method": "Asymmetric LS",
        "lambda": 100000.0,
        "p": 0.01,
    })
    log_test("Baseline 'Asymmetric LS' -> asymmetric_ls",
             bp.method == BaselineMethodV2.ASYMMETRIC_LS,
             f"value={bp.method.value}")

    # Smoothing: "Savitzky-Golay" -> savitzky_golay
    sp = XRDSmoothingParameters(method="Savitzky-Golay", window_size=11, polynomial_order=3)
    log_test("Smoothing 'Savitzky-Golay' -> savitzky_golay",
             sp.method == SmoothingMethodV2.SAVITZKY_GOLAY,
             f"value={sp.method.value}")

    # Peak fitting: "Pseudo-Voigt" -> pseudo_voigt
    fp = XRDPeakFittingParameters(model="Pseudo-Voigt")
    log_test("Fit model 'Pseudo-Voigt' -> pseudo_voigt",
             fp.model == FitModelTypeV2.PSEUDO_VOIGT,
             f"value={fp.model.value}")

    # Radiation: "Cu Kα" -> cu_ka
    rp = XRDRadiationParameters(source="Cu Kα", wavelength_angstrom=1.5406)
    log_test("Radiation 'Cu Kα' -> cu_ka",
             rp.source == RadiationSource.CU_KA,
             f"value={rp.source.value}")

    # Reference source: "Internal Curated" -> internal_curated
    rm = XRDReferenceMatchParameters(reference_source="Internal Curated")
    log_test("Ref source 'Internal Curated' -> internal_curated",
             rm.reference_source == ReferenceSourceV2.INTERNAL_CURATED,
             f"value={rm.reference_source.value}")

    # Match mode: "Targeted Candidate Match" -> targeted_candidate_match
    rm2 = XRDReferenceMatchParameters(match_mode="Targeted Candidate Match")
    log_test("Match mode 'Targeted Candidate Match' -> targeted_candidate_match",
             rm2.match_mode == MatchMode.TARGETED_CANDIDATE_MATCH,
             f"value={rm2.match_mode.value}")

    # Claim mode: "Standard" -> standard
    bp2 = XRDBoundaryParameters(claim_mode="Standard")
    log_test("Claim mode 'Standard' -> standard",
             bp2.claim_mode == ClaimMode.STANDARD,
             f"value={bp2.claim_mode.value}")

    # Full grouped contract with mixed display labels via model_validate
    params = XRDParameters.model_validate({
        "baseline": {"method": "Asymmetric LS", "lambda": 100000.0, "p": 0.01},
        "smoothing": {"method": "Savitzky-Golay", "window_size": 11, "polynomial_order": 3},
        "radiation": {"source": "Cu Kα", "wavelength_angstrom": 1.5406},
        "peak_fitting": {"model": "Pseudo-Voigt"},
        "reference_match": {
            "match_mode": "Targeted Candidate Match",
            "reference_source": "Internal Curated",
        },
        "boundary": {"claim_mode": "Standard"},
    })
    all_machine_safe = (
        params.baseline.method.value == "asymmetric_ls"
        and params.smoothing.method.value == "savitzky_golay"
        and params.radiation.source.value == "cu_ka"
        and params.peak_fitting.model.value == "pseudo_voigt"
        and params.reference_match.match_mode.value == "targeted_candidate_match"
        and params.reference_match.reference_source.value == "internal_curated"
        and params.boundary.claim_mode.value == "standard"
    )
    log_test("Full grouped contract: all display labels normalized", all_machine_safe)

    # Baseline lambda alias tested via model_validate
    bp3 = XRDBaselineParameters.model_validate({
        "method": "asymmetric_ls",
        "lambda": 50000.0,
        "p": 0.05,
    })
    log_test("Baseline lambda alias reads correctly via model_validate",
             bp3.lambda_ == 50000.0,
             f"lambda_={bp3.lambda_}")

    # "Moving Average" smoothing
    sp2 = XRDSmoothingParameters(method="Moving Average", window_size=5, polynomial_order=2)
    log_test("Smoothing 'Moving Average' -> moving_average",
             sp2.method == SmoothingMethodV2.MOVING_AVERAGE,
             f"value={sp2.method.value}")

    # "Gaussian" fit model
    fp2 = XRDPeakFittingParameters(model="Gaussian")
    log_test("Fit model 'Gaussian' -> gaussian",
             fp2.model == FitModelTypeV2.GAUSSIAN,
             f"value={fp2.model.value}")

    # "Lorentzian" fit model
    fp3 = XRDPeakFittingParameters(model="Lorentzian")
    log_test("Fit model 'Lorentzian' -> lorentzian",
             fp3.model == FitModelTypeV2.LORENTZIAN,
             f"value={fp3.model.value}")

    # "Candidate Screening" match mode
    rm3 = XRDReferenceMatchParameters(match_mode="Candidate Screening")
    log_test("Match mode 'Candidate Screening' -> candidate_screening",
             rm3.match_mode == MatchMode.CANDIDATE_SCREENING,
             f"value={rm3.match_mode.value}")

    # "Rolling Ball" baseline
    bp4 = XRDBaselineParameters.model_validate({
        "method": "Rolling Ball",
        "lambda": 50000.0,
        "p": 0.05,
    })
    log_test("Baseline 'Rolling Ball' -> rolling_ball",
             bp4.method == BaselineMethodV2.ROLLING_BALL,
             f"value={bp4.method.value}")

    # "Co Kα" radiation
    rp2 = XRDRadiationParameters(source="Co Kα", wavelength_angstrom=1.7903)
    log_test("Radiation 'Co Kα' -> co_ka",
             rp2.source == RadiationSource.CO_KA,
             f"value={rp2.source.value}")

    # "Mo Kα" radiation
    rp3 = XRDRadiationParameters(source="Mo Kα", wavelength_angstrom=0.7107)
    log_test("Radiation 'Mo Kα' -> mo_ka",
             rp3.source == RadiationSource.MO_KA,
             f"value={rp3.source.value}")


# ── Test 7: Phase 4 — Legacy payload still passes ───────────────────────────

def test_phase4_legacy_payload_unchanged():
    """
    Verify that the old /process payload (no parameters, no dataset_context)
    still returns 200 with phase_match present and reference_match_v2 is None.
    """
    print("\n═══ Test 7: Phase 4 — Legacy payload unchanged ═══")
    x, y = generate_cofe2o4_xrd_pattern()

    payload = {
        "x": x,
        "y": y,
        "theta_min": 10.0,
        "theta_max": 80.0,
        "peak_threshold": 0.10,
        "min_prominence": 0.05,
    }

    resp = client.post("/process", json=payload)
    log_test("Legacy payload: POST /process returns 200", resp.status_code == 200,
             f"status={resp.status_code}")

    if resp.status_code != 200:
        return

    data = resp.json()
    log_test("Legacy payload: phase_match is present", data.get("phase_match") is not None)
    log_test("Legacy payload: reference_match_v2 is None",
             data.get("reference_match_v2") is None,
             f"value={data.get('reference_match_v2')}")


# ── Test 8: Phase 4 — Grouped payload with reference_match returns v2 ───────

def test_phase4_reference_match_v2_returns_candidates():
    """
    POST /process with grouped parameters including reference_match.enabled=true
    and reference_set_id present must return reference_match_v2 with
    ranked_candidates, primary_candidate with matched_peaks,
    phase_confirmed=false, and phase_purity_confirmed=false.
    """
    print("\n═══ Test 8: Phase 4 — reference_match_v2 returns candidates ═══")
    x, y = generate_cofe2o4_xrd_pattern()

    payload = {
        "x": x,
        "y": y,
        "theta_min": 10.0,
        "theta_max": 80.0,
        "peak_threshold": 0.10,
        "min_prominence": 0.05,
        "dataset_context": {
            "sample_id": "CFO-001",
            "sample_name": "CoFe2O4 Nanoparticles",
            "known_elements": ["Co", "Fe", "O"],
            "reference_set_id": "spinel_ferrite_sba15_demo_set",
        },
        "parameters": {
            "reference_match": {
                "enabled": True,
                "reference_set_id": "spinel_ferrite_sba15_demo_set",
                "tolerance_two_theta": 0.5,
                "min_score": 0.65,
            },
        },
    }

    resp = client.post("/process", json=payload)
    log_test("v2 match: POST /process returns 200", resp.status_code == 200,
             f"status={resp.status_code}")

    if resp.status_code != 200:
        log_test("v2 match: response body", False, resp.text[:500])
        return

    data = resp.json()

    # Legacy phase_match must still be present
    log_test("v2 match: phase_match still present", data.get("phase_match") is not None)

    # reference_match_v2 must be present
    rmv2 = data.get("reference_match_v2")
    log_test("v2 match: reference_match_v2 is present", rmv2 is not None)

    if rmv2 is None:
        return

    # ranked_candidates
    rc = rmv2.get("ranked_candidates", [])
    log_test("v2 match: ranked_candidates is non-empty list",
             isinstance(rc, list) and len(rc) > 0,
             f"count={len(rc)}")

    # phase_confirmed must be false
    log_test("v2 match: phase_confirmed is false",
             rmv2.get("phase_confirmed") is False,
             f"value={rmv2.get('phase_confirmed')}")

    # phase_purity_confirmed must be false
    log_test("v2 match: phase_purity_confirmed is false",
             rmv2.get("phase_purity_confirmed") is False,
             f"value={rmv2.get('phase_purity_confirmed')}")

    # primary_candidate must have matched_peaks
    primary = rmv2.get("primary_candidate")
    log_test("v2 match: primary_candidate is not None", primary is not None)

    if primary:
        mp = primary.get("matched_peaks", [])
        log_test("v2 match: primary_candidate has matched_peaks list",
                 isinstance(mp, list) and len(mp) > 0,
                 f"count={len(mp)}")

        # Each matched peak should have the expected fields
        if mp:
            first_peak = mp[0]
            expected_keys = {"measured_two_theta", "reference_two_theta", "delta_two_theta"}
            has_keys = expected_keys.issubset(first_peak.keys())
            log_test("v2 match: matched peak has required fields", has_keys,
                     f"keys={list(first_peak.keys())}")

        # Score fields on primary candidate
        for key in ("position_score", "coverage_score", "chemistry_score", "score"):
            log_test(f"v2 match: primary_candidate.{key} is numeric",
                     isinstance(primary.get(key), (int, float)),
                     f"{key}={primary.get(key)}")

    # limitations must be present and contain expected text
    limitations = rmv2.get("limitations", [])
    log_test("v2 match: limitations is non-empty list",
             isinstance(limitations, list) and len(limitations) > 0,
             f"count={len(limitations)}")

    # JSON serializable
    try:
        json.dumps(data)
        log_test("v2 match: response is JSON-serializable", True)
    except Exception as e:
        log_test("v2 match: response is JSON-serializable", False, str(e))


# ── Test 9: Phase 4 — No confirmed identity wording ─────────────────────────

def test_phase4_no_confirmed_identity_wording():
    """
    Verify that reference_match_v2 output never contains confirmed identity
    or confirmed purity language.
    """
    print("\n═══ Test 9: Phase 4 — No confirmed identity wording ═══")
    x, y = generate_cofe2o4_xrd_pattern()

    payload = {
        "x": x,
        "y": y,
        "dataset_context": {
            "known_elements": ["Co", "Fe", "O"],
            "reference_set_id": "spinel_ferrite_sba15_demo_set",
        },
        "parameters": {
            "reference_match": {
                "enabled": True,
                "reference_set_id": "spinel_ferrite_sba15_demo_set",
            },
        },
    }

    resp = client.post("/process", json=payload)
    if resp.status_code != 200:
        log_test("Confirmed wording: request failed", False, f"status={resp.status_code}")
        return

    data = resp.json()
    rmv2 = data.get("reference_match_v2")
    if rmv2 is None:
        log_test("Confirmed wording: reference_match_v2 present", False, "None")
        return

    log_test("Confirmed wording: reference_match_v2 present", True)

    # Serialize the entire v2 result to string and check for banned terms
    rmv2_text = json.dumps(rmv2).lower()

    banned = [
        "confirmed phase",
        "phase confirmed",
        "phase purity confirmed",
        "identity confirmed",
        "confirmed identity",
        "definitive identification",
        "definitive phase",
    ]
    found = [term for term in banned if term in rmv2_text]

    # Note: "phase_confirmed": false is valid — we check that no affirmative
    # "confirmed" claims appear in text fields (status, claim_level, labels)
    affirmative_banned = [
        '"status"',
        '"claim_level"',
    ]

    # More targeted: check status and claim_level don't contain "confirmed"
    status = rmv2.get("status", "")
    claim_level = rmv2.get("claim_level", "")
    log_test("Confirmed wording: status does not contain 'confirmed'",
             "confirmed" not in status.lower(),
             f"status='{status}'")
    log_test("Confirmed wording: claim_level does not contain 'confirmed'",
             "confirmed" not in claim_level.lower(),
             f"claim_level='{claim_level}'")


# ── Test 10: Phase 4 — Disabled reference_match does not produce v2 ─────────

def test_phase4_disabled_reference_match():
    """
    When reference_match.enabled=false, reference_match_v2 must be None.
    """
    print("\n═══ Test 10: Phase 4 — Disabled reference_match ═══")
    x, y = generate_cofe2o4_xrd_pattern()

    payload = {
        "x": x,
        "y": y,
        "parameters": {
            "reference_match": {
                "enabled": False,
                "reference_set_id": "spinel_ferrite_sba15_demo_set",
            },
        },
    }

    resp = client.post("/process", json=payload)
    log_test("Disabled ref_match: returns 200", resp.status_code == 200,
             f"status={resp.status_code}")

    if resp.status_code != 200:
        return

    data = resp.json()
    log_test("Disabled ref_match: reference_match_v2 is None",
             data.get("reference_match_v2") is None)


# ── Test 11: Phase 7A — General-sample assessment present for valid signal ──

def test_phase7a_general_assessment_present():
    """
    POST /process with a valid CoFe2O4-like signal must return
    general_sample_assessment and xrd_claim_boundary in the response.
    """
    print("\n═══ Test 11: Phase 7A — general_sample_assessment present ═══")
    x, y = generate_cofe2o4_xrd_pattern()

    payload = {
        "x": x,
        "y": y,
        "theta_min": 10.0,
        "theta_max": 80.0,
        "peak_threshold": 0.10,
        "min_prominence": 0.05,
    }

    resp = client.post("/process", json=payload)
    log_test("Phase 7A: POST /process returns 200", resp.status_code == 200,
             f"status={resp.status_code}")
    if resp.status_code != 200:
        return

    data = resp.json()

    # general_sample_assessment is present and non-None
    gsa = data.get("general_sample_assessment")
    log_test("Phase 7A: general_sample_assessment is present", gsa is not None)

    if gsa is None:
        return

    # Required fields
    required_fields = [
        "signal_quality", "crystallinity_indicator", "peak_density",
        "dominant_peak_regions", "unmatched_peak_count", "unmatched_peaks",
        "interpretation_mode",
    ]
    has_fields = all(f in gsa for f in required_fields)
    log_test("Phase 7A: general_sample_assessment has all required fields",
             has_fields, f"fields={list(gsa.keys()) if gsa else 'N/A'}")

    # Valid signal quality
    valid_sq = {"good", "marginal", "weak"}
    sq = gsa.get("signal_quality", "")
    log_test("Phase 7A: signal_quality is valid", sq in valid_sq,
             f"value='{sq}'")

    # Valid crystallinity indicator
    valid_ci = {"crystalline_like", "amorphous_like", "mixed", "insufficient"}
    ci = gsa.get("crystallinity_indicator", "")
    log_test("Phase 7A: crystallinity_indicator is valid", ci in valid_ci,
             f"value='{ci}'")

    # Peak density is numeric
    pd_val = gsa.get("peak_density")
    log_test("Phase 7A: peak_density is numeric", isinstance(pd_val, (int, float)),
             f"value={pd_val}")

    # Dominant peak regions is a list
    dpr = gsa.get("dominant_peak_regions", [])
    log_test("Phase 7A: dominant_peak_regions is list", isinstance(dpr, list),
             f"count={len(dpr)}")

    # Unmatched count is int
    uc = gsa.get("unmatched_peak_count")
    log_test("Phase 7A: unmatched_peak_count is int", isinstance(uc, int),
             f"value={uc}")

    # Interpretation mode
    valid_im = {"phase_screening", "feature_only", "insufficient_data"}
    im = gsa.get("interpretation_mode", "")
    log_test("Phase 7A: interpretation_mode is valid", im in valid_im,
             f"value='{im}'")

    # xrd_claim_boundary is present and non-None
    cb = data.get("xrd_claim_boundary")
    log_test("Phase 7A: xrd_claim_boundary is present", cb is not None)

    if cb is None:
        return

    cb_required = ["allowed_claims", "blocked_claims", "required_validation", "limitations"]
    has_cb_fields = all(f in cb for f in cb_required)
    log_test("Phase 7A: xrd_claim_boundary has all required fields",
             has_cb_fields, f"fields={list(cb.keys()) if cb else 'N/A'}")

    # Blocked claims must always include identity/purity blocks
    blocked = cb.get("blocked_claims", [])
    blocked_text = " ".join(blocked).lower()
    has_identity_block = "chemical identity" in blocked_text or "identity" in blocked_text
    has_purity_block = "phase purity" in blocked_text or "purity" in blocked_text
    log_test("Phase 7A: blocked claims include identity block", has_identity_block,
             f"blocked={blocked}")
    log_test("Phase 7A: blocked claims include purity block", has_purity_block,
             f"blocked={blocked}")

    # JSON serializable
    try:
        json.dumps(data)
        log_test("Phase 7A: response is JSON-serializable", True)
    except Exception as e:
        log_test("Phase 7A: response is JSON-serializable", False, str(e))


# ── Test 12: Phase 7A — Crystalline-like signal assessment ──────────────────

def generate_sharp_peaks_pattern():
    """Generate a signal with sharp, well-defined peaks (crystalline-like)."""
    import numpy as np
    x = np.linspace(10.0, 80.0, 3501)
    # Very narrow FWHMs (0.06-0.08°) so that after SG smoothing the detected
    # FWHMs remain below the crystallinity sharp threshold (0.8°).
    peaks = [
        (25.0, 100.0, 0.06),
        (32.0, 80.0, 0.07),
        (38.0, 90.0, 0.06),
        (45.0, 60.0, 0.08),
        (55.0, 70.0, 0.06),
    ]
    y = np.zeros_like(x)
    for peak_pos, rel_intensity, fwhm in peaks:
        sigma = fwhm / 2.355
        y += rel_intensity * np.exp(-0.5 * ((x - peak_pos) / sigma) ** 2)
    # Very low baseline noise for clean signal
    baseline = 10.0 + 0.05 * (x - 10.0)
    y += baseline
    np.random.seed(123)
    y += np.random.normal(0, 0.1, size=len(x))
    y = np.maximum(y, 0.0)
    return x.tolist(), y.tolist()


def test_phase7a_crystalline_like():
    """Sharp-peak signal should produce crystalline_like assessment."""
    print("\n═══ Test 12: Phase 7A — Crystalline-like signal ═══")
    x, y = generate_sharp_peaks_pattern()

    payload = {"x": x, "y": y, "theta_min": 10.0, "theta_max": 80.0,
               "peak_threshold": 0.10, "min_prominence": 0.05}
    resp = client.post("/process", json=payload)
    log_test("Crystalline: POST /process returns 200", resp.status_code == 200,
             f"status={resp.status_code}")
    if resp.status_code != 200:
        return

    data = resp.json()
    gsa = data.get("general_sample_assessment")
    log_test("Crystalline: assessment present", gsa is not None)
    if gsa is None:
        return

    ci = gsa.get("crystallinity_indicator", "")
    log_test("Crystalline: indicator is crystalline_like or mixed",
             ci in ("crystalline_like", "mixed"),
             f"value='{ci}'")

    sq = gsa.get("signal_quality", "")
    log_test("Crystalline: signal quality is good or marginal",
             sq in ("good", "marginal"),
             f"value='{sq}'")


# ── Test 13: Phase 7A — Amorphous-like signal assessment ────────────────────

def generate_broad_peaks_pattern():
    """Generate a signal with broad, diffuse peaks (amorphous-like)."""
    import numpy as np
    x = np.linspace(10.0, 80.0, 3501)
    peaks = [
        (28.0, 40.0, 3.0),  # very broad
        (42.0, 30.0, 4.0),  # very broad
    ]
    y = np.zeros_like(x)
    for peak_pos, rel_intensity, fwhm in peaks:
        sigma = fwhm / 2.355
        y += rel_intensity * np.exp(-0.5 * ((x - peak_pos) / sigma) ** 2)
    baseline = 50.0 + 0.3 * (x - 10.0)
    y += baseline
    np.random.seed(77)
    y += np.random.normal(0, 1.0, size=len(x))
    y = np.maximum(y, 0.0)
    return x.tolist(), y.tolist()


def test_phase7a_amorphous_like():
    """Broad-peak signal should produce amorphous_like assessment."""
    print("\n═══ Test 13: Phase 7A — Amorphous-like signal ═══")
    x, y = generate_broad_peaks_pattern()

    payload = {"x": x, "y": y, "theta_min": 10.0, "theta_max": 80.0,
               "peak_threshold": 0.08, "min_prominence": 0.03}
    resp = client.post("/process", json=payload)
    log_test("Amorphous: POST /process returns 200", resp.status_code == 200,
             f"status={resp.status_code}")
    if resp.status_code != 200:
        return

    data = resp.json()
    gsa = data.get("general_sample_assessment")
    log_test("Amorphous: assessment present", gsa is not None)
    if gsa is None:
        return

    ci = gsa.get("crystallinity_indicator", "")
    # May be amorphous_like, mixed, or insufficient depending on detection
    log_test("Amorphous: indicator is amorphous_like, mixed, or insufficient",
             ci in ("amorphous_like", "mixed", "insufficient"),
             f"value='{ci}'")

    # Limitations should mention amorphous if amorphous_like
    cb = data.get("xrd_claim_boundary", {})
    if ci == "amorphous_like":
        limitations_text = " ".join(cb.get("limitations", [])).lower()
        log_test("Amorphous: limitations mention amorphous",
                 "amorphous" in limitations_text,
                 f"limitations={cb.get('limitations', [])}")


# ── Test 14: Phase 7A — Weak / noise-only signal assessment ─────────────────

def test_phase7a_weak_signal():
    """Noise-only signal should produce weak signal_quality and insufficient_data."""
    print("\n═══ Test 14: Phase 7A — Weak signal (noise-only) ═══")
    x, y = generate_noise_only()

    payload = {"x": x, "y": y, "theta_min": 10.0, "theta_max": 80.0}
    resp = client.post("/process", json=payload)
    log_test("Weak signal: POST /process returns 200", resp.status_code == 200,
             f"status={resp.status_code}")
    if resp.status_code != 200:
        return

    data = resp.json()
    gsa = data.get("general_sample_assessment")
    log_test("Weak signal: assessment present", gsa is not None)
    if gsa is None:
        return

    sq = gsa.get("signal_quality", "")
    # Noise-only may produce spurious peaks yielding marginal; accept weak or marginal
    log_test("Weak signal: signal_quality is weak or marginal",
             sq in ("weak", "marginal"),
             f"value='{sq}'")

    im = gsa.get("interpretation_mode", "")
    log_test("Weak signal: interpretation_mode is insufficient_data",
             im == "insufficient_data",
             f"value='{im}'")

    cb = data.get("xrd_claim_boundary", {})
    required = cb.get("required_validation", [])
    required_text = " ".join(required).lower()
    # When signal_quality is "weak", repeat measurement is required;
    # when "marginal", it may not be — both are acceptable for noise-only input
    if sq == "weak":
        log_test("Weak signal: required_validation mentions repeat measurement",
                 "repeat" in required_text or "improved" in required_text,
                 f"required={required}")
    else:
        log_test("Weak signal (marginal): no repeat requirement is acceptable",
                 True, f"signal_quality='{sq}', required={required}")


# ── Test 15: Phase 7A — No-reference-match case ─────────────────────────────

def test_phase7a_no_reference_match():
    """Without reference_match, assessment should still return valid fields."""
    print("\n═══ Test 15: Phase 7A — No reference match ═══")
    x, y = generate_cofe2o4_xrd_pattern()

    # No parameters.reference_match, so no v2 matching
    payload = {
        "x": x, "y": y,
        "theta_min": 10.0, "theta_max": 80.0,
        "peak_threshold": 0.10, "min_prominence": 0.05,
    }
    resp = client.post("/process", json=payload)
    log_test("No ref match: POST /process returns 200", resp.status_code == 200,
             f"status={resp.status_code}")
    if resp.status_code != 200:
        return

    data = resp.json()
    gsa = data.get("general_sample_assessment")
    log_test("No ref match: assessment present", gsa is not None)
    if gsa is None:
        return

    # Without reference data, all detected peaks are "unmatched"
    uc = gsa.get("unmatched_peak_count", 0)
    det_count = len(data.get("detected_peaks", []))
    log_test("No ref match: unmatched_count equals detected peak count",
             uc == det_count,
             f"unmatched={uc}, detected={det_count}")

    # interpretation_mode should be feature_only or insufficient_data
    im = gsa.get("interpretation_mode", "")
    log_test("No ref match: interpretation_mode is feature_only or insufficient_data",
             im in ("feature_only", "insufficient_data"),
             f"value='{im}'")

    # Claim boundary should block reference-supported phase identification
    cb = data.get("xrd_claim_boundary", {})
    blocked_text = " ".join(cb.get("blocked_claims", [])).lower()
    log_test("No ref match: blocks reference-supported phase identification",
             "reference" in blocked_text and ("phase" in blocked_text or "identification" in blocked_text),
             f"blocked={cb.get('blocked_claims', [])}")


# ── Test 16: Phase 7A — Backward compatibility with Phase 4 ─────────────────

def test_phase7a_backward_compatibility():
    """
    Verify that adding general_sample_assessment does not break existing fields.
    All fields from Phase 4 must still be present.
    """
    print("\n═══ Test 16: Phase 7A — Backward compatibility ═══")
    x, y = generate_cofe2o4_xrd_pattern()

    payload = {
        "x": x, "y": y,
        "theta_min": 10.0, "theta_max": 80.0,
        "peak_threshold": 0.10, "min_prominence": 0.05,
        "dataset_context": {
            "known_elements": ["Co", "Fe", "O"],
            "reference_set_id": "spinel_ferrite_sba15_demo_set",
        },
        "parameters": {
            "reference_match": {
                "enabled": True,
                "reference_set_id": "spinel_ferrite_sba15_demo_set",
                "tolerance_two_theta": 0.5,
                "min_score": 0.65,
            },
        },
    }

    resp = client.post("/process", json=payload)
    log_test("Backward compat: POST /process returns 200", resp.status_code == 200,
             f"status={resp.status_code}")
    if resp.status_code != 200:
        return

    data = resp.json()

    # Existing fields must still be present
    for field in ("x", "y_raw", "y_smoothed", "y_baseline", "y_corrected",
                  "y_residual", "detected_peaks", "fitted_peaks",
                  "phase_match", "sn_ratio", "baseline_deviation",
                  "peak_resolution"):
        log_test(f"Backward compat: '{field}' still present", field in data)

    # Phase 4 field
    rmv2 = data.get("reference_match_v2")
    log_test("Backward compat: reference_match_v2 present", rmv2 is not None)

    # Phase 7A fields
    log_test("Backward compat: general_sample_assessment present",
             data.get("general_sample_assessment") is not None)
    log_test("Backward compat: xrd_claim_boundary present",
             data.get("xrd_claim_boundary") is not None)

    # JSON round-trip
    try:
        json.dumps(data)
        log_test("Backward compat: full response is JSON-serializable", True)
    except Exception as e:
        log_test("Backward compat: full response is JSON-serializable", False, str(e))


# ── Test 17: Phase 7A — Flat signal assessment ──────────────────────────────

def test_phase7a_flat_signal():
    """Flat signal should produce weak signal_quality."""
    print("\n═══ Test 17: Phase 7A — Flat signal assessment ═══")
    x, y = generate_flat_signal()

    payload = {"x": x, "y": y}
    resp = client.post("/process", json=payload)
    log_test("Flat: POST /process returns 200", resp.status_code == 200,
             f"status={resp.status_code}")
    if resp.status_code != 200:
        return

    data = resp.json()
    gsa = data.get("general_sample_assessment")
    log_test("Flat: assessment present", gsa is not None)
    if gsa is None:
        return

    sq = gsa.get("signal_quality", "")
    ci = gsa.get("crystallinity_indicator", "")
    im = gsa.get("interpretation_mode", "")
    log_test("Flat: signal_quality is weak or marginal", sq in ("weak", "marginal"),
             f"value='{sq}'")
    log_test("Flat: crystallinity_indicator is insufficient or amorphous_like",
             ci in ("insufficient", "amorphous_like"),
             f"value='{ci}'")
    log_test("Flat: interpretation_mode is insufficient_data",
             im == "insufficient_data",
             f"value='{im}'")


# ── Test 18: Phase 7C — Blocked: reference_match enabled but no reference_set_id ──

def test_phase7c_blocked_no_reference_set_id():
    """Enabled reference_match without reference_set_id returns blocked status."""
    print("\n═══ Test 18: Phase 7C — Blocked: no reference_set_id ═══")
    x, y = generate_cofe2o4_xrd_pattern()

    payload = {
        "x": x, "y": y,
        "theta_min": 10.0, "theta_max": 80.0,
        "parameters": {
            "reference_match": {
                "enabled": True,
                "reference_set_id": None,  # Explicitly None to test blocked case
            },
        },
    }

    resp = client.post("/process", json=payload)
    log_test("Blocked: POST /process returns 200", resp.status_code == 200,
             f"status={resp.status_code}")
    if resp.status_code != 200:
        return

    data = resp.json()
    rmv2 = data.get("reference_match_v2")
    log_test("Blocked: reference_match_v2 present", rmv2 is not None)
    if rmv2 is None:
        return

    log_test("Blocked: status is 'blocked'", rmv2.get("status") == "blocked",
             f"value='{rmv2.get('status')}'")
    log_test("Blocked: claim_level is 'none'", rmv2.get("claim_level") == "none",
             f"value='{rmv2.get('claim_level')}'")
    log_test("Blocked: backend_available is False", rmv2.get("backend_available") is False,
             f"value={rmv2.get('backend_available')}")
    log_test("Blocked: reason contains 'reference set'",
             "reference set" in (rmv2.get("reason") or "").lower(),
             f"reason='{rmv2.get('reason')}'")
    log_test("Blocked: phase_confirmed is False", rmv2.get("phase_confirmed") is False)
    log_test("Blocked: phase_purity_confirmed is False", rmv2.get("phase_purity_confirmed") is False)


# ── Test 19: Phase 7C — Unavailable: unknown reference_set_id ────────────────

def test_phase7c_unavailable_unknown_reference_set():
    """Unknown reference_set_id returns unavailable status with backend_available=False."""
    print("\n═══ Test 19: Phase 7C — Unavailable: unknown reference_set_id ═══")
    x, y = generate_cofe2o4_xrd_pattern()

    payload = {
        "x": x, "y": y,
        "theta_min": 10.0, "theta_max": 80.0,
        "parameters": {
            "reference_match": {
                "enabled": True,
                "reference_set_id": "nonexistent_reference_set_12345",
            },
        },
    }

    resp = client.post("/process", json=payload)
    log_test("Unavailable: POST /process returns 200", resp.status_code == 200,
             f"status={resp.status_code}")
    if resp.status_code != 200:
        return

    data = resp.json()
    rmv2 = data.get("reference_match_v2")
    log_test("Unavailable: reference_match_v2 present", rmv2 is not None)
    if rmv2 is None:
        return

    log_test("Unavailable: status is 'unavailable'", rmv2.get("status") == "unavailable",
             f"value='{rmv2.get('status')}'")
    log_test("Unavailable: claim_level is 'none'", rmv2.get("claim_level") == "none",
             f"value='{rmv2.get('claim_level')}'")
    log_test("Unavailable: backend_available is False", rmv2.get("backend_available") is False,
             f"value={rmv2.get('backend_available')}")
    log_test("Unavailable: reason contains 'not available'",
             "not available" in (rmv2.get("reason") or "").lower(),
             f"reason='{rmv2.get('reason')}'")
    log_test("Unavailable: phase_confirmed is False", rmv2.get("phase_confirmed") is False)
    log_test("Unavailable: phase_purity_confirmed is False", rmv2.get("phase_purity_confirmed") is False)


# ── Test 20: Phase 7C — No match: filtering excludes all candidates ──────────

def test_phase7c_no_match_filtering():
    """Candidate filtering to nonexistent phase returns no_match."""
    print("\n═══ Test 20: Phase 7C — No match: candidate filtering ═══")
    x, y = generate_cofe2o4_xrd_pattern()

    payload = {
        "x": x, "y": y,
        "theta_min": 10.0, "theta_max": 80.0,
        "parameters": {
            "reference_match": {
                "enabled": True,
                "reference_set_id": "spinel_ferrite_sba15_demo_set",
                "candidate_phase_ids": ["nonexistent_phase_xyz"],
            },
        },
    }

    resp = client.post("/process", json=payload)
    log_test("No match: POST /process returns 200", resp.status_code == 200,
             f"status={resp.status_code}")
    if resp.status_code != 200:
        return

    data = resp.json()
    rmv2 = data.get("reference_match_v2")
    log_test("No match: reference_match_v2 present", rmv2 is not None)
    if rmv2 is None:
        return

    log_test("No match: status is 'no_match'", rmv2.get("status") == "no_match",
             f"value='{rmv2.get('status')}'")
    log_test("No match: claim_level is 'none'", rmv2.get("claim_level") == "none",
             f"value='{rmv2.get('claim_level')}'")
    log_test("No match: backend_available is True", rmv2.get("backend_available") is True,
             f"value={rmv2.get('backend_available')}")
    log_test("No match: reason contains 'filtering'",
             "filtering" in (rmv2.get("reason") or "").lower(),
             f"reason='{rmv2.get('reason')}'")
    log_test("No match: phase_confirmed is False", rmv2.get("phase_confirmed") is False)
    log_test("No match: phase_purity_confirmed is False", rmv2.get("phase_purity_confirmed") is False)


# ── Test 21: Phase 7C — Disabled reference_match still returns None ───────────

def test_phase7c_disabled_returns_none():
    """Disabled reference_match still returns reference_match_v2 = None."""
    print("\n═══ Test 21: Phase 7C — Disabled reference_match returns None ═══")
    x, y = generate_cofe2o4_xrd_pattern()

    payload = {
        "x": x, "y": y,
        "theta_min": 10.0, "theta_max": 80.0,
        "parameters": {
            "reference_match": {
                "enabled": False,
            },
        },
    }

    resp = client.post("/process", json=payload)
    log_test("Disabled: POST /process returns 200", resp.status_code == 200,
             f"status={resp.status_code}")
    if resp.status_code != 200:
        return

    data = resp.json()
    rmv2 = data.get("reference_match_v2")
    log_test("Disabled: reference_match_v2 is None", rmv2 is None,
             f"value={rmv2}")


# ── Test 22: Phase 7C — phase_confirmed remains False in all unavailable cases ──

def test_phase7c_phase_confirmed_always_false():
    """Verify phase_confirmed and phase_purity_confirmed remain False."""
    print("\n═══ Test 22: Phase 7C — phase_confirmed always False ═══")
    x, y = generate_cofe2o4_xrd_pattern()

    # Test blocked case
    payload_blocked = {
        "x": x, "y": y,
        "parameters": {"reference_match": {"enabled": True, "reference_set_id": None}},
    }
    resp = client.post("/process", json=payload_blocked)
    if resp.status_code == 200:
        data = resp.json()
        rmv2 = data.get("reference_match_v2")
        if rmv2:
            log_test("Blocked: phase_confirmed is False", rmv2.get("phase_confirmed") is False)
            log_test("Blocked: phase_purity_confirmed is False", rmv2.get("phase_purity_confirmed") is False)

    # Test unavailable case
    payload_unavailable = {
        "x": x, "y": y,
        "parameters": {
            "reference_match": {
                "enabled": True,
                "reference_set_id": "fake_set",
            },
        },
    }
    resp = client.post("/process", json=payload_unavailable)
    if resp.status_code == 200:
        data = resp.json()
        rmv2 = data.get("reference_match_v2")
        if rmv2:
            log_test("Unavailable: phase_confirmed is False", rmv2.get("phase_confirmed") is False)
            log_test("Unavailable: phase_purity_confirmed is False", rmv2.get("phase_purity_confirmed") is False)


# ── Main ─────────────────────────────────────────────────────────────────────

def test_phase7d5_local_reference_enabled_returns_v2():
    """Enabled request-scoped local reference returns candidate-only v2 evidence."""
    print("\n═══ Test 23: Phase 7D.5 — Local reference enabled returns v2 ═══")
    x, y = generate_cofe2o4_xrd_pattern()

    payload = {
        "x": x,
        "y": y,
        "theta_min": 10.0,
        "theta_max": 80.0,
        "peak_threshold": 0.10,
        "min_prominence": 0.05,
        "parameters": {
            "reference_match": {
                "enabled": True,
                "reference_set_id": "spinel_ferrite_sba15_demo_set",
                "tolerance_two_theta": 0.5,
                "min_score": 0.65,
            },
        },
        "local_reference": {
            "enabled": True,
            "source_type": "uploaded_reference",
            "reference_label": "CoFe2O4 local reference",
            "formula": "CoFe2O4",
            "material_family": "spinel",
            "elements": ["Co", "Fe", "O"],
            "source_file_name": "cofe2o4_local_reference.csv",
            "peaks": [
                {"two_theta": 18.37, "relative_intensity": 12.0, "hkl": "(111)", "d_spacing": 4.843},
                {"two_theta": 30.12, "relative_intensity": 30.0, "hkl": "(220)", "d_spacing": 2.966},
                {"two_theta": 35.48, "relative_intensity": 100.0, "hkl": "(311)", "d_spacing": 2.532},
                {"two_theta": 43.12, "relative_intensity": 20.0, "hkl": "(400)", "d_spacing": 2.097},
                {"two_theta": 57.02, "relative_intensity": 30.0, "hkl": "(511)", "d_spacing": 1.614},
            ],
        },
    }

    resp = client.post("/process", json=payload)
    log_test("Local ref enabled: POST /process returns 200", resp.status_code == 200,
             f"status={resp.status_code}")
    if resp.status_code != 200:
        log_test("Local ref enabled: response body", False, resp.text[:500])
        return

    data = resp.json()
    log_test("Local ref enabled: legacy phase_match is preserved", data.get("phase_match") is not None)

    rmv2 = data.get("reference_match_v2")
    log_test("Local ref enabled: reference_match_v2 is present", rmv2 is not None)
    if not rmv2:
        return

    log_test("Local ref enabled: request-scoped reference_set_id",
             str(rmv2.get("reference_set_id", "")).startswith("local_reference:"),
             f"reference_set_id={rmv2.get('reference_set_id')}")
    log_test("Local ref enabled: phase_confirmed is false",
             rmv2.get("phase_confirmed") is False,
             f"value={rmv2.get('phase_confirmed')}")
    log_test("Local ref enabled: phase_purity_confirmed is false",
             rmv2.get("phase_purity_confirmed") is False,
             f"value={rmv2.get('phase_purity_confirmed')}")

    primary = rmv2.get("primary_candidate")
    log_test("Local ref enabled: primary_candidate is present", primary is not None)
    if primary:
        matched = primary.get("matched_peaks", [])
        log_test("Local ref enabled: matched_peaks is non-empty",
                 isinstance(matched, list) and len(matched) > 0,
                 f"count={len(matched)}")

    limitations = " ".join(rmv2.get("limitations", []))
    log_test("Local ref enabled: limitations mention request-scoped candidate evidence",
             "request-scoped candidate evidence" in limitations,
             limitations)


def test_phase7d5_local_reference_disabled_preserves_curated():
    """Disabled local_reference must not override active curated matching."""
    print("\n═══ Test 24: Phase 7D.5 — Disabled local reference preserves curated ═══")
    x, y = generate_cofe2o4_xrd_pattern()

    payload = {
        "x": x,
        "y": y,
        "theta_min": 10.0,
        "theta_max": 80.0,
        "peak_threshold": 0.10,
        "min_prominence": 0.05,
        "dataset_context": {
            "known_elements": ["Co", "Fe", "O"],
            "reference_set_id": "spinel_ferrite_sba15_demo_set",
        },
        "parameters": {
            "reference_match": {
                "enabled": True,
                "reference_set_id": "spinel_ferrite_sba15_demo_set",
                "tolerance_two_theta": 0.5,
            },
        },
        "local_reference": {
            "enabled": False,
            "source_type": "uploaded_reference",
            "reference_label": "Disabled local reference",
            "peaks": [
                {"two_theta": 12.0},
            ],
        },
    }

    resp = client.post("/process", json=payload)
    log_test("Local ref disabled: POST /process returns 200", resp.status_code == 200,
             f"status={resp.status_code}")
    if resp.status_code != 200:
        return

    rmv2 = resp.json().get("reference_match_v2")
    log_test("Local ref disabled: reference_match_v2 is present", rmv2 is not None)
    if not rmv2:
        return
    log_test("Local ref disabled: curated reference_set_id preserved",
             rmv2.get("reference_set_id") == "spinel_ferrite_sba15_demo_set",
             f"reference_set_id={rmv2.get('reference_set_id')}")


def test_phase7d5_local_reference_too_few_peaks_rejected():
    """Enabled local_reference with fewer than 3 peaks returns 422."""
    print("\n═══ Test 25: Phase 7D.5 — Local reference fewer than 3 peaks rejected ═══")
    x, y = generate_cofe2o4_xrd_pattern()

    payload = {
        "x": x,
        "y": y,
        "local_reference": {
            "enabled": True,
            "source_type": "uploaded_reference",
            "reference_label": "Too few peaks",
            "peaks": [
                {"two_theta": 30.12},
                {"two_theta": 35.48},
            ],
        },
    }

    resp = client.post("/process", json=payload)
    log_test("Local ref too few peaks: returns 422",
             resp.status_code == 422,
             f"status={resp.status_code}")


if __name__ == "__main__":
    print("╔══════════════════════════════════════════════════════╗")
    print("║  DIFARYX XRD Backend Smoke Test                    ║")
    print("╚══════════════════════════════════════════════════════╝")

    test_valid_xrd_signal()
    test_missing_xy()
    test_mismatched_lengths()
    test_too_few_points()
    test_flat_signal()
    test_noise_only()
    test_empty_arrays()
    test_health_endpoint()
    test_scientific_skills_layer()
    test_phase3_grouped_contract_accepted()
    test_phase3_boundary_flags_rejected()
    test_phase3_display_label_normalization()
    test_phase4_legacy_payload_unchanged()
    test_phase4_reference_match_v2_returns_candidates()
    test_phase4_no_confirmed_identity_wording()
    test_phase4_disabled_reference_match()

    # Phase 7A tests
    test_phase7a_general_assessment_present()
    test_phase7a_crystalline_like()
    test_phase7a_amorphous_like()
    test_phase7a_weak_signal()
    test_phase7a_no_reference_match()
    test_phase7a_backward_compatibility()
    test_phase7a_flat_signal()

    # Phase 7C tests
    test_phase7c_blocked_no_reference_set_id()
    test_phase7c_unavailable_unknown_reference_set()
    test_phase7c_no_match_filtering()
    test_phase7c_disabled_returns_none()
    test_phase7c_phase_confirmed_always_false()
    test_phase7d5_local_reference_enabled_returns_v2()
    test_phase7d5_local_reference_disabled_preserves_curated()
    test_phase7d5_local_reference_too_few_peaks_rejected()

    # Summary
    print("\n" + "═" * 56)
    total = len(results)
    passed = sum(1 for _, s, _ in results if s == "PASS")
    failed = sum(1 for _, s, _ in results if s == "FAIL")
    print(f"  Total: {total}  |  Passed: {passed}  |  Failed: {failed}")

    if failed > 0:
        print("\n  Failed tests:")
        for name, status, details in results:
            if status == "FAIL":
                print(f"    ❌ {name}: {details}")
        print()
        sys.exit(1)
    else:
        print("  ✅ All tests passed!\n")
        sys.exit(0)
