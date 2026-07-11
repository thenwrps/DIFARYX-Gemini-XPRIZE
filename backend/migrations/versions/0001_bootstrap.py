"""Phase 0 - bootstrap: extensions, schemas, RLS infrastructure

Revision ID: 0001
Revises: 
Create Date: 2026-07-11
"""
from alembic import op
import sqlalchemy as sa

revision = '0001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Extensions ──────────────────────────────────────────────────────────
    op.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')
    op.execute('CREATE EXTENSION IF NOT EXISTS pgcrypto')
    op.execute('CREATE EXTENSION IF NOT EXISTS btree_gist')

    # ── Application schemas ──────────────────────────────────────────────────
    op.execute('CREATE SCHEMA IF NOT EXISTS identity')
    op.execute('CREATE SCHEMA IF NOT EXISTS science')
    op.execute('CREATE SCHEMA IF NOT EXISTS governance')
    op.execute('CREATE SCHEMA IF NOT EXISTS outbox')

    # ── RLS helper: current_organization_id ─────────────────────────────────
    op.execute("""
        CREATE OR REPLACE FUNCTION identity.current_organization_id()
        RETURNS UUID
        LANGUAGE sql STABLE
        AS $$
            SELECT NULLIF(current_setting('app.organization_id', TRUE), '')::UUID
        $$
    """)

    # ── Enum types ───────────────────────────────────────────────────────────
    op.execute("""
        CREATE TYPE identity.membership_role AS ENUM
            ('owner', 'admin', 'member', 'viewer')
    """)
    op.execute("""
        CREATE TYPE science.run_status AS ENUM
            ('pending', 'queued', 'running', 'completed', 'failed', 'cancelled')
    """)
    op.execute("""
        CREATE TYPE science.evidence_state AS ENUM
            ('draft', 'submitted', 'approved', 'rejected', 'superseded', 'withdrawn')
    """)
    op.execute("""
        CREATE TYPE science.artifact_kind AS ENUM
            ('raw_signal', 'processed_signal', 'stage_result',
             'interpretation', 'report', 'reference_snapshot')
    """)
    op.execute("""
        CREATE TYPE governance.outbox_status AS ENUM
            ('pending', 'locked', 'delivered', 'failed', 'dead')
    """)
    op.execute("""
        CREATE TYPE science.technique_code AS ENUM
            ('xrd', 'xps', 'ftir', 'raman', 'multi', 'unknown')
    """)
    op.execute("""
        CREATE TYPE science.ai_consent_scope AS ENUM
            ('none', 'interpretation_only', 'full_reasoning')
    """)


def downgrade() -> None:
    op.execute('DROP SCHEMA IF EXISTS outbox CASCADE')
    op.execute('DROP SCHEMA IF EXISTS governance CASCADE')
    op.execute('DROP SCHEMA IF EXISTS science CASCADE')
    op.execute('DROP SCHEMA IF EXISTS identity CASCADE')
    op.execute('DROP TYPE IF EXISTS science.ai_consent_scope')
    op.execute('DROP TYPE IF EXISTS science.technique_code')
    op.execute('DROP TYPE IF EXISTS governance.outbox_status')
    op.execute('DROP TYPE IF EXISTS science.artifact_kind')
    op.execute('DROP TYPE IF EXISTS science.evidence_state')
    op.execute('DROP TYPE IF EXISTS science.run_status')
    op.execute('DROP TYPE IF EXISTS identity.membership_role')
