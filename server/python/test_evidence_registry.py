"""
DIFARYX Evidence Registry Smoke Test.

Tests the Evidence Registry API endpoints:
  1. POST /evidence — Create a generic evidence record
  2. GET /evidence/{evidence_id} — Retrieve a single record
  3. GET /projects/{project_id}/evidence — List all project evidence
  4. GET /projects/{project_id}/evidence/latest — Latest evidence (with ?technique=)
  5. GET /projects/{project_id}/evidence/summary — Aggregated summary
  6. GET /projects/{project_id}/agent-context — Agent-ready context
  7. POST /evidence/ingest/xrd — Ingest XRD result as evidence
  8. Edge cases — 404s, empty projects, bounded language enforcement

Run:
    python test_evidence_registry.py
"""

import json
import os
import sys
import uuid

from fastapi.testclient import TestClient

# Ensure server/python is on sys.path
_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)

from api.gateway import app

client = TestClient(app)

# ── Static XRD-like result dict ─────────────────────────────────────────────
# This is a representative XRD pipeline output dict.  The evidence registry
# smoke test must NOT re-run the actual XRD pipeline; the normalizer accepts
# an already-completed result dict.

STATIC_XRD_RESULT = {
    "x": [10.0, 10.02, 10.04],
    "y_raw": [100.0, 101.0, 99.0],
    "y_smoothed": [100.1, 100.8, 99.5],
    "y_baseline": [50.0, 50.1, 50.2],
    "y_corrected": [50.1, 50.7, 49.3],
    "y_residual": [0.0, 0.1, -0.1],
    "detected_peaks": [
        {
            "position": 35.48,
            "intensity": 100.0,
            "index": 1274,
            "prominence": 0.85,
            "fwhm": 0.35,
        },
        {
            "position": 30.12,
            "intensity": 30.0,
            "index": 1006,
            "prominence": 0.42,
            "fwhm": 0.30,
        },
    ],
    "fitted_peaks": [
        {
            "center": 35.48,
            "amplitude": 98.5,
            "fwhm": 0.34,
            "area": 35.2,
            "model_type": "Pseudo-Voigt",
            "residual_rms": 0.012,
            "crystallite_size": None,
        },
        {
            "center": 30.12,
            "amplitude": 29.3,
            "fwhm": 0.28,
            "area": 8.7,
            "model_type": "Pseudo-Voigt",
            "residual_rms": 0.009,
            "crystallite_size": None,
        },
    ],
    "phase_match": {
        "primary_phase": "CoFe2O4",
        "matched_peaks": [
            {
                "measured_center": 35.48,
                "reference_marker": {
                    "hkl": "(311)",
                    "d_spacing": 2.524,
                    "position_2theta": 35.43,
                    "relative_intensity": 100.0,
                    "phase_label": "CoFe2O4",
                },
                "delta_2theta": 0.05,
                "confidence": 0.95,
                "db_source": "ICSD",
            },
        ],
        "db_source": "ICSD",
        "catalog_id": "ICSD-12345",
        "summary": "Primary phase indication: CoFe2O4 spinel (ICSD-12345).",
    },
    "sn_ratio": 42.5,
    "baseline_deviation": 0.03,
    "peak_resolution": "high-resolution",
}


# ── Helpers ──────────────────────────────────────────────────────────────────


