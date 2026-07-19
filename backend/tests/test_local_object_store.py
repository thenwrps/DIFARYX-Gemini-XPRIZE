"""Unit tests for LocalObjectStore and its security/streaming semantics."""

import asyncio
import hashlib
import os
import sys
import tempfile
import unittest
from pathlib import Path
from typing import AsyncIterator

# Set event loop policy on Windows as required
if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from api.storage.local_adapter import LocalObjectStore, STAGING_PREFIX
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


async def make_async_iterator(chunks: list[bytes]) -> AsyncIterator[bytes]:
    for chunk in chunks:
        yield chunk


class TestLocalObjectStore(unittest.TestCase):
    def setUp(self):
        # Create temp dir outside of repository directory for the repository guard to pass
        self.temp_dir = tempfile.TemporaryDirectory()
        self.base_path = Path(self.temp_dir.name).resolve()
        self.store = LocalObjectStore(self.base_path)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_repo_guard_rejects_base_path_in_repo(self):
        # The repo root is derived from local_adapter.py which is server/python/api/storage/local_adapter.py
        # Parents[4] is the repository root
        repo_root = Path(__file__).resolve().parents[2] # backend/tests/test_local_object_store.py -> parents[2] is repo root
        
        with self.assertRaises(ValueError):
            LocalObjectStore(repo_root)
        with self.assertRaises(ValueError):
            LocalObjectStore(repo_root / "backend")

    def test_key_validation_and_traversal(self):
        # Rejects relative paths with traversal segments
        with self.assertRaises(ValueError):
            run(self.store.begin_staging("test/../escaped.csv", 100))
        with self.assertRaises(ValueError):
            run(self.store.begin_staging("../escaped.csv", 100))
        with self.assertRaises(ValueError):
            run(self.store.begin_staging("test/./file.csv", 100))

        # Rejects absolute paths or drive letters
        with self.assertRaises(ValueError):
            run(self.store.begin_staging("/etc/passwd", 100))
        if sys.platform == "win32":
            with self.assertRaises(ValueError):
                run(self.store.begin_staging("C:\\escaped.csv", 100))

        # Rejects unexpected prefixes
        with self.assertRaises(ValueError):
            run(self.store.begin_staging("invalid_prefix/file.csv", 100))

        # Accepts all allowed prefixes
        valid_prefixes = ["datasets", "objects", "test", "org", "final", "_staging", "test-fixtures"]
        for prefix in valid_prefixes:
            self.store._validate_key(f"{prefix}/file.csv", check_prefix=True)

    def test_symlink_escape_rejected(self):
        # Setup target outside base directory
        outside_dir = tempfile.TemporaryDirectory()
        outside_path = Path(outside_dir.name).resolve()
        secret_file = outside_path / "secret.txt"
        secret_file.write_bytes(b"sensitive data")

        # Attempt to link to it
        symlink_path = self.base_path / "test" / "symlink_escape.csv"
        symlink_path.parent.mkdir(parents=True, exist_ok=True)

        try:
            os.symlink(str(secret_file), str(symlink_path))
        except (OSError, PermissionError):
            outside_dir.cleanup()
            self.skipTest("Creating symlinks is not supported/permitted on this Windows environment")

        # Now test that our safe resolve blocks reading/writing to the symlink
        # Key must match the prefix datasets/test/org/final
        # The relative path from base to the symlink is "test/symlink_escape.csv"
        with self.assertRaises(ValueError):
            run(self.store.exists("test/symlink_escape.csv"))

        outside_dir.cleanup()

    def test_streaming_write_success(self):
        async def _test():
            content = [b"hello ", b"world ", b"from ", b"streaming!"]
            expected_digest = hashlib.sha256(b"".join(content)).hexdigest()

            # Stream write
            result = await self.store.stream_write(
                "test/stream_file.csv",
                make_async_iterator(content),
                max_bytes=100,
            )

            self.assertEqual(result.byte_size, 27)
            self.assertEqual(result.sha256_hex, expected_digest)
            self.assertEqual(result.staging_key, f"{STAGING_PREFIX}/test/stream_file.csv")

            # Staging path exists
            staging_path = self.base_path / STAGING_PREFIX / "test_stream_file.csv"
            self.assertTrue(staging_path.exists())

        run(_test())

    def test_streaming_write_overflow_aborts(self):
        async def _test():
            content = [b"too ", b"much ", b"data!"]
            staging_key = "test/big_file.csv"

            with self.assertRaises(StagingOverflowError):
                await self.store.stream_write(
                    staging_key,
                    make_async_iterator(content),
                    max_bytes=10,
                )

            # Staging file is deleted on overflow
            staging_path = self.base_path / STAGING_PREFIX / "test_big_file.csv"
            self.assertFalse(staging_path.exists())

        run(_test())

    def test_streaming_write_failure_cleans_up(self):
        async def _test():
            async def failing_stream():
                yield b"part1"
                raise RuntimeError("Source stream crashed!")

            with self.assertRaises(RuntimeError):
                await self.store.stream_write(
                    "test/fail_file.csv",
                    failing_stream(),
                    max_bytes=100,
                )

            # Staging file is deleted on error/BaseException
            staging_path = self.base_path / STAGING_PREFIX / "test_fail_file.csv"
            self.assertFalse(staging_path.exists())

        run(_test())

    def test_atomic_promote_and_overwrite_guard(self):
        async def _test():
            content1 = b"content version 1"
            content2 = b"content version 2"
            
            # 1. Write first object
            res1 = await self.store.stream_write(
                "test/versioned.csv",
                make_async_iterator([content1]),
                100,
            )
            prom1 = await self.store.promote_staging(res1.staging_key, "final/versioned.csv")
            self.assertEqual(prom1.sha256_hex, res1.sha256_hex)
            
            # Check sidecar exists
            final_path = self.base_path / "final/versioned.csv"
            sha_path = final_path.with_suffix(final_path.suffix + ".sha256")
            self.assertTrue(final_path.exists())
            self.assertTrue(sha_path.exists())

            # 2. Write second object (different content) to the same final path -> PromotionConflictError
            res2 = await self.store.stream_write(
                "test/versioned_diff.csv",
                make_async_iterator([content2]),
                100,
            )
            with self.assertRaises(PromotionConflictError):
                await self.store.promote_staging(res2.staging_key, "final/versioned.csv")

            # Temporary file must be deleted on collision
            staging_path2 = self.base_path / STAGING_PREFIX / "test_versioned_diff.csv"
            self.assertFalse(staging_path2.exists())

            # 3. Write third object (identical content) -> succeeds idempotently
            res3 = await self.store.stream_write(
                "test/versioned_same.csv",
                make_async_iterator([content1]),
                100,
            )
            prom3 = await self.store.promote_staging(res3.staging_key, "final/versioned.csv")
            self.assertEqual(prom3.sha256_hex, res1.sha256_hex)
            
            # Temporary file must be deleted
            staging_path3 = self.base_path / STAGING_PREFIX / "test_versioned_same.csv"
            self.assertFalse(staging_path3.exists())

        run(_test())

    def test_head_object_and_delete_object(self):
        async def _test():
            content = b"metadata tests"
            res = await self.store.stream_write(
                "test/meta.csv",
                make_async_iterator([content]),
                100,
            )
            await self.store.promote_staging(res.staging_key, "final/meta.csv")

            # Check head_object size and sha
            meta = await self.store.head_object("final/meta.csv")
            self.assertEqual(meta.byte_size, len(content))
            self.assertEqual(meta.sha256_hex, res.sha256_hex)

            # Test delete_object deletes final file and sidecar
            deleted = await self.store.delete_object("final/meta.csv")
            self.assertTrue(deleted)
            
            final_path = self.base_path / "final/meta.csv"
            sha_path = final_path.with_suffix(final_path.suffix + ".sha256")
            self.assertFalse(final_path.exists())
            self.assertFalse(sha_path.exists())

        run(_test())

    def test_head_object_fallback_without_sidecar(self):
        async def _test():
            content = b"no sidecar tests"
            res = await self.store.stream_write(
                "test/nosha.csv",
                make_async_iterator([content]),
                100,
            )
            await self.store.promote_staging(res.staging_key, "final/nosha.csv")

            # Delete the sidecar file to force fallback
            final_path = self.base_path / "final/nosha.csv"
            sha_path = final_path.with_suffix(final_path.suffix + ".sha256")
            sha_path.unlink()

            # head_object must fall back gracefully to hashing the file
            meta = await self.store.head_object("final/nosha.csv")
            self.assertEqual(meta.byte_size, len(content))
            self.assertEqual(meta.sha256_hex, res.sha256_hex)

        run(_test())

    def test_streaming_write_cancellation_cleans_up(self):
        async def _test():
            async def cancelled_stream():
                yield b"part1"
                # Raise CancelledError which inherits from BaseException
                raise asyncio.CancelledError()

            with self.assertRaises(asyncio.CancelledError):
                await self.store.stream_write(
                    "test/cancel_file.csv",
                    cancelled_stream(),
                    max_bytes=100,
                )

            # Staging file must be deleted on CancelledError (BaseException)
            staging_path = self.base_path / STAGING_PREFIX / "test_cancel_file.csv"
            self.assertFalse(staging_path.exists())

        run(_test())


if __name__ == "__main__":
    unittest.main()
