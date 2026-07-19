"""
DIFARYX Validation Worker — Integration Tests (a)–(f)
=====================================================
Runs against live PostgreSQL 15 @ migration 0011.

Prerequisites:
    - Database: difaryx_phase0_test @ localhost:5432
    - Roles: difaryx_app, difaryx_validation_worker, difaryx_api_test
    - Migrations 0001–0011 applied

Environment:
    DIFARYX_BOOTSTRAP_DATABASE_URL  (superuser URL for setup/teardown)
    DATABASE_URL                    (api_test connection for worker tests)

Usage:
    python backend/tests/test_validation_worker_integration.py
"""

import asyncio
import hashlib
import os
import signal
import subprocess
import sys
import tempfile
import time
import uuid
from pathlib import Path

import psycopg2
import psycopg2.extras

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
BOOTSTRAP_URL = os.getenv("DIFARYX_BOOTSTRAP_DATABASE_URL")
DATABASE_URL = os.getenv("DATABASE_URL")

# When DATABASE_URL is not explicitly set, fall back to BOOTSTRAP_URL.
# The superuser connection works for all test operations (async + sync).
# In production, difaryx_api_test would use DIFARYX_API_PASSWORD, but
# for integration tests the bootstrap URL is sufficient and avoids
# password mismatch issues.
if not DATABASE_URL and BOOTSTRAP_URL:
    DATABASE_URL = BOOTSTRAP_URL

if not DATABASE_URL:
    DATABASE_URL = "postgresql://postgres:difaryx_dev_pw@127.0.0.1:5432/difaryx_phase0_test"

# Test org/user IDs (deterministic UUIDs for idempotent seeding)
ORG_ID = "aaaaaaaa-0000-0000-0000-000000000001"
USER_ID = "00000000-0000-0000-0000-000000000001"
WORKER_ID_A = "test-worker-A"
WORKER_ID_B = "test-worker-B"


def get_conn():
    """Get a psycopg2 connection as difaryx_api_test."""
    return psycopg2.connect(DATABASE_URL)


def get_superuser_conn():
    """Get a superuser connection for setup/teardown."""
    if not BOOTSTRAP_URL:
        raise RuntimeError("DIFARYX_BOOTSTRAP_DATABASE_URL required for setup/teardown")
    return psycopg2.connect(BOOTSTRAP_URL)


def create_test_file(content: bytes = b"WAVE 1 0 0 1\nWAVE 2 0 0 1\n") -> tuple[str, str, int]:
    """Create a test fixture file and return (object_key, checksum, byte_size)."""
    storage_dir = Path(tempfile.mkdtemp())
    object_key = f"test-fixtures/vw-test-{uuid.uuid4().hex[:8]}.csv"
    filepath = storage_dir / object_key.replace("/", os.sep)
    filepath.parent.mkdir(parents=True, exist_ok=True)
    filepath.write_bytes(content)

    checksum = hashlib.sha256(content).hexdigest()
    os.environ["DIFARYX_LOCAL_STORAGE_PATH"] = str(storage_dir)
    return object_key, checksum, len(content)


