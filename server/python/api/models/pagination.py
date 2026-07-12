from pydantic import BaseModel, Field
from typing import Dict, Any


class ErrorDetail(BaseModel):
    errorCode: str = Field(..., serialization_alias="errorCode")
    message: str = Field(..., serialization_alias="message")
    details: Dict[str, Any] = Field(default_factory=dict, serialization_alias="details")

    model_config = {
        "populate_by_name": True,
        "serialize_by_alias": True
    }


class ErrorResponse(BaseModel):
    detail: ErrorDetail = Field(..., serialization_alias="detail")
    request_id: str = Field(..., serialization_alias="requestId", validation_alias="request_id")

    model_config = {
        "populate_by_name": True,
        "serialize_by_alias": True
    }
