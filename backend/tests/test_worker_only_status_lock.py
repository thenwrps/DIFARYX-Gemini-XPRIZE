import asyncio
import os
import unittest
from pathlib import Path
from uuid import uuid4

import psycopg2
from fastapi import HTTPException
from psycopg2.errors import InsufficientPrivilege


def _load_test_env() -> None:
    env_path = Path(__file__).resolve().parents[2] / ".env.test.local"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        if line.strip() and not line.lstrip().startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ[key.strip()] = value.strip()


_load_test_env()


class TestWorkerOnlyStatusLock(unittest.TestCase):
    def setUp(self):
        self.api_conn = psycopg2.connect(os.environ["DIFARYX_API_TEST_DATABASE_URL"])

    def tearDown(self):
        self.api_conn.close()

    def test_api_cannot_flip_dataset_to_any_terminal_status(self):
        cur = self.api_conn.cursor()
        cur.execute(
            """
            SELECT has_column_privilege(
                current_user,
                'science.datasets',
                'dataset_status',
                'UPDATE'
            )
            """
        )
        self.assertFalse(cur.fetchone()[0])

        for status in ("valid", "invalid", "quarantined"):
            with self.subTest(status=status):
                try:
                    cur.execute(
                        "UPDATE science.datasets SET dataset_status = %s WHERE FALSE",
                        (status,),
                    )
                except InsufficientPrivilege:
                    self.api_conn.rollback()
                else:
                    self.api_conn.rollback()
                    self.fail(f"API role unexpectedly updated dataset_status to {status}")
        cur.close()

    def test_api_cannot_execute_worker_terminal_settlement_function(self):
        cur = self.api_conn.cursor()
        cur.execute(
            """
            SELECT has_function_privilege(
                current_user,
                'science.validation_worker_settle_terminal(uuid, uuid, science.validation_attempt_status, science.dataset_status, text, jsonb, text, text, bigint)',
                'EXECUTE'
            )
            """
        )
        self.assertFalse(cur.fetchone()[0])
        cur.close()

    def test_process_route_is_worker_only(self):
        import sys
        from pathlib import Path
        _HERE = Path(__file__).resolve().parent
        _SERVER_PY = _HERE.parents[1] / "server" / "python"
        sys.path.insert(0, str(_SERVER_PY))
        from api.routes.validation import process_validation

        with self.assertRaises(HTTPException) as raised:
            asyncio.run(process_validation(uuid4(), None))
        self.assertEqual(raised.exception.status_code, 403)


if __name__ == "__main__":
    unittest.main()
