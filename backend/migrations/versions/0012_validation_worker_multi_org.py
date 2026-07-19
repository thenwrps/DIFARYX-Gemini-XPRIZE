"""Multi-org validation worker — cross-org claiming via SECURITY DEFINER functions

Revision ID: 0012
Revises: 0011
Create Date: 2026-07-14
"""
from alembic import op


revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create a dedicated role with BYPASSRLS for the cross-org claiming functions
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'difaryx_validation_worker_bypass') THEN
                CREATE ROLE difaryx_validation_worker_bypass WITH BYPASSRLS NOLOGIN;
            END IF;
        END
        $$
    """)

    op.execute("GRANT USAGE ON SCHEMA science TO difaryx_validation_worker_bypass")
    op.execute("GRANT USAGE ON SCHEMA identity TO difaryx_validation_worker_bypass")
    
    # Grant table-level permissions needed by SECURITY DEFINER functions
    op.execute("""
        GRANT SELECT, UPDATE ON 
            science.validation_attempts,
            science.datasets
        TO difaryx_validation_worker_bypass
    """)

    # Alter lock_expires_at to be nullable and drop the default value
    op.execute("ALTER TABLE science.validation_attempts ALTER COLUMN lock_expires_at DROP NOT NULL")
    op.execute("ALTER TABLE science.validation_attempts ALTER COLUMN lock_expires_at DROP DEFAULT")

    # ═══════════════════════════════════════════════════════════════════════
    # Function: validation_worker_claim_across_orgs
    # Claims the next available attempt across all organizations
    # ═══════════════════════════════════════════════════════════════════════
    op.execute("""
        CREATE OR REPLACE FUNCTION science.validation_worker_claim_across_orgs(
            p_worker_id TEXT,
            p_lease_seconds INT
        )
        RETURNS TABLE (
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
            WHERE (
                (validation_attempts.status = 'queued' AND (validation_attempts.next_retry_at IS NULL OR validation_attempts.next_retry_at <= NOW()))
                OR
                (validation_attempts.status = 'failed' AND validation_attempts.next_retry_at IS NOT NULL AND validation_attempts.next_retry_at <= NOW())
            )
            ORDER BY validation_attempts.created_at ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED;
            
            IF v_attempt IS NULL THEN
                RETURN;
            END IF;
            
            UPDATE science.validation_attempts
            SET status = 'claimed',
                claimed_by = p_worker_id,
                claimed_at = NOW(),
                lock_expires_at = NOW() + make_interval(secs => p_lease_seconds),
                started_at = NOW(),
                updated_at = NOW()
            WHERE validation_attempts.id = v_attempt.id
              AND validation_attempts.organization_id = v_attempt.organization_id
            RETURNING * INTO v_attempt;
            
            UPDATE science.datasets
            SET dataset_status = 'validating',
                updated_at = NOW()
            WHERE datasets.id = v_attempt.dataset_id
              AND datasets.organization_id = v_attempt.organization_id
              AND datasets.dataset_status = 'pending_validation';
            
            RETURN QUERY SELECT
                v_attempt.id,
                v_attempt.organization_id,
                v_attempt.dataset_id,
                v_attempt.original_object_id,
                v_attempt.status,
                v_attempt.attempt_number,
                v_attempt.max_attempts,
                v_attempt.next_retry_at,
                v_attempt.claimed_at,
                v_attempt.claimed_by,
                v_attempt.started_at,
                v_attempt.completed_at,
                v_attempt.lock_expires_at,
                v_attempt.failure_code,
                v_attempt.failure_details,
                v_attempt.server_checksum_sha256,
                v_attempt.byte_size_verified,
                v_attempt.quarantine_reason,
                v_attempt.created_at,
                v_attempt.updated_at;
        END;
        $$
    """)

    op.execute("""
        ALTER FUNCTION science.validation_worker_claim_across_orgs(TEXT, INT) 
        OWNER TO difaryx_validation_worker_bypass
    """)
    
    op.execute("""
        GRANT EXECUTE ON FUNCTION science.validation_worker_claim_across_orgs(TEXT, INT) 
        TO difaryx_validation_worker
    """)
    
    op.execute("""
        REVOKE EXECUTE ON FUNCTION science.validation_worker_claim_across_orgs(TEXT, INT) 
        FROM PUBLIC
    """)

    # ═══════════════════════════════════════════════════════════════════════
    # Function: validation_worker_reclaim_stale_across_orgs
    # Reclaims stale attempts (both 'claimed' and 'running' with expired locks)
    # Respects max_attempts: quarantines if exceeded, else requeues
    # NOTE (N1): Sets lock_expires_at = NULL on both branches to avoid phantom leases
    # ═══════════════════════════════════════════════════════════════════════
    op.execute("""
        CREATE OR REPLACE FUNCTION science.validation_worker_reclaim_stale_across_orgs()
        RETURNS TABLE (
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
            WHERE validation_attempts.status IN ('claimed', 'running')
              AND validation_attempts.lock_expires_at < NOW()
            ORDER BY validation_attempts.lock_expires_at ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED;
            
            IF v_attempt IS NULL THEN
                RETURN;
            END IF;
            
            IF v_attempt.attempt_number >= v_attempt.max_attempts THEN
                UPDATE science.validation_attempts
                SET status = 'quarantined',
                    claimed_by = NULL,
                    claimed_at = NULL,
                    lock_expires_at = NULL,
                    completed_at = NOW(),
                    failure_code = 'max_attempts_exceeded',
                    failure_details = jsonb_build_object('reason', 'max retry attempts exceeded after stale lock'),
                    quarantine_reason = 'max_attempts_exceeded',
                    updated_at = NOW()
                WHERE validation_attempts.id = v_attempt.id
                  AND validation_attempts.organization_id = v_attempt.organization_id
                RETURNING * INTO v_attempt;
                
                UPDATE science.datasets
                SET dataset_status = 'quarantined',
                    updated_at = NOW()
                WHERE datasets.id = v_attempt.dataset_id
                  AND datasets.organization_id = v_attempt.organization_id
                  AND datasets.dataset_status = 'validating';
            ELSE
                UPDATE science.validation_attempts
                SET status = 'queued',
                    claimed_by = NULL,
                    claimed_at = NULL,
                    lock_expires_at = NULL,
                    started_at = NULL,
                    next_retry_at = NULL,
                    attempt_number = validation_attempts.attempt_number + 1,
                    updated_at = NOW()
                WHERE validation_attempts.id = v_attempt.id
                  AND validation_attempts.organization_id = v_attempt.organization_id
                RETURNING * INTO v_attempt;
                
                UPDATE science.datasets
                SET dataset_status = 'pending_validation',
                    updated_at = NOW()
                WHERE datasets.id = v_attempt.dataset_id
                  AND datasets.organization_id = v_attempt.organization_id
                  AND datasets.dataset_status = 'validating';
            END IF;
            
            RETURN QUERY SELECT
                v_attempt.id,
                v_attempt.organization_id,
                v_attempt.dataset_id,
                v_attempt.original_object_id,
                v_attempt.status,
                v_attempt.attempt_number,
                v_attempt.max_attempts,
                v_attempt.next_retry_at,
                v_attempt.claimed_at,
                v_attempt.claimed_by,
                v_attempt.started_at,
                v_attempt.completed_at,
                v_attempt.lock_expires_at,
                v_attempt.failure_code,
                v_attempt.failure_details,
                v_attempt.server_checksum_sha256,
                v_attempt.byte_size_verified,
                v_attempt.quarantine_reason,
                v_attempt.created_at,
                v_attempt.updated_at;
        END;
        $$
    """)

    op.execute("""
        ALTER FUNCTION science.validation_worker_reclaim_stale_across_orgs() 
        OWNER TO difaryx_validation_worker_bypass
    """)
    
    op.execute("""
        GRANT EXECUTE ON FUNCTION science.validation_worker_reclaim_stale_across_orgs() 
        TO difaryx_validation_worker
    """)
    
    op.execute("""
        REVOKE EXECUTE ON FUNCTION science.validation_worker_reclaim_stale_across_orgs() 
        FROM PUBLIC
    """)

    # ═══════════════════════════════════════════════════════════════════════
    # Replace completed_at constraint from 0011 with precise form
    # that allows retry-in-progress (failed + next_retry_at set, completed_at NULL)
    # while keeping passed/quarantined/cancelled enforced and catching the
    # infinite-loop state (failed + completed_at NULL + next_retry_at NULL)
    # ═══════════════════════════════════════════════════════════════════════
    op.execute("""
        ALTER TABLE science.validation_attempts
        DROP CONSTRAINT IF EXISTS validation_attempts_completed_consistency
    """)
    op.execute("""
        ALTER TABLE science.validation_attempts
        ADD CONSTRAINT validation_attempts_completed_consistency CHECK (
            status NOT IN ('passed', 'failed', 'quarantined', 'cancelled')
            OR completed_at IS NOT NULL
            OR (status = 'failed' AND next_retry_at IS NOT NULL)
        )
    """)


def downgrade() -> None:
    # Restore lock_expires_at NOT NULL and DEFAULT
    op.execute("ALTER TABLE science.validation_attempts ALTER COLUMN lock_expires_at SET DEFAULT NOW() + INTERVAL '5 minutes'")
    op.execute("UPDATE science.validation_attempts SET lock_expires_at = NOW() + INTERVAL '5 minutes' WHERE lock_expires_at IS NULL")
    op.execute("ALTER TABLE science.validation_attempts ALTER COLUMN lock_expires_at SET NOT NULL")

    # 1. Restore original 0011 constraint
    op.execute("""
        ALTER TABLE science.validation_attempts
        DROP CONSTRAINT IF EXISTS validation_attempts_completed_consistency
    """)
    op.execute("""
        ALTER TABLE science.validation_attempts
        ADD CONSTRAINT validation_attempts_completed_consistency CHECK (
            (status NOT IN ('passed', 'failed', 'quarantined', 'cancelled'))
            OR (completed_at IS NOT NULL)
        )
    """)

    # 2. Drop functions
    op.execute("DROP FUNCTION IF EXISTS science.validation_worker_reclaim_stale_across_orgs()")
    op.execute("DROP FUNCTION IF EXISTS science.validation_worker_claim_across_orgs(TEXT, INT)")

    # 3. Revoke schema grants
    op.execute("REVOKE ALL ON SCHEMA identity FROM difaryx_validation_worker_bypass")
    op.execute("REVOKE ALL ON SCHEMA science FROM difaryx_validation_worker_bypass")

    # 4. Transfer ownership of any objects owned by bypass role before dropping
    op.execute("REASSIGN OWNED BY difaryx_validation_worker_bypass TO difaryx_owner")

    # 5. Drop bypass role
    op.execute("DROP ROLE IF EXISTS difaryx_validation_worker_bypass")
