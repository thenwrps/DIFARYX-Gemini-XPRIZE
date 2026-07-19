"""DIFARYX Upload Expiry & Storage Sweep Worker
==============================================

Durable long-running worker that cleans up expired upload sessions, releases
their quota reservations, and cleans up orphaned staging objects in the background.

Usage:
    python -m api.workers.upload_expiry_worker
"""

from __future__ import annotations

import asyncio
import logging
import os
import sys
import socket
import traceback
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from api.db.uow import UnitOfWork
from api.storage.factory import get_object_store
from api.services.upload_service import _release_storage_reservation

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger("difaryx.upload_expiry_worker")


def _env_int(name: str, default: int) -> int:
    return int(os.getenv(name, str(default)))


def _env_float(name: str, default: float) -> float:
    return float(os.getenv(name, str(default)))


POLL_INTERVAL: float = _env_float("UEW_POLL_INTERVAL", 5.0)
USER_ID: str = os.getenv("UEW_USER_ID", "00000000-0000-0000-0000-000000000000")  # Default service user UUID


def _build_database_url() -> str:
    raw = os.getenv("DATABASE_URL", "")
    if not raw:
        raise RuntimeError("DATABASE_URL is required")
    if raw.startswith("postgresql://"):
        raw = "postgresql+psycopg://" + raw[len("postgresql://"):]
    elif raw.startswith("postgresql+asyncpg://"):
        raw = "postgresql+psycopg://" + raw[len("postgresql+asyncpg://"):]
    elif not raw.startswith("postgresql+psycopg://"):
        raw = "postgresql+psycopg://" + raw
    return raw


def _make_engine():
    url = _build_database_url()
    return create_async_engine(
        url,
        pool_size=3,
        max_overflow=5,
        pool_pre_ping=True,
    )


class UploadExpiryWorker:
    def __init__(
        self,
        engine,
        user_id: str,
        poll_interval: float = POLL_INTERVAL,
        store = None,
    ) -> None:
        self.engine = engine
        self.user_id = UUID(user_id)
        self.poll_interval = poll_interval
        self.store = store or get_object_store()
        self._shutdown = asyncio.Event()

    async def start(self) -> None:
        logger.info(
            "Upload Expiry Worker starting: poll=%.1fs user_id=%s",
            self.poll_interval, self.user_id
        )

        try:
            while not self._shutdown.is_set():
                try:
                    await self.sweep_once()
                except Exception as e:
                    logger.error("Error during sweep: %s", traceback.format_exc())

                # Bounded wait for next poll
                try:
                    await asyncio.wait_for(self._shutdown.wait(), timeout=self.poll_interval)
                except asyncio.TimeoutError:
                    pass
        finally:
            logger.info("Upload Expiry Worker stopped.")

    def stop(self) -> None:
        self._shutdown.set()

    async def sweep_once(self) -> None:
        # 1. Fetch expired sessions and unreleased reservations in database transactions
        async with self.engine.begin() as conn:
            session = AsyncSession(bind=conn)
            try:
                # Reclaim expired sessions
                res = await session.execute(
                    sa.text("SELECT * FROM science.upload_worker_reclaim_expired_across_orgs()")
                )
                reclaimed = [dict(row) for row in res.mappings().all()]

                # Reclaim unreleased reservations (recovery from crash/restart)
                res_unreleased = await session.execute(
                    sa.text("SELECT * FROM science.upload_worker_get_unreleased_reservations_across_orgs()")
                )
                unreleased = [dict(row) for row in res_unreleased.mappings().all()]
            finally:
                await session.close()

        # Log reclaimed sessions
        if reclaimed:
            logger.info("Reclaimed %d expired upload sessions: %s", len(reclaimed), reclaimed)

        # 2. Release storage quota for reclaimed sessions
        for r in reclaimed:
            if r.get("quota_reservation_id"):
                try:
                    async with UnitOfWork(organization_id=r["organization_id"], user_id=self.user_id) as uow_session:
                        await _release_storage_reservation(
                            uow_session,
                            r["organization_id"],
                            self.user_id,
                            r["quota_reservation_id"],
                            "session_expired",
                            f"expire-reclaim-{r['id']}",
                        )
                except Exception as e:
                    logger.error("Failed to release quota reservation %s for session %s: %s", r["quota_reservation_id"], r["id"], e)

        # 3. Release unreleased reservations (self-healing)
        reclaimed_res_ids = {r["quota_reservation_id"] for r in reclaimed if r.get("quota_reservation_id")}
        unreleased_filtered = [u for u in unreleased if u["quota_reservation_id"] not in reclaimed_res_ids]

        if unreleased_filtered:
            logger.info("Reclaiming %d unreleased reservations from previous runs.", len(unreleased_filtered))
        for u in unreleased_filtered:
            try:
                async with UnitOfWork(organization_id=u["organization_id"], user_id=self.user_id) as uow_session:
                    await _release_storage_reservation(
                        uow_session,
                        u["organization_id"],
                        self.user_id,
                        u["quota_reservation_id"],
                        "session_expired",
                        f"expire-reclaim-{u['session_id']}",
                    )
            except Exception as e:
                logger.error("Failed to release unreleased quota reservation %s for session %s: %s", u["quota_reservation_id"], u["session_id"], e)

        # 4. Delete staging objects for reclaimed sessions
        for r in reclaimed:
            if r.get("object_key"):
                staging_key = f"_staging/{r['object_key']}"
                try:
                    await self.store.delete_staging(staging_key)
                except Exception as e:
                    logger.warning("Failed to delete staging for key %s: %s", staging_key, e)

        # 5. Clean up orphaned staging objects
        async with self.engine.begin() as conn:
            session = AsyncSession(bind=conn)
            try:
                active_keys_res = await session.execute(
                    sa.text("SELECT * FROM science.upload_worker_get_active_keys_across_orgs()")
                )
                active_keys = [row[0] for row in active_keys_res.all()]
            finally:
                await session.close()

        try:
            deleted_orphans = await self.store.cleanup_orphaned_staging(active_keys)
            if deleted_orphans > 0:
                logger.info("Cleaned up %d orphaned staging files.", deleted_orphans)
        except Exception as e:
            logger.error("Failed to clean up orphaned staging: %s", e)


async def main():
    engine = _make_engine()
    worker = UploadExpiryWorker(
        engine=engine,
        user_id=USER_ID,
        poll_interval=POLL_INTERVAL,
    )

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM) if sys.platform != "win32" else []:
        loop.add_signal_handler(sig, worker.stop)

    try:
        await worker.start()
    finally:
        await engine.dispose()


if __name__ == "__main__":
    import signal
    asyncio.run(main())
