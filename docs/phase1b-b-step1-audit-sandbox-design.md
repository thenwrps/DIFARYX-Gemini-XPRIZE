# Phase 1B-B Step 1: Validation Runtime Audit and Sandbox Design Proposal

Status: audit/design plus Gate A provisioning probe. Implementation is blocked until the required native-Windows isolation controls are provisionable.

Audit date: 2026-07-16

Baseline rule: migrations `0001` through `0014` are treated as immutable. Any implementation migration starts at `0015`.

## Executive decision summary

The current Phase 1B path is a real ingestion and worker lifecycle, but it is not yet a technique validation runtime.

| Area | Finding | Step 1 disposition |
|---|---|---|
| Worker validation | Real queue claiming, leasing, storage reads, byte counting, SHA-256 recomputation, extension/content policy, and bounded UTF-8 inspection. No technique parser and no technique rules. | Not ready to call validation complete. |
| Finalization integrity | Server hashes and counts the upload while streaming, and `promote_staging` rehashes the staging file. Finalization does not explicitly compare the promoted result to `expected_byte_size`, and the post-promotion object is not independently rehashed by the finalize path. | Add an independent final-object verification gate in Step 3. |
| Raw persistence | Original bytes are streamed at full resolution into staging and promoted to the configured final object store. The database stores metadata and lineage, not bytes. | Persistence exists; strict retention/WORM semantics and authoritative stored digest still need definition. |
| Parser/sandbox | No Phase 1B parser registry, parser sandbox, or crash-isolated validation child exists. Older API analysis routes contain separate pandas-based parsers and are not part of the worker path. | Design below; generic parser can use zero new dependencies. |
| Status invariants | The worker has guarded transition helpers, but an authenticated API route calls `ValidationService.process_one`, and `difaryx_app` has direct dataset-status update privileges. Therefore worker-only status ownership is not currently true. | Must be closed in `0015` before calling the runtime safe. |

The proposed boundary is an `IsolatedParserRunner` abstraction. The baseline adapter is a hardened, crash-isolated subprocess for native development; the production adapter will be a container or microVM behind the same contract in Phase 4. Windows Sandbox is optional as a local-development adapter only. The worker remains outside the parser process and communicates only through bounded files and exit status. If the selected isolation adapter is unavailable or fails its self-check, the attempt fails closed to `quarantined`; the worker never falls back to in-process parsing or an unguarded subprocess.

## 0. Blocking reconciliation

The previous failure log was reconciled before any 1B-B implementation work.

Fresh reset command: `backend/tests/prepare_test_environment.py` with the explicit test-only reset gate. The reset recreated `difaryx_phase0_test`, applied migrations `0001` through `0014`, and applied the least-privilege grants successfully.

Real result lines from the fresh run on 2026-07-16:

```text
test_validation_worker_integration_multi_org:
Ran 7 tests in 4.061s
OK

test_validation_worker_multi_org:
Ran 6 tests in 2.203s
OK

tenant_isolation_tests:
ALL TENANT ISOLATION TESTS PASSED.
```

The old `test_output_multiorg_integration.txt` was last written on 2026-07-14 22:44, while the integration/unit test files were last modified on 2026-07-15 and the fresh reset/run occurred on 2026-07-16. It still contains the earlier `Ran 7 tests ... FAILED (failures=1, errors=4)` result, so it is a stale pre-fix log. The current suites are green after a fresh database reset.

### 0.1 Gate A provisioning spike: stopped fail-closed

The native-Windows provisioning spike was run before any parser, migration `0015`, or validation-runtime implementation. The current shell is `thenwrps\\codexsandboxoffline`, a standard non-administrative account. A pre-existing `CodexSandboxOffline` account is low privilege (`Users` and `CodexSandboxUsers`, not `Administrators`), but no parser launch username, password, or token is configured for this worker process.

| Control | Probe result | Handling |
|---|---|---|
| Dedicated low-priv parser identity | Not launchable by the current worker: `DIFARYX_PARSER_USERNAME`, `DIFARYX_PARSER_PASSWORD`, and `DIFARYX_PARSER_TOKEN` are unset. Provisioning a new identity or obtaining a launch token requires an administrator-managed setup. | Runner self-check must fail closed as unavailable; no in-process or same-user fallback. |
| OS outbound deny | **FAIL / blocking.** All Domain, Private, and Public profiles report `BlockInbound,AllowOutbound`; local firewall rules report `N/A (GPO-store only)`. Adding a scoped outbound block rule returned `The requested operation requires elevation (Run as administrator).` | Do not claim network isolation. Stop until an administrator provisions a per-parser outbound-deny policy or the environment supplies an equivalent enforced control. |
| Job Object memory cap | **PASS.** A child accepted a 256 MiB process-memory limit. | Retain as a required startup self-check. |
| Job Object CPU cap | **PASS.** A child accepted a 5% hard CPU cap. | Retain as a required startup self-check. |
| Wall-clock deadline | **PASS.** A sleeping child was terminated through its Job Object after 0.503 seconds and returned code 124. | Retain parent watchdog plus job termination. |

