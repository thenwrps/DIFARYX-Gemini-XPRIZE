"""DIFARYX Phase 1B-B Step D1 - Survival proof: benign attempt after quarantine.

Proves that after every quarantine/runtime-failure case, a subsequent benign
XRD input still validates successfully. This is the "no stuck attempts"
guarantee required by the close evidence.
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

from api.validation.parser_packaging import build_parser_zipapp  # noqa: E402
from api.validation.parsers.xrd_parser import XrdParser  # noqa: E402

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "parsers" / "xrd"

# Every quarantine / runtime-failure case that must NOT leave the parser stuck.
QUARANTINE_CASES = [
    "mismatch_xps_header.csv",
    "mismatch_ftir_header.txt",
    "mismatch_raman_header.dat",
    "ambiguous_mixed_markers.txt",
]

# Every invalid case that must NOT leave the parser stuck.
INVALID_CASES = [
    "invalid_non_numeric.csv",
    "invalid_insufficient_rows.xy",
    "invalid_empty.dat",
    "nan_infinity_values.txt",
    "extreme_token_length.csv",
    "excessive_columns.csv",
    "huge_single_line.dat",
    "non_utf8_bytes.dat",
    "unsupported_extension.pdf",
]

BENIGN_CASE = "valid_headered.xy"


class TestSurvivalAfterQuarantine(unittest.TestCase):
    """After each quarantine case, a benign attempt must succeed."""

    def test_benign_succeeds_after_each_quarantine_in_process(self):
        parser = XrdParser()
        for case in QUARANTINE_CASES:
            with self.subTest(case=case):
                fd, out = tempfile.mkstemp(suffix=".json")
                os.close(fd)
                try:
                    q_result = parser.parse_file(
                        str(FIXTURES / case), case, out
                    )
                    self.assertEqual(
                        q_result.status, "quarantined",
                        f"{case} should quarantine, got {q_result.status}",
                    )
                finally:
                    os.unlink(out)

                # Immediately after, the benign case must succeed.
                fd, out = tempfile.mkstemp(suffix=".json")
                os.close(fd)
                try:
                    benign = parser.parse_file(
                        str(FIXTURES / BENIGN_CASE), BENIGN_CASE, out
                    )
                finally:
                    os.unlink(out)
                self.assertEqual(
                    benign.status, "valid",
                    f"Benign case failed after quarantine {case}: "
                    f"status={benign.status} code={benign.error_code}",
                )
                self.assertEqual(benign["valid_data_rows"], 100)

    def test_benign_succeeds_after_each_invalid_in_process(self):
        parser = XrdParser()
        for case in INVALID_CASES:
            with self.subTest(case=case):
                fd, out = tempfile.mkstemp(suffix=".json")
                os.close(fd)
                try:
                    i_result = parser.parse_file(
                        str(FIXTURES / case), case, out
                    )
                    self.assertEqual(
                        i_result.status, "invalid",
                        f"{case} should be invalid, got {i_result.status}",
                    )
                finally:
                    os.unlink(out)

                # Immediately after, the benign case must succeed.
                fd, out = tempfile.mkstemp(suffix=".json")
                os.close(fd)
                try:
                    benign = parser.parse_file(
                        str(FIXTURES / BENIGN_CASE), BENIGN_CASE, out
                    )
                finally:
                    os.unlink(out)
                self.assertEqual(
                    benign.status, "valid",
                    f"Benign case failed after invalid {case}: "
                    f"status={benign.status} code={benign.error_code}",
                )


class TestSurvivalAfterQuarantineViaZipapp(unittest.TestCase):
    """Same survival proof through the packaged zipapp (container artifact)."""

    def setUp(self):
        fd, self.zipapp_path = tempfile.mkstemp(suffix=".pyz", prefix="difaryx_")
        os.close(fd)
        build_parser_zipapp(self.zipapp_path)

    def tearDown(self):
        try:
            os.unlink(self.zipapp_path)
        except OSError:
            pass

    def _run(self, fixture_name: str) -> dict:
        fd, out_path = tempfile.mkstemp(suffix=".json")
        os.close(fd)
        try:
            res = subprocess.run(
                [sys.executable, self.zipapp_path, "xrd",
                 str(FIXTURES / fixture_name), out_path],
                capture_output=True,
                timeout=30.0,
            )
            self.assertEqual(res.returncode, 0, res.stderr.decode("utf-8", "replace")[:300])
            with open(out_path, "r", encoding="utf-8") as fh:
                return json.load(fh)
        finally:
            try:
                os.unlink(out_path)
            except OSError:
                pass

    def test_benign_succeeds_after_quarantine_via_zipapp(self):
        for case in QUARANTINE_CASES:
            with self.subTest(case=case):
                env = self._run(case)
                self.assertEqual(env["status"], "quarantined", case)
                # Immediately after, the benign case must succeed.
                benign = self._run(BENIGN_CASE)
                self.assertEqual(
                    benign["status"], "valid",
                    f"Benign failed after {case}: {benign.get('error_code')}",
                )


class TestCrashRecovery(unittest.TestCase):
    """Prove that a parser crash (uncaught exception) is caught and the
    subsequent benign attempt still succeeds."""

    def test_crash_then_benign_succeeds(self):
        from api.validation.parser_base import (
            ParseLimits,
            TechniqueIdentityClass,
            TechniqueParser,
        )
        from api.validation.parser_registry import register, resolve

        class CrashingParser(TechniqueParser):
            technique = "crashing_test"
            supported_extensions = frozenset({".xy"})

            def parse_file(self, file_path, filename, output_path, limits=ParseLimits):
                raise RuntimeError("simulated parser crash")

        register(CrashingParser())
        try:
            parser = resolve("crashing_test")
            fd, out = tempfile.mkstemp(suffix=".json")
            os.close(fd)
            try:
                result = parser.parse_file(
                    str(FIXTURES / "valid_headered.xy"),
                    "valid_headered.xy",
                    out,
                )
                # P0: the entrypoint does NOT catch unexpected exceptions.
                # Here we call the parser directly (not via entrypoint), so
                # the RuntimeError propagates to the caller — which mirrors
                # what the entrypoint now lets through (nonzero exit →
                # ISOLATION_SANDBOX_ERROR on the host).
            except RuntimeError:
                pass  # expected: parser crash propagates when called directly
            finally:
                try:
                    os.unlink(out)
                except OSError:
                    pass

            # Now run the real XRD parser on the benign case — it must work.
            xrd = resolve("xrd")
            fd, out = tempfile.mkstemp(suffix=".json")
            os.close(fd)
            try:
                benign = xrd.parse_file(
                    str(FIXTURES / "valid_headered.xy"),
                    "valid_headered.xy",
                    out,
                )
            finally:
                os.unlink(out)
            self.assertEqual(benign.status, "valid")
            self.assertEqual(benign["valid_data_rows"], 100)
        finally:
            # Clean up the test parser registration.
            from api.validation import parser_registry
            with parser_registry._REGISTRY_LOCK:
                parser_registry._REGISTRY.pop("crashing_test", None)


if __name__ == "__main__":
    unittest.main()