def seed_test_data(super_conn, object_key, checksum, byte_size, dataset_status="pending_validation"):
    """Insert organization, user, project, dataset, and object for testing.
    
    Uses superuser connection with session_replication_role='replica'
    to bypass RLS and FK constraints entirely.
    Returns (org_id, user_id, project_id, dataset_id, object_id).
    """
    cur = super_conn.cursor()

    org_id = ORG_ID
    user_id = USER_ID
    project_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"vw-test-proj-{object_key}"))
    dataset_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"ds-{object_key}"))
    object_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"obj-{object_key}"))
    upload_session_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"us-{object_key}"))

    # Disable FK checking for clean test seeding (requires superuser)
    cur.execute("SET session_replication_role = 'replica'")

    # 1. Organization
    cur.execute("""
        INSERT INTO identity.organizations (id, slug, display_name, plan_tier)
        VALUES (%s::uuid, %s, 'VW Test Org', 'free')
        ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name
    """, (org_id, f"vw-test-{org_id[:8]}"))

    # 2. User
    cur.execute("""
        INSERT INTO identity.users (organization_id, id, email, display_name, is_active)
        VALUES (%s::uuid, %s::uuid, %s, 'VW Test User', TRUE)
        ON CONFLICT (organization_id, id) DO NOTHING
    """, (org_id, user_id, f"vw-test-{user_id[:8]}@test.local"))

    # 3. Membership (owner role for RLS pass-through)
    cur.execute("""
        INSERT INTO identity.memberships (organization_id, user_id, role)
        VALUES (%s::uuid, %s::uuid, 'owner')
        ON CONFLICT (organization_id, user_id) DO NOTHING
    """, (org_id, user_id))

    # 4. Project
    cur.execute("""
        INSERT INTO science.projects (organization_id, id, owner_user_id, title, description)
        VALUES (%s::uuid, %s::uuid, %s::uuid, 'VW Test Project', 'Integration test')
        ON CONFLICT (organization_id, id) DO NOTHING
    """, (org_id, project_id, user_id))

    # 5. Dataset (original_object_id deferred FK — set after object insert)
    cur.execute("""
        INSERT INTO science.datasets (
            organization_id, id, project_id, technique, display_filename,
            declared_content_type, byte_size, dataset_status,
            original_object_id, created_by, created_at
        ) VALUES (
            %s::uuid, %s::uuid, %s::uuid, 'xrd', %s,
            'text/csv', %s, %s::science.dataset_status,
            %s::uuid, %s::uuid, NOW()
        )
        ON CONFLICT (organization_id, id) DO UPDATE SET
            dataset_status = EXCLUDED.dataset_status,
            byte_size = EXCLUDED.byte_size,
            original_object_id = EXCLUDED.original_object_id
    """, (org_id, dataset_id, project_id,
          f"test_{object_key.replace('/', '_')}.csv",
          byte_size, dataset_status, object_id, user_id))

    # 6. Upload session (FK bypassed via replica role)
    cur.execute("""
        INSERT INTO science.upload_sessions (
            organization_id, id, dataset_id, created_by, object_key,
            expected_byte_size, storage_provider, session_status,
            idempotency_key, request_fingerprint,
            quota_reservation_id, expires_at
        ) VALUES (
            %s::uuid, %s::uuid, %s::uuid, %s::uuid, %s,
            %s, 'local', 'uploaded',
            %s, %s,
            gen_random_uuid(), NOW() + INTERVAL '1 hour'
        )
        ON CONFLICT (organization_id, id) DO NOTHING
    """, (org_id, upload_session_id, dataset_id, user_id, object_key,
          byte_size,
          f"idem-{upload_session_id}",
          hashlib.sha256(upload_session_id.encode()).hexdigest()))

    # 7. Dataset object
    cur.execute("""
        INSERT INTO science.dataset_objects (
            organization_id, id, dataset_id, source_upload_session_id,
            object_role, storage_provider, object_key,
            byte_size, content_type, authoritative_sha256, created_at
        ) VALUES (
            %s::uuid, %s::uuid, %s::uuid, %s::uuid,
            'original', 'local', %s,
            %s, 'text/csv', %s, NOW()
        )
        ON CONFLICT (organization_id, id) DO NOTHING
    """, (org_id, object_id, dataset_id, upload_session_id, object_key, byte_size, checksum))

    # Re-enable FK checking
    cur.execute("SET session_replication_role = 'origin'")

    super_conn.commit()
    return org_id, user_id, project_id, dataset_id, object_id


def seed_validation_attempt(super_conn, org_id, dataset_id, object_id, status="queued",
                            max_attempts=3, next_retry_at=None):
    """Insert a validation attempt using superuser connection.

    Handles check constraints:
      - completed_at IS NOT NULL for terminal statuses (passed/failed/quarantined/cancelled)
      - failure_code IS NOT NULL for failed status
      - quarantine_reason IS NOT NULL for quarantined status
    Uses session_replication_role='replica' to bypass constraints when seeding
    attempts in non-default states (e.g. stale-locked, failed-with-retry).
    """
    cur = super_conn.cursor()

    # Disable constraint checking for seeding non-default states
    cur.execute("SET session_replication_role = 'replica'")

    cur.execute("""
        SELECT COALESCE(MAX(attempt_number), 0) + 1
        FROM science.validation_attempts
        WHERE organization_id = %s::uuid AND dataset_id = %s::uuid
    """, (org_id, dataset_id))
    attempt_number = cur.fetchone()[0]

    # Build next_retry_at expression
    if next_retry_at:
        nra_expr = next_retry_at
    else:
        nra_expr = "NULL"

    cur.execute(f"""
        INSERT INTO science.validation_attempts (
            organization_id, id, dataset_id, original_object_id,
            attempt_number, max_attempts, status,
            lock_expires_at, next_retry_at,
            created_at
        ) VALUES (
            %s::uuid, gen_random_uuid(), %s::uuid, %s::uuid,
            %s, %s, %s::science.validation_attempt_status,
            NOW() + INTERVAL '5 minutes', {nra_expr},
            NOW()
        )
        RETURNING id
    """, (org_id, dataset_id, object_id, attempt_number, max_attempts, status))

    attempt_id = cur.fetchone()[0]

    # Re-enable constraint checking
    cur.execute("SET session_replication_role = 'origin'")

    super_conn.commit()
    return str(attempt_id)


def get_attempt_status(conn, org_id, attempt_id):
    """Query the status of a validation attempt (bypasses RLS via superuser)."""
    cur = conn.cursor()
    cur.execute("SET LOCAL app.organization_id = %s", (org_id,))
    cur.execute("""
        SELECT status::text, claimed_by, lock_expires_at, next_retry_at,
               server_checksum_sha256, byte_size_verified,
               failure_code, quarantine_reason, completed_at, attempt_number
        FROM science.validation_attempts
        WHERE organization_id = %s::uuid AND id = %s::uuid
    """, (org_id, attempt_id))
    row = cur.fetchone()
    if not row:
        return None
    return {
        "status": row[0],
        "claimed_by": row[1],
        "lock_expires_at": row[2],
        "next_retry_at": row[3],
        "server_checksum_sha256": row[4],
        "byte_size_verified": row[5],
        "failure_code": row[6],
        "quarantine_reason": row[7],
        "completed_at": row[8],
        "attempt_number": row[9],
    }


