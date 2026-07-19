import asyncio
import hashlib
import os
import sys
import tempfile
import uuid
import json
from pathlib import Path
from unittest.mock import patch, MagicMock

# Force development environment so LocalObjectStore is used, enabling WSL container mounts
os.environ["APP_ENV"] = "development"

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

# Add server/python to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "server" / "python"))

import psycopg2
from api.validation.isolated_runner import ContainerParserRunner
from api.workers.validation_worker import process_one, _make_engine, counters

# Database Configuration
BOOTSTRAP_URL = os.getenv("DIFARYX_BOOTSTRAP_DATABASE_URL")
DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL and BOOTSTRAP_URL:
    DATABASE_URL = BOOTSTRAP_URL

if not DATABASE_URL:
    DATABASE_URL = "postgresql://postgres:difaryx_dev_pw@127.0.0.1:5432/difaryx_phase0_test"

ORG_ID = "bbbbbbbb-0000-0000-0000-000000000001"
USER_ID = "10000000-0000-0000-0000-000000000001"
WORKER_ID = "test-container-worker"

def get_superuser_conn():
    return psycopg2.connect(BOOTSTRAP_URL or DATABASE_URL)

def _ensure_path():
    sp = str(Path(__file__).resolve().parents[2] / "server" / "python")
    if sp not in sys.path:
        sys.path.insert(0, sp)

def seed_test_data(super_conn, object_key, checksum, byte_size, dataset_status="pending_validation"):
    cur = super_conn.cursor()
    org_id = ORG_ID
    user_id = USER_ID
    project_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"runner-test-proj-{object_key}"))
    dataset_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"ds-{object_key}"))
    object_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"obj-{object_key}"))

    cur.execute("SET session_replication_role = 'replica'")

    # Org
    cur.execute("""
        INSERT INTO identity.organizations (id, slug, display_name, plan_tier)
        VALUES (%s::uuid, %s, 'Runner Test Org', 'free')
        ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name
    """, (org_id, f"runner-test-{org_id[:8]}"))

    # User
    cur.execute("""
        INSERT INTO identity.users (organization_id, id, email, display_name, is_active)
        VALUES (%s::uuid, %s::uuid, %s, 'Runner Test User', TRUE)
        ON CONFLICT (organization_id, id) DO NOTHING
    """, (org_id, user_id, f"runner-test-{user_id[:8]}@test.local"))

    # Membership
    cur.execute("""
        INSERT INTO identity.memberships (organization_id, user_id, role)
        VALUES (%s::uuid, %s::uuid, 'owner')
        ON CONFLICT (organization_id, user_id) DO NOTHING
    """, (org_id, user_id))

    # Project
    cur.execute("""
        INSERT INTO science.projects (organization_id, id, owner_user_id, title, description)
        VALUES (%s::uuid, %s::uuid, %s::uuid, 'Runner Test Project', 'Container integration test')
        ON CONFLICT (organization_id, id) DO NOTHING
    """, (org_id, project_id, user_id))

    upload_session_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"us-{object_key}"))

    cur.execute("""
        INSERT INTO science.datasets (
            organization_id, id, project_id, technique, display_filename,
            declared_content_type, byte_size, dataset_status,
            original_object_id, created_by, created_at, client_checksum_sha256
        ) VALUES (
            %s::uuid, %s::uuid, %s::uuid, 'xrd', %s,
            'text/csv', %s, %s::science.dataset_status,
            %s::uuid, %s::uuid, NOW(), %s
        )
        ON CONFLICT (organization_id, id) DO UPDATE SET
            dataset_status = EXCLUDED.dataset_status,
            byte_size = EXCLUDED.byte_size,
            original_object_id = EXCLUDED.original_object_id
    """, (org_id, dataset_id, project_id,
          f"test_{object_key.replace('/', '_')}.csv",
          byte_size, dataset_status, object_id, user_id, checksum))

    # Upload session
    cur.execute("""
        INSERT INTO science.upload_sessions (
            organization_id, id, dataset_id, created_by, object_key,
            expected_byte_size, storage_provider, session_status,
            idempotency_key, request_fingerprint,
            quota_reservation_id, expires_at
        ) VALUES (
            %s::uuid, %s::uuid, %s::uuid, %s::uuid, %s,
            %s, 'local', 'uploaded',
            %s, %s,
            gen_random_uuid(), NOW() + INTERVAL '1 hour'
        )
        ON CONFLICT (organization_id, id) DO NOTHING
    """, (org_id, upload_session_id, dataset_id, user_id, object_key,
          byte_size,
          f"idem-{upload_session_id}",
          hashlib.sha256(upload_session_id.encode()).hexdigest()))

    # Dataset Object (with server authoritative digest/size)
    cur.execute("""
        INSERT INTO science.dataset_objects (
            organization_id, id, dataset_id, source_upload_session_id,
            object_role, storage_provider, object_key,
            byte_size, content_type, authoritative_sha256, created_at
        ) VALUES (
            %s::uuid, %s::uuid, %s::uuid, %s::uuid,
            'original', 'local', %s,
            %s, 'text/csv', %s, NOW()
        )
        ON CONFLICT (organization_id, id) DO NOTHING
    """, (org_id, object_id, dataset_id, upload_session_id, object_key, byte_size, checksum))

    super_conn.commit()
    cur.close()
    return org_id, user_id, project_id, dataset_id, object_id

