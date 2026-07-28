# Phase 2F: Independent Security & Evidence Integrity Review

**Reviewer Attribution:**
- Primary Security Review: Claude Opus 4.6 Thinking
- Completion and Evidence-Classification Review: Gemini 3.1 Pro

- **Commit under review:** `6234896f8d27570117fb04a5560e4e11a556664b`
- **Branch:** `agent/phase-2f-xrd-verification`
- **Base commit:** `c0dbc05`
- **Target merge branch:** `feat/vercel-gemini-backend`
- **Date:** 2026-07-28

---

## Executive Summary

This independent security and evidence-integrity review evaluates the Phase 2F persistent XRD vertical slice at commit `6234896`. The review analyzes internal authentication boundaries, transaction-scoped tenant isolation, Row-Level Security (RLS) definitions, upload-finalization mechanics, validation worker concurrency fencing, evidence immutability and checksum stability, and reasoning execution policies.

Every claim in this document was evaluated against source code, migration definitions, and unit/integration test suites. Physical verification was performed to distinguish between properties verified by live execution, properties verified via unit test doubles/source inspection, and properties deferred to live PostgreSQL staging verification.

---

## 1. Internal HMAC Replay Protection & Request Binding

### Code References
- `server/persistence/phase2fClient.ts`, lines 47–58
- `server/python/api/phase2f/internal_auth.py`, lines 85–137
- `backend/tests/test_phase2f_internal_auth.py`, lines 1–164

### HMAC Integrity and Request Binding (Verified)
The internal authentication boundary between the Node.js/TypeScript persistence gateway and the FastAPI backend uses an HMAC-SHA256 request signature mechanism.

**Canonical Request Message Format:**
```
timestamp
method
target
subject
body_digest
```
Constructed in `server/persistence/phase2fClient.ts` (lines 50–57) and verified in `server/python/api/phase2f/internal_auth.py` (lines 60–70).

- **HMAC-SHA256 Signature:** Calculated using `DIFARYX_INTERNAL_SERVICE_SECRET`.
- **Constant-Time Comparison:** Verified using `hmac.compare_digest()` in Python (`server/python/api/phase2f/internal_auth.py`, line 133).
- **Body Binding:** Includes `body_digest` (`sha256(body)`), ensuring payload tampering invalidates the signature.
- **Method Binding:** HTTP method is canonicalized to uppercase, preventing verb-tampering attacks.
- **Target Binding:** Full URL path and query string (`_canonical_target()`) are included, preventing endpoint path or parameter substitution.
- **Subject Binding:** Authenticated user subject string (`service_subject`) is included, preventing user context substitution.

### Timestamp Freshness & Skew Validation
`server/python/api/phase2f/internal_auth.py` (lines 107–118) parses `X-DIFARYX-Service-Timestamp` and enforces `abs(int(time.time()) - timestamp_value) <= MAX_CLOCK_SKEW_SECONDS` (300 seconds).
- **Timestamps older than 300s:** Rejected with HTTP 401 (`INTERNAL_AUTH_EXPIRED`). Verified via unit test `test_rejects_expired_service_timestamp` in `backend/tests/test_phase2f_internal_auth.py` (lines 119–134). [Evidence: Unit test]
- **Timestamps more than 300s in the future:** Evaluated by `abs(delta)` calculation. Formally rejected by logic, though test coverage for future skew is currently not present in the unit test suite. [Evidence: Source inspection]
- **Malformed timestamps (non-integer):** Raises `ValueError` during `int()` parsing and returns HTTP 401 (`INTERNAL_AUTH_INVALID`). [Evidence: Source inspection]
- **Missing timestamps:** Rejected at header check (line 91) with HTTP 401 (`INTERNAL_AUTH_REQUIRED`). [Evidence: Source inspection]

### Stateful Replay Rejection (Not Implemented)
HMAC integrity, request binding, and timestamp freshness validation are implemented correctly. Stateful replay rejection is not implemented. An identical valid signed request can be replayed within the 300-second acceptance window.

The FastAPI verifier does not store or consume nonces, request IDs, signature fingerprints, or replay tokens. Consequently, any validly signed request captured by an internal network adversary can be replayed repeatedly until the 300-second timestamp window expires.

---

## 2. PostgreSQL Transaction-Scoped Tenant Context

### Code References
- `server/python/api/db/uow.py`, lines 19–80
- `backend/migrations/versions/0001_bootstrap.py`, lines 28–36
- `server/python/api/workers/validation_worker.py`, lines 215–223

### Findings
Source inspection confirms transaction-local tenant context through `set_config(..., true)`.

