"""Integration tests for multi-org validation worker.

Tests the full worker flow in multi_org mode:
- Worker drains queues from multiple orgs
- RLS context is set correctly per-attempt
- No cross-tenant leaks
- Terminal failures are not re-claimed
- Heartbeat uses correct org_id
- Concurrent workers don't double-reclaim
- Transient-fail -> retry -> pass path works end-to-end
"""
import asyncio
import os
import sys
import unittest
import uuid

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

import psycopg2
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

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


def seed_full_org(super_conn, org_id, user_id, ds_id, obj_id, proj_id, us_id,
                   dataset_status='pending_validation', attempt_status='queued',
                   attempt_id=None, attempt_extra=None, attempt_number=1, test_inst=None):
    if test_inst is not None and hasattr(test_inst, "seeded_orgs"):
        test_inst.seeded_orgs.append(org_id)
    cur = super_conn.cursor()
    cur.execute("SET session_replication_role = 'replica'")

    object_key = f'objects/test-{us_id}.txt'

    slug = f"t-{org_id[:8]}-{org_id[-4:]}"
    cur.execute(
        "INSERT INTO identity.organizations (id, slug, display_name, plan_tier, is_active, created_at, updated_at) "
        "VALUES (%s::uuid, %s, 'Test Org', 'free', TRUE, NOW(), NOW()) "
        "ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name",
        (org_id, slug)
    )
    cur.execute(
        "INSERT INTO identity.users (organization_id, id, email, display_name, is_active, created_at, updated_at) "
        "VALUES (%s::uuid, %s::uuid, %s, 'Test User', TRUE, NOW(), NOW()) ON CONFLICT (organization_id, id) DO NOTHING",
        (org_id, user_id, f"test-{user_id[:8]}@test.local")
    )
    cur.execute(
        "INSERT INTO identity.memberships (organization_id, user_id, role, created_at) "
        "VALUES (%s::uuid, %s::uuid, 'owner', NOW()) ON CONFLICT (organization_id, user_id) DO NOTHING",
        (org_id, user_id)
    )
    cur.execute(
        "INSERT INTO science.projects (organization_id, id, owner_user_id, title, created_at, updated_at) "
        "VALUES (%s::uuid, %s::uuid, %s::uuid, 'Test Project', NOW(), NOW()) ON CONFLICT (organization_id, id) DO NOTHING",
        (org_id, proj_id, user_id)
    )
    cur.execute(
        "INSERT INTO science.upload_sessions "
        "(id, organization_id, dataset_id, created_by, object_key, expected_byte_size, "
        "storage_provider, session_status, idempotency_key, request_fingerprint, "
        "quota_reservation_id, expires_at, created_at, updated_at) "
        "VALUES (%s::uuid, %s::uuid, %s::uuid, %s::uuid, %s, 1024, "
        "'local', 'uploaded', %s, %s, "
        "'00000000-0000-0000-0000-000000000000'::uuid, NOW() + INTERVAL '1 hour', NOW(), NOW()) "
        "ON CONFLICT (organization_id, id) DO NOTHING",
        (us_id, org_id, ds_id, user_id, object_key, f"idem-{us_id}", 'a' + '0' * 63)
    )
    cur.execute(
        "INSERT INTO science.dataset_objects "
        "(id, organization_id, dataset_id, source_upload_session_id, object_role, "
        "storage_provider, object_key, byte_size, content_type, created_at) "
        "VALUES (%s::uuid, %s::uuid, %s::uuid, %s::uuid, 'original', 'local', "
        "%s, 1024, 'text/csv', NOW()) ON CONFLICT (organization_id, id) DO NOTHING",
        (obj_id, org_id, ds_id, us_id, object_key)
    )
    cur.execute(
        "INSERT INTO science.datasets "
        "(organization_id, id, project_id, technique, display_filename, "
        "declared_content_type, byte_size, dataset_status, original_object_id, "
        "created_by, created_at, updated_at) "
        "VALUES (%s::uuid, %s::uuid, %s::uuid, 'xrd', 'test.csv', 'text/csv', 1024, "
        "%s::science.dataset_status, %s::uuid, %s::uuid, NOW(), NOW()) "
        "ON CONFLICT (organization_id, id) DO UPDATE SET dataset_status = EXCLUDED.dataset_status",
        (org_id, ds_id, proj_id, dataset_status, obj_id, user_id)
    )

    base_cols = "id, organization_id, dataset_id, original_object_id"
    if attempt_id:
        base_placeholders = "%s::uuid, %s::uuid, %s::uuid, %s::uuid"
        base_params = (attempt_id, org_id, ds_id, obj_id)
    else:
        base_placeholders = "gen_random_uuid(), %s::uuid, %s::uuid, %s::uuid"
        base_params = (org_id, ds_id, obj_id)

    extra_cols = ""
    extra_placeholders = ""
    extra_params = ()
    if attempt_extra:
        for col, val in attempt_extra.items():
            extra_cols += f", {col}"
            extra_placeholders += ", %s"
            extra_params += (val,)

    all_params = base_params + extra_params

    if attempt_status == 'queued':
        cur.execute(
            f"INSERT INTO science.validation_attempts "
            f"({base_cols}, attempt_number, status, lock_expires_at, created_at, updated_at{extra_cols}) "
            f"VALUES ({base_placeholders}, %s, 'queued', NULL, NOW(), NOW(){extra_placeholders})",
            all_params + (attempt_number,)
        )
    elif attempt_status == 'claimed':
        cur.execute(
            f"INSERT INTO science.validation_attempts "
            f"({base_cols}, attempt_number, status, claimed_by, claimed_at, lock_expires_at, "
            f"created_at, updated_at{extra_cols}) "
            f"VALUES ({base_placeholders}, %s, 'claimed', 'old-worker', "
            f"NOW() - INTERVAL '1 hour', NOW() - INTERVAL '30 minutes', "
            f"NOW(), NOW(){extra_placeholders})",
            all_params + (attempt_number,)
        )
    elif attempt_status == 'running':
        cur.execute(
            f"INSERT INTO science.validation_attempts "
            f"({base_cols}, attempt_number, status, claimed_by, claimed_at, lock_expires_at, "
            f"started_at, created_at, updated_at{extra_cols}) "
            f"VALUES ({base_placeholders}, %s, 'running', 'crashed-worker', "
            f"NOW() - INTERVAL '2 hours', NOW() - INTERVAL '1 hour', "
            f"NOW() - INTERVAL '2 hours', NOW(), NOW(){extra_placeholders})",
            all_params + (attempt_number,)
        )
    elif attempt_status == 'failed_terminal':
        cur.execute(
            f"INSERT INTO science.validation_attempts "
            f"({base_cols}, attempt_number, status, next_retry_at, completed_at, lock_expires_at, failure_code, "
            f"created_at, updated_at{extra_cols}) "
            f"VALUES ({base_placeholders}, %s, 'failed', NULL, NOW(), NULL, "
            f"'INVALID_CONTENT', NOW(), NOW(){extra_placeholders})",
            all_params + (attempt_number,)
        )
    elif attempt_status == 'quarantined':
        cur.execute(
            f"INSERT INTO science.validation_attempts "
            f"({base_cols}, attempt_number, status, max_attempts, failure_code, "
            f"quarantine_reason, completed_at, lock_expires_at, created_at, updated_at{extra_cols}) "
            f"VALUES ({base_placeholders}, %s, 'quarantined', 3, "
            f"'max_attempts_exceeded', 'Test quarantine', NOW(), NULL, NOW(), "
            f"NOW(){extra_placeholders})",
            all_params + (attempt_number,)
        )
    elif attempt_status == 'cancelled':
        cur.execute(
            f"INSERT INTO science.validation_attempts "
            f"({base_cols}, attempt_number, status, completed_at, lock_expires_at, created_at, "
            f"updated_at{extra_cols}) "
            f"VALUES ({base_placeholders}, %s, 'cancelled', NOW(), NULL, NOW(), "
            f"NOW(){extra_placeholders})",
            all_params + (attempt_number,)
        )

    cur.execute("SET session_replication_role = 'origin'")
    super_conn.commit()
    cur.close()


