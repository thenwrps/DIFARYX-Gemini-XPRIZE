# Phase 2F Live Staging Validation

**Branch:** `feat/vercel-gemini-backend`
**Baseline commit:** `470fca8669ddd7f912ae0e2c2f4ea003e482287e`
**Validation date:** 2026-07-28
**Status:** PARTIAL — local live PostgreSQL validation completed; external staging validation blocked
**Production approval:** No

## 1. Objective and safety boundary

This workflow validates the Phase 2F persistent XRD vertical slice against
real PostgreSQL roles and transactions, then defines the remaining external
staging checks for object storage, OAuth, server sessions, Redis quotas,
configured Gemini, and browser recovery.

The validation preserves these boundaries:

- `phase1-failed-recovery.patch` remains untracked and must not be staged,
  deleted, moved, or modified.
- Its locked SHA-256 is
  `1F4F44C405F5AFE8E75A0048FEF2BF028EE18F5F4A0E89517629D03D449F204A`.
- No production, shared development, or user database may be targeted.
- Database writes require both an explicitly staging/test database name and
  `DIFARYX_ALLOW_LIVE_STAGING_VALIDATION=YES`.
- Synthetic fixture writes additionally require
  `DIFARYX_PHASE2F_ALLOW_SYNTHETIC_WRITES=YES`.
- Credentials, session cookies, tokens, HMAC signatures, database URLs,
  prompts, raw uploads, object keys, and scientific arrays are not evidence
  artifacts and must not be logged.
- No push, merge, deployment, DNS, billing, or external-resource mutation is
  authorized by this workflow.

## 2. Harness

The minimum harness is `scripts/phase2f_live_staging.py`.

### Preflight

```powershell
py -3 scripts/phase2f_live_staging.py preflight
```

Preflight is read-only. It validates the branch, baseline commit, protected
patch hash, tool availability, and presence—not values—of configuration
groups.

### Synthetic PostgreSQL fixtures

Use only a disposable staging/test database and distinct admin, app, and
worker URLs. Values belong in ignored local configuration or the invoking
process, never this document.

```powershell
$env:DIFARYX_ALLOW_LIVE_STAGING_VALIDATION = "YES"
$env:DIFARYX_PHASE2F_ALLOW_SYNTHETIC_WRITES = "YES"
py -3 scripts/phase2f_live_staging.py seed-postgres
```

The seed is idempotent and creates only fixed `aaaaaaaa-*` and `bbbbbbbb-*`
synthetic tenant fixtures. Cleanup is intentionally not automatic; review the
recorded evidence first, then remove only those exact fixture identifiers or
discard the disposable database.

### Live PostgreSQL checks

```powershell
$env:DIFARYX_PHASE2F_USE_SYNTHETIC_FIXTURES = "YES"
py -3 scripts/phase2f_live_staging.py postgres
```

This mode validates:

- Alembic revision `0017`;
- `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`;
- non-superuser, non-`BYPASSRLS` app and worker group roles;
- installed Phase 2F app/worker policies;
- transaction-local context reset across pooled connection reuse;
- two-tenant project isolation;
- two-tenant evidence, reasoning History, and Notebook row isolation;
- worker column-level evidence mutation restrictions;
- live evidence immutability trigger behavior.

## 3. Exact validation plan

### Gate A — repository and evidence preflight

1. Confirm branch `feat/vercel-gemini-backend`.
2. Confirm baseline `470fca8669ddd7f912ae0e2c2f4ea003e482287e`
   before validation changes.
3. Confirm the protected patch hash and status.
4. Record all other worktree changes without staging anything.
5. Run the preflight harness.
6. Stop external execution if any required configuration group is blocked.

Acceptance:

- branch and baseline match;
- protected hash matches before and after every validation group;
- no secret value is printed;
- external checks are never silently converted into mocks.

### Gate B — local regression evidence

Run:

```powershell
npm.cmd run build
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run typecheck:server
npm.cmd run test:server
npm.cmd run test:frontend
py -3 -m unittest `
  backend.tests.test_phase2f_internal_auth `
  backend.tests.test_phase2f_worker_evidence `
  backend.tests.test_phase2f_processing `
  backend.tests.test_phase2f_migration
npx.cmd vitest run `
  src/scientificReview/__tests__/evidenceStacks.characterization.test.ts `
  src/scientificReview/__tests__/routeResolution.characterization.test.ts
git diff --check
```

Classify sandbox or environment failures separately from implementation
failures. Do not call the aggregate repository green when the stale
`src/App.tsx` characterization path still fails.

