import logging
from fastapi import APIRouter, Depends
from api.auth.dependencies import get_user_context
from api.auth.models import AuthenticatedUserContext
from api.models.current_user import CurrentUserResponse
from api.models.organization import OrganizationMembershipResponse
from api.db.context import correlation_id_ctx

logger = logging.getLogger("difaryx.routes.me")
router = APIRouter(tags=["User Authentication"])


@router.get("/me", response_model=CurrentUserResponse)
async def get_my_profile(
    context: AuthenticatedUserContext = Depends(get_user_context)
):
    """Retrieves authenticated profile context and mapped memberships."""
    request_id = correlation_id_ctx.get()
    memberships = [
        OrganizationMembershipResponse(
            organizationId=m.organization_id,
            organizationName=m.organization_name,
            userId=m.user_id,
            role=m.role
        )
        for m in context.mappings
    ]
    return CurrentUserResponse(
        user={
            "externalProvider": context.provider,
            "displayName": context.display_name or "Researcher"
        },
        memberships=memberships,
        request_id=request_id or ""
    )
