"""DIFARYX Phase 1B-B Step D1 - Parser package builder (no-bind zipapp).

Builds a single self-contained ``.pyz`` zipapp containing the **canonical**
``api.validation`` parser package tree, unchanged. The zipapp is copied into
the isolated container with ``podman cp`` (no host bind mounts) and run as:

    python3 /tmp/difaryx_parser.pyz <technique> <input_path> <output_path>

P2 contract — canonical packaging (no source transformation):

* The source files are copied **verbatim** into the zipapp, preserving the
  ``api/validation/`` package layout. No regex import rewriting is performed.
* A thin ``__main__.py`` is generated at the zipapp root whose sole job is
  ``from api.validation.entrypoint import main; sys.exit(main(sys.argv))``.
* All parser source files use idiomatic relative imports
  (``from .parser_base import ...``), which resolve identically inside the
  zipapp (where ``api`` is a top-level package) and on the host (where the
  files live under ``server/python/api/validation/``).
* Host tests and the container execute the **same source files** — the
  zipapp is a packaging of the on-disk tree, not a transformed copy.

Only the Python standard library is used — no ``unzip`` shell command is
required inside the container (zipapps are natively supported by Python).
"""

from __future__ import annotations

import os
import tempfile
import zipapp
import zipfile
from pathlib import Path


# ---------------------------------------------------------------------------
# Source tree
# ---------------------------------------------------------------------------
def _source_root() -> Path:
    """Return the repository ``server/python/`` directory.

    ``parser_packaging.py`` lives at ``server/python/api/validation/``, so
    the source root is three parents up.
    """
    return Path(__file__).resolve().parents[2]


# Files (relative to ``server/python/``) included verbatim in the zipapp.
# The ``api/validation/`` package tree is packaged unchanged so that
# relative imports resolve identically on host and in-container.
_PACKAGE_FILES: tuple[str, ...] = (
    "api/__init__.py",
    "api/validation/__init__.py",
    "api/validation/entrypoint.py",
    "api/validation/parser_base.py",
    "api/validation/parser_registry.py",
    "api/validation/parsers/__init__.py",
    "api/validation/parsers/xrd_parser.py",
)

# Thin entrypoint generated at the zipapp root. It MUST NOT contain parser
# logic — it only delegates to ``api.validation.entrypoint.main``.
_MAIN_TEMPLATE = (
    "#!{interpreter}\n"
    "import sys\n"
    "from api.validation.entrypoint import main\n"
    "if __name__ == '__main__':\n"
    "    sys.exit(main(sys.argv))\n"
)


def build_parser_zipapp(output_path: str) -> str:
    """Build the parser zipapp at ``output_path`` and return it.

    The zipapp preserves the canonical ``api/validation/`` source tree
    unchanged. A thin ``__main__.py`` is generated at the root to delegate
    to ``api.validation.entrypoint.main``. No source files are transformed.
    """
    src_root = _source_root()

    with tempfile.TemporaryDirectory(prefix="difaryx_parser_pkg_") as tmpdir:
        tmp_root = Path(tmpdir)

        # 1. Copy canonical source files verbatim (no rewriting).
        for rel_path in _PACKAGE_FILES:
            src_path = src_root / rel_path
            if not src_path.exists():
                raise FileNotFoundError(
                    f"Canonical parser source missing: {src_path}"
                )
            dst_path = tmp_root / rel_path
            dst_path.parent.mkdir(parents=True, exist_ok=True)
            # Read bytes and write bytes to avoid any line-ending translation.
            dst_path.write_bytes(src_path.read_bytes())

        # 2. Generate the thin __main__.py at the zipapp root.
        main_path = tmp_root / "__main__.py"
        main_path.write_text(
            _MAIN_TEMPLATE.format(interpreter="/usr/bin/env python3"),
            encoding="utf-8",
        )

        # 3. Build the zipapp from the staged tree.
        zipapp.create_archive(
            tmp_root,
            target=output_path,
            interpreter="/usr/bin/env python3",
        )

    os.chmod(output_path, 0o755)
    return output_path


def parser_zipapp_bytes() -> bytes:
    """Build the zipapp into an in-memory bytes object (for inspection/tests)."""
    fd, tmp_path = tempfile.mkstemp(suffix=".pyz", prefix="difaryx_parser_")
    os.close(fd)
    try:
        build_parser_zipapp(tmp_path)
        with open(tmp_path, "rb") as fh:
            return fh.read()
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


def list_zipapp_contents(zipapp_path: str) -> list[str]:
    """Return the list of file names inside the zipapp (for verification)."""
    with zipfile.ZipFile(zipapp_path, "r") as zf:
        return zf.namelist()


def read_zipapp_member(zipapp_path: str, member_name: str) -> str:
    """Return the decoded source of a zipapp member (for verifying no transform)."""
    with zipfile.ZipFile(zipapp_path, "r") as zf:
        return zf.read(member_name).decode("utf-8")


__all__ = [
    "build_parser_zipapp",
    "parser_zipapp_bytes",
    "list_zipapp_contents",
    "read_zipapp_member",
]
