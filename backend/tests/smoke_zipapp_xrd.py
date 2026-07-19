"""Smoke-test the zipapp against all XRD fixtures (no container)."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "server" / "python"))

from api.validation.parser_packaging import build_parser_zipapp  # noqa: E402

FIXTURES = REPO / "backend" / "tests" / "fixtures" / "parsers" / "xrd"

CASES = [
    ("valid_headered.xy", "valid", None, True),
    ("valid_headerless_two_column.txt", "valid", None, False),
    ("invalid_non_numeric.csv", "invalid", "XRD_INVALID_NON_NUMERIC_ROW", None),
    ("invalid_insufficient_rows.xy", "invalid", "XRD_INSUFFICIENT_ROWS", None),
    ("invalid_empty.dat", "invalid", "EMPTY_FILE", None),
    ("mismatch_xps_header.csv", "quarantined", "XRD_TECHNIQUE_MISMATCH", None),
    ("mismatch_ftir_header.txt", "quarantined", "XRD_TECHNIQUE_MISMATCH", None),
    ("mismatch_raman_header.dat", "quarantined", "XRD_TECHNIQUE_MISMATCH", None),
    ("ambiguous_mixed_markers.txt", "quarantined", "XRD_AMBIGUOUS_MARKERS", None),
    ("nan_infinity_values.txt", "invalid", "XRD_NON_FINITE_NUMBER", None),
    ("extreme_token_length.csv", "invalid", "XRD_TOO_LONG_TOKEN", None),
    ("excessive_columns.csv", "invalid", "XRD_TOO_MANY_COLUMNS", None),
    ("huge_single_line.dat", "invalid", "XRD_TOO_LONG_LINE", None),
    ("non_utf8_bytes.dat", "invalid", "XRD_NON_UTF8_LINE", None),
    ("unsupported_extension.pdf", "invalid", "INVALID_EXTENSION", None),
]


def main() -> int:
    fd, zipapp_path = tempfile.mkstemp(suffix=".pyz", prefix="difaryx_parser_")
    os.close(fd)
    try:
        build_parser_zipapp(zipapp_path)
        print(f"Built zipapp at {zipapp_path}")
        print(f"Python: {sys.executable}")
        print()

        failures = 0
        for filename, expected_status, expected_code, expected_confirmed in CASES:
            fixture_path = FIXTURES / filename
            if not fixture_path.exists():
                print(f"[SKIP] {filename}: fixture not found")
                continue
            fd, out_path = tempfile.mkstemp(suffix=".json")
            os.close(fd)
            try:
                res = subprocess.run(
                    [sys.executable, zipapp_path, "xrd", str(fixture_path), out_path],
                    capture_output=True,
                    timeout=30.0,
                )
                if res.returncode != 0:
                    print(f"[FAIL] {filename}: exit={res.returncode}")
                    print(f"       stderr: {res.stderr.decode('utf-8', errors='replace')[:300]}")
                    failures += 1
                    continue
                with open(out_path, "r", encoding="utf-8") as fh:
                    env = json.load(fh)
                status = env.get("status")
                code = env.get("error_code")
                confirmed = env.get("technique_identity_confirmed")
                ok = status == expected_status
                if expected_code is not None:
                    ok = ok and code == expected_code
                if expected_confirmed is not None:
                    ok = ok and confirmed == expected_confirmed
                marker = "[PASS]" if ok else "[FAIL]"
                if not ok:
                    failures += 1
                print(
                    f"{marker} {filename}: status={status} code={code} "
                    f"confirmed={confirmed} rows={env.get('valid_data_rows')}"
                )
                if not ok:
                    print(f"       expected: status={expected_status} code={expected_code} confirmed={expected_confirmed}")
            finally:
                try:
                    os.unlink(out_path)
                except OSError:
                    pass

        print()
        if failures:
            print(f"FAILURES: {failures}")
            return 1
        print("ALL PASS")
        return 0
    finally:
        try:
            os.unlink(zipapp_path)
        except OSError:
            pass


if __name__ == "__main__":
    sys.exit(main())