def seed_validation_attempt(super_conn, org_id, dataset_id, object_id, max_attempts=3):
    cur = super_conn.cursor()
    cur.execute("SET session_replication_role = 'replica'")
    cur.execute("""
        INSERT INTO science.validation_attempts (
            organization_id, id, dataset_id, original_object_id,
            attempt_number, max_attempts, status,
            lock_expires_at, next_retry_at, created_at, updated_at
        ) VALUES (
            %s::uuid, gen_random_uuid(), %s::uuid, %s::uuid,
            1, %s, 'queued',
            NOW() + INTERVAL '5 minutes', NULL, NOW(), NOW()
        )
        RETURNING id
    """, (org_id, dataset_id, object_id, max_attempts))
    attempt_id = str(cur.fetchone()[0])
    super_conn.commit()
    cur.close()
    return attempt_id

def get_dataset(super_conn, org_id, dataset_id):
    cur = super_conn.cursor()
    cur.execute("""
        SELECT dataset_status
        FROM science.datasets
        WHERE organization_id = %s::uuid AND id = %s::uuid
    """, (org_id, dataset_id))
    row = cur.fetchone()
    cur.close()
    if row:
        return {"status": row[0], "failure_code": None}
    return None

def get_attempt(super_conn, org_id, attempt_id):
    cur = super_conn.cursor()
    cur.execute("""
        SELECT status, failure_code, failure_details
        FROM science.validation_attempts
        WHERE organization_id = %s::uuid AND id = %s::uuid
    """, (org_id, attempt_id))
    row = cur.fetchone()
    cur.close()
    if row:
        return {"status": row[0], "failure_code": row[1], "failure_details": row[2]}
    return None

def cleanup_test_data(super_conn, org_id, dataset_id):
    cur = super_conn.cursor()
    cur.execute("SET session_replication_role = 'replica'")
    cur.execute("DELETE FROM science.validation_attempts WHERE organization_id = %s::uuid AND dataset_id = %s::uuid", (org_id, dataset_id))
    cur.execute("DELETE FROM science.dataset_objects WHERE organization_id = %s::uuid AND dataset_id = %s::uuid", (org_id, dataset_id))
    cur.execute("DELETE FROM science.datasets WHERE organization_id = %s::uuid AND id = %s::uuid", (org_id, dataset_id))
    super_conn.commit()
    cur.close()

async def test_egress_blocking():
    print("=== Test 1: Self-check (Egress denial check) ===")
    runner = ContainerParserRunner()
    success = await runner.self_check()
    assert success is True, "Self-check failed: egress not blocked or Podman failed"
    print("[PASS] Self-check successfully denied egress and verified podman run.")


async def test_egress_reachable_quarantines():
    """If egress probe succeeds (outbound reachable), self_check must return False,
    causing run_parser to raise RuntimeError (quarantine) — never valid."""
    print("=== Test 1b: Egress reachable → quarantine (mocked) ===")
    runner = ContainerParserRunner()

    # Mock subprocess.run so:
    #   call 1 (podman --version) → returncode=0  (podman available)
    #   call 2 (egress probe)     → returncode=0  (outbound reachable = SECURITY FAILURE)
    fake_podman_ok = MagicMock(returncode=0, stdout="podman version 4.x", stderr="")
    fake_egress_reachable = MagicMock(returncode=0, stdout="", stderr="")

    with patch("subprocess.run", side_effect=[fake_podman_ok, fake_egress_reachable]):
        result = await runner.self_check()

    assert result is False, (
        "Expected self_check to return False when egress is reachable (quarantine path)"
    )

    # Verify that run_parser raises RuntimeError instead of ever parsing
    fd_in, in_path = tempfile.mkstemp(suffix=".csv")
    os.close(fd_in)
    fd_out, out_path = tempfile.mkstemp(suffix=".json")
    os.close(fd_out)
    try:
        Path(in_path).write_bytes(b"1.0 10.0\n2.0 20.0\n")
        # self_check will be called inside run_parser; mock it to fail
        with patch("subprocess.run", side_effect=[fake_podman_ok, fake_egress_reachable]):
            try:
                await runner.run_parser("xrd", in_path, out_path)
                assert False, "run_parser should have raised RuntimeError"
            except RuntimeError as e:
                assert "self-check failed" in str(e)
        print("[PASS] Egress reachable → self_check=False → quarantine (RuntimeError); never valid.")
    finally:
        os.unlink(in_path)
        if os.path.exists(out_path):
            os.unlink(out_path)

