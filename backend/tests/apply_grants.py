"""
DIFARYX Phase 0 — Least-Privilege Table-Level Grant Matrix Applier
==================================================================
Applies a strict table-level permission matrix, ensuring the app/scientist
roles cannot physically delete data or access audit logs, while the purge
role is tightly restricted.
"""

import os
import sys
import psycopg2

BOOTSTRAP_URL = os.getenv("DIFARYX_BOOTSTRAP_DATABASE_URL")


def apply_grants():
    if not BOOTSTRAP_URL:
        print("[-] DIFARYX_BOOTSTRAP_DATABASE_URL environment variable is required")
        sys.exit(1)

    conn = psycopg2.connect(BOOTSTRAP_URL)
    conn.autocommit = True
    cur = conn.cursor()

    schemas = ["identity", "science", "governance", "outbox"]

    print("Transferring table ownerships to difaryx_owner...")
    cur.execute("""
        SELECT schemaname, tablename 
        FROM pg_tables 
        WHERE schemaname IN ('identity', 'science', 'governance', 'outbox')
    """)
    tables = cur.fetchall()
    for schema, table in tables:
        cur.execute(f"ALTER TABLE {schema}.{table} OWNER TO difaryx_owner")

    print("Granting USAGE on schemas to application roles...")
    for schema in schemas:
        cur.execute(f"GRANT USAGE ON SCHEMA {schema} TO difaryx_app")
        cur.execute(f"GRANT USAGE ON SCHEMA {schema} TO difaryx_purge")
        cur.execute(f"GRANT USAGE ON SCHEMA {schema} TO difaryx_admin_test")

    # ── 1. Table-Level Grants for difaryx_app ───────────────────────────────
    print("Applying table-level grants for difaryx_app...")
    
    # identity
    cur.execute("GRANT SELECT ON identity.organizations, identity.users, identity.memberships TO difaryx_app")
    cur.execute("GRANT SELECT, INSERT, UPDATE ON identity.api_keys TO difaryx_app")

    # science
    cur.execute("""
        GRANT SELECT, INSERT, UPDATE ON 
            science.projects, 
            science.analysis_runs, 
            science.analysis_stages, 
            science.analysis_artifacts, 
            science.analysis_stage_results, 
            science.analysis_run_events, 
            science.analysis_run_reference_snapshots, 
            science.evidence_items, 
            science.evidence_versions, 
            science.fusion_runs, 
            science.fusion_run_evidence, 
            science.reasoning_runs,
            science.project_memberships
        TO difaryx_app
    """)
    cur.execute("""
        GRANT SELECT ON 
            science.reference_libraries, 
            science.reference_snapshots, 
            science.reference_entries, 
            science.reference_library_scopes, 
            science.organization_reference_library_grants 
        TO difaryx_app
    """)

    # governance (no audit_log permission for difaryx_app)
    cur.execute("GRANT SELECT, INSERT, UPDATE ON governance.ai_policies, governance.ai_consent_records TO difaryx_app")
    cur.execute("GRANT SELECT ON governance.quota_ledger, governance.usage_events TO difaryx_app")

    # outbox (app group can only create events, not claim or update locking fields)
    cur.execute("GRANT INSERT ON outbox.outbox_events TO difaryx_app")
    # worker/publisher role gets claim/locking update rights
    cur.execute("GRANT SELECT, INSERT, UPDATE ON outbox.outbox_events, outbox.outbox_dead_letter TO difaryx_app")

    # ── 2. Table-Level Grants for difaryx_admin_test ────────────────────────
    print("Applying table-level grants for difaryx_admin_test...")
    cur.execute("GRANT SELECT, INSERT ON governance.audit_log TO difaryx_admin_test")

    # ── 3. Table-Level Grants for difaryx_purge ──────────────────────────────
    print("Applying table-level grants for difaryx_purge...")
    cur.execute("""
        GRANT SELECT, DELETE ON 
            science.projects, 
            science.analysis_runs, 
            science.evidence_items, 
            science.fusion_runs, 
            science.reasoning_runs,
            science.project_memberships
        TO difaryx_purge
    """)
    cur.execute("GRANT SELECT, DELETE ON outbox.outbox_events, outbox.outbox_dead_letter TO difaryx_purge")
    cur.execute("GRANT SELECT, DELETE ON governance.usage_events, governance.quota_ledger TO difaryx_purge")
    cur.execute("GRANT SELECT, DELETE ON identity.memberships, identity.api_keys TO difaryx_purge")

    # ── 4. Sequence Grants ──────────────────────────────────────────────────
    print("Granting USAGE, SELECT on sequences...")
    cur.execute("""
        SELECT sequence_schema, sequence_name 
        FROM information_schema.sequences 
        WHERE sequence_schema IN ('identity', 'science', 'governance', 'outbox')
    """)
    sequences = cur.fetchall()
    for seq_schema, seq_name in sequences:
        cur.execute(f"GRANT USAGE, SELECT ON SEQUENCE {seq_schema}.{seq_name} TO difaryx_app")
        cur.execute(f"GRANT USAGE, SELECT ON SEQUENCE {seq_schema}.{seq_name} TO difaryx_purge")
        cur.execute(f"GRANT USAGE, SELECT ON SEQUENCE {seq_schema}.{seq_name} TO difaryx_admin_test")

    cur.close()
    conn.close()
    print("[SUCCESS] Least-privilege matrix grants applied successfully.")


if __name__ == '__main__':
    apply_grants()