Gate A therefore cannot demonstrate a valid end-to-end parser run on this box. The required contract is unprovisionable locally at the identity/network boundary, so the runner must quarantine on unavailable controls and this work stops here pending the environment fix. No parser code, `0015` migration, or status-lock implementation was started.

## 1. Validation worker today

### 1.1 Exact claim-to-settle path

The durable worker loop calls `process_one` from `ValidationWorker.start`:

Source: `server/python/api/workers/validation_worker.py:942-955`.

```python
                # Try to claim and process work (drain while available)
                drained_any = False
                for _ in range(CONCURRENCY):
                    if self._shutdown.is_set():
                        break
                    outcome = await process_one(
                        self.engine,
                        self.org_id,
                        self.user_id,
                        self.worker_id,
                        self.lease,
                        self.heartbeat_interval,
                        self.mode,
                    )
                    if outcome is None:
                        break
                    drained_any = True
```

In single-organization mode, `process_one` claims through `claim_next`; in multi-organization mode it calls the dedicated cross-organization function:

Source: `server/python/api/workers/validation_worker.py:678-687`.

```python
    async with engine.begin() as conn:
        session = AsyncSession(bind=conn)
        try:
            if mode == "multi_org":
                claimed = await claim_next_across_orgs(session, worker_id, lease)
            else:
                if not org_id:
                    raise RuntimeError("org_id is required in single_org mode")
                claimed = await claim_next(session, org_id, user_id, worker_id, lease)
            await session.commit()
        finally:
            await session.close()
```

Single-organization claim and dataset transition are implemented as follows:

Source: `server/python/api/workers/validation_worker.py:136-207`.

```python
async def claim_next(
    session: AsyncSession,
    org_id: str,
    user_id: str,
    worker_id: str,
    lease: int,
) -> Optional[dict]:
    """Claim one workable attempt. Enforces next_retry_at semantics."""
    await _set_rls_context(session, org_id, user_id)

    # Step 1: SELECT ... FOR UPDATE SKIP LOCKED to pick the row
    pick_result = await session.execute(
        sa.text("""
            SELECT id, dataset_id
            FROM science.validation_attempts
            WHERE organization_id = CAST(:org_id AS uuid)
              AND (
                  (status = CAST('queued' AS science.validation_attempt_status)
                   AND (next_retry_at IS NULL OR next_retry_at <= NOW()))
                  OR
                  (status = CAST('failed' AS science.validation_attempt_status)
                   AND next_retry_at IS NOT NULL AND next_retry_at <= NOW())
              )
            ORDER BY next_retry_at NULLS FIRST, created_at
            LIMIT 1
            FOR UPDATE SKIP LOCKED
        """),
        {"org_id": org_id},
    )
    pick_row = pick_result.first()
    if pick_row is None:
        return None

    picked_id = pick_row[0]

    # Step 2: UPDATE the picked row to claimed
    update_result = await session.execute(
        sa.text("""
            UPDATE science.validation_attempts
            SET status = CAST('claimed' AS science.validation_attempt_status),
                claimed_at = NOW(),
                claimed_by = :worker_id,
                lock_expires_at = NOW() + make_interval(secs => :lease),
                started_at = NOW(),
                updated_at = NOW()
            WHERE id = CAST(:id AS uuid)
              AND organization_id = CAST(:org_id AS uuid)
            RETURNING *
        """),
        {"worker_id": worker_id, "lease": float(lease), "org_id": org_id, "id": str(picked_id)},
    )
    row = update_result.mappings().first()
    if not row:
        return None

    attempt = dict(row)

    # Step 3: Update dataset status to validating
    await session.execute(
        sa.text("""
            UPDATE science.datasets
            SET dataset_status = CAST('validating' AS science.dataset_status),
                status_changed_at = NOW(),
                updated_at = NOW()
            WHERE organization_id = CAST(:org_id AS uuid)
              AND id = CAST(:dataset_id AS uuid)
              AND dataset_status = CAST('pending_validation' AS science.dataset_status)
        """),
        {"org_id": org_id, "dataset_id": str(attempt["dataset_id"])},
    )

    return attempt
```

For multi-organization mode, the cross-organization claim is a `SECURITY DEFINER` function owned by the dedicated `difaryx_validation_worker_bypass` role. The tenant worker role itself is not granted `BYPASSRLS`:

Source: `backend/migrations/versions/0012_validation_worker_multi_org.py:17-37,48-76,139-151`.

The function claims `queued` or retryable `failed` attempts, sets the attempt to `claimed`, and moves the dataset from `pending_validation` to `validating`. It is executable by `difaryx_validation_worker`, while execution is revoked from `PUBLIC`. This preserves the 1B-A rule that cross-org access uses only the dedicated bypass path.

After claim, the worker marks the attempt `running`, loads only the tenant-scoped dataset and object metadata, and calls the current validation checks:

Source: `server/python/api/workers/validation_worker.py:710-791`.