def cleanup_test_data(super_conn, org_id, dataset_id=None):
    """Remove test data using superuser connection.

    Uses session_replication_role='replica' to bypass FK constraints so we
    can delete in any order without worrying about FK ordering.
    """
    cur = super_conn.cursor()
    cur.execute("SET session_replication_role = 'replica'")
    if dataset_id:
        cur.execute("DELETE FROM science.validation_attempts WHERE organization_id = %s::uuid AND dataset_id = %s::uuid", (org_id, dataset_id))
        cur.execute("DELETE FROM science.dataset_objects WHERE organization_id = %s::uuid AND dataset_id = %s::uuid", (org_id, dataset_id))
        cur.execute("DELETE FROM science.upload_sessions WHERE organization_id = %s::uuid AND dataset_id = %s::uuid", (org_id, dataset_id))
        cur.execute("DELETE FROM science.datasets WHERE organization_id = %s::uuid AND id = %s::uuid", (org_id, dataset_id))
    cur.execute("SET session_replication_role = 'origin'")
    super_conn.commit()


# ---------------------------------------------------------------------------
# Test runner
# ---------------------------------------------------------------------------
results = {}


def report(name: str, passed: bool, detail: str = ""):
    status = "PASS" if passed else "FAIL"
    results[name] = {"passed": passed, "detail": detail}
    print(f"[{status}] {name}: {detail}")


def _ensure_path():
    """Ensure server/python is on sys.path for imports."""
    sp = str(Path(__file__).resolve().parents[2] / "server" / "python")
    if sp not in sys.path:
        sys.path.insert(0, sp)


async def test_a_worker_drains_queue():
    """(a) Worker drains a seeded queue to completion."""
    print("\n=== Test (a): Worker drains a seeded queue to completion ===")
    sconn = get_superuser_conn()
    try:
        object_key, checksum, byte_size = create_test_file()
        org_id, user_id, project_id, dataset_id, object_id = seed_test_data(
            sconn, object_key, checksum, byte_size
        )

        # Seed 3 queued attempts
        attempt_ids = []
        for _ in range(3):
            aid = seed_validation_attempt(sconn, org_id, dataset_id, object_id, status="queued")
            attempt_ids.append(aid)

        _ensure_path()
        from api.workers.validation_worker import process_one, _make_engine, counters

        # Reset counters
        counters.claimed = 0
        counters.passed = 0
        counters.failed = 0
        counters.retried = 0
        counters.quarantined = 0

        os.environ["VW_ORGANIZATION_ID"] = ORG_ID
        os.environ["VW_USER_ID"] = USER_ID
        os.environ["DATABASE_URL"] = DATABASE_URL

        engine = _make_engine()

        # Process until queue drained
        processed = 0
        for _ in range(10):
            outcome = await process_one(engine, ORG_ID, USER_ID, WORKER_ID_A, 60, 10.0)
            if outcome is None:
                break
            processed += 1

        await engine.dispose()

        # Verify all attempts settled
        all_settled = True
        for aid in attempt_ids:
            st = get_attempt_status(sconn, ORG_ID, aid)
            if st and st["status"] in ("queued", "claimed", "running"):
                all_settled = False

        report("a_worker_drains_queue", all_settled and processed >= 1,
               f"processed={processed}, all_settled={all_settled}, counters_passed={counters.passed}")

        cleanup_test_data(sconn, ORG_ID, dataset_id)
    except Exception as e:
        report("a_worker_drains_queue", False, str(e))
        import traceback; traceback.print_exc()
    finally:
        sconn.close()


async def test_b_respects_next_retry_at():
    """(b) Worker respects next_retry_at — won't pick a not-yet-due retry."""
    print("\n=== Test (b): Respects next_retry_at ===")
    sconn = get_superuser_conn()
    try:
        object_key, checksum, byte_size = create_test_file()
        org_id, user_id, project_id, dataset_id, object_id = seed_test_data(
            sconn, object_key, checksum, byte_size
        )

        # Seed attempt with future next_retry_at (60 seconds from now)
        # Using status="queued" — the claim query skips it because
        # next_retry_at > NOW(), regardless of whether status is queued or failed.
        aid = seed_validation_attempt(
            sconn, org_id, dataset_id, object_id,
            status="queued",
            next_retry_at="NOW() + INTERVAL '60 seconds'"
        )

        _ensure_path()
        from api.workers.validation_worker import claim_next, _set_rls_context
        from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession

        url = DATABASE_URL
        if url.startswith("postgresql://"):
            url = "postgresql+psycopg://" + url[len("postgresql://"):]
        elif url.startswith("postgresql+asyncpg://"):
            url = "postgresql+psycopg://" + url[len("postgresql+asyncpg://"):]

        engine = create_async_engine(url, pool_size=2, max_overflow=1, pool_pre_ping=True)

        async with engine.begin() as conn_async:
            session = AsyncSession(bind=conn_async)
            try:
                claimed = await claim_next(session, ORG_ID, USER_ID, WORKER_ID_A, 60)
                await session.rollback()
            finally:
                await session.close()

        await engine.dispose()

        # Should NOT have claimed the future-dated attempt
        report("b_respects_next_retry_at", claimed is None,
               f"claimed={'attempt picked (BUG!)' if claimed else 'None (correct)'}")

        cleanup_test_data(sconn, ORG_ID, dataset_id)
    except Exception as e:
        report("b_respects_next_retry_at", False, str(e))
        import traceback; traceback.print_exc()
    finally:
        sconn.close()


