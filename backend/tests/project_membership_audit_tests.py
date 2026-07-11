"""
DIFARYX Phase 0 — Project Membership and Privileged Audit Test Suite
=====================================================================
"""

import sys
import psycopg2

import os

DB_DSN = os.getenv("DIFARYX_TEST_DATABASE_URL")
SUPER_DSN = os.getenv("DIFARYX_BOOTSTRAP_DATABASE_URL")

if not DB_DSN or not SUPER_DSN:
    raise RuntimeError("Missing required test DSN environment variables: DIFARYX_TEST_DATABASE_URL, DIFARYX_BOOTSTRAP_DATABASE_URL")

ORG_A = 'aaaaaaaa-0000-0000-0000-000000000001'
ORG_B = 'bbbbbbbb-0000-0000-0000-000000000001'

USER_A1 = '11111111-1111-1111-1111-111111111111'  # Lead
USER_A2 = '22222222-2222-2222-2222-222222222222'  # Org Member (no project membership)
USER_A3 = '33333333-3333-3333-3333-333333333333'  # Reviewer
USER_A_OWNER = '44444444-4444-4444-4444-444444444444' # Org Owner

PROJECT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'


def setup_membership_data():
    conn = psycopg2.connect(SUPER_DSN)
    cur = conn.cursor()
    
    # Clean up first
    cur.execute("TRUNCATE identity.memberships, science.project_memberships CASCADE;")
    
    # Ensure organizations exist
    cur.execute("INSERT INTO identity.organizations (id, slug, display_name) VALUES (%s, 'org-a', 'Organization A') ON CONFLICT DO NOTHING", (ORG_A,))
    cur.execute("INSERT INTO identity.organizations (id, slug, display_name) VALUES (%s, 'org-b', 'Organization B') ON CONFLICT DO NOTHING", (ORG_B,))

    # Ensure users exist in identity.users
    users = [
        (USER_A1, ORG_A, 'a1_lead@alpha.com'),
        (USER_A2, ORG_A, 'a2_member@alpha.com'),
        (USER_A3, ORG_A, 'a3_reviewer@alpha.com'),
        (USER_A_OWNER, ORG_A, 'owner@alpha.com'),
    ]
    for uid, oid, email in users:
        cur.execute("""
            INSERT INTO identity.users (id, organization_id, email, display_name)
            VALUES (%s, %s, %s, %s) ON CONFLICT (organization_id, id) DO NOTHING
        """, (uid, oid, email, email))
        
    # Org-level memberships
    cur.execute("""
        INSERT INTO identity.memberships (organization_id, user_id, role) VALUES
        (%s, %s, 'member'),
        (%s, %s, 'member'),
        (%s, %s, 'member'),
        (%s, %s, 'owner')
    """, (ORG_A, USER_A1, ORG_A, USER_A2, ORG_A, USER_A3, ORG_A, USER_A_OWNER))

    # Project A owned by User A1
    cur.execute("""
        INSERT INTO science.projects (id, organization_id, owner_user_id, title)
        VALUES (%s, %s, %s, 'Alpha Secret Project')
        ON CONFLICT DO NOTHING
    """, (PROJECT_A, ORG_A, USER_A1))

    # Project memberships
    cur.execute("""
        INSERT INTO science.project_memberships (organization_id, project_id, user_id, role) VALUES
        (%s, %s, %s, 'lead'),
        (%s, %s, %s, 'reviewer')
    """, (ORG_A, PROJECT_A, USER_A1, ORG_A, PROJECT_A, USER_A3))

    # Child tables seeding
    run_id = 'aaaaaaaa-0000-0000-0000-000000000004'
    stage_id = 'aaaaaaaa-0000-0000-0000-000000000005'
    art_id = 'aaaaaaaa-0000-0000-0000-000000000006'
    node_id = 'aaaaaaaa-0000-0000-0000-000000000008'
    ver_id = 'aaaaaaaa-0000-0000-0000-000000000009'
    fusion_id = 'aaaaaaaa-0000-0000-0000-000000000010'

    # Insert analysis run
    cur.execute("""
        INSERT INTO science.analysis_runs (id, organization_id, project_id, technique, submitted_by)
        VALUES (%s, %s, %s, 'xrd', %s)
    """, (run_id, ORG_A, PROJECT_A, USER_A1))

    # Insert analysis stage
    cur.execute("""
        INSERT INTO science.analysis_stages (id, organization_id, run_id, stage_key, stage_implementation_version, stage_status)
        VALUES (%s, %s, %s, 'baseline_correction', '1.0.0', 'completed')
    """, (stage_id, ORG_A, run_id))

    # Insert analysis artifact
    cur.execute("""
        INSERT INTO science.analysis_artifacts (id, organization_id, run_id, artifact_kind, object_key, content_hash_sha256, size_bytes)
        VALUES (%s, %s, %s, 'raw_signal', 'alpha/sig.csv', 'sha256:abc', 100)
    """, (art_id, ORG_A, run_id))

    # Insert evidence item
    cur.execute("""
        INSERT INTO science.evidence_items (id, organization_id, project_id, run_id, technique)
        VALUES (%s, %s, %s, %s, 'xrd')
    """, (node_id, ORG_A, PROJECT_A, run_id))

    # Insert evidence version
    cur.execute("""
        INSERT INTO science.evidence_versions (id, organization_id, evidence_node_id, version_number, evidence_state, content_hash)
        VALUES (%s, %s, %s, 1, 'approved', 'sha256:ver')
    """, (ver_id, ORG_A, node_id))

    # Insert fusion run
    cur.execute("""
        INSERT INTO science.fusion_runs (id, organization_id, project_id, submitted_by, run_status)
        VALUES (%s, %s, %s, %s, 'completed')
    """, (fusion_id, ORG_A, PROJECT_A, USER_A1))

    # Governance policies and reasoning runs seeding
    policy_id = 'aaaaaaaa-0000-0000-0000-000000000011'
    consent_id = 'aaaaaaaa-0000-0000-0000-000000000012'
    reasoning_id = 'aaaaaaaa-0000-0000-0000-000000000013'

    cur.execute("""
        INSERT INTO governance.ai_policies (id, organization_id, version)
        VALUES (%s, %s, '1.0.0')
    """, (policy_id, ORG_A))

    cur.execute("""
        INSERT INTO governance.ai_consent_records (id, organization_id, user_id, ai_policy_id, ai_policy_version, consent_scope)
        VALUES (%s, %s, %s, %s, '1.0.0', 'full_reasoning')
    """, (consent_id, ORG_A, USER_A1, policy_id))

    cur.execute("""
        INSERT INTO science.reasoning_runs (id, organization_id, run_id, user_id, ai_policy_id, ai_consent_id, ai_consent_scope, model_name)
        VALUES (%s, %s, %s, %s, %s, %s, 'full_reasoning', 'gemini-2.5-flash')
    """, (reasoning_id, ORG_A, run_id, USER_A1, policy_id, consent_id))

    conn.commit()
    cur.close()
    conn.close()
    print("[SETUP] Project membership scenario and child data seeded.")


