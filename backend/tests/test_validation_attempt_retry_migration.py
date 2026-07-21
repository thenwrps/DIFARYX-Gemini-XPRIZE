"""Transactional characterization for the 0016 legacy retry backfill.

This test is intentionally opt-in through DATABASE_URL.  It runs the
backfill inside a transaction and rolls the fixture changes back, so it does
not mutate a shared development database.
"""

import os
import sys
import uuid
import unittest
from importlib import import_module
from pathlib import Path

import psycopg2

TESTS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(TESTS_DIR.parents[1] / "backend"))
sys.path.insert(0, str(TESTS_DIR.parents[1] / "server" / "python"))

from test_validation_worker_retry_exhaustion import (  # noqa: E402
    cleanup_test_data,
    seed_test_data,
)

_LEGACY_RETRY_BACKFILL_SQL = import_module(
    "migrations.versions.0016_validation_attempt_retry_fencing"
)._LEGACY_RETRY_BACKFILL_SQL


DATABASE_URL = os.getenv("DATABASE_URL")


@unittest.skipUnless(
    DATABASE_URL,
    "DATABASE_URL is required for the disposable transactional migration test",
)
class TestValidationAttemptRetryMigration(unittest.TestCase):
    def test_legacy_retry_backfill_is_idempotent(self):
        conn = psycopg2.connect(DATABASE_URL)
        org_id = str(uuid.uuid4())
        user_id = str(uuid.uuid4())
        dataset_id = None
        try:
            content = b"1.0 5.0\n2.0 10.0\n"
            dataset_id, object_id = seed_test_data(
                conn,
                f"test-fixtures/migration-{uuid.uuid4().hex}.csv",
                "a" * 64,
                len(content),
                org_id=org_id,
                user_id=user_id,
            )
            conn.rollback()
            cur = conn.cursor()
            cur.execute("BEGIN")
            cur.execute("ALTER TABLE science.validation_attempts DROP CONSTRAINT IF EXISTS validation_attempts_completed_consistency")
            cur.execute(
                "UPDATE science.datasets SET dataset_status = 'validating' WHERE organization_id = %s::uuid AND id = %s::uuid",
                (org_id, dataset_id),
            )
            cur.execute(
                """
                INSERT INTO science.validation_attempts (
                    organization_id, dataset_id, original_object_id,
                    attempt_number, max_attempts, status, next_retry_at,
                    claimed_at, claimed_by, lock_expires_at, failure_code,
                    completed_at, created_at, updated_at
                ) VALUES (
                    %s::uuid, %s::uuid, %s::uuid, 1, 3,
                    'failed', NOW() + INTERVAL '1 minute', NOW(), 'old-worker',
                    NOW() + INTERVAL '5 minutes', 'LEGACY_RETRY', NULL, NOW(), NOW()
                )
                """,
                (org_id, dataset_id, object_id),
            )
            cur.execute(_LEGACY_RETRY_BACKFILL_SQL)
            cur.execute(_LEGACY_RETRY_BACKFILL_SQL)
            cur.execute(
                """
                SELECT attempt_number, status::text, completed_at,
                       claimed_by, claimed_at, lock_expires_at
                FROM science.validation_attempts
                WHERE organization_id = %s::uuid AND dataset_id = %s::uuid
                ORDER BY attempt_number
                """,
                (org_id, dataset_id),
            )
            rows = cur.fetchall()
            cur.close()

            self.assertEqual(len(rows), 2)
            self.assertEqual(rows[0][0:2], (1, "failed"))
            self.assertIsNotNone(rows[0][2])
            self.assertEqual(rows[0][3:], (None, None, None))
            self.assertEqual(rows[1][0:2], (2, "queued"))
            self.assertIsNone(rows[1][2])
            self.assertEqual(rows[1][3:], (None, None, None))
            cur = conn.cursor()
            cur.execute(
                "SELECT dataset_status::text FROM science.datasets WHERE organization_id = %s::uuid AND id = %s::uuid",
                (org_id, dataset_id),
            )
            self.assertEqual(cur.fetchone()[0], "pending_validation")
            cur.close()
            conn.rollback()
        finally:
            conn.rollback()
            if dataset_id:
                cleanup_test_data(conn, org_id, dataset_id)
            conn.close()


if __name__ == "__main__":
    unittest.main()
