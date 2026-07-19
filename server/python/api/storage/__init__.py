"""ObjectStore protocol and adapters for dataset ingestion."""

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
from .in_memory_adapter import InMemoryObjectStore


def get_local_object_store():
    from .local_adapter import LocalObjectStore
    return LocalObjectStore


__all__ = [
    "ObjectStore",
    "StagingWriter",
    "StagingResult",
    "PutObjectResult",
    "ObjectMetadata",
    "StagingConflictError",
    "StagingOverflowError",
    "PromotionConflictError",
    "InMemoryObjectStore",
    "get_local_object_store",
]