```python
    # Transition to running
    async with engine.begin() as conn:
        session = AsyncSession(bind=conn)
        try:
            await mark_running(session, org_id, user_id, worker_id, attempt_id)
            await append_audit_event(
                session, org_id, user_id,
                "validation.claimed", "validation_attempt", attempt_id,
            )
            await session.commit()
        finally:
            await session.close()

    # Start heartbeat for lease renewal
    heartbeat_stop = asyncio.Event()
    heartbeat_task = asyncio.create_task(
        _heartbeat(engine, org_id, user_id, worker_id, attempt_id, lease, heartbeat_interval, heartbeat_stop)
    )

    outcome_status = "failed"
    try:
        # Load dataset and object info
        async with engine.begin() as conn:
            session = AsyncSession(bind=conn)
            try:
                await _set_rls_context(session, org_id, user_id)
                ds_result = await session.execute(
                    sa.text("SELECT * FROM science.datasets WHERE organization_id = CAST(:org_id AS uuid) AND id = CAST(:id AS uuid)"),
                    {"org_id": org_id, "id": dataset_id},
                )
                ds_row = ds_result.mappings().first()
                dataset = dict(ds_row) if ds_row else None

                obj_result = await session.execute(
                    sa.text("SELECT * FROM science.dataset_objects WHERE organization_id = CAST(:org_id AS uuid) AND id = CAST(:id AS uuid)"),
                    {"org_id": org_id, "id": original_object_id},
                )
                obj_row = obj_result.mappings().first()
                obj = dict(obj_row) if obj_row else None
                await session.commit()
            finally:
                await session.close()

        object_key = obj["object_key"]
        expected_byte_size = dataset["byte_size"]
        display_filename = dataset["display_filename"]
        declared_content_type = dataset["declared_content_type"]
        client_checksum_sha256 = dataset.get("client_checksum_sha256")

        # Run validation checks
        from api.storage.factory import get_object_store
        from api.validation.checks import run_all_checks

        store = get_object_store()
        validation_result = await run_all_checks(
            store=store,
            object_key=object_key,
            expected_byte_size=expected_byte_size,
            display_filename=display_filename,
            declared_content_type=declared_content_type,
            client_checksum_sha256=client_checksum_sha256,
        )
```

Settlement then branches on the result:

Source: `server/python/api/workers/validation_worker.py:793-854`.

```python
        async with engine.begin() as conn:
            session = AsyncSession(bind=conn)
            try:
                if validation_result.passed:
                    await mark_passed(
                        session, org_id, user_id, worker_id, attempt_id,
                        validation_result.server_checksum_sha256 or "",
                        validation_result.byte_size_verified or 0,
                    )
                    await append_audit_event(
                        session, org_id, user_id,
                        "validation.passed", "dataset", dataset_id,
                    )
                    counters.passed += 1
                    outcome_status = "passed"

                elif validation_result.transient:
                    if attempt_number >= max_attempts:
                        await mark_quarantined(
                            session, org_id, user_id, worker_id, attempt_id,
                            validation_result.failure_code or "UNKNOWN",
                            validation_result.failure_details or {},
                            f"Max retries ({max_attempts}) exhausted for transient failure",
                        )
                        await append_audit_event(
                            session, org_id, user_id,
                            "validation.quarantined", "dataset", dataset_id,
                        )
                        counters.quarantined += 1
                        outcome_status = "quarantined"
                    else:
                        await mark_failed_with_retry(
                            session, org_id, user_id, worker_id, attempt_id,
                            validation_result.failure_code or "UNKNOWN",
                            validation_result.failure_details or {},
                        )
                        await append_audit_event(
                            session, org_id, user_id,
                            "validation.failed", "validation_attempt", attempt_id,
                        )
                        counters.retried += 1
                        outcome_status = "retry"

                else:
                    await mark_invalid(
                        session, org_id, user_id, worker_id, attempt_id,
                        validation_result.failure_code or "UNKNOWN",
                        validation_result.failure_details or {},
                    )
                    await append_audit_event(
                        session, org_id, user_id,
                        "validation.invalid", "dataset", dataset_id,
                    )
                    counters.failed += 1
                    outcome_status = "failed"

                await session.commit()
```

### 1.2 Current checks: real work, but not technique parsing

`server/python/api/validation/checks.py:207-322` executes these checks in order:

1. filename extension allowlist;
2. declared content-type allowlist;
3. non-empty declaration based on the declared dataset byte size;
4. final object existence;
5. final object `stat().st_size` equals the declared dataset byte size;
6. a streamed SHA-256 over the final object, compared only to the optional client checksum;
7. at most the first 8,192 bytes are collected for null-byte, BOM, strict UTF-8, and first-line checks.

The checksum implementation is real and server-side:

Source: `server/python/api/validation/checks.py:113-135`.

```python
async def check_checksum(
    store: ObjectStore,
    object_key: str,
    client_checksum_sha256: Optional[str],
) -> CheckResult:
    hasher = hashlib.sha256()
    async for chunk in store.get_object(object_key):
        hasher.update(chunk)
    server_digest = hasher.hexdigest()

    if client_checksum_sha256 and server_digest != client_checksum_sha256:
        return CheckResult(
            name="checksum",
            passed=False,
            detail=f"Checksum mismatch: expected {client_checksum_sha256}, got {server_digest}",
            failure_code="CHECKSUM_MISMATCH",
            transient=False,
        )
    return CheckResult(
        name="checksum",
        passed=True,
        detail=f"Server checksum: {server_digest}",
    )
```

