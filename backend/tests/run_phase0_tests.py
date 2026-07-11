"""
DIFARYX Phase 0 — Non-Destructive Test Suite Runner
==================================================
Runs all validation gates and isolation test suites against the prepared test database
without dropping the database, modifying roles, or altering credentials.
"""

import os
import subprocess
import sys

# Ensure required environment variables exist
TEST_DB_URL = os.getenv("DIFARYX_TEST_DATABASE_URL")
BOOTSTRAP_URL = os.getenv("DIFARYX_BOOTSTRAP_DATABASE_URL")
API_TEST_URL = os.getenv("DIFARYX_API_TEST_DATABASE_URL")
PURGE_TEST_URL = os.getenv("DIFARYX_PURGE_TEST_DATABASE_URL")
ADMIN_TEST_URL = os.getenv("DIFARYX_ADMIN_TEST_DATABASE_URL")


def run_test_module(name, cmd, cwd=None):
    print(f"\n[RUNNING STAGE] {name}...")
    print(f"Command: {' '.join(cmd)}")
    
    # Forward the active environment variables
    env = os.environ.copy()
    
    res = subprocess.run(cmd, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, env=env)
    print(res.stdout)
    return res.returncode == 0


def main():
    print("=============================================================")
    print("DIFARYX PHASE 0 NON-DESTRUCTIVE TEST RUNNER")
    print("=============================================================")

    if not all([TEST_DB_URL, BOOTSTRAP_URL, API_TEST_URL, PURGE_TEST_URL, ADMIN_TEST_URL]):
        print("[-] Error: Missing one or more required test URL environment variables:")
        print(f"    DIFARYX_TEST_DATABASE_URL: {'SET' if TEST_DB_URL else 'MISSING'}")
        print(f"    DIFARYX_BOOTSTRAP_DATABASE_URL: {'SET' if BOOTSTRAP_URL else 'MISSING'}")
        print(f"    DIFARYX_API_TEST_DATABASE_URL: {'SET' if API_TEST_URL else 'MISSING'}")
        print(f"    DIFARYX_PURGE_TEST_DATABASE_URL: {'SET' if PURGE_TEST_URL else 'MISSING'}")
        print(f"    DIFARYX_ADMIN_TEST_DATABASE_URL: {'SET' if ADMIN_TEST_URL else 'MISSING'}")
        sys.exit(1)

    python_path = sys.executable or "C:\\Python314\\python.exe"
    base_dir = "C:\\DIFARYX-demo"

    # Step 1: DDL Integrity Catalog Verification
    if not run_test_module("DDL Integrity Catalog Verification", [python_path, "tests/verify_ddl.py"], cwd=f"{base_dir}\\backend"):
        print("[-] DDL integrity verification failed.")
        sys.exit(1)

    # Step 2: Basic Tenant Isolation Tests
    if not run_test_module("Basic Tenant Isolation", [python_path, "tenant_isolation_tests.py"], cwd=f"{base_dir}\\backend"):
        print("[-] Basic tenant isolation tests failed.")
        sys.exit(1)

    # Step 3: Synchronous Pooled Connection Tenant Context Isolation
    if not run_test_module("Synchronous Pooled Connection Isolation", [python_path, "tests/sync_pool_tenant_context_test.py"], cwd=f"{base_dir}\\backend"):
        print("[-] Pooled-connection context isolation tests failed.")
        sys.exit(1)

    # Step 4: Project Membership & RLS Table-by-Table Isolation
    if not run_test_module("Project Membership & RLS Isolation", [python_path, "tests/project_membership_audit_tests.py"], cwd=f"{base_dir}\\backend"):
        print("[-] Project membership and child table isolation tests failed.")
        sys.exit(1)

    # Step 5: Transactional Outbox Lifecycle & Worker Claims
    if not run_test_module("Transactional Outbox Worker Lifecycle", [python_path, "outbox_worker_lifecycle_tests.py"], cwd=f"{base_dir}\\backend"):
        print("[-] Outbox worker lifecycle tests failed.")
        sys.exit(1)

    # Step 6: Fingerprint Order Normalization Golden Tests
    if not run_test_module("Fingerprint Golden Tests", [python_path, "fingerprint.py"], cwd=f"{base_dir}\\backend"):
        print("[-] Fingerprint golden tests failed.")
        sys.exit(1)

    print("\n=============================================================")
    print("[SUCCESS] ALL PHASE 0 GATES PASSED SUCCESSFULLY (NON-DESTRUCTIVE RUN).")
    print("=============================================================")
    sys.exit(0)


if __name__ == '__main__':
    main()