def make_evidence_create_request(project_id="proj-smoke-001"):
    """Build a minimal EvidenceCreateRequest payload."""
    return {
        "project_id": project_id,
        "technique": "XRD",
        "skill_id": "xrd-science-skill",
        "skill_label": "XRD Science Skill",
        "input_reference": "abc123" * 10 + "abcd",  # 64 hex chars
        "processing_summary": "Baseline: Asymmetric LS; Smoothing: Savitzky-Golay; Fit: Pseudo-Voigt; DB: ICSD.",
        "scientific_observations": [
            "Detected 8 peaks in the 2\u03b8 range [10.0\u00b0, 80.0\u00b0].",
            "Phase match identification suggests CoFe2O4 in ICSD catalog.",
        ],
        "claim_boundaries": [
            "Phase indication based on reference matching; not phase-purity confirmation.",
            "Phase-purity confirmation requires additional validation.",
        ],
        "validation_gaps": [
            "Bulk crystallography cannot resolve surface oxidation states.",
        ],
        "agent_ready_summary": (
            "XRD analysis resolved 8 fitted peaks. Phase matching yields a "
            "reference-supported phase indication for CoFe2O4. "
            "Phase-purity confirmation requires additional validation."
        ),
        "raw_result": {"test": True},
        "provenance": {"source": "smoke-test"},
        "sample_id": "CoFe2O4-pellet-A",
        "source_file": "cofe2o4_demo.xy",
        "validation_status": "reviewed",
        "agent_readiness": True,
        "tags": ["demo", "spinel"],
    }


# ── Test Results Tracking ────────────────────────────────────────────────────

results = []


def log_test(name, passed, details=""):
    status = "PASS" if passed else "FAIL"
    results.append((name, status, details))
    icon = "\u2705" if passed else "\u274c"
    print(f"  {icon} {name}" + (f" \u2014 {details}" if details else ""))


# ── Test 1: POST /evidence — Create generic evidence ────────────────────────

def test_create_evidence():
    print("\n\u2550\u2550\u2550 Test 1: POST /evidence \u2014 Create Generic Evidence \u2550\u2550\u2550")

    payload = make_evidence_create_request()
    resp = client.post("/evidence", json=payload)
    log_test("POST /evidence returns 201", resp.status_code == 201,
             f"status={resp.status_code}")

    if resp.status_code != 201:
        log_test("Response body", False, resp.text[:300])
        return None

    data = resp.json()

    # evidence_id is valid UUIDv4
    ev_id = data.get("evidence_id")
    is_uuid = False
    try:
        uuid.UUID(ev_id, version=4)
        is_uuid = True
    except (ValueError, TypeError):
        pass
    log_test("evidence_id is UUIDv4", is_uuid, f"value={ev_id}")

    # created_at is ISO UTC
    created = data.get("created_at", "")
    log_test("created_at is ISO UTC", created.endswith("Z") and "T" in created,
             f"value={created}")

    # technique preserved
    log_test("technique is XRD", data.get("technique") == "XRD",
             f"value={data.get('technique')}")

    # project_id preserved
    log_test("project_id preserved", data.get("project_id") == "proj-smoke-001",
             f"value={data.get('project_id')}")

    # JSON round-trip
    try:
        json.dumps(data)
        log_test("Response is JSON-serializable", True)
    except Exception as e:
        log_test("Response is JSON-serializable", False, str(e))

    return ev_id


# ── Test 2: GET /evidence/{evidence_id} — Retrieve single record ────────────

def test_get_evidence(evidence_id):
    print("\n\u2550\u2550\u2550 Test 2: GET /evidence/{evidence_id} \u2550\u2550\u2550")

    resp = client.get(f"/evidence/{evidence_id}")
    log_test("GET /evidence/{id} returns 200", resp.status_code == 200,
             f"status={resp.status_code}")

    if resp.status_code == 200:
        data = resp.json()
        log_test("Returned evidence_id matches", data.get("evidence_id") == evidence_id,
                 f"expected={evidence_id}, got={data.get('evidence_id')}")

    # 404 for unknown ID
    fake_id = str(uuid.uuid4())
    resp_404 = client.get(f"/evidence/{fake_id}")
    log_test("GET /evidence/{unknown} returns 404", resp_404.status_code == 404,
             f"status={resp_404.status_code}")


# ── Test 3: GET /projects/{project_id}/evidence — List all ──────────────────