There is no call to a technique parser, no parser registry lookup, no row/point validation, no XRD/XPS/FTIR/Raman rule evaluation, and no sandbox boundary. A syntactically valid arbitrary UTF-8 file with an allowed extension, matching declared size, and optional client checksum can reach `validation_result.passed`.

### 1.3 Stub versus real behavior

| Behavior | Current state |
|---|---|
| Queue claim, lease, heartbeat, retry, stale reclaim | Real and exercised by the existing worker lifecycle tests. |
| Tenant-scoped metadata lookup | Real; worker sets transaction-local RLS context. |
| Final object existence and byte-size check | Real, but size is read from `head_object` and compared to the declared dataset size; it is not yet an independent finalization gate. |
| Server SHA-256 recomputation | Real; current worker computes it over the final object. |
| Client checksum handling | Client value is treated as an optional expected value by the current check. The proposed authoritative model must keep it as an unverified hint and never use it as the source of truth. |
| Full-content parsing | Absent. The current bounded-content check reads only up to 8 KiB. |
| Technique compatibility and scientific validation | Absent from this worker path. |
| Failure isolation | Absent for parsers because there is no parser child. An unexpected exception in `process_one` releases the claim for retry rather than deterministically quarantining it. |

There are older, separate API parsers. For example, `server/python/api/analysis_router.py:93-138` uses pandas to read two columns, and its upload route reads the entire multipart file in the API process (`:680-705`). That code is not called by `api.workers.validation_worker.process_one`, is not a validation registry, and has no parser sandbox. It must not be reused as evidence that the Phase 1B worker validates a dataset.

## 2. Verification today

### 2.1 What happens before finalize

The streaming upload path uses a server-side hasher and byte counter while writing staging storage:

Source: `server/python/api/services/upload_service.py:422-448` and `server/python/api/storage/local_adapter.py:30-71`.

- `stream_write` limits cumulative bytes to `expected_byte_size`.
- It computes a SHA-256 over the received chunks.
- It rejects a final staging byte count different from `expected_byte_size`.
- If the client supplied a checksum, it currently rejects a mismatch at upload time.

This is useful early rejection, but it does not replace an independent final-object verification gate.

### 2.2 What finalize actually verifies

`UploadService.finalize_upload` calls `promote_staging`:

Source: `server/python/api/services/upload_service.py:510-625`.

`LocalObjectStore.promote_staging` reads the staging file again, computes a SHA-256 and `staging_path.stat().st_size`, atomically renames the staging file to the final key on Windows, writes a `<object>.sha256` sidecar, and returns the recomputed digest and size:

Source: `server/python/api/storage/local_adapter.py:162-210`.

The result is then used to create the `dataset_objects` row, settle quota, link `datasets.original_object_id`, move the dataset from `uploaded` to `pending_validation`, finalize the upload session, and enqueue a validation attempt. The finalize code does not contain an explicit assertion equivalent to `promote_result.byte_size == row["expected_byte_size"]`; it relies on the earlier streaming check and stores the returned size in `dataset_objects.byte_size`.

Therefore the precise answer is:

- Yes, a server-side SHA-256 is computed during streaming and recomputed over the staging file during promotion.
- Yes, the current validation check later compares final-object byte size to `datasets.byte_size`.
- No, finalize does not independently rehash the already-promoted final object.
- No, finalize does not itself compare the promotion result to `upload_sessions.expected_byte_size` or `datasets.byte_size` before recording the object.
- The `.sha256` sidecar is written, but `head_object` trusts the sidecar when present; it only recomputes the file if the sidecar is missing or empty (`local_adapter.py:221-254`). The current validation checksum check independently streams and hashes the object, so it does not rely on the sidecar, but it compares to the client hint rather than to a stored server-authoritative finalize digest.

### 2.3 Verification runtime still needed

The dedicated verification runtime should be an independent gate at validation time, before parser execution:

1. Open the final object through the object-store abstraction.
2. Stream it once with bounded chunks, computing the authoritative SHA-256 and exact byte count.
3. Compare the count to the declared expected size and the object metadata size.
4. Compare the digest to a server digest captured at finalize and persisted as metadata, not merely to the client hint or mutable sidecar.
5. Snapshot the verified bytes into the per-attempt parser input scratch file, read-only to the parser.
6. Only then invoke the technique parser.

Any size or digest mismatch is a data-integrity failure and must settle the attempt and dataset as `quarantined`, not `invalid`, not retryable, and never `valid`.

The existing `validation_attempts.server_checksum_sha256` column is populated only at a pass settlement. It is not a pre-parser reference digest. The design therefore proposes adding an authoritative object digest field in migration `0015` (or an equivalent append-only object metadata record) while retaining the existing `dataset_objects.byte_size` field. This stores metadata only; raw bytes remain in object storage.

## 3. Raw persistence today

### 3.1 Confirmation

The original upload bytes are already persisted at full resolution:

