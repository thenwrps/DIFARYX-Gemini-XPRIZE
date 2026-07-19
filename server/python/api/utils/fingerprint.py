"""Request fingerprint computation — no DB dependencies."""

from __future__ import annotations

import hashlib
from typing import Optional
from uuid import UUID


def compute_request_fingerprint(
    organization_id: UUID,
    project_id: UUID,
    technique: str,
    display_filename: str,
    declared_content_type: str,
    byte_size: int,
    client_checksum_sha256: Optional[str],
) -> str:
    canonical = "|".join([
        str(organization_id),
        str(project_id),
        technique,
        display_filename,
        declared_content_type,
        str(byte_size),
        client_checksum_sha256 or "",
    ])
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()
