"""Phase 2F - persistent XRD evidence, reasoning history, and notebook references.

Revision ID: 0017
Revises: 0016
Create Date: 2026-07-28
"""

from alembic import op


revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Migration 0005 already created science.reasoning_runs for the older
    # consent/governance audit contract. Preserve that data and free the
    # canonical name for the Phase 2F evidence-bound reasoning-run contract.
    # Renaming the primary-key constraint also renames its backing index, whose
    # schema-level name would otherwise collide with the new table's pkey.
    op.execute(
        """
        ALTER TABLE science.reasoning_runs
            RENAME TO ai_governance_reasoning_runs;
        ALTER TABLE science.ai_governance_reasoning_runs
            RENAME CONSTRAINT reasoning_runs_pkey
            TO ai_governance_reasoning_runs_pkey;
        """
    )

    op.execute(
        """
        ALTER TABLE science.datasets
            ADD COLUMN title TEXT,
            ADD COLUMN measurement_metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
            ADD COLUMN processing_parameters JSONB NOT NULL DEFAULT '{}'::JSONB,
            ADD COLUMN experiment_context JSONB NOT NULL DEFAULT '{}'::JSONB,
            ADD COLUMN evidence_status TEXT NOT NULL DEFAULT 'unavailable'
                CHECK (evidence_status IN (
                    'unavailable', 'processing', 'ready', 'superseded', 'failed'
                )),
            ADD COLUMN current_evidence_id UUID;

        UPDATE science.datasets
        SET title = display_filename
        WHERE title IS NULL;

        ALTER TABLE science.datasets
            ALTER COLUMN title SET DEFAULT 'Untitled dataset',
            ALTER COLUMN title SET NOT NULL,
            ADD CONSTRAINT datasets_title_length
                CHECK (pg_catalog.length(title) BETWEEN 1 AND 255),
            ADD CONSTRAINT datasets_measurement_metadata_object
                CHECK (jsonb_typeof(measurement_metadata) = 'object'),
            ADD CONSTRAINT datasets_processing_parameters_object
                CHECK (jsonb_typeof(processing_parameters) = 'object'),
            ADD CONSTRAINT datasets_experiment_context_object
                CHECK (jsonb_typeof(experiment_context) = 'object');

        ALTER TABLE science.upload_sessions
            ADD COLUMN original_filename TEXT,
            ADD COLUMN checksum_algorithm TEXT NOT NULL DEFAULT 'sha256'
                CHECK (checksum_algorithm = 'sha256');

        UPDATE science.upload_sessions us
        SET original_filename = d.display_filename
        FROM science.datasets d
        WHERE d.organization_id = us.organization_id
          AND d.id = us.dataset_id
          AND us.original_filename IS NULL;

        ALTER TABLE science.upload_sessions
            ALTER COLUMN original_filename SET DEFAULT 'legacy-upload',
            ALTER COLUMN original_filename SET NOT NULL,
            ADD CONSTRAINT upload_sessions_original_filename_length
                CHECK (pg_catalog.length(original_filename) BETWEEN 1 AND 500);

        ALTER TABLE science.validation_attempts
            ADD CONSTRAINT validation_attempts_dataset_id_uq
                UNIQUE (organization_id, dataset_id, id);
        """
    )

    op.execute(
        """
        CREATE TABLE science.xrd_evidence_snapshots (
            id                      UUID        NOT NULL DEFAULT uuid_generate_v4(),
            organization_id         UUID        NOT NULL REFERENCES identity.organizations(id) ON DELETE RESTRICT,
            project_id              UUID        NOT NULL,
            dataset_id              UUID        NOT NULL,
            upload_session_id       UUID        NOT NULL,
            validation_attempt_id   UUID        NOT NULL,
            version                 INTEGER     NOT NULL CHECK (version > 0),
            status                  TEXT        NOT NULL DEFAULT 'processing'
                CHECK (status IN ('processing', 'ready', 'superseded', 'failed')),
            schema_version          TEXT        NOT NULL,
            processor_version       TEXT        NOT NULL,
            content                 JSONB       NOT NULL,
            content_sha256          TEXT        NOT NULL
                CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
            validation_warnings     JSONB       NOT NULL DEFAULT '[]'::JSONB,
            scientific_limitations  JSONB       NOT NULL DEFAULT '[]'::JSONB,
            provenance              JSONB       NOT NULL,
            created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            superseded_at           TIMESTAMPTZ,
            PRIMARY KEY (organization_id, id),
            CONSTRAINT xrd_evidence_project_fk
                FOREIGN KEY (organization_id, project_id)
                REFERENCES science.projects(organization_id, id) ON DELETE RESTRICT,
            CONSTRAINT xrd_evidence_dataset_fk
                FOREIGN KEY (organization_id, dataset_id)
                REFERENCES science.datasets(organization_id, id) ON DELETE RESTRICT,
            CONSTRAINT xrd_evidence_upload_fk
                FOREIGN KEY (organization_id, dataset_id, upload_session_id)
                REFERENCES science.upload_sessions(organization_id, dataset_id, id) ON DELETE RESTRICT,
            CONSTRAINT xrd_evidence_attempt_fk
                FOREIGN KEY (organization_id, dataset_id, validation_attempt_id)
                REFERENCES science.validation_attempts(organization_id, dataset_id, id) ON DELETE RESTRICT,
            CONSTRAINT xrd_evidence_dataset_version_uq
                UNIQUE (organization_id, dataset_id, version),
            CONSTRAINT xrd_evidence_dataset_id_uq
                UNIQUE (organization_id, dataset_id, id),
            CONSTRAINT xrd_evidence_project_dataset_id_uq
                UNIQUE (organization_id, project_id, dataset_id, id),
            CONSTRAINT xrd_evidence_lineage_id_uq
                UNIQUE (
                    organization_id, project_id, dataset_id,
                    upload_session_id, id
                ),
            CONSTRAINT xrd_evidence_content_object
                CHECK (jsonb_typeof(content) = 'object'),
            CONSTRAINT xrd_evidence_warnings_array
                CHECK (jsonb_typeof(validation_warnings) = 'array'),
            CONSTRAINT xrd_evidence_limitations_array
                CHECK (jsonb_typeof(scientific_limitations) = 'array'),
            CONSTRAINT xrd_evidence_provenance_object
                CHECK (jsonb_typeof(provenance) = 'object'),
            CONSTRAINT xrd_evidence_superseded_consistency
                CHECK (
                    (status = 'superseded' AND superseded_at IS NOT NULL)
                    OR (status <> 'superseded' AND superseded_at IS NULL)
                )
        );

        CREATE UNIQUE INDEX xrd_evidence_one_active_ready_uq
            ON science.xrd_evidence_snapshots (organization_id, dataset_id)
            WHERE status = 'ready';
        CREATE INDEX xrd_evidence_project_created_idx
            ON science.xrd_evidence_snapshots
            (organization_id, project_id, created_at DESC, id DESC);

        ALTER TABLE science.datasets
            ADD CONSTRAINT datasets_current_evidence_fk
            FOREIGN KEY (organization_id, id, current_evidence_id)
            REFERENCES science.xrd_evidence_snapshots(organization_id, dataset_id, id)
            ON DELETE RESTRICT
            DEFERRABLE INITIALLY DEFERRED;
        """
    )

    op.execute(
        """
        CREATE TABLE science.reasoning_runs (
            id                      UUID        NOT NULL DEFAULT uuid_generate_v4(),
            organization_id         UUID        NOT NULL REFERENCES identity.organizations(id) ON DELETE RESTRICT,
            project_id              UUID        NOT NULL,
            dataset_id              UUID        NOT NULL,
            upload_session_id       UUID        NOT NULL,
            evidence_snapshot_id    UUID        NOT NULL,
            evidence_content_sha256 TEXT        NOT NULL
                CHECK (evidence_content_sha256 ~ '^[0-9a-f]{64}$'),
            created_by              UUID        NOT NULL,
            execution_mode          TEXT        NOT NULL
                CHECK (execution_mode IN ('deterministic', 'configured_gemini')),
            status                  TEXT        NOT NULL DEFAULT 'running'
                CHECK (status IN ('pending', 'running', 'succeeded', 'fallback', 'failed')),
            provider                TEXT        NOT NULL,
            model                   TEXT,
            prompt_version          TEXT        NOT NULL,
            policy_version          TEXT        NOT NULL,
            structured_output       JSONB,
            fallback_used           BOOLEAN     NOT NULL DEFAULT FALSE,
            quota_classification    TEXT        NOT NULL DEFAULT 'not_required'
                CHECK (quota_classification IN (
                    'not_required', 'allowed', 'rejected', 'unavailable'
                )),
            request_id              TEXT        NOT NULL,
            idempotency_key         TEXT,
            failure_code            TEXT,
            failure_message         TEXT,
            created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            completed_at            TIMESTAMPTZ,
            PRIMARY KEY (organization_id, id),
            CONSTRAINT reasoning_project_fk
                FOREIGN KEY (organization_id, project_id)
                REFERENCES science.projects(organization_id, id) ON DELETE RESTRICT,
            CONSTRAINT reasoning_dataset_fk
                FOREIGN KEY (organization_id, dataset_id)
                REFERENCES science.datasets(organization_id, id) ON DELETE RESTRICT,
            CONSTRAINT reasoning_upload_fk
                FOREIGN KEY (organization_id, dataset_id, upload_session_id)
                REFERENCES science.upload_sessions(organization_id, dataset_id, id) ON DELETE RESTRICT,
            CONSTRAINT reasoning_evidence_fk
                FOREIGN KEY (
                    organization_id, project_id, dataset_id,
                    upload_session_id, evidence_snapshot_id
                )
                REFERENCES science.xrd_evidence_snapshots(
                    organization_id, project_id, dataset_id,
                    upload_session_id, id
                ) ON DELETE RESTRICT,
            CONSTRAINT reasoning_creator_fk
                FOREIGN KEY (organization_id, created_by)
                REFERENCES identity.users(organization_id, id) ON DELETE RESTRICT,
            CONSTRAINT reasoning_output_object
                CHECK (
                    structured_output IS NULL
                    OR jsonb_typeof(structured_output) = 'object'
                ),
            CONSTRAINT reasoning_terminal_consistency
                CHECK (
                    (status IN ('succeeded', 'fallback', 'failed') AND completed_at IS NOT NULL)
                    OR (status IN ('pending', 'running') AND completed_at IS NULL)
                ),
            CONSTRAINT reasoning_success_output_consistency
                CHECK (
                    status NOT IN ('succeeded', 'fallback')
                    OR structured_output IS NOT NULL
                ),
            CONSTRAINT reasoning_failure_consistency
                CHECK (
                    status <> 'failed'
                    OR (failure_code IS NOT NULL AND failure_message IS NOT NULL)
                ),
            CONSTRAINT reasoning_idempotency_length
                CHECK (
                    idempotency_key IS NULL
                    OR pg_catalog.length(idempotency_key) BETWEEN 1 AND 255
                ),
            CONSTRAINT reasoning_project_dataset_evidence_id_uq
                UNIQUE (
                    organization_id, id, project_id, dataset_id,
                    evidence_snapshot_id
                )
        );

        CREATE UNIQUE INDEX reasoning_runs_idempotency_uq
            ON science.reasoning_runs
            (organization_id, created_by, idempotency_key)
            WHERE idempotency_key IS NOT NULL;
        CREATE INDEX reasoning_runs_history_idx
            ON science.reasoning_runs
            (organization_id, project_id, created_at DESC, id DESC);
        CREATE INDEX reasoning_runs_dataset_idx
            ON science.reasoning_runs
            (organization_id, dataset_id, created_at DESC, id DESC);
        """
    )

    op.execute(
        """
        CREATE TABLE science.notebook_reasoning_references (
            id                    UUID        NOT NULL DEFAULT uuid_generate_v4(),
            organization_id       UUID        NOT NULL REFERENCES identity.organizations(id) ON DELETE RESTRICT,
            project_id            UUID        NOT NULL,
            dataset_id            UUID        NOT NULL,
            evidence_snapshot_id  UUID        NOT NULL,
            reasoning_run_id      UUID        NOT NULL,
            created_by            UUID        NOT NULL,
            label                 TEXT        NOT NULL,
            created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (organization_id, id),
            CONSTRAINT notebook_reference_project_fk
                FOREIGN KEY (organization_id, project_id)
                REFERENCES science.projects(organization_id, id) ON DELETE RESTRICT,
            CONSTRAINT notebook_reference_dataset_fk
                FOREIGN KEY (organization_id, dataset_id)
                REFERENCES science.datasets(organization_id, id) ON DELETE RESTRICT,
            CONSTRAINT notebook_reference_evidence_fk
                FOREIGN KEY (organization_id, dataset_id, evidence_snapshot_id)
                REFERENCES science.xrd_evidence_snapshots(organization_id, dataset_id, id) ON DELETE RESTRICT,
            CONSTRAINT notebook_reference_reasoning_fk
                FOREIGN KEY (
                    organization_id, reasoning_run_id, project_id, dataset_id,
                    evidence_snapshot_id
                )
                REFERENCES science.reasoning_runs(
                    organization_id, id, project_id, dataset_id,
                    evidence_snapshot_id
                ) ON DELETE RESTRICT,
            CONSTRAINT notebook_reference_creator_fk
                FOREIGN KEY (organization_id, created_by)
                REFERENCES identity.users(organization_id, id) ON DELETE RESTRICT,
            CONSTRAINT notebook_reference_run_user_uq
                UNIQUE (organization_id, reasoning_run_id, created_by),
            CONSTRAINT notebook_reference_label_length
                CHECK (pg_catalog.length(label) BETWEEN 1 AND 255)
        );

        CREATE INDEX notebook_references_project_idx
            ON science.notebook_reasoning_references
            (organization_id, project_id, created_at DESC, id DESC);
        """
    )

    for table in (
        "xrd_evidence_snapshots",
        "reasoning_runs",
        "notebook_reasoning_references",
    ):
        op.execute(f"ALTER TABLE science.{table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE science.{table} FORCE ROW LEVEL SECURITY")

    for table in (
        "xrd_evidence_snapshots",
        "reasoning_runs",
        "notebook_reasoning_references",
    ):
        op.execute(
            f"""
            CREATE POLICY {table}_app_access
            ON science.{table}
            FOR ALL
            TO difaryx_app
            USING (
                organization_id = identity.current_organization_id()
                AND EXISTS (
                    SELECT 1
                    FROM science.projects p
                    WHERE p.organization_id = {table}.organization_id
                      AND p.id = {table}.project_id
                )
            )
            WITH CHECK (
                organization_id = identity.current_organization_id()
                AND EXISTS (
                    SELECT 1
                    FROM science.projects p
                    WHERE p.organization_id = {table}.organization_id
                      AND p.id = {table}.project_id
                )
            )
            """
        )

    op.execute(
        """
        CREATE POLICY xrd_evidence_worker_access
        ON science.xrd_evidence_snapshots
        FOR ALL
        TO difaryx_validation_worker
        USING (organization_id = identity.current_organization_id())
        WITH CHECK (organization_id = identity.current_organization_id());
        """
    )

    op.execute(
        """
        CREATE FUNCTION science.guard_xrd_evidence_immutability()
        RETURNS TRIGGER
        LANGUAGE plpgsql
        SET search_path = pg_catalog, science
        AS $$
        BEGIN
            IF OLD.status = 'ready'
               AND NEW.status = 'superseded'
               AND NEW.superseded_at IS NOT NULL
               AND (to_jsonb(NEW) - 'status' - 'superseded_at')
                   = (to_jsonb(OLD) - 'status' - 'superseded_at') THEN
                RETURN NEW;
            END IF;
            RAISE EXCEPTION 'XRD evidence snapshots are immutable'
                USING ERRCODE = '55000';
        END;
        $$;

        CREATE TRIGGER xrd_evidence_immutable
            BEFORE UPDATE OR DELETE ON science.xrd_evidence_snapshots
            FOR EACH ROW EXECUTE FUNCTION science.guard_xrd_evidence_immutability();
        """
    )

    op.execute(
        """
        CREATE FUNCTION science.sync_xrd_evidence_status()
        RETURNS TRIGGER
        LANGUAGE plpgsql
        SET search_path = pg_catalog, science
        AS $$
        BEGIN
            IF NEW.technique <> 'xrd'::science.technique_code THEN
                RETURN NEW;
            END IF;
            IF NEW.dataset_status IN (
                'pending_validation'::science.dataset_status,
                'validating'::science.dataset_status
            ) THEN
                NEW.evidence_status := 'processing';
            ELSIF NEW.dataset_status IN (
                'invalid'::science.dataset_status,
                'quarantined'::science.dataset_status,
                'failed'::science.dataset_status
            ) THEN
                NEW.evidence_status := 'failed';
            ELSIF NEW.dataset_status = 'valid'::science.dataset_status THEN
                IF NEW.current_evidence_id IS NULL THEN
                    RAISE EXCEPTION 'valid XRD dataset requires canonical evidence'
                        USING ERRCODE = '23514';
                END IF;
                NEW.evidence_status := 'ready';
            END IF;
            RETURN NEW;
        END;
        $$;

        CREATE TRIGGER datasets_xrd_evidence_status
            BEFORE UPDATE OF dataset_status, current_evidence_id
            ON science.datasets
            FOR EACH ROW EXECUTE FUNCTION science.sync_xrd_evidence_status();
        """
    )

    op.execute(
        """
        GRANT SELECT, INSERT ON science.xrd_evidence_snapshots TO difaryx_validation_worker;
        GRANT UPDATE (status, superseded_at)
            ON science.xrd_evidence_snapshots TO difaryx_validation_worker;
        GRANT SELECT ON science.xrd_evidence_snapshots TO difaryx_app;

        GRANT SELECT, INSERT ON science.reasoning_runs TO difaryx_app;
        GRANT UPDATE (
            status, structured_output, fallback_used, quota_classification,
            failure_code, failure_message, completed_at
        ) ON science.reasoning_runs TO difaryx_app;

        GRANT SELECT, INSERT ON science.notebook_reasoning_references TO difaryx_app;

        GRANT UPDATE (
            title, display_filename, declared_content_type, byte_size,
            client_checksum_sha256, measurement_metadata,
            processing_parameters, experiment_context, updated_at
        ) ON science.datasets TO difaryx_app;
        GRANT UPDATE (evidence_status, current_evidence_id, updated_at)
            ON science.datasets TO difaryx_validation_worker;
        GRANT UPDATE (original_filename)
            ON science.upload_sessions TO difaryx_app;
        """
    )


def downgrade() -> None:
    # Phase 2F is forward-only. Existing persisted evidence and provenance must
    # never be deleted automatically by a downgrade.
    raise RuntimeError("Migration 0017 is forward-only")