def test_list_project_evidence():
    print("\n\u2550\u2550\u2550 Test 3: GET /projects/{project_id}/evidence \u2550\u2550\u2550")

    resp = client.get("/projects/proj-smoke-001/evidence")
    log_test("GET /projects/{id}/evidence returns 200", resp.status_code == 200,
             f"status={resp.status_code}")

    if resp.status_code == 200:
        records = resp.json()
        log_test("Returns a list", isinstance(records, list),
                 f"type={type(records).__name__}, count={len(records)}")
        log_test("At least 1 record", len(records) >= 1,
                 f"count={len(records)}")

    # Empty project
    resp_empty = client.get("/projects/nonexistent-project/evidence")
    log_test("Empty project returns 200 with []", resp_empty.status_code == 200,
             f"status={resp_empty.status_code}")
    if resp_empty.status_code == 200:
        log_test("Empty project returns empty list", resp_empty.json() == [],
                 f"data={resp_empty.json()}")


# ── Test 4: GET /projects/{project_id}/evidence/latest — Latest evidence ────

def test_get_latest_evidence():
    print("\n\u2550\u2550\u2550 Test 4: GET /projects/{project_id}/evidence/latest \u2550\u2550\u2550")

    # Latest without technique filter
    resp = client.get("/projects/proj-smoke-001/evidence/latest")
    log_test("GET latest (no filter) returns 200", resp.status_code == 200,
             f"status={resp.status_code}")

    if resp.status_code == 200:
        data = resp.json()
        log_test("Latest returns a single record (not list)", isinstance(data, dict),
                 f"type={type(data).__name__}")
        log_test("Latest has evidence_id", "evidence_id" in data,
                 f"evidence_id={data.get('evidence_id')}")

    # Latest with technique filter
    resp_tech = client.get("/projects/proj-smoke-001/evidence/latest?technique=XRD")
    log_test("GET latest?technique=XRD returns 200", resp_tech.status_code == 200,
             f"status={resp_tech.status_code}")
    if resp_tech.status_code == 200:
        log_test("Filtered latest technique is XRD", resp_tech.json().get("technique") == "XRD",
                 f"technique={resp_tech.json().get('technique')}")

    # Latest with non-matching technique \u2192 404
    resp_no_match = client.get("/projects/proj-smoke-001/evidence/latest?technique=FTIR")
    log_test("GET latest?technique=FTIR returns 404", resp_no_match.status_code == 404,
             f"status={resp_no_match.status_code}")

    # Latest for non-existent project \u2192 404
    resp_empty = client.get("/projects/nonexistent/evidence/latest")
    log_test("GET latest for nonexistent project returns 404", resp_empty.status_code == 404,
             f"status={resp_empty.status_code}")


# ── Test 5: GET /projects/{project_id}/evidence/summary ─────────────────────

def test_evidence_summary():
    print("\n\u2550\u2550\u2550 Test 5: GET /projects/{project_id}/evidence/summary \u2550\u2550\u2550")

    resp = client.get("/projects/proj-smoke-001/evidence/summary")
    log_test("GET summary returns 200", resp.status_code == 200,
             f"status={resp.status_code}")

    if resp.status_code == 200:
        data = resp.json()
        log_test("summary has project_id", data.get("project_id") == "proj-smoke-001",
                 f"project_id={data.get('project_id')}")
        log_test("summary.total_evidence_count >= 1", data.get("total_evidence_count", 0) >= 1,
                 f"count={data.get('total_evidence_count')}")
        log_test("summary.techniques is list", isinstance(data.get("techniques"), list),
                 f"techniques={data.get('techniques')}")
        log_test("summary.latest_by_technique is dict", isinstance(data.get("latest_by_technique"), dict),
                 f"type={type(data.get('latest_by_technique')).__name__}")
        log_test("summary.open_validation_gaps is list", isinstance(data.get("open_validation_gaps"), list),
                 f"count={len(data.get('open_validation_gaps', []))}")


# ── Test 6: GET /projects/{project_id}/agent-context ────────────────────────

