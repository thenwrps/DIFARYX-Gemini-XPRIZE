-- Apply N2 claim predicate fix + reclaim tidy + schema USAGE + qualified columns to dev DB
-- This matches what migration 0012 would produce after editing

GRANT USAGE ON SCHEMA science TO difaryx_validation_worker_bypass;
GRANT USAGE ON SCHEMA identity TO difaryx_validation_worker_bypass;
GRANT SELECT, UPDATE ON science.validation_attempts, science.datasets TO difaryx_validation_worker_bypass;

CREATE OR REPLACE FUNCTION science.validation_worker_claim_across_orgs(
    p_worker_id TEXT,
    p_lease_seconds INT
)
RETURNS TABLE (
    id UUID,
    organization_id UUID,
    dataset_id UUID,
    original_object_id UUID,
    status science.validation_attempt_status,
    attempt_number INT,
    max_attempts INT,
    next_retry_at TIMESTAMPTZ,
    claimed_at TIMESTAMPTZ,
    claimed_by TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    lock_expires_at TIMESTAMPTZ,
    failure_code TEXT,
    failure_details JSONB,
    server_checksum_sha256 TEXT,
    byte_size_verified BIGINT,
    quarantine_reason TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, science
AS $$
DECLARE
    v_attempt science.validation_attempts%ROWTYPE;
BEGIN
    SELECT * INTO v_attempt
    FROM science.validation_attempts
    WHERE (
        (validation_attempts.status = 'queued' AND (validation_attempts.next_retry_at IS NULL OR validation_attempts.next_retry_at <= NOW()))
        OR
        (validation_attempts.status = 'failed' AND validation_attempts.next_retry_at IS NOT NULL AND validation_attempts.next_retry_at <= NOW())
    )
    ORDER BY validation_attempts.created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;
    
    IF v_attempt IS NULL THEN
        RETURN;
    END IF;
    
    UPDATE science.validation_attempts
    SET status = 'claimed',
        claimed_by = p_worker_id,
        claimed_at = NOW(),
        lock_expires_at = NOW() + make_interval(secs => p_lease_seconds),
        started_at = NOW(),
        updated_at = NOW()
    WHERE validation_attempts.id = v_attempt.id
      AND validation_attempts.organization_id = v_attempt.organization_id
    RETURNING * INTO v_attempt;
    
    UPDATE science.datasets
    SET dataset_status = 'validating',
        updated_at = NOW()
    WHERE datasets.id = v_attempt.dataset_id
      AND datasets.organization_id = v_attempt.organization_id
      AND datasets.dataset_status = 'pending_validation';
    
    RETURN QUERY SELECT
        v_attempt.id,
        v_attempt.organization_id,
        v_attempt.dataset_id,
        v_attempt.original_object_id,
        v_attempt.status,
        v_attempt.attempt_number,
        v_attempt.max_attempts,
        v_attempt.next_retry_at,
        v_attempt.claimed_at,
        v_attempt.claimed_by,
        v_attempt.started_at,
        v_attempt.completed_at,
        v_attempt.lock_expires_at,
        v_attempt.failure_code,
        v_attempt.failure_details,
        v_attempt.server_checksum_sha256,
        v_attempt.byte_size_verified,
        v_attempt.quarantine_reason,
        v_attempt.created_at,
        v_attempt.updated_at;
END;
$$;

CREATE OR REPLACE FUNCTION science.validation_worker_reclaim_stale_across_orgs()
RETURNS TABLE (
    id UUID,
    organization_id UUID,
    dataset_id UUID,
    original_object_id UUID,
    status science.validation_attempt_status,
    attempt_number INT,
    max_attempts INT,
    next_retry_at TIMESTAMPTZ,
    claimed_at TIMESTAMPTZ,
    claimed_by TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    lock_expires_at TIMESTAMPTZ,
    failure_code TEXT,
    failure_details JSONB,
    server_checksum_sha256 TEXT,
    byte_size_verified BIGINT,
    quarantine_reason TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, science
AS $$
DECLARE
    v_attempt science.validation_attempts%ROWTYPE;
BEGIN
    SELECT * INTO v_attempt
    FROM science.validation_attempts
    WHERE validation_attempts.status IN ('claimed', 'running')
      AND validation_attempts.lock_expires_at < NOW()
    ORDER BY validation_attempts.lock_expires_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;
    
    IF v_attempt IS NULL THEN
        RETURN;
    END IF;
    
    IF v_attempt.attempt_number >= v_attempt.max_attempts THEN
        UPDATE science.validation_attempts
        SET status = 'quarantined',
            claimed_by = NULL,
            claimed_at = NULL,
            lock_expires_at = NULL,
            completed_at = NOW(),
            failure_code = 'max_attempts_exceeded',
            failure_details = jsonb_build_object('reason', 'max retry attempts exceeded after stale lock'),
            quarantine_reason = 'max_attempts_exceeded',
            updated_at = NOW()
        WHERE validation_attempts.id = v_attempt.id
          AND validation_attempts.organization_id = v_attempt.organization_id
        RETURNING * INTO v_attempt;
        
        UPDATE science.datasets
        SET dataset_status = 'quarantined',
            updated_at = NOW()
        WHERE datasets.id = v_attempt.dataset_id
          AND datasets.organization_id = v_attempt.organization_id
          AND datasets.dataset_status = 'validating';
    ELSE
        UPDATE science.validation_attempts
        SET status = 'queued',
            claimed_by = NULL,
            claimed_at = NULL,
            lock_expires_at = NULL,
            started_at = NULL,
            next_retry_at = NULL,
            attempt_number = validation_attempts.attempt_number + 1,
            updated_at = NOW()
        WHERE validation_attempts.id = v_attempt.id
          AND validation_attempts.organization_id = v_attempt.organization_id
        RETURNING * INTO v_attempt;
        
        UPDATE science.datasets
        SET dataset_status = 'pending_validation',
            updated_at = NOW()
        WHERE datasets.id = v_attempt.dataset_id
          AND datasets.organization_id = v_attempt.organization_id
          AND datasets.dataset_status = 'validating';
    END IF;
    
    RETURN QUERY SELECT
        v_attempt.id,
        v_attempt.organization_id,
        v_attempt.dataset_id,
        v_attempt.original_object_id,
        v_attempt.status,
        v_attempt.attempt_number,
        v_attempt.max_attempts,
        v_attempt.next_retry_at,
        v_attempt.claimed_at,
        v_attempt.claimed_by,
        v_attempt.started_at,
        v_attempt.completed_at,
        v_attempt.lock_expires_at,
        v_attempt.failure_code,
        v_attempt.failure_details,
        v_attempt.server_checksum_sha256,
        v_attempt.byte_size_verified,
        v_attempt.quarantine_reason,
        v_attempt.created_at,
        v_attempt.updated_at;
END;
$$;