1. The request stream is written chunk-by-chunk to the local object store staging file.
2. No resampling, normalization, pandas conversion, or scientific processing occurs in the Phase 1B upload service.
3. Finalization promotes the staging file to the final object key.
4. `dataset_objects` records the original object role, object key, storage provider, lineage upload session, and byte size.
5. The database stores metadata and lineage only; file bytes are not inserted into PostgreSQL.

Relevant sources: `server/python/api/services/upload_service.py:422-461,571-638`, `server/python/api/storage/local_adapter.py:150-210`, and `backend/migrations/versions/0010_datasets_and_uploads.py:243-304`.

The local adapter also rejects a storage base inside the repository (`local_adapter.py:88-108`) and validates object-key traversal (`:117-148`). The final object is not sent back through the browser as part of validation.

### 3.2 What “full-resolution immutable raw persistence” still needs

Full-resolution persistence itself does not need to be rebuilt. Strict immutability is only partially guaranteed today:

- Database lineage is append-only for the application role: `dataset_objects` has no application update/delete grant, a one-original-per-dataset unique index, and restrictive foreign keys.
- The local filesystem object is not WORM. `LocalObjectStore` exposes `delete_object`, and the test suite explicitly proves deletion of a final object (`backend/tests/test_local_object_store.py:214-238`). There is no retention lock, immutable ACL, or lifecycle policy in this repository.
- The final object and database transaction are not one atomic system transaction. A successful file promotion followed by a database failure can leave an orphan final object; a database lineage row does not itself prove future retention.
- The `.sha256` sidecar is a convenience artifact, not an immutable authoritative record. A durable server digest should be persisted alongside object metadata and rechecked independently.

The remaining design work is therefore retention and integrity governance, not another raw-data pipeline:

- define the retention period and legal/operational deletion authority for `object_role = original`;
- prevent ordinary application deletion or overwrite of original final objects;
- make any deletion an explicit, audited retention operation after the hold expires;
- add orphan reconciliation for file/object-store state versus database lineage;
- persist and independently recheck the server-authoritative digest.

## 4. Existing parser and sandbox scaffolding

### 4.1 What exists

There is no Phase 1B technique parser registry, worker parser interface, per-technique validation adapter, scratch-runner, sandbox launcher, or crash-isolated parser process.

Existing parsing or scientific-processing code is separate:

| Location | What it does | Part of validation worker? |
|---|---|---|
| `server/python/api/analysis_router.py:93-138` | pandas CSV/TXT two-column parsing with a minimum of 10 points | No |
| `server/python/api/analysis_router.py:643-713` | Reads the entire upload in the API process and routes to older analysis handlers; XPS/FTIR/Raman are documented as stubs there | No |
| `server/python/api/gateway.py:1031-1049` | pandas-based XRD CSV parsing for a processing endpoint | No |
| `server/python/api/database_indexer.py:316` | `pymatgen` CIF parsing for bundled reference data | No; package is not in `venv_clean` |
| `server/python/api/validation/checks.py` | Metadata, object, size, checksum, and 8 KiB content checks | Yes, but not a parser |

The current accepted upload extensions are `.csv`, `.txt`, `.raw`, `.xy`, and `.dat`; the current policy does not accept `.zip` or XML as a format. That is a useful initial security boundary: the first production parser need not decompress archives or parse XML at all.

### 4.2 `venv_clean` inventory

Relevant installed packages observed in `venv_clean` include:

- `aiofiles 25.1.0`
- `alembic 1.18.5`
- `fastapi 0.139.0`
- `numpy 2.5.1`
- `pandas 3.0.3`
- `psycopg 3.3.4` and `psycopg2-binary 2.9.12`
- `python-multipart 0.0.32`
- `scipy 1.18.0`
- `SQLAlchemy 2.0.51`
- existing signal packages `pybaselines 1.2.1` and `lmfit 1.3.4`

Not installed in `venv_clean` at audit time:

- `defusedxml`
- `lxml`
- `pymatgen`
- `psutil`

No new dependency is required for the proposed generic two-column ASCII parser. Python standard-library modules (`csv`, `io`, `hashlib`, `pathlib`, and bounded iteration) are sufficient. `pandas` is already installed but should not be used for the first sandbox parser because it encourages whole-file allocation and is not needed for two-column ASCII validation.

If XML support is later approved, `defusedxml` is the preferred new dependency and must be explicitly approved before it is added. `lxml`, `pymatgen`, and `psutil` are not proposed for the first close.

## 5. Status invariants: current path and gaps

### 5.1 Current state machine

The database enum includes `validating` for datasets and `queued`, `claimed`, `running`, `passed`, `failed`, `quarantined`, and `cancelled` for attempts.

Current normal path:

```text
upload stream
  -> dataset allocated/uploading/uploaded
  -> finalize promotes object
  -> dataset pending_validation + attempt queued
  -> worker claim: attempt claimed, dataset validating
  -> worker start: attempt running
  -> current checks pass: attempt passed, dataset valid
  -> current non-transient check fails: attempt failed, dataset invalid
  -> transient failure with retries left: attempt failed, dataset pending_validation
  -> transient failure at max attempts: attempt quarantined, dataset quarantined
```

