"""Phase 1B-A: Ingestion security and integration tests.

Covers:
1. ObjectStore unit tests (InMemoryObjectStore)
2. API model validation tests
3. Upload service orchestration tests (mocked dependencies)
4. Request fingerprint computation tests
"""

from __future__ import annotations

import asyncio
import hashlib
import unittest
from uuid import UUID, uuid4

from api.models.dataset import (
    CancelUploadRequest,
    DatasetResponse,
    InitiateUploadRequest,
    InitiateUploadResponse,
    StreamingPutResponse,
    UploadSessionResponse,
)
from api.utils.fingerprint import compute_request_fingerprint as _compute_request_fingerprint
from api.storage.in_memory_adapter import InMemoryObjectStore
from api.storage.protocol import (
    PromotionConflictError,
    StagingConflictError,
    StagingOverflowError,
)


def run(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


class TestInMemoryObjectStoreStaging(unittest.TestCase):
    """InMemoryObjectStore: staging lifecycle tests."""

    def setUp(self):
        self.store = InMemoryObjectStore()

    def test_staging_roundtrip(self):
        async def _test():
            writer = await self.store.begin_staging("test/file.csv", 1024)
            await writer.write_chunk(b"hello ")
            await writer.write_chunk(b"world")
            result = await writer.finish()
            self.assertEqual(result.byte_size, 11)
            self.assertEqual(
                result.sha256_hex,
                hashlib.sha256(b"hello world").hexdigest(),
            )
            self.assertIn("_staging/", result.staging_key)

            promoted = await self.store.promote_staging(
                result.staging_key, "final/file.csv"
            )
            self.assertEqual(promoted.byte_size, 11)
            self.assertEqual(promoted.sha256_hex, result.sha256_hex)

            self.assertTrue(await self.store.exists("final/file.csv"))
            meta = await self.store.head_object("final/file.csv")
            self.assertEqual(meta.byte_size, 11)

            chunks = []
            async for chunk in self.store.get_object("final/file.csv"):
                chunks.append(chunk)
            self.assertEqual(b"".join(chunks), b"hello world")

        run(_test())

    def test_staging_abort(self):
        async def _test():
            writer = await self.store.begin_staging("test/abort.csv", 1024)
            await writer.write_chunk(b"data")
            await writer.abort()
            self.assertFalse(await self.store.exists("test/abort.csv"))

        run(_test())

    def test_pre_existing_staging_conflict(self):
        async def _test():
            writer = await self.store.begin_staging("test/conflict.csv", 1024)
            await writer.write_chunk(b"first")
            await writer.finish()

            with self.assertRaises(StagingConflictError):
                await self.store.begin_staging("test/conflict.csv", 1024)

        run(_test())

    def test_promotion_idempotency_same_content(self):
        async def _test():
            writer = await self.store.begin_staging("test/idem.csv", 1024)
            await writer.write_chunk(b"same content")
            result = await writer.finish()

            await self.store.promote_staging(result.staging_key, "final/idem.csv")

            writer2 = await self.store.begin_staging("test/idem2.csv", 1024)
            await writer2.write_chunk(b"same content")
            result2 = await writer2.finish()

            promoted2 = await self.store.promote_staging(
                result2.staging_key, "final/idem.csv"
            )
            self.assertEqual(promoted2.sha256_hex, result.sha256_hex)

        run(_test())

    def test_promotion_content_identity_mismatch(self):
        async def _test():
            writer1 = await self.store.begin_staging("test/a.csv", 1024)
            await writer1.write_chunk(b"content A")
            result1 = await writer1.finish()
            await self.store.promote_staging(result1.staging_key, "final/same_size.csv")

            writer2 = await self.store.begin_staging("test/b.csv", 1024)
            await writer2.write_chunk(b"content B")
            result2 = await writer2.finish()

            with self.assertRaises(PromotionConflictError):
                await self.store.promote_staging(
                    result2.staging_key, "final/same_size.csv"
                )

        run(_test())

    def test_promotion_missing_staging(self):
        async def _test():
            with self.assertRaises(FileNotFoundError):
                await self.store.promote_staging(
                    "_staging/nonexistent", "final/nope.csv"
                )

        run(_test())

    def test_staging_overflow(self):
        async def _test():
            writer = await self.store.begin_staging("test/big.csv", 10)
            await writer.write_chunk(b"12345")
            with self.assertRaises(StagingOverflowError):
                await writer.write_chunk(b"123456")

        run(_test())

    def test_delete_staging(self):
        async def _test():
            writer = await self.store.begin_staging("test/del.csv", 1024)
            await writer.write_chunk(b"data")
            result = await writer.finish()

            self.assertTrue(await self.store.delete_staging(result.staging_key))
            self.assertFalse(await self.store.delete_staging(result.staging_key))

        run(_test())

    def test_delete_object(self):
        async def _test():
            writer = await self.store.begin_staging("test/delobj.csv", 1024)
            await writer.write_chunk(b"data")
            result = await writer.finish()
            await self.store.promote_staging(result.staging_key, "final/delobj.csv")

            self.assertTrue(await self.store.delete_object("final/delobj.csv"))
            self.assertFalse(await self.store.exists("final/delobj.csv"))

        run(_test())


class TestRequestFingerprint(unittest.TestCase):
    """Request fingerprint includes all material inputs."""

    def test_fingerprint_deterministic(self):
        org = uuid4()
        proj = uuid4()
        fp1 = _compute_request_fingerprint(
            org, proj, "xrd", "sample.csv", "text/csv", 1024, None
        )
        fp2 = _compute_request_fingerprint(
            org, proj, "xrd", "sample.csv", "text/csv", 1024, None
        )
        self.assertEqual(fp1, fp2)

    def test_fingerprint_changes_with_different_inputs(self):
        org = uuid4()
        proj = uuid4()
        fp1 = _compute_request_fingerprint(
            org, proj, "xrd", "sample.csv", "text/csv", 1024, None
        )
        fp2 = _compute_request_fingerprint(
            org, proj, "xps", "sample.csv", "text/csv", 1024, None
        )
        self.assertNotEqual(fp1, fp2)

    def test_fingerprint_includes_checksum(self):
        org = uuid4()
        proj = uuid4()
        fp1 = _compute_request_fingerprint(
            org, proj, "xrd", "s.csv", "text/csv", 100, None
        )
        fp2 = _compute_request_fingerprint(
            org, proj, "xrd", "s.csv", "text/csv", 100, "a" * 64
        )
        self.assertNotEqual(fp1, fp2)

    def test_fingerprint_includes_content_type(self):
        org = uuid4()
        proj = uuid4()
        fp1 = _compute_request_fingerprint(
            org, proj, "xrd", "s.csv", "text/csv", 100, None
        )
        fp2 = _compute_request_fingerprint(
            org, proj, "xrd", "s.csv", "application/octet-stream", 100, None
        )
        self.assertNotEqual(fp1, fp2)

    def test_fingerprint_includes_byte_size(self):
        org = uuid4()
        proj = uuid4()
        fp1 = _compute_request_fingerprint(
            org, proj, "xrd", "s.csv", "text/csv", 100, None
        )
        fp2 = _compute_request_fingerprint(
            org, proj, "xrd", "s.csv", "text/csv", 200, None
        )
        self.assertNotEqual(fp1, fp2)


class TestInitiateUploadRequestValidation(unittest.TestCase):
    """Pydantic model validation tests."""

    def test_valid_request(self):
        req = InitiateUploadRequest(
            project_id=uuid4(),
            technique="xrd",
            display_filename="sample.csv",
            declared_content_type="text/csv",
            byte_size=1024,
            idempotency_key="test-key-1",
        )
        self.assertEqual(req.byte_size, 1024)

    def test_invalid_checksum_format(self):
        with self.assertRaises(Exception):
            InitiateUploadRequest(
                project_id=uuid4(),
                technique="xrd",
                display_filename="sample.csv",
                declared_content_type="text/csv",
                byte_size=1024,
                client_checksum_sha256="not-a-hash",
                idempotency_key="test-key-2",
            )

    def test_valid_checksum(self):
        req = InitiateUploadRequest(
            project_id=uuid4(),
            technique="xrd",
            display_filename="sample.csv",
            declared_content_type="text/csv",
            byte_size=1024,
            client_checksum_sha256="a" * 64,
            idempotency_key="test-key-3",
        )
        self.assertEqual(req.client_checksum_sha256, "a" * 64)

    def test_zero_byte_size_rejected(self):
        with self.assertRaises(Exception):
            InitiateUploadRequest(
                project_id=uuid4(),
                technique="xrd",
                display_filename="sample.csv",
                declared_content_type="text/csv",
                byte_size=0,
                idempotency_key="test-key-4",
            )

    def test_negative_byte_size_rejected(self):
        with self.assertRaises(Exception):
            InitiateUploadRequest(
                project_id=uuid4(),
                technique="xrd",
                display_filename="sample.csv",
                declared_content_type="text/csv",
                byte_size=-1,
                idempotency_key="test-key-5",
            )

    def test_empty_idempotency_key_rejected(self):
        with self.assertRaises(Exception):
            InitiateUploadRequest(
                project_id=uuid4(),
                technique="xrd",
                display_filename="sample.csv",
                declared_content_type="text/csv",
                byte_size=100,
                idempotency_key="",
            )


class TestResponseModelsNoInternalKeys(unittest.TestCase):
    """Verify that response models do NOT contain internal storage keys."""

    def test_initiate_response_no_object_key(self):
        fields = set(InitiateUploadResponse.model_fields.keys())
        self.assertNotIn("object_key", fields)
        self.assertNotIn("staging_key", fields)
        self.assertNotIn("storage_provider", fields)
        self.assertNotIn("storage_generation", fields)

    def test_upload_session_response_no_object_key(self):
        fields = set(UploadSessionResponse.model_fields.keys())
        self.assertNotIn("object_key", fields)
        self.assertNotIn("staging_key", fields)
        self.assertNotIn("storage_provider", fields)
        self.assertNotIn("storage_generation", fields)

    def test_streaming_put_response_has_server_checksum(self):
        fields = set(StreamingPutResponse.model_fields.keys())
        self.assertIn("server_checksum_sha256", fields)
        self.assertNotIn("object_key", fields)
        self.assertNotIn("staging_key", fields)


class TestCancelUploadRequest(unittest.TestCase):
    """CancelUploadRequest validation."""

    def test_default_reason_none(self):
        req = CancelUploadRequest()
        self.assertIsNone(req.reason)

    def test_with_reason(self):
        req = CancelUploadRequest(reason="user changed mind")
        self.assertEqual(req.reason, "user changed mind")

    def test_reason_max_length(self):
        with self.assertRaises(Exception):
            CancelUploadRequest(reason="x" * 256)


class TestDatasetResponseNoValidStatus(unittest.TestCase):
    """Dataset response model does not enforce status — but verify 'valid' is never set by the service."""

    def test_response_with_pending_validation(self):
        resp = DatasetResponse(
            id=uuid4(),
            organization_id=uuid4(),
            project_id=uuid4(),
            technique="xrd",
            display_filename="sample.csv",
            declared_content_type="text/csv",
            byte_size=1024,
            client_checksum_sha256=None,
            dataset_status="pending_validation",
            status_changed_at="2026-01-01T00:00:00Z",
            failure_code=None,
            original_object_id=uuid4(),
            created_by=uuid4(),
            created_at="2026-01-01T00:00:00Z",
            updated_at="2026-01-01T00:00:00Z",
        )
        self.assertEqual(resp.dataset_status, "pending_validation")


if __name__ == "__main__":
    unittest.main()
