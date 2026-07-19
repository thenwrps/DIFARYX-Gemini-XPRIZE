import hashlib
from dataclasses import dataclass, field
from typing import Dict, List, Optional

from api.storage.protocol import ObjectStore
from api.validation.policy import is_allowed_extension, is_allowed_content_type


@dataclass(frozen=True)
class CheckResult:
    name: str
    passed: bool
    detail: str
    failure_code: Optional[str] = None
    transient: bool = False


@dataclass
class ValidationResult:
    passed: bool
    checks: List[CheckResult]
    server_checksum_sha256: Optional[str]
    byte_size_verified: Optional[int]
    failure_code: Optional[str]
    failure_details: Optional[Dict]
    transient: bool


@dataclass(frozen=True)
class IntegrityVerificationResult:
    passed: bool
    server_checksum_sha256: Optional[str]
    byte_size_verified: Optional[int]
    failure_code: Optional[str]
    detail: str


async def verify_authoritative_object(
    store: ObjectStore,
    object_key: str,
    expected_byte_size: int,
    persisted_byte_size: Optional[int],
    authoritative_sha256: Optional[str],
) -> IntegrityVerificationResult:
    """Independently hash/count the final object against finalize metadata."""
    if not authoritative_sha256:
        return IntegrityVerificationResult(
            passed=False,
            server_checksum_sha256=None,
            byte_size_verified=None,
            failure_code="AUTHORITATIVE_DIGEST_MISSING",
            detail="Final object has no server-authoritative finalize digest",
        )

    hasher = hashlib.sha256()
    byte_count = 0
    try:
        async for chunk in store.get_object(object_key):
            hasher.update(chunk)
            byte_count += len(chunk)
    except Exception as exc:
        import traceback
        traceback.print_exc()
        return IntegrityVerificationResult(
            passed=False,
            server_checksum_sha256=None,
            byte_size_verified=None,
            failure_code="INTEGRITY_READ_ERROR",
            detail=f"Independent final-object verification could not read bytes: {exc}",
        )

    observed_digest = hasher.hexdigest()
    if persisted_byte_size is not None and byte_count != persisted_byte_size:
        return IntegrityVerificationResult(
            passed=False,
            server_checksum_sha256=observed_digest,
            byte_size_verified=byte_count,
            failure_code="AUTHORITATIVE_SIZE_MISMATCH",
            detail=f"Final object size {byte_count} does not match persisted size {persisted_byte_size}",
        )
    if byte_count != expected_byte_size:
        return IntegrityVerificationResult(
            passed=False,
            server_checksum_sha256=observed_digest,
            byte_size_verified=byte_count,
            failure_code="AUTHORITATIVE_SIZE_MISMATCH",
            detail=f"Final object size {byte_count} does not match expected size {expected_byte_size}",
        )
    if observed_digest != authoritative_sha256:
        return IntegrityVerificationResult(
            passed=False,
            server_checksum_sha256=observed_digest,
            byte_size_verified=byte_count,
            failure_code="AUTHORITATIVE_SHA256_MISMATCH",
            detail=f"Final object digest {observed_digest} does not match authoritative digest {authoritative_sha256}",
        )

    return IntegrityVerificationResult(
        passed=True,
        server_checksum_sha256=observed_digest,
        byte_size_verified=byte_count,
        failure_code=None,
        detail="Final object independently matches authoritative finalize digest and byte size",
    )


async def check_object_exists(store: ObjectStore, object_key: str) -> CheckResult:
    exists = await store.exists(object_key)
    if not exists:
        return CheckResult(
            name="object_exists",
            passed=False,
            detail=f"Object not found: {object_key}",
            failure_code="OBJECT_NOT_FOUND",
            transient=False,
        )
    return CheckResult(
        name="object_exists",
        passed=True,
        detail="Object exists in storage",
    )


async def check_byte_size(
    store: ObjectStore, object_key: str, expected_byte_size: int
) -> CheckResult:
    metadata = await store.head_object(object_key)
    if metadata.byte_size != expected_byte_size:
        return CheckResult(
            name="byte_size",
            passed=False,
            detail=f"Byte size mismatch: expected {expected_byte_size}, got {metadata.byte_size}",
            failure_code="BYTE_SIZE_MISMATCH",
            transient=False,
        )
    return CheckResult(
        name="byte_size",
        passed=True,
        detail=f"Byte size verified: {metadata.byte_size}",
    )


def check_extension(display_filename: str) -> CheckResult:
    if not is_allowed_extension(display_filename):
        return CheckResult(
            name="extension",
            passed=False,
            detail=f"File extension not allowed: {display_filename}",
            failure_code="INVALID_EXTENSION",
            transient=False,
        )
    return CheckResult(
        name="extension",
        passed=True,
        detail="File extension allowed",
    )


def check_content_type(declared_content_type: str) -> CheckResult:
    if not is_allowed_content_type(declared_content_type):
        return CheckResult(
            name="content_type",
            passed=False,
            detail=f"Content type not allowed: {declared_content_type}",
            failure_code="INVALID_CONTENT_TYPE",
            transient=False,
        )
    return CheckResult(
        name="content_type",
        passed=True,
        detail="Content type allowed",
    )


def check_not_empty(expected_byte_size: int) -> CheckResult:
    if expected_byte_size == 0:
        return CheckResult(
            name="not_empty",
            passed=False,
            detail="File is empty (0 bytes)",
            failure_code="EMPTY_FILE",
            transient=False,
        )
    return CheckResult(
        name="not_empty",
        passed=True,
        detail="File is not empty",
    )


