"""Fail-closed Phase 2F live-staging validation harness.

The harness has two deliberately separate modes:

* ``preflight`` performs only repository, tool, and secret-presence checks.
  It never prints secret values or makes network requests.
* ``postgres`` performs read-only PostgreSQL metadata and isolation checks.
  It requires explicit operator opt-in and refuses database names that do not
  look like staging or test databases.

Browser, OAuth, Redis, Gemini, object-storage fault injection, and worker race
checks remain operator-driven because they require real external resources and
controlled synthetic accounts. Their exact workflow is recorded in
``docs/verification/PHASE_2F_LIVE_STAGING_VALIDATION.md``.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from typing import Any
from urllib.parse import urlparse


EXPECTED_BRANCH = "feat/vercel-gemini-backend"
EXPECTED_COMMIT = "470fca8669ddd7f912ae0e2c2f4ea003e482287e"
PROTECTED_FILE = "phase1-failed-recovery.patch"
PROTECTED_SHA256 = (
    "1F4F44C405F5AFE8E75A0048FEF2BF028EE18F5F4A0E89517629D03D449F204A"
)
REPO_ROOT = Path(__file__).resolve().parents[1]

ENVIRONMENT_GROUPS = {
    "postgres": (
        "DATABASE_URL",
        "DIFARYX_API_TEST_DATABASE_URL",
        "DIFARYX_WORKER_TEST_DATABASE_URL",
        "DIFARYX_ADMIN_TEST_DATABASE_URL",
    ),
    "object_storage": ("DIFARYX_LOCAL_STORAGE_PATH",),
    "persistence_boundary": (
        "PERSISTENCE_API_BASE_URL",
        "DIFARYX_INTERNAL_SERVICE_SECRET",
    ),
    "oauth_session": (
        "GOOGLE_OAUTH_CLIENT_ID",
        "GOOGLE_OAUTH_CLIENT_SECRET",
        "GOOGLE_OAUTH_REDIRECT_URI",
        "APP_BASE_URL",
        "DIFARYX_SESSION_SECRET",
    ),
    "redis_quota": (
        "UPSTASH_REDIS_REST_URL",
        "UPSTASH_REDIS_REST_TOKEN",
        "QUOTA_ID_HASH_SECRET",
        "GEMINI_GLOBAL_DAILY_LIMIT",
    ),
    "gemini": (
        "GEMINI_PROVIDER_MODE",
        "GEMINI_MODEL",
        "GEMINI_API_KEY",
    ),
    "browser_boundary": (
        "ALLOWED_ORIGINS",
        "VITE_AGENT_API_URL",
    ),
}

PHASE2F_TABLES = (
    "xrd_evidence_snapshots",
    "reasoning_runs",
    "notebook_reasoning_references",
)

SYNTHETIC_FIXTURES = {
    "A": {
        "org": "aaaaaaaa-0000-0000-0000-000000000001",
        "user": "aaaaaaaa-0000-0000-0000-000000000002",
        "project": "aaaaaaaa-0000-0000-0000-000000000003",
        "dataset": "aaaaaaaa-0000-0000-0000-000000000004",
        "ledger": "aaaaaaaa-0000-0000-0000-000000000005",
        "reservation": "aaaaaaaa-0000-0000-0000-000000000006",
        "upload": "aaaaaaaa-0000-0000-0000-000000000007",
        "object": "aaaaaaaa-0000-0000-0000-000000000008",
        "attempt": "aaaaaaaa-0000-0000-0000-000000000009",
        "evidence": "aaaaaaaa-0000-0000-0000-000000000010",
        "reasoning": "aaaaaaaa-0000-0000-0000-000000000011",
        "notebook": "aaaaaaaa-0000-0000-0000-000000000012",
    },
    "B": {
        "org": "bbbbbbbb-0000-0000-0000-000000000001",
        "user": "bbbbbbbb-0000-0000-0000-000000000002",
        "project": "bbbbbbbb-0000-0000-0000-000000000003",
        "dataset": "bbbbbbbb-0000-0000-0000-000000000004",
        "ledger": "bbbbbbbb-0000-0000-0000-000000000005",
        "reservation": "bbbbbbbb-0000-0000-0000-000000000006",
        "upload": "bbbbbbbb-0000-0000-0000-000000000007",
        "object": "bbbbbbbb-0000-0000-0000-000000000008",
        "attempt": "bbbbbbbb-0000-0000-0000-000000000009",
        "evidence": "bbbbbbbb-0000-0000-0000-000000000010",
        "reasoning": "bbbbbbbb-0000-0000-0000-000000000011",
        "notebook": "bbbbbbbb-0000-0000-0000-000000000012",
    },
}


def _run_git(*args: str) -> str:
    completed = subprocess.run(
        ["git", *args],
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    return completed.stdout.rstrip()


def _git_is_ancestor(ancestor: str, descendant: str) -> bool:
    completed = subprocess.run(
        ["git", "merge-base", "--is-ancestor", ancestor, descendant],
        cwd=REPO_ROOT,
        check=False,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    return completed.returncode == 0


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def _result(
    check_id: str,
    status: str,
    detail: str,
    *,
    evidence: Any | None = None,
) -> dict[str, Any]:
    item: dict[str, Any] = {
        "checkId": check_id,
        "status": status,
        "detail": detail,
    }
    if evidence is not None:
        item["evidence"] = evidence
    return item


def run_preflight() -> dict[str, Any]:
    checks: list[dict[str, Any]] = []
    branch = _run_git("branch", "--show-current")
    head = _run_git("rev-parse", "HEAD")
    baseline_present = _git_is_ancestor(EXPECTED_COMMIT, head)
    status_lines = [
        line for line in _run_git("status", "--short").splitlines() if line
    ]

    checks.append(
        _result(
            "PF-REPO-BRANCH",
            "PASS" if branch == EXPECTED_BRANCH else "FAIL",
            f"Expected branch {EXPECTED_BRANCH}; observed {branch or '(detached)'}.",
        )
    )
    checks.append(
        _result(
            "PF-REPO-BASELINE",
            "PASS" if baseline_present else "FAIL",
            f"Required baseline {EXPECTED_COMMIT} is an ancestor of observed HEAD {head}."
            if baseline_present
            else f"Required baseline {EXPECTED_COMMIT} is not an ancestor of observed HEAD {head}.",
        )
    )

    protected_path = REPO_ROOT / PROTECTED_FILE
    protected_hash = _sha256(protected_path) if protected_path.is_file() else None
    checks.append(
        _result(
            "PF-PROTECTED-FILE",
            "PASS" if protected_hash == PROTECTED_SHA256 else "FAIL",
            "Protected file exists and its SHA-256 matches the locked value."
            if protected_hash == PROTECTED_SHA256
            else "Protected file is missing or its SHA-256 changed.",
        )
    )
    checks.append(
        _result(
            "PF-WORKTREE",
            "PASS"
            if status_lines == [f"?? {PROTECTED_FILE}"]
            else "WARN",
            "Only the protected untracked patch is present."
            if status_lines == [f"?? {PROTECTED_FILE}"]
            else "The worktree contains validation changes or unrelated changes; review before staging.",
            evidence={"statusLines": status_lines},
        )
    )

    for executable in ("git", "node", "npm", "py", "docker"):
        checks.append(
            _result(
                f"PF-TOOL-{executable.upper()}",
                "PASS" if shutil.which(executable) else "BLOCKED",
                f"{executable} is available."
                if shutil.which(executable)
                else f"{executable} is not available.",
            )
        )

    for group, names in ENVIRONMENT_GROUPS.items():
        presence = {name: bool(os.environ.get(name, "").strip()) for name in names}
        checks.append(
            _result(
                f"PF-ENV-{group.upper()}",
                "READY" if all(presence.values()) else "BLOCKED",
                "All required names are present."
                if all(presence.values())
                else "One or more required names are absent.",
                evidence={"present": presence},
            )
        )

    blocking = [
        item["checkId"]
        for item in checks
        if item["status"] in {"FAIL", "BLOCKED"}
    ]
    return {
        "schemaVersion": "phase2f-live-staging-v1",
        "mode": "preflight",
        "expectedBranch": EXPECTED_BRANCH,
        "expectedCommit": EXPECTED_COMMIT,
        "checks": checks,
        "blockingChecks": blocking,
        "readyForExternalValidation": not blocking,
    }


def _safe_database_name(dsn: str) -> str:
    parsed = urlparse(dsn)
    name = parsed.path.removeprefix("/").strip()
    if not name:
        raise RuntimeError("Database URL does not contain a database name.")
    lowered = name.lower()
    if "staging" not in lowered and not lowered.endswith("_test"):
        raise RuntimeError(
            "Refusing live checks: database name must contain 'staging' or end in '_test'."
        )
    return name


def _connect(dsn: str):
    try:
        import psycopg2
    except ImportError as exc:  # pragma: no cover - exercised by staging hosts
        raise RuntimeError("psycopg2 is required for PostgreSQL validation.") from exc
    return psycopg2.connect(dsn)


def _query_one(connection, query: str, params: tuple[Any, ...] = ()) -> Any:
    with connection.cursor() as cursor:
        cursor.execute(query, params)
        row = cursor.fetchone()
        return row[0] if row else None


def _postgres_metadata_checks(admin_connection) -> list[dict[str, Any]]:
    checks: list[dict[str, Any]] = []
    revision = _query_one(admin_connection, "SELECT version_num FROM alembic_version")
    checks.append(
        _result(
            "PG-MIGRATION-0017",
            "PASS" if revision == "0017" else "FAIL",
            f"Expected Alembic revision 0017; observed {revision!r}.",
        )
    )

    with admin_connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'science' AND c.relname = ANY(%s)
            ORDER BY c.relname
            """,
            (list(PHASE2F_TABLES),),
        )
        rows = cursor.fetchall()
    observed = {
        name: {"rls": bool(rls), "forceRls": bool(force_rls)}
        for name, rls, force_rls in rows
    }
    rls_ok = all(
        observed.get(table) == {"rls": True, "forceRls": True}
        for table in PHASE2F_TABLES
    )
    checks.append(
        _result(
            "PG-FORCE-RLS",
            "PASS" if rls_ok else "FAIL",
            "All Phase 2F tables have ENABLE and FORCE RLS."
            if rls_ok
            else "One or more Phase 2F tables are missing ENABLE/FORCE RLS.",
            evidence=observed,
        )
    )

    with admin_connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT rolname, rolsuper, rolbypassrls, rolcanlogin
            FROM pg_roles
            WHERE rolname IN (
                'difaryx_app', 'difaryx_validation_worker',
                current_user
            )
            ORDER BY rolname
            """
        )
        role_rows = cursor.fetchall()
    roles = {
        role: {
            "superuser": bool(superuser),
            "bypassRls": bool(bypass),
            "canLogin": bool(can_login),
        }
        for role, superuser, bypass, can_login in role_rows
    }
    least_privilege_ok = all(
        role in roles
        and not roles[role]["superuser"]
        and not roles[role]["bypassRls"]
        for role in ("difaryx_app", "difaryx_validation_worker")
    )
    checks.append(
        _result(
            "PG-ROLE-ATTRIBUTES",
            "PASS" if least_privilege_ok else "FAIL",
            "Application and worker group roles are non-superuser and do not bypass RLS."
            if least_privilege_ok
            else "Application or worker role is missing, superuser, or BYPASSRLS.",
            evidence=roles,
        )
    )

    with admin_connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT tablename, policyname, roles, cmd
            FROM pg_policies
            WHERE schemaname = 'science'
              AND tablename = ANY(%s)
            ORDER BY tablename, policyname
            """,
            (list(PHASE2F_TABLES),),
        )
        policy_rows = cursor.fetchall()
    policies = [
        {
            "table": table,
            "policy": policy,
            "roles": list(roles),
            "command": command,
        }
        for table, policy, roles, command in policy_rows
    ]
    app_policy_tables = {
        row["table"]
        for row in policies
        if "difaryx_app" in row["roles"]
    }
    worker_policy_ok = any(
        row["table"] == "xrd_evidence_snapshots"
        and "difaryx_validation_worker" in row["roles"]
        for row in policies
    )
    policies_ok = app_policy_tables == set(PHASE2F_TABLES) and worker_policy_ok
    checks.append(
        _result(
            "PG-RLS-POLICIES",
            "PASS" if policies_ok else "FAIL",
            "Expected application and worker policies are installed."
            if policies_ok
            else "Expected application or worker policies are missing.",
            evidence=policies,
        )
    )
    return checks