### Gate C — migration 0017 and real PostgreSQL roles

1. Provision a new PostgreSQL 15 database whose name contains `staging` or
   ends in `_test`.
2. Create distinct login roles for admin, application, and validation worker.
3. Apply migrations 0001 through 0017 in one clean chain.
4. Apply the repository's least-privilege grant matrix.
5. Verify `alembic_version = 0017`.
6. Verify the Phase 2F tables have both RLS flags.
7. Verify `difaryx_app` and `difaryx_validation_worker` are neither superuser
   nor `BYPASSRLS`.
8. Verify app policies on evidence, reasoning, and Notebook references and the
   worker evidence policy.
9. Verify the legacy consent/governance reasoning records remain preserved in
   `science.ai_governance_reasoning_runs`.

Acceptance:

- clean migration reaches 0017;
- failure leaves revision 0016 without partial 0017 state;
- legacy reasoning data is renamed, not dropped;
- actual app/worker roles enforce RLS.

### Gate D — pooled connection and cross-user isolation

1. Seed two synthetic tenants, users, projects, datasets, evidence snapshots,
   reasoning runs, and Notebook references.
2. Set tenant/user context with `set_config(..., true)` inside a transaction.
3. Roll back and return the connection to a one-connection pool.
4. Reuse the same connection without setting context.
5. Confirm the GUC is empty and no projects are visible.
6. For tenant A and tenant B separately, confirm own row count is one and the
   other tenant's row count is zero for:
   - projects;
   - `xrd_evidence_snapshots`;
   - `reasoning_runs` (History);
   - `notebook_reasoning_references`.
7. Attempt cross-tenant insert, update, and delete through the app/API boundary.
8. Confirm forbidden reads are `404` or sanitized `403`, consistent with the
   route contract.

Acceptance:

- no GUC or row leakage after commit, rollback, cancellation, or pool reuse;
- cross-tenant reads are zero;
- cross-tenant writes affect zero rows or are rejected;
- no browser-supplied organization identifier overrides server membership.

### Gate E — object storage and upload finalization

The current repository factory exposes an in-memory test adapter and a local
filesystem adapter. It does not contain a GCS, S3, Vercel Blob, or other
shared cloud-object-store adapter. A mounted, durable filesystem may be used
for controlled staging, but multi-instance production storage is not proven.

For the configured staging adapter:

1. Use an absolute storage path outside the repository.
2. Upload one synthetic XRD CSV with a known SHA-256.
3. Confirm staging bytes, authoritative bytes, byte count, and digest.
4. Finalize the same upload twice and confirm one authoritative object and one
   validation attempt.
5. Send two finalization requests concurrently and confirm the same invariant.
6. Inject these failures independently:
   - storage promotion before database settlement failure;
   - database transition before storage promotion failure;
   - validation enqueue before finalization settlement failure;
   - storage timeout during promotion;
   - process termination after promotion;
   - orphaned staging and promoted object recovery.
7. Confirm no log contains raw bytes, paths, internal object keys, or a
   directory listing.

Acceptance:

- no duplicate authoritative object;
- no duplicate active validation attempt;
- database and storage converge or a deterministic recovery item is created;
- retry is idempotent;
- no internal storage path is logged.

### Gate F — multi-worker lease and stale-worker races

Run the existing real-database suite:

```powershell
py -3 backend/tests/test_validation_worker_lost_ownership.py
```

Then run two actual worker processes for the same queue:

1. Worker A claims attempt 1 and enters `running`.
2. Stop A's heartbeat and expire its lease.
3. Worker B reclaims attempt 1 and enters `running`.
4. B settles or publishes evidence.
5. Resume A and attempt failure settlement and evidence publication.
6. Confirm A is a no-op.
7. Race two failure settlements and confirm exactly one queued successor.
8. Race heartbeat renewal against stale reclaim.
9. Restart PostgreSQL during settlement and verify retry/ownership fencing.

Acceptance:

- one owner at a time;
- stale owner changes zero rows and publishes no evidence;
- exactly one successor row;
- no exhausted attempt is reclaimed;
- only one ready evidence snapshot per dataset.

### Gate G — OAuth, session cookies, Redis, and Gemini quotas

Use two synthetic Google staging accounts and no personal or research data.

1. Complete Authorization Code + PKCE through the staging callback.
2. Verify the URL contains no token or authorization code after redirect.
3. Verify no Google or DIFARYX secret is stored in local/session storage.
4. Verify the session cookie is `HttpOnly`, `Secure`, and has the intended
   `SameSite` value and host/path.
