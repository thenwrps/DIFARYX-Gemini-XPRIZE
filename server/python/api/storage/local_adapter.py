"""Local filesystem ObjectStore adapter with O_CREAT|O_EXCL staging semantics."""

from __future__ import annotations

import hashlib
import mimetypes
import os
from pathlib import Path
import time
from typing import AsyncIterator, Optional

import aiofiles

from .protocol import (
    ObjectMetadata,
    ObjectStore,
    PromotionConflictError,
    PutObjectResult,
    StagingConflictError,
    StagingOverflowError,
    StagingResult,
    StagingWriter,
)

STAGING_PREFIX = "_staging"
UPLOAD_SESSION_TTL_SECONDS = int(os.getenv("DIFARYX_UPLOAD_SESSION_TTL_SECONDS", "3600"))
ORPHAN_GRACE_PERIOD = UPLOAD_SESSION_TTL_SECONDS + 300


class LocalStagingWriter(StagingWriter):
    """Writes to local staging file with SHA-256 and byte limit enforcement."""

    def __init__(self, staging_path: Path, staging_key: str, max_bytes: int):
        self._path = staging_path
        self._key = staging_key
        self._max_bytes = max_bytes
        self._hasher = hashlib.sha256()
        self._byte_count = 0
        self._closed = False
        self._file_handle = None

    async def open(self) -> LocalStagingWriter:
        self._file_handle = await aiofiles.open(self._path, "wb")
        return self

    async def write_chunk(self, chunk: bytes) -> None:
        if self._closed:
            raise RuntimeError("Writer is closed")
        self._byte_count += len(chunk)
        if self._byte_count > self._max_bytes:
            await self.abort()
            raise StagingOverflowError(f"Exceeded {self._max_bytes} bytes")
        self._hasher.update(chunk)
        try:
            if self._file_handle is None:
                self._file_handle = await aiofiles.open(self._path, "ab")
            await self._file_handle.write(chunk)
        except BaseException:
            await self.abort()
            raise

    async def finish(self) -> StagingResult:
        self._closed = True
        if self._file_handle is not None:
            await self._file_handle.close()
            self._file_handle = None
        return StagingResult(
            staging_key=self._key,
            byte_size=self._byte_count,
            sha256_hex=self._hasher.hexdigest(),
        )

    async def abort(self) -> None:
        self._closed = True
        if self._file_handle is not None:
            try:
                await self._file_handle.close()
            except Exception:
                pass
            self._file_handle = None
        if self._path.exists():
            self._path.unlink()