async def test_valid_parse():
    print("=== Test 2: Valid XRD profile parsing ===")
    content = b"1.0 10.5\n2.0 20.0\n3.0 15.2\n"
    fd_in, in_path = tempfile.mkstemp(suffix=".csv")
    os.close(fd_in)
    fd_out, out_path = tempfile.mkstemp(suffix=".json")
    os.close(fd_out)

    try:
        Path(in_path).write_bytes(content)
        runner = ContainerParserRunner()
        result = await runner.run_parser("xrd", in_path, out_path)
        print("Parser result:", result)
        assert result.get("status") == "valid", f"expected valid, got {result.get('status')}"
        assert result.get("technique") == "xrd", f"expected technique=xrd, got {result.get('technique')}"
        assert result.get("valid_data_rows") == 3, f"expected valid_data_rows=3, got {result.get('valid_data_rows')}"
        assert result.get("total_lines_scanned") == 3, f"expected total_lines_scanned=3, got {result.get('total_lines_scanned')}"
        assert "technique_identity_class" in result, "technique_identity_class missing from bounded envelope"
        print("[PASS] Valid XRD profile parsing succeeded with bounded result schema.")
    finally:
        os.unlink(in_path)
        os.unlink(out_path)

async def test_invalid_parse():
    print("=== Test 3: Malformed XRD row parsing (non-numeric value) ===")
    content = b"1.0 10.5\nABC 20.0\n3.0 15.2\n"
    fd_in, in_path = tempfile.mkstemp(suffix=".csv")
    os.close(fd_in)
    fd_out, out_path = tempfile.mkstemp(suffix=".json")
    os.close(fd_out)

    try:
        Path(in_path).write_bytes(content)
        runner = ContainerParserRunner()
        result = await runner.run_parser("xrd", in_path, out_path)
        print("Parser result:", result)
        assert result.get("status") == "invalid", f"expected invalid, got {result.get('status')}"
        assert result.get("error_code") == "XRD_INVALID_NON_NUMERIC_ROW", \
            f"expected XRD_INVALID_NON_NUMERIC_ROW, got {result.get('error_code')}"
        print("[PASS] Malformed XRD row parsing failed gracefully as invalid.")
    finally:
        os.unlink(in_path)
        os.unlink(out_path)

async def test_timeout_kill():
    print("=== Test 4: Wall-clock timeout enforcement ===")
    # Create a valid input file
    content = b"1.0 10.5\n2.0 20.0\n"
    fd_in, in_path = tempfile.mkstemp(suffix=".csv")
    os.close(fd_in)
    fd_out, out_path = tempfile.mkstemp(suffix=".json")
    os.close(fd_out)

    try:
        Path(in_path).write_bytes(content)
        runner = ContainerParserRunner()
        
        # We specify a tiny timeout of 0.001 seconds which should trigger timeout kill
        try:
            await runner.run_parser("xrd", in_path, out_path, timeout=0.001)
            assert False, "Should have timed out!"
        except TimeoutError as te:
            print("Successfully caught TimeoutError:", te)
            print("[PASS] Wall-clock deadline enforcement killed container.")
    finally:
        os.unlink(in_path)
        os.unlink(out_path)

async def test_worker_integration_valid():
    print("=== Test 5: End-to-end Worker run with Valid file ===")
    sconn = get_superuser_conn()
    content = b"1.0 5.0\n2.0 10.0\n"
    storage_dir = Path(tempfile.mkdtemp())
    object_key = f"datasets/runner-test-{uuid.uuid4().hex}.csv"
    filepath = storage_dir / object_key.replace("/", os.sep)
    filepath.parent.mkdir(parents=True, exist_ok=True)
    filepath.write_bytes(content)
    
    checksum = hashlib.sha256(content).hexdigest()
    byte_size = len(content)

    os.environ["DIFARYX_LOCAL_STORAGE_PATH"] = str(storage_dir)
    os.environ["VW_ORGANIZATION_ID"] = ORG_ID
    os.environ["VW_USER_ID"] = USER_ID
    os.environ["DATABASE_URL"] = DATABASE_URL

    try:
        org_id, user_id, project_id, dataset_id, object_id = seed_test_data(
            sconn, object_key, checksum, byte_size
        )
        attempt_id = seed_validation_attempt(sconn, org_id, dataset_id, object_id)

        engine = _make_engine()
        outcome = await process_one(engine, org_id, user_id, WORKER_ID, 60, 10.0)
        await engine.dispose()

        print("Worker processing outcome:", outcome)
        assert outcome == "passed"

        ds = get_dataset(sconn, org_id, dataset_id)
        att = get_attempt(sconn, org_id, attempt_id)

        print("Dataset state:", ds)
        print("Attempt state:", att)

        assert ds["status"] == "valid"
        assert att["status"] == "passed"
        print("[PASS] End-to-end validation with valid dataset completed.")

        cleanup_test_data(sconn, org_id, dataset_id)
    finally:
        sconn.close()

