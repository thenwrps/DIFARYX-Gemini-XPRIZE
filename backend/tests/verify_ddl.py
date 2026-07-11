"""
DIFARYX Phase 0 — DDL and Catalog Integrity Validator
======================================================
Queries the PostgreSQL catalog tables to programmatically verify that all
schema security policies, ownership matrices, and constraints are correct.
"""

import os
import sys
import psycopg2

TEST_DB_URL = os.getenv("DIFARYX_TEST_DATABASE_URL")


def run_integrity_assertions() -> bool:
    if not TEST_DB_URL:
        print("[-] DIFARYX_TEST_DATABASE_URL environment variable is required")
        sys.exit(1)

    conn = psycopg2.connect(TEST_DB_URL)
    cur = conn.cursor()

    all_passed = True

    # 1. Row Level Security must be enabled and forced
    print("Verifying RLS activation on core schemas...")
    cur.execute("""
        SELECT 
            schemaname,
            tablename,
            rowsecurity AS rls_enabled,
            relforcerowsecurity AS rls_forced
        FROM pg_tables t
        JOIN pg_class c ON c.relname = t.tablename
        JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = t.schemaname
        WHERE schemaname IN ('identity', 'science', 'governance', 'outbox')
    """)
    rls_rows = cur.fetchall()
    
    # Assert each table has RLS enabled & forced
    for schema, table, enabled, forced in rls_rows:
        if not enabled or not forced:
            print(f"  [FAIL] Table {schema}.{table} lacks RLS (enabled={enabled}, forced={forced})")
            all_passed = False
        else:
            print(f"  [PASS] RLS enabled and forced on {schema}.{table}")

    # 2. Table ownership verification
    print("\nVerifying that the application role is NOT a table owner...")
    cur.execute("""
        SELECT schemaname, tablename, tableowner
        FROM pg_tables
        WHERE schemaname IN ('identity', 'science', 'governance', 'outbox')
          AND tableowner = 'difaryx_app'
    """)
    owners = cur.fetchall()
    if len(owners) > 0:
        for s, t, o in owners:
            print(f"  [FAIL] Table {s}.{t} is owned by application role '{o}'!")
        all_passed = False
    else:
        print("  [PASS] All tables are correctly owned by the schema owner (not difaryx_app).")

    # 3. Role privilege checks
    print("\nVerifying that the app role lacks superuser / bypassrls privileges...")
    cur.execute("""
        SELECT rolname, rolsuper, rolbypassrls
        FROM pg_roles 
        WHERE rolname = 'difaryx_app'
    """)
    roles = cur.fetchall()
    for name, superuser, bypassrls in roles:
        if superuser or bypassrls:
            print(f"  [FAIL] Role '{name}' has excessive privileges: superuser={superuser}, bypassrls={bypassrls}")
            all_passed = False
        else:
            print(f"  [PASS] Role '{name}' is unprivileged (superuser=False, bypassrls=False).")

    # 4. Check constraints validation
    print("\nVerifying CHECK constraints are active and validated...")
    cur.execute("""
        SELECT conrelid::regclass AS table_name, conname, convalidated
        FROM pg_constraint
        WHERE contype = 'c' 
          AND connamespace::regnamespace::text IN ('science', 'governance', 'outbox')
    """)
    constraints = cur.fetchall()
    if len(constraints) == 0:
        print("  [FAIL] No CHECK constraints found in science/governance/outbox schemas!")
        all_passed = False
    else:
        for tbl, name, validated in constraints:
            if not validated:
                print(f"  [FAIL] Constraint {name} on {tbl} is NOT validated!")
                all_passed = False
            else:
                print(f"  [PASS] CHECK constraint {name} on {tbl} is active and validated.")

    cur.close()
    conn.close()
    return all_passed


if __name__ == '__main__':
    print("Running DDL Integrity Verification...\n")
    if run_integrity_assertions():
        print("\nPASS — DDL integrity verification")
        sys.exit(0)
    else:
        sys.exit(1)
