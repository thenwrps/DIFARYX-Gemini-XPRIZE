"""Authenticated TypeScript-to-FastAPI boundary for Phase 2F.

The browser never supplies an accepted identity. The TypeScript server signs
the verified Phase 2E Google subject, request target, timestamp, and body
digest with a server-only HMAC secret. FastAPI then resolves that subject
through the existing PostgreSQL external-identity registry.
"""

from __future__ import annotations

import hashlib
import hmac
import os
import time
from dataclasses import dataclass
from typing import List
from uuid import UUID

from fastapi import Depends, Header, HTTPException, Request, status

from api.auth.models import UserMapping


MAX_CLOCK_SKEW_SECONDS = 300
SUBJECT_MAX_LENGTH = 512


@dataclass(frozen=True)
class InternalIdentity:
    provider: str
    subject: str
    mappings: List[UserMapping]


@dataclass(frozen=True)
class InternalTenantContext:
    provider: str
    subject: str
    organization_id: UUID
    organization_name: str
    user_id: UUID
    role: str


def _service_secret() -> bytes:
    value = os.environ.get("DIFARYX_INTERNAL_SERVICE_SECRET", "").strip()
    if len(value) < 32:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"errorCode": "PERSISTENCE_SERVICE_UNAVAILABLE", "message": "Persistence service unavailable"},
        )
    return value.encode("utf-8")


def _canonical_target(request: Request) -> str:
    query = request.url.query
    return request.url.path if not query else f"{request.url.path}?{query}"


def _canonical_message(
    *,
    timestamp: str,
    method: str,
    target: str,
    subject: str,
    body_digest: str,
) -> bytes:
    return "\n".join(
        (timestamp, method.upper(), target, subject, body_digest)
    ).encode("utf-8")


async def _resolve_identity_rows(subject: str):
    # Keep the cryptographic boundary importable for isolated verification;
    # database engine configuration is loaded only when identity resolution is
    # actually required.
    from api.db.bootstrap_identity import BootstrapIdentityRepository

    return await BootstrapIdentityRepository.resolve(
        provider_name="google",
        provider_subject=subject,
    )


async def require_internal_identity(
    request: Request,
    service_timestamp: str | None = Header(default=None, alias="X-DIFARYX-Service-Timestamp"),
    service_subject: str | None = Header(default=None, alias="X-DIFARYX-Service-Subject"),
    service_signature: str | None = Header(default=None, alias="X-DIFARYX-Service-Signature"),
) -> InternalIdentity:
    if not service_timestamp or not service_subject or not service_signature:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"errorCode": "INTERNAL_AUTH_REQUIRED", "message": "Internal authentication required"},
        )
    if (
        len(service_subject) > SUBJECT_MAX_LENGTH
        or not service_subject.strip()
        or any(ord(character) < 32 for character in service_subject)
        or len(service_signature) != 64
        or any(character not in "0123456789abcdefABCDEF" for character in service_signature)
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"errorCode": "INTERNAL_AUTH_INVALID", "message": "Internal authentication invalid"},
        )
    try:
        timestamp_value = int(service_timestamp)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"errorCode": "INTERNAL_AUTH_INVALID", "message": "Internal authentication invalid"},
        ) from exc
    if abs(int(time.time()) - timestamp_value) > MAX_CLOCK_SKEW_SECONDS:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"errorCode": "INTERNAL_AUTH_EXPIRED", "message": "Internal authentication expired"},
        )

    body = await request.body()
    body_digest = hashlib.sha256(body).hexdigest()
    expected = hmac.new(
        _service_secret(),
        _canonical_message(
            timestamp=service_timestamp,
            method=request.method,
            target=_canonical_target(request),
            subject=service_subject,
            body_digest=body_digest,
        ),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected, service_signature.lower()):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"errorCode": "INTERNAL_AUTH_INVALID", "message": "Internal authentication invalid"},
        )

    try:
        rows = await _resolve_identity_rows(service_subject.strip())
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"errorCode": "DATABASE_UNAVAILABLE", "message": "Identity resolution unavailable"},
        ) from exc
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"errorCode": "ACCOUNT_NOT_PROVISIONED", "message": "Account is not provisioned"},
        )

    mappings = [
        UserMapping(
            organization_id=row["organization_id"],
            organization_name=row["organization_name"],
            user_id=row["user_id"],
            email=row["email"],
            user_display_name=row["user_display_name"],
            role=row["role"],
        )
        for row in rows
    ]
    return InternalIdentity(provider="google", subject=service_subject.strip(), mappings=mappings)


async def require_internal_tenant(
    identity: InternalIdentity = Depends(require_internal_identity),
    active_organization: str | None = Header(default=None, alias="Active-Organization"),
) -> InternalTenantContext:
    if not active_organization:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"errorCode": "ORGANIZATION_REQUIRED", "message": "Active organization is required"},
        )
    try:
        organization_id = UUID(active_organization.strip())
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"errorCode": "INVALID_ORGANIZATION", "message": "Active organization is invalid"},
        ) from exc
    mapping = next(
        (item for item in identity.mappings if item.organization_id == organization_id),
        None,
    )
    if mapping is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"errorCode": "ORGANIZATION_ACCESS_DENIED", "message": "Organization access denied"},
        )
    return InternalTenantContext(
        provider=identity.provider,
        subject=identity.subject,
        organization_id=mapping.organization_id,
        organization_name=mapping.organization_name,
        user_id=mapping.user_id,
        role=mapping.role,
    )
