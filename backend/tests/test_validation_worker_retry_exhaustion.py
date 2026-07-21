"""
DIFARYX Validation Worker — Retry / Exhaustion / Survival Integration Test
==========================================================================

Proves the P0 runtime-failure semantics end-to-end against live PostgreSQL:

  1. First runtime failure (sandbox crash/timeout/OOM) is recorded as a
     completed 'failed' row and a distinct queued attempt is inserted.
  2. Each retry has an immutable (dataset, attempt_number) identity and a
     distinct row; claim_next never mutates history.
  3. At exhaustion (attempt_number >= max_attempts) the next sandbox failure
     terminal-quarantines the attempt via mark_quarantined — status becomes
     'quarantined', completed_at is set, no further retry.
  4. A following benign queued dataset is still processed to 'passed',
     proving the worker survives the quarantine and the queue remains
     healthy.

This is a real database-backed test. It uses the real process_one(), the
real claim_next(), the real mark_failed_with_retry() and the real
mark_quarantined(). The only monkeypatch is on
ContainerParserRunner.run_parser to deterministically raise an exception
(simulating a sandbox crash/OOM/timeout) — which is the exact runtime
failure path specified in P0.

Prerequisites:
    - Database: difaryx_phase0_test @ localhost:5432
    - Migrations 0001-0016 applied (alembic_version = 0016)
    - DIFARYX_BOOTSTRAP_DATABASE_URL set

Usage:
    python backend/tests/test_validation_worker_retry_exhaustion.py
"""

import asyncio
import hashlib
import os
import sys
import tempfile
import uuid
from pathlib import Path

import psycopg2

# ---------------------------------------------------------------------------
# Configuration — reuse the same canonical IDs as the core worker suite
# ---------------------------------------------------------------------------
BOOTSTRAP_URL = os.getenv("DIFARYX_BOOTSTRAP_DATABASE_URL")
DATABASE_URL = os.getenv("DATABASE_URL") or BOOTSTRAP_URL

if not DATABASE_URL:
    DATABASE_URL = "postgresql://postgres:difaryx_dev_pw@127.0.0.1:5432/difaryx_phase0_test"
if not BOOTSTRAP_URL:
    BOOTSTRAP_URL = DATABASE_URL

MAX_ATTEMPTS = 3


def get_conn():
    return psycopg2.connect(DATABASE_URL)


def get_superuser_conn():
    return psycopg2.connect(BOOTSTRAP_URL)


def _ensure_path():
    sp = str(Path(__file__).resolve().parents[2] / "server" / "python")
    if sp not in sys.path:
        sys.path.insert(0, sp)


def create_test_file(content: bytes) -> tuple[str, str, int]:
    """Create a test fixture file and return (object_key, checksum, byte_size)."""
    storage_dir = Path(os.environ.get("DIFARYX_LOCAL_STORAGE_PATH", tempfile.mkdtemp()))
    storage_dir.mkdir(parents=True, exist_ok=True)
    object_key = f"test-fixtures/retry-test-{uuid.uuid4().hex[:8]}.csv"
    filepath = storage_dir / object_key.replace("/", os.sep)
    filepath.parent.mkdir(parents=True, exist_ok=True)
    filepath.write_bytes(content)
    checksum = hashlib.sha256(content).hexdigest()
    os.environ["DIFARYX_LOCAL_STORAGE_PATH"] = str(storage_dir)
    return object_key, checksum, len(content)


