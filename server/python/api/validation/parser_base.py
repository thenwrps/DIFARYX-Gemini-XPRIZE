"""DIFARYX Phase 1B-B Step D1 - Parser Base Contract.

Bounded, file-based incremental parsing contract shared by all technique
parsers. Parsers read from a verified on-disk snapshot using bounded binary
``readline`` calls and emit a single, strict JSON ``ParserResult`` envelope.

Design invariants (enforced on the host as well as inside the container):

* ``MAX_LINE_BYTES``: each line is read with ``readline(MAX_LINE_BYTES + 1)``;
  if the returned slice exceeds ``MAX_LINE_BYTES`` the file is rejected before
  any decoding is attempted. Malformed UTF-8 is never silently repaired with
  replacement characters; decode failure yields a stable ``NON_UTF8_LINE``
  rejection.
* Exceeding any structural limit (lines, columns, rows, tokens) *rejects* the
  whole file. The parser never validates only a prefix and silently accepts.
* ``status`` is the primary outcome (``valid`` | ``invalid`` | ``quarantined``).
  All ``error_*`` fields must be present iff ``status != "valid"``.
* Technique identity is established only through explicit, discriminative
  textual marker combinations — never through numeric ranges, step sizes, or
  generic terms like ``Intensity``/``Counts``/``deg``/``eV``/``cm-1``.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from enum import Enum
from typing import Any, Mapping


# ---------------------------------------------------------------------------
# Bounded parsing limits
# ---------------------------------------------------------------------------
class ParseLimits:
    """Hard caps enforced inside the container before any structural work.

    These limits are deliberately conservative. Any limit exceeded must reject
    the file (``invalid`` for semantic bounds, ``quarantined`` for protocol or
    safety bounds) — never stop-at-cap-and-validate-prefix.
    """

    MAX_LINE_BYTES: int = 65_536          # per-line byte cap (readline cap = +1)
    MAX_FILE_LINES: int = 200_000          # reject after this many lines
    MAX_COLUMNS_PER_ROW: int = 10          # wider numeric rows are rejected
    MAX_TOKEN_LENGTH: int = 128            # bytes per numeric/text token
    MAX_NUMERIC_EXPONENT: int = 20         # 1e20 ok, 1e21 rejected
    MAX_VALID_ROWS: int = 100_000           # reject when more valid rows accumulated
    MIN_VALID_ROWS: int = 2                 # below this → INSUFFICIENT_ROWS
    MAX_WARNINGS: int = 50                  # cap warning list length
    MAX_METADATA_KEYS: int = 20            # cap metadata dict size
    MAX_METADATA_VALUE_LEN: int = 256      # bytes per metadata value
    MAX_OUTPUT_JSON_BYTES: int = 32_768    # total JSON envelope size on disk
    MAX_TECHNIQUE_HEADER_SCAN_LINES: int = 200  # lines inspected for markers


# ---------------------------------------------------------------------------
# Deterministic technique-identity evidence classes
# ---------------------------------------------------------------------------
class TechniqueIdentityClass(str, Enum):
    """Deterministic evidence classes for technique identity.

    No confidence scores. Identity is established only by explicit,
    discriminative marker combinations observed in textual headers/comments.
    """

    EXPLICIT_MATCH = "explicit_match"
    """≥ ``MIN_MARKERS_FOR_MATCH`` distinct discriminative markers for the
    declared technique are present and no strong markers of a different
    technique are present."""

    EXPLICIT_MISMATCH = "explicit_mismatch"
    """Strong discriminative markers of a DIFFERENT technique are present
    while none of the declared technique's markers are found."""

    NO_IDENTITY_EVIDENCE = "no_identity_evidence"
    """Headerless numeric-only file. No technique markers in the scanned
    prefix. Structurally valid input, but identity cannot be confirmed."""

    AMBIGUOUS_MARKERS = "ambiguous_markers"
    """Strong discriminative markers from ≥2 techniques are simultaneously
    present. Cannot determine technique identity."""


# ---------------------------------------------------------------------------
# Parser result envelope
# ---------------------------------------------------------------------------
RESULT_STATUS_VALID = "valid"
RESULT_STATUS_INVALID = "invalid"
RESULT_STATUS_QUARANTINED = "quarantined"
_RESULT_STATUSES = frozenset({
    RESULT_STATUS_VALID,
    RESULT_STATUS_INVALID,
    RESULT_STATUS_QUARANTINED,
})


