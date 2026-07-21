from __future__ import annotations

import json
from typing import Any, Dict, List, Optional
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession


class ValidationAttemptRepository:
    @staticmethod
    async def create_attempt(
        session: AsyncSession,
        organization_id: UUID,
        dataset_id: UUID,
        original_object_id: UUID,
        max_attempts: int = 3,
    ) -> Dict[str, Any]:
        result = await session.execute(
            sa.text("""
                INSERT INTO science.validation_attempts (
                    organization_id, dataset_id, original_object_id, max_attempts
                ) VALUES (
                    :organization_id, :dataset_id, :original_object_id, :max_attempts
                )
                RETURNING *
            """),
            {
                "organization_id": organization_id,
                "dataset_id": dataset_id,
                "original_object_id": original_object_id,
                "max_attempts": max_attempts,
            },
        )
        row = result.mappings().first()
        return dict(row) if row else {}

    @staticmethod
    async def claim_next(
        session: AsyncSession,
        organization_id: UUID,
        worker_id: str,
        lock_timeout_seconds: int = 300,
    ) -> Optional[Dict[str, Any]]:
        result = await session.execute(
            sa.text("""
                WITH picked AS (
                    SELECT id
                    FROM science.validation_attempts
                    WHERE organization_id = :org_id
                      AND status = 'queued'::science.validation_attempt_status
                      AND (next_retry_at IS NULL OR next_retry_at <= NOW())
                      AND attempt_number <= max_attempts
                      AND claimed_by IS NULL
                    ORDER BY next_retry_at NULLS FIRST, created_at
                    LIMIT 1
                    FOR UPDATE SKIP LOCKED
                ), claimed AS (
                    UPDATE science.validation_attempts
                    SET status = 'claimed'::science.validation_attempt_status,
                        claimed_at = NOW(),
                        claimed_by = :worker_id,
                        lock_expires_at = NOW() + make_interval(secs => :lock_timeout),
                        started_at = NOW(),
                        updated_at = NOW()
                    FROM picked
                    WHERE science.validation_attempts.organization_id = :org_id
                      AND science.validation_attempts.id = picked.id
                      AND science.validation_attempts.status = 'queued'::science.validation_attempt_status
                      AND science.validation_attempts.attempt_number <= science.validation_attempts.max_attempts
                      AND science.validation_attempts.claimed_by IS NULL
                    RETURNING *
                )
                SELECT * FROM claimed
            """),
            {
                "org_id": organization_id,
                "worker_id": worker_id,
                "lock_timeout": lock_timeout_seconds,
            },
        )
        row = result.mappings().first()
        if not row:
            return None

        attempt = dict(row)
        await session.execute(
            sa.text("""
                UPDATE science.datasets
                SET dataset_status = 'validating'::science.dataset_status,
                    status_changed_at = NOW(),
                    updated_at = NOW()
                WHERE organization_id = :org_id
                  AND id = :dataset_id
                  AND dataset_status = 'pending_validation'::science.dataset_status
            """),
            {
                "org_id": organization_id,
                "dataset_id": attempt["dataset_id"],
            },
        )
        return attempt

    @staticmethod
    async def mark_running(
        session: AsyncSession,
        organization_id: UUID,
        attempt_id: UUID,
        worker_id: str,
    ) -> Optional[Dict[str, Any]]:
        result = await session.execute(
            sa.text("""
                UPDATE science.validation_attempts
                SET status = 'running'::science.validation_attempt_status,
                    updated_at = NOW()
                WHERE organization_id = :org_id
                  AND id = :id
                  AND status = 'claimed'::science.validation_attempt_status
                  AND claimed_by = :worker_id
                RETURNING *
            """),
            {"org_id": organization_id, "id": attempt_id, "worker_id": worker_id},
        )
        row = result.mappings().first()
        return dict(row) if row else None

    @staticmethod
    async def mark_passed(
        session: AsyncSession,
        organization_id: UUID,
        attempt_id: UUID,
        worker_id: str,
        server_checksum_sha256: str,
        byte_size_verified: int,
    ) -> Optional[Dict[str, Any]]:
        result = await session.execute(
            sa.text("""
                WITH updated AS (
                    UPDATE science.validation_attempts
                    SET status = 'passed'::science.validation_attempt_status,
                        completed_at = NOW(),
                        server_checksum_sha256 = :checksum,
                        byte_size_verified = :byte_size,
                        updated_at = NOW()
                    WHERE organization_id = :org_id
                      AND id = :id
                      AND status = 'running'::science.validation_attempt_status
                      AND claimed_by = :worker_id
                    RETURNING *
                )
                UPDATE science.datasets
                SET dataset_status = 'valid'::science.dataset_status,
                    status_changed_at = NOW(),
                    updated_at = NOW()
                WHERE organization_id = :org_id
                  AND id = (SELECT dataset_id FROM updated)
                  AND dataset_status IN ('pending_validation'::science.dataset_status,
                                         'validating'::science.dataset_status)
                RETURNING (SELECT * FROM updated)
            """),
            {
                "org_id": organization_id,
                "id": attempt_id,
                "worker_id": worker_id,
                "checksum": server_checksum_sha256,
                "byte_size": byte_size_verified,
            },
        )
        row = result.mappings().first()
        return dict(row) if row else None

    @staticmethod
    async def mark_failed_with_retry(
        session: AsyncSession,
        organization_id: UUID,
        attempt_id: UUID,
        worker_id: str,
        failure_code: str,
        failure_details: Dict[str, Any],
    ) -> Optional[Dict[str, Any]]:
        result = await session.execute(
            sa.text("""
                WITH updated AS (
                    UPDATE science.validation_attempts AS current_attempt
                    SET status = 'failed'::science.validation_attempt_status,
                        failure_code = :failure_code,
                        failure_details = CAST(:failure_details AS jsonb),
                        next_retry_at = NOW() + (30 * power(2, LEAST(current_attempt.attempt_number - 1, 4))) * INTERVAL '1 second',
                        claimed_at = NULL,
                        claimed_by = NULL,
                        lock_expires_at = NULL,
                        completed_at = NOW(),
                        updated_at = NOW()
                    WHERE current_attempt.organization_id = :org_id
                      AND current_attempt.id = :id
                      AND current_attempt.status = 'running'::science.validation_attempt_status
                      AND current_attempt.claimed_by = :worker_id
                      AND current_attempt.attempt_number < current_attempt.max_attempts
                      AND NOT EXISTS (
                          SELECT 1
                          FROM science.validation_attempts AS successor
                          WHERE successor.organization_id = current_attempt.organization_id
                            AND successor.dataset_id = current_attempt.dataset_id
                            AND successor.attempt_number = current_attempt.attempt_number + 1
                      )
                    RETURNING *
                ), next_attempt AS (
                    INSERT INTO science.validation_attempts (
                        organization_id, dataset_id, original_object_id,
                        attempt_number, max_attempts, status, next_retry_at,
                        created_at, updated_at
                    )
                    SELECT organization_id, dataset_id, original_object_id,
                           attempt_number + 1, max_attempts,
                           'queued'::science.validation_attempt_status,
                           next_retry_at, NOW(), NOW()
                    FROM updated
                    ON CONFLICT (organization_id, dataset_id, attempt_number)
                    DO NOTHING
                    RETURNING id
                ), dataset_updated AS (
                    UPDATE science.datasets
                    SET dataset_status = 'pending_validation'::science.dataset_status,
                        status_changed_at = NOW(),
                        updated_at = NOW()
                    FROM next_attempt
                    WHERE science.datasets.organization_id = :org_id
                      AND science.datasets.id = (SELECT dataset_id FROM updated)
                      AND dataset_status = 'validating'::science.dataset_status
                    RETURNING id
                )
                SELECT updated.*
                FROM updated
                CROSS JOIN next_attempt
            """),
            {
                "org_id": organization_id,
                "id": attempt_id,
                "worker_id": worker_id,
                "failure_code": failure_code,
                "failure_details": json.dumps(failure_details),
            },
        )
        row = result.mappings().first()
        return dict(row) if row else None

    @staticmethod
    async def mark_quarantined(
        session: AsyncSession,
        organization_id: UUID,
        attempt_id: UUID,
        worker_id: str,
        failure_code: str,
        failure_details: Dict[str, Any],
        quarantine_reason: str,
    ) -> Optional[Dict[str, Any]]:
        result = await session.execute(
            sa.text("""
                WITH updated AS (
                    UPDATE science.validation_attempts
                    SET status = 'quarantined'::science.validation_attempt_status,
                        completed_at = NOW(),
                        failure_code = :failure_code,
                        failure_details = CAST(:failure_details AS jsonb),
                        quarantine_reason = :quarantine_reason,
                        updated_at = NOW()
                    WHERE organization_id = :org_id
                      AND id = :id
                      AND status = 'running'::science.validation_attempt_status
                      AND claimed_by = :worker_id
                      AND attempt_number >= max_attempts
                    RETURNING *
                )
                UPDATE science.datasets
                SET dataset_status = 'quarantined'::science.dataset_status,
                    status_changed_at = NOW(),
                    failure_code = :failure_code,
                    updated_at = NOW()
                WHERE organization_id = :org_id
                  AND id = (SELECT dataset_id FROM updated)
                  AND dataset_status = 'validating'::science.dataset_status
                RETURNING (SELECT * FROM updated)
            """),
            {
                "org_id": organization_id,
                "id": attempt_id,
                "worker_id": worker_id,
                "failure_code": failure_code,
                "failure_details": str(failure_details),
                "quarantine_reason": quarantine_reason,
            },
        )
        row = result.mappings().first()
        return dict(row) if row else None

    @staticmethod
    async def mark_invalid(
        session: AsyncSession,
        organization_id: UUID,
        attempt_id: UUID,
        worker_id: str,
        failure_code: str,
        failure_details: Dict[str, Any],
    ) -> Optional[Dict[str, Any]]:
        result = await session.execute(
            sa.text("""
                WITH updated AS (
                    UPDATE science.validation_attempts
                    SET status = 'failed'::science.validation_attempt_status,
                        completed_at = NOW(),
                        failure_code = :failure_code,
                        failure_details = CAST(:failure_details AS jsonb),
                        updated_at = NOW()
                    WHERE organization_id = :org_id
                      AND id = :id
                      AND status = 'running'::science.validation_attempt_status
                      AND claimed_by = :worker_id
                    RETURNING *
                )
                UPDATE science.datasets
                SET dataset_status = 'invalid'::science.dataset_status,
                    status_changed_at = NOW(),
                    failure_code = :failure_code,
                    updated_at = NOW()
                WHERE organization_id = :org_id
                  AND id = (SELECT dataset_id FROM updated)
                  AND dataset_status = 'validating'::science.dataset_status
                RETURNING (SELECT * FROM updated)
            """),
            {
                "org_id": organization_id,
                "id": attempt_id,
                "worker_id": worker_id,
                "failure_code": failure_code,
                "failure_details": str(failure_details),
            },
        )
        row = result.mappings().first()
        return dict(row) if row else None

    @staticmethod
    async def mark_cancelled(
        session: AsyncSession,
        organization_id: UUID,
        attempt_id: UUID,
    ) -> Optional[Dict[str, Any]]:
        result = await session.execute(
            sa.text("""
                UPDATE science.validation_attempts
                SET status = 'cancelled'::science.validation_attempt_status,
                    completed_at = NOW(),
                    claimed_at = NULL,
                    claimed_by = NULL,
                    updated_at = NOW()
                WHERE organization_id = :org_id
                  AND id = :id
                  AND status IN ('queued'::science.validation_attempt_status,
                                 'claimed'::science.validation_attempt_status,
                                 'running'::science.validation_attempt_status)
                RETURNING *
            """),
            {"org_id": organization_id, "id": attempt_id},
        )
        row = result.mappings().first()
        return dict(row) if row else None

    @staticmethod
    async def reclaim_stale(
        session: AsyncSession,
        organization_id: UUID,
        worker_id: str,
        lock_timeout_seconds: int = 300,
    ) -> Optional[Dict[str, Any]]:
        result = await session.execute(
            sa.text("""
                WITH picked AS (
                    SELECT id
                    FROM science.validation_attempts
                    WHERE organization_id = :org_id
                      AND status IN ('claimed'::science.validation_attempt_status,
                                     'running'::science.validation_attempt_status)
                      AND lock_expires_at IS NOT NULL
                      AND lock_expires_at < NOW()
                      AND attempt_number <= max_attempts
                      AND claimed_by IS NOT NULL
                    ORDER BY lock_expires_at
                    LIMIT 1
                    FOR UPDATE SKIP LOCKED
                ), reclaimed AS (
                    UPDATE science.validation_attempts
                    SET status = 'claimed'::science.validation_attempt_status,
                        claimed_at = NOW(),
                        claimed_by = :worker_id,
                        lock_expires_at = NOW() + make_interval(secs => :lock_timeout),
                        started_at = NOW(),
                        updated_at = NOW()
                    FROM picked
                    WHERE science.validation_attempts.organization_id = :org_id
                      AND science.validation_attempts.id = picked.id
                      AND science.validation_attempts.status IN (
                          'claimed'::science.validation_attempt_status,
                          'running'::science.validation_attempt_status
                      )
                      AND science.validation_attempts.lock_expires_at IS NOT NULL
                      AND science.validation_attempts.lock_expires_at < NOW()
                      AND science.validation_attempts.attempt_number <= science.validation_attempts.max_attempts
                      AND science.validation_attempts.claimed_by IS NOT NULL
                    RETURNING *
                )
                SELECT * FROM reclaimed
            """),
            {
                "org_id": organization_id,
                "worker_id": worker_id,
                "lock_timeout": lock_timeout_seconds,
            },
        )
        row = result.mappings().first()
        if not row:
            return None

        attempt = dict(row)
        await session.execute(
            sa.text("""
                UPDATE science.datasets
                SET dataset_status = 'validating'::science.dataset_status,
                    status_changed_at = NOW(),
                    updated_at = NOW()
                WHERE organization_id = :org_id
                  AND id = :dataset_id
                  AND dataset_status = 'pending_validation'::science.dataset_status
            """),
            {
                "org_id": organization_id,
                "dataset_id": attempt["dataset_id"],
            },
        )
        return attempt

    @staticmethod
    async def renew_lock(
        session: AsyncSession,
        organization_id: UUID,
        attempt_id: UUID,
        worker_id: str,
        lock_timeout_seconds: int = 300,
    ) -> bool:
        """Extend lock_expires_at for an in-flight attempt. Returns True if updated."""
        result = await session.execute(
            sa.text("""
                UPDATE science.validation_attempts
                SET lock_expires_at = NOW() + make_interval(secs => :lock_timeout),
                    updated_at = NOW()
                WHERE organization_id = :org_id
                  AND id = :id
                  AND claimed_by = :worker_id
                  AND status IN ('claimed'::science.validation_attempt_status,
                                 'running'::science.validation_attempt_status)
            """),
            {
                "org_id": organization_id,
                "id": attempt_id,
                "worker_id": worker_id,
                "lock_timeout": lock_timeout_seconds,
            },
        )
        return (result.rowcount or 0) > 0

    @staticmethod
    async def release_claim(
        session: AsyncSession,
        organization_id: UUID,
        attempt_id: UUID,
        worker_id: str,
    ) -> bool:
        """Release a claim without settling the attempt. Resets to queued so
        reclaim_stale or another worker can pick it up. Returns True if updated."""
        result = await session.execute(
            sa.text("""
                UPDATE science.validation_attempts
                SET status = 'queued'::science.validation_attempt_status,
                    claimed_at = NULL,
                    claimed_by = NULL,
                    started_at = NULL,
                    lock_expires_at = NOW() + INTERVAL '5 minutes',
                    updated_at = NOW()
                WHERE organization_id = :org_id
                  AND id = :id
                  AND claimed_by = :worker_id
                  AND status IN ('claimed'::science.validation_attempt_status,
                                 'running'::science.validation_attempt_status)
                  AND completed_at IS NULL
            """),
            {
                "org_id": organization_id,
                "id": attempt_id,
                "worker_id": worker_id,
            },
        )
        return (result.rowcount or 0) > 0

    @staticmethod
    async def get_attempt(
        session: AsyncSession,
        organization_id: UUID,
        attempt_id: UUID,
    ) -> Optional[Dict[str, Any]]:
        result = await session.execute(
            sa.text("SELECT * FROM science.validation_attempts WHERE organization_id = :org_id AND id = :id"),
            {"org_id": organization_id, "id": attempt_id},
        )
        row = result.mappings().first()
        return dict(row) if row else None

    @staticmethod
    async def get_latest_for_dataset(
        session: AsyncSession,
        organization_id: UUID,
        dataset_id: UUID,
    ) -> Optional[Dict[str, Any]]:
        result = await session.execute(
            sa.text("""
                SELECT * FROM science.validation_attempts
                WHERE organization_id = :org_id AND dataset_id = :dataset_id
                ORDER BY attempt_number DESC
                LIMIT 1
            """),
            {"org_id": organization_id, "dataset_id": dataset_id},
        )
        row = result.mappings().first()
        return dict(row) if row else None

    @staticmethod
    async def list_for_dataset(
        session: AsyncSession,
        organization_id: UUID,
        dataset_id: UUID,
        limit: int = 50,
        cursor_created_at: Optional[Any] = None,
        cursor_id: Optional[UUID] = None,
    ) -> List[Dict[str, Any]]:
        conditions = ["organization_id = :org_id", "dataset_id = :dataset_id"]
        params: Dict[str, Any] = {"org_id": organization_id, "dataset_id": dataset_id, "limit": limit}

        if cursor_created_at and cursor_id:
            conditions.append("(created_at, id) < (:cursor_created_at, :cursor_id)")
            params["cursor_created_at"] = cursor_created_at
            params["cursor_id"] = cursor_id

        where = " AND ".join(conditions)
        result = await session.execute(
            sa.text(f"""
                SELECT * FROM science.validation_attempts
                WHERE {where}
                ORDER BY attempt_number DESC
                LIMIT :limit
            """),
            params,
        )
        return [dict(row) for row in result.mappings().all()]

    @staticmethod
    async def list_queued(
        session: AsyncSession,
        organization_id: UUID,
        limit: int = 10,
    ) -> List[Dict[str, Any]]:
        result = await session.execute(
            sa.text("""
                SELECT * FROM science.validation_attempts
                WHERE organization_id = :org_id
                  AND status = 'queued'::science.validation_attempt_status
                  AND attempt_number <= max_attempts
                  AND claimed_by IS NULL
                  AND (next_retry_at IS NULL OR next_retry_at <= NOW())
                ORDER BY next_retry_at NULLS FIRST, created_at
                LIMIT :limit
            """),
            {"org_id": organization_id, "limit": limit},
        )
        return [dict(row) for row in result.mappings().all()]
