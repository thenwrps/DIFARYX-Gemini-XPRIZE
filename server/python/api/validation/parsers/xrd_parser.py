"""DIFARYX Phase 1B-B Step D1 - XRD technique parser.

Bounded, file-based incremental parsing for X-ray diffraction text/ASCII
exports. Implements the ``TechniqueParser`` contract defined in
``parser_base.py``.

Scope (Phase 1B-B Step D1):
* ASCII/CSV/text-exported formats only.
* Structural validation summary — no peak extraction, no spectra.
* Two-column (x, y) numeric data; comment lines (``#``/``%``) and a single
  optional header line are skipped.
* Technique identity is established through explicit discriminative markers
  only; numeric ranges / step sizes never infer technique.
* Exceeding any limit rejects the file (never stop-at-cap-and-validate-prefix).
"""

from __future__ import annotations

import json
import os
from typing import Any

from ..parser_base import (
    BoundedLineReader,
    EMPTY_FILE,
    INVALID_EXTENSION,
    PARSER_JSON_MALFORMED,
    PARSER_JSON_OVERSIZED,
    PARSER_TOO_MANY_LINES,
    ParseLimits,
    ParserResult,
    ParserResultValidationError,
    RESULT_STATUS_INVALID,
    RESULT_STATUS_QUARANTINED,
    RESULT_STATUS_VALID,
    TechniqueIdentityClass,
    TechniqueParser,
)
from ..parser_registry import (
    classify_technique_identity,
    collect_header_text,
    register,
)


# P3: XRD_* codes are reserved for XRD-specific *semantic* parse failures,
# explicit technique mismatch, and technique-specific ambiguity only.
# Cross-cutting modes (empty file, unsupported extension, protocol violations,
# unexpected runtime failure) reuse the generic codes from ``parser_base``.
XRD_INVALID_NON_NUMERIC_ROW = "XRD_INVALID_NON_NUMERIC_ROW"
XRD_INSUFFICIENT_ROWS = "XRD_INSUFFICIENT_ROWS"
XRD_TOO_MANY_COLUMNS = "XRD_TOO_MANY_COLUMNS"
XRD_TOO_MANY_LINES = "XRD_TOO_MANY_LINES"
XRD_TOO_LONG_LINE = "XRD_TOO_LONG_LINE"
XRD_TOO_MANY_VALID_ROWS = "XRD_TOO_MANY_VALID_ROWS"
XRD_TOO_LONG_TOKEN = "XRD_TOO_LONG_TOKEN"
XRD_NON_FINITE_NUMBER = "XRD_NON_FINITE_NUMBER"
XRD_NON_UTF8_LINE = "XRD_NON_UTF8_LINE"
XRD_TECHNIQUE_MISMATCH = "XRD_TECHNIQUE_MISMATCH"
XRD_AMBIGUOUS_MARKERS = "XRD_AMBIGUOUS_MARKERS"


# Maps identity classes to the XRD-specific quarantine code and identity_confirmed.
_IDENTITY_OUTCOME: dict[TechniqueIdentityClass, tuple[str, bool, str]] = {
    TechniqueIdentityClass.EXPLICIT_MATCH: (
        RESULT_STATUS_VALID,
        True,
        "identity confirmed via explicit XRD markers",
    ),
    TechniqueIdentityClass.EXPLICIT_MISMATCH: (
        RESULT_STATUS_QUARANTINED,
        False,
        XRD_TECHNIQUE_MISMATCH,
    ),
    TechniqueIdentityClass.AMBIGUOUS_MARKERS: (
        RESULT_STATUS_QUARANTINED,
        False,
        XRD_AMBIGUOUS_MARKERS,
    ),
    TechniqueIdentityClass.NO_IDENTITY_EVIDENCE: (
        RESULT_STATUS_VALID,
        False,
        "headerless numeric profile; identity not confirmed",
    ),
}


