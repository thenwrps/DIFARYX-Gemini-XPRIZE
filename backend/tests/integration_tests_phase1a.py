"""
DIFARYX Phase 1A — Integration and Security Test Suite
======================================================
Tests all resolver, audit-write, and privilege boundary assertions.
"""

import os
import sys
import unittest
import psycopg2
from urllib.parse import urlparse

# Load required database connection URLs
BOOTSTRAP_URL = os.getenv("DIFARYX_BOOTSTRAP_DATABASE_URL")
API_TEST_URL = os.getenv("DIFARYX_API_TEST_DATABASE_URL")

if not BOOTSTRAP_URL or not API_TEST_URL:
    print("[-] Error: Missing BOOTSTRAP_URL or API_TEST_URL environment variables.")
    sys.exit(1)


class TestPhase1ASecurity(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        # Superuser connection
        cls.su_conn = psycopg2.connect(BOOTSTRAP_URL)
        cls.su_conn.autocommit = True
        cls.su_cur = cls.su_conn.cursor()

        # API role connection (runs as difaryx_api_test in group difaryx_app)
        cls.api_conn = psycopg2.connect(API_TEST_URL)
        cls.api_conn.autocommit = True
        cls.api_cur = cls.api_conn.cursor()

    @classmethod
    def tearDownClass(cls):
        cls.su_cur.close()
        cls.su_conn.close()
        cls.api_cur.close()
        cls.api_conn.close()

    def setUp(self):
        # Clean auth_identities and specific test records before each test
        self.su_cur.execute("DELETE FROM identity.auth_identities")
        test_user_ids = ('f3333333-3333-3333-3333-333333333333', 'f4444444-4444-4444-4444-444444444444')
        test_org_ids = ('f1111111-1111-1111-1111-111111111111', 'f2222222-2222-2222-2222-222222222222')

        self.su_cur.execute("DELETE FROM identity.memberships WHERE user_id IN %s", (test_user_ids,))
        self.su_cur.execute("DELETE FROM identity.users WHERE id IN %s", (test_user_ids,))
        self.su_cur.execute("DELETE FROM identity.organizations WHERE id IN %s", (test_org_ids,))

    # ─────────────────────────────────────────────────────────────────────────
    # 1. Dedicated Role Catalog Assertions
    # ─────────────────────────────────────────────────────────────────────────

    def test_resolver_role_lockdown(self):
        """Assert that difaryx_identity_resolver is fully locked down and owns only the resolver function."""
        # 1. NOLOGIN, BYPASSRLS, not superuser, cannot create db/role
        self.su_cur.execute("""
            SELECT rolcanlogin, rolsuper, rolcreaterole, rolcreatedb, rolbypassrls
            FROM pg_roles WHERE rolname = 'difaryx_identity_resolver'
        """)
        row = self.su_cur.fetchone()
        self.assertIsNotNone(row)
        rolcanlogin, rolsuper, rolcreaterole, rolcreatedb, rolbypassrls = row
        self.assertFalse(rolcanlogin)
        self.assertFalse(rolsuper)
        self.assertFalse(rolcreaterole)
        self.assertFalse(rolcreatedb)
        self.assertTrue(rolbypassrls)

        # 2. Has no membership in app/owner/admin roles
        self.su_cur.execute("""
            SELECT count(*) FROM pg_auth_members m
            JOIN pg_roles r1 ON r1.oid = m.roleid
            JOIN pg_roles r2 ON r2.oid = m.member
            WHERE r2.rolname = 'difaryx_identity_resolver'
              AND r1.rolname IN ('difaryx_app', 'difaryx_owner', 'difaryx_admin_test')
        """)
        self.assertEqual(self.su_cur.fetchone()[0], 0)

        # 3. Owns ONLY the resolve_external_identity function
        self.su_cur.execute("""
            SELECT proname FROM pg_proc
            WHERE proowner = (SELECT oid FROM pg_roles WHERE rolname = 'difaryx_identity_resolver')
        """)
        procs = [r[0] for r in self.su_cur.fetchall()]
        self.assertEqual(procs, ['resolve_external_identity'])

        # 4. Owns no relations/tables
        self.su_cur.execute("""
            SELECT count(*) FROM pg_class
            WHERE relowner = (SELECT oid FROM pg_roles WHERE rolname = 'difaryx_identity_resolver')
        """)
        self.assertEqual(self.su_cur.fetchone()[0], 0)

    def test_audit_writer_role_lockdown(self):
        """Assert that difaryx_audit_writer is fully locked down and does not bypass RLS."""
        self.su_cur.execute("""
            SELECT rolcanlogin, rolsuper, rolcreaterole, rolcreatedb, rolbypassrls
            FROM pg_roles WHERE rolname = 'difaryx_audit_writer'
        """)
        row = self.su_cur.fetchone()
        self.assertIsNotNone(row)
        rolcanlogin, rolsuper, rolcreaterole, rolcreatedb, rolbypassrls = row
        self.assertFalse(rolcanlogin)
        self.assertFalse(rolsuper)
        self.assertFalse(rolcreaterole)
        self.assertFalse(rolcreatedb)
        self.assertFalse(rolbypassrls)  # No BYPASSRLS

        # Owns only append_audit_event
        self.su_cur.execute("""
            SELECT proname FROM pg_proc
            WHERE proowner = (SELECT oid FROM pg_roles WHERE rolname = 'difaryx_audit_writer')
        """)
        procs = [r[0] for r in self.su_cur.fetchall()]
        self.assertEqual(procs, ['append_audit_event'])

    # ─────────────────────────────────────────────────────────────────────────
    # 2. Database Privilege Assertions
    # ─────────────────────────────────────────────────────────────────────────

    def test_direct_table_access_denied(self):
        """Assert that difaryx_app cannot directly query auth_identities or write to audit_log."""
        # 1. Direct SELECT on auth_identities fails
        with self.assertRaises(psycopg2.errors.InsufficientPrivilege):
            self.api_cur.execute("SELECT * FROM identity.auth_identities")

        # 2. Direct INSERT on governance.audit_log fails
        with self.assertRaises(psycopg2.errors.InsufficientPrivilege):
            self.api_cur.execute("""
                INSERT INTO governance.audit_log (organization_id, actor_user_id, action, resource_type, resource_id)
                VALUES ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', 'p.c', 'proj', 'p1')
            """)

        # 3. SET ROLE difaryx_identity_resolver/difaryx_audit_writer fails
        with self.assertRaises(psycopg2.errors.InsufficientPrivilege):
            self.api_cur.execute("SET ROLE difaryx_identity_resolver")
        with self.assertRaises(psycopg2.errors.InsufficientPrivilege):
            self.api_cur.execute("SET ROLE difaryx_audit_writer")

    def test_public_execute_denied(self):
        """Assert that PUBLIC role cannot execute the resolver or audit functions."""
        # Check resolver function
        self.su_cur.execute("""
            SELECT has_function_privilege('public', 'identity.resolve_external_identity(text, text)', 'execute')
        """)
        self.assertFalse(self.su_cur.fetchone()[0])

        # Check audit function
        self.su_cur.execute("""
            SELECT has_function_privilege('public', 'governance.append_audit_event(uuid, uuid, text, text, text)', 'execute')
        """)
        self.assertFalse(self.su_cur.fetchone()[0])

    # ─────────────────────────────────────────────────────────────────────────
    # 3. Resolver Function Behavioral Assertions
    # ─────────────────────────────────────────────────────────────────────────

    def test_resolver_lookup_and_normalization(self):
        """Verify normalization, whitespace trimming, multi-org mapping, and inactive user/org filtering."""
        # 1. Seed Organizations
        org1_id = 'f1111111-1111-1111-1111-111111111111'
        org2_id = 'f2222222-2222-2222-2222-222222222222'
        self.su_cur.execute("INSERT INTO identity.organizations (id, slug, display_name) VALUES (%s, 'org1', 'Org 1')", (org1_id,))
        self.su_cur.execute("INSERT INTO identity.organizations (id, slug, display_name) VALUES (%s, 'org2', 'Org 2')", (org2_id,))

        # 2. Seed Users
        u1_id = 'f3333333-3333-3333-3333-333333333333'
        u2_id = 'f4444444-4444-4444-4444-444444444444'
        self.su_cur.execute("INSERT INTO identity.users (organization_id, id, email, display_name) VALUES (%s, %s, 'u1@org1.com', 'User 1')", (org1_id, u1_id))
        self.su_cur.execute("INSERT INTO identity.users (organization_id, id, email, display_name) VALUES (%s, %s, 'u2@org2.com', 'User 2')", (org2_id, u2_id))

        # 3. Seed Memberships
        self.su_cur.execute("INSERT INTO identity.memberships (organization_id, user_id, role) VALUES (%s, %s, 'member')", (org1_id, u1_id))
        self.su_cur.execute("INSERT INTO identity.memberships (organization_id, user_id, role) VALUES (%s, %s, 'admin')", (org2_id, u2_id))

        # 4. Seed Auth Identities (Google Account Mapping to both orgs)
        self.su_cur.execute("INSERT INTO identity.auth_identities (provider_name, provider_subject, organization_id, user_id) VALUES ('firebase', 'subject-abc', %s, %s)", (org1_id, u1_id))
        self.su_cur.execute("INSERT INTO identity.auth_identities (provider_name, provider_subject, organization_id, user_id) VALUES ('firebase', 'subject-abc', %s, %s)", (org2_id, u2_id))

        # Test Case A: Valid mapping retrieval and lowercase normalization
        self.api_cur.execute("SELECT * FROM identity.resolve_external_identity('  Firebase  ', '  subject-abc  ')")
        results = self.api_cur.fetchall()
        self.assertEqual(len(results), 2)

        # Verify columns: (organization_id, organization_name, user_id, email, user_display_name, role)
        orgs_mapped = {str(r[0]): r for r in results}
        self.assertIn(org1_id, orgs_mapped)
        self.assertIn(org2_id, orgs_mapped)

        # Check details
        r1 = orgs_mapped[org1_id]
        self.assertEqual(r1[1], 'Org 1')
        self.assertEqual(r1[2], u1_id)
        self.assertEqual(r1[3], 'u1@org1.com')
        self.assertEqual(r1[4], 'User 1')
        self.assertEqual(r1[5], 'member')

        # Test Case B: Subject case sensitivity check
        self.api_cur.execute("SELECT * FROM identity.resolve_external_identity('firebase', 'SUBJECT-ABC')")
        self.assertEqual(len(self.api_cur.fetchall()), 0)

        # Test Case C: Overlength parameters fail validation
        with self.assertRaises(psycopg2.errors.RaiseException) as ctx:
            self.api_cur.execute("SELECT * FROM identity.resolve_external_identity(%s, 'subject')", ('a' * 101,))
        self.assertIn("provider_name exceeds maximum length", str(ctx.exception))

        # Test Case D: Inactive User filters out the mapping
        self.su_cur.execute("UPDATE identity.users SET is_active = FALSE WHERE id = %s", (u1_id,))
        self.api_cur.execute("SELECT * FROM identity.resolve_external_identity('firebase', 'subject-abc')")
        results_after_inactive = self.api_cur.fetchall()
        self.assertEqual(len(results_after_inactive), 1)
        self.assertEqual(str(results_after_inactive[0][0]), org2_id)

    # ─────────────────────────────────────────────────────────────────────────
    # 4. Audit Function Security Assertions
    # ─────────────────────────────────────────────────────────────────────────

    def test_audit_append_checks_and_context_mismatch(self):
        """Assert that append_audit_event checks context presence and prevents mismatch."""
        org_id = 'f1111111-1111-1111-1111-111111111111'
        user_id = 'f3333333-3333-3333-3333-333333333333'
        self.su_cur.execute("INSERT INTO identity.organizations (id, slug, display_name) VALUES (%s, 'org1', 'Org 1')", (org_id,))
        self.su_cur.execute("INSERT INTO identity.users (organization_id, id, email, display_name) VALUES (%s, %s, 'u1@org1.com', 'User 1')", (org_id, user_id))

        # 1. Execution without context fails (raises 42501 insufficient_privilege)
        with self.assertRaises(psycopg2.errors.InsufficientPrivilege) as ctx:
            self.api_cur.execute("SELECT governance.append_audit_event(%s, %s, 'project.created', 'project', 'p1')", (org_id, user_id))
        self.assertIn("tenant context is required", str(ctx.exception))

        # 2. Execution with mismatched context fails (raises 42501 insufficient_privilege)
        self.api_conn.autocommit = False
        try:
            self.api_cur.execute("SELECT set_config('app.organization_id', %s, true)", (org_id,))
            self.api_cur.execute("SELECT set_config('app.user_id', %s, true)", (user_id,))

            with self.assertRaises(psycopg2.errors.InsufficientPrivilege) as ctx:
                mismatched_org = 'f2222222-2222-2222-2222-222222222222'
                self.api_cur.execute("SELECT governance.append_audit_event(%s, %s, 'project.created', 'project', 'p1')", (mismatched_org, user_id))
            self.assertIn("organization context mismatch", str(ctx.exception))
        finally:
            self.api_conn.rollback()
            self.api_conn.autocommit = True

        # 3. Execution with invalid action format fails (raises P0001 raise_exception)
        self.api_conn.autocommit = False
        try:
            self.api_cur.execute("SELECT set_config('app.organization_id', %s, true)", (org_id,))
            self.api_cur.execute("SELECT set_config('app.user_id', %s, true)", (user_id,))

            with self.assertRaises(psycopg2.errors.RaiseException) as ctx:
                self.api_cur.execute("SELECT governance.append_audit_event(%s, %s, 'project_created', 'project', 'p1')", (org_id, user_id))
            self.assertIn("action format is invalid", str(ctx.exception))
        finally:
            self.api_conn.rollback()
            self.api_conn.autocommit = True

        # 4. Correct context works and writes the record
        self.api_conn.autocommit = False
        try:
            self.api_cur.execute("SELECT set_config('app.organization_id', %s, true)", (org_id,))
            self.api_cur.execute("SELECT set_config('app.user_id', %s, true)", (user_id,))

            self.api_cur.execute("SELECT governance.append_audit_event(%s, %s, 'project.created', 'project', 'p1')", (org_id, user_id))
            audit_id = self.api_cur.fetchone()[0]
            self.assertIsNotNone(audit_id)
        finally:
            self.api_conn.commit()
            self.api_conn.autocommit = True


if __name__ == '__main__':
    unittest.main()