The `valid` update is guarded in the worker helper by `attempt.status = running`, `attempt.claimed_by = worker_id`, and dataset status in `pending_validation` or `validating`:

Source: `server/python/api/workers/validation_worker.py:407-447` and equivalent repository SQL at `server/python/api/repositories/validation_attempt_repository.py:106-148`.

The `invalid` and `quarantined` helpers similarly require a running attempt owned by the supplied worker ID; quarantine additionally requires `attempt_number >= max_attempts` in the current implementation (`validation_worker.py:498-546,549-593`).

### 5.2 What is and is not worker-only today

The claim and settle helpers are worker-shaped, but worker-only ownership is not enforced end-to-end:

1. `server/python/api/routes/validation.py:41-58` exposes `POST /datasets/{dataset_id}/validation/process` to an authenticated API context.
2. That route calls `ValidationService.process_one` (`validation_service.py:102-317`), which claims, runs `run_all_checks`, and calls the repository `mark_passed`, `mark_invalid`, or `mark_quarantined` helpers.
3. The route accepts a caller-controlled `X-Worker-Id` header or generates one, so the API path can satisfy the SQL `claimed_by = worker_id` predicate.
4. Migration `0011` grants `difaryx_app` update access to validation-attempt status columns and grants `difaryx_app` update access to `science.datasets.dataset_status` (`0011:205-215`; `0010:1093-1101`). The dataset RLS policy is membership-based, not a worker-role status gate.
5. There is no database trigger or transition function in the audited baseline that makes `valid` conditional on a worker database role plus independent verification and parser gates.

Conclusion: the current code has a guarded worker implementation, but it cannot be confirmed that only the worker sets terminal dataset status. Nor can it be confirmed that no path can reach `valid` except after technique validation; the current `valid` predicate is only the current metadata/content `run_all_checks` result, and the API process route can invoke it.

### 5.3 Required `0015` invariant design

Before Step 4 is considered complete, the following must be true:

- the public API may enqueue, inspect, and cancel according to an explicitly approved policy, but it may not settle an attempt or write `dataset_status = valid`, `invalid`, or `quarantined`;
- ordinary application roles may not directly update terminal dataset status columns; upload-only transitions should use narrowly scoped transition functions or equivalent database guards;
- the tenant worker role has no `BYPASSRLS` and uses RLS for single-org work;
- cross-org claim/reclaim uses only the existing dedicated `SECURITY DEFINER` bypass functions;
- the only valid transition is an atomic worker-owned transition from `running` after both independent integrity verification and technique parser/rules gates are recorded as passed;
- parser exception, timeout, memory/resource cap, sandbox startup failure, crash, malformed parser result, and integrity mismatch settle to `quarantined` rather than retrying into `valid` or `invalid`;
- cancellation and stale-reclaim behavior must not leave a dataset stuck at `validating` without an explicit terminal or requeue outcome.

## 6. Proposed parser sandbox design

### 6.1 `IsolatedParserRunner` contract and adapters

The worker and PostgreSQL remain native processes. Parser code does not run in the worker process, the FastAPI process, or an ordinary in-process task. The worker depends on one abstraction, `IsolatedParserRunner`, whose contract is independent of the isolation mechanism.

The contract accepts a parser profile, a read-only verified input snapshot, a per-attempt scratch directory, and explicit resource limits. It returns only a bounded structured result plus process diagnostics. It never receives a database session, database credentials, an object-store write capability, or a path to the original final object.

The required adapters are:

| Adapter | Target | Boundary |
|---|---|---|
| `HardenedSubprocessParserRunner` | Native Windows development baseline | Dedicated child process in a Windows Job Object, restricted parser identity/token, explicit environment allowlist, network-deny policy, read-only input/code, scratch-only writes, hard memory/CPU/wall-clock limits. |
| `ContainerParserRunner` | Production Phase 4 | Rootless or otherwise least-privilege container with read-only root/code/input, scratch-only writable mount, no network namespace, cgroup memory/CPU/PID limits, and hard deadline. |
| `MicroVMParserRunner` | Production option where container isolation is insufficient | Disposable microVM with no network, bounded vCPU/memory, read-only input, scratch-only output, and host-supervised deadline. |
| `WindowsSandboxParserRunner` | Optional local-dev adapter | Convenience adapter for machines where Windows Sandbox is enabled; not the production baseline and not required for correctness. |

The baseline native-Windows subprocess is acceptable only when all OS controls are provisioned and a startup self-check passes. The child is launched as a separate process, assigned immediately to a Windows Job Object, and terminated as a job on timeout or worker shutdown. The Job Object enforces process/job memory limits and CPU limits; the host supervisor enforces the wall-clock deadline. A dedicated low-privilege parser identity has read access only to the parser runtime, reference data, and the verified input snapshot, and modify access only to the per-attempt scratch directory. It has no access to PostgreSQL data, object-store roots, repository secrets, `.env` files, or user profile data.

