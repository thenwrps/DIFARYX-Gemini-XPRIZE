"""Check if difaryx_quota_writer role exists and run migration 0010."""
import psycopg2

# Check role existence
conn = psycopg2.connect("postgresql://postgres:@127.0.0.1:5432/postgres")
cur = conn.cursor()
cur.execute("SELECT 1 FROM pg_roles WHERE rolname = 'difaryx_quota_writer'")
exists = cur.fetchone() is not None
print(f"difaryx_quota_writer exists: {exists}")

if not exists:
    print("Creating difaryx_quota_writer role...")
    cur.execute("CREATE ROLE difaryx_quota_writer NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT")
    print("Created.")
else:
    print("Already exists.")

cur.close()
conn.close()