def _connection_identity(connection) -> dict[str, str]:
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT current_database(), current_user, session_user"
        )
        database, current_user, session_user = cursor.fetchone()
    return {
        "database": database,
        "currentUser": current_user,
        "sessionUser": session_user,
    }


def _pool_isolation_check(api_dsn: str) -> dict[str, Any]:
    try:
        from psycopg2.pool import ThreadedConnectionPool
    except ImportError as exc:  # pragma: no cover - exercised by staging hosts
        raise RuntimeError("psycopg2 pool support is required.") from exc

    org_id = os.environ.get("DIFARYX_PHASE2F_ORG_A", "").strip()
    user_id = os.environ.get("DIFARYX_PHASE2F_USER_A", "").strip()
    if not org_id or not user_id:
        return _result(
            "PG-POOL-ISOLATION",
            "BLOCKED",
            "DIFARYX_PHASE2F_ORG_A and DIFARYX_PHASE2F_USER_A are required.",
        )

    connection_pool = ThreadedConnectionPool(1, 1, dsn=api_dsn)
    try:
        first = connection_pool.getconn()
        try:
            first.autocommit = False
            with first.cursor() as cursor:
                cursor.execute(
                    "SELECT set_config('app.organization_id', %s, true)",
                    (org_id,),
                )
                cursor.execute(
                    "SELECT set_config('app.user_id', %s, true)",
                    (user_id,),
                )
                cursor.execute(
                    "SELECT current_setting('app.organization_id', true)"
                )
                during_transaction = cursor.fetchone()[0]
            first.rollback()
        finally:
            connection_pool.putconn(first)

        reused = connection_pool.getconn()
        try:
            reused.autocommit = False
            with reused.cursor() as cursor:
                cursor.execute(
                    "SELECT current_setting('app.organization_id', true)"
                )
                after_reuse = cursor.fetchone()[0]
                cursor.execute("SELECT count(*) FROM science.projects")
                visible_projects_without_context = cursor.fetchone()[0]
            reused.rollback()
        finally:
            connection_pool.putconn(reused)
    finally:
        connection_pool.closeall()

    passed = (
        during_transaction == org_id
        and after_reuse in (None, "")
        and visible_projects_without_context == 0
    )
    return _result(
        "PG-POOL-ISOLATION",
        "PASS" if passed else "FAIL",
        "Transaction-local tenant context cleared before pooled connection reuse."
        if passed
        else "Tenant context or tenant-visible rows leaked after pooled connection reuse.",
        evidence={
            "contextSetDuringTransaction": during_transaction == org_id,
            "contextAfterReuseWasEmpty": after_reuse in (None, ""),
            "visibleProjectsWithoutContext": visible_projects_without_context,
        },
    )