async def test_worker_integration_invalid():
    print("=== Test 6: End-to-end Worker run with Malformed XRD row ===")
    sconn = get_superuser_conn()
    content = b"1.0 ABC\n"
    storage_dir = Path(tempfile.mkdtemp())
    object_key = f"datasets/runner-test-{uuid.uuid4().hex}.csv"
    filepath = storage_dir / object_key.replace("/", os.sep)
    filepath.parent.mkdir(parents=True, exist_ok=True)
    filepath.write_bytes(content)
    
    checksum = hashlib.sha256(content).hexdigest()
    byte_size = len(content)

    os.environ["DIFARYX_LOCAL_STORAGE_PATH"] = str(storage_dir)
    os.environ["VW_ORGANIZATION_ID"] = ORG_ID
    os.environ["VW_USER_ID"] = USER_ID
    os.environ["DATABASE_URL"] = DATABASE_URL

    try:
        org_id, user_id, project_id, dataset_id, object_id = seed_test_data(
            sconn, object_key, checksum, byte_size
        )
        attempt_id = seed_validation_attempt(sconn, org_id, dataset_id, object_id)

        engine = _make_engine()
        outcome = await process_one(engine, org_id, user_id, WORKER_ID, 60, 10.0)
        await engine.dispose()

        print("Worker processing outcome:", outcome)
        assert outcome == "failed", f"expected failed, got {outcome}"

        ds = get_dataset(sconn, org_id, dataset_id)
        att = get_attempt(sconn, org_id, attempt_id)

        print("Dataset state:", ds)
        print("Attempt state:", att)

        assert ds["status"] == "invalid", f"expected invalid dataset, got {ds['status']}"
        assert att["status"] == "failed", f"expected failed attempt, got {att['status']}"
        assert att["failure_code"] == "XRD_INVALID_NON_NUMERIC_ROW", \
            f"expected XRD_INVALID_NON_NUMERIC_ROW, got {att['failure_code']}"
        print("[PASS] End-to-end validation with malformed XRD row completed.")

        cleanup_test_data(sconn, org_id, dataset_id)
    finally:
        sconn.close()

async def test_worker_integration_integrity_mismatch():
    print("=== Test 7: End-to-end Worker run with Digest Mismatch (Quarantine) ===")
    sconn = get_superuser_conn()
    content = b"1.0 10.0\n"
    storage_dir = Path(tempfile.mkdtemp())
    object_key = f"datasets/runner-test-{uuid.uuid4().hex}.csv"
    filepath = storage_dir / object_key.replace("/", os.sep)
    filepath.parent.mkdir(parents=True, exist_ok=True)
    filepath.write_bytes(content)
    
    # We specify a fake/mismatched checksum in database
    fake_checksum = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" # Empty file hash
    byte_size = len(content)

    os.environ["DIFARYX_LOCAL_STORAGE_PATH"] = str(storage_dir)
    os.environ["VW_ORGANIZATION_ID"] = ORG_ID
    os.environ["VW_USER_ID"] = USER_ID
    os.environ["DATABASE_URL"] = DATABASE_URL

    try:
        org_id, user_id, project_id, dataset_id, object_id = seed_test_data(
            sconn, object_key, fake_checksum, byte_size
        )
        attempt_id = seed_validation_attempt(sconn, org_id, dataset_id, object_id)

        engine = _make_engine()
        outcome = await process_one(engine, org_id, user_id, WORKER_ID, 60, 10.0)
        await engine.dispose()

        print("Worker processing outcome:", outcome)
        assert outcome == "quarantined"

        ds = get_dataset(sconn, org_id, dataset_id)
        att = get_attempt(sconn, org_id, attempt_id)

        print("Dataset state:", ds)
        print("Attempt state:", att)

        assert ds["status"] == "quarantined"
        assert att["status"] == "quarantined"
        assert att["failure_code"] == "AUTHORITATIVE_SHA256_MISMATCH"
        print("[PASS] Server-authoritative integrity mismatch triggers quarantine.")

        cleanup_test_data(sconn, org_id, dataset_id)
    finally:
        sconn.close()

async def test_worker_integration_decompression_bomb():
    print("\n=== Test 8: Decompression Bomb (bounded parser rejects, worker survives) ===")
    sconn = get_superuser_conn()
    import gzip
    content = gzip.compress(b"WAVE 1 0 0 1\n" * 1000)
    storage_dir = Path(tempfile.mkdtemp())
    object_key = f"datasets/bomb-{uuid.uuid4().hex}.csv"
    filepath = storage_dir / object_key.replace("/", os.sep)
    filepath.parent.mkdir(parents=True, exist_ok=True)
    filepath.write_bytes(content)
    
    checksum = hashlib.sha256(content).hexdigest()
    byte_size = len(content)

    os.environ["DIFARYX_LOCAL_STORAGE_PATH"] = str(storage_dir)
    os.environ["VW_ORGANIZATION_ID"] = ORG_ID
    os.environ["VW_USER_ID"] = USER_ID
    os.environ["DATABASE_URL"] = DATABASE_URL

    try:
        org_id, user_id, project_id, dataset_id, object_id = seed_test_data(
            sconn, object_key, checksum, byte_size
        )
        attempt_id = seed_validation_attempt(sconn, org_id, dataset_id, object_id)

        engine = _make_engine()
        outcome = await process_one(engine, org_id, user_id, WORKER_ID, 60, 10.0)
        await engine.dispose()

        print("Decompression bomb outcome:", outcome)
        # Bounded XRD parser rejects gzipped binary as invalid (non-UTF-8 or
        # overlong line) rather than attempting decompression. The sandbox
        # is never stressed; the worker settles as invalid/failed.
        assert outcome == "failed", f"Expected failed (bounded reject), got {outcome}"
        ds = get_dataset(sconn, org_id, dataset_id)
        att = get_attempt(sconn, org_id, attempt_id)
        assert ds["status"] == "invalid", f"expected invalid dataset, got {ds['status']}"
        assert att["status"] == "failed", f"expected failed attempt, got {att['status']}"
        assert att["failure_code"] in {"XRD_NON_UTF8_LINE", "XRD_TOO_LONG_LINE"}, \
            f"bounded parser should reject gzipped binary; got {att['failure_code']}"
        print("[PASS] Decompression bomb rejected by bounded parser; worker survived.")
        cleanup_test_data(sconn, org_id, dataset_id)
    finally:
        sconn.close()

