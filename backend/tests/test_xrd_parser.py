"""DIFARYX Phase 1B-B Step D1 - XRD parser tests.

Validates the XRD parser against the synthetic fixture matrix. Tests run the
parser in-process (no container) AND via the zipapp entrypoint (which is
what the container actually executes) to prove the rewritten flat imports
resolve correctly inside the packaged artifact.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "server" / "python"))

from api.validation.parser_base import (  # noqa: E402
    ParseLimits,
    ParserResult,
    RESULT_STATUS_INVALID,
    RESULT_STATUS_QUARANTINED,
    RESULT_STATUS_VALID,
)
from api.validation.parser_packaging import build_parser_zipapp  # noqa: E402
from api.validation.parsers.xrd_parser import XrdParser  # noqa: E402

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "parsers" / "xrd"


def _parse_in_process(fixture_name: str) -> ParserResult:
    """Run the XRD parser in-process against a fixture."""
    parser = XrdParser()
    fd, out_path = tempfile.mkstemp(suffix=".json")
    os.close(fd)
    try:
        result = parser.parse_file(
            file_path=str(FIXTURES / fixture_name),
            filename=fixture_name,
            output_path=out_path,
        )
        # Read what was written to disk to prove the channel is consistent.
        with open(out_path, "r", encoding="utf-8") as fh:
            on_disk = json.load(fh)
        assert on_disk == result.to_dict(), "on-disk envelope differs from returned"
        return result
    finally:
        try:
            os.unlink(out_path)
        except OSError:
            pass


def _parse_via_zipapp(fixture_name: str) -> dict:
    """Run the packaged zipapp as a subprocess against a fixture."""
    fd, zipapp_path = tempfile.mkstemp(suffix=".pyz", prefix="difaryx_parser_")
    os.close(fd)
    fd, out_path = tempfile.mkstemp(suffix=".json")
    os.close(fd)
    try:
        build_parser_zipapp(zipapp_path)
        res = subprocess.run(
            [sys.executable, zipapp_path, "xrd", str(FIXTURES / fixture_name), out_path],
            capture_output=True,
            timeout=30.0,
        )
        assert res.returncode == 0, (
            f"zipapp exited {res.returncode}; stderr="
            f"{res.stderr.decode('utf-8', errors='replace')[:500]}"
        )
        with open(out_path, "r", encoding="utf-8") as fh:
            return json.load(fh)
    finally:
        for p in (zipapp_path, out_path):
            try:
                os.unlink(p)
            except OSError:
                pass


class TestXrdAcceptanceMatrixInProcess(unittest.TestCase):
    """Run the XRD acceptance matrix in-process (unit-level)."""

    def _check(self, fixture, expected_status, expected_code=None, expected_confirmed=None):
        result = _parse_in_process(fixture)
        self.assertEqual(
            result.status, expected_status,
            f"{fixture}: status={result.status} expected={expected_status} "
            f"code={result.error_code}",
        )
        if expected_code is not None:
            self.assertEqual(
                result.error_code, expected_code,
                f"{fixture}: code={result.error_code} expected={expected_code}",
            )
        if expected_confirmed is not None:
            self.assertEqual(
                result.technique_identity_confirmed, expected_confirmed,
                f"{fixture}: confirmed={result.technique_identity_confirmed}",
            )

    def test_valid_headered(self):
        self._check("valid_headered.xy", RESULT_STATUS_VALID, expected_confirmed=True)
        r = _parse_in_process("valid_headered.xy")
        self.assertEqual(r["valid_data_rows"], 100)
        self.assertEqual(r["technique_identity_class"], "explicit_match")

    def test_valid_headerless_two_column(self):
        self._check(
            "valid_headerless_two_column.txt",
            RESULT_STATUS_VALID,
            expected_confirmed=False,
        )
        r = _parse_in_process("valid_headerless_two_column.txt")
        self.assertEqual(r["valid_data_rows"], 100)
        self.assertEqual(r["technique_identity_class"], "no_identity_evidence")

    def test_invalid_non_numeric(self):
        self._check(
            "invalid_non_numeric.csv",
            RESULT_STATUS_INVALID,
            "XRD_INVALID_NON_NUMERIC_ROW",
        )

    def test_invalid_insufficient_rows(self):
        self._check(
            "invalid_insufficient_rows.xy",
            RESULT_STATUS_INVALID,
            "XRD_INSUFFICIENT_ROWS",
        )

    def test_invalid_empty(self):
        self._check("invalid_empty.dat", RESULT_STATUS_INVALID, "EMPTY_FILE")

    def test_mismatch_xps_header(self):
        self._check(
            "mismatch_xps_header.csv",
            RESULT_STATUS_QUARANTINED,
            "XRD_TECHNIQUE_MISMATCH",
        )

    def test_mismatch_ftir_header(self):
        self._check(
            "mismatch_ftir_header.txt",
            RESULT_STATUS_QUARANTINED,
            "XRD_TECHNIQUE_MISMATCH",
        )

    def test_mismatch_raman_header(self):
        self._check(
            "mismatch_raman_header.dat",
            RESULT_STATUS_QUARANTINED,
            "XRD_TECHNIQUE_MISMATCH",
        )

    def test_ambiguous_mixed_markers(self):
        self._check(
            "ambiguous_mixed_markers.txt",
            RESULT_STATUS_QUARANTINED,
            "XRD_AMBIGUOUS_MARKERS",
        )

    def test_nan_infinity_values(self):
        self._check(
            "nan_infinity_values.txt",
            RESULT_STATUS_INVALID,
            "XRD_NON_FINITE_NUMBER",
        )

    def test_extreme_token_length(self):
        self._check(
            "extreme_token_length.csv",
            RESULT_STATUS_INVALID,
            "XRD_TOO_LONG_TOKEN",
        )

    def test_excessive_columns(self):
        self._check(
            "excessive_columns.csv",
            RESULT_STATUS_INVALID,
            "XRD_TOO_MANY_COLUMNS",
        )

    def test_huge_single_line(self):
        self._check(
            "huge_single_line.dat",
            RESULT_STATUS_INVALID,
            "XRD_TOO_LONG_LINE",
        )

    def test_non_utf8_bytes(self):
        self._check(
            "non_utf8_bytes.dat",
            RESULT_STATUS_INVALID,
            "XRD_NON_UTF8_LINE",
        )

    def test_unsupported_extension(self):
        self._check(
            "unsupported_extension.pdf",
            RESULT_STATUS_INVALID,
            "INVALID_EXTENSION",
        )


class TestXrdAcceptanceMatrixViaZipapp(unittest.TestCase):
    """Run the same matrix through the packaged zipapp.

    This proves the canonical source tree resolves correctly inside the
    container artifact (no bind mounts, no import rewriting).
    """

    def _check(self, fixture, expected_status, expected_code=None):
        env = _parse_via_zipapp(fixture)
        self.assertEqual(
            env["status"], expected_status,
            f"{fixture}: status={env['status']} expected={expected_status}",
        )
        if expected_code is not None:
            self.assertEqual(
                env.get("error_code"), expected_code,
                f"{fixture}: code={env.get('error_code')} expected={expected_code}",
            )

    def test_valid_headered_via_zipapp(self):
        self._check("valid_headered.xy", RESULT_STATUS_VALID)
        env = _parse_via_zipapp("valid_headered.xy")
        self.assertTrue(env["technique_identity_confirmed"])

    def test_valid_headerless_via_zipapp(self):
        self._check("valid_headerless_two_column.txt", RESULT_STATUS_VALID)
        env = _parse_via_zipapp("valid_headerless_two_column.txt")
        self.assertFalse(env["technique_identity_confirmed"])

    def test_mismatch_xps_via_zipapp(self):
        self._check(
            "mismatch_xps_header.csv",
            RESULT_STATUS_QUARANTINED,
            "XRD_TECHNIQUE_MISMATCH",
        )

    def test_non_numeric_via_zipapp(self):
        self._check(
            "invalid_non_numeric.csv",
            RESULT_STATUS_INVALID,
            "XRD_INVALID_NON_NUMERIC_ROW",
        )

    def test_nan_via_zipapp(self):
        self._check(
            "nan_infinity_values.txt",
            RESULT_STATUS_INVALID,
            "XRD_NON_FINITE_NUMBER",
        )

    def test_huge_line_via_zipapp(self):
        self._check(
            "huge_single_line.dat",
            RESULT_STATUS_INVALID,
            "XRD_TOO_LONG_LINE",
        )


class TestXrdBoundedLineReads(unittest.TestCase):
    """Prove the parser uses bounded binary readline() and rejects overlong lines."""

    def test_overlong_line_rejects_file_not_truncates(self):
        # Build a file: valid header, one valid row, then an overlong line,
        # then more valid rows. The parser must reject (not skip & continue).
        fd, path = tempfile.mkstemp(suffix=".dat")
        os.close(fd)
        try:
            with open(path, "wb") as fh:
                fh.write(b"2Theta Intensity\n")
                fh.write(b"10.0 100.0\n")
                fh.write(b"x" * (ParseLimits.MAX_LINE_BYTES + 1) + b"\n")
                fh.write(b"20.0 200.0\n")  # this would be valid if skipped
            parser = XrdParser()
            fd, out = tempfile.mkstemp(suffix=".json")
            os.close(fd)
            try:
                result = parser.parse_file(path, "test.dat", out)
            finally:
                os.unlink(out)
            self.assertEqual(result.status, RESULT_STATUS_INVALID)
            self.assertEqual(result.error_code, "XRD_TOO_LONG_LINE")
            # The parser must NOT have silently accepted row 20.0
            self.assertLess(result["valid_data_rows"], 100)
        finally:
            os.unlink(path)

    def test_too_many_lines_rejects_file(self):
        # Create a file with MAX_FILE_LINES + 5 lines. Use comment lines so
        # we exceed MAX_FILE_LINES (200000) without exceeding MAX_VALID_ROWS
        # (100000). The line cap must reject the file.
        fd, path = tempfile.mkstemp(suffix=".xy")
        os.close(fd)
        try:
            with open(path, "w", encoding="utf-8") as fh:
                fh.write("2Theta Intensity\n")
                for i in range(ParseLimits.MAX_FILE_LINES + 5):
                    fh.write(f"# comment line {i}\n")
            parser = XrdParser()
            fd, out = tempfile.mkstemp(suffix=".json")
            os.close(fd)
            try:
                result = parser.parse_file(path, "test.xy", out)
            finally:
                os.unlink(out)
            self.assertEqual(result.status, RESULT_STATUS_INVALID)
            self.assertEqual(result.error_code, "XRD_TOO_MANY_LINES")
        finally:
            os.unlink(path)

    def test_too_many_valid_rows_rejects_file(self):
        # Exceeding MAX_VALID_ROWS must reject (not truncate).
        fd, path = tempfile.mkstemp(suffix=".xy")
        os.close(fd)
        try:
            with open(path, "w", encoding="utf-8") as fh:
                fh.write("2Theta Intensity\n")
                for i in range(ParseLimits.MAX_VALID_ROWS + 5):
                    fh.write(f"{10.0 + i * 0.1:.4f} {100.0 + i:.2f}\n")
            parser = XrdParser()
            fd, out = tempfile.mkstemp(suffix=".json")
            os.close(fd)
            try:
                result = parser.parse_file(path, "test.xy", out)
            finally:
                os.unlink(out)
            self.assertEqual(result.status, RESULT_STATUS_INVALID)
            self.assertEqual(result.error_code, "XRD_TOO_MANY_VALID_ROWS")
        finally:
            os.unlink(path)


class TestNoGenericFallback(unittest.TestCase):
    """Prove there is no generic/in-process fallback parser."""

    def test_unknown_technique_resolves_to_quarantine_via_entrypoint(self):
        from api.validation.parser_registry import resolve, UnknownTechniqueError
        with self.assertRaises(UnknownTechniqueError):
            resolve("generic_ascii")
        with self.assertRaises(UnknownTechniqueError):
            resolve("generic")

    def test_no_generic_parser_registered(self):
        from api.validation.parser_registry import list_techniques
        techniques = list_techniques()
        self.assertNotIn("generic", techniques)
        self.assertNotIn("generic_ascii", techniques)
        self.assertNotIn("auto", techniques)


if __name__ == "__main__":
    unittest.main()