def test_agent_context():
    print("\n\u2550\u2550\u2550 Test 6: GET /projects/{project_id}/agent-context \u2550\u2550\u2550")

    resp = client.get("/projects/proj-smoke-001/agent-context")
    log_test("GET agent-context returns 200", resp.status_code == 200,
             f"status={resp.status_code}")

    if resp.status_code == 200:
        data = resp.json()
        log_test("agent-context has project_id", data.get("project_id") == "proj-smoke-001",
                 f"project_id={data.get('project_id')}")
        log_test("agent-context.evidence_count >= 1", data.get("evidence_count", 0) >= 1,
                 f"count={data.get('evidence_count')}")
        log_test("agent-context.techniques_available is list",
                 isinstance(data.get("techniques_available"), list),
                 f"techniques={data.get('techniques_available')}")
        log_test("agent-context.latest_summaries is list",
                 isinstance(data.get("latest_summaries"), list),
                 f"count={len(data.get('latest_summaries', []))}")
        log_test("agent-context.all_validation_gaps is list",
                 isinstance(data.get("all_validation_gaps"), list))
        log_test("agent-context.all_claim_boundaries is list",
                 isinstance(data.get("all_claim_boundaries"), list))

        # Check that latest_summaries have required keys
        summaries = data.get("latest_summaries", [])
        if summaries:
            s = summaries[0]
            expected_keys = {"technique", "evidence_id", "agent_ready_summary",
                             "claim_boundaries", "validation_gaps"}
            has_keys = expected_keys.issubset(s.keys())
            log_test("latest_summary has required keys", has_keys,
                     f"keys={list(s.keys())}")


# ── Test 7: POST /evidence/ingest/xrd — Ingest XRD result ──────────────────

def test_ingest_xrd():
    print("\n\u2550\u2550\u2550 Test 7: POST /evidence/ingest/xrd \u2014 Ingest XRD Result \u2550\u2550\u2550")

    ingest_payload = {
        "project_id": "proj-smoke-001",
        "xrd_result": STATIC_XRD_RESULT,
        "processing_params": {
            "baseline_method": "Asymmetric LS",
            "poly_order": 3,
            "half_window": 50,
            "smoothing_method": "Savitzky-Golay",
            "window_length": 11,
            "fit_model": "Pseudo-Voigt",
            "reference_db": "ICSD",
        },
        "sample_id": "CoFe2O4-pellet-A",
        "source_file": "cofe2o4_demo.xy",
        "tags": ["ingest-test"],
    }

    resp = client.post("/evidence/ingest/xrd", json=ingest_payload)
    log_test("POST /evidence/ingest/xrd returns 201", resp.status_code == 201,
             f"status={resp.status_code}")

    if resp.status_code != 201:
        log_test("Ingest response body", False, resp.text[:500])
        return None

    data = resp.json()

    # evidence_id is valid UUIDv4
    ev_id = data.get("evidence_id")
    is_uuid = False
    try:
        uuid.UUID(ev_id, version=4)
        is_uuid = True
    except (ValueError, TypeError):
        pass
    log_test("Ingested evidence_id is UUIDv4", is_uuid, f"value={ev_id}")

    # technique is XRD
    log_test("Ingested technique is XRD", data.get("technique") == "XRD",
             f"technique={data.get('technique')}")

    # Has scientific_observations
    obs = data.get("scientific_observations", [])
    log_test("Ingested has scientific_observations", isinstance(obs, list) and len(obs) > 0,
             f"count={len(obs)}")

    # Has claim_boundaries
    cb = data.get("claim_boundaries", [])
    log_test("Ingested has claim_boundaries", isinstance(cb, list) and len(cb) > 0,
             f"count={len(cb)}")

    # Has validation_gaps
    vg = data.get("validation_gaps", [])
    log_test("Ingested has validation_gaps", isinstance(vg, list) and len(vg) > 0,
             f"count={len(vg)}")

    # Has agent_ready_summary
    summary = data.get("agent_ready_summary", "")
    log_test("Ingested has agent_ready_summary", isinstance(summary, str) and len(summary) > 0,
             f"len={len(summary)}")

    # Bounded scientific language: only check for absolute claims
    banned_terms = [
        "confirmed phase purity",
        "phase confirmed",
        "definitive phase identification",
        "definitively identified",
    ]
    text_content = []
    for o in obs:
        text_content.append(o.lower())
    for c in cb:
        text_content.append(c.lower())
    for v in vg:
        text_content.append(v.lower())
    text_content.append(summary.lower())

    found_banned = False
    for term in banned_terms:
        for text in text_content:
            if term in text:
                found_banned = True
                break

    log_test("Bounded language: no absolute claims", not found_banned,
             "no banned terms found" if not found_banned else "FOUND banned terms")

    # raw_result preserves the static XRD result structure
    raw = data.get("raw_result", {})
    log_test("raw_result contains detected_peaks", "detected_peaks" in raw,
             f"keys_sample={list(raw.keys())[:6]}")

    # JSON round-trip
    try:
        json.dumps(data)
        log_test("Ingested response is JSON-serializable", True)
    except Exception as e:
        log_test("Ingested response is JSON-serializable", False, str(e))

    return ev_id


