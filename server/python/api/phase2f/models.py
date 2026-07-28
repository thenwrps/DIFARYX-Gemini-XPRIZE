"""Strict runtime contracts for the persistent XRD internal API."""

from __future__ import annotations

import json
import math
import re
from datetime import datetime
from typing import Any, Dict, List, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from pydantic.alias_generators import to_camel


CONTROL_RE = re.compile(r"[\x00-\x1f\x7f]")
IDEMPOTENCY_PATTERN = r"^[A-Za-z0-9._:-]{1,255}$"
MAX_JSON_BYTES = 256 * 1024
MAX_JSON_DEPTH = 16
MAX_JSON_ITEMS = 20_000


class StrictCamelModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="forbid",
        from_attributes=True,
    )


def _validate_json(value: Any, *, label: str) -> Any:
    item_count = 0

    def visit(node: Any, depth: int) -> None:
        nonlocal item_count
        item_count += 1
        if item_count > MAX_JSON_ITEMS or depth > MAX_JSON_DEPTH:
            raise ValueError(f"{label} is too large or deeply nested")
        if node is None or isinstance(node, (bool, str)):
            if isinstance(node, str) and len(node) > 100_000:
                raise ValueError(f"{label} contains an oversized string")
            return
        if isinstance(node, (int, float)):
            if isinstance(node, float) and not math.isfinite(node):
                raise ValueError(f"{label} contains a non-finite number")
            return
        if isinstance(node, list):
            for child in node:
                visit(child, depth + 1)
            return
        if isinstance(node, dict):
            for key, child in node.items():
                if not isinstance(key, str) or len(key) > 255:
                    raise ValueError(f"{label} contains an invalid key")
                visit(child, depth + 1)
            return
        raise ValueError(f"{label} contains a non-JSON value")

    visit(value, 0)
    if len(json.dumps(value, separators=(",", ":"), ensure_ascii=False).encode("utf-8")) > MAX_JSON_BYTES:
        raise ValueError(f"{label} exceeds the maximum encoded size")
    return value


class OrganizationMembership(StrictCamelModel):
    organization_id: UUID
    organization_name: str
    user_id: UUID
    role: str


class OrganizationMembershipList(StrictCamelModel):
    memberships: List[OrganizationMembership]


class ProjectSummary(StrictCamelModel):
    id: UUID
    organization_id: UUID
    owner_user_id: UUID
    title: str
    description: Optional[str] = None
    status: Literal["active", "archived"]
    my_project_role: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class ProjectList(StrictCamelModel):
    items: List[ProjectSummary]
    next_cursor: Optional[str] = None
    has_more: bool = False


