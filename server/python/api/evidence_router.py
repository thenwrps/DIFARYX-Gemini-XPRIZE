"""
DIFARYX Evidence Registry — FastAPI Router.

Provides REST API endpoints for the multi-technique Evidence Registry.

Endpoints:
    POST /evidence                              — Create a generic evidence record
    GET  /evidence/{evidence_id}                — Retrieve a single evidence record
    GET  /projects/{project_id}/evidence        — List all evidence for a project
    GET  /projects/{project_id}/evidence/latest — Latest evidence (optional ?technique=XRD)
    GET  /projects/{project_id}/evidence/summary— Aggregated project summary
    GET  /projects/{project_id}/agent-context   — Agent-ready context bundle
    POST /evidence/ingest/xrd                   — Ingest an XRD result as evidence

Launch:
    Registered as an APIRouter on the main gateway app.
"""

from __future__ import annotations

import logging
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query

from api.evidence_normalizers import normalize_xrd_result
from api.evidence_registry import evidence_registry
from api.evidence_schemas import (
    AgentContext,
    EvidenceCreateRequest,
    EvidenceIngestXRDBody,
    EvidenceRecord,
    EvidenceSummary,
)

logger = logging.getLogger("difaryx.evidence.router")

router = APIRouter(tags=["Evidence Registry"])


# ============================================================================
# POST /evidence — Create a generic evidence record
# ============================================================================


@router.post(
    "/evidence",
    response_model=EvidenceRecord,
    status_code=201,
    responses={400: {"description": "Validation error"}},
)
async def create_evidence(request: EvidenceCreateRequest):
    """
    Create a new evidence record in the Evidence Registry.

    Accepts a fully-populated EvidenceCreateRequest.  The registry assigns
    evidence_id and created_at automatically.

    Returns the stored EvidenceRecord.
    """
    try:
        record = evidence_registry.create(request)
        logger.info(
            "Created evidence %s for project %s (technique=%s)",
            record.evidence_id,
            record.project_id,
            record.technique,
        )
        return record
    except Exception as exc:
        logger.exception("Failed to create evidence record.")
        raise HTTPException(
            status_code=400,
            detail=f"Failed to create evidence: {exc}",
        )


# ============================================================================
# GET /evidence/{evidence_id} — Retrieve a single evidence record
# ============================================================================


@router.get(
    "/evidence/{evidence_id}",
    response_model=EvidenceRecord,
    responses={404: {"description": "Evidence not found"}},
)
async def get_evidence(evidence_id: str):
    """
    Retrieve a single evidence record by its UUID.
    """
    record = evidence_registry.get(evidence_id)
    if record is None:
        raise HTTPException(
            status_code=404,
            detail=f"Evidence record not found: {evidence_id}",
        )
    return record


# ============================================================================
# GET /projects/{project_id}/evidence — List all evidence for a project
# ============================================================================


@router.get(
    "/projects/{project_id}/evidence",
    response_model=List[EvidenceRecord],
)
async def list_project_evidence(project_id: str):
    """
    List all evidence records for a given project, most recent first.
    """
    records = evidence_registry.list_by_project(project_id)
    return records


# ============================================================================
# GET /projects/{project_id}/evidence/latest — Latest per technique
# ============================================================================


@router.get(
    "/projects/{project_id}/evidence/latest",
    response_model=EvidenceRecord,
    responses={404: {"description": "No matching evidence found"}},
)
async def get_latest_evidence(
    project_id: str,
    technique: Optional[str] = Query(
        default=None,
        description="Optional technique filter (e.g. XRD, XPS, FTIR, Raman).",
    ),
):
    """
    Get the most recent evidence record for a project.

    Optionally filter by technique using the ``?technique=XRD`` query param.
    Returns 404 if no matching evidence is found.
    """
    record = evidence_registry.get_latest(project_id, technique=technique)
    if record is None:
        detail = f"No evidence found for project '{project_id}'"
        if technique:
            detail += f" with technique '{technique}'"
        raise HTTPException(status_code=404, detail=detail)
    return record


# ============================================================================
# GET /projects/{project_id}/evidence/summary — Aggregated summary
# ============================================================================


@router.get(
    "/projects/{project_id}/evidence/summary",
    response_model=EvidenceSummary,
)
async def get_evidence_summary(project_id: str):
    """
    Get an aggregated summary of all evidence for a project.

    Includes technique counts, latest evidence IDs, and deduplicated
    validation gaps.
    """
    summary = evidence_registry.get_summary(project_id)
    return summary


# ============================================================================
# GET /projects/{project_id}/agent-context — Agent-ready context
# ============================================================================


@router.get(
    "/projects/{project_id}/agent-context",
    response_model=AgentContext,
)
async def get_agent_context(project_id: str):
    """
    Get agent-ready context for a project.

    Provides the full current state of evidence, including per-technique
    summaries, all validation gaps, and claim boundaries — formatted for
    consumption by an autonomous agent.
    """
    context = evidence_registry.get_agent_context(project_id)
    return context


# ============================================================================
# POST /evidence/ingest/xrd — Ingest XRD result as evidence
# ============================================================================


@router.post(
    "/evidence/ingest/xrd",
    response_model=EvidenceRecord,
    status_code=201,
    responses={400: {"description": "Validation error"}},
)
async def ingest_xrd_evidence(body: EvidenceIngestXRDBody):
    """
    Ingest an already-completed XRD processing result as evidence.

    This endpoint does NOT re-run the XRD pipeline.  It normalizes an
    existing XRD result dict (as returned by POST /process or
    POST /skills/xrd/process) into the evidence schema and stores it
    in the registry.

    Bounded scientific language is enforced:
      - "phase indication" is allowed
      - "phase-purity confirmation requires additional validation" is allowed
      - "confirmed phase purity" is forbidden
    """
    try:
        create_request = normalize_xrd_result(
            project_id=body.project_id,
            xrd_response=body.xrd_result,
            processing_params=body.processing_params,
            sample_id=body.sample_id,
            source_file=body.source_file,
            tags=body.tags,
        )
        record = evidence_registry.create(create_request)
        logger.info(
            "Ingested XRD evidence %s for project %s",
            record.evidence_id,
            record.project_id,
        )
        return record
    except Exception as exc:
        logger.exception("Failed to ingest XRD evidence.")
        raise HTTPException(
            status_code=400,
            detail=f"Failed to ingest XRD evidence: {exc}",
        )