def _cross_tenant_read_check(api_dsn: str) -> dict[str, Any]:
    fixtures = {
        name: os.environ.get(name, "").strip()
        for name in (
            "DIFARYX_PHASE2F_ORG_A",
            "DIFARYX_PHASE2F_USER_A",
            "DIFARYX_PHASE2F_PROJECT_A",
            "DIFARYX_PHASE2F_ORG_B",
            "DIFARYX_PHASE2F_USER_B",
            "DIFARYX_PHASE2F_PROJECT_B",
        )
    }
    missing = [name for name, value in fixtures.items() if not value]
    if missing:
        return _result(
            "PG-CROSS-TENANT-READ",
            "BLOCKED",
            "Synthetic two-tenant fixture identifiers are required.",
            evidence={"missingNames": missing},
        )

    connection = _connect(api_dsn)
    try:
        results: dict[str, dict[str, int]] = {}
        for side in ("A", "B"):
            own_org = fixtures[f"DIFARYX_PHASE2F_ORG_{side}"]
            own_user = fixtures[f"DIFARYX_PHASE2F_USER_{side}"]
            own_project = fixtures[f"DIFARYX_PHASE2F_PROJECT_{side}"]
            other = "B" if side == "A" else "A"
            other_project = fixtures[f"DIFARYX_PHASE2F_PROJECT_{other}"]
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT set_config('app.organization_id', %s, true)",
                    (own_org,),
                )
                cursor.execute(
                    "SELECT set_config('app.user_id', %s, true)",
                    (own_user,),
                )
                cursor.execute(
                    """
                    SELECT
                        count(*) FILTER (WHERE id = %s::uuid),
                        count(*) FILTER (WHERE id = %s::uuid)
                    FROM science.projects
                    """,
                    (own_project, other_project),
                )
                own_count, other_count = cursor.fetchone()
            connection.rollback()
            results[side] = {"own": own_count, "other": other_count}
    finally:
        connection.close()

    passed = all(
        counts["own"] == 1 and counts["other"] == 0
        for counts in results.values()
    )
    return _result(
        "PG-CROSS-TENANT-READ",
        "PASS" if passed else "FAIL",
        "Each synthetic tenant can read its own project and not the other tenant's project."
        if passed
        else "Synthetic cross-tenant project isolation failed or fixtures were not visible.",
        evidence=results,
    )


