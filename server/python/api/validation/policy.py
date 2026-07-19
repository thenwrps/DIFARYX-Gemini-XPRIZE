from pathlib import Path
from typing import FrozenSet

from api.utils.upload_policy_constants import ALLOWED_EXTENSIONS, ALLOWED_CONTENT_TYPES, MAX_FILE_SIZE


def is_allowed_extension(filename: str) -> bool:
    ext = Path(filename).suffix.lower()
    return ext in ALLOWED_EXTENSIONS


def is_allowed_content_type(content_type: str) -> bool:
    return content_type in ALLOWED_CONTENT_TYPES


def get_max_file_size() -> int:
    return MAX_FILE_SIZE


def get_allowed_extensions() -> FrozenSet[str]:
    return frozenset(ALLOWED_EXTENSIONS)


def get_allowed_content_types() -> FrozenSet[str]:
    return frozenset(ALLOWED_CONTENT_TYPES)
