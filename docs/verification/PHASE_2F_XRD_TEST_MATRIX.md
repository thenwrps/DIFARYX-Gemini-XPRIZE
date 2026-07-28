# Phase 2F: XRD Test & Security Matrix Verification

**Reviewer Attribution:**
- Primary Security Review: Claude Opus 4.6 Thinking
- Completion and Evidence-Classification Review: Gemini 3.1 Pro

- **Commit under review:** `6234896f8d27570117fb04a5560e4e11a556664b`
- **Branch:** `agent/phase-2f-xrd-verification`
- **Base commit:** `c0dbc05`
- **Target merge branch:** `feat/vercel-gemini-backend`
- **Date:** 2026-07-28

---

## 1. Test Matrix Overview & Evidence Classification

This test matrix documents all requirements, production paths, evidence classifications, test execution commands, observed results, automation statuses, staging dependencies, and acceptance impacts for the Phase 2F persistent XRD vertical slice.

### Evidence Type Definitions:
- **production-path unit test**: Automated unit test executing real production code path in isolation.
- **mocked integration test**: Automated integration test using API mocks or simulated downstream services.
- **source-code inspection**: Direct manual review of source code logic and guard clauses.
- **migration source-text test**: Automated test checking DDL structure and migration Python definitions.
- **SQL predicate inspection**: Direct manual review of PostgreSQL queries, triggers, and functions.
- **frontend service mock**: TypeScript test mocking internal HTTP clients or persistence endpoints.
- **direct processor smoke**: Standalone test driving XRD parser/processor functions.
- **deferred live PostgreSQL**: Verification requiring execution against a real running PostgreSQL instance.
- **deferred live external service**: Verification requiring real Google Vertex/Gemini or Redis connections.
- **deferred browser E2E**: Verification requiring end-to-end browser execution.

---

## 2. Detailed Security & Functional Test Matrix

