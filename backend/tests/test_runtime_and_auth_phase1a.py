import os
import sys
import asyncio

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

# Force DATABASE_URL to use the restricted API test role for database readiness and engine tests
if os.getenv("DIFARYX_API_TEST_DATABASE_URL"):
    os.environ["DATABASE_URL"] = os.getenv("DIFARYX_API_TEST_DATABASE_URL")

import unittest
from unittest.mock import MagicMock, patch
from uuid import UUID, uuid4

# Setup sys.path to include server/python
_HERE = os.path.dirname(os.path.abspath(__file__))
_SERVER_DIR = os.path.abspath(os.path.join(_HERE, "../../server/python"))
if _SERVER_DIR not in sys.path:
    sys.path.insert(0, _SERVER_DIR)

import psycopg
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import create_async_engine

def make_async_url(url: str) -> str:
    if url.startswith("postgresql://"):
        return "postgresql+psycopg://" + url[len("postgresql://"):]
    return url

from api.db.settings import DatabaseSettings, settings
from api.db.engine import verify_database_readiness
from api.db.uow import UnitOfWork
from api.db.bootstrap_identity import BootstrapIdentityRepository
from api.auth.models import VerifiedExternalIdentity, UserMapping, AuthenticatedUserContext
from api.auth.verifier import get_token_verifier as verifier_factory, FirebaseTokenVerifier, TestTokenVerifier
from api.auth.dependencies import get_verified_identity, get_user_context, get_active_organization, get_token_verifier as get_token_verifier_dependency
from api.errors import (
    DIFARYXException,
    AuthenticationRequiredException,
    InvalidOrganizationContextException,
    OrganizationAccessDeniedException
)
from api.routes.health import liveness_check, readiness_check

# Database connection strings loaded from environment
BOOTSTRAP_URL = os.getenv("DIFARYX_BOOTSTRAP_DATABASE_URL")
API_TEST_URL = os.getenv("DIFARYX_API_TEST_DATABASE_URL")


