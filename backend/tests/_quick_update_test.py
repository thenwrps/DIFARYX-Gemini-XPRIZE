import psycopg2
conn = psycopg2.connect("postgresql://difaryx_rls_test:rls_test_pw@127.0.0.1:5432/difaryx_phase0_test")
cur = conn.cursor()
cur.execute("SET app.organization_id = 'aaaaaaaa-0000-0000-0000-000000000001'")
cur.execute("UPDATE science.projects SET title='HAX' WHERE organization_id='bbbbbbbb-0000-0000-0000-000000000001'")
print("UPDATE affected", cur.rowcount, "rows (expect 0)")
conn.rollback()
cur.close()
conn.close()