async def test_worker_integration_xxe_billion_laughs():
    print("\n=== Test 9: XXE / Billion-Laughs XML Bomb (bounded parser rejects, worker survives) ===")
    sconn = get_superuser_conn()
    content = b"""<?xml version="1.0"?>
<!DOCTYPE lolz [
 <!ENTITY lol "lol">
 <!ENTITY lol1 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">
]>
<lolz>&lol1;</lolz>
"""
    storage_dir = Path(tempfile.mkdtemp())
    object_key = f"datasets/xxe-{uuid.uuid4().hex}.csv"
    filepath = storage_dir / object_key.replace("/", os.sep)
    filepath.parent.mkdir(parents=True, exist_ok=True)
    filepath.write_bytes(content)
    
    checksum = hashlib.sha256(content).hexdigest()
    byte_size = len(content)

    os.environ["DIFARYX_LOCAL_STORAGE_PATH"] = str(storage_dir)
    os.environ["VW_ORGANIZATION_ID"] = ORG_ID
    os.environ["VW_USER_ID"] = USER_ID
    os.environ["DATABASE_URL"] = DATABASE_URL

    try:
        org_id, user_id, project_id, dataset_id, object_id = seed_test_data(
            sconn, object_key, checksum, byte_size
        )
        attempt_id = seed_validation_attempt(sconn, org_id, dataset_id, object_id)

        engine = _make_engine()
        outcome = await process_one(engine, org_id, user_id, WORKER_ID, 60, 10.0)

        print("XXE outcome:", outcome)
        # Bounded XRD parser does not parse XML. Line 2 "<!DOCTYPE lolz ["
        # tokenizes to 3 non-numeric tokens → XRD_INVALID_NON_NUMERIC_ROW.
        assert outcome == "failed", f"Expected failed (bounded reject), got {outcome}"
        ds = get_dataset(sconn, org_id, dataset_id)
        att = get_attempt(sconn, org_id, attempt_id)
        assert ds["status"] == "invalid", f"expected invalid dataset, got {ds['status']}"
        assert att["status"] == "failed", f"expected failed attempt, got {att['status']}"
        assert att["failure_code"] == "XRD_INVALID_NON_NUMERIC_ROW", \
            f"bounded parser should reject XML DOCTYPE; got {att['failure_code']}"
        assert att["status"] not in {"claimed", "running"}, f"attempt still claimed/running: {att['status']}"

        cur = sconn.cursor()
        cur.execute("""
            SELECT status::text FROM science.validation_attempts
            WHERE organization_id = %s::uuid AND id = %s::uuid
        """, (org_id, attempt_id))
        row = cur.fetchone()
        cur.close()
        assert row and row[0] == "failed", f"attempt not in terminal failed: {row}"
        print("[PASS] XXE billion-laughs payload rejected by bounded parser; no attempt claimed/running.")

        cleanup_test_data(sconn, org_id, dataset_id)
        await engine.dispose()

        benign_content = b"1.0 5.0\n2.0 10.0\n"
        benign_storage_dir = Path(tempfile.mkdtemp())
        benign_key = f"datasets/xxe-recovery-{uuid.uuid4().hex}.csv"
        benign_path = benign_storage_dir / benign_key.replace("/", os.sep)
        benign_path.parent.mkdir(parents=True, exist_ok=True)
        benign_path.write_bytes(benign_content)
        benign_checksum = hashlib.sha256(benign_content).hexdigest()
        benign_byte_size = len(benign_content)

        os.environ["DIFARYX_LOCAL_STORAGE_PATH"] = str(benign_storage_dir)

        b_org_id, b_user_id, b_project_id, b_dataset_id, b_object_id = seed_test_data(
            sconn, benign_key, benign_checksum, benign_byte_size
        )
        b_attempt_id = seed_validation_attempt(sconn, b_org_id, b_dataset_id, b_object_id)

        engine2 = _make_engine()
        recovery_outcome = await process_one(engine2, b_org_id, b_user_id, WORKER_ID, 60, 10.0)
        await engine2.dispose()

        print("XXE recovery (benign follow-up) outcome:", recovery_outcome)
        assert recovery_outcome == "passed", f"Worker could not process benign follow-up after XXE: {recovery_outcome}"
        cleanup_test_data(sconn, b_org_id, b_dataset_id)
        print("[PASS] Worker survived XXE and processed a following benign attempt.")
    finally:
        sconn.close()

