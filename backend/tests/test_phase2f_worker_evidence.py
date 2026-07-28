from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
import sys
import unittest
from unittest.mock import AsyncMock, patch


sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "server" / "python"))

from api.workers.validation_worker import (  # noqa: E402
    publish_xrd_evidence_and_mark_passed,
)


class Result:
    def __init__(self, *, first=None, scalar=None, rowcount=0):
        self._first = first
        self._scalar = scalar
        self.rowcount = rowcount

    def first(self):
        return self._first

    def scalar_one(self):
        return self._scalar


class Phase2FWorkerEvidenceTests(unittest.IsolatedAsyncioTestCase):
    async def test_stale_duplicate_delivery_cannot_create_evidence(self) -> None:
        session = SimpleNamespace(execute=AsyncMock(return_value=Result(first=None)))
        with patch(
            "api.workers.validation_worker._set_rls_context",
            new=AsyncMock(),
        ):
            settled = await publish_xrd_evidence_and_mark_passed(
                session,
                "11111111-1111-4111-8111-111111111111",
                "22222222-2222-4222-8222-222222222222",
                "worker-a",
                "33333333-3333-4333-8333-333333333333",
                {
                    "id": "44444444-4444-4444-8444-444444444444",
                    "project_id": "55555555-5555-4555-8555-555555555555",
                },
                {"source_upload_session_id": "66666666-6666-4666-8666-666666666666"},
                "a" * 64,
                120,
                SimpleNamespace(),
            )
        self.assertFalse(settled)
        self.assertEqual(session.execute.await_count, 1)
        self.assertIn("claimed_by = :worker_id", str(session.execute.await_args.args[0]))
        self.assertIn(
            "existing_attempt.attempt_number > current_attempt.attempt_number",
            str(session.execute.await_args.args[0]),
        )

    async def test_owned_attempt_publishes_one_version_before_terminal_settlement(self) -> None:
        evidence_id = "77777777-7777-4777-8777-777777777777"
        session = SimpleNamespace(
            execute=AsyncMock(
                side_effect=[
                    Result(first=(1,)),
                    Result(rowcount=1),
                    Result(scalar=1),
                    Result(scalar=evidence_id),
                    Result(rowcount=1),
                ]
            )
        )
        evidence = SimpleNamespace(
            schema_version="phase2f-xrd-evidence-v1",
            processor_version="test-processor",
            content={"technique": "xrd"},
            content_sha256="b" * 64,
            validation_warnings=["Synthetic warning"],
            scientific_limitations=["XRD does not establish composition."],
            provenance={"source": "server_authorized_object"},
        )
        with (
            patch(
                "api.workers.validation_worker._set_rls_context",
                new=AsyncMock(),
            ),
            patch(
                "api.workers.validation_worker.mark_passed",
                new=AsyncMock(return_value=True),
            ) as mark_passed,
        ):
            settled = await publish_xrd_evidence_and_mark_passed(
                session,
                "11111111-1111-4111-8111-111111111111",
                "22222222-2222-4222-8222-222222222222",
                "worker-a",
                "33333333-3333-4333-8333-333333333333",
                {
                    "id": "44444444-4444-4444-8444-444444444444",
                    "project_id": "55555555-5555-4555-8555-555555555555",
                },
                {"source_upload_session_id": "66666666-6666-4666-8666-666666666666"},
                "a" * 64,
                120,
                evidence,
            )
        self.assertTrue(settled)
        self.assertEqual(session.execute.await_count, 5)
        statements = [str(call.args[0]) for call in session.execute.await_args_list]
        self.assertIn("FOR UPDATE", statements[0])
        self.assertIn("status = 'superseded'", statements[1])
        self.assertIn("MAX(version)", statements[2])
        self.assertIn("INSERT INTO science.xrd_evidence_snapshots", statements[3])
        self.assertIn("current_evidence_id", statements[4])
        mark_passed.assert_awaited_once()


if __name__ == "__main__":
    unittest.main()
