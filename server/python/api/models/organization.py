from pydantic import BaseModel, Field
from uuid import UUID


class OrganizationMembershipResponse(BaseModel):
    organization_id: UUID = Field(..., serialization_alias="organizationId", validation_alias="organizationId")
    organization_name: str = Field(..., serialization_alias="organizationName", validation_alias="organizationName")
    user_id: UUID = Field(..., serialization_alias="userId", validation_alias="userId")
    role: str = Field(..., serialization_alias="role", validation_alias="role")

    model_config = {
        "populate_by_name": True,
        "serialize_by_alias": True
    }


class OrganizationListResponse(BaseModel):
    organizations: list[OrganizationMembershipResponse] = Field(..., serialization_alias="organizations")

    model_config = {
        "populate_by_name": True,
        "serialize_by_alias": True
    }