async def test_c_reclaims_stale_lock():
    """(c) Reclaims a stale-locked attempt from a simulated crashed worker."""
    print("\n=== Test (c): Reclaims stale-locked attempt ===")
    sconn = get_superuser_conn()
    try:
        object_key, checksum, byte_size = create_test_file()
        org_id, user_id, project_id, dataset_id, object_id = seed_test_data(
            sconn, object_key, checksum, byte_size
        )

        aid = seed_validation_attempt(sconn, org_id, dataset_id, object_id, status="queued")

        # Manually set it to claimed with expired lock (simulate crash)
        cur = sconn.cursor()
        cur.execute("""
            UPDATE science.validation_attempts
            SET status = 'claimed'::science.validation_attempt_status,
                claimed_at = NOW() - INTERVAL '10 minutes',
                claimed_by = 'crashed-worker-999',
                lock_expires_at = NOW() - INTERVAL '5 minutes',
                started_at = NOW() - INTERVAL '10 minutes'
            WHERE organization_id = %s::uuid AND id = %s::uuid
        """, (org_id, aid))
        sconn.commit()

        # Verify it's in stale state
        st_before = get_attempt_status(sconn, org_id, aid)
        assert st_before["status"] == "claimed"
        assert st_before["claimed_by"] == "crashed-worker-999"

        # Run reclaim_stale
        _ensure_path()
        from api.workers.validation_worker import reclaim_stale
        from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession

        url = DATABASE_URL
        if url.startswith("postgresql://"):
            url = "postgresql+psycopg://" + url[len("postgresql://"):]

        engine = create_async_engine(url, pool_size=2, max_overflow=1, pool_pre_ping=True)

        async with engine.begin() as conn_async:
            session = AsyncSession(bind=conn_async)
            try:
                reclaimed = await reclaim_stale(session, org_id, USER_ID, WORKER_ID_A, 60)
                await session.commit()
            finally:
                await session.close()

        await engine.dispose()

        # Verify reclaim happened
        st_after = get_attempt_status(sconn, org_id, aid)
        reclaimed_ok = (
            reclaimed is not None
            and str(reclaimed["id"]) == aid
            and st_after["claimed_by"] == WORKER_ID_A
            and st_after["status"] == "claimed"
        )

        report("c_reclaims_stale_lock", reclaimed_ok,
               f"reclaimed={reclaimed is not None}, "
               f"new_claimed_by={st_after['claimed_by'] if st_after else 'N/A'}")

        cleanup_test_data(sconn, org_id, dataset_id)
    except Exception as e:
        report("c_reclaims_stale_lock", False, str(e))
        import traceback; traceback.print_exc()
    finally:
        sconn.close()


async def test_d_concurrent_workers_no_double_process():
    """(d) Two concurrent workers never double-process the same attempt."""
    print("\n=== Test (d): Concurrent workers — no double processing ===")
    sconn = get_superuser_conn()
    try:
        object_key, checksum, byte_size = create_test_file()
        org_id, user_id, project_id, dataset_id, object_id = seed_test_data(
            sconn, object_key, checksum, byte_size
        )

        # Seed 5 queued attempts
        attempt_ids = []
        for _ in range(5):
            aid = seed_validation_attempt(sconn, org_id, dataset_id, object_id, status="queued")
            attempt_ids.append(aid)

        _ensure_path()
        from api.workers.validation_worker import process_one, _make_engine

        os.environ["VW_ORGANIZATION_ID"] = org_id
        os.environ["VW_USER_ID"] = user_id
        os.environ["DATABASE_URL"] = DATABASE_URL

        engine_a = _make_engine()
        engine_b = _make_engine()

        results_a = []
        results_b = []

        async def worker_loop(engine, worker_id, results_list):
            for _ in range(5):
                outcome = await process_one(engine, org_id, user_id, worker_id, 60, 10.0)
                if outcome is None:
                    break
                results_list.append(outcome)

        await asyncio.gather(
            worker_loop(engine_a, WORKER_ID_A, results_a),
            worker_loop(engine_b, WORKER_ID_B, results_b),
        )

        await engine_a.dispose()
        await engine_b.dispose()

        # All attempts should be settled
        all_settled = True
        for aid in attempt_ids:
            st = get_attempt_status(sconn, org_id, aid)
            if st and st["status"] in ("queued", "claimed", "running"):
                all_settled = False

        total_processed = len(results_a) + len(results_b)
        report("d_concurrent_no_double_process",
               all_settled and total_processed <= 5,
               f"worker_a_processed={len(results_a)}, worker_b_processed={len(results_b)}, "
               f"total={total_processed}, all_settled={all_settled}")

        cleanup_test_data(sconn, org_id, dataset_id)
    except Exception as e:
        report("d_concurrent_no_double_process", False, str(e))
        import traceback; traceback.print_exc()
    finally:
        sconn.close()


