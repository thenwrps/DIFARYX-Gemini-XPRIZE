"""Phase 1B-B — Validation attempts lifecycle, worker-safe claiming, quarantine

Revision ID: 0011
Revises: 0010
Create Date: 2026-07-13
"""
from alembic import op
import sqlalchemy as sa


revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ═══════════════════════════════════════════════════════════════════════
    # 1. Assert environment-provisioned role exists
    # ═══════════════════════════════════════════════════════════════════════
    conn = op.get_bind()
    for role in ("difaryx_validation_worker",):
        res = conn.execute(
            sa.text(
                "SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = :role"
            ),
            {"role": role},
        ).fetchone()
        if not res:
            raise RuntimeError(
                f"Required database role '{role}' is not provisioned. "
                f"Please run the environment preparation/bootstrap first."
            )

    # ═══════════════════════════════════════════════════════════════════════
    # 2. Add 'validating' to dataset_status enum
    #    PostgreSQL requires the new enum value to be COMMITTED before it
    #    can be referenced in CHECK constraints, RLS policies, or DML.
    #    We therefore use a raw DBAPI connection in AUTOCOMMIT mode,
    #    built from the DATABASE_URL env var (which includes the password).
    # ═══════════════════════════════════════════════════════════════════════
    import os
    import psycopg2
    db_url = os.environ["DATABASE_URL"]
    autocommit_conn = psycopg2.connect(db_url)
    autocommit_conn.autocommit = True
    try:
        with autocommit_conn.cursor() as cur:
            cur.execute("""
                ALTER TYPE science.dataset_status ADD VALUE IF NOT EXISTS 'validating'
            """)
    finally:
        autocommit_conn.close()

    # ═══════════════════════════════════════════════════════════════════════
    # 3. New ENUM type for validation attempts
    # ═══════════════════════════════════════════════════════════════════════
    op.execute("""
        CREATE TYPE science.validation_attempt_status AS ENUM (
            'queued', 'claimed', 'running', 'passed', 'failed', 'quarantined', 'cancelled'
        )
    """)

    # ═══════════════════════════════════════════════════════════════════════
    # 4. science.validation_attempts table
    # ═══════════════════════════════════════════════════════════════════════
    op.execute("""
        CREATE TABLE science.validation_attempts (
            id                      UUID        NOT NULL DEFAULT uuid_generate_v4(),
            organization_id         UUID        NOT NULL REFERENCES identity.organizations(id) ON DELETE RESTRICT,
            dataset_id              UUID        NOT NULL,
            original_object_id      UUID        NOT NULL,
            attempt_number          INTEGER     NOT NULL DEFAULT 1,
            max_attempts            INTEGER     NOT NULL DEFAULT 3,
            status                  science.validation_attempt_status NOT NULL DEFAULT 'queued',
            claimed_at              TIMESTAMPTZ,
            claimed_by              TEXT        CHECK (LENGTH(claimed_by) <= 255),
            started_at              TIMESTAMPTZ,
            completed_at            TIMESTAMPTZ,
            lock_expires_at         TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '5 minutes',
            next_retry_at           TIMESTAMPTZ,
            failure_code            TEXT        CHECK (failure_code IS NULL OR (LENGTH(failure_code) >= 1 AND LENGTH(failure_code) <= 100)),
            failure_details         JSONB,
            server_checksum_sha256  TEXT        CHECK (server_checksum_sha256 IS NULL OR server_checksum_sha256 ~ '^[0-9a-f]{64}$'),
            byte_size_verified      BIGINT      CHECK (byte_size_verified IS NULL OR byte_size_verified >= 0),
            quarantine_reason       TEXT        CHECK (quarantine_reason IS NULL OR LENGTH(quarantine_reason) <= 255),
            created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (organization_id, id),
            CONSTRAINT validation_attempts_dataset_fk
                FOREIGN KEY (organization_id, dataset_id)
                REFERENCES science.datasets(organization_id, id)
                ON DELETE RESTRICT,
            CONSTRAINT validation_attempts_object_fk
                FOREIGN KEY (organization_id, original_object_id)
                REFERENCES science.dataset_objects(organization_id, id)
                ON DELETE RESTRICT,
            CONSTRAINT validation_attempts_attempt_uq
                UNIQUE (organization_id, dataset_id, attempt_number),
            CONSTRAINT validation_attempts_claimed_consistency
                CHECK ((claimed_at IS NULL) = (claimed_by IS NULL)),
            CONSTRAINT validation_attempts_completed_consistency CHECK (
                (status NOT IN ('passed', 'failed', 'quarantined', 'cancelled'))
                OR (completed_at IS NOT NULL)
            ),
            CONSTRAINT validation_attempts_quarantine_consistency CHECK (
                (status != 'quarantined')
                OR (quarantine_reason IS NOT NULL)
            ),
            CONSTRAINT validation_attempts_failure_consistency CHECK (
                (status != 'failed')
                OR (failure_code IS NOT NULL)
            )
        )
    """)

    # ═══════════════════════════════════════════════════════════════════════
    # 5. Indexes for worker polling, dataset lookup, stale lock detection
    # ═══════════════════════════════════════════════════════════════════════
    op.execute("""
        CREATE INDEX validation_attempts_worker_polling_idx
        ON science.validation_attempts (organization_id, status, next_retry_at)
        WHERE status IN ('queued', 'failed')
    """)

    op.execute("""
        CREATE INDEX validation_attempts_dataset_idx
        ON science.validation_attempts (organization_id, dataset_id)
    """)

    op.execute("""
        CREATE INDEX validation_attempts_stale_lock_idx
        ON science.validation_attempts (claimed_at)
        WHERE claimed_at IS NOT NULL
    """)

    op.execute("""
        CREATE INDEX validation_attempts_active_claims_idx
        ON science.validation_attempts (organization_id, status)
        WHERE status = 'claimed'
    """)

    # ═══════════════════════════════════════════════════════════════════════
    # 6. Row-Level Security
    # ═══════════════════════════════════════════════════════════════════════
    op.execute("ALTER TABLE science.validation_attempts ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE science.validation_attempts FORCE ROW LEVEL SECURITY")

    # SELECT: org match AND (org owner/admin OR project membership)
    op.execute("""
        CREATE POLICY validation_attempts_select
        ON science.validation_attempts
        FOR SELECT
        TO difaryx_app
        USING (
            organization_id = identity.current_organization_id()
            AND (
                EXISTS (
                    SELECT 1 FROM identity.memberships m
                    WHERE m.organization_id = validation_attempts.organization_id
                      AND m.user_id = identity.current_user_id()
                      AND m.role IN ('owner', 'admin')
                )
                OR EXISTS (
                    SELECT 1 FROM science.datasets d
                    JOIN science.project_memberships pm
                        ON pm.organization_id = d.organization_id
                        AND pm.project_id = d.project_id
                    WHERE d.organization_id = validation_attempts.organization_id
                      AND d.id = validation_attempts.dataset_id
                      AND pm.user_id = identity.current_user_id()
                )
            )
        )
    """)

    # INSERT: org match AND dataset in pending_validation or validating
    op.execute("""
        CREATE POLICY validation_attempts_insert
        ON science.validation_attempts
        FOR INSERT
        TO difaryx_app
        WITH CHECK (
            organization_id = identity.current_organization_id()
            AND EXISTS (
                SELECT 1 FROM science.datasets d
                WHERE d.organization_id = validation_attempts.organization_id
                  AND d.id = validation_attempts.dataset_id
                  AND d.dataset_status IN ('pending_validation', 'validating')
            )
        )
    """)

    # UPDATE: org match AND bounded columns
    op.execute("""
        CREATE POLICY validation_attempts_update
        ON science.validation_attempts
        FOR UPDATE
        TO difaryx_app
        USING (organization_id = identity.current_organization_id())
        WITH CHECK (organization_id = identity.current_organization_id())
    """)

    # ═══════════════════════════════════════════════════════════════════════
    # 7. Grants for difaryx_app
    # ═══════════════════════════════════════════════════════════════════════
    op.execute("GRANT SELECT ON science.validation_attempts TO difaryx_app")
    op.execute("GRANT INSERT ON science.validation_attempts TO difaryx_app")
    op.execute("""
        GRANT UPDATE (
            status, claimed_at, claimed_by, started_at, completed_at,
            lock_expires_at, next_retry_at, failure_code, failure_details,
            server_checksum_sha256, byte_size_verified, quarantine_reason, updated_at
        ) ON science.validation_attempts TO difaryx_app
    """)

    # ═══════════════════════════════════════════════════════════════════════
    # 8. Grants for difaryx_validation_worker
    # ═══════════════════════════════════════════════════════════════════════
    op.execute("GRANT USAGE ON SCHEMA science TO difaryx_validation_worker")
    op.execute("GRANT USAGE ON SCHEMA identity TO difaryx_validation_worker")
    op.execute("GRANT SELECT, INSERT, UPDATE ON science.validation_attempts TO difaryx_validation_worker")
    op.execute("""
        GRANT UPDATE (
            dataset_status, status_changed_at, failure_code, updated_at
        ) ON science.datasets TO difaryx_validation_worker
    """)
    op.execute("GRANT SELECT ON science.datasets TO difaryx_validation_worker")
    op.execute("GRANT SELECT ON science.dataset_objects TO difaryx_validation_worker")
    op.execute("""
        GRANT EXECUTE ON FUNCTION identity.current_organization_id()
        TO difaryx_validation_worker
    """)
    op.execute("""
        GRANT EXECUTE ON FUNCTION identity.current_user_id()
        TO difaryx_validation_worker
    """)