In `server/python/api/db/uow.py` (lines 44–51), `UnitOfWork.__aenter__` issues:
```sql
SELECT set_config('app.organization_id', :org_id, true)
SELECT set_config('app.user_id', :user_id, true)
```
The third parameter (`is_local = true`) scopes the GUC variables strictly to the active PostgreSQL transaction. Upon transaction `COMMIT` or `ROLLBACK`, PostgreSQL automatically resets these settings.

`identity.current_organization_id()` (`backend/migrations/versions/0001_bootstrap.py`, lines 30–36) evaluates `current_setting('app.organization_id', TRUE)::UUID`.

- **Context constructor guards:** `UnitOfWork` validates that `organization_id` and `user_id` are non-nullUUID values during initialization.
- **Rollback and cleanup:** `__aexit__` (lines 55–79) handles transaction completion, rolling back explicitly on exceptions and shielding cleanup via `asyncio.shield()`.

**Evidence Classification:**
- Source code inspection: Confirmed.
- Unit / source-oriented tests: Confirmed.
- Live pooled-connection reuse verification: Deferred.

*Qualification:* Source inspection confirms transaction-local tenant context through `set_config(..., true)`. Live pooled-connection reuse, rollback isolation, cancellation handling, and cross-request tenant leakage remain deferred to PostgreSQL staging tests.

---

## 3. Row-Level Security (RLS) and Ownership Linkage

### Code References
- `backend/migrations/versions/0017_persistent_xrd_vertical_slice.py`, lines 293–342
- `backend/migrations/versions/0008_downstream_rls.py`, lines 177–180
- `server/python/api/phase2f/service.py`, lines 202–224

### Findings
Migration 0017 (`backend/migrations/versions/0017_persistent_xrd_vertical_slice.py`, lines 293–300) applies RLS to all newly introduced persistence tables:
- `science.xrd_evidence_snapshots`: `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`
- `science.reasoning_runs`: `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`
- `science.notebook_reasoning_references`: `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`

Using `FORCE ROW LEVEL SECURITY` ensures that table ownership does not bypass RLS policies during query execution.

Policies for `difaryx_app` enforce both tenant isolation (`organization_id = identity.current_organization_id()`) and project membership linkage:
```sql
EXISTS (
    SELECT 1 FROM science.projects p
    WHERE p.organization_id = {table}.organization_id
      AND p.id = {table}.project_id
)
```
The worker role policy `xrd_evidence_worker_access` restricts `difaryx_validation_worker` to `organization_id = identity.current_organization_id()`.

In `server/python/api/phase2f/service.py` (lines 215–224), `_require_project_write()` enforces application-level authorization, verifying that the user holds an `owner`/`admin` organization role or a `lead`/`member` project role before permitting mutations.

**Evidence Classification:**
- Migration source-text inspection: Confirmed.
- Policy structure unit tests: Confirmed.
- Live PostgreSQL execution against actual roles: Deferred.

*Qualification:* RLS design is acceptable by source inspection. Migration and policy tests verify expected SQL and DDL structure but do not execute the policies against a live PostgreSQL database using the actual application and worker roles.

---

## 4. Upload Lifecycle & Finalization Atomicity

### Code References
- `server/python/api/phase2f/service.py`, lines 436–529
- `server/persistence/routes.ts`, lines 214–317

### Findings
The upload lifecycle operates across three distinct phases:
1. **Upload Intent Creation** (`POST /internal/phase2f/datasets/{dataset_id}/uploads`): Validates filename sanitization, extension white-listing (`.csv`, `.txt`, `.xy`, `.dat`), and MIME type validation (`text/csv`, `text/plain`, `application/octet-stream`). Allocates an `upload_session`.
2. **Content Streaming** (`PUT /internal/phase2f/uploads/{upload_id}/content`): Claims session for streaming and writes payload to staging storage. Exceptions invoke `record_streaming_failure()` in Python (`server/python/api/phase2f/service.py`, lines 496–506).
3. **Upload Finalization** (`POST /internal/phase2f/uploads/{upload_id}/finalize`): Promotes object from staging to authoritative store, verifies client/server SHA-256 checksums, updates session status, and enqueues validation attempts.

**Verdict:** PASS BY DESIGN; concurrency and storage/database fault injection deferred.

*Deferred Staging Fault-Injection Verification:*
- Concurrent finalization requests racing on a single upload session.
- Failure mode where storage promotion succeeds but database transaction fails.
- Failure mode where database transition succeeds but storage promotion fails.
- Enqueueing validation attempt succeeds while finalization settlement fails.
- Detection and cleanup of orphaned staging or promoted storage objects.
- Storage timeout during promotion.
- Validation worker claiming an attempt before finalization transaction is durable.

