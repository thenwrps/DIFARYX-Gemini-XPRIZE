"""DIFARYX Phase 1B-B Step D1 - Parser registry tests.

Validates explicit registration, resolution, unknown-technique rejection,
and deterministic technique-identity classification. No container required.
"""

from __future__ import annotations

import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "server" / "python"))

from api.validation import parser_registry  # noqa: E402
from api.validation.parser_base import (  # noqa: E402
    ParseLimits,
    TechniqueIdentityClass,
    TechniqueParser,
    UnknownTechniqueError,
)
from api.validation.parser_registry import (  # noqa: E402
    MIN_MARKERS_FOR_MATCH,
    classify_technique_identity,
    collect_header_text,
    is_supported_extension,
    list_techniques,
    register,
    resolve,
)


class TestRegistryBasics(unittest.TestCase):
    def test_xrd_parser_registered_at_import(self):
        # Importing api.validation.parsers triggers registration.
        import api.validation.parsers  # noqa: F401
        self.assertIn("xrd", list_techniques())

    def test_resolve_returns_registered_parser(self):
        import api.validation.parsers  # noqa: F401
        p = resolve("xrd")
        self.assertEqual(p.technique, "xrd")
        self.assertIsInstance(p, TechniqueParser)
        self.assertIn(".xy", p.supported_extensions)

    def test_resolve_unknown_technique_raises(self):
        with self.assertRaises(UnknownTechniqueError):
            resolve("nonexistent_technique")

    def test_resolve_empty_string_raises(self):
        with self.assertRaises(UnknownTechniqueError):
            resolve("")

    def test_resolve_non_string_raises(self):
        with self.assertRaises((UnknownTechniqueError, TypeError)):
            resolve(None)  # type: ignore[arg-type]

    def test_duplicate_registration_raises(self):
        class DummyParser(TechniqueParser):
            technique = "dummy"
            supported_extensions = frozenset({".dum"})

            def parse_file(self, file_path, filename, output_path, limits=ParseLimits):
                raise NotImplementedError

        # First registration OK.
        register(DummyParser())
        # Second must fail.
        with self.assertRaises(ValueError):
            register(DummyParser())
        # Clean up so other tests aren't affected.
        with parser_registry._REGISTRY_LOCK:
            del parser_registry._REGISTRY["dummy"]

    def test_register_non_parser_raises(self):
        with self.assertRaises(TypeError):
            register("not a parser")  # type: ignore[arg-type]

    def test_register_empty_technique_raises(self):
        class EmptyParser(TechniqueParser):
            technique = ""
            supported_extensions = frozenset()

            def parse_file(self, file_path, filename, output_path, limits=ParseLimits):
                raise NotImplementedError

        with self.assertRaises(ValueError):
            register(EmptyParser())


class TestSupportedExtensions(unittest.TestCase):
    def test_xrd_supports_known_extensions(self):
        import api.validation.parsers  # noqa: F401
        for ext in ("data.xy", "data.txt", "data.csv", "data.dat", "data.asc"):
            self.assertTrue(is_supported_extension("xrd", ext), ext)

    def test_xrd_rejects_unsupported_extension(self):
        import api.validation.parsers  # noqa: F401
        self.assertFalse(is_supported_extension("xrd", "data.pdf"))
        self.assertFalse(is_supported_extension("xrd", "data.png"))
        self.assertFalse(is_supported_extension("xrd", "data.xlsx"))


