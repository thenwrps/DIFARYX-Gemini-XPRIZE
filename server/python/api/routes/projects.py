import logging
from uuid import UUID
from typing import Optional
from fastapi import APIRouter, Depends
from api.auth.dependencies import get_active_organization
from api.auth.models import AuthenticatedUserContext
from api.models.project import (
    ProjectCreateRequest,
    ProjectPatchRequest,
    ProjectResponse,
    ProjectListResponse
)
from api.services.project_service import ProjectService

logger = logging.getLogger("difaryx.routes.projects")
router = APIRouter(tags=["Project Management"])


@router.get("/projects", response_model=ProjectListResponse)
async def list_projects(
    limit: Optional[int] = 20,
    cursor: Optional[str] = None,
    context: AuthenticatedUserContext = Depends(get_active_organization)
):
    """Lists RLS-visible projects with cursor pagination."""
    return await ProjectService.list_projects(
        organization_id=context.active_organization_id,
        user_id=context.active_user_id,
        limit=limit,
        cursor_str=cursor
    )


@router.get("/projects/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: UUID,
    context: AuthenticatedUserContext = Depends(get_active_organization)
):
    """Retrieves a single RLS-visible project by ID."""
    return await ProjectService.get_project(
        organization_id=context.active_organization_id,
        user_id=context.active_user_id,
        project_id=project_id
    )


@router.post("/projects", response_model=ProjectResponse, status_code=201)
async def create_project(
    request: ProjectCreateRequest,
    context: AuthenticatedUserContext = Depends(get_active_organization)
):
    """Creates a new project and sets the caller as the lead, atomically."""
    return await ProjectService.create_project(
        organization_id=context.active_organization_id,
        user_id=context.active_user_id,
        organization_role=context.active_role,
        request=request
    )


@router.patch("/projects/{project_id}", response_model=ProjectResponse)
async def patch_project(
    project_id: UUID,
    request: ProjectPatchRequest,
    context: AuthenticatedUserContext = Depends(get_active_organization)
):
    """Updates a project title or description under optimistic lock constraints."""
    return await ProjectService.patch_project(
        organization_id=context.active_organization_id,
        user_id=context.active_user_id,
        organization_role=context.active_role,
        project_id=project_id,
        request=request
    )