def _phase2f_row_isolation_check(
    api_dsn: str,
    worker_dsn: str,
    admin_dsn: str,
) -> list[dict[str, Any]]:
    if os.environ.get("DIFARYX_PHASE2F_USE_SYNTHETIC_FIXTURES") != "YES":
        return [
            _result(
                "PG-PHASE2F-ROW-ISOLATION",
                "BLOCKED",
                "Set DIFARYX_PHASE2F_USE_SYNTHETIC_FIXTURES=YES after seed-postgres.",
            ),
            _result(
                "PG-WORKER-COLUMN-GRANT",
                "BLOCKED",
                "Synthetic evidence fixtures are required.",
            ),
            _result(
                "PG-EVIDENCE-IMMUTABILITY",
                "BLOCKED",
                "Synthetic evidence fixtures are required.",
            ),
        ]

    tables_and_ids = (
        ("xrd_evidence_snapshots", "evidence"),
        ("reasoning_runs", "reasoning"),
        ("notebook_reasoning_references", "notebook"),
    )
    results: dict[str, dict[str, dict[str, int]]] = {}
    connection = _connect(api_dsn)
    try:
        for side in ("A", "B"):
            own = SYNTHETIC_FIXTURES[side]
            other = SYNTHETIC_FIXTURES["B" if side == "A" else "A"]
            side_results: dict[str, dict[str, int]] = {}
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT set_config('app.organization_id', %s, true)",
                    (own["org"],),
                )
                cursor.execute(
                    "SELECT set_config('app.user_id', %s, true)",
                    (own["user"],),
                )
                for table, id_name in tables_and_ids:
                    cursor.execute(
                        f"""
                        SELECT
                            count(*) FILTER (WHERE id = %s::uuid),
                            count(*) FILTER (WHERE id = %s::uuid)
                        FROM science.{table}
                        """,
                        (own[id_name], other[id_name]),
                    )
                    own_count, other_count = cursor.fetchone()
                    side_results[table] = {
                        "own": own_count,
                        "other": other_count,
                    }
            connection.rollback()
            results[side] = side_results
    finally:
        connection.close()

    row_isolation_passed = all(
        counts["own"] == 1 and counts["other"] == 0
        for side in results.values()
        for counts in side.values()
    )
    row_check = _result(
        "PG-PHASE2F-ROW-ISOLATION",
        "PASS" if row_isolation_passed else "FAIL",
        "Application role sees its own Phase 2F rows and not the other tenant's rows."
        if row_isolation_passed
        else "Application-role Phase 2F row isolation failed.",
        evidence=results,
    )

    worker_grant_status = "FAIL"
    worker_grant_evidence: dict[str, Any] = {}
    worker = _connect(worker_dsn)
    try:
        try:
            with worker.cursor() as cursor:
                cursor.execute(
                    "SELECT set_config('app.organization_id', %s, true)",
                    (SYNTHETIC_FIXTURES["A"]["org"],),
                )
                cursor.execute(
                    "SELECT set_config('app.user_id', %s, true)",
                    (SYNTHETIC_FIXTURES["A"]["user"],),
                )
                cursor.execute(
                    """
                    UPDATE science.xrd_evidence_snapshots
                    SET content = content || '{"liveProbe": true}'::jsonb
                    WHERE id = %s::uuid
                    """,
                    (SYNTHETIC_FIXTURES["A"]["evidence"],),
                )
            worker.rollback()
            worker_grant_evidence["unexpectedContentUpdateSucceeded"] = True
        except Exception as exc:
            sqlstate = getattr(exc, "pgcode", None)
            worker.rollback()
            worker_grant_evidence["sqlstate"] = sqlstate
            worker_grant_status = "PASS" if sqlstate == "42501" else "FAIL"
    finally:
        worker.close()
    worker_grant_check = _result(
        "PG-WORKER-COLUMN-GRANT",
        worker_grant_status,
        "Worker role cannot update evidence content; PostgreSQL returned insufficient privilege."
        if worker_grant_status == "PASS"
        else "Worker role did not enforce the expected column-level update boundary.",
        evidence=worker_grant_evidence,
    )

    immutability_status = "FAIL"
    immutability_evidence: dict[str, Any] = {}
    admin = _connect(admin_dsn)
    try:
        try:
            with admin.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE science.xrd_evidence_snapshots
                    SET content = content || '{"liveProbe": true}'::jsonb
                    WHERE organization_id = %s::uuid AND id = %s::uuid
                    """,
                    (
                        SYNTHETIC_FIXTURES["A"]["org"],
                        SYNTHETIC_FIXTURES["A"]["evidence"],
                    ),
                )
            admin.rollback()
            immutability_evidence["unexpectedUpdateSucceeded"] = True
        except Exception as exc:
            sqlstate = getattr(exc, "pgcode", None)
            admin.rollback()
            immutability_evidence["sqlstate"] = sqlstate
            immutability_status = "PASS" if sqlstate == "55000" else "FAIL"
    finally:
        admin.close()
    immutability_check = _result(
        "PG-EVIDENCE-IMMUTABILITY",
        immutability_status,
        "Live immutability trigger rejected evidence content mutation with SQLSTATE 55000."
        if immutability_status == "PASS"
        else "Evidence mutation did not fail with the expected immutability SQLSTATE.",
        evidence=immutability_evidence,
    )
    return [row_check, worker_grant_check, immutability_check]


def _database_dsns() -> dict[str, str]:
    names = (
        "DIFARYX_ADMIN_TEST_DATABASE_URL",
        "DIFARYX_API_TEST_DATABASE_URL",
        "DIFARYX_WORKER_TEST_DATABASE_URL",
    )
    dsns = {name: os.environ.get(name, "").strip() for name in names}
    missing = [name for name, value in dsns.items() if not value]
    if missing:
        raise RuntimeError(
            "Missing required database URL names: " + ", ".join(missing)
        )
    expected_database_names = {
        _safe_database_name(dsn) for dsn in dsns.values()
    }
    if len(expected_database_names) != 1:
        raise RuntimeError("All database URLs must target the same staging database.")
    return dsns


def run_seed_postgres() -> dict[str, Any]:
    if os.environ.get("DIFARYX_ALLOW_LIVE_STAGING_VALIDATION") != "YES":
        raise RuntimeError(
            "Set DIFARYX_ALLOW_LIVE_STAGING_VALIDATION=YES for this process."
        )
    if os.environ.get("DIFARYX_PHASE2F_ALLOW_SYNTHETIC_WRITES") != "YES":
        raise RuntimeError(
            "Set DIFARYX_PHASE2F_ALLOW_SYNTHETIC_WRITES=YES for synthetic staging fixtures."
        )
    dsns = _database_dsns()
    admin_dsn = dsns["DIFARYX_ADMIN_TEST_DATABASE_URL"]
    connection = _connect(admin_dsn)
    try:
        for side in ("A", "B"):
            fixture = SYNTHETIC_FIXTURES[side]
            marker = side.lower()
            content_sha = marker * 64
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO identity.organizations (id, slug, display_name)
                    VALUES (%s::uuid, %s, %s)
                    ON CONFLICT (id) DO NOTHING
                    """,
                    (fixture["org"], f"phase2f-{marker}", f"Phase 2F {side}"),
                )
                cursor.execute(
                    """
                    INSERT INTO identity.users
                        (id, organization_id, email, display_name)
                    VALUES (%s::uuid, %s::uuid, %s, %s)
                    ON CONFLICT (organization_id, id) DO NOTHING
                    """,
                    (
                        fixture["user"],
                        fixture["org"],
                        f"phase2f-{marker}@example.invalid",
                        f"Phase 2F {side}",
                    ),
                )
                cursor.execute(
                    """
                    INSERT INTO science.projects
                        (id, organization_id, owner_user_id, title)
                    VALUES (%s::uuid, %s::uuid, %s::uuid, %s)
                    ON CONFLICT (organization_id, id) DO NOTHING
                    """,
                    (
                        fixture["project"],
                        fixture["org"],
                        fixture["user"],
                        f"Phase 2F synthetic {side}",
                    ),
                )
                cursor.execute(
                    """
                    INSERT INTO governance.quota_ledger (
                        id, organization_id, quota_type, quota_period,
                        period_start, period_end, allocated
                    )
                    VALUES (
                        %s::uuid, %s::uuid, 'storage_bytes', 'staging',
                        CURRENT_DATE, CURRENT_DATE, 1000000
                    )
                    ON CONFLICT (organization_id, id) DO NOTHING
                    """,
                    (fixture["ledger"], fixture["org"]),
                )
                cursor.execute(
                    """
                    INSERT INTO governance.quota_reservations (
                        id, organization_id, project_id, created_by,
                        quota_ledger_id, reservation_key, resource_type,
                        reserved_amount, expires_at
                    )
                    VALUES (
                        %s::uuid, %s::uuid, %s::uuid, %s::uuid,
                        %s::uuid, %s, 'storage_upload', 128,
                        NOW() + INTERVAL '1 day'
                    )
                    ON CONFLICT (organization_id, id) DO NOTHING
                    """,
                    (
                        fixture["reservation"],
                        fixture["org"],
                        fixture["project"],
                        fixture["user"],
                        fixture["ledger"],
                        f"phase2f-{marker}-reservation",
                    ),
                )
                cursor.execute(
                    """
                    INSERT INTO science.datasets (
                        id, organization_id, project_id, technique,
                        display_filename, declared_content_type, byte_size,
                        client_checksum_sha256, dataset_status, created_by,
                        title, measurement_metadata, processing_parameters,
                        experiment_context
                    )
                    VALUES (
                        %s::uuid, %s::uuid, %s::uuid, 'xrd',
                        %s, 'text/csv', 128, %s, 'uploaded', %s::uuid,
                        %s, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb
                    )
                    ON CONFLICT (organization_id, id) DO NOTHING
                    """,
                    (
                        fixture["dataset"],
                        fixture["org"],
                        fixture["project"],
                        f"phase2f-{marker}.csv",
                        content_sha,
                        fixture["user"],
                        f"Phase 2F dataset {side}",
                    ),
                )
                cursor.execute(
                    """
                    INSERT INTO science.upload_sessions (
                        id, organization_id, dataset_id, created_by, object_key,
                        expected_byte_size, client_checksum_sha256,
                        storage_provider, session_status, idempotency_key,
                        request_fingerprint, quota_reservation_id, expires_at,
                        finalized_at, original_filename
                    )
                    VALUES (
                        %s::uuid, %s::uuid, %s::uuid, %s::uuid, %s,
                        128, %s, 'local', 'finalized', %s,
                        %s, %s::uuid, NOW() + INTERVAL '1 day',
                        NOW(), %s
                    )
                    ON CONFLICT (organization_id, id) DO NOTHING
                    """,
                    (
                        fixture["upload"],
                        fixture["org"],
                        fixture["dataset"],
                        fixture["user"],
                        f"datasets/{fixture['org']}/{fixture['dataset']}/original.csv",
                        content_sha,
                        f"phase2f-{marker}-upload",
                        content_sha,
                        fixture["reservation"],
                        f"phase2f-{marker}.csv",
                    ),
                )
                cursor.execute(
                    """
                    INSERT INTO science.dataset_objects (
                        id, organization_id, dataset_id,
                        source_upload_session_id, object_role, storage_provider,
                        object_key, byte_size, content_type,
                        authoritative_sha256
                    )
                    VALUES (
                        %s::uuid, %s::uuid, %s::uuid, %s::uuid,
                        'original', 'local', %s, 128, 'text/csv', %s
                    )
                    ON CONFLICT (organization_id, id) DO NOTHING
                    """,
                    (
                        fixture["object"],
                        fixture["org"],
                        fixture["dataset"],
                        fixture["upload"],
                        f"datasets/{fixture['org']}/{fixture['dataset']}/original.csv",
                        content_sha,
                    ),
                )
                cursor.execute(
                    """
                    UPDATE science.datasets
                    SET original_object_id = %s::uuid
                    WHERE organization_id = %s::uuid AND id = %s::uuid
                    """,
                    (fixture["object"], fixture["org"], fixture["dataset"]),
                )
                cursor.execute(
                    """
                    INSERT INTO science.validation_attempts (
                        id, organization_id, dataset_id, original_object_id,
                        attempt_number, status, completed_at,
                        server_checksum_sha256, byte_size_verified
                    )
                    VALUES (
                        %s::uuid, %s::uuid, %s::uuid, %s::uuid,
                        1, 'passed', NOW(), %s, 128
                    )
                    ON CONFLICT (organization_id, id) DO NOTHING
                    """,
                    (
                        fixture["attempt"],
                        fixture["org"],
                        fixture["dataset"],
                        fixture["object"],
                        content_sha,
                    ),
                )
                cursor.execute(
                    """
                    INSERT INTO science.xrd_evidence_snapshots (
                        id, organization_id, project_id, dataset_id,
                        upload_session_id, validation_attempt_id, version,
                        status, schema_version, processor_version, content,
                        content_sha256, provenance
                    )
                    VALUES (
                        %s::uuid, %s::uuid, %s::uuid, %s::uuid,
                        %s::uuid, %s::uuid, 1, 'ready',
                        'phase2f-staging-v1', 'phase2f-staging-v1',
                        %s::jsonb, %s, %s::jsonb
                    )
                    ON CONFLICT (organization_id, id) DO NOTHING
                    """,
                    (
                        fixture["evidence"],
                        fixture["org"],
                        fixture["project"],
                        fixture["dataset"],
                        fixture["upload"],
                        fixture["attempt"],
                        json.dumps({"synthetic": True, "tenant": side}),
                        content_sha,
                        json.dumps(
                            {
                                "synthetic": True,
                                "validationAttemptId": fixture["attempt"],
                            }
                        ),
                    ),
                )
                cursor.execute(
                    """
                    UPDATE science.datasets
                    SET current_evidence_id = %s::uuid
                    WHERE organization_id = %s::uuid AND id = %s::uuid
                    """,
                    (fixture["evidence"], fixture["org"], fixture["dataset"]),
                )
                cursor.execute(
                    """
                    INSERT INTO science.reasoning_runs (
                        id, organization_id, project_id, dataset_id,
                        upload_session_id, evidence_snapshot_id,
                        evidence_content_sha256, created_by, execution_mode,
                        status, provider, prompt_version, policy_version,
                        structured_output, request_id, completed_at
                    )
                    VALUES (
                        %s::uuid, %s::uuid, %s::uuid, %s::uuid,
                        %s::uuid, %s::uuid, %s, %s::uuid, 'deterministic',
                        'succeeded', 'deterministic', 'staging-v1', 'staging-v1',
                        %s::jsonb, %s, NOW()
                    )
                    ON CONFLICT (organization_id, id) DO NOTHING
                    """,
                    (
                        fixture["reasoning"],
                        fixture["org"],
                        fixture["project"],
                        fixture["dataset"],
                        fixture["upload"],
                        fixture["evidence"],
                        content_sha,
                        fixture["user"],
                        json.dumps({"synthetic": True, "tenant": side}),
                        f"phase2f-staging-{marker}",
                    ),
                )
                cursor.execute(
                    """
                    INSERT INTO science.notebook_reasoning_references (
                        id, organization_id, project_id, dataset_id,
                        evidence_snapshot_id, reasoning_run_id,
                        created_by, label
                    )
                    VALUES (
                        %s::uuid, %s::uuid, %s::uuid, %s::uuid,
                        %s::uuid, %s::uuid, %s::uuid, %s
                    )
                    ON CONFLICT (organization_id, id) DO NOTHING
                    """,
                    (
                        fixture["notebook"],
                        fixture["org"],
                        fixture["project"],
                        fixture["dataset"],
                        fixture["evidence"],
                        fixture["reasoning"],
                        fixture["user"],
                        f"Phase 2F synthetic {side}",
                    ),
                )
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()

    return {
        "schemaVersion": "phase2f-live-staging-v1",
        "mode": "seed-postgres",
        "databaseName": _safe_database_name(admin_dsn),
        "status": "PASS",
        "detail": "Synthetic two-tenant Phase 2F fixtures inserted idempotently.",
        "fixtures": SYNTHETIC_FIXTURES,
        "cleanup": "Not automatic; remove only these exact UUIDs after evidence review.",
    }


