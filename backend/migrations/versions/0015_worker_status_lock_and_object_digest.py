"""Phase 1B-B worker-only terminal status lock and authoritative object digest.

Revision ID: 0015
Revises: 0014
Create Date: 2026-07-16
"""

from alembic import op


revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # The digest is metadata only. Raw bytes remain in object storage.
    op.execute("""
        ALTER TABLE science.dataset_objects
        ADD COLUMN authoritative_sha256 TEXT
            CHECK (
                authoritative_sha256 IS NULL
                OR authoritative_sha256 ~ '^[0-9a-f]{64}$'
            )
    """)

    # API-owned upload transitions are deliberately limited to non-validation
    # states. The API role does not receive direct dataset status UPDATE.
    op.execute("""
        CREATE OR REPLACE FUNCTION science.app_transition_dataset_upload_status(
            p_organization_id UUID,
            p_dataset_id UUID,
            p_current_status science.dataset_status,
            p_new_status science.dataset_status,
            p_failure_code TEXT DEFAULT NULL
        )
        RETURNS BOOLEAN
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = pg_catalog, science
        AS $$
        BEGIN
            IF current_setting('app.organization_id', true) IS NULL
               OR current_setting('app.organization_id', true) <> p_organization_id::TEXT THEN
                RAISE EXCEPTION 'organization context does not match requested dataset'
                    USING ERRCODE = '42501';
            END IF;

            IF NOT (
                (p_current_status = 'allocated' AND p_new_status = 'uploaded')
                OR (p_current_status = 'uploaded' AND p_new_status = 'pending_validation')
                OR (p_current_status = 'allocated' AND p_new_status = 'cancelled')
                OR (p_current_status = 'uploaded' AND p_new_status = 'cancelled')
            ) THEN
                RAISE EXCEPTION 'API status transition is not permitted: % -> %',
                    p_current_status, p_new_status
                    USING ERRCODE = '42501';
            END IF;

            UPDATE science.datasets
            SET dataset_status = p_new_status,
                status_changed_at = NOW(),
                failure_code = p_failure_code,
                updated_at = NOW()
            WHERE organization_id = p_organization_id
              AND id = p_dataset_id
              AND dataset_status = p_current_status;

            RETURN FOUND;
        END;
        $$
    """)
    op.execute("ALTER FUNCTION science.app_transition_dataset_upload_status(UUID, UUID, science.dataset_status, science.dataset_status, TEXT) OWNER TO difaryx_owner")
    op.execute("REVOKE ALL ON FUNCTION science.app_transition_dataset_upload_status(UUID, UUID, science.dataset_status, science.dataset_status, TEXT) FROM PUBLIC")
    op.execute("GRANT EXECUTE ON FUNCTION science.app_transition_dataset_upload_status(UUID, UUID, science.dataset_status, science.dataset_status, TEXT) TO difaryx_app")

    # Only a database session holding the validation-worker function privilege
    # can settle a running attempt. The function does not authorize using the
    # caller-supplied claimed_by/worker_id string.
    op.execute("""
        CREATE OR REPLACE FUNCTION science.validation_worker_settle_terminal(
            p_organization_id UUID,
            p_attempt_id UUID,
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
            v_current_dataset_status science.dataset_status;
        BEGIN
            IF current_setting('app.organization_id', true) IS NULL
               OR current_setting('app.organization_id', true) <> p_organization_id::TEXT THEN
                RAISE EXCEPTION 'organization context does not match requested validation attempt'
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
                claimed_at = NULL,
                claimed_by = NULL,
                lock_expires_at = NULL,
                updated_at = NOW()
            WHERE organization_id = p_organization_id
              AND id = p_attempt_id
              AND status = 'running';

            IF NOT FOUND THEN
                RAISE EXCEPTION 'validation attempt is not running or does not exist'
                    USING ERRCODE = '55000';
            END IF;

            SELECT dataset_id
            INTO v_dataset_id
            FROM science.validation_attempts
            WHERE organization_id = p_organization_id
              AND id = p_attempt_id;

            UPDATE science.datasets
            SET dataset_status = p_dataset_status,
                status_changed_at = NOW(),
                failure_code = p_failure_code,
                updated_at = NOW()
            WHERE organization_id = p_organization_id
              AND id = v_dataset_id
              AND dataset_status = 'validating';

            IF NOT FOUND THEN
                SELECT dataset_status
                INTO v_current_dataset_status
                FROM science.datasets
                WHERE organization_id = p_organization_id
                  AND id = v_dataset_id;

                IF NOT FOUND OR v_current_dataset_status IS DISTINCT FROM p_dataset_status THEN
                    RAISE EXCEPTION 'dataset is not validating or does not exist'
                        USING ERRCODE = '55000';
                END IF;
            END IF;

            RETURN p_attempt_id;
        END;
        $$
    """)
    op.execute("ALTER FUNCTION science.validation_worker_settle_terminal(UUID, UUID, science.validation_attempt_status, science.dataset_status, TEXT, JSONB, TEXT, TEXT, BIGINT) OWNER TO difaryx_validation_worker")
    op.execute("REVOKE ALL ON FUNCTION science.validation_worker_settle_terminal(UUID, UUID, science.validation_attempt_status, science.dataset_status, TEXT, JSONB, TEXT, TEXT, BIGINT) FROM PUBLIC")
    op.execute("GRANT EXECUTE ON FUNCTION science.validation_worker_settle_terminal(UUID, UUID, science.validation_attempt_status, science.dataset_status, TEXT, JSONB, TEXT, TEXT, BIGINT) TO difaryx_validation_worker")

    op.execute("""
        CREATE POLICY validation_attempts_worker_select
        ON science.validation_attempts
        FOR SELECT
        TO difaryx_validation_worker
        USING (organization_id = identity.current_organization_id())
    """)
    op.execute("""
        CREATE POLICY validation_attempts_worker_update
        ON science.validation_attempts
        FOR UPDATE
        TO difaryx_validation_worker
        USING (organization_id = identity.current_organization_id())
        WITH CHECK (organization_id = identity.current_organization_id())
    """)

    # Defense in depth: even a role with table UPDATE cannot directly write a
    # terminal dataset status. The SECURITY DEFINER transition functions run
    # under one of the two dedicated worker owners and pass this guard.
    op.execute("""
        CREATE OR REPLACE FUNCTION science.guard_terminal_dataset_status()
        RETURNS TRIGGER
        LANGUAGE plpgsql
        SET search_path = pg_catalog, science
        AS $$
        BEGIN
            IF NEW.dataset_status IS DISTINCT FROM OLD.dataset_status
               AND NEW.dataset_status IN ('valid', 'invalid', 'quarantined')
               AND current_user NOT IN (
                   'difaryx_validation_worker',
                   'difaryx_validation_worker_bypass'
               ) THEN
                RAISE EXCEPTION 'terminal dataset status is worker-owned'
                    USING ERRCODE = '42501';
            END IF;
            RETURN NEW;
        END;
        $$
    """)
    op.execute("""
        DROP TRIGGER IF EXISTS dataset_terminal_status_guard
        ON science.datasets
    """)
    op.execute("""
        CREATE TRIGGER dataset_terminal_status_guard
        BEFORE UPDATE OF dataset_status ON science.datasets
        FOR EACH ROW
        EXECUTE FUNCTION science.guard_terminal_dataset_status()
    """)

    # Remove direct API mutation paths. Upload lifecycle transitions use the
    # narrowly scoped app function above; validation attempts remain readable
    # and enqueueable but not mutable by the API role.
    op.execute("REVOKE UPDATE (dataset_status, status_changed_at, failure_code) ON science.datasets FROM difaryx_app")
    op.execute("REVOKE UPDATE ON science.validation_attempts FROM difaryx_app")

    # Explicitly expose the new metadata column without exposing bytes.
    op.execute("GRANT SELECT (authoritative_sha256) ON science.dataset_objects TO difaryx_app")
    op.execute("GRANT SELECT (authoritative_sha256) ON science.dataset_objects TO difaryx_validation_worker")

    # Dataset RLS evaluates tenant-scoped membership predicates. Keep the
    # worker tenant-scoped while granting only the columns those predicates
    # read; this is not a cross-organization bypass.
    op.execute("""
        GRANT SELECT (organization_id, user_id, role)
        ON identity.memberships TO difaryx_validation_worker
    """)
    op.execute("""
        GRANT SELECT (organization_id, project_id, user_id, role)
        ON science.project_memberships TO difaryx_validation_worker
    """)


