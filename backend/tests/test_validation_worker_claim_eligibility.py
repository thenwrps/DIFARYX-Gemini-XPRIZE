"""Focused P2 claim-predicate integration test."""

import asyncio
import hashlib
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession

TESTS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(TESTS_DIR))
sys.path.insert(0, str(TESTS_DIR.parents[1] / "server" / "python"))

from test_validation_worker_retry_exhaustion import (  # noqa: E402
    DATABASE_URL,
    cleanup_test_data,
    get_superuser_conn,
    seed_test_data,
)


def _insert_attempt(conn, org_id, dataset_id, object_id, *, status, attempt_number=1,
                    max_attempts=3, next_retry_at=None, claimed_by=None):
    cur = conn.cursor()
    cur.execute("SET session_replication_role = 'replica'")
    failure_code = "TERMINAL_FAILURE" if status == "failed" else None
    quarantine_reason = "test quarantine" if status == "quarantined" else None
    cur.execute("""
        INSERT INTO science.validation_attempts (
            organization_id, id, dataset_id, original_object_id,
            attempt_number, max_attempts, status, next_retry_at,
            claimed_by, claimed_at, lock_expires_at, completed_at,
            failure_code, quarantine_reason, created_at, updated_at
        ) VALUES (
            %s::uuid, gen_random_uuid(), %s::uuid, %s::uuid,
            %s, %s, %s::science.validation_attempt_status, %s,
            %s, CASE WHEN %s IS NULL THEN NULL ELSE NOW() END,
            CASE WHEN %s IS NULL THEN NULL ELSE NOW() + INTERVAL '5 minutes' END,
            CASE WHEN %s IN ('passed', 'failed', 'quarantined', 'cancelled') THEN NOW() ELSE NULL END,
            %s, %s, NOW(), NOW()
        ) RETURNING id
    """, (
        org_id, dataset_id, object_id, attempt_number, max_attempts, status,
        next_retry_at, claimed_by, claimed_by, claimed_by, status,
        failure_code, quarantine_reason,
    ))
    attempt_id = str(cur.fetchone()[0])
    cur.execute("SET session_replication_role = 'origin'")
    conn.commit()
    cur.close()
    return attempt_id


async def test_claim_predicate_excludes_terminal_future_exhausted_and_leased() -> None:
    from api.workers.validation_worker import _make_engine, claim_next  # noqa: E402

    org_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())
    super_conn = get_superuser_conn()
    engine = None
    dataset_ids = []
    try:
        cur = super_conn.cursor()
        cur.execute(
            "SELECT COUNT(*) FROM science.validation_attempts WHERE organization_id = %s::uuid",
            (org_id,),
        )
        assert cur.fetchone()[0] == 0
        cur.close()

        cases = [
            ("passed", "passed", 1, 3, None, None),
            ("quarantined", "quarantined", 1, 3, None, None),
            ("cancelled", "cancelled", 1, 3, None, None),
            ("failed-terminal", "failed", 1, 3, None, None),
            ("future", "queued", 1, 3, datetime.now(timezone.utc) + timedelta(hours=1), None),
            ("exhausted", "queued", 4, 3, None, None),
            ("leased", "queued", 1, 3, None, "another-worker"),
        ]
        seeded = {}
        for key, status, attempt_number, max_attempts, next_retry_at, claimed_by in cases:
            content = f"{key}\n".encode()
            object_key = f"test-fixtures/claim-eligibility-{uuid.uuid4().hex}.csv"
            dataset_id, object_id = seed_test_data(
                super_conn,
                object_key,
                hashlib.sha256(content).hexdigest(),
                len(content),
                org_id=org_id,
                user_id=user_id,
            )
            dataset_ids.append(dataset_id)
            seeded[key] = _insert_attempt(
                super_conn, org_id, dataset_id, object_id,
                status=status, attempt_number=attempt_number,
                max_attempts=max_attempts, next_retry_at=next_retry_at,
                claimed_by=claimed_by,
            )

        os.environ["DATABASE_URL"] = DATABASE_URL
        engine = _make_engine()
        async with engine.begin() as conn:
            session = AsyncSession(bind=conn)
            try:
                claimed = await claim_next(session, org_id, user_id, "eligibility-worker", 60)
                await session.rollback()
            finally:
                await session.close()

        assert claimed is None, "no terminal, future, exhausted, or leased row may be claimable"
        print("Claim eligibility excluded rows:", seeded)

        # A due, unleased attempt below exhaustion remains claimable, proving
        # the predicate is selective rather than simply disabled.
        content = b"eligible\n"
        object_key = f"test-fixtures/claim-eligible-{uuid.uuid4().hex}.csv"
        eligible_dataset, eligible_object = seed_test_data(
            super_conn,
            object_key,
            hashlib.sha256(content).hexdigest(),
            len(content),
            org_id=org_id,
            user_id=user_id,
        )
        dataset_ids.append(eligible_dataset)
        eligible_attempt = _insert_attempt(
            super_conn, org_id, eligible_dataset, eligible_object,
            status="queued", attempt_number=1, max_attempts=3,
        )
        async with engine.begin() as conn:
            session = AsyncSession(bind=conn)
            try:
                claimed = await claim_next(session, org_id, user_id, "eligibility-worker", 60)
                assert claimed is not None
                assert str(claimed["id"]) == eligible_attempt
                await session.rollback()
            finally:
                await session.close()
    finally:
        if engine is not None:
            await engine.dispose()
        for dataset_id in dataset_ids:
            cleanup_test_data(super_conn, org_id, dataset_id)
        super_conn.close()


if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.run(
            test_claim_predicate_excludes_terminal_future_exhausted_and_leased(),
            loop_factory=lambda: asyncio.SelectorEventLoop(),
        )
    else:
        asyncio.run(test_claim_predicate_excludes_terminal_future_exhausted_and_leased())
