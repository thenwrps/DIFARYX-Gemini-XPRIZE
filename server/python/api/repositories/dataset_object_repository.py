"""Repository for science.dataset_objects with idempotent insert."""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession


class DatasetObjectRepository:
    @staticmethod
    async def create_dataset_object(
        session: AsyncSession,
        organization_id: UUID,
        dataset_id: UUID,
        source_upload_session_id: UUID,
        object_role: str,
        storage_provider: str,
        object_key: str,
        storage_generation: Optional[str],
        byte_size: int,
        content_type: str,
        authoritative_sha256: Optional[str] = None,
    ) -> Dict[str, Any]:
        result = await session.execute(
            sa.text("""
                INSERT INTO science.dataset_objects (
                    organization_id, dataset_id, source_upload_session_id,
                    object_role, storage_provider, object_key, storage_generation,
                    byte_size, content_type, authoritative_sha256
                ) VALUES (
                    :organization_id, :dataset_id, :source_upload_session_id,
                    CAST(:object_role AS science.dataset_object_role), :storage_provider,
                    :object_key, :storage_generation, :byte_size, :content_type,
                    :authoritative_sha256
                )
                ON CONFLICT (organization_id, object_key) DO NOTHING
                RETURNING *
            """),
            {
                "organization_id": organization_id,
                "dataset_id": dataset_id,
                "source_upload_session_id": source_upload_session_id,
                "object_role": object_role,
                "storage_provider": storage_provider,
                "object_key": object_key,
                "storage_generation": storage_generation,
                "byte_size": byte_size,
                "content_type": content_type,
                "authoritative_sha256": authoritative_sha256,
            },
        )
        row = result.mappings().first()
        if row:
            return dict(row)
        existing = await DatasetObjectRepository.get_dataset_object(
            session, organization_id, dataset_id, object_role
        )
        return existing or {}

    @staticmethod
    async def get_dataset_object(
        session: AsyncSession,
        organization_id: UUID,
        dataset_id: UUID,
        object_role: str = "original",
    ) -> Optional[Dict[str, Any]]:
        result = await session.execute(
            sa.text("""
                SELECT * FROM science.dataset_objects
                WHERE organization_id = :org_id
                  AND dataset_id = :dataset_id
                  AND object_role = CAST(:object_role AS science.dataset_object_role)
            """),
            {"org_id": organization_id, "dataset_id": dataset_id, "object_role": object_role},
        )
        row = result.mappings().first()
        return dict(row) if row else None

    @staticmethod
    async def list_objects_for_dataset(
        session: AsyncSession,
        organization_id: UUID,
        dataset_id: UUID,
    ) -> List[Dict[str, Any]]:
        result = await session.execute(
            sa.text("""
                SELECT * FROM science.dataset_objects
                WHERE organization_id = :org_id AND dataset_id = :dataset_id
                ORDER BY created_at DESC
            """),
            {"org_id": organization_id, "dataset_id": dataset_id},
        )
        return [dict(row) for row in result.mappings().all()]
