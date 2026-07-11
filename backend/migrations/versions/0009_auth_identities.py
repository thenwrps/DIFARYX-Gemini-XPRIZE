"""Phase 1A - Create external identity mapping table and bootstrap resolver

Revision ID: 0009
Revises: 0008
Create Date: 2026-07-11
"""
from alembic import op
import sqlalchemy as sa

revision = '0009'
down_revision = '0008'
branch_labels = None
depends_on = None

def upgrade() -> None:
    # 1. Assert required roles exist
    conn = op.get_bind()
    for role in ('difaryx_identity_resolver', 'difaryx_audit_writer'):
        res = conn.execute(sa.text("SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = :role"), {"role": role}).fetchone()
        if not res:
            raise RuntimeError(f"Required database role '{role}' is not provisioned in the environment. Please run the environment preparation/bootstrap first.")

    # 2. Create migration-specific updated-at trigger function
    op.execute("""
        CREATE FUNCTION identity.set_auth_identity_updated_at()
        RETURNS TRIGGER
        LANGUAGE plpgsql
        AS $$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $$;
    """)

    # 3. Create auth_identities table (composite PK enables multi-org; ON DELETE RESTRICT guards deletion)
    op.execute("""
        CREATE TABLE identity.auth_identities (
            provider_name       TEXT        NOT NULL,
            provider_subject    TEXT        NOT NULL,
            organization_id     UUID        NOT NULL,
            user_id             UUID        NOT NULL,
            created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (provider_name, provider_subject, organization_id),
            CONSTRAINT auth_identities_user_fk FOREIGN KEY (organization_id, user_id)
                REFERENCES identity.users(organization_id, id) ON DELETE RESTRICT,
            CONSTRAINT auth_identities_org_user_provider_uq UNIQUE (organization_id, user_id, provider_name),
            CONSTRAINT auth_identities_provider_name_normalized_chk CHECK (provider_name = pg_catalog.lower(pg_catalog.btrim(provider_name))),
            CONSTRAINT auth_identities_provider_subject_normalized_chk CHECK (provider_subject = pg_catalog.btrim(provider_subject)),
            CONSTRAINT auth_identities_provider_name_len_chk CHECK (pg_catalog.length(provider_name) BETWEEN 1 AND 100),
            CONSTRAINT auth_identities_provider_subject_len_chk CHECK (pg_catalog.length(provider_subject) BETWEEN 1 AND 512)
        )
    """)

    # 4. Add autoupdated_at trigger
    op.execute("""
        CREATE TRIGGER trg_auth_identities_updated_at
            BEFORE UPDATE ON identity.auth_identities
            FOR EACH ROW
            EXECUTE FUNCTION identity.set_auth_identity_updated_at();
    """)

    # 5. Enable RLS and FORCE RLS (direct SELECT denied from application roles)
    op.execute("ALTER TABLE identity.auth_identities ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE identity.auth_identities FORCE ROW LEVEL SECURITY")

    # 6. Create RLS Policies
    op.execute("""
        CREATE POLICY auth_identities_tenant_isolation ON identity.auth_identities
            USING (organization_id = identity.current_organization_id())
            WITH CHECK (organization_id = identity.current_organization_id())
    """)

    # 7. Correct catalog privilege: grant SELECT on project_memberships to difaryx_app
    op.execute("GRANT SELECT ON science.project_memberships TO difaryx_app")

    # 8. Create SECURITY DEFINER bootstrap resolution function
    op.execute("""
        CREATE FUNCTION identity.resolve_external_identity(
            p_provider_name TEXT,
            p_provider_subject TEXT
        )
        RETURNS TABLE (
            organization_id UUID,
            organization_name TEXT,
            user_id UUID,
            email TEXT,
            user_display_name TEXT,
            role identity.membership_role
        )
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = pg_catalog
        AS $$
        DECLARE
            v_provider_name TEXT;
            v_provider_subject TEXT;
        BEGIN
            -- Normalize inputs consistently
            v_provider_name := pg_catalog.lower(pg_catalog.btrim(p_provider_name));
            v_provider_subject := pg_catalog.btrim(p_provider_subject);

            -- Validation & Length checks
            IF v_provider_name IS NULL OR v_provider_name = '' THEN
                RAISE EXCEPTION 'provider_name cannot be null or empty';
            END IF;
            IF pg_catalog.length(v_provider_name) > 100 THEN
                RAISE EXCEPTION 'provider_name exceeds maximum length of 100';
            END IF;

            IF v_provider_subject IS NULL OR v_provider_subject = '' THEN
                RAISE EXCEPTION 'provider_subject cannot be null or empty';
            END IF;
            IF pg_catalog.length(v_provider_subject) > 512 THEN
                RAISE EXCEPTION 'provider_subject exceeds maximum length of 512';
            END IF;

            RETURN QUERY
            SELECT
                ai.organization_id,
                o.display_name AS organization_name,
                ai.user_id,
                u.email,
                u.display_name AS user_display_name,
                m.role
            FROM identity.auth_identities ai
            JOIN identity.users u ON u.organization_id = ai.organization_id AND u.id = ai.user_id
            JOIN identity.organizations o ON o.id = ai.organization_id
            JOIN identity.memberships m ON m.organization_id = ai.organization_id AND m.user_id = ai.user_id
            WHERE ai.provider_name = v_provider_name
              AND ai.provider_subject = v_provider_subject
              AND u.is_active = TRUE
              AND o.is_active = TRUE;
        END;
        $$;
    """)

    # 9. Handle resolver function ownership safely by temporarily granting schema CREATE
    op.execute("GRANT CREATE ON SCHEMA identity TO difaryx_identity_resolver")
    op.execute("ALTER FUNCTION identity.resolve_external_identity(TEXT, TEXT) OWNER TO difaryx_identity_resolver")
    op.execute("REVOKE CREATE ON SCHEMA identity FROM difaryx_identity_resolver")

    # 10. Execute privilege and SELECT grants for resolver function & role
    op.execute("REVOKE ALL ON FUNCTION identity.resolve_external_identity(TEXT, TEXT) FROM PUBLIC")
    op.execute("GRANT EXECUTE ON FUNCTION identity.resolve_external_identity(TEXT, TEXT) TO difaryx_app")

    op.execute("GRANT SELECT ON identity.auth_identities TO difaryx_identity_resolver")
    op.execute("GRANT SELECT ON identity.users TO difaryx_identity_resolver")
    op.execute("GRANT SELECT ON identity.organizations TO difaryx_identity_resolver")
    op.execute("GRANT SELECT ON identity.memberships TO difaryx_identity_resolver")

    # 11. Create SECURITY DEFINER audit appender function (with NULL-safe tenant context check)
    op.execute("""
        CREATE FUNCTION governance.append_audit_event(
            p_organization_id UUID,
            p_user_id UUID,
            p_action TEXT,
            p_resource_type TEXT,
            p_resource_id TEXT
        )
        RETURNS UUID
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = pg_catalog
        AS $$
        DECLARE
            v_audit_id UUID;
            v_action TEXT;
            v_resource_type TEXT;
            v_resource_id TEXT;
            v_current_organization_id UUID;
            v_current_user_id UUID;
        BEGIN
            v_action := pg_catalog.btrim(p_action);
            v_resource_type := pg_catalog.btrim(p_resource_type);
            v_resource_id := pg_catalog.btrim(p_resource_id);

            IF p_organization_id IS NULL THEN
                RAISE EXCEPTION 'organization_id cannot be null';
            END IF;
            IF p_user_id IS NULL THEN
                RAISE EXCEPTION 'user_id cannot be null';
            END IF;

            IF v_action IS NULL OR v_action = '' THEN
                RAISE EXCEPTION 'action cannot be null or empty';
            END IF;
            IF pg_catalog.length(v_action) > 100 THEN
                RAISE EXCEPTION 'action exceeds maximum length of 100';
            END IF;
            -- Validate format: 'resource.operation'
            IF v_action !~ '^[a-z_]+\\.[a-z_]+$' THEN
                RAISE EXCEPTION 'action format is invalid (expected: resource.operation)';
            END IF;

            IF v_resource_type IS NULL OR v_resource_type = '' THEN
                RAISE EXCEPTION 'resource_type cannot be null or empty';
            END IF;
            IF pg_catalog.length(v_resource_type) > 100 THEN
                RAISE EXCEPTION 'resource_type exceeds maximum length of 100';
            END IF;

            IF v_resource_id IS NULL OR v_resource_id = '' THEN
                RAISE EXCEPTION 'resource_id cannot be null or empty';
            END IF;
            IF pg_catalog.length(v_resource_id) > 255 THEN
                RAISE EXCEPTION 'resource_id exceeds maximum length of 255';
            END IF;

            -- Retrieve current context
            v_current_organization_id := identity.current_organization_id();
            v_current_user_id := identity.current_user_id();

            -- NULL-safe validations
            IF v_current_organization_id IS NULL THEN
                RAISE EXCEPTION USING
                    ERRCODE = '42501',
                    MESSAGE = 'tenant context is required';
            END IF;

            IF v_current_user_id IS NULL THEN
                RAISE EXCEPTION USING
                    ERRCODE = '42501',
                    MESSAGE = 'user context is required';
            END IF;

            IF p_organization_id IS DISTINCT FROM v_current_organization_id THEN
                RAISE EXCEPTION USING
                    ERRCODE = '42501',
                    MESSAGE = 'organization context mismatch';
            END IF;

            IF p_user_id IS DISTINCT FROM v_current_user_id THEN
                RAISE EXCEPTION USING
                    ERRCODE = '42501',
                    MESSAGE = 'user context mismatch';
            END IF;

            INSERT INTO governance.audit_log (
                organization_id,
                actor_user_id,
                action,
                resource_type,
                resource_id
            ) VALUES (
                p_organization_id,
                p_user_id,
                v_action,
                v_resource_type,
                v_resource_id
            ) RETURNING id INTO v_audit_id;

            RETURN v_audit_id;
        END;
        $$;
    """)

    # 12. Handle audit function ownership safely by temporarily granting schema CREATE
    op.execute("GRANT CREATE ON SCHEMA governance TO difaryx_audit_writer")
    op.execute("ALTER FUNCTION governance.append_audit_event(UUID, UUID, TEXT, TEXT, TEXT) OWNER TO difaryx_audit_writer")
    op.execute("REVOKE CREATE ON SCHEMA governance FROM difaryx_audit_writer")

    # 13. Execute privilege and INSERT grants for audit function & writer role
    op.execute("REVOKE ALL ON FUNCTION governance.append_audit_event(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC")
    op.execute("GRANT EXECUTE ON FUNCTION governance.append_audit_event(UUID, UUID, TEXT, TEXT, TEXT) TO difaryx_app")

    op.execute("GRANT INSERT ON governance.audit_log TO difaryx_audit_writer")
    op.execute("GRANT SELECT (id) ON governance.audit_log TO difaryx_audit_writer")
    op.execute("GRANT SELECT ON public.alembic_version TO difaryx_app")

    # Audit writer context helper functions execution rights
    op.execute("GRANT EXECUTE ON FUNCTION identity.current_organization_id() TO difaryx_audit_writer")
    op.execute("GRANT EXECUTE ON FUNCTION identity.current_user_id() TO difaryx_audit_writer")

    # 14. Revoke direct write/read mapping access on the table from difaryx_app
    op.execute("REVOKE ALL ON identity.auth_identities FROM PUBLIC")
    op.execute("REVOKE ALL ON identity.auth_identities FROM difaryx_app")