class XrdParser(TechniqueParser):
    technique = "xrd"
    supported_extensions = frozenset({".xy", ".txt", ".csv", ".dat", ".asc"})

    def parse_file(
        self,
        file_path: str,
        filename: str,
        output_path: str,
        limits: type[ParseLimits] = ParseLimits,
    ) -> ParserResult:
        # ----- Extension gate ------------------------------------------------
        _, ext = os.path.splitext(filename)
        if ext.lower() not in self.supported_extensions:
            result = self._build(
                status=RESULT_STATUS_INVALID,
                error_code=INVALID_EXTENSION,
                error_message=(
                    f"Extension {ext!r} not supported by XRD parser; "
                    f"supported={sorted(self.supported_extensions)}"
                ),
            )
            self._write(output_path, result)
            return result

        # ----- Empty-file gate ----------------------------------------------
        # P3: reuse the generic EMPTY_FILE code. An OSError here (file
        # vanishes between the entrypoint's existence check and this stat)
        # is an unexpected runtime failure — let it propagate so the
        # entrypoint exits nonzero → ISOLATION_SANDBOX_ERROR.
        if os.path.getsize(file_path) == 0:
            result = self._build(
                status=RESULT_STATUS_INVALID,
                error_code=EMPTY_FILE,
                error_message="Input file is empty",
            )
            self._write(output_path, result)
            return result

        # ----- Technique-identity scan (markers only, no numeric ranges) ----
        header_text = collect_header_text(
            file_path, limits.MAX_TECHNIQUE_HEADER_SCAN_LINES
        )
        identity_class, matched = classify_technique_identity(
            self.technique, header_text
        )
        identity_status, identity_confirmed, identity_note = _IDENTITY_OUTCOME[identity_class]

        # Mismatch / ambiguous → quarantine immediately, no structural parse.
        if identity_status == RESULT_STATUS_QUARANTINED:
            result = self._build(
                status=RESULT_STATUS_QUARANTINED,
                error_code=identity_note,
                error_message=(
                    f"Declared technique 'xrd' contradicted by file markers; "
                    f"identity_class={identity_class.value}; matched={self._matched_repr(matched)}"
                ),
            )
            self._write(output_path, result)
            return result

        # ----- Structural parse (bounded binary readline) -------------------
        result = self._structural_parse(
            file_path, filename, limits, identity_class, identity_confirmed, identity_note
        )
        self._write(output_path, result)
        return result

    # ------------------------------------------------------------------
    def _structural_parse(
        self,
        file_path: str,
        filename: str,
        limits: type[ParseLimits],
        identity_class: TechniqueIdentityClass,
        identity_confirmed: bool,
        identity_note: str,
    ) -> ParserResult:
        total_lines = 0
        valid_rows = 0
        header_lines = 0
        comment_lines = 0
        malformed_rows = 0
        warnings: list[str] = []
        metadata: dict[str, str] = {}
        # Bound for warning list; once exceeded, we stop appending.
        warn_cap = limits.MAX_WARNINGS

        reader = BoundedLineReader(
            file_path,
            max_line_bytes=limits.MAX_LINE_BYTES,
            max_file_lines=limits.MAX_FILE_LINES,
            overlong_code=XRD_TOO_LONG_LINE,
            non_utf8_code=XRD_NON_UTF8_LINE,
        )

        with reader:
            while True:
                raw, line_err, line_no = reader.next_line()
                if line_err == PARSER_TOO_MANY_LINES:
                    return self._build(
                        status=RESULT_STATUS_INVALID,
                        error_code=XRD_TOO_MANY_LINES,
                        error_message=(
                            f"File exceeds MAX_FILE_LINES={limits.MAX_FILE_LINES}"
                        ),
                        total_lines_scanned=reader.lines_scanned,
                    )
                if raw is None and line_err is not None:
                    # Overlong line or non-UTF-8 — reject file.
                    return self._build(
                        status=RESULT_STATUS_INVALID,
                        error_code=line_err,
                        error_message=(
                            f"Line {line_no} rejected: code={line_err}"
                        ),
                        total_lines_scanned=reader.lines_scanned,
                    )
                if raw == b"":
                    # EOF
                    break

                total_lines = reader.lines_scanned

                text, decode_err = reader.decode(raw)
                if decode_err is not None:
                    return self._build(
                        status=RESULT_STATUS_INVALID,
                        error_code=decode_err,
                        error_message=(
                            f"Line {line_no} is not valid UTF-8 (strict decode)"
                        ),
                        total_lines_scanned=total_lines,
                    )

                stripped = text.strip()
                if not stripped:
                    continue
                if stripped.startswith("#") or stripped.startswith("%"):
                    comment_lines += 1
                    continue

                # Tokenize on whitespace/comma/semicolon.
                parts = self._tokenize(stripped, limits)
                if isinstance(parts, str):
                    # Token-length violation.
                    return self._build(
                        status=RESULT_STATUS_INVALID,
                        error_code=parts,
                        error_message=(
                            f"Line {line_no}: token exceeds MAX_TOKEN_LENGTH"
                        ),
                        total_lines_scanned=total_lines,
                        skipped_comment_lines=comment_lines,
                    )

                if len(parts) == 1:
                    # Could be a header line ("2Theta,Intensity"). Treat as
                    # header ONLY if it contains alphabetic characters.
                    if self._looks_like_header(parts[0]):
                        header_lines += 1
                        continue
                    malformed_rows += 1
                    if len(warnings) < warn_cap:
                        warnings.append(
                            f"Line {line_no}: single token, not two-column data"
                        )
                    continue

                if len(parts) > limits.MAX_COLUMNS_PER_ROW:
                    return self._build(
                        status=RESULT_STATUS_INVALID,
                        error_code=XRD_TOO_MANY_COLUMNS,
                        error_message=(
                            f"Line {line_no}: {len(parts)} columns exceeds "
                            f"MAX_COLUMNS_PER_ROW={limits.MAX_COLUMNS_PER_ROW}"
                        ),
                        total_lines_scanned=total_lines,
                        skipped_comment_lines=comment_lines,
                        skipped_header_lines=header_lines,
                    )

                # We expect 2 columns; tolerate the case where header row has
                # exactly 2 alphabetic tokens ("2Theta Intensity").
                if len(parts) == 2 and self._both_non_numeric(parts):
                    if self._looks_like_header(parts[0] + " " + parts[1]):
                        header_lines += 1
                        continue
                    malformed_rows += 1
                    if len(warnings) < warn_cap:
                        warnings.append(
                            f"Line {line_no}: two non-numeric tokens, treated as malformed"
                        )
                    continue

                # Validate the first two tokens as finite numbers.
                numeric_err = self._validate_numeric_pair(parts[:2], limits)
                if numeric_err is not None:
                    return self._build(
                        status=RESULT_STATUS_INVALID,
                        error_code=numeric_err,
                        error_message=(
                            f"Line {line_no}: non-numeric or non-finite value"
                        ),
                        total_lines_scanned=total_lines,
                        skipped_comment_lines=comment_lines,
                        skipped_header_lines=header_lines,
                    )

                valid_rows += 1
                if valid_rows > limits.MAX_VALID_ROWS:
                    return self._build(
                        status=RESULT_STATUS_INVALID,
                        error_code=XRD_TOO_MANY_VALID_ROWS,
                        error_message=(
                            f"Valid data rows exceed MAX_VALID_ROWS={limits.MAX_VALID_ROWS}"
                        ),
                        total_lines_scanned=total_lines,
                        valid_data_rows=valid_rows,
                        skipped_comment_lines=comment_lines,
                        skipped_header_lines=header_lines,
                    )

        # ----- Final structural verdict -------------------------------------
        if valid_rows < limits.MIN_VALID_ROWS:
            return self._build(
                status=RESULT_STATUS_INVALID,
                error_code=XRD_INSUFFICIENT_ROWS,
                error_message=(
                    f"Only {valid_rows} valid data rows; required ≥ "
                    f"{limits.MIN_VALID_ROWS}"
                ),
                total_lines_scanned=total_lines,
                valid_data_rows=valid_rows,
                skipped_comment_lines=comment_lines,
                skipped_header_lines=header_lines,
                skipped_malformed_rows=malformed_rows,
                warnings=warnings,
                metadata=metadata,
                technique_identity_class=identity_class.value,
                technique_identity_confirmed=identity_confirmed,
            )

        # Valid result.
        if identity_class == TechniqueIdentityClass.NO_IDENTITY_EVIDENCE and len(warnings) < warn_cap:
            warnings.append(identity_note)
        elif identity_class == TechniqueIdentityClass.EXPLICIT_MATCH and len(warnings) < warn_cap:
            warnings.append(identity_note)

        return self._build(
            status=RESULT_STATUS_VALID,
            total_lines_scanned=total_lines,
            valid_data_rows=valid_rows,
            skipped_header_lines=header_lines,
            skipped_comment_lines=comment_lines,
            skipped_malformed_rows=malformed_rows,
            warnings=warnings,
            metadata=metadata,
            technique_identity_class=identity_class.value,
            technique_identity_confirmed=identity_confirmed,
        )

    # ------------------------------------------------------------------
    @staticmethod
    def _tokenize(line: str, limits: type[ParseLimits]) -> list[str] | str:
        # Replace common delimiters with spaces and split.
        cleaned = line.replace(",", " ").replace(";", " ").replace("\t", " ")
        parts = [p for p in cleaned.split(" ") if p]
        for token in parts:
            if len(token.encode("utf-8")) > limits.MAX_TOKEN_LENGTH:
                return XRD_TOO_LONG_TOKEN
        return parts

    @staticmethod
    def _looks_like_header(token: str) -> bool:
        # A header line contains at least one alphabetic character.
        return any(c.isalpha() for c in token)

    @staticmethod
    def _both_non_numeric(parts: list[str]) -> bool:
        return all(not XrdParser._is_finite_number(p) for p in parts)

    @staticmethod
    def _is_finite_number(token: str) -> bool:
        try:
            val = float(token)
        except (ValueError, TypeError):
            return False
        # Reject NaN/Infinity and exponents beyond the cap.
        import math
        if not math.isfinite(val):
            return False
        # Detect exponent form.
        lowered = token.lower()
        if "e" in lowered:
            try:
                mantissa, exp_str = lowered.split("e", 1)
                exp = int(exp_str)
                if abs(exp) > ParseLimits.MAX_NUMERIC_EXPONENT:
                    return False
            except (ValueError, IndexError):
                return False
        return True

    @staticmethod
    def _validate_numeric_pair(
        tokens: list[str], limits: type[ParseLimits]
    ) -> str | None:
        for token in tokens:
            if not XrdParser._is_finite_number(token):
                # Distinguish non-finite (NaN/Infinity) from non-numeric.
                try:
                    val = float(token)
                except (ValueError, TypeError):
                    return XRD_INVALID_NON_NUMERIC_ROW
                import math
                if not math.isfinite(val):
                    return XRD_NON_FINITE_NUMBER
                # Exponent out of range.
                lowered = token.lower()
                if "e" in lowered:
                    try:
                        _, exp_str = lowered.split("e", 1)
                        if abs(int(exp_str)) > limits.MAX_NUMERIC_EXPONENT:
                            return XRD_NON_FINITE_NUMBER
                    except (ValueError, IndexError):
                        return XRD_INVALID_NON_NUMERIC_ROW
                return XRD_INVALID_NON_NUMERIC_ROW
        return None

    # ------------------------------------------------------------------
    @staticmethod
    def _matched_repr(matched: dict[str, set[str]]) -> str:
        return "; ".join(
            f"{t}=[{','.join(sorted(m))}]" for t, m in sorted(matched.items())
        )

    @staticmethod
    def _build(
        *,
        status: str,
        error_code: str | None = None,
        error_message: str | None = None,
        total_lines_scanned: int = 0,
        valid_data_rows: int = 0,
        skipped_header_lines: int = 0,
        skipped_comment_lines: int = 0,
        skipped_malformed_rows: int = 0,
        warnings: list[str] | None = None,
        metadata: dict[str, str] | None = None,
        technique_identity_class: str = TechniqueIdentityClass.NO_IDENTITY_EVIDENCE.value,
        technique_identity_confirmed: bool = False,
    ) -> ParserResult:
        data: dict[str, Any] = {
            "status": status,
            "technique": "xrd",
            "technique_identity_class": technique_identity_class,
            "technique_identity_confirmed": technique_identity_confirmed,
            "total_lines_scanned": total_lines_scanned,
            "valid_data_rows": valid_data_rows,
            "skipped_header_lines": skipped_header_lines,
            "skipped_comment_lines": skipped_comment_lines,
            "skipped_malformed_rows": skipped_malformed_rows,
            "warnings": list(warnings or []),
            "metadata": dict(metadata or {}),
        }
        if status != RESULT_STATUS_VALID:
            data["error_code"] = error_code or "XRD_UNKNOWN"
            data["error_message"] = error_message or "Unspecified XRD parser error"
        try:
            return ParserResult(data)
        except ParserResultValidationError as exc:
            # Self-inflicted envelope error → protocol quarantine. We never
            # let a malformed envelope reach the host.
            data = {
                "status": RESULT_STATUS_QUARANTINED,
                "technique": "xrd",
                "technique_identity_class": TechniqueIdentityClass.NO_IDENTITY_EVIDENCE.value,
                "technique_identity_confirmed": False,
                "total_lines_scanned": total_lines_scanned,
                "valid_data_rows": valid_data_rows,
                "skipped_header_lines": skipped_header_lines,
                "skipped_comment_lines": skipped_comment_lines,
                "skipped_malformed_rows": skipped_malformed_rows,
                "warnings": [],
                "metadata": {},
                "error_code": PARSER_JSON_MALFORMED,
                "error_message": f"Parser produced invalid envelope: {exc}",
            }
            return ParserResult(data)

    @staticmethod
    def _write(output_path: str, result: ParserResult) -> None:
        payload = json.dumps(result.to_dict(), separators=(",", ":"))
        encoded = payload.encode("utf-8")
        if len(encoded) > ParseLimits.MAX_OUTPUT_JSON_BYTES:
            # Replace with a protocol-violation envelope.
            replacement = {
                "status": RESULT_STATUS_QUARANTINED,
                "technique": "xrd",
                "technique_identity_class": TechniqueIdentityClass.NO_IDENTITY_EVIDENCE.value,
                "technique_identity_confirmed": False,
                "total_lines_scanned": result["total_lines_scanned"],
                "valid_data_rows": result["valid_data_rows"],
                "skipped_header_lines": result["skipped_header_lines"],
                "skipped_comment_lines": result["skipped_comment_lines"],
                "skipped_malformed_rows": result["skipped_malformed_rows"],
                "warnings": [],
                "metadata": {},
                "error_code": PARSER_JSON_OVERSIZED,
                "error_message": (
                    f"Parser envelope {len(encoded)} bytes exceeds "
                    f"MAX_OUTPUT_JSON_BYTES={ParseLimits.MAX_OUTPUT_JSON_BYTES}"
                ),
            }
            payload = json.dumps(replacement, separators=(",", ":"))
        os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as fh:
            fh.write(payload)


# Register at import time. The registry raises if a parser is registered
# twice, which is the desired behavior — duplicate registration indicates
# a packaging bug and must fail loudly.
register(XrdParser())


__all__ = [
    "XrdParser",
    "XRD_INVALID_NON_NUMERIC_ROW",
    "XRD_INSUFFICIENT_ROWS",
    "XRD_TOO_MANY_COLUMNS",
    "XRD_TOO_MANY_LINES",
    "XRD_TOO_LONG_LINE",
    "XRD_TOO_MANY_VALID_ROWS",
    "XRD_TOO_LONG_TOKEN",
    "XRD_NON_FINITE_NUMBER",
    "XRD_NON_UTF8_LINE",
    "XRD_TECHNIQUE_MISMATCH",
    "XRD_AMBIGUOUS_MARKERS",
]
