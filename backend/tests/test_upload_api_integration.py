import os
import sys
import unittest
import asyncio
import hashlib
from datetime import datetime, timezone, timedelta
from uuid import UUID, uuid4
from httpx import AsyncClient, ASGITransport
import sqlalchemy as sa

# Setup pathing
_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(_HERE, "../.."))
sys.path.insert(0, os.path.join(_HERE, ".."))
sys.path.insert(0, os.path.join(_HERE, "../../server/python"))

# Load .env.test.local programmatically if it exists
env_path = os.path.abspath(os.path.join(_HERE, "../../.env.test.local"))
if os.path.exists(env_path):
    with open(env_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ[k.strip()] = v.strip()

# Configure test environment before importing settings/app
os.environ["AUTH_PROVIDER"] = "test"
os.environ["APP_ENV"] = "test"
if os.getenv("DIFARYX_API_TEST_DATABASE_URL"):
    os.environ["DATABASE_URL"] = os.getenv("DIFARYX_API_TEST_DATABASE_URL")

# Configure selector loop policy on Windows
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from api.gateway import app
from api.db.engine import create_async_engine
from api.db.settings import settings
from api.db.uow import UnitOfWork

# Database URL environments
BOOTSTRAP_URL = os.getenv("DIFARYX_BOOTSTRAP_DATABASE_URL")
API_TEST_URL = os.getenv("DIFARYX_API_TEST_DATABASE_URL")


class TestUploadAPIIntegration(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self):
        # 1. Reset and Bootstrap DB to clean state
        os.environ["DIFARYX_ALLOW_TEST_DB_RESET"] = "YES"
        from tests.bootstrap_db import bootstrap
        from tests.prepare_test_environment import main as prepare_env
        bootstrap()
        prepare_env()

        # Force TestTokenVerifier dependency override
        from api.auth.dependencies import get_token_verifier
        from api.auth.verifier import TestTokenVerifier
        app.dependency_overrides[get_token_verifier] = lambda: TestTokenVerifier("test")

        url = BOOTSTRAP_URL
        if url.startswith("postgresql://"):
            url = "postgresql+psycopg://" + url[len("postgresql://"):]
        self.su_engine = create_async_engine(url)

        # Mapped test UUIDs
        self.org_a_id = "aaaaaaaa-0000-0000-0000-000000000001"
        self.org_b_id = "bbbbbbbb-0000-0000-0000-000000000002"
        self.user_a1_id = "11111111-0000-0000-0000-000000000001"
        self.user_a3_id = "11111111-0000-0000-0000-000000000003"  # Reviewer on Project A
        self.user_admin_id = "11111111-0000-0000-0000-000000000004"
        self.user_b1_id = "11111111-0000-0000-0000-000000000005"

        self.project_a_id = "aaaa2222-0000-0000-0000-000000000001"
        self.project_b_id = "bbbb2222-0000-0000-0000-000000000002"

        # Seed initial organizations, users, memberships, auth_identities, projects, and memberships
        async with self.su_engine.connect() as conn:
            # Seed Orgs
            await conn.execute(sa.text("""
                INSERT INTO identity.organizations (id, slug, display_name, plan_tier, is_active)
                VALUES 
                    (:org_a, 'org-a', 'Organization A', 'free', true),
                    (:org_b, 'org-b', 'Organization B', 'free', true)
            """), {"org_a": self.org_a_id, "org_b": self.org_b_id})

            # Seed Users
            await conn.execute(sa.text("""
                INSERT INTO identity.users (id, organization_id, email, display_name, is_active)
                VALUES
                    (:u_a1, :org_a, 'a1@test.com', 'User A1', true),
                    (:u_a3, :org_a, 'a3@test.com', 'User A3', true),
                    (:u_admin, :org_a, 'admin@test.com', 'User Admin', true),
                    (:u_b1, :org_b, 'b1@test.com', 'User B1', true)
            """), {
                "u_a1": self.user_a1_id,
                "u_a3": self.user_a3_id,
                "u_admin": self.user_admin_id,
                "u_b1": self.user_b1_id,
                "org_a": self.org_a_id,
                "org_b": self.org_b_id
            })

            # Seed Org Memberships
            await conn.execute(sa.text("""
                INSERT INTO identity.memberships (id, organization_id, user_id, role)
                VALUES
                    (uuid_generate_v4(), :org_a, :u_a1, 'member'),
                    (uuid_generate_v4(), :org_a, :u_a3, 'member'),
                    (uuid_generate_v4(), :org_a, :u_admin, 'admin'),
                    (uuid_generate_v4(), :org_b, :u_b1, 'member')
            """), {
                "u_a1": self.user_a1_id,
                "u_a3": self.user_a3_id,
                "u_admin": self.user_admin_id,
                "u_b1": self.user_b1_id,
                "org_a": self.org_a_id,
                "org_b": self.org_b_id
            })

            # Seed Auth Identities
            await conn.execute(sa.text("""
                INSERT INTO identity.auth_identities (provider_name, provider_subject, organization_id, user_id)
                VALUES
                    ('firebase', 'sub-a1', :org_a, :u_a1),
                    ('firebase', 'sub-a3', :org_a, :u_a3),
                    ('firebase', 'sub-admin', :org_a, :u_admin),
                    ('firebase', 'sub-b1', :org_b, :u_b1)
            """), {
                "org_a": self.org_a_id,
                "org_b": self.org_b_id,
                "u_a1": self.user_a1_id,
                "u_a3": self.user_a3_id,
                "u_admin": self.user_admin_id,
                "u_b1": self.user_b1_id
            })

            # Seed Projects
            await conn.execute(sa.text("""
                INSERT INTO science.projects (organization_id, id, owner_user_id, title)
                VALUES
                    (:org_a, :p_a, :u_a1, 'Project A'),
                    (:org_b, :p_b, :u_b1, 'Project B')
            """), {
                "org_a": self.org_a_id,
                "org_b": self.org_b_id,
                "p_a": self.project_a_id,
                "p_b": self.project_b_id,
                "u_a1": self.user_a1_id,
                "u_b1": self.user_b1_id
            })

            # Seed Project Memberships
            await conn.execute(sa.text("""
                INSERT INTO science.project_memberships (organization_id, project_id, user_id, role)
                VALUES
                    (:org_a, :p_a, :u_a1, 'lead'),
                    (:org_a, :p_a, :u_a3, 'reviewer')
            """), {
                "org_a": self.org_a_id,
                "p_a": self.project_a_id,
                "u_a1": self.user_a1_id,
                "u_a3": self.user_a3_id
            })

            # Seed Quota Ledgers (Storage)
            await conn.execute(sa.text("""
                INSERT INTO governance.quota_ledger (organization_id, quota_type, quota_period, period_start, period_end, allocated)
                VALUES
                    (:org_a, 'storage', 'lifetime', '2020-01-01', '9999-12-31', 10000000),
                    (:org_b, 'storage', 'lifetime', '2020-01-01', '9999-12-31', 10) -- Org B only has 10 bytes quota
            """), {"org_a": self.org_a_id, "org_b": self.org_b_id})

            await conn.commit()

    async def asyncTearDown(self):
        app.dependency_overrides.clear()
        await self.su_engine.dispose()

    def _auth_header(self, subject: str) -> dict:
        return {"Authorization": f"Bearer mock:firebase|{subject}|ignore@ignore.com"}

    async def test_e2e_ingestion_happy_path(self):
        headers = self._auth_header("sub-a1")
        headers["Active-Organization"] = self.org_a_id

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            # 1. Initiate Upload
            init_res = await ac.post(
                "/api/v1/datasets/upload/initiate",
                headers=headers,
                json={
                    "project_id": self.project_a_id,
                    "technique": "xrd",
                    "display_filename": "spinel.csv",
                    "declared_content_type": "text/csv",
                    "byte_size": 25,
                    "idempotency_key": "happy-idem",
                }
            )
            self.assertEqual(init_res.status_code, 201)
            init_data = init_res.json()
            session_id = init_data["uploadSessionId"]
            dataset_id = init_data["datasetId"]

            # 2. Stream PUT file chunks
            content = b"hello world from Spinel!!" # Exactly 25 bytes
            stream_res = await ac.put(
                f"/api/v1/datasets/upload/{session_id}/stream",
                headers={
                    **headers,
                    "Content-Length": str(len(content)),
                    "Content-Type": "application/octet-stream",
                },
                content=content,
            )
            self.assertEqual(stream_res.status_code, 200, msg=f"Streaming failed: {stream_res.status_code} - {stream_res.text}")

            # 3. Finalize Upload
            finalize_res = await ac.post(
                f"/api/v1/datasets/upload/{session_id}/finalize",
                headers=headers,
            )
            self.assertEqual(finalize_res.status_code, 200)
            finalize_data = finalize_res.json()
            self.assertEqual(finalize_data["datasetStatus"], "pending_validation")

            # 4. Assert validation_attempts row exists with queued status and NULL lock_expires_at
            async with self.su_engine.connect() as conn:
                result = await conn.execute(sa.text("""
                    SELECT status, lock_expires_at, attempt_number
                    FROM science.validation_attempts
                    WHERE dataset_id = :ds_id
                """), {"ds_id": dataset_id})
                row = result.fetchone()
                self.assertIsNotNone(row)
                self.assertEqual(row[0], "queued")
                self.assertIsNone(row[1])

                digest_result = await conn.execute(sa.text("""
                    SELECT o.byte_size, o.authoritative_sha256
                    FROM science.dataset_objects o
                    WHERE o.dataset_id = :ds_id AND o.object_role = 'original'
                """), {"ds_id": dataset_id})
                digest_row = digest_result.fetchone()
                self.assertIsNotNone(digest_row)
                self.assertEqual(digest_row[0], len(content))
                self.assertEqual(digest_row[1], hashlib.sha256(content).hexdigest())

    async def test_initiate_idempotency(self):
        headers = self._auth_header("sub-a1")
        headers["Active-Organization"] = self.org_a_id

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            payload = {
                "project_id": self.project_a_id,
                "technique": "xrd",
                "display_filename": "spinel.csv",
                "declared_content_type": "text/csv",
                "byte_size": 25,
                "idempotency_key": "idem-key-reuse",
            }
            res1 = await ac.post("/api/v1/datasets/upload/initiate", headers=headers, json=payload)
            self.assertEqual(res1.status_code, 201)

            # Reusing same key and parameters -> idempotent 201
            res2 = await ac.post("/api/v1/datasets/upload/initiate", headers=headers, json=payload)
            self.assertEqual(res2.status_code, 201)
            self.assertEqual(res1.json()["uploadSessionId"], res2.json()["uploadSessionId"])

            # Reusing same key but conflicting parameters -> 409 conflict
            payload_conflict = {**payload, "byte_size": 500}
            res3 = await ac.post("/api/v1/datasets/upload/initiate", headers=headers, json=payload_conflict)
            self.assertEqual(res3.status_code, 409)
            self.assertEqual(res3.json()["detail"]["errorCode"], "IDEMPOTENCY_CONFLICT")

    async def test_quota_exceeded(self):
        headers = self._auth_header("sub-b1")
        headers["Active-Organization"] = self.org_b_id

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            res = await ac.post(
                "/api/v1/datasets/upload/initiate",
                headers=headers,
                json={
                    "project_id": self.project_b_id,
                    "technique": "xrd",
                    "display_filename": "spinel.csv",
                    "declared_content_type": "text/csv",
                    "byte_size": 25, # Org B only has 10 bytes quota
                    "idempotency_key": "quota-idem",
                }
            )
            self.assertEqual(res.status_code, 413) # STORAGE_QUOTA_EXCEEDED maps to 413
            self.assertEqual(res.json()["detail"]["errorCode"], "STORAGE_QUOTA_EXCEEDED")

    async def test_lazy_quota_cleanup(self):
        headers = self._auth_header("sub-a1")
        headers["Active-Organization"] = self.org_a_id

        session_id = uuid4()
        dataset_id = uuid4()
        reservation_id = uuid4()

        # Seed an expired session for Org A with active quota reservation
        async with self.su_engine.connect() as conn:
            # First seed reservation
            await conn.execute(sa.text("""
                INSERT INTO governance.quota_reservations (id, organization_id, quota_ledger_id, project_id, created_by, reservation_key, resource_type, reserved_amount, created_at, expires_at)
                VALUES (
                    :res_id, :org_id,
                    (SELECT id FROM governance.quota_ledger WHERE organization_id = :org_id AND quota_type = 'storage'),
                    :proj_id, :user_id, 'test-res-key', 'storage_upload', 100, NOW() - INTERVAL '2 hours', NOW() - INTERVAL '1 hour'
                )
            """), {
                "res_id": reservation_id,
                "org_id": self.org_a_id,
                "proj_id": self.project_a_id,
                "user_id": self.user_a1_id
            })

            # Update ledger to record reservation
            await conn.execute(sa.text("""
                UPDATE governance.quota_ledger
                SET reserved = reserved + 100
                WHERE organization_id = :org_id
            """), {"org_id": self.org_a_id})

            # Seed dataset
            await conn.execute(sa.text("""
                INSERT INTO science.datasets (id, organization_id, project_id, technique, display_filename, declared_content_type, byte_size, dataset_status, created_by)
                VALUES (:ds_id, :org_id, :proj_id, 'xrd', 'expired.csv', 'text/csv', 100, 'allocated', :user_id)
            """), {
                "ds_id": dataset_id,
                "org_id": self.org_a_id,
                "proj_id": self.project_a_id,
                "user_id": self.user_a1_id
            })

            # Seed expired upload session
            await conn.execute(sa.text("""
                INSERT INTO science.upload_sessions (id, organization_id, dataset_id, created_by, object_key, expected_byte_size, storage_provider, session_status, idempotency_key, request_fingerprint, quota_reservation_id, created_at, expires_at)
                VALUES (:us_id, :org_id, :ds_id, :user_id, 'test/expired.csv', 100, 'local', 'allocated', 'expired-idem', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', :res_id, NOW() - INTERVAL '2 hours', NOW() - INTERVAL '1 hour')
            """), {
                "us_id": session_id,
                "org_id": self.org_a_id,
                "ds_id": dataset_id,
                "user_id": self.user_a1_id,
                "res_id": reservation_id
            })
            await conn.commit()

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            # Initiate a new upload session -> triggers lazy cleanup
            res = await ac.post(
                "/api/v1/datasets/upload/initiate",
                headers=headers,
                json={
                    "project_id": self.project_a_id,
                    "technique": "xrd",
                    "display_filename": "spinel2.csv",
                    "declared_content_type": "text/csv",
                    "byte_size": 50,
                    "idempotency_key": "lazy-clean-trigger",
                }
            )
            self.assertEqual(res.status_code, 201)

            # Assert old session was transitioned to 'expired' and reservation released
            async with self.su_engine.connect() as conn:
                sess_res = await conn.execute(sa.text("""
                    SELECT session_status FROM science.upload_sessions WHERE id = :us_id
                """), {"us_id": session_id})
                sess_row = sess_res.fetchone()
                self.assertEqual(sess_row[0], "expired")

                res_res = await conn.execute(sa.text("""
                    SELECT status FROM governance.quota_reservations WHERE id = :res_id
                """), {"res_id": reservation_id})
                res_row = res_res.fetchone()
                self.assertEqual(res_row[0], "released")

    async def test_rls_and_project_boundaries(self):
        # 1. User B1 attempts to initiate upload on Org A's project (Project A)
        headers_b1 = self._auth_header("sub-b1")
        headers_b1["Active-Organization"] = self.org_b_id

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            res = await ac.post(
                "/api/v1/datasets/upload/initiate",
                headers=headers_b1,
                json={
                    "project_id": self.project_a_id, # Org A's project
                    "technique": "xrd",
                    "display_filename": "spinel.csv",
                    "declared_content_type": "text/csv",
                    "byte_size": 25,
                    "idempotency_key": "cross-org-idem",
                }
            )
            # RLS makes Project A invisible -> Project not found -> 404 (DatasetNotFoundError)
            self.assertEqual(res.status_code, 404)
            self.assertEqual(res.json()["detail"]["errorCode"], "DATASET_NOT_FOUND")

        # 2. User A3 (Reviewer on Project A) attempts to write -> 403 Forbidden
        headers_a3 = self._auth_header("sub-a3")
        headers_a3["Active-Organization"] = self.org_a_id

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            res2 = await ac.post(
                "/api/v1/datasets/upload/initiate",
                headers=headers_a3,
                json={
                    "project_id": self.project_a_id,
                    "technique": "xrd",
                    "display_filename": "spinel.csv",
                    "declared_content_type": "text/csv",
                    "byte_size": 25,
                    "idempotency_key": "reviewer-idem",
                }
            )
            self.assertEqual(res2.status_code, 403)
            self.assertEqual(res2.json()["detail"]["errorCode"], "ORGANIZATION_ACCESS_DENIED")

    async def test_session_expiry_enforcement(self):
        headers = self._auth_header("sub-a1")
        headers["Active-Organization"] = self.org_a_id

        session_id = uuid4()
        dataset_id = uuid4()
        reservation_id = uuid4()

        # Seed expired upload session in 'allocated' status
        async with self.su_engine.connect() as conn:
            await conn.execute(sa.text("""
                INSERT INTO governance.quota_reservations (id, organization_id, quota_ledger_id, project_id, created_by, reservation_key, resource_type, reserved_amount, created_at, expires_at)
                VALUES (
                    :res_id, :org_id,
                    (SELECT id FROM governance.quota_ledger WHERE organization_id = :org_id AND quota_type = 'storage'),
                    :proj_id, :user_id, 'test-exp-key', 'storage_upload', 25, NOW() - INTERVAL '2 hours', NOW() - INTERVAL '1 hour'
                )
            """), {
                "res_id": reservation_id,
                "org_id": self.org_a_id,
                "proj_id": self.project_a_id,
                "user_id": self.user_a1_id
            })
            # Update ledger to record reservation
            await conn.execute(sa.text("""
                UPDATE governance.quota_ledger
                SET reserved = reserved + 25
                WHERE organization_id = :org_id
            """), {"org_id": self.org_a_id})

            # Seed dataset
            await conn.execute(sa.text("""
                INSERT INTO science.datasets (id, organization_id, project_id, technique, display_filename, declared_content_type, byte_size, dataset_status, created_by)
                VALUES (:ds_id, :org_id, :proj_id, 'xrd', 'exp_force.csv', 'text/csv', 25, 'allocated', :user_id)
            """), {
                "ds_id": dataset_id,
                "org_id": self.org_a_id,
                "proj_id": self.project_a_id,
                "user_id": self.user_a1_id
            })

            await conn.execute(sa.text("""
                INSERT INTO science.upload_sessions (id, organization_id, dataset_id, created_by, object_key, expected_byte_size, storage_provider, session_status, idempotency_key, request_fingerprint, quota_reservation_id, created_at, expires_at)
                VALUES (:us_id, :org_id, :ds_id, :user_id, 'test/exp_force.csv', 25, 'local', 'allocated', 'exp-force-idem', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', :res_id, NOW() - INTERVAL '2 hours', NOW() - INTERVAL '1 hour')
            """), {
                "us_id": session_id,
                "org_id": self.org_a_id,
                "ds_id": dataset_id,
                "user_id": self.user_a1_id,
                "res_id": reservation_id
            })
            await conn.commit()

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            # 1. Attempt to stream to expired session -> assert 410 Gone
            stream_res = await ac.put(
                f"/api/v1/datasets/upload/{session_id}/stream",
                headers={
                    **headers,
                    "Content-Length": "25",
                    "Content-Type": "application/octet-stream",
                },
                content=b"hello world from Expired!",
            )
            self.assertEqual(stream_res.status_code, 410)
            self.assertEqual(stream_res.json()["detail"]["errorCode"], "UPLOAD_SESSION_EXPIRED")

        # Update status to 'uploaded' but expired to test finalize expiry check
        async with self.su_engine.connect() as conn:
            await conn.execute(sa.text("""
                UPDATE science.upload_sessions SET session_status = 'uploaded' WHERE id = :us_id
            """), {"us_id": session_id})
            await conn.commit()

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            # 2. Attempt to finalize expired session -> assert 410 Gone
            finalize_res = await ac.post(
                f"/api/v1/datasets/upload/{session_id}/finalize",
                headers=headers,
            )
            self.assertEqual(finalize_res.status_code, 410)
            self.assertEqual(finalize_res.json()["detail"]["errorCode"], "UPLOAD_SESSION_EXPIRED")

    async def test_stream_cap_enforcement(self):
        headers = self._auth_header("sub-a1")
        headers["Active-Organization"] = self.org_a_id

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            # 1. Initiate with declared size of 10 bytes
            init_res = await ac.post(
                "/api/v1/datasets/upload/initiate",
                headers=headers,
                json={
                    "project_id": self.project_a_id,
                    "technique": "xrd",
                    "display_filename": "spinel_small.csv",
                    "declared_content_type": "text/csv",
                    "byte_size": 10,
                    "idempotency_key": "stream-cap-idem",
                }
            )
            print(f"DEBUG: init_res status: {init_res.status_code}, body: {init_res.json()}")
            self.assertEqual(init_res.status_code, 201)
            session_id = init_res.json()["uploadSessionId"]

            # 2. Stream more than 10 bytes -> raises 413 (StagingOverflowAPIError)
            stream_res = await ac.put(
                f"/api/v1/datasets/upload/{session_id}/stream",
                headers={
                    **headers,
                    "Content-Length": "20",
                    "Content-Type": "application/octet-stream",
                },
                content=b"hello world long content!", # More than 10 bytes
            )
            self.assertEqual(stream_res.status_code, 413, msg=f"Streaming failed: {stream_res.status_code} - {stream_res.text}")
            self.assertEqual(stream_res.json()["detail"]["errorCode"], "STAGING_OVERFLOW")

    async def test_double_finalize_and_mismatch(self):
        headers = self._auth_header("sub-a1")
        headers["Active-Organization"] = self.org_a_id

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            # 1. Seed two sessions on Project A but for DIFFERENT datasets
            init1 = await ac.post(
                "/api/v1/datasets/upload/initiate",
                headers=headers,
                json={
                    "project_id": self.project_a_id,
                    "technique": "xrd",
                    "display_filename": "spinel1.csv",
                    "declared_content_type": "text/csv",
                    "byte_size": 25,
                    "idempotency_key": "double-fin-idem1",
                }
            )
            self.assertEqual(init1.status_code, 201)
            s1_id = init1.json()["uploadSessionId"]
            ds1_id = init1.json()["datasetId"]

            # Stream & Finalize s1
            await ac.put(
                f"/api/v1/datasets/upload/{s1_id}/stream",
                headers={**headers, "Content-Length": "25", "Content-Type": "application/octet-stream"},
                content=b"hello world from spinel 1",
            )
            fin1 = await ac.post(f"/api/v1/datasets/upload/{s1_id}/finalize", headers=headers)
            self.assertEqual(fin1.status_code, 200)

            # Double finalize s1 (idempotent 200 via session state machine)
            fin2 = await ac.post(f"/api/v1/datasets/upload/{s1_id}/finalize", headers=headers)
            self.assertEqual(fin2.status_code, 200)
            self.assertEqual(fin2.json()["datasetStatus"], "pending_validation")

            # 2. Seed a second session s2 for the SAME dataset (ds1_id)
            # Create a session row manually for the same dataset in DB
            session_id_s2 = uuid4()
            async with self.su_engine.connect() as conn:
                # Need reservation first
                res_id = uuid4()
                await conn.execute(sa.text("""
                    INSERT INTO governance.quota_reservations (id, organization_id, quota_ledger_id, project_id, created_by, reservation_key, resource_type, reserved_amount, expires_at)
                    VALUES (
                        :res_id, :org_id,
                        (SELECT id FROM governance.quota_ledger WHERE organization_id = :org_id AND quota_type = 'storage'),
                        :proj_id, :user_id, 'test-res-s2', 'storage_upload', 25, NOW() + INTERVAL '1 hour'
                    )
                """), {
                    "res_id": res_id,
                    "org_id": self.org_a_id,
                    "proj_id": self.project_a_id,
                    "user_id": self.user_a1_id
                })
                # Seed upload session row linked to ds1_id
                await conn.execute(sa.text("""
                    INSERT INTO science.upload_sessions (id, organization_id, dataset_id, created_by, object_key, expected_byte_size, storage_provider, session_status, idempotency_key, request_fingerprint, quota_reservation_id, expires_at)
                    VALUES (:us_id, :org_id, :ds_id, :user_id, 'datasets/s2.csv', 25, 'local', 'uploaded', 's2-idem', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', :res_id, NOW() + INTERVAL '1 hour')
                """), {
                    "us_id": session_id_s2,
                    "org_id": self.org_a_id,
                    "ds_id": ds1_id,
                    "user_id": self.user_a1_id,
                    "res_id": res_id
                })
                await conn.commit()

            # Attempt to finalize s2 on ds1_id -> raises 409 because ds1_id already has an original object
            # (handled by catching IntegrityError as backstop in finalize_upload)
            fin3 = await ac.post(f"/api/v1/datasets/upload/{session_id_s2}/finalize", headers=headers)
            self.assertEqual(fin3.status_code, 409)
            self.assertEqual(fin3.json()["detail"]["errorCode"], "DATASET_STATE_CONFLICT")

    async def test_dataset_metadata_list_detail_and_reviewer_read(self):
        headers_lead = self._auth_header("sub-a1")
        headers_lead["Active-Organization"] = self.org_a_id

        headers_reviewer = self._auth_header("sub-a3")
        headers_reviewer["Active-Organization"] = self.org_a_id

        headers_org_b = self._auth_header("sub-b1")
        headers_org_b["Active-Organization"] = self.org_b_id

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            # 1. Initiate Upload as Lead
            init_res = await ac.post(
                "/api/v1/datasets/upload/initiate",
                headers=headers_lead,
                json={
                    "project_id": self.project_a_id,
                    "technique": "xrd",
                    "display_filename": "spinel_test_detail.csv",
                    "declared_content_type": "text/csv",
                    "byte_size": 25,
                    "idempotency_key": "detail-idem-key-1",
                }
            )
            self.assertEqual(init_res.status_code, 201)
            session_id = init_res.json()["uploadSessionId"]
            dataset_id = init_res.json()["datasetId"]

            # 2. Check detail before streaming (should be allocated/not_started)
            detail_res = await ac.get(f"/api/v1/datasets/{dataset_id}", headers=headers_lead)
            self.assertEqual(detail_res.status_code, 200)
            db = detail_res.json()
            self.assertEqual(db["datasetStatus"], "allocated")
            self.assertEqual(db["uploadStatus"], "allocated")
            self.assertEqual(db["objectPresent"], False)
            self.assertEqual(db["validationStatus"], "not_started")

            # 3. Stream data
            stream_res = await ac.put(
                f"/api/v1/datasets/upload/{session_id}/stream",
                headers={
                    **headers_lead,
                    "Content-Length": "25",
                    "Content-Type": "application/octet-stream",
                },
                content=b"hello world from spinel 2",
            )
            self.assertEqual(stream_res.status_code, 200)

            # 4. Finalize upload
            fin_res = await ac.post(f"/api/v1/datasets/upload/{session_id}/finalize", headers=headers_lead)
            self.assertEqual(fin_res.status_code, 200)

            # 5. Get detail after finalization (should be pending_validation/finalized/pending)
            detail_res2 = await ac.get(f"/api/v1/datasets/{dataset_id}", headers=headers_lead)
            self.assertEqual(detail_res2.status_code, 200)
            db2 = detail_res2.json()
            self.assertEqual(db2["datasetStatus"], "pending_validation")
            self.assertEqual(db2["uploadStatus"], "finalized")
            self.assertEqual(db2["objectPresent"], True)
            self.assertEqual(db2["validationStatus"], "pending")

            # 6. List datasets for Project A as Lead (should contain this dataset)
            list_res = await ac.get(f"/api/v1/datasets?projectId={self.project_a_id}", headers=headers_lead)
            self.assertEqual(list_res.status_code, 200)
            items = list_res.json()["items"]
            self.assertTrue(any(item["id"] == str(dataset_id) for item in items))

            # 7. Get detail as Reviewer (should be permitted with status 200)
            detail_res_rev = await ac.get(f"/api/v1/datasets/{dataset_id}", headers=headers_reviewer)
            self.assertEqual(detail_res_rev.status_code, 200)
            self.assertEqual(detail_res_rev.json()["id"], str(dataset_id))

            # 8. List datasets as Reviewer (should be permitted with status 200)
            list_res_rev = await ac.get(f"/api/v1/datasets?projectId={self.project_a_id}", headers=headers_reviewer)
            self.assertEqual(list_res_rev.status_code, 200)
            self.assertTrue(any(item["id"] == str(dataset_id) for item in list_res_rev.json()["items"]))

            # 9. Get detail as Org B user (should be rejected/not found -> 404)
            detail_res_org_b = await ac.get(f"/api/v1/datasets/{dataset_id}", headers=headers_org_b)
            self.assertEqual(detail_res_org_b.status_code, 404)


if __name__ == "__main__":
    unittest.main()
