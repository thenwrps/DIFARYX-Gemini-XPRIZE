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


class DatasetNotFoundError(DIFARYXException):
    def __init__(self, message: str = "Dataset not found"):
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            error_code="DATASET_NOT_FOUND",
            message=message
        )


class UploadSessionNotFoundError(DIFARYXException):
    def __init__(self, message: str = "Upload session not found"):
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            error_code="UPLOAD_SESSION_NOT_FOUND",
            message=message
        )


class UploadSessionStateError(DIFARYXException):
    def __init__(self, message: str = "Upload session state conflict"):
        super().__init__(
            status_code=status.HTTP_409_CONFLICT,
            error_code="UPLOAD_SESSION_STATE_CONFLICT",
            message=message
        )


class DatasetStateError(DIFARYXException):
    def __init__(self, message: str = "Dataset state conflict"):
        super().__init__(
            status_code=status.HTTP_409_CONFLICT,
            error_code="DATASET_STATE_CONFLICT",
            message=message
        )


class StorageQuotaExceededError(DIFARYXException):
    def __init__(self, message: str = "Storage quota exceeded"):
        super().__init__(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            error_code="STORAGE_QUOTA_EXCEEDED",
            message=message
        )


class ChecksumMismatchError(DIFARYXException):
    def __init__(self, message: str = "Checksum mismatch"):
        super().__init__(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            error_code="CHECKSUM_MISMATCH",
            message=message
        )


class IdempotencyConflictError(DIFARYXException):
    def __init__(self, message: str = "Idempotency conflict"):
        super().__init__(
            status_code=status.HTTP_409_CONFLICT,
            error_code="IDEMPOTENCY_CONFLICT",
            message=message
        )


class FileValidationError(DIFARYXException):
    def __init__(self, message: str = "File validation error"):
        super().__init__(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code="FILE_VALIDATION_ERROR",
            message=message
        )


class UploadExpiredError(DIFARYXException):
    def __init__(self, message: str = "Upload session expired"):
        super().__init__(
            status_code=status.HTTP_410_GONE,
            error_code="UPLOAD_SESSION_EXPIRED",
            message=message
        )


class ContentLengthRequiredError(DIFARYXException):
    def __init__(self, message: str = "Content-Length header required"):
        super().__init__(
            status_code=status.HTTP_411_LENGTH_REQUIRED,
            error_code="CONTENT_LENGTH_REQUIRED",
            message=message
        )


class StoragePromotionError(DIFARYXException):
    def __init__(self, message: str = "Storage promotion error"):
        super().__init__(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            error_code="STORAGE_PROMOTION_ERROR",
            message=message
        )


class StagingConflictError(DIFARYXException):
    def __init__(self, message: str = "Staging conflict"):
        super().__init__(
            status_code=status.HTTP_409_CONFLICT,
            error_code="STAGING_CONFLICT",
            message=message
        )


class StagingOverflowAPIError(DIFARYXException):
    def __init__(self, message: str = "Staging size limit exceeded"):
        super().__init__(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            error_code="STAGING_OVERFLOW",
            message=message
        )


class PromotionConflictError(DIFARYXException):
    def __init__(self, message: str = "Promotion conflict"):
        super().__init__(
            status_code=status.HTTP_409_CONFLICT,
            error_code="PROMOTION_CONFLICT",
            message=message
        )


class ValidationNotFoundError(DIFARYXException):
    def __init__(self, message: str = "Validation attempt not found"):
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            error_code="VALIDATION_NOT_FOUND",
            message=message
        )


class ValidationStateError(DIFARYXException):
    def __init__(self, message: str = "Validation state conflict"):
        super().__init__(
            status_code=status.HTTP_409_CONFLICT,
            error_code="VALIDATION_STATE_CONFLICT",
            message=message
        )


class ValidationQuarantinedError(DIFARYXException):
    def __init__(self, message: str = "Dataset validation quarantined"):
        super().__init__(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            error_code="VALIDATION_QUARANTINED",
            message=message
        )