def run_postgres() -> dict[str, Any]:
    if os.environ.get("DIFARYX_ALLOW_LIVE_STAGING_VALIDATION") != "YES":
        raise RuntimeError(
            "Set DIFARYX_ALLOW_LIVE_STAGING_VALIDATION=YES for this process."
        )

    dsns = _database_dsns()
    expected_database_names = {_safe_database_name(dsn) for dsn in dsns.values()}

    identities: dict[str, dict[str, str]] = {}
    connections = {}
    try:
        for name, dsn in dsns.items():
            connection = _connect(dsn)
            connections[name] = connection
            identities[name] = _connection_identity(connection)

        if len({item["database"] for item in identities.values()}) != 1:
            raise RuntimeError("Database connections do not resolve to one database.")
        if len({item["currentUser"] for item in identities.values()}) != 3:
            raise RuntimeError(
                "Admin, application, and worker URLs must authenticate as distinct roles."
            )

        checks = _postgres_metadata_checks(
            connections["DIFARYX_ADMIN_TEST_DATABASE_URL"]
        )
    finally:
        for connection in connections.values():
            connection.close()

    checks.append(
        _pool_isolation_check(dsns["DIFARYX_API_TEST_DATABASE_URL"])
    )
    checks.append(
        _cross_tenant_read_check(dsns["DIFARYX_API_TEST_DATABASE_URL"])
    )
    checks.extend(
        _phase2f_row_isolation_check(
            dsns["DIFARYX_API_TEST_DATABASE_URL"],
            dsns["DIFARYX_WORKER_TEST_DATABASE_URL"],
            dsns["DIFARYX_ADMIN_TEST_DATABASE_URL"],
        )
    )

    blocking = [
        item["checkId"]
        for item in checks
        if item["status"] in {"FAIL", "BLOCKED"}
    ]
    return {
        "schemaVersion": "phase2f-live-staging-v1",
        "mode": "postgres",
        "databaseName": next(iter(expected_database_names)),
        "connectionIdentities": identities,
        "checks": checks,
        "blockingChecks": blocking,
        "passed": not blocking,
        "writeBehavior": "read-only; transactions used by isolation probes are rolled back",
    }


def _write_evidence(payload: dict[str, Any], path: str | None) -> None:
    text = json.dumps(payload, indent=2, sort_keys=True)
    print(text)
    if path:
        target = Path(path)
        if not target.is_absolute():
            target = REPO_ROOT / target
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "mode",
        choices=("preflight", "seed-postgres", "postgres"),
    )
    parser.add_argument(
        "--evidence",
        help="Optional JSON evidence path. Use an ignored scratch path.",
    )
    args = parser.parse_args()

    try:
        if args.mode == "preflight":
            payload = run_preflight()
        elif args.mode == "seed-postgres":
            payload = run_seed_postgres()
        else:
            payload = run_postgres()
        _write_evidence(payload, args.evidence)
        return 0 if not payload.get("blockingChecks") else 2
    except Exception as exc:
        payload = {
            "schemaVersion": "phase2f-live-staging-v1",
            "mode": args.mode,
            "fatal": type(exc).__name__,
            "detail": str(exc),
        }
        # Do not retry a failed evidence-file write in the exception handler.
        # The JSON result still reaches stdout without masking the root cause.
        print(json.dumps(payload, indent=2, sort_keys=True))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
