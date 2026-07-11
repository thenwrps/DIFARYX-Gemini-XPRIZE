"""Phase 0 - constraints and triggers: SSE sequence function, evidence state transition rules,
                                         outbox claim atomicity, immutability enforcement

Revision ID: 0006
Revises: 0005
Create Date: 2026-07-11
"""
from alembic import op

revision = '0006'
down_revision = '0005'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── SSE sequence allocation function (Issue #20) ──────────────────────────
    # Atomically increments analysis_runs.last_event_seq and inserts the event
    # in the same transaction. Caller passes event_type, payload, is_terminal.
    op.execute("""
        CREATE OR REPLACE FUNCTION science.emit_run_event(
            p_organization_id UUID,
            p_run_id          UUID,
            p_event_type      TEXT,
            p_payload         JSONB DEFAULT '{}',
            p_is_terminal     BOOLEAN DEFAULT FALSE
        )
        RETURNS INTEGER
        LANGUAGE plpgsql
        AS $$
        DECLARE
            v_seq INTEGER;
        BEGIN
            -- Atomically claim next sequence number on the run
            UPDATE science.analysis_runs
               SET last_event_seq = last_event_seq + 1
             WHERE organization_id = p_organization_id
               AND id = p_run_id
            RETURNING last_event_seq INTO v_seq;

            IF v_seq IS NULL THEN
                RAISE EXCEPTION 'run not found: org=% run=%', p_organization_id, p_run_id;
            END IF;

            INSERT INTO science.analysis_run_events
                (organization_id, run_id, event_seq, event_type, payload, is_terminal)
            VALUES
                (p_organization_id, p_run_id, v_seq, p_event_type, p_payload, p_is_terminal);

            RETURN v_seq;
        END;
        $$
    """)

    # ── Evidence state transition trigger (Issue #19) ────────────────────────
    # Enforces: draft → approved|rejected|withdrawn
    #           approved → superseded|withdrawn
    #           superseded / rejected / withdrawn → terminal (immutable)
    # Approved content is locked (is_content_locked = TRUE on transition to approved).
    op.execute("""
        CREATE OR REPLACE FUNCTION science.enforce_evidence_state_transition()
        RETURNS TRIGGER
        LANGUAGE plpgsql
        AS $$
        BEGIN
            -- 1. Check content immutability first (independent of state change)
            IF OLD.is_content_locked AND (
                NEW.content_hash  IS DISTINCT FROM OLD.content_hash  OR
                NEW.artifact_id   IS DISTINCT FROM OLD.artifact_id   OR
                NEW.claim_summary IS DISTINCT FROM OLD.claim_summary
            ) THEN
                RAISE EXCEPTION
                    'evidence version % is content-locked and cannot be edited', OLD.id;
            END IF;

            -- 2. If state is not changing, no further checks needed
            IF OLD.evidence_state = NEW.evidence_state THEN
                RETURN NEW;
            END IF;

            -- 3. Terminal states: no further transitions allowed
            IF OLD.evidence_state IN ('superseded', 'rejected', 'withdrawn') THEN
                RAISE EXCEPTION
                    'evidence version % is in terminal state % and cannot be modified',
                    OLD.id, OLD.evidence_state;
            END IF;

            -- 4. Valid transition table
            IF NOT (
                (OLD.evidence_state = 'draft'    AND NEW.evidence_state IN ('approved', 'rejected', 'withdrawn'))
                OR
                (OLD.evidence_state = 'approved' AND NEW.evidence_state IN ('superseded', 'withdrawn'))
            ) THEN
                RAISE EXCEPTION
                    'invalid evidence state transition: % -> %',
                    OLD.evidence_state, NEW.evidence_state;
            END IF;

            -- 5. Lock content on approval
            IF NEW.evidence_state = 'approved' THEN
                NEW.is_content_locked := TRUE;
            END IF;

            RETURN NEW;
        END;
        $$
    """)

    op.execute("""
        CREATE TRIGGER trg_evidence_state_transition
        BEFORE UPDATE ON science.evidence_versions
        FOR EACH ROW
        EXECUTE FUNCTION science.enforce_evidence_state_transition()
    """)

    # ── Outbox atomic claim function (Issue #8) ───────────────────────────────
    # Claims up to :batch_size pending (or stale-locked) rows atomically via
    # SELECT ... FOR UPDATE SKIP LOCKED, then sets locked_at/locked_by/status.
    op.execute("""
        CREATE OR REPLACE FUNCTION outbox.claim_events(
            p_organization_id UUID,
            p_worker_id       TEXT,
            p_batch_size      INTEGER DEFAULT 10,
            p_lock_timeout    INTERVAL DEFAULT INTERVAL '5 minutes'
        )
        RETURNS SETOF outbox.outbox_events
        LANGUAGE plpgsql
        AS $$
        BEGIN
            RETURN QUERY
            UPDATE outbox.outbox_events e
               SET status       = 'locked',
                   locked_at    = NOW(),
                   locked_by    = p_worker_id,
                   attempt_count    = e.attempt_count + 1,
                   last_attempt_at  = NOW()
              FROM (
                SELECT id, organization_id
                  FROM outbox.outbox_events
                  WHERE organization_id = p_organization_id
                    AND next_attempt_at <= NOW()
                    AND (
                        status IN ('pending', 'failed')
                        OR (status = 'locked' AND locked_at < NOW() - p_lock_timeout)
                    )
                 ORDER BY next_attempt_at
                 LIMIT p_batch_size
                   FOR UPDATE SKIP LOCKED
              ) AS candidates
             WHERE e.id = candidates.id
               AND e.organization_id = candidates.organization_id
            RETURNING e.*;
        END;
        $$
    """)

    # ── Outbox complete/fail functions (Issue #8) ─────────────────────────────
    # Complete: confirms lock ownership before marking delivered.
    op.execute("""
        CREATE OR REPLACE FUNCTION outbox.complete_event(
            p_organization_id UUID,
            p_event_id        UUID,
            p_worker_id       TEXT
        )
        RETURNS BOOLEAN
        LANGUAGE plpgsql
        AS $$
        DECLARE
            v_updated INTEGER;
        BEGIN
            UPDATE outbox.outbox_events
               SET status       = 'delivered',
                   delivered_at = NOW(),
                   locked_at    = NULL,
                   locked_by    = NULL
             WHERE organization_id = p_organization_id
               AND id            = p_event_id
               AND locked_by     = p_worker_id
               AND status        = 'locked';

            GET DIAGNOSTICS v_updated = ROW_COUNT;
            RETURN v_updated = 1;
        END;
        $$
    """)

    # Fail: clears lock, applies exponential backoff, dead-letters after max_attempts.
    op.execute("""
        CREATE OR REPLACE FUNCTION outbox.fail_event(
            p_organization_id UUID,
            p_event_id        UUID,
            p_worker_id       TEXT,
            p_error           TEXT
        )
        RETURNS TEXT
        LANGUAGE plpgsql
        AS $$
        DECLARE
            v_row outbox.outbox_events;
            v_backoff_seconds INTEGER;
        BEGIN
            SELECT * INTO v_row
              FROM outbox.outbox_events
             WHERE organization_id = p_organization_id
               AND id = p_event_id
               AND locked_by = p_worker_id
               AND status = 'locked';

            IF NOT FOUND THEN
                RETURN 'not_owner';
            END IF;

            -- Exponential backoff: 30s, 60s, 120s, 240s, 480s
            v_backoff_seconds := 30 * (2 ^ LEAST(v_row.attempt_count - 1, 4));

            IF v_row.attempt_count >= v_row.max_attempts THEN
                -- Move to dead letter
                INSERT INTO outbox.outbox_dead_letter
                    (organization_id, original_event_org_id, original_event_id,
                     aggregate_type, aggregate_id, event_type, payload, final_error)
                VALUES
                    (p_organization_id, p_organization_id, p_event_id,
                     v_row.aggregate_type, v_row.aggregate_id, v_row.event_type,
                     v_row.payload, p_error);

                UPDATE outbox.outbox_events
                   SET status     = 'dead',
                       locked_at  = NULL,
                       locked_by  = NULL,
                       last_error = p_error
                 WHERE organization_id = p_organization_id AND id = p_event_id;

                RETURN 'dead_lettered';
            ELSE
                UPDATE outbox.outbox_events
                   SET status          = 'failed',
                       locked_at       = NULL,
                       locked_by       = NULL,
                       last_error      = p_error,
                       next_attempt_at = NOW() + (v_backoff_seconds || ' seconds')::INTERVAL
                 WHERE organization_id = p_organization_id AND id = p_event_id;

                RETURN 'retry_scheduled';
            END IF;
        END;
        $$
    """)


def downgrade() -> None:
    op.execute('DROP FUNCTION IF EXISTS outbox.fail_event CASCADE')
    op.execute('DROP FUNCTION IF EXISTS outbox.complete_event CASCADE')
    op.execute('DROP FUNCTION IF EXISTS outbox.claim_events CASCADE')
    op.execute('DROP TRIGGER IF EXISTS trg_evidence_state_transition ON science.evidence_versions')
    op.execute('DROP FUNCTION IF EXISTS science.enforce_evidence_state_transition CASCADE')
    op.execute('DROP FUNCTION IF EXISTS science.emit_run_event CASCADE')
