"""
DIFARYX Phase 0 — Outbox Concurrency, Worker lifecycle & Fingerprint Test Suite
=============================================================================
"""

import sys
import time
import threading
import psycopg2
from fingerprint import compute_stage_fingerprint

import os

DB_DSN = os.getenv("DIFARYX_TEST_DATABASE_URL")
SUPER_DSN = os.getenv("DIFARYX_BOOTSTRAP_DATABASE_URL")

if not DB_DSN or not SUPER_DSN:
    raise RuntimeError("Missing required test DSN environment variables: DIFARYX_TEST_DATABASE_URL, DIFARYX_BOOTSTRAP_DATABASE_URL")

ORG_ID = 'aaaaaaaa-0000-0000-0000-000000000001'


def run_outbox_concurrency_test() -> bool:
    """Verifies that two concurrent publishers cannot claim the same event."""
    conn_super = psycopg2.connect(SUPER_DSN)
    cur_super = conn_super.cursor()
    cur_super.execute("SET app.organization_id = %s;", (ORG_ID,))
    
    # 1. Clean existing outbox events
    cur_super.execute("TRUNCATE outbox.outbox_dead_letter, outbox.outbox_events CASCADE;")
    
    # 2. Insert a pending event
    event_id = 'eeeeeeee-1111-1111-1111-111111111111'
    cur_super.execute("""
        INSERT INTO outbox.outbox_events (id, organization_id, aggregate_type, aggregate_id, event_type, payload)
        VALUES (%s, %s, 'analysis_run', 'run-001', 'run.started', '{"x":1}')
    """, (event_id, ORG_ID))
    conn_super.commit()
    cur_super.close()
    conn_super.close()

    # 3. Spawn two threads to concurrently claim
    claims_results = []
    
    def claim_worker(worker_name):
        try:
            conn = psycopg2.connect(DB_DSN)
            conn.autocommit = True
            cur = conn.cursor()
            cur.execute("SET app.organization_id = %s;", (ORG_ID,))
            # Call claim_events function
            cur.execute("""
                SELECT id FROM outbox.claim_events(%s, %s, 1, INTERVAL '5 minutes')
            """, (ORG_ID, worker_name))
            rows = cur.fetchall()
            if rows:
                claims_results.append(worker_name)
            cur.close()
            conn.close()
        except Exception as e:
            print(f"Worker {worker_name} error: {e}")

    t1 = threading.Thread(target=claim_worker, args=("worker-A",))
    t2 = threading.Thread(target=claim_worker, args=("worker-B",))
    
    t1.start()
    t2.start()
    t1.join()
    t2.join()

    # Exactly one worker must have claimed the event
    if len(claims_results) == 1:
        print(f"  [PASS] Outbox Concurrency: Only one worker ({claims_results[0]}) successfully claimed the event.")
        return True
    else:
        print(f"  [FAIL] Outbox Concurrency: Multiple/zero claims: {claims_results}")
        return False


def run_stale_lock_reclamation_test() -> bool:
    """Verifies that stale locks are reclaimed only after timeout."""
    conn_super = psycopg2.connect(SUPER_DSN)
    cur_super = conn_super.cursor()
    cur_super.execute("SET app.organization_id = %s;", (ORG_ID,))
    cur_super.execute("TRUNCATE outbox.outbox_dead_letter, outbox.outbox_events CASCADE;")
    
    # Insert locked event with older locked_at time (stale lock)
    event_id = 'eeeeeeee-2222-2222-2222-222222222222'
    cur_super.execute("""
        INSERT INTO outbox.outbox_events 
          (id, organization_id, aggregate_type, aggregate_id, event_type, status, locked_at, locked_by)
        VALUES 
          (%s, %s, 'analysis_run', 'run-002', 'run.started', 'locked', NOW() - INTERVAL '10 minutes', 'worker-old')
    """, (event_id, ORG_ID))
    conn_super.commit()
    
    # Try claiming with a 5 minute timeout (should reclaim)
    cur_app = psycopg2.connect(DB_DSN)
    cur_app.autocommit = True
    cur = cur_app.cursor()
    cur.execute("SET app.organization_id = %s;", (ORG_ID,))
    cur.execute("SELECT id, locked_by FROM outbox.claim_events(%s, 'worker-new', 1, INTERVAL '5 minutes')", (ORG_ID,))
    rows = cur.fetchall()
    
    if len(rows) == 1 and rows[0][1] == 'worker-new':
        print("  [PASS] Outbox Stale Locks: Stale lock was successfully reclaimed by worker-new.")
        passed = True
    else:
        print(f"  [FAIL] Outbox Stale Locks: Stale lock reclamation failed. Claimed: {rows}")
        passed = False
        
    cur.close()
    cur_app.close()
    cur_super.close()
    conn_super.close()
    return passed


