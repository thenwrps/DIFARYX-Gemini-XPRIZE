from typing import Optional, Dict, Any
from fastapi import HTTPException, status


class DIFARYXException(HTTPException):
    """Base API exception supporting structured error responses."""
    def __init__(
        self,
        status_code: int,
        error_code: str,
        message: str,
        details: Optional[Dict[str, Any]] = None
    ):
        super().__init__(
            status_code=status_code,
            detail={
                "errorCode": error_code,
                "message": message,
                "details": details or {}
            }
        )


class AuthenticationRequiredException(DIFARYXException):
    def __init__(self, message: str = "Bearer token is required or invalid"):
        super().__init__(
            status_code=status.HTTP_401_UNAUTHORIZED,
            error_code="AUTHENTICATION_REQUIRED",
            message=message
        )


class InvalidOrganizationContextException(DIFARYXException):
    def __init__(self, message: str = "Active-Organization context is missing or malformed"):
        super().__init__(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code="INVALID_ORGANIZATION_CONTEXT",
            message=message
        )


class OrganizationAccessDeniedException(DIFARYXException):
    def __init__(self, message: str = "Access to the requested organization is denied"):
        super().__init__(
            status_code=status.HTTP_403_FORBIDDEN,
            error_code="ORGANIZATION_ACCESS_DENIED",
            message=message
        )


class ProjectVersionConflictException(DIFARYXException):
    def __init__(self, message: str = "Project version conflict detected"):
        super().__init__(
            status_code=status.HTTP_409_CONFLICT,
            error_code="PROJECT_VERSION_CONFLICT",
            message=message
        )
