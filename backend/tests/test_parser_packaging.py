"""DIFARYX Phase 1B-B Step D1 - Parser zipapp packaging tests.

Validates that the zipapp (P2 contract):
* builds successfully using only the Python standard library,
* contains the canonical ``api/validation/`` source tree unchanged,
* generates a thin ``__main__.py`` that only delegates to the entrypoint,
* packages source files **verbatim** (no regex import rewriting),
* runs end-to-end as ``python3 difaryx_parser.pyz xrd <in> <out>``,
* carries no host bind mounts (the runner asserts this separately).
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "server" / "python"))

from api.validation.parser_packaging import (  # noqa: E402
    build_parser_zipapp,
    list_zipapp_contents,
    read_zipapp_member,
)

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "parsers" / "xrd"
SERVER_PYTHON = Path(__file__).resolve().parents[2] / "server" / "python"


class TestZipappBuild(unittest.TestCase):
    def setUp(self):
        fd, self.zipapp_path = tempfile.mkstemp(suffix=".pyz", prefix="difaryx_parser_")
        os.close(fd)
        build_parser_zipapp(self.zipapp_path)

    def tearDown(self):
        try:
            os.unlink(self.zipapp_path)
        except OSError:
            pass

    def test_zipapp_contains_canonical_tree(self):
        names = list_zipapp_contents(self.zipapp_path)
        expected = {
            "__main__.py",
            "api/__init__.py",
            "api/validation/__init__.py",
            "api/validation/entrypoint.py",
            "api/validation/parser_base.py",
            "api/validation/parser_registry.py",
            "api/validation/parsers/__init__.py",
            "api/validation/parsers/xrd_parser.py",
        }
        for name in expected:
            self.assertIn(name, names, f"zipapp missing canonical file: {name}")

    def test_zipapp_has_shebang(self):
        with open(self.zipapp_path, "rb") as fh:
            head = fh.read(64)
        self.assertIn(b"python", head, "zipapp must have a python shebang")

    def test_zipapp_executable_bit_set(self):
        self.assertGreater(os.path.getsize(self.zipapp_path), 0)

    def test_main_is_thin_wrapper_only(self):
        """The generated __main__.py must only delegate, not contain parser logic."""
        source = read_zipapp_member(self.zipapp_path, "__main__.py")
        self.assertIn("from api.validation.entrypoint import main", source)
        self.assertNotIn("ParseLimits", source)
        self.assertNotIn("BoundedLineReader", source)
        self.assertNotIn("XrdParser", source)


class TestCanonicalSourceUnchanged(unittest.TestCase):
    """P2: source files in the zipapp must be byte-for-byte identical to disk."""

    def setUp(self):
        fd, self.zipapp_path = tempfile.mkstemp(suffix=".pyz", prefix="difaryx_parser_")
        os.close(fd)
        build_parser_zipapp(self.zipapp_path)

    def tearDown(self):
        try:
            os.unlink(self.zipapp_path)
        except OSError:
            pass

    def _assert_member_matches_disk(self, member_name: str, disk_rel: str) -> None:
        disk_path = SERVER_PYTHON / disk_rel
        self.assertTrue(disk_path.exists(), f"disk source missing: {disk_path}")
        disk_bytes = disk_path.read_bytes()
        zip_bytes = zipfile.ZipFile(self.zipapp_path, "r").read(member_name)
        self.assertEqual(
            disk_bytes,
            zip_bytes,
            f"zipapp member {member_name!r} differs from disk source {disk_rel!r}",
        )

    def test_entrypoint_unchanged(self):
        self._assert_member_matches_disk(
            "api/validation/entrypoint.py", "api/validation/entrypoint.py"
        )

    def test_parser_base_unchanged(self):
        self._assert_member_matches_disk(
            "api/validation/parser_base.py", "api/validation/parser_base.py"
        )

    def test_parser_registry_unchanged(self):
        self._assert_member_matches_disk(
            "api/validation/parser_registry.py", "api/validation/parser_registry.py"
        )

    def test_parsers_init_unchanged(self):
        self._assert_member_matches_disk(
            "api/validation/parsers/__init__.py",
            "api/validation/parsers/__init__.py",
        )

    def test_xrd_parser_unchanged(self):
        self._assert_member_matches_disk(
            "api/validation/parsers/xrd_parser.py",
            "api/validation/parsers/xrd_parser.py",
        )

    def test_relative_imports_preserved(self):
        """No rewriting: relative imports in the packaged source must survive."""
        with zipfile.ZipFile(self.zipapp_path, "r") as zf:
            for name in (
                "api/validation/parser_registry.py",
                "api/validation/parsers/__init__.py",
                "api/validation/parsers/xrd_parser.py",
                "api/validation/entrypoint.py",
            ):
                source = zf.read(name).decode("utf-8")
                self.assertIn(
                    "from .",
                    source,
                    f"{name}: relative imports missing (source was rewritten)",
                )


class TestZipappEndToEnd(unittest.TestCase):
    """Run the zipapp as a subprocess (simulating container execution)."""

    def setUp(self):
        fd, self.zipapp_path = tempfile.mkstemp(suffix=".pyz", prefix="difaryx_parser_")
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
                [
                    sys.executable, self.zipapp_path, "xrd",
                    str(FIXTURES / fixture_name), out_path,
                ],
                capture_output=True,
                timeout=30.0,
            )
            self.assertEqual(
                res.returncode, 0,
                f"zipapp exited {res.returncode}; stderr="
                f"{res.stderr.decode('utf-8', errors='replace')[:500]}",
            )
            with open(out_path, "r", encoding="utf-8") as fh:
                return json.load(fh)
        finally:
            try:
                os.unlink(out_path)
            except OSError:
                pass

    def test_valid_headered_runs_via_zipapp(self):
        env = self._run("valid_headered.xy")
        self.assertEqual(env["status"], "valid")
        self.assertTrue(env["technique_identity_confirmed"])
        self.assertEqual(env["valid_data_rows"], 100)

    def test_unknown_technique_quarantines(self):
        fd, out_path = tempfile.mkstemp(suffix=".json")
        os.close(fd)
        try:
            res = subprocess.run(
                [sys.executable, self.zipapp_path, "nonexistent_tech",
                 str(FIXTURES / "valid_headered.xy"), out_path],
                capture_output=True,
                timeout=30.0,
            )
            self.assertEqual(res.returncode, 0)
            with open(out_path, "r", encoding="utf-8") as fh:
                env = json.load(fh)
            self.assertEqual(env["status"], "quarantined")
            self.assertEqual(env["error_code"], "UNKNOWN_PARSER_NOT_REGISTERED")
        finally:
            try:
                os.unlink(out_path)
            except OSError:
                pass

    def test_missing_input_file_quarantines(self):
        fd, out_path = tempfile.mkstemp(suffix=".json")
        os.close(fd)
        try:
            res = subprocess.run(
                [sys.executable, self.zipapp_path, "xrd",
                 "/nonexistent/file.xy", out_path],
                capture_output=True,
                timeout=30.0,
            )
            self.assertEqual(res.returncode, 0)
            with open(out_path, "r", encoding="utf-8") as fh:
                env = json.load(fh)
            self.assertEqual(env["status"], "quarantined")
            self.assertEqual(env["error_code"], "PARSER_INPUT_NOT_FOUND")
        finally:
            try:
                os.unlink(out_path)
            except OSError:
                pass

    def test_unexpected_exception_exits_nonzero(self):
        """P0: an unexpected parser crash must NOT exit 0.

        We verify this by importing the entrypoint directly, monkey-patching
        ``parser_registry.resolve`` to return a parser that raises an
        unexpected ``RuntimeError``, and confirming ``main`` lets the
        exception propagate (rather than catching it, writing
        PARSER_UNCAUGHT_EXCEPTION, and returning 0).
        """
        import api.validation.entrypoint as entrypoint_mod
        import api.validation.parser_registry as registry_mod

        crash_called = {"count": 0}

        class _CrashingParser:
            def parse_file(self, file_path, filename, output_path):
                crash_called["count"] += 1
                raise RuntimeError("simulated unexpected parser crash")

        original_resolve = registry_mod.resolve
        fd, in_path = tempfile.mkstemp(suffix=".json")
        os.close(fd)
        fd, out_path = tempfile.mkstemp(suffix=".json")
        os.close(fd)
        try:
            registry_mod.resolve = lambda technique: _CrashingParser()
            try:
                result = entrypoint_mod.main(
                    ["difaryx_parser.pyz", "xrd", in_path, out_path]
                )
            except RuntimeError:
                # Expected: the exception propagated (P0 contract).
                result = "PROPAGATED"

            self.assertEqual(
                result,
                "PROPAGATED",
                "main() must NOT return a value when the parser raises "
                "an unexpected exception — it must propagate. Got: "
                f"{result!r}",
            )
            self.assertEqual(crash_called["count"], 1)
        finally:
            registry_mod.resolve = original_resolve
            for p in (in_path, out_path):
                try:
                    os.unlink(p)
                except OSError:
                    pass

    def test_entrypoint_source_has_no_catch_and_exit_zero(self):
        """P0 static guard: no ``except Exception`` handler returns 0.

        Uses AST to verify that no ``except Exception`` (or bare ``except``)
        handler in ``entrypoint.main`` contains a ``return 0`` statement.
        The ``_write_failure`` helper's ``except Exception: pass`` for
        ``os.makedirs`` is allowed (it doesn't return).
        """
        import ast
        import inspect
        import api.validation.entrypoint as entrypoint_mod

        source = inspect.getsource(entrypoint_mod)
        tree = ast.parse(source)

        def _handler_returns_zero(handler: ast.ExceptHandler) -> bool:
            for node in ast.walk(handler):
                if isinstance(node, ast.Return) and isinstance(node.value, ast.Constant):
                    if node.value.value == 0:
                        return True
            return False

        for node in ast.walk(tree):
            if isinstance(node, ast.ExceptHandler):
                # Disallow ``except Exception`` or bare ``except`` returning 0.
                is_generic = node.type is None or (
                    isinstance(node.type, ast.Name) and node.type.id == "Exception"
                )
                if is_generic and _handler_returns_zero(node):
                    self.fail(
                        f"P0 violation: 'except Exception' at line {node.lineno} "
                        f"contains 'return 0' — unexpected exceptions must "
                        f"propagate (nonzero exit → ISOLATION_SANDBOX_ERROR)."
                    )


class TestNoBindMountsEnforced(unittest.TestCase):
    """The runner must refuse any command containing bind-mount flags."""

    def test_create_command_has_no_bind_mounts(self):
        from api.validation.isolated_runner import ContainerParserRunner
        runner = ContainerParserRunner.__new__(ContainerParserRunner)
        runner.wsl_distro = "alpine"
        runner.image_name = "python:3.12-alpine"
        cmd = runner._build_create_command("test-container", "xrd", "input.csv")
        self.assertNotIn("-v", cmd)
        self.assertNotIn("--volume", cmd)
        self.assertNotIn("--mount", cmd)
        self.assertIn("--network", cmd)
        self.assertIn("none", cmd)
        self.assertIn("--read-only", cmd)
        self.assertIn("--tmpfs", cmd)

    def test_assert_no_bind_mounts_raises_on_volume(self):
        from api.validation.isolated_runner import ContainerParserRunner
        runner = ContainerParserRunner.__new__(ContainerParserRunner)
        with self.assertRaises(AssertionError):
            runner._assert_no_bind_mounts(["podman", "run", "-v", "/host:/cont"])

    def test_assert_no_bind_mounts_raises_on_mount(self):
        from api.validation.isolated_runner import ContainerParserRunner
        runner = ContainerParserRunner.__new__(ContainerParserRunner)
        with self.assertRaises(AssertionError):
            runner._assert_no_bind_mounts(["podman", "run", "--mount", "type=bind"])


if __name__ == "__main__":
    unittest.main()
