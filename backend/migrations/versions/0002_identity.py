"""Phase 0 - identity: organizations, users, memberships, API keys

Revision ID: 0002
Revises: 0001
Create Date: 2026-07-11
"""
from alembic import op
import sqlalchemy as sa

revision = '0002'
down_revision = '0001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── organizations ────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE identity.organizations (
            id              UUID        NOT NULL DEFAULT uuid_generate_v4(),
            slug            TEXT        NOT NULL,
            display_name    TEXT        NOT NULL,
            plan_tier       TEXT        NOT NULL DEFAULT 'free',
            is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (id),
            CONSTRAINT organizations_slug_uq UNIQUE (slug)
        )
    """)

    # ── users ────────────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE identity.users (
            id              UUID        NOT NULL DEFAULT uuid_generate_v4(),
            organization_id UUID        NOT NULL REFERENCES identity.organizations(id) ON DELETE RESTRICT,
            email           TEXT        NOT NULL,
            display_name    TEXT,
            password_hash   TEXT,
            is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (organization_id, id),
            CONSTRAINT users_email_org_uq UNIQUE (organization_id, email)
        )
    """)

    # ── memberships ──────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE identity.memberships (
            id              UUID        NOT NULL DEFAULT uuid_generate_v4(),
            organization_id UUID        NOT NULL REFERENCES identity.organizations(id) ON DELETE RESTRICT,
            user_id         UUID        NOT NULL,
            role            identity.membership_role NOT NULL DEFAULT 'member',
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (organization_id, id),
            CONSTRAINT memberships_user_org_uq UNIQUE (organization_id, user_id),
            CONSTRAINT memberships_user_fk FOREIGN KEY (organization_id, user_id)
                REFERENCES identity.users(organization_id, id) ON DELETE RESTRICT
        )
    """)

    # ── api_keys ─────────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE identity.api_keys (
            id              UUID        NOT NULL DEFAULT uuid_generate_v4(),
            organization_id UUID        NOT NULL REFERENCES identity.organizations(id) ON DELETE RESTRICT,
            user_id         UUID        NOT NULL,
            key_hash        TEXT        NOT NULL,
            label           TEXT,
            expires_at      TIMESTAMPTZ,
            revoked_at      TIMESTAMPTZ,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (organization_id, id),
            CONSTRAINT api_keys_hash_uq UNIQUE (key_hash),
            CONSTRAINT api_keys_user_fk FOREIGN KEY (organization_id, user_id)
                REFERENCES identity.users(organization_id, id) ON DELETE RESTRICT
        )
    """)

    # ── RLS on identity tables ───────────────────────────────────────────────
    for tbl in ('users', 'memberships', 'api_keys'):
        op.execute(f'ALTER TABLE identity.{tbl} ENABLE ROW LEVEL SECURITY')
        op.execute(f'ALTER TABLE identity.{tbl} FORCE ROW LEVEL SECURITY')
        op.execute(f"""
            CREATE POLICY {tbl}_tenant_isolation ON identity.{tbl}
                USING (organization_id = identity.current_organization_id())
        """)

    # ── Indexes ──────────────────────────────────────────────────────────────
    op.execute('CREATE INDEX ON identity.users (organization_id, email)')
    op.execute('CREATE INDEX ON identity.api_keys (key_hash)')


def downgrade() -> None:
    op.execute('DROP TABLE IF EXISTS identity.api_keys CASCADE')
    op.execute('DROP TABLE IF EXISTS identity.memberships CASCADE')
    op.execute('DROP TABLE IF EXISTS identity.users CASCADE')
    op.execute('DROP TABLE IF EXISTS identity.organizations CASCADE')
