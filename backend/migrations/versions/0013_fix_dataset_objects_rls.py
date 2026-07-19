"""Fix dataset_objects RLS insert policy infinite recursion

Revision ID: 0013
Revises: 0012
Create Date: 2026-07-15
"""
from alembic import op


revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop the recursive insert policy
    op.execute("DROP POLICY IF EXISTS dataset_objects_insert ON science.dataset_objects")

    # WARNING: Do NOT change the execution order in finalize_upload!
    # The insert policy checks `us.session_status = 'uploaded'`.
    # Therefore, complete_finalize (which sets status = 'finalized') must NOT be executed before
    # DatasetObjectRepository.create_dataset_object.
    # Recreate the insert policy without the recursive NOT EXISTS check on dataset_objects itself.
    # The unique constraint dataset_objects_one_original_per_dataset_uq already guarantees that
    # only one original dataset object can exist per dataset.
    op.execute("""
        CREATE POLICY dataset_objects_insert ON science.dataset_objects
            FOR INSERT
            WITH CHECK (
                organization_id = identity.current_organization_id()
                AND EXISTS (
                    SELECT 1 FROM science.upload_sessions us
                    WHERE us.organization_id = dataset_objects.organization_id
                      AND us.dataset_id = dataset_objects.dataset_id
                      AND us.id = dataset_objects.source_upload_session_id
                      AND us.session_status = 'uploaded'
                      AND us.object_key = dataset_objects.object_key
                      AND us.storage_provider = dataset_objects.storage_provider
                      AND us.expected_byte_size = dataset_objects.byte_size
                      AND (
                          EXISTS (
                              SELECT 1 FROM identity.memberships m
                              WHERE m.organization_id = us.organization_id
                                AND m.user_id = identity.current_user_id()
                                AND m.role IN ('owner', 'admin')
                          )
                          OR us.created_by = identity.current_user_id()
                      )
                )
                AND object_role = 'original'
            )
    """)


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS dataset_objects_insert ON science.dataset_objects")

    # Restore the original recursive policy
    op.execute("""
        CREATE POLICY dataset_objects_insert ON science.dataset_objects
            FOR INSERT
            WITH CHECK (
                organization_id = identity.current_organization_id()
                AND EXISTS (
                    SELECT 1 FROM science.upload_sessions us
                    WHERE us.organization_id = dataset_objects.organization_id
                      AND us.dataset_id = dataset_objects.dataset_id
                      AND us.id = dataset_objects.source_upload_session_id
                      AND us.session_status = 'uploaded'
                      AND us.object_key = dataset_objects.object_key
                      AND us.storage_provider = dataset_objects.storage_provider
                      AND us.expected_byte_size = dataset_objects.byte_size
                      AND (
                          EXISTS (
                              SELECT 1 FROM identity.memberships m
                              WHERE m.organization_id = us.organization_id
                                AND m.user_id = identity.current_user_id()
                              AND m.role IN ('owner', 'admin')
                          )
                          OR us.created_by = identity.current_user_id()
                      )
                )
                AND object_role = 'original'
                AND NOT EXISTS (
                    SELECT 1 FROM science.dataset_objects existing
                    WHERE existing.organization_id = dataset_objects.organization_id
                      AND existing.dataset_id = dataset_objects.dataset_id
                      AND existing.object_role = 'original'
                )
            )
    """)
