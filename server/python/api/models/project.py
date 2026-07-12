import re
from pydantic import BaseModel, Field, field_validator
from uuid import UUID
from datetime import datetime
from typing import Optional, List


class ProjectCreateRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=1000)

    @field_validator("title", "description", mode="before")
    @classmethod
    def sanitize_strings(cls, v):
        if isinstance(v, str):
            v = v.strip()
            # Reject control characters (excluding tab/newlines)
            if re.search(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", v):
                raise ValueError("Control characters are not allowed")
            if not v and cls.__name__ == "ProjectCreateRequest":
                raise ValueError("String cannot be empty after trimming")
        return v

    model_config = {
        "extra": "forbid"
    }


class ProjectPatchRequest(BaseModel):
    expected_updated_at: datetime = Field(..., serialization_alias="expectedUpdatedAt", validation_alias="expectedUpdatedAt")
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=1000)

    @field_validator("title", "description", mode="before")
    @classmethod
    def sanitize_strings(cls, v):
        if isinstance(v, str):
            v = v.strip()
            if re.search(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", v):
                raise ValueError("Control characters are not allowed")
            if not v:
                raise ValueError("String cannot be empty after trimming")
        return v

    model_config = {
        "extra": "forbid"
    }


class ProjectResponse(BaseModel):
    id: UUID = Field(..., serialization_alias="id")
    title: str = Field(..., serialization_alias="title")
    description: Optional[str] = Field(None, serialization_alias="description")
    status: str = Field("active", serialization_alias="status")
    created_at: datetime = Field(..., serialization_alias="createdAt", validation_alias="created_at")
    updated_at: datetime = Field(..., serialization_alias="updatedAt", validation_alias="updated_at")
    my_project_role: Optional[str] = Field(None, serialization_alias="myProjectRole", validation_alias="my_project_role")

    model_config = {
        "populate_by_name": True,
        "serialize_by_alias": True
    }


class ProjectListResponse(BaseModel):
    items: List[ProjectResponse] = Field(..., serialization_alias="items")
    next_cursor: Optional[str] = Field(None, serialization_alias="nextCursor")
    has_more: bool = Field(False, serialization_alias="hasMore")

    model_config = {
        "populate_by_name": True,
        "serialize_by_alias": True
    }
