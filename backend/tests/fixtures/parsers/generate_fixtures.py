"""DIFARYX Phase 1B-B Step D1 - Synthetic fixture generator.

All fixtures are SYNTHETIC — generated programmatically to represent common
text-export shapes. No vendor file format is claimed; no proprietary
instrument output is reproduced. Each fixture carries a comment header
documenting its synthetic origin and intended parser outcome.

Run from the repository root:

    python backend/tests/fixtures/parsers/generate_fixtures.py

Idempotent: re-running overwrites the fixtures with deterministic content.
"""

from __future__ import annotations

import os
from pathlib import Path


FIXTURE_ROOT = Path(__file__).resolve().parent
XRD_DIR = FIXTURE_ROOT / "xrd"
PROTOCOL_DIR = FIXTURE_ROOT / "protocol"


HEADER_NOTE = (
    "# DIFARYX SYNTHETIC FIXTURE — generated; not a real instrument export.\n"
    "# No vendor format claimed. See generate_fixtures.py for provenance.\n"
)


def _write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def _write_bytes(path: Path, content: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)


# ---------------------------------------------------------------------------
# XRD fixtures
# ---------------------------------------------------------------------------
def gen_valid_headered_xy() -> None:
    """Valid XRD text profile with explicit ``2Theta`` header."""
    lines = [HEADER_NOTE]
    lines.append("# 2Theta/Intensity synthetic XRD scan")
    lines.append("2Theta Intensity")
    # 100 valid rows, 10.0 → 80.0 deg, step 0.7
    for i in range(100):
        x = 10.0 + i * 0.7
        y = 100.0 + 50.0 * (i % 7)
        lines.append(f"{x:.4f} {y:.2f}")
    _write(XRD_DIR / "valid_headered.xy", "\n".join(lines) + "\n")


def gen_valid_headerless_two_column() -> None:
    """Valid declared headerless two-column numeric profile."""
    lines = [HEADER_NOTE]
    # No header, no comments — pure numeric data
    for i in range(100):
        x = 5.0 + i * 0.5
        y = 200.0 + 30.0 * (i % 5)
        lines.append(f"{x:.4f} {y:.2f}")
    _write(XRD_DIR / "valid_headerless_two_column.txt", "\n".join(lines) + "\n")


def gen_invalid_non_numeric() -> None:
    """Malformed: non-numeric value in a data row."""
    lines = [HEADER_NOTE, "2Theta Intensity"]
    for i in range(50):
        x = 10.0 + i * 0.5
        y = 100.0 + i
        lines.append(f"{x:.4f} {y:.2f}")
    lines.append("20.0000 NOT_A_NUMBER")
    for i in range(50):
        x = 35.0 + i * 0.5
        y = 100.0 + i
        lines.append(f"{x:.4f} {y:.2f}")
    _write(XRD_DIR / "invalid_non_numeric.csv", "\n".join(lines) + "\n")


def gen_invalid_insufficient_rows() -> None:
    """Only one valid data row — below MIN_VALID_ROWS=2."""
    lines = [HEADER_NOTE, "2Theta Intensity", "10.0000 100.0"]
    _write(XRD_DIR / "invalid_insufficient_rows.xy", "\n".join(lines) + "\n")


def gen_invalid_empty() -> None:
    """Empty file."""
    _write_bytes(XRD_DIR / "invalid_empty.dat", b"")


def gen_mismatch_xps_header() -> None:
    """Declared XRD but content carries explicit XPS markers."""
    lines = [HEADER_NOTE]
    lines.append("Binding Energy (eV) Intensity")
    lines.append("C1s region")
    lines.append("Pass energy: 50 eV")
    for i in range(50):
        be = 280.0 + i * 0.5
        counts = 1000.0 + i * 20
        lines.append(f"{be:.2f} {counts:.1f}")
    _write(XRD_DIR / "mismatch_xps_header.csv", "\n".join(lines) + "\n")


def gen_mismatch_ftir_header() -> None:
    """Declared XRD but content carries explicit FTIR markers."""
    lines = [HEADER_NOTE]
    lines.append("Wavenumber (cm-1) Transmittance")
    lines.append("FTIR absorbance spectrum")
    for i in range(50):
        wn = 400.0 + i * 70.0
        t = 50.0 + (i % 10) * 3
        lines.append(f"{wn:.2f} {t:.2f}")
    _write(XRD_DIR / "mismatch_ftir_header.txt", "\n".join(lines) + "\n")


