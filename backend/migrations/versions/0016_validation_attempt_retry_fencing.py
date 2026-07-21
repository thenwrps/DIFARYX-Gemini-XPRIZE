"""Normalize retry history and fence worker-owned validation settlements.

Revision ID: 0016
Revises: 0015
Create Date: 2026-07-21

Migration 0012 is already shipped and remains immutable.  This migration
normalizes the legacy ``failed + next_retry_at + incomplete`` representation,
then replaces the cross-organization claim/reclaim functions with the same
claim and ownership predicates used by the Python worker.
"""

from alembic import op


revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None


_ATTEMPT_RETURN_COLUMNS = """
            id UUID,
            organization_id UUID,
            dataset_id UUID,
            original_object_id UUID,
            status science.validation_attempt_status,
            attempt_number INT,
            max_attempts INT,
            next_retry_at TIMESTAMPTZ,
            claimed_at TIMESTAMPTZ,
            claimed_by TEXT,
            started_at TIMESTAMPTZ,
            completed_at TIMESTAMPTZ,
            lock_expires_at TIMESTAMPTZ,
            failure_code TEXT,
            failure_details JSONB,
            server_checksum_sha256 TEXT,
            byte_size_verified BIGINT,
            quarantine_reason TEXT,
            created_at TIMESTAMPTZ,
            updated_at TIMESTAMPTZ
"""


_LEGACY_RETRY_BACKFILL_SQL = """
DO $$
DECLARE
    legacy RECORD;
    successor_id UUID;
BEGIN
    FOR legacy IN
        SELECT organization_id, dataset_id, original_object_id,
               attempt_number, max_attempts, next_retry_at
        FROM science.validation_attempts
        WHERE status = 'failed'::science.validation_attempt_status
          AND next_retry_at IS NOT NULL
          AND (
              completed_at IS NULL
              OR (
                  completed_at IS NOT NULL
                  AND attempt_number < max_attempts
                  AND NOT EXISTS (
                      SELECT 1
                      FROM science.validation_attempts successor
                      WHERE successor.organization_id = validation_attempts.organization_id
                        AND successor.dataset_id = validation_attempts.dataset_id
                        AND successor.attempt_number = validation_attempts.attempt_number + 1
                  )
              )
          )
        ORDER BY organization_id, dataset_id, attempt_number
    LOOP
        successor_id := NULL;
        UPDATE science.validation_attempts
        SET completed_at = NOW(),
            claimed_at = NULL,
            claimed_by = NULL,
            lock_expires_at = NULL,
            started_at = NULL,
            updated_at = NOW()
        WHERE organization_id = legacy.organization_id
          AND dataset_id = legacy.dataset_id
          AND attempt_number = legacy.attempt_number
          AND status = 'failed'::science.validation_attempt_status
          AND completed_at IS NULL;

        IF legacy.attempt_number < legacy.max_attempts THEN
            INSERT INTO science.validation_attempts (
                organization_id, dataset_id, original_object_id,
                attempt_number, max_attempts, status, next_retry_at,
                claimed_at, claimed_by, started_at, completed_at,
                lock_expires_at, created_at, updated_at
            ) VALUES (
                legacy.organization_id, legacy.dataset_id,
                legacy.original_object_id, legacy.attempt_number + 1,
                legacy.max_attempts,
                'queued'::science.validation_attempt_status,
                legacy.next_retry_at, NULL, NULL, NULL, NULL, NULL,
                NOW(), NOW()
            )
            ON CONFLICT (organization_id, dataset_id, attempt_number)
            DO NOTHING
            RETURNING id INTO successor_id;
        END IF;

        IF successor_id IS NOT NULL
           OR EXISTS (
               SELECT 1
               FROM science.validation_attempts successor
               WHERE successor.organization_id = legacy.organization_id
                 AND successor.dataset_id = legacy.dataset_id
                 AND successor.attempt_number = legacy.attempt_number + 1
                 AND successor.status = 'queued'::science.validation_attempt_status
           ) THEN
            UPDATE science.datasets
            SET dataset_status = 'pending_validation'::science.dataset_status,
                status_changed_at = NOW(),
                updated_at = NOW()
            WHERE organization_id = legacy.organization_id
              AND id = legacy.dataset_id
              AND dataset_status = 'validating'::science.dataset_status;
        END IF;
    END LOOP;
END
$$;
"""


