import asyncio
import os
import sys
import unittest
import uuid

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
import psycopg2

# Load .env.test.local programmatically if it exists
_HERE = os.path.dirname(os.path.abspath(__file__))
env_path = os.path.abspath(os.path.join(_HERE, "../../.env.test.local"))
if os.path.exists(env_path):
    with open(env_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ[k.strip()] = v.strip()

BOOTSTRAP_URL = os.getenv(
    "DIFARYX_BOOTSTRAP_DATABASE_URL",
    "postgresql://postgres:difaryx_dev_pw@127.0.0.1:5432/difaryx_phase0_test"
)
TEST_DB_URL = os.getenv(
    "DIFARYX_WORKER_TEST_DATABASE_URL",
    "postgresql+psycopg://difaryx_worker_login:difaryx_worker_pw@127.0.0.1:5432/difaryx_phase0_test"
)
if TEST_DB_URL.startswith("postgresql://"):
    TEST_DB_URL = "postgresql+psycopg://" + TEST_DB_URL[len("postgresql://"):]


def seed_org_with_attempt(super_conn, org_id, user_id, test_inst=None, worker_id=None):
    if test_inst is not None and hasattr(test_inst, "seeded_orgs"):
        test_inst.seeded_orgs.append(org_id)
    ds_id = f"{org_id[:8]}-0000-0000-0000-000000000000"
    obj_id = f"{org_id[:8]}-0001-0000-0000-000000000000"
    proj_id = f"{org_id[:8]}-0002-0000-0000-000000000000"
    us_id = f"{org_id[:8]}-0003-0000-0000-000000000000"
    cur = super_conn.cursor()
    cur.execute("SET session_replication_role = 'replica'")
    cur.execute("""
        INSERT INTO identity.organizations (id, slug, display_name, plan_tier, is_active, created_at, updated_at)
        VALUES (%s::uuid, %s, 'Test Org', 'free', TRUE, NOW(), NOW())
        ON CONFLICT (id) DO NOTHING
    """, (org_id, f"test-{org_id[:8]}"))
    cur.execute("""
        INSERT INTO identity.users (organization_id, id, email, display_name, is_active, created_at, updated_at)
        VALUES (%s::uuid, %s::uuid, %s, 'Test User', TRUE, NOW(), NOW())
        ON CONFLICT (organization_id, id) DO NOTHING
    """, (org_id, user_id, f"test-{user_id[:8]}@test.local"))
    cur.execute("""
        INSERT INTO identity.memberships (organization_id, user_id, role, created_at)
        VALUES (%s::uuid, %s::uuid, 'owner', NOW())
        ON CONFLICT (organization_id, user_id) DO NOTHING
    """, (org_id, user_id))
    cur.execute("""
        INSERT INTO science.projects (organization_id, id, owner_user_id, title, created_at, updated_at)
        VALUES (%s::uuid, %s::uuid, %s::uuid, 'Test Project', NOW(), NOW())
        ON CONFLICT (organization_id, id) DO NOTHING
    """, (org_id, proj_id, user_id))
    cur.execute("""
        INSERT INTO science.datasets (
            organization_id, id, project_id, technique, display_filename,
            declared_content_type, byte_size, dataset_status,
            original_object_id, created_by, created_at, updated_at
        ) VALUES (
            %s::uuid, %s::uuid, %s::uuid, 'xrd', 'test.csv',
            'text/csv', 1024, 'pending_validation',
            %s::uuid, %s::uuid, NOW(), NOW()
        )
        ON CONFLICT (organization_id, id) DO NOTHING
    """, (org_id, ds_id, proj_id, obj_id, user_id))
    cur.execute("""
        INSERT INTO science.upload_sessions (
            id, organization_id, dataset_id, created_by, object_key,
            expected_byte_size, storage_provider, session_status,
            idempotency_key, request_fingerprint, quota_reservation_id,
            expires_at, created_at, updated_at
        ) VALUES (
            %s::uuid, %s::uuid, %s::uuid, %s::uuid, 'objects/test.txt',
            1024, 'local', 'uploaded',
            %s, 'a' || repeat('0', 63),
            '00000000-0000-0000-0000-000000000000'::uuid,
            NOW() + INTERVAL '1 hour', NOW(), NOW()
        )
        ON CONFLICT (organization_id, id) DO NOTHING
    """, (us_id, org_id, ds_id, user_id, f"idem-{us_id}"))
    cur.execute("""
        INSERT INTO science.dataset_objects (
            id, organization_id, dataset_id, source_upload_session_id,
            object_role, storage_provider, object_key, byte_size,
            content_type, created_at
        ) VALUES (
            %s::uuid, %s::uuid, %s::uuid, %s::uuid,
            'original', 'local', 'objects/test.txt', 1024,
            'text/csv', NOW()
        )
        ON CONFLICT (organization_id, id) DO NOTHING
    """, (obj_id, org_id, ds_id, us_id))
    cur.execute("""
        INSERT INTO science.validation_attempts (
            id, organization_id, dataset_id, original_object_id,
            status, created_at, updated_at
        ) VALUES (
            gen_random_uuid(), %s::uuid, %s::uuid, %s::uuid,
            'queued', NOW(), NOW()
        )
    """, (org_id, ds_id, obj_id))
    cur.execute("SET session_replication_role = 'origin'")
    super_conn.commit()
    cur.close()


def _cleanup_test_data(super_conn, seeded_orgs):
    if not seeded_orgs:
        return
    try:
        super_conn.rollback()
        cur = super_conn.cursor()
        cur.execute("SET session_replication_role = 'replica'")
        for org_id in seeded_orgs:
            cur.execute("DELETE FROM governance.audit_log WHERE organization_id = %s::uuid", (org_id,))
            cur.execute("DELETE FROM science.validation_attempts WHERE organization_id = %s::uuid", (org_id,))
            cur.execute("DELETE FROM science.dataset_objects WHERE organization_id = %s::uuid", (org_id,))
            cur.execute("DELETE FROM science.datasets WHERE organization_id = %s::uuid", (org_id,))
            cur.execute("DELETE FROM science.upload_sessions WHERE organization_id = %s::uuid", (org_id,))
            cur.execute("DELETE FROM science.projects WHERE organization_id = %s::uuid", (org_id,))
            cur.execute("DELETE FROM identity.memberships WHERE organization_id = %s::uuid", (org_id,))
            cur.execute("DELETE FROM identity.users WHERE organization_id = %s::uuid", (org_id,))
            cur.execute("DELETE FROM identity.organizations WHERE id = %s::uuid", (org_id,))
        cur.execute("SET session_replication_role = 'origin'")
        super_conn.commit()
        cur.close()
    except Exception:
        super_conn.rollback()


class TestMultiOrgValidationWorker(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self):
        self.seeded_orgs = []
        self.super_conn = psycopg2.connect(BOOTSTRAP_URL)
        self.engine = create_async_engine(TEST_DB_URL, echo=False)

    async def asyncTearDown(self):
        await self.engine.dispose()
        _cleanup_test_data(self.super_conn, self.seeded_orgs)
        self.super_conn.close()

    async def test_claim_next_across_orgs_returns_org_id(self):
        org_a = str(uuid.uuid4())
        org_b = str(uuid.uuid4())
        user_id = str(uuid.uuid4())
        seed_org_with_attempt(self.super_conn, org_a, user_id, test_inst=self)
        seed_org_with_attempt(self.super_conn, org_b, user_id, test_inst=self)
        async with self.engine.begin() as conn:
            session = AsyncSession(bind=conn)
            try:
                result = await session.execute(
                    sa.text("SELECT * FROM science.validation_worker_claim_across_orgs(:w, 300)"),
                    {"w": "test-worker-1"}
                )
                row = result.mappings().first()
                self.assertIsNotNone(row)
                self.assertIn(str(row["organization_id"]), [org_a, org_b])
                await session.commit()
            finally:
                await session.close()

    async def test_claim_next_across_orgs_empty_queue(self):
        async with self.engine.begin() as conn:
            session = AsyncSession(bind=conn)
            try:
                while True:
                    res = await session.execute(sa.text(
                        "SELECT * FROM science.validation_worker_claim_across_orgs('drain-worker', 300)"
                    ))
                    if res.mappings().first() is None:
                        break
                result = await session.execute(sa.text(
                    "SELECT * FROM science.validation_worker_claim_across_orgs(:w, 300)"
                ), {"w": "test-worker-empty"})
                row = result.mappings().first()
                self.assertIsNone(row)
                await session.commit()
            finally:
                await session.close()

    async def test_reclaim_stale_across_orgs_claimed_status(self):
        org_id = str(uuid.uuid4())
        user_id = str(uuid.uuid4())
        self.seeded_orgs.append(org_id)
        ds_id = f"{org_id[:8]}-0000-0000-0000-000000000000"
        obj_id = f"{org_id[:8]}-0001-0000-0000-000000000000"
        proj_id = f"{org_id[:8]}-0002-0000-0000-000000000000"
        us_id = f"{org_id[:8]}-0003-0000-0000-000000000000"
        cur = self.super_conn.cursor()
        cur.execute("SET session_replication_role = 'replica'")
        cur.execute("INSERT INTO identity.organizations (id, slug, display_name, plan_tier, is_active, created_at, updated_at) VALUES (%s::uuid, %s, 'Test', 'free', TRUE, NOW(), NOW()) ON CONFLICT (id) DO NOTHING", (org_id, f"reclaim-{org_id[:8]}"))
        cur.execute("INSERT INTO identity.users (organization_id, id, email, display_name, is_active, created_at, updated_at) VALUES (%s::uuid, %s::uuid, %s, 'Test', TRUE, NOW(), NOW()) ON CONFLICT (organization_id, id) DO NOTHING", (org_id, user_id, f"r-{user_id[:8]}@test.local"))
        cur.execute("INSERT INTO identity.memberships (organization_id, user_id, role, created_at) VALUES (%s::uuid, %s::uuid, 'owner', NOW()) ON CONFLICT (organization_id, user_id) DO NOTHING", (org_id, user_id))
        cur.execute("INSERT INTO science.projects (organization_id, id, owner_user_id, title, created_at, updated_at) VALUES (%s::uuid, %s::uuid, %s::uuid, 'Test', NOW(), NOW()) ON CONFLICT (organization_id, id) DO NOTHING", (org_id, proj_id, user_id))
        cur.execute("INSERT INTO science.datasets (organization_id, id, project_id, technique, display_filename, declared_content_type, byte_size, dataset_status, original_object_id, created_by, created_at, updated_at) VALUES (%s::uuid, %s::uuid, %s::uuid, 'xrd', 'test.csv', 'text/csv', 1024, 'validating', %s::uuid, %s::uuid, NOW(), NOW()) ON CONFLICT (organization_id, id) DO NOTHING", (org_id, ds_id, proj_id, obj_id, user_id))
        cur.execute("INSERT INTO science.upload_sessions (id, organization_id, dataset_id, created_by, object_key, expected_byte_size, storage_provider, session_status, idempotency_key, request_fingerprint, quota_reservation_id, expires_at, created_at, updated_at) VALUES (%s::uuid, %s::uuid, %s::uuid, %s::uuid, 'objects/test.txt', 1024, 'local', 'uploaded', %s, %s, '00000000-0000-0000-0000-000000000000'::uuid, NOW() + INTERVAL '1 hour', NOW(), NOW()) ON CONFLICT (organization_id, id) DO NOTHING", (us_id, org_id, ds_id, user_id, f"idem-{us_id}", 'a' + '0' * 63))
        cur.execute("INSERT INTO science.dataset_objects (id, organization_id, dataset_id, source_upload_session_id, object_role, storage_provider, object_key, byte_size, content_type, created_at) VALUES (%s::uuid, %s::uuid, %s::uuid, %s::uuid, 'original', 'local', 'objects/test.txt', 1024, 'text/csv', NOW()) ON CONFLICT (organization_id, id) DO NOTHING", (obj_id, org_id, ds_id, us_id))
        cur.execute("""
            INSERT INTO science.validation_attempts (
                id, organization_id, dataset_id, original_object_id,
                status, claimed_by, claimed_at, lock_expires_at,
                attempt_number, max_attempts, created_at, updated_at
            ) VALUES (
                gen_random_uuid(), %s::uuid, %s::uuid, %s::uuid,
                'claimed', 'old-worker', NOW() - INTERVAL '1 hour',
                NOW() - INTERVAL '30 minutes', 1, 3, NOW(), NOW()
            )
        """, (org_id, ds_id, obj_id))
        cur.execute("SET session_replication_role = 'origin'")
        self.super_conn.commit()
        cur.close()

        async with self.engine.begin() as conn:
            session = AsyncSession(bind=conn)
            try:
                result = await session.execute(
                    sa.text("SELECT * FROM science.validation_worker_reclaim_stale_across_orgs()")
                )
                row = result.mappings().first()
                self.assertIsNotNone(row)
                self.assertEqual(str(row["status"]), "queued")
                self.assertEqual(row["attempt_number"], 2)
                self.assertIsNone(row["lock_expires_at"])
                await session.commit()
            finally:
                await session.close()

    async def test_reclaim_stale_across_orgs_running_status(self):
        org_id = str(uuid.uuid4())
        user_id = str(uuid.uuid4())
        self.seeded_orgs.append(org_id)
        ds_id = f"{org_id[:8]}-0000-0000-0000-000000000000"
        obj_id = f"{org_id[:8]}-0001-0000-0000-000000000000"
        proj_id = f"{org_id[:8]}-0002-0000-0000-000000000000"
        us_id = f"{org_id[:8]}-0003-0000-0000-000000000000"
        cur = self.super_conn.cursor()
        cur.execute("SET session_replication_role = 'replica'")
        cur.execute("INSERT INTO identity.organizations (id, slug, display_name, plan_tier, is_active, created_at, updated_at) VALUES (%s::uuid, %s, 'Test', 'free', TRUE, NOW(), NOW()) ON CONFLICT (id) DO NOTHING", (org_id, f"running-{org_id[:8]}"))
        cur.execute("INSERT INTO identity.users (organization_id, id, email, display_name, is_active, created_at, updated_at) VALUES (%s::uuid, %s::uuid, %s, 'Test', TRUE, NOW(), NOW()) ON CONFLICT (organization_id, id) DO NOTHING", (org_id, user_id, f"run-{user_id[:8]}@test.local"))
        cur.execute("INSERT INTO identity.memberships (organization_id, user_id, role, created_at) VALUES (%s::uuid, %s::uuid, 'owner', NOW()) ON CONFLICT (organization_id, user_id) DO NOTHING", (org_id, user_id))
        cur.execute("INSERT INTO science.projects (organization_id, id, owner_user_id, title, created_at, updated_at) VALUES (%s::uuid, %s::uuid, %s::uuid, 'Test', NOW(), NOW()) ON CONFLICT (organization_id, id) DO NOTHING", (org_id, proj_id, user_id))
        cur.execute("INSERT INTO science.datasets (organization_id, id, project_id, technique, display_filename, declared_content_type, byte_size, dataset_status, original_object_id, created_by, created_at, updated_at) VALUES (%s::uuid, %s::uuid, %s::uuid, 'xrd', 'test.csv', 'text/csv', 1024, 'validating', %s::uuid, %s::uuid, NOW(), NOW()) ON CONFLICT (organization_id, id) DO NOTHING", (org_id, ds_id, proj_id, obj_id, user_id))
        cur.execute("INSERT INTO science.upload_sessions (id, organization_id, dataset_id, created_by, object_key, expected_byte_size, storage_provider, session_status, idempotency_key, request_fingerprint, quota_reservation_id, expires_at, created_at, updated_at) VALUES (%s::uuid, %s::uuid, %s::uuid, %s::uuid, 'objects/test.txt', 1024, 'local', 'uploaded', %s, %s, '00000000-0000-0000-0000-000000000000'::uuid, NOW() + INTERVAL '1 hour', NOW(), NOW()) ON CONFLICT (organization_id, id) DO NOTHING", (us_id, org_id, ds_id, user_id, f"idem-{us_id}", 'a' + '0' * 63))
        cur.execute("INSERT INTO science.dataset_objects (id, organization_id, dataset_id, source_upload_session_id, object_role, storage_provider, object_key, byte_size, content_type, created_at) VALUES (%s::uuid, %s::uuid, %s::uuid, %s::uuid, 'original', 'local', 'objects/test.txt', 1024, 'text/csv', NOW()) ON CONFLICT (organization_id, id) DO NOTHING", (obj_id, org_id, ds_id, us_id))
        cur.execute("""
            INSERT INTO science.validation_attempts (
                id, organization_id, dataset_id, original_object_id,
                status, claimed_by, claimed_at, lock_expires_at, started_at,
                attempt_number, max_attempts, created_at, updated_at
            ) VALUES (
                gen_random_uuid(), %s::uuid, %s::uuid, %s::uuid,
                'running', 'crashed-worker', NOW() - INTERVAL '2 hours',
                NOW() - INTERVAL '1 hour', NOW() - INTERVAL '2 hours',
                1, 3, NOW(), NOW()
            )
        """, (org_id, ds_id, obj_id))
        cur.execute("SET session_replication_role = 'origin'")
        self.super_conn.commit()
        cur.close()

        async with self.engine.begin() as conn:
            session = AsyncSession(bind=conn)
            try:
                result = await session.execute(
                    sa.text("SELECT * FROM science.validation_worker_reclaim_stale_across_orgs()")
                )
                row = result.mappings().first()
                self.assertIsNotNone(row)
                self.assertEqual(str(row["status"]), "queued")
                self.assertIsNone(row["lock_expires_at"])
                await session.commit()
            finally:
                await session.close()

    async def test_reclaim_stale_across_orgs_respects_max_attempts(self):
        org_id = str(uuid.uuid4())
        user_id = str(uuid.uuid4())
        self.seeded_orgs.append(org_id)
        ds_id = f"{org_id[:8]}-0000-0000-0000-000000000000"
        obj_id = f"{org_id[:8]}-0001-0000-0000-000000000000"
        proj_id = f"{org_id[:8]}-0002-0000-0000-000000000000"
        us_id = f"{org_id[:8]}-0003-0000-0000-000000000000"
        cur = self.super_conn.cursor()
        cur.execute("SET session_replication_role = 'replica'")
        cur.execute("INSERT INTO identity.organizations (id, slug, display_name, plan_tier, is_active, created_at, updated_at) VALUES (%s::uuid, %s, 'Test', 'free', TRUE, NOW(), NOW()) ON CONFLICT (id) DO NOTHING", (org_id, f"maxatt-{org_id[:8]}"))
        cur.execute("INSERT INTO identity.users (organization_id, id, email, display_name, is_active, created_at, updated_at) VALUES (%s::uuid, %s::uuid, %s, 'Test', TRUE, NOW(), NOW()) ON CONFLICT (organization_id, id) DO NOTHING", (org_id, user_id, f"max-{user_id[:8]}@test.local"))
        cur.execute("INSERT INTO identity.memberships (organization_id, user_id, role, created_at) VALUES (%s::uuid, %s::uuid, 'owner', NOW()) ON CONFLICT (organization_id, user_id) DO NOTHING", (org_id, user_id))
        cur.execute("INSERT INTO science.projects (organization_id, id, owner_user_id, title, created_at, updated_at) VALUES (%s::uuid, %s::uuid, %s::uuid, 'Test', NOW(), NOW()) ON CONFLICT (organization_id, id) DO NOTHING", (org_id, proj_id, user_id))
        cur.execute("INSERT INTO science.datasets (organization_id, id, project_id, technique, display_filename, declared_content_type, byte_size, dataset_status, original_object_id, created_by, created_at, updated_at) VALUES (%s::uuid, %s::uuid, %s::uuid, 'xrd', 'test.csv', 'text/csv', 1024, 'validating', %s::uuid, %s::uuid, NOW(), NOW()) ON CONFLICT (organization_id, id) DO NOTHING", (org_id, ds_id, proj_id, obj_id, user_id))
        cur.execute("INSERT INTO science.upload_sessions (id, organization_id, dataset_id, created_by, object_key, expected_byte_size, storage_provider, session_status, idempotency_key, request_fingerprint, quota_reservation_id, expires_at, created_at, updated_at) VALUES (%s::uuid, %s::uuid, %s::uuid, %s::uuid, 'objects/test.txt', 1024, 'local', 'uploaded', %s, %s, '00000000-0000-0000-0000-000000000000'::uuid, NOW() + INTERVAL '1 hour', NOW(), NOW()) ON CONFLICT (organization_id, id) DO NOTHING", (us_id, org_id, ds_id, user_id, f"idem-{us_id}", 'a' + '0' * 63))
        cur.execute("INSERT INTO science.dataset_objects (id, organization_id, dataset_id, source_upload_session_id, object_role, storage_provider, object_key, byte_size, content_type, created_at) VALUES (%s::uuid, %s::uuid, %s::uuid, %s::uuid, 'original', 'local', 'objects/test.txt', 1024, 'text/csv', NOW()) ON CONFLICT (organization_id, id) DO NOTHING", (obj_id, org_id, ds_id, us_id))
        cur.execute("""
            INSERT INTO science.validation_attempts (
                id, organization_id, dataset_id, original_object_id,
                status, claimed_by, claimed_at, lock_expires_at,
                attempt_number, max_attempts, created_at, updated_at
            ) VALUES (
                gen_random_uuid(), %s::uuid, %s::uuid, %s::uuid,
                'claimed', 'old-worker', NOW() - INTERVAL '1 hour',
                NOW() - INTERVAL '30 minutes', 3, 3, NOW(), NOW()
            )
        """, (org_id, ds_id, obj_id))
        cur.execute("SET session_replication_role = 'origin'")
        self.super_conn.commit()
        cur.close()

        async with self.engine.begin() as conn:
            session = AsyncSession(bind=conn)
            try:
                result = await session.execute(
                    sa.text("SELECT * FROM science.validation_worker_reclaim_stale_across_orgs()")
                )
                row = result.mappings().first()
                self.assertIsNotNone(row)
                self.assertEqual(str(row["status"]), "quarantined")
                self.assertEqual(row["failure_code"], "max_attempts_exceeded")
                self.assertIsNone(row["lock_expires_at"])
                self.assertIsNotNone(row["completed_at"])
                await session.commit()
            finally:
                await session.close()

    async def test_renew_lock_with_org_id(self):
        org_id = str(uuid.uuid4())
        user_id = str(uuid.uuid4())
        self.seeded_orgs.append(org_id)
        ds_id = f"{org_id[:8]}-0000-0000-0000-000000000000"
        obj_id = f"{org_id[:8]}-0001-0000-0000-000000000000"
        proj_id = f"{org_id[:8]}-0002-0000-0000-000000000000"
        us_id = f"{org_id[:8]}-0003-0000-0000-000000000000"
        attempt_id = str(uuid.uuid4())
        cur = self.super_conn.cursor()
        cur.execute("SET session_replication_role = 'replica'")
        cur.execute("INSERT INTO identity.organizations (id, slug, display_name, plan_tier, is_active, created_at, updated_at) VALUES (%s::uuid, %s, 'Test', 'free', TRUE, NOW(), NOW()) ON CONFLICT (id) DO NOTHING", (org_id, f"renew-{org_id[:8]}"))
        cur.execute("INSERT INTO identity.users (organization_id, id, email, display_name, is_active, created_at, updated_at) VALUES (%s::uuid, %s::uuid, %s, 'Test', TRUE, NOW(), NOW()) ON CONFLICT (organization_id, id) DO NOTHING", (org_id, user_id, f"ren-{user_id[:8]}@test.local"))
        cur.execute("INSERT INTO identity.memberships (organization_id, user_id, role, created_at) VALUES (%s::uuid, %s::uuid, 'owner', NOW()) ON CONFLICT (organization_id, user_id) DO NOTHING", (org_id, user_id))
        cur.execute("INSERT INTO science.projects (organization_id, id, owner_user_id, title, created_at, updated_at) VALUES (%s::uuid, %s::uuid, %s::uuid, 'Test', NOW(), NOW()) ON CONFLICT (organization_id, id) DO NOTHING", (org_id, proj_id, user_id))
        cur.execute("INSERT INTO science.datasets (organization_id, id, project_id, technique, display_filename, declared_content_type, byte_size, dataset_status, original_object_id, created_by, created_at, updated_at) VALUES (%s::uuid, %s::uuid, %s::uuid, 'xrd', 'test.csv', 'text/csv', 1024, 'validating', %s::uuid, %s::uuid, NOW(), NOW()) ON CONFLICT (organization_id, id) DO NOTHING", (org_id, ds_id, proj_id, obj_id, user_id))
        cur.execute("INSERT INTO science.upload_sessions (id, organization_id, dataset_id, created_by, object_key, expected_byte_size, storage_provider, session_status, idempotency_key, request_fingerprint, quota_reservation_id, expires_at, created_at, updated_at) VALUES (%s::uuid, %s::uuid, %s::uuid, %s::uuid, 'objects/test.txt', 1024, 'local', 'uploaded', %s, %s, '00000000-0000-0000-0000-000000000000'::uuid, NOW() + INTERVAL '1 hour', NOW(), NOW()) ON CONFLICT (organization_id, id) DO NOTHING", (us_id, org_id, ds_id, user_id, f"idem-{us_id}", 'a' + '0' * 63))
        cur.execute("INSERT INTO science.dataset_objects (id, organization_id, dataset_id, source_upload_session_id, object_role, storage_provider, object_key, byte_size, content_type, created_at) VALUES (%s::uuid, %s::uuid, %s::uuid, %s::uuid, 'original', 'local', 'objects/test.txt', 1024, 'text/csv', NOW()) ON CONFLICT (organization_id, id) DO NOTHING", (obj_id, org_id, ds_id, us_id))
        cur.execute("""
            INSERT INTO science.validation_attempts (
                id, organization_id, dataset_id, original_object_id,
                status, claimed_by, claimed_at, lock_expires_at,
                attempt_number, max_attempts, created_at, updated_at
            ) VALUES (
                %s::uuid, %s::uuid, %s::uuid, %s::uuid,
                'claimed', 'test-worker', NOW(), NOW() + INTERVAL '1 minute',
                1, 3, NOW(), NOW()
            )
            ON CONFLICT (organization_id, id) DO NOTHING
        """, (attempt_id, org_id, ds_id, obj_id))
        cur.execute("SET session_replication_role = 'origin'")
        self.super_conn.commit()
        cur.close()

        async with self.engine.begin() as conn:
            session = AsyncSession(bind=conn)
            try:
                await session.execute(
                    sa.text("SELECT set_config('app.organization_id', :v, true)"),
                    {"v": org_id}
                )
                await session.execute(
                    sa.text("SELECT set_config('app.user_id', :v, true)"),
                    {"v": user_id}
                )
                result = await session.execute(
                    sa.text("""
                        UPDATE science.validation_attempts
                        SET lock_expires_at = NOW() + INTERVAL '5 minutes', updated_at = NOW()
                        WHERE organization_id = CAST(:org_id AS uuid)
                          AND id = CAST(:attempt_id AS uuid)
                          AND claimed_by = 'test-worker'
                          AND status IN (
                              CAST('claimed' AS science.validation_attempt_status),
                              CAST('running' AS science.validation_attempt_status)
                          )
                    """),
                    {"org_id": org_id, "attempt_id": attempt_id}
                )
                self.assertEqual(result.rowcount, 1)
                await session.commit()
            finally:
                await session.close()


if __name__ == "__main__":
    unittest.main()
