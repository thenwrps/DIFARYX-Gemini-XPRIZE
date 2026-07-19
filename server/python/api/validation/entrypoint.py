"""DIFARYX Phase 1B-B Step D1 - Container entrypoint for the parser zipapp.

Invoked inside the isolated container as:

    python3 /tmp/difaryx_parser.pyz <technique> <input_path> <output_path>

Writes exactly ONE JSON ``ParserResult`` envelope to ``output_path`` (which
must be inside the writable ``/scratch`` tmpfs). stdout/stderr are reserved
for diagnostics only — the host reads the result channel file, not stdout.

Exit code semantics (P0 contract):

* 0 — envelope written successfully. May carry status=invalid/quarantined.
      Only *semantic* parser outcomes (unknown technique, missing input,
      invalid data, parse limits, etc.) may take this path.
* 1 — usage error (bad arguments) OR an uncaught unexpected exception that
      propagated through ``main``. Python's default handler prints the
      traceback to stderr and exits 1.
* 2 — fatal packaging / import error. The host maps this to
      ``ISOLATION_SANDBOX_ERROR``.
* 3 — out-of-memory signal. The host maps this to ``ISOLATION_SANDBOX_ERROR``.

Any nonzero exit is interpreted by the host as a sandbox/runtime failure and
mapped to the generic ``ISOLATION_SANDBOX_ERROR`` failure code. The result
channel is NOT read on nonzero exit — the envelope is only read when the
process exits 0.
"""

from __future__ import annotations

import json
import os
import sys


def _write_failure(output_path: str, technique: str, code: str, message: str) -> None:
    """Write a quarantine envelope to the result channel."""
    try:
        os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    except Exception:
        pass
    from .parser_base import ParseLimits
    payload = {
        "status": "quarantined",
        "technique": technique,
        "technique_identity_class": "no_identity_evidence",
        "technique_identity_confirmed": False,
        "total_lines_scanned": 0,
        "valid_data_rows": 0,
        "skipped_header_lines": 0,
        "skipped_comment_lines": 0,
        "skipped_malformed_rows": 0,
        "warnings": [],
        "metadata": {},
        "error_code": code,
        "error_message": message,
    }
    encoded = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    if len(encoded) > ParseLimits.MAX_OUTPUT_JSON_BYTES:
        payload["error_code"] = "PARSER_JSON_OVERSIZED"
        payload["error_message"] = (
            f"Envelope {len(encoded)} bytes exceeds "
            f"MAX_OUTPUT_JSON_BYTES={ParseLimits.MAX_OUTPUT_JSON_BYTES}"
        )
        payload["warnings"] = []
        payload["metadata"] = {}
        encoded = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    with open(output_path, "w", encoding="utf-8") as fh:
        fh.write(encoded.decode("utf-8"))


def main(argv: list[str]) -> int:
    if len(argv) != 4:
        sys.stderr.write(
            "Usage: difaryx_parser.pyz <technique> <input_path> <output_path>\n"
        )
        return 1

    technique = argv[1]
    input_path = argv[2]
    output_path = argv[3]

    try:
        from . import parsers  # noqa: F401 — triggers parser registration
        from .parser_registry import resolve, UnknownTechniqueError
    except Exception as exc:
        # Packaging/import failure is NOT a semantic parser outcome.
        # Do not write an envelope; return nonzero so the host maps this
        # to ISOLATION_SANDBOX_ERROR via its nonzero-exit path.
        sys.stderr.write(f"PARSER_PACKAGE_IMPORT_ERROR: {exc}\n")
        return 2

    try:
        parser = resolve(technique)
    except UnknownTechniqueError:
        # Semantic outcome: technique not registered. Write envelope, exit 0.
        _write_failure(
            output_path, technique, "UNKNOWN_PARSER_NOT_REGISTERED",
            f"No parser registered for technique={technique!r}",
        )
        return 0

    if not os.path.exists(input_path):
        # Semantic outcome: input missing. Write envelope, exit 0.
        _write_failure(
            output_path, technique, "PARSER_INPUT_NOT_FOUND",
            f"Input file not found: {input_path}",
        )
        return 0

    filename = os.path.basename(input_path)

    # Semantic outcomes (valid/invalid/quarantined) are written by the parser
    # to output_path and return 0. MemoryError is an OOM signal (exit 3).
    # Any other unexpected exception MUST propagate — Python's default handler
    # prints the traceback to stderr and exits 1, which the host maps to
    # ISOLATION_SANDBOX_ERROR. We deliberately do NOT catch, write
    # PARSER_UNCAUGHT_EXCEPTION, and exit 0.
    try:
        parser.parse_file(
            file_path=input_path,
            filename=filename,
            output_path=output_path,
        )
        return 0
    except MemoryError:
        sys.stderr.write("SANDBOX_VIOLATION: memory exhausted (OOM)\n")
        return 3


if __name__ == "__main__":
    sys.exit(main(sys.argv))
