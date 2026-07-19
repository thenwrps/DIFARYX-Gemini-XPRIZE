"""DIFARYX Phase 1B-B Step D1 - Parser base contract tests.

Validates ParseLimits, ParserResult schema invariants, TechniqueIdentityClass,
and BoundedLineReader behavior. No database or container required.
"""

from __future__ import annotations

import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "server" / "python"))

from api.validation.parser_base import (  # noqa: E402
    BoundedLineReader,
    ParseLimits,
    ParserResult,
    ParserResultValidationError,
    RESULT_STATUS_INVALID,
    RESULT_STATUS_QUARANTINED,
    RESULT_STATUS_VALID,
    TechniqueIdentityClass,
)


def _valid_envelope(**overrides):
    base = {
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
    base.update(overrides)
    return base


class TestParseLimits(unittest.TestCase):
    def test_limits_are_positive_ints(self):
        for name in dir(ParseLimits):
            if name.startswith("_"):
                continue
            val = getattr(ParseLimits, name)
            if isinstance(val, int):
                self.assertGreater(val, 0, f"{name} must be positive")

    def test_max_line_bytes_is_bounded(self):
        # MAX_LINE_BYTES must be modest to prevent memory exhaustion.
        self.assertLessEqual(ParseLimits.MAX_LINE_BYTES, 1 << 20)
        self.assertGreaterEqual(ParseLimits.MAX_LINE_BYTES, 4096)

    def test_max_output_json_bytes_is_bounded(self):
        self.assertLessEqual(ParseLimits.MAX_OUTPUT_JSON_BYTES, 1 << 20)
        self.assertGreater(ParseLimits.MAX_OUTPUT_JSON_BYTES, 1024)


class TestParserResultSchema(unittest.TestCase):
    def test_valid_envelope_accepted(self):
        r = ParserResult(_valid_envelope())
        self.assertEqual(r.status, "valid")
        self.assertTrue(r.technique_identity_confirmed)
        self.assertIsNone(r.error_code)

    def test_missing_required_key_rejected(self):
        env = _valid_envelope()
        del env["technique"]
        with self.assertRaises(ParserResultValidationError):
            ParserResult(env)

    def test_disallowed_key_rejected(self):
        env = _valid_envelope(peak_count=42)  # not in success-allowed keys
        with self.assertRaises(ParserResultValidationError):
            ParserResult(env)

    def test_invalid_status_rejected(self):
        env = _valid_envelope(status="bogus")
        with self.assertRaises(ParserResultValidationError):
            ParserResult(env)

    def test_valid_status_with_error_code_rejected(self):
        env = _valid_envelope(error_code="XRD_X")
        with self.assertRaises(ParserResultValidationError):
            ParserResult(env)

    def test_invalid_status_without_error_code_rejected(self):
        env = _valid_envelope(
            status="invalid",
            technique_identity_class="no_identity_evidence",
            technique_identity_confirmed=False,
        )
        with self.assertRaises(ParserResultValidationError):
            ParserResult(env)

    def test_invalid_status_with_error_fields_accepted(self):
        env = _valid_envelope(
            status="invalid",
            technique_identity_class="no_identity_evidence",
            technique_identity_confirmed=False,
            error_code="XRD_INSUFFICIENT_ROWS",
            error_message="not enough rows",
        )
        r = ParserResult(env)
        self.assertEqual(r.status, "invalid")
        self.assertEqual(r.error_code, "XRD_INSUFFICIENT_ROWS")

    def test_quarantined_status_requires_error_fields(self):
        env = _valid_envelope(
            status="quarantined",
            technique_identity_class="explicit_mismatch",
            technique_identity_confirmed=False,
        )
        with self.assertRaises(ParserResultValidationError):
            ParserResult(env)

    def test_quarantined_status_accepted_with_error_fields(self):
        env = _valid_envelope(
            status="quarantined",
            technique_identity_class="explicit_mismatch",
            technique_identity_confirmed=False,
            error_code="XRD_TECHNIQUE_MISMATCH",
            error_message="declared xrd, content is xps",
        )
        r = ParserResult(env)
        self.assertEqual(r.status, "quarantined")

    def test_unknown_identity_class_rejected(self):
        env = _valid_envelope(technique_identity_class="bogus_class")
        with self.assertRaises(ParserResultValidationError):
            ParserResult(env)

    def test_explicit_match_requires_confirmed_true(self):
        env = _valid_envelope(
            technique_identity_class="explicit_match",
            technique_identity_confirmed=False,
        )
        with self.assertRaises(ParserResultValidationError):
            ParserResult(env)

    def test_explicit_mismatch_requires_confirmed_false(self):
        env = _valid_envelope(
            status="quarantined",
            technique_identity_class="explicit_mismatch",
            technique_identity_confirmed=True,
            error_code="XRD_TECHNIQUE_MISMATCH",
            error_message="mismatch",
        )
        with self.assertRaises(ParserResultValidationError):
            ParserResult(env)

    def test_negative_counter_rejected(self):
        env = _valid_envelope(total_lines_scanned=-1)
        with self.assertRaises(ParserResultValidationError):
            ParserResult(env)

    def test_bool_counter_rejected(self):
        env = _valid_envelope(valid_data_rows=True)
        with self.assertRaises(ParserResultValidationError):
            ParserResult(env)

    def test_warnings_list_bounded(self):
        too_many = ["w" * 10 for _ in range(ParseLimits.MAX_WARNINGS + 1)]
        env = _valid_envelope(warnings=too_many)
        with self.assertRaises(ParserResultValidationError):
            ParserResult(env)

    def test_metadata_keys_bounded(self):
        too_many = {f"k{i}": "v" for i in range(ParseLimits.MAX_METADATA_KEYS + 1)}
        env = _valid_envelope(metadata=too_many)
        with self.assertRaises(ParserResultValidationError):
            ParserResult(env)

    def test_metadata_value_too_long_rejected(self):
        env = _valid_envelope(metadata={"k": "v" * (ParseLimits.MAX_METADATA_VALUE_LEN + 1)})
        with self.assertRaises(ParserResultValidationError):
            ParserResult(env)

    def test_to_dict_returns_copy(self):
        r = ParserResult(_valid_envelope())
        d = r.to_dict()
        d["status"] = "tampered"
        self.assertEqual(r.status, "valid", "to_dict must return an independent copy")


class TestBoundedLineReader(unittest.TestCase):
    def _write_temp(self, content: bytes) -> str:
        fd, path = tempfile.mkstemp(prefix="difaryx_test_")
        os.close(fd)
        with open(path, "wb") as fh:
            fh.write(content)
        self.addCleanup(os.unlink, path)
        return path

    def test_readline_rejects_overlong_line(self):
        # Line of MAX_LINE_BYTES + 1 bytes.
        long_line = b"x" * (ParseLimits.MAX_LINE_BYTES + 1) + b"\n"
        path = self._write_temp(long_line)
        reader = BoundedLineReader(
            path,
            max_line_bytes=ParseLimits.MAX_LINE_BYTES,
            max_file_lines=ParseLimits.MAX_FILE_LINES,
            overlong_code="OVERLONG",
            non_utf8_code="NON_UTF8",
        )
        with reader:
            raw, err, line_no = reader.next_line()
        self.assertIsNone(raw)
        self.assertEqual(err, "OVERLONG")
        self.assertEqual(line_no, 1)

    def test_readline_rejects_non_utf8(self):
        path = self._write_temp(b"valid line\n\xff\xfe bad line\n")
        reader = BoundedLineReader(
            path,
            max_line_bytes=ParseLimits.MAX_LINE_BYTES,
            max_file_lines=ParseLimits.MAX_FILE_LINES,
            overlong_code="OVERLONG",
            non_utf8_code="NON_UTF8",
        )
        with reader:
            # First line is valid UTF-8.
            raw1, err1, _ = reader.next_line()
            self.assertEqual(raw1, b"valid line\n")
            self.assertIsNone(err1)
            text1, decode_err1 = reader.decode(raw1)
            self.assertIsNone(decode_err1)
            self.assertEqual(text1, "valid line\n")
            # Second line is not valid UTF-8 — decode() rejects it.
            raw2, err2, _ = reader.next_line()
            self.assertIsNotNone(raw2)  # bytes were read
            self.assertIsNone(err2)  # no byte-level error
            text2, decode_err2 = reader.decode(raw2)
            self.assertIsNone(text2)
            self.assertEqual(decode_err2, "NON_UTF8")

    def test_readline_rejects_too_many_lines(self):
        # max_file_lines=2; supply 3 lines.
        content = b"a\nb\nc\n"
        path = self._write_temp(content)
        reader = BoundedLineReader(
            path,
            max_line_bytes=ParseLimits.MAX_LINE_BYTES,
            max_file_lines=2,
            overlong_code="OVERLONG",
            non_utf8_code="NON_UTF8",
        )
        with reader:
            for _ in range(2):
                raw, err, _ = reader.next_line()
                self.assertIsNotNone(raw)
                self.assertIsNone(err)
            raw, err, _ = reader.next_line()
        self.assertIsNone(raw)
        self.assertEqual(err, "PARSER_TOO_MANY_LINES")

    def test_readline_eof(self):
        path = self._write_temp(b"single line\n")
        reader = BoundedLineReader(
            path,
            max_line_bytes=ParseLimits.MAX_LINE_BYTES,
            max_file_lines=10,
            overlong_code="OVERLONG",
            non_utf8_code="NON_UTF8",
        )
        with reader:
            raw, err, _ = reader.next_line()
            self.assertEqual(raw, b"single line\n")
            self.assertIsNone(err)
            raw, err, _ = reader.next_line()
        self.assertEqual(raw, b"")
        self.assertIsNone(err)

    def test_lines_scanned_counter(self):
        path = self._write_temp(b"line1\nline2\nline3\n")
        reader = BoundedLineReader(
            path,
            max_line_bytes=ParseLimits.MAX_LINE_BYTES,
            max_file_lines=10,
            overlong_code="OVERLONG",
            non_utf8_code="NON_UTF8",
        )
        with reader:
            for _ in range(3):
                reader.next_line()
            reader.next_line()  # EOF
        self.assertEqual(reader.lines_scanned, 3)


class TestTechniqueIdentityClass(unittest.TestCase):
    def test_enum_values(self):
        self.assertEqual(
            TechniqueIdentityClass.EXPLICIT_MATCH.value, "explicit_match"
        )
        self.assertEqual(
            TechniqueIdentityClass.EXPLICIT_MISMATCH.value, "explicit_mismatch"
        )
        self.assertEqual(
            TechniqueIdentityClass.NO_IDENTITY_EVIDENCE.value, "no_identity_evidence"
        )
        self.assertEqual(
            TechniqueIdentityClass.AMBIGUOUS_MARKERS.value, "ambiguous_markers"
        )


if __name__ == "__main__":
    unittest.main()
