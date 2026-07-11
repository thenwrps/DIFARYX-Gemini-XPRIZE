# Phase 0 Closeout Walkthrough & Test Report

This document records the engineering details, history of test failures, corrections made, and the final validation suite results for the DIFARYX Phase 0 database infrastructure and security controls.

---

## 1. Traceability & Execution History

We preserve the failure and correction history of the Phase 0 closeout validation process:

1. **Alembic Configuration Paths**: The initial unified runner failed with `No 'script_location' key found in configuration` because it executed Alembic from the project root rather than the `backend/` directory.
   - *Correction*: Configured the runner to execute commands with `cwd="backend/"` and explicitly specify `-c alembic.ini`.
2. **Missing `app.user_id` Context & RLS Denials**: After introducing membership-aware RLS, queries in the connection pool and concurrent worker tests returned empty results (`[]`). This occurred because the test connections set `app.organization_id` but did not define `app.user_id`, failing the RLS project-membership check.
   - *Correction*: Mapped each test organization to a corresponding mock owner/user ID and explicitly ran `SET LOCAL app.user_id` on checkout.
3. **Empty-Result False Positives**: The initial tenant isolation test passed when workers returned empty lists. An empty result was incorrectly classified as a success.
   - *Correction*: Rewrote the test assertions to ensure positive test cases read exactly the expected number of records, while negative test cases return exactly zero rows.
4. **Destructive Reset & Hardcoded DSNs**: The initial test runner automatically dropped the live database and roles and contained fallback credentials, violating the lease-privilege and reproducibility requirements.
   - *Correction*: Split the destructive environment reset into a separate safe script, enforced strict environment variable checking, and removed all fallback passwords.
5. **Audit Log Insert Schema Inconsistencies**: The project membership test failed when writing to `governance.audit_log` because of outdated columns (`action_type`, `reason_context`).
   - *Correction*: Modified `project_membership_audit_tests.py` to use the correct schema columns: `action`, `resource_type`, and `resource_id`.
6. **Orphaned Organization Records in Seeding**: Restructuring the database required explicit seeding of target organizations before inserting users and members.
   - *Correction*: Added explicit organization seed inserts (`ORG_A`, `ORG_B`) inside `project_membership_audit_tests.py`.
7. **Outbox Stale Lock Claim Bug**: Stale lock reclamation failed because the `claim_events` function was restricted to `'pending'` and `'failed'` statuses, never selecting `'locked'` rows even if they exceeded the stale timeout.
   - *Correction*: Modified `0006_constraints_triggers.py` to allow candidates with status `'locked'` whose `locked_at` has timed out.
8. **Lock Hangups in Outbox Worker Tests**: Concurrent outbox tests hung because of transaction holds on rows before superuser edits.
   - *Correction*: Configured `conn.autocommit = True` on psycopg2 test connections in `outbox_worker_lifecycle_tests.py`.

---

## 2. Architectural Hardening Controls

### Safe Environment Preparation & Idempotent Provisioning
- **Script**: `backend/tests/prepare_test_environment.py`
- **Idempotency**: Utilizes PL/pgSQL blocks (`DO $$ ... $$`) to check role existence before creation, ensuring shared development roles are never dropped.
- **Safety Guards**:
  - Requires `DIFARYX_ALLOW_TEST_DB_RESET=YES`.
  - Refuses to drop/recreate any database whose name does not end with `_test`.
  - Explicitly rejects resetting `difaryx`, `postgres`, `template0`, and `template1`.

### Table-Level Least-Privilege Grant Matrix
Table privileges are assigned dynamically via `backend/tests/apply_grants.py` based on an explicit role matrix:
- **`difaryx_app` (Group Role / API & Scientist Users)**:
  - `SELECT` only on core identity tables (`organizations`, `users`, `memberships`).
  - `SELECT, INSERT, UPDATE` on project-private tables (`projects`, `analysis_runs`, `analysis_stages`, `analysis_artifacts`, `evidence_items`, `fusion_runs`).
  - `INSERT` on `outbox.outbox_events` (to append transactional events).
  - **No access** to `governance.audit_log`.
- **`difaryx_admin_test`**:
  - `SELECT, INSERT` on `governance.audit_log` for privileged logging checks.
- **`difaryx_purge_test`**:
  - Restricted `SELECT, DELETE` on project, outbox, and quota ledger tables. No app group permissions.