No-network is an OS policy, not a Python convention. The baseline adapter requires an outbound-deny rule scoped to the parser executable/identity and verifies the policy during startup. If that policy cannot be installed or verified, the adapter is unavailable and the attempt is quarantined. The child receives a minimal environment constructed by the worker; `DATABASE_URL`, cloud credentials, service tokens, and inherited secrets are absent.

The host copies the independently verified final object to a per-attempt input snapshot using a streaming read. The parser receives that snapshot read-only. `TEMP`, `TMP`, current working directory, and output paths resolve inside the per-attempt scratch directory. The result file is bounded and schema-validated by the host. Raw bytes remain in the final object store and are never returned through the result channel.

The adapter is fail-closed. If the subprocess controls are unavailable, the production runtime is not provisioned, the process cannot be assigned to its resource boundary, or the result channel is missing, the worker records a deterministic isolation failure and quarantines. There is no in-process or unrestricted-subprocess fallback. Windows Sandbox may be used locally as a separate adapter, but its absence must not change the baseline contract.

### 6.2 Threat model and controls

The uploaded bytes and all embedded metadata are hostile. The parser must be treated as potentially buggy and the parser input as an attacker-controlled program for resource consumption and parser confusion.

| Threat | Control | Failure result |
|---|---|---|
| Decompression/zip bomb | ZIP and archive formats are not enabled for the first parser. Any future archive adapter must inspect the central directory without extraction, enforce entry count, compressed size, uncompressed size, cumulative expansion, compression-ratio, nesting, and wall-clock budgets, and never call unrestricted `extractall`. | Reject/quarantine. |
| Archive-member path traversal | Normalize member names as POSIX paths; reject absolute paths, drive prefixes, `..`, NULs, symlinks, and any resolved path outside the per-attempt scratch root. | Reject/quarantine. |
| XML billion-laughs/entity expansion/XXE | No XML parser in the first registry. Future XML requires explicit dependency approval for `defusedxml`, DTD/entity/external-resource rejection, input and expansion limits, and sandbox execution. Standard `xml.etree` is not accepted as the hostile-input security control. | Reject/quarantine. |
| Oversized file or allocation | Upload maximum is currently 256 MiB by default (`DIFARYX_MAX_FILE_SIZE_BYTES`); verification and parser reads are streamed; parser budgets bound line length, point count, output size, and scratch size; the subprocess Job Object/container/microVM supplies a hard memory cap. No whole-file pandas read in the validation parser. | Reject/quarantine. |
| Parser infinite loop | Host wall-clock deadline is independent of parser cooperation. | Terminate sandbox; quarantine. |
| Parser crash, segfault, or OOM | Parser runs in a separate child process assigned to a Job Object/container/microVM. Non-zero exit, missing result, termination, or runner loss is observed by the host worker; it cannot take down the worker or PostgreSQL connection. | Quarantine; worker continues. |
| Network egress | Baseline subprocess requires an OS-level outbound-deny policy scoped to the parser identity/executable; production adapters use a network-disabled namespace; the parser has no database credentials. | Any inability to establish or verify the disabled-network policy is a runner failure. |
| Filesystem writes | Parser identity/token has read-only access to code/reference/input and modify access only to per-attempt scratch. No repository, object-store root, PostgreSQL data, credentials, or user profile is exposed. | Any malformed/out-of-scope result or write attempt is failure/quarantine. |
| Result forgery or oversized output | Host validates the result schema, status vocabulary, digest/size references, point-count limits, and result file byte cap before accepting it. | Quarantine. |
| TOCTOU between verification and parsing | Parser consumes the exact read-only snapshot produced by the verification stream, not a second direct read of the mutable final path. | Quarantine on snapshot/hash mismatch. |

### 6.3 Deterministic sandbox outcome contract

The host recognizes only a small set of outcomes: `valid`, `invalid`, and `quarantined`, plus an internal operational/no-work result. A parser cannot return an arbitrary status.

- `valid` requires successful independent integrity verification, successful parser execution, successful technique rules, a bounded structured result, and a worker-owned atomic database settlement.
- `invalid` is reserved for a successfully executed parser that deterministically proves the file is structurally incompatible with the selected technique or violates the technique's declared data rules.
- `quarantined` covers integrity mismatch, sandbox unavailable, timeout, memory/resource limit, archive/XML security violation, parser exception, crash/OOM, malformed result, or any uncertainty about what the parser did.
- A host/database exception during settlement must never be converted into success. If the worker cannot record the quarantine because PostgreSQL is unavailable, it leaves a durable non-terminal attempt for operational recovery and emits an alert; it does not mark valid or invalid.

The parser process receives no PostgreSQL connection and cannot update status. Only the worker performs the final database transition after validating the result envelope.

### 6.4 First parser scope

The first reference parser is intentionally narrow:

- generic two-column ASCII text;
- standard-library implementation only;
- bounded line length, row count, and numeric point count;
- strict finite numeric values for both columns;
- no archive, XML, embedded scripting, metadata execution, or external references;
- explicit technique adapter rules are applied after the generic parse, preserving the selected technique and source provenance.

The parser returns observations and parse diagnostics, not material identity or scientific conclusions. Technique rules decide only whether the signal is structurally usable for that technique. Scientific interpretation remains downstream and evidence-first.