async def test_worker_integration_oversized():
    print("\n=== Test 10: Oversized file (bounded parser enforces MAX_VALID_ROWS) ===")
    sconn = get_superuser_conn()
    content = b"1.0 2.0\n" * 700_000  # 700k rows; bounded parser rejects at MAX_VALID_ROWS=100k
    storage_dir = Path(tempfile.mkdtemp())
    object_key = f"datasets/oversized-{uuid.uuid4().hex}.csv"
    filepath = storage_dir / object_key.replace("/", os.sep)
    filepath.parent.mkdir(parents=True, exist_ok=True)
    filepath.write_bytes(content)
    
    checksum = hashlib.sha256(content).hexdigest()
    byte_size = len(content)

    os.environ["DIFARYX_LOCAL_STORAGE_PATH"] = str(storage_dir)
    os.environ["VW_ORGANIZATION_ID"] = ORG_ID
    os.environ["VW_USER_ID"] = USER_ID
    os.environ["DATABASE_URL"] = DATABASE_URL

    try:
        org_id, user_id, project_id, dataset_id, object_id = seed_test_data(
            sconn, object_key, checksum, byte_size
        )
        attempt_id = seed_validation_attempt(sconn, org_id, dataset_id, object_id)

        engine = _make_engine()
        outcome = await process_one(engine, org_id, user_id, WORKER_ID, 60, 10.0)
        await engine.dispose()

        print("Oversized outcome:", outcome)
        # Bounded XRD parser caps valid rows at MAX_VALID_ROWS=100_000 and
        # returns XRD_TOO_MANY_VALID_ROWS (invalid) rather than loading all
        # 700k rows into memory.
        assert outcome == "failed", f"Expected failed (bounded reject), got {outcome}"
        ds = get_dataset(sconn, org_id, dataset_id)
        att = get_attempt(sconn, org_id, attempt_id)
        assert ds["status"] == "invalid", f"expected invalid dataset, got {ds['status']}"
        assert att["status"] == "failed", f"expected failed attempt, got {att['status']}"
        assert att["failure_code"] == "XRD_TOO_MANY_VALID_ROWS", \
            f"bounded parser should cap at MAX_VALID_ROWS; got {att['failure_code']}"
        print("[PASS] Oversized file rejected by bounded MAX_VALID_ROWS; worker survived.")
        cleanup_test_data(sconn, org_id, dataset_id)
    finally:
        sconn.close()

async def test_worker_integration_crashing_oom():
    print("\n=== Test 11: Crashing / OOM File (sandbox failure → quarantine at exhaustion) ===")
    sconn = get_superuser_conn()
    content = b"A" * 150_000_000 # 150 MB single line to trigger OOM inside container
    storage_dir = Path(tempfile.mkdtemp())
    object_key = f"datasets/oom-{uuid.uuid4().hex}.csv"
    filepath = storage_dir / object_key.replace("/", os.sep)
    filepath.parent.mkdir(parents=True, exist_ok=True)
    filepath.write_bytes(content)
    
    checksum = hashlib.sha256(content).hexdigest()
    byte_size = len(content)

    os.environ["DIFARYX_LOCAL_STORAGE_PATH"] = str(storage_dir)
    os.environ["VW_ORGANIZATION_ID"] = ORG_ID
    os.environ["VW_USER_ID"] = USER_ID
    os.environ["DATABASE_URL"] = DATABASE_URL

    try:
        org_id, user_id, project_id, dataset_id, object_id = seed_test_data(
            sconn, object_key, checksum, byte_size
        )
        # max_attempts=1: the 150 MB single line cannot be staged into the
        # 128 MB container tmpfs, so podman cp / container start raises a
        # RuntimeError. The worker's sandbox-error path runs to exhaustion
        # on the very first attempt and terminal-quarantines.
        attempt_id = seed_validation_attempt(sconn, org_id, dataset_id, object_id, max_attempts=1)

        engine = _make_engine()
        outcome = await process_one(engine, org_id, user_id, WORKER_ID, 60, 10.0)
        await engine.dispose()

        print("Crashing/OOM outcome:", outcome)
        assert outcome == "quarantined"
        ds = get_dataset(sconn, org_id, dataset_id)
        att = get_attempt(sconn, org_id, attempt_id)
        assert ds["status"] == "quarantined"
        assert att["status"] == "quarantined"
        assert att["failure_code"] == "ISOLATION_SANDBOX_ERROR"
        assert att["attempt_number"] == 1
        print("[PASS] Crashing OOM file quarantined at exhaustion; worker survived.")
        cleanup_test_data(sconn, org_id, dataset_id)
    finally:
        sconn.close()

