"""Dataset ingestion routes with raw Request.stream() PUT endpoint."""

from __future__ import annotations

import logging
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from api.auth.dependencies import get_active_organization
from api.auth.models import AuthenticatedUserContext
from api.errors import ContentLengthRequiredError, FileValidationError, StagingOverflowAPIError
from api.models.dataset import (
    CancelUploadRequest,
    CancelUploadResponse,
    DatasetListResponse,
    DatasetResponse,
    FinalizeUploadResponse,
    InitiateUploadRequest,
    InitiateUploadResponse,
    StreamingPutResponse,
    UploadSessionListResponse,
    UploadSessionResponse,
)
from api.services.upload_service import MAX_FILE_SIZE, UploadService
from api.storage.factory import get_object_store

logger = logging.getLogger("difaryx.routes.datasets")
router = APIRouter(tags=["Dataset Ingestion"])

_service: Optional[UploadService] = None


def _get_service() -> UploadService:
    global _service
    if _service is None:
        _service = UploadService(get_object_store())
    return _service


@router.post("/datasets/upload/initiate", response_model=InitiateUploadResponse, status_code=201)
async def initiate_upload(
    request: InitiateUploadRequest,
    context: AuthenticatedUserContext = Depends(get_active_organization),
):
    """Initiate a new dataset upload session."""
    service = _get_service()
    return await service.initiate_upload(
        context.active_organization_id,
        context.active_user_id,
        request,
    )


@router.put("/datasets/upload/{session_id}/stream", response_model=StreamingPutResponse)
async def streaming_put(
    session_id: UUID,
    request: Request,
    context: AuthenticatedUserContext = Depends(get_active_organization),
):
    """Stream file bytes via raw Request.stream() with Content-Length guard and cumulative byte enforcement."""
    content_length = request.headers.get("content-length")
    if content_length is None:
        raise ContentLengthRequiredError("Content-Length header is required")

    try:
        declared_size = int(content_length)
    except (ValueError, TypeError):
        raise ContentLengthRequiredError("Content-Length must be a valid integer")

    if declared_size > MAX_FILE_SIZE:
        raise FileValidationError(
            f"Content-Length {declared_size} exceeds maximum file size {MAX_FILE_SIZE}"
        )

    service = _get_service()

    claimed = await service.claim_session_for_streaming(
        context.active_organization_id,
        context.active_user_id,
        session_id,
    )

    if declared_size > claimed.expected_byte_size:
        raise StagingOverflowAPIError(
            f"Content-Length {declared_size} exceeds expected byte size {claimed.expected_byte_size}"
        )
    if declared_size < claimed.expected_byte_size:
        raise FileValidationError(
            f"Content-Length {declared_size} does not match expected byte size {claimed.expected_byte_size}"
        )

    try:
        result = await service.stream_to_staging(claimed, request.stream())

        response = await service.record_streaming_result(
            context.active_organization_id,
            context.active_user_id,
            session_id,
            claimed.dataset_id,
            result,
        )
        return response

    except Exception as e:
        logger.warning(
            "upload.streaming_failed",
            session_id=str(session_id),
            error=str(e),
        )
        failure_code = "streaming_error"
        if "checksum" in str(e).lower():
            failure_code = "checksum_mismatch"
        elif "byte size" in str(e).lower():
            failure_code = "size_mismatch"
        elif "overflow" in str(e).lower():
            failure_code = "size_overflow"

        try:
            await service.record_streaming_failure(
                context.active_organization_id,
                context.active_user_id,
                session_id,
                failure_code,
                claimed.staging_key,
            )
        except Exception as record_err:
            logger.error("upload.record_failure_failed", error=str(record_err))

        raise


@router.post("/datasets/upload/{session_id}/finalize", response_model=FinalizeUploadResponse)
async def finalize_upload(
    session_id: UUID,
    context: AuthenticatedUserContext = Depends(get_active_organization),
):
    """Finalize an uploaded session: promote staging, create dataset_object, settle quota."""
    service = _get_service()
    return await service.finalize_upload(
        context.active_organization_id,
        context.active_user_id,
        session_id,
    )


@router.post("/datasets/upload/{session_id}/cancel", response_model=CancelUploadResponse)
async def cancel_upload(
    session_id: UUID,
    request: CancelUploadRequest = CancelUploadRequest(),
    context: AuthenticatedUserContext = Depends(get_active_organization),
):
    """Cancel an upload session. Rejects during active streaming (409)."""
    service = _get_service()
    return await service.cancel_upload(
        context.active_organization_id,
        context.active_user_id,
        session_id,
        request.reason,
    )


@router.get("/datasets/upload/{session_id}", response_model=UploadSessionResponse)
async def get_upload_session(
    session_id: UUID,
    context: AuthenticatedUserContext = Depends(get_active_organization),
):
    """Get upload session details."""
    service = _get_service()
    return await service.get_upload_session(
        context.active_organization_id,
        context.active_user_id,
        session_id,
    )


@router.get("/datasets/{dataset_id}/uploads", response_model=UploadSessionListResponse)
async def list_upload_sessions(
    dataset_id: UUID,
    limit: int = 50,
    cursor: Optional[str] = None,
    context: AuthenticatedUserContext = Depends(get_active_organization),
):
    """List upload sessions for a dataset with cursor pagination."""
    cursor_created_at = None
    cursor_id = None
    if cursor:
        parts = cursor.split("|")
        if len(parts) == 2:
            from datetime import datetime
            cursor_created_at = datetime.fromisoformat(parts[0])
            cursor_id = UUID(parts[1])

    service = _get_service()
    return await service.list_upload_sessions(
        context.active_organization_id,
        context.active_user_id,
        dataset_id,
        limit,
        cursor_created_at,
        cursor_id,
    )


@router.get("/datasets/{dataset_id}", response_model=DatasetResponse)
async def get_dataset(
    dataset_id: UUID,
    context: AuthenticatedUserContext = Depends(get_active_organization),
):
    """Get dataset details."""
    service = _get_service()
    return await service.get_dataset(
        context.active_organization_id,
        context.active_user_id,
        dataset_id,
    )


@router.get("/datasets", response_model=DatasetListResponse)
async def list_datasets(
    project_id: Optional[UUID] = None,
    technique: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 50,
    cursor: Optional[str] = None,
    context: AuthenticatedUserContext = Depends(get_active_organization),
):
    """List datasets with optional filters and cursor pagination."""
    cursor_created_at = None
    cursor_id = None
    if cursor:
        parts = cursor.split("|")
        if len(parts) == 2:
            from datetime import datetime
            cursor_created_at = datetime.fromisoformat(parts[0])
            cursor_id = UUID(parts[1])

    service = _get_service()
    return await service.list_datasets(
        context.active_organization_id,
        context.active_user_id,
        project_id,
        technique,
        status,
        limit,
        cursor_created_at,
        cursor_id,
    )
