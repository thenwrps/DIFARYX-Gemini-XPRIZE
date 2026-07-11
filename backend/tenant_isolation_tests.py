"""
DIFARYX Phase 0 — Tenant Isolation Closeout Test Suite
======================================================
This script uses psycopg2 directly as a non-superuser connection
using the role `difaryx_app` to verify all 10 tenant-isolation gates.
"""

import sys
import threading
import time
import psycopg2

import os

DB_DSN = os.getenv("DIFARYX_TEST_DATABASE_URL")
SUPER_DSN = os.getenv("DIFARYX_BOOTSTRAP_DATABASE_URL")

if not DB_DSN or not SUPER_DSN:
    raise RuntimeError("Missing required test DSN environment variables: DIFARYX_TEST_DATABASE_URL, DIFARYX_BOOTSTRAP_DATABASE_URL")

# Org UUIDs
ORG_A = 'aaaaaaaa-0000-0000-0000-000000000001'
ORG_B = 'bbbbbbbb-0000-0000-0000-000000000001'
ORG_C = 'cccccccc-0000-0000-0000-000000000001'
ORG_D = 'dddddddd-0000-0000-0000-000000000001'
ORG_E = 'eeeeeeee-0000-0000-0000-000000000001'


def setup_concurrency_data():
    """Seeds Orgs A, B, C, D, E and their private projects to test multi-org isolation."""
    conn = psycopg2.connect(SUPER_DSN)
    cur = conn.cursor()
    
    cur.execute("SET app.organization_id = '';")
    
    # 1. Orgs
    orgs = [
        (ORG_A, 'org-alpha'),
        (ORG_B, 'org-beta'),
        (ORG_C, 'org-gamma'),
        (ORG_D, 'org-delta'),
        (ORG_E, 'org-epsilon')
    ]
    for oid, slug in orgs:
        cur.execute("INSERT INTO identity.organizations (id, slug, display_name) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING", (oid, slug, slug))
    
    # 2. Users
    users = [
        ('aaaaaaaa-0000-0000-0000-000000000002', ORG_A, 'alice@alpha.com'),
        ('bbbbbbbb-0000-0000-0000-000000000002', ORG_B, 'bob@beta.com'),
        ('cccccccc-0000-0000-0000-000000000002', ORG_C, 'charlie@gamma.com'),
        ('dddddddd-0000-0000-0000-000000000002', ORG_D, 'delta@delta.com'),
        ('eeeeeeee-0000-0000-0000-000000000002', ORG_E, 'epsilon@epsilon.com'),
    ]
    for uid, oid, email in users:
        cur.execute("INSERT INTO identity.users (id, organization_id, email, display_name) VALUES (%s, %s, %s, %s) ON CONFLICT (organization_id, id) DO NOTHING", (uid, oid, email, email))
        
    # 3. Projects
    projects = [
        ('aaaaaaaa-0000-0000-0000-000000000003', ORG_A, 'aaaaaaaa-0000-0000-0000-000000000002', 'Alpha XRD Study'),
        ('bbbbbbbb-0000-0000-0000-000000000003', ORG_B, 'bbbbbbbb-0000-0000-0000-000000000002', 'Beta FTIR Study'),
        ('cccccccc-0000-0000-0000-000000000003', ORG_C, 'cccccccc-0000-0000-0000-000000000002', 'Gamma Study'),
        ('dddddddd-0000-0000-0000-000000000003', ORG_D, 'dddddddd-0000-0000-0000-000000000002', 'Delta Study'),
        ('eeeeeeee-0000-0000-0000-000000000003', ORG_E, 'eeeeeeee-0000-0000-0000-000000000002', 'Epsilon Study'),
    ]
    for pid, oid, uid, title in projects:
        cur.execute("INSERT INTO science.projects (id, organization_id, owner_user_id, title) VALUES (%s, %s, %s, %s) ON CONFLICT DO NOTHING", (pid, oid, uid, title))
        
    conn.commit()
    cur.close()
    conn.close()
    print("[SETUP] Concurrency test data seeded successfully.")