class TestMultiOrgIntegration(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self):
        self.seeded_orgs = []
        self.super_conn = psycopg2.connect(BOOTSTRAP_URL)
        self.engine = create_async_engine(TEST_DB_URL, echo=False)

    async def asyncTearDown(self):
        await self.engine.dispose()
        _cleanup_test_data(self.super_conn, self.seeded_orgs)
        self.super_conn.close()

    async def test_worker_drains_two_org_queues(self):
        org_a = str(uuid.uuid4())
        org_b = str(uuid.uuid4())
        user_a = str(uuid.uuid4())
        user_b = str(uuid.uuid4())

        for org_id, user_id, count in [(org_a, user_a, 2), (org_b, user_b, 3)]:
            for i in range(count):
                ds_id = f"{org_id[:8]}-{i:04d}-0000-0000-000000000000"
                obj_id = f"{org_id[:8]}-{i:04d}-0001-0000-000000000000"
                proj_id = f"{org_id[:8]}-{i:04d}-0002-0000-000000000000"
                us_id = f"{org_id[:8]}-{i:04d}-0003-0000-000000000000"
                seed_full_org(self.super_conn, org_id, user_id, ds_id, obj_id, proj_id, us_id, test_inst=self)

        processed_orgs = []
        for _ in range(5):
            async with self.engine.begin() as conn:
                session = AsyncSession(bind=conn)
                try:
                    result = await session.execute(
                        sa.text("""
                            SELECT * FROM science.validation_worker_claim_across_orgs(
                                'test-worker', 300
                            )
                        """)
                    )
                    row = result.mappings().first()
                    if row:
                        org_id = str(row["organization_id"])
                        processed_orgs.append(org_id)
                        await session.execute(
                            sa.text("SELECT set_config('app.organization_id', :v, true)"),
                            {"v": org_id}
                        )
                        await session.execute(
                            sa.text("SELECT set_config('app.user_id', :v, true)"),
                            {"v": user_a}
                        )
                        await session.execute(
                            sa.text("""
                                UPDATE science.validation_attempts
                                SET status = 'passed', completed_at = NOW(), updated_at = NOW()
                                WHERE id = CAST(:id AS uuid)
                                  AND organization_id = CAST(:org_id AS uuid)
                            """),
                            {"id": str(row["id"]), "org_id": org_id}
                        )
                    await session.commit()
                finally:
                    await session.close()

        self.assertEqual(len(processed_orgs), 5)
        self.assertIn(org_a, processed_orgs)
        self.assertIn(org_b, processed_orgs)
        self.assertEqual(processed_orgs.count(org_a), 2)
        self.assertEqual(processed_orgs.count(org_b), 3)

    async def test_worker_sets_correct_rls_context_per_attempt(self):
        org_a = str(uuid.uuid4())
        org_b = str(uuid.uuid4())
        user_id = str(uuid.uuid4())

        for org_id in [org_a, org_b]:
            ds_id = f"{org_id[:8]}-0000-0000-0000-000000000000"
            obj_id = f"{org_id[:8]}-0001-0000-0000-000000000000"
            proj_id = f"{org_id[:8]}-0002-0000-0000-000000000000"
            us_id = f"{org_id[:8]}-0003-0000-0000-000000000000"
            seed_full_org(self.super_conn, org_id, user_id, ds_id, obj_id, proj_id, us_id, test_inst=self)

        logged_contexts = []
        for _ in range(2):
            async with self.engine.begin() as conn:
                session = AsyncSession(bind=conn)
                try:
                    result = await session.execute(
                        sa.text("""
                            SELECT * FROM science.validation_worker_claim_across_orgs(
                                'test-worker', 300
                            )
                        """)
                    )
                    row = result.mappings().first()
                    if row:
                        org_id = str(row["organization_id"])
                        await session.execute(
                            sa.text("SELECT set_config('app.organization_id', :v, true)"),
                            {"v": org_id}
                        )
                        await session.execute(
                            sa.text("SELECT set_config('app.user_id', :v, true)"),
                            {"v": user_id}
                        )
                        ctx = await session.execute(
                            sa.text("SELECT current_setting('app.organization_id', true)")
                        )
                        current_org = ctx.scalar()
                        logged_contexts.append({
                            "claimed_org_id": org_id,
                            "context_org_id": current_org
                        })
                        await session.execute(
                            sa.text("""
                                UPDATE science.validation_attempts
                                SET status = 'passed', completed_at = NOW(), updated_at = NOW()
                                WHERE id = CAST(:id AS uuid)
                            """),
                            {"id": str(row["id"])}
                        )
                    await session.commit()
                finally:
                    await session.close()

        self.assertEqual(len(logged_contexts), 2)
        for log in logged_contexts:
            self.assertEqual(log["claimed_org_id"], log["context_org_id"])

    async def test_no_cross_tenant_leak(self):
        org_id = str(uuid.uuid4())
        user_id = str(uuid.uuid4())
        ds_id = str(uuid.uuid4())
        obj_id = str(uuid.uuid4())
        proj_id = str(uuid.uuid4())
        us_id = str(uuid.uuid4())

        seed_full_org(self.super_conn, org_id, user_id, ds_id, obj_id, proj_id, us_id, test_inst=self)

        attempt_id = None
        async with self.engine.begin() as conn:
            session = AsyncSession(bind=conn)
            try:
                result = await session.execute(
                    sa.text("""
                        SELECT * FROM science.validation_worker_claim_across_orgs(
                            'test-worker', 300
                        )
                    """)
                )
                row = result.mappings().first()
                self.assertIsNotNone(row)
                attempt_id = str(row["id"])

                await session.execute(
                    sa.text("SELECT set_config('app.organization_id', :v, true)"),
                    {"v": str(row["organization_id"])}
                )
                await session.execute(
                    sa.text("SELECT set_config('app.user_id', :v, true)"),
                    {"v": user_id}
                )

                with self.assertRaises(Exception) as cm:
                    await session.execute(
                        sa.text("""
                            SELECT governance.append_audit_event(
                                CAST(:wrong_org AS uuid),
                                CAST(:user_id AS uuid),
                                'validation.test',
                                'validation_attempt',
                                :attempt_id
                            )
                        """),
                        {
                            "wrong_org": "00000000-0000-0000-0000-000000000000",
                            "user_id": user_id,
                            "attempt_id": attempt_id
                        }
                    )
                self.assertIn("organization context mismatch", str(cm.exception).lower())
                await session.commit()
            finally:
                await session.close()

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

                result2 = await session.execute(
                    sa.text("""
                        SELECT governance.append_audit_event(
                            CAST(:org_id AS uuid),
                            CAST(:user_id AS uuid),
                            'validation.test',
                            'validation_attempt',
                            :attempt_id
                        )
                    """),
                    {
                        "org_id": org_id,
                        "user_id": user_id,
                        "attempt_id": attempt_id
                    }
                )
                audit_id = result2.scalar()
                self.assertIsNotNone(audit_id)
                await session.commit()
            finally:
                await session.close()

    async def test_terminal_failure_not_reclaimed(self):
        org_id = str(uuid.uuid4())
        user_id = str(uuid.uuid4())
        ds_id = str(uuid.uuid4())
        obj_id = str(uuid.uuid4())
        proj_id = str(uuid.uuid4())
        us_id = str(uuid.uuid4())

        seed_full_org(self.super_conn, org_id, user_id, ds_id, obj_id, proj_id, us_id,
                       dataset_status='invalid', attempt_status='failed_terminal', attempt_number=1, test_inst=self)
        seed_full_org(self.super_conn, org_id, user_id, ds_id, obj_id, proj_id, us_id,
                       dataset_status='invalid', attempt_status='quarantined', attempt_number=2, test_inst=self)
        seed_full_org(self.super_conn, org_id, user_id, ds_id, obj_id, proj_id, us_id,
                       dataset_status='invalid', attempt_status='cancelled', attempt_number=3, test_inst=self)

        async with self.engine.begin() as conn:
            session = AsyncSession(bind=conn)
            try:
                result = await session.execute(
                    sa.text("""
                        SELECT * FROM science.validation_worker_claim_across_orgs(
                            'test-worker', 300
                        )
                    """)
                )
                row = result.mappings().first()
                self.assertIsNone(row, "Terminal failed/quarantined/cancelled attempts must NOT be re-claimed")
                await session.commit()
            finally:
                await session.close()

    async def test_heartbeat_uses_attempt_org_id(self):
        org_id = str(uuid.uuid4())
        user_id = str(uuid.uuid4())
        ds_id = str(uuid.uuid4())
        obj_id = str(uuid.uuid4())
        proj_id = str(uuid.uuid4())
        us_id = str(uuid.uuid4())
        attempt_id = str(uuid.uuid4())

        seed_full_org(self.super_conn, org_id, user_id, ds_id, obj_id, proj_id, us_id,
                       dataset_status='validating', attempt_status='claimed',
                       attempt_id=attempt_id, test_inst=self)
        cur = self.super_conn.cursor()
        cur.execute("SET session_replication_role = 'replica'")
        cur.execute(
            "UPDATE science.validation_attempts SET claimed_by = 'test-worker', "
            "lock_expires_at = NOW() + INTERVAL '5 minutes' "
            "WHERE id = %s::uuid AND organization_id = %s::uuid",
            (attempt_id, org_id)
        )
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
                        SET lock_expires_at = NOW() + INTERVAL '5 minutes',
                            updated_at = NOW()
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

    async def test_reclaim_stale_no_double_reclaim(self):
        org_id = str(uuid.uuid4())
        user_id = str(uuid.uuid4())
        ds_id = str(uuid.uuid4())
        obj_id = str(uuid.uuid4())
        proj_id = str(uuid.uuid4())
        us_id = str(uuid.uuid4())

        seed_full_org(self.super_conn, org_id, user_id, ds_id, obj_id, proj_id, us_id,
                       attempt_status='claimed', test_inst=self)

        async with self.engine.begin() as conn1:
            async with self.engine.begin() as conn2:
                sess1 = AsyncSession(bind=conn1)
                sess2 = AsyncSession(bind=conn2)
                try:
                    r1 = await sess1.execute(
                        sa.text("SELECT * FROM science.validation_worker_reclaim_stale_across_orgs()")
                    )
                    r2 = await sess2.execute(
                        sa.text("SELECT * FROM science.validation_worker_reclaim_stale_across_orgs()")
                    )
                    row1 = r1.mappings().first()
                    row2 = r2.mappings().first()
                    if row1 and row2:
                        self.assertNotEqual(str(row1["id"]), str(row2["id"]))
                    await sess1.commit()
                    await sess2.commit()
                finally:
                    await sess1.close()
                    await sess2.close()

    async def test_transient_fail_retry_reclaim_pass(self):
        # Drain queue first to ensure isolation and prevent other stale test rows from interfering
        async with self.engine.begin() as conn:
            session = AsyncSession(bind=conn)
            try:
                while True:
                    res = await session.execute(sa.text(
                        "SELECT * FROM science.validation_worker_claim_across_orgs('drain-worker', 300)"
                    ))
                    if res.mappings().first() is None:
                        break
                await session.commit()
            finally:
                await session.close()

        org_id = str(uuid.uuid4())
        user_id = str(uuid.uuid4())
        ds_id = str(uuid.uuid4())
        obj_id = str(uuid.uuid4())
        proj_id = str(uuid.uuid4())
        us_id = str(uuid.uuid4())
        attempt_id = str(uuid.uuid4())

        seed_full_org(self.super_conn, org_id, user_id, ds_id, obj_id, proj_id, us_id,
                       dataset_status='pending_validation', attempt_status='queued',
                       attempt_id=attempt_id, test_inst=self)

        async with self.engine.begin() as conn:
            session = AsyncSession(bind=conn)
            try:
                result = await session.execute(
                    sa.text("""
                        SELECT * FROM science.validation_worker_claim_across_orgs(
                            'test-worker', 300
                        )
                    """)
                )
                row = result.mappings().first()
                self.assertIsNotNone(row)
                self.assertEqual(str(row["id"]), attempt_id)
                self.assertEqual(str(row["organization_id"]), org_id)

                claimed_org = str(row["organization_id"])
                self.assertEqual(claimed_org, org_id)

                await session.execute(
                    sa.text("SELECT set_config('app.organization_id', :v, true)"),
                    {"v": claimed_org}
                )
                await session.execute(
                    sa.text("SELECT set_config('app.user_id', :v, true)"),
                    {"v": user_id}
                )

                await session.execute(
                    sa.text("""
                        UPDATE science.validation_attempts
                        SET status = CAST('running' AS science.validation_attempt_status),
                            updated_at = NOW()
                        WHERE id = CAST(:id AS uuid)
                          AND organization_id = CAST(:org_id AS uuid)
                          AND status = CAST('claimed' AS science.validation_attempt_status)
                    """),
                    {"id": attempt_id, "org_id": claimed_org}
                )

                await session.execute(
                    sa.text("""
                        UPDATE science.validation_attempts
                        SET status = CAST('failed' AS science.validation_attempt_status),
                            failure_code = 'TRANSIENT_ERROR',
                            failure_details = CAST('{"reason":"simulated transient"}' AS jsonb),
                            next_retry_at = NOW() + (30 * power(2, LEAST(attempt_number - 1, 4))) * INTERVAL '1 second',
                            claimed_at = NULL,
                            claimed_by = NULL,
                            updated_at = NOW()
                        WHERE id = CAST(:id AS uuid)
                          AND organization_id = CAST(:org_id AS uuid)
                          AND status = CAST('running' AS science.validation_attempt_status)
                    """),
                    {"id": attempt_id, "org_id": claimed_org}
                )

                verify = await session.execute(
                    sa.text("""
                        SELECT status::text, next_retry_at, completed_at, failure_code
                        FROM science.validation_attempts
                        WHERE id = CAST(:id AS uuid)
                          AND organization_id = CAST(:org_id AS uuid)
                    """),
                    {"id": attempt_id, "org_id": claimed_org}
                )
                vrow = verify.mappings().first()
                self.assertEqual(vrow["status"], "failed")
                self.assertIsNotNone(vrow["next_retry_at"])
                self.assertIsNone(vrow["completed_at"])
                self.assertEqual(vrow["failure_code"], "TRANSIENT_ERROR")

                await session.execute(
                    sa.text("""
                        UPDATE science.validation_attempts
                        SET next_retry_at = NOW() - INTERVAL '1 second'
                        WHERE id = CAST(:id AS uuid)
                          AND organization_id = CAST(:org_id AS uuid)
                    """),
                    {"id": attempt_id, "org_id": claimed_org}
                )

                await session.commit()
            finally:
                await session.close()

        async with self.engine.begin() as conn:
            session = AsyncSession(bind=conn)
            try:
                result = await session.execute(
                    sa.text("""
                        SELECT * FROM science.validation_worker_claim_across_orgs(
                            'test-worker-2', 300
                        )
                    """)
                )
                row2 = result.mappings().first()
                self.assertIsNotNone(row2, "Retry attempt should be re-claimed after backoff expires")
                self.assertEqual(str(row2["id"]), attempt_id)
                self.assertEqual(str(row2["organization_id"]), org_id)

                re_org = str(row2["organization_id"])
                await session.execute(
                    sa.text("SELECT set_config('app.organization_id', :v, true)"),
                    {"v": re_org}
                )
                await session.execute(
                    sa.text("SELECT set_config('app.user_id', :v, true)"),
                    {"v": user_id}
                )

                await session.execute(
                    sa.text("""
                        UPDATE science.validation_attempts
                        SET status = CAST('passed' AS science.validation_attempt_status),
                            completed_at = NOW(),
                            server_checksum_sha256 = 'a' || repeat('0', 63),
                            byte_size_verified = 1024,
                            updated_at = NOW()
                        WHERE id = CAST(:id AS uuid)
                          AND organization_id = CAST(:org_id AS uuid)
                    """),
                    {"id": attempt_id, "org_id": re_org}
                )

                final = await session.execute(
                    sa.text("""
                        SELECT status::text, completed_at, attempt_number
                        FROM science.validation_attempts
                        WHERE id = CAST(:id AS uuid)
                          AND organization_id = CAST(:org_id AS uuid)
                    """),
                    {"id": attempt_id, "org_id": re_org}
                )
                frow = final.mappings().first()
                self.assertEqual(frow["status"], "passed")
                self.assertIsNotNone(frow["completed_at"])

                await session.commit()
            finally:
                await session.close()


if __name__ == "__main__":
    unittest.main()
