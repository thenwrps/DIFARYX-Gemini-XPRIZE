import logging
from typing import Optional
from uuid import UUID
from fastapi import Request, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from api.db.settings import settings
from api.db.bootstrap_identity import BootstrapIdentityRepository
from api.auth.models import VerifiedExternalIdentity, UserMapping, AuthenticatedUserContext
from api.auth.verifier import AuthTokenVerifier, get_token_verifier as verifier_factory
from api.errors import (
    DIFARYXException,
    AuthenticationRequiredException,
    InvalidOrganizationContextException,
    OrganizationAccessDeniedException
)

logger = logging.getLogger("difaryx.auth.dependencies")
security = HTTPBearer(auto_error=False)

# Cache verifier instance to avoid redundant Firebase app initializations
_verifier_instance: Optional[AuthTokenVerifier] = None


def get_token_verifier() -> AuthTokenVerifier:
    """Dependency to retrieve the configured token verifier."""
    global _verifier_instance
    if _verifier_instance is None:
        _verifier_instance = verifier_factory(
            app_env=settings.APP_ENV,
            provider=settings.AUTH_PROVIDER,
            project_id=settings.FIREBASE_PROJECT_ID
        )
    return _verifier_instance


async def get_verified_identity(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    verifier: AuthTokenVerifier = Depends(get_token_verifier)
) -> VerifiedExternalIdentity:
    """Extracts and verifies Bearer token claims, returning a VerifiedExternalIdentity."""
    if not credentials or not credentials.credentials:
        raise AuthenticationRequiredException("Bearer authentication token is missing")

    try:
        return await verifier.verify(credentials.credentials)
    except Exception as e:
        logger.warning(f"Failed token verification in dependency: {e}")
        raise AuthenticationRequiredException(f"Token verification failed: {e}")


async def get_user_context(
    identity: VerifiedExternalIdentity = Depends(get_verified_identity)
) -> AuthenticatedUserContext:
    """Resolves internal organization mappings for the verified identity, raising ACCOUNT_NOT_PROVISIONED if unmapped."""
    try:
        mappings_raw = await BootstrapIdentityRepository.resolve(
            provider_name=identity.provider,
            provider_subject=identity.subject
        )
    except Exception as e:
        logger.error(f"Error querying bootstrap resolver: {e}")
        raise DIFARYXException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            error_code="INTERNAL_SERVER_ERROR",
            message="Database resolution error during authentication bootstrap"
        )

    if not mappings_raw:
        logger.info(f"Unmapped identity: provider='{identity.provider}', subject='{identity.subject}'. Rejecting.")
        raise DIFARYXException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            error_code="ACCOUNT_NOT_PROVISIONED",
            message="This external account is not provisioned in the DIFARYX registry."
        )

    # Map to pydantic models
    user_mappings = []
    first_row = mappings_raw[0]
    for row in mappings_raw:
        user_mappings.append(UserMapping(
            organization_id=row["organization_id"],
            organization_name=row["organization_name"],
            user_id=row["user_id"],
            email=row["email"],
            user_display_name=row["user_display_name"],
            role=row["role"]
        ))

    return AuthenticatedUserContext(
        provider=identity.provider,
        subject=identity.subject,
        email=first_row["email"],
        display_name=first_row["user_display_name"],
        mappings=user_mappings
    )


async def get_active_organization(
    request: Request,
    context: AuthenticatedUserContext = Depends(get_user_context)
) -> AuthenticatedUserContext:
    """Resolves and validates the Active-Organization context for tenant-scoped operations."""
    active_org_header = request.headers.get("Active-Organization")
    if not active_org_header:
        raise InvalidOrganizationContextException("The 'Active-Organization' header is required for this operation")

    try:
        active_org_id = UUID(active_org_header.strip())
    except ValueError:
        raise InvalidOrganizationContextException("The 'Active-Organization' header must be a valid UUID")

    # Verify membership
    target_mapping = None
    for m in context.mappings:
        if m.organization_id == active_org_id:
            target_mapping = m
            break

    if not target_mapping:
        logger.warning(f"Access denied: organization '{active_org_id}' is not in user mappings.")
        raise OrganizationAccessDeniedException("You do not have access to the requested organization")

    # Set active tenant properties
    context.active_organization_id = target_mapping.organization_id
    context.active_user_id = target_mapping.user_id
    context.active_role = target_mapping.role

    return context
