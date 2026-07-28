"""Non-browser internal routes for the persistent XRD vertical slice."""

from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request

from api.phase2f.internal_auth import (
    InternalIdentity,
    InternalTenantContext,
    require_internal_identity,
    require_internal_tenant,
)
from api.phase2f.models import (
    CanonicalEvidence,
    DatasetCreate,
    DatasetDetail,
    DatasetList,
    NotebookReference,
    NotebookReferenceCreate,
    NotebookReferenceList,
    OrganizationMembershipList,
    ProjectCreate,
    ProjectList,
    ProjectSummary,
    ReasoningComplete,
    ReasoningHistory,
    ReasoningRun,
    ReasoningStart,
    UploadFinalizeResult,
    UploadIntent,
    UploadIntentCreate,
    UploadStreamResult,
)
from api.phase2f import service


router = APIRouter(prefix="/internal/phase2f", tags=["Phase 2F Internal Persistence"])


@router.get("/organizations", response_model=OrganizationMembershipList)
async def organizations(
    identity: InternalIdentity = Depends(require_internal_identity),
) -> OrganizationMembershipList:
    return await service.list_organizations(identity)


@router.get("/projects", response_model=ProjectList)
async def projects(
    limit: int = Query(default=50, ge=1, le=100),
    cursor: Optional[str] = Query(default=None, max_length=1024),
    context: InternalTenantContext = Depends(require_internal_tenant),
) -> ProjectList:
    return await service.list_projects(context, limit=limit, cursor=cursor)


@router.post("/projects", response_model=ProjectSummary, status_code=201)
async def create_project(
    body: ProjectCreate,
    context: InternalTenantContext = Depends(require_internal_tenant),
) -> ProjectSummary:
    return await service.create_project(context, body)


@router.get("/projects/{project_id}", response_model=ProjectSummary)
async def get_project(
    project_id: UUID,
    context: InternalTenantContext = Depends(require_internal_tenant),
) -> ProjectSummary:
    return service._project_summary(await service._project_row(context, project_id))


@router.get("/projects/{project_id}/datasets", response_model=DatasetList)
async def datasets(
    project_id: UUID,
    limit: int = Query(default=50, ge=1, le=100),
    cursor: Optional[str] = Query(default=None, max_length=1024),
    context: InternalTenantContext = Depends(require_internal_tenant),
) -> DatasetList:
    return await service.list_datasets(
        context, project_id, limit=limit, cursor=cursor
    )


@router.post(
    "/projects/{project_id}/datasets",
    response_model=DatasetDetail,
    status_code=201,
)
async def create_dataset(
    project_id: UUID,
    body: DatasetCreate,
    context: InternalTenantContext = Depends(require_internal_tenant),
) -> DatasetDetail:
    return await service.create_dataset(context, project_id, body)


@router.get("/datasets/{dataset_id}", response_model=DatasetDetail)
async def get_dataset(
    dataset_id: UUID,
    context: InternalTenantContext = Depends(require_internal_tenant),
) -> DatasetDetail:
    return await service.get_dataset(context, dataset_id)


@router.post(
    "/datasets/{dataset_id}/uploads",
    response_model=UploadIntent,
    status_code=201,
)
async def create_upload_intent(
    dataset_id: UUID,
    body: UploadIntentCreate,
    context: InternalTenantContext = Depends(require_internal_tenant),
) -> UploadIntent:
    return await service.create_upload_intent(context, dataset_id, body)


@router.put("/uploads/{upload_id}/content", response_model=UploadStreamResult)
async def upload_content(
    upload_id: UUID,
    request: Request,
    context: InternalTenantContext = Depends(require_internal_tenant),
) -> UploadStreamResult:
    return await service.stream_upload(context, upload_id, request.stream())


@router.post("/uploads/{upload_id}/finalize", response_model=UploadFinalizeResult)
async def finalize_upload(
    upload_id: UUID,
    context: InternalTenantContext = Depends(require_internal_tenant),
) -> UploadFinalizeResult:
    return await service.finalize_upload(context, upload_id)


@router.get("/evidence/{evidence_id}", response_model=CanonicalEvidence)
async def evidence(
    evidence_id: UUID,
    context: InternalTenantContext = Depends(require_internal_tenant),
) -> CanonicalEvidence:
    return await service.get_evidence(context, evidence_id)


@router.post("/reasoning", response_model=ReasoningRun, status_code=201)
async def start_reasoning(
    body: ReasoningStart,
    context: InternalTenantContext = Depends(require_internal_tenant),
) -> ReasoningRun:
    return await service.start_reasoning(context, body)


@router.post("/reasoning/{run_id}/complete", response_model=ReasoningRun)
async def complete_reasoning(
    run_id: UUID,
    body: ReasoningComplete,
    context: InternalTenantContext = Depends(require_internal_tenant),
) -> ReasoningRun:
    return await service.complete_reasoning(context, run_id, body)


@router.get("/reasoning/{run_id}", response_model=ReasoningRun)
async def reasoning_run(
    run_id: UUID,
    context: InternalTenantContext = Depends(require_internal_tenant),
) -> ReasoningRun:
    return await service.get_reasoning(context, run_id)


@router.get("/history", response_model=ReasoningHistory)
async def history(
    project_id: Optional[UUID] = Query(default=None, alias="projectId"),
    dataset_id: Optional[UUID] = Query(default=None, alias="datasetId"),
    limit: int = Query(default=50, ge=1, le=100),
    cursor: Optional[str] = Query(default=None, max_length=1024),
    context: InternalTenantContext = Depends(require_internal_tenant),
) -> ReasoningHistory:
    return await service.list_reasoning(
        context,
        project_id=project_id,
        dataset_id=dataset_id,
        limit=limit,
        cursor=cursor,
    )


@router.post(
    "/notebook-references",
    response_model=NotebookReference,
    status_code=201,
)
async def create_notebook_reference(
    body: NotebookReferenceCreate,
    context: InternalTenantContext = Depends(require_internal_tenant),
) -> NotebookReference:
    return await service.create_notebook_reference(context, body)


@router.get("/notebook-references", response_model=NotebookReferenceList)
async def notebook_references(
    context: InternalTenantContext = Depends(require_internal_tenant),
) -> NotebookReferenceList:
    return await service.list_notebook_references(context)
