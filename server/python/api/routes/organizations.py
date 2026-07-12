import logging
from fastapi import APIRouter, Depends
from api.auth.dependencies import get_user_context
from api.auth.models import AuthenticatedUserContext
from api.models.organization import OrganizationListResponse, OrganizationMembershipResponse

logger = logging.getLogger("difaryx.routes.organizations")
router = APIRouter(tags=["Tenant Management"])


@router.get("/organizations", response_model=OrganizationListResponse)
async def get_my_organizations(
    context: AuthenticatedUserContext = Depends(get_user_context)
):
    """Retrieves mapped organization memberships for the authenticated token."""
    memberships = [
        OrganizationMembershipResponse(
            organizationId=m.organization_id,
            organizationName=m.organization_name,
            userId=m.user_id,
            role=m.role
        )
        for m in context.mappings
    ]
    return OrganizationListResponse(organizations=memberships)
