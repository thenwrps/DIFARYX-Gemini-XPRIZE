"""Repository for science.datasets with guarded status transitions."""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession


class DatasetRepository:
    @staticmethod
    async def create_xrd_dataset(
        session: AsyncSession,
        organization_id: UUID,
        project_id: UUID,
        title: str,
        measurement_metadata_json: str,
        processing_parameters_json: str,
        experiment_context_json: str,
        created_by: UUID,
    ) -> Dict[str, Any]:
        result = await session.execute(
            sa.text("""
                INSERT INTO science.datasets (
                    organization_id, project_id, technique, title,
                    display_filename, declared_content_type, byte_size,
                    measurement_metadata, processing_parameters,
                    experiment_context, created_by
                ) VALUES (
                    :organization_id, :project_id,
                    CAST('xrd' AS science.technique_code), :title,
                    'pending-xrd-upload', 'application/octet-stream', 0,
                    CAST(:measurement_metadata AS jsonb),
                    CAST(:processing_parameters AS jsonb),
                    CAST(:experiment_context AS jsonb),
                    :created_by
                )
                RETURNING *
            """),
            {
                "organization_id": organization_id,
                "project_id": project_id,
                "title": title,
                "measurement_metadata": measurement_metadata_json,
                "processing_parameters": processing_parameters_json,
                "experiment_context": experiment_context_json,
                "created_by": created_by,
            },
        )
        row = result.mappings().first()
        return dict(row) if row else {}

    @staticmethod
    async def prepare_existing_dataset_upload(
        session: AsyncSession,
        organization_id: UUID,
        dataset_id: UUID,
        display_filename: str,
        declared_content_type: str,
        byte_size: int,
        client_checksum_sha256: str,
    ) -> Optional[Dict[str, Any]]:
        result = await session.execute(
            sa.text("""
                UPDATE science.datasets
                SET display_filename = :display_filename,
                    declared_content_type = :declared_content_type,
                    byte_size = :byte_size,
                    client_checksum_sha256 = :client_checksum_sha256,
                    updated_at = NOW()
                WHERE organization_id = :organization_id
                  AND id = :dataset_id
                  AND technique = CAST('xrd' AS science.technique_code)
                  AND dataset_status = CAST('allocated' AS science.dataset_status)
                  AND original_object_id IS NULL
                  AND NOT EXISTS (
                      SELECT 1
                      FROM science.upload_sessions us
                      WHERE us.organization_id = science.datasets.organization_id
                        AND us.dataset_id = science.datasets.id
                        AND us.session_status NOT IN (
                            CAST('cancelled' AS science.upload_session_status),
                            CAST('expired' AS science.upload_session_status),
                            CAST('failed' AS science.upload_session_status)
                        )
                  )
                RETURNING *
            """),
            {
                "organization_id": organization_id,
                "dataset_id": dataset_id,
                "display_filename": display_filename,
                "declared_content_type": declared_content_type,
                "byte_size": byte_size,
                "client_checksum_sha256": client_checksum_sha256,
            },
        )
        row = result.mappings().first()
        return dict(row) if row else None

    @staticmethod
    async def create_dataset(
        session: AsyncSession,
        organization_id: UUID,
        project_id: UUID,
        technique: str,
        display_filename: str,
        declared_content_type: str,
        byte_size: int,
        client_checksum_sha256: Optional[str],
        created_by: UUID,
    ) -> Dict[str, Any]:
        result = await session.execute(
            sa.text("""
                INSERT INTO science.datasets (
                    organization_id, project_id, technique, display_filename,
                    declared_content_type, byte_size, client_checksum_sha256, created_by
                ) VALUES (
                    :organization_id, :project_id, CAST(:technique AS science.technique_code),
                    :display_filename, :declared_content_type, :byte_size,
                    :client_checksum_sha256, :created_by
                )
                RETURNING *
            """),
            {
                "organization_id": organization_id,
                "project_id": project_id,
                "technique": technique,
                "display_filename": display_filename,
                "declared_content_type": declared_content_type,
                "byte_size": byte_size,
                "client_checksum_sha256": client_checksum_sha256,
                "created_by": created_by,
            },
        )
        row = result.mappings().first()
        return dict(row) if row else {}

    @staticmethod
    async def get_dataset(
        session: AsyncSession,
        organization_id: UUID,
        dataset_id: UUID,
    ) -> Optional[Dict[str, Any]]:
        result = await session.execute(
            sa.text("SELECT * FROM science.datasets WHERE organization_id = :org_id AND id = :id"),
            {"org_id": organization_id, "id": dataset_id},
        )
        row = result.mappings().first()
        return dict(row) if row else None

    @staticmethod
    async def list_datasets(
        session: AsyncSession,
        organization_id: UUID,
        project_id: Optional[UUID] = None,
        technique: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 50,
        cursor_created_at: Optional[Any] = None,
        cursor_id: Optional[UUID] = None,
    ) -> List[Dict[str, Any]]:
        conditions = ["organization_id = :org_id"]
        params: Dict[str, Any] = {"org_id": organization_id, "limit": limit}

        if project_id:
            conditions.append("project_id = :project_id")
            params["project_id"] = project_id
        if technique:
            conditions.append("technique = CAST(:technique AS science.technique_code)")
            params["technique"] = technique
        if status:
            conditions.append("dataset_status = CAST(:status AS science.dataset_status)")
            params["status"] = status
        if cursor_created_at and cursor_id:
            conditions.append("(created_at, id) < (:cursor_created_at, :cursor_id)")
            params["cursor_created_at"] = cursor_created_at
            params["cursor_id"] = cursor_id

        where = " AND ".join(conditions)
        result = await session.execute(
            sa.text(f"""
                SELECT * FROM science.datasets
                WHERE {where}
                ORDER BY created_at DESC, id DESC
                LIMIT :limit
            """),
            params,
        )
        return [dict(row) for row in result.mappings().all()]

    @staticmethod
    async def update_dataset_status(
        session: AsyncSession,
        organization_id: UUID,
        dataset_id: UUID,
        current_status: str,
        new_status: str,
        failure_code: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        result = await session.execute(
            sa.text("""
                SELECT science.app_transition_dataset_upload_status(
                    CAST(:org_id AS uuid),
                    CAST(:id AS uuid),
                    CAST(:current_status AS science.dataset_status),
                    CAST(:new_status AS science.dataset_status),
                    :failure_code
                )
            """),
            {
                "org_id": organization_id,
                "id": dataset_id,
                "current_status": current_status,
                "new_status": new_status,
                "failure_code": failure_code,
            },
        )
        if not result.scalar():
            return None
        return await DatasetRepository.get_dataset(session, organization_id, dataset_id)

    @staticmethod
    async def link_original_object(
        session: AsyncSession,
        organization_id: UUID,
        dataset_id: UUID,
        object_id: UUID,
    ) -> None:
        await session.execute(
            sa.text("""
                UPDATE science.datasets
                SET original_object_id = :object_id, updated_at = NOW()
                WHERE organization_id = :org_id AND id = :id
            """),
            {"org_id": organization_id, "id": dataset_id, "object_id": object_id},
        )
