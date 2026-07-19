"""Verify the host-side protocol envelope validator in isolation_runner.py."""

from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "server" / "python"))

from api.validation.isolated_runner import ContainerParserRunner, IsolatedRuntimeError  # noqa: E402
from api.validation.parser_base import ParseLimits  # noqa: E402

VALID_ENVELOPE = {
    "status": "valid",
    "technique": "xrd",
    "technique_identity_class": "explicit_match",
    "technique_identity_confirmed": True,
    "total_lines_scanned": 100,
    "valid_data_rows": 100,
    "skipped_header_lines": 1,
    "skipped_comment_lines": 0,
    "skipped_malformed_rows": 0,
    "warnings": [],
    "metadata": {},
}


def _runner() -> ContainerParserRunner:
    return ContainerParserRunner.__new__(ContainerParserRunner)


def main() -> int:
    runner = _runner()
    failures = 0

    # 1. Valid envelope passes.
    raw = json.dumps(VALID_ENVELOPE).encode("utf-8")
    env = runner._validate_result_envelope(raw)
    assert env["status"] == "valid", env
    print("[PASS] valid envelope accepted")

    # 2. Oversized envelope (> MAX_OUTPUT_JSON_BYTES + 1).
    huge = json.dumps({**VALID_ENVELOPE, "metadata": {"k" * 200: "v" * 200}}).encode("utf-8")
    # Pad to ensure it exceeds the cap.
    padded = huge + b" " * (ParseLimits.MAX_OUTPUT_JSON_BYTES + 1024)
    try:
        runner._validate_result_envelope(padded)
        print("[FAIL] oversized envelope NOT rejected")
        failures += 1
    except IsolatedRuntimeError as exc:
        assert "OVERSIZED" in str(exc).upper(), str(exc)
        print("[PASS] oversized envelope rejected:", str(exc)[:80])

    # 3. Malformed JSON (not valid JSON).
    try:
        runner._validate_result_envelope(b"{not valid json")
        print("[FAIL] malformed JSON NOT rejected")
        failures += 1
    except IsolatedRuntimeError as exc:
        assert "MALFORMED" in str(exc).upper(), str(exc)
        print("[PASS] malformed JSON rejected:", str(exc)[:80])

    # 4. Multiple JSON envelopes (trailing content after first object).
    raw = b'{"status":"valid"}{"status":"invalid"}'
    try:
        runner._validate_result_envelope(raw)
        print("[FAIL] multiple envelopes NOT rejected")
        failures += 1
    except IsolatedRuntimeError as exc:
        assert "MULTIPLE" in str(exc).upper() or "MALFORMED" in str(exc).upper(), str(exc)
        print("[PASS] multiple envelopes rejected:", str(exc)[:80])

    # 5. Schema violation (missing required key).
    bad = json.dumps({"status": "valid"}).encode("utf-8")
    try:
        runner._validate_result_envelope(bad)
        print("[FAIL] schema violation NOT rejected")
        failures += 1
    except IsolatedRuntimeError as exc:
        assert "MALFORMED" in str(exc).upper() or "schema" in str(exc).lower(), str(exc)
        print("[PASS] schema violation rejected:", str(exc)[:80])

    # 6. Empty result channel.
    try:
        runner._validate_result_envelope(b"")
        print("[FAIL] empty channel NOT rejected")
        failures += 1
    except IsolatedRuntimeError as exc:
        assert "MALFORMED" in str(exc).upper(), str(exc)
        print("[PASS] empty channel rejected:", str(exc)[:80])

    # 7. Non-finite number in counters (NaN/Infinity) — even though JSON
    #    doesn't support these, some parsers emit them; ensure rejection.
    #    (Python's json.loads rejects NaN/Infinity by default, so this also
    #    hits the malformed path.)
    raw = b'{"status":"valid","technique":"xrd","technique_identity_class":"explicit_match","technique_identity_confirmed":true,"total_lines_scanned":NaN,"valid_data_rows":100,"skipped_header_lines":0,"skipped_comment_lines":0,"skipped_malformed_rows":0,"warnings":[],"metadata":{}}'
    try:
        runner._validate_result_envelope(raw)
        print("[FAIL] non-finite number NOT rejected")
        failures += 1
    except IsolatedRuntimeError as exc:
        assert "MALFORMED" in str(exc).upper(), str(exc)
        print("[PASS] non-finite number rejected:", str(exc)[:80])

    print()
    if failures:
        print(f"FAILURES: {failures}")
        return 1
    print("ALL PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
