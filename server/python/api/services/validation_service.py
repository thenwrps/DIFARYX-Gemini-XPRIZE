import re
import uuid
from typing import Optional
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.uow import UnitOfWork
from api.errors import (
    DatasetNotFoundError,
    DatasetStateError,
    ValidationNotFoundError,
    ValidationStateError,
)
from api.models.validation import (
    CancelValidationResponse,
    EnqueueValidationResponse,
    ValidationAttemptListResponse,
    ValidationAttemptResponse,
    ValidationOutcome,
    ValidationStatusResponse,
)
from api.repositories.dataset_repository import DatasetRepository
from api.repositories.validation_attempt_repository import ValidationAttemptRepository
from api.storage.factory import get_object_store
from api.storage.protocol import ObjectStore
from api.validation.checks import run_all_checks


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


class ValidationService:
    @staticmethod
    async def enqueue_validation(
        organization_id: UUID,
        user_id: UUID,
        dataset_id: UUID,
    ) -> EnqueueValidationResponse:
        async with UnitOfWork(organization_id=organization_id, user_id=user_id) as session:
            dataset = await DatasetRepository.get_dataset(session, organization_id, dataset_id)
            if not dataset:
                raise DatasetNotFoundError(f"Dataset not found: {dataset_id}")

            if dataset["dataset_status"] != "pending_validation":
                raise DatasetStateError(
                    f"Dataset must be in pending_validation state, got {dataset['dataset_status']}"
                )

            original_object_id = dataset.get("original_object_id")
            if not original_object_id:
                raise DatasetStateError("Dataset has no original object linked")

            attempt = await ValidationAttemptRepository.create_attempt(
                session,
                organization_id=organization_id,
                dataset_id=dataset_id,
                original_object_id=original_object_id,
                max_attempts=3,
            )

            await _append_audit_event(
                session,
                organization_id,
                user_id,
                "validation.enqueued",
                "dataset",
                dataset_id,
            )

            return EnqueueValidationResponse(
                dataset_id=dataset_id,
                attempt_id=attempt["id"],
                attempt_number=attempt["attempt_number"],
                dataset_status=dataset["dataset_status"],
            )

    @staticmethod
    async def process_one(
        organization_id: UUID,
        user_id: UUID,
        worker_id: str,
    ) -> Optional[ValidationOutcome]:
        raise ValidationStateError(
            "Validation settlement is worker-only; use the dedicated validation worker"
        )

        # Historical API-shaped processing logic remains below for reference
        # during the registry migration, but is unreachable by design.
        async with UnitOfWork(organization_id=organization_id, user_id=user_id) as session:
            claimed = await ValidationAttemptRepository.claim_next(
                session,
                organization_id=organization_id,
                worker_id=worker_id,
                lock_timeout_seconds=300,
            )

            if not claimed:
                stale = await ValidationAttemptRepository.reclaim_stale(
                    session,
                    organization_id=organization_id,
                    worker_id=worker_id,
                    lock_timeout_seconds=300,
                )
                if not stale:
                    return None
                claimed = stale

            attempt_id = claimed["id"]
            dataset_id = claimed["dataset_id"]
            original_object_id = claimed["original_object_id"]
            attempt_number = claimed["attempt_number"]
            max_attempts = claimed["max_attempts"]

            running = await ValidationAttemptRepository.mark_running(
                session,
                organization_id=organization_id,
                attempt_id=attempt_id,
                worker_id=worker_id,
            )

            if not running:
                raise ValidationStateError("Failed to transition to running state")

            await _append_audit_event(
                session,
                organization_id,
                user_id,
                "validation.claimed",
                "validation_attempt",
                attempt_id,
            )

        dataset = None
        original_object = None
        async with UnitOfWork(organization_id=organization_id, user_id=user_id) as session:
            dataset = await DatasetRepository.get_dataset(session, organization_id, dataset_id)
            from api.repositories.dataset_object_repository import DatasetObjectRepository
            original_object = await DatasetObjectRepository.get_dataset_object(
                session, organization_id, original_object_id
            )

        if not dataset or not original_object:
            async with UnitOfWork(organization_id=organization_id, user_id=user_id) as session:
                await ValidationAttemptRepository.mark_invalid(
                    session,
                    organization_id=organization_id,
                    attempt_id=attempt_id,
                    worker_id=worker_id,
                    failure_code="OBJECT_NOT_FOUND",
                    failure_details={"check": "object_exists", "detail": "Dataset or object not found"},
                )
                await _append_audit_event(
                    session,
                    organization_id,
                    user_id,
                    "validation.invalid",
                    "dataset",
                    dataset_id,
                )
            return ValidationOutcome(
                attempt_id=attempt_id,
                dataset_id=dataset_id,
                status="failed",
                checks_passed=0,
                server_checksum_sha256=None,
                byte_size_verified=None,
                failure_code="OBJECT_NOT_FOUND",
                transient=False,
            )

        object_key = original_object["object_key"]
        expected_byte_size = dataset["byte_size"]
        display_filename = dataset["display_filename"]
        declared_content_type = dataset["declared_content_type"]
        client_checksum_sha256 = dataset.get("client_checksum_sha256")

        store: ObjectStore = get_object_store()
        validation_result = await run_all_checks(
            store=store,
            object_key=object_key,
            expected_byte_size=expected_byte_size,
            display_filename=display_filename,
            declared_content_type=declared_content_type,
            client_checksum_sha256=client_checksum_sha256,
        )

        async with UnitOfWork(organization_id=organization_id, user_id=user_id) as session:
            if validation_result.passed:
                await ValidationAttemptRepository.mark_passed(
                    session,
                    organization_id=organization_id,
                    attempt_id=attempt_id,
                    worker_id=worker_id,
                    server_checksum_sha256=validation_result.server_checksum_sha256,
                    byte_size_verified=validation_result.byte_size_verified,
                )
                await _append_audit_event(
                    session,
                    organization_id,
                    user_id,
                    "validation.passed",
                    "dataset",
                    dataset_id,
                )
                return ValidationOutcome(
                    attempt_id=attempt_id,
                    dataset_id=dataset_id,
                    status="passed",
                    checks_passed=len(validation_result.checks),
                    server_checksum_sha256=validation_result.server_checksum_sha256,
                    byte_size_verified=validation_result.byte_size_verified,
                    failure_code=None,
                    transient=False,
                )

            if validation_result.transient:
                if attempt_number >= max_attempts:
                    await ValidationAttemptRepository.mark_quarantined(
                        session,
                        organization_id=organization_id,
                        attempt_id=attempt_id,
                        worker_id=worker_id,
                        failure_code=validation_result.failure_code,
                        failure_details=validation_result.failure_details,
                        quarantine_reason=f"Max retries ({max_attempts}) exhausted for transient failure",
                    )
                    await _append_audit_event(
                        session,
                        organization_id,
                        user_id,
                        "validation.quarantined",
                        "dataset",
                        dataset_id,
                    )
                    return ValidationOutcome(
                        attempt_id=attempt_id,
                        dataset_id=dataset_id,
                        status="quarantined",
                        checks_passed=len([c for c in validation_result.checks if c.passed]),
                        server_checksum_sha256=validation_result.server_checksum_sha256,
                        byte_size_verified=validation_result.byte_size_verified,
                        failure_code=validation_result.failure_code,
                        transient=True,
                    )
                else:
                    await ValidationAttemptRepository.mark_failed_with_retry(
                        session,
                        organization_id=organization_id,
                        attempt_id=attempt_id,
                        worker_id=worker_id,
                        failure_code=validation_result.failure_code,
                        failure_details=validation_result.failure_details,
                    )
                    await _append_audit_event(
                        session,
                        organization_id,
                        user_id,
                        "validation.failed",
                        "validation_attempt",
                        attempt_id,
                    )
                    return ValidationOutcome(
                        attempt_id=attempt_id,
                        dataset_id=dataset_id,
                        status="failed",
                        checks_passed=len([c for c in validation_result.checks if c.passed]),
                        server_checksum_sha256=validation_result.server_checksum_sha256,
                        byte_size_verified=validation_result.byte_size_verified,
                        failure_code=validation_result.failure_code,
                        transient=True,
                    )
            else:
                await ValidationAttemptRepository.mark_invalid(
                    session,
                    organization_id=organization_id,
                    attempt_id=attempt_id,
                    worker_id=worker_id,
                    failure_code=validation_result.failure_code,
                    failure_details=validation_result.failure_details,
                )
                await _append_audit_event(
                    session,
                    organization_id,
                    user_id,
                    "validation.invalid",
                    "dataset",
                    dataset_id,
                )
                return ValidationOutcome(
                    attempt_id=attempt_id,
                    dataset_id=dataset_id,
                    status="failed",
                    checks_passed=len([c for c in validation_result.checks if c.passed]),
                    server_checksum_sha256=validation_result.server_checksum_sha256,
                    byte_size_verified=validation_result.byte_size_verified,
                    failure_code=validation_result.failure_code,
                    transient=False,
                )

    @staticmethod
    async def cancel_validation(
        organization_id: UUID,
        user_id: UUID,
        dataset_id: UUID,
        reason: Optional[str] = None,
    ) -> CancelValidationResponse:
        async with UnitOfWork(organization_id=organization_id, user_id=user_id) as session:
            dataset = await DatasetRepository.get_dataset(session, organization_id, dataset_id)
            if not dataset:
                raise DatasetNotFoundError(f"Dataset not found: {dataset_id}")

            latest = await ValidationAttemptRepository.get_latest_for_dataset(
                session, organization_id, dataset_id
            )

            if not latest:
                raise ValidationNotFoundError(f"No validation attempt found for dataset: {dataset_id}")

            if latest["status"] in ("passed", "failed", "quarantined", "cancelled"):
                raise ValidationStateError(
                    f"Cannot cancel validation in {latest['status']} state"
                )

            cancelled = await ValidationAttemptRepository.mark_cancelled(
                session,
                organization_id=organization_id,
                attempt_id=latest["id"],
            )

            if not cancelled:
                raise ValidationStateError("Failed to cancel validation")

            await _append_audit_event(
                session,
                organization_id,
                user_id,
                "validation.cancelled",
                "validation_attempt",
                latest["id"],
            )

            return CancelValidationResponse(
                dataset_id=dataset_id,
                attempt_id=latest["id"],
                attempt_status=cancelled["status"],
                dataset_status=dataset["dataset_status"],
            )

    @staticmethod
    async def get_validation_status(
        organization_id: UUID,
        user_id: UUID,
        dataset_id: UUID,
    ) -> ValidationStatusResponse:
        async with UnitOfWork(organization_id=organization_id, user_id=user_id) as session:
            dataset = await DatasetRepository.get_dataset(session, organization_id, dataset_id)
            if not dataset:
                raise DatasetNotFoundError(f"Dataset not found: {dataset_id}")

            latest = await ValidationAttemptRepository.get_latest_for_dataset(
                session, organization_id, dataset_id
            )

            latest_attempt = None
            if latest:
                latest_attempt = ValidationAttemptResponse(
                    id=latest["id"],
                    attempt_number=latest["attempt_number"],
                    status=latest["status"],
                    claimed_at=latest.get("claimed_at"),
                    started_at=latest.get("started_at"),
                    completed_at=latest.get("completed_at"),
                    failure_code=latest.get("failure_code"),
                    failure_details=latest.get("failure_details"),
                    server_checksum_sha256=latest.get("server_checksum_sha256"),
                    byte_size_verified=latest.get("byte_size_verified"),
                    quarantine_reason=latest.get("quarantine_reason"),
                    created_at=latest["created_at"],
                )

            return ValidationStatusResponse(
                dataset_id=dataset_id,
                dataset_status=dataset["dataset_status"],
                latest_attempt=latest_attempt,
            )

    @staticmethod
    async def list_validation_attempts(
        organization_id: UUID,
        user_id: UUID,
        dataset_id: UUID,
        limit: int = 50,
        cursor: Optional[str] = None,
    ) -> ValidationAttemptListResponse:
        cursor_created_at = None
        cursor_id = None
        if cursor:
            parts = cursor.split("|")
            if len(parts) == 2:
                from datetime import datetime
                cursor_created_at = datetime.fromisoformat(parts[0])
                cursor_id = UUID(parts[1])

        async with UnitOfWork(organization_id=organization_id, user_id=user_id) as session:
            attempts = await ValidationAttemptRepository.list_for_dataset(
                session,
                organization_id,
                dataset_id,
                limit=limit + 1,
                cursor_created_at=cursor_created_at,
                cursor_id=cursor_id,
            )

            has_more = len(attempts) > limit
            if has_more:
                attempts = attempts[:limit]

            items = []
            for attempt in attempts:
                items.append(
                    ValidationAttemptResponse(
                        id=attempt["id"],
                        attempt_number=attempt["attempt_number"],
                        status=attempt["status"],
                        claimed_at=attempt.get("claimed_at"),
                        started_at=attempt.get("started_at"),
                        completed_at=attempt.get("completed_at"),
                        failure_code=attempt.get("failure_code"),
                        failure_details=attempt.get("failure_details"),
                        server_checksum_sha256=attempt.get("server_checksum_sha256"),
                        byte_size_verified=attempt.get("byte_size_verified"),
                        quarantine_reason=attempt.get("quarantine_reason"),
                        created_at=attempt["created_at"],
                    )
                )

            next_cursor = None
            if has_more and items:
                last = items[-1]
                next_cursor = f"{last.created_at.isoformat()}|{last.id}"

            return ValidationAttemptListResponse(
                items=items,
                next_cursor=next_cursor,
                has_more=has_more,
            )