| Test ID | Requirement | Production Path | Evidence Type | Command / Test File | Observed Result | Automation Status | Staging Dependency | Acceptance Impact |
|---|---|---|---|---|---|---|---|---|
| **TEST-2F-001** | Valid internal HMAC signature validation | `server/python/api/phase2f/internal_auth.py` | production-path unit test | `python -m unittest backend/tests/test_phase2f_internal_auth.py` | PASS (`test_accepts_signed_verified_subject_and_resolves_server_mapping`) | Automated | None | Mandatory |
| **TEST-2F-002** | Invalid HMAC signature rejection | `server/python/api/phase2f/internal_auth.py` | production-path unit test | `python -m unittest backend/tests/test_phase2f_internal_auth.py` | PASS (`test_rejects_invalid_signature_before_identity_resolution`) | Automated | None | Mandatory |
| **TEST-2F-003** | Expired timestamp rejection (>300s old) | `server/python/api/phase2f/internal_auth.py` | production-path unit test | `python -m unittest backend/tests/test_phase2f_internal_auth.py` | PASS (`test_rejects_expired_service_timestamp`) | Automated | None | Mandatory |
| **TEST-2F-004** | Excessive future timestamp rejection (>300s future) | `server/python/api/phase2f/internal_auth.py` (line 114) | source-code inspection | Source review (`abs(now - ts) > 300`) | PASS BY LOGIC (untested in unit suite) | Manual | None | Non-blocking |
| **TEST-2F-005** | Body tampering signature invalidation | `server/persistence/phase2fClient.ts` / `internal_auth.py` | source-code inspection | Source review (SHA-256 body digest in canonical message) | PASS BY LOGIC | Manual | None | Mandatory |
| **TEST-2F-006** | Method tampering signature invalidation | `server/persistence/phase2fClient.ts` / `internal_auth.py` | source-code inspection | Source review (HTTP method in canonical message) | PASS BY LOGIC | Manual | None | Mandatory |
| **TEST-2F-007** | Path / query tampering signature invalidation | `server/persistence/phase2fClient.ts` / `internal_auth.py` | source-code inspection | Source review (`_canonical_target()` in message) | PASS BY LOGIC | Manual | None | Mandatory |
| **TEST-2F-008** | Identical signed-request replay behavior | `server/python/api/phase2f/internal_auth.py` | source-code inspection | Source review (No nonce store present; finding F-2F-SEC-001) | REPLAY PERMITTED WITHIN 300s | Manual | Yes (Redis nonce store required before prod) | Production Blocker |
| **TEST-2F-009** | Transaction-local tenant context (`set_config(..., true)`) | `server/python/api/db/uow.py` (lines 44–51) | source-code inspection | Source review (`is_local=true` in `set_config`) | PASS BY DESIGN | Manual | None | Mandatory |
| **TEST-2F-010** | Pooled connection isolation & rollback reset | `server/python/api/db/uow.py` | deferred live PostgreSQL | Staging test execution | DEFERRED TO STAGING | Deferred | Yes (live connection pool) | Staging Requirement |
| **TEST-2F-011** | RLS policy structure & FORCE RLS setup | `backend/migrations/versions/0017_persistent_xrd_vertical_slice.py` | migration source-text test | `python -m unittest backend/tests/test_phase2f_migration.py` | PASS (`test_migration_0017_structure`) | Automated | None | Mandatory |
| **TEST-2F-012** | Live RLS enforcement against app and worker roles | `science.xrd_evidence_snapshots` RLS policies | deferred live PostgreSQL | Staging test execution | DEFERRED TO STAGING | Deferred | Yes (live PostgreSQL DB & roles) | Staging Requirement |
| **TEST-2F-013** | Duplicate upload finalization handling | `server/python/api/phase2f/service.py` (lines 516–529) | mocked integration test | `npx vitest run server/__tests__/phase2f-persistence.test.ts` | PASS (returns existing session status) | Automated | None | Mandatory |
| **TEST-2F-014** | Concurrent upload finalization race handling | `server/python/api/phase2f/service.py` | deferred live PostgreSQL | Staging fault injection | DEFERRED TO STAGING | Deferred | Yes (live DB & storage) | Staging Requirement |
| **TEST-2F-015** | Storage promotion / DB failure ordering | `server/python/api/services/upload_service.py` | deferred live PostgreSQL | Staging fault injection | DEFERRED TO STAGING | Deferred | Yes (live DB & object store) | Staging Requirement |
| **TEST-2F-016** | Stale worker evidence publication rejection | `server/python/api/workers/validation_worker.py` (line 540) | production-path unit test | `python -m unittest backend/tests/test_phase2f_worker_evidence.py` | PASS (`test_stale_duplicate_delivery_cannot_create_evidence`) | Automated | None | Mandatory |
| **TEST-2F-017** | Duplicate delivery across worker processes | `server/python/api/workers/validation_worker.py` | SQL predicate inspection | Source review (`FOR UPDATE SKIP LOCKED` & attempt check) | PASS BY DESIGN | Manual | Yes (multi-process worker environment) | Staging Requirement |
| **TEST-2F-018** | Worker lease renewal vs reclaim race | `server/python/api/workers/validation_worker.py` | deferred live PostgreSQL | Staging concurrency test | DEFERRED TO STAGING | Deferred | Yes (live DB & worker processes) | Staging Requirement |
| **TEST-2F-019** | Canonical XRD evidence checksum stability | `server/python/api/phase2f/processing.py` (lines 350–357) | production-path unit test | `python -m unittest backend/tests/test_phase2f_processing.py` | PASS (deterministic sorted keys JSON) | Automated | None | Mandatory |
| **TEST-2F-020** | Non-finite numeric handling (`NaN`, `Infinity`) | `server/python/api/phase2f/processing.py` | source-code inspection | Source review (No `allow_nan=False`; finding F-2F-SEC-002) | QUALIFIED (permits default Python JSON float tokens) | Manual | None | Low Finding |
| **TEST-2F-021** | Evidence snapshot immutability trigger | `backend/migrations/versions/0017_persistent_xrd_vertical_slice.py` | SQL predicate inspection | Migration DDL review (`guard_xrd_evidence_immutability`) | PASS BY DESIGN | Manual | Yes (live DB trigger execution) | Mandatory |
| **TEST-2F-022** | Evidence snapshot supersession transition | `backend/migrations/versions/0017_persistent_xrd_vertical_slice.py` | SQL predicate inspection | Migration DDL review (`ready` -> `superseded` check) | PASS BY DESIGN | Manual | Yes (live DB trigger execution) | Mandatory |
| **TEST-2F-023** | Deterministic persistent reasoning execution | `server/persistence/routes.ts` / `service.py` | mocked integration test | `npx vitest run server/__tests__/phase2f-persistence.test.ts` | PASS | Automated | None | Mandatory |
| **TEST-2F-024** | Configured Gemini reasoning execution | `server/persistence/routes.ts` | mocked integration test | `npx vitest run server/__tests__/phase2f-persistence.test.ts` | PASS (mocked provider calls) | Automated | Yes (live Gemini API key required for full E2E) | Staging Requirement |
| **TEST-2F-025** | HTTP 401 Unauthorized handling on unauthenticated calls | `server/persistence/routes.ts` | mocked integration test | `npx vitest run server/__tests__/phase2f-persistence.test.ts` | PASS | Automated | None | Mandatory |
| **TEST-2F-026** | HTTP 403 Forbidden handling on unauthorized tenant/project | `server/persistence/routes.ts` / `service.py` | production-path unit test | `python -m unittest backend/tests/test_phase2f_internal_auth.py` | PASS (`test_rejects_forged_active_organization...`) | Automated | None | Mandatory |
| **TEST-2F-027** | Invalid request parameters / payload rejection (HTTP 400) | `server/persistence/routes.ts` | mocked integration test | `npx vitest run server/__tests__/phase2f-persistence.test.ts` | PASS | Automated | None | Mandatory |
| **TEST-2F-028** | Reasoning start on unavailable evidence rejection (HTTP 409) | `server/python/api/phase2f/service.py` (line 602) | mocked integration test | `npx vitest run server/__tests__/phase2f-persistence.test.ts` | PASS | Automated | None | Mandatory |
| **TEST-2F-029** | Reasoning start on stale/superseded evidence rejection | `server/python/api/phase2f/service.py` (line 602) | source-code inspection | Source review (`evidence["current_evidence_id"] != evidence["id"]`) | PASS BY DESIGN | Manual | None | Mandatory |
| **TEST-2F-030** | Gemini quota exceeded handling (HTTP 429 + Retry-After) | `server/persistence/routes.ts` (lines 460–475) | mocked integration test | `npx vitest run server/__tests__/geminiQuotaIntegration.test.ts` | PASS | Automated | None | Mandatory |
| **TEST-2F-031** | Quota store unavailable fallback (HTTP 503) | `server/persistence/routes.ts` (lines 430–445) | mocked integration test | `npx vitest run server/__tests__/upstashGeminiQuotaStore.test.ts` | PASS | Automated | None | Mandatory |
| **TEST-2F-032** | Eligible provider fallback under policy | `server/persistence/routes.ts` (line 510) | mocked integration test | `npx vitest run server/__tests__/phase2f-persistence.test.ts` | PASS | Automated | None | Mandatory |
| **TEST-2F-033** | Reasoning history tenant isolation | `server/python/api/phase2f/service.py` (line 792) | mocked integration test | `npx vitest run server/__tests__/phase2f-persistence.test.ts` | PASS | Automated | None | Mandatory |
| **TEST-2F-034** | Notebook reasoning references tenant isolation | `server/python/api/phase2f/service.py` (line 890) | mocked integration test | `npx vitest run server/__tests__/phase2f-persistence.test.ts` | PASS | Automated | None | Mandatory |