5. Refresh and confirm `/api/session` restores the verified account.
6. Revoke/logout and confirm the old session returns `401`.
7. Verify Redis session TTL and revocation without logging the session key.
8. Run Gemini twice within the burst allowance, then verify the next request
   returns `429` with safe reset information and no provider call.
9. Verify user-daily and global-daily dimensions separately.
10. Make Redis unavailable and confirm sanitized `503`, no quota increment,
    and no Gemini call.
11. Run configured Gemini success and record provider/model/request ID without
    recording prompts or output data.
12. Inject an eligible provider failure after quota consumption and confirm
    deterministic fallback is returned and persisted with `fallback_used`.
13. Confirm `401`, `403`, invalid input, stale evidence, `429`, and quota
    `503` never fall back and never call Gemini.

Acceptance:

- verified Google `sub` is the only quota identity input;
- guest/demo/browser profile cannot authorize persistent Gemini;
- one provider attempt consumes once;
- fail-closed errors do not invoke Gemini;
- cookies and tokens do not leak.

### Gate H — browser refresh, History/Notebook, and cross-user recovery

1. Sign in as account A.
2. Create project/dataset, upload, finalize, validate, run reasoning, and add a
   Notebook reference.
3. Record IDs only.
4. Hard refresh during upload, validation, and completed-result states.
5. Close the browser and reopen the staging URL.
6. Confirm project, evidence, History, and Notebook reload from the server.
7. Sign out, sign in as account B, and attempt direct navigation and API calls
   using A's IDs.
8. Confirm B sees none of A's History, Notebook, evidence, project, dataset,
   or object metadata.
9. Sign back in as A and confirm records remain available.
10. Confirm browser back/forward and multiple tabs do not revive a logged-out
    session or duplicate mutations.

Acceptance:

- server persistence is authoritative after refresh;
- History and Notebook retain evidence/checksum lineage;
- cross-user access is denied without revealing resource existence;
- no automatic retry loop follows `401`, `429`, or `503`.

## 4. Executed evidence

### Preflight

Passed:

- branch matched;
- baseline commit matched;
- protected patch hash matched;
- Git, Node, npm, Python launcher, and Docker client were available.

Blocked:

- PostgreSQL URLs were not present in the original process environment;
- `DIFARYX_LOCAL_STORAGE_PATH` was absent;
- persistence-boundary variables were absent;
- OAuth/session variables were absent;
- Redis/quota variables were absent;
- Gemini variables were absent;
- browser-boundary variables were absent.

The preflight correctly returned exit code 2 and made no network request.

### Local regression evidence

| Gate | Result |
|---|---|
| Production build | PASS |
| ESLint | PASS |
| Frontend typecheck | PASS |
| Server typecheck | PASS |
| Server Vitest | PASS — 155/155 across 11 files |
| Frontend targeted Vitest | PASS — 23/23 across 2 files |
| Phase 2F targeted Python | PASS — 16/16 after the added migration assertion |
| Local object store | PASS — 11 tests, 1 skipped; one pre-existing async-generator warning |
| Ingestion/object-store semantics | PASS — 27/27 |
| Characterization | PARTIAL — 4/5; stale `src/App.tsx` path failed |
| `git diff --check` before edits | PASS |

The characterization failure is the previously documented repository path
drift, not a Phase 2F runtime regression. The repository-wide aggregate suite
must not be called green.

### Live PostgreSQL evidence

An isolated PostgreSQL 15 container was created with:

- an exact task-specific container name;
- a `tmpfs` database directory;
- localhost-only port binding;
- database `difaryx_phase2f_staging`;
- no existing repository Docker volume.

Initial clean migration:

- migrations 0001 through 0016 passed;
- migration 0017 failed with `DuplicateTable` because migration 0005 had
  already created `science.reasoning_runs`;
- the transaction rolled back and `alembic current` remained 0016.

Narrow fix:

- migration 0017 now renames the old consent/governance table to
  `science.ai_governance_reasoning_runs`;
- its primary-key constraint/index is renamed before the new Phase 2F
  `science.reasoning_runs` is created;
- no old table or data is dropped.

Clean rerun:

- migrations 0001 through 0017 passed;
- `alembic current` reported `0017 (head)`.

Live harness after least-privilege grants and synthetic fixtures:

