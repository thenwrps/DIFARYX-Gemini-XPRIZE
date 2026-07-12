"""
DIFARYX Phase 0 — Environment Preparation & DB Bootstrapper
===========================================================
Prepares a clean, reproducible test environment under strict safety checks.
"""

import os
import sys
from urllib.parse import urlparse, urlunparse
import psycopg2
import subprocess

# Read required environment variables
BOOTSTRAP_URL = os.getenv("DIFARYX_BOOTSTRAP_DATABASE_URL")
ALLOW_RESET = os.getenv("DIFARYX_ALLOW_TEST_DB_RESET")

API_PASSWORD = os.getenv("DIFARYX_API_PASSWORD")
PURGE_PASSWORD = os.getenv("DIFARYX_PURGE_PASSWORD")
ADMIN_PASSWORD = os.getenv("DIFARYX_ADMIN_PASSWORD")
RLS_TEST_PASSWORD = os.getenv("DIFARYX_RLS_TEST_PASSWORD")


def validate_environment():
    if not BOOTSTRAP_URL:
        raise RuntimeError("DIFARYX_BOOTSTRAP_DATABASE_URL environment variable is required")
        
    if ALLOW_RESET != "YES":
        raise RuntimeError("Explicit test reset approval is required (DIFARYX_ALLOW_TEST_DB_RESET=YES)")

    # Parse database name to verify safety
    url = urlparse(BOOTSTRAP_URL)
    db_name = url.path.lstrip('/')
    
    if not db_name.endswith("_test"):
        raise RuntimeError(f"Refusing to reset a non-test database: '{db_name}'")
        
    rejected_dbs = ["difaryx", "postgres", "template0", "template1"]
    if db_name in rejected_dbs:
        raise RuntimeError(f"Database name '{db_name}' is explicitly rejected for reset operations")

    if not all([API_PASSWORD, PURGE_PASSWORD, ADMIN_PASSWORD, RLS_TEST_PASSWORD]):
        raise RuntimeError("Missing one or more required passwords: DIFARYX_API_PASSWORD, DIFARYX_PURGE_PASSWORD, DIFARYX_ADMIN_PASSWORD, DIFARYX_RLS_TEST_PASSWORD")

    return db_name


