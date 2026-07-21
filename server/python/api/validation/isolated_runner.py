"""DIFARYX Phase 1B-B Step D1 - Isolated container parser runner.

Builds a no-bind parser zipapp on the host, copies it into the container with
``podman cp`` (never a host bind mount), runs the technique-specific parser
inside the sandboxed container, and reads the validated JSON ``ParserResult``
envelope back from ``/scratch/result.json`` via a second ``podman cp``.

stdout/stderr are reserved for diagnostics; the result channel is the file.

The host validates the JSON envelope against ``ParseLimits.MAX_OUTPUT_JSON_BYTES``
and the strict ``ParserResult`` schema before returning it to the worker. Any
protocol violation becomes a ``PARSER_JSON_*`` quarantine.
"""

from __future__ import annotations

import json
import logging
import os
import platform
import re
import subprocess
import sys
import tempfile
import uuid
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Sequence

logger = logging.getLogger("difaryx.validation.isolated_runner")

_UNSAFE_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_FORBIDDEN_BIND_ARGS = {"-v", "--volume", "--mount"}
_SUMMARY_LIMIT_BYTES = 2048


def _coerce_bytes(value: Any) -> bytes:
    if value is None:
        return b""
    if isinstance(value, bytes):
        return value
    if isinstance(value, str):
        return value.encode("utf-8", errors="replace")
    return str(value).encode("utf-8", errors="replace")


def _truncate_utf8_bytes(text: str, limit_bytes: int) -> str:
    encoded = text.encode("utf-8")
    if len(encoded) <= limit_bytes:
        return text

    suffix = "..."
    suffix_bytes = suffix.encode("utf-8")
    budget = max(0, limit_bytes - len(suffix_bytes))
    truncated = encoded[:budget]
    while truncated:
        try:
            return truncated.decode("utf-8") + suffix
        except UnicodeDecodeError:
            truncated = truncated[:-1]
    return suffix[:limit_bytes]


def _normalize_hostile_text(value: Any, limit_bytes: int = _SUMMARY_LIMIT_BYTES) -> str:
    text = _coerce_bytes(value).decode("utf-8", errors="replace")
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = _UNSAFE_CONTROL_CHARS.sub("", text)
    text = re.sub(r"[^\S\n]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    if not text:
        return ""
    return _truncate_utf8_bytes(text, limit_bytes)


class IsolatedRuntimeError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        returncode: int | None = None,
        stdout: Any = b"",
        stderr: Any = b"",
        container_exit_code: int | None = None,
        container_inspect: Any = "",
        container_logs: Any = "",
    ) -> None:
        super().__init__(message)
        self.returncode = returncode
        self.stdout_summary = _normalize_hostile_text(stdout)
        self.stderr_summary = _normalize_hostile_text(stderr)
        self.container_exit_code = container_exit_code
        self.container_inspect = _normalize_hostile_text(container_inspect)
        self.container_logs = _normalize_hostile_text(container_logs, limit_bytes=8192)


class IsolatedParserRunner(ABC):
    @abstractmethod
    async def self_check(self) -> bool:
        """Verify sandbox availability and egress denial."""
        pass

    @abstractmethod
    async def run_parser(
        self,
        technique: str,
        input_path: str,
        output_path: str,
        timeout: float = 30.0,
    ) -> Dict[str, Any]:
        """Run the technique-specific parser inside the isolated container."""
        pass