class ProjectCreate(StrictCamelModel):
    title: str = Field(min_length=1, max_length=255)
    description: Optional[str] = Field(default=None, max_length=5000)

    @field_validator("title")
    @classmethod
    def normalize_title(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized or CONTROL_RE.search(normalized):
            raise ValueError("Project title is invalid")
        return normalized


class DatasetCreate(StrictCamelModel):
    title: str = Field(min_length=1, max_length=255)
    measurement_metadata: Dict[str, Any] = Field(default_factory=dict)
    processing_parameters: Dict[str, Any] = Field(default_factory=dict)
    experiment_context: Dict[str, Any] = Field(default_factory=dict)

    @field_validator("title")
    @classmethod
    def normalize_title(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized or CONTROL_RE.search(normalized):
            raise ValueError("Dataset title is invalid")
        return normalized

    @field_validator("measurement_metadata")
    @classmethod
    def validate_measurement_metadata(cls, value: Dict[str, Any]) -> Dict[str, Any]:
        return _validate_json(value, label="measurement metadata")

    @field_validator("processing_parameters")
    @classmethod
    def validate_processing_parameters(cls, value: Dict[str, Any]) -> Dict[str, Any]:
        return _validate_json(value, label="processing parameters")

    @field_validator("experiment_context")
    @classmethod
    def validate_experiment_context(cls, value: Dict[str, Any]) -> Dict[str, Any]:
        return _validate_json(value, label="experiment context")


class UploadSummary(StrictCamelModel):
    id: UUID
    session_status: str
    expected_byte_size: int
    checksum_algorithm: Literal["sha256"]
    client_checksum_sha256: Optional[str] = None
    expires_at: datetime
    finalized_at: Optional[datetime] = None
    failure_code: Optional[str] = None


class ValidationSummary(StrictCamelModel):
    id: UUID
    status: str
    attempt_number: int
    max_attempts: int
    failure_code: Optional[str] = None
    failure_details: Optional[Dict[str, Any]] = None
    created_at: datetime
    completed_at: Optional[datetime] = None


class EvidenceSummary(StrictCamelModel):
    id: UUID
    version: int
    status: str
    content_sha256: str
    schema_version: str
    processor_version: str
    validation_warnings: List[str]
    scientific_limitations: List[str]
    created_at: datetime


class DatasetDetail(StrictCamelModel):
    id: UUID
    organization_id: UUID
    project_id: UUID
    title: str
    technique: Literal["xrd"]
    display_filename: str
    declared_content_type: str
    byte_size: int
    client_checksum_sha256: Optional[str] = None
    dataset_status: str
    evidence_status: str
    failure_code: Optional[str] = None
    original_object_id: Optional[UUID] = None
    current_evidence_id: Optional[UUID] = None
    measurement_metadata: Dict[str, Any]
    processing_parameters: Dict[str, Any]
    experiment_context: Dict[str, Any]
    created_at: datetime
    updated_at: datetime
    latest_upload: Optional[UploadSummary] = None
    latest_validation: Optional[ValidationSummary] = None
    evidence: Optional[EvidenceSummary] = None


class DatasetList(StrictCamelModel):
    items: List[DatasetDetail]
    next_cursor: Optional[str] = None
    has_more: bool = False


class UploadIntentCreate(StrictCamelModel):
    original_filename: str = Field(min_length=1, max_length=500)
    display_filename: str = Field(min_length=1, max_length=500)
    declared_content_type: str = Field(min_length=1, max_length=200)
    byte_size: int = Field(gt=0, le=100 * 1024 * 1024)
    client_checksum_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    idempotency_key: str = Field(pattern=IDEMPOTENCY_PATTERN)

    @field_validator("original_filename", "display_filename")
    @classmethod
    def validate_filename(cls, value: str) -> str:
        normalized = value.strip()
        if (
            not normalized
            or CONTROL_RE.search(normalized)
            or "/" in normalized
            or "\\" in normalized
            or normalized in {".", ".."}
        ):
            raise ValueError("Filename is unsafe")
        return normalized


class UploadIntent(StrictCamelModel):
    dataset_id: UUID
    upload_id: UUID
    upload_url: str
    expires_at: datetime
    max_byte_size: int
    upload_status: str
    validation_status: Literal["pending"]


class UploadStreamResult(StrictCamelModel):
    upload_id: UUID
    byte_size: int
    server_checksum_sha256: str
    upload_status: str


class UploadFinalizeResult(StrictCamelModel):
    dataset_id: UUID
    upload_id: UUID
    original_object_id: UUID
    upload_status: str
    validation_status: str


class CanonicalEvidence(StrictCamelModel):
    id: UUID
    organization_id: UUID
    project_id: UUID
    dataset_id: UUID
    upload_session_id: UUID
    validation_attempt_id: UUID
    version: int
    status: str
    schema_version: str
    processor_version: str
    content_sha256: str
    content: Dict[str, Any]
    validation_warnings: List[str]
    scientific_limitations: List[str]
    provenance: Dict[str, Any]
    created_at: datetime


PersistentProvider = Literal[
    "deterministic",
    "scientific-baseline",
    "gemini-2.5-flash",
    "gemini-developer-api",
    "vertex-gemini",
]


class ReasoningStart(StrictCamelModel):
    project_id: UUID
    dataset_id: UUID
    evidence_snapshot_id: UUID
    provider: PersistentProvider
    model: Optional[str] = Field(default=None, max_length=128)
    prompt_version: str = Field(default="phase2f-xrd-v1", min_length=1, max_length=100)
    policy_version: str = Field(default="phase2e-provider-policy-v1", min_length=1, max_length=100)
    request_id: str = Field(min_length=1, max_length=255)
    idempotency_key: Optional[str] = Field(default=None, pattern=IDEMPOTENCY_PATTERN)

    @field_validator("model", "prompt_version", "policy_version", "request_id")
    @classmethod
    def reject_control_characters(cls, value: Optional[str]) -> Optional[str]:
        if value is not None and CONTROL_RE.search(value):
            raise ValueError("Reasoning provenance string is invalid")
        return value


class ReasoningComplete(StrictCamelModel):
    status: Literal["succeeded", "fallback", "failed"]
    structured_output: Optional[Dict[str, Any]] = None
    fallback_used: bool = False
    quota_classification: Literal["not_required", "allowed", "rejected", "unavailable"]
    failure_code: Optional[str] = Field(default=None, max_length=100)
    failure_message: Optional[str] = Field(default=None, max_length=500)

    @field_validator("structured_output")
    @classmethod
    def validate_output(cls, value: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        if value is not None:
            _validate_json(value, label="reasoning output")
        return value

    @model_validator(mode="after")
    def validate_terminal_shape(self) -> "ReasoningComplete":
        if self.status in {"succeeded", "fallback"} and self.structured_output is None:
            raise ValueError("Successful reasoning requires structured output")
        if self.status == "failed" and (not self.failure_code or not self.failure_message):
            raise ValueError("Failed reasoning requires a sanitized failure")
        if self.status == "fallback" and not self.fallback_used:
            raise ValueError("Fallback status requires fallback provenance")
        return self


class ReasoningRun(StrictCamelModel):
    id: UUID
    organization_id: UUID
    project_id: UUID
    project_title: Optional[str] = None
    dataset_id: UUID
    dataset_title: Optional[str] = None
    upload_session_id: UUID
    evidence_snapshot_id: UUID
    evidence_content_sha256: str
    execution_mode: str
    status: str
    provider: str
    model: Optional[str] = None
    prompt_version: str
    policy_version: str
    structured_output: Optional[Dict[str, Any]] = None
    fallback_used: bool
    quota_classification: str
    request_id: str
    idempotency_key: Optional[str] = None
    failure_code: Optional[str] = None
    failure_message: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None
    created: Optional[bool] = None


class ReasoningHistory(StrictCamelModel):
    items: List[ReasoningRun]
    next_cursor: Optional[str] = None
    has_more: bool


class NotebookReferenceCreate(StrictCamelModel):
    reasoning_run_id: UUID
    label: str = Field(min_length=1, max_length=255)

    @field_validator("label")
    @classmethod
    def normalize_label(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized or CONTROL_RE.search(normalized):
            raise ValueError("Notebook label is invalid")
        return normalized


class NotebookReference(StrictCamelModel):
    id: UUID
    organization_id: UUID
    project_id: UUID
    project_title: str
    dataset_id: UUID
    dataset_title: str
    evidence_snapshot_id: UUID
    reasoning_run_id: UUID
    reasoning_status: str
    provider: str
    label: str
    created_at: datetime


class NotebookReferenceList(StrictCamelModel):
    items: List[NotebookReference]
