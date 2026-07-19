import os
import sys

# Configure test environment before importing settings/app
os.environ["AUTH_PROVIDER"] = "test"
os.environ["APP_ENV"] = "test"
if os.getenv("DIFARYX_API_TEST_DATABASE_URL"):
    os.environ["DATABASE_URL"] = os.getenv("DIFARYX_API_TEST_DATABASE_URL")

import unittest
import asyncio
from datetime import datetime, timezone, timedelta
from uuid import UUID, uuid4
from unittest.mock import patch, MagicMock
import sqlalchemy as sa
from httpx import AsyncClient, ASGITransport

# Add path so that we can import api modules
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../server/python"))

# Configure Selector event loop policy on Windows
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from api.gateway import app
from api.db.engine import create_async_engine
from api.db.settings import settings
from api.db.uow import UnitOfWork
from api.repositories.project_repository import ProjectRepository
from api.services.project_service import ProjectService
from api.errors import DIFARYXException

# Test Database URLs from env
BOOTSTRAP_URL = os.getenv("DIFARYX_BOOTSTRAP_DATABASE_URL")
API_TEST_URL = os.getenv("DIFARYX_API_TEST_DATABASE_URL")


class TestProjectAPIPhase1A(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self):
        # 1. Reset and Bootstrap DB to clean state
        os.environ["DIFARYX_ALLOW_TEST_DB_RESET"] = "YES"
        from tests.bootstrap_db import bootstrap
        from tests.prepare_test_environment import main as prepare_env
        bootstrap()
        prepare_env()

        # Force TestTokenVerifier regardless of import order / cached singleton
        from api.auth.dependencies import get_token_verifier
        from api.auth.verifier import TestTokenVerifier
        app.dependency_overrides[get_token_verifier] = lambda: TestTokenVerifier("test")

        # Create superuser engine for seeding
        url = BOOTSTRAP_URL
        if url.startswith("postgresql://"):
            url = "postgresql+psycopg://" + url[len("postgresql://"):]
        self.su_engine = create_async_engine(url)

        # Mapped test values
        self.org_a_id = "aaaaaaaa-0000-0000-0000-000000000001"
        self.org_b_id = "bbbbbbbb-0000-0000-0000-000000000002"
        self.user_a1_id = "11111111-0000-0000-0000-000000000001"
        self.user_a2_id = "11111111-0000-0000-0000-000000000002"
        self.user_a3_id = "11111111-0000-0000-0000-000000000003"
        self.user_admin_id = "11111111-0000-0000-0000-000000000004"
        self.user_b1_id = "11111111-0000-0000-0000-000000000005"

        # Seed initial organizations, users, memberships, and identities
        async with self.su_engine.connect() as conn:
            await conn.execute(sa.text("""
                INSERT INTO identity.organizations (id, slug, display_name, plan_tier, is_active)
                VALUES 
                    (:org_a, 'org-a', 'Organization A', 'free', true),
                    (:org_b, 'org-b', 'Organization B', 'free', true)
            """), {"org_a": self.org_a_id, "org_b": self.org_b_id})

            await conn.execute(sa.text("""
                INSERT INTO identity.users (id, organization_id, email, display_name, is_active)
                VALUES
                    (:u_a1, :org_a, 'a1@test.com', 'User A1', true),
                    (:u_a2, :org_a, 'a2@test.com', 'User A2', true),
                    (:u_a3, :org_a, 'a3@test.com', 'User A3', true),
                    (:u_admin, :org_a, 'admin@test.com', 'User Admin', true),
                    (:u_b1, :org_b, 'b1@test.com', 'User B1', true)
            """), {
                "u_a1": self.user_a1_id,
                "u_a2": self.user_a2_id,
                "u_a3": self.user_a3_id,
                "u_admin": self.user_admin_id,
                "u_b1": self.user_b1_id,
                "org_a": self.org_a_id,
                "org_b": self.org_b_id
            })

            await conn.execute(sa.text("""
                INSERT INTO identity.memberships (id, organization_id, user_id, role)
                VALUES
                    (uuid_generate_v4(), :org_a, :u_a1, 'member'),
                    (uuid_generate_v4(), :org_a, :u_a2, 'member'),
                    (uuid_generate_v4(), :org_a, :u_a3, 'member'),
                    (uuid_generate_v4(), :org_a, :u_admin, 'admin'),
                    (uuid_generate_v4(), :org_b, :u_b1, 'member')
            """), {
                "u_a1": self.user_a1_id,
                "u_a2": self.user_a2_id,
                "u_a3": self.user_a3_id,
                "u_admin": self.user_admin_id,
                "u_b1": self.user_b1_id,
                "org_a": self.org_a_id,
                "org_b": self.org_b_id
            })

            await conn.execute(sa.text("""
                INSERT INTO identity.auth_identities (provider_name, provider_subject, organization_id, user_id)
                VALUES
                    ('firebase', 'sub-a1', :org_a, :u_a1),
                    ('firebase', 'sub-a2', :org_a, :u_a2),
                    ('firebase', 'sub-a3', :org_a, :u_a3),
                    ('firebase', 'sub-admin', :org_a, :u_admin),
                    ('firebase', 'sub-b1', :org_b, :u_b1)
            """), {
                "org_a": self.org_a_id,
                "org_b": self.org_b_id,
                "u_a1": self.user_a1_id,
                "u_a2": self.user_a2_id,
                "u_a3": self.user_a3_id,
                "u_admin": self.user_admin_id,
                "u_b1": self.user_b1_id
            })
            await conn.commit()

    async def asyncTearDown(self):
        app.dependency_overrides.clear()
        await self.su_engine.dispose()

    # Helpers
    def _auth_header(self, subject: str) -> dict:
        return {"Authorization": f"Bearer mock:firebase|{subject}|ignore@ignore.com"}

    async def test_get_me_success(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            res = await ac.get("/api/v1/me", headers=self._auth_header("sub-a1"))
            self.assertEqual(res.status_code, 200)
            data = res.json()
            self.assertEqual(data["user"]["displayName"], "User A1")
            self.assertEqual(len(data["memberships"]), 1)
            self.assertEqual(data["memberships"][0]["organizationId"], self.org_a_id)

    async def test_get_me_unauthorized(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            res = await ac.get("/api/v1/me")
            self.assertEqual(res.status_code, 401)

    async def test_get_organizations(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            res = await ac.get("/api/v1/organizations", headers=self._auth_header("sub-a1"))
            self.assertEqual(res.status_code, 200)
            orgs_data = res.json()
            orgs_list = orgs_data["organizations"]
            self.assertEqual(len(orgs_list), 1)
            self.assertEqual(orgs_list[0]["organizationId"], self.org_a_id)
            self.assertEqual(orgs_list[0]["organizationName"], "Organization A")

    async def test_project_crud_lifecycle_and_validation(self):
        headers = self._auth_header("sub-a1")
        headers["Active-Organization"] = self.org_a_id

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            # 1. List projects initially empty
            res = await ac.get("/api/v1/projects", headers=headers)
            self.assertEqual(res.status_code, 200)
            self.assertEqual(res.json()["items"], [])

            # 2. Create project
            res = await ac.post("/api/v1/projects", headers=headers, json={
                "title": "Copper Spinel Characterization",
                "description": "XRD/Raman workflow run"
            })
            self.assertEqual(res.status_code, 201)
            p_data = res.json()
            p_id = p_data["id"]
            self.assertEqual(p_data["title"], "Copper Spinel Characterization")
            self.assertEqual(p_data["myProjectRole"], "lead")

            # 3. Get project
            res = await ac.get(f"/api/v1/projects/{p_id}", headers=headers)
            self.assertEqual(res.status_code, 200)
            self.assertEqual(res.json()["title"], "Copper Spinel Characterization")

            # 4. List projects pagination/filtering
            res = await ac.get("/api/v1/projects", headers=headers)
            self.assertEqual(res.status_code, 200)
            p_list = res.json()["items"]
            self.assertEqual(len(p_list), 1)
            self.assertEqual(p_list[0]["id"], p_id)

            # 5. Optimistic concurrency conflict test
            updated_at_str = p_data["updatedAt"]
            # Perform successful update
            res = await ac.patch(f"/api/v1/projects/{p_id}", headers=headers, json={
                "title": "Copper Spinel New Title",
                "description": p_data["description"],
                "expectedUpdatedAt": updated_at_str
            })
            self.assertEqual(res.status_code, 200)
            updated_proj = res.json()

            # Trying to update again with old timestamp -> should fail with 409
            res = await ac.patch(f"/api/v1/projects/{p_id}", headers=headers, json={
                "title": "Another title change",
                "expectedUpdatedAt": updated_at_str
            })
            self.assertEqual(res.status_code, 409)
            self.assertEqual(res.json()["detail"]["errorCode"], "PROJECT_VERSION_CONFLICT")

            # 6. Transactional Audit Log verification
            # Verify that audit log has been written via SQL query using self.su_engine
            async with self.su_engine.connect() as conn:
                audit_res = await conn.execute(sa.text("""
                    SELECT count(*) FROM governance.audit_log 
                    WHERE organization_id = :org_id AND resource_type = 'project'
                """), {"org_id": UUID(self.org_a_id)})
                audit_count = audit_res.scalar()
                self.assertGreaterEqual(audit_count, 2)  # Create and Update

    async def test_tenant_isolation_gateways(self):
        # A1 creates a project in Org A
        headers_a1 = self._auth_header("sub-a1")
        headers_a1["Active-Organization"] = self.org_a_id

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            res = await ac.post("/api/v1/projects", headers=headers_a1, json={
                "title": "Org A Private Project"
            })
            self.assertEqual(res.status_code, 201)
            p_id = res.json()["id"]

            # User B1 tries to read Project A from Org B context -> 404/Not Found or 403
            headers_b1 = self._auth_header("sub-b1")
            headers_b1["Active-Organization"] = self.org_b_id

            res = await ac.get(f"/api/v1/projects/{p_id}", headers=headers_b1)
            self.assertEqual(res.status_code, 404)

            # User B1 tries to update Project A -> 404
            res = await ac.patch(f"/api/v1/projects/{p_id}", headers=headers_b1, json={
                "title": "Illegal Override",
                "expectedUpdatedAt": datetime.now(timezone.utc).isoformat()
            })
            self.assertEqual(res.status_code, 404)

    async def test_project_memberships_role_isolation(self):
        # Setup: A1 creates project, A2 (no membership) tries to read/write, A3 (reviewer) can only read
        headers_a1 = self._auth_header("sub-a1")
        headers_a1["Active-Organization"] = self.org_a_id

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            # 1. A1 creates project
            res = await ac.post("/api/v1/projects", headers=headers_a1, json={
                "title": "Lead project"
            })
            p_id = res.json()["id"]

            # 2. Seed project membership roles
            async with self.su_engine.connect() as conn:
                # Add A3 as reviewer
                await conn.execute(sa.text("""
                    INSERT INTO science.project_memberships (organization_id, project_id, user_id, role)
                    VALUES (:org, :project, :user, 'reviewer')
                """), {"org": self.org_a_id, "project": p_id, "user": self.user_a3_id})
                await conn.commit()

            # 3. A2 (Org member but not project member) attempts to read -> returns empty list or blocks access
            # Wait, per RLS rules, they are an org member, but since project_memberships is active and RLS check checks membership,
            # let's verify if A2 can see the project.
            headers_a2 = self._auth_header("sub-a2")
            headers_a2["Active-Organization"] = self.org_a_id

            res = await ac.get(f"/api/v1/projects/{p_id}", headers=headers_a2)
            # In DIFARYX, project visibility checks project memberships. Without membership, it is invisible (404)
            self.assertEqual(res.status_code, 404)

            # A2 attempts to write -> 404
            res = await ac.patch(f"/api/v1/projects/{p_id}", headers=headers_a2, json={
                "title": "A2 title override",
                "expectedUpdatedAt": datetime.now(timezone.utc).isoformat()
            })
            self.assertEqual(res.status_code, 404)

            # 4. A3 (Reviewer) attempts to read -> succeeds
            headers_a3 = self._auth_header("sub-a3")
            headers_a3["Active-Organization"] = self.org_a_id

            res = await ac.get(f"/api/v1/projects/{p_id}", headers=headers_a3)
            self.assertEqual(res.status_code, 200)
            self.assertEqual(res.json()["myProjectRole"], "reviewer")

            # A3 (Reviewer) attempts to write -> 403 Forbidden (handled by service level check)
            res = await ac.patch(f"/api/v1/projects/{p_id}", headers=headers_a3, json={
                "title": "Reviewer title override",
                "expectedUpdatedAt": res.json()["updatedAt"]
            })
            self.assertEqual(res.status_code, 403)
            self.assertEqual(res.json()["detail"]["errorCode"], "ORGANIZATION_ACCESS_DENIED")

    async def test_cursor_pagination_projects(self):
        # Seed 10 projects for Org A
        headers = self._auth_header("sub-a1")
        headers["Active-Organization"] = self.org_a_id

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            for i in range(5):
                res = await ac.post("/api/v1/projects", headers=headers, json={
                    "title": f"Project {i}"
                })
                self.assertEqual(res.status_code, 201)

            # Fetch page 1 (limit 2)
            res = await ac.get("/api/v1/projects?limit=2", headers=headers)
            self.assertEqual(res.status_code, 200)
            data1 = res.json()
            self.assertEqual(len(data1["items"]), 2)
            self.assertIsNotNone(data1["nextCursor"])

            # Fetch page 2 using cursor
            cursor = data1["nextCursor"]
            res = await ac.get(f"/api/v1/projects?limit=2&cursor={cursor}", headers=headers)
            self.assertEqual(res.status_code, 200)
            data2 = res.json()
            self.assertEqual(len(data2["items"]), 2)

            # Assert no overlaps
            ids1 = [p["id"] for p in data1["items"]]
            ids2 = [p["id"] for p in data2["items"]]
            for pid in ids1:
                self.assertNotIn(pid, ids2)


if __name__ == "__main__":
    unittest.main()
