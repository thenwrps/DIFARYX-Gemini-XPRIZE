from pydantic import BaseModel, Field
from typing import List, Dict, Any
from api.models.organization import OrganizationMembershipResponse


class CurrentUserResponse(BaseModel):
    user: Dict[str, Any] = Field(..., serialization_alias="user")
    memberships: List[OrganizationMembershipResponse] = Field(..., serialization_alias="memberships")
    request_id: str = Field(..., serialization_alias="requestId")

    model_config = {
        "populate_by_name": True,
        "serialize_by_alias": True
    }
