import logging
import sqlalchemy as sa
from typing import List, Dict, Any, Optional
from uuid import UUID
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger("difaryx.repository.project")


class ProjectRepository:
    """RLS-isolated database repository for science.projects and memberships."""

    @staticmethod
    async def list_projects(
        session: AsyncSession,
        organization_id: UUID,
        user_id: UUID,
        limit: int,
        cursor_created_at: Optional[datetime] = None,
        cursor_id: Optional[UUID] = None
    ) -> List[Dict[str, Any]]:
        """Lists RLS-visible projects for a tenant, ordered by created_at DESC, id DESC."""
        query_str = """
            SELECT p.id, p.title, p.description, p.is_archived, p.created_at, p.updated_at,
                   (
                       SELECT CASE 
                           WHEN bool_or(pm.role = 'lead') OR p.owner_user_id = :user_id THEN 'lead'
                           WHEN bool_or(pm.role = 'member') THEN 'member'
                           WHEN bool_or(pm.role = 'reviewer') THEN 'reviewer'
                           ELSE NULL
                       END
                       FROM (SELECT 1) x
                       LEFT JOIN science.project_memberships pm ON pm.organization_id = p.organization_id
                         AND pm.project_id = p.id
                         AND pm.user_id = :user_id
                   ) as my_project_role
            FROM science.projects p
            WHERE p.organization_id = :organization_id
        """
        params = {
            "organization_id": organization_id,
            "user_id": user_id,
            "limit": limit
        }

        if cursor_created_at is not None and cursor_id is not None:
            query_str += """
                AND (
                    p.created_at < :cursor_created_at
                    OR (p.created_at = :cursor_created_at AND p.id < :cursor_id)
                )
            """
            params["cursor_created_at"] = cursor_created_at
            params["cursor_id"] = cursor_id

        query_str += " ORDER BY p.created_at DESC, p.id DESC LIMIT :limit"

        res = await session.execute(sa.text(query_str), params)
        return [dict(row._mapping) for row in res.fetchall()]

    @staticmethod
    async def get_project(
        session: AsyncSession,
        organization_id: UUID,
        user_id: UUID,
        project_id: UUID
    ) -> Optional[Dict[str, Any]]:
        """Retrieves a single RLS-visible project by ID."""
        query_str = """
            SELECT p.id, p.title, p.description, p.is_archived, p.created_at, p.updated_at,
                   (
                       SELECT CASE 
                           WHEN bool_or(pm.role = 'lead') OR p.owner_user_id = :user_id THEN 'lead'
                           WHEN bool_or(pm.role = 'member') THEN 'member'
                           WHEN bool_or(pm.role = 'reviewer') THEN 'reviewer'
                           ELSE NULL
                       END
                       FROM (SELECT 1) x
                       LEFT JOIN science.project_memberships pm ON pm.organization_id = p.organization_id
                         AND pm.project_id = p.id
                         AND pm.user_id = :user_id
                   ) as my_project_role
            FROM science.projects p
            WHERE p.organization_id = :organization_id AND p.id = :project_id
        """
        res = await session.execute(sa.text(query_str), {
            "organization_id": organization_id,
            "user_id": user_id,
            "project_id": project_id
        })
        row = res.fetchone()
        return dict(row._mapping) if row else None

    @staticmethod
    async def create_project(
        session: AsyncSession,
        organization_id: UUID,
        owner_user_id: UUID,
        title: str,
        description: Optional[str]
    ) -> Dict[str, Any]:
        """Inserts a new project into science.projects and returns the inserted record."""
        query_str = """
            INSERT INTO science.projects (organization_id, owner_user_id, title, description)
            VALUES (:organization_id, :owner_user_id, :title, :description)
            RETURNING id, title, description, is_archived, created_at, updated_at
        """
        res = await session.execute(sa.text(query_str), {
            "organization_id": organization_id,
            "owner_user_id": owner_user_id,
            "title": title,
            "description": description
        })
        row = res.fetchone()
        return dict(row._mapping)

    @staticmethod
    async def create_project_membership(
        session: AsyncSession,
        organization_id: UUID,
        project_id: UUID,
        user_id: UUID,
        role: str
    ) -> None:
        """Inserts an initial project membership for a user."""
        query_str = """
            INSERT INTO science.project_memberships (organization_id, project_id, user_id, role)
            VALUES (:organization_id, :project_id, :user_id, :role)
        """
        await session.execute(sa.text(query_str), {
            "organization_id": organization_id,
            "project_id": project_id,
            "user_id": user_id,
            "role": role
        })

    @staticmethod
    async def update_project(
        session: AsyncSession,
        organization_id: UUID,
        project_id: UUID,
        title: str,
        description: Optional[str],
        expected_updated_at: datetime
    ) -> Optional[Dict[str, Any]]:
        """Executes a conditional RLS-protected update for optimistic concurrency control."""
        query_str = """
            UPDATE science.projects
            SET title = :title, description = :description, updated_at = NOW()
            WHERE organization_id = :organization_id 
              AND id = :project_id 
              AND updated_at = :expected_updated_at
            RETURNING id, title, description, is_archived, created_at, updated_at
        """
        res = await session.execute(sa.text(query_str), {
            "organization_id": organization_id,
            "project_id": project_id,
            "title": title,
            "description": description,
            "expected_updated_at": expected_updated_at
        })
        row = res.fetchone()
        return dict(row._mapping) if row else None
