"""In-memory ObjectStore adapter for testing."""

from __future__ import annotations

import hashlib
import os
import time
from typing import AsyncIterator, Optional

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


class InMemoryStagingWriter(StagingWriter):
    """In-memory staging writer for testing."""

    def __init__(self, store: "InMemoryObjectStore", staging_key: str, max_bytes: int):
        self._store = store
        self._key = staging_key
        self._max_bytes = max_bytes
        self._buffer = bytearray()
        self._hasher = hashlib.sha256()
        self._closed = False

    async def write_chunk(self, chunk: bytes) -> None:
        if self._closed:
            raise RuntimeError("Writer is closed")
        try:
            if len(self._buffer) + len(chunk) > self._max_bytes:
                await self.abort()
                raise StagingOverflowError(f"Exceeded {self._max_bytes} bytes")
            self._buffer.extend(chunk)
            self._hasher.update(chunk)
        except BaseException:
            await self.abort()
            raise

    async def finish(self) -> StagingResult:
        self._closed = True
        self._store._staging[self._key] = bytes(self._buffer)
        self._store._staging_mtime[self._key] = time.time()
        return StagingResult(self._key, len(self._buffer), self._hasher.hexdigest())

    async def abort(self) -> None:
        self._closed = True
        self._store._staging.pop(self._key, None)
        self._store._staging_mtime.pop(self._key, None)


class InMemoryObjectStore(ObjectStore):
    """In-memory storage for testing."""

    def __init__(self):
        self._final: dict[str, bytes] = {}
        self._staging: dict[str, bytes] = {}
        self._staging_mtime: dict[str, float] = {}

    async def begin_staging(self, object_key: str, max_bytes: int) -> StagingWriter:
        staging_key = f"{STAGING_PREFIX}/{object_key}"
        if staging_key in self._staging:
            raise StagingConflictError(f"Staging already exists: {object_key}")
        return InMemoryStagingWriter(self, staging_key, max_bytes)

    async def promote_staging(self, staging_key: str, final_key: str) -> PutObjectResult:
        if staging_key not in self._staging:
            raise FileNotFoundError(f"Staging not found: {staging_key}")
        staging_data = self._staging[staging_key]
        staging_digest = hashlib.sha256(staging_data).hexdigest()

        if final_key in self._final:
            final_digest = hashlib.sha256(self._final[final_key]).hexdigest()
            del self._staging[staging_key]
            self._staging_mtime.pop(staging_key, None)
            if final_digest != staging_digest:
                raise PromotionConflictError(
                    f"Content mismatch: staging={staging_digest}, final={final_digest}"
                )
            return PutObjectResult(final_key, len(self._final[final_key]), final_digest)

        self._final[final_key] = staging_data
        del self._staging[staging_key]
        self._staging_mtime.pop(staging_key, None)
        return PutObjectResult(final_key, len(staging_data), staging_digest)

    async def get_object(self, object_key: str) -> AsyncIterator[bytes]:
        if object_key not in self._final:
            raise FileNotFoundError(object_key)
        yield self._final[object_key]

    async def head_object(self, object_key: str) -> ObjectMetadata:
        if object_key not in self._final:
            raise FileNotFoundError(object_key)
        data = self._final[object_key]
        return ObjectMetadata(
            object_key=object_key,
            byte_size=len(data),
            content_type="application/octet-stream",
            storage_provider="memory",
            sha256_hex=hashlib.sha256(data).hexdigest(),
        )

    async def delete_object(self, object_key: str) -> bool:
        if object_key in self._final:
            del self._final[object_key]
            return True
        return False

    async def exists(self, object_key: str) -> bool:
        return object_key in self._final

    async def delete_staging(self, staging_key: str) -> bool:
        if staging_key in self._staging:
            del self._staging[staging_key]
            self._staging_mtime.pop(staging_key, None)
            return True
        return False

    async def cleanup_orphaned_staging(self, active_keys: list[str]) -> int:
        active_staging_keys = {f"{STAGING_PREFIX}/{key}" for key in active_keys}
        now = time.time()
        orphans = []
        for k in list(self._staging.keys()):
            if k not in active_staging_keys:
                mtime = self._staging_mtime.get(k, 0.0)
                if now - mtime > ORPHAN_GRACE_PERIOD:
                    orphans.append(k)
        for k in orphans:
            del self._staging[k]
            self._staging_mtime.pop(k, None)
        return len(orphans)

