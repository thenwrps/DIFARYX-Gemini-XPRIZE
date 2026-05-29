"""
Smoke test for XRDFOMCalculator against the SQLite reference database.
"""
from xrd_engine.services.reference_db_service import XRDFOMCalculator
import json
import sys

calc = XRDFOMCalculator()
print(f"DB available: {calc.db_available}")

# Test 1: CoFe2O4-like peaks
peaks = [
    {"twotheta": 35.50, "intensity": 100.0},
    {"twotheta": 30.15, "intensity": 30.0},
    {"twotheta": 57.05, "intensity": 30.0},
    {"twotheta": 62.65, "intensity": 40.0},
    {"twotheta": 43.15, "intensity": 20.0},
    {"twotheta": 18.40, "intensity": 12.0},
]
result = calc.search_and_score(peaks, tolerance=0.5)
print(f"\nTest 1 (CoFe2O4-like):")
print(f"  status: {result['status']}")
print(f"  match_type: {result['match_type']}")
print(f"  fallback_active: {result['fallback_active']}")
print(f"  candidate_count: {result['candidate_count']}")
if result["primary_candidate"]:
    p = result["primary_candidate"]
    print(f"  primary: {p['phase_label']}")
    print(f"  fom_score: {p['fom_score']}")
    print(f"  position_score: {p['position_score']}")
    print(f"  intensity_score: {p['intensity_score']}")
    print(f"  unmatched_penalty: {p['unmatched_penalty']}")
    print(f"  claim_level: {p['claim_level']}")
    print(f"  consistent_with_profile: {p['consistent_with_profile']}")
    print(f"  matched_peaks: {len(p['matched_peaks'])}")

# Verify wording guardrails
result_str = json.dumps(result)
forbidden = ["100%", "pure", "confirmed", "certainty"]
guardrails_ok = True
for term in forbidden:
    if term.lower() in result_str.lower():
        print(f"  WARNING: Found forbidden term: {term}")
        guardrails_ok = False
if guardrails_ok:
    print("  Wording guardrails: PASSED")

# Test 2: TiO2 Anatase-like peaks
peaks2 = [
    {"twotheta": 25.30, "intensity": 100.0},
    {"twotheta": 48.08, "intensity": 35.0},
    {"twotheta": 55.10, "intensity": 20.0},
]
result2 = calc.search_and_score(peaks2, tolerance=0.5)
print(f"\nTest 2 (TiO2 Anatase-like):")
print(f"  status: {result2['status']}")
if result2["primary_candidate"]:
    p2 = result2["primary_candidate"]
    print(f"  primary: {p2['phase_label']}")
    print(f"  fom_score: {p2['fom_score']}")
    print(f"  claim_level: {p2['claim_level']}")

# Test 3: Empty peaks
result3 = calc.search_and_score([], tolerance=0.5)
print(f"\nTest 3 (Empty peaks):")
print(f"  status: {result3['status']}")
print(f"  candidate_count: {result3['candidate_count']}")

print("\nAll tests completed successfully.")