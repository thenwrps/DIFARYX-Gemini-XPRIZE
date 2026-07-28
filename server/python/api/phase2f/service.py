"""Tenant-scoped orchestration for the persistent XRD vertical slice."""

from __future__ import annotations

import base64
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, Optional
from uuid import UUID

import sqlalchemy as sa
from fastapi import HTTPException

from api.db.uow import UnitOfWork
from api.models.dataset import InitiateUploadRequest
from api.phase2f.internal_auth import InternalIdentity, InternalTenantContext
from api.phase2f.filenames import sanitize_display_filename
from api.phase2f.models import (
    CanonicalEvidence,
    DatasetCreate,
    DatasetDetail,
    DatasetList,
    EvidenceSummary,
    NotebookReference,
    NotebookReferenceCreate,
    NotebookReferenceList,
    OrganizationMembership,
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
    UploadSummary,
    ValidationSummary,
)
from api.repositories.dataset_repository import DatasetRepository
from api.repositories.project_repository import ProjectRepository
from api.services.project_service import ProjectService
from api.services.upload_service import UploadService
from api.storage.factory import get_object_store


ALLOWED_XRD_EXTENSIONS = {".csv", ".txt", ".xy", ".dat"}
ALLOWED_XRD_CONTENT_TYPES = {
    "text/csv",
    "text/plain",
    "application/octet-stream",
}


def _api_error(http_status: int, code: str, message: str) -> HTTPException:
    return HTTPException(
        status_code=http_status,
        detail={"errorCode": code, "message": message},
    )


def _encode_cursor(created_at: datetime, resource_id: UUID) -> str:
    payload = json.dumps(
        {"createdAt": created_at.astimezone(timezone.utc).isoformat(), "id": str(resource_id)},
        separators=(",", ":"),
    ).encode("utf-8")
    return base64.urlsafe_b64encode(payload).decode("ascii").rstrip("=")


def _decode_cursor(cursor: Optional[str]) -> tuple[Optional[datetime], Optional[UUID]]:
    if not cursor:
        return None, None
    if len(cursor) > 1024:
        raise _api_error(400, "INVALID_CURSOR", "Pagination cursor is invalid")
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        value = json.loads(base64.urlsafe_b64decode(padded.encode("ascii")))
        created_at = datetime.fromisoformat(value["createdAt"])
        resource_id = UUID(value["id"])
        if created_at.tzinfo is None:
            raise ValueError("timezone required")
        return created_at, resource_id
    except Exception as exc:
        raise _api_error(400, "INVALID_CURSOR", "Pagination cursor is invalid") from exc


async def list_organizations(identity: InternalIdentity) -> OrganizationMembershipList:
    return OrganizationMembershipList(
        memberships=[
            OrganizationMembership(
                organization_id=mapping.organization_id,
                organization_name=mapping.organization_name,
                user_id=mapping.user_id,
                role=mapping.role,
            )
            for mapping in identity.mappings
        ]
    )


async def _project_row(
    context: InternalTenantContext,
    project_id: UUID,
) -> Dict[str, Any]:
    async with UnitOfWork(context.organization_id, context.user_id) as session:
        row = await ProjectRepository.get_project(
            session, context.organization_id, context.user_id, project_id
        )
        if not row:
            raise _api_error(404, "PROJECT_NOT_FOUND", "Project not found")
        owner_result = await session.execute(
            sa.text(
                """
                SELECT organization_id, owner_user_id
                FROM science.projects
                WHERE organization_id = :organization_id AND id = :project_id
                """
            ),
            {"organization_id": context.organization_id, "project_id": project_id},
        )
        owner = owner_result.mappings().first()
        if not owner:
            raise _api_error(404, "PROJECT_NOT_FOUND", "Project not found")
        row.update(owner)
        return row


