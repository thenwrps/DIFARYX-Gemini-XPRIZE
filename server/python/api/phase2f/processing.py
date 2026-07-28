"""Existing-engine adapter and canonical evidence builder for XRD uploads."""

from __future__ import annotations

import hashlib
import json
import math
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple

from api.schemas import XRDProcessRequest


MIN_POINTS = 10
MAX_POINTS = 10_000
TOKEN_SPLIT_RE = re.compile(r"[\s,;]+")


class XRDProcessingInputError(ValueError):
    """Validated file cannot be converted into a processable XRD signal."""


@dataclass(frozen=True)
class CanonicalXrdEvidencePayload:
    schema_version: str
    processor_version: str
    content: Dict[str, Any]
    content_sha256: str
    validation_warnings: List[str]
    scientific_limitations: List[str]
    provenance: Dict[str, Any]


def load_numeric_xrd_signal(file_path: str) -> Tuple[List[float], List[float]]:
    x_values: List[float] = []
    y_values: List[float] = []
    malformed_rows = 0
    previous_x: float | None = None

    with open(file_path, "r", encoding="utf-8", errors="strict") as handle:
        for line_number, line in enumerate(handle, start=1):
            stripped = line.strip()
            if not stripped or stripped.startswith(("#", "%")):
                continue
            parts = [part for part in TOKEN_SPLIT_RE.split(stripped) if part]
            if len(parts) < 2:
                if any(character.isalpha() for character in stripped):
                    continue
                malformed_rows += 1
                continue
            try:
                x_value = float(parts[0])
                y_value = float(parts[1])
            except ValueError:
                if any(character.isalpha() for character in stripped):
                    continue
                raise XRDProcessingInputError(
                    f"Non-numeric XRD row at line {line_number}"
                )
            if not math.isfinite(x_value) or not math.isfinite(y_value):
                raise XRDProcessingInputError(
                    f"Non-finite XRD value at line {line_number}"
                )
            if previous_x is not None and x_value <= previous_x:
                raise XRDProcessingInputError(
                    "XRD two-theta values must be strictly increasing"
                )
            if y_value < 0:
                raise XRDProcessingInputError(
                    "XRD intensity values must be non-negative"
                )
            x_values.append(x_value)
            y_values.append(y_value)
            previous_x = x_value
            if len(x_values) > MAX_POINTS:
                raise XRDProcessingInputError(
                    f"XRD signal exceeds the processor limit of {MAX_POINTS} points"
                )

    if len(x_values) < MIN_POINTS:
        raise XRDProcessingInputError(
            f"XRD signal requires at least {MIN_POINTS} numeric points"
        )
    if malformed_rows:
        raise XRDProcessingInputError(
            "XRD signal contains malformed or truncated numeric rows"
        )
    if x_values[-1] - x_values[0] < 1.0:
        raise XRDProcessingInputError(
            "XRD two-theta range is too narrow for persistent processing"
        )
    return x_values, y_values


def _legacy_request_parameters(
    processing_parameters: Dict[str, Any],
    x_values: List[float],
) -> Dict[str, Any]:
    baseline = processing_parameters.get("baseline") or {}
    smoothing = processing_parameters.get("smoothing") or {}
    detection = processing_parameters.get("peak_detection") or processing_parameters.get("peakDetection") or {}
    fitting = processing_parameters.get("peak_fitting") or processing_parameters.get("peakFitting") or {}
    range_parameters = processing_parameters.get("range") or {}
    radiation = processing_parameters.get("radiation") or {}

    baseline_method_map = {
        "asymmetric_ls": "Asymmetric LS",
        "polynomial": "Polynomial",
        "rolling_ball": "Rolling Ball",
        "none": "None",
    }
    smoothing_method_map = {
        "savitzky_golay": "Savitzky-Golay",
        "moving_average": "Moving Average",
        "none": "None",
    }
    fit_model_map = {
        "pseudo_voigt": "Pseudo-Voigt",
        "gaussian": "Gaussian",
        "lorentzian": "Lorentzian",
    }
    return {
        "baseline": {
            "method": baseline_method_map.get(
                str(baseline.get("method", "asymmetric_ls")).lower(),
                "Asymmetric LS",
            ),
            "poly_order": int(baseline.get("poly_order", baseline.get("polynomial_order", 3))),
            "half_window": int(baseline.get("half_window", 50)),
        },
        "smoothing": {
            "method": smoothing_method_map.get(
                str(smoothing.get("method", "savitzky_golay")).lower(),
                "Savitzky-Golay",
            ),
            "window_length": int(
                smoothing.get("window_length", smoothing.get("window_size", 11))
            ),
        },
        "fit_model": {
            "model_type": fit_model_map.get(
                str(fitting.get("model", fitting.get("model_type", "pseudo_voigt"))).lower(),
                "Pseudo-Voigt",
            )
        },
        "wavelength": float(radiation.get("wavelength_angstrom", 1.5406)),
        "theta_min": float(
            range_parameters.get("two_theta_min", max(0.0, x_values[0]))
        ),
        "theta_max": float(
            range_parameters.get("two_theta_max", min(180.0, x_values[-1]))
        ),
        "peak_threshold": float(
            detection.get("min_height_ratio", detection.get("peak_threshold", 0.12))
        ),
        "min_prominence": float(
            detection.get("min_prominence", 0.08)
        ),
    }


