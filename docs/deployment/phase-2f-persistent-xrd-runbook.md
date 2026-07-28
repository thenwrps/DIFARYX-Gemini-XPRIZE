# Phase 2F Persistent XRD Staging Runbook

This runbook verifies the first persistent DIFARYX scientific vertical slice:

`verified Google session -> authorized project -> XRD dataset -> immutable raw upload -> isolated validation -> canonical evidence -> deterministic or configured Gemini reasoning -> History -> Notebook reference`

It does not provision cloud resources, enable billing, deploy production, or migrate XPS, FTIR, Raman, or multi-tech fusion.

## Release boundary

- Revision: Alembic `0017`, applied after `0016`.
- Browser boundary: same-site TypeScript `/api/persistent/*` routes only.
- Internal boundary: HMAC-SHA256 signed `/internal/phase2f/*` requests.
- Identity: server-verified Google `sub`, resolved through PostgreSQL external identities.
- Tenant: `Active-Organization` must be one of that verified subject's provisioned memberships.
- Evidence: raw objects and evidence snapshots are immutable; reasoning records the evidence SHA-256.
- Reasoning: deterministic remains quota-free. Configured Gemini retains the Phase 2E verified-session and fail-closed quota boundary.

## Required staging services

1. PostgreSQL with migrations `0001` through `0016` already applied.
2. Durable object storage configured for the existing FastAPI object-store adapter.
3. The isolated parser runtime required by the validation worker.
4. FastAPI gateway and validation worker from the same release revision.
5. TypeScript reasoning/session server from the same release revision.
6. Frontend built with `VITE_WORKSPACE_DATA_MODE=server`.
7. Existing Google OAuth, Redis session, Gemini quota, and optional Gemini provider configuration from Phase 2E.

Do not substitute a browser token, profile field, guest state, or local storage value for the Phase 2E session.

## Server-only configuration

Configure these only on trusted services:

```text
DATABASE_URL=<service-specific PostgreSQL URL: application role on FastAPI, validation-worker role on worker>
DIFARYX_INTERNAL_SERVICE_SECRET=<independent random secret, at least 32 characters>
PERSISTENCE_API_BASE_URL=https://<private-or-authenticated-fastapi-origin>
PERSISTENCE_REQUEST_TIMEOUT_MS=30000
DIFARYX_MAX_FILE_SIZE_BYTES=104857600
```

The TypeScript server and FastAPI service must share `DIFARYX_INTERNAL_SERVICE_SECRET`. The browser must never receive it.

Retain the Phase 2E server-only values:

```text
GOOGLE_OAUTH_CLIENT_ID
GOOGLE_OAUTH_CLIENT_SECRET
GOOGLE_OAUTH_REDIRECT_URI
APP_BASE_URL
DIFARYX_SESSION_SECRET
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
QUOTA_ID_HASH_SECRET
GEMINI_GLOBAL_DAILY_LIMIT
GEMINI_API_KEY
```

For the browser build:

```text
VITE_WORKSPACE_DATA_MODE=server
VITE_AGENT_API_URL=<same-site TypeScript API origin, or omit behind a reverse proxy>
```

Do not use `VITE_XRD_BACKEND_URL` for the persistent path.

## Pre-migration checks

From the release checkout:

```powershell
git rev-parse HEAD
git status --short
py -3 -m compileall -q server/python/api backend/migrations/versions/0017_persistent_xrd_vertical_slice.py
npm.cmd run typecheck:server
npm.cmd run typecheck
npm.cmd run build
```

Confirm that:

- the database backup and restore procedure has been tested;
- the object-store staging and final prefixes are writable by the expected service identity;
- the parser image/runtime is available to the worker;
- application and worker roles are not superusers and do not bypass RLS;
- clocks on the TypeScript and FastAPI services are synchronized within five minutes.

## Apply migration

Use the existing Alembic deployment procedure with the migration owner:

```powershell
alembic -c backend/alembic.ini current
alembic -c backend/alembic.ini upgrade 0017
alembic -c backend/alembic.ini current
```

Expected current revision: `0017`.

Migration `0017` is forward-only because automatic downgrade would delete scientific provenance. Recovery is restore/forward-fix, not `alembic downgrade`.

Verify in PostgreSQL:

```sql
SELECT version_num FROM alembic_version;

SELECT schemaname, tablename, rowsecurity, forcerowsecurity
FROM pg_tables
WHERE schemaname = 'science'
  AND tablename IN (
    'xrd_evidence_snapshots',
    'reasoning_runs',
    'notebook_reasoning_references'
  )
ORDER BY tablename;

SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'science'
  AND table_name IN (
    'datasets',
    'upload_sessions',
    'xrd_evidence_snapshots',
    'reasoning_runs',
    'notebook_reasoning_references'
  )
ORDER BY grantee, table_name, privilege_type;
```

All three new tables must report both RLS and forced RLS. Review grants against `difaryx_app` and `difaryx_validation_worker`; do not grant browser or public access.

## Start order

