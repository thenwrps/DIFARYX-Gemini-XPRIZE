import os, psycopg2
url = os.environ.get("DATABASE_URL", "postgresql://difaryx_owner:difaryx_owner_pw@127.0.0.1:5432/difaryx_phase0_test")
# Use owner (superuser) to inspect
conn = psycopg2.connect(url)
cur = conn.cursor()
for tbl in ['projects', 'datasets', 'dataset_objects', 'validation_attempts']:
    print(f"\n=== science.{tbl} ===")
    cur.execute("SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='science' AND table_name=%s ORDER BY ordinal_position", (tbl,))
    for r in cur.fetchall():
        print(r)
conn.close()