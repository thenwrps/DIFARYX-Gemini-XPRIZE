"""Phase 1B-A — Dataset ingestion, upload sessions, immutable dataset objects, quota reservations

Revision ID: 0010
Revises: 0009
Create Date: 2026-07-12
"""
from alembic import op
import sqlalchemy as sa


revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ═══════════════════════════════════════════════════════════════════════
    # 1. Assert environment-provisioned role exists
    # ═══════════════════════════════════════════════════════════════════════
    conn = op.get_bind()
    for role in ("difaryx_quota_writer",):
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
    # 2. New ENUM types
    # ═══════════════════════════════════════════════════════════════════════
    op.execute("""
        CREATE TYPE science.dataset_status AS ENUM (
            'allocated', 'uploading', 'uploaded',
            'pending_validation', 'valid', 'invalid', 'quarantined',
            'cancelled', 'expired', 'failed'
        )
    """)

    op.execute("""
        CREATE TYPE science.upload_session_status AS ENUM (
            'allocated', 'uploading', 'uploaded', 'finalized',
            'cancelled', 'expired', 'failed'
        )
    """)

    op.execute("""
        CREATE TYPE science.dataset_object_role AS ENUM (
            'original', 'canonical', 'display', 'derived'
        )
    """)

    op.execute("""
        CREATE TYPE governance.quota_reservation_status AS ENUM (
            'reserved', 'settled', 'released'
        )
    """)

    op.execute("""
        CREATE TYPE governance.quota_resource_type AS ENUM (
            'storage_upload'
        )
    """)

    # ═══════════════════════════════════════════════════════════════════════
    # 3. governance.quota_reservations
    # ═══════════════════════════════════════════════════════════════════════
    op.execute("""
        CREATE TABLE governance.quota_reservations (
            id                  UUID        NOT NULL DEFAULT uuid_generate_v4(),
            organization_id     UUID        NOT NULL REFERENCES identity.organizations(id) ON DELETE RESTRICT,
            project_id          UUID        NOT NULL,
            created_by          UUID        NOT NULL,
            quota_ledger_id     UUID        NOT NULL,
            reservation_key     TEXT        NOT NULL,
            resource_type       governance.quota_resource_type NOT NULL,
            reserved_amount     BIGINT      NOT NULL CHECK (reserved_amount > 0),
            status              governance.quota_reservation_status NOT NULL DEFAULT 'reserved',
            expires_at          TIMESTAMPTZ NOT NULL,
            settled_at          TIMESTAMPTZ,
            released_at         TIMESTAMPTZ,
            release_reason      TEXT,
            created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (organization_id, id),
            CONSTRAINT quota_reservations_project_fk
                FOREIGN KEY (organization_id, project_id)
                REFERENCES science.projects(organization_id, id)
                ON DELETE RESTRICT,
            CONSTRAINT quota_reservations_creator_fk
                FOREIGN KEY (organization_id, created_by)
                REFERENCES identity.users(organization_id, id)
                ON DELETE RESTRICT,
            CONSTRAINT quota_reservations_ledger_fk
                FOREIGN KEY (organization_id, quota_ledger_id)
                REFERENCES governance.quota_ledger(organization_id, id)
                ON DELETE RESTRICT,
            CONSTRAINT quota_reservations_key_uq
                UNIQUE (organization_id, reservation_key),
            CONSTRAINT quota_reservations_expires_at_check
                CHECK (expires_at > created_at),
            CONSTRAINT quota_reservations_status_consistency CHECK (
                (status = 'reserved'
                    AND settled_at IS NULL
                    AND released_at IS NULL
                    AND release_reason IS NULL)
                OR (status = 'settled'
                    AND settled_at IS NOT NULL
                    AND released_at IS NULL
                    AND release_reason IS NULL)
                OR (status = 'released'
                    AND settled_at IS NULL
                    AND released_at IS NOT NULL
                    AND release_reason IS NOT NULL)
            )
        )
    """)

    # ═══════════════════════════════════════════════════════════════════════
    # 4. science.datasets
    # ═══════════════════════════════════════════════════════════════════════
    op.execute("""
        CREATE TABLE science.datasets (
            id                      UUID        NOT NULL DEFAULT uuid_generate_v4(),
            organization_id         UUID        NOT NULL REFERENCES identity.organizations(id) ON DELETE RESTRICT,
            project_id              UUID        NOT NULL,
            technique               science.technique_code NOT NULL,
            display_filename        TEXT        NOT NULL,
            declared_content_type   TEXT        NOT NULL DEFAULT 'application/octet-stream',
            byte_size               BIGINT      NOT NULL CHECK (byte_size >= 0),
            client_checksum_sha256  TEXT
                CHECK (client_checksum_sha256 IS NULL
                    OR client_checksum_sha256 ~ '^[0-9a-f]{64}$'),
            dataset_status          science.dataset_status NOT NULL DEFAULT 'allocated',
            status_changed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            failure_code            TEXT,
            original_object_id      UUID,
            created_by              UUID        NOT NULL,
            created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (organization_id, id),
            CONSTRAINT datasets_project_fk FOREIGN KEY (organization_id, project_id)
                REFERENCES science.projects(organization_id, id) ON DELETE RESTRICT,
            CONSTRAINT datasets_creator_fk FOREIGN KEY (organization_id, created_by)
                REFERENCES identity.users(organization_id, id) ON DELETE RESTRICT,
            CONSTRAINT datasets_display_filename_length CHECK (
                pg_catalog.length(display_filename) BETWEEN 1 AND 500
            ),
            CONSTRAINT datasets_declared_content_type_length CHECK (
                pg_catalog.length(declared_content_type) BETWEEN 1 AND 200
            ),
            CONSTRAINT datasets_failure_code_length CHECK (
                failure_code IS NULL OR pg_catalog.length(failure_code) BETWEEN 1 AND 100
            )
        )
    """)

    # ═══════════════════════════════════════════════════════════════════════
    # 5. science.upload_sessions
    # ═══════════════════════════════════════════════════════════════════════
    op.execute("""
        CREATE TABLE science.upload_sessions (
            id                       UUID        NOT NULL DEFAULT uuid_generate_v4(),
            organization_id          UUID        NOT NULL REFERENCES identity.organizations(id) ON DELETE RESTRICT,
            dataset_id               UUID        NOT NULL,
            created_by               UUID        NOT NULL,
            object_key               TEXT        NOT NULL,
            expected_byte_size       BIGINT      NOT NULL CHECK (expected_byte_size >= 0),
            client_checksum_sha256   TEXT
                CHECK (client_checksum_sha256 IS NULL
                    OR client_checksum_sha256 ~ '^[0-9a-f]{64}$'),
            storage_provider         TEXT        NOT NULL DEFAULT 'local'
                CHECK (storage_provider IN ('local', 'gcs', 's3')),
            storage_generation       TEXT,
            session_status           science.upload_session_status NOT NULL DEFAULT 'allocated',
            idempotency_key          TEXT        NOT NULL,
            request_fingerprint      TEXT        NOT NULL
                CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
            quota_reservation_id     UUID        NOT NULL,
            expires_at               TIMESTAMPTZ NOT NULL,
            finalized_at             TIMESTAMPTZ,
            cancelled_at             TIMESTAMPTZ,
            failure_code             TEXT,
            created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (organization_id, id),
            CONSTRAINT upload_sessions_dataset_fk FOREIGN KEY (organization_id, dataset_id)
                REFERENCES science.datasets(organization_id, id) ON DELETE RESTRICT,
            CONSTRAINT upload_sessions_creator_fk FOREIGN KEY (organization_id, created_by)
                REFERENCES identity.users(organization_id, id) ON DELETE RESTRICT,
            CONSTRAINT upload_sessions_object_key_uq UNIQUE (organization_id, object_key),
            CONSTRAINT upload_sessions_idempotency_uq UNIQUE (organization_id, idempotency_key),
            CONSTRAINT upload_sessions_quota_reservation_fk
                FOREIGN KEY (organization_id, quota_reservation_id)
                REFERENCES governance.quota_reservations(organization_id, id)
                ON DELETE RESTRICT,
            CONSTRAINT upload_sessions_expires_at_check CHECK (expires_at > created_at),
            CONSTRAINT upload_sessions_finalized_consistency CHECK (
                (session_status = 'finalized' AND finalized_at IS NOT NULL)
                OR (session_status != 'finalized' AND finalized_at IS NULL)
            ),
            CONSTRAINT upload_sessions_cancelled_consistency CHECK (
                (session_status = 'cancelled' AND cancelled_at IS NOT NULL)
                OR (session_status != 'cancelled' AND cancelled_at IS NULL)
            ),
            CONSTRAINT upload_sessions_expired_consistency CHECK (
                (session_status = 'expired' AND finalized_at IS NULL AND cancelled_at IS NULL)
                OR (session_status != 'expired')
            ),
            CONSTRAINT upload_sessions_failed_consistency CHECK (
                (session_status = 'failed' AND failure_code IS NOT NULL)
                OR (session_status != 'failed' AND failure_code IS NULL)
            ),
            CONSTRAINT upload_sessions_idempotency_key_length CHECK (
                pg_catalog.length(idempotency_key) BETWEEN 1 AND 255
            ),
            CONSTRAINT upload_sessions_failure_code_length CHECK (
                failure_code IS NULL OR pg_catalog.length(failure_code) BETWEEN 1 AND 100
            ),
            CONSTRAINT upload_sessions_object_key_length CHECK (
                pg_catalog.length(object_key) BETWEEN 1 AND 1024
            ),
            CONSTRAINT upload_sessions_storage_generation_length CHECK (
                storage_generation IS NULL OR pg_catalog.length(storage_generation) BETWEEN 1 AND 255
            )
        )
    """)

    # ── Composite UNIQUE for lineage FK ──────────────────────────────────
    op.execute("""
        ALTER TABLE science.upload_sessions
            ADD CONSTRAINT upload_sessions_dataset_id_uq
            UNIQUE (organization_id, dataset_id, id)
    """)

    # ═══════════════════════════════════════════════════════════════════════
    # 6. science.dataset_objects (immutable)
    # ═══════════════════════════════════════════════════════════════════════
    op.execute("""
        CREATE TABLE science.dataset_objects (
            id                       UUID        NOT NULL DEFAULT uuid_generate_v4(),
            organization_id          UUID        NOT NULL REFERENCES identity.organizations(id) ON DELETE RESTRICT,
            dataset_id               UUID        NOT NULL,
            source_upload_session_id UUID        NOT NULL,
            object_role              science.dataset_object_role NOT NULL,
            storage_provider         TEXT        NOT NULL DEFAULT 'local'
                CHECK (storage_provider IN ('local', 'gcs', 's3')),
            object_key               TEXT        NOT NULL,
            storage_generation       TEXT,
            byte_size                BIGINT      NOT NULL CHECK (byte_size >= 0),
            content_type             TEXT        NOT NULL,
            created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (organization_id, id),
            CONSTRAINT dataset_objects_dataset_fk FOREIGN KEY (organization_id, dataset_id)
                REFERENCES science.datasets(organization_id, id) ON DELETE RESTRICT,
            -- Composite FK: proves upload session belongs to this dataset
            CONSTRAINT dataset_objects_upload_session_fk
                FOREIGN KEY (organization_id, dataset_id, source_upload_session_id)
                REFERENCES science.upload_sessions(organization_id, dataset_id, id)
                ON DELETE RESTRICT,
            CONSTRAINT dataset_objects_object_key_uq UNIQUE (organization_id, object_key),
            CONSTRAINT dataset_objects_object_key_length CHECK (
                pg_catalog.length(object_key) BETWEEN 1 AND 1024
            ),
            CONSTRAINT dataset_objects_content_type_length CHECK (
                pg_catalog.length(content_type) BETWEEN 1 AND 200
            ),
            CONSTRAINT dataset_objects_storage_generation_length CHECK (
                storage_generation IS NULL OR pg_catalog.length(storage_generation) BETWEEN 1 AND 255
            )
        )
    """)

    # ── Composite UNIQUE on dataset_objects for FK reference ──────────────
    op.execute("""
        ALTER TABLE science.dataset_objects
            ADD CONSTRAINT dataset_objects_dataset_id_uq
            UNIQUE (organization_id, dataset_id, id)
    """)

    # ── Partial unique index: one original per dataset ────────────────────
    op.execute("""
        CREATE UNIQUE INDEX dataset_objects_one_original_per_dataset_uq
        ON science.dataset_objects (organization_id, dataset_id)
        WHERE object_role = 'original'
    """)

    # ═══════════════════════════════════════════════════════════════════════
    # 7. Back-fill datasets.original_object_id FK (composite, deferred)
    # ═══════════════════════════════════════════════════════════════════════
    op.execute("""
        ALTER TABLE science.datasets
            ADD CONSTRAINT datasets_original_object_fk
            FOREIGN KEY (organization_id, id, original_object_id)
            REFERENCES science.dataset_objects(organization_id, dataset_id, id)
            ON DELETE RESTRICT
            DEFERRABLE INITIALLY DEFERRED
    """)

    # ═══════════════════════════════════════════════════════════════════════
    # 8. Indexes
    # ═══════════════════════════════════════════════════════════════════════
    op.execute("CREATE INDEX ON science.datasets (organization_id, project_id)")
    op.execute("CREATE INDEX ON science.datasets (organization_id, technique)")
    op.execute("CREATE INDEX ON science.datasets (organization_id, dataset_status)")
    op.execute("CREATE INDEX ON science.upload_sessions (organization_id, dataset_id)")
    op.execute("CREATE INDEX ON science.upload_sessions (organization_id, session_status, expires_at)")
    op.execute("""
        CREATE INDEX upload_sessions_request_fingerprint_idx
        ON science.upload_sessions (organization_id, request_fingerprint)
    """)
    op.execute("CREATE INDEX ON science.dataset_objects (organization_id, dataset_id)")

    # ═══════════════════════════════════════════════════════════════════════
    # 9. RLS — Enable and FORCE
    # ═══════════════════════════════════════════════════════════════════════
    for tbl in ("quota_reservations",):
        op.execute(f"ALTER TABLE governance.{tbl} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE governance.{tbl} FORCE ROW LEVEL SECURITY")

    for tbl in ("datasets", "upload_sessions", "dataset_objects"):
        op.execute(f"ALTER TABLE science.{tbl} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE science.{tbl} FORCE ROW LEVEL SECURITY")

    # ═══════════════════════════════════════════════════════════════════════
    # 10. RLS Policies — governance.quota_reservations
    # ═══════════════════════════════════════════════════════════════════════

    # SELECT: org + (owner/admin OR creator OR project lead/member)
    op.execute("""
        CREATE POLICY quota_reservations_select ON governance.quota_reservations
            FOR SELECT
            USING (
                organization_id = identity.current_organization_id()
                AND (
                    EXISTS (
                        SELECT 1 FROM identity.memberships m
                        WHERE m.organization_id = quota_reservations.organization_id
                          AND m.user_id = identity.current_user_id()
                          AND m.role IN ('owner', 'admin')
                    )
                    OR created_by = identity.current_user_id()
                    OR EXISTS (
                        SELECT 1 FROM science.project_memberships pm
                        WHERE pm.organization_id = quota_reservations.organization_id
                          AND pm.project_id = quota_reservations.project_id
                          AND pm.user_id = identity.current_user_id()
                          AND pm.role IN ('lead', 'member')
                    )
                )
            )
    """)

    # INSERT: must be project lead/member or org owner/admin
    op.execute("""
        CREATE POLICY quota_reservations_insert ON governance.quota_reservations
            FOR INSERT
            WITH CHECK (
                organization_id = identity.current_organization_id()
                AND created_by = identity.current_user_id()
                AND (
                    EXISTS (
                        SELECT 1 FROM identity.memberships m
                        WHERE m.organization_id = quota_reservations.organization_id
                          AND m.user_id = identity.current_user_id()
                          AND m.role IN ('owner', 'admin')
                    )
                    OR EXISTS (
                        SELECT 1 FROM science.project_memberships pm
                        WHERE pm.organization_id = quota_reservations.organization_id
                          AND pm.project_id = quota_reservations.project_id
                          AND pm.user_id = identity.current_user_id()
                          AND pm.role IN ('lead', 'member')
                    )
                )
            )
    """)

    # UPDATE: creator or org owner/admin
    op.execute("""
        CREATE POLICY quota_reservations_update ON governance.quota_reservations
            FOR UPDATE
            USING (
                organization_id = identity.current_organization_id()
                AND (
                    EXISTS (
                        SELECT 1 FROM identity.memberships m
                        WHERE m.organization_id = quota_reservations.organization_id
                          AND m.user_id = identity.current_user_id()
                          AND m.role IN ('owner', 'admin')
                    )
                    OR created_by = identity.current_user_id()
                )
            )
            WITH CHECK (
                organization_id = identity.current_organization_id()
                AND (
                    EXISTS (
                        SELECT 1 FROM identity.memberships m
                        WHERE m.organization_id = quota_reservations.organization_id
                          AND m.user_id = identity.current_user_id()
                          AND m.role IN ('owner', 'admin')
                    )
                    OR created_by = identity.current_user_id()
                )
            )
    """)

    # ═══════════════════════════════════════════════════════════════════════
    # 11. RLS Policies — science.datasets
    # ═══════════════════════════════════════════════════════════════════════

    op.execute("""
        CREATE POLICY datasets_select ON science.datasets
            FOR SELECT
            USING (
                organization_id = identity.current_organization_id()
                AND (
                    EXISTS (
                        SELECT 1 FROM identity.memberships m
                        WHERE m.organization_id = datasets.organization_id
                          AND m.user_id = identity.current_user_id()
                          AND m.role IN ('owner', 'admin')
                    )
                    OR EXISTS (
                        SELECT 1 FROM science.project_memberships pm
                        WHERE pm.organization_id = datasets.organization_id
                          AND pm.project_id = datasets.project_id
                          AND pm.user_id = identity.current_user_id()
                    )
                )
            )
    """)

    op.execute("""
        CREATE POLICY datasets_insert ON science.datasets
            FOR INSERT
            WITH CHECK (
                organization_id = identity.current_organization_id()
                AND created_by = identity.current_user_id()
                AND (
                    EXISTS (
                        SELECT 1 FROM identity.memberships m
                        WHERE m.organization_id = datasets.organization_id
                          AND m.user_id = identity.current_user_id()
                          AND m.role IN ('owner', 'admin')
                    )
                    OR EXISTS (
                        SELECT 1 FROM science.project_memberships pm
                        WHERE pm.organization_id = datasets.organization_id
                          AND pm.project_id = datasets.project_id
                          AND pm.user_id = identity.current_user_id()
                          AND pm.role IN ('lead', 'member')
                    )
                )
            )
    """)

    op.execute("""
        CREATE POLICY datasets_update ON science.datasets
            FOR UPDATE
            USING (
                organization_id = identity.current_organization_id()
                AND (
                    EXISTS (
                        SELECT 1 FROM identity.memberships m
                        WHERE m.organization_id = datasets.organization_id
                          AND m.user_id = identity.current_user_id()
                          AND m.role IN ('owner', 'admin')
                    )
                    OR (
                        EXISTS (
                            SELECT 1 FROM science.project_memberships pm
                            WHERE pm.organization_id = datasets.organization_id
                              AND pm.project_id = datasets.project_id
                              AND pm.user_id = identity.current_user_id()
                              AND pm.role IN ('lead', 'member')
                        )
                        AND created_by = identity.current_user_id()
                    )
                )
            )
            WITH CHECK (
                organization_id = identity.current_organization_id()
                AND (
                    EXISTS (
                        SELECT 1 FROM identity.memberships m
                        WHERE m.organization_id = datasets.organization_id
                          AND m.user_id = identity.current_user_id()
                          AND m.role IN ('owner', 'admin')
                    )
                    OR (
                        EXISTS (
                            SELECT 1 FROM science.project_memberships pm
                            WHERE pm.organization_id = datasets.organization_id
                              AND pm.project_id = datasets.project_id
                              AND pm.user_id = identity.current_user_id()
                              AND pm.role IN ('lead', 'member')
                        )
                        AND created_by = identity.current_user_id()
                    )
                )
            )
    """)

    # ═══════════════════════════════════════════════════════════════════════
    # 12. RLS Policies — science.upload_sessions
    # ═══════════════════════════════════════════════════════════════════════

    op.execute("""
        CREATE POLICY upload_sessions_select ON science.upload_sessions
            FOR SELECT
            USING (
                organization_id = identity.current_organization_id()
                AND EXISTS (
                    SELECT 1 FROM science.datasets d
                    WHERE d.organization_id = upload_sessions.organization_id
                      AND d.id = upload_sessions.dataset_id
                )
            )
    """)

    op.execute("""
        CREATE POLICY upload_sessions_insert ON science.upload_sessions
            FOR INSERT
            WITH CHECK (
                organization_id = identity.current_organization_id()
                AND created_by = identity.current_user_id()
                AND EXISTS (
                    SELECT 1 FROM science.datasets d
                    WHERE d.organization_id = upload_sessions.organization_id
                      AND d.id = upload_sessions.dataset_id
                      AND (
                          EXISTS (
                              SELECT 1 FROM identity.memberships m
                              WHERE m.organization_id = d.organization_id
                                AND m.user_id = identity.current_user_id()
                                AND m.role IN ('owner', 'admin')
                          )
                          OR EXISTS (
                              SELECT 1 FROM science.project_memberships pm
                              WHERE pm.organization_id = d.organization_id
                                AND pm.project_id = d.project_id
                                AND pm.user_id = identity.current_user_id()
                                AND pm.role IN ('lead', 'member')
                          )
                      )
                )
                AND EXISTS (
                    SELECT 1 FROM governance.quota_reservations qr
                    WHERE qr.organization_id = upload_sessions.organization_id
                      AND qr.id = upload_sessions.quota_reservation_id
                      AND qr.status = 'reserved'
                )
            )
    """)

    op.execute("""
        CREATE POLICY upload_sessions_update ON science.upload_sessions
            FOR UPDATE
            USING (
                organization_id = identity.current_organization_id()
                AND (
                    EXISTS (
                        SELECT 1 FROM identity.memberships m
                        WHERE m.organization_id = upload_sessions.organization_id
                          AND m.user_id = identity.current_user_id()
                          AND m.role IN ('owner', 'admin')
                    )
                    OR (
                        EXISTS (
                            SELECT 1 FROM science.datasets d
                            WHERE d.organization_id = upload_sessions.organization_id
                              AND d.id = upload_sessions.dataset_id
                        )
                        AND created_by = identity.current_user_id()
                    )
                )
            )
            WITH CHECK (
                organization_id = identity.current_organization_id()
                AND (
                    EXISTS (
                        SELECT 1 FROM identity.memberships m
                        WHERE m.organization_id = upload_sessions.organization_id
                          AND m.user_id = identity.current_user_id()
                          AND m.role IN ('owner', 'admin')
                    )
                    OR (
                        EXISTS (
                            SELECT 1 FROM science.datasets d
                            WHERE d.organization_id = upload_sessions.organization_id
                              AND d.id = upload_sessions.dataset_id
                        )
                        AND created_by = identity.current_user_id()
                    )
                )
            )
    """)

    # ═══════════════════════════════════════════════════════════════════════
    # 13. RLS Policies — science.dataset_objects
    # ═══════════════════════════════════════════════════════════════════════

    op.execute("""
        CREATE POLICY dataset_objects_select ON science.dataset_objects
            FOR SELECT
            USING (
                organization_id = identity.current_organization_id()
                AND EXISTS (
                    SELECT 1 FROM science.datasets d
                    WHERE d.organization_id = dataset_objects.organization_id
                      AND d.id = dataset_objects.dataset_id
                )
            )
    """)

    op.execute("""
        CREATE POLICY dataset_objects_insert ON science.dataset_objects
            FOR INSERT
            WITH CHECK (
                organization_id = identity.current_organization_id()
                AND EXISTS (
                    SELECT 1 FROM science.upload_sessions us
                    WHERE us.organization_id = dataset_objects.organization_id
                      AND us.dataset_id = dataset_objects.dataset_id
                      AND us.id = dataset_objects.source_upload_session_id
                      AND us.session_status = 'uploaded'
                      AND us.object_key = dataset_objects.object_key
                      AND us.storage_provider = dataset_objects.storage_provider
                      AND us.expected_byte_size = dataset_objects.byte_size
                      AND (
                          EXISTS (
                              SELECT 1 FROM identity.memberships m
                              WHERE m.organization_id = us.organization_id
                                AND m.user_id = identity.current_user_id()
                                AND m.role IN ('owner', 'admin')
                          )
                          OR us.created_by = identity.current_user_id()
                      )
                )
                AND object_role = 'original'
                AND NOT EXISTS (
                    SELECT 1 FROM science.dataset_objects existing
                    WHERE existing.organization_id = dataset_objects.organization_id
                      AND existing.dataset_id = dataset_objects.dataset_id
                      AND existing.object_role = 'original'
                )
            )
    """)

    # ═══════════════════════════════════════════════════════════════════════
    # 14. Quota writer role — schema/type/table privileges
    # ═══════════════════════════════════════════════════════════════════════

    # Schema USAGE
    op.execute("GRANT USAGE ON SCHEMA governance TO difaryx_quota_writer")
    op.execute("GRANT USAGE ON SCHEMA identity TO difaryx_quota_writer")
    op.execute("GRANT USAGE ON SCHEMA science TO difaryx_quota_writer")

    # TYPE USAGE
    op.execute("GRANT USAGE ON TYPE governance.quota_reservation_status TO difaryx_quota_writer")
    op.execute("GRANT USAGE ON TYPE governance.quota_resource_type TO difaryx_quota_writer")

    # governance.quota_ledger: SELECT (bounded) + UPDATE (bounded)
    op.execute("""
        GRANT SELECT (id, organization_id, quota_type, quota_period,
                      period_start, period_end, allocated, consumed,
                      reserved, estimated_amount, settled_amount,
                      released_amount, updated_at)
        ON governance.quota_ledger
        TO difaryx_quota_writer
    """)
    op.execute("""
        GRANT UPDATE (reserved, estimated_amount, consumed,
                      settled_amount, released_amount, updated_at)
        ON governance.quota_ledger
        TO difaryx_quota_writer
    """)

    # governance.quota_reservations: SELECT, INSERT, UPDATE
    op.execute("GRANT SELECT, INSERT, UPDATE ON governance.quota_reservations TO difaryx_quota_writer")

    # governance.usage_events: INSERT + SELECT (bounded)
    op.execute("GRANT INSERT ON governance.usage_events TO difaryx_quota_writer")
    op.execute("""
        GRANT SELECT (id, organization_id, quota_ledger_id, ledger_org_id,
                      event_type, amount, idempotency_key, reference_id)
        ON governance.usage_events
        TO difaryx_quota_writer
    """)

    # identity.memberships: bounded SELECT for RLS policy evaluation
    op.execute("""
        GRANT SELECT (organization_id, user_id, role)
        ON identity.memberships
        TO difaryx_quota_writer
    """)

    # science.project_memberships: bounded SELECT for RLS policy evaluation
    op.execute("""
        GRANT SELECT (organization_id, project_id, user_id, role)
        ON science.project_memberships
        TO difaryx_quota_writer
    """)

    # Context helper functions for quota writer
    op.execute("GRANT EXECUTE ON FUNCTION identity.current_organization_id() TO difaryx_quota_writer")
    op.execute("GRANT EXECUTE ON FUNCTION identity.current_user_id() TO difaryx_quota_writer")

    # ═══════════════════════════════════════════════════════════════════════
    # 15. Bounded SECURITY DEFINER functions
    # ═══════════════════════════════════════════════════════════════════════

    # ── 15a. reserve_storage_quota ────────────────────────────────────────
    op.execute("""
        CREATE FUNCTION governance.reserve_storage_quota(
            p_organization_id UUID,
            p_user_id         UUID,
            p_project_id      UUID,
            p_reservation_key TEXT,
            p_requested_bytes BIGINT,
            p_expires_at      TIMESTAMPTZ,
            p_idempotency_key TEXT
        )
        RETURNS UUID
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = pg_catalog
        AS $$
        DECLARE
            v_ledger_id      UUID;
            v_reservation_id UUID;
            v_org_id         UUID;
            v_user_id        UUID;
            v_updated        INTEGER;
            v_existing       governance.quota_reservations;
        BEGIN
            -- 1. Verify tenant/user context
            v_org_id := identity.current_organization_id();
            v_user_id := identity.current_user_id();

            IF v_org_id IS NULL THEN
                RAISE EXCEPTION 'tenant context is required'
                    USING ERRCODE = '42501';
            END IF;
            IF v_user_id IS NULL THEN
                RAISE EXCEPTION 'user context is required'
                    USING ERRCODE = '42501';
            END IF;

            -- 2. Verify arguments match context
            IF p_organization_id IS DISTINCT FROM v_org_id THEN
                RAISE EXCEPTION 'organization context mismatch'
                    USING ERRCODE = '42501';
            END IF;
            IF p_user_id IS DISTINCT FROM v_user_id THEN
                RAISE EXCEPTION 'user context mismatch'
                    USING ERRCODE = '42501';
            END IF;

            -- 3. Validate requested bytes
            IF p_requested_bytes <= 0 THEN
                RAISE EXCEPTION 'requested_bytes must be positive';
            END IF;

            -- 4. Lock the organization's storage ledger (serializes per org)
            SELECT id INTO v_ledger_id
            FROM governance.quota_ledger
            WHERE organization_id = p_organization_id
              AND quota_type = 'storage'
              AND quota_period = 'lifetime'
            FOR UPDATE;

            IF v_ledger_id IS NULL THEN
                RAISE EXCEPTION 'storage quota not configured for this organization'
                    USING ERRCODE = 'D0003';
            END IF;

            -- 5. Check for existing reservation by key (race-safe: ledger locked)
            SELECT * INTO v_existing
            FROM governance.quota_reservations
            WHERE organization_id = p_organization_id
              AND reservation_key = p_reservation_key;

            IF FOUND THEN
                -- Same key, materially same request -> return existing
                IF v_existing.project_id = p_project_id
                   AND v_existing.created_by = p_user_id
                   AND v_existing.reserved_amount = p_requested_bytes
                   AND v_existing.resource_type = 'storage_upload'
                   AND v_existing.status IN ('reserved', 'settled')
                THEN
                    RETURN v_existing.id;
                END IF;
                -- Released reservations are terminal; caller must use new key
                IF v_existing.status = 'released' THEN
                    RAISE EXCEPTION 'reservation key already released; use a new key'
                        USING ERRCODE = 'D0005';
                END IF;
                -- Different request -> conflict
                RAISE EXCEPTION 'idempotency key reused with different request parameters'
                    USING ERRCODE = 'D0002';
            END IF;

            -- 6. Atomically reserve bytes (race-safe conditional update)
            UPDATE governance.quota_ledger
            SET
                reserved = reserved + p_requested_bytes,
                estimated_amount = estimated_amount + p_requested_bytes,
                updated_at = NOW()
            WHERE organization_id = p_organization_id
              AND id = v_ledger_id
              AND consumed + reserved + p_requested_bytes <= allocated
            RETURNING 1 INTO v_updated;

            IF v_updated IS NULL OR v_updated = 0 THEN
                RAISE EXCEPTION 'storage quota exceeded'
                    USING ERRCODE = 'D0001';
            END IF;

            -- 7. Insert reservation record
            INSERT INTO governance.quota_reservations
                (organization_id, project_id, created_by,
                 quota_ledger_id, reservation_key,
                 resource_type, reserved_amount, expires_at)
            VALUES
                (p_organization_id, p_project_id, p_user_id,
                 v_ledger_id, p_reservation_key,
                 'storage_upload', p_requested_bytes, p_expires_at)
            RETURNING id INTO v_reservation_id;

            -- 8. Insert usage event (server-derived idempotency key)
            INSERT INTO governance.usage_events
                (organization_id, quota_ledger_id, ledger_org_id,
                 event_type, amount, idempotency_key, reference_id)
            VALUES
                (p_organization_id, v_ledger_id, p_organization_id,
                 'reservation', p_requested_bytes,
                 'storage-reserve-' || v_reservation_id::TEXT,
                 v_reservation_id::TEXT);

            RETURN v_reservation_id;
        END;
        $$
    """)

    # ── 15b. release_storage_reservation ──────────────────────────────────
    op.execute("""
        CREATE FUNCTION governance.release_storage_reservation(
            p_organization_id UUID,
            p_reservation_id  UUID,
            p_release_reason  TEXT
        )
        RETURNS BOOLEAN
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = pg_catalog
        AS $$
        DECLARE
            v_org_id    UUID;
            v_user_id   UUID;
            v_reservation governance.quota_reservations;
            v_updated   INTEGER;
        BEGIN
            -- 1. Verify context
            v_org_id := identity.current_organization_id();
            v_user_id := identity.current_user_id();

            IF v_org_id IS NULL THEN
                RAISE EXCEPTION 'tenant context is required'
                    USING ERRCODE = '42501';
            END IF;
            IF v_user_id IS NULL THEN
                RAISE EXCEPTION 'user context is required'
                    USING ERRCODE = '42501';
            END IF;
            IF p_organization_id IS DISTINCT FROM v_org_id THEN
                RAISE EXCEPTION 'organization context mismatch'
                    USING ERRCODE = '42501';
            END IF;

            -- 2. Validate release reason
            IF p_release_reason IS NULL OR pg_catalog.length(pg_catalog.btrim(p_release_reason)) = 0 THEN
                RAISE EXCEPTION 'release_reason must not be empty';
            END IF;
            IF pg_catalog.length(p_release_reason) > 255 THEN
                RAISE EXCEPTION 'release_reason exceeds maximum length of 255';
            END IF;

            -- 3. Lock and validate reservation (only 'reserved' status)
            SELECT * INTO v_reservation
            FROM governance.quota_reservations
            WHERE organization_id = p_organization_id
              AND id = p_reservation_id
            FOR UPDATE;

            IF NOT FOUND THEN
                RETURN FALSE;
            END IF;

            IF v_reservation.status != 'reserved' THEN
                RETURN FALSE;
            END IF;

            -- 4. Update reservation
            UPDATE governance.quota_reservations
            SET status = 'released',
                released_at = NOW(),
                release_reason = p_release_reason,
                updated_at = NOW()
            WHERE organization_id = p_organization_id
              AND id = p_reservation_id;

            -- 5. Update ledger (conditional: reserved >= amount)
            UPDATE governance.quota_ledger
            SET reserved = reserved - v_reservation.reserved_amount,
                released_amount = released_amount + v_reservation.reserved_amount,
                updated_at = NOW()
            WHERE organization_id = p_organization_id
              AND id = v_reservation.quota_ledger_id
              AND reserved >= v_reservation.reserved_amount
            RETURNING 1 INTO v_updated;

            IF v_updated IS NULL OR v_updated = 0 THEN
                RAISE EXCEPTION 'quota ledger inconsistent: reserved < release amount'
                    USING ERRCODE = 'D0004';
            END IF;

            -- 6. Insert usage event
            INSERT INTO governance.usage_events
                (organization_id, quota_ledger_id, ledger_org_id,
                 event_type, amount, idempotency_key, reference_id)
            VALUES
                (p_organization_id, v_reservation.quota_ledger_id, p_organization_id,
                 'release', v_reservation.reserved_amount,
                 'storage-release-' || p_reservation_id::TEXT,
                 p_reservation_id::TEXT);

            RETURN TRUE;
        END;
        $$
    """)

    # ── 15c. settle_storage_reservation ───────────────────────────────────
    op.execute("""
        CREATE FUNCTION governance.settle_storage_reservation(
            p_organization_id UUID,
            p_reservation_id  UUID,
            p_actual_bytes    BIGINT
        )
        RETURNS BOOLEAN
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = pg_catalog
        AS $$
        DECLARE
            v_org_id    UUID;
            v_user_id   UUID;
            v_reservation governance.quota_reservations;
            v_updated   INTEGER;
        BEGIN
            -- 1. Verify context
            v_org_id := identity.current_organization_id();
            v_user_id := identity.current_user_id();

            IF v_org_id IS NULL THEN
                RAISE EXCEPTION 'tenant context is required'
                    USING ERRCODE = '42501';
            END IF;
            IF p_organization_id IS DISTINCT FROM v_org_id THEN
                RAISE EXCEPTION 'organization context mismatch'
                    USING ERRCODE = '42501';
            END IF;

            -- 2. Validate actual bytes
            IF p_actual_bytes <= 0 THEN
                RAISE EXCEPTION 'actual_bytes must be positive';
            END IF;

            -- 3. Lock and validate reservation (only 'reserved')
            SELECT * INTO v_reservation
            FROM governance.quota_reservations
            WHERE organization_id = p_organization_id
              AND id = p_reservation_id
            FOR UPDATE;

            IF NOT FOUND THEN
                RETURN FALSE;
            END IF;

            IF v_reservation.status != 'reserved' THEN
                RETURN FALSE;
            END IF;

            -- 4. Verify amount matches reservation
            IF p_actual_bytes IS DISTINCT FROM v_reservation.reserved_amount THEN
                RAISE EXCEPTION 'settlement amount mismatch: expected %, got %',
                    v_reservation.reserved_amount, p_actual_bytes;
            END IF;

            -- 5. Update reservation
            UPDATE governance.quota_reservations
            SET status = 'settled',
                settled_at = NOW(),
                updated_at = NOW()
            WHERE organization_id = p_organization_id
              AND id = p_reservation_id;

            -- 6. Update ledger (conditional: reserved >= amount)
            UPDATE governance.quota_ledger
            SET reserved = reserved - v_reservation.reserved_amount,
                consumed = consumed + p_actual_bytes,
                settled_amount = settled_amount + p_actual_bytes,
                updated_at = NOW()
            WHERE organization_id = p_organization_id
              AND id = v_reservation.quota_ledger_id
              AND reserved >= v_reservation.reserved_amount
            RETURNING 1 INTO v_updated;

            IF v_updated IS NULL OR v_updated = 0 THEN
                RAISE EXCEPTION 'quota ledger inconsistent: reserved < settlement amount'
                    USING ERRCODE = 'D0004';
            END IF;

            -- 7. Insert usage event
            INSERT INTO governance.usage_events
                (organization_id, quota_ledger_id, ledger_org_id,
                 event_type, amount, idempotency_key, reference_id)
            VALUES
                (p_organization_id, v_reservation.quota_ledger_id, p_organization_id,
                 'settlement', p_actual_bytes,
                 'storage-settle-' || p_reservation_id::TEXT,
                 p_reservation_id::TEXT);

            RETURN TRUE;
        END;
        $$
    """)

    # ── 15d. Transfer function ownership to difaryx_quota_writer ──────────
    op.execute("GRANT CREATE ON SCHEMA governance TO difaryx_quota_writer")

    op.execute("""
        ALTER FUNCTION governance.reserve_storage_quota(
            UUID, UUID, UUID, TEXT, BIGINT, TIMESTAMPTZ, TEXT
        )
        OWNER TO difaryx_quota_writer
    """)
    op.execute("""
        ALTER FUNCTION governance.release_storage_reservation(
            UUID, UUID, TEXT
        )
        OWNER TO difaryx_quota_writer
    """)
    op.execute("""
        ALTER FUNCTION governance.settle_storage_reservation(
            UUID, UUID, BIGINT
        )
        OWNER TO difaryx_quota_writer
    """)

    op.execute("REVOKE CREATE ON SCHEMA governance FROM difaryx_quota_writer")

    # ── 15e. Grant EXECUTE to difaryx_app ─────────────────────────────────
    for func_sig in [
        "governance.reserve_storage_quota(UUID, UUID, UUID, TEXT, BIGINT, TIMESTAMPTZ, TEXT)",
        "governance.release_storage_reservation(UUID, UUID, TEXT)",
        "governance.settle_storage_reservation(UUID, UUID, BIGINT)",
    ]:
        op.execute(f"REVOKE ALL ON FUNCTION {func_sig} FROM PUBLIC")
        op.execute(f"GRANT EXECUTE ON FUNCTION {func_sig} TO difaryx_app")

    # ═══════════════════════════════════════════════════════════════════════
    # 16. Final grants for difaryx_app (no direct quota mutation)
    # ═══════════════════════════════════════════════════════════════════════

    # governance.quota_reservations: bounded SELECT only
    op.execute("""
        GRANT SELECT (id, organization_id, project_id, created_by,
                      quota_ledger_id, reservation_key, resource_type,
                      reserved_amount, status, expires_at, created_at)
        ON governance.quota_reservations
        TO difaryx_app
    """)

    # science.datasets: SELECT, INSERT, bounded UPDATE
    # Note: authoritative_content_hash is NOT granted — reserved for future worker
    op.execute("GRANT SELECT, INSERT ON science.datasets TO difaryx_app")
    op.execute("""
        GRANT UPDATE (
            dataset_status, status_changed_at, failure_code,
            original_object_id, updated_at
        ) ON science.datasets TO difaryx_app
    """)

    # science.upload_sessions: SELECT, INSERT, bounded UPDATE
    op.execute("GRANT SELECT, INSERT ON science.upload_sessions TO difaryx_app")
    op.execute("""
        GRANT UPDATE (
            session_status, storage_generation, finalized_at,
            cancelled_at, failure_code, updated_at
        ) ON science.upload_sessions TO difaryx_app
    """)

    # science.dataset_objects: SELECT and INSERT only (no UPDATE, no DELETE)
    op.execute("GRANT SELECT, INSERT ON science.dataset_objects TO difaryx_app")