def gen_mismatch_raman_header() -> None:
    """Declared XRD but content carries explicit Raman markers."""
    lines = [HEADER_NOTE]
    lines.append("Raman Shift (cm-1) Intensity")
    lines.append("Raman spectrum")
    for i in range(50):
        shift = 100.0 + i * 70.0
        intensity = 100.0 + i * 5
        lines.append(f"{shift:.2f} {intensity:.1f}")
    _write(XRD_DIR / "mismatch_raman_header.dat", "\n".join(lines) + "\n")


def gen_ambiguous_mixed_markers() -> None:
    """Both XRD and FTIR markers present simultaneously."""
    lines = [HEADER_NOTE]
    lines.append("# Mixed markers: 2Theta column header AND Wavenumber mention")
    lines.append("2Theta Wavenumber")
    lines.append("# This file claims to be XRD but mentions FTIR wavenumber")
    for i in range(50):
        x = 10.0 + i * 0.5
        y = 100.0 + i
        lines.append(f"{x:.4f} {y:.2f}")
    _write(XRD_DIR / "ambiguous_mixed_markers.txt", "\n".join(lines) + "\n")


def gen_nan_values() -> None:
    """NaN literal in a data row."""
    lines = [HEADER_NOTE, "2Theta Intensity"]
    for i in range(10):
        x = 10.0 + i * 0.5
        y = 100.0 + i
        lines.append(f"{x:.4f} {y:.2f}")
    lines.append("15.0000 NaN")
    lines.append("16.0000 Infinity")
    _write(XRD_DIR / "nan_infinity_values.txt", "\n".join(lines) + "\n")


def gen_extreme_token_length() -> None:
    """A single token exceeding MAX_TOKEN_LENGTH (128 bytes)."""
    long_token = "1" * 200
    lines = [HEADER_NOTE, "2Theta Intensity"]
    lines.append(f"{long_token} 100.0")
    _write(XRD_DIR / "extreme_token_length.csv", "\n".join(lines) + "\n")


def gen_excessive_columns() -> None:
    """A row with > MAX_COLUMNS_PER_ROW (10) numeric columns."""
    cols = " ".join(str(i) for i in range(12))
    lines = [HEADER_NOTE, "2Theta Intensity"]
    lines.append(cols)
    _write(XRD_DIR / "excessive_columns.csv", "\n".join(lines) + "\n")


def gen_huge_single_line() -> None:
    """A single line exceeding MAX_LINE_BYTES (65536)."""
    long_line = "1.0 2.0 " + "x" * 70_000
    _write_bytes(XRD_DIR / "huge_single_line.dat", long_line.encode("utf-8"))


def gen_non_utf8_bytes() -> None:
    """Bytes that are not valid UTF-8 (latin-1 high bytes)."""
    content = b"2Theta Intensity\n10.0 100.0\n20.0\xff\xfe 200.0\n"
    _write_bytes(XRD_DIR / "non_utf8_bytes.dat", content)


def gen_unsupported_extension() -> None:
    """File with a .pdf extension — not in the XRD parser's supported set."""
    _write(XRD_DIR / "unsupported_extension.pdf", "2Theta Intensity\n10.0 100.0\n")


def gen_too_many_lines() -> None:
    """File with > MAX_FILE_LINES (200000) lines."""
    lines = [HEADER_NOTE, "2Theta Intensity"]
    # 200001 lines total → exceeds MAX_FILE_LINES
    for i in range(200_001):
        x = 10.0 + (i % 1000) * 0.1
        y = 100.0 + (i % 500)
        lines.append(f"{x:.4f} {y:.2f}")
    # This file is intentionally large; write in chunks to avoid OOM.
    path = XRD_DIR / "too_many_lines.xy"
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines[:1000]) + "\n")
        for chunk_start in range(1000, len(lines), 10000):
            fh.write("\n".join(lines[chunk_start:chunk_start + 10000]) + "\n")


# ---------------------------------------------------------------------------
# Protocol-violation fixtures (these are NOT valid XRD; they are crafted to
# test the host-side envelope validation in isolation_runner.py)
# ---------------------------------------------------------------------------
def gen_protocol_json_oversized() -> None:
    """Marker file used by tests to simulate an oversized JSON envelope.

    The actual oversized envelope is generated in the test itself by writing
    > MAX_OUTPUT_JSON_BYTES to /scratch/result.json via a mock. This fixture
    is a documentation placeholder.
    """
    _write(
        PROTOCOL_DIR / "json_oversized.txt",
        HEADER_NOTE + "# Test fixture: simulated oversized JSON envelope\n"
        "# See test_parser_protocol.py for the mock-based enforcement.\n",
    )


