import logging
import base64
import json
import re
from datetime import datetime, timezone
from typing import Dict, Any, Optional, Tuple
from uuid import UUID
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.uow import UnitOfWork
from api.repositories.project_repository import ProjectRepository
from api.models.project import ProjectCreateRequest, ProjectPatchRequest, ProjectResponse, ProjectListResponse
from api.errors import (
    DIFARYXException,
    InvalidOrganizationContextException,
    OrganizationAccessDeniedException
)

logger = logging.getLogger("difaryx.service.project")


class ProjectService:
    """Orchestrates RLS project mutations, validations, cursor management, and audit events."""

    @staticmethod
    def encode_cursor(created_at: datetime, project_id: UUID) -> str:
        # Guarantee timezone presence
        if not created_at.tzinfo:
            created_at = created_at.replace(tzinfo=timezone.utc)
        data = {
            "v": 1,
            "createdAt": created_at.isoformat(),
            "id": str(project_id)
        }
        json_str = json.dumps(data)
        return base64.urlsafe_b64encode(json_str.encode("utf-8")).decode("utf-8").rstrip("=")

    @staticmethod
    def decode_cursor(cursor_str: str) -> Tuple[datetime, UUID]:
        try:
            # Add padding
            padding = len(cursor_str) % 4
            if padding:
                cursor_str += "=" * (4 - padding)
            decoded_bytes = base64.urlsafe_b64decode(cursor_str.encode("utf-8"))
            data = json.loads(decoded_bytes.decode("utf-8"))

            if data.get("v") != 1 or "createdAt" not in data or "id" not in data:
                raise ValueError("Invalid cursor structure or version")

            created_at = datetime.fromisoformat(data["createdAt"])
            if not created_at.tzinfo:
                raise ValueError("Cursor timestamp is missing timezone information")

            project_id = UUID(data["id"])
            return created_at, project_id
        except Exception as e:
            logger.warning(f"Failed to decode cursor: {e}")
            raise DIFARYXException(
                status_code=400,
                error_code="VALIDATION_ERROR",
                message=f"Invalid pagination cursor: {e}"
            )

    @staticmethod
    async def append_audit_event(
        session: AsyncSession,
        organization_id: UUID,
        user_id: UUID,
        action: str,
        resource_type: str,
        resource_id: UUID
    ) -> None:
        """Appends a transactional audit event utilizing the SECURITY DEFINER function."""
        # Validation checks as required by DB function constraints
        if len(action) > 100 or not re.match(r"^[a-z_]+\.[a-z_]+$", action):
            raise ValueError("Invalid action name or format")
        if len(resource_type) > 100:
            raise ValueError("resource_type name too long")
        if len(str(resource_id)) > 255:
            raise ValueError("resource_id too long")

        await session.execute(
            sa.text("""
                SELECT governance.append_audit_event(
                    :org_id,
                    :user_id,
                    :action,
                    :resource_type,
                    :resource_id
                )
            """),
            {
                "org_id": organization_id,
                "user_id": user_id,
                "action": action,
                "resource_type": resource_type,
                "resource_id": str(resource_id)
            }
        )

    @classmethod
    async def list_projects(
        cls,
        organization_id: UUID,
        user_id: UUID,
        limit: Optional[int] = 20,
        cursor_str: Optional[str] = None
    ) -> ProjectListResponse:
        # Validate limit constraints
        if limit is None or limit <= 0:
            limit = 20
        if limit > 100:
            limit = 100

        cursor_created_at = None
        cursor_id = None
        if cursor_str:
            cursor_created_at, cursor_id = cls.decode_cursor(cursor_str)

        # Retrieve limit + 1 rows to compute hasMore
        async with UnitOfWork(organization_id=organization_id, user_id=user_id) as session:
            rows = await ProjectRepository.list_projects(
                session=session,
                organization_id=organization_id,
                user_id=user_id,
                limit=limit + 1,
                cursor_created_at=cursor_created_at,
                cursor_id=cursor_id
            )

        has_more = len(rows) > limit
        result_rows = rows[:limit]

        next_cursor = None
        if has_more and result_rows:
            last_item = result_rows[-1]
            next_cursor = cls.encode_cursor(last_item["created_at"], last_item["id"])

        items = [
            ProjectResponse(
                id=row["id"],
                title=row["title"],
                description=row["description"],
                status="archived" if row["is_archived"] else "active",
                created_at=row["created_at"],
                updated_at=row["updated_at"],
                my_project_role=row["my_project_role"]
            )
            for row in result_rows
        ]

        return ProjectListResponse(
            items=items,
            next_cursor=next_cursor,
            has_more=has_more
        )

    @classmethod
    async def get_project(
        cls,
        organization_id: UUID,
        user_id: UUID,
        project_id: UUID
    ) -> ProjectResponse:
        async with UnitOfWork(organization_id=organization_id, user_id=user_id) as session:
            row = await ProjectRepository.get_project(session, organization_id, user_id, project_id)

        if not row:
            raise DIFARYXException(
                status_code=404,
                error_code="PROJECT_NOT_FOUND",
                message="Requested project does not exist or you do not have permission to access it."
            )

        return ProjectResponse(
            id=row["id"],
            title=row["title"],
            description=row["description"],
            status="archived" if row["is_archived"] else "active",
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            my_project_role=row["my_project_role"]
        )

    @classmethod
    async def create_project(
        cls,
        organization_id: UUID,
        user_id: UUID,
        organization_role: str,
        request: ProjectCreateRequest
    ) -> ProjectResponse:
        # 1. Check organization role permission matrix
        # Allowed roles: owner, admin, member
        if organization_role not in ("owner", "admin", "member"):
            raise OrganizationAccessDeniedException(
                message="Your organization role is not authorized to create projects."
            )

        async with UnitOfWork(organization_id=organization_id, user_id=user_id) as session:
            # 2. Insert project record
            project_row = await ProjectRepository.create_project(
                session=session,
                organization_id=organization_id,
                owner_user_id=user_id,
                title=request.title,
                description=request.description
            )
            project_id = project_row["id"]

            # 3. Create initial membership: creator becomes lead
            await ProjectRepository.create_project_membership(
                session=session,
                organization_id=organization_id,
                project_id=project_id,
                user_id=user_id,
                role="lead"
            )

            # 4. Append audit event
            await cls.append_audit_event(
                session=session,
                organization_id=organization_id,
                user_id=user_id,
                action="project.created",
                resource_type="project",
                resource_id=project_id
            )

        # Fully resolved role for the creator is lead
        return ProjectResponse(
            id=project_row["id"],
            title=project_row["title"],
            description=project_row["description"],
            status="active",
            created_at=project_row["created_at"],
            updated_at=project_row["updated_at"],
            my_project_role="lead"
        )

    @classmethod
    async def patch_project(
        cls,
        organization_id: UUID,
        user_id: UUID,
        organization_role: str,
        project_id: UUID,
        request: ProjectPatchRequest
    ) -> ProjectResponse:
        # 1. Require at least one mutable field
        dump = request.model_dump(exclude_unset=True)
        if "title" not in dump and "description" not in dump:
            raise DIFARYXException(
                status_code=422,
                error_code="VALIDATION_ERROR",
                message="At least one mutable field ('title' or 'description') must be provided."
            )

        async with UnitOfWork(organization_id=organization_id, user_id=user_id) as session:
            # 2. Get project first (RLS-protected)
            existing = await ProjectRepository.get_project(session, organization_id, user_id, project_id)
            if not existing:
                raise DIFARYXException(
                    status_code=404,
                    error_code="PROJECT_NOT_FOUND",
                    message="Requested project does not exist or you do not have permission to access it."
                )

            # 3. Verify role may update
            # Write access is granted to project leads, project members, and organization owners/admins.
            # Reviewers and unrelated org members have no write access.
            my_project_role = existing["my_project_role"]
            has_write_access = (
                my_project_role in ("lead", "member")
                or organization_role in ("owner", "admin")
            )
            if not has_write_access:
                raise OrganizationAccessDeniedException(
                    message="You do not have write access to this project."
                )

            # 4. Compare expected timestamp
            # Normalize to timezone-aware UTC for exact comparison
            db_updated_at = existing["updated_at"]
            expected_utc = request.expected_updated_at.astimezone(timezone.utc)
            db_utc = db_updated_at.astimezone(timezone.utc)

            # Check precision up to microseconds to match database
            if abs((expected_utc - db_utc).total_seconds()) > 1e-6:
                raise DIFARYXException(
                    status_code=409,
                    error_code="PROJECT_VERSION_CONFLICT",
                    message="The project has been modified by another process. Please reload and retry."
                )

            # Normalize values
            new_title = dump.get("title", existing["title"])
            new_description = dump.get("description", existing["description"])

            # 5. Execute conditional update
            updated_row = await ProjectRepository.update_project(
                session=session,
                organization_id=organization_id,
                project_id=project_id,
                title=new_title,
                description=new_description,
                expected_updated_at=db_updated_at
            )

            if not updated_row:
                raise DIFARYXException(
                    status_code=409,
                    error_code="PROJECT_VERSION_CONFLICT",
                    message="Optimistic lock conflict detected: concurrent modification during update."
                )

            # 6. Append audit event
            await cls.append_audit_event(
                session=session,
                organization_id=organization_id,
                user_id=user_id,
                action="project.updated",
                resource_type="project",
                resource_id=project_id
            )

        return ProjectResponse(
            id=updated_row["id"],
            title=updated_row["title"],
            description=updated_row["description"],
            status="archived" if updated_row["is_archived"] else "active",
            created_at=updated_row["created_at"],
            updated_at=updated_row["updated_at"],
            my_project_role=my_project_role
        )
