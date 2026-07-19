"""Create quota writer role and run migration 0010 round-trip."""
import os
import sys
import subprocess
import psycopg2

# Role is cluster-wide. Must use autocommit for DDL.
print("Creating difaryx_quota_writer role...")
conn = psycopg2.connect("postgresql://postgres:@127.0.0.1:5432/postgres")
conn.autocommit = True
cur = conn.cursor()
cur.execute("SELECT 1 FROM pg_roles WHERE rolname = 'difaryx_quota_writer'")
if not cur.fetchone():
    cur.execute("CREATE ROLE difaryx_quota_writer NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT")
    print("Created.")
else:
    print("Already exists.")

# Verify from test DB too
cur.execute("SELECT 1 FROM pg_roles WHERE rolname = 'difaryx_quota_writer'")
assert cur.fetchone() is not None, "Role not found!"
print("Verified.")
cur.close()
conn.close()

# Run migration round-trip
os.chdir(os.path.join(os.path.dirname(__file__), ".."))
db_url = "postgresql://postgres:@127.0.0.1:5432/difaryx_phase0_test"
env = os.environ.copy()
env["DATABASE_URL"] = db_url

for step_name, cmd in [
    ("STEP 1: Upgrade 0009 -> 0010", ["-m", "alembic", "upgrade", "0010"]),
    ("STEP 2: Downgrade 0010 -> 0009", ["-m", "alembic", "downgrade", "0009"]),
    ("STEP 3: Upgrade 0009 -> 0010 (second pass)", ["-m", "alembic", "upgrade", "0010"]),
]:
    print(f"\n{'=' * 60}")
    print(step_name)
    print('=' * 60)
    res = subprocess.run(
        [sys.executable] + cmd,
        cwd=os.getcwd(), env=env, capture_output=True, text=True
    )
    print(res.stdout)
    if res.returncode != 0:
        print("STDERR:", res.stderr)
        print(f"FAILED: {step_name}")
        sys.exit(1)
    print("PASS")

print("\n" + "=" * 60)
print("ALL MIGRATION ROUND-TRIP TESTS PASSED")
print("=" * 60)