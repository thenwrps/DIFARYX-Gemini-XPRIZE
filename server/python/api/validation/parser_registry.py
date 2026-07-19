"""DIFARYX Phase 1B-B Step D1 - Parser Registry.

Explicit, deterministic parser registry. Technique parsers are registered
once at import time; selection at runtime is by the declared ``technique``
string carried in the dataset/upload record. No automatic fallback, no
in-process generic parser.

Technique identity is established ONLY through explicit, discriminative
textual marker combinations observed in the first
``ParseLimits.MAX_TECHNIQUE_HEADER_SCAN_LINES`` lines. Generic unit terms
(``Intensity``, ``Counts``, ``deg``, ``eV``, ``cm-1``) deliberately do NOT
count toward identity because they are shared across multiple techniques.
"""

from __future__ import annotations

import os
import threading
from typing import Iterable

from .parser_base import (
    ParseLimits,
    TechniqueIdentityClass,
    TechniqueParser,
    UnknownTechniqueError,
)


# Minimum number of distinct discriminative markers required for an
# EXPLICIT_MATCH. A single marker is treated as a hint, not a confirmation.
MIN_MARKERS_FOR_MATCH: int = 2

# Minimum number of distinct foreign-technique markers required to call an
# EXPLICIT_MISMATCH. A single foreign marker in the absence of any declared
# markers still counts (one explicit header is enough to contradict).
MIN_MARKERS_FOR_MISMATCH: int = 1


# ---------------------------------------------------------------------------
# Discriminative marker sets.
#
# IMPORTANT: generic unit terms (Intensity, Counts, deg, eV, cm-1) are
# deliberately NOT included in any technique's discriminative set because
# they are shared across techniques and cannot establish identity alone.
# Only explicit, discriminative header phrases that name the technique's
# physical observable count.
# ---------------------------------------------------------------------------
TECHNIQUE_MARKERS: dict[str, frozenset[str]] = {
    "xrd": frozenset({
        "2theta",
        "2θ",
        "two theta",
        "two-theta",
        "2-theta",
        "diffraction angle",
        "bragg",
        "d-spacing",
        "xrd",
        "powder diffraction",
    }),
    "xps": frozenset({
        "binding energy",
        "be (ev)",
        "be(ev)",
        "c1s",
        "o1s",
        "si2p",
        "n1s",
        "f1s",
        "pass energy",
        "survey scan",
        "xps",
        "photoelectron",
    }),
    "ftir": frozenset({
        "wavenumber",
        "wave number",
        "transmittance",
        "%t",
        "absorbance",
        "ftir",
        "fourier transform infrared",
        "infrared spectrum",
    }),
    "raman": frozenset({
        "raman shift",
        "ramanshift",
        "raman",
        "stokes",
        "anti-stokes",
        "raman spectrum",
    }),
}


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------
_REGISTRY: dict[str, TechniqueParser] = {}
_REGISTRY_LOCK = threading.Lock()


def register(parser: TechniqueParser) -> None:
    """Register a parser instance under its declared ``technique``.

    Raises ``ValueError`` on duplicate registration to keep selection
    deterministic.
    """
    if not isinstance(parser, TechniqueParser):
        raise TypeError(f"register() expects TechniqueParser, got {type(parser).__name__}")
    if not parser.technique:
        raise ValueError("TechniqueParser.technique must be a non-empty string")
    with _REGISTRY_LOCK:
        if parser.technique in _REGISTRY:
            raise ValueError(f"Parser already registered for technique={parser.technique!r}")
        _REGISTRY[parser.technique] = parser


def resolve(technique: str) -> TechniqueParser:
    """Resolve the parser for a declared technique.

    Raises ``UnknownTechniqueError`` if no parser is registered. There is no
    generic fallback — callers must propagate this as a quarantine (the
    worker treats unknown techniques as ``UNKNOWN_PARSER_NOT_REGISTERED``).
    """
    if not isinstance(technique, str) or not technique:
        raise UnknownTechniqueError("technique must be a non-empty string")
    with _REGISTRY_LOCK:
        parser = _REGISTRY.get(technique)
    if parser is None:
        raise UnknownTechniqueError(technique)
    return parser