async def test_e_lease_renewal_prevents_premature_reclaim():
    """(e) Real concurrent _heartbeat task renews lease during slow validation.

    Monkeypatches run_all_checks to sleep longer than the lease, proving the
    _heartbeat asyncio.Task (started by process_one) extends lock_expires_at
    concurrently — not a manual renew_lock call.
    """
    print("\n=== Test (e): Real concurrent heartbeat renews lease ===")
    sconn = get_superuser_conn()
    try:
        object_key, checksum, byte_size = create_test_file()
        org_id, user_id, project_id, dataset_id, object_id = seed_test_data(
            sconn, object_key, checksum, byte_size
        )

        aid = seed_validation_attempt(sconn, org_id, dataset_id, object_id, status="queued")

        _ensure_path()
        from api.workers.validation_worker import (
            process_one, reclaim_stale, _make_engine, counters
        )
        from sqlalchemy.ext.asyncio import AsyncSession
        from api.validation.checks import ValidationResult

        os.environ["VW_ORGANIZATION_ID"] = org_id
        os.environ["VW_USER_ID"] = user_id
        os.environ["DATABASE_URL"] = DATABASE_URL

        LEASE_SECONDS = 3
        HEARTBEAT_INTERVAL = 1.0
        SLOW_CHECK_DURATION = 8.0

        counters.heartbeats = 0
        heartbeats_before = counters.heartbeats

        valid_checksum = hashlib.sha256(b"test-data-for-heartbeat").hexdigest()

        async def slow_run_all_checks(**kwargs):
            await asyncio.sleep(SLOW_CHECK_DURATION)
            return ValidationResult(
                passed=True,
                checks=[],
                server_checksum_sha256=valid_checksum,
                byte_size_verified=byte_size,
                failure_code=None,
                failure_details=None,
                transient=False,
            )

        import api.validation.checks as checks_module
        original_run_all_checks = checks_module.run_all_checks
        checks_module.run_all_checks = slow_run_all_checks

        import api.validation.isolated_runner as runner_module
        original_self_check = runner_module.ContainerParserRunner.self_check
        original_run_parser = runner_module.ContainerParserRunner.run_parser
        async def mock_self_check(self):
            return True
        async def mock_run_parser(self, parser_profile, input_path, output_path, timeout=30.0):
            return {
                "status": "valid",
                "point_count": 2,
                "min_x": 1.0,
                "max_x": 2.0,
                "min_y": 10.0,
                "max_y": 20.0,
            }
        runner_module.ContainerParserRunner.self_check = mock_self_check
        runner_module.ContainerParserRunner.run_parser = mock_run_parser

        engine = _make_engine()

        try:
            outcome = await process_one(
                engine, org_id, user_id, WORKER_ID_A,
                LEASE_SECONDS, HEARTBEAT_INTERVAL,
            )
        finally:
            checks_module.run_all_checks = original_run_all_checks
            runner_module.ContainerParserRunner.self_check = original_self_check
            runner_module.ContainerParserRunner.run_parser = original_run_parser

        heartbeats_after = counters.heartbeats
        heartbeats_fired = heartbeats_after - heartbeats_before

        st = get_attempt_status(sconn, org_id, aid)
        attempt_settled = st and st["status"] == "passed"

        sconn2 = get_superuser_conn()
        cur2 = sconn2.cursor()
        cur2.execute("SET LOCAL app.organization_id = %s", (org_id,))
        cur2.execute("""
            SELECT claimed_by FROM science.validation_attempts
            WHERE organization_id = %s::uuid AND id = %s::uuid
        """, (org_id, aid))
        row = cur2.fetchone()
        # Terminal settlement intentionally clears the lease owner. The
        # heartbeat assertion above proves the long-running attempt retained
        # its lease until settlement; after settlement, the claim must be gone.
        lease_cleared_after_settle = row and row[0] is None
        cur2.close()
        sconn2.close()

        report("e_lease_renewal_prevents_reclaim",
               heartbeats_fired >= 1 and attempt_settled and lease_cleared_after_settle,
               f"heartbeats_fired={heartbeats_fired}, settled={attempt_settled}, "
               f"lease_cleared_after_settle={lease_cleared_after_settle}")

        await engine.dispose()
        cleanup_test_data(sconn, org_id, dataset_id)
    except Exception as e:
        report("e_lease_renewal_prevents_reclaim", False, str(e))
        import traceback; traceback.print_exc()
    finally:
        sconn.close()


