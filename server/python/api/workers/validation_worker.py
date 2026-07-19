"""DIFARYX Validation Worker Runtime
=====================================

Durable long-running worker that drives process_one in a loop against the
live database.

Usage:
    python -m api.workers.validation_worker

Configuration (environment variables with defaults):
    VW_POLL_INTERVAL        – seconds between poll attempts when idle      (default: 2)
    VW_IDLE_BACKOFF_CAP     – maximum backoff seconds when queue empty     (default: 30)
    VW_LEASE_DURATION       – lock lease in seconds                        (default: 300)
    VW_HEARTBEAT_INTERVAL   – heartbeat tick in seconds                    (default: 30)
    VW_CONCURRENCY          – in-process concurrent workers (>=1)          (default: 1)
    VW_ORGANIZATION_ID      – UUID of the org this worker serves           (required)
    VW_USER_ID              – UUID of a service user for RLS context       (required)
    VW_WORKER_ID            – unique worker identifier                     (default: hostname-pid)
    VW_RECLAIM_EVERY        – run reclaim_stale every N loops              (default: 5)
    DATABASE_URL            – PostgreSQL connection string                 (required)
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import signal
import socket
import sys
import traceback
import uuid
from typing import Optional

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger("difaryx.validation_worker")

_UNSAFE_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_DIAGNOSTIC_LIMIT_BYTES = 2048
_JSON_KEY_LIMIT_BYTES = 128
_QUARANTINE_REASON_LIMIT_BYTES = 240


# ---------------------------------------------------------------------------
# Configuration from environment
# ---------------------------------------------------------------------------
def _env_int(name: str, default: int) -> int:
    return int(os.getenv(name, str(default)))


def _env_float(name: str, default: float) -> float:
    return float(os.getenv(name, str(default)))


POLL_INTERVAL: float = _env_float("VW_POLL_INTERVAL", 2.0)
IDLE_BACKOFF_CAP: float = _env_float("VW_IDLE_BACKOFF_CAP", 30.0)
LEASE_DURATION: int = _env_int("VW_LEASE_DURATION", 300)
HEARTBEAT_INTERVAL: float = _env_float("VW_HEARTBEAT_INTERVAL", 30.0)
CONCURRENCY: int = max(1, _env_int("VW_CONCURRENCY", 1))
MODE: str = os.getenv("VW_MODE", "single_org")  # "single_org" or "multi_org"
ORGANIZATION_ID: str = os.getenv("VW_ORGANIZATION_ID", "")  # Required only in single_org mode
USER_ID: str = os.getenv("VW_USER_ID", "")
RECLAIM_EVERY: int = _env_int("VW_RECLAIM_EVERY", 5)

_default_worker_id = f"{socket.gethostname()}-{os.getpid()}"
WORKER_ID: str = os.getenv("VW_WORKER_ID", _default_worker_id)

# Test-only sentinel to prevent bypass in production
BYPASS_SENTINEL: bool = False



# ---------------------------------------------------------------------------
# Database engine (worker-owned, separate from FastAPI engine)
# ---------------------------------------------------------------------------
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
        pool_size=CONCURRENCY + 2,
        max_overflow=5,
        pool_pre_ping=True,
    )


# ---------------------------------------------------------------------------
# Counters (simple in-memory observability)
# ---------------------------------------------------------------------------
class Counters:
    def __init__(self) -> None:
        self.claimed = 0
        self.passed = 0
        self.failed = 0
        self.retried = 0
        self.quarantined = 0
        self.reclaimed = 0
        self.errors = 0
        self.polls_idle = 0
        self.heartbeats = 0

    def snapshot(self) -> dict:
        return {k: getattr(self, k) for k in vars(self)}


counters = Counters()


def _truncate_utf8_bytes(text: str, limit_bytes: int) -> str:
    encoded = text.encode("utf-8")
    if len(encoded) <= limit_bytes:
        return text

    suffix = "..."
    budget = max(0, limit_bytes - len(suffix.encode("utf-8")))
    truncated = encoded[:budget]
    while truncated:
        try:
            return truncated.decode("utf-8") + suffix
        except UnicodeDecodeError:
            truncated = truncated[:-1]
    return suffix[:limit_bytes]


def _normalize_pg_text(value: object, *, limit_bytes: int = _DIAGNOSTIC_LIMIT_BYTES) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, bytes):
        text = value.decode("utf-8", errors="replace")
    else:
        text = str(value)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = _UNSAFE_CONTROL_CHARS.sub("", text)
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return ""
    return _truncate_utf8_bytes(text, limit_bytes)


def _normalize_pg_json(value: object) -> object:
    if value is None or isinstance(value, (bool, int, float)):
        return value
    if isinstance(value, dict):
        normalized: dict[str, object] = {}
        for key, item in value.items():
            safe_key = _normalize_pg_text(key, limit_bytes=_JSON_KEY_LIMIT_BYTES) or ""
            normalized[safe_key] = _normalize_pg_json(item)
        return normalized
    if isinstance(value, (list, tuple)):
        return [_normalize_pg_json(item) for item in value]
    return _normalize_pg_text(value)


def _build_isolation_failure_payload(exc: Exception) -> tuple[dict, str]:
    summary = _normalize_pg_text(str(exc)) or "isolated parser execution failed"
    details = {
        "check": "container_parser",
        "summary": summary,
    }
    returncode = getattr(exc, "returncode", None)
    if returncode is not None:
        details["returncode"] = returncode
    stderr_summary = _normalize_pg_text(getattr(exc, "stderr_summary", None))
    if stderr_summary:
        details["stderr_summary"] = stderr_summary
    stdout_summary = _normalize_pg_text(getattr(exc, "stdout_summary", None))
    if stdout_summary:
        details["stdout_summary"] = stdout_summary
    quarantine_reason = _normalize_pg_text(
        f"Isolated parser execution failed: {summary}",
        limit_bytes=_QUARANTINE_REASON_LIMIT_BYTES,
    ) or "Isolated parser execution failed"
    return details, quarantine_reason


# ---------------------------------------------------------------------------
# Repository helpers
# ---------------------------------------------------------------------------
async def _set_rls_context(session: AsyncSession, org_id: str, user_id: str) -> None:
    await session.execute(
        sa.text("SELECT set_config('app.organization_id', :v, true)"),
        {"v": org_id},
    )
    await session.execute(
        sa.text("SELECT set_config('app.user_id', :v, true)"),
        {"v": user_id},
    )


async def claim_next(
    session: AsyncSession,
    org_id: str,
    user_id: str,
    worker_id: str,
    lease: int,
) -> Optional[dict]:
    """Claim one workable attempt. Enforces next_retry_at semantics."""
    await _set_rls_context(session, org_id, user_id)

    # Step 1: SELECT ... FOR UPDATE SKIP LOCKED to pick the row
    pick_result = await session.execute(
        sa.text("""
            SELECT id, dataset_id
            FROM science.validation_attempts
            WHERE organization_id = CAST(:org_id AS uuid)
              AND (
                  (status = CAST('queued' AS science.validation_attempt_status)
                   AND (next_retry_at IS NULL OR next_retry_at <= NOW()))
                  OR
                  (status = CAST('failed' AS science.validation_attempt_status)
                   AND next_retry_at IS NOT NULL AND next_retry_at <= NOW())
              )
            ORDER BY next_retry_at NULLS FIRST, created_at
            LIMIT 1
            FOR UPDATE SKIP LOCKED
        """),
        {"org_id": org_id},
    )
    pick_row = pick_result.first()
    if pick_row is None:
        return None

    picked_id = pick_row[0]

    # Step 2: UPDATE the picked row to claimed
    update_result = await session.execute(
        sa.text("""
            UPDATE science.validation_attempts
            SET status = CAST('claimed' AS science.validation_attempt_status),
                claimed_at = NOW(),
                claimed_by = :worker_id,
                lock_expires_at = NOW() + make_interval(secs => :lease),
                started_at = NOW(),
                attempt_number = CASE
                    WHEN status = CAST('failed' AS science.validation_attempt_status)
                    THEN attempt_number + 1
                    ELSE attempt_number
                END,
                updated_at = NOW()
            WHERE id = CAST(:id AS uuid)
              AND organization_id = CAST(:org_id AS uuid)
            RETURNING *
        """),
        {"worker_id": worker_id, "lease": float(lease), "org_id": org_id, "id": str(picked_id)},
    )
    row = update_result.mappings().first()
    if not row:
        return None

    attempt = dict(row)

    # Step 3: Update dataset status to validating
    await session.execute(
        sa.text("""
            UPDATE science.datasets
            SET dataset_status = CAST('validating' AS science.dataset_status),
                status_changed_at = NOW(),
                updated_at = NOW()
            WHERE organization_id = CAST(:org_id AS uuid)
              AND id = CAST(:dataset_id AS uuid)
              AND dataset_status = CAST('pending_validation' AS science.dataset_status)
        """),
        {"org_id": org_id, "dataset_id": str(attempt["dataset_id"])},
    )

    return attempt


async def reclaim_stale(
    session: AsyncSession,
    org_id: str,
    user_id: str,
    worker_id: str,
    lease: int,
) -> Optional[dict]:
    """Recover attempts from crashed workers whose lock_expires_at passed."""
    await _set_rls_context(session, org_id, user_id)

    # Step 1: Pick a stale-locked row
    pick_result = await session.execute(
        sa.text("""
            SELECT id, dataset_id
            FROM science.validation_attempts
            WHERE organization_id = CAST(:org_id AS uuid)
              AND status = CAST('claimed' AS science.validation_attempt_status)
              AND lock_expires_at < NOW()
            ORDER BY lock_expires_at
            LIMIT 1
            FOR UPDATE SKIP LOCKED
        """),
        {"org_id": org_id},
    )
    pick_row = pick_result.first()
    if pick_row is None:
        return None

    picked_id = pick_row[0]

    # Step 2: UPDATE the picked row
    update_result = await session.execute(
        sa.text("""
            UPDATE science.validation_attempts
            SET status = CAST('claimed' AS science.validation_attempt_status),
                claimed_at = NOW(),
                claimed_by = :worker_id,
                lock_expires_at = NOW() + make_interval(secs => :lease),
                started_at = NOW(),
                attempt_number = attempt_number + 1,
                updated_at = NOW()
            WHERE id = CAST(:id AS uuid)
              AND organization_id = CAST(:org_id AS uuid)
            RETURNING *
        """),
        {"worker_id": worker_id, "lease": float(lease), "org_id": org_id, "id": str(picked_id)},
    )
    row = update_result.mappings().first()
    if not row:
        return None

    attempt = dict(row)

    # Step 3: Update dataset status
    await session.execute(
        sa.text("""
            UPDATE science.datasets
            SET dataset_status = CAST('validating' AS science.dataset_status),
                status_changed_at = NOW(),
                updated_at = NOW()
            WHERE organization_id = CAST(:org_id AS uuid)
              AND id = CAST(:dataset_id AS uuid)
              AND dataset_status = CAST('pending_validation' AS science.dataset_status)
        """),
        {"org_id": org_id, "dataset_id": str(attempt["dataset_id"])},
    )

    return attempt


async def claim_next_across_orgs(
    session: AsyncSession,
    worker_id: str,
    lease: int,
) -> Optional[dict]:
    """Claim the next available attempt across all organizations.
    
    Calls the SECURITY DEFINER function that bypasses RLS to query across all orgs.
    Returns dict with attempt fields including organization_id, or None if no work.
    """
    result = await session.execute(
        sa.text("""
            SELECT * FROM science.validation_worker_claim_across_orgs(
                :worker_id, :lease
            )
        """),
        {"worker_id": worker_id, "lease": lease},
    )
    row = result.mappings().first()
    if row is None:
        return None
    return dict(row)


async def reclaim_stale_across_orgs(
    session: AsyncSession,
) -> Optional[dict]:
    """Reclaim a stale attempt across all organizations.
    
    Calls the SECURITY DEFINER function that bypasses RLS to query across all orgs.
    Targets attempts with status IN ('claimed', 'running') AND lock_expires_at < NOW().
    Respects max_attempts: quarantines if exceeded, else requeues.
    Returns dict with attempt fields including organization_id, or None if no stale work.
    
    NOTE: This is a sweep-only operation. The returned row is now in 'queued' status
    and this worker does NOT own it. The normal claim loop should pick it up.
    """
    result = await session.execute(
        sa.text("""
            SELECT * FROM science.validation_worker_reclaim_stale_across_orgs()
        """),
    )
    row = result.mappings().first()
    if row is None:
        return None
    return dict(row)


async def renew_lock(
    session: AsyncSession,
    org_id: str,
    user_id: str,
    worker_id: str,
    attempt_id: str,
    lease: int,
) -> bool:
    """Extend lock_expires_at for an in-flight attempt."""
    await _set_rls_context(session, org_id, user_id)
    result = await session.execute(
        sa.text("""
            UPDATE science.validation_attempts
            SET lock_expires_at = NOW() + make_interval(secs => :lease),
                updated_at = NOW()
            WHERE organization_id = CAST(:org_id AS uuid)
              AND id = CAST(:id AS uuid)
              AND claimed_by = :worker_id
              AND status IN (CAST('claimed' AS science.validation_attempt_status),
                             CAST('running' AS science.validation_attempt_status))
        """),
        {"lease": float(lease), "org_id": org_id, "id": attempt_id, "worker_id": worker_id},
    )
    return (result.rowcount or 0) > 0


async def release_claim(
    session: AsyncSession,
    org_id: str,
    user_id: str,
    worker_id: str,
    attempt_id: str,
) -> bool:
    """Release claim so another worker can pick it up."""
    await _set_rls_context(session, org_id, user_id)
    result = await session.execute(
        sa.text("""
            UPDATE science.validation_attempts
            SET status = CAST('queued' AS science.validation_attempt_status),
                claimed_at = NULL,
                claimed_by = NULL,
                started_at = NULL,
                lock_expires_at = NOW() + INTERVAL '5 minutes',
                updated_at = NOW()
            WHERE organization_id = CAST(:org_id AS uuid)
              AND id = CAST(:id AS uuid)
              AND claimed_by = :worker_id
              AND status IN (CAST('claimed' AS science.validation_attempt_status),
                             CAST('running' AS science.validation_attempt_status))
              AND completed_at IS NULL
        """),
        {"org_id": org_id, "id": attempt_id, "worker_id": worker_id},
    )
    return (result.rowcount or 0) > 0


async def mark_running(
    session: AsyncSession,
    org_id: str,
    user_id: str,
    worker_id: str,
    attempt_id: str,
) -> bool:
    await _set_rls_context(session, org_id, user_id)
    result = await session.execute(
        sa.text("""
            UPDATE science.validation_attempts
            SET status = CAST('running' AS science.validation_attempt_status),
                updated_at = NOW()
            WHERE organization_id = CAST(:org_id AS uuid)
              AND id = CAST(:id AS uuid)
              AND status = CAST('claimed' AS science.validation_attempt_status)
              AND claimed_by = :worker_id
        """),
        {"org_id": org_id, "id": attempt_id, "worker_id": worker_id},
    )
    return (result.rowcount or 0) > 0


async def mark_passed(
    session: AsyncSession,
    org_id: str,
    user_id: str,
    worker_id: str,
    attempt_id: str,
    checksum: str,
    byte_size: int,
) -> bool:
    await _set_rls_context(session, org_id, user_id)
    result = await session.execute(
        sa.text("""
            SELECT science.validation_worker_settle_terminal(
                CAST(:org_id AS uuid),
                CAST(:id AS uuid),
                CAST('passed' AS science.validation_attempt_status),
                CAST('valid' AS science.dataset_status),
                NULL,
                NULL,
                NULL,
                :checksum,
                :byte_size
            )
        """),
        {"org_id": org_id, "id": attempt_id, "worker_id": worker_id, "checksum": checksum, "byte_size": byte_size},
    )
    return result.scalar() is not None


async def mark_failed_with_retry(
    session: AsyncSession,
    org_id: str,
    user_id: str,
    worker_id: str,
    attempt_id: str,
    failure_code: str,
    failure_details: dict,
) -> bool:
    await _set_rls_context(session, org_id, user_id)
    safe_failure_details = _normalize_pg_json(failure_details)
    result = await session.execute(
        sa.text("""
            UPDATE science.validation_attempts
            SET status = CAST('failed' AS science.validation_attempt_status),
                failure_code = :failure_code,
                failure_details = CAST(:failure_details AS jsonb),
                next_retry_at = NOW() + (30 * power(2, LEAST(attempt_number - 1, 4))) * INTERVAL '1 second',
                claimed_at = NULL,
                claimed_by = NULL,
                updated_at = NOW()
            WHERE organization_id = CAST(:org_id AS uuid)
              AND id = CAST(:id AS uuid)
              AND status = CAST('running' AS science.validation_attempt_status)
              AND claimed_by = :worker_id
        """),
        {
            "org_id": org_id, "id": attempt_id, "worker_id": worker_id,
            "failure_code": failure_code, "failure_details": json.dumps(safe_failure_details),
        },
    )
    if (result.rowcount or 0) == 0:
        return False
    await session.execute(
        sa.text("""
            UPDATE science.datasets
            SET dataset_status = CAST('pending_validation' AS science.dataset_status),
                status_changed_at = NOW(),
                updated_at = NOW()
            WHERE organization_id = CAST(:org_id AS uuid)
              AND id IN (SELECT dataset_id FROM science.validation_attempts WHERE id = CAST(:id AS uuid))
              AND dataset_status = CAST('validating' AS science.dataset_status)
        """),
        {"org_id": org_id, "id": attempt_id},
    )
    return True


async def mark_quarantined(
    session: AsyncSession,
    org_id: str,
    user_id: str,
    worker_id: str,
    attempt_id: str,
    failure_code: str,
    failure_details: dict,
    quarantine_reason: str,
    checksum: Optional[str] = None,
    byte_size: Optional[int] = None,
) -> bool:
    await _set_rls_context(session, org_id, user_id)
    safe_failure_details = _normalize_pg_json(failure_details)
    safe_quarantine_reason = _normalize_pg_text(
        quarantine_reason,
        limit_bytes=_QUARANTINE_REASON_LIMIT_BYTES,
    )
    result = await session.execute(
        sa.text("""
            SELECT science.validation_worker_settle_terminal(
                CAST(:org_id AS uuid),
                CAST(:id AS uuid),
                CAST('quarantined' AS science.validation_attempt_status),
                CAST('quarantined' AS science.dataset_status),
                :failure_code,
                CAST(:failure_details AS jsonb),
                :quarantine_reason,
                :checksum,
                :byte_size
            )
        """),
        {
            "org_id": org_id, "id": attempt_id, "worker_id": worker_id,
            "failure_code": failure_code, "failure_details": json.dumps(safe_failure_details),
            "quarantine_reason": safe_quarantine_reason,
            "checksum": checksum, "byte_size": byte_size,
        },
    )
    return result.scalar() is not None


async def mark_invalid(
    session: AsyncSession,
    org_id: str,
    user_id: str,
    worker_id: str,
    attempt_id: str,
    failure_code: str,
    failure_details: dict,
) -> bool:
    await _set_rls_context(session, org_id, user_id)
    safe_failure_details = _normalize_pg_json(failure_details)
    result = await session.execute(
        sa.text("""
            SELECT science.validation_worker_settle_terminal(
                CAST(:org_id AS uuid),
                CAST(:id AS uuid),
                CAST('failed' AS science.validation_attempt_status),
                CAST('invalid' AS science.dataset_status),
                :failure_code,
                CAST(:failure_details AS jsonb),
                NULL,
                NULL,
                NULL
            )
        """),
        {
            "org_id": org_id, "id": attempt_id, "worker_id": worker_id,
            "failure_code": failure_code, "failure_details": json.dumps(safe_failure_details),
        },
    )
    return result.scalar() is not None


async def append_audit_event(
    session: AsyncSession,
    org_id: str,
    user_id: str,
    action: str,
    resource_type: str,
    resource_id: str,
) -> None:
    await _set_rls_context(session, org_id, user_id)
    await session.execute(
        sa.text("""
            SELECT governance.append_audit_event(
                CAST(:org_id AS uuid), CAST(:user_id AS uuid), :action, :resource_type, :resource_id
            )
        """),
        {
            "org_id": org_id, "user_id": user_id, "action": action,
            "resource_type": resource_type, "resource_id": resource_id,
        },
    )


# ---------------------------------------------------------------------------
# Heartbeat (lease renewal) task
# ---------------------------------------------------------------------------
async def _heartbeat(
    engine,
    org_id: str,
    user_id: str,
    worker_id: str,
    attempt_id: str,
    lease: int,
    interval: float,
    stop_event: asyncio.Event,
) -> None:
    """Periodically renew lock_expires_at until stopped or attempt settles."""
    while not stop_event.is_set():
        try:
            try:
                await asyncio.wait_for(stop_event.wait(), timeout=interval)
                break
            except asyncio.TimeoutError:
                pass
            if stop_event.is_set():
                break
            async with engine.begin() as conn:
                session = AsyncSession(bind=conn)
                try:
                    ok = await renew_lock(session, org_id, user_id, worker_id, attempt_id, lease)
                    await session.commit()
                    if ok:
                        counters.heartbeats += 1
                        logger.debug("heartbeat renewed attempt=%s", attempt_id)
                    else:
                        logger.warning("heartbeat: lock not renewable for attempt=%s", attempt_id)
                        break
                finally:
                    await session.close()
        except asyncio.CancelledError:
            break
        except Exception:
            logger.warning("heartbeat error for attempt=%s: %s", attempt_id, traceback.format_exc())


# ---------------------------------------------------------------------------
# Process one attempt (core work unit)
# ---------------------------------------------------------------------------
async def process_one(
    engine,
    org_id: Optional[str],
    user_id: str,
    worker_id: str,
    lease: int,
    heartbeat_interval: float,
    mode: str = "single_org",
) -> Optional[str]:
    """
    Claim and process a single validation attempt.
    
    In single_org mode: org_id is required and used for all operations.
    In multi_org mode: org_id is ignored; extracted from the claimed attempt.
    
    Returns the outcome status string, or None if no work available.
    """
    claimed = None

    async with engine.begin() as conn:
        session = AsyncSession(bind=conn)
        try:
            if mode == "multi_org":
                claimed = await claim_next_across_orgs(session, worker_id, lease)
            else:
                if not org_id:
                    raise RuntimeError("org_id is required in single_org mode")
                claimed = await claim_next(session, org_id, user_id, worker_id, lease)
            await session.commit()
        finally:
            await session.close()

    if not claimed:
        return None

    # In multi-org mode, extract org_id from the claimed attempt
    if mode == "multi_org":
        org_id = str(claimed["organization_id"])

    attempt_id = str(claimed["id"])
    dataset_id = str(claimed["dataset_id"])
    original_object_id = str(claimed["original_object_id"])
    attempt_number = claimed["attempt_number"]
    max_attempts = claimed["max_attempts"]

    logger.info(
        "claimed attempt=%s dataset=%s attempt_number=%d worker=%s",
        attempt_id, dataset_id, attempt_number, worker_id,
    )
    counters.claimed += 1

    # Transition to running
    async with engine.begin() as conn:
        session = AsyncSession(bind=conn)
        try:
            await mark_running(session, org_id, user_id, worker_id, attempt_id)
            await append_audit_event(
                session, org_id, user_id,
                "validation.claimed", "validation_attempt", attempt_id,
            )
            await session.commit()
        finally:
            await session.close()

    # Start heartbeat for lease renewal
    heartbeat_stop = asyncio.Event()
    heartbeat_task = asyncio.create_task(
        _heartbeat(engine, org_id, user_id, worker_id, attempt_id, lease, heartbeat_interval, heartbeat_stop)
    )

    outcome_status = "failed"
    try:
        # Load dataset and object info
        async with engine.begin() as conn:
            session = AsyncSession(bind=conn)
            try:
                await _set_rls_context(session, org_id, user_id)
                ds_result = await session.execute(
                    sa.text("SELECT * FROM science.datasets WHERE organization_id = CAST(:org_id AS uuid) AND id = CAST(:id AS uuid)"),
                    {"org_id": org_id, "id": dataset_id},
                )
                ds_row = ds_result.mappings().first()
                dataset = dict(ds_row) if ds_row else None

                obj_result = await session.execute(
                    sa.text("SELECT * FROM science.dataset_objects WHERE organization_id = CAST(:org_id AS uuid) AND id = CAST(:id AS uuid)"),
                    {"org_id": org_id, "id": original_object_id},
                )
                obj_row = obj_result.mappings().first()
                obj = dict(obj_row) if obj_row else None
                await session.commit()
            finally:
                await session.close()

        if not dataset or not obj:
            async with engine.begin() as conn:
                session = AsyncSession(bind=conn)
                try:
                    await mark_quarantined(
                        session, org_id, user_id, worker_id, attempt_id,
                        "OBJECT_LINEAGE_MISSING",
                        {"check": "object_exists", "detail": "Dataset or object not found"},
                        "Dataset/object lineage required for validation is missing",
                    )
                    await append_audit_event(
                        session, org_id, user_id,
                        "validation.quarantined", "dataset", dataset_id,
                    )
                    await session.commit()
                finally:
                    await session.close()
            counters.quarantined += 1
            logger.info("quarantined attempt=%s reason=OBJECT_LINEAGE_MISSING", attempt_id)
            outcome_status = "quarantined"
            return outcome_status

        object_key = obj["object_key"]
        expected_byte_size = dataset["byte_size"]
        display_filename = dataset["display_filename"]
        declared_content_type = dataset["declared_content_type"]
        client_checksum_sha256 = dataset.get("client_checksum_sha256")

        # Run validation checks
        from api.storage.factory import get_object_store
        from api.validation.checks import run_all_checks, verify_authoritative_object

        store = get_object_store()
        integrity_result = await verify_authoritative_object(
            store=store,
            object_key=object_key,
            expected_byte_size=expected_byte_size,
            persisted_byte_size=obj.get("byte_size"),
            authoritative_sha256=obj.get("authoritative_sha256"),
        )
        if not integrity_result.passed:
            async with engine.begin() as conn:
                session = AsyncSession(bind=conn)
                try:
                    await mark_quarantined(
                        session,
                        org_id,
                        user_id,
                        worker_id,
                        attempt_id,
                        integrity_result.failure_code or "AUTHORITATIVE_INTEGRITY_MISMATCH",
                        {"check": "authoritative_integrity", "detail": integrity_result.detail},
                        "Final object failed independent server-authoritative digest/size verification",
                        checksum=integrity_result.server_checksum_sha256,
                        byte_size=integrity_result.byte_size_verified,
                    )
                    await append_audit_event(
                        session, org_id, user_id,
                        "validation.quarantined", "dataset", dataset_id,
                    )
                    await session.commit()
                finally:
                    await session.close()
            counters.quarantined += 1
            logger.info(
                "quarantined attempt=%s dataset=%s reason=%s",
                attempt_id, dataset_id, integrity_result.failure_code,
            )
            outcome_status = "quarantined"
            return outcome_status

        validation_result = await run_all_checks(
            store=store,
            object_key=object_key,
            expected_byte_size=expected_byte_size,
            display_filename=display_filename,
            declared_content_type=declared_content_type,
            client_checksum_sha256=client_checksum_sha256,
        )

        # If standard checks passed, run the isolated container parser
        if validation_result.passed:
            if os.getenv("DIFARYX_BYPASS_CONTAINER_PARSER") == "true":
                # Bypassed for standard worker integration tests
                if not BYPASS_SENTINEL:
                    raise RuntimeError(
                        "Bypass attempt blocked: test-only sentinel is not enabled in memory. "
                        "Bypassing container parser is provably impossible in production."
                    )
                raise RuntimeError(
                    "Bypass mode is active: bypassed validation attempts are quarantined and cannot yield a valid status."
                )
            else:
                import tempfile
                from api.validation.isolated_runner import ContainerParserRunner

                fd_in, temp_in_path = tempfile.mkstemp(suffix=".csv", prefix="verified-input-")
                os.close(fd_in)
                fd_out, temp_out_path = tempfile.mkstemp(suffix=".json", prefix="parser-output-")
                os.close(fd_out)

                try:
                    # Streaming read to create verified read-only input snapshot
                    with open(temp_in_path, "wb") as f_in:
                        async for chunk in store.get_object(object_key):
                            f_in.write(chunk)

                    runner = ContainerParserRunner()

                    # Declared technique selects the parser. No generic
                    # fallback — unknown techniques quarantine via the parser
                    # entrypoint with UNKNOWN_PARSER_NOT_REGISTERED.
                    declared_technique = str(dataset.get("technique") or "").lower()
                    if not declared_technique:
                        # Dataset row missing technique — treat as quarantine.
                        async with engine.begin() as conn:
                            session = AsyncSession(bind=conn)
                            try:
                                await mark_quarantined(
                                    session, org_id, user_id, worker_id, attempt_id,
                                    "OBJECT_LINEAGE_MISSING",
                                    {"check": "technique_missing", "detail": "dataset row has no technique"},
                                    "Dataset row missing technique; cannot select parser",
                                )
                                await append_audit_event(
                                    session, org_id, user_id,
                                    "validation.quarantined", "dataset", dataset_id,
                                )
                                await session.commit()
                            finally:
                                await session.close()
                        counters.quarantined += 1
                        outcome_status = "quarantined"
                        return outcome_status

                    # Run container parser runner with the declared technique.
                    parser_result = await runner.run_parser(
                        declared_technique, temp_in_path, temp_out_path, timeout=90.0
                    )

                    from api.validation.checks import ValidationResult
                    parser_status = parser_result.get("status")
                    if parser_status == "valid":
                        # Parser confirmed structural validity. Identity-
                        # confirmation is transient metadata only (not
                        # persisted as a separate dataset field).
                        validation_result = ValidationResult(
                            passed=True,
                            checks=validation_result.checks,
                            server_checksum_sha256=validation_result.server_checksum_sha256,
                            byte_size_verified=validation_result.byte_size_verified,
                            failure_code=None,
                            failure_details=None,
                            transient=False,
                        )
                    elif parser_status == "invalid":
                        validation_result = ValidationResult(
                            passed=False,
                            checks=validation_result.checks,
                            server_checksum_sha256=validation_result.server_checksum_sha256,
                            byte_size_verified=validation_result.byte_size_verified,
                            failure_code=parser_result.get("error_code") or "TECHNIQUE_RULES_VIOLATION",
                            failure_details={
                                "check": "container_parser",
                                "detail": parser_result.get("error_message") or "Invalid data format",
                                "technique_identity_class": parser_result.get("technique_identity_class"),
                            },
                            transient=False,
                        )
                    elif parser_status == "quarantined":
                        # Parser explicitly quarantined (technique mismatch,
                        # ambiguous markers, protocol violation, etc.).
                        # Settle immediately as quarantined; do not let the
                        # generic settlement path reclassify as invalid.
                        q_failure_code = parser_result.get("error_code") or "PARSER_QUARANTINED"
                        q_failure_details = {
                            "check": "container_parser",
                            "detail": parser_result.get("error_message") or "Parser quarantined",
                            "technique_identity_class": parser_result.get("technique_identity_class"),
                        }
                        q_reason = _normalize_pg_text(
                            f"Parser quarantined: {q_failure_code}"
                        ) or "Parser quarantined"
                        async with engine.begin() as conn:
                            session = AsyncSession(bind=conn)
                            try:
                                await mark_quarantined(
                                    session, org_id, user_id, worker_id, attempt_id,
                                    q_failure_code,
                                    q_failure_details,
                                    q_reason,
                                    checksum=validation_result.server_checksum_sha256,
                                    byte_size=validation_result.byte_size_verified,
                                )
                                await append_audit_event(
                                    session, org_id, user_id,
                                    "validation.quarantined", "dataset", dataset_id,
                                )
                                await session.commit()
                            finally:
                                await session.close()
                        counters.quarantined += 1
                        logger.info(
                            "quarantined attempt=%s code=%s (parser_status=quarantined)",
                            attempt_id, q_failure_code,
                        )
                        outcome_status = "quarantined"
                        return outcome_status
                    else:
                        raise RuntimeError(
                            f"Unexpected parser outcome status: {parser_status!r}"
                        )

                except Exception as e:
                    logger.error(f"Isolated container parser runner failed or quarantined attempt={attempt_id}: {e}")
                    isolation_failure_details, isolation_quarantine_reason = _build_isolation_failure_payload(e)
                    async with engine.begin() as conn:
                        session = AsyncSession(bind=conn)
                        try:
                            if attempt_number >= max_attempts:
                                await mark_quarantined(
                                    session,
                                    org_id,
                                    user_id,
                                    worker_id,
                                    attempt_id,
                                    "ISOLATION_SANDBOX_ERROR",
                                    isolation_failure_details,
                                    isolation_quarantine_reason,
                                    checksum=validation_result.server_checksum_sha256,
                                    byte_size=validation_result.byte_size_verified,
                                )
                                await append_audit_event(
                                    session, org_id, user_id,
                                    "validation.quarantined", "dataset", dataset_id,
                                )
                                await session.commit()
                                counters.quarantined += 1
                                outcome_status = "quarantined"
                                logger.info(
                                    "quarantined attempt=%s attempt_number=%d/%d (sandbox retries exhausted)",
                                    attempt_id, attempt_number, max_attempts,
                                )
                            else:
                                requeued = await mark_failed_with_retry(
                                    session,
                                    org_id,
                                    user_id,
                                    worker_id,
                                    attempt_id,
                                    "ISOLATION_SANDBOX_ERROR",
                                    isolation_failure_details,
                                )
                                if requeued:
                                    await append_audit_event(
                                        session, org_id, user_id,
                                        "validation.failed", "validation_attempt", attempt_id,
                                    )
                                    await session.commit()
                                    counters.retried += 1
                                    outcome_status = "retry"
                                    logger.info(
                                        "sandbox failure requeued attempt=%s attempt_number=%d/%d",
                                        attempt_id, attempt_number, max_attempts,
                                    )
                                else:
                                    await mark_quarantined(
                                        session,
                                        org_id,
                                        user_id,
                                        worker_id,
                                        attempt_id,
                                        "ISOLATION_SANDBOX_ERROR",
                                        isolation_failure_details,
                                        isolation_quarantine_reason,
                                        checksum=validation_result.server_checksum_sha256,
                                        byte_size=validation_result.byte_size_verified,
                                    )
                                    await append_audit_event(
                                        session, org_id, user_id,
                                        "validation.quarantined", "dataset", dataset_id,
                                    )
                                    await session.commit()
                                    counters.quarantined += 1
                                    outcome_status = "quarantined"
                                    logger.warning(
                                        "quarantined attempt=%s (mark_failed_with_retry matched 0 rows)",
                                        attempt_id,
                                    )
                        finally:
                            await session.close()
                    return outcome_status
                finally:
                    # Cleanup temp files safely
                    try:
                        if os.path.exists(temp_in_path):
                            os.unlink(temp_in_path)
                        if os.path.exists(temp_out_path):
                            os.unlink(temp_out_path)
                    except Exception as ex:
                        logger.warning(f"Failed to cleanup temp files: {ex}")

        # Settle the attempt
        async with engine.begin() as conn:
            session = AsyncSession(bind=conn)
            try:
                if validation_result.passed:
                    await mark_passed(
                        session, org_id, user_id, worker_id, attempt_id,
                        validation_result.server_checksum_sha256 or "",
                        validation_result.byte_size_verified or 0,
                    )
                    await append_audit_event(
                        session, org_id, user_id,
                        "validation.passed", "dataset", dataset_id,
                    )
                    counters.passed += 1
                    logger.info("passed attempt=%s dataset=%s", attempt_id, dataset_id)
                    outcome_status = "passed"

                elif validation_result.transient:
                    if attempt_number >= max_attempts:
                        await mark_quarantined(
                            session, org_id, user_id, worker_id, attempt_id,
                            validation_result.failure_code or "UNKNOWN",
                            validation_result.failure_details or {},
                            f"Max retries ({max_attempts}) exhausted for transient failure",
                        )
                        await append_audit_event(
                            session, org_id, user_id,
                            "validation.quarantined", "dataset", dataset_id,
                        )
                        counters.quarantined += 1
                        logger.info("quarantined attempt=%s dataset=%s", attempt_id, dataset_id)
                        outcome_status = "quarantined"
                    else:
                        await mark_failed_with_retry(
                            session, org_id, user_id, worker_id, attempt_id,
                            validation_result.failure_code or "UNKNOWN",
                            validation_result.failure_details or {},
                        )
                        await append_audit_event(
                            session, org_id, user_id,
                            "validation.failed", "validation_attempt", attempt_id,
                        )
                        counters.retried += 1
                        logger.info("retry attempt=%s attempt_number=%d", attempt_id, attempt_number)
                        outcome_status = "retry"

                else:
                    quarantine_codes = {
                        "CONTENT_POLICY_VIOLATION",
                        "ISOLATION_SANDBOX_ERROR",
                        "SANDBOX_VIOLATION",
                        "OBJECT_LINEAGE_MISSING",
                    }
                    if validation_result.failure_code in quarantine_codes:
                        await mark_quarantined(
                            session, org_id, user_id, worker_id, attempt_id,
                            validation_result.failure_code or "UNKNOWN",
                            validation_result.failure_details or {},
                            "Non-transient content/sandbox violation; quarantining instead of marking invalid",
                        )
                        await append_audit_event(
                            session, org_id, user_id,
                            "validation.quarantined", "dataset", dataset_id,
                        )
                        counters.quarantined += 1
                        logger.info("quarantined attempt=%s code=%s", attempt_id, validation_result.failure_code)
                        outcome_status = "quarantined"
                    else:
                        await mark_invalid(
                            session, org_id, user_id, worker_id, attempt_id,
                            validation_result.failure_code or "UNKNOWN",
                            validation_result.failure_details or {},
                        )
                        await append_audit_event(
                            session, org_id, user_id,
                            "validation.invalid", "dataset", dataset_id,
                        )
                        counters.failed += 1
                        logger.info("failed attempt=%s code=%s", attempt_id, validation_result.failure_code)
                        outcome_status = "failed"

                await session.commit()
            finally:
                await session.close()

    except asyncio.CancelledError:
        # Shutdown requested — release the claim
        logger.info("cancelled attempt=%s, releasing claim", attempt_id)
        async with engine.begin() as conn:
            session = AsyncSession(bind=conn)
            try:
                await release_claim(session, org_id, user_id, worker_id, attempt_id)
                await session.commit()
            finally:
                await session.close()
        outcome_status = "released"
        raise
    except Exception as exc:
        logger.error("error processing attempt=%s: %s", attempt_id, traceback.format_exc())
        counters.errors += 1
        # Try to release claim so it can be retried
        try:
            async with engine.begin() as conn:
                session = AsyncSession(bind=conn)
                try:
                    await release_claim(session, org_id, user_id, worker_id, attempt_id)
                    await session.commit()
                finally:
                    await session.close()
        except Exception:
            logger.error("failed to release claim for attempt=%s", attempt_id)
        outcome_status = "error"
    finally:
        heartbeat_stop.set()
        try:
            await asyncio.wait_for(heartbeat_task, timeout=5.0)
        except (asyncio.TimeoutError, asyncio.CancelledError):
            heartbeat_task.cancel()

    return outcome_status


# ---------------------------------------------------------------------------
# Worker main loop
# ---------------------------------------------------------------------------
class ValidationWorker:
    def __init__(
        self,
        engine,
        org_id: Optional[str],
        user_id: str,
        worker_id: str,
        mode: str = "single_org",
        lease: int = LEASE_DURATION,
        poll_interval: float = POLL_INTERVAL,
        idle_backoff_cap: float = IDLE_BACKOFF_CAP,
        heartbeat_interval: float = HEARTBEAT_INTERVAL,
        reclaim_every: int = RECLAIM_EVERY,
    ) -> None:
        self.engine = engine
        self.org_id = org_id
        self.user_id = user_id
        self.worker_id = worker_id
        self.mode = mode
        self.lease = lease
        self.poll_interval = poll_interval
        self.idle_backoff_cap = idle_backoff_cap
        self.heartbeat_interval = heartbeat_interval
        self.reclaim_every = reclaim_every
        self._shutdown = asyncio.Event()
        self._loop_count = 0
        self._idle_backoff = self.poll_interval

    async def start(self) -> None:
        """Run the worker until shutdown is requested."""
        logger.info(
            "worker starting: id=%s org=%s concurrency=%d lease=%ds poll=%.1fs backoff_cap=%.1fs",
            self.worker_id, self.org_id, CONCURRENCY, self.lease,
            self.poll_interval, self.idle_backoff_cap,
        )

        try:
            while not self._shutdown.is_set():
                self._loop_count += 1

                # Periodic stale-lock reclaim
                if self._loop_count % self.reclaim_every == 0:
                    await self._do_reclaim()

                # Try to claim and process work (drain while available)
                drained_any = False
                for _ in range(CONCURRENCY):
                    if self._shutdown.is_set():
                        break
                    outcome = await process_one(
                        self.engine,
                        self.org_id,
                        self.user_id,
                        self.worker_id,
                        self.lease,
                        self.heartbeat_interval,
                        self.mode,
                    )
                    if outcome:
                        drained_any = True
                        self._idle_backoff = self.poll_interval
                    else:
                        break

                if self._shutdown.is_set():
                    break

                if not drained_any:
                    # Queue empty, back off
                    self._idle_backoff = min(
                        self._idle_backoff * 1.5,
                        self.idle_backoff_cap,
                    )
                    counters.polls_idle += 1
                    try:
                        await asyncio.wait_for(
                            self._shutdown.wait(),
                            timeout=self._idle_backoff,
                        )
                    except (asyncio.TimeoutError, asyncio.CancelledError):
                        pass
        except asyncio.CancelledError:
            pass
        finally:
            logger.info("worker stopped: id=%s counters=%s", self.worker_id, counters.snapshot())

    async def _do_reclaim(self) -> None:
        try:
            async with self.engine.begin() as conn:
                session = AsyncSession(bind=conn)
                try:
                    if self.mode == "multi_org":
                        # Sweep-only: reclaim across all orgs, but don't process the returned row
                        # The returned row is now in 'queued' status and will be picked up by claim loop
                        reclaimed = await reclaim_stale_across_orgs(session)
                        await session.commit()
                        if reclaimed:
                            counters.reclaimed += 1
                            logger.info(
                                "reclaimed attempt=%s from_crashed_worker (sweep-only, not processing)",
                                str(reclaimed["id"]),
                            )
                    else:
                        # Single-org mode: reclaim and potentially process
                        reclaimed = await reclaim_stale(
                            session, self.org_id, self.user_id, self.worker_id, self.lease,
                        )
                        await session.commit()
                        if reclaimed:
                            counters.reclaimed += 1
                            logger.info(
                                "reclaimed attempt=%s from_crashed_worker",
                                str(reclaimed["id"]),
                            )
                finally:
                    await session.close()
        except Exception:
            logger.warning("reclaim error: %s", traceback.format_exc())

    def request_shutdown(self) -> None:
        """Signal the worker to stop claiming new work."""
        logger.info("shutdown requested for worker=%s", self.worker_id)
        self._shutdown.set()


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------
async def run() -> None:
    if MODE == "single_org" and not ORGANIZATION_ID:
        raise RuntimeError("VW_ORGANIZATION_ID is required in single_org mode")
    if not USER_ID:
        raise RuntimeError("VW_USER_ID is required")

    logger.info("worker mode: %s", MODE)
    if MODE == "single_org":
        logger.info("organization_id: %s", ORGANIZATION_ID)

    engine = _make_engine()

    # Verify DB readiness
    async with engine.begin() as conn:
        result = await conn.execute(sa.text("SELECT version()"))
        db_version = result.scalar()
        logger.info("database: %s", db_version)

    worker = ValidationWorker(
        engine=engine,
        org_id=ORGANIZATION_ID if MODE == "single_org" else None,
        user_id=USER_ID,
        worker_id=WORKER_ID,
        mode=MODE,
    )

    loop = asyncio.get_running_loop()

    # Signal handling — works on both POSIX and Windows (ProactorEventLoop)
    def _signal_handler(sig, _frame=None):
        logger.info("received signal %s, requesting graceful shutdown", sig)
        worker.request_shutdown()

    try:
        loop.add_signal_handler(signal.SIGINT, worker.request_shutdown)
        loop.add_signal_handler(signal.SIGTERM, worker.request_shutdown)
    except (NotImplementedError, RuntimeError):
        # Windows or unsupported — use signal.signal
        signal.signal(signal.SIGINT, _signal_handler)
        signal.signal(signal.SIGTERM, _signal_handler)
        if sys.platform == "win32":
            signal.signal(signal.SIGBREAK, _signal_handler)

    try:
        await worker.start()
    finally:
        await engine.dispose()
        logger.info("engine disposed, worker exiting")


def main() -> None:
    """CLI entrypoint.

    On Windows, psycopg async requires SelectorEventLoop (not ProactorEventLoop),
    so we use a loop factory to ensure compatibility.
    """
    try:
        if sys.platform == "win32":
            asyncio.run(run(), loop_factory=asyncio.SelectorEventLoop)
        else:
            asyncio.run(run())
    except KeyboardInterrupt:
        logger.info("keyboard interrupt, exiting")
        sys.exit(0)


if __name__ == "__main__":
    main()
