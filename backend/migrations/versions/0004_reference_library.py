"""Phase 0 - reference library (REVISED): scope CHECK constraints, composite FKs, fusion tables

Revision ID: 0004
Revises: 0003
Create Date: 2026-07-11 (v2 - redesigns reference_library_scopes with explicit scope columns
                          and CHECK constraints enforcing valid combinations)
"""
from alembic import op

revision = '0004'
down_revision = '0003'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── reference_libraries ──────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE science.reference_libraries (
            id              UUID        NOT NULL DEFAULT uuid_generate_v4(),
            organization_id UUID        NOT NULL REFERENCES identity.organizations(id) ON DELETE RESTRICT,
            name            TEXT        NOT NULL,
            technique       science.technique_code NOT NULL,
            version         TEXT        NOT NULL DEFAULT '1.0.0',
            is_public       BOOLEAN     NOT NULL DEFAULT FALSE,
            created_by      UUID        NOT NULL,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (organization_id, id),
            CONSTRAINT ref_libraries_name_version_uq UNIQUE (organization_id, name, version),
            CONSTRAINT ref_libraries_creator_fk FOREIGN KEY (organization_id, created_by)
                REFERENCES identity.users(organization_id, id) ON DELETE RESTRICT
        )
    """)

    # ── reference_snapshots ──────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE science.reference_snapshots (
            id              UUID        NOT NULL DEFAULT uuid_generate_v4(),
            organization_id UUID        NOT NULL REFERENCES identity.organizations(id) ON DELETE RESTRICT,
            library_id      UUID        NOT NULL,
            snapshot_hash   TEXT        NOT NULL,
            entry_count     INTEGER     NOT NULL DEFAULT 0,
            is_approved     BOOLEAN     NOT NULL DEFAULT FALSE,
            approved_by     UUID,
            approved_at     TIMESTAMPTZ,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (organization_id, id),
            CONSTRAINT ref_snapshots_library_fk FOREIGN KEY (organization_id, library_id)
                REFERENCES science.reference_libraries(organization_id, id) ON DELETE RESTRICT,
            CONSTRAINT ref_snapshots_approver_fk FOREIGN KEY (organization_id, approved_by)
                REFERENCES identity.users(organization_id, id) ON DELETE SET NULL,
            CONSTRAINT ref_snapshots_hash_uq UNIQUE (organization_id, library_id, snapshot_hash)
        )
    """)

    # ── reference_entries ────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE science.reference_entries (
            id              UUID        NOT NULL DEFAULT uuid_generate_v4(),
            organization_id UUID        NOT NULL REFERENCES identity.organizations(id) ON DELETE RESTRICT,
            library_id      UUID        NOT NULL,
            identifier      TEXT        NOT NULL,
            entry_data      JSONB       NOT NULL DEFAULT '{}',
            content_hash    TEXT        NOT NULL,
            is_approved     BOOLEAN     NOT NULL DEFAULT FALSE,
            import_state    TEXT        NOT NULL DEFAULT 'pending'
                CHECK (import_state IN (
                    'pending','importing','approved','rejected',
                    'requires_peak_extraction','requires_converter',
                    'unsupported_format','corrupted_file','parse_error'
                )),
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (organization_id, id),
            CONSTRAINT ref_entries_library_fk FOREIGN KEY (organization_id, library_id)
                REFERENCES science.reference_libraries(organization_id, id) ON DELETE RESTRICT,
            CONSTRAINT ref_entries_identifier_uq UNIQUE (organization_id, library_id, identifier)
        )
    """)

    # ── organization_reference_library_grants ────────────────────────────────
    op.execute("""
        CREATE TABLE science.organization_reference_library_grants (
            id                  UUID        NOT NULL DEFAULT uuid_generate_v4(),
            granting_org_id     UUID        NOT NULL REFERENCES identity.organizations(id) ON DELETE RESTRICT,
            receiving_org_id    UUID        NOT NULL REFERENCES identity.organizations(id) ON DELETE RESTRICT,
            library_id          UUID        NOT NULL,
            granted_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            granted_by          UUID        NOT NULL,
            PRIMARY KEY (id),
            CONSTRAINT lib_grants_library_fk FOREIGN KEY (granting_org_id, library_id)
                REFERENCES science.reference_libraries(organization_id, id) ON DELETE RESTRICT,
            CONSTRAINT lib_grants_uq UNIQUE (granting_org_id, receiving_org_id, library_id)
        )
    """)

    # ── reference_library_scopes ─────────────────────────────────────────────
    # Explicit columns + CHECK constraints enforce valid scope combinations:
    #
    #   global:               scope_org_id NULL, scope_project_id NULL, scope_user_id NULL
    #   organization_private: scope_org_id NOT NULL, scope_project_id NULL
    #   project_private:      scope_org_id NOT NULL, scope_project_id NOT NULL
    #   private_user:         scope_org_id NOT NULL, scope_user_id NOT NULL
    op.execute("""
        CREATE TABLE science.reference_library_scopes (
            id               UUID    NOT NULL DEFAULT uuid_generate_v4(),
            organization_id  UUID    NOT NULL REFERENCES identity.organizations(id) ON DELETE RESTRICT,
            library_id       UUID    NOT NULL,
            scope_type       TEXT    NOT NULL
                CHECK (scope_type IN ('global','organization_private','project_private','private_user')),
            scope_org_id     UUID,
            scope_project_id UUID,
            scope_user_id    UUID,
            created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (organization_id, id),
            CONSTRAINT ref_scopes_library_fk FOREIGN KEY (organization_id, library_id)
                REFERENCES science.reference_libraries(organization_id, id) ON DELETE RESTRICT,

            -- global: all scope columns must be null
            CONSTRAINT scope_global_nulls CHECK (
                scope_type != 'global'
                OR (scope_org_id IS NULL AND scope_project_id IS NULL AND scope_user_id IS NULL)
            ),
            -- non-global: scope_org_id required
            CONSTRAINT scope_org_required CHECK (
                scope_type = 'global' OR scope_org_id IS NOT NULL
            ),
            -- project_private: scope_project_id required
            CONSTRAINT scope_project_required CHECK (
                scope_type != 'project_private' OR scope_project_id IS NOT NULL
            ),
            -- organization_private: scope_project_id must be null
            CONSTRAINT scope_org_no_project CHECK (
                scope_type != 'organization_private' OR scope_project_id IS NULL
            ),
            -- private_user: scope_user_id required
            CONSTRAINT scope_user_required CHECK (
                scope_type != 'private_user' OR scope_user_id IS NOT NULL
            ),
            -- scope_org_id must match the library's owning org (same-org constraint)
            CONSTRAINT scope_org_matches_library CHECK (
                scope_type = 'global' OR scope_org_id = organization_id
            ),
            CONSTRAINT ref_scopes_uq UNIQUE (organization_id, library_id, scope_type, scope_org_id, scope_project_id, scope_user_id)
        )
    """)

    # ── analysis_run_reference_snapshots ─────────────────────────────────────
    # Composite FK to reference_snapshots (which has composite PK).
    op.execute("""
        CREATE TABLE science.analysis_run_reference_snapshots (
            id              UUID        NOT NULL DEFAULT uuid_generate_v4(),
            organization_id UUID        NOT NULL REFERENCES identity.organizations(id) ON DELETE RESTRICT,
            run_id          UUID        NOT NULL,
            snapshot_org_id UUID        NOT NULL,
            snapshot_id     UUID        NOT NULL,
            attached_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (organization_id, id),
            CONSTRAINT run_snapshots_run_fk FOREIGN KEY (organization_id, run_id)
                REFERENCES science.analysis_runs(organization_id, id) ON DELETE RESTRICT,
            CONSTRAINT run_snapshots_snapshot_fk FOREIGN KEY (snapshot_org_id, snapshot_id)
                REFERENCES science.reference_snapshots(organization_id, id) ON DELETE RESTRICT,
            CONSTRAINT run_snapshots_uq UNIQUE (organization_id, run_id, snapshot_id)
        )
    """)

    # ── fusion_runs ──────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE science.fusion_runs (
            id              UUID        NOT NULL DEFAULT uuid_generate_v4(),
            organization_id UUID        NOT NULL REFERENCES identity.organizations(id) ON DELETE RESTRICT,
            project_id      UUID        NOT NULL,
            submitted_by    UUID        NOT NULL,
            run_status      science.run_status NOT NULL DEFAULT 'pending',
            fusion_metadata JSONB       NOT NULL DEFAULT '{}',
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            completed_at    TIMESTAMPTZ,
            PRIMARY KEY (organization_id, id),
            CONSTRAINT fusion_runs_project_fk FOREIGN KEY (organization_id, project_id)
                REFERENCES science.projects(organization_id, id) ON DELETE RESTRICT,
            CONSTRAINT fusion_runs_submitter_fk FOREIGN KEY (organization_id, submitted_by)
                REFERENCES identity.users(organization_id, id) ON DELETE RESTRICT
        )
    """)

    # ── fusion_run_evidence ───────────────────────────────────────────────────
    # References evidence_versions via 3-column composite FK to enforce
    # version-belongs-to-node consistency (Issue #6).
    op.execute("""
        CREATE TABLE science.fusion_run_evidence (
            id                      UUID        NOT NULL DEFAULT uuid_generate_v4(),
            organization_id         UUID        NOT NULL REFERENCES identity.organizations(id) ON DELETE RESTRICT,
            fusion_run_id           UUID        NOT NULL,
            evidence_node_id        UUID        NOT NULL,
            evidence_version_id     UUID        NOT NULL,
            inclusion_reason        TEXT,
            PRIMARY KEY (organization_id, id),
            CONSTRAINT fusion_evidence_run_fk FOREIGN KEY (organization_id, fusion_run_id)
                REFERENCES science.fusion_runs(organization_id, id) ON DELETE RESTRICT,
            -- Composite FK proves version belongs to this evidence node (Issue #6)
            CONSTRAINT fusion_evidence_version_fk FOREIGN KEY (organization_id, evidence_node_id, evidence_version_id)
                REFERENCES science.evidence_versions(organization_id, evidence_node_id, id)
                ON DELETE RESTRICT,
            CONSTRAINT fusion_evidence_uq UNIQUE (organization_id, fusion_run_id, evidence_node_id)
        )
    """)

    # ── RLS ──────────────────────────────────────────────────────────────────
    ref_tables = [
        'reference_libraries', 'reference_snapshots', 'reference_entries',
        'reference_library_scopes', 'analysis_run_reference_snapshots',
        'fusion_runs', 'fusion_run_evidence',
    ]
    for tbl in ref_tables:
        op.execute(f'ALTER TABLE science.{tbl} ENABLE ROW LEVEL SECURITY')
        op.execute(f'ALTER TABLE science.{tbl} FORCE ROW LEVEL SECURITY')
        op.execute(f"""
            CREATE POLICY {tbl}_tenant_isolation ON science.{tbl}
                USING (organization_id = identity.current_organization_id())
        """)

    op.execute('ALTER TABLE science.organization_reference_library_grants ENABLE ROW LEVEL SECURITY')
    op.execute('ALTER TABLE science.organization_reference_library_grants FORCE ROW LEVEL SECURITY')
    op.execute("""
        CREATE POLICY lib_grants_isolation ON science.organization_reference_library_grants
            USING (
                granting_org_id = identity.current_organization_id()
                OR receiving_org_id = identity.current_organization_id()
            )
    """)

    # ── Indexes ──────────────────────────────────────────────────────────────
    op.execute('CREATE INDEX ON science.reference_entries (organization_id, library_id, is_approved)')
    op.execute('CREATE INDEX ON science.reference_snapshots (organization_id, library_id, is_approved)')
    op.execute('CREATE INDEX ON science.fusion_run_evidence (organization_id, fusion_run_id)')


def downgrade() -> None:
    for tbl in ('fusion_run_evidence', 'fusion_runs', 'analysis_run_reference_snapshots',
                'reference_library_scopes', 'organization_reference_library_grants',
                'reference_entries', 'reference_snapshots', 'reference_libraries'):
        op.execute(f'DROP TABLE IF EXISTS science.{tbl} CASCADE')
