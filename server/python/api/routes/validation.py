import logging
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import JSONResponse

from api.auth.dependencies import get_active_organization
from api.auth.models import AuthenticatedUserContext
from api.models.validation import (
    CancelValidationRequest,
    CancelValidationResponse,
    EnqueueValidationResponse,
    ValidationAttemptListResponse,
    ValidationOutcome,
    ValidationStatusResponse,
)
from api.services.validation_service import ValidationService

logger = logging.getLogger("difaryx.routes.validation")
router = APIRouter(tags=["Dataset Validation"])


@router.post(
    "/datasets/{dataset_id}/validation",
    response_model=EnqueueValidationResponse,
    status_code=201,
)
async def enqueue_validation(
    dataset_id: UUID,
    context: AuthenticatedUserContext = Depends(get_active_organization),
):
    return await ValidationService.enqueue_validation(
        context.active_organization_id,
        context.active_user_id,
        dataset_id,
    )


@router.post(
    "/datasets/{dataset_id}/validation/process",
    response_model=Optional[ValidationOutcome],
)
async def process_validation(
    dataset_id: UUID,
    context: AuthenticatedUserContext = Depends(get_active_organization),
):
    raise HTTPException(
        status_code=403,
        detail="Validation settlement is worker-only; this API endpoint cannot process attempts",
    )


@router.post(
    "/datasets/{dataset_id}/validation/cancel",
    response_model=CancelValidationResponse,
)
async def cancel_validation(
    dataset_id: UUID,
    request: CancelValidationRequest,
    context: AuthenticatedUserContext = Depends(get_active_organization),
):
    return await ValidationService.cancel_validation(
        context.active_organization_id,
        context.active_user_id,
        dataset_id,
        request.reason,
    )


@router.get(
    "/datasets/{dataset_id}/validation",
    response_model=ValidationStatusResponse,
)
async def get_validation_status(
    dataset_id: UUID,
    context: AuthenticatedUserContext = Depends(get_active_organization),
):
    return await ValidationService.get_validation_status(
        context.active_organization_id,
        context.active_user_id,
        dataset_id,
    )


@router.get(
    "/datasets/{dataset_id}/validation/attempts",
    response_model=ValidationAttemptListResponse,
)
async def list_validation_attempts(
    dataset_id: UUID,
    limit: int = 50,
    cursor: Optional[str] = None,
    context: AuthenticatedUserContext = Depends(get_active_organization),
):
    return await ValidationService.list_validation_attempts(
        context.active_organization_id,
        context.active_user_id,
        dataset_id,
        limit,
        cursor,
    )
