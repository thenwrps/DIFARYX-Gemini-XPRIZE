"""Focused P4 integration test for lost validation-attempt ownership."""

import asyncio
import os
import sys
import uuid
from pathlib import Path

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

TESTS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(TESTS_DIR))
sys.path.insert(0, str(TESTS_DIR.parents[1] / "server" / "python"))

from test_validation_worker_retry_exhaustion import (  # noqa: E402
    DATABASE_URL,
    cleanup_test_data,
    get_superuser_conn,
    seed_test_data,
    seed_validation_attempt,
)


async def test_lost_ownership_is_noop() -> None:
    from api.workers.validation_worker import (  # noqa: E402
        _make_engine,
        claim_next,
        mark_failed_with_retry,
        mark_quarantined,
        mark_running,
        reclaim_stale,
    )

    org_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())
    worker_a = f"worker-a-{org_id[:8]}"
    worker_b = f"worker-b-{org_id[:8]}"
    super_conn = get_superuser_conn()
    engine = None
    dataset_id = None
    try:
        object_key = f"test-fixtures/lost-ownership-{uuid.uuid4().hex}.csv"
        content = b"1.0 5.0\n2.0 10.0\n"
        import hashlib

        storage_dir = Path(os.environ.get("DIFARYX_LOCAL_STORAGE_PATH", os.path.join(os.getcwd(), ".tmp-test-storage")))
        storage_dir.mkdir(parents=True, exist_ok=True)
        object_path = storage_dir / object_key.replace("/", os.sep)
        object_path.parent.mkdir(parents=True, exist_ok=True)
        object_path.write_bytes(content)
        os.environ["DIFARYX_LOCAL_STORAGE_PATH"] = str(storage_dir)

        dataset_id, object_id = seed_test_data(
            super_conn,
            object_key,
            hashlib.sha256(content).hexdigest(),
            len(content),
            org_id=org_id,
            user_id=user_id,
        )
        attempt_id = seed_validation_attempt(
            super_conn, org_id, dataset_id, object_id, max_attempts=3
        )

        os.environ["DATABASE_URL"] = DATABASE_URL
        engine = _make_engine()

        async with engine.begin() as conn:
            session = AsyncSession(bind=conn)
            try:
                claimed = await claim_next(session, org_id, user_id, worker_a, 60)
                assert claimed is not None
                assert str(claimed["id"]) == attempt_id
                assert await mark_running(session, org_id, user_id, worker_a, attempt_id)
                await session.commit()
            finally:
                await session.close()

        # Expire A's lease, then let the real stale-reclaim path transfer the
        # same immutable attempt row to worker B.
        super_cur = super_conn.cursor()
        super_cur.execute(
            "UPDATE science.validation_attempts SET lock_expires_at = NOW() - INTERVAL '1 minute' "
            "WHERE organization_id = %s::uuid AND id = %s::uuid",
            (org_id, attempt_id),
        )
        super_conn.commit()
        super_cur.close()

        async with engine.begin() as conn:
            session = AsyncSession(bind=conn)
            try:
                reclaimed = await reclaim_stale(session, org_id, user_id, worker_b, 60)
                assert reclaimed is not None
                assert str(reclaimed["id"]) == attempt_id
                assert reclaimed["attempt_number"] == 1
                assert await mark_running(session, org_id, user_id, worker_b, attempt_id)
                await session.commit()
            finally:
                await session.close()

        async with engine.begin() as conn:
            session = AsyncSession(bind=conn)
            try:
                worker_a_result = await mark_failed_with_retry(
                    session,
                    org_id,
                    user_id,
                    worker_a,
                    attempt_id,
                    "STALE_WORKER_FAILURE",
                    {"worker": worker_a},
                )
                await session.commit()
            finally:
                await session.close()

        assert worker_a_result is False, "lost worker must return a no-op"

        async with engine.begin() as conn:
            session = AsyncSession(bind=conn)
            try:
                assert await mark_quarantined(
                    session,
                    org_id,
                    user_id,
                    worker_b,
                    attempt_id,
                    "WORKER_B_SETTLED",
                    {"worker": worker_b},
                    "Worker B authorized settlement",
                )
                final = await session.execute(
                    sa.text("""
                        SELECT id::text, attempt_number, status::text, claimed_by,
                               failure_code, quarantine_reason
                        FROM science.validation_attempts
                        WHERE organization_id = CAST(:org_id AS uuid)
                        ORDER BY attempt_number
                    """),
                    {"org_id": org_id},
                )
                rows = [tuple(row) for row in final.fetchall()]
                dataset = await session.execute(
                    sa.text("""
                        SELECT dataset_status::text FROM science.datasets
                        WHERE organization_id = CAST(:org_id AS uuid)
                          AND id = CAST(:dataset_id AS uuid)
                    """),
                    {"org_id": org_id, "dataset_id": dataset_id},
                )
                dataset_status = dataset.scalar()
                await session.commit()
            finally:
                await session.close()

        print("Lost-ownership evidence:", rows)
        assert len(rows) == 1, "Worker A must not create a retry row"
        assert rows[0][1:] == (1, "quarantined", None, "WORKER_B_SETTLED", "Worker B authorized settlement")
        assert dataset_status == "quarantined"
    finally:
        if engine is not None:
            await engine.dispose()
        if dataset_id:
            cleanup_test_data(super_conn, org_id, dataset_id)
        super_conn.close()