def _candidate_rows(reference_match: Dict[str, Any] | None) -> List[Dict[str, Any]]:
    if not reference_match:
        return []
    rows: List[Dict[str, Any]] = []
    for candidate in reference_match.get("ranked_candidates") or []:
        matched = int(candidate.get("matched_peak_count") or 0)
        total = int(candidate.get("reference_peak_count") or matched)
        rows.append(
            {
                "label": str(candidate.get("phase_label") or candidate.get("phase_id") or "Unlabelled candidate"),
                "score": float(candidate.get("score") or 0.0),
                "matchedFeatures": matched,
                "totalFeatures": total,
                "missingFeatures": [],
                "unexplainedFeatures": [],
            }
        )
    return rows


def _evidence_packet(
    *,
    dataset: Dict[str, Any],
    processed: Dict[str, Any],
    limitations: List[str],
    warnings: List[str],
) -> Dict[str, Any]:
    detected = processed.get("detected_peaks") or []
    fitted = processed.get("fitted_peaks") or []
    reference_match = processed.get("reference_match_v2")
    candidates = _candidate_rows(reference_match)
    if not candidates:
        observed = fitted or detected
        candidates = [
            {
                "label": "Unassigned XRD pattern - approved reference match required",
                "score": 0.0,
                "matchedFeatures": 0,
                "totalFeatures": max(1, len(observed)),
                "missingFeatures": [],
                "unexplainedFeatures": [
                    f"{float(peak.get('center', peak.get('position', 0.0))):.4g} deg"
                    for peak in observed[:25]
                ],
            }
        ]
    primary_score = candidates[0]["score"] if candidates else 0.0
    material_system = (
        (dataset.get("experiment_context") or {}).get("materialSystem")
        or (dataset.get("experiment_context") or {}).get("material_system")
        or "Undeclared XRD sample"
    )
    return {
        "context": "xrd",
        "datasetId": str(dataset["id"]),
        "datasetName": str(dataset.get("title") or dataset.get("display_filename") or "XRD dataset"),
        "materialSystem": str(material_system),
        "signalSummary": {
            "featureCount": len(fitted) or len(detected),
            "noiseLevel": float(processed.get("baseline_deviation") or 0.0),
            "signalQuality": (
                "high"
                if float(processed.get("sn_ratio") or 0.0) >= 10
                else "medium"
                if float(processed.get("sn_ratio") or 0.0) >= 3
                else "low"
            ),
        },
        "detectedFeatures": [
            {
                "position": float(peak.get("center", peak.get("position", 0.0))),
                "intensity": float(peak.get("amplitude", peak.get("intensity", 0.0))),
                "assignment": "XRD peak observation",
                "category": "crystallographic_evidence",
            }
            for peak in (fitted or detected)
        ],
        "candidates": candidates,
        "fusedScore": float(primary_score),
        "uncertaintyFlags": list(dict.fromkeys([*warnings, *limitations])),
        "processingNotes": [
            "Evidence was loaded from a server-authorized immutable raw object.",
            "XRD candidate matching is validation-limited and does not establish phase purity.",
        ],
        "toolTrace": [
            {
                "tool": "xrd-persistent-processor",
                "status": "succeeded",
                "datasetId": str(dataset["id"]),
            }
        ],
        "parameterContext": dataset.get("processing_parameters") or {},
        "evidenceOutputs": {
            "snRatio": processed.get("sn_ratio"),
            "baselineDeviation": processed.get("baseline_deviation"),
            "peakResolution": processed.get("peak_resolution"),
            "claimBoundary": processed.get("xrd_claim_boundary"),
        },
        "analysisMode": "persistent_server",
    }