class ContainerParserRunner(IsolatedParserRunner):
    def __init__(self, wsl_distro: str = "alpine", image_name: str = "python:3.12-alpine"):
        self.wsl_distro = wsl_distro
        self.image_name = image_name
        self.last_lifecycle_commands: List[Dict[str, Any]] = []
        self.last_start_result: Dict[str, Any] = {}
        self.last_container_diagnostics: Dict[str, Any] = {}
        self._zipapp_path: str | None = None

    def _is_windows(self) -> bool:
        return platform.system() == "Windows" or sys.platform == "win32"

    def _container_cmd(self, *args: str) -> List[str]:
        if self._is_windows():
            return ["wsl", "-d", self.wsl_distro, "--", *args]
        return list(args)

    def _to_wsl_path(self, win_path: str) -> str:
        abs_path = os.path.abspath(win_path)
        posix_path = abs_path.replace("\\", "/")
        match = re.match(r"^([a-zA-Z]):/(.*)", posix_path)
        if match:
            drive = match.group(1).lower()
            rest = match.group(2)
            return f"/mnt/{drive}/{rest}"
        return posix_path

    def _record_command(self, label: str, cmd: Sequence[str]) -> None:
        self.last_lifecycle_commands.append({"label": label, "cmd": list(cmd)})
        logger.info("%s command: %s", label, " ".join(cmd))

    def _assert_no_bind_mounts(self, cmd: Sequence[str]) -> None:
        forbidden = [arg for arg in cmd if arg in _FORBIDDEN_BIND_ARGS]
        if forbidden:
            raise AssertionError(
                f"Bind mounts are prohibited for isolated parser execution: {forbidden}"
            )

    def _run_command(self, cmd: Sequence[str], timeout: float) -> subprocess.CompletedProcess:
        return subprocess.run(list(cmd), capture_output=True, timeout=timeout)

    def _raise_process_error(
        self,
        action: str,
        res: subprocess.CompletedProcess,
    ) -> None:
        stderr_summary = _normalize_hostile_text(res.stderr)
        stdout_summary = _normalize_hostile_text(res.stdout)
        detail = stderr_summary or stdout_summary or "no diagnostics captured"
        raise IsolatedRuntimeError(
            f"{action} failed (code {res.returncode}): {detail}",
            returncode=res.returncode,
            stdout=res.stdout,
            stderr=res.stderr,
        )

    # ------------------------------------------------------------------
    # Zipapp packaging (built once per runner instance, cached on disk)
    # ------------------------------------------------------------------
    def _ensure_zipapp(self) -> str:
        if self._zipapp_path and os.path.exists(self._zipapp_path):
            return self._zipapp_path
        from api.validation.parser_packaging import build_parser_zipapp

        fd, tmp_path = tempfile.mkstemp(suffix=".pyz", prefix="difaryx_parser_")
        os.close(fd)
        try:
            build_parser_zipapp(tmp_path)
            self._zipapp_path = tmp_path
            return tmp_path
        except Exception:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
            raise

    # ------------------------------------------------------------------
    # Container lifecycle command builders
    # ------------------------------------------------------------------
    def _build_create_command(
        self,
        container_name: str,
        technique: str,
        input_filename: str,
    ) -> List[str]:
        cmd = self._container_cmd(
            "podman", "create",
            "--name", container_name,
            "--network", "none",
            "--read-only",
            "--cap-drop=ALL",
            "--security-opt=no-new-privileges",
            "--user", "1000:1000",
            "--memory", "128m",
            "--cpus", "0.5",
            "--pids-limit", "16",
            "--tmpfs", "/scratch:rw,size=16m",
            self.image_name,
            "python3", "/tmp/difaryx_parser.pyz",
            technique,
            f"/tmp/{input_filename}",
            "/scratch/result.json",
        )
        self._assert_no_bind_mounts(cmd)
        return cmd

    def _build_copy_command(
        self, source_path: str, destination_path: str, container_name: str
    ) -> List[str]:
        cmd = self._container_cmd(
            "podman", "cp",
            source_path,
            f"{container_name}:{destination_path}",
        )
        self._assert_no_bind_mounts(cmd)
        return cmd

    def _build_copy_out_command(
        self, container_path: str, host_path: str, container_name: str
    ) -> List[str]:
        cmd = self._container_cmd(
            "podman", "cp",
            f"{container_name}:{container_path}",
            host_path,
        )
        self._assert_no_bind_mounts(cmd)
        return cmd

    def _build_start_command(self, container_name: str) -> List[str]:
        cmd = self._container_cmd("podman", "start", "-a", container_name)
        self._assert_no_bind_mounts(cmd)
        return cmd

    def _build_remove_command(self, container_name: str) -> List[str]:
        cmd = self._container_cmd("podman", "rm", "-f", container_name)
        self._assert_no_bind_mounts(cmd)
        return cmd

    def _build_inspect_command(self, container_name: str) -> List[str]:
        cmd = self._container_cmd(
            "podman", "inspect", "--format", "{{.State.ExitCode}} {{.State.Error}}",
            container_name,
        )
        self._assert_no_bind_mounts(cmd)
        return cmd

    def _build_logs_command(self, container_name: str) -> List[str]:
        cmd = self._container_cmd("podman", "logs", container_name)
        self._assert_no_bind_mounts(cmd)
        return cmd

    def _collect_container_diagnostics(self, container_name: str) -> Dict[str, Any]:
        """Collect bounded diagnostics while the container still exists."""
        diagnostics: Dict[str, Any] = {}
        for label, command, limit in (
            ("inspect", self._build_inspect_command(container_name), _SUMMARY_LIMIT_BYTES),
            ("logs", self._build_logs_command(container_name), 8192),
        ):
            self._record_command(f"podman {label}", command)
            try:
                result = self._run_command(command, timeout=30.0)
                diagnostics[label] = {
                    "returncode": result.returncode,
                    "stdout_summary": _normalize_hostile_text(result.stdout, limit),
                    "stderr_summary": _normalize_hostile_text(result.stderr, limit),
                }
            except subprocess.TimeoutExpired as exc:
                diagnostics[label] = {
                    "returncode": None,
                    "stdout_summary": _normalize_hostile_text(getattr(exc, "output", b""), limit),
                    "stderr_summary": _normalize_hostile_text(getattr(exc, "stderr", b""), limit),
                    "timeout": True,
                }
            except Exception as exc:
                diagnostics[label] = {
                    "returncode": None,
                    "stdout_summary": "",
                    "stderr_summary": _normalize_hostile_text(str(exc), limit),
                }
        return diagnostics

    def _diagnostic_summaries(self) -> tuple[str, str]:
        inspect_diagnostics = self.last_container_diagnostics.get("inspect", {})
        inspect_summary = inspect_diagnostics.get("stdout_summary", "") or inspect_diagnostics.get(
            "stderr_summary", ""
        )
        logs_diagnostics = self.last_container_diagnostics.get("logs", {})
        container_logs = logs_diagnostics.get("stdout_summary", "") or logs_diagnostics.get(
            "stderr_summary", ""
        )
        return inspect_summary, container_logs

    # ------------------------------------------------------------------
    # Self-check
    # ------------------------------------------------------------------
    async def self_check(self) -> bool:
        logger.info("Starting ContainerParserRunner self-check...")
        try:
            cmd_check = self._container_cmd("podman", "--version")
            res = self._run_command(cmd_check, timeout=120.0)
            if res.returncode != 0:
                logger.error("Podman not found: %s", _normalize_hostile_text(res.stderr))
                return False

            cmd_egress = self._container_cmd(
                "podman", "run",
                "--network", "none",
                "--rm",
                self.image_name,
                "python3", "-c",
                "import urllib.request; urllib.request.urlopen('http://1.1.1.1', timeout=1.0)"
            )
            try:
                res_egress = self._run_command(cmd_egress, timeout=120.0)
            except subprocess.TimeoutExpired:
                logger.info("Egress check passed: subprocess timed out (egress blocked).")
                return True

            if res_egress.returncode == 0:
                logger.critical(
                    "Security Failure: Outbound network egress check SUCCEEDED inside container under --network none."
                )
                return False

            stderr = _normalize_hostile_text(res_egress.stderr).lower()
            if (
                "network unreachable" in stderr
                or "errno 101" in stderr
                or "unreachable" in stderr
                or "urlerror" in stderr
                or "timed out" in stderr
            ):
                logger.info("Egress check passed: Outbound connection successfully blocked.")
                return True
            logger.error(
                "Egress check failed with unexpected error: %s",
                _normalize_hostile_text(res_egress.stderr),
            )
            return False

        except Exception as e:
            logger.exception(f"Exception during self-check execution: {e}")
            return False

    # ------------------------------------------------------------------
    # Result-channel validation
    # ------------------------------------------------------------------
    def _validate_result_envelope(self, raw_bytes: bytes) -> Dict[str, Any]:
        """Validate the raw JSON bytes from /scratch/result.json.

        Returns the parsed envelope dict on success. Raises
        ``IsolatedRuntimeError`` with a ``PARSER_JSON_*`` failure code in the
        message on protocol violation.
        """
        from api.validation.parser_base import (
            ParseLimits,
            ParserResult,
            ParserResultValidationError,
            RESULT_STATUS_QUARANTINED,
            TechniqueIdentityClass,
        )

        if len(raw_bytes) > ParseLimits.MAX_OUTPUT_JSON_BYTES + 1:
            raise IsolatedRuntimeError(
                f"PARSER_JSON_OVERSIZED: result channel returned {len(raw_bytes)} bytes "
                f"(cap={ParseLimits.MAX_OUTPUT_JSON_BYTES + 1})"
            )
        if not raw_bytes:
            raise IsolatedRuntimeError("PARSER_JSON_MALFORMED: result channel was empty")

        # Strict UTF-8 decode first (no replacement chars).
        try:
            text = raw_bytes.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise IsolatedRuntimeError(
                f"PARSER_JSON_MALFORMED: result channel is not valid UTF-8: {exc}"
            ) from exc

        # Detect multiple JSON objects (trailing content after the first).
        decoder = json.JSONDecoder()
        try:
            envelope, idx = decoder.raw_decode(text.strip())
        except json.JSONDecodeError as exc:
            raise IsolatedRuntimeError(
                f"PARSER_JSON_MALFORMED: result channel is not valid JSON: {exc}"
            ) from exc
        trailing = text.strip()[idx:].strip()
        if trailing:
            raise IsolatedRuntimeError(
                "PARSER_MULTIPLE_ENVELOPES: trailing content after first JSON object"
            )

        if not isinstance(envelope, dict):
            raise IsolatedRuntimeError(
                "PARSER_JSON_MALFORMED: result channel JSON is not an object"
            )

        # Validate against the strict ParserResult schema.
        try:
            ParserResult(envelope)
        except ParserResultValidationError as exc:
            # Rewrite to a quarantine envelope so the host can still settle.
            logger.error("ParserResult schema validation failed: %s", exc)
            raise IsolatedRuntimeError(
                f"PARSER_JSON_MALFORMED: schema validation failed: {exc}"
            ) from exc

        return envelope

    # ------------------------------------------------------------------
    # Main entrypoint
    # ------------------------------------------------------------------
    async def run_parser(
        self,
        technique: str,
        input_path: str,
        output_path: str,
        timeout: float = 30.0,
    ) -> Dict[str, Any]:
        """Run the technique-specific parser inside the isolated container.

        Args:
            technique: Declared technique (e.g. "xrd"). Selects the parser
                via the registry. No generic fallback.
            input_path: Host path of the verified input snapshot.
            output_path: Host path where the validated JSON envelope is saved.
            timeout: Host wall-clock deadline in seconds.
        """
        if not await self.self_check():
            raise RuntimeError(
                "Container parser sandbox safety self-check failed; refusing to run parser."
            )

        self.last_lifecycle_commands = []
        self.last_start_result = {}
        self.last_container_diagnostics = {}
        input_filename = os.path.basename(input_path)
        zipapp_host = self._to_wsl_path(self._ensure_zipapp())
        input_host = self._to_wsl_path(input_path)
        container_name = f"difaryx-parser-{uuid.uuid4().hex[:12]}"
        # Result channel host path — the parser writes to /scratch/result.json
        # inside the container; we copy it back here. The local read target
        # stays the Windows path; the podman cp destination must be a WSL path
        # so WSL/podman does not misinterpret the drive letter as a container
        # name (e.g. ``C`` from ``C:\\Users\\...``).
        result_host = output_path
        result_host_wsl = self._to_wsl_path(output_path)

        try:
            # 1. Create container (no bind mounts; tmpfs at /scratch).
            create_cmd = self._build_create_command(
                container_name, technique, input_filename
            )
            self._record_command("podman create", create_cmd)
            create_res = self._run_command(create_cmd, timeout=120.0)
            if create_res.returncode != 0:
                self._raise_process_error("Container create", create_res)

            # 2. Copy parser zipapp into container (no host mount).
            copy_parser_cmd = self._build_copy_command(
                zipapp_host, "/tmp/difaryx_parser.pyz", container_name
            )
            self._record_command("podman cp parser zipapp", copy_parser_cmd)
            copy_parser_res = self._run_command(copy_parser_cmd, timeout=120.0)
            if copy_parser_res.returncode != 0:
                self._raise_process_error("Parser zipapp copy", copy_parser_res)

            # 3. Copy input file into container.
            copy_input_cmd = self._build_copy_command(
                input_host, f"/tmp/{input_filename}", container_name
            )
            self._record_command("podman cp input", copy_input_cmd)
            copy_input_res = self._run_command(copy_input_cmd, timeout=120.0)
            if copy_input_res.returncode != 0:
                self._raise_process_error("Container input copy", copy_input_res)

            # 4. Run parser inside container (exit 0 = envelope written).
            start_cmd = self._build_start_command(container_name)
            self._record_command("podman start -a", start_cmd)
            try:
                res = self._run_command(start_cmd, timeout=timeout)
            except subprocess.TimeoutExpired as exc:
                self.last_container_diagnostics = self._collect_container_diagnostics(container_name)
                inspect_summary, container_logs = self._diagnostic_summaries()
                logger.error(
                    "Parser container exceeded wall-clock timeout of %ss.", timeout
                )
                detail = f"Parser execution timed out after {timeout}s"
                if inspect_summary:
                    detail += f"; container inspect: {inspect_summary}"
                if container_logs:
                    detail += f"; container logs: {container_logs}"
                raise IsolatedRuntimeError(
                    detail,
                    stdout=getattr(exc, "output", b""),
                    stderr=getattr(exc, "stderr", b""),
                    container_inspect=inspect_summary,
                    container_logs=container_logs,
                ) from exc

            self.last_start_result = {
                "returncode": res.returncode,
                "stdout_summary": _normalize_hostile_text(res.stdout),
                "stderr_summary": _normalize_hostile_text(res.stderr),
            }
            success_diagnostics_enabled = os.getenv(
                "DIFARYX_CONTAINER_SUCCESS_DIAGNOSTICS", ""
            ).strip().lower() in {"1", "true", "yes", "on"}
            if res.returncode != 0 or success_diagnostics_enabled:
                self.last_container_diagnostics = self._collect_container_diagnostics(container_name)
            inspect_summary, container_logs = self._diagnostic_summaries()

            # Exit code 3 = OOM (parser signaled). Anything non-zero other
            # than the envelope-written case is a sandbox error.
            if res.returncode == 3:
                raise IsolatedRuntimeError(
                    "Parser container exited with OOM signal (code 3)"
                    + (f"; container inspect: {inspect_summary}" if inspect_summary else "")
                    + (f"; container logs: {container_logs}" if container_logs else ""),
                    returncode=res.returncode,
                    stdout=res.stdout,
                    stderr=res.stderr,
                    container_exit_code=res.returncode,
                    container_inspect=inspect_summary,
                    container_logs=container_logs,
                )
            if res.returncode != 0:
                logger.error(
                    "Parser container exited with code %s. Stderr: %s",
                    res.returncode,
                    _normalize_hostile_text(res.stderr),
                )
                detail = "Parser execution"
                if inspect_summary:
                    detail += f"; container inspect: {inspect_summary}"
                if container_logs:
                    detail += f"; container logs: {container_logs}"
                raise IsolatedRuntimeError(
                    f"{detail} failed (code {res.returncode})",
                    returncode=res.returncode,
                    stdout=res.stdout,
                    stderr=res.stderr,
                    container_exit_code=res.returncode,
                    container_inspect=inspect_summary,
                    container_logs=container_logs,
                )

            # 5. Copy result channel back to host. The podman cp destination
            # must be a WSL path so WSL/podman does not misinterpret the
            # Windows drive letter (e.g. ``C:``) as a container name.
            copy_out_cmd = self._build_copy_out_command(
                "/scratch/result.json", result_host_wsl, container_name
            )
            self._record_command("podman cp result.json out", copy_out_cmd)
            copy_out_res = self._run_command(copy_out_cmd, timeout=120.0)
            if copy_out_res.returncode != 0:
                self._raise_process_error("Result channel copy-out", copy_out_res)

            # 6. Read and validate the result envelope.
            try:
                with open(result_host, "rb") as fh:
                    raw_bytes = fh.read()
            except OSError as exc:
                raise IsolatedRuntimeError(
                    f"PARSER_JSON_MALFORMED: cannot read result channel: {exc}"
                ) from exc

            envelope = self._validate_result_envelope(raw_bytes)

            # Re-write the validated envelope to output_path (normalized).
            try:
                with open(output_path, "w", encoding="utf-8") as f:
                    f.write(json.dumps(envelope, separators=(",", ":")))
            except Exception as exc:
                logger.error(
                    "Failed to write validated parser output to host path '%s': %s",
                    output_path, exc,
                )
                raise RuntimeError(f"Host failed to save parser output: {exc}") from exc

            return envelope
        finally:
            remove_cmd = self._build_remove_command(container_name)
            self._record_command("podman rm -f", remove_cmd)
            remove_res = self._run_command(remove_cmd, timeout=120.0)
            if remove_res.returncode != 0:
                logger.warning(
                    "Forced container cleanup failed for %s: %s",
                    container_name,
                    _normalize_hostile_text(remove_res.stderr or remove_res.stdout),
                )


# tempfile is imported at the top of the module.


__all__ = [
    "IsolatedParserRunner",
    "ContainerParserRunner",
    "IsolatedRuntimeError",
]
