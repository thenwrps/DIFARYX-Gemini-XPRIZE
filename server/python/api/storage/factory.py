"""Factory for ObjectStore instances based on APP_ENV."""

from __future__ import annotations

import os
from pathlib import Path

from .in_memory_adapter import InMemoryObjectStore
from .local_adapter import LocalObjectStore
from .protocol import ObjectStore


def get_object_store() -> ObjectStore:
    """Return ObjectStore instance based on APP_ENV.

    For test environment, returns InMemoryObjectStore.
    For production/dev, requires DIFARYX_LOCAL_STORAGE_PATH to be set and absolute.
    """
    app_env = os.getenv("APP_ENV", "development")
    if app_env == "test":
        return InMemoryObjectStore()

    storage_path = os.getenv("DIFARYX_LOCAL_STORAGE_PATH")
    if not storage_path:
        raise ValueError("DIFARYX_LOCAL_STORAGE_PATH is required in non-test environments")

    path = Path(storage_path)
    if not path.is_absolute():
        raise ValueError(f"DIFARYX_LOCAL_STORAGE_PATH must be absolute: {storage_path}")

    return LocalObjectStore(path)