class TestTechniqueIdentityClassification(unittest.TestCase):
    def test_explicit_match_two_markers(self):
        text = "2Theta Intensity\n# XRD powder diffraction scan"
        cls, matched = classify_technique_identity("xrd", text)
        self.assertEqual(cls, TechniqueIdentityClass.EXPLICIT_MATCH)
        self.assertIn("xrd", matched)
        self.assertGreaterEqual(len(matched["xrd"]), MIN_MARKERS_FOR_MATCH)

    def test_explicit_mismatch_xps_in_xrd(self):
        text = "Binding Energy (eV) Intensity\nC1s region"
        cls, matched = classify_technique_identity("xrd", text)
        self.assertEqual(cls, TechniqueIdentityClass.EXPLICIT_MISMATCH)
        self.assertIn("xps", matched)
        self.assertNotIn("xrd", matched)

    def test_ambiguous_markers(self):
        # Both XRD and FTIR discriminative markers present.
        text = "2Theta Wavenumber\n# XRD scan with FTIR transmittance"
        cls, matched = classify_technique_identity("xrd", text)
        self.assertEqual(cls, TechniqueIdentityClass.AMBIGUOUS_MARKERS)
        self.assertIn("xrd", matched)
        self.assertIn("ftir", matched)

    def test_no_identity_evidence_headerless(self):
        # Pure numeric data, no markers.
        text = "10.0 100.0\n20.0 200.0\n30.0 300.0"
        cls, matched = classify_technique_identity("xrd", text)
        self.assertEqual(cls, TechniqueIdentityClass.NO_IDENTITY_EVIDENCE)
        self.assertEqual(matched, {})

    def test_generic_unit_terms_do_not_establish_identity(self):
        # "Intensity", "Counts", "deg", "eV", "cm-1" alone must NOT establish
        # identity for any technique.
        for term in ("Intensity", "Counts", "deg", "eV", "cm-1"):
            cls, matched = classify_technique_identity("xrd", term)
            self.assertEqual(
                cls,
                TechniqueIdentityClass.NO_IDENTITY_EVIDENCE,
                f"generic term {term!r} should not establish identity",
            )
            self.assertEqual(matched, {}, f"generic term {term!r} matched markers")

    def test_single_declared_marker_is_not_match(self):
        # Only one XRD marker, no foreign markers → NO_IDENTITY_EVIDENCE
        # (single marker is a hint, not a confirmation).
        text = "2Theta 100.0\n20.0 200.0"
        cls, matched = classify_technique_identity("xrd", text)
        self.assertEqual(cls, TechniqueIdentityClass.NO_IDENTITY_EVIDENCE)


class TestCollectHeaderText(unittest.TestCase):
    def _write_temp(self, content: str) -> str:
        fd, path = tempfile.mkstemp(prefix="difaryx_test_")
        os.close(fd)
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(content)
        self.addCleanup(os.unlink, path)
        return path

    def test_collects_first_n_lines(self):
        lines = [f"line{i}" for i in range(300)]
        path = self._write_temp("\n".join(lines))
        text = collect_header_text(path, max_lines=10)
        self.assertIn("line0", text)
        self.assertIn("line9", text)
        self.assertNotIn("line10", text)

    def test_skips_non_utf8_lines(self):
        # Mix of valid and invalid UTF-8.
        fd, path = tempfile.mkstemp(prefix="difaryx_test_")
        os.close(fd)
        with open(path, "wb") as fh:
            fh.write(b"valid line\n")
            fh.write(b"\xff\xfe invalid\n")
            fh.write(b"another valid\n")
        self.addCleanup(os.unlink, path)
        text = collect_header_text(path, max_lines=10)
        self.assertIn("valid line", text)
        self.assertIn("another valid", text)
        # The invalid line is skipped, not included as replacement chars.
        self.assertNotIn("\ufffd", text)

    def test_skips_overlong_lines(self):
        # Line exceeding MAX_LINE_BYTES is skipped in the identity scan.
        fd, path = tempfile.mkstemp(prefix="difaryx_test_")
        os.close(fd)
        with open(path, "wb") as fh:
            fh.write(b"short header\n")
            fh.write(b"x" * (ParseLimits.MAX_LINE_BYTES + 1) + b"\n")
            fh.write(b"2Theta Intensity\n")
        self.addCleanup(os.unlink, path)
        text = collect_header_text(path, max_lines=10)
        # The 2Theta marker should still be found (overlong line skipped).
        self.assertIn("2Theta", text)


if __name__ == "__main__":
    unittest.main()
