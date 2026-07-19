"""Upload service orchestrating dataset ingestion with quota, idempotency, and state management."""

from __future__ import annotations

import logging
import hashlib
import os
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, AsyncIterator, Dict, List, Optional
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.uow import UnitOfWork
from api.errors import (
    ChecksumMismatchError,
    ContentLengthRequiredError,
    DatasetNotFoundError,
    DatasetStateError,
    FileValidationError,
    IdempotencyConflictError,
    StoragePromotionError,
    StorageQuotaExceededError,
    StagingConflictError,
    UploadExpiredError,
    UploadSessionNotFoundError,
    UploadSessionStateError,
    StagingOverflowAPIError,
    OrganizationAccessDeniedException,
)
from api.models.dataset import (
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
from api.repositories.dataset_object_repository import DatasetObjectRepository
from api.repositories.dataset_repository import DatasetRepository
from api.repositories.upload_session_repository import UploadSessionRepository
from api.repositories.project_repository import ProjectRepository
from api.repositories.validation_attempt_repository import ValidationAttemptRepository
from api.storage.protocol import ObjectStore, StagingOverflowError
from api.utils.upload_policy_constants import ALLOWED_EXTENSIONS, ALLOWED_CONTENT_TYPES, MAX_FILE_SIZE

logger = logging.getLogger("difaryx.service.upload")

ALLOWED_TECHNIQUES = {"xrd", "xps", "ftir", "raman", "multi", "unknown"}

UPLOAD_SESSION_TTL_SECONDS = int(os.getenv("DIFARYX_UPLOAD_SESSION_TTL_SECONDS", "3600"))

STAGING_PREFIX = "_staging"


async def _hash_final_object(store: ObjectStore, object_key: str) -> tuple[str, int]:
    """Hash the promoted object stream, independently of promotion metadata."""
    hasher = hashlib.sha256()
    byte_count = 0
    async for chunk in store.get_object(object_key):
        hasher.update(chunk)
        byte_count += len(chunk)
    return hasher.hexdigest(), byte_count


@dataclass
class ClaimedSession:
    session_id: UUID
    dataset_id: UUID
    organization_id: UUID
    object_key: str
    expected_byte_size: int
    client_checksum_sha256: Optional[str]
    staging_key: str
    declared_content_type: str


@dataclass
class StreamingPutResult:
    staging_key: str
    byte_size: int
    sha256_hex: str


from api.utils.fingerprint import compute_request_fingerprint as _compute_request_fingerprint


def _validate_extension(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise FileValidationError(f"Unsupported file extension: {ext}")
    return ext


def _validate_technique(technique: str) -> None:
    if technique not in ALLOWED_TECHNIQUES:
        raise FileValidationError(f"Unsupported technique: {technique}")


def _validate_content_type(content_type: str) -> None:
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise FileValidationError(f"Unsupported content type: {content_type}")


async def _append_audit_event(
    session: AsyncSession,
    organization_id: UUID,
    user_id: UUID,
    action: str,
    resource_type: str,
    resource_id: UUID,
) -> None:
    if len(action) > 100 or not re.match(r"^[a-z_]+\.[a-z_]+$", action):
        raise ValueError(f"Invalid action: {action}")
    await session.execute(
        sa.text("""
            SELECT governance.append_audit_event(
                :org_id, :user_id, :action, :resource_type, :resource_id
            )
        """),
        {
            "org_id": organization_id,
            "user_id": user_id,
            "action": action,
            "resource_type": resource_type,
            "resource_id": str(resource_id),
        },
    )


async def _reserve_storage_quota(
    session: AsyncSession,
    organization_id: UUID,
    user_id: UUID,
    project_id: UUID,
    reservation_key: str,
    requested_bytes: int,
    expires_at: datetime,
    idempotency_key: str,
) -> UUID:
    try:
        result = await session.execute(
            sa.text("""
                SELECT governance.reserve_storage_quota(
                    :organization_id, :user_id, :project_id,
                    :reservation_key, :requested_bytes, :expires_at,
                    :idempotency_key
                ) AS reservation_id
            """),
            {
                "organization_id": organization_id,
                "user_id": user_id,
                "project_id": project_id,
                "reservation_key": reservation_key,
                "requested_bytes": requested_bytes,
                "expires_at": expires_at,
                "idempotency_key": idempotency_key,
            },
        )
        row = result.first()
        if not row or not row[0]:
            raise StorageQuotaExceededError("Unable to reserve storage quota")
        return UUID(str(row[0]))
    except sa.exc.DBAPIError as e:
        if "storage quota exceeded" in str(e).lower():
            raise StorageQuotaExceededError("Unable to reserve storage quota: storage quota exceeded")
        raise


async def _release_storage_reservation(
    session: AsyncSession,
    organization_id: UUID,
    user_id: UUID,
    reservation_id: UUID,
    release_reason: str,
    idempotency_key: str,
) -> None:
    result = await session.execute(
        sa.text("""
            SELECT governance.release_storage_reservation(
                :organization_id, :reservation_id, :release_reason
            ) AS released
        """),
        {
            "organization_id": organization_id,
            "reservation_id": reservation_id,
            "release_reason": release_reason,
        },
    )
    row = result.first()
    if not row or not row[0]:
        logger.warning(f"Failed to release reservation {reservation_id}")


async def _settle_storage_reservation(
    session: AsyncSession,
    organization_id: UUID,
    user_id: UUID,
    reservation_id: UUID,
    settlement_key: str,
    actual_bytes: int,
) -> bool:
    result = await session.execute(
        sa.text("""
            SELECT governance.settle_storage_reservation(
                :organization_id, :reservation_id, :actual_bytes
            ) AS settled
        """),
        {
            "organization_id": organization_id,
            "reservation_id": reservation_id,
            "actual_bytes": actual_bytes,
        },
    )
    row = result.first()
    return bool(row and row[0])


class UploadService:
    """Orchestrates dataset ingestion with quota, idempotency, state management, and advisory-locked finalization."""

    def __init__(self, object_store: ObjectStore):
        self._store = object_store

    async def initiate_upload(
        self,
        organization_id: UUID,
        user_id: UUID,
        request: InitiateUploadRequest,
    ) -> InitiateUploadResponse:
        _validate_technique(request.technique)
        _validate_content_type(request.declared_content_type)
        ext = _validate_extension(request.display_filename)

        fingerprint = _compute_request_fingerprint(
            organization_id,
            request.project_id,
            request.technique,
            request.display_filename,
            request.declared_content_type,
            request.byte_size,
            request.client_checksum_sha256,
        )

        async with UnitOfWork(organization_id=organization_id, user_id=user_id) as session:
            # 1. Project Visibility & Write Role Enforcement (checks RLS visibility)
            project = await ProjectRepository.get_project(session, organization_id, user_id, request.project_id)
            if not project:
                raise DatasetNotFoundError(f"Project not found: {request.project_id}")

            role = project.get("my_project_role")
            org_member_res = await session.execute(
                sa.text("SELECT role FROM identity.memberships WHERE organization_id = :org_id AND user_id = :user_id"),
                {"org_id": organization_id, "user_id": user_id}
            )
            org_member = org_member_res.first()
            is_org_admin_or_owner = org_member and org_member[0] in ("owner", "admin")

            if not is_org_admin_or_owner and role not in ("lead", "member"):
                raise OrganizationAccessDeniedException("Write access to this project is denied")

            # 2. Idempotency Check
            existing = await UploadSessionRepository.find_by_idempotency_key(
                session, organization_id, request.idempotency_key
            )
            if existing:
                if existing["request_fingerprint"] == fingerprint:
                    return InitiateUploadResponse(
                        dataset_id=existing["dataset_id"],
                        upload_session_id=existing["id"],
                        upload_url=f"/api/v1/datasets/upload/{existing['id']}/stream",
                        expires_at=existing["expires_at"],
                        max_byte_size=MAX_FILE_SIZE,
                        dataset_status="uploading",
                        session_status=str(existing["session_status"]),
                    )
                raise IdempotencyConflictError(
                    "Idempotency key reused with different request parameters"
                )

            # 3. Lazy Cleanup of expired sessions and quota reservations
            expired_sessions = await UploadSessionRepository.reclaim_expired_sessions(session, organization_id)
            for expired in expired_sessions:
                # Delete staging if any
                staging_key = f"{STAGING_PREFIX}/{expired['object_key']}"
                try:
                    await self._store.delete_staging(staging_key)
                except Exception:
                    pass

                # Release reservation
                await _release_storage_reservation(
                    session,
                    organization_id,
                    user_id,
                    expired["quota_reservation_id"],
                    "expired_cleanup",
                    f"expire-reclaim-{expired['id']}",
                )

            # 4. Proceed with normal reservation & session creation
            dataset_uuid = uuid4()
            object_key = f"datasets/{organization_id}/{request.project_id}/{dataset_uuid}/{uuid4()}{ext}"
            expires_at = datetime.now(timezone.utc) + timedelta(seconds=UPLOAD_SESSION_TTL_SECONDS)
            reservation_key = f"upload-{dataset_uuid}"

            quota_reservation_id = await _reserve_storage_quota(
                session,
                organization_id,
                user_id,
                request.project_id,
                reservation_key,
                request.byte_size,
                expires_at,
                f"upload-reserve-{dataset_uuid}",
            )

            dataset_row = await DatasetRepository.create_dataset(
                session,
                organization_id,
                request.project_id,
                request.technique,
                request.display_filename,
                request.declared_content_type,
                request.byte_size,
                request.client_checksum_sha256,
                user_id,
            )

            session_row = await UploadSessionRepository.create_upload_session(
                session,
                organization_id,
                dataset_row["id"],
                object_key,
                request.byte_size,
                request.client_checksum_sha256,
                "local",
                request.idempotency_key,
                fingerprint,
                quota_reservation_id,
                expires_at,
                user_id,
            )

            await _append_audit_event(
                session, organization_id, user_id,
                "dataset.initiated", "dataset", dataset_row["id"],
            )

        return InitiateUploadResponse(
            dataset_id=dataset_row["id"],
            upload_session_id=session_row["id"],
            upload_url=f"/api/v1/datasets/upload/{session_row['id']}/stream",
            expires_at=expires_at,
            max_byte_size=MAX_FILE_SIZE,
            dataset_status="allocated",
            session_status="allocated",
        )

    async def claim_session_for_streaming(
        self,
        organization_id: UUID,
        user_id: UUID,
        session_id: UUID,
    ) -> ClaimedSession:
        async with UnitOfWork(organization_id=organization_id, user_id=user_id) as session:
            row = await UploadSessionRepository.claim_for_streaming(
                session, organization_id, session_id
            )
            if not row:
                existing = await UploadSessionRepository.get_upload_session(
                    session, organization_id, session_id
                )
                if not existing:
                    raise UploadSessionNotFoundError()

                db_now = (await session.execute(sa.text("SELECT NOW()"))).scalar()
                expires_at = existing["expires_at"]
                if expires_at and expires_at < db_now:
                    marked = await UploadSessionRepository.mark_expired(
                        session, organization_id, session_id
                    )
                    if marked:
                        staging_key = f"{STAGING_PREFIX}/{existing['object_key']}"
                        try:
                            await self._store.delete_staging(staging_key)
                        except Exception:
                            pass
                        if existing.get("quota_reservation_id"):
                            await _release_storage_reservation(
                                session,
                                organization_id,
                                user_id,
                                existing["quota_reservation_id"],
                                "session_expired",
                                f"expire-reclaim-{session_id}",
                            )
                        raise UploadExpiredError("Upload session has expired")
                    else:
                        existing = await UploadSessionRepository.get_upload_session(
                            session, organization_id, session_id
                        )
                        if not existing:
                            raise UploadSessionNotFoundError()

                if str(existing["session_status"]) == "uploading":
                    row = existing
                else:
                    raise UploadSessionStateError(
                        f"Session is in state '{existing['session_status']}', cannot claim for streaming"
                    )

        staging_key = f"{STAGING_PREFIX}/{row['object_key']}"
        return ClaimedSession(
            session_id=row["id"],
            dataset_id=row["dataset_id"],
            organization_id=row["organization_id"],
            object_key=row["object_key"],
            expected_byte_size=row["expected_byte_size"],
            client_checksum_sha256=row.get("client_checksum_sha256"),
            staging_key=staging_key,
            declared_content_type="",
        )

    async def stream_to_staging(
        self,
        claimed: ClaimedSession,
        request_stream: AsyncIterator[bytes],
    ) -> StreamingPutResult:
        try:
            result = await self._store.stream_write(
                claimed.object_key,
                request_stream,
                max_bytes=claimed.expected_byte_size,
            )
        except StagingOverflowError as e:
            raise StagingOverflowAPIError(f"Upload size limit exceeded: {e}")
        except BaseException:
            raise

        if result.byte_size != claimed.expected_byte_size:
            await self._store.delete_staging(result.staging_key)
            raise FileValidationError(
                f"Byte size mismatch: expected {claimed.expected_byte_size}, got {result.byte_size}"
            )

        if claimed.client_checksum_sha256 and result.sha256_hex != claimed.client_checksum_sha256:
            await self._store.delete_staging(result.staging_key)
            raise ChecksumMismatchError(
                f"Checksum mismatch: client={claimed.client_checksum_sha256}, server={result.sha256_hex}"
            )

        logger.info(
            "upload.streaming_complete",
            session_id=str(claimed.session_id),
            dataset_id=str(claimed.dataset_id),
            byte_size=result.byte_size,
            sha256=result.sha256_hex,
        )
        return StreamingPutResult(
            staging_key=result.staging_key,
            byte_size=result.byte_size,
            sha256_hex=result.sha256_hex,
        )


    async def record_streaming_result(
        self,
        organization_id: UUID,
        user_id: UUID,
        session_id: UUID,
        dataset_id: UUID,
        result: StreamingPutResult,
    ) -> StreamingPutResponse:
        async with UnitOfWork(organization_id=organization_id, user_id=user_id) as session:
            updated = await UploadSessionRepository.mark_uploaded(
                session, organization_id, session_id
            )
            if not updated:
                raise UploadSessionStateError("Failed to transition session to uploaded")

            await DatasetRepository.update_dataset_status(
                session, organization_id, dataset_id,
                "allocated", "uploaded",
            )

            await _append_audit_event(
                session, organization_id, user_id,
                "upload.streaming_put", "upload_session", session_id,
            )

        return StreamingPutResponse(
            upload_session_id=session_id,
            server_checksum_sha256=result.sha256_hex,
            byte_size=result.byte_size,
            session_status="uploaded",
        )

    async def record_streaming_failure(
        self,
        organization_id: UUID,
        user_id: UUID,
        session_id: UUID,
        failure_code: str,
        staging_key: str,
    ) -> None:
        await self._store.delete_staging(staging_key)
        async with UnitOfWork(organization_id=organization_id, user_id=user_id) as session:
            await UploadSessionRepository.mark_failed(
                session, organization_id, session_id, failure_code
            )

    async def finalize_upload(
        self,
        organization_id: UUID,
        user_id: UUID,
        session_id: UUID,
    ) -> FinalizeUploadResponse:
        async with UnitOfWork(organization_id=organization_id, user_id=user_id) as session:
            await UploadSessionRepository.acquire_finalize_lock(session, session_id)

            row = await UploadSessionRepository.get_upload_session(
                session, organization_id, session_id
            )
            if not row:
                raise UploadSessionNotFoundError()

            if row["session_status"] == "finalized":
                obj = await DatasetObjectRepository.get_dataset_object(
                    session, organization_id, row["dataset_id"]
                )
                if obj:
                    return FinalizeUploadResponse(
                        dataset_id=row["dataset_id"],
                        dataset_status="pending_validation",
                        original_object_id=obj["id"],
                        upload_session_id=session_id,
                        session_status="finalized",
                    )

            # Check if dataset already has an original object (e.g. from another session)
            existing_obj = await DatasetObjectRepository.get_dataset_object(
                session, organization_id, row["dataset_id"]
            )
            if existing_obj:
                raise DatasetStateError("Dataset already has an original object")
            db_now = (await session.execute(sa.text("SELECT NOW()"))).scalar()
            if row["expires_at"] < db_now:
                # Mark as expired in DB
                marked = await UploadSessionRepository.mark_expired(session, organization_id, session_id)
                if marked:
                    # Clean up staging file
                    staging_key = f"{STAGING_PREFIX}/{row['object_key']}"
                    try:
                        await self._store.delete_staging(staging_key)
                    except Exception:
                        pass
                    # Release storage reservation
                    await _release_storage_reservation(
                        session,
                        organization_id,
                        user_id,
                        row["quota_reservation_id"],
                        "session_expired",
                        f"expire-reclaim-{session_id}",
                    )
                raise UploadExpiredError("Upload session has expired")

            if row["session_status"] != "uploaded":
                raise UploadSessionStateError(
                    f"Session is in state '{row['session_status']}', expected 'uploaded'"
                )

        staging_key = f"{STAGING_PREFIX}/{row['object_key']}"
        try:
            promote_result = await self._store.promote_staging(staging_key, row["object_key"])
        except Exception as e:
            logger.error(f"upload.promote_failed: session_id={session_id}, error={e}")
            raise StoragePromotionError(f"Storage promotion failed: {e}")

        final_digest, final_byte_size = await _hash_final_object(
            self._store, row["object_key"]
        )
        if (
            final_byte_size != row["expected_byte_size"]
            or final_byte_size != promote_result.byte_size
            or final_digest != promote_result.sha256_hex
        ):
            try:
                await self._store.delete_object(row["object_key"])
            except Exception:
                logger.exception("upload.finalize_integrity_cleanup_failed", extra={"session_id": str(session_id)})
            raise StoragePromotionError(
                "Promoted object failed authoritative finalize size/digest verification"
            )

        async with UnitOfWork(organization_id=organization_id, user_id=user_id) as session:
            await UploadSessionRepository.acquire_finalize_lock(session, session_id)

            # WARNING: Do NOT change the execution order of create_dataset_object and complete_finalize!
            # The database RLS insert policy (0013) on science.dataset_objects requires that the
            # source upload session's status is 'uploaded'.
            # If complete_finalize is run first (which updates the status to 'finalized'),
            # the RLS WITH CHECK constraint will reject the insert with a silent security violation.
            # IntegrityError catch is the race backstop (e.g. another session finalized on same dataset first)
            try:
                obj_row = await DatasetObjectRepository.create_dataset_object(
                    session,
                    organization_id,
                    row["dataset_id"],
                    session_id,
                    "original",
                    "local",
                    row["object_key"],
                    promote_result.storage_generation,
                    promote_result.byte_size,
                    "application/octet-stream",
                    promote_result.sha256_hex,
                )
            except IntegrityError as ie:
                logger.warning("upload.finalize_unique_constraint_violated", session_id=str(session_id), error=str(ie))
                raise DatasetStateError("Dataset already has an original object")

            with_res = await UploadSessionRepository.get_session_with_reservation(
                session, organization_id, session_id
            )
            if with_res and with_res.get("reservation_status") == "reserved":
                await _settle_storage_reservation(
                    session,
                    organization_id,
                    user_id,
                    row["quota_reservation_id"],
                    f"settle-{session_id}",
                    promote_result.byte_size,
                )

            await DatasetRepository.link_original_object(
                session, organization_id, row["dataset_id"], obj_row["id"]
            )
            await DatasetRepository.update_dataset_status(
                session, organization_id, row["dataset_id"],
                "uploaded", "pending_validation",
            )

            finalized = await UploadSessionRepository.complete_finalize(
                session, organization_id, session_id
            )
            if not finalized:
                raise UploadSessionStateError("Failed to complete finalize transition")

            # Atomically enqueue validation attempt inside the same block
            await ValidationAttemptRepository.create_attempt(
                session,
                organization_id=organization_id,
                dataset_id=row["dataset_id"],
                original_object_id=obj_row["id"],
                max_attempts=3,
            )

            await _append_audit_event(
                session, organization_id, user_id,
                "upload.finalized", "upload_session", session_id,
            )
            await _append_audit_event(
                session, organization_id, user_id,
                "validation.enqueued", "dataset", row["dataset_id"],
            )

        logger.info(
            "upload.finalized",
            session_id=str(session_id),
            dataset_id=str(row["dataset_id"]),
            object_key=row["object_key"],
            byte_size=promote_result.byte_size,
            sha256=promote_result.sha256_hex,
        )

        return FinalizeUploadResponse(
            dataset_id=row["dataset_id"],
            dataset_status="pending_validation",
            original_object_id=obj_row["id"],
            upload_session_id=session_id,
            session_status="finalized",
        )

    async def cancel_upload(
        self,
        organization_id: UUID,
        user_id: UUID,
        session_id: UUID,
        reason: Optional[str] = None,
    ) -> CancelUploadResponse:
        async with UnitOfWork(organization_id=organization_id, user_id=user_id) as session:
            await UploadSessionRepository.acquire_finalize_lock(session, session_id)

            row = await UploadSessionRepository.get_upload_session(
                session, organization_id, session_id
            )
            if not row:
                raise UploadSessionNotFoundError()

            if row["session_status"] == "uploading":
                raise UploadSessionStateError(
                    "Cannot cancel session during active streaming"
                )
            if row["session_status"] == "finalized":
                raise UploadSessionStateError(
                    "Cannot cancel finalized session"
                )
            if row["session_status"] == "cancelled":
                ds = await DatasetRepository.get_dataset(
                    session, organization_id, row["dataset_id"]
                )
                return CancelUploadResponse(
                    upload_session_id=session_id,
                    dataset_id=row["dataset_id"],
                    session_status="cancelled",
                    dataset_status=str(ds["dataset_status"]) if ds else "cancelled",
                )

            cancelled = await UploadSessionRepository.mark_cancelled(
                session, organization_id, session_id
            )
            if not cancelled:
                raise UploadSessionStateError("Failed to cancel session")

            staging_key = f"{STAGING_PREFIX}/{row['object_key']}"
            await self._store.delete_staging(staging_key)

            await _release_storage_reservation(
                session,
                organization_id,
                user_id,
                row["quota_reservation_id"],
                reason or "user_cancelled",
                f"cancel-{session_id}",
            )

            await DatasetRepository.update_dataset_status(
                session, organization_id, row["dataset_id"],
                "allocated", "cancelled",
            )
            await DatasetRepository.update_dataset_status(
                session, organization_id, row["dataset_id"],
                "uploaded", "cancelled",
            )

            await _append_audit_event(
                session, organization_id, user_id,
                "upload.cancelled", "upload_session", session_id,
            )

        return CancelUploadResponse(
            upload_session_id=session_id,
            dataset_id=row["dataset_id"],
            session_status="cancelled",
            dataset_status="cancelled",
        )

    async def get_upload_session(
        self,
        organization_id: UUID,
        user_id: UUID,
        session_id: UUID,
    ) -> UploadSessionResponse:
        async with UnitOfWork(organization_id=organization_id, user_id=user_id) as session:
            row = await UploadSessionRepository.get_upload_session(
                session, organization_id, session_id
            )
        if not row:
            raise UploadSessionNotFoundError()
        return self._session_to_response(row)

    async def list_upload_sessions(
        self,
        organization_id: UUID,
        user_id: UUID,
        dataset_id: UUID,
        limit: int = 50,
        cursor_created_at: Optional[datetime] = None,
        cursor_id: Optional[UUID] = None,
    ) -> UploadSessionListResponse:
        if limit > 100:
            limit = 100

        async with UnitOfWork(organization_id=organization_id, user_id=user_id) as session:
            rows = await UploadSessionRepository.list_sessions_for_dataset(
                session, organization_id, dataset_id, limit + 1,
                cursor_created_at, cursor_id,
            )

        has_more = len(rows) > limit
        items = [self._session_to_response(r) for r in rows[:limit]]

        next_cursor = None
        if has_more and items:
            last = rows[limit - 1]
            next_cursor = f"{last['created_at'].isoformat()}|{last['id']}"

        return UploadSessionListResponse(items=items, next_cursor=next_cursor, has_more=has_more)

    async def get_dataset(
        self,
        organization_id: UUID,
        user_id: UUID,
        dataset_id: UUID,
    ) -> DatasetResponse:
        async with UnitOfWork(organization_id=organization_id, user_id=user_id) as session:
            row = await DatasetRepository.get_dataset(session, organization_id, dataset_id)
        if not row:
            raise DatasetNotFoundError()
        return self._dataset_to_response(row)

    async def list_datasets(
        self,
        organization_id: UUID,
        user_id: UUID,
        project_id: Optional[UUID] = None,
        technique: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 50,
        cursor_created_at: Optional[datetime] = None,
        cursor_id: Optional[UUID] = None,
    ) -> DatasetListResponse:
        if limit > 100:
            limit = 100

        async with UnitOfWork(organization_id=organization_id, user_id=user_id) as session:
            if project_id:
                project = await ProjectRepository.get_project(session, organization_id, user_id, project_id)
                if not project:
                    raise DatasetNotFoundError(f"Project not found: {project_id}")
            rows = await DatasetRepository.list_datasets(
                session, organization_id, project_id, technique, status,
                limit + 1, cursor_created_at, cursor_id,
            )

        has_more = len(rows) > limit
        items = [self._dataset_to_response(r) for r in rows[:limit]]

        next_cursor = None
        if has_more and items:
            last = rows[limit - 1]
            next_cursor = f"{last['created_at'].isoformat()}|{last['id']}"

        return DatasetListResponse(items=items, next_cursor=next_cursor, has_more=has_more)

    @staticmethod
    def _session_to_response(row: Dict[str, Any]) -> UploadSessionResponse:
        return UploadSessionResponse(
            id=row["id"],
            organization_id=row["organization_id"],
            dataset_id=row["dataset_id"],
            expected_byte_size=row["expected_byte_size"],
            client_checksum_sha256=row.get("client_checksum_sha256"),
            session_status=str(row["session_status"]),
            idempotency_key=row["idempotency_key"],
            expires_at=row["expires_at"],
            finalized_at=row.get("finalized_at"),
            cancelled_at=row.get("cancelled_at"),
            failure_code=row.get("failure_code"),
            created_at=row["created_at"],
        )

    @staticmethod
    def _dataset_to_response(row: Dict[str, Any]) -> DatasetResponse:
        dataset_status = str(row["dataset_status"])
        object_present = row.get("original_object_id") is not None

        # Derivation rules:
        if dataset_status in ("allocated", "uploading", "uploaded"):
            upload_status = dataset_status
        elif dataset_status in ("pending_validation", "valid", "invalid", "quarantined"):
            upload_status = "finalized"
        else:
            upload_status = dataset_status

        if dataset_status in ("valid", "invalid", "quarantined"):
            validation_status = dataset_status
        elif dataset_status == "pending_validation":
            validation_status = "pending"
        else:
            validation_status = "not_started"

        return DatasetResponse(
            id=row["id"],
            organization_id=row["organization_id"],
            project_id=row["project_id"],
            technique=str(row["technique"]),
            display_filename=row["display_filename"],
            declared_content_type=row["declared_content_type"],
            byte_size=row["byte_size"],
            client_checksum_sha256=row.get("client_checksum_sha256"),
            dataset_status=dataset_status,
            status_changed_at=row["status_changed_at"],
            failure_code=row.get("failure_code"),
            original_object_id=row.get("original_object_id"),
            created_by=row["created_by"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            upload_status=upload_status,
            object_present=object_present,
            validation_status=validation_status,
        )
