"""Phase 0 - science core (REVISED): projects, runs, stages, artifacts, fingerprints, stage-result links

Revision ID: 0003
Revises: 0002
Create Date: 2026-07-11 (v2 - adds analysis_stages, redesigns stage_results as link table,
                          adds last_event_seq for SSE, adds reuse_state tracking)
"""
from alembic import op

revision = '0003'
down_revision = '0002'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── projects ─────────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE science.projects (
            id              UUID        NOT NULL DEFAULT uuid_generate_v4(),
            organization_id UUID        NOT NULL REFERENCES identity.organizations(id) ON DELETE RESTRICT,
            owner_user_id   UUID        NOT NULL,
            title           TEXT        NOT NULL,
            description     TEXT,
            is_archived     BOOLEAN     NOT NULL DEFAULT FALSE,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (organization_id, id),
            CONSTRAINT projects_owner_fk FOREIGN KEY (organization_id, owner_user_id)
                REFERENCES identity.users(organization_id, id) ON DELETE RESTRICT
        )
    """)

    # ── analysis_runs ────────────────────────────────────────────────────────
    # last_event_seq: atomically incremented for SSE sequence allocation
    op.execute("""
        CREATE TABLE science.analysis_runs (
            id                  UUID        NOT NULL DEFAULT uuid_generate_v4(),
            organization_id     UUID        NOT NULL REFERENCES identity.organizations(id) ON DELETE RESTRICT,
            project_id          UUID        NOT NULL,
            technique           science.technique_code NOT NULL,
            run_status          science.run_status NOT NULL DEFAULT 'pending',
            worker_version      TEXT,
            container_image_digest TEXT,
            submitted_by        UUID        NOT NULL,
            ai_consent_scope    science.ai_consent_scope NOT NULL DEFAULT 'none',
            input_parameters    JSONB       NOT NULL DEFAULT '{}',
            run_metadata        JSONB       NOT NULL DEFAULT '{}',
            error_detail        TEXT,
            last_event_seq      INTEGER     NOT NULL DEFAULT 0,
            started_at          TIMESTAMPTZ,
            completed_at        TIMESTAMPTZ,
            created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (organization_id, id),
            CONSTRAINT analysis_runs_project_fk FOREIGN KEY (organization_id, project_id)
                REFERENCES science.projects(organization_id, id) ON DELETE RESTRICT,
            CONSTRAINT analysis_runs_submitter_fk FOREIGN KEY (organization_id, submitted_by)
                REFERENCES identity.users(organization_id, id) ON DELETE RESTRICT
        )
    """)

    # ── analysis_stages ──────────────────────────────────────────────────────
    # One row per stage execution within a run.
    # A "stage" is a named, versioned processing step.
    op.execute("""
        CREATE TABLE science.analysis_stages (
            id                      UUID        NOT NULL DEFAULT uuid_generate_v4(),
            organization_id         UUID        NOT NULL REFERENCES identity.organizations(id) ON DELETE RESTRICT,
            run_id                  UUID        NOT NULL,
            stage_key               TEXT        NOT NULL,
            stage_status            science.run_status NOT NULL DEFAULT 'pending',
            stage_implementation_version TEXT    NOT NULL,
            worker_version          TEXT,
            error_detail            TEXT,
            started_at              TIMESTAMPTZ,
            completed_at            TIMESTAMPTZ,
            created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (organization_id, id),
            CONSTRAINT stages_run_fk FOREIGN KEY (organization_id, run_id)
                REFERENCES science.analysis_runs(organization_id, id) ON DELETE RESTRICT,
            CONSTRAINT stages_run_key_uq UNIQUE (organization_id, run_id, stage_key)
        )
    """)

    # ── analysis_artifacts ───────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE science.analysis_artifacts (
            id                  UUID        NOT NULL DEFAULT uuid_generate_v4(),
            organization_id     UUID        NOT NULL REFERENCES identity.organizations(id) ON DELETE RESTRICT,
            run_id              UUID        NOT NULL,
            producing_stage_id  UUID,
            artifact_kind       science.artifact_kind NOT NULL,
            object_key          TEXT        NOT NULL,
            content_hash_sha256 TEXT        NOT NULL,
            size_bytes          BIGINT      NOT NULL,
            content_type        TEXT        NOT NULL DEFAULT 'application/octet-stream',
            artifact_metadata   JSONB       NOT NULL DEFAULT '{}',
            created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (organization_id, id),
            CONSTRAINT artifacts_run_fk FOREIGN KEY (organization_id, run_id)
                REFERENCES science.analysis_runs(organization_id, id) ON DELETE RESTRICT,
            CONSTRAINT artifacts_stage_fk FOREIGN KEY (organization_id, producing_stage_id)
                REFERENCES science.analysis_stages(organization_id, id) ON DELETE RESTRICT,
            CONSTRAINT artifacts_object_key_uq UNIQUE (organization_id, object_key)
        )
    """)

    # ── analysis_stage_fingerprints ──────────────────────────────────────────
    # Fingerprint uniquely identifies a reproducible stage execution.
    # stage_key + stage_implementation_version are part of fingerprint identity.
    op.execute("""
        CREATE TABLE science.analysis_stage_fingerprints (
            id                              UUID        NOT NULL DEFAULT uuid_generate_v4(),
            organization_id                 UUID        NOT NULL REFERENCES identity.organizations(id) ON DELETE RESTRICT,
            stage_id                        UUID        NOT NULL,
            stage_key                       TEXT        NOT NULL,
            stage_implementation_version    TEXT        NOT NULL,
            runner_version                  TEXT        NOT NULL,
            pipeline_definition_version     TEXT,
            parameter_schema_version        TEXT,
            execution_fingerprint           TEXT        NOT NULL,
            normalized_parameter_hash       TEXT        NOT NULL,
            input_artifact_hashes           JSONB       NOT NULL DEFAULT '[]',
            reference_snapshot_hashes       JSONB       NOT NULL DEFAULT '[]',
            calibration_context_hash        TEXT,
            reused_from_artifact_org_id     UUID,
            reused_from_artifact_id         UUID,
            created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (organization_id, id),
            CONSTRAINT fp_stage_fk FOREIGN KEY (organization_id, stage_id)
                REFERENCES science.analysis_stages(organization_id, id) ON DELETE RESTRICT,
            CONSTRAINT fp_reused_artifact_fk FOREIGN KEY (reused_from_artifact_org_id, reused_from_artifact_id)
                REFERENCES science.analysis_artifacts(organization_id, id) ON DELETE SET NULL,
            CONSTRAINT fp_stage_uq UNIQUE (organization_id, stage_id)
        )
    """)

    # ── analysis_stage_results ───────────────────────────────────────────────
    # Link table: which artifacts were produced (or reused) by this stage execution.
    # Does NOT modify the original artifact's producing_stage_id on reuse.
    op.execute("""
        CREATE TABLE science.analysis_stage_results (
            organization_id UUID        NOT NULL,
            stage_id        UUID        NOT NULL,
            artifact_id     UUID        NOT NULL,
            result_role     VARCHAR(50) NOT NULL
                CHECK (result_role IN ('primary', 'intermediate', 'diagnostic', 'cache', 'reference')),
            output_order    INTEGER     NOT NULL DEFAULT 0,
            reuse_state     VARCHAR(20) NOT NULL DEFAULT 'calculated'
                CHECK (reuse_state IN ('calculated', 'reused', 'partial_reuse')),
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (organization_id, stage_id, artifact_id),
            FOREIGN KEY (organization_id, stage_id)
                REFERENCES science.analysis_stages(organization_id, id)
                ON DELETE RESTRICT,
            FOREIGN KEY (organization_id, artifact_id)
                REFERENCES science.analysis_artifacts(organization_id, id)
                ON DELETE RESTRICT
        )
    """)

    # ── evidence_items ───────────────────────────────────────────────────────
    # Node-level evidence record (immutable identity; versions stored separately)
    op.execute("""
        CREATE TABLE science.evidence_items (
            id                  UUID        NOT NULL DEFAULT uuid_generate_v4(),
            organization_id     UUID        NOT NULL REFERENCES identity.organizations(id) ON DELETE RESTRICT,
            project_id          UUID        NOT NULL,
            run_id              UUID        NOT NULL,
            technique           science.technique_code NOT NULL,
            current_version_id  UUID,
            created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (organization_id, id),
            CONSTRAINT evidence_project_fk FOREIGN KEY (organization_id, project_id)
                REFERENCES science.projects(organization_id, id) ON DELETE RESTRICT,
            CONSTRAINT evidence_run_fk FOREIGN KEY (organization_id, run_id)
                REFERENCES science.analysis_runs(organization_id, id) ON DELETE RESTRICT
        )
    """)

    # ── evidence_versions ────────────────────────────────────────────────────
    # Immutable versioned content of an evidence item.
    # State transitions: draft → approved/rejected/withdrawn
    #                    approved → superseded/withdrawn
    #                    superseded/rejected/withdrawn → terminal (no further change)
    op.execute("""
        CREATE TABLE science.evidence_versions (
            id                  UUID        NOT NULL DEFAULT uuid_generate_v4(),
            organization_id     UUID        NOT NULL REFERENCES identity.organizations(id) ON DELETE RESTRICT,
            evidence_node_id    UUID        NOT NULL,
            version_number      INTEGER     NOT NULL DEFAULT 1,
            content_hash        TEXT        NOT NULL,
            evidence_state      science.evidence_state NOT NULL DEFAULT 'draft',
            state_changed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            state_changed_by    UUID,
            claim_summary       TEXT,
            artifact_id         UUID,
            is_content_locked   BOOLEAN     NOT NULL DEFAULT FALSE,
            created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (organization_id, id),
            -- Supports composite FK from fusion_run_evidence
            CONSTRAINT ev_versions_node_id_uq UNIQUE (organization_id, evidence_node_id, id),
            CONSTRAINT ev_versions_node_fk FOREIGN KEY (organization_id, evidence_node_id)
                REFERENCES science.evidence_items(organization_id, id) ON DELETE RESTRICT,
            CONSTRAINT ev_versions_changer_fk FOREIGN KEY (organization_id, state_changed_by)
                REFERENCES identity.users(organization_id, id) ON DELETE SET NULL,
            CONSTRAINT ev_versions_artifact_fk FOREIGN KEY (organization_id, artifact_id)
                REFERENCES science.analysis_artifacts(organization_id, id) ON DELETE RESTRICT,
            -- Only one approved version per evidence node at a time
            CONSTRAINT ev_one_approved_uq UNIQUE (organization_id, evidence_node_id, evidence_state)
                DEFERRABLE INITIALLY DEFERRED
        )
    """)

    # Back-fill the deferred FK from evidence_items → evidence_versions
    op.execute("""
        ALTER TABLE science.evidence_items
            ADD CONSTRAINT evidence_current_version_fk
                FOREIGN KEY (organization_id, current_version_id)
                REFERENCES science.evidence_versions(organization_id, id)
                ON DELETE SET NULL
                DEFERRABLE INITIALLY DEFERRED
    """)

    # ── analysis_run_events (SSE) ────────────────────────────────────────────
    # Sequence-allocated SSE events per run. Sequence is atomically assigned
    # via the emit_run_event() function defined in migration 0008.
    op.execute("""
        CREATE TABLE science.analysis_run_events (
            id              UUID        NOT NULL DEFAULT uuid_generate_v4(),
            organization_id UUID        NOT NULL REFERENCES identity.organizations(id) ON DELETE RESTRICT,
            run_id          UUID        NOT NULL,
            event_seq       INTEGER     NOT NULL,
            event_type      TEXT        NOT NULL,
            payload         JSONB       NOT NULL DEFAULT '{}',
            is_terminal     BOOLEAN     NOT NULL DEFAULT FALSE,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (organization_id, id),
            CONSTRAINT run_events_run_fk FOREIGN KEY (organization_id, run_id)
                REFERENCES science.analysis_runs(organization_id, id) ON DELETE RESTRICT,
            CONSTRAINT run_events_seq_uq UNIQUE (organization_id, run_id, event_seq)
        )
    """)

    # ── RLS ──────────────────────────────────────────────────────────────────
    science_tables = [
        'projects', 'analysis_runs', 'analysis_stages', 'analysis_artifacts',
        'analysis_stage_fingerprints', 'analysis_stage_results',
        'evidence_items', 'evidence_versions', 'analysis_run_events',
    ]
    for tbl in science_tables:
        op.execute(f'ALTER TABLE science.{tbl} ENABLE ROW LEVEL SECURITY')
        op.execute(f'ALTER TABLE science.{tbl} FORCE ROW LEVEL SECURITY')
        op.execute(f"""
            CREATE POLICY {tbl}_tenant_isolation ON science.{tbl}
                USING (organization_id = identity.current_organization_id())
        """)

    # ── Indexes ──────────────────────────────────────────────────────────────
    op.execute('CREATE INDEX ON science.analysis_runs (organization_id, project_id)')
    op.execute('CREATE INDEX ON science.analysis_runs (organization_id, run_status)')
    op.execute('CREATE INDEX ON science.analysis_stages (organization_id, run_id)')
    op.execute('CREATE INDEX ON science.analysis_artifacts (organization_id, run_id)')
    op.execute('CREATE INDEX ON science.analysis_artifacts (content_hash_sha256)')
    op.execute('CREATE INDEX ON science.analysis_stage_fingerprints (execution_fingerprint)')
    op.execute('CREATE INDEX ON science.evidence_versions (organization_id, evidence_node_id, evidence_state)')
    op.execute('CREATE INDEX ON science.analysis_run_events (organization_id, run_id, event_seq)')


def downgrade() -> None:
    for tbl in ('analysis_run_events', 'evidence_versions', 'evidence_items',
                'analysis_stage_results', 'analysis_stage_fingerprints',
                'analysis_stages', 'analysis_artifacts', 'analysis_runs', 'projects'):
        op.execute(f'DROP TABLE IF EXISTS science.{tbl} CASCADE')
