"""Check if the quota writer role is visible from the test database."""
import psycopg2

db_url = "postgresql://postgres:@127.0.0.1:5432/difaryx_phase0_test"
conn = psycopg2.connect(db_url)
cur = conn.cursor()
cur.execute("SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'difaryx_quota_writer'")
r = cur.fetchone()
print(f"From test DB - role found: {r}")
cur.close()
conn.close()