def gen_protocol_json_malformed() -> None:
    """Marker file used by tests to simulate malformed JSON."""
    _write(
        PROTOCOL_DIR / "json_malformed.txt",
        HEADER_NOTE + "# Test fixture: simulated malformed JSON envelope\n"
        "{not valid json\n",
    )


def gen_protocol_multiple_envelopes() -> None:
    """Marker file used by tests to simulate multiple JSON objects."""
    _write(
        PROTOCOL_DIR / "json_multiple_envelopes.txt",
        HEADER_NOTE + "# Test fixture: simulated multiple JSON envelopes\n"
        '{"status":"valid"}{"status":"invalid"}\n',
    )


def gen_expected_results() -> None:
    """Write the deterministic expectations manifest."""
    import json
    expectations = {
        "xrd/valid_headered.xy": {
            "status": "valid",
            "technique_identity_confirmed": True,
            "min_valid_data_rows": 100,
        },
        "xrd/valid_headerless_two_column.txt": {
            "status": "valid",
            "technique_identity_confirmed": False,
            "min_valid_data_rows": 100,
        },
        "xrd/invalid_non_numeric.csv": {
            "status": "invalid",
            "error_code": "XRD_INVALID_NON_NUMERIC_ROW",
        },
        "xrd/invalid_insufficient_rows.xy": {
            "status": "invalid",
            "error_code": "XRD_INSUFFICIENT_ROWS",
        },
        "xrd/invalid_empty.dat": {
            "status": "invalid",
            "error_code": "EMPTY_FILE",
        },
        "xrd/mismatch_xps_header.csv": {
            "status": "quarantined",
            "error_code": "XRD_TECHNIQUE_MISMATCH",
        },
        "xrd/mismatch_ftir_header.txt": {
            "status": "quarantined",
            "error_code": "XRD_TECHNIQUE_MISMATCH",
        },
        "xrd/mismatch_raman_header.dat": {
            "status": "quarantined",
            "error_code": "XRD_TECHNIQUE_MISMATCH",
        },
        "xrd/ambiguous_mixed_markers.txt": {
            "status": "quarantined",
            "error_code": "XRD_AMBIGUOUS_MARKERS",
        },
        "xrd/nan_infinity_values.txt": {
            "status": "invalid",
            "error_code": "XRD_NON_FINITE_NUMBER",
        },
        "xrd/extreme_token_length.csv": {
            "status": "invalid",
            "error_code": "XRD_TOO_LONG_TOKEN",
        },
        "xrd/excessive_columns.csv": {
            "status": "invalid",
            "error_code": "XRD_TOO_MANY_COLUMNS",
        },
        "xrd/huge_single_line.dat": {
            "status": "invalid",
            "error_code": "XRD_TOO_LONG_LINE",
        },
        "xrd/non_utf8_bytes.dat": {
            "status": "invalid",
            "error_code": "XRD_NON_UTF8_LINE",
        },
        "xrd/unsupported_extension.pdf": {
            "status": "invalid",
            "error_code": "INVALID_EXTENSION",
        },
        "xrd/too_many_lines.xy": {
            "status": "invalid",
            "error_code": "XRD_TOO_MANY_LINES",
        },
    }
    _write(
        FIXTURE_ROOT / "expected_results.json",
        json.dumps(expectations, indent=2, sort_keys=True),
    )


def main() -> None:
    print("Generating DIFARYX Phase 1B-B Step D1 fixtures...")
    gen_valid_headered_xy()
    gen_valid_headerless_two_column()
    gen_invalid_non_numeric()
    gen_invalid_insufficient_rows()
    gen_invalid_empty()
    gen_mismatch_xps_header()
    gen_mismatch_ftir_header()
    gen_mismatch_raman_header()
    gen_ambiguous_mixed_markers()
    gen_nan_values()
    gen_extreme_token_length()
    gen_excessive_columns()
    gen_huge_single_line()
    gen_non_utf8_bytes()
    gen_unsupported_extension()
    # too_many_lines is large; generate it last and only if requested.
    if os.getenv("DIFARYX_GEN_LARGE_FIXTURES") == "1":
        gen_too_many_lines()
    gen_protocol_json_oversized()
    gen_protocol_json_malformed()
    gen_protocol_multiple_envelopes()
    gen_expected_results()
    print(f"Fixtures written to {FIXTURE_ROOT}")


if __name__ == "__main__":
    main()
