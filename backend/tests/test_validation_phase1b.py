import asyncio
import hashlib
import unittest
from typing import Optional
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from api.models.validation import (
    EnqueueValidationResponse,
    ValidationAttemptResponse,
    ValidationOutcome,
)
from api.storage.in_memory_adapter import InMemoryObjectStore
from api.validation.checks import (
    CheckResult,
    check_bounded_content,
    check_byte_size,
    check_checksum,
    check_content_type,
    check_extension,
    check_not_empty,
    check_object_exists,
    run_all_checks,
    verify_authoritative_object,
)
from api.validation.policy import (
    get_allowed_content_types,
    get_allowed_extensions,
    get_max_file_size,
    is_allowed_content_type,
    is_allowed_extension,
)


def run(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


class TestValidationPolicy(unittest.TestCase):
    def test_is_allowed_extension_valid(self):
        self.assertTrue(is_allowed_extension("data.csv"))
        self.assertTrue(is_allowed_extension("DATA.CSV"))
        self.assertTrue(is_allowed_extension("test.txt"))
        self.assertTrue(is_allowed_extension("spectrum.raw"))

    def test_is_allowed_extension_invalid(self):
        self.assertFalse(is_allowed_extension("image.png"))
        self.assertFalse(is_allowed_extension("document.pdf"))
        self.assertFalse(is_allowed_extension("archive.zip"))
        self.assertFalse(is_allowed_extension("no_extension"))

    def test_is_allowed_content_type_valid(self):
        self.assertTrue(is_allowed_content_type("text/csv"))
        self.assertTrue(is_allowed_content_type("text/plain"))
        self.assertTrue(is_allowed_content_type("application/octet-stream"))

    def test_is_allowed_content_type_invalid(self):
        self.assertFalse(is_allowed_content_type("image/png"))
        self.assertFalse(is_allowed_content_type("application/pdf"))
        self.assertFalse(is_allowed_content_type("application/json"))

    def test_get_allowed_extensions(self):
        exts = get_allowed_extensions()
        self.assertIsInstance(exts, frozenset)
        self.assertIn(".csv", exts)
        self.assertIn(".txt", exts)

    def test_get_allowed_content_types(self):
        types = get_allowed_content_types()
        self.assertIsInstance(types, frozenset)
        self.assertIn("text/csv", types)

    def test_get_max_file_size(self):
        size = get_max_file_size()
        self.assertIsInstance(size, int)
        self.assertGreater(size, 0)


class TestValidationChecks(unittest.TestCase):
    def setUp(self):
        self.store = InMemoryObjectStore()
        self.test_content = b"x,y,z\n1,2,3\n4,5,6\n"
        self.test_key = "org/dataset/test.csv"
        run(self._setup_store())

    async def _setup_store(self):
        writer = await self.store.begin_staging(self.test_key, max_bytes=1024)
        await writer.write_chunk(self.test_content)
        result = await writer.finish()
        await self.store.promote_staging(result.staging_key, self.test_key)

    def test_check_extension_pass(self):
        result = check_extension("data.csv")
        self.assertTrue(result.passed)
        self.assertEqual(result.name, "extension")
        self.assertIsNone(result.failure_code)

    def test_check_extension_fail(self):
        result = check_extension("image.png")
        self.assertFalse(result.passed)
        self.assertEqual(result.failure_code, "INVALID_EXTENSION")
        self.assertFalse(result.transient)

    def test_check_content_type_pass(self):
        result = check_content_type("text/csv")
        self.assertTrue(result.passed)
        self.assertEqual(result.name, "content_type")

    def test_check_content_type_fail(self):
        result = check_content_type("image/png")
        self.assertFalse(result.passed)
        self.assertEqual(result.failure_code, "INVALID_CONTENT_TYPE")
        self.assertFalse(result.transient)

    def test_check_not_empty_pass(self):
        result = check_not_empty(100)
        self.assertTrue(result.passed)
        self.assertEqual(result.name, "not_empty")

    def test_check_not_empty_fail(self):
        result = check_not_empty(0)
        self.assertFalse(result.passed)
        self.assertEqual(result.failure_code, "EMPTY_FILE")
        self.assertFalse(result.transient)

    def test_check_object_exists_pass(self):
        result = run(check_object_exists(self.store, self.test_key))
        self.assertTrue(result.passed)
        self.assertEqual(result.name, "object_exists")

    def test_check_object_exists_fail(self):
        result = run(check_object_exists(self.store, "nonexistent/key"))
        self.assertFalse(result.passed)
        self.assertEqual(result.failure_code, "OBJECT_NOT_FOUND")
        self.assertFalse(result.transient)

    def test_check_byte_size_pass(self):
        result = run(check_byte_size(self.store, self.test_key, len(self.test_content)))
        self.assertTrue(result.passed)
        self.assertEqual(result.name, "byte_size")

    def test_check_byte_size_fail(self):
        result = run(check_byte_size(self.store, self.test_key, 9999))
        self.assertFalse(result.passed)
        self.assertEqual(result.failure_code, "BYTE_SIZE_MISMATCH")
        self.assertFalse(result.transient)

    def test_check_checksum_pass_with_client_checksum(self):
        expected = hashlib.sha256(self.test_content).hexdigest()
        result = run(check_checksum(self.store, self.test_key, expected))
        self.assertTrue(result.passed)
        self.assertIn(expected, result.detail)

    def test_client_checksum_hint_mismatch_does_not_fail_authoritative_check(self):
        result = run(check_checksum(self.store, self.test_key, "a" * 64))
        self.assertTrue(result.passed)
        self.assertIn("client checksum hint mismatch ignored", result.detail)
        self.assertFalse(result.transient)

    def test_check_checksum_pass_no_client_checksum(self):
        result = run(check_checksum(self.store, self.test_key, None))
        self.assertTrue(result.passed)
        self.assertIn("Server checksum:", result.detail)

    def test_authoritative_integrity_passes_with_finalize_metadata(self):
        digest = hashlib.sha256(self.test_content).hexdigest()
        result = run(
            verify_authoritative_object(
                self.store,
                self.test_key,
                len(self.test_content),
                len(self.test_content),
                digest,
            )
        )
        self.assertTrue(result.passed)
        self.assertEqual(result.server_checksum_sha256, digest)
        self.assertEqual(result.byte_size_verified, len(self.test_content))

    def test_authoritative_integrity_same_size_different_bytes_yields_sha256_mismatch(self):
        # Dedicated same-size / different-bytes fixture: the persisted and
        # expected byte sizes match the stored object, but the authoritative
        # digest is wrong. This must specifically surface as
        # AUTHORITATIVE_SHA256_MISMATCH (not the size-mismatch code path).
        stored_bytes = self.test_content
        wrong_digest = "0" * 64
        self.assertNotEqual(wrong_digest, hashlib.sha256(stored_bytes).hexdigest())
        result = run(
            verify_authoritative_object(
                self.store,
                self.test_key,
                len(stored_bytes),
                len(stored_bytes),
                wrong_digest,
            )
        )
        self.assertFalse(result.passed)
        self.assertEqual(result.failure_code, "AUTHORITATIVE_SHA256_MISMATCH")
        self.assertEqual(result.byte_size_verified, len(stored_bytes))

    def test_authoritative_integrity_missing_metadata_fails_closed(self):
        result = run(
            verify_authoritative_object(
                self.store,
                self.test_key,
                len(self.test_content),
                len(self.test_content),
                None,
            )
        )
        self.assertFalse(result.passed)
        self.assertEqual(result.failure_code, "AUTHORITATIVE_DIGEST_MISSING")

    def test_check_bounded_content_pass(self):
        result = run(check_bounded_content(self.store, self.test_key))
        self.assertTrue(result.passed)
        self.assertEqual(result.name, "bounded_content")

    def test_check_bounded_content_null_bytes(self):
        binary_key = "org/dataset/binary.dat"
        run(self._setup_binary_object())
        result = run(check_bounded_content(self.store, binary_key))
        self.assertFalse(result.passed)
        self.assertEqual(result.failure_code, "CONTENT_POLICY_VIOLATION")
        self.assertFalse(result.transient)

    async def _setup_binary_object(self):
        key = "org/dataset/binary.dat"
        writer = await self.store.begin_staging(key, max_bytes=1024)
        await writer.write_chunk(b"data\x00with\x00nulls")
        result = await writer.finish()
        await self.store.promote_staging(result.staging_key, key)

    def test_run_all_checks_pass(self):
        expected_checksum = hashlib.sha256(self.test_content).hexdigest()
        result = run(
            run_all_checks(
                store=self.store,
                object_key=self.test_key,
                expected_byte_size=len(self.test_content),
                display_filename="test.csv",
                declared_content_type="text/csv",
                client_checksum_sha256=expected_checksum,
            )
        )
        self.assertTrue(result.passed)
        self.assertEqual(len(result.checks), 7)
        self.assertIsNotNone(result.server_checksum_sha256)
        self.assertEqual(result.byte_size_verified, len(self.test_content))
        self.assertIsNone(result.failure_code)

    def test_run_all_checks_short_circuit_on_extension_fail(self):
        result = run(
            run_all_checks(
                store=self.store,
                object_key=self.test_key,
                expected_byte_size=len(self.test_content),
                display_filename="test.png",
                declared_content_type="text/csv",
                client_checksum_sha256=None,
            )
        )
        self.assertFalse(result.passed)
        self.assertEqual(len(result.checks), 1)
        self.assertEqual(result.failure_code, "INVALID_EXTENSION")
        self.assertFalse(result.transient)

    def test_run_all_checks_short_circuit_on_object_missing(self):
        result = run(
            run_all_checks(
                store=self.store,
                object_key="nonexistent/key",
                expected_byte_size=100,
                display_filename="test.csv",
                declared_content_type="text/csv",
                client_checksum_sha256=None,
            )
        )
        self.assertFalse(result.passed)
        self.assertEqual(result.failure_code, "OBJECT_NOT_FOUND")
        self.assertFalse(result.transient)


class TestValidationModels(unittest.TestCase):
    def test_enqueue_validation_response(self):
        resp = EnqueueValidationResponse(
            dataset_id=uuid4(),
            attempt_id=uuid4(),
            attempt_number=1,
            dataset_status="pending_validation",
        )
        self.assertEqual(resp.attempt_number, 1)
        self.assertEqual(resp.dataset_status, "pending_validation")

    def test_validation_attempt_response(self):
        resp = ValidationAttemptResponse(
            id=uuid4(),
            attempt_number=1,
            status="queued",
            claimed_at=None,
            started_at=None,
            completed_at=None,
            failure_code=None,
            failure_details=None,
            server_checksum_sha256=None,
            byte_size_verified=None,
            quarantine_reason=None,
            created_at="2026-07-13T00:00:00Z",
        )
        self.assertEqual(resp.status, "queued")

    def test_validation_outcome_passed(self):
        outcome = ValidationOutcome(
            attempt_id=uuid4(),
            dataset_id=uuid4(),
            status="passed",
            checks_passed=7,
            server_checksum_sha256="a" * 64,
            byte_size_verified=100,
            failure_code=None,
            transient=False,
        )
        self.assertEqual(outcome.status, "passed")
        self.assertFalse(outcome.transient)

    def test_validation_outcome_failed_permanent(self):
        outcome = ValidationOutcome(
            attempt_id=uuid4(),
            dataset_id=uuid4(),
            status="failed",
            checks_passed=3,
            server_checksum_sha256=None,
            byte_size_verified=None,
            failure_code="CHECKSUM_MISMATCH",
            transient=False,
        )
        self.assertEqual(outcome.status, "failed")
        self.assertFalse(outcome.transient)
        self.assertEqual(outcome.failure_code, "CHECKSUM_MISMATCH")

    def test_validation_outcome_quarantined(self):
        outcome = ValidationOutcome(
            attempt_id=uuid4(),
            dataset_id=uuid4(),
            status="quarantined",
            checks_passed=5,
            server_checksum_sha256=None,
            byte_size_verified=100,
            failure_code="READ_ERROR",
            transient=True,
        )
        self.assertEqual(outcome.status, "quarantined")
        self.assertTrue(outcome.transient)


class TestCheckResultDataclass(unittest.TestCase):
    def test_check_result_passed(self):
        result = CheckResult(
            name="test",
            passed=True,
            detail="OK",
            failure_code=None,
            transient=False,
        )
        self.assertTrue(result.passed)
        self.assertIsNone(result.failure_code)

    def test_check_result_failed_permanent(self):
        result = CheckResult(
            name="test",
            passed=False,
            detail="Failed",
            failure_code="TEST_FAILURE",
            transient=False,
        )
        self.assertFalse(result.passed)
        self.assertFalse(result.transient)

    def test_check_result_failed_transient(self):
        result = CheckResult(
            name="test",
            passed=False,
            detail="Read error",
            failure_code="READ_ERROR",
            transient=True,
        )
        self.assertFalse(result.passed)
        self.assertTrue(result.transient)

    def test_check_result_frozen(self):
        result = CheckResult(name="test", passed=True, detail="OK")
        with self.assertRaises(Exception):
            result.passed = False


if __name__ == "__main__":
    unittest.main()