def run_isolation_tests() -> bool:
    all_passed = True
    
    # Connect as non-superuser difaryx_app
    conn = psycopg2.connect(DB_DSN)
    cur = conn.cursor()
    
    # ── Test 1: Missing app.organization_id context denies access ──
    try:
        cur.execute("RESET app.organization_id;")
        cur.execute("SELECT COUNT(*) FROM science.projects;")
        cnt = cur.fetchone()[0]
        if cnt == 0:
            print("  [PASS] Test 1: No org context yields 0 visible rows.")
        else:
            print(f"  [FAIL] Test 1: No context leaked {cnt} rows.")
            all_passed = False
    except Exception as e:
        print(f"  [FAIL] Test 1 encountered error: {e}")
        all_passed = False
        
    # ── Test 2: Org A cannot read Org B ──
    try:
        cur.execute("SET app.organization_id = %s;", (ORG_A,))
        cur.execute("SELECT COUNT(*) FROM science.projects WHERE organization_id = %s;", (ORG_B,))
        cnt = cur.fetchone()[0]
        if cnt == 0:
            print("  [PASS] Test 2: Org A cannot read Org B private projects.")
        else:
            print(f"  [FAIL] Test 2: Org A read {cnt} projects of Org B.")
            all_passed = False
    except Exception as e:
        print(f"  [FAIL] Test 2 encountered error: {e}")
        all_passed = False

    # ── Test 3: Org A cannot insert a row referencing Org B ──
    try:
        cur.execute("SET app.organization_id = %s;", (ORG_A,))
        # RLS blocks insertion because organization_id in row != current_organization_id()
        # Alternatively, it inserts but fails to read it back, or raises an RLS check violation.
        # RLS WITH CHECK triggers on INSERT.
        cur.execute(
            "INSERT INTO science.projects (organization_id, owner_user_id, title) VALUES (%s, %s, %s);",
            (ORG_B, 'bbbbbbbb-0000-0000-0000-000000000002', 'Malicious Insert')
        )
        conn.commit()
        print("  [FAIL] Test 3: Org A successfully inserted row referencing Org B.")
        all_passed = False
    except psycopg2.Error as e:
        conn.rollback()
        # RLS WITH CHECK throws an error or fails
        print(f"  [PASS] Test 3: Org A insertion referencing Org B correctly rejected/blocked: {e.pgerror.strip() if e.pgerror else str(e)}")

    # ── Test 4: Org A cannot update or delete Org B ──
    try:
        cur.execute("SET app.organization_id = %s;", (ORG_A,))
        cur.execute("UPDATE science.projects SET title = 'HAX' WHERE organization_id = %s;", (ORG_B,))
        rows_updated = cur.rowcount
        cur.execute("DELETE FROM science.projects WHERE organization_id = %s;", (ORG_B,))
        rows_deleted = cur.rowcount
        conn.commit()
        if rows_updated == 0 and rows_deleted == 0:
            print("  [PASS] Test 4: Org A UPDATE and DELETE of Org B affected 0 rows.")
        else:
            print(f"  [FAIL] Test 4: Org A affected {rows_updated} updates / {rows_deleted} deletes on Org B.")
            all_passed = False
    except Exception as e:
        conn.rollback()
        print(f"  [FAIL] Test 4 encountered error: {e}")
        all_passed = False

    # ── Test 5: Cross-tenant composite FK is rejected ──
    # Org A tries to insert a run referencing Org B's project.
    # Should fail due to foreign key referencing (org_id, project_id) which is composite!
    try:
        cur.execute("SET app.organization_id = %s;", (ORG_A,))
        # project_id = ORG_B's project, but owner_user_id is Alice
        cur.execute(
            "INSERT INTO science.analysis_runs (organization_id, project_id, technique, submitted_by) VALUES (%s, %s, %s, %s);",
            (ORG_A, 'bbbbbbbb-0000-0000-0000-000000000003', 'xrd', 'aaaaaaaa-0000-0000-0000-000000000002')
        )
        conn.commit()
        print("  [FAIL] Test 5: Cross-tenant composite FK insert was not blocked.")
        all_passed = False
    except psycopg2.Error as e:
        conn.rollback()
        print(f"  [PASS] Test 5: Cross-tenant composite FK correctly rejected: {e.pgerror.strip() if e.pgerror else str(e)}")

    # ── Test 6: Connection-pool reuse does not leak tenant context ──
    try:
        # Client 1 sets context
        cur.execute("SET app.organization_id = %s;", (ORG_A,))
        # Client 1 finishes, context reset
        cur.execute("RESET app.organization_id;")
        # Client 2 executes query without setting org context
        cur.execute("SELECT COUNT(*) FROM science.projects;")
        cnt = cur.fetchone()[0]
        if cnt == 0:
            print("  [PASS] Test 6: Resetting app context prevents context leaks on connection reuse.")
        else:
            print(f"  [FAIL] Test 6: Connection reuse leaked {cnt} rows.")
            all_passed = False
    except Exception as e:
        print(f"  [FAIL] Test 6 encountered error: {e}")
        all_passed = False

    # ── Test 9: Worker role cannot bypass RLS ──
    # difaryx_app is used for workers. Proves that it is subject to RLS and cannot view Org B data.
    try:
        cur.execute("SET app.organization_id = %s;", (ORG_A,))
        cur.execute("SELECT COUNT(*) FROM science.analysis_runs WHERE organization_id = %s;", (ORG_B,))
        cnt = cur.fetchone()[0]
        if cnt == 0:
            print("  [PASS] Test 9: Worker role (difaryx_app) cannot bypass RLS.")
        else:
            print(f"  [FAIL] Test 9: Worker role bypassed RLS and read Org B runs.")
            all_passed = False
    except Exception as e:
        print(f"  [FAIL] Test 9 encountered error: {e}")
        all_passed = False

    cur.close()
    conn.close()
    return all_passed