async def check_checksum(
    store: ObjectStore,
    object_key: str,
    client_checksum_sha256: Optional[str],
) -> CheckResult:
    hasher = hashlib.sha256()
    async for chunk in store.get_object(object_key):
        hasher.update(chunk)
    server_digest = hasher.hexdigest()

    if client_checksum_sha256 and server_digest != client_checksum_sha256:
        return CheckResult(
            name="checksum",
            passed=True,
            detail=(
                f"Server checksum: {server_digest}; client checksum hint mismatch ignored"
            ),
        )
    return CheckResult(
        name="checksum",
        passed=True,
        detail=f"Server checksum: {server_digest}",
    )


async def check_bounded_content(
    store: ObjectStore,
    object_key: str,
    max_bytes: int = 8192,
) -> CheckResult:
    collected = bytearray()
    bytes_read = 0
    try:
        async for chunk in store.get_object(object_key):
            collected.extend(chunk)
            bytes_read += len(chunk)
            if bytes_read >= max_bytes:
                break
    except Exception as e:
        return CheckResult(
            name="bounded_content",
            passed=False,
            detail=f"Storage read error during content inspection: {e}",
            failure_code="READ_ERROR",
            transient=True,
        )

    content = bytes(collected[:max_bytes])

    if b"\x00" in content:
        return CheckResult(
            name="bounded_content",
            passed=False,
            detail="Null bytes detected in first 8KB (binary content in text file)",
            failure_code="CONTENT_POLICY_VIOLATION",
            transient=False,
        )

    if content.startswith(b"\xef\xbb\xbf") or content.startswith(b"\xff\xfe"):
        return CheckResult(
            name="bounded_content",
            passed=False,
            detail="BOM marker detected at start of file",
            failure_code="CONTENT_POLICY_VIOLATION",
            transient=False,
        )

    try:
        text = content.decode("utf-8", errors="strict")
        lines = text.split("\n", 1)
        if lines and lines[0].strip() == "":
            return CheckResult(
                name="bounded_content",
                passed=False,
                detail="First line is empty",
                failure_code="CONTENT_POLICY_VIOLATION",
                transient=False,
            )
    except UnicodeDecodeError as e:
        return CheckResult(
            name="bounded_content",
            passed=False,
            detail=f"UTF-8 encoding error: {e}",
            failure_code="CONTENT_POLICY_VIOLATION",
            transient=False,
        )

    return CheckResult(
        name="bounded_content",
        passed=True,
        detail="Content inspection passed",
    )


async def run_all_checks(
    store: ObjectStore,
    object_key: str,
    expected_byte_size: int,
    display_filename: str,
    declared_content_type: str,
    client_checksum_sha256: Optional[str],
) -> ValidationResult:
    checks: List[CheckResult] = []
    server_checksum: Optional[str] = None
    failure_code: Optional[str] = None
    failure_details: Optional[Dict] = None
    transient = False

    result = check_extension(display_filename)
    checks.append(result)
    if not result.passed:
        return ValidationResult(
            passed=False,
            checks=checks,
            server_checksum_sha256=None,
            byte_size_verified=None,
            failure_code=result.failure_code,
            failure_details={"check": result.name, "detail": result.detail},
            transient=result.transient,
        )

    result = check_content_type(declared_content_type)
    checks.append(result)
    if not result.passed:
        return ValidationResult(
            passed=False,
            checks=checks,
            server_checksum_sha256=None,
            byte_size_verified=None,
            failure_code=result.failure_code,
            failure_details={"check": result.name, "detail": result.detail},
            transient=result.transient,
        )

    result = check_not_empty(expected_byte_size)
    checks.append(result)
    if not result.passed:
        return ValidationResult(
            passed=False,
            checks=checks,
            server_checksum_sha256=None,
            byte_size_verified=None,
            failure_code=result.failure_code,
            failure_details={"check": result.name, "detail": result.detail},
            transient=result.transient,
        )

    result = await check_object_exists(store, object_key)
    checks.append(result)
    if not result.passed:
        return ValidationResult(
            passed=False,
            checks=checks,
            server_checksum_sha256=None,
            byte_size_verified=None,
            failure_code=result.failure_code,
            failure_details={"check": result.name, "detail": result.detail},
            transient=result.transient,
        )

    result = await check_byte_size(store, object_key, expected_byte_size)
    checks.append(result)
    byte_size_verified = expected_byte_size if result.passed else None
    if not result.passed:
        return ValidationResult(
            passed=False,
            checks=checks,
            server_checksum_sha256=None,
            byte_size_verified=byte_size_verified,
            failure_code=result.failure_code,
            failure_details={"check": result.name, "detail": result.detail},
            transient=result.transient,
        )

    result = await check_checksum(store, object_key, client_checksum_sha256)
    checks.append(result)
    if result.passed and result.detail.startswith("Server checksum: "):
        server_checksum = result.detail.split("Server checksum: ", 1)[1].split(";", 1)[0]
    if not result.passed:
        return ValidationResult(
            passed=False,
            checks=checks,
            server_checksum_sha256=server_checksum,
            byte_size_verified=byte_size_verified,
            failure_code=result.failure_code,
            failure_details={"check": result.name, "detail": result.detail},
            transient=result.transient,
        )

    result = await check_bounded_content(store, object_key)
    checks.append(result)
    if not result.passed:
        return ValidationResult(
            passed=False,
            checks=checks,
            server_checksum_sha256=server_checksum,
            byte_size_verified=byte_size_verified,
            failure_code=result.failure_code,
            failure_details={"check": result.name, "detail": result.detail},
            transient=result.transient,
        )

    return ValidationResult(
        passed=True,
        checks=checks,
        server_checksum_sha256=server_checksum,
        byte_size_verified=byte_size_verified,
        failure_code=None,
        failure_details=None,
        transient=False,
    )
