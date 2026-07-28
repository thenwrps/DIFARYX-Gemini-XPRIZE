from __future__ import annotations

from pathlib import Path
import unittest


MIGRATION = (
    Path(__file__).resolve().parents[1]
    / "migrations"
    / "versions"
    / "0017_persistent_xrd_vertical_slice.py"
)
READINESS = (
    Path(__file__).resolve().parents[2]
    / "server"
    / "python"
    / "api"
    / "db"
    / "engine.py"
)


class Phase2FMigrationContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.source = MIGRATION.read_text(encoding="utf-8")

    def test_revision_chain_and_forward_only_provenance(self) -> None:
        self.assertIn('revision = "0017"', self.source)
        self.assertIn('down_revision = "0016"', self.source)
        self.assertIn("Migration 0017 is forward-only", self.source)
        self.assertIn(
            'EXPECTED_ALEMBIC_REVISION = "0017"',
            READINESS.read_text(encoding="utf-8"),
        )

    def test_persistent_tables_force_rls_and_have_tenant_policies(self) -> None:
        for table in (
            "xrd_evidence_snapshots",
            "reasoning_runs",
            "notebook_reasoning_references",
        ):
            self.assertIn(f"CREATE TABLE science.{table}", self.source)
        self.assertIn("ENABLE ROW LEVEL SECURITY", self.source)
        self.assertIn("FORCE ROW LEVEL SECURITY", self.source)
        self.assertIn("identity.current_organization_id()", self.source)

    def test_evidence_is_immutable_and_reasoning_links_checksum(self) -> None:
        self.assertIn("checksum_algorithm", self.source)
        self.assertIn("guard_xrd_evidence_immutability", self.source)
        self.assertIn("XRD evidence snapshots are immutable", self.source)
        self.assertIn("evidence_content_sha256", self.source)
        self.assertIn("reasoning_evidence_fk", self.source)
        self.assertIn("notebook_reference_reasoning_fk", self.source)
        self.assertIn("reasoning_project_dataset_evidence_id_uq", self.source)
        self.assertIn("validation_attempts_dataset_id_uq", self.source)

    def test_worker_requires_evidence_before_valid_xrd_state(self) -> None:
        self.assertIn("valid XRD dataset requires canonical evidence", self.source)
        self.assertIn("datasets_xrd_evidence_status", self.source)
        self.assertIn("current_evidence_id", self.source)


if __name__ == "__main__":
    unittest.main()