1. PostgreSQL.
2. Durable object store.
3. Isolated parser runtime.
4. FastAPI gateway.
5. Validation worker.
6. Redis session/quota dependencies.
7. TypeScript server.
8. Frontend/reverse proxy.

Start FastAPI and the worker with the same code revision. A worker without Phase 2F evidence publication must not process Phase 2F XRD attempts.

## Health and boundary checks

1. Confirm TypeScript `/api/health` and FastAPI `/health` are healthy.
2. Call `/api/persistent/projects` without a DIFARYX session. Expect `401`.
3. Call a FastAPI `/internal/phase2f/*` route without internal signature headers. Expect `401`.
4. Send an expired or invalid HMAC signature. Expect `401` before identity resolution.
5. Sign in through Google, then call `/api/session`. Confirm only the DIFARYX session is exposed; no Google token is returned.
6. Select an authorized organization. A non-member organization UUID must return `403`.

## Happy-path acceptance

Use a small synthetic XRD signal with 10 to 10,000 finite, non-negative intensity rows and strictly increasing two-theta values. Supported extensions are `.csv`, `.txt`, `.xy`, and `.dat`.

1. Sign in with a provisioned Google account.
2. Open `/workspace`, select an authorized organization, and create or select a persistent project.
3. Open the XRD persistent workflow.
4. Create an XRD dataset with a reviewer-readable title.
5. Upload the synthetic signal.
6. Observe `hashing -> uploading -> finalizing -> validating`.
7. Confirm the dataset reaches `valid` only when evidence reaches `ready`.
8. Record the dataset ID, upload ID, validation attempt ID, evidence ID, evidence version, raw-object SHA-256, and evidence SHA-256.
9. Run deterministic reasoning. Confirm quota classification is `not_required`.
10. If configured Gemini staging access is authorized, run configured Gemini. Confirm one atomic quota decision occurs before provider invocation.
11. Open History and confirm the run links to the same dataset, evidence ID, and evidence checksum.
12. Reference the successful run in Notebook and confirm the Notebook entry links back to the reasoning run and evidence.
13. Reload each page and restart the frontend. Confirm dataset, authoritative statuses, evidence, reasoning history, and Notebook reference reload from the server.

## Future live staging smoke sequence

This is a runbook only. It has not been executed by the implementation agent.

1. Apply migrations through `0017`.
2. Start the TypeScript API with Phase 2E session and Phase 2F persistence configuration.
3. Start the upload/validation worker from the same release revision.
4. Start the FastAPI Python XRD processor/gateway.
5. Verify PostgreSQL connectivity using the application and worker roles.
6. Verify Redis session and quota connectivity.
7. Verify object-store staging, head, promotion, read, and delete connectivity with non-confidential test bytes.
8. Complete Google OAuth using a provisioned staging test user.
9. Verify the Secure, HttpOnly, SameSite=Lax DIFARYX session cookie and `/api/session`.
10. Create an authorized project.
11. Create an XRD dataset.
12. Upload a non-confidential sample XRD file.
13. Verify the stored object size and authoritative SHA-256 without exposing its internal key to the browser.
14. Finalize the upload.
15. Run validation and XRD processing through the worker.
16. Verify the immutable canonical evidence snapshot, version, warnings, limitations, and checksum.
17. Run deterministic persistent reasoning.
18. Run configured Gemini persistent reasoning.
19. Verify the atomic quota result and provider/fallback classification.
20. Verify History reload from the server.
21. Create and reload a Notebook reference.
22. Refresh the browser and restart the frontend.
23. Verify authoritative state recovery at each page.
24. Attempt direct-ID and filter access as a second tenant.
25. Verify all cross-tenant access is rejected by the signed membership boundary and PostgreSQL RLS.
26. Clean up only the named staging test organization/resources using an approved, audited procedure.

## Database evidence queries

Run these as an RLS-bound application identity for the test organization:

```sql
SELECT id, dataset_status, evidence_status, current_evidence_id
FROM science.datasets
WHERE id = '<dataset-id>';

SELECT id, dataset_id, version, status, content_sha256, created_at
FROM science.xrd_evidence_snapshots
WHERE dataset_id = '<dataset-id>'
ORDER BY version;

SELECT id, dataset_id, evidence_snapshot_id, evidence_content_sha256,
       execution_mode, status, provider, fallback_used,
       quota_classification, completed_at
FROM science.reasoning_runs
WHERE dataset_id = '<dataset-id>'
ORDER BY created_at;

SELECT id, reasoning_run_id, evidence_snapshot_id, label, created_at
FROM science.notebook_reasoning_references
WHERE dataset_id = '<dataset-id>'
ORDER BY created_at;
```

The reasoning checksum must equal its evidence snapshot checksum. A `valid` XRD dataset must have a non-null current evidence ID.

## Failure and security matrix

Verify each case returns a bounded error and no optimistic success:

