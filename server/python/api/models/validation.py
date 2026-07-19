from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class EnqueueValidationRequest(BaseModel):
    dataset_id: UUID


class EnqueueValidationResponse(BaseModel):
    dataset_id: UUID
    attempt_id: UUID
    attempt_number: int
    dataset_status: str


class ValidationAttemptResponse(BaseModel):
    id: UUID
    attempt_number: int
    status: str
    claimed_at: Optional[datetime]
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    failure_code: Optional[str]
    failure_details: Optional[Dict[str, Any]]
    server_checksum_sha256: Optional[str]
    byte_size_verified: Optional[int]
    quarantine_reason: Optional[str]
    created_at: datetime


class ValidationStatusResponse(BaseModel):
    dataset_id: UUID
    dataset_status: str
    latest_attempt: Optional[ValidationAttemptResponse]


class ValidationAttemptListResponse(BaseModel):
    items: List[ValidationAttemptResponse]
    next_cursor: Optional[str] = None
    has_more: bool


class CancelValidationRequest(BaseModel):
    reason: Optional[str] = Field(None, max_length=255)


class CancelValidationResponse(BaseModel):
    dataset_id: UUID
    attempt_id: UUID
    attempt_status: str
    dataset_status: str


class ValidationOutcome(BaseModel):
    attempt_id: UUID
    dataset_id: UUID
    status: str
    checks_passed: int
    server_checksum_sha256: Optional[str]
    byte_size_verified: Optional[int]
    failure_code: Optional[str]
    transient: bool