### Downstream RLS Policies (Alembic `0008`)
Foreign keys do not inherit RLS policies. To prevent cross-project leakage within the same organization, we enabled RLS and added project-membership-aware constraints on all child tables:
- `science.analysis_runs`, `science.analysis_stages`, `science.analysis_artifacts`, `science.analysis_stage_results`, `science.analysis_run_events`
- `science.evidence_items`, `science.evidence_versions`
- `science.fusion_runs`, `science.fusion_run_evidence`, `science.reasoning_runs`
- `science.reference_library_scopes`

---

## 3. Execution Verification Evidence

### Command A — Safe Database Reset & Migrations
```powershell
python backend/tests/prepare_test_environment.py
```
- **Exit Code**: `0`
- **Revisions Applied**: `0001` -> `0008` (head)
- **Least-Privilege Grants**: Applied cleanly on all tables.

### Command B — Python Backend Test Suite
```powershell
python backend/tests/run_phase0_tests.py
```
- **Exit Code**: `0`
- **Results**:
  - **DDL Integrity Catalog Verification**: `PASS` (31 tables checked, RLS active/forced on all, 17 CHECK constraints verified)
  - **Basic Tenant Isolation**: `PASS` (Workers 1-5 isolate correctly; cross-tenant updates/inserts blocked)
  - **Synchronous Pooled Connection Isolation**: `PASS` (Reused connection clean, no context leak)
  - **Project Membership & RLS Isolation**: `PASS` (Lead, Reviewer, and non-member access permissions validated)
  - **Outbox Worker Lifecycle Concurrency**: `PASS` (Atomic claims, stale lock reclamation, retry/DLQ work perfectly)
  - **Fingerprint Golden Tests**: `PASS` (Schema-driven sorting, floats, Unicode NFC/NFD normalized)

### Command C — Frontend Verification Suite
- **Typecheck (`npm run typecheck`)**: `PASS` (0 errors)
- **Linter (`npm run lint`)**: `PASS` (0 warnings)
- **Validation Harness (`npm run validate`)**: `PASS` (All safety, regression, and case floors met)
- **Production Build (`npm run build`)**: `PASS` (Vite build completed successfully)

---

## 4. Phase 0 Limitations Register

The following is the verifiable status of integrations at the close of Phase 0:

- **Database outbox functions**: `PASS`
- **Real Celery/Redis integration**: `NOT IMPLEMENTED`
- **Synchronous psycopg2 pool isolation**: `PASS`
- **Production async database integration**: `NOT IMPLEMENTED`
- **Secure upload/object storage**: `NOT IMPLEMENTED`
- **FastAPI persistence integration**: `NOT IMPLEMENTED`
- **Production authentication**: `NOT IMPLEMENTED`
- **Production GCP deployment**: `NOT IMPLEMENTED`

---

## 5. CI / Verification Entry Points

These repeatable commands are verified for integration into CI pipelines:

### A. Safe test environment preparation (Destructive on Test DB only)
Creates the database schema, roles, and grants. Safe checks will abort if target database does not end with `_test`.
```powershell
$env:DIFARYX_ALLOW_TEST_DB_RESET = "YES"
$env:DIFARYX_BOOTSTRAP_DATABASE_URL = "<set locally or through CI secret>"
$env:DATABASE_URL = "<set locally or through CI secret>"
$env:DIFARYX_TEST_DATABASE_URL = "<set locally or through CI secret>"
$env:DIFARYX_API_TEST_DATABASE_URL = "<set locally or through CI secret>"
$env:DIFARYX_PURGE_TEST_DATABASE_URL = "<set locally or through CI secret>"
$env:DIFARYX_ADMIN_TEST_DATABASE_URL = "<set locally or through CI secret>"

$env:DIFARYX_API_PASSWORD = "<secret>"
$env:DIFARYX_PURGE_PASSWORD = "<secret>"
$env:DIFARYX_ADMIN_PASSWORD = "<secret>"
$env:DIFARYX_RLS_TEST_PASSWORD = "<secret>"

python backend/tests/prepare_test_environment.py
```

### B. Non-destructive backend validation
Runs the suite of catalog, tenant isolation, project membership, outbox, and fingerprint tests.
```powershell
python backend/tests/run_phase0_tests.py
```

### C. Frontend validation
Runs typechecking, lint checks, validation cases, and Vite production compilation.
```powershell
npm run typecheck
npm run lint
npm run validate
npm run build
```
