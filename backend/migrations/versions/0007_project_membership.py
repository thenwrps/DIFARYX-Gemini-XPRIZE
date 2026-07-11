"""Phase 0 - project membership: project_memberships table, current_user_id helper, and membership-aware RLS

Revision ID: 0007
Revises: 0006
Create Date: 2026-07-11
"""
from alembic import op

revision = '0007'
down_revision = '0006'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── 1. Create RLS current_user_id helper ────────────────────────────────
    op.execute("""
        CREATE OR REPLACE FUNCTION identity.current_user_id()
        RETURNS UUID
        LANGUAGE sql STABLE
        AS $$
            SELECT NULLIF(current_setting('app.user_id', TRUE), '')::UUID
        $$
    """)

    # ── 2. Create project_memberships table ──────────────────────────────────
    op.execute("""
        CREATE TABLE science.project_memberships (
            organization_id UUID NOT NULL REFERENCES identity.organizations(id) ON DELETE RESTRICT,
            project_id      UUID NOT NULL,
            user_id         UUID NOT NULL,
            role            TEXT NOT NULL CHECK (role IN ('lead', 'member', 'reviewer')),
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (organization_id, project_id, user_id),
            CONSTRAINT pm_project_fk FOREIGN KEY (organization_id, project_id)
                REFERENCES science.projects(organization_id, id) ON DELETE CASCADE,
            CONSTRAINT pm_user_fk FOREIGN KEY (organization_id, user_id)
                REFERENCES identity.users(organization_id, id) ON DELETE RESTRICT
        )
    """)

    # Enable RLS on project_memberships
    op.execute('ALTER TABLE science.project_memberships ENABLE ROW LEVEL SECURITY')
    op.execute('ALTER TABLE science.project_memberships FORCE ROW LEVEL SECURITY')
    op.execute("""
        CREATE POLICY project_memberships_tenant_isolation ON science.project_memberships
            USING (organization_id = identity.current_organization_id())
    """)

    # ── 3. Redesign projects RLS Policy to be membership-aware ───────────────
    # Drop old tenant isolation policy
    op.execute('DROP POLICY IF EXISTS projects_tenant_isolation ON science.projects')

    # Create new advanced policy
    # 1. Organization owners/admins can read/write everything in the org.
    # 2. Project owners can read/write.
    # 3. Project leads/members can read/write.
    # 4. Project reviewers can only read.
    op.execute("""
        CREATE POLICY projects_membership_aware ON science.projects
            USING (
                organization_id = identity.current_organization_id()
                AND (
                    -- Org owner or admin
                    EXISTS (
                        SELECT 1 FROM identity.memberships m
                        WHERE m.organization_id = projects.organization_id
                          AND m.user_id = identity.current_user_id()
                          AND m.role IN ('owner', 'admin')
                    )
                    -- Or project owner
                    OR owner_user_id = identity.current_user_id()
                    -- Or project member
                    OR EXISTS (
                        SELECT 1 FROM science.project_memberships pm
                        WHERE pm.organization_id = projects.organization_id
                          AND pm.project_id = projects.id
                          AND pm.user_id = identity.current_user_id()
                    )
                )
            )
            WITH CHECK (
                organization_id = identity.current_organization_id()
                AND (
                    -- Org owner or admin
                    EXISTS (
                        SELECT 1 FROM identity.memberships m
                        WHERE m.organization_id = projects.organization_id
                          AND m.user_id = identity.current_user_id()
                          AND m.role IN ('owner', 'admin')
                    )
                    -- Or project owner
                    OR owner_user_id = identity.current_user_id()
                    -- Or project member with write access (lead or member)
                    OR EXISTS (
                        SELECT 1 FROM science.project_memberships pm
                        WHERE pm.organization_id = projects.organization_id
                          AND pm.project_id = projects.id
                          AND pm.user_id = identity.current_user_id()
                          AND pm.role IN ('lead', 'member')
                    )
                )
            )
    """)

    # ── 4. Apply downstream run visibility checks based on projects ──────────
    # Drop old runs tenant policy and create project-aware policy
    op.execute('DROP POLICY IF EXISTS analysis_runs_tenant_isolation ON science.analysis_runs')
    op.execute("""
        CREATE POLICY analysis_runs_project_aware ON science.analysis_runs
            USING (
                organization_id = identity.current_organization_id()
                AND EXISTS (
                    SELECT 1 FROM science.projects p
                    WHERE p.organization_id = analysis_runs.organization_id
                      AND p.id = analysis_runs.project_id
                )
            )
    """)


def downgrade() -> None:
    op.execute('DROP POLICY IF EXISTS analysis_runs_project_aware ON science.analysis_runs')
    op.execute("""
        CREATE POLICY analysis_runs_tenant_isolation ON science.analysis_runs
            USING (organization_id = identity.current_organization_id())
    """)
    op.execute('DROP POLICY IF EXISTS projects_membership_aware ON science.projects')
    op.execute("""
        CREATE POLICY projects_tenant_isolation ON science.projects
            USING (organization_id = identity.current_organization_id())
    """)
    op.execute('DROP TABLE IF EXISTS science.project_memberships CASCADE')
    op.execute('DROP FUNCTION IF EXISTS identity.current_user_id() CASCADE')