---

## 5. Validation Worker Concurrency Fencing

### Code References
- `server/python/api/workers/validation_worker.py`, lines 226–884, 1081–1088
- `backend/migrations/versions/0016_validation_attempt_retry_fencing.py`, lines 430–513
- `backend/tests/test_phase2f_worker_evidence.py`, lines 1–120

### Findings
Validation workers coordinate job execution using PostgreSQL row locking and atomic state transitions:
- **Claim Acquisition:** Uses `SELECT ... FOR UPDATE SKIP LOCKED` combined with an atomic `UPDATE ... WHERE status = 'queued' AND claimed_by IS NULL` to claim pending validation attempts.
- **Heartbeat & Lease Renewal:** `_heartbeat()` periodically calls `renew_lock()` (`server/python/api/workers/validation_worker.py`, lines 431–454), verifying `claimed_by = :worker_id` before advancing `lock_expires_at`.
- **Stale Claim Recovery:** `reclaim_stale()` recovers abandoned locks where `lock_expires_at < NOW()`.
- **Terminal Settlement:** `validation_worker_settle_terminal_owned()` (`backend/migrations/versions/0016_validation_attempt_retry_fencing.py`, lines 430–512) is a `SECURITY DEFINER` function that verifies `app.organization_id` context and updates attempt state only if `claimed_by = p_worker_id AND status = 'running'`.
- **Evidence Publication Protection:** `publish_xrd_evidence_and_mark_passed()` (`server/python/api/workers/validation_worker.py`, lines 540–666) checks that no higher attempt number has already settled before publishing evidence. Verified using test doubles in `backend/tests/test_phase2f_worker_evidence.py` (lines 31–59).

**Verdict:** PASS BY SQL DESIGN AND UNIT EVIDENCE; live concurrency verification deferred.

*Evidence Classification:* Verified through source inspection, SQL predicate review, and test doubles.

*Deferred Live Concurrency Scenarios:*
1. Worker A claims attempt 1.
2. Worker A loses lease (due to network delay or process pause).
3. Worker B reclaims attempt 1 or creates successor attempt 2.
4. Worker B publishes evidence snapshot.
5. Worker A resumes and attempts evidence publication.
6. Worker A must fail without modifying evidence or dataset terminal state.
7. Duplicate delivery from two worker processes.
8. Lease renewal vs. reclaim race.
9. Stale attempt vs. successor settlement.
10. Database restart during settlement.
11. Processor completion after lease expiry.

---

## 6. Evidence Immutability & Checksum Canonicalization

### Code References
- `server/python/api/phase2f/processing.py`, lines 266–361
- `backend/migrations/versions/0017_persistent_xrd_vertical_slice.py`, lines 132–134, 344–368

### Findings
- **Canonical Serialization:** `build_canonical_xrd_evidence()` (`server/python/api/phase2f/processing.py`, lines 350–357) serializes evidence content via `json.dumps(content, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")` and computes SHA-256 (`content_sha256`). Key ordering and compact separators are deterministic for valid finite JSON values. Cross-runtime canonicalization and non-finite-number handling require the qualification documented in Finding F-2F-SEC-002.
- **Immutability Database Trigger:** `guard_xrd_evidence_immutability()` (`backend/migrations/versions/0017_persistent_xrd_vertical_slice.py`, lines 346–367) executes `BEFORE UPDATE OR DELETE ON science.xrd_evidence_snapshots`. It strictly raises exception `55000` unless transitioning from `ready` to `superseded` with all non-status fields identical.
- **Single Active Evidence Constraint:** Partial unique index `xrd_evidence_one_active_ready_uq` (lines 132–134) ensures at most one `ready` snapshot exists per dataset.

---

## 7. Persistent Reasoning Authorization & Policy Fallback Matrix

### Code References
- `server/persistence/routes.ts`, lines 335–560
- `server/python/api/phase2f/service.py`, lines 563–769
- `server/__tests__/phase2f-persistence.test.ts`, lines 1–610

### Reasoning Execution Policy
Reasoning endpoints enforce strict provider whitelist validation (`deterministic`, `scientific-baseline`, `gemini-2.5-flash`, `gemini-developer-api`, `vertex-gemini`), evidence readiness checks (`status === 'ready'`), and user authorization checks.

### Policy Fallback & Error Matrix