def list_techniques() -> frozenset[str]:
    with _REGISTRY_LOCK:
        return frozenset(_REGISTRY.keys())


def is_supported_extension(technique: str, filename: str) -> bool:
    """Return True iff ``filename``'s extension is supported by the parser."""
    parser = resolve(technique)
    ext = _extension(filename)
    return ext in parser.supported_extensions


def _extension(filename: str) -> str:
    _, ext = os.path.splitext(filename)
    return ext.lower()


# ---------------------------------------------------------------------------
# Deterministic technique-identity classifier
# ---------------------------------------------------------------------------
def _scan_text_markers(text: str) -> dict[str, set[str]]:
    """Return ``{technique: set_of_matched_markers}`` for ``text``."""
    lowered = text.lower()
    found: dict[str, set[str]] = {}
    for technique, markers in TECHNIQUE_MARKERS.items():
        matched: set[str] = set()
        for marker in markers:
            if marker in lowered:
                matched.add(marker)
        if matched:
            found[technique] = matched
    return found


def classify_technique_identity(
    declared_technique: str,
    header_text: str,
) -> tuple[TechniqueIdentityClass, dict[str, set[str]]]:
    """Classify the technique identity of a file's header/comment region.

    Returns ``(identity_class, matched_markers_by_technique)``. The
    classification is purely deterministic and based on the discriminative
    marker combinations observed in ``header_text`` (already a concatenation
    of the scanned prefix). Numeric ranges, step sizes, and generic unit
    terms are NOT considered.
    """
    matched = _scan_text_markers(header_text)
    declared_markers = matched.get(declared_technique, set())
    foreign_techniques = {t: m for t, m in matched.items() if t != declared_technique}
    foreign_total = sum(len(m) for m in foreign_techniques.values())

    if declared_markers and foreign_total == 0:
        if len(declared_markers) >= MIN_MARKERS_FOR_MATCH:
            return TechniqueIdentityClass.EXPLICIT_MATCH, matched
        # Single declared marker with no foreign markers: not enough to
        # confirm, but not contradictory either. Treat as no evidence so
        # headerless-style rules apply to the structural check.
        return TechniqueIdentityClass.NO_IDENTITY_EVIDENCE, matched

    if not declared_markers and foreign_total >= MIN_MARKERS_FOR_MISMATCH:
        return TechniqueIdentityClass.EXPLICIT_MISMATCH, matched

    if declared_markers and foreign_total >= MIN_MARKERS_FOR_MISMATCH:
        return TechniqueIdentityClass.AMBIGUOUS_MARKERS, matched

    return TechniqueIdentityClass.NO_IDENTITY_EVIDENCE, matched


def collect_header_text(file_path: str, max_lines: int) -> str:
    """Read up to ``max_lines`` lines of the file as text (strict UTF-8).

    Used only to gather header/comment text for marker scanning. Lines
    that fail strict UTF-8 decoding are skipped here (the structural parser
    is responsible for the authoritative rejection via ``NON_UTF8_LINE``).
    """
    lines: list[str] = []
    with open(file_path, "rb") as fh:
        for _ in range(max_lines):
            raw = fh.readline(ParseLimits.MAX_LINE_BYTES + 1)
            if not raw:
                break
            if len(raw) > ParseLimits.MAX_LINE_BYTES:
                # Overlong line — skip in the identity scan; structural
                # parser will reject the file.
                continue
            try:
                lines.append(raw.decode("utf-8"))
            except UnicodeDecodeError:
                continue
    return "\n".join(lines)


__all__ = [
    "MIN_MARKERS_FOR_MATCH",
    "MIN_MARKERS_FOR_MISMATCH",
    "TECHNIQUE_MARKERS",
    "register",
    "resolve",
    "list_techniques",
    "is_supported_extension",
    "classify_technique_identity",
    "collect_header_text",
]