def downgrade() -> None:
    # ═══════════════════════════════════════════════════════════════════════
    # Correct downgrade: revoke grants FIRST, then drop objects.
    # No CASCADE. No Phase 0/1A objects touched.
    # ═══════════════════════════════════════════════════════════════════════

    # 1. Revoke function EXECUTE grants from difaryx_app
    for func_sig in [
        "governance.reserve_storage_quota(UUID, UUID, UUID, TEXT, BIGINT, TIMESTAMPTZ, TEXT)",
        "governance.release_storage_reservation(UUID, UUID, TEXT)",
        "governance.settle_storage_reservation(UUID, UUID, BIGINT)",
    ]:
        op.execute(f"REVOKE EXECUTE ON FUNCTION {func_sig} FROM difaryx_app")

    # 2. Revoke table/column privileges (tables still exist)
    op.execute("REVOKE SELECT, INSERT ON science.dataset_objects FROM difaryx_app")
    op.execute("REVOKE UPDATE ON science.upload_sessions FROM difaryx_app")
    op.execute("REVOKE SELECT, INSERT ON science.upload_sessions FROM difaryx_app")
    op.execute("REVOKE UPDATE ON science.datasets FROM difaryx_app")
    op.execute("REVOKE SELECT, INSERT ON science.datasets FROM difaryx_app")
    op.execute("REVOKE SELECT ON governance.quota_reservations FROM difaryx_app")

    # 3. Revoke quota writer privileges
    op.execute("""
        REVOKE EXECUTE ON FUNCTION identity.current_organization_id()
        FROM difaryx_quota_writer
    """)
    op.execute("""
        REVOKE EXECUTE ON FUNCTION identity.current_user_id()
        FROM difaryx_quota_writer
    """)
    op.execute("REVOKE SELECT, INSERT, UPDATE ON governance.quota_reservations FROM difaryx_quota_writer")
    op.execute("REVOKE INSERT ON governance.usage_events FROM difaryx_quota_writer")
    op.execute("REVOKE SELECT ON governance.usage_events FROM difaryx_quota_writer")
    op.execute("REVOKE SELECT, UPDATE ON governance.quota_ledger FROM difaryx_quota_writer")
    op.execute("REVOKE SELECT ON identity.memberships FROM difaryx_quota_writer")
    op.execute("REVOKE SELECT ON science.project_memberships FROM difaryx_quota_writer")
    op.execute("REVOKE USAGE ON TYPE governance.quota_resource_type FROM difaryx_quota_writer")
    op.execute("REVOKE USAGE ON TYPE governance.quota_reservation_status FROM difaryx_quota_writer")
    op.execute("REVOKE USAGE ON SCHEMA science FROM difaryx_quota_writer")
    op.execute("REVOKE USAGE ON SCHEMA identity FROM difaryx_quota_writer")
    op.execute("REVOKE USAGE ON SCHEMA governance FROM difaryx_quota_writer")

    # 4. Drop quota functions (explicit signatures)
    op.execute("""
        DROP FUNCTION IF EXISTS governance.settle_storage_reservation(
            UUID, UUID, BIGINT
        )
    """)
    op.execute("""
        DROP FUNCTION IF EXISTS governance.release_storage_reservation(
            UUID, UUID, TEXT
        )
    """)
    op.execute("""
        DROP FUNCTION IF EXISTS governance.reserve_storage_quota(
            UUID, UUID, UUID, TEXT, BIGINT, TIMESTAMPTZ, TEXT
        )
    """)

    # 5. Drop RLS policies
    op.execute("DROP POLICY IF EXISTS dataset_objects_insert ON science.dataset_objects")
    op.execute("DROP POLICY IF EXISTS dataset_objects_select ON science.dataset_objects")
    op.execute("DROP POLICY IF EXISTS upload_sessions_update ON science.upload_sessions")
    op.execute("DROP POLICY IF EXISTS upload_sessions_insert ON science.upload_sessions")
    op.execute("DROP POLICY IF EXISTS upload_sessions_select ON science.upload_sessions")
    op.execute("DROP POLICY IF EXISTS datasets_update ON science.datasets")
    op.execute("DROP POLICY IF EXISTS datasets_insert ON science.datasets")
    op.execute("DROP POLICY IF EXISTS datasets_select ON science.datasets")
    op.execute("DROP POLICY IF EXISTS quota_reservations_update ON governance.quota_reservations")
    op.execute("DROP POLICY IF EXISTS quota_reservations_insert ON governance.quota_reservations")
    op.execute("DROP POLICY IF EXISTS quota_reservations_select ON governance.quota_reservations")

    # 6. Drop datasets_original_object_fk
    op.execute("ALTER TABLE science.datasets DROP CONSTRAINT IF EXISTS datasets_original_object_fk")

    # 7. Drop migration-specific indexes
    op.execute("DROP INDEX IF EXISTS science.dataset_objects_one_original_per_dataset_uq")
    op.execute("DROP INDEX IF EXISTS science.dataset_objects_provider_generation_idx")
    op.execute("DROP INDEX IF EXISTS science.upload_sessions_request_fingerprint_idx")

    # 8. Drop dataset_objects (removes its constraints and indexes)
    op.execute("DROP TABLE IF EXISTS science.dataset_objects")

    # 9. Drop upload_sessions
    op.execute("DROP TABLE IF EXISTS science.upload_sessions")

    # 10. Drop datasets
    op.execute("DROP TABLE IF EXISTS science.datasets")

    # 11. Drop quota_reservations
    op.execute("DROP TABLE IF EXISTS governance.quota_reservations")

    # 12. Drop enums last
    op.execute("DROP TYPE IF EXISTS governance.quota_resource_type")
    op.execute("DROP TYPE IF EXISTS governance.quota_reservation_status")
    op.execute("DROP TYPE IF EXISTS science.dataset_object_role")
    op.execute("DROP TYPE IF EXISTS science.upload_session_status")
    op.execute("DROP TYPE IF EXISTS science.dataset_status")