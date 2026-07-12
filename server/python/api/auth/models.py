from typing import Optional, List
from pydantic import BaseModel, Field
from uuid import UUID


class VerifiedExternalIdentity(BaseModel):
    """Normalized payload containing verified claims extracted from an authentication token."""
    provider: str
    subject: str
    email: Optional[str] = None


class UserMapping(BaseModel):
    """Internal user profile mapping bound to a specific tenant organization."""
    organization_id: UUID
    organization_name: str
    user_id: UUID
    email: str
    user_display_name: Optional[str] = None
    role: str


class AuthenticatedUserContext(BaseModel):
    """The fully resolved authentication context containing all organization memberships."""
    provider: str
    subject: str
    email: str
    display_name: Optional[str] = None
    # All accessible tenant organization mappings for this user identity
    mappings: List[UserMapping]

    # Active tenant context chosen for the current request scope
    active_organization_id: Optional[UUID] = None
    active_user_id: Optional[UUID] = None
    active_role: Optional[str] = None