def bootstrap_database(db_name):
    # Construct superuser connection to default 'postgres' database to drop/create target db
    url = urlparse(BOOTSTRAP_URL)
    postgres_url = urlunparse(url._replace(path="/postgres"))
    
    print(f"Connecting to superuser database to manage '{db_name}'...")
    conn = psycopg2.connect(postgres_url)
    conn.autocommit = True
    cur = conn.cursor()

    # 1. Terminate connections to target test database
    print(f"Terminating active connections to '{db_name}'...")
    cur.execute(
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = %s AND pid <> pg_backend_pid()",
        (db_name,)
    )

    # 2. Recreate target database
    print(f"Dropping database '{db_name}' if exists...")
    cur.execute(f"DROP DATABASE IF EXISTS {db_name}")

    # 3. Provision roles idempotently
    print("Provisioning roles idempotently (no drops)...")
    cur.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'difaryx_owner') THEN
                CREATE ROLE difaryx_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'difaryx_app') THEN
                CREATE ROLE difaryx_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'difaryx_purge') THEN
                CREATE ROLE difaryx_purge NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
            END IF;
            
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'difaryx_api_test') THEN
                CREATE ROLE difaryx_api_test WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'difaryx_purge_test') THEN
                CREATE ROLE difaryx_purge_test WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'difaryx_admin_test') THEN
                CREATE ROLE difaryx_admin_test WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'difaryx_rls_test') THEN
                CREATE ROLE difaryx_rls_test WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
            END IF;

            -- Phase 1A Dedicated roles
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'difaryx_identity_resolver') THEN
                CREATE ROLE difaryx_identity_resolver NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT BYPASSRLS;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'difaryx_audit_writer') THEN
                CREATE ROLE difaryx_audit_writer NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
            END IF;
        END
        $$;
    """)

    # Alter credentials safely
    cur.execute("ALTER ROLE difaryx_api_test WITH PASSWORD %s", (API_PASSWORD,))
    cur.execute("ALTER ROLE difaryx_purge_test WITH PASSWORD %s", (PURGE_PASSWORD,))
    cur.execute("ALTER ROLE difaryx_admin_test WITH PASSWORD %s", (ADMIN_PASSWORD,))
    cur.execute("ALTER ROLE difaryx_rls_test WITH PASSWORD %s", (RLS_TEST_PASSWORD,))

    # Grant group memberships
    cur.execute("GRANT difaryx_app TO difaryx_api_test")
    cur.execute("GRANT difaryx_purge TO difaryx_purge_test")
    cur.execute("GRANT difaryx_app TO difaryx_rls_test")
    cur.execute("GRANT difaryx_app TO difaryx_admin_test")

    # Create target database owned by difaryx_owner
    print(f"Creating database '{db_name}' owned by difaryx_owner...")
    cur.execute(f"CREATE DATABASE {db_name} OWNER difaryx_owner ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C'")

    cur.close()
    conn.close()

    # 4. Create Schemas
    print("Configuring schemas...")
    conn_db = psycopg2.connect(BOOTSTRAP_URL)
    conn_db.autocommit = True
    cur_db = conn_db.cursor()

    schemas = ["identity", "science", "governance", "outbox"]
    for schema in schemas:
        cur_db.execute(f"CREATE SCHEMA IF NOT EXISTS {schema} AUTHORIZATION difaryx_owner")
        cur_db.execute(f"GRANT USAGE ON SCHEMA {schema} TO difaryx_app")
        cur_db.execute(f"GRANT USAGE ON SCHEMA {schema} TO difaryx_purge")
        cur_db.execute(f"GRANT USAGE ON SCHEMA {schema} TO difaryx_admin_test")

    # Dedicated resolver and audit writer schema grants
    cur_db.execute("GRANT USAGE ON SCHEMA identity TO difaryx_identity_resolver")
    cur_db.execute("GRANT USAGE ON SCHEMA identity TO difaryx_audit_writer")
    cur_db.execute("GRANT USAGE ON SCHEMA governance TO difaryx_audit_writer")

    # Print role preparation summary
    print(f"Role: difaryx_identity_resolver, NOLOGIN, BYPASSRLS=True")
    print(f"Role: difaryx_audit_writer, NOLOGIN, BYPASSRLS=False")
    print(f"Target test database: {db_name}")

    cur_db.close()
    conn_db.close()
    print("Environment bootstrapping successfully completed.")


def run_migrations():
    print("Running Alembic migrations on target database...")
    python_path = None
    candidates = [
        "C:\\Python314\\python.exe",
        sys.executable,
        os.path.abspath(os.path.join(os.path.dirname(__file__), "../../server/python/venv/Scripts/python.exe")),
    ]
    for cand in candidates:
        if cand and os.path.exists(cand):
            import subprocess
            res = subprocess.run([cand, "-c", "import alembic"], capture_output=True)
            if res.returncode == 0:
                python_path = cand
                break
    
    if not python_path:
        python_path = sys.executable or "C:\\Python314\\python.exe"
    
    # We must pass the DATABASE_URL to Alembic
    env = os.environ.copy()
    env["DATABASE_URL"] = BOOTSTRAP_URL
    
    cmd = [python_path, "-m", "alembic", "-c", "alembic.ini", "upgrade", "head"]
    res = subprocess.run(cmd, cwd="C:\\DIFARYX-demo\\backend", stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, env=env)
    print(res.stdout)
    if res.returncode != 0:
        raise RuntimeError("Alembic upgrade head migration failed!")


def main():
    try:
        db_name = validate_environment()
        bootstrap_database(db_name)
        run_migrations()
        
        # Apply grants
        print("Applying table-level least-privilege matrix...")
        venv_python = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../server/python/venv/Scripts/python.exe"))
        if os.path.exists(venv_python):
            python_path = venv_python
        else:
            python_path = sys.executable or "C:\\Python314\\python.exe"
        env = os.environ.copy()
        env["DATABASE_URL"] = BOOTSTRAP_URL
        res = subprocess.run([python_path, "tests/apply_grants.py"], cwd="C:\\DIFARYX-demo\\backend", stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, env=env)
        print(res.stdout)
        if res.returncode != 0:
            raise RuntimeError("Apply grants execution failed!")
            
        print("[SUCCESS] Environment preparation successfully finished.")
    except Exception as e:
        print(f"[-] Environment preparation failed: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main()
