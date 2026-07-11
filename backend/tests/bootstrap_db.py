"""
DIFARYX Phase 0 — Reproducible Database Role & Catalog Bootstrapper
==================================================================
This script establishes the least-privilege group roles, login roles,
and recreates a clean `difaryx_phase0_test` database.
"""

import os
import sys
import psycopg2

# Read database and role credentials from environment variables
BOOTSTRAP_URL = os.getenv("DIFARYX_BOOTSTRAP_DATABASE_URL")
if not BOOTSTRAP_URL:
    raise RuntimeError("DIFARYX_BOOTSTRAP_DATABASE_URL is required")

API_PASSWORD = os.getenv("DIFARYX_API_PASSWORD")
PURGE_PASSWORD = os.getenv("DIFARYX_PURGE_PASSWORD")
ADMIN_PASSWORD = os.getenv("DIFARYX_ADMIN_PASSWORD")
RLS_TEST_PASSWORD = os.getenv("DIFARYX_RLS_TEST_PASSWORD")

if not all([API_PASSWORD, PURGE_PASSWORD, ADMIN_PASSWORD, RLS_TEST_PASSWORD]):
    raise RuntimeError("Missing role password environment variables: DIFARYX_API_PASSWORD, DIFARYX_PURGE_PASSWORD, DIFARYX_ADMIN_PASSWORD, DIFARYX_RLS_TEST_PASSWORD")

# Safely extract database name from URL
from urllib.parse import urlparse
url = urlparse(BOOTSTRAP_URL)
TEST_DB_NAME = url.path.lstrip('/')


def bootstrap():
    print("Connecting to PostgreSQL as superuser...")
    from urllib.parse import urlunparse
    url_parts = urlparse(BOOTSTRAP_URL)
    postgres_url = urlunparse(url_parts._replace(path="/postgres"))
    conn = psycopg2.connect(postgres_url)
    conn.autocommit = True
    cur = conn.cursor()

    # ── 1. Clean existing connections to test database ─────────────────────
    print(f"Terminating connections to database '{TEST_DB_NAME}'...")
    cur.execute(
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = %s AND pid <> pg_backend_pid()",
        (TEST_DB_NAME,)
    )

    # ── 2. Drop existing test database ─────────────────────────────────────
    print(f"Dropping database '{TEST_DB_NAME}' if exists...")
    cur.execute(f"DROP DATABASE IF EXISTS {TEST_DB_NAME}")

    # ── 3. Provision roles idempotently ────────────────────────────────────
    print("Idempotently provisioning roles...")
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
        END
        $$;
    """)

    # Alter passwords
    cur.execute("ALTER ROLE difaryx_api_test WITH PASSWORD %s", (API_PASSWORD,))
    cur.execute("ALTER ROLE difaryx_purge_test WITH PASSWORD %s", (PURGE_PASSWORD,))
    cur.execute("ALTER ROLE difaryx_admin_test WITH PASSWORD %s", (ADMIN_PASSWORD,))
    cur.execute("ALTER ROLE difaryx_rls_test WITH PASSWORD %s", (RLS_TEST_PASSWORD,))

    # Grant group memberships
    cur.execute("GRANT difaryx_app TO difaryx_api_test")
    cur.execute("GRANT difaryx_purge TO difaryx_purge_test")
    cur.execute("GRANT difaryx_app TO difaryx_rls_test")
    cur.execute("GRANT difaryx_app TO difaryx_admin_test")

    # ── 4. Recreate database ───────────────────────────────────────────────
    print(f"Creating database '{TEST_DB_NAME}' owned by difaryx_owner...")
    cur.execute(f"CREATE DATABASE {TEST_DB_NAME} OWNER difaryx_owner ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C'")

    cur.close()
    conn.close()

    # ── 5. Schema and Default Privileges Configuration ─────────────────────
    print(f"Configuring schemas in '{TEST_DB_NAME}'...")
    conn_db = psycopg2.connect(f"host=127.0.0.1 port=5432 dbname={TEST_DB_NAME} user=postgres")
    conn_db.autocommit = True
    cur_db = conn_db.cursor()

    schemas = ["identity", "science", "governance", "outbox"]
    for schema in schemas:
        cur_db.execute(f"CREATE SCHEMA IF NOT EXISTS {schema} AUTHORIZATION difaryx_owner")

    # Grant USAGE on schemas to application permission group
    for schema in schemas:
        cur_db.execute(f"GRANT USAGE ON SCHEMA {schema} TO difaryx_app")
        cur_db.execute(f"GRANT USAGE ON SCHEMA {schema} TO difaryx_purge")

    # Setup least-privilege default privileges:
    # Any table created by difaryx_owner gets:
    #   - SELECT, INSERT, UPDATE for difaryx_app
    #   - SELECT, DELETE for difaryx_purge
    for schema in schemas:
        cur_db.execute(f"""
            ALTER DEFAULT PRIVILEGES FOR ROLE difaryx_owner IN SCHEMA {schema}
            GRANT SELECT, INSERT, UPDATE ON TABLES TO difaryx_app
        """)
        cur_db.execute(f"""
            ALTER DEFAULT PRIVILEGES FOR ROLE difaryx_owner IN SCHEMA {schema}
            GRANT SELECT, DELETE ON TABLES TO difaryx_purge
        """)

    cur_db.close()
    conn_db.close()
    print("Database role and schema bootstrapper complete.")


if __name__ == '__main__':
    bootstrap()