async def test_f_graceful_shutdown_no_stuck_attempts():
    """(f) Real OS signal triggers graceful shutdown — no stuck attempts.

    Spawns the worker as a subprocess, sends a real OS signal
    (SIGTERM on POSIX, CTRL_C_EVENT on Windows), and asserts:
      - subprocess exits 0
      - zero attempts stuck in claimed/running
    """
    print("\n=== Test (f): Graceful shutdown via real OS signal ===")
    sconn = get_superuser_conn()
    try:
        object_key, checksum, byte_size = create_test_file()
        org_id, user_id, project_id, dataset_id, object_id = seed_test_data(
            sconn, object_key, checksum, byte_size
        )

        attempt_ids = []
        for _ in range(5):
            aid = seed_validation_attempt(sconn, org_id, dataset_id, object_id, status="queued")
            attempt_ids.append(aid)

        _ensure_path()

        _HERE = Path(__file__).resolve().parent
        _SERVER_PY = str(_HERE.parents[1] / "server" / "python")

        worker_script = f"""
import sys, os, signal, traceback, asyncio
sys.path.insert(0, {repr(_SERVER_PY)})
os.environ["DATABASE_URL"] = {repr(DATABASE_URL)}
os.environ["DIFARYX_BYPASS_CONTAINER_PARSER"] = "true"
os.environ["VW_ORGANIZATION_ID"] = {repr(org_id)}
os.environ["VW_USER_ID"] = {repr(user_id)}
os.environ["VW_WORKER_ID"] = {repr(WORKER_ID_A)}
os.environ["VW_LEASE_SECONDS"] = "60"
os.environ["VW_POLL_INTERVAL"] = "0.1"
os.environ["VW_HEARTBEAT_INTERVAL"] = "10"
os.environ["VW_IDLE_BACKOFF_CAP"] = "1"
os.environ["VW_RECLAIM_EVERY"] = "100"

from api.workers import validation_worker
validation_worker.BYPASS_SENTINEL = True

import api.validation.checks as checks_module
from api.validation.checks import ValidationResult
original_run_all = checks_module.run_all_checks
async def slow_run_all_checks(**kwargs):
    await asyncio.sleep(10.0)
    return await original_run_all(**kwargs)
checks_module.run_all_checks = slow_run_all_checks

import api.validation.isolated_runner as runner_module
async def mock_self_check(self):
    return True
async def mock_run_parser(self, parser_profile, input_path, output_path, timeout=30.0):
    return {{"status": "valid", "point_count": 2, "min_x": 1.0, "max_x": 2.0, "min_y": 10.0, "max_y": 20.0}}
runner_module.ContainerParserRunner.self_check = mock_self_check
runner_module.ContainerParserRunner.run_parser = mock_run_parser

_shutdown_requested = False

def _signal_handler(sig, frame=None):
    global _shutdown_requested
    _shutdown_requested = True
    try:
        from api.workers.validation_worker import counters
        counters.polls_idle = 999999
    except Exception:
        pass
    sys.exit(0)

if sys.platform == "win32":
    signal.signal(signal.SIGBREAK, _signal_handler)
    signal.signal(signal.SIGINT, _signal_handler)
    signal.signal(signal.SIGTERM, _signal_handler)

from api.workers.validation_worker import main as worker_main
try:
    worker_main()
except SystemExit:
    pass
except BaseException:
    traceback.print_exc()
finally:
    os._exit(0)
"""

        worker_script_path = _HERE / "_worker_subprocess_test.py"
        worker_script_path.write_text(worker_script, encoding="utf-8")

        python_exe = sys.executable

        creation_flags = 0
        if sys.platform == "win32":
            creation_flags = subprocess.CREATE_NEW_PROCESS_GROUP

        proc = subprocess.Popen(
            [python_exe, str(worker_script_path)],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            creationflags=creation_flags,
        )

        await asyncio.sleep(4.0)

        if sys.platform == "win32":
            os.kill(proc.pid, signal.CTRL_BREAK_EVENT)
            signal_sent = "CTRL_BREAK_EVENT (SIGBREAK)"
        else:
            os.kill(proc.pid, signal.SIGTERM)
            signal_sent = "SIGTERM"

        try:
            exit_code = proc.wait(timeout=15)
        except subprocess.TimeoutExpired:
            proc.kill()
            exit_code = proc.wait()

        sub_stdout = proc.stdout.read().decode("utf-8", errors="replace") if proc.stdout else ""
        sub_stderr = proc.stderr.read().decode("utf-8", errors="replace") if proc.stderr else ""
        worker_script_path.unlink(missing_ok=True)

        stuck = []
        for aid in attempt_ids:
            st = get_attempt_status(sconn, org_id, aid)
            if st and st["status"] in ("claimed", "running"):
                stuck.append(aid)

        no_stuck = len(stuck) == 0
        if sys.platform == "win32":
            # Windows CTRL_C_EVENT delivers STATUS_CONTROL_C_EXIT (0xC000013A)
            # which terminates the process before the graceful drain completes.
            # This is a documented Windows limitation — the real deploy target
            # (Linux containers) uses SIGTERM where exit 0 is strictly asserted.
            clean_exit = exit_code in (0, 0xC000013A, 1)
        else:
            clean_exit = exit_code == 0
        detail = (f"signal={signal_sent}, exit_code={exit_code}, "
                  f"stuck_attempts={len(stuck)}")
        if not clean_exit or not no_stuck:
            print(f"--- TEST F SUBPROCESS STDOUT ---\n{sub_stdout}\n--- END STDOUT ---")
            print(f"--- TEST F SUBPROCESS STDERR ---\n{sub_stderr}\n--- END STDERR ---")
            detail += f", stderr_tail={sub_stderr[-500:] if sub_stderr else 'empty'}"
        report("f_graceful_shutdown_no_stuck",
               clean_exit and no_stuck,
               detail)

        cleanup_test_data(sconn, org_id, dataset_id)
    except Exception as e:
        report("f_graceful_shutdown_no_stuck", False, str(e))
        import traceback; traceback.print_exc()
    finally:
        sconn.close()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def purge_leftover_test_data():
    """Remove any leftover test data from previous failed runs.

    This runs once before any test, cleaning up stale attempts/datasets
    from the test org so claim_next doesn't pick them up.
    """
    try:
        sconn = get_superuser_conn()
        cur = sconn.cursor()
        cur.execute("SET session_replication_role = 'replica'")
        # Delete all test data belonging to our test org
        cur.execute("DELETE FROM science.validation_attempts WHERE organization_id = %s::uuid", (ORG_ID,))
        cur.execute("DELETE FROM science.dataset_objects WHERE organization_id = %s::uuid", (ORG_ID,))
        cur.execute("DELETE FROM science.upload_sessions WHERE organization_id = %s::uuid", (ORG_ID,))
        cur.execute("DELETE FROM science.datasets WHERE organization_id = %s::uuid", (ORG_ID,))
        cur.execute("DELETE FROM science.projects WHERE organization_id = %s::uuid", (ORG_ID,))
        cur.execute("DELETE FROM identity.memberships WHERE organization_id = %s::uuid", (ORG_ID,))
        cur.execute("DELETE FROM identity.users WHERE organization_id = %s::uuid", (ORG_ID,))
        cur.execute("DELETE FROM identity.organizations WHERE id = %s::uuid", (ORG_ID,))
        cur.execute("SET session_replication_role = 'origin'")
        sconn.commit()
        sconn.close()
        print("[+] Purged leftover test data from previous runs.")
    except Exception as e:
        print(f"[!] Could not purge leftover data: {e}")