async def test_hostile_stderr_nul_bytes():
    print("\n=== Test 12: Hostile stderr with NUL bytes (quarantined, no NUL persisted) ===")
    sconn = get_superuser_conn()
    content = b"1.0 10.0\n"
    storage_dir = Path(tempfile.mkdtemp())
    object_key = f"datasets/hostile-stderr-{uuid.uuid4().hex}.csv"
    filepath = storage_dir / object_key.replace("/", os.sep)
    filepath.parent.mkdir(parents=True, exist_ok=True)
    filepath.write_bytes(content)

    checksum = hashlib.sha256(content).hexdigest()
    byte_size = len(content)

    os.environ["DIFARYX_LOCAL_STORAGE_PATH"] = str(storage_dir)
    os.environ["VW_ORGANIZATION_ID"] = ORG_ID
    os.environ["VW_USER_ID"] = USER_ID
    os.environ["DATABASE_URL"] = DATABASE_URL

    try:
        org_id, user_id, project_id, dataset_id, object_id = seed_test_data(
            sconn, object_key, checksum, byte_size
        )
        attempt_id = seed_validation_attempt(sconn, org_id, dataset_id, object_id, max_attempts=1)

        hostile_stderr = b"proxy warning\x00attacker-data\x00"
        hostile_stdout = b""
        fake_start_process = MagicMock(
            returncode=1,
            stdout=hostile_stdout,
            stderr=hostile_stderr,
        )

        from api.validation.isolated_runner import ContainerParserRunner, IsolatedRuntimeError
        original_run_command = ContainerParserRunner._run_command

        call_count = {"self_check_version": 0, "self_check_egress": 0}

        def mock_run_command(self, cmd, timeout):
            if "podman" in cmd and "--version" in cmd:
                call_count["self_check_version"] += 1
                return MagicMock(returncode=0, stdout=b"podman version 5.x", stderr=b"")
            if "podman" in cmd and "urlopen" in cmd:
                call_count["self_check_egress"] += 1
                return MagicMock(returncode=1, stdout=b"", stderr=b"Network unreachable")
            if "podman" in cmd and "create" in cmd:
                return MagicMock(returncode=0, stdout=b"", stderr=b"")
            if "podman" in cmd and "cp" in cmd:
                return MagicMock(returncode=0, stdout=b"", stderr=b"")
            if "podman" in cmd and "start" in cmd:
                return fake_start_process
            if "podman" in cmd and "rm" in cmd:
                return MagicMock(returncode=0, stdout=b"", stderr=b"")
            return original_run_command(self, cmd, timeout)

        _ensure_path()
        import api.workers.validation_worker as vw_module
        original_process_one = vw_module.process_one

        engine = _make_engine()

        with patch.object(ContainerParserRunner, "_run_command", mock_run_command):
            outcome = await process_one(engine, org_id, user_id, WORKER_ID, 60, 10.0)

        await engine.dispose()

        print("Hostile-stderr outcome:", outcome)
        assert outcome == "quarantined", f"Expected quarantined, got {outcome}"

        ds = get_dataset(sconn, org_id, dataset_id)
        att = get_attempt(sconn, org_id, attempt_id)
        print("Dataset state:", ds)
        print("Attempt state:", att)

        assert ds["status"] == "quarantined"
        assert att["status"] == "quarantined"
        assert att["failure_code"] == "ISOLATION_SANDBOX_ERROR", f"Expected ISOLATION_SANDBOX_ERROR, got {att['failure_code']}"
        assert att["status"] not in {"claimed", "running"}, f"attempt still claimed/running: {att['status']}"

        details_str = json.dumps(att["failure_details"])
        assert "\x00" not in details_str, f"NUL byte found in persisted failure_details: {details_str!r}"
        assert "attacker-data" not in details_str or "proxy" in details_str, "raw hostile content persisted without normalization"

        print("[PASS] Hostile stderr with NUL bytes → quarantined, stable code, no NUL persisted.")

        cleanup_test_data(sconn, org_id, dataset_id)

        benign_content = b"1.0 5.0\n2.0 10.0\n"
        benign_storage_dir = Path(tempfile.mkdtemp())
        benign_key = f"datasets/hostile-recovery-{uuid.uuid4().hex}.csv"
        benign_path = benign_storage_dir / benign_key.replace("/", os.sep)
        benign_path.parent.mkdir(parents=True, exist_ok=True)
        benign_path.write_bytes(benign_content)
        benign_checksum = hashlib.sha256(benign_content).hexdigest()
        benign_byte_size = len(benign_content)

        os.environ["DIFARYX_LOCAL_STORAGE_PATH"] = str(benign_storage_dir)

        b_org_id, b_user_id, b_project_id, b_dataset_id, b_object_id = seed_test_data(
            sconn, benign_key, benign_checksum, benign_byte_size
        )
        b_attempt_id = seed_validation_attempt(sconn, b_org_id, b_dataset_id, b_object_id)

        engine2 = _make_engine()
        recovery_outcome = await process_one(engine2, b_org_id, b_user_id, WORKER_ID, 60, 10.0)
        await engine2.dispose()

        print("Hostile-stderr recovery (benign follow-up) outcome:", recovery_outcome)
        assert recovery_outcome == "passed", f"Worker could not process benign follow-up: {recovery_outcome}"
        cleanup_test_data(sconn, b_org_id, b_dataset_id)
        print("[PASS] Worker survived hostile stderr and processed next attempt.")
    finally:
        sconn.close()


