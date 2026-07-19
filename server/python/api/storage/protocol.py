"""ObjectStore protocol with two-phase staging/promote semantics."""

from __future__ import annotations

import hashlib
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import AsyncIterator, Optional


class StagingConflictError(Exception):
    """Pre-existing staging target detected."""


class StagingOverflowError(Exception):
    """Cumulative bytes exceed max_bytes limit."""


class PromotionConflictError(Exception):
    """Same-size different-content at final key."""


@dataclass(frozen=True)
class StagingResult:
    staging_key: str
    byte_size: int
    sha256_hex: str


@dataclass(frozen=True)
class PutObjectResult:
    object_key: str
    byte_size: int
    sha256_hex: str
    storage_generation: Optional[str] = None


@dataclass(frozen=True)
class ObjectMetadata:
    object_key: str
    byte_size: int
    content_type: str
    storage_provider: str
    storage_generation: Optional[str] = None
    sha256_hex: Optional[str] = None


class StagingWriter(ABC):
    """Writes chunks to staging storage with SHA-256 and byte limit enforcement."""

    @abstractmethod
    async def write_chunk(self, chunk: bytes) -> None:
        """Append bytes. Raises StagingOverflowError if cumulative exceeds max_bytes."""
        ...

    @abstractmethod
    async def finish(self) -> StagingResult:
        """Close and return result with staging_key, byte_size, sha256_hex."""
        ...

    @abstractmethod
    async def abort(self) -> None:
        """Close and delete partial staging file."""
        ...


class ObjectStore(ABC):
    """Two-phase write storage with content-identity verification."""

    @abstractmethod
    async def begin_staging(self, object_key: str, max_bytes: int) -> StagingWriter:
        """Open exclusive-create staging writer. Raises StagingConflictError if exists."""
        ...

    @abstractmethod
    async def promote_staging(self, staging_key: str, final_key: str) -> PutObjectResult:
        """Promote staging to final. Computes SHA-256 from staging, compares against existing final if present. Idempotent."""
        ...

    @abstractmethod
    async def get_object(self, object_key: str) -> AsyncIterator[bytes]:
        """Stream-read bytes from final storage."""
        ...

    @abstractmethod
    async def head_object(self, object_key: str) -> ObjectMetadata:
        """Return metadata for final object."""
        ...

    @abstractmethod
    async def delete_object(self, object_key: str) -> bool:
        """Delete final object."""
        ...

    @abstractmethod
    async def exists(self, object_key: str) -> bool:
        """Check if final object exists."""
        ...

    @abstractmethod
    async def delete_staging(self, staging_key: str) -> bool:
        """Delete partial staging file."""
        ...

    @abstractmethod
    async def cleanup_orphaned_staging(self, active_keys: list[str]) -> int:
        """Clean up and delete any staging resources that are not active."""
        ...


    async def stream_write(
        self, object_key: str, stream: AsyncIterator[bytes], max_bytes: int
    ) -> StagingResult:
        """Stream write bytes to staging. Enforces max_bytes and computes SHA-256 on the fly."""
        writer = await self.begin_staging(object_key, max_bytes)
        try:
            async for chunk in stream:
                await writer.write_chunk(chunk)
            return await writer.finish()
        except BaseException:
            await writer.abort()
            raise

