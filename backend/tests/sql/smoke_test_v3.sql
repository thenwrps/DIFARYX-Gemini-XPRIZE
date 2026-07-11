-- ============================================================
-- DIFARYX Phase 0 Smoke Test v3
-- 2 orgs, 2 users, private projects, runs, cross-tenant denial,
-- evidence state transitions, outbox claim, stage-result links
-- ============================================================

\set ON_ERROR_STOP on

-- ── 0. Clean prior test data (safe truncation order) ─────────
TRUNCATE outbox.outbox_dead_letter, outbox.outbox_events CASCADE;
TRUNCATE governance.usage_events, governance.quota_ledger CASCADE;
TRUNCATE governance.audit_log, governance.ai_consent_records, governance.ai_policies CASCADE;
TRUNCATE governance.ingestion_policies CASCADE;
TRUNCATE science.reasoning_runs CASCADE;
TRUNCATE science.fusion_run_evidence, science.fusion_runs CASCADE;
TRUNCATE science.analysis_run_reference_snapshots CASCADE;
TRUNCATE science.reference_library_scopes,
         science.organization_reference_library_grants CASCADE;
TRUNCATE science.reference_entries, science.reference_snapshots,
         science.reference_libraries CASCADE;
TRUNCATE science.analysis_run_events CASCADE;
TRUNCATE science.evidence_versions, science.evidence_items CASCADE;
TRUNCATE science.analysis_stage_results, science.analysis_stage_fingerprints CASCADE;
TRUNCATE science.analysis_stages, science.analysis_artifacts CASCADE;
TRUNCATE science.analysis_runs, science.projects CASCADE;
TRUNCATE identity.api_keys, identity.memberships, identity.users,
         identity.organizations CASCADE;

-- ── 1. Verify schema: count tables across all schemas ─────────
\echo '=== SCHEMA TABLE COUNT ==='
SELECT schemaname, COUNT(*) AS table_count
FROM pg_tables
WHERE schemaname IN ('identity','science','governance','outbox')
GROUP BY schemaname ORDER BY schemaname;

-- ── 2. Seed two organizations ─────────────────────────────────
INSERT INTO identity.organizations (id, slug, display_name)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'org-alpha', 'Alpha Research'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'org-beta',  'Beta Institute');

-- ── 3. Seed two users ────────────────────────────────────────
INSERT INTO identity.users (id, organization_id, email, display_name)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001',
   'alice@alpha.com', 'Alice'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000001',
   'bob@beta.com',   'Bob');

-- ── 4. Seed private projects ──────────────────────────────────
INSERT INTO science.projects (id, organization_id, owner_user_id, title)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000002', 'Alpha XRD Study'),
  ('bbbbbbbb-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000001',
   'bbbbbbbb-0000-0000-0000-000000000002', 'Beta FTIR Study');

-- ── 5. Seed analysis runs ─────────────────────────────────────
INSERT INTO science.analysis_runs
    (id, organization_id, project_id, technique, submitted_by,
     worker_version, container_image_digest)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000003', 'xrd',
   'aaaaaaaa-0000-0000-0000-000000000002', '2.3.1',
   'sha256:abc123def456'),
  ('bbbbbbbb-0000-0000-0000-000000000004', 'bbbbbbbb-0000-0000-0000-000000000001',
   'bbbbbbbb-0000-0000-0000-000000000003', 'ftir',
   'bbbbbbbb-0000-0000-0000-000000000002', '2.3.1',
   'sha256:abc123def456');

-- ── 6. Seed an analysis stage for alpha run ───────────────────
INSERT INTO science.analysis_stages
    (id, organization_id, run_id, stage_key, stage_implementation_version,
     stage_status, worker_version)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000004', 'baseline_correction', '1.0.0',
   'completed', '2.3.1');

-- ── 7. Seed artifact and stage result (calculated) ────────────
INSERT INTO science.analysis_artifacts
    (id, organization_id, run_id, producing_stage_id, artifact_kind,
     object_key, content_hash_sha256, size_bytes)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000005',
   'processed_signal', 'alpha/run1/baseline.dat',
   'sha256:deadbeef', 4096);

INSERT INTO science.analysis_stage_results
    (organization_id, stage_id, artifact_id, result_role, output_order, reuse_state)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000005',
   'aaaaaaaa-0000-0000-0000-000000000006',
   'primary', 0, 'calculated');

-- ── 8. SSE sequence allocation test ─────────────────────────
\echo '=== SSE SEQUENCE TEST ==='
SELECT science.emit_run_event(
    'aaaaaaaa-0000-0000-0000-000000000001',
    'aaaaaaaa-0000-0000-0000-000000000004',
    'run.started', '{"worker":"2.3.1"}', FALSE
) AS seq1;
SELECT science.emit_run_event(
    'aaaaaaaa-0000-0000-0000-000000000001',
    'aaaaaaaa-0000-0000-0000-000000000004',
    'run.completed', '{}', TRUE
) AS seq2;
SELECT event_seq, event_type, is_terminal
  FROM science.analysis_run_events
 WHERE organization_id = 'aaaaaaaa-0000-0000-0000-000000000001'
   AND run_id = 'aaaaaaaa-0000-0000-0000-000000000004'
 ORDER BY event_seq;