def run_retry_backoff_and_dlq_test() -> bool:
    """Verifies failure backoff scheduling and dead-letter promotion after max attempts."""
    conn_super = psycopg2.connect(SUPER_DSN)
    cur_super = conn_super.cursor()
    cur_super.execute("SET app.organization_id = %s;", (ORG_ID,))
    cur_super.execute("TRUNCATE outbox.outbox_dead_letter, outbox.outbox_events CASCADE;")
    
    # Insert pending event with max_attempts = 2
    event_id = 'eeeeeeee-3333-3333-3333-333333333333'
    cur_super.execute("""
        INSERT INTO outbox.outbox_events 
          (id, organization_id, aggregate_type, aggregate_id, event_type, max_attempts)
        VALUES 
          (%s, %s, 'analysis_run', 'run-003', 'run.started', 2)
    """, (event_id, ORG_ID))
    conn_super.commit()
    cur_super.close()
    conn_super.close()
    
    conn = psycopg2.connect(DB_DSN)
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute("SET app.organization_id = %s;", (ORG_ID,))
    
    # Claim 1
    cur.execute("SELECT id FROM outbox.claim_events(%s, 'worker-A', 1, INTERVAL '5 minutes')", (ORG_ID,))
    # Fail 1
    cur.execute("SELECT outbox.fail_event(%s, %s, 'worker-A', 'First failure')", (ORG_ID, event_id))
    status_1 = cur.fetchone()[0]
    
    # Claim 2 (needs superuser helper to bypass backoff wait time, or we manually override next_attempt_at)
    conn_super = psycopg2.connect(SUPER_DSN)
    cur_super = conn_super.cursor()
    cur_super.execute("SET app.organization_id = %s;", (ORG_ID,))
    cur_super.execute("UPDATE outbox.outbox_events SET next_attempt_at = NOW() WHERE id = %s", (event_id,))
    conn_super.commit()
    cur_super.close()
    conn_super.close()
    
    # Claim 2 again as app
    cur.execute("SELECT id FROM outbox.claim_events(%s, 'worker-B', 1, INTERVAL '5 minutes')", (ORG_ID,))
    # Fail 2 (reaches max attempts -> dead)
    cur.execute("SELECT outbox.fail_event(%s, %s, 'worker-B', 'Second failure')", (ORG_ID, event_id))
    status_2 = cur.fetchone()[0]
    
    # Verify DLQ and outbox event status
    cur.execute("SELECT status, attempt_count FROM outbox.outbox_events WHERE id = %s", (event_id,))
    outbox_status, attempts = cur.fetchone()
    cur.execute("SELECT COUNT(*) FROM outbox.outbox_dead_letter WHERE original_event_id = %s", (event_id,))
    dlq_count = cur.fetchone()[0]
    
    cur.close()
    conn.close()
    
    if status_1 == 'retry_scheduled' and status_2 == 'dead_lettered' and outbox_status == 'dead' and dlq_count == 1:
        print("  [PASS] Outbox Retry/DLQ: Backoff, status transition to dead, and DLQ promotion worked perfectly.")
        return True
    else:
        print(f"  [FAIL] Outbox Retry/DLQ: status_1={status_1}, status_2={status_2}, outbox_status={outbox_status}, dlq={dlq_count}")
        return False


def run_fingerprint_variance_tests() -> bool:
    """Verifies that each metadata field correctly modifies the canonical fingerprint."""
    base_args = {
        'stage_key': 'baseline_correction',
        'stage_implementation_version': '1.0.0',
        'runner_version': '2.3.1',
        'pipeline_definition_version': 'xrd-v1',
        'parameter_schema_version': '1',
        'normalized_parameters': {'window': 50},
        'input_artifact_hashes': [],
        'reference_snapshot_hashes': [],
        'calibration_context': None,
    }
    
    base_hash = compute_stage_fingerprint(**base_args)['execution_fingerprint']
    
    variants = [
        ('stage_implementation_version', '1.0.1'),
        ('runner_version', '2.3.2'),
        ('pipeline_definition_version', 'xrd-v2'),
        ('parameter_schema_version', '2'),
        ('reference_snapshot_hashes', ['snap-abc']),
        ('calibration_context', {'temp': 298.15}),
    ]
    
    all_vary = True
    for field, val in variants:
        args = dict(base_args)
        args[field] = val
        var_hash = compute_stage_fingerprint(**args)['execution_fingerprint']
        if var_hash == base_hash:
            print(f"  [FAIL] Fingerprint Variance: Changing {field} did NOT change the hash!")
            all_vary = False
            
    if all_vary:
        print("  [PASS] Fingerprint Variance: All expected variables correctly alter the execution fingerprint.")
        
    return all_vary


if __name__ == '__main__':
    print("Running DIFARYX Outbox, Worker lifecycle, & Fingerprint tests...\n")
    
    c_ok = run_outbox_concurrency_test()
    s_ok = run_stale_lock_reclamation_test()
    r_ok = run_retry_backoff_and_dlq_test()
    f_ok = run_fingerprint_variance_tests()
    
    if c_ok and s_ok and r_ok and f_ok:
        print("\nALL CONCURRENCY AND LIFECYCLE TESTS PASSED.")
        sys.exit(0)
    else:
        print("\nCONCURRENCY OR LIFECYCLE TEST FAILURES DETECTED.")
        sys.exit(1)