def downgrade() -> None:
    # ═══════════════════════════════════════════════════════════════════════
    # Correct downgrade: revoke grants FIRST, then drop objects.
    # ═══════════════════════════════════════════════════════════════════════

    # 1. Revoke difaryx_validation_worker privileges
    op.execute("""
        REVOKE EXECUTE ON FUNCTION identity.current_user_id()
        FROM difaryx_validation_worker
    """)
    op.execute("""
        REVOKE EXECUTE ON FUNCTION identity.current_organization_id()
        FROM difaryx_validation_worker
    """)
    op.execute("REVOKE SELECT ON science.dataset_objects FROM difaryx_validation_worker")
    op.execute("REVOKE SELECT ON science.datasets FROM difaryx_validation_worker")
    op.execute("REVOKE UPDATE ON science.datasets FROM difaryx_validation_worker")
    op.execute("REVOKE SELECT, INSERT, UPDATE ON science.validation_attempts FROM difaryx_validation_worker")
    op.execute("REVOKE USAGE ON SCHEMA identity FROM difaryx_validation_worker")
    op.execute("REVOKE USAGE ON SCHEMA science FROM difaryx_validation_worker")

    # 2. Revoke difaryx_app privileges
    op.execute("REVOKE UPDATE ON science.validation_attempts FROM difaryx_app")
    op.execute("REVOKE INSERT ON science.validation_attempts FROM difaryx_app")
    op.execute("REVOKE SELECT ON science.validation_attempts FROM difaryx_app")

    # 3. Drop RLS policies
    op.execute("DROP POLICY IF EXISTS validation_attempts_update ON science.validation_attempts")
    op.execute("DROP POLICY IF EXISTS validation_attempts_insert ON science.validation_attempts")
    op.execute("DROP POLICY IF EXISTS validation_attempts_select ON science.validation_attempts")

    # 4. Drop indexes
    op.execute("DROP INDEX IF EXISTS science.validation_attempts_active_claims_idx")
    op.execute("DROP INDEX IF EXISTS science.validation_attempts_stale_lock_idx")
    op.execute("DROP INDEX IF EXISTS science.validation_attempts_dataset_idx")
    op.execute("DROP INDEX IF EXISTS science.validation_attempts_worker_polling_idx")

    # 5. Drop table
    op.execute("DROP TABLE IF EXISTS science.validation_attempts")

    # 6. Drop enum
    op.execute("DROP TYPE IF EXISTS science.validation_attempt_status")

    # 7. Remove 'validating' from dataset_status enum (requires recreation)
    # Note: PostgreSQL does not support removing enum values directly.
    # This would require recreating the enum, which is complex.
    # For downgrade purposes, we leave the enum value in place.
    # A full downgrade would require dropping and recreating dependent tables.