# ---------------------------------------------------------------------------
# Generic failure codes (cross-technique)
# ---------------------------------------------------------------------------
# These mirror the generic failure codes already used on the host side
# (see ``api.validation.checks``). They are defined here as plain string
# constants so the container-side parser — which cannot import ``checks.py``
# — emits identical codes that the host worker recognises.
#
# P3 contract: generic codes are reused for cross-cutting failure modes.
# Technique-specific ``<TECH>_*`` codes are reserved for semantic parse
# failures, explicit technique mismatch, and technique-specific ambiguity.

# Input-level failures (mirror api.validation.checks)
EMPTY_FILE = "EMPTY_FILE"
INVALID_EXTENSION = "INVALID_EXTENSION"
INVALID_CONTENT_TYPE = "INVALID_CONTENT_TYPE"

# Parser-protocol failures (cross-technique)
PARSER_TOO_MANY_LINES = "PARSER_TOO_MANY_LINES"
PARSER_JSON_OVERSIZED = "PARSER_JSON_OVERSIZED"
PARSER_JSON_MALFORMED = "PARSER_JSON_MALFORMED"
PARSER_MULTIPLE_ENVELOPES = "PARSER_MULTIPLE_ENVELOPES"


# Required keys for every ParserResult envelope regardless of status.
_REQUIRED_KEYS = frozenset({
    "status",
    "technique",
    "technique_identity_class",
    "technique_identity_confirmed",
    "total_lines_scanned",
    "valid_data_rows",
    "skipped_header_lines",
    "skipped_comment_lines",
    "skipped_malformed_rows",
    "warnings",
    "metadata",
})

# Keys allowed in addition to the required set when status != "valid".
_OPTIONAL_FAILURE_KEYS = frozenset({"error_code", "error_message"})

# Keys allowed in addition to the required set when status == "valid".
_OPTIONAL_SUCCESS_KEYS = frozenset({"peak_count_hint"})

_ALLOWED_KEYS = _REQUIRED_KEYS | _OPTIONAL_FAILURE_KEYS | _OPTIONAL_SUCCESS_KEYS