def _project_summary(row: Dict[str, Any]) -> ProjectSummary:
    return ProjectSummary(
        id=row["id"],
        organization_id=row["organization_id"],
        owner_user_id=row["owner_user_id"],
        title=row["title"],
        description=row.get("description"),
        status="archived" if row["is_archived"] else "active",
        my_project_role=row.get("my_project_role"),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


async def list_projects(
    context: InternalTenantContext,
    *,
    limit: int,
    cursor: Optional[str],
) -> ProjectList:
    safe_limit = min(max(limit, 1), 100)
    cursor_created_at, cursor_id = _decode_cursor(cursor)
    async with UnitOfWork(context.organization_id, context.user_id) as session:
        rows = await ProjectRepository.list_projects(
            session,
            context.organization_id,
            context.user_id,
            safe_limit + 1,
            cursor_created_at,
            cursor_id,
        )
        for row in rows:
            row["organization_id"] = context.organization_id
            owner_result = await session.execute(
                sa.text(
                    """
                    SELECT owner_user_id
                    FROM science.projects
                    WHERE organization_id = :organization_id AND id = :project_id
                    """
                ),
                {"organization_id": context.organization_id, "project_id": row["id"]},
            )
            row["owner_user_id"] = owner_result.scalar_one()
    has_more = len(rows) > safe_limit
    visible = rows[:safe_limit]
    return ProjectList(
        items=[_project_summary(row) for row in visible],
        has_more=has_more,
        next_cursor=(
            _encode_cursor(visible[-1]["created_at"], visible[-1]["id"])
            if has_more and visible
            else None
        ),
    )


async def create_project(
    context: InternalTenantContext,
    request: ProjectCreate,
) -> ProjectSummary:
    created = await ProjectService.create_project(
        context.organization_id,
        context.user_id,
        context.role,
        request,
    )
    return _project_summary(await _project_row(context, created.id))


async def _require_project_read(
    session: Any,
    context: InternalTenantContext,
    project_id: UUID,
) -> Dict[str, Any]:
    project = await ProjectRepository.get_project(
        session, context.organization_id, context.user_id, project_id
    )
    if not project:
        raise _api_error(404, "PROJECT_NOT_FOUND", "Project not found")
    return project


async def _require_project_write(
    session: Any,
    context: InternalTenantContext,
    project_id: UUID,
) -> Dict[str, Any]:
    project = await _require_project_read(session, context, project_id)
    if context.role not in {"owner", "admin"} and project.get("my_project_role") not in {"lead", "member"}:
        raise _api_error(403, "PROJECT_ACCESS_DENIED", "Project write access denied")
    return project


async def create_dataset(
    context: InternalTenantContext,
    project_id: UUID,
    request: DatasetCreate,
) -> DatasetDetail:
    async with UnitOfWork(context.organization_id, context.user_id) as session:
        await _require_project_write(session, context, project_id)
        row = await DatasetRepository.create_xrd_dataset(
            session,
            context.organization_id,
            project_id,
            request.title,
            json.dumps(request.measurement_metadata, separators=(",", ":")),
            json.dumps(request.processing_parameters, separators=(",", ":")),
            json.dumps(request.experiment_context, separators=(",", ":")),
            context.user_id,
        )
        await ProjectService.append_audit_event(
            session,
            context.organization_id,
            context.user_id,
            "dataset.created",
            "dataset",
            row["id"],
        )
    return await get_dataset(context, row["id"])


_DATASET_DETAIL_SQL = """
    SELECT
        d.*,
        us.id AS upload_id,
        us.session_status AS upload_session_status,
        us.expected_byte_size AS upload_expected_byte_size,
        us.checksum_algorithm AS upload_checksum_algorithm,
        us.client_checksum_sha256 AS upload_checksum,
        us.expires_at AS upload_expires_at,
        us.finalized_at AS upload_finalized_at,
        us.failure_code AS upload_failure_code,
        va.id AS validation_id,
        va.status AS validation_attempt_status,
        va.attempt_number,
        va.max_attempts,
        va.failure_code AS validation_failure_code,
        va.failure_details AS validation_failure_details,
        va.created_at AS validation_created_at,
        va.completed_at AS validation_completed_at,
        ev.id AS evidence_id,
        ev.version AS evidence_version,
        ev.status AS snapshot_status,
        ev.content_sha256,
        ev.schema_version,
        ev.processor_version,
        ev.validation_warnings,
        ev.scientific_limitations,
        ev.created_at AS evidence_created_at
    FROM science.datasets d
    LEFT JOIN LATERAL (
        SELECT *
        FROM science.upload_sessions candidate
        WHERE candidate.organization_id = d.organization_id
          AND candidate.dataset_id = d.id
        ORDER BY candidate.created_at DESC, candidate.id DESC
        LIMIT 1
    ) us ON TRUE
    LEFT JOIN LATERAL (
        SELECT *
        FROM science.validation_attempts candidate
        WHERE candidate.organization_id = d.organization_id
          AND candidate.dataset_id = d.id
        ORDER BY candidate.attempt_number DESC, candidate.created_at DESC
        LIMIT 1
    ) va ON TRUE
    LEFT JOIN science.xrd_evidence_snapshots ev
      ON ev.organization_id = d.organization_id
     AND ev.id = d.current_evidence_id
    WHERE d.organization_id = :organization_id
      AND d.technique = CAST('xrd' AS science.technique_code)
"""


def _dataset_detail(row: Dict[str, Any]) -> DatasetDetail:
    latest_upload = None
    if row.get("upload_id"):
        latest_upload = UploadSummary(
            id=row["upload_id"],
            session_status=str(row["upload_session_status"]),
            expected_byte_size=row["upload_expected_byte_size"],
            checksum_algorithm=row["upload_checksum_algorithm"],
            client_checksum_sha256=row.get("upload_checksum"),
            expires_at=row["upload_expires_at"],
            finalized_at=row.get("upload_finalized_at"),
            failure_code=row.get("upload_failure_code"),
        )
    latest_validation = None
    if row.get("validation_id"):
        latest_validation = ValidationSummary(
            id=row["validation_id"],
            status=str(row["validation_attempt_status"]),
            attempt_number=row["attempt_number"],
            max_attempts=row["max_attempts"],
            failure_code=row.get("validation_failure_code"),
            failure_details=row.get("validation_failure_details"),
            created_at=row["validation_created_at"],
            completed_at=row.get("validation_completed_at"),
        )
    evidence = None
    if row.get("evidence_id"):
        evidence = EvidenceSummary(
            id=row["evidence_id"],
            version=row["evidence_version"],
            status=row["snapshot_status"],
            content_sha256=row["content_sha256"],
            schema_version=row["schema_version"],
            processor_version=row["processor_version"],
            validation_warnings=list(row.get("validation_warnings") or []),
            scientific_limitations=list(row.get("scientific_limitations") or []),
            created_at=row["evidence_created_at"],
        )
    return DatasetDetail(
        id=row["id"],
        organization_id=row["organization_id"],
        project_id=row["project_id"],
        title=row["title"],
        technique="xrd",
        display_filename=row["display_filename"],
        declared_content_type=row["declared_content_type"],
        byte_size=row["byte_size"],
        client_checksum_sha256=row.get("client_checksum_sha256"),
        dataset_status=str(row["dataset_status"]),
        evidence_status=row["evidence_status"],
        failure_code=row.get("failure_code"),
        original_object_id=row.get("original_object_id"),
        current_evidence_id=row.get("current_evidence_id"),
        measurement_metadata=dict(row.get("measurement_metadata") or {}),
        processing_parameters=dict(row.get("processing_parameters") or {}),
        experiment_context=dict(row.get("experiment_context") or {}),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        latest_upload=latest_upload,
        latest_validation=latest_validation,
        evidence=evidence,
    )


async def get_dataset(
    context: InternalTenantContext,
    dataset_id: UUID,
) -> DatasetDetail:
    async with UnitOfWork(context.organization_id, context.user_id) as session:
        result = await session.execute(
            sa.text(f"{_DATASET_DETAIL_SQL} AND d.id = :dataset_id"),
            {"organization_id": context.organization_id, "dataset_id": dataset_id},
        )
        row = result.mappings().first()
    if not row:
        raise _api_error(404, "DATASET_NOT_FOUND", "XRD dataset not found")
    return _dataset_detail(dict(row))


async def list_datasets(
    context: InternalTenantContext,
    project_id: UUID,
    *,
    limit: int,
    cursor: Optional[str],
) -> DatasetList:
    safe_limit = min(max(limit, 1), 100)
    cursor_created_at, cursor_id = _decode_cursor(cursor)
    params: Dict[str, Any] = {
        "organization_id": context.organization_id,
        "project_id": project_id,
        "limit": safe_limit + 1,
    }
    cursor_clause = ""
    if cursor_created_at and cursor_id:
        cursor_clause = " AND (d.created_at, d.id) < (:cursor_created_at, :cursor_id)"
        params.update(cursor_created_at=cursor_created_at, cursor_id=cursor_id)
    async with UnitOfWork(context.organization_id, context.user_id) as session:
        await _require_project_read(session, context, project_id)
        result = await session.execute(
            sa.text(
                f"""
                {_DATASET_DETAIL_SQL}
                  AND d.project_id = :project_id
                  {cursor_clause}
                ORDER BY d.created_at DESC, d.id DESC
                LIMIT :limit
                """
            ),
            params,
        )
        rows = [dict(row) for row in result.mappings().all()]
    has_more = len(rows) > safe_limit
    visible = rows[:safe_limit]
    return DatasetList(
        items=[_dataset_detail(row) for row in visible],
        has_more=has_more,
        next_cursor=(
            _encode_cursor(visible[-1]["created_at"], visible[-1]["id"])
            if has_more and visible
            else None
        ),
    )


def _upload_service() -> UploadService:
    return UploadService(get_object_store())


async def create_upload_intent(
    context: InternalTenantContext,
    dataset_id: UUID,
    request: UploadIntentCreate,
) -> UploadIntent:
    dataset = await get_dataset(context, dataset_id)
    sanitized = sanitize_display_filename(request.original_filename)
    if request.display_filename != sanitized:
        raise _api_error(400, "INVALID_FILENAME", "Display filename is not server-sanitized")
    extension = Path(sanitized).suffix.lower()
    if extension not in ALLOWED_XRD_EXTENSIONS:
        raise _api_error(400, "UNSUPPORTED_XRD_FORMAT", "Unsupported XRD file format")
    normalized_content_type = request.declared_content_type.split(";", 1)[0].strip().lower()
    if normalized_content_type not in ALLOWED_XRD_CONTENT_TYPES:
        raise _api_error(400, "UNSUPPORTED_MIME", "Unsupported XRD content type")

    response = await _upload_service().initiate_upload(
        context.organization_id,
        context.user_id,
        InitiateUploadRequest(
            project_id=dataset.project_id,
            dataset_id=dataset.id,
            technique="xrd",
            original_filename=request.original_filename,
            display_filename=sanitized,
            declared_content_type=normalized_content_type,
            byte_size=request.byte_size,
            client_checksum_sha256=request.client_checksum_sha256,
            idempotency_key=request.idempotency_key,
        ),
    )
    return UploadIntent(
        dataset_id=response.dataset_id,
        upload_id=response.upload_session_id,
        upload_url=f"/api/persistent/uploads/{response.upload_session_id}/content",
        expires_at=response.expires_at,
        max_byte_size=response.max_byte_size,
        upload_status="created" if response.session_status == "allocated" else response.session_status,
        validation_status="pending",
    )


async def stream_upload(
    context: InternalTenantContext,
    upload_id: UUID,
    chunks: Iterable[bytes] | Any,
) -> UploadStreamResult:
    service = _upload_service()
    claimed = await service.claim_session_for_streaming(
        context.organization_id, context.user_id, upload_id
    )
    try:
        result = await service.stream_to_staging(claimed, chunks)
        stored = await service.record_streaming_result(
            context.organization_id,
            context.user_id,
            upload_id,
            claimed.dataset_id,
            result,
        )
    except BaseException:
        try:
            await service.record_streaming_failure(
                context.organization_id,
                context.user_id,
                upload_id,
                "UPLOAD_STREAM_FAILED",
                claimed.staging_key,
            )
        except Exception:
            pass
        raise
    return UploadStreamResult(
        upload_id=stored.upload_session_id,
        byte_size=stored.byte_size,
        server_checksum_sha256=stored.server_checksum_sha256,
        upload_status=stored.session_status,
    )


async def finalize_upload(
    context: InternalTenantContext,
    upload_id: UUID,
) -> UploadFinalizeResult:
    result = await _upload_service().finalize_upload(
        context.organization_id, context.user_id, upload_id
    )
    return UploadFinalizeResult(
        dataset_id=result.dataset_id,
        upload_id=result.upload_session_id,
        original_object_id=result.original_object_id,
        upload_status=result.session_status,
        validation_status="pending",
    )


async def get_evidence(
    context: InternalTenantContext,
    evidence_id: UUID,
) -> CanonicalEvidence:
    async with UnitOfWork(context.organization_id, context.user_id) as session:
        result = await session.execute(
            sa.text(
                """
                SELECT *
                FROM science.xrd_evidence_snapshots
                WHERE organization_id = :organization_id AND id = :evidence_id
                """
            ),
            {"organization_id": context.organization_id, "evidence_id": evidence_id},
        )
        row = result.mappings().first()
    if not row:
        raise _api_error(404, "EVIDENCE_NOT_FOUND", "Evidence snapshot not found")
    return CanonicalEvidence.model_validate(dict(row))


_REASONING_SELECT = """
    SELECT rr.*, p.title AS project_title, d.title AS dataset_title
    FROM science.reasoning_runs rr
    JOIN science.projects p
      ON p.organization_id = rr.organization_id AND p.id = rr.project_id
    JOIN science.datasets d
      ON d.organization_id = rr.organization_id AND d.id = rr.dataset_id
"""


async def start_reasoning(
    context: InternalTenantContext,
    request: ReasoningStart,
) -> ReasoningRun:
    execution_mode = (
        "deterministic"
        if request.provider in {"deterministic", "scientific-baseline"}
        else "configured_gemini"
    )
    async with UnitOfWork(context.organization_id, context.user_id) as session:
        evidence_result = await session.execute(
            sa.text(
                """
                SELECT ev.*, d.current_evidence_id, d.evidence_status
                FROM science.xrd_evidence_snapshots ev
                JOIN science.datasets d
                  ON d.organization_id = ev.organization_id
                 AND d.id = ev.dataset_id
                WHERE ev.organization_id = :organization_id
                  AND ev.id = :evidence_id
                  AND ev.project_id = :project_id
                  AND ev.dataset_id = :dataset_id
                """
            ),
            {
                "organization_id": context.organization_id,
                "evidence_id": request.evidence_snapshot_id,
                "project_id": request.project_id,
                "dataset_id": request.dataset_id,
            },
        )
        evidence = evidence_result.mappings().first()
        if not evidence:
            raise _api_error(404, "EVIDENCE_NOT_FOUND", "Evidence snapshot not found")
        if (
            evidence["status"] != "ready"
            or evidence["evidence_status"] != "ready"
            or evidence["current_evidence_id"] != evidence["id"]
        ):
            raise _api_error(409, "EVIDENCE_NOT_READY", "Canonical evidence is not ready")

        inserted = await session.execute(
            sa.text(
                """
                INSERT INTO science.reasoning_runs (
                    organization_id, project_id, dataset_id, upload_session_id,
                    evidence_snapshot_id, evidence_content_sha256, created_by,
                    execution_mode, status, provider, model, prompt_version,
                    policy_version, request_id, idempotency_key
                ) VALUES (
                    :organization_id, :project_id, :dataset_id, :upload_session_id,
                    :evidence_snapshot_id, :evidence_content_sha256, :created_by,
                    :execution_mode, 'running', :provider, :model, :prompt_version,
                    :policy_version, :request_id, :idempotency_key
                )
                ON CONFLICT DO NOTHING
                RETURNING id
                """
            ),
            {
                "organization_id": context.organization_id,
                "project_id": request.project_id,
                "dataset_id": request.dataset_id,
                "upload_session_id": evidence["upload_session_id"],
                "evidence_snapshot_id": evidence["id"],
                "evidence_content_sha256": evidence["content_sha256"],
                "created_by": context.user_id,
                "execution_mode": execution_mode,
                "provider": request.provider,
                "model": request.model,
                "prompt_version": request.prompt_version,
                "policy_version": request.policy_version,
                "request_id": request.request_id,
                "idempotency_key": request.idempotency_key,
            },
        )
        inserted_id = inserted.scalar()
        if inserted_id:
            run_id = inserted_id
            created = True
        elif request.idempotency_key:
            existing_result = await session.execute(
                sa.text(
                    """
                    SELECT
                        id, project_id, dataset_id, evidence_snapshot_id,
                        provider, model, prompt_version, policy_version
                    FROM science.reasoning_runs
                    WHERE organization_id = :organization_id
                      AND created_by = :created_by
                      AND idempotency_key = :idempotency_key
                    """
                ),
                {
                    "organization_id": context.organization_id,
                    "created_by": context.user_id,
                    "idempotency_key": request.idempotency_key,
                },
            )
            existing = existing_result.mappings().first()
            if not existing:
                raise _api_error(409, "REASONING_IDEMPOTENCY_CONFLICT", "Reasoning request conflict")
            expected = {
                "project_id": request.project_id,
                "dataset_id": request.dataset_id,
                "evidence_snapshot_id": request.evidence_snapshot_id,
                "provider": request.provider,
                "model": request.model,
                "prompt_version": request.prompt_version,
                "policy_version": request.policy_version,
            }
            if any(existing[key] != value for key, value in expected.items()):
                raise _api_error(
                    409,
                    "REASONING_IDEMPOTENCY_CONFLICT",
                    "Idempotency key was used for a different reasoning request",
                )
            run_id = existing["id"]
            created = False
        else:
            raise _api_error(409, "REASONING_CONFLICT", "Reasoning request conflict")

        result = await session.execute(
            sa.text(
                f"""
                {_REASONING_SELECT}
                WHERE rr.organization_id = :organization_id AND rr.id = :run_id
                """
            ),
            {"organization_id": context.organization_id, "run_id": run_id},
        )
        row = dict(result.mappings().one())
        row["created"] = created
        return ReasoningRun.model_validate(row)


async def complete_reasoning(
    context: InternalTenantContext,
    run_id: UUID,
    request: ReasoningComplete,
) -> ReasoningRun:
    async with UnitOfWork(context.organization_id, context.user_id) as session:
        update_result = await session.execute(
            sa.text(
                """
                UPDATE science.reasoning_runs
                SET status = :status,
                    structured_output = CAST(:structured_output AS jsonb),
                    fallback_used = :fallback_used,
                    quota_classification = :quota_classification,
                    failure_code = :failure_code,
                    failure_message = :failure_message,
                    completed_at = NOW()
                WHERE organization_id = :organization_id
                  AND id = :run_id
                  AND created_by = :created_by
                  AND status = 'running'
                RETURNING id
                """
            ),
            {
                "status": request.status,
                "structured_output": (
                    json.dumps(request.structured_output, separators=(",", ":"))
                    if request.structured_output is not None
                    else None
                ),
                "fallback_used": request.fallback_used,
                "quota_classification": request.quota_classification,
                "failure_code": request.failure_code,
                "failure_message": request.failure_message,
                "organization_id": context.organization_id,
                "run_id": run_id,
                "created_by": context.user_id,
            },
        )
        if not update_result.scalar():
            existing_result = await session.execute(
                sa.text(
                    f"""
                    {_REASONING_SELECT}
                    WHERE rr.organization_id = :organization_id
                      AND rr.id = :run_id
                      AND rr.created_by = :created_by
                    """
                ),
                {
                    "organization_id": context.organization_id,
                    "run_id": run_id,
                    "created_by": context.user_id,
                },
            )
            existing = existing_result.mappings().first()
            if not existing:
                raise _api_error(404, "REASONING_RUN_NOT_FOUND", "Reasoning run not found")
            if existing["status"] == "running":
                raise _api_error(409, "REASONING_STATE_CONFLICT", "Reasoning state conflict")
        result = await session.execute(
            sa.text(
                f"""
                {_REASONING_SELECT}
                WHERE rr.organization_id = :organization_id AND rr.id = :run_id
                """
            ),
            {"organization_id": context.organization_id, "run_id": run_id},
        )
        return ReasoningRun.model_validate(dict(result.mappings().one()))


async def get_reasoning(
    context: InternalTenantContext,
    run_id: UUID,
) -> ReasoningRun:
    async with UnitOfWork(context.organization_id, context.user_id) as session:
        result = await session.execute(
            sa.text(
                f"""
                {_REASONING_SELECT}
                WHERE rr.organization_id = :organization_id AND rr.id = :run_id
                """
            ),
            {"organization_id": context.organization_id, "run_id": run_id},
        )
        row = result.mappings().first()
    if not row:
        raise _api_error(404, "REASONING_RUN_NOT_FOUND", "Reasoning run not found")
    return ReasoningRun.model_validate(dict(row))


async def list_reasoning(
    context: InternalTenantContext,
    *,
    project_id: Optional[UUID],
    dataset_id: Optional[UUID],
    limit: int,
    cursor: Optional[str],
) -> ReasoningHistory:
    safe_limit = min(max(limit, 1), 100)
    cursor_created_at, cursor_id = _decode_cursor(cursor)
    clauses = ["rr.organization_id = :organization_id"]
    params: Dict[str, Any] = {
        "organization_id": context.organization_id,
        "limit": safe_limit + 1,
    }
    if project_id:
        clauses.append("rr.project_id = :project_id")
        params["project_id"] = project_id
    if dataset_id:
        clauses.append("rr.dataset_id = :dataset_id")
        params["dataset_id"] = dataset_id
    if cursor_created_at and cursor_id:
        clauses.append("(rr.created_at, rr.id) < (:cursor_created_at, :cursor_id)")
        params.update(cursor_created_at=cursor_created_at, cursor_id=cursor_id)
    async with UnitOfWork(context.organization_id, context.user_id) as session:
        result = await session.execute(
            sa.text(
                f"""
                {_REASONING_SELECT}
                WHERE {' AND '.join(clauses)}
                ORDER BY rr.created_at DESC, rr.id DESC
                LIMIT :limit
                """
            ),
            params,
        )
        rows = [dict(row) for row in result.mappings().all()]
    has_more = len(rows) > safe_limit
    visible = rows[:safe_limit]
    return ReasoningHistory(
        items=[ReasoningRun.model_validate(row) for row in visible],
        has_more=has_more,
        next_cursor=(
            _encode_cursor(visible[-1]["created_at"], visible[-1]["id"])
            if has_more and visible
            else None
        ),
    )


_NOTEBOOK_SELECT = """
    SELECT nr.*, p.title AS project_title, d.title AS dataset_title,
           rr.status AS reasoning_status, rr.provider
    FROM science.notebook_reasoning_references nr
    JOIN science.projects p
      ON p.organization_id = nr.organization_id AND p.id = nr.project_id
    JOIN science.datasets d
      ON d.organization_id = nr.organization_id AND d.id = nr.dataset_id
    JOIN science.reasoning_runs rr
      ON rr.organization_id = nr.organization_id AND rr.id = nr.reasoning_run_id
"""


async def create_notebook_reference(
    context: InternalTenantContext,
    request: NotebookReferenceCreate,
) -> NotebookReference:
    async with UnitOfWork(context.organization_id, context.user_id) as session:
        run_result = await session.execute(
            sa.text(
                """
                SELECT *
                FROM science.reasoning_runs
                WHERE organization_id = :organization_id
                  AND id = :run_id
                  AND status IN ('succeeded', 'fallback')
                """
            ),
            {"organization_id": context.organization_id, "run_id": request.reasoning_run_id},
        )
        run = run_result.mappings().first()
        if not run:
            raise _api_error(404, "REASONING_RUN_NOT_FOUND", "Completed reasoning run not found")
        inserted = await session.execute(
            sa.text(
                """
                INSERT INTO science.notebook_reasoning_references (
                    organization_id, project_id, dataset_id, evidence_snapshot_id,
                    reasoning_run_id, created_by, label
                ) VALUES (
                    :organization_id, :project_id, :dataset_id, :evidence_snapshot_id,
                    :reasoning_run_id, :created_by, :label
                )
                ON CONFLICT (organization_id, reasoning_run_id, created_by)
                DO NOTHING
                RETURNING id
                """
            ),
            {
                "organization_id": context.organization_id,
                "project_id": run["project_id"],
                "dataset_id": run["dataset_id"],
                "evidence_snapshot_id": run["evidence_snapshot_id"],
                "reasoning_run_id": run["id"],
                "created_by": context.user_id,
                "label": request.label,
            },
        )
        reference_id = inserted.scalar()
        if not reference_id:
            existing = await session.execute(
                sa.text(
                    """
                    SELECT id
                    FROM science.notebook_reasoning_references
                    WHERE organization_id = :organization_id
                      AND reasoning_run_id = :reasoning_run_id
                      AND created_by = :created_by
                    """
                ),
                {
                    "organization_id": context.organization_id,
                    "reasoning_run_id": run["id"],
                    "created_by": context.user_id,
                },
            )
            reference_id = existing.scalar_one()
        result = await session.execute(
            sa.text(
                f"""
                {_NOTEBOOK_SELECT}
                WHERE nr.organization_id = :organization_id AND nr.id = :reference_id
                """
            ),
            {"organization_id": context.organization_id, "reference_id": reference_id},
        )
        return NotebookReference.model_validate(dict(result.mappings().one()))


async def list_notebook_references(
    context: InternalTenantContext,
) -> NotebookReferenceList:
    async with UnitOfWork(context.organization_id, context.user_id) as session:
        result = await session.execute(
            sa.text(
                f"""
                {_NOTEBOOK_SELECT}
                WHERE nr.organization_id = :organization_id
                ORDER BY nr.created_at DESC, nr.id DESC
                LIMIT 100
                """
            ),
            {"organization_id": context.organization_id},
        )
        rows = result.mappings().all()
    return NotebookReferenceList(
        items=[NotebookReference.model_validate(dict(row)) for row in rows]
    )