def upgrade() -> None:
    # Normalize first.  The historical row retains next_retry_at as an audit
    # marker so a migration interrupted after the UPDATE can be safely resumed;
    # the claim predicates never consider failed rows.  ON CONFLICT is backed
    # by validation_attempts_attempt_uq from migration 0011.
    op.execute(_LEGACY_RETRY_BACKFILL_SQL)

    # The normalized data now satisfies the strict terminal-state invariant.
    op.execute(
        """
        ALTER TABLE science.validation_attempts
        DROP CONSTRAINT IF EXISTS validation_attempts_completed_consistency
        """
    )
    op.execute(
        """
        ALTER TABLE science.validation_attempts
        ADD CONSTRAINT validation_attempts_completed_consistency CHECK (
            status NOT IN ('passed', 'failed', 'quarantined', 'cancelled')
            OR completed_at IS NOT NULL
        )
        """
    )

    # Keep multi-org claiming equivalent to the single-org worker predicate.
    op.execute(
        f"""
        CREATE OR REPLACE FUNCTION science.validation_worker_claim_across_orgs(
            p_worker_id TEXT,
            p_lease_seconds INT
        )
        RETURNS TABLE (
{_ATTEMPT_RETURN_COLUMNS}
        )
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = pg_catalog, science
        AS $$
        DECLARE
            v_attempt science.validation_attempts%ROWTYPE;
        BEGIN
            SELECT * INTO v_attempt
            FROM science.validation_attempts
            WHERE status = 'queued'::science.validation_attempt_status
              AND (next_retry_at IS NULL OR next_retry_at <= NOW())
              AND attempt_number <= max_attempts
              AND claimed_by IS NULL
            ORDER BY next_retry_at NULLS FIRST, created_at
            LIMIT 1
            FOR UPDATE SKIP LOCKED;

            IF NOT FOUND THEN
                RETURN;
            END IF;

            UPDATE science.validation_attempts
            SET status = 'claimed'::science.validation_attempt_status,
                claimed_by = p_worker_id,
                claimed_at = NOW(),
                lock_expires_at = NOW() + make_interval(secs => p_lease_seconds),
                started_at = NOW(),
                updated_at = NOW()
            WHERE id = v_attempt.id
              AND organization_id = v_attempt.organization_id
              AND status = 'queued'::science.validation_attempt_status
              AND (next_retry_at IS NULL OR next_retry_at <= NOW())
              AND attempt_number <= max_attempts
              AND claimed_by IS NULL
            RETURNING * INTO v_attempt;

            IF NOT FOUND THEN
                RETURN;
            END IF;

            UPDATE science.datasets
            SET dataset_status = 'validating'::science.dataset_status,
                status_changed_at = NOW(),
                updated_at = NOW()
            WHERE id = v_attempt.dataset_id
              AND organization_id = v_attempt.organization_id
              AND dataset_status = 'pending_validation'::science.dataset_status;

            RETURN QUERY SELECT
                v_attempt.id, v_attempt.organization_id, v_attempt.dataset_id,
                v_attempt.original_object_id, v_attempt.status,
                v_attempt.attempt_number, v_attempt.max_attempts,
                v_attempt.next_retry_at, v_attempt.claimed_at,
                v_attempt.claimed_by, v_attempt.started_at,
                v_attempt.completed_at, v_attempt.lock_expires_at,
                v_attempt.failure_code, v_attempt.failure_details,
                v_attempt.server_checksum_sha256, v_attempt.byte_size_verified,
                v_attempt.quarantine_reason, v_attempt.created_at,
                v_attempt.updated_at;
        END;
        $$;
        """
    )

    # Stale reclaim transfers ownership of the same row.  It does not create
    # a successor and does not increment attempt_number.  The no-argument
    # function remains as a compatibility wrapper for old maintenance callers.
    op.execute(
        f"""
        CREATE OR REPLACE FUNCTION science.validation_worker_reclaim_stale_across_orgs(
            p_worker_id TEXT,
            p_lease_seconds INT
        )
        RETURNS TABLE (
{_ATTEMPT_RETURN_COLUMNS}
        )
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = pg_catalog, science
        AS $$
        DECLARE
            v_attempt science.validation_attempts%ROWTYPE;
        BEGIN
            SELECT * INTO v_attempt
            FROM science.validation_attempts
            WHERE status IN (
                      'claimed'::science.validation_attempt_status,
                      'running'::science.validation_attempt_status
                  )
              AND lock_expires_at IS NOT NULL
              AND lock_expires_at < NOW()
              AND attempt_number <= max_attempts
              AND claimed_by IS NOT NULL
            ORDER BY lock_expires_at
            LIMIT 1
            FOR UPDATE SKIP LOCKED;

            IF NOT FOUND THEN
                RETURN;
            END IF;

            UPDATE science.validation_attempts
            SET status = 'claimed'::science.validation_attempt_status,
                claimed_at = NOW(),
                claimed_by = p_worker_id,
                lock_expires_at = NOW() + make_interval(secs => p_lease_seconds),
                started_at = NOW(),
                updated_at = NOW()
            WHERE id = v_attempt.id
              AND organization_id = v_attempt.organization_id
              AND status IN (
                      'claimed'::science.validation_attempt_status,
                      'running'::science.validation_attempt_status
                  )
              AND lock_expires_at IS NOT NULL
              AND lock_expires_at < NOW()
              AND attempt_number <= max_attempts
              AND claimed_by IS NOT NULL
            RETURNING * INTO v_attempt;

            IF NOT FOUND THEN
                RETURN;
            END IF;

            UPDATE science.datasets
            SET dataset_status = 'validating'::science.dataset_status,
                status_changed_at = NOW(),
                updated_at = NOW()
            WHERE id = v_attempt.dataset_id
              AND organization_id = v_attempt.organization_id
              AND dataset_status = 'pending_validation'::science.dataset_status;

            RETURN QUERY SELECT
                v_attempt.id, v_attempt.organization_id, v_attempt.dataset_id,
                v_attempt.original_object_id, v_attempt.status,
                v_attempt.attempt_number, v_attempt.max_attempts,
                v_attempt.next_retry_at, v_attempt.claimed_at,
                v_attempt.claimed_by, v_attempt.started_at,
                v_attempt.completed_at, v_attempt.lock_expires_at,
                v_attempt.failure_code, v_attempt.failure_details,
                v_attempt.server_checksum_sha256, v_attempt.byte_size_verified,
                v_attempt.quarantine_reason, v_attempt.created_at,
                v_attempt.updated_at;
        END;
        $$;

        CREATE OR REPLACE FUNCTION science.validation_worker_reclaim_stale_across_orgs()
        RETURNS TABLE (
{_ATTEMPT_RETURN_COLUMNS}
        )
        LANGUAGE sql
        SECURITY DEFINER
        SET search_path = pg_catalog, science
        AS $$
            SELECT *
            FROM science.validation_worker_reclaim_stale_across_orgs(
                'legacy-maintenance-reclaim', 300
            )
        $$;
        """
    )

    # This function is the single atomic retry settlement used by both Python
    # implementations.  A successor is inserted before the current row is
    # closed, inside the same transaction.  The attempt unique key plus the
    # locked current row make a concurrent second settlement a no-op.
    op.execute(
        """
        CREATE OR REPLACE FUNCTION science.validation_worker_mark_failed_with_retry(
            p_organization_id UUID,
            p_attempt_id UUID,
            p_worker_id TEXT,
            p_failure_code TEXT,
            p_failure_details JSONB
        )
        RETURNS BOOLEAN
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = pg_catalog, science
        AS $$
        DECLARE
            v_attempt science.validation_attempts%ROWTYPE;
            v_retry_at TIMESTAMPTZ;
            v_successor_id UUID;
        BEGIN
            IF current_setting('app.organization_id', true) IS NOT NULL
               AND current_setting('app.organization_id', true) <> p_organization_id::TEXT THEN
                RAISE EXCEPTION 'organization context does not match requested retry settlement'
                    USING ERRCODE = '42501';
            END IF;

            SELECT * INTO v_attempt
            FROM science.validation_attempts
            WHERE organization_id = p_organization_id
              AND id = p_attempt_id
              AND status = 'running'::science.validation_attempt_status
              AND claimed_by = p_worker_id
              AND attempt_number < max_attempts
            FOR UPDATE;

            IF NOT FOUND THEN
                RETURN FALSE;
            END IF;

            v_retry_at := NOW()
                + (30 * power(2, LEAST(v_attempt.attempt_number - 1, 4)))
                * INTERVAL '1 second';

            INSERT INTO science.validation_attempts (
                organization_id, dataset_id, original_object_id,
                attempt_number, max_attempts, status, next_retry_at,
                claimed_at, claimed_by, started_at, completed_at,
                lock_expires_at, created_at, updated_at
            ) VALUES (
                v_attempt.organization_id, v_attempt.dataset_id,
                v_attempt.original_object_id, v_attempt.attempt_number + 1,
                v_attempt.max_attempts,
                'queued'::science.validation_attempt_status, v_retry_at,
                NULL, NULL, NULL, NULL, NULL, NOW(), NOW()
            )
            ON CONFLICT (organization_id, dataset_id, attempt_number)
            DO NOTHING
            RETURNING id INTO v_successor_id;

            IF v_successor_id IS NULL THEN
                RETURN FALSE;
            END IF;

            UPDATE science.validation_attempts
            SET status = 'failed'::science.validation_attempt_status,
                failure_code = p_failure_code,
                failure_details = p_failure_details,
                next_retry_at = v_retry_at,
                claimed_at = NULL,
                claimed_by = NULL,
                lock_expires_at = NULL,
                completed_at = NOW(),
                updated_at = NOW()
            WHERE organization_id = p_organization_id
              AND id = p_attempt_id
              AND status = 'running'::science.validation_attempt_status
              AND claimed_by = p_worker_id
              AND attempt_number < max_attempts;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'validation attempt ownership changed during retry settlement';
            END IF;

            UPDATE science.datasets
            SET dataset_status = 'pending_validation'::science.dataset_status,
                status_changed_at = NOW(),
                updated_at = NOW()
            WHERE organization_id = p_organization_id
              AND id = v_attempt.dataset_id
              AND dataset_status = 'validating'::science.dataset_status;

            RETURN TRUE;
        END;
        $$;
        """
    )

    # Worker-owned terminal settlement closes the ownership gap in the older
    # 0015 helper without changing that helper's compatibility signature.
    op.execute(
        """
        CREATE OR REPLACE FUNCTION science.validation_worker_settle_terminal_owned(
            p_organization_id UUID,
            p_attempt_id UUID,
            p_worker_id TEXT,
            p_attempt_status science.validation_attempt_status,
            p_dataset_status science.dataset_status,
            p_failure_code TEXT DEFAULT NULL,
            p_failure_details JSONB DEFAULT NULL,
            p_quarantine_reason TEXT DEFAULT NULL,
            p_server_checksum_sha256 TEXT DEFAULT NULL,
            p_byte_size_verified BIGINT DEFAULT NULL
        )
        RETURNS UUID
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = pg_catalog, science
        AS $$
        DECLARE
            v_dataset_id UUID;
        BEGIN
            IF current_setting('app.organization_id', true) IS NOT NULL
               AND current_setting('app.organization_id', true) <> p_organization_id::TEXT THEN
                RAISE EXCEPTION 'organization context does not match requested terminal settlement'
                    USING ERRCODE = '42501';
            END IF;

            IF p_attempt_status = 'passed'
               AND p_dataset_status = 'valid'
               AND p_failure_code IS NULL
               AND p_server_checksum_sha256 IS NOT NULL
               AND p_server_checksum_sha256 ~ '^[0-9a-f]{64}$'
               AND p_byte_size_verified IS NOT NULL
               AND p_byte_size_verified >= 0 THEN
                NULL;
            ELSIF p_attempt_status = 'failed'
                  AND p_dataset_status = 'invalid'
                  AND p_failure_code IS NOT NULL THEN
                NULL;
            ELSIF p_attempt_status = 'quarantined'
                  AND p_dataset_status = 'quarantined'
                  AND p_failure_code IS NOT NULL
                  AND p_quarantine_reason IS NOT NULL THEN
                NULL;
            ELSE
                RAISE EXCEPTION 'invalid terminal validation transition'
                    USING ERRCODE = '22023';
            END IF;

            UPDATE science.validation_attempts
            SET status = p_attempt_status,
                completed_at = NOW(),
                failure_code = p_failure_code,
                failure_details = p_failure_details,
                quarantine_reason = p_quarantine_reason,
                server_checksum_sha256 = p_server_checksum_sha256,
                byte_size_verified = p_byte_size_verified,
                next_retry_at = NULL,
                claimed_at = NULL,
                claimed_by = NULL,
                lock_expires_at = NULL,
                updated_at = NOW()
            WHERE organization_id = p_organization_id
              AND id = p_attempt_id
              AND status = 'running'::science.validation_attempt_status
              AND claimed_by = p_worker_id
            RETURNING dataset_id INTO v_dataset_id;

            IF NOT FOUND THEN
                RETURN NULL;
            END IF;

            UPDATE science.datasets
            SET dataset_status = p_dataset_status,
                status_changed_at = NOW(),
                failure_code = p_failure_code,
                updated_at = NOW()
            WHERE organization_id = p_organization_id
              AND id = v_dataset_id
              AND dataset_status = 'validating'::science.dataset_status;

            RETURN p_attempt_id;
        END;
        $$;
        """
    )

    for statement in (
        "ALTER FUNCTION science.validation_worker_claim_across_orgs(TEXT, INT) OWNER TO difaryx_validation_worker",
        "ALTER FUNCTION science.validation_worker_reclaim_stale_across_orgs(TEXT, INT) OWNER TO difaryx_validation_worker",
        "ALTER FUNCTION science.validation_worker_reclaim_stale_across_orgs() OWNER TO difaryx_validation_worker",
        "ALTER FUNCTION science.validation_worker_mark_failed_with_retry(UUID, UUID, TEXT, TEXT, JSONB) OWNER TO difaryx_validation_worker",
        "ALTER FUNCTION science.validation_worker_settle_terminal_owned(UUID, UUID, TEXT, science.validation_attempt_status, science.dataset_status, TEXT, JSONB, TEXT, TEXT, BIGINT) OWNER TO difaryx_validation_worker",
        "REVOKE ALL ON FUNCTION science.validation_worker_claim_across_orgs(TEXT, INT) FROM PUBLIC",
        "REVOKE ALL ON FUNCTION science.validation_worker_reclaim_stale_across_orgs(TEXT, INT) FROM PUBLIC",
        "REVOKE ALL ON FUNCTION science.validation_worker_reclaim_stale_across_orgs() FROM PUBLIC",
        "REVOKE ALL ON FUNCTION science.validation_worker_mark_failed_with_retry(UUID, UUID, TEXT, TEXT, JSONB) FROM PUBLIC",
        "REVOKE ALL ON FUNCTION science.validation_worker_settle_terminal_owned(UUID, UUID, TEXT, science.validation_attempt_status, science.dataset_status, TEXT, JSONB, TEXT, TEXT, BIGINT) FROM PUBLIC",
        "GRANT EXECUTE ON FUNCTION science.validation_worker_claim_across_orgs(TEXT, INT) TO difaryx_validation_worker",
        "GRANT EXECUTE ON FUNCTION science.validation_worker_reclaim_stale_across_orgs(TEXT, INT) TO difaryx_validation_worker",
        "GRANT EXECUTE ON FUNCTION science.validation_worker_reclaim_stale_across_orgs() TO difaryx_validation_worker",
        "GRANT EXECUTE ON FUNCTION science.validation_worker_mark_failed_with_retry(UUID, UUID, TEXT, TEXT, JSONB) TO difaryx_validation_worker",
        "GRANT EXECUTE ON FUNCTION science.validation_worker_settle_terminal_owned(UUID, UUID, TEXT, science.validation_attempt_status, science.dataset_status, TEXT, JSONB, TEXT, TEXT, BIGINT) TO difaryx_validation_worker",
    ):
        op.execute(statement)


def downgrade() -> None:
    # The data backfill is intentionally not reversed: deleting a successor or
    # reopening a completed historical attempt would lose retry history.
    op.execute(
        "DROP FUNCTION IF EXISTS science.validation_worker_settle_terminal_owned(UUID, UUID, TEXT, science.validation_attempt_status, science.dataset_status, TEXT, JSONB, TEXT, TEXT, BIGINT)"
    )
    op.execute(
        "DROP FUNCTION IF EXISTS science.validation_worker_mark_failed_with_retry(UUID, UUID, TEXT, TEXT, JSONB)"
    )
    op.execute(
        "DROP FUNCTION IF EXISTS science.validation_worker_reclaim_stale_across_orgs(TEXT, INT)"
    )
    op.execute(
        """
        ALTER TABLE science.validation_attempts
        DROP CONSTRAINT IF EXISTS validation_attempts_completed_consistency
        """
    )
    op.execute(
        """
        ALTER TABLE science.validation_attempts
        ADD CONSTRAINT validation_attempts_completed_consistency CHECK (
            status NOT IN ('passed', 'failed', 'quarantined', 'cancelled')
            OR completed_at IS NOT NULL
            OR (status = 'failed' AND next_retry_at IS NOT NULL)
        )
        """
    )