| Condition | Fallback Allowed | Expected Behavior | Production Path / Verification Source | Evidence Class |
|---|---|---|---|---|
| Missing or expired session / 401 | No | Reject before persistent evidence access | `server/persistence/routes.ts` (lines 60-80) | Source inspection + mocked server test |
| Project, dataset, or evidence authorization failure / 403 | No | Reject without provider invocation | `server/python/api/phase2f/service.py` (line 222) | Source inspection + mocked server test |
| Malformed request / 400 | No | Reject through runtime validation | `server/persistence/routes.ts` (line 350) | Source inspection + mocked server test |
| Evidence unavailable | No | Reject (404/409) | `server/python/api/phase2f/service.py` (line 602) | Source inspection + mocked server test |
| Evidence failed validation | No | Reject (409) | `server/python/api/phase2f/service.py` (line 602) | Source inspection + mocked server test |
| Evidence stale or superseded | No | Reject (409) | `server/python/api/phase2f/service.py` (line 602) | Source inspection + mocked server test |
| Gemini quota exceeded / 429 | No | Persist failure where applicable, return 429 + `Retry-After` | `server/persistence/routes.ts` (line 462) | Source inspection + mocked server test |
| Quota store unavailable / 503 | No | Fail closed (503) | `server/persistence/routes.ts` (line 435) | Source inspection + mocked server test |
| Gemini not configured | No | Reject request | `server/persistence/routes.ts` (line 395) | Source inspection + mocked server test |
| Explicitly eligible provider failure | Yes | Deterministic fallback under policy | `server/persistence/routes.ts` (line 510) | Source inspection + mocked server test |
| Unknown internal failure | No | Fail closed unless explicitly classified | `server/persistence/routes.ts` (line 550) | Source inspection + mocked server test |

---

## 8. Test Evidence Audit

### Verified Test Counts
- **Server Vitest Suite (`vitest.server.config.ts`):** 155 tests passed across 11 test files.
  - `server/__tests__/phase2f-persistence.test.ts` (9 tests)
  - `server/__tests__/phase2e-auth-regression.test.ts` (58 tests)
  - `server/__tests__/geminiQuotaIntegration.test.ts` (13 tests)
  - `server/__tests__/googleIdentity.test.ts` (13 tests)
  - `server/__tests__/app.test.ts` (13 tests)
  - `server/__tests__/geminiProvider.test.ts` (11 tests)
  - `server/__tests__/upstashGeminiQuotaStore.test.ts` (14 tests)
  - `server/__tests__/vercelAdapter.test.ts` (3 tests)
  - `server/__tests__/sessionManager.test.ts` (5 tests)
  - `server/__tests__/quotaIdentity.test.ts` (4 tests)
  - `server/__tests__/quotaConfig.test.ts` (12 tests)

### Python Test Suite Execution & Classification
- `backend/tests/test_phase2f_internal_auth.py` (5 unit tests): Verified. Validates HMAC signature computation, 300s expiration, and tenant header authorization. [Evidence: Unit tests]
- `backend/tests/test_phase2f_worker_evidence.py` (2 unit tests): Verified. Uses mock objects and recorded SQL call assertions to verify ownership checks and settlement sequencing. [Evidence: Unit tests with test doubles]
- `backend/tests/test_phase2f_processing.py` (3 unit tests): Verified. Tests XRD parser output structure and evidence builder. [Evidence: Unit tests]
- `backend/tests/test_phase2f_migration.py` (1 test): Verified. Validates migration source text structure and expected DDL clauses. It does not execute migration 0017 against a live PostgreSQL database. [Evidence: Migration source-text test]

### Aggregate Repository Suite Status (Non-Green)
The repository-wide aggregate test invocation (`npm test`) remains non-green due to pre-existing environment configuration issues present since base commit `c0dbc05`:
1. `npm test` references a hardcoded Python path (`server\python\venv\Scripts\python.exe`) in `package.json`.
2. Characterization scripts (`scripts/phase1-characterization.mjs`) reference a stale path `src/App.tsx`, whereas the active component is located at `src/app/App.tsx`.

Both issues were verified to exist at base commit `c0dbc05` prior to Phase 2F development.

---

## 9. Security Findings

### Critical Findings
*None.*

### High Findings
*None.*

### Medium Findings

#### Finding ID: F-2F-SEC-001
- **Title:** Missing stateful replay rejection for internal service requests
- **Severity:** Medium
- **Preconditions:**
  1. Internal network access or compromised internal component capable of capturing signed TypeScript-to-FastAPI requests.
  2. Replay transmitted within the 300-second timestamp acceptance window.