## 7. Steps 3-5 design proposal after approval

### Step 3: independent checksum/size verification runtime

Use a dedicated verification stage before parser launch. It must:

- recompute SHA-256 from the final object bytes on the server;
- count every byte independently of declared metadata;
- compare actual size to both declared expected size and recorded object size;
- compare actual digest to the server digest recorded at finalize;
- treat the client checksum as an unverified hint only;
- snapshot the verified stream for the sandbox;
- quarantine on mismatch, missing sidecar, sidecar mismatch, or missing authoritative metadata rather than treating the sidecar as proof.

The sidecar can remain as a local-store convenience, but it is not the integrity authority.

### Step 4: registry plus one reference parser

Introduce a pluggable registry with a per-technique contract containing:

- accepted extensions and declared content types;
- parser profile/version;
- bounded resource budget;
- parser execution entrypoint;
- structured parse result schema;
- technique-specific structural rules;
- failure classification and validation evidence fields.

Wire one technique end-to-end using the generic two-column parser: upload -> server finalize -> queued attempt -> worker claim -> independent final-object verification -> sandbox parse -> technique rules -> atomic worker settlement. The close must demonstrate both a real valid file and a real bad file quarantined or invalid according to the exact failure class; a metadata-only pass is insufficient.

### Step 5: remaining techniques

Add XRD, XPS, FTIR, Raman, and Unknown Signal as separate registry closes. Unknown Signal may inspect signals and discuss anomalies only; it must not produce material-specific conclusions. Each technique remains separately attributable in multi-technique fusion.

## 8. Acceptance evidence required for the later closes

The blocking reconciliation is complete. The fresh reset and real per-suite results are recorded in Section 0. Existing workspace evidence is now understood as follows:

| Existing artifact | Observed evidence | Interpretation |
|---|---|---|
| `test_output_phase1b.txt` | `Ran 61 tests ... OK` | Ingestion and current validation-check unit coverage; not technique parser coverage. |
| `test_output_worker.txt` | `6/6 passed, 0 failed` | Worker lifecycle evidence; its summary reports `counters_passed=0`, so it does not prove a real valid parser result. |
| `test_output_multiorg_unit.txt` | `Ran 6 tests ... OK` | Multi-org claim/reclaim unit coverage. |
| `test_output_multiorg_integration.txt` | Stale file: `Ran 7 tests ... FAILED (failures=1, errors=4)` on 2026-07-14; fresh run: `Ran 7 tests ... OK` on 2026-07-16 | The `.txt` is a stale pre-fix log. The fresh-reset integration close is green. |
| `test_output_tenant.txt` | All listed tenant isolation tests passed | Supports RLS isolation evidence, but does not prove worker-only terminal status ownership. |

For the sandbox close, the evidence matrix must include real per-suite output in the form `Ran N tests ... OK` and must include at least:

- a real valid two-column file that reaches `valid`;
- a structurally bad file that reaches `invalid` only when the parser completed deterministically and the rules rejected it;
- a decompression bomb fixture that quarantines;
- an XXE/billion-laughs fixture that quarantines;
- an oversized input/allocation fixture that quarantines;
- a deliberately crashing/segfaulting or OOM parser fixture that quarantines;
- proof the worker process remains alive and can process a subsequent clean attempt;
- proof quota reservations, dataset/object lineage, and validation attempt lineage remain consistent for every quarantine;
- proof that no browser or PostgreSQL row contains raw file bytes;
- proof that tenant RLS and the dedicated cross-org bypass path remain unchanged.

No sandbox test is complete if it only asserts an exception in a parser unit test. It must exercise the worker boundary, terminal status, worker survival, and lineage/quota invariants.

## 9. Approval gates before implementation

The implementation can begin after approval of these design decisions:

1. `IsolatedParserRunner` is the required contract. The baseline is a hardened crash-isolated subprocess with OS-enforced memory/CPU/wall-clock/no-network/filesystem controls; if unavailable, fail closed to quarantine. Containers/microVMs are the Phase 4 production adapters. Windows Sandbox is optional local development only.
2. Migration `0015` may add authoritative object digest metadata and worker-only terminal transition guards; `0001-0014` remain untouched.
3. The API `/validation/process` path is not an allowed terminal-status writer; worker ownership is enforced by database privileges and/or guarded transition functions, not just by a caller-supplied `worker_id` string.
4. Original final objects receive an explicit retention/deletion policy, with ordinary application deletion and overwrite prohibited.
5. The generic ASCII parser uses zero new dependencies. Any XML/advanced archive parser requires a separate dependency approval, with `defusedxml` flagged as the first candidate and `lxml`, `pymatgen`, and `psutil` excluded from this close.
6. Reconciliation is now green after a fresh reset: multi-org integration `Ran 7 tests ... OK`, multi-org unit `Ran 6 tests ... OK`, and tenant isolation `ALL TENANT ISOLATION TESTS PASSED`. The old failure `.txt` is stale. The stale API readiness expectation (`server/python/api/db/engine.py:48-63` still checks exact revision `0011`) remains an implementation item for the approved `0015` work.