---

## 3. Suite Execution Summary & Pre-existing Repository Issues

### Executed Server Vitest Suite
Command: `npx vitest run --config vitest.server.config.ts`
Status: **PASS (155 / 155 tests passed across 11 files)**

```
✓ server/__tests__/geminiProvider.test.ts (11 tests)
✓ server/__tests__/upstashGeminiQuotaStore.test.ts (14 tests)
✓ server/__tests__/vercelAdapter.test.ts (3 tests)
✓ server/__tests__/sessionManager.test.ts (5 tests)
✓ server/__tests__/app.test.ts (13 tests)
✓ server/__tests__/googleIdentity.test.ts (13 tests)
✓ server/__tests__/geminiQuotaIntegration.test.ts (13 tests)
✓ server/__tests__/phase2f-persistence.test.ts (9 tests)
✓ server/__tests__/phase2e-auth-regression.test.ts (58 tests)
✓ server/__tests__/quotaIdentity.test.ts (4 tests)
✓ server/__tests__/quotaConfig.test.ts (12 tests)
```

### Executed Python Targeted Suite
Commands executed:
- `python -m unittest backend/tests/test_phase2f_internal_auth.py`: **PASS (5 tests)**
- `python -m unittest backend/tests/test_phase2f_worker_evidence.py`: **PASS (2 tests using test doubles)**
- `python -m unittest backend/tests/test_phase2f_processing.py`: **PASS (3 tests)**
- `python -m unittest backend/tests/test_phase2f_migration.py`: **PASS (1 migration source-text test)**