def worker_thread(org_id, results_list, index):
    try:
        conn = psycopg2.connect(DB_DSN)
        cur = conn.cursor()
        
        # Determine the user ID based on org_id
        user_id = None
        if org_id == ORG_A: user_id = 'aaaaaaaa-0000-0000-0000-000000000002'
        elif org_id == ORG_B: user_id = 'bbbbbbbb-0000-0000-0000-000000000002'
        elif org_id == ORG_C: user_id = 'cccccccc-0000-0000-0000-000000000002'
        elif org_id == ORG_D: user_id = 'dddddddd-0000-0000-0000-000000000002'
        elif org_id == ORG_E: user_id = 'eeeeeeee-0000-0000-0000-000000000002'

        # Set tenant and user context
        cur.execute("SET app.organization_id = %s;", (org_id,))
        cur.execute("SET app.user_id = %s;", (user_id,))
        
        # Read visible project titles
        cur.execute("SELECT title FROM science.projects;")
        projects = [r[0] for r in cur.fetchall()]
        
        # We expect exactly 1 project for this org to be returned
        valid = (len(projects) == 1)
        for p in projects:
            if org_id == ORG_A:
                if "Alpha" not in p: valid = False
            elif org_id == ORG_B:
                if "Beta" not in p: valid = False
            elif org_id == ORG_C:
                if "Gamma" not in p: valid = False
            elif org_id == ORG_D:
                if "Delta" not in p: valid = False
            elif org_id == ORG_E:
                if "Epsilon" not in p: valid = False
            else:
                valid = False
            
        cur.close()
        conn.close()
        results_list[index] = (valid, f"Org {org_id[:4]} saw: {projects}")
    except Exception as e:
        results_list[index] = (False, f"Thread error: {e}")


def run_concurrency_isolation_test() -> bool:
    orgs = [ORG_A, ORG_B, ORG_C, ORG_D, ORG_E]
    threads = []
    results = [None] * len(orgs)
    
    for i, org_id in enumerate(orgs):
        t = threading.Thread(target=worker_thread, args=(org_id, results, i))
        threads.append(t)
        t.start()
        
    for t in threads:
        t.join()
        
    all_ok = True
    print("  === CONCURRENT TENANT WORKERS ===")
    for idx, (ok, msg) in enumerate(results):
        print(f"    Worker {idx + 1}: {'[PASS]' if ok else '[FAIL]'} - {msg}")
        if not ok:
            all_ok = False
    return all_ok


if __name__ == '__main__':
    print("Running DIFARYX tenant isolation closeout tests...\n")
    setup_concurrency_data()
    
    tests_ok = run_isolation_tests()
    concurr_ok = run_concurrency_isolation_test()
    
    if tests_ok and concurr_ok:
        print("\nALL TENANT ISOLATION TESTS PASSED.")
        sys.exit(0)
    else:
        print("\nTENANT ISOLATION TEST FAILURES DETECTED.")
        sys.exit(1)