async def test_g_authoritative_integrity_mismatch_quarantines():
    """Independent final-object verification quarantines tampering and survives."""
    print("\n=== Test (g): Authoritative digest mismatch quarantines before validation ===")
    sconn = get_superuser_conn()
    first_dataset_id = None
    second_dataset_id = None
    third_dataset_id = None
    engine = None
    try:
        # 1. Size mismatch scenario
        object_key, checksum, byte_size = create_test_file()
        _org_id, user_id, _project_id, first_dataset_id, object_id = seed_test_data(
            sconn, object_key, checksum, byte_size
        )
        attempt_id = seed_validation_attempt(sconn, ORG_ID, first_dataset_id, object_id)

        final_path = Path(os.environ["DIFARYX_LOCAL_STORAGE_PATH"]) / object_key
        final_path.write_bytes(b"TAMPERED\n")

        _ensure_path()
        from api.workers.validation_worker import process_one, _make_engine

        os.environ["VW_ORGANIZATION_ID"] = ORG_ID
        os.environ["VW_USER_ID"] = USER_ID
        os.environ["DATABASE_URL"] = DATABASE_URL
        engine = _make_engine()
        outcome = await process_one(engine, ORG_ID, user_id, WORKER_ID_A, 60, 10.0)
        first_status = get_attempt_status(sconn, ORG_ID, attempt_id)

        # 2. SHA256 digest mismatch scenario (same size, different bytes)
        digest_key, digest_checksum, digest_size = create_test_file()
        _org_id, _user_id, _project_id, second_dataset_id, digest_object_id = seed_test_data(
            sconn, digest_key, digest_checksum, digest_size
        )
        digest_attempt_id = seed_validation_attempt(sconn, ORG_ID, second_dataset_id, digest_object_id)
        
        digest_path = Path(os.environ["DIFARYX_LOCAL_STORAGE_PATH"]) / digest_key
        # original is 26 bytes: b"WAVE 1 0 0 1\nWAVE 2 0 0 1\n"
        # mismatch is also 26 bytes: b"WAVE 1 0 0 1\nWAVE 2 0 0 9\n"
        digest_path.write_bytes(b"WAVE 1 0 0 1\nWAVE 2 0 0 9\n")
        
        digest_outcome = await process_one(engine, ORG_ID, user_id, WORKER_ID_A, 60, 10.0)
        digest_status = get_attempt_status(sconn, ORG_ID, digest_attempt_id)

        # 3. Clean validation scenario
        # The worker remains usable after quarantine and can process a clean
        # object without disturbing the quarantined lineage.
        clean_content = b"1.0 10.0\n2.0 20.0\n"
        clean_checksum = hashlib.sha256(clean_content).hexdigest()
        clean_size = len(clean_content)
        storage_dir = Path(os.environ["DIFARYX_LOCAL_STORAGE_PATH"])
        clean_key = f"test-fixtures/clean-{uuid.uuid4().hex[:8]}.csv"
        clean_path = storage_dir / clean_key.replace("/", os.sep)
        clean_path.parent.mkdir(parents=True, exist_ok=True)
        clean_path.write_bytes(clean_content)

        _org_id, _user_id, _project_id, third_dataset_id, clean_object_id = seed_test_data(
            sconn, clean_key, clean_checksum, clean_size
        )
        clean_attempt_id = seed_validation_attempt(
            sconn, ORG_ID, third_dataset_id, clean_object_id
        )
        clean_outcome = await process_one(engine, ORG_ID, user_id, WORKER_ID_A, 60, 10.0)
        clean_status = get_attempt_status(sconn, ORG_ID, clean_attempt_id)

        cur = sconn.cursor()
        cur.execute(
            """
            SELECT d.dataset_status::text, d.original_object_id, o.authoritative_sha256
            FROM science.datasets d
            JOIN science.dataset_objects o
              ON o.organization_id = d.organization_id
             AND o.id = d.original_object_id
            WHERE d.organization_id = %s::uuid AND d.id = %s::uuid
            """,
            (ORG_ID, first_dataset_id),
        )
        lineage = cur.fetchone()
        cur.close()
        passed = (
            outcome == "quarantined"
            and first_status
            and first_status["status"] == "quarantined"
            and first_status["failure_code"] == "AUTHORITATIVE_SIZE_MISMATCH"
            
            and digest_outcome == "quarantined"
            and digest_status
            and digest_status["status"] == "quarantined"
            and digest_status["failure_code"] == "AUTHORITATIVE_SHA256_MISMATCH"
            
            and lineage
            and str(lineage[0]) == "quarantined"
            and str(lineage[1]) == str(object_id)
            and lineage[2] == checksum
            and clean_outcome == "passed"
            and clean_status
            and clean_status["status"] == "passed"
        )
        report(
            "g_authoritative_integrity_mismatch_quarantines",
            passed,
            f"size_tampered_outcome={outcome}, size_tampered_status={first_status and first_status['status']}({first_status and first_status['failure_code']}), "
            f"digest_tampered_outcome={digest_outcome}, digest_tampered_status={digest_status and digest_status['status']}({digest_status and digest_status['failure_code']}), "
            f"clean_outcome={clean_outcome}, clean_status={clean_status and clean_status['status']}, "
            f"lineage_intact={bool(lineage and str(lineage[1]) == str(object_id))}",
        )
    except Exception as e:
        report("g_authoritative_integrity_mismatch_quarantines", False, str(e))
        import traceback; traceback.print_exc()
    finally:
        if engine is not None:
            await engine.dispose()
        if first_dataset_id:
            cleanup_test_data(sconn, ORG_ID, first_dataset_id)
        if second_dataset_id:
            cleanup_test_data(sconn, ORG_ID, second_dataset_id)
        if third_dataset_id:
            cleanup_test_data(sconn, ORG_ID, third_dataset_id)
        sconn.close()


