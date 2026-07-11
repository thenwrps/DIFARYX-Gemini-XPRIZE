"""Phase 0 - downstream RLS: membership-aware child table access controls

Revision ID: 0008
Revises: 0007
Create Date: 2026-07-11
"""
from alembic import op

revision = '0008'
down_revision = '0007'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── 1. Enable RLS and recreate policies for downstream tables ───────────
    
    # ── analysis_stages ──
    op.execute("DROP POLICY IF EXISTS analysis_stages_tenant_isolation ON science.analysis_stages")
    op.execute("""
        CREATE POLICY analysis_stages_membership_aware ON science.analysis_stages
            USING (
                organization_id = identity.current_organization_id()
                AND EXISTS (
                    SELECT 1 FROM science.analysis_runs r
                    JOIN science.projects p ON p.organization_id = r.organization_id AND p.id = r.project_id
                    WHERE r.organization_id = analysis_stages.organization_id AND r.id = analysis_stages.run_id
                )
            )
    """)

    # ── analysis_artifacts ──
    op.execute("DROP POLICY IF EXISTS analysis_artifacts_tenant_isolation ON science.analysis_artifacts")
    op.execute("""
        CREATE POLICY analysis_artifacts_membership_aware ON science.analysis_artifacts
            USING (
                organization_id = identity.current_organization_id()
                AND EXISTS (
                    SELECT 1 FROM science.analysis_runs r
                    JOIN science.projects p ON p.organization_id = r.organization_id AND p.id = r.project_id
                    WHERE r.organization_id = analysis_artifacts.organization_id AND r.id = analysis_artifacts.run_id
                )
            )
    """)

    # ── analysis_stage_results ──
    op.execute("DROP POLICY IF EXISTS analysis_stage_results_tenant_isolation ON science.analysis_stage_results")
    op.execute("""
        CREATE POLICY analysis_stage_results_membership_aware ON science.analysis_stage_results
            USING (
                organization_id = identity.current_organization_id()
                AND EXISTS (
                    SELECT 1 FROM science.analysis_stages s
                    JOIN science.analysis_runs r ON r.organization_id = s.organization_id AND r.id = s.run_id
                    JOIN science.projects p ON p.organization_id = r.organization_id AND p.id = r.project_id
                    WHERE s.organization_id = analysis_stage_results.organization_id AND s.id = analysis_stage_results.stage_id
                )
            )
    """)

    # ── analysis_run_events ──
    op.execute("DROP POLICY IF EXISTS analysis_run_events_tenant_isolation ON science.analysis_run_events")
    op.execute("""
        CREATE POLICY analysis_run_events_membership_aware ON science.analysis_run_events
            USING (
                organization_id = identity.current_organization_id()
                AND EXISTS (
                    SELECT 1 FROM science.analysis_runs r
                    JOIN science.projects p ON p.organization_id = r.organization_id AND p.id = r.project_id
                    WHERE r.organization_id = analysis_run_events.organization_id AND r.id = analysis_run_events.run_id
                )
            )
    """)

    # ── evidence_items ──
    op.execute("DROP POLICY IF EXISTS evidence_items_tenant_isolation ON science.evidence_items")
    op.execute("""
        CREATE POLICY evidence_items_membership_aware ON science.evidence_items
            USING (
                organization_id = identity.current_organization_id()
                AND EXISTS (
                    SELECT 1 FROM science.projects p
                    WHERE p.organization_id = evidence_items.organization_id AND p.id = evidence_items.project_id
                )
            )
    """)

    # ── evidence_versions ──
    op.execute("DROP POLICY IF EXISTS evidence_versions_tenant_isolation ON science.evidence_versions")
    op.execute("""
        CREATE POLICY evidence_versions_membership_aware ON science.evidence_versions
            USING (
                organization_id = identity.current_organization_id()
                AND EXISTS (
                    SELECT 1 FROM science.evidence_items e
                    JOIN science.projects p ON p.organization_id = e.organization_id AND p.id = e.project_id
                    WHERE e.organization_id = evidence_versions.organization_id AND e.id = evidence_versions.evidence_node_id
                )
            )
    """)

    # ── fusion_runs ──
    op.execute("DROP POLICY IF EXISTS fusion_runs_tenant_isolation ON science.fusion_runs")
    op.execute("""
        CREATE POLICY fusion_runs_membership_aware ON science.fusion_runs
            USING (
                organization_id = identity.current_organization_id()
                AND EXISTS (
                    SELECT 1 FROM science.projects p
                    WHERE p.organization_id = fusion_runs.organization_id AND p.id = fusion_runs.project_id
                )
            )
    """)

    # ── fusion_run_evidence ──
    op.execute("DROP POLICY IF EXISTS fusion_run_evidence_tenant_isolation ON science.fusion_run_evidence")
    op.execute("""
        CREATE POLICY fusion_run_evidence_membership_aware ON science.fusion_run_evidence
            USING (
                organization_id = identity.current_organization_id()
                AND EXISTS (
                    SELECT 1 FROM science.fusion_runs f
                    JOIN science.projects p ON p.organization_id = f.organization_id AND p.id = f.project_id
                    WHERE f.organization_id = fusion_run_evidence.organization_id AND f.id = fusion_run_evidence.fusion_run_id
                )
            )
    """)

    # ── reasoning_runs ──
    op.execute("DROP POLICY IF EXISTS reasoning_runs_tenant_isolation ON science.reasoning_runs")
    op.execute("""
        CREATE POLICY reasoning_runs_membership_aware ON science.reasoning_runs
            USING (
                organization_id = identity.current_organization_id()
                AND EXISTS (
                    SELECT 1 FROM science.analysis_runs r
                    JOIN science.projects p ON p.organization_id = r.organization_id AND p.id = r.project_id
                    WHERE r.organization_id = reasoning_runs.organization_id AND r.id = reasoning_runs.run_id
                )
            )
    """)

    # ── reference_library_scopes ──
    op.execute("DROP POLICY IF EXISTS reference_library_scopes_tenant_isolation ON science.reference_library_scopes")
    op.execute("""
        CREATE POLICY reference_library_scopes_membership_aware ON science.reference_library_scopes
            USING (
                organization_id = identity.current_organization_id()
                AND (
                    scope_type = 'global'
                    OR scope_type = 'organization_private'
                    OR (scope_type = 'project_private' AND EXISTS (
                        SELECT 1 FROM science.projects p
                        WHERE p.organization_id = reference_library_scopes.organization_id AND p.id = reference_library_scopes.scope_project_id
                    ))
                    OR (scope_type = 'private_user' AND scope_user_id = identity.current_user_id())
                )
            )
    """)

    # ── identity.organizations RLS ──
    op.execute("ALTER TABLE identity.organizations ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE identity.organizations FORCE ROW LEVEL SECURITY")
    op.execute("DROP POLICY IF EXISTS organizations_tenant_isolation ON identity.organizations")
    op.execute("""
        CREATE POLICY organizations_tenant_isolation ON identity.organizations
            USING (id = identity.current_organization_id())
    """)