-- ── 9. Scope CHECK constraint test ────────────────────────────
\echo '=== SCOPE CHECK CONSTRAINTS ==='
-- Insert a reference library first
INSERT INTO science.reference_libraries
    (id, organization_id, name, technique, version, created_by)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000007', 'aaaaaaaa-0000-0000-0000-000000000001',
   'RRUFF Alpha', 'xrd', '1.0.0', 'aaaaaaaa-0000-0000-0000-000000000002');

-- Valid scope: organization_private
INSERT INTO science.reference_library_scopes
    (organization_id, library_id, scope_type, scope_org_id)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000007',
   'organization_private', 'aaaaaaaa-0000-0000-0000-000000000001');
\echo 'Valid organization_private scope: OK'

-- Invalid scope: global with org set (must fail)
DO $$
BEGIN
    BEGIN
        INSERT INTO science.reference_library_scopes
            (organization_id, library_id, scope_type, scope_org_id)
        VALUES
          ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000007',
           'global', 'aaaaaaaa-0000-0000-0000-000000000001');
        RAISE EXCEPTION 'ERROR: scope CHECK constraint did not fire!';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'PASS: global scope with scope_org_id correctly rejected';
    END;
END;
$$;

-- ── 10. Evidence state transition tests ───────────────────────
\echo '=== EVIDENCE STATE TRANSITIONS ==='

-- Seed evidence node
INSERT INTO science.evidence_items
    (id, organization_id, project_id, run_id, technique)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000008', 'aaaaaaaa-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000004', 'xrd');

-- Seed draft version
INSERT INTO science.evidence_versions
    (id, organization_id, evidence_node_id, version_number, content_hash, evidence_state)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000009', 'aaaaaaaa-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000008', 1, 'hash_v1', 'draft');

-- Transition draft → approved (valid)
UPDATE science.evidence_versions
   SET evidence_state = 'approved', state_changed_at = NOW()
 WHERE id = 'aaaaaaaa-0000-0000-0000-000000000009'
   AND organization_id = 'aaaaaaaa-0000-0000-0000-000000000001';
\echo 'draft -> approved: OK'

-- Attempt to edit content after approval (must fail)
DO $$
BEGIN
    BEGIN
        UPDATE science.evidence_versions
           SET content_hash = 'tampered_hash'
         WHERE id = 'aaaaaaaa-0000-0000-0000-000000000009'
           AND organization_id = 'aaaaaaaa-0000-0000-0000-000000000001';
        RAISE EXCEPTION 'ERROR: immutability trigger did not fire!';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%content-locked%' THEN
            RAISE NOTICE 'PASS: content edit after approval correctly blocked';
        ELSE
            RAISE;
        END IF;
    END;
END;
$$;

-- Transition approved → superseded (valid)
UPDATE science.evidence_versions
   SET evidence_state = 'superseded', state_changed_at = NOW()
 WHERE id = 'aaaaaaaa-0000-0000-0000-000000000009'
   AND organization_id = 'aaaaaaaa-0000-0000-0000-000000000001';
\echo 'approved -> superseded: OK'

-- Attempt superseded → draft (must fail — terminal)
DO $$
BEGIN
    BEGIN
        UPDATE science.evidence_versions
           SET evidence_state = 'draft'
         WHERE id = 'aaaaaaaa-0000-0000-0000-000000000009'
           AND organization_id = 'aaaaaaaa-0000-0000-0000-000000000001';
        RAISE EXCEPTION 'ERROR: terminal state guard did not fire!';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%terminal state%' THEN
            RAISE NOTICE 'PASS: terminal state transition correctly blocked';
        ELSE
            RAISE;
        END IF;
    END;
END;
$$;

-- ── 11. Outbox claim atomicity test ───────────────────────────
\echo '=== OUTBOX CLAIM TEST ==='
INSERT INTO outbox.outbox_events
    (id, organization_id, aggregate_type, aggregate_id, event_type, payload)
VALUES
  ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
   'analysis_run', 'aaaaaaaa-0000-0000-0000-000000000004', 'run.completed',
   '{"status":"completed"}');

SELECT id, aggregate_type, status, locked_by, attempt_count
FROM outbox.claim_events(
    'aaaaaaaa-0000-0000-0000-000000000001',
    'worker-01', 1, INTERVAL '5 minutes'
);

-- Complete the event
SELECT outbox.complete_event(
    'aaaaaaaa-0000-0000-0000-000000000001',
    'cccccccc-0000-0000-0000-000000000001',
    'worker-01'
) AS completed;

SELECT status, delivered_at IS NOT NULL AS has_delivered_at
  FROM outbox.outbox_events
 WHERE id = 'cccccccc-0000-0000-0000-000000000001';

-- ── 12. RLS cross-tenant isolation (non-superuser) ────────────
\echo '=== CROSS-TENANT ISOLATION (test role) ==='
SET ROLE difaryx_rls_test;
SET app.organization_id = 'aaaaaaaa-0000-0000-0000-000000000001';

\echo '-- Alpha sees own project (expect 1):'
SELECT COUNT(*) AS alpha_projects FROM science.projects;

\echo '-- Alpha reads beta run by UUID (expect 0):'
SELECT COUNT(*) AS cross_read
FROM science.analysis_runs
WHERE id = 'bbbbbbbb-0000-0000-0000-000000000004';

\echo '-- Alpha writes to beta project (expect UPDATE 0):'
UPDATE science.projects
   SET title = 'HIJACKED'
 WHERE organization_id = 'bbbbbbbb-0000-0000-0000-000000000001';

RESET ROLE;
RESET app.organization_id;

\echo ''
\echo '=== SMOKE TEST v3 COMPLETE ==='