class TestDatabaseRuntimeAndAuth(unittest.IsolatedAsyncioTestCase):

    @classmethod
    def setUpClass(cls):
        if not BOOTSTRAP_URL or not API_TEST_URL:
            raise RuntimeError("Missing required database environment variables for tests.")

        # Superuser connection to seed test mappings
        cls.su_conn = psycopg.connect(BOOTSTRAP_URL)
        cls.su_conn.autocommit = True
        cls.su_cur = cls.su_conn.cursor()

    @classmethod
    def tearDownClass(cls):
        cls.su_cur.close()
        cls.su_conn.close()

    async def asyncSetUp(self):
        # Clear database records prior to each test to isolate states
        self.su_cur.execute("DELETE FROM identity.auth_identities")
        
        # We use test UUIDs that won't conflict
        self.org_id_1 = "f1111111-1111-1111-1111-111111111111"
        self.org_id_2 = "f2222222-2222-2222-2222-222222222222"
        self.user_id_1 = "f3333333-3333-3333-3333-333333333333"
        self.user_id_2 = "f4444444-4444-4444-4444-444444444444"

        self.su_cur.execute("DELETE FROM identity.memberships WHERE user_id IN (%s, %s)", (self.user_id_1, self.user_id_2))
        self.su_cur.execute("DELETE FROM identity.users WHERE id IN (%s, %s)", (self.user_id_1, self.user_id_2))
        self.su_cur.execute("DELETE FROM identity.organizations WHERE id IN (%s, %s)", (self.org_id_1, self.org_id_2))

        # Seed test organizations
        self.su_cur.execute(
            "INSERT INTO identity.organizations (id, slug, display_name, is_active) VALUES (%s, 'test-org-1', 'Test Org 1', true)",
            (self.org_id_1,)
        )
        self.su_cur.execute(
            "INSERT INTO identity.organizations (id, slug, display_name, is_active) VALUES (%s, 'test-org-2', 'Test Org 2', true)",
            (self.org_id_2,)
        )

        # Seed test users
        self.su_cur.execute(
            "INSERT INTO identity.users (id, organization_id, email, display_name, is_active) VALUES (%s, %s, 'user1@test.com', 'User One', true)",
            (self.user_id_1, self.org_id_1)
        )
        self.su_cur.execute(
            "INSERT INTO identity.users (id, organization_id, email, display_name, is_active) VALUES (%s, %s, 'user2@test.com', 'User Two', true)",
            (self.user_id_2, self.org_id_2)
        )

        # Seed memberships
        self.su_cur.execute(
            "INSERT INTO identity.memberships (organization_id, user_id, role) VALUES (%s, %s, 'member')",
            (self.org_id_1, self.user_id_1)
        )
        self.su_cur.execute(
            "INSERT INTO identity.memberships (organization_id, user_id, role) VALUES (%s, %s, 'owner')",
            (self.org_id_2, self.user_id_2)
        )

        # Seed auth mappings
        self.su_cur.execute(
            "INSERT INTO identity.auth_identities (provider_name, provider_subject, organization_id, user_id) VALUES ('firebase', 'sub-1', %s, %s)",
            (self.org_id_1, self.user_id_1)
        )

    # ─────────────────────────────────────────────────────────────────────────
    # 1. Settings Tests
    # ─────────────────────────────────────────────────────────────────────────

    def test_settings_missing_database_url_fails(self):
        """Verify that DatabaseSettings raises an error when DATABASE_URL is missing."""
        with self.assertRaises(Exception):
            DatabaseSettings(DATABASE_URL=None)

    def test_settings_secrets_excluded_from_repr(self):
        """Verify that SecretStr excludes plaintext secrets from repr and str logs."""
        s = DatabaseSettings(DATABASE_URL="postgresql://test_user:secret_pass@localhost/db")
        self.assertNotIn("secret_pass", repr(s.DATABASE_URL))
        self.assertNotIn("secret_pass", str(s.DATABASE_URL))

    def test_settings_production_rejects_test_verifier(self):
        """Verify that factory rejects mock authenticator configurations in production."""
        with self.assertRaises(RuntimeError):
            verifier_factory(app_env="production", provider="test")

        with self.assertRaises(RuntimeError):
            verifier_factory(app_env="staging", provider="test")

        # Dev / test environment should successfully build mock verifier
        v = verifier_factory(app_env="test", provider="test")
        self.assertIsInstance(v, TestTokenVerifier)

    # ─────────────────────────────────────────────────────────────────────────
    # 2. Engine and Readiness Tests
    # ─────────────────────────────────────────────────────────────────────────

    async def test_engine_verify_database_readiness_valid(self):
        """Verify that database readiness passes with standard test configurations."""
        # This uses the current valid test database connection
        async_eng = create_async_engine(make_async_url(API_TEST_URL))
        try:
            await verify_database_readiness(async_eng)
        finally:
            await async_eng.dispose()

    async def test_engine_verify_database_readiness_rejects_superuser(self):
        """Verify that readiness fails if connected via database superuser."""
        # Use superuser credentials connection
        async_eng = create_async_engine(make_async_url(BOOTSTRAP_URL))
        try:
            with self.assertRaises(RuntimeError) as ctx:
                await verify_database_readiness(async_eng)
            self.assertIn("SUPERUSER", str(ctx.exception))
        finally:
            await async_eng.dispose()

    async def test_engine_verify_database_readiness_rejects_mismatched_revision(self):
        """Verify that readiness check rejects versions other than 0009."""
        # Temporarily mock alembic version
        self.su_cur.execute("UPDATE public.alembic_version SET version_num = '0008'")
        async_eng = create_async_engine(make_async_url(API_TEST_URL))
        try:
            with self.assertRaises(RuntimeError) as ctx:
                await verify_database_readiness(async_eng)
            self.assertIn("expected revision '0009'", str(ctx.exception))
        finally:
            self.su_cur.execute("UPDATE public.alembic_version SET version_num = '0009'")
            await async_eng.dispose()

    # ─────────────────────────────────────────────────────────────────────────
    # 3. UnitOfWork Tests
    # ─────────────────────────────────────────────────────────────────────────

    async def test_uow_commit_and_context_propagation(self):
        """Verify that UnitOfWork sets transaction context variables and cleans them up on commit."""
        uow = UnitOfWork(organization_id=UUID(self.org_id_1), user_id=UUID(self.user_id_1))
        async with uow as session:
            # Check context is propagated inside the active session
            res = await session.execute(sa.text("SELECT identity.current_organization_id()"))
            self.assertEqual(res.scalar(), UUID(self.org_id_1))

            res_user = await session.execute(sa.text("SELECT identity.current_user_id()"))
            self.assertEqual(res_user.scalar(), UUID(self.user_id_1))

        # Outside transaction context should be gone on new checkout from engine pool
        async_eng = create_async_engine(make_async_url(API_TEST_URL))
        async with async_eng.connect() as conn:
            res_org = await conn.execute(sa.text("SELECT identity.current_organization_id()"))
            self.assertIsNone(res_org.scalar())
        await async_eng.dispose()

    async def test_uow_rollback_clears_context(self):
        """Verify that transaction rollback cleans up the RLS contexts correctly."""
        uow = UnitOfWork(organization_id=UUID(self.org_id_1), user_id=UUID(self.user_id_1))
        try:
            async with uow as session:
                await session.execute(sa.text("SELECT 1"))
                raise ValueError("Force Rollback")
        except ValueError:
            pass

        # Verify context is clean
        async_eng = create_async_engine(make_async_url(API_TEST_URL))
        async with async_eng.connect() as conn:
            res_org = await conn.execute(sa.text("SELECT identity.current_organization_id()"))
            self.assertIsNone(res_org.scalar())
        await async_eng.dispose()

    async def test_uow_concurrent_tenants_isolation(self):
        """Verify that concurrent transactions maintain distinct RLS parameter boundaries."""
        uow1 = UnitOfWork(organization_id=UUID(self.org_id_1), user_id=UUID(self.user_id_1))
        uow2 = UnitOfWork(organization_id=UUID(self.org_id_2), user_id=UUID(self.user_id_2))

        async with uow1 as session1:
            async with uow2 as session2:
                res1 = await session1.execute(sa.text("SELECT identity.current_organization_id()"))
                res2 = await session2.execute(sa.text("SELECT identity.current_organization_id()"))

                self.assertEqual(res1.scalar(), UUID(self.org_id_1))
                self.assertEqual(res2.scalar(), UUID(self.org_id_2))

    # ─────────────────────────────────────────────────────────────────────────
    # 4. Resolver Tests
    # ─────────────────────────────────────────────────────────────────────────

    async def test_resolver_valid_one_org_mapping(self):
        """Verify resolver returns the expected organization mapping data."""
        mappings = await BootstrapIdentityRepository.resolve("firebase", "sub-1")
        self.assertEqual(len(mappings), 1)
        self.assertEqual(mappings[0]["organization_id"], UUID(self.org_id_1))
        self.assertEqual(mappings[0]["email"], "user1@test.com")

    async def test_resolver_unknown_identity(self):
        """Verify resolver returns empty list for unregistered external subjects."""
        mappings = await BootstrapIdentityRepository.resolve("firebase", "unknown-sub")
        self.assertEqual(mappings, [])

    async def test_resolver_inactive_user_omitted(self):
        """Verify resolver omits mappings for users flagged as inactive."""
        # Deactivate user
        self.su_cur.execute("UPDATE identity.users SET is_active = false WHERE id = %s", (self.user_id_1,))
        mappings = await BootstrapIdentityRepository.resolve("firebase", "sub-1")
        self.assertEqual(mappings, [])

    async def test_resolver_malformed_input(self):
        """Verify resolver rejects empty or overlength inputs."""
        with self.assertRaises(ValueError):
            await BootstrapIdentityRepository.resolve("", "sub-1")

        with self.assertRaises(ValueError):
            await BootstrapIdentityRepository.resolve("firebase", "x" * 513)

    # ─────────────────────────────────────────────────────────────────────────
    # 5. Authentication Dependencies Tests
    # ─────────────────────────────────────────────────────────────────────────

    async def test_dependency_get_verified_identity_missing_token(self):
        """Verify that get_verified_identity raises 401 when token is missing."""
        with self.assertRaises(AuthenticationRequiredException):
            await get_verified_identity(credentials=None)

    async def test_dependency_get_verified_identity_invalid_token(self):
        """Verify that get_verified_identity raises 401 on bad mock formats."""
        credentials = MagicMock()
        credentials.credentials = "bad-token-format"
        
        # Force a test verifier
        verifier = get_token_verifier_dependency()
        with self.assertRaises(AuthenticationRequiredException):
            await get_verified_identity(credentials=credentials, verifier=verifier)

    async def test_dependency_get_user_context_unprovisioned(self):
        """Verify get_user_context throws ACCOUNT_NOT_PROVISIONED for unmapped identities."""
        identity = VerifiedExternalIdentity(provider="firebase", subject="unprovisioned-sub", email="test@test.com")
        with self.assertRaises(DIFARYXException) as ctx:
            await get_user_context(identity=identity)
        self.assertEqual(ctx.exception.detail["errorCode"], "ACCOUNT_NOT_PROVISIONED")

    async def test_dependency_get_active_organization_missing_header(self):
        """Verify get_active_organization throws 400 when Active-Organization header is missing."""
        request = MagicMock()
        request.headers = {}
        context = AuthenticatedUserContext(
            provider="firebase",
            subject="sub-1",
            email="user1@test.com",
            mappings=[]
        )
        with self.assertRaises(InvalidOrganizationContextException):
            await get_active_organization(request=request, context=context)

    async def test_dependency_get_active_organization_access_denied(self):
        """Verify get_active_organization throws 403 when user has no membership in header org."""
        request = MagicMock()
        # Mismatched organization header
        request.headers = {"Active-Organization": str(uuid4())}
        
        from api.auth.models import UserMapping
        context = AuthenticatedUserContext(
            provider="firebase",
            subject="sub-1",
            email="user1@test.com",
            mappings=[
                UserMapping(
                    organization_id=UUID(self.org_id_1),
                    organization_name="Test Org 1",
                    user_id=UUID(self.user_id_1),
                    email="user1@test.com",
                    role="member"
                )
            ]
        )
        with self.assertRaises(OrganizationAccessDeniedException):
            await get_active_organization(request=request, context=context)

    async def test_dependency_get_active_organization_success(self):
        """Verify get_active_organization correctly binds context for verified membership."""
        request = MagicMock()
        request.headers = {"Active-Organization": self.org_id_1}

        from api.auth.models import UserMapping
        context = AuthenticatedUserContext(
            provider="firebase",
            subject="sub-1",
            email="user1@test.com",
            mappings=[
                UserMapping(
                    organization_id=UUID(self.org_id_1),
                    organization_name="Test Org 1",
                    user_id=UUID(self.user_id_1),
                    email="user1@test.com",
                    role="member"
                )
            ]
        )
        resolved_ctx = await get_active_organization(request=request, context=context)
        self.assertEqual(resolved_ctx.active_organization_id, UUID(self.org_id_1))
        self.assertEqual(resolved_ctx.active_user_id, UUID(self.user_id_1))
        self.assertEqual(resolved_ctx.active_role, "member")

    # ─────────────────────────────────────────────────────────────────────────
    # 6. Health Route Tests
    # ─────────────────────────────────────────────────────────────────────────

    async def test_health_liveness_check(self):
        """Verify liveness check does not query the database and returns alive."""
        res = await liveness_check()
        self.assertEqual(res, {"status": "alive"})

    async def test_health_readiness_check_success(self):
        """Verify readiness check succeeds under healthy configuration."""
        response = MagicMock()
        res = await readiness_check(response=response)
        self.assertEqual(res, {"status": "ready"})

    async def test_health_readiness_check_failure(self):
        """Verify readiness check returns 503 service unavailable on DB failure."""
        response = MagicMock()
        with patch("api.routes.health.verify_database_readiness", side_effect=RuntimeError("Connection lost")):
            res = await readiness_check(response=response)
            self.assertEqual(res["status"], "unavailable")
            self.assertEqual(response.status_code, 503)

    async def test_health_readiness_mismatch_revision_returns_503(self):
        """Verify readiness endpoint returns generic 503 on revision mismatch."""
        response = MagicMock()
        with patch("api.routes.health.verify_database_readiness", side_effect=RuntimeError("Database Migration Mismatch: expected revision '0009', got '0008'")):
            res = await readiness_check(response=response)
            self.assertEqual(res, {"status": "unavailable", "detail": "Database readiness checks failed"})
            self.assertEqual(response.status_code, 503)

    async def test_health_readiness_missing_alembic_returns_503(self):
        """Verify readiness endpoint returns generic 503 on missing version table."""
        response = MagicMock()
        with patch("api.routes.health.verify_database_readiness", side_effect=RuntimeError("Database Readiness Failure: alembic_version table is missing")):
            res = await readiness_check(response=response)
            self.assertEqual(res, {"status": "unavailable", "detail": "Database readiness checks failed"})
            self.assertEqual(response.status_code, 503)

    async def test_health_readiness_multiple_heads_returns_503(self):
        """Verify readiness endpoint returns generic 503 on multiple migration heads."""
        response = MagicMock()
        with patch("api.routes.health.verify_database_readiness", side_effect=RuntimeError("Multiple migration heads found")):
            res = await readiness_check(response=response)
            self.assertEqual(res, {"status": "unavailable", "detail": "Database readiness checks failed"})
            self.assertEqual(response.status_code, 503)

    # ─────────────────────────────────────────────────────────────────────────
    # 7. Cancellation and Isolation Tests
    # ─────────────────────────────────────────────────────────────────────────

    async def test_uow_explicit_cancellation_cleanup_before_query(self):
        """Verify that cancelling a UoW task before execution cleans up database parameters cleanly."""
        async def run_uow():
            uow = UnitOfWork(organization_id=UUID(self.org_id_1), user_id=UUID(self.user_id_1))
            async with uow as session:
                await asyncio.sleep(10)

        task = asyncio.create_task(run_uow())
        await asyncio.sleep(0.01)
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

        async_eng = create_async_engine(make_async_url(API_TEST_URL))
        async with async_eng.connect() as conn:
            res_org = await conn.execute(sa.text("SELECT identity.current_organization_id()"))
            self.assertIsNone(res_org.scalar())
        await async_eng.dispose()

    async def test_uow_explicit_cancellation_cleanup_during_query(self):
        """Verify that cancelling a UoW task during an active DB query cleans up parameters cleanly."""
        async def run_uow():
            uow = UnitOfWork(organization_id=UUID(self.org_id_1), user_id=UUID(self.user_id_1))
            async with uow as session:
                await session.execute(sa.text("SELECT pg_sleep(10)"))

        task = asyncio.create_task(run_uow())
        await asyncio.sleep(0.05)
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

        async_eng = create_async_engine(make_async_url(API_TEST_URL))
        async with async_eng.connect() as conn:
            res_org = await conn.execute(sa.text("SELECT identity.current_organization_id()"))
            self.assertIsNone(res_org.scalar())
        await async_eng.dispose()

    async def test_resolver_transaction_isolation(self):
        """Verify that resolver queries do not leak RLS variables or session parameters."""
        mappings = await BootstrapIdentityRepository.resolve("firebase", "sub-1")
        self.assertEqual(len(mappings), 1)

        async_eng = create_async_engine(make_async_url(API_TEST_URL))
        async with async_eng.connect() as conn:
            res_org = await conn.execute(sa.text("SELECT identity.current_organization_id()"))
            self.assertIsNone(res_org.scalar())
            res_user = await conn.execute(sa.text("SELECT identity.current_user_id()"))
            self.assertIsNone(res_user.scalar())
        await async_eng.dispose()

    # ─────────────────────────────────────────────────────────────────────────
    # 8. Verifier and Startup Configuration Tests
    # ─────────────────────────────────────────────────────────────────────────

    @patch("firebase_admin.auth.verify_id_token")
    async def test_firebase_verifier_valid_token(self, mock_verify):
        mock_verify.return_value = {"uid": "fb-subject", "email": "fb@test.com"}
        verifier = FirebaseTokenVerifier()
        identity = await verifier.verify("valid-jwt")
        self.assertEqual(identity.provider, "firebase")
        self.assertEqual(identity.subject, "fb-subject")
        self.assertEqual(identity.email, "fb@test.com")

    @patch("firebase_admin.auth.verify_id_token")
    async def test_firebase_verifier_invalid_signature(self, mock_verify):
        mock_verify.side_effect = ValueError("Invalid signature")
        verifier = FirebaseTokenVerifier()
        with self.assertRaises(ValueError) as ctx:
            await verifier.verify("invalid-sig")
        self.assertIn("Invalid authentication token", str(ctx.exception))

    @patch("firebase_admin.auth.verify_id_token")
    async def test_firebase_verifier_wrong_audience(self, mock_verify):
        mock_verify.side_effect = ValueError("Wrong audience")
        verifier = FirebaseTokenVerifier()
        with self.assertRaises(ValueError) as ctx:
            await verifier.verify("wrong-aud")
        self.assertIn("Invalid authentication token", str(ctx.exception))

    @patch("firebase_admin.auth.verify_id_token")
    async def test_firebase_verifier_wrong_issuer(self, mock_verify):
        mock_verify.side_effect = ValueError("Wrong issuer")
        verifier = FirebaseTokenVerifier()
        with self.assertRaises(ValueError):
            await verifier.verify("wrong-iss")

    @patch("firebase_admin.auth.verify_id_token")
    async def test_firebase_verifier_expired_token(self, mock_verify):
        from firebase_admin.auth import ExpiredIdTokenError
        mock_verify.side_effect = ExpiredIdTokenError("Token expired", None)
        verifier = FirebaseTokenVerifier()
        with self.assertRaises(ValueError):
            await verifier.verify("expired-jwt")

    @patch("firebase_admin.auth.verify_id_token")
    async def test_firebase_verifier_revoked_disabled_user(self, mock_verify):
        from firebase_admin.auth import RevokedIdTokenError
        mock_verify.side_effect = RevokedIdTokenError("Token revoked")
        verifier = FirebaseTokenVerifier()
        with self.assertRaises(ValueError):
            await verifier.verify("revoked-jwt")

    @patch("firebase_admin.auth.verify_id_token")
    async def test_firebase_verifier_provider_timeout_failure(self, mock_verify):
        mock_verify.side_effect = RuntimeError("Connection timed out")
        verifier = FirebaseTokenVerifier()
        with self.assertRaises(ValueError):
            await verifier.verify("timeout-jwt")

    async def test_app_startup_production_rejects_test_verifier(self):
        """Verify that startup fails if production or staging tries to use test verifier."""
        with patch.object(settings, "APP_ENV", "production"):
            with patch.object(settings, "AUTH_PROVIDER", "test"):
                with patch("api.auth.dependencies._verifier_instance", None):
                    with self.assertRaises(RuntimeError) as ctx:
                        get_token_verifier_dependency()
                    self.assertIn("Security Violation: Test authentication provider is prohibited", str(ctx.exception))

        with patch.object(settings, "APP_ENV", "staging"):
            with patch.object(settings, "AUTH_PROVIDER", "test"):
                with patch("api.auth.dependencies._verifier_instance", None):
                    with self.assertRaises(RuntimeError):
                        get_token_verifier_dependency()


if __name__ == "__main__":
    unittest.main()
