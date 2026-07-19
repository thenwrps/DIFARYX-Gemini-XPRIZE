import os
import sys
import unittest
import asyncio
import uuid
import datetime
from pathlib import Path

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

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
import psycopg2
from psycopg2.extras import RealDictCursor

from api.db.uow import UnitOfWork
from api.storage.factory import get_object_store
from api.workers.upload_expiry_worker import UploadExpiryWorker
from api.storage.local_adapter import LocalObjectStore

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


class TestUploadExpiryWorker(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self):
        self.engine = create_async_engine(TEST_DB_URL, echo=False)
        self.super_conn = psycopg2.connect(BOOTSTRAP_URL)
        self.store = get_object_store()

        self.org_id = str(uuid.uuid4())
        self.user_id = str(uuid.uuid4())
        self.project_id = str(uuid.uuid4())

        # Seed organization, user, project and quota ledger using sync superuser connection
        cur = self.super_conn.cursor()
        try:
            cur.execute("SET session_replication_role = 'replica'")

            cur.execute("""
                INSERT INTO identity.organizations (id, slug, display_name, plan_tier, is_active)
                VALUES (%s::uuid, %s, 'Expiry Org', 'free', true)
            """, (self.org_id, f"org-{self.org_id[:8]}"))

            cur.execute("""
                INSERT INTO identity.users (id, organization_id, email, display_name, is_active)
                VALUES (%s::uuid, %s::uuid, %s, 'Expiry User', true)
            """, (self.user_id, self.org_id, f"exp-{self.user_id[:8]}@test.com"))

            cur.execute("""
                INSERT INTO identity.memberships (id, organization_id, user_id, role)
                VALUES (%s::uuid, %s::uuid, %s::uuid, 'owner')
            """, (str(uuid.uuid4()), self.org_id, self.user_id))

            cur.execute("""
                INSERT INTO science.projects (organization_id, id, owner_user_id, title)
                VALUES (%s::uuid, %s::uuid, %s::uuid, 'Expiry Project')
            """, (self.org_id, self.project_id, self.user_id))

            cur.execute("""
                INSERT INTO science.project_memberships (organization_id, project_id, user_id, role)
                VALUES (%s::uuid, %s::uuid, %s::uuid, 'lead')
            """, (self.org_id, self.project_id, self.user_id))

            cur.execute("""
                INSERT INTO governance.quota_ledger (organization_id, quota_type, quota_period, period_start, period_end, allocated, reserved)
                VALUES (%s::uuid, 'storage', 'lifetime', '2020-01-01', '9999-12-31', 10000000, 0)
            """, (self.org_id,))

            cur.execute("SET session_replication_role = 'origin'")
            self.super_conn.commit()
        except Exception:
            self.super_conn.rollback()
            raise
        finally:
            cur.close()

    async def asyncTearDown(self):
        # Clean up test data
        cur = self.super_conn.cursor()
        try:
            cur.execute("SET session_replication_role = 'replica'")
            cur.execute("DELETE FROM governance.quota_reservations WHERE organization_id = %s::uuid", (self.org_id,))
            cur.execute("DELETE FROM science.upload_sessions WHERE organization_id = %s::uuid", (self.org_id,))
            cur.execute("DELETE FROM science.dataset_objects WHERE organization_id = %s::uuid", (self.org_id,))
            cur.execute("DELETE FROM science.datasets WHERE organization_id = %s::uuid", (self.org_id,))
            cur.execute("DELETE FROM science.projects WHERE organization_id = %s::uuid", (self.org_id,))
            cur.execute("DELETE FROM identity.memberships WHERE organization_id = %s::uuid", (self.org_id,))
            cur.execute("DELETE FROM identity.users WHERE organization_id = %s::uuid", (self.org_id,))
            cur.execute("DELETE FROM identity.organizations WHERE id = %s::uuid", (self.org_id,))
            cur.execute("DELETE FROM governance.quota_ledger WHERE organization_id = %s::uuid", (self.org_id,))
            cur.execute("SET session_replication_role = 'origin'")
            self.super_conn.commit()
        except Exception:
            self.super_conn.rollback()
        finally:
            cur.close()

        await self.engine.dispose()
        self.super_conn.close()

        # Clean up staging directory
        if isinstance(self.store, LocalObjectStore):
            if self.store._staging.exists():
                for p in self.store._staging.iterdir():
                    if p.is_file():
                        p.unlink()

    async def _create_upload_session(self, status, key, size, expires_delta=None):
        if expires_delta is None:
            expires_delta = "NOW() - INTERVAL '10 minutes'"
        async with UnitOfWork(organization_id=uuid.UUID(self.org_id), user_id=uuid.UUID(self.user_id)) as session:
            # Call DB function to reserve storage quota
            res_id = (await session.execute(
                sa.text("""
                    SELECT governance.reserve_storage_quota(
                        :org_id, :user_id, :project_id,
                        :key, :size, NOW() + INTERVAL '1 hour',
                        :idem_key
                    )
                """),
                {
                    "org_id": self.org_id,
                    "user_id": self.user_id,
                    "project_id": self.project_id,
                    "key": key,
                    "size": size,
                    "idem_key": f"idem-{uuid.uuid4()}"
                }
            )).scalar()
            
            # Insert dataset in DB
            ds_id = str(uuid.uuid4())
            await session.execute(sa.text("""
                INSERT INTO science.datasets (
                    organization_id, id, project_id, technique, display_filename,
                    declared_content_type, byte_size, dataset_status, created_by
                ) VALUES (
                    :org_id, :ds_id, :project_id, 'xrd', 'test.txt',
                    'text/plain', :size, 'allocated', :user_id
                )
            """), {"org_id": self.org_id, "ds_id": ds_id, "project_id": self.project_id, "size": size, "user_id": self.user_id})

            # Insert upload session in DB with expired expires_at
            session_id = str(uuid.uuid4())
            await session.execute(sa.text(f"""
                INSERT INTO science.upload_sessions (
                    id, organization_id, dataset_id, created_by, object_key,
                    expected_byte_size, storage_provider, session_status,
                    idempotency_key, request_fingerprint, quota_reservation_id,
                    expires_at, created_at
                ) VALUES (
                    :session_id, :org_id, :ds_id, :user_id, :key,
                    :size, 'local', CAST(:status AS science.upload_session_status),
                    :idem, 'a' || repeat('0', 63), :res_id,
                    {expires_delta}, NOW() - INTERVAL '20 minutes'
                )
            """), {
                "session_id": session_id,
                "org_id": self.org_id,
                "ds_id": ds_id,
                "user_id": self.user_id,
                "key": key,
                "size": size,
                "status": status,
                "idem": f"idem-session-{uuid.uuid4()}",
                "res_id": res_id
            })
            
            return {
                "id": session_id,
                "ds_id": ds_id,
                "res_id": res_id,
                "key": key,
                "size": size
            }

    async def test_sweep_expired_sessions_marks_expired(self):
        # 1. Prepare three expired upload sessions (allocated, uploading, uploaded)
        sessions = []
        for status, key, size in [
            ("allocated", "test-fixtures/expired-allocated.txt", 100),
            ("uploading", "test-fixtures/expired-uploading.txt", 200),
            ("uploaded", "test-fixtures/expired-uploaded.txt", 300),
        ]:
            s = await self._create_upload_session(status, key, size)
            sessions.append(s)
            
            # Create physical staging files for them
            writer = await self.store.begin_staging(key, size + 10)
            await writer.write_chunk(b"A" * size)
            await writer.finish()

        # Run sweep
        worker = UploadExpiryWorker(engine=self.engine, user_id=self.user_id, poll_interval=1.0, store=self.store)
        await worker.sweep_once()

        # Verify sessions are expired, quota is released, staging is deleted
        cur = self.super_conn.cursor(cursor_factory=RealDictCursor)
        try:
            for s in sessions:
                cur.execute("SELECT session_status FROM science.upload_sessions WHERE id = %s::uuid", (s["id"],))
                self.assertEqual(cur.fetchone()["session_status"], "expired")

                cur.execute("SELECT status FROM governance.quota_reservations WHERE id = %s::uuid", (str(s["res_id"]),))
                self.assertEqual(cur.fetchone()["status"], "released")

                if isinstance(self.store, LocalObjectStore):
                    self.assertFalse(self.store._staging_path(s["key"]).exists())
                else:
                    self.assertNotIn(f"_staging/{s['key']}", self.store._staging)

            # Verify ledger is 0 (all released)
            cur.execute("SELECT reserved FROM governance.quota_ledger WHERE organization_id = %s::uuid", (self.org_id,))
            self.assertEqual(cur.fetchone()["reserved"], 0)
        finally:
            cur.close()

    async def test_sweep_finalized_session_untouched(self):
        # Prepare a finalized upload session (expires_at is in past, but status is finalized)
        fin_key = "test-fixtures/finalized.txt"
        fin_size = 400
        s = await self._create_upload_session("uploaded", fin_key, fin_size)
        
        # Promote staging file to final and mark finalized in DB
        writer = await self.store.begin_staging(fin_key, fin_size + 10)
        await writer.write_chunk(b"B" * fin_size)
        res = await writer.finish()
        await self.store.promote_staging(res.staging_key, fin_key)

        async with UnitOfWork(organization_id=uuid.UUID(self.org_id), user_id=uuid.UUID(self.user_id)) as db_session:
            # Create dataset object
            await db_session.execute(sa.text("""
                INSERT INTO science.dataset_objects (
                    id, organization_id, dataset_id, source_upload_session_id,
                    object_role, storage_provider, object_key, byte_size,
                    content_type, created_at
                ) VALUES (
                    :obj_id, :org_id, :ds_id, :session_id,
                    'original', 'local', :key, :size,
                    'text/plain', NOW()
                )
            """), {
                "obj_id": str(uuid.uuid4()),
                "org_id": self.org_id,
                "ds_id": s["ds_id"],
                "session_id": s["id"],
                "key": fin_key,
                "size": fin_size
            })

            # Update session status to finalized
            await db_session.execute(sa.text("""
                UPDATE science.upload_sessions
                SET session_status = 'finalized',
                    finalized_at = NOW()
                WHERE id = :session_id AND organization_id = :org_id
            """), {"session_id": s["id"], "org_id": self.org_id})

        # Run sweep
        worker = UploadExpiryWorker(engine=self.engine, user_id=self.user_id, poll_interval=1.0, store=self.store)
        await worker.sweep_once()

        # Verify finalized session remains untouched
        cur = self.super_conn.cursor(cursor_factory=RealDictCursor)
        try:
            cur.execute("SELECT session_status FROM science.upload_sessions WHERE id = %s::uuid", (s["id"],))
            self.assertEqual(cur.fetchone()["session_status"], "finalized")

            cur.execute("SELECT status FROM governance.quota_reservations WHERE id = %s::uuid", (str(s["res_id"]),))
            self.assertEqual(cur.fetchone()["status"], "reserved")

            # Final object still present
            if isinstance(self.store, LocalObjectStore):
                self.assertTrue(self.store._final_path(fin_key).exists())
            else:
                self.assertIn(fin_key, self.store._final)

            # Ledger reserved amount matches fin_size
            cur.execute("SELECT reserved FROM governance.quota_ledger WHERE organization_id = %s::uuid", (self.org_id,))
            self.assertEqual(cur.fetchone()["reserved"], fin_size)
        finally:
            cur.close()

    async def test_sweep_cleans_orphaned_staging_with_grace(self):
        import time
        from api.storage.local_adapter import ORPHAN_GRACE_PERIOD as LOCAL_GRACE
        from api.storage.in_memory_adapter import ORPHAN_GRACE_PERIOD as MEM_GRACE
        
        grace = LOCAL_GRACE if isinstance(self.store, LocalObjectStore) else MEM_GRACE

        # Seed an old orphan staging file (older than grace period)
        old_orphan = "test-fixtures/old-orphan.txt"
        writer_old = await self.store.begin_staging(old_orphan, 100)
        await writer_old.write_chunk(b"Old orphan content")
        await writer_old.finish()

        # Seed a new/in-flight staging file (younger than grace period)
        new_orphan = "test-fixtures/new-orphan.txt"
        writer_new = await self.store.begin_staging(new_orphan, 100)
        await writer_new.write_chunk(b"New staging content")
        await writer_new.finish()

        # Manipulate mtime of the old orphan
        age = grace + 200
        if isinstance(self.store, LocalObjectStore):
            path = self.store._staging_path(old_orphan)
            os.utime(path, (time.time() - age, time.time() - age))
        else:
            self.store._staging_mtime[f"_staging/{old_orphan}"] = time.time() - age

        # Run sweep
        worker = UploadExpiryWorker(engine=self.engine, user_id=self.user_id, poll_interval=1.0, store=self.store)
        await worker.sweep_once()

        # Verify old orphan is deleted, while new orphan is preserved!
        if isinstance(self.store, LocalObjectStore):
            self.assertFalse(self.store._staging_path(old_orphan).exists())
            self.assertTrue(self.store._staging_path(new_orphan).exists())
        else:
            self.assertNotIn(f"_staging/{old_orphan}", self.store._staging)
            self.assertIn(f"_staging/{new_orphan}", self.store._staging)

    async def test_sweep_self_heals_unreleased_reservations(self):
        # Create a session that is already 'expired' in status, but its quota reservation remains 'reserved'
        key = "test-fixtures/self-heal.txt"
        size = 500
        s = await self._create_upload_session("allocated", key, size)

        # Manually transition session status to 'expired' WITHOUT releasing the reservation
        async with UnitOfWork(organization_id=uuid.UUID(self.org_id), user_id=uuid.UUID(self.user_id)) as session:
            await session.execute(sa.text("""
                UPDATE science.upload_sessions
                SET session_status = 'expired'
                WHERE id = :id AND organization_id = :org_id
            """), {"id": s["id"], "org_id": self.org_id})

        # Run sweep
        worker = UploadExpiryWorker(engine=self.engine, user_id=self.user_id, poll_interval=1.0, store=self.store)
        await worker.sweep_once()

        # Verify that the self-healing step released the reservation and reconciled the ledger
        cur = self.super_conn.cursor(cursor_factory=RealDictCursor)
        try:
            cur.execute("SELECT status FROM governance.quota_reservations WHERE id = %s::uuid", (str(s["res_id"]),))
            self.assertEqual(cur.fetchone()["status"], "released")

            cur.execute("SELECT reserved FROM governance.quota_ledger WHERE organization_id = %s::uuid", (self.org_id,))
            self.assertEqual(cur.fetchone()["reserved"], 0)
        finally:
            cur.close()

    async def test_sweep_idempotency(self):
        # Seed an expired session
        key = "test-fixtures/idempotent.txt"
        size = 600
        s = await self._create_upload_session("allocated", key, size)

        # Run sweep twice
        worker = UploadExpiryWorker(engine=self.engine, user_id=self.user_id, poll_interval=1.0, store=self.store)
        await worker.sweep_once()
        await worker.sweep_once()

        # Verify reservation is released, ledger is 0, and no double-release errors occurred
        cur = self.super_conn.cursor(cursor_factory=RealDictCursor)
        try:
            cur.execute("SELECT status FROM governance.quota_reservations WHERE id = %s::uuid", (str(s["res_id"]),))
            self.assertEqual(cur.fetchone()["status"], "released")

            cur.execute("SELECT reserved FROM governance.quota_ledger WHERE organization_id = %s::uuid", (self.org_id,))
            self.assertEqual(cur.fetchone()["reserved"], 0)
        finally:
            cur.close()


if __name__ == "__main__":
    unittest.main()