- **Affected Operations:**
  - `POST /internal/phase2f/projects` (Project creation — non-idempotent, creates duplicate project records)
  - `POST /internal/phase2f/projects/{id}/datasets` (Dataset creation — non-idempotent, creates duplicate datasets)
  - `POST /internal/phase2f/datasets/{id}/uploads` (Upload intent — mitigated by `idempotency_key` if supplied)
  - `PUT /internal/phase2f/uploads/{id}/content` (Upload content — mitigated by session status check)
  - `POST /internal/phase2f/uploads/{id}/finalize` (Upload finalization — mitigated by single-finalization state check)
  - `POST /internal/phase2f/reasoning` (Reasoning start — mitigated by `idempotency_key` if supplied)
  - `POST /internal/phase2f/reasoning/{id}/complete` (Reasoning completion — idempotent SQL update)
  - `POST /internal/phase2f/notebook-references` (Notebook reference creation — non-idempotent for distinct labels)
- **Impact:** Potential duplicate state mutations if a signed request is captured and replayed within 300 seconds.
- **Merge Blocker:** No
- **Staging Blocker:** No (provided service remains private and staging environment is controlled)
- **Production Blocker:** Yes (must be resolved before public production exposure)
- **Remediation:** Add a unique nonce or request ID to the signed canonical request payload (`X-DIFARYX-Service-Nonce`) and enforce atomic single-use checking in an in-memory cache such as Redis:
  ```
  SET replay:{nonce} 1 NX EX 300
  ```

---

### Low Findings

#### Finding ID: F-2F-SEC-002
- **Title:** Canonical evidence serialization does not explicitly reject non-finite numbers
- **Severity:** Low
- **Preconditions:** An XRD processing pipeline or reference dataset generates floating-point values containing `NaN`, `Infinity`, or `-Infinity`.
- **Impact:** Python's default `json.dumps()` serializes `NaN` and `Infinity` as JavaScript-like literals (`NaN`, `Infinity`), which are non-compliant with standard JSON (RFC 8259). This can cause checksum discrepancies or parser failures in strict JSON decoders.
- **Merge Blocker:** No
- **Staging Blocker:** No
- **Production Blocker:** No (should be resolved prior to audit-grade scientific reporting)
- **Remediation:**
  1. Recursively validate evidence numerical values using `math.isfinite()` prior to canonicalization.
  2. Configure serialization with `allow_nan=False` in `json.dumps()`.
  3. Add unit tests asserting rejection of non-finite floating point values.

---

### Informational & Deferred Items
- **Deferred Live PostgreSQL Staging Verification:** Live execution of RLS, role grants, connection pooling tenant isolation, and worker lock race conditions are deferred to staging.
- **Deferred Storage Fault Injection:** Storage failure recovery and multi-region promotion mechanics are deferred to staging.

---

## 10. Summary Verdict Table

| Focus Area | Verdict | Evidence Class |
|---|---|---|
| HMAC integrity and request binding | PASS | Source inspection + unit tests |
| Timestamp freshness validation | PASS WITH TESTED LIMITS | Source inspection + targeted unit tests |
| Stateful replay rejection | PARTIAL | No nonce or signature-consumption store |
| Transaction-local tenant context | PASS BY DESIGN | Source inspection; live connection-pool test deferred |
| RLS and ownership linkage | PASS BY DESIGN | Migration inspection; live PostgreSQL deferred |
| Upload lifecycle and idempotency | PASS BY DESIGN | Source and unit evidence; fault injection deferred |
| Worker fencing | PASS BY DESIGN | SQL inspection + test doubles; concurrency deferred |
| Evidence immutability | PASS BY DESIGN | Migration inspection; live trigger execution deferred |
| Evidence checksum | PASS WITH QUALIFICATION | Deterministic for finite values; inspect NaN/Infinity handling |
| Reasoning authorization and quota | PASS BY DESIGN | Source + mocked server tests |
| Repository test status | PARTIAL | 155 server tests pass; aggregate suite remains non-green |

---

## 11. Recommendation & Staging Gate Requirements

**Final Recommendation:** Phase 2F is acceptable for merge into `feat/vercel-gemini-backend`, with live staging validation required before production exposure.

*Notice:* This recommendation does NOT constitute production-readiness approval.

### Required Staging Verification Checklist:
1. Migration execution against a live PostgreSQL 15+ instance.
2. Runtime `FORCE ROW LEVEL SECURITY` verification under `difaryx_app` and `difaryx_validation_worker` roles.
3. Multi-tenant connection pool isolation testing under concurrent load.
4. Object storage upload streaming, promotion, and failure cleanup.
5. Multi-worker validation concurrency and lock race verification.
6. End-to-end authentication with Google OAuth and session cookies.
7. Redis session and Gemini quota store integration testing.
8. Real Gemini provider execution and fallback verification.
9. UI integration verification (browser refresh, History page, Notebook references).
10. Stateful nonce replay rejection implementation (Required before public production deployment).