### Pre-existing Repository Configuration Issues (Base Commit `c0dbc05`)
The full aggregate repository script (`npm test`) fails due to two pre-existing limitations established prior to Phase 2F:
1. **Hardcoded Python Virtual Environment Path:** `package.json` specifies `"test": "server\\python\\venv\\Scripts\\python.exe ..."`. If Python is located in a different path or virtual environment name, the script fails.
2. **Stale Component Path in Characterization Tests:** `scripts/phase1-characterization.mjs` targets `src/App.tsx`, whereas the application router was previously relocated to `src/app/App.tsx`.

Both issues were confirmed to exist at base commit `c0dbc05` and do not reflect defects in the Phase 2F implementation code.

---

## 4. Conclusion & Merge Approval Status

The test and security matrix for Phase 2F's core persistence layer is complete. The 155 Vitest server tests and Python unit test modules provide comprehensive coverage for internal authentication boundaries, tenant context binding, upload lifecycles, worker fencing mechanics, and reasoning fallback policies.

**Merge Status:** Approved for merge into `feat/vercel-gemini-backend`. Live staging deployment is required to fulfill the deferred PostgreSQL and cloud service verification items listed above prior to production release.

---

## 5. Live Staging Validation Update — 2026-07-28

This section supersedes the earlier merge-status statement for the current
working tree. Local-live validation found three verified defects at baseline commit
`470fca8`: two PostgreSQL merge-blocking defects and one local object-store
information-disclosure defect. All three have narrow fixes in the current
branch and require review before integration. External service and browser
gates remain blocked.

