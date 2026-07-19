"""Add upload worker reclaim expired across orgs security definer function

Revision ID: 0014
Revises: 0013
Create Date: 2026-07-15
"""
from alembic import op
import sqlalchemy as sa


revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Grant permissions to the bypass role
    op.execute("GRANT USAGE ON SCHEMA governance TO difaryx_validation_worker_bypass")
    op.execute("GRANT SELECT, UPDATE ON science.upload_sessions TO difaryx_validation_worker_bypass")
    op.execute("GRANT SELECT, UPDATE ON governance.quota_reservations TO difaryx_validation_worker_bypass")

    # 1. Create science.upload_worker_reclaim_expired_across_orgs()
    op.execute("""
        CREATE OR REPLACE FUNCTION science.upload_worker_reclaim_expired_across_orgs()
        RETURNS TABLE (
            organization_id        UUID,
            id                     UUID,
            quota_reservation_id   UUID,
            object_key             TEXT
        )
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = pg_catalog, science
        AS $$
        BEGIN
            RETURN QUERY
            UPDATE science.upload_sessions
            SET session_status = 'expired'::science.upload_session_status,
                updated_at = NOW()
            WHERE upload_sessions.id IN (
                SELECT us.id
                FROM science.upload_sessions us
                WHERE us.session_status IN (
                    'allocated'::science.upload_session_status,
                    'uploading'::science.upload_session_status,
                    'uploaded'::science.upload_session_status
                )
                AND us.expires_at < NOW()
                FOR UPDATE SKIP LOCKED
            )
            RETURNING upload_sessions.organization_id, upload_sessions.id, upload_sessions.quota_reservation_id, upload_sessions.object_key;
        END;
        $$;
    """)

    # 2. Create science.upload_worker_get_active_keys_across_orgs()
    op.execute("""
        CREATE OR REPLACE FUNCTION science.upload_worker_get_active_keys_across_orgs()
        RETURNS TABLE (object_key TEXT)
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = pg_catalog, science
        AS $$
        BEGIN
            RETURN QUERY
            SELECT us.object_key::TEXT
            FROM science.upload_sessions us
            WHERE us.session_status IN (
                'allocated'::science.upload_session_status,
                'uploading'::science.upload_session_status,
                'uploaded'::science.upload_session_status
            );
        END;
        $$;
    """)

    # 3. Create science.upload_worker_get_unreleased_reservations_across_orgs()
    op.execute("""
        CREATE OR REPLACE FUNCTION science.upload_worker_get_unreleased_reservations_across_orgs()
        RETURNS TABLE (
            organization_id        UUID,
            quota_reservation_id   UUID,
            session_id             UUID
        )
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = pg_catalog, science
        AS $$
        BEGIN
            RETURN QUERY
            SELECT us.organization_id, us.quota_reservation_id, us.id
            FROM science.upload_sessions us
            JOIN governance.quota_reservations qr ON qr.id = us.quota_reservation_id
            WHERE us.session_status IN (
                'expired'::science.upload_session_status,
                'failed'::science.upload_session_status,
                'cancelled'::science.upload_session_status
            )
            AND qr.status = 'reserved'::governance.quota_reservation_status;
        END;
        $$;
    """)

    # Alter owners to bypass role
    op.execute("ALTER FUNCTION science.upload_worker_reclaim_expired_across_orgs() OWNER TO difaryx_validation_worker_bypass")
    op.execute("ALTER FUNCTION science.upload_worker_get_active_keys_across_orgs() OWNER TO difaryx_validation_worker_bypass")
    op.execute("ALTER FUNCTION science.upload_worker_get_unreleased_reservations_across_orgs() OWNER TO difaryx_validation_worker_bypass")

    # Grant execute to validation worker role only
    for func in [
        "science.upload_worker_reclaim_expired_across_orgs()",
        "science.upload_worker_get_active_keys_across_orgs()",
        "science.upload_worker_get_unreleased_reservations_across_orgs()"
    ]:
        op.execute(f"GRANT EXECUTE ON FUNCTION {func} TO difaryx_validation_worker")
        op.execute(f"REVOKE EXECUTE ON FUNCTION {func} FROM PUBLIC")


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS science.upload_worker_get_unreleased_reservations_across_orgs()")
    op.execute("DROP FUNCTION IF EXISTS science.upload_worker_get_active_keys_across_orgs()")
    op.execute("DROP FUNCTION IF EXISTS science.upload_worker_reclaim_expired_across_orgs()")
    op.execute("REVOKE SELECT, UPDATE ON governance.quota_reservations FROM difaryx_validation_worker_bypass")
    op.execute("REVOKE SELECT, UPDATE ON science.upload_sessions FROM difaryx_validation_worker_bypass")
    op.execute("REVOKE USAGE ON SCHEMA governance FROM difaryx_validation_worker_bypass")
