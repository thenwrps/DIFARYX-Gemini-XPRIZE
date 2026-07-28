from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
import sys
from types import ModuleType, SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import UUID


sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "server" / "python"))

from api.phase2f.processing import (  # noqa: E402
    XRDProcessingInputError,
    _evidence_packet,
    build_canonical_xrd_evidence,
    load_numeric_xrd_signal,
)
from api.phase2f.filenames import sanitize_display_filename  # noqa: E402


class Phase2FProcessingTests(unittest.TestCase):
    def write_signal(self, content: str) -> str:
        handle = tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", suffix=".xy", delete=False
        )
        self.addCleanup(lambda: Path(handle.name).unlink(missing_ok=True))
        with handle:
            handle.write(content)
        return handle.name

    def test_accepts_headered_strictly_increasing_numeric_signal(self) -> None:
        path = self.write_signal(
            "two_theta intensity\n"
            + "\n".join(f"{10 + index * 0.2:.1f} {index + 1}" for index in range(12))
        )
        x_values, y_values = load_numeric_xrd_signal(path)
        self.assertEqual(len(x_values), 12)
        self.assertEqual(x_values[0], 10.0)
        self.assertEqual(y_values[-1], 12.0)

    def test_rejects_non_monotonic_non_finite_negative_and_short_signals(self) -> None:
        cases = {
            "non-monotonic": "\n".join(
                f"{10 + (index if index != 6 else 4) * 0.2} {index + 1}"
                for index in range(12)
            ),
            "non-finite": "\n".join(
                f"{10 + index * 0.2} {'nan' if index == 6 else index + 1}"
                for index in range(12)
            ),
            "negative": "\n".join(
                f"{10 + index * 0.2} {-1 if index == 6 else index + 1}"
                for index in range(12)
            ),
            "short": "\n".join(f"{10 + index * 0.2} {index + 1}" for index in range(9)),
        }
        for label, content in cases.items():
            with self.subTest(label=label):
                with self.assertRaises(XRDProcessingInputError):
                    load_numeric_xrd_signal(self.write_signal(content))

    def test_no_reference_match_yields_bounded_unassigned_candidate(self) -> None:
        dataset_id = UUID("33333333-3333-4333-8333-333333333333")
        packet = _evidence_packet(
            dataset={
                "id": dataset_id,
                "title": "Sample",
                "experiment_context": {},
                "processing_parameters": {},
            },
            processed={
                "detected_peaks": [
                    {"position": 31.2, "intensity": 100},
                    {"position": 36.8, "intensity": 80},
                ],
                "sn_ratio": 5,
            },
            limitations=["Phase identity is not established."],
            warnings=[],
        )
        candidate = packet["candidates"][0]
        self.assertIn("Unassigned XRD pattern", candidate["label"])
        self.assertEqual(candidate["score"], 0.0)
        self.assertEqual(candidate["matchedFeatures"], 0)
        self.assertTrue(candidate["unexplainedFeatures"])
        self.assertIn("Phase identity is not established.", packet["uncertaintyFlags"])

    def test_filename_sanitization_is_deterministic_for_unicode_and_paths(self) -> None:
        self.assertEqual(sanitize_display_filename("ตัวอย่าง.csv"), "_.csv")
        self.assertEqual(
            sanitize_display_filename("../../unsafe sample.xy"),
            "unsafe sample.xy",
        )


class Phase2FCanonicalEvidenceTests(unittest.IsolatedAsyncioTestCase):
    async def test_existing_processor_output_becomes_deterministic_canonical_evidence(self) -> None:
        handle = tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", suffix=".xy", delete=False
        )
        self.addCleanup(lambda: Path(handle.name).unlink(missing_ok=True))
        with handle:
            handle.write(
                "two_theta intensity\n"
                + "\n".join(
                    f"{10 + index * 0.2:.1f} {index + 1}"
                    for index in range(12)
                )
            )
        processed = {
            "x": [10 + index * 0.2 for index in range(12)],
            "y_raw": [index + 1 for index in range(12)],
            "y_smoothed": [index + 1 for index in range(12)],
            "y_baseline": [0.0] * 12,
            "y_corrected": [index + 1 for index in range(12)],
            "y_residual": [0.0] * 12,
            "detected_peaks": [{"position": 11.0, "intensity": 6.0}],
            "fitted_peaks": [],
            "reference_match_v2": None,
            "sn_ratio": 5.0,
            "baseline_deviation": 0.0,
            "peak_resolution": "screening-grade",
            "xrd_claim_boundary": {
                "limitations": ["Phase purity requires additional validation."]
            },
        }
        response = SimpleNamespace(model_dump=lambda mode: processed)
        gateway = ModuleType("api.gateway")
        gateway.BACKEND_SCHEMA_VERSION = "test-processor-v1"
        gateway.process_xrd = AsyncMock(return_value=response)
        dataset = {
            "id": UUID("33333333-3333-4333-8333-333333333333"),
            "project_id": UUID("22222222-2222-4222-8222-222222222222"),
            "title": "Canonical XRD",
            "display_filename": "sample.xy",
            "measurement_metadata": {"radiation": "Cu K-alpha"},
            "processing_parameters": {"smoothing": {"method": "savitzky_golay"}},
            "experiment_context": {"atmosphere": "air"},
        }
        arguments = {
            "file_path": handle.name,
            "dataset": dataset,
            "parser_result": {
                "warnings": ["Header retained as metadata."],
                "valid_data_rows": 12,
                "technique_identity_class": "no_identity_evidence",
                "technique_identity_confirmed": False,
            },
            "validation_attempt_id": "44444444-4444-4444-8444-444444444444",
            "upload_session_id": "55555555-5555-4555-8555-555555555555",
            "original_object_id": "66666666-6666-4666-8666-666666666666",
            "authoritative_sha256": "a" * 64,
        }
        with patch.dict(sys.modules, {"api.gateway": gateway}):
            first = await build_canonical_xrd_evidence(**arguments)
            second = await build_canonical_xrd_evidence(**arguments)

        self.assertEqual(first.content_sha256, second.content_sha256)
        self.assertEqual(first.schema_version, "phase2f-xrd-evidence-v1")
        self.assertEqual(first.processor_version, "test-processor-v1")
        self.assertEqual(
            first.content["measurementMetadata"]["radiation"],
            "Cu K-alpha",
        )
        self.assertEqual(
            first.content["processedOutput"]["x"],
            processed["x"],
        )
        self.assertIn(
            "Phase purity requires additional validation.",
            first.scientific_limitations,
        )
        self.assertIn("Unassigned XRD pattern", first.content["evidencePacket"]["candidates"][0]["label"])
        gateway.process_xrd.assert_awaited()


if __name__ == "__main__":
    unittest.main()