| Check | Result |
|---|---|
| Migration revision 0017 | PASS |
| FORCE RLS on all three Phase 2F tables | PASS |
| App/worker roles are non-superuser and non-`BYPASSRLS` | PASS |
| App/worker policies installed | PASS |
| Transaction-local pooled connection reset | PASS |
| Two-tenant project reads | PASS — own 1, other 0 for A and B |
| Two-tenant evidence reads | PASS — own 1, other 0 for A and B |
| Two-tenant History reads | PASS — own 1, other 0 for A and B |
| Two-tenant Notebook reads | PASS — own 1, other 0 for A and B |
| Worker evidence-content update privilege | PASS — rejected with SQLSTATE 42501 |
| Evidence immutability trigger | PASS — rejected with SQLSTATE 55000 |

The older tenant-isolation script produced nine passing checks and five
passing concurrent tenant workers. Its combined update/delete test reported a
failure because the app role has no table-level `DELETE` privilege; that is a
stricter permission boundary, not a cross-tenant write.

### Live worker evidence

The first real-database run found `RETURNING id` ambiguity in
`mark_failed_with_retry()`. PostgreSQL returned `AmbiguousColumn`, preventing
stale-worker settlement.

Narrow fix:

- the successor insert uses alias `successor_attempt` and returns
  `successor_attempt.id`;
- the dataset update uses alias `retry_dataset` and returns
  `retry_dataset.id`.

The existing live suite then passed all three scenarios:

- stale Worker A became a no-op after Worker B reclaimed and settled;
- direct exhaustion did not settle or requeue;
- two concurrent settlements created exactly one successor.

### Object-store evidence

- local promotion/idempotency/conflict tests passed;
- the production-path debug directory listing was removed;
- a regression test confirms `get_object()` emits no internal paths to stderr.
- the combined Phase 2F, local-store, and ingestion run passed 54 tests with
  one platform-dependent symlink test skipped; an existing async-generator
  cleanup warning remains visible and is not counted as a failure.

Not executed:

- full API concurrent-finalization race;
- cross-system storage/database failure injection;
- external/shared object store;
- multi-instance storage behavior.

## 5. Findings

| ID | Severity | Status | Blocker |
|---|---|---|---|
| STG-2F-001 | High | Fixed in working tree and live-rerun | Merge until reviewed |
| STG-2F-002 | High | Fixed in working tree and live-rerun | Merge until reviewed |
| STG-2F-003 | Medium | Fixed in working tree; unit regression passed | Merge until reviewed |
| STG-2F-004 | High | Open — no shared cloud-object-store adapter | Public multi-instance production |
| F-2F-SEC-001 | Medium | Open — no stateful internal-request replay rejection | Public production |
| F-2F-SEC-002 | Low | Open — non-finite JSON not explicitly rejected | Audit-grade scientific output |

### STG-2F-001 — migration 0017 table-name collision

Migration 0005 and migration 0017 both created `science.reasoning_runs`.
Clean upgrade failed at 0017. The fix preserves the old table under a new,
explicit name and creates the Phase 2F table afterward.

### STG-2F-002 — ambiguous retry settlement `RETURNING`

The live stale-worker path failed on unqualified `RETURNING id` inside a
data-modifying CTE. Qualified aliases fixed the real PostgreSQL path.

### STG-2F-003 — object-store path disclosure in logs

`LocalObjectStore.get_object()` wrote the base path, resolved object path, and
a recursive directory listing to stderr. The logging was removed and covered
by a regression test.

### STG-2F-004 — no shared cloud-object-store implementation

`get_object_store()` returns only `InMemoryObjectStore` in tests or
`LocalObjectStore` otherwise. A durable mounted filesystem can support a
single controlled staging instance, but shared multi-instance production
storage is not implemented or validated.

## 6. Remaining external blockers

The following were not executed because this environment had no authorized
staging URLs or credentials:

- deployed FastAPI and TypeScript services;
- shared object storage and fault injection;
- Google OAuth callback and secure cookie inspection;
- Redis session TTL/revocation;
- live burst, user-daily, and global quota counters;
- configured Gemini success and fallback;
- browser refresh recovery;
- History and Notebook reload through deployed APIs;
- cross-user browser and direct-object isolation;
- full heartbeat-versus-reclaim race with two continuously running workers.

These are blocked, not passed.

## 7. Review gate

Before any push or merge:

1. Review the three narrow fixes and harness.
2. Re-run the local regression gates.
3. Re-run a clean 0001→0017 migration.
4. Re-run the live PostgreSQL harness and worker suite.
5. Recheck the protected patch hash.
6. Confirm only Phase 2F validation and verified-defect files are staged.

Phase 2F is not production-ready until all external blockers are executed and
F-2F-SEC-001 is resolved.