class ParserResult(Mapping[str, Any]):
    """Immutable, schema-validated parser-result envelope.

    Construction validates all invariants so a ``ParserResult`` either passes
    schema validation or raises ``ParserResultValidationError``. The host
    trusts the validated envelope and applies it to settlement.
    """

    __slots__ = ("_data",)

    def __init__(self, data: Mapping[str, Any]) -> None:
        if not isinstance(data, Mapping):
            raise ParserResultValidationError(
                f"ParserResult must be a mapping, got {type(data).__name__}"
            )
        validated = self._validate(dict(data))
        # Frozen-ish: store a plain dict but expose read-only Mapping surface.
        object.__setattr__(self, "_data", validated)

    # -- Mapping protocol -------------------------------------------------
    def __getitem__(self, key: str) -> Any:
        return self._data[key]

    def __iter__(self):
        return iter(self._data)

    def __len__(self) -> int:
        return len(self._data)

    def __repr__(self) -> str:
        return f"ParserResult({self._data!r})"

    def __eq__(self, other: object) -> bool:
        if isinstance(other, ParserResult):
            return self._data == other._data
        if isinstance(other, Mapping):
            return self._data == dict(other)
        return NotImplemented

    def __hash__(self) -> int:  # pragma: no cover - results are mutable in practice
        raise TypeError("ParserResult is not hashable")

    # -- Accessors --------------------------------------------------------
    @property
    def status(self) -> str:
        return self._data["status"]

    @property
    def technique(self) -> str:
        return self._data["technique"]

    @property
    def technique_identity_class(self) -> str:
        return self._data["technique_identity_class"]

    @property
    def technique_identity_confirmed(self) -> bool:
        return bool(self._data["technique_identity_confirmed"])

    @property
    def error_code(self) -> str | None:
        return self._data.get("error_code")

    @property
    def error_message(self) -> str | None:
        return self._data.get("error_message")

    def to_dict(self) -> dict[str, Any]:
        """Return a shallow copy as a plain dict (for JSON serialization)."""
        return dict(self._data)

    # -- Validation -------------------------------------------------------
    @staticmethod
    def _validate(data: dict[str, Any]) -> dict[str, Any]:
        keys = set(data.keys())
        missing = _REQUIRED_KEYS - keys
        if missing:
            raise ParserResultValidationError(
                f"ParserResult missing required keys: {sorted(missing)}"
            )

        extra = keys - _ALLOWED_KEYS
        if extra:
            raise ParserResultValidationError(
                f"ParserResult contains disallowed keys: {sorted(extra)}"
            )

        status = data["status"]
        if status not in _RESULT_STATUSES:
            raise ParserResultValidationError(
                f"ParserResult.status must be one of {sorted(_RESULT_STATUSES)}, "
                f"got {status!r}"
            )

        if status == RESULT_STATUS_VALID:
            if "error_code" in data or "error_message" in data:
                raise ParserResultValidationError(
                    "ParserResult with status='valid' must not carry error_code/error_message"
                )
        else:
            if "error_code" not in data or "error_message" not in data:
                raise ParserResultValidationError(
                    f"ParserResult with status={status!r} must carry error_code and error_message"
                )
            if not isinstance(data["error_code"], str) or not data["error_code"]:
                raise ParserResultValidationError(
                    "ParserResult.error_code must be a non-empty string"
                )
            if not isinstance(data["error_message"], str):
                raise ParserResultValidationError(
                    "ParserResult.error_message must be a string"
                )

        # Required scalar types.
        if not isinstance(data["technique"], str) or not data["technique"]:
            raise ParserResultValidationError("ParserResult.technique must be a non-empty string")
        if not isinstance(data["technique_identity_class"], str):
            raise ParserResultValidationError(
                "ParserResult.technique_identity_class must be a string"
            )
        try:
            TechniqueIdentityClass(data["technique_identity_class"])
        except ValueError as exc:
            raise ParserResultValidationError(
                f"ParserResult.technique_identity_class not a known class: "
                f"{data['technique_identity_class']!r}"
            ) from exc
        if not isinstance(data["technique_identity_confirmed"], bool):
            raise ParserResultValidationError(
                "ParserResult.technique_identity_confirmed must be a bool"
            )

        # Integer counters must be finite ints.
        for key in (
            "total_lines_scanned",
            "valid_data_rows",
            "skipped_header_lines",
            "skipped_comment_lines",
            "skipped_malformed_rows",
        ):
            val = data[key]
            if not isinstance(val, int) or isinstance(val, bool) or val < 0:
                raise ParserResultValidationError(
                    f"ParserResult.{key} must be a non-negative int, got {val!r}"
                )

        # Warnings bounded list of strings.
        warnings = data["warnings"]
        if not isinstance(warnings, list):
            raise ParserResultValidationError("ParserResult.warnings must be a list")
        if len(warnings) > ParseLimits.MAX_WARNINGS:
            raise ParserResultValidationError(
                f"ParserResult.warnings exceeds {ParseLimits.MAX_WARNINGS} entries"
            )
        for w in warnings:
            if not isinstance(w, str):
                raise ParserResultValidationError(
                    f"ParserResult.warnings entries must be strings, got {type(w).__name__}"
                )
            if len(w.encode("utf-8")) > ParseLimits.MAX_METADATA_VALUE_LEN:
                raise ParserResultValidationError(
                    "ParserResult.warnings entry exceeds MAX_METADATA_VALUE_LEN"
                )

        # Metadata bounded dict of str -> str.
        metadata = data["metadata"]
        if not isinstance(metadata, dict):
            raise ParserResultValidationError("ParserResult.metadata must be a dict")
        if len(metadata) > ParseLimits.MAX_METADATA_KEYS:
            raise ParserResultValidationError(
                f"ParserResult.metadata exceeds {ParseLimits.MAX_METADATA_KEYS} keys"
            )
        for k, v in metadata.items():
            if not isinstance(k, str):
                raise ParserResultValidationError(
                    "ParserResult.metadata keys must be strings"
                )
            if not isinstance(v, str):
                raise ParserResultValidationError(
                    "ParserResult.metadata values must be strings"
                )
            if len(k.encode("utf-8")) > ParseLimits.MAX_TOKEN_LENGTH:
                raise ParserResultValidationError(
                    "ParserResult.metadata key exceeds MAX_TOKEN_LENGTH"
                )
            if len(v.encode("utf-8")) > ParseLimits.MAX_METADATA_VALUE_LEN:
                raise ParserResultValidationError(
                    "ParserResult.metadata value exceeds MAX_METADATA_VALUE_LEN"
                )

        # Cross-field invariant: identity_confirmed must agree with class.
        cls = data["technique_identity_class"]
        confirmed = data["technique_identity_confirmed"]
        if cls == TechniqueIdentityClass.EXPLICIT_MATCH.value and not confirmed:
            raise ParserResultValidationError(
                "technique_identity_class=explicit_match requires technique_identity_confirmed=true"
            )
        if cls == TechniqueIdentityClass.EXPLICIT_MISMATCH.value and confirmed:
            raise ParserResultValidationError(
                "technique_identity_class=explicit_mismatch requires technique_identity_confirmed=false"
            )
        if cls == TechniqueIdentityClass.AMBIGUOUS_MARKERS.value and confirmed:
            raise ParserResultValidationError(
                "technique_identity_class=ambiguous_markers requires technique_identity_confirmed=false"
            )

        return data


