"""Debug: check role visibility across databases."""
import psycopg2

# Check from postgres DB
conn1 = psycopg2.connect("postgresql://postgres:@127.0.0.1:5432/postgres")
cur1 = conn1.cursor()
cur1.execute("SELECT 1 FROM pg_roles WHERE rolname = 'difaryx_quota_writer'")
r1 = cur1.fetchone()
print(f"From postgres DB: {r1}")

# Check if test DB exists
cur1.execute("SELECT 1 FROM pg_database WHERE datname = 'difaryx_phase0_test'")
r2 = cur1.fetchone()
print(f"Test DB exists: {r2}")
cur1.close()
conn1.close()

# Try connecting to test DB
try:
    conn2 = psycopg2.connect("postgresql://postgres:@127.0.0.1:5432/difaryx_phase0_test")
    cur2 = conn2.cursor()
    cur2.execute("SELECT 1 FROM pg_roles WHERE rolname = 'difaryx_quota_writer'")
    r3 = cur2.fetchone()
    print(f"From test DB: {r3}")
    cur2.close()
    conn2.close()
except Exception as e:
    print(f"Test DB connection error: {e}")