def downgrade() -> None:
    # Downgrade in strict dependency order (no CASCADE)
    op.execute("REVOKE SELECT ON public.alembic_version FROM difaryx_app")
    op.execute("REVOKE EXECUTE ON FUNCTION identity.current_organization_id() FROM difaryx_audit_writer")
    op.execute("REVOKE EXECUTE ON FUNCTION identity.current_user_id() FROM difaryx_audit_writer")

    op.execute("REVOKE EXECUTE ON FUNCTION governance.append_audit_event(UUID, UUID, TEXT, TEXT, TEXT) FROM difaryx_app")
    op.execute("REVOKE SELECT (id) ON governance.audit_log FROM difaryx_audit_writer")
    op.execute("REVOKE INSERT ON governance.audit_log FROM difaryx_audit_writer")
    op.execute("DROP FUNCTION governance.append_audit_event(UUID, UUID, TEXT, TEXT, TEXT)")

    op.execute("REVOKE EXECUTE ON FUNCTION identity.resolve_external_identity(TEXT, TEXT) FROM difaryx_app")
    op.execute("REVOKE SELECT ON identity.auth_identities FROM difaryx_identity_resolver")
    op.execute("REVOKE SELECT ON identity.users FROM difaryx_identity_resolver")
    op.execute("REVOKE SELECT ON identity.organizations FROM difaryx_identity_resolver")
    op.execute("REVOKE SELECT ON identity.memberships FROM difaryx_identity_resolver")
    op.execute("DROP FUNCTION identity.resolve_external_identity(TEXT, TEXT)")

    op.execute("REVOKE SELECT ON science.project_memberships FROM difaryx_app")

    op.execute("DROP POLICY IF EXISTS auth_identities_tenant_isolation ON identity.auth_identities")
    op.execute("DROP TRIGGER IF EXISTS trg_auth_identities_updated_at ON identity.auth_identities")
    op.execute("DROP TABLE IF EXISTS identity.auth_identities")
    op.execute("DROP FUNCTION IF EXISTS identity.set_auth_identity_updated_at()")
