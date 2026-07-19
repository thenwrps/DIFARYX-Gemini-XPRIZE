"""Repository for science.upload_sessions with guarded state transitions and advisory locks."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession


class UploadSessionRepository:
    @staticmethod
    async def create_upload_session(
        session: AsyncSession,
        organization_id: UUID,
        dataset_id: UUID,
        object_key: str,
        expected_byte_size: int,
        client_checksum_sha256: Optional[str],
        storage_provider: str,
        idempotency_key: str,
        request_fingerprint: str,
        quota_reservation_id: UUID,
        expires_at: datetime,
        created_by: UUID,
    ) -> Dict[str, Any]:
        result = await session.execute(
            sa.text("""
                INSERT INTO science.upload_sessions (
                    organization_id, dataset_id, object_key, expected_byte_size,
                    client_checksum_sha256, storage_provider, idempotency_key,
                    request_fingerprint, quota_reservation_id, expires_at, created_by
                ) VALUES (
                    :organization_id, :dataset_id, :object_key, :expected_byte_size,
                    :client_checksum_sha256, :storage_provider, :idempotency_key,
                    :request_fingerprint, :quota_reservation_id, :expires_at, :created_by
                )
                RETURNING *
            """),
            {
                "organization_id": organization_id,
                "dataset_id": dataset_id,
                "object_key": object_key,
                "expected_byte_size": expected_byte_size,
                "client_checksum_sha256": client_checksum_sha256,
                "storage_provider": storage_provider,
                "idempotency_key": idempotency_key,
                "request_fingerprint": request_fingerprint,
                "quota_reservation_id": quota_reservation_id,
                "expires_at": expires_at,
                "created_by": created_by,
            },
        )
        row = result.mappings().first()
        return dict(row) if row else {}

    @staticmethod
    async def get_upload_session(
        session: AsyncSession,
        organization_id: UUID,
        session_id: UUID,
    ) -> Optional[Dict[str, Any]]:
        result = await session.execute(
            sa.text("SELECT * FROM science.upload_sessions WHERE organization_id = :org_id AND id = :id"),
            {"org_id": organization_id, "id": session_id},
        )
        row = result.mappings().first()
        return dict(row) if row else None

    @staticmethod
    async def find_by_idempotency_key(
        session: AsyncSession,
        organization_id: UUID,
        idempotency_key: str,
    ) -> Optional[Dict[str, Any]]:
        result = await session.execute(
            sa.text("SELECT * FROM science.upload_sessions WHERE organization_id = :org_id AND idempotency_key = :key"),
            {"org_id": organization_id, "key": idempotency_key},
        )
        row = result.mappings().first()
        return dict(row) if row else None

    @staticmethod
    async def find_by_request_fingerprint(
        session: AsyncSession,
        organization_id: UUID,
        fingerprint: str,
    ) -> Optional[Dict[str, Any]]:
        result = await session.execute(
            sa.text("SELECT * FROM science.upload_sessions WHERE organization_id = :org_id AND request_fingerprint = :fp"),
            {"org_id": organization_id, "fp": fingerprint},
        )
        row = result.mappings().first()
        return dict(row) if row else None

    @staticmethod
    async def list_sessions_for_dataset(
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
                SELECT * FROM science.upload_sessions
                WHERE {where}
                ORDER BY created_at DESC, id DESC
                LIMIT :limit
            """),
            params,
        )
        return [dict(row) for row in result.mappings().all()]

    @staticmethod
    async def claim_for_streaming(
        session: AsyncSession,
        organization_id: UUID,
        session_id: UUID,
    ) -> Optional[Dict[str, Any]]:
        result = await session.execute(
            sa.text("""
                UPDATE science.upload_sessions
                SET session_status = 'uploading'::science.upload_session_status,
                    updated_at = NOW()
                WHERE organization_id = :org_id
                  AND id = :id
                  AND session_status = 'allocated'::science.upload_session_status
                  AND expires_at > NOW()
                RETURNING *
            """),
            {"org_id": organization_id, "id": session_id},
        )
        row = result.mappings().first()
        return dict(row) if row else None

    @staticmethod
    async def mark_uploaded(
        session: AsyncSession,
        organization_id: UUID,
        session_id: UUID,
    ) -> Optional[Dict[str, Any]]:
        result = await session.execute(
            sa.text("""
                UPDATE science.upload_sessions
                SET session_status = 'uploaded'::science.upload_session_status,
                    updated_at = NOW()
                WHERE organization_id = :org_id
                  AND id = :id
                  AND session_status = 'uploading'::science.upload_session_status
                RETURNING *
            """),
            {"org_id": organization_id, "id": session_id},
        )
        row = result.mappings().first()
        return dict(row) if row else None

    @staticmethod
    async def acquire_finalize_lock(
        session: AsyncSession,
        session_id: UUID,
    ) -> None:
        await session.execute(
            sa.text("SELECT pg_advisory_xact_lock(hashtext(CAST(:session_id AS text)))"),
            {"session_id": str(session_id)},
        )

    @staticmethod
    async def complete_finalize(
        session: AsyncSession,
        organization_id: UUID,
        session_id: UUID,
    ) -> Optional[Dict[str, Any]]:
        result = await session.execute(
            sa.text("""
                UPDATE science.upload_sessions
                SET session_status = 'finalized'::science.upload_session_status,
                    finalized_at = NOW(),
                    updated_at = NOW()
                WHERE organization_id = :org_id
                  AND id = :id
                  AND session_status = 'uploaded'::science.upload_session_status
                RETURNING *
            """),
            {"org_id": organization_id, "id": session_id},
        )
        row = result.mappings().first()
        return dict(row) if row else None

    @staticmethod
    async def mark_failed(
        session: AsyncSession,
        organization_id: UUID,
        session_id: UUID,
        failure_code: str,
    ) -> Optional[Dict[str, Any]]:
        result = await session.execute(
            sa.text("""
                UPDATE science.upload_sessions
                SET session_status = 'failed'::science.upload_session_status,
                    failure_code = :failure_code,
                    updated_at = NOW()
                WHERE organization_id = :org_id
                  AND id = :id
                  AND session_status NOT IN (
                      'finalized'::science.upload_session_status,
                      'cancelled'::science.upload_session_status
                  )
                RETURNING *
            """),
            {"org_id": organization_id, "id": session_id, "failure_code": failure_code},
        )
        row = result.mappings().first()
        return dict(row) if row else None

    @staticmethod
    async def mark_cancelled(
        session: AsyncSession,
        organization_id: UUID,
        session_id: UUID,
    ) -> Optional[Dict[str, Any]]:
        result = await session.execute(
            sa.text("""
                UPDATE science.upload_sessions
                SET session_status = 'cancelled'::science.upload_session_status,
                    cancelled_at = NOW(),
                    updated_at = NOW()
                WHERE organization_id = :org_id
                  AND id = :id
                  AND session_status IN (
                      'allocated'::science.upload_session_status,
                      'uploaded'::science.upload_session_status
                  )
                RETURNING *
            """),
            {"org_id": organization_id, "id": session_id},
        )
        row = result.mappings().first()
        return dict(row) if row else None

    @staticmethod
    async def get_session_with_reservation(
        session: AsyncSession,
        organization_id: UUID,
        session_id: UUID,
    ) -> Optional[Dict[str, Any]]:
        result = await session.execute(
            sa.text("""
                SELECT us.*, qr.status AS reservation_status
                FROM science.upload_sessions us
                LEFT JOIN governance.quota_reservations qr
                  ON us.organization_id = qr.organization_id
                  AND us.quota_reservation_id = qr.id
                WHERE us.organization_id = :org_id AND us.id = :id
            """),
            {"org_id": organization_id, "id": session_id},
        )
        row = result.mappings().first()
        return dict(row) if row else None

    @staticmethod
    async def reclaim_expired_sessions(
        session: AsyncSession,
        organization_id: UUID,
    ) -> List[Dict[str, Any]]:
        result = await session.execute(
            sa.text("""
                SELECT id, quota_reservation_id, object_key FROM science.upload_sessions
                WHERE organization_id = :org_id
                  AND session_status IN (
                      'allocated'::science.upload_session_status,
                      'uploading'::science.upload_session_status,
                      'uploaded'::science.upload_session_status
                  )
                  AND expires_at < NOW()
                FOR UPDATE SKIP LOCKED
            """),
            {"org_id": organization_id},
        )
        expired_rows = [dict(row) for row in result.mappings().all()]
        if not expired_rows:
            return []

        expired_ids = [r["id"] for r in expired_rows]
        await session.execute(
            sa.text("""
                UPDATE science.upload_sessions
                SET session_status = 'expired'::science.upload_session_status,
                    updated_at = NOW()
                WHERE organization_id = :org_id
                  AND id = ANY(:ids)
                  AND session_status IN (
                      'allocated'::science.upload_session_status,
                      'uploading'::science.upload_session_status,
                      'uploaded'::science.upload_session_status
                  )
            """),
            {"org_id": organization_id, "ids": expired_ids},
        )
        return expired_rows

    @staticmethod
    async def mark_expired(
        session: AsyncSession,
        organization_id: UUID,
        session_id: UUID,
    ) -> Optional[Dict[str, Any]]:
        result = await session.execute(
            sa.text("""
                UPDATE science.upload_sessions
                SET session_status = 'expired'::science.upload_session_status,
                    updated_at = NOW()
                WHERE organization_id = :org_id
                  AND id = :id
                  AND session_status IN (
                      'allocated'::science.upload_session_status,
                      'uploading'::science.upload_session_status,
                      'uploaded'::science.upload_session_status
                  )
                RETURNING *
            """),
            {"org_id": organization_id, "id": session_id},
        )
        row = result.mappings().first()
        return dict(row) if row else None
