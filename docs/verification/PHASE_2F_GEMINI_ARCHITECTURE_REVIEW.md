# Phase 2F: Persistent XRD Architecture Review

## Scope
- Verification of commit `6234896` in branch `agent/phase-2f-xrd-verification`.
- Focus on the implementation of a coherent, secure, persistent XRD vertical slice, assessing tenant isolation, evidence persistence, internal authentication, and immutability controls.

## 1. Tenant Isolation (Row-Level Security)
PostgreSQL Row-Level Security (RLS) was explicitly introduced for persistence tables in migration `0017`.
- RLS policies restrict `difaryx_app` to records where `organization_id = identity.current_organization_id()`.
- Project membership verification ensures dataset and reasoning visibility remains confined to the project's authorized users.
- The FastAPI application (in `api.phase2f.service.py`) relies on a transaction-scoped `UnitOfWork` to inject the active tenant context safely before execution.

## 2. Internal Authentication Boundary
The split architecture requires the TypeScript frontend gateway to securely interact with the FastAPI backend.
- **HMAC Signatures**: Internal requests are authenticated using `DIFARYX_INTERNAL_SERVICE_SECRET`.
- The gateway signs a canonical payload that includes the timestamp, HTTP method, target path, active user subject, and a SHA-256 body digest.
- `require_internal_identity` correctly rejects invalid signatures, expired requests, and attempts to forge active organization memberships outside the verified `UserMapping` scope.

## 3. Worker Fencing and Immutability
Evidence must act as an immutable record to prevent subsequent modifications from corrupting scientific provenance.
- The `guard_xrd_evidence_immutability` trigger explicitly guards the `xrd_evidence_snapshots` table, blocking `UPDATE` and `DELETE` operations on `ready` records.
- Status mutations (e.g., from `ready` to `superseded`) are permitted exclusively under strict schema constraints, ensuring traceability.
- Validation workers acquire lock records utilizing optimistic concurrency controls (`FOR UPDATE` statements in `publish_xrd_evidence_and_mark_passed`) preventing duplicate evidence generation or race conditions across distributed processing.

## 4. Evidence Traceability
- Finalized signal arrays, matched candidates, and limitations (e.g., "Phase purity requires additional validation.") are securely committed into `xrd_evidence_snapshots.content`.
- Reasoning runs securely associate `evidence_content_sha256` and the snapshot ID to the execution outcome, maintaining a direct, traceable line back to the raw source object.

## Conclusion
The implementation of the persistent XRD vertical slice at commit `6234896` effectively realizes a structurally robust architecture with reliable internal access boundaries, explicitly enforced RLS policies, and immutable scientific persistence capabilities.
