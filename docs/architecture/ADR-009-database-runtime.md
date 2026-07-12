# ADR-009: Database Runtime & Authentication Foundation

## Status
Approved

## Context
DIFARYX requires a secure, tenant-isolated runtime environment.
* PostgreSQL Row Level Security (RLS) is applied to all tenant tables.
* Database connections are pooled, necessitating strict tenant context sanitization upon connection checkout and release to prevent cross-tenant data leakage.
* The API must authenticate users using an external identity provider (Firebase Auth), requiring mapping external identities to internal organizations/users before the tenant RLS context (`app.organization_id` and `app.user_id`) can be set.

## Decisions
1. **Database Library Stack:** Use SQLAlchemy 2.x with the `psycopg` (v3) async driver (`postgresql+psycopg`).
2. **Dedicated Resolver Role:** Create a dedicated `NOLOGIN`, `BYPASSRLS` role `difaryx_identity_resolver` that owns and executes the bootstrap identity mapping function. The API role `difaryx_app` has no direct access to mapping tables.
3. **Dedicated Audit Writer Role:** Create a dedicated `NOLOGIN` role `difaryx_audit_writer` with `INSERT` and `SELECT (id)` privileges only on `governance.audit_log` to record audit trails safely.
4. **Request-Scoped Transactional Context:** Implement a request-scoped `UnitOfWork` (UoW) that automatically executes `SELECT set_config('app.organization_id', :org_id, true)` and `SELECT set_config('app.user_id', :user_id, true)` inside transactional scopes.
5. **Windows Event Loop Policy:** On Windows, register `WindowsSelectorEventLoopPolicy` inside the server entry point `run_server.py` before launching the event loop.

## Consequences
* High performance async DB interactions.
* Bulletproof RLS isolation that automatically rolls back and clears context on connection checkout, commit, rollback, or exception.
* Minimal blast radius: standard application role cannot access identity mapping tables or read logs directly.