async def test_direct_exhaustion_does_not_settle_or_requeue() -> None:
    """A direct retry call at max_attempts must be an atomic no-op."""
    from api.workers.validation_worker import _make_engine, claim_next, mark_failed_with_retry, mark_running

    org_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())
    worker_id = f"exhaustion-worker-{org_id[:8]}"
    super_conn = get_superuser_conn()
    engine = None
    dataset_id = None
    try:
        content = b"1.0 5.0\n2.0 10.0\n"
        import hashlib
        dataset_id, object_id = seed_test_data(
            super_conn,
            f"test-fixtures/exhaustion-{uuid.uuid4().hex}.csv",
            hashlib.sha256(content).hexdigest(),
            len(content),
            org_id=org_id,
            user_id=user_id,
        )
        attempt_id = seed_validation_attempt(
            super_conn, org_id, dataset_id, object_id, max_attempts=1
        )
        os.environ["DATABASE_URL"] = DATABASE_URL
        engine = _make_engine()
        async with engine.begin() as conn:
            session = AsyncSession(bind=conn)
            try:
                claimed = await claim_next(session, org_id, user_id, worker_id, 60)
                assert claimed is not None
                assert await mark_running(session, org_id, user_id, worker_id, attempt_id)
                result = await mark_failed_with_retry(
                    session, org_id, user_id, worker_id, attempt_id,
                    "DIRECT_EXHAUSTION", {"test": True},
                )
                assert result is False
                await session.commit()
            finally:
                await session.close()

        cur = super_conn.cursor()
        cur.execute(
            """
            SELECT status::text, completed_at, claimed_by, lock_expires_at
            FROM science.validation_attempts
            WHERE organization_id = %s::uuid AND dataset_id = %s::uuid
            """,
            (org_id, dataset_id),
        )
        rows = cur.fetchall()
        cur.execute(
            "SELECT dataset_status::text FROM science.datasets WHERE organization_id = %s::uuid AND id = %s::uuid",
            (org_id, dataset_id),
        )
        dataset_status = cur.fetchone()[0]
        cur.close()
        assert len(rows) == 1
        assert rows[0][0] == "running"
        assert rows[0][1] is None
        assert rows[0][2] == worker_id
        assert dataset_status != "pending_validation"
    finally:
        if engine is not None:
            await engine.dispose()
        if dataset_id:
            cleanup_test_data(super_conn, org_id, dataset_id)
        super_conn.close()


async def test_concurrent_settlement_creates_one_successor() -> None:
    """Concurrent calls for one owned row settle at most once."""
    from api.workers.validation_worker import _make_engine, claim_next, mark_failed_with_retry, mark_running

    org_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())
    worker_id = f"concurrent-worker-{org_id[:8]}"
    super_conn = get_superuser_conn()
    engine_a = None
    engine_b = None
    dataset_id = None
    try:
        content = b"1.0 5.0\n2.0 10.0\n"
        import hashlib
        dataset_id, object_id = seed_test_data(
            super_conn,
            f"test-fixtures/concurrent-{uuid.uuid4().hex}.csv",
            hashlib.sha256(content).hexdigest(),
            len(content),
            org_id=org_id,
            user_id=user_id,
        )
        attempt_id = seed_validation_attempt(
            super_conn, org_id, dataset_id, object_id, max_attempts=3
        )
        os.environ["DATABASE_URL"] = DATABASE_URL
        engine_a = _make_engine()
        async with engine_a.begin() as conn:
            session = AsyncSession(bind=conn)
            try:
                claimed = await claim_next(session, org_id, user_id, worker_id, 60)
                assert claimed is not None
                assert await mark_running(session, org_id, user_id, worker_id, attempt_id)
                await session.commit()
            finally:
                await session.close()

        engine_b = _make_engine()

        async def settle(engine, marker):
            async with engine.begin() as conn:
                session = AsyncSession(bind=conn)
                try:
                    result = await mark_failed_with_retry(
                        session, org_id, user_id, worker_id, attempt_id,
                        "CONCURRENT_FAILURE", {"marker": marker},
                    )
                    await session.commit()
                    return result
                finally:
                    await session.close()

        results = await asyncio.gather(
            settle(engine_a, "a"), settle(engine_b, "b"),
        )
        assert sorted(results) == [False, True]

        cur = super_conn.cursor()
        cur.execute(
            """
            SELECT id::text, attempt_number, status::text, completed_at,
                   claimed_by, lock_expires_at
            FROM science.validation_attempts
            WHERE organization_id = %s::uuid AND dataset_id = %s::uuid
            ORDER BY attempt_number
            """,
            (org_id, dataset_id),
        )
        rows = cur.fetchall()
        cur.execute(
            "SELECT dataset_status::text FROM science.datasets WHERE organization_id = %s::uuid AND id = %s::uuid",
            (org_id, dataset_id),
        )
        dataset_status = cur.fetchone()[0]
        cur.close()
        assert len(rows) == 2
        assert rows[0][1:3] == (1, "failed")
        assert rows[0][3] is not None and rows[0][4] is None and rows[0][5] is None
        assert rows[1][1:3] == (2, "queued")
        assert dataset_status == "pending_validation"
    finally:
        if engine_a is not None:
            await engine_a.dispose()
        if engine_b is not None:
            await engine_b.dispose()
        if dataset_id:
            cleanup_test_data(super_conn, org_id, dataset_id)
        super_conn.close()


if __name__ == "__main__":
    async def main():
        await test_lost_ownership_is_noop()
        await test_direct_exhaustion_does_not_settle_or_requeue()
        await test_concurrent_settlement_creates_one_successor()

    if sys.platform == "win32":
        asyncio.run(main(), loop_factory=lambda: asyncio.SelectorEventLoop())
    else:
        asyncio.run(main())