- empty, oversized, unsupported-extension, unsupported-MIME, path-like, control-character, malformed, non-finite, negative-intensity, non-monotonic, too-short, and too-narrow files;
- client checksum mismatch and authoritative object checksum/size mismatch;
- duplicate upload idempotency key with a different dataset or request;
- duplicate reasoning idempotency key with different evidence or provider;
- parser unavailable, parser timeout, processor input rejection, and processor failure;
- validation lease loss while evidence is being published;
- browser-supplied evidence packet or internal identity headers;
- missing, expired, revoked, or unavailable Phase 2E session;
- unauthorized organization and cross-tenant project/dataset/evidence UUIDs;
- Gemini quota exceeded (`429`) and quota service unavailable (`503`) before provider invocation;
- configured Gemini unavailable (`503`);
- provider error fallback with `fallback_used=true` and consumed quota retained.

For every failed path, confirm raw/evidence/reasoning state is not falsely marked successful.

## Tenant-isolation acceptance

Provision two staging organizations and users with no shared membership.

1. Create a project, dataset, evidence snapshot, reasoning run, and Notebook reference in organization A.
2. Bind the application connection to organization B.
3. Attempt list and direct-ID access to every organization-A resource.
4. Expect no rows or `404/403`, according to the public route contract.
5. Repeat with forged `Active-Organization`, browser-supplied service headers, and an organization-A UUID in a signed organization-B request.
6. Run the existing tenant isolation and worker multi-organization suites.

Do not treat application filtering as tenant isolation evidence; record PostgreSQL RLS results.

## Immutability acceptance

1. Attempt to update evidence content or checksum as the application role. Expect denial.
2. Attempt to delete an evidence snapshot. Expect denial.
3. As the worker, create a successor snapshot and supersede the prior ready snapshot. Confirm only `status` and `superseded_at` changed on the prior row.
4. Confirm older reasoning still links to the prior immutable evidence and checksum.
5. Confirm a Notebook reference cannot silently move to a different reasoning run or evidence snapshot.

## Required release evidence

Archive:

- release commit SHA and clean worktree status;
- migration current output and RLS/grant queries;
- exact passed/failed/skipped test output;
- happy-path IDs and checksums;
- refresh/restart screenshots or browser evidence;
- tenant-isolation query results;
- failure-matrix results;
- worker logs showing claim, validation, evidence publication, and fenced settlement without raw file contents;
- TypeScript logs showing request IDs, provider/fallback classification, and quota outcome without secrets or evidence payloads.

## Log redaction

- Log request, project, dataset, upload, validation, evidence, and reasoning identifiers only when operationally required.
- Never log raw file bytes, processed arrays, evidence packets, Google tokens, session cookies, HMAC signatures/secrets, database URLs, Redis tokens, storage credentials, internal object keys, or provider keys.
- Keep user-facing failures bounded. Preserve stack traces only in access-controlled service telemetry.
- Verify redaction with synthetic values before enabling staging traffic.

## Staging cleanup

Cleanup is an operator-approved live action. Resolve exact tenant/project/dataset targets first, archive acceptance evidence, stop the worker, and use the existing audited purge procedure. Remove only the named non-confidential smoke-test objects and rows. Do not use broad prefixes, recursive filesystem deletion, or ad hoc cross-table deletes.

After cleanup, verify:

- the test account retains only its intended memberships;
- no queued/running validation attempt remains for the removed test dataset;
- object-store staging and final test objects are gone;
- quota/session cleanup follows the Phase 2E operational policy;
- other tenants' row and object counts are unchanged.

## Secret rotation

Rotate `DIFARYX_INTERNAL_SERVICE_SECRET` as a coordinated TypeScript/FastAPI change during a maintenance window because the current protocol accepts one secret. Stop or drain internal traffic, set the new value on both trusted services, restart FastAPI and TypeScript, verify unsigned/old signatures fail, then resume traffic.

Rotate Phase 2E OAuth, session, Redis, quota-HMAC, Gemini, database, and storage credentials through their existing owner-approved procedures. Rotation must not expose values to the browser. Rotating `DIFARYX_SESSION_SECRET` revokes existing sessions; rotating `QUOTA_ID_HASH_SECRET` changes effective quota identities and requires an explicit quota-reset decision.

## Rollback and incident response

Do not downgrade `0017`.

If acceptance fails:

1. Stop the frontend persistent entry point and TypeScript server traffic.
2. Stop the validation worker to prevent additional state transitions.
3. Preserve PostgreSQL, object storage, request IDs, and sanitized logs.
4. Diagnose and deploy a forward fix from a reviewed commit.
5. If database restoration is required, restore PostgreSQL and its corresponding object-store snapshot to a mutually consistent point.
6. Re-run the full migration, tenant, worker, and happy-path acceptance matrix.

## Explicitly deferred live steps

These require operator authority and are not performed by implementation agents:

- provisioning or changing PostgreSQL, Redis, object storage, parser runtime, Cloud Run, Vercel, DNS, OAuth, IAM, or billing;
- setting production secrets;
- applying migration `0017` to staging or production;
- deploying services or workers;
- executing real Google sign-in or configured Gemini quota consumption;
- uploading real research data;
- production smoke tests, traffic promotion, rollback, or incident actions.