def downgrade() -> None:
    # Revert to standard tenant-isolation checks
    op.execute("DROP POLICY IF EXISTS reference_library_scopes_membership_aware ON science.reference_library_scopes")
    op.execute("CREATE POLICY reference_library_scopes_tenant_isolation ON science.reference_library_scopes USING (organization_id = identity.current_organization_id())")
    
    op.execute("DROP POLICY IF EXISTS reasoning_runs_membership_aware ON science.reasoning_runs")
    op.execute("CREATE POLICY reasoning_runs_tenant_isolation ON science.reasoning_runs USING (organization_id = identity.current_organization_id())")

    op.execute("DROP POLICY IF EXISTS fusion_run_evidence_membership_aware ON science.fusion_run_evidence")
    op.execute("CREATE POLICY fusion_run_evidence_tenant_isolation ON science.fusion_run_evidence USING (organization_id = identity.current_organization_id())")

    op.execute("DROP POLICY IF EXISTS fusion_runs_membership_aware ON science.fusion_runs")
    op.execute("CREATE POLICY fusion_runs_tenant_isolation ON science.fusion_runs USING (organization_id = identity.current_organization_id())")

    op.execute("DROP POLICY IF EXISTS evidence_versions_membership_aware ON science.evidence_versions")
    op.execute("CREATE POLICY evidence_versions_tenant_isolation ON science.evidence_versions USING (organization_id = identity.current_organization_id())")

    op.execute("DROP POLICY IF EXISTS evidence_items_membership_aware ON science.evidence_items")
    op.execute("CREATE POLICY evidence_items_tenant_isolation ON science.evidence_items USING (organization_id = identity.current_organization_id())")

    op.execute("DROP POLICY IF EXISTS analysis_run_events_membership_aware ON science.analysis_run_events")
    op.execute("CREATE POLICY analysis_run_events_tenant_isolation ON science.analysis_run_events USING (organization_id = identity.current_organization_id())")

    op.execute("DROP POLICY IF EXISTS analysis_stage_results_membership_aware ON science.analysis_stage_results")
    op.execute("CREATE POLICY analysis_stage_results_tenant_isolation ON science.analysis_stage_results USING (organization_id = identity.current_organization_id())")

    op.execute("DROP POLICY IF EXISTS analysis_artifacts_membership_aware ON science.analysis_artifacts")
    op.execute("CREATE POLICY analysis_artifacts_tenant_isolation ON science.analysis_artifacts USING (organization_id = identity.current_organization_id())")

    op.execute("DROP POLICY IF EXISTS analysis_stages_membership_aware ON science.analysis_stages")
    op.execute("CREATE POLICY analysis_stages_tenant_isolation ON science.analysis_stages USING (organization_id = identity.current_organization_id())")

    # ── identity.organizations downgrade ──
    op.execute("DROP POLICY IF EXISTS organizations_tenant_isolation ON identity.organizations")
    op.execute("ALTER TABLE identity.organizations DISABLE ROW LEVEL SECURITY")