async def build_canonical_xrd_evidence(
    *,
    file_path: str,
    dataset: Dict[str, Any],
    parser_result: Dict[str, Any],
    validation_attempt_id: str,
    upload_session_id: str,
    original_object_id: str,
    authoritative_sha256: str,
) -> CanonicalXrdEvidencePayload:
    x_values, y_values = load_numeric_xrd_signal(file_path)
    request_data = {
        "x": x_values,
        "y": y_values,
        **_legacy_request_parameters(
            dict(dataset.get("processing_parameters") or {}),
            x_values,
        ),
    }
    request = XRDProcessRequest.model_validate(request_data)

    # Importing the existing gateway function here avoids a second scientific
    # implementation. The worker, not the browser, invokes this adapter.
    from api.gateway import BACKEND_SCHEMA_VERSION, process_xrd

    response = await process_xrd(request)
    processed = response.model_dump(mode="json")

    warnings = [str(item) for item in parser_result.get("warnings") or []]
    reference_match = processed.get("reference_match_v2")
    if reference_match and reference_match.get("reason"):
        warnings.append(str(reference_match["reason"]))
    warnings = list(dict.fromkeys(warnings))
    limitations = [
        "XRD evidence supports crystallographic and phase-related consistency, not composition.",
        "A reference-supported candidate does not independently confirm phase identity or phase purity.",
        "Complementary composition-sensitive or vibrational evidence remains required for broader material conclusions.",
    ]
    claim_boundary = processed.get("xrd_claim_boundary") or {}
    for item in claim_boundary.get("limitations") or []:
        limitations.append(str(item))
    limitations = list(dict.fromkeys(limitations))

    provenance = {
        "datasetId": str(dataset["id"]),
        "projectId": str(dataset["project_id"]),
        "uploadSessionId": upload_session_id,
        "validationAttemptId": validation_attempt_id,
        "originalObjectId": original_object_id,
        "originalObjectSha256": authoritative_sha256,
        "processor": "DIFARYX XRD Processing Engine",
        "processorVersion": BACKEND_SCHEMA_VERSION,
        "schemaVersion": "phase2f-xrd-evidence-v1",
        "source": "server_authorized_object",
    }
    content = {
        "technique": "xrd",
        "dataset": {
            "id": str(dataset["id"]),
            "title": dataset.get("title"),
            "displayFilename": dataset.get("display_filename"),
        },
        "measurementMetadata": dataset.get("measurement_metadata") or {},
        "processingParameters": dataset.get("processing_parameters") or {},
        "experimentContext": dataset.get("experiment_context") or {},
        "validation": {
            "status": "succeeded",
            "warnings": warnings,
            "parser": {
                "validDataRows": parser_result.get("valid_data_rows"),
                "techniqueIdentityClass": parser_result.get("technique_identity_class"),
                "techniqueIdentityConfirmed": parser_result.get("technique_identity_confirmed"),
            },
        },
        "processedOutput": processed,
        "evidencePacket": _evidence_packet(
            dataset=dataset,
            processed=processed,
            limitations=limitations,
            warnings=warnings,
        ),
        "scientificLimitations": limitations,
        "provenance": provenance,
    }
    canonical = json.dumps(
        content, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    ).encode("utf-8")
    return CanonicalXrdEvidencePayload(
        schema_version="phase2f-xrd-evidence-v1",
        processor_version=BACKEND_SCHEMA_VERSION,
        content=content,
        content_sha256=hashlib.sha256(canonical).hexdigest(),
        validation_warnings=warnings,
        scientific_limitations=limitations,
        provenance=provenance,
    )