| Live ID | Requirement | Evidence Type | Command / Path | Observed Result | Status | Acceptance Impact |
|---|---|---|---|---|---|---|
| **LIVE-2F-001** | Repository branch and baseline | local preflight | `py -3 scripts/phase2f_live_staging.py preflight` | Branch and `470fca8...` matched | PASS | Mandatory |
| **LIVE-2F-002** | Protected patch integrity | local preflight | Preflight SHA-256 check | Locked SHA-256 matched | PASS | Mandatory |
| **LIVE-2F-003** | External configuration readiness | local preflight | Preflight environment-name presence | All seven external groups absent | BLOCKED | External staging blocker |
| **LIVE-2F-004** | Clean migration 0001→0017 | live PostgreSQL 15 | `alembic upgrade 0017` | Initial 0017 failed: duplicate `science.reasoning_runs`; transaction stayed at 0016 | FAIL AT BASELINE | Merge blocker |
| **LIVE-2F-005** | Preserve old governance reasoning data | live PostgreSQL migration rerun | Migration 0017 rename + new regression assertion | Old table renamed to `ai_governance_reasoning_runs`; clean chain reached 0017 | PASS AFTER FIX | Review required |
| **LIVE-2F-006** | FORCE RLS flags | live PostgreSQL catalog | `phase2f_live_staging.py postgres` | All three Phase 2F tables: RLS=true, FORCE=true | PASS | Mandatory |
| **LIVE-2F-007** | Real app/worker role attributes | live PostgreSQL catalog | `phase2f_live_staging.py postgres` | Both group roles non-superuser and non-`BYPASSRLS` | PASS | Mandatory |
| **LIVE-2F-008** | Installed app/worker policies | live PostgreSQL catalog | `phase2f_live_staging.py postgres` | Three app policies and evidence worker policy present | PASS | Mandatory |
| **LIVE-2F-009** | Pooled connection tenant reset | live PostgreSQL pool | One-connection rollback/reuse probe | GUC empty after reuse; zero visible projects | PASS | Mandatory |
| **LIVE-2F-010** | Cross-tenant project reads | live PostgreSQL app role | Synthetic tenants A/B | Each saw own=1, other=0 | PASS | Mandatory |
| **LIVE-2F-011** | Cross-tenant evidence reads | live PostgreSQL app role | Synthetic Phase 2F fixtures | Each saw own=1, other=0 | PASS | Mandatory |
| **LIVE-2F-012** | Cross-tenant History reads | live PostgreSQL app role | `science.reasoning_runs` fixtures | Each saw own=1, other=0 | PASS | Mandatory |
| **LIVE-2F-013** | Cross-tenant Notebook reads | live PostgreSQL app role | Notebook fixtures | Each saw own=1, other=0 | PASS | Mandatory |
| **LIVE-2F-014** | Worker evidence column boundary | live PostgreSQL worker role | Attempted content update | Rejected with SQLSTATE 42501 | PASS | Mandatory |
| **LIVE-2F-015** | Evidence immutability trigger | live PostgreSQL trigger | Admin mutation probe, rolled back | Rejected with SQLSTATE 55000 | PASS | Mandatory |
| **LIVE-2F-016** | Existing tenant isolation suite | live PostgreSQL app role | `backend/tenant_isolation_tests.py` | Nine checks and 5/5 concurrent tenants passed; combined update/delete assertion hit stricter DELETE denial | PARTIAL | Test expectation follow-up |
| **LIVE-2F-017** | Stale worker becomes no-op | live PostgreSQL worker path | `test_validation_worker_lost_ownership.py` | Initial baseline failed on ambiguous `RETURNING id` | FAIL AT BASELINE | Merge blocker |
| **LIVE-2F-018** | Qualified retry settlement | live PostgreSQL worker rerun | Same existing suite | Lost ownership, exhaustion, and concurrent successor scenarios passed | PASS AFTER FIX | Review required |
| **LIVE-2F-019** | Local storage promotion/idempotency/conflict | production-path unit tests | `test_ingestion_phase1b` | 27/27 passed | PASS | Local adapter only |
| **LIVE-2F-020** | No internal storage-path logging | production-path unit test | `test_local_object_store` | 11 tests passed, 1 skipped; new stderr assertion passed | PASS AFTER FIX | Review required |
| **LIVE-2F-021** | Concurrent API finalization | deployed service + storage + PostgreSQL | Two simultaneous finalize calls | Not executed | BLOCKED | External staging blocker |
| **LIVE-2F-022** | Storage/database failure ordering | deployed service fault injection | Six failure points in live report | Not executed | BLOCKED | External staging blocker |
| **LIVE-2F-023** | Full heartbeat/reclaim race | two live worker processes | Continuous worker orchestration | Lost-ownership functions passed; continuous heartbeat race not executed | PARTIAL | Staging requirement |
| **LIVE-2F-024** | OAuth and secure session cookie | deployed browser E2E | Two synthetic Google accounts | Not executed; credentials/URLs absent | BLOCKED | External staging blocker |
| **LIVE-2F-025** | Redis sessions and Gemini quotas | live Redis + deployed server | TTL, revocation, 429 dimensions, fail-closed 503 | Not executed; credentials/URLs absent | BLOCKED | External staging blocker |
| **LIVE-2F-026** | Configured Gemini and eligible fallback | live provider | Success, consumed quota, injected provider failure | Not executed; provider configuration absent | BLOCKED | External staging blocker |
| **LIVE-2F-027** | Browser refresh recovery | deployed browser E2E | Upload/validation/result hard refresh | Not executed | BLOCKED | External staging blocker |
| **LIVE-2F-028** | History/Notebook reload | deployed browser E2E | Close/reopen and server reload | Database row isolation passed; browser path not executed | PARTIAL | External staging blocker |
| **LIVE-2F-029** | Cross-user direct-object isolation | deployed browser/API | Account B uses account A IDs | Database row isolation passed; deployed API/browser path not executed | PARTIAL | External staging blocker |
| **LIVE-2F-030** | Local regression gates | build/lint/typechecks/tests | Commands in live report | Build, lint, both typechecks, server 155/155, frontend 23/23, Phase 2F Python 16/16 passed | PASS | Mandatory |
| **LIVE-2F-031** | Characterization baseline | targeted Vitest | Two characterization files | 4/5; stale `src/App.tsx` path failed | BASELINE FAIL | Repository hygiene |

### Current decision

- Live local PostgreSQL status: **PASS after two narrow fixes**.
- Shared/deployed staging status: **BLOCKED**.
- Merge status: **review required; do not merge or push yet**.
- Production status: **not approved**.

The authoritative execution narrative, safety rules, failure-injection plan,
findings, and remaining blockers are in
`docs/verification/PHASE_2F_LIVE_STAGING_VALIDATION.md`.