def downgrade() -> None:
    op.execute("REVOKE SELECT (authoritative_sha256) ON science.dataset_objects FROM difaryx_validation_worker")
    op.execute("REVOKE SELECT (authoritative_sha256) ON science.dataset_objects FROM difaryx_app")
    op.execute("REVOKE SELECT (organization_id, user_id, role) ON identity.memberships FROM difaryx_validation_worker")
    op.execute("REVOKE SELECT (organization_id, project_id, user_id, role) ON science.project_memberships FROM difaryx_validation_worker")
    op.execute("GRANT UPDATE (dataset_status, status_changed_at, failure_code) ON science.datasets TO difaryx_app")
    op.execute("GRANT UPDATE ON science.validation_attempts TO difaryx_app")

    op.execute("DROP TRIGGER IF EXISTS dataset_terminal_status_guard ON science.datasets")
    op.execute("DROP POLICY IF EXISTS validation_attempts_worker_select ON science.validation_attempts")
    op.execute("DROP POLICY IF EXISTS validation_attempts_worker_update ON science.validation_attempts")
    op.execute("DROP FUNCTION IF EXISTS science.guard_terminal_dataset_status()")
    op.execute("DROP FUNCTION IF EXISTS science.validation_worker_settle_terminal(UUID, UUID, science.validation_attempt_status, science.dataset_status, TEXT, JSONB, TEXT, TEXT, BIGINT)")
    op.execute("DROP FUNCTION IF EXISTS science.app_transition_dataset_upload_status(UUID, UUID, science.dataset_status, science.dataset_status, TEXT)")
    op.execute("ALTER TABLE science.dataset_objects DROP COLUMN IF EXISTS authoritative_sha256")
