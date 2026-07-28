from __future__ import annotations

import hashlib
import hmac
import os
from pathlib import Path
import sys
import time
import unittest
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException
from starlette.requests import Request


sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "server" / "python"))
from api.phase2f.internal_auth import (  # noqa: E402
    InternalIdentity,
    _canonical_message,
    require_internal_identity,
    require_internal_tenant,
)
from api.auth.models import UserMapping  # noqa: E402


SECRET = "phase2f-internal-auth-test-secret-at-least-32-characters"
SUBJECT = "verified-google-subject"


def request_with_body(body: bytes) -> Request:
    sent = False

    async def receive():
        nonlocal sent
        if sent:
            return {"type": "http.request", "body": b"", "more_body": False}
        sent = True
        return {"type": "http.request", "body": body, "more_body": False}

    return Request(
        {
            "type": "http",
            "http_version": "1.1",
            "method": "POST",
            "scheme": "https",
            "server": ("persistence.example.test", 443),
            "client": ("127.0.0.1", 10000),
            "root_path": "",
            "path": "/internal/phase2f/projects",
            "raw_path": b"/internal/phase2f/projects",
            "query_string": b"limit=50",
            "headers": [],
        },
        receive,
    )


def signature(timestamp: str, body: bytes) -> str:
    message = _canonical_message(
        timestamp=timestamp,
        method="POST",
        target="/internal/phase2f/projects?limit=50",
        subject=SUBJECT,
        body_digest=hashlib.sha256(body).hexdigest(),
    )
    return hmac.new(SECRET.encode("utf-8"), message, hashlib.sha256).hexdigest()


class Phase2FInternalAuthTests(unittest.IsolatedAsyncioTestCase):
    async def test_accepts_signed_verified_subject_and_resolves_server_mapping(self) -> None:
        body = b'{"title":"Persistent project"}'
        timestamp = str(int(time.time()))
        mapping = {
            "organization_id": "11111111-1111-4111-8111-111111111111",
            "organization_name": "dFRYX lab",
            "user_id": "22222222-2222-4222-8222-222222222222",
            "email": "researcher@example.test",
            "user_display_name": "Researcher",
            "role": "owner",
        }
        with (
            patch.dict(os.environ, {"DIFARYX_INTERNAL_SERVICE_SECRET": SECRET}),
            patch(
                "api.phase2f.internal_auth._resolve_identity_rows",
                new=AsyncMock(return_value=[mapping]),
            ) as resolve,
        ):
            identity = await require_internal_identity(
                request_with_body(body),
                service_timestamp=timestamp,
                service_subject=SUBJECT,
                service_signature=signature(timestamp, body),
            )
        self.assertEqual(identity.subject, SUBJECT)
        self.assertEqual(len(identity.mappings), 1)
        resolve.assert_awaited_once_with(SUBJECT)

    async def test_rejects_invalid_signature_before_identity_resolution(self) -> None:
        body = b"{}"
        timestamp = str(int(time.time()))
        resolver = AsyncMock(return_value=[])
        with (
            patch.dict(os.environ, {"DIFARYX_INTERNAL_SERVICE_SECRET": SECRET}),
            patch(
                "api.phase2f.internal_auth._resolve_identity_rows",
                new=resolver,
            ),
            self.assertRaises(HTTPException) as raised,
        ):
            await require_internal_identity(
                request_with_body(body),
                service_timestamp=timestamp,
                service_subject=SUBJECT,
                service_signature="0" * 64,
            )
        self.assertEqual(raised.exception.status_code, 401)
        resolver.assert_not_awaited()

    async def test_rejects_expired_service_timestamp(self) -> None:
        body = b"{}"
        timestamp = str(int(time.time()) - 301)
        with (
            patch.dict(os.environ, {"DIFARYX_INTERNAL_SERVICE_SECRET": SECRET}),
            self.assertRaises(HTTPException) as raised,
        ):
            await require_internal_identity(
                request_with_body(body),
                service_timestamp=timestamp,
                service_subject=SUBJECT,
                service_signature=signature(timestamp, body),
            )
        self.assertEqual(raised.exception.status_code, 401)
        self.assertEqual(raised.exception.detail["errorCode"], "INTERNAL_AUTH_EXPIRED")

    async def test_rejects_forged_active_organization_outside_verified_memberships(self) -> None:
        identity = InternalIdentity(
            provider="google",
            subject=SUBJECT,
            mappings=[
                UserMapping(
                    organization_id="11111111-1111-4111-8111-111111111111",
                    organization_name="Organization A",
                    user_id="22222222-2222-4222-8222-222222222222",
                    email="researcher@example.test",
                    user_display_name="Researcher",
                    role="owner",
                )
            ],
        )
        with self.assertRaises(HTTPException) as raised:
            await require_internal_tenant(
                identity=identity,
                active_organization="33333333-3333-4333-8333-333333333333",
            )
        self.assertEqual(raised.exception.status_code, 403)
        self.assertEqual(
            raised.exception.detail["errorCode"],
            "ORGANIZATION_ACCESS_DENIED",
        )


if __name__ == "__main__":
    unittest.main()