def run_membership_tests() -> bool:
    all_passed = True
    conn = psycopg2.connect(DB_DSN)
    cur = conn.cursor()

    # ── Test 1: User A1 (Lead) can read and write ──
    try:
        cur.execute("SET app.organization_id = %s;", (ORG_A,))
        cur.execute("SET app.user_id = %s;", (USER_A1,))
        cur.execute("SELECT title FROM science.projects WHERE id = %s;", (PROJECT_A,))
        res = cur.fetchall()
        read_ok = (len(res) == 1)
        
        # Test write
        cur.execute("UPDATE science.projects SET description = 'A1 Updated' WHERE id = %s;", (PROJECT_A,))
        conn.commit()
        write_ok = (cur.rowcount == 1)
        
        if read_ok and write_ok:
            print("  [PASS] A1 (Project Lead): Can read and write Project A.")
        else:
            print(f"  [FAIL] A1 (Project Lead): read={read_ok}, write={write_ok}")
            all_passed = False
    except Exception as e:
        conn.rollback()
        print(f"  [FAIL] A1 Lead test error: {e}")
        all_passed = False

    # ── Test 2: User A2 (Org Member, not in Project A) cannot read/write ──
    try:
        cur.execute("SET app.organization_id = %s;", (ORG_A,))
        cur.execute("SET app.user_id = %s;", (USER_A2,))
        cur.execute("SELECT COUNT(*) FROM science.projects WHERE id = %s;", (PROJECT_A,))
        cnt = cur.fetchone()[0]
        
        cur.execute("UPDATE science.projects SET description = 'A2 Hacked' WHERE id = %s;", (PROJECT_A,))
        conn.commit()
        write_cnt = cur.rowcount
        
        if cnt == 0 and write_cnt == 0:
            print("  [PASS] A2 (Org member without project membership): Cannot read or mutate Project A.")
        else:
            print(f"  [FAIL] A2: read={cnt}, write_cnt={write_cnt}")
            all_passed = False
    except Exception as e:
        conn.rollback()
        print(f"  [FAIL] A2 test error: {e}")
        all_passed = False

    # ── Test 3: User A3 (Reviewer) can read but cannot mutate ──
    try:
        cur.execute("SET app.organization_id = %s;", (ORG_A,))
        cur.execute("SET app.user_id = %s;", (USER_A3,))
        cur.execute("SELECT title FROM science.projects WHERE id = %s;", (PROJECT_A,))
        res = cur.fetchall()
        read_ok = (len(res) == 1)
        
        mutation_blocked = False
        try:
            cur.execute("UPDATE science.projects SET description = 'A3 Mutate' WHERE id = %s;", (PROJECT_A,))
            conn.commit()
        except psycopg2.Error as e:
            conn.rollback()
            if "violates row-level security policy" in str(e):
                mutation_blocked = True
            else:
                raise
        
        if read_ok and mutation_blocked:
            print("  [PASS] A3 (Reviewer): Can read but mutation is correctly blocked by RLS.")
        else:
            print(f"  [FAIL] A3: read={read_ok}, mutation_blocked={mutation_blocked}")
            all_passed = False
    except Exception as e:
        conn.rollback()
        print(f"  [FAIL] A3 test error: {e}")
        all_passed = False

    # ── Test 4: Org Owner (USER_A_OWNER) can read and write ──
    try:
        cur.execute("SET app.organization_id = %s;", (ORG_A,))
        cur.execute("SET app.user_id = %s;", (USER_A_OWNER,))
        cur.execute("SELECT title FROM science.projects WHERE id = %s;", (PROJECT_A,))
        res = cur.fetchall()
        read_ok = (len(res) == 1)
        
        cur.execute("UPDATE science.projects SET description = 'Owner Updated' WHERE id = %s;", (PROJECT_A,))
        conn.commit()
        write_ok = (cur.rowcount == 1)
        
        if read_ok and write_ok:
            print("  [PASS] Owner (A_owner): Can read and write Project A.")
        else:
            print(f"  [FAIL] Owner: read={read_ok}, write={write_ok}")
            all_passed = False
    except Exception as e:
        conn.rollback()
        print(f"  [FAIL] Owner test error: {e}")
        all_passed = False

    # ── Test 5: Child tables project-membership enforcement (USER_A2 cannot read Project A's children) ──
    try:
        cur.execute("SET app.organization_id = %s;", (ORG_A,))
        cur.execute("SET app.user_id = %s;", (USER_A2,))
        
        # Exact child record UUIDs to query directly
        run_id = 'aaaaaaaa-0000-0000-0000-000000000004'
        stage_id = 'aaaaaaaa-0000-0000-0000-000000000005'
        art_id = 'aaaaaaaa-0000-0000-0000-000000000006'
        node_id = 'aaaaaaaa-0000-0000-0000-000000000008'
        ver_id = 'aaaaaaaa-0000-0000-0000-000000000009'
        fusion_id = 'aaaaaaaa-0000-0000-0000-000000000010'

        # Runs
        cur.execute("SELECT COUNT(*) FROM science.analysis_runs WHERE id = %s;", (run_id,))
        run_cnt = cur.fetchone()[0]
        # Stages
        cur.execute("SELECT COUNT(*) FROM science.analysis_stages WHERE id = %s;", (stage_id,))
        stage_cnt = cur.fetchone()[0]
        # Artifacts
        cur.execute("SELECT COUNT(*) FROM science.analysis_artifacts WHERE id = %s;", (art_id,))
        art_cnt = cur.fetchone()[0]
        # Evidence items
        cur.execute("SELECT COUNT(*) FROM science.evidence_items WHERE id = %s;", (node_id,))
        node_cnt = cur.fetchone()[0]
        # Evidence versions
        cur.execute("SELECT COUNT(*) FROM science.evidence_versions WHERE id = %s;", (ver_id,))
        ver_cnt = cur.fetchone()[0]
        # Fusion runs
        cur.execute("SELECT COUNT(*) FROM science.fusion_runs WHERE id = %s;", (fusion_id,))
        fusion_cnt = cur.fetchone()[0]
        # Reasoning runs
        reasoning_id = 'aaaaaaaa-0000-0000-0000-000000000013'
        cur.execute("SELECT COUNT(*) FROM science.reasoning_runs WHERE id = %s;", (reasoning_id,))
        reasoning_cnt = cur.fetchone()[0]

        all_hidden = (run_cnt == 0 and stage_cnt == 0 and art_cnt == 0 and 
                      node_cnt == 0 and ver_cnt == 0 and fusion_cnt == 0 and reasoning_cnt == 0)
        
        if all_hidden:
            print("  [PASS] A2 Downstream Child Isolation: All Project A child entities (including reasoning runs) remain completely invisible to User A2.")
        else:
            print(f"  [FAIL] A2 Downstream Child Isolation leak: run={run_cnt}, stage={stage_cnt}, art={art_cnt}, node={node_cnt}, ver={ver_cnt}, fusion={fusion_cnt}, reasoning={reasoning_cnt}")
            all_passed = False
    except Exception as e:
        print(f"  [FAIL] A2 Downstream test error: {e}")
        all_passed = False

    # ── Test 6: User A1 (Lead) sees exactly 1 child record for each ──
    try:
        cur.execute("SET app.organization_id = %s;", (ORG_A,))
        cur.execute("SET app.user_id = %s;", (USER_A1,))
        
        run_id = 'aaaaaaaa-0000-0000-0000-000000000004'
        stage_id = 'aaaaaaaa-0000-0000-0000-000000000005'
        art_id = 'aaaaaaaa-0000-0000-0000-000000000006'
        node_id = 'aaaaaaaa-0000-0000-0000-000000000008'
        ver_id = 'aaaaaaaa-0000-0000-0000-000000000009'
        fusion_id = 'aaaaaaaa-0000-0000-0000-000000000010'
        reasoning_id = 'aaaaaaaa-0000-0000-0000-000000000013'

        cur.execute("SELECT COUNT(*) FROM science.analysis_runs WHERE id = %s;", (run_id,))
        run_cnt = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM science.analysis_stages WHERE id = %s;", (stage_id,))
        stage_cnt = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM science.analysis_artifacts WHERE id = %s;", (art_id,))
        art_cnt = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM science.evidence_items WHERE id = %s;", (node_id,))
        node_cnt = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM science.evidence_versions WHERE id = %s;", (ver_id,))
        ver_cnt = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM science.fusion_runs WHERE id = %s;", (fusion_id,))
        fusion_cnt = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM science.reasoning_runs WHERE id = %s;", (reasoning_id,))
        reasoning_cnt = cur.fetchone()[0]

        all_visible = (run_cnt == 1 and stage_cnt == 1 and art_cnt == 1 and 
                       node_cnt == 1 and ver_cnt == 1 and fusion_cnt == 1 and reasoning_cnt == 1)
        
        if all_visible:
            print("  [PASS] A1 Downstream Child Visibility: All Project A child entities (including reasoning runs) are visible (count=1) to Project Lead A1.")
        else:
            print(f"  [FAIL] A1 Downstream Child Visibility: run={run_cnt}, stage={stage_cnt}, art={art_cnt}, node={node_cnt}, ver={ver_cnt}, fusion={fusion_cnt}, reasoning={reasoning_cnt}")
            all_passed = False
    except Exception as e:
        print(f"  [FAIL] A1 Downstream test error: {e}")
        all_passed = False

    # ── Test 7: Privileged Audit Access Policy ──
    # 1. Ordinary scientist (User A1) has no SELECT privilege on audit_log
    try:
        cur.execute("SET app.organization_id = %s;", (ORG_A,))
        cur.execute("SET app.user_id = %s;", (USER_A1,))
        try:
            cur.execute("SELECT COUNT(*) FROM governance.audit_log;")
            print("  [FAIL] Privileged Audit Access: ordinary user read audit_log without permission error!")
            all_passed = False
        except psycopg2.Error as e:
            conn.rollback()
            if "permission denied" in str(e):
                print("  [PASS] Privileged Audit Access: ordinary user correctly denied SELECT access to audit_log.")
            else:
                raise
    except Exception as e:
        print(f"  [FAIL] Audit log query test error: {e}")
        all_passed = False

    cur.close()
    conn.close()

    # 2. Connect as privileged admin (difaryx_admin_test) to read/write audit_log
    ADMIN_TEST_URL = os.getenv("DIFARYX_ADMIN_TEST_DATABASE_URL")
    if not ADMIN_TEST_URL:
        print("  [-] DIFARYX_ADMIN_TEST_DATABASE_URL not set, skipping admin login verification.")
    else:
        try:
            conn_admin = psycopg2.connect(ADMIN_TEST_URL)
            cur_admin = conn_admin.cursor()
            cur_admin.execute("SET app.organization_id = %s;", (ORG_A,))
            cur_admin.execute("SET app.user_id = %s;", (USER_A_OWNER,))
            
            # Insert audit record
            cur_admin.execute("""
                INSERT INTO governance.audit_log (organization_id, actor_user_id, action, resource_type, resource_id)
                VALUES (%s, %s, 'read_audit', 'audit_log', 'all')
            """, (ORG_A, USER_A_OWNER))
            
            # Read audit record
            cur_admin.execute("SELECT COUNT(*) FROM governance.audit_log;")
            cnt = cur_admin.fetchone()[0]
            cur_admin.close()
            conn_admin.close()
            
            if cnt > 0:
                print(f"  [PASS] Privileged Audit Access: Admin role successfully written/read {cnt} audit logs.")
            else:
                print("  [FAIL] Privileged Audit Access: Admin role read 0 logs.")
                all_passed = False
        except Exception as e:
            print(f"  [FAIL] Privileged Audit Access admin test error: {e}")
            all_passed = False

    return all_passed


if __name__ == '__main__':
    print("Running Project Membership & RLS Role Level Tests...\n")
    setup_membership_data()
    if run_membership_tests():
        print("\nALL PROJECT MEMBERSHIP TESTS PASSED.")
        sys.exit(0)
    else:
        print("\nPROJECT MEMBERSHIP TEST FAILURES DETECTED.")
        sys.exit(1)
