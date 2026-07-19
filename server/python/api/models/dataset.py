"""Pydantic v2 models for dataset ingestion API."""

from __future__ import annotations

import re
from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field, ConfigDict
from pydantic.alias_generators import to_camel

SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")


class CamelModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )


class InitiateUploadRequest(CamelModel):
    project_id: UUID
    technique: str = Field(..., min_length=1, max_length=50)
    display_filename: str = Field(..., min_length=1, max_length=500)
    declared_content_type: str = Field(..., min_length=1, max_length=200)
    byte_size: int = Field(..., gt=0)
    client_checksum_sha256: Optional[str] = Field(None, pattern=r"^[0-9a-f]{64}$")
    idempotency_key: str = Field(..., min_length=1, max_length=255)


class InitiateUploadResponse(CamelModel):
    dataset_id: UUID
    upload_session_id: UUID
    upload_url: str
    expires_at: datetime
    max_byte_size: int
    dataset_status: str
    session_status: str


class StreamingPutResponse(CamelModel):
    upload_session_id: UUID
    server_checksum_sha256: str
    byte_size: int
    session_status: str


class FinalizeUploadResponse(CamelModel):
    dataset_id: UUID
    dataset_status: str
    original_object_id: UUID
    upload_session_id: UUID
    session_status: str


class CancelUploadRequest(CamelModel):
    reason: Optional[str] = Field(None, max_length=255)


class CancelUploadResponse(CamelModel):
    upload_session_id: UUID
    dataset_id: UUID
    session_status: str
    dataset_status: str


class DatasetResponse(CamelModel):
    id: UUID
    organization_id: UUID
    project_id: UUID
    technique: str
    display_filename: str
    declared_content_type: str
    byte_size: int
    client_checksum_sha256: Optional[str]
    dataset_status: str
    status_changed_at: datetime
    failure_code: Optional[str]
    original_object_id: Optional[UUID]
    created_by: UUID
    created_at: datetime
    updated_at: datetime
    upload_status: Optional[str] = None
    object_present: Optional[bool] = False
    validation_status: Optional[str] = None


class DatasetListResponse(CamelModel):
    items: List[DatasetResponse]
    next_cursor: Optional[str] = None
    has_more: bool


class UploadSessionResponse(CamelModel):
    id: UUID
    organization_id: UUID
    dataset_id: UUID
    expected_byte_size: int
    client_checksum_sha256: Optional[str]
    session_status: str
    idempotency_key: str
    expires_at: datetime
    finalized_at: Optional[datetime]
    cancelled_at: Optional[datetime]
    failure_code: Optional[str]
    created_at: datetime


class UploadSessionListResponse(CamelModel):
    items: List[UploadSessionResponse]
    next_cursor: Optional[str] = None
    has_more: bool
