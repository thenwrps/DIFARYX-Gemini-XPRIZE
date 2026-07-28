"""Server-authoritative filename normalization for persistent uploads."""

from __future__ import annotations

from pathlib import Path
import re


SAFE_FILENAME_RE = re.compile(r"[^A-Za-z0-9._() -]+")


def sanitize_display_filename(filename: str) -> str:
    base = filename.replace("\\", "/").split("/")[-1].strip()
    sanitized = SAFE_FILENAME_RE.sub("_", base)
    sanitized = re.sub(r"\s+", " ", sanitized).strip(" .")
    if not sanitized:
        sanitized = "xrd-signal.dat"
    if len(sanitized) > 500:
        suffix = Path(sanitized).suffix[:20]
        sanitized = f"{sanitized[: max(1, 500 - len(suffix))]}{suffix}"
    return sanitized