class LocalObjectStore(ObjectStore):
    """Local filesystem storage with O_CREAT|O_EXCL staging semantics."""

    def __init__(self, base_path: Path):
        if not base_path.is_absolute():
            raise ValueError("base_path must be absolute")
        
        # Repo root dynamically derived
        repo_root = Path(__file__).resolve().parents[4]
        
        # Verify repository root contains a known marker
        if not (repo_root / "docker-compose.yml").exists() and not (repo_root / ".git").exists():
            raise RuntimeError(f"Repository root marker not found at: {repo_root}")

        resolved_base = base_path.resolve()
        resolved_repo = repo_root.resolve()

        if resolved_base == resolved_repo or resolved_repo in resolved_base.parents:
            raise ValueError(f"Storage base_path must be outside the repository: {base_path}")

        self._base = base_path
        self._staging = base_path / STAGING_PREFIX
        self._base.mkdir(parents=True, exist_ok=True)
        self._staging.mkdir(parents=True, exist_ok=True)

    def _staging_path(self, object_key: str) -> Path:
        self._validate_key(object_key, check_prefix=True)
        return self._safe_resolve(self._staging, object_key.replace("/", "_"), check_prefix=False)

    def _final_path(self, object_key: str) -> Path:
        return self._safe_resolve(self._base, object_key, check_prefix=True)

    def _validate_key(self, object_key: str, check_prefix: bool = True) -> None:
        if not object_key:
            raise ValueError("Empty object_key")

        parts = [p for p in object_key.replace("\\", "/").split("/") if p]
        if not parts:
            raise ValueError(f"Invalid object_key (no parts): {object_key}")

        if any(p in (".", "..") for p in parts):
            raise ValueError(f"Directory traversal sequences not allowed: {object_key}")

        if check_prefix:
            allowed_prefixes = {"datasets", "objects", "test", "org", "final", "_staging", "test-fixtures"}
            if parts[0] not in allowed_prefixes:
                raise ValueError(f"Invalid object_key prefix: {parts[0]}. Expected one of {allowed_prefixes}")

    def _safe_resolve(self, base_dir: Path, relative_path: str, check_prefix: bool = True) -> Path:
        self._validate_key(relative_path, check_prefix=check_prefix)
        
        rel_path = Path(relative_path)
        if rel_path.is_absolute() or rel_path.drive:
            raise ValueError(f"Absolute path/drive not allowed: {relative_path}")

        resolved_base = base_dir.resolve()
        target_path = (resolved_base / rel_path).resolve(strict=False)

        try:
            target_path.relative_to(resolved_base)
        except ValueError:
            raise ValueError(f"Directory traversal attempt blocked: {relative_path}")

        return target_path

    async def begin_staging(self, object_key: str, max_bytes: int) -> StagingWriter:
        staging_path = self._staging_path(object_key)
        staging_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            fd = os.open(str(staging_path), os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o644)
            os.close(fd)
        except FileExistsError:
            raise StagingConflictError(f"Staging already exists: {object_key}")
        writer = LocalStagingWriter(staging_path, f"{STAGING_PREFIX}/{object_key}", max_bytes)
        await writer.open()
        return writer

    async def promote_staging(self, staging_key: str, final_key: str) -> PutObjectResult:
        self._validate_key(final_key)
        staging_key_clean = staging_key.removeprefix(f"{STAGING_PREFIX}/")
        staging_path = self._staging_path(staging_key_clean)
        final_path = self._final_path(final_key)

        if not staging_path.exists():
            raise FileNotFoundError(f"Staging not found: {staging_key}")

        staging_hash = hashlib.sha256()
        async with aiofiles.open(staging_path, "rb") as f:
            while chunk := await f.read(65536):
                staging_hash.update(chunk)
        staging_digest = staging_hash.hexdigest()
        staging_size = staging_path.stat().st_size

        final_path.parent.mkdir(parents=True, exist_ok=True)

        try:
            if os.name == 'nt':
                os.rename(str(staging_path), str(final_path))
            else:
                try:
                    os.link(str(staging_path), str(final_path))
                    os.unlink(str(staging_path))
                except OSError:
                    if final_path.exists():
                        raise FileExistsError()
                    os.rename(str(staging_path), str(final_path))
            
            sha_path = final_path.with_suffix(final_path.suffix + ".sha256")
            async with aiofiles.open(sha_path, "w") as f:
                await f.write(staging_digest)

        except FileExistsError:
            staging_path.unlink()
            try:
                meta = await self.head_object(final_key)
                final_digest = meta.sha256_hex
            except Exception:
                final_digest = None

            if final_digest != staging_digest:
                raise PromotionConflictError(
                    f"Content mismatch: staging={staging_digest}, final={final_digest}"
                )
            return PutObjectResult(final_key, final_path.stat().st_size, final_digest)

        return PutObjectResult(final_key, staging_size, staging_digest)

    async def get_object(self, object_key: str) -> AsyncIterator[bytes]:
        self._validate_key(object_key)
        path = self._final_path(object_key)
        import glob, sys
        sys.stderr.write(f"[DEBUG STORE] get_object key={object_key} base={self._base} resolved_path={path} exists={path.exists()}\n")
        sys.stderr.write(f"[DEBUG STORE] files in base: {glob.glob(str(self._base) + '/**', recursive=True)}\n")
        sys.stderr.flush()
        if not path.exists():
            raise FileNotFoundError(object_key)
        async with aiofiles.open(path, "rb") as f:
            while chunk := await f.read(65536):
                yield chunk

    async def head_object(self, object_key: str) -> ObjectMetadata:
        self._validate_key(object_key)
        path = self._final_path(object_key)
        if not path.exists():
            raise FileNotFoundError(object_key)
        stat = path.stat()
        content_type, _ = mimetypes.guess_type(str(path))
        
        sha_path = path.with_suffix(path.suffix + ".sha256")
        sha256_hex = None
        if sha_path.exists():
            try:
                async with aiofiles.open(sha_path, "r") as f:
                    sha256_hex = (await f.read()).strip()
            except Exception:
                pass
        
        if not sha256_hex:
            try:
                hasher = hashlib.sha256()
                async with aiofiles.open(path, "rb") as f:
                    while chunk := await f.read(65536):
                        hasher.update(chunk)
                sha256_hex = hasher.hexdigest()
            except Exception:
                sha256_hex = None

        return ObjectMetadata(
            object_key=object_key,
            byte_size=stat.st_size,
            content_type=content_type or "application/octet-stream",
            storage_provider="local",
            sha256_hex=sha256_hex,
        )

    async def delete_object(self, object_key: str) -> bool:
        self._validate_key(object_key)
        path = self._final_path(object_key)
        deleted = False
        if path.exists():
            path.unlink()
            deleted = True
        
        sha_path = path.with_suffix(path.suffix + ".sha256")
        if sha_path.exists():
            sha_path.unlink()
            
        return deleted

    async def exists(self, object_key: str) -> bool:
        self._validate_key(object_key)
        return self._final_path(object_key).exists()

    async def delete_staging(self, staging_key: str) -> bool:
        staging_key_clean = staging_key.removeprefix(f"{STAGING_PREFIX}/")
        path = self._staging_path(staging_key_clean)
        if path.exists():
            path.unlink()
            return True
        return False

    async def cleanup_orphaned_staging(self, active_keys: list[str]) -> int:
        active_paths = {self._staging_path(key).resolve() for key in active_keys}
        deleted_count = 0
        if self._staging.exists():
            for p in self._staging.iterdir():
                if p.is_file():
                    try:
                        resolved = p.resolve()
                        if resolved not in active_paths:
                            mtime = p.stat().st_mtime
                            now = time.time()
                            if now - mtime > ORPHAN_GRACE_PERIOD:
                                p.unlink()
                                deleted_count += 1
                    except Exception:
                        pass
        return deleted_count