# ── Test 8: Verify ingested XRD evidence appears in project queries ─────────

def test_ingested_appears_in_queries(ingested_id):
    print("\n\u2550\u2550\u2550 Test 8: Ingested Evidence Appears in Project Queries \u2550\u2550\u2550")

    # List should now have at least 2 records (1 from test 1 + 1 from ingest)
    resp = client.get("/projects/proj-smoke-001/evidence")
    if resp.status_code == 200:
        records = resp.json()
        ids = [r.get("evidence_id") for r in records]
        log_test("Ingested evidence in project list", ingested_id in ids,
                 f"found={ingested_id in ids}, total={len(records)}")

    # Summary should show updated count
    resp_sum = client.get("/projects/proj-smoke-001/evidence/summary")
    if resp_sum.status_code == 200:
        data = resp_sum.json()
        log_test("Summary count updated after ingest", data.get("total_evidence_count", 0) >= 2,
                 f"count={data.get('total_evidence_count')}")

    # Agent context should reflect both records
    resp_ctx = client.get("/projects/proj-smoke-001/agent-context")
    if resp_ctx.status_code == 200:
        data = resp_ctx.json()
        log_test("Agent context count updated", data.get("evidence_count", 0) >= 2,
                 f"count={data.get('evidence_count')}")


# ── Main ─────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557")
    print("\u2551  DIFARYX Evidence Registry Smoke Test              \u2551")
    print("\u255a\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255d")

    # Test 1: Create evidence
    ev_id = test_create_evidence()

    # Test 2: Get single evidence
    if ev_id:
        test_get_evidence(ev_id)

    # Test 3: List project evidence
    test_list_project_evidence()

    # Test 4: Get latest evidence
    test_get_latest_evidence()

    # Test 5: Evidence summary
    test_evidence_summary()

    # Test 6: Agent context
    test_agent_context()

    # Test 7: Ingest XRD (using static result, NOT running pipeline)
    ingested_id = test_ingest_xrd()

    # Test 8: Verify ingested appears in queries
    if ingested_id:
        test_ingested_appears_in_queries(ingested_id)

    # Summary
    print("\n" + "\u2550" * 56)
    total = len(results)
    passed = sum(1 for _, s, _ in results if s == "PASS")
    failed = sum(1 for _, s, _ in results if s == "FAIL")
    print(f"  Total: {total}  |  Passed: {passed}  |  Failed: {failed}")

    if failed > 0:
        print("\n  Failed tests:")
        for name, status, details in results:
            if status == "FAIL":
                print(f"    \u274c {name}: {details}")
        print()
        sys.exit(1)
    else:
        print("  \u2705 All tests passed!\n")
        sys.exit(0)