def seed_test_data(super_conn, object_key, checksum, byte_size, technique="xrd", org_id=None, user_id=None):
    """Insert org/user/project/dataset/object. Returns dataset_id, object_id."""
    cur = super_conn.cursor()
    cur.execute("SET session_replication_role = 'replica'")

    org_id = org_id or str(uuid.uuid4())
    user_id = user_id or str(uuid.uuid4())
    project_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"retry-proj-{object_key}"))
    dataset_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"retry-ds-{object_key}"))
    object_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"retry-obj-{object_key}"))
    upload_session_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"retry-us-{object_key}"))

    cur.execute("""
        INSERT INTO identity.organizations (id, slug, display_name, plan_tier)
        VALUES (%s::uuid, %s, 'Retry Test Org', 'free')
        ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name
    """, (org_id, f"retry-test-{org_id[:8]}"))

    cur.execute("""
        INSERT INTO identity.users (organization_id, id, email, display_name, is_active)
        VALUES (%s::uuid, %s::uuid, %s, 'Retry Test User', TRUE)
        ON CONFLICT (organization_id, id) DO NOTHING
    """, (org_id, user_id, f"retry-{user_id[:8]}@test.local"))

    cur.execute("""
        INSERT INTO identity.memberships (organization_id, user_id, role)
        VALUES (%s::uuid, %s::uuid, 'owner')
        ON CONFLICT (organization_id, user_id) DO NOTHING
    """, (org_id, user_id))

    cur.execute("""
        INSERT INTO science.projects (organization_id, id, owner_user_id, title, description)
        VALUES (%s::uuid, %s::uuid, %s::uuid, 'Retry Test Project', 'Integration test')
        ON CONFLICT (organization_id, id) DO NOTHING
    """, (org_id, project_id, user_id))

    cur.execute("""
        INSERT INTO science.datasets (
            organization_id, id, project_id, technique, display_filename,
            declared_content_type, byte_size, dataset_status,
            original_object_id, created_by, created_at
        ) VALUES (
            %s::uuid, %s::uuid, %s::uuid, %s, %s,
            'text/csv', %s, 'pending_validation'::science.dataset_status,
            %s::uuid, %s::uuid, NOW()
        )
        ON CONFLICT (organization_id, id) DO UPDATE SET
            dataset_status = EXCLUDED.dataset_status,
            byte_size = EXCLUDED.byte_size,
            original_object_id = EXCLUDED.original_object_id
    """, (org_id, dataset_id, project_id, technique,
          f"retry_{object_key.replace('/', '_')}.csv",
          byte_size, object_id, user_id))

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
    """, (org_id, object_id, dataset_id, upload_session_id, object_key,
          byte_size, checksum))

    cur.execute("SET session_replication_role = 'origin'")
    super_conn.commit()
    return dataset_id, object_id


def seed_validation_attempt(super_conn, org_id, dataset_id, object_id,
                             max_attempts=MAX_ATTEMPTS):
    cur = super_conn.cursor()
    cur.execute("SET session_replication_role = 'replica'")
    cur.execute("""
        INSERT INTO science.validation_attempts (
            organization_id, id, dataset_id, original_object_id,
            attempt_number, max_attempts, status,
            lock_expires_at, next_retry_at, created_at
        ) VALUES (
            %s::uuid, gen_random_uuid(), %s::uuid, %s::uuid,
            1, %s, 'queued'::science.validation_attempt_status,
            NOW() + INTERVAL '5 minutes', NULL, NOW()
        )
        RETURNING id
    """, (org_id, dataset_id, object_id, max_attempts))
    attempt_id = cur.fetchone()[0]
    cur.execute("SET session_replication_role = 'origin'")
    super_conn.commit()
    return str(attempt_id)


def get_attempt_status(conn, org_id, attempt_id):
    cur = conn.cursor()
    cur.execute("SET LOCAL app.organization_id = %s", (org_id,))
    cur.execute("""
        SELECT status::text, claimed_by, claimed_at, lock_expires_at, next_retry_at,
               failure_code, quarantine_reason, completed_at,
               attempt_number, max_attempts, failure_details
        FROM science.validation_attempts
        WHERE organization_id = %s::uuid AND id = %s::uuid
    """, (org_id, attempt_id))
    row = cur.fetchone()
    if not row:
        return None
    return {
        "status": row[0],
        "claimed_by": row[1],
        "claimed_at": row[2],
        "lock_expires_at": row[3],
        "next_retry_at": row[4],
        "failure_code": row[5],
        "quarantine_reason": row[6],
        "completed_at": row[7],
        "attempt_number": row[8],
        "max_attempts": row[9],
        "failure_details": row[10],
    }


def get_attempt_rows(conn, org_id, dataset_id):
    cur = conn.cursor()
    cur.execute("""
        SELECT id::text, attempt_number, status::text, next_retry_at,
               completed_at, claimed_by
        FROM science.validation_attempts
        WHERE organization_id = %s::uuid AND dataset_id = %s::uuid
        ORDER BY attempt_number
    """, (org_id, dataset_id))
    rows = cur.fetchall()
    cur.close()
    return rows


def force_retry_due(super_conn, org_id, attempt_id):
    """Simulate time passing by setting next_retry_at to NOW() so claim_next
    can re-claim the failed attempt immediately."""
    cur = super_conn.cursor()
    cur.execute("""
        UPDATE science.validation_attempts
        SET next_retry_at = NOW()
        WHERE organization_id = %s::uuid AND id = %s::uuid
    """, (org_id, attempt_id))
    super_conn.commit()


def cleanup_test_data(super_conn, org_id, dataset_id=None):
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


async def test_retry_exhaustion_survival():
    """Prove: first failure requeued → retry advances → exhaustion quarantines
    → following benign queued dataset becomes valid."""
    print("\n=== Test: Retry → Exhaustion → Survival ===")
    sconn = get_superuser_conn()
    engine = None
    failing_dataset_id = None
    benign_dataset_id = None
    benign_attempt_id = None
    test_org = str(uuid.uuid4())
    test_user = str(uuid.uuid4())
    worker_id = f"test-worker-retry-{test_org[:8]}"
    try:
        _ensure_path()

        cur = sconn.cursor()
        cur.execute(
            "SELECT COUNT(*) FROM science.validation_attempts WHERE organization_id = %s::uuid",
            (test_org,),
        )
        assert cur.fetchone()[0] == 0, "focused retry org must have an empty queue before seeding"
        cur.close()

        # -- Dataset A: will fail 3 times and quarantine -------------------
        failing_content = b"1.0 10.0\n2.0 20.0\n3.0 30.0\n"
        failing_checksum = hashlib.sha256(failing_content).hexdigest()
        failing_key, failing_checksum, failing_size = create_test_file(failing_content)
        failing_dataset_id, failing_object_id = seed_test_data(
            sconn, failing_key, failing_checksum, failing_size, org_id=test_org, user_id=test_user
        )
        failing_attempt_id = seed_validation_attempt(
            sconn, test_org, failing_dataset_id, failing_object_id,
            max_attempts=MAX_ATTEMPTS,
        )

        from api.workers.validation_worker import process_one, _make_engine, counters
        import api.validation.isolated_runner as runner_module

        os.environ["VW_ORGANIZATION_ID"] = test_org
        os.environ["VW_USER_ID"] = test_user
        os.environ["DATABASE_URL"] = DATABASE_URL
        # Ensure bypass is OFF — we want the real run_parser path
        os.environ.pop("DIFARYX_BYPASS_CONTAINER_PARSER", None)

        # --- Monkeypatch run_parser: fail first 3 calls (dataset A), then
        # succeed on the 4th call (dataset B). This simulates a real sandbox
        # crash/OOM/timeout for dataset A, then a normal valid parse for B.
        original_run_parser = runner_module.ContainerParserRunner.run_parser
        call_log = []

        async def controlled_run_parser(self, technique, input_path, output_path, timeout=90.0):
            call_log.append(input_path)
            if len(call_log) <= MAX_ATTEMPTS:
                raise RuntimeError(
                    f"Simulated sandbox crash #{len(call_log)} for {input_path}"
                )
            return {
                "status": "valid",
                "technique": technique,
                "valid_data_rows": 3,
                "total_lines_scanned": 3,
                "technique_identity_class": "explicit_match",
                "technique_identity_confirmed": True,
            }

        runner_module.ContainerParserRunner.run_parser = controlled_run_parser

        engine = _make_engine()

        # Reset counters
        counters.claimed = 0
        counters.passed = 0
        counters.failed = 0
        counters.retried = 0
        counters.quarantined = 0

        # --- Attempt 1: first runtime failure → requeued ------------------
        outcome_1 = await process_one(engine, test_org, test_user, worker_id, 60, 10.0)
        st_1 = get_attempt_status(sconn, test_org, failing_attempt_id)
        rows_1 = get_attempt_rows(sconn, test_org, failing_dataset_id)

        first_failure_requeued = (
            outcome_1 == "retry"
            and st_1 is not None
            and st_1["status"] == "failed"
            and st_1["attempt_number"] == 1
            and st_1["next_retry_at"] is not None
            and st_1["failure_code"] == "ISOLATION_SANDBOX_ERROR"
            and st_1["completed_at"] is not None
            and st_1["claimed_by"] is None
            and st_1["claimed_at"] is None
            and st_1["lock_expires_at"] is None
            and len(rows_1) == 2
            and rows_1[1][1:3] == (2, "queued")
        )
        report(
            "1_first_failure_requeued",
            first_failure_requeued,
            f"outcome={outcome_1}, status={st_1 and st_1['status']}, "
            f"attempt_number={st_1 and st_1['attempt_number']}, "
            f"failure_code={st_1 and st_1['failure_code']}, "
            f"next_retry_at={st_1 and st_1['next_retry_at']}",
        )

        # --- Attempt 2: retry advances attempt_number → requeued ----------
        attempt_2_id = rows_1[1][0]
        force_retry_due(sconn, test_org, attempt_2_id)
        outcome_2 = await process_one(engine, test_org, test_user, worker_id, 60, 10.0)
        st_2 = get_attempt_status(sconn, test_org, attempt_2_id)
        rows_2 = get_attempt_rows(sconn, test_org, failing_dataset_id)

        retry_advances = (
            outcome_2 == "retry"
            and st_2 is not None
            and st_2["status"] == "failed"
            and st_2["attempt_number"] == 2
            and st_2["next_retry_at"] is not None
            and st_2["failure_code"] == "ISOLATION_SANDBOX_ERROR"
            and st_2["completed_at"] is not None
            and st_2["claimed_by"] is None
            and st_2["claimed_at"] is None
            and st_2["lock_expires_at"] is None
            and len(rows_2) == 3
            and rows_2[2][1:3] == (3, "queued")
        )
        report(
            "2_retry_advances_attempt_number",
            retry_advances,
            f"outcome={outcome_2}, status={st_2 and st_2['status']}, "
            f"attempt_number={st_2 and st_2['attempt_number']}/{st_2 and st_2['max_attempts']}",
        )

        # --- Attempt 3: exhaustion → terminal quarantine ------------------
        attempt_3_id = rows_2[2][0]
        force_retry_due(sconn, test_org, attempt_3_id)
        outcome_3 = await process_one(engine, test_org, test_user, worker_id, 60, 10.0)
        st_3 = get_attempt_status(sconn, test_org, attempt_3_id)
        rows_3 = get_attempt_rows(sconn, test_org, failing_dataset_id)

        exhaustion_quarantines = (
            outcome_3 == "quarantined"
            and st_3 is not None
            and st_3["status"] == "quarantined"
            and st_3["attempt_number"] == MAX_ATTEMPTS
            and st_3["failure_code"] == "ISOLATION_SANDBOX_ERROR"
            and st_3["quarantine_reason"] is not None
            and st_3["completed_at"] is not None
            and st_3["claimed_by"] is None
            and st_3["claimed_at"] is None
            and st_3["lock_expires_at"] is None
            and len(rows_3) == 3
        )
        report(
            "3_exhaustion_quarantines",
            exhaustion_quarantines,
            f"outcome={outcome_3}, status={st_3 and st_3['status']}, "
            f"attempt_number={st_3 and st_3['attempt_number']}/{st_3 and st_3['max_attempts']}, "
            f"completed_at={st_3 and st_3['completed_at'] is not None}",
        )

        # --- Survival: seed a benign dataset only after the retry chain is
        # terminal, so queue ordering cannot hide the attempt-2 assertion.
        benign_content = b"10.0 100.0\n20.0 200.0\n30.0 300.0\n"
        benign_key, benign_checksum, benign_size = create_test_file(benign_content)
        benign_dataset_id, benign_object_id = seed_test_data(
            sconn, benign_key, benign_checksum, benign_size,
            org_id=test_org, user_id=test_user,
        )
        benign_attempt_id = seed_validation_attempt(
            sconn, test_org, benign_dataset_id, benign_object_id,
            max_attempts=MAX_ATTEMPTS,
        )
        outcome_4 = await process_one(engine, test_org, test_user, worker_id, 60, 10.0)
        st_4 = get_attempt_status(sconn, test_org, benign_attempt_id)

        survival_benign_passes = (
            outcome_4 == "passed"
            and st_4 is not None
            and st_4["status"] == "passed"
            and st_4["attempt_number"] == 1
            and st_4["completed_at"] is not None
        )
        report(
            "4_benign_dataset_survives",
            survival_benign_passes,
            f"outcome={outcome_4}, status={st_4 and st_4['status']}, "
            f"attempt_number={st_4 and st_4['attempt_number']}",
        )

        # --- Verify no stuck attempts -------------------------------------
        cur = sconn.cursor()
        cur.execute("""
            SELECT COUNT(*) FROM science.validation_attempts
            WHERE organization_id = %s::uuid
              AND status IN ('claimed', 'running')
        """, (test_org,))
        stuck_count = cur.fetchone()[0]
        cur.close()
        no_stuck = stuck_count == 0
        report("5_no_stuck_attempts", no_stuck, f"stuck_count={stuck_count}")

        # --- Verify technique_identity_confirmed is NOT persisted ----------
        # (P1: must remain transient, in envelope only)
        cur = sconn.cursor()
        cur.execute("""
            SELECT failure_details FROM science.validation_attempts
            WHERE organization_id = %s::uuid AND id = %s::uuid
        """, (test_org, failing_attempt_id))
        fd_row = cur.fetchone()
        cur.close()
        p1_no_persisted_identity = True
        if fd_row and fd_row[0]:
            import json as _json
            try:
                fd = fd_row[0] if isinstance(fd_row[0], dict) else _json.loads(fd_row[0])
                if "technique_identity_confirmed" in fd:
                    p1_no_persisted_identity = False
            except Exception:
                pass
        report(
            "6_technique_identity_not_persisted",
            p1_no_persisted_identity,
            f"failure_details_has_identity_field={not p1_no_persisted_identity}",
        )

        # --- Restore monkeypatch -------------------------------------------
        runner_module.ContainerParserRunner.run_parser = original_run_parser

        print("Retry chain rows (id, attempt_number, status, next_retry_at, completed_at, claimed_by):")
        for row in rows_3:
            print(f"  {row}")
        print("  no attempt 4:", len(rows_3) == 3)

        all_pass = (
            first_failure_requeued
            and retry_advances
            and exhaustion_quarantines
            and survival_benign_passes
            and no_stuck
            and p1_no_persisted_identity
        )
        report(
            "retry_exhaustion_survival",
            all_pass,
            f"call_log_len={len(call_log)}, "
            f"counters: claimed={counters.claimed} retried={counters.retried} "
            f"quarantined={counters.quarantined} passed={counters.passed}",
        )

    except Exception as e:
        report("retry_exhaustion_survival", False, str(e))
        import traceback
        traceback.print_exc()
    finally:
        if engine is not None:
            await engine.dispose()
        if failing_dataset_id:
            cleanup_test_data(sconn, test_org, failing_dataset_id)
        if benign_dataset_id:
            cleanup_test_data(sconn, test_org, benign_dataset_id)
        sconn.close()


async def main():
    print("=" * 70)
    print("DIFARYX Retry / Exhaustion / Survival Integration Test")
    print("=" * 70)

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

    await test_retry_exhaustion_survival()

    print("\n" + "=" * 70)
    print("SUMMARY")
    print("=" * 70)
    passed = sum(1 for r in results.values() if r["passed"])
    failed = sum(1 for r in results.values() if not r["passed"])
    for name, r in results.items():
        icon = "[PASS]" if r["passed"] else "[FAIL]"
        print(f"  {icon} {name}: {r['detail']}")
    print(f"\n{passed}/{passed + failed} passed, {failed} failed")

    # Only the composite result needs to be green for the suite to pass
    composite = results.get("retry_exhaustion_survival", {"passed": False})
    if not composite["passed"]:
        sys.exit(1)


if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.run(main(), loop_factory=lambda: asyncio.SelectorEventLoop())
    else:
        asyncio.run(main())