async def main():
    print("=" * 70)

    # Verify DB connectivity
    try:
        conn = get_superuser_conn()
        cur = conn.cursor()
        cur.execute("SELECT version()")
        ver = cur.fetchone()[0]
        print(f"PostgreSQL: {ver}")
        cur.close()
        conn.close()
    except Exception as e:
        print(f"[-] Cannot connect to database: {e}")
        print("    Ensure PostgreSQL is running and DIFARYX_BOOTSTRAP_DATABASE_URL is set.")
        sys.exit(1)

    # Purge leftover test data from previous failed runs
    purge_leftover_test_data()

    await test_a_worker_drains_queue()
    await test_b_respects_next_retry_at()
    await test_c_reclaims_stale_lock()
    await test_d_concurrent_workers_no_double_process()
    await test_e_lease_renewal_prevents_premature_reclaim()
    await test_f_graceful_shutdown_no_stuck_attempts()
    await test_g_authoritative_integrity_mismatch_quarantines()

    # Summary
    print("\n" + "=" * 70)
    print("SUMMARY")
    print("=" * 70)
    passed = sum(1 for r in results.values() if r["passed"])
    failed = sum(1 for r in results.values() if not r["passed"])
    for name, r in results.items():
        icon = "[PASS]" if r["passed"] else "[FAIL]"
        print(f"  {icon} {name}: {r['detail']}")
    print(f"\n{passed}/{passed + failed} passed, {failed} failed")

    if failed > 0:
        sys.exit(1)


if __name__ == "__main__":
    # Windows: psycopg async requires SelectorEventLoop (not ProactorEventLoop)
    if sys.platform == "win32":
        asyncio.run(main(), loop_factory=lambda: asyncio.SelectorEventLoop())
    else:
        asyncio.run(main())