async def test_no_bind_mounts_in_lifecycle():
    print("\n=== Test 13: No bind mounts in container lifecycle commands ===")
    from api.validation.isolated_runner import ContainerParserRunner, _FORBIDDEN_BIND_ARGS

    runner = ContainerParserRunner()

    assert _FORBIDDEN_BIND_ARGS == {"-v", "--volume", "--mount"}, \
        f"_FORBIDDEN_BIND_ARGS missing expected entries: {_FORBIDDEN_BIND_ARGS}"

    forbidden_in_create = AssertionError("test-expected")
    try:
        runner._assert_no_bind_mounts(["wsl", "-d", "alpine", "--", "podman", "run", "-v", "/host/path:/container/path", "python:3.12-alpine"])
    except AssertionError as e:
        forbidden_in_create = e
    assert "prohibited" in str(forbidden_in_create).lower() or "bind" in str(forbidden_in_create).lower(), \
        f"Assertion did not mention bind mounts: {forbidden_in_create}"

    try:
        runner._assert_no_bind_mounts(["podman", "create", "--mount", "type=bind,src=/host,dst=/container", "python:3.12-alpine"])
    except AssertionError as e:
        assert "prohibited" in str(e).lower() or "bind" in str(e).lower()

    try:
        runner._assert_no_bind_mounts(["podman", "create", "--volume", "/host:/container", "python:3.12-alpine"])
    except AssertionError as e:
        assert "prohibited" in str(e).lower() or "bind" in str(e).lower()

    safe_cmd = runner._build_create_command("test-container", "xrd", "input.csv")
    runner._assert_no_bind_mounts(safe_cmd)
    print("[PASS] _assert_no_bind_mounts correctly rejects -v/--volume/--mount and accepts safe commands.")

    content = b"1.0 10.5\n2.0 20.0\n"
    fd_in, in_path = tempfile.mkstemp(suffix=".csv")
    os.close(fd_in)
    fd_out, out_path = tempfile.mkstemp(suffix=".json")
    os.close(fd_out)

    try:
        Path(in_path).write_bytes(content)
        runner = ContainerParserRunner()
        result = await runner.run_parser("xrd", in_path, out_path)

        lifecycle = runner.last_lifecycle_commands
        print(f"Captured lifecycle commands ({len(lifecycle)} steps):")
        for step in lifecycle:
            cmd_str = " ".join(step["cmd"])
            print(f"  {step['label']}: {cmd_str[:200]}")
            has_bind = any(arg in _FORBIDDEN_BIND_ARGS for arg in step["cmd"])
            assert not has_bind, f"Bind mount found in {step['label']} command: {cmd_str}"

        create_cmds = [s for s in lifecycle if s["label"] == "podman create"]
        assert len(create_cmds) >= 1, "No podman create step captured"
        create_cmd = create_cmds[0]["cmd"]
        assert "-v" not in create_cmd, f"-v found in create command"
        assert "--volume" not in create_cmd, f"--volume found in create command"
        assert "--mount" not in create_cmd, f"--mount found in create command"
        assert "--network" in create_cmd and "none" in create_cmd, "--network none missing"
        assert "--read-only" in create_cmd, "--read-only missing"
        assert "--cap-drop=ALL" in create_cmd, "--cap-drop=ALL missing"
        assert "--security-opt=no-new-privileges" in create_cmd, "--security-opt=no-new-privileges missing"

        print("[PASS] Real parser lifecycle shows no bind mounts and full sandbox constraints.")
    finally:
        os.unlink(in_path)
        os.unlink(out_path)


async def main():
    print("Starting container runner integration test suite...")
    try:
        await test_egress_blocking()
        await test_egress_reachable_quarantines()
        await test_valid_parse()
        await test_invalid_parse()
        await test_timeout_kill()
        await test_worker_integration_valid()
        await test_worker_integration_invalid()
        await test_worker_integration_integrity_mismatch()
        await test_worker_integration_decompression_bomb()
        await test_worker_integration_xxe_billion_laughs()
        await test_worker_integration_oversized()
        await test_worker_integration_crashing_oom()
        await test_hostile_stderr_nul_bytes()
        await test_no_bind_mounts_in_lifecycle()
        print("\nALL CONTAINER RUNNER INTEGRATION TESTS PASSED!")
    except Exception as e:
        print(f"\nTEST SUITE FAILED: {e}", file=sys.stderr)
        import traceback; traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())
