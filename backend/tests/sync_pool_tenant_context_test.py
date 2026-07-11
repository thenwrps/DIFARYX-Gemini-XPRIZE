"""
DIFARYX Phase 0 — Synchronous Connection Pool Tenant Context Test
=================================================================
Verifies that SET LOCAL app.organization_id is transaction-scoped,
preventing tenant data leaks when connections are returned to a pool.
"""

import os
import sys
import psycopg2
from psycopg2 import pool

TEST_DB_URL = os.getenv("DIFARYX_TEST_DATABASE_URL")

ORG_A = 'aaaaaaaa-0000-0000-0000-000000000001'
ORG_B = 'bbbbbbbb-0000-0000-0000-000000000001'


def test_pool_leakage():
    if not TEST_DB_URL:
        raise RuntimeError("DIFARYX_TEST_DATABASE_URL environment variable is required")

    print("Initializing connection pool...")
    conn_pool = psycopg2.pool.ThreadedConnectionPool(minconn=2, maxconn=5, dsn=TEST_DB_URL)

    # ── Client 1: Checkout connection from pool ──
    print("Client 1: Checkout connection from pool...")
    conn1 = conn_pool.getconn()
    cur1 = conn1.cursor()

    # Verify initially 0 rows (no context set)
    cur1.execute("SELECT COUNT(*) FROM science.projects;")
    assert cur1.fetchone()[0] == 0, "Leaked data on initial pool checkout!"

    print("Client 1: Set LOCAL organization context to Org A...")
    cur1.execute("BEGIN;")
    cur1.execute("SET LOCAL app.organization_id = %s;", (ORG_A,))
    cur1.execute("SET LOCAL app.user_id = 'aaaaaaaa-0000-0000-0000-000000000002';")
    cur1.execute("SELECT title FROM science.projects;")
    projects_a = [r[0] for r in cur1.fetchall()]
    print(f"Client 1 (Org A) saw projects: {projects_a}")
    assert len(projects_a) == 1 and "Alpha" in projects_a[0], "Failed to read Org A data!"

    # ── Client 2: Concurrent checkout ──
    print("Client 2: Concurrent checkout...")
    conn2 = conn_pool.getconn()
    cur2 = conn2.cursor()
    
    cur2.execute("BEGIN;")
    cur2.execute("SET LOCAL app.organization_id = %s;", (ORG_B,))
    cur2.execute("SET LOCAL app.user_id = 'bbbbbbbb-0000-0000-0000-000000000002';")
    cur2.execute("SELECT title FROM science.projects;")
    projects_b = [r[0] for r in cur2.fetchall()]
    print(f"Client 2 (Org B) saw projects: {projects_b}")
    assert len(projects_b) == 1 and "Beta" in projects_b[0], "Failed to read Org B data!"

    # ── Client 1 rollback, Client 2 commit ──
    print("Client 1: Rollback transaction...")
    cur1.execute("ROLLBACK;")
    cur1.close()
    conn_pool.putconn(conn1)

    print("Client 2: Commit transaction...")
    cur2.execute("COMMIT;")
    cur2.close()
    conn_pool.putconn(conn2)

    # ── Client 3: Checkout a reused connection ──
    print("Client 3: Checkout reused connection from pool...")
    conn3 = conn_pool.getconn()
    cur3 = conn3.cursor()

    cur3.execute("SELECT COUNT(*) FROM science.projects;")
    cnt = cur3.fetchone()[0]
    print(f"Client 3 (no context) saw: {cnt} projects.")

    cur3.close()
    conn_pool.putconn(conn3)
    conn_pool.closeall()

    if cnt == 0:
        print("  [PASS] Pool Leakage Test: Reused connection was clean (0 rows visible). SET LOCAL works as expected.")
        return True
    else:
        print(f"  [FAIL] Pool Leakage Test: Connection reuse leaked {cnt} rows!")
        return False


if __name__ == '__main__':
    print("Running Pool Tenant Leakage Tests...\n")
    if test_pool_leakage():
        print("PASS — synchronous pooled-connection tenant-context isolation")
        sys.exit(0)
    else:
        sys.exit(1)