class ParserResultValidationError(ValueError):
    """Raised when a ``ParserResult`` envelope violates the strict schema."""


class UnknownTechniqueError(KeyError):
    """Raised when ``resolve()`` is asked for an unregistered technique."""


# ---------------------------------------------------------------------------
# TechniqueParser ABC
# ---------------------------------------------------------------------------
class TechniqueParser(ABC):
    """Abstract base for all DIFARYX technique parsers.

    Implementations read from a verified on-disk snapshot ``file_path`` using
    bounded binary ``readline`` calls. They MUST NOT read the whole file into
    memory at once, MUST NOT perform network I/O, and MUST write exactly one
    JSON envelope to the result channel (``output_path``).
    """

    technique: str = ""
    supported_extensions: frozenset[str] = frozenset()

    @abstractmethod
    def parse_file(
        self,
        file_path: str,
        filename: str,
        output_path: str,
        limits: type[ParseLimits] = ParseLimits,
    ) -> ParserResult:
        """Parse the verified snapshot at ``file_path``.

        Implementations must:
        * open ``file_path`` in binary mode and use ``readline(limits.MAX_LINE_BYTES + 1)``
        * reject lines that exceed ``MAX_LINE_BYTES`` before decoding
        * reject the file (not truncate) when any structural limit is exceeded
        * write the validated ``ParserResult`` envelope JSON to ``output_path``
        * return the same ``ParserResult`` for in-process unit tests
        """
        raise NotImplementedError


# ---------------------------------------------------------------------------
# Bounded line reader helper (used by all parsers)
# ---------------------------------------------------------------------------
class BoundedLineReader:
    """Binary file reader with strict per-line byte and decoding limits.

    Each ``readline()`` returns at most ``max_line_bytes + 1`` bytes. If the
    returned slice is longer than ``max_line_bytes``, the file is rejected
    with the supplied rejection code. Lines are decoded as strict UTF-8; any
    ``UnicodeDecodeError`` becomes a ``NON_UTF8_LINE`` rejection.
    """

    def __init__(
        self,
        file_path: str,
        max_line_bytes: int,
        max_file_lines: int,
        overlong_code: str,
        non_utf8_code: str,
    ) -> None:
        self._path = file_path
        self._max_line_bytes = max_line_bytes
        self._max_file_lines = max_file_lines
        self._overlong_code = overlong_code
        self._non_utf8_code = non_utf8_code
        self._fh = open(file_path, "rb")
        self._lines_scanned = 0

    def __enter__(self) -> "BoundedLineReader":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        try:
            self._fh.close()
        except Exception:
            pass

    @property
    def lines_scanned(self) -> int:
        return self._lines_scanned

    def next_line(self) -> tuple[bytes | None, str | None, int | None]:
        """Return ``(raw_bytes, error_code, line_number)``.

        * On success: ``(line_bytes, None, line_number)`` where ``line_bytes``
          may be ``b""`` at EOF.
        * On overlong line: ``(None, overlong_code, line_number)``.
        * On non-UTF-8 line: ``(None, non_utf8_code, line_number)``.
        * On file-line cap exceeded: ``(None, too_many_lines_code, line_number)``.

        ``line_number`` is the 1-based number of the line just read.
        """
        if self._lines_scanned >= self._max_file_lines:
            return None, "PARSER_TOO_MANY_LINES", self._lines_scanned + 1
        raw = self._fh.readline(self._max_line_bytes + 1)
        if not raw:
            return b"", None, self._lines_scanned + 1
        self._lines_scanned += 1
        if len(raw) > self._max_line_bytes:
            return None, self._overlong_code, self._lines_scanned
        return raw, None, self._lines_scanned

    def decode(self, raw: bytes) -> tuple[str | None, str | None]:
        """Strict UTF-8 decode of a single line. Returns ``(text, error_code)``."""
        try:
            return raw.decode("utf-8"), None
        except UnicodeDecodeError:
            return None, self._non_utf8_code


__all__ = [
    "ParseLimits",
    "TechniqueIdentityClass",
    "ParserResult",
    "ParserResultValidationError",
    "UnknownTechniqueError",
    "TechniqueParser",
    "BoundedLineReader",
    "RESULT_STATUS_VALID",
    "RESULT_STATUS_INVALID",
    "RESULT_STATUS_QUARANTINED",
]
