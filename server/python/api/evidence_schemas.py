"""
DIFARYX Evidence Registry — Normalized Scientific Evidence Schemas.

Pydantic models for the multi-technique Evidence Registry.
These schemas are technique-agnostic and designed to normalize evidence
from any scientific skill (XRD, XPS, FTIR, Raman, Fusion, etc.)
into a unified registry-compatible format.

All scientific language MUST be bounded:
  - "phase indication" is allowed
  - "phase-purity confirmation requires additional validation" is allowed
  - "confirmed phase purity" is forbidden
  - No absolute identity claims without qualification
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


# ============================================================================
# Enums
# ============================================================================


class EvidenceSchemaVersion(str, Enum):
    """Supported evidence schema versions."""
    V1_0_0 = "1.0.0"


# ============================================================================
# Core Evidence Record
# ============================================================================


class EvidenceRecord(BaseModel):
    """
    Normalized scientific evidence record stored in the Evidence Registry.

    This is the canonical format for all evidence, regardless of the
    originating technique. It preserves the full scientific reasoning chain:
    observations → claim boundaries → validation gaps → agent-ready summary.
    """
    evidence_id: str = Field(
        description="UUIDv4 unique identifier for this evidence record.",
    )
    project_id: str = Field(
        description="Project this evidence belongs to.",
    )
    schema_version: str = Field(
        default=EvidenceSchemaVersion.V1_0_0.value,
        description="Schema version identifier.",
    )
    technique: str = Field(
        description="Experimental technique (XRD, XPS, FTIR, Raman, Fusion, etc.).",
    )
    skill_id: str = Field(
        description="ID of the science skill that produced this evidence.",
    )
    skill_label: str = Field(
        description="Display label of the science skill.",
    )
    input_reference: str = Field(
        description="SHA-256 hash or identifier referencing the input dataset.",
    )
    processing_summary: str = Field(
        description="Summary of processing parameters used to derive this evidence.",
    )
    scientific_observations: List[str] = Field(
        default_factory=list,
        description="Bounded scientific observations derived from the data.",
    )
    claim_boundaries: List[str] = Field(
        default_factory=list,
        description="Validation constraints and scientific limitations.",
    )
    validation_gaps: List[str] = Field(
        default_factory=list,
        description="Open validation gaps requiring complementary evidence.",
    )
    agent_ready_summary: str = Field(
        description="LLM-optimized summary using bounded scientific language.",
    )
    raw_result: Dict[str, Any] = Field(
        default_factory=dict,
        description="JSON-safe dictionary of raw processor outputs.",
    )
    provenance: Dict[str, Any] = Field(
        default_factory=dict,
        description="Provenance metadata: processing params, source, timestamps.",
    )
    created_at: str = Field(
        description="ISO UTC timestamp of record creation.",
    )
    sample_id: Optional[str] = Field(
        default=None,
        description="Optional sample identifier for provenance tracking.",
    )
    source_file: Optional[str] = Field(
        default=None,
        description="Optional source file path or name for provenance tracking.",
    )
    validation_status: str = Field(
        default="needs_review",
        description="Validation readiness status: needs_review, reviewed, accepted.",
    )
    agent_readiness: bool = Field(
        default=False,
        description="Whether this evidence is ready for agent consumption.",
    )
    tags: List[str] = Field(
        default_factory=list,
        description="Optional tags for filtering and categorization.",
    )


# ============================================================================
# Request Schemas
# ============================================================================


class EvidenceCreateRequest(BaseModel):
    """
    Request body for creating a generic evidence record via POST /evidence.

    All fields are provided by the caller. The registry assigns evidence_id
    and created_at.
    """
    project_id: str = Field(
        description="Project this evidence belongs to.",
    )
    technique: str = Field(
        description="Experimental technique.",
    )
    skill_id: str = Field(
        default="manual",
        description="ID of the science skill that produced this evidence.",
    )
    skill_label: str = Field(
        default="Manual Entry",
        description="Display label of the science skill.",
    )
    input_reference: str = Field(
        default="",
        description="SHA-256 hash or identifier referencing the input dataset.",
    )
    processing_summary: str = Field(
        default="",
        description="Summary of processing parameters.",
    )
    scientific_observations: List[str] = Field(
        default_factory=list,
        description="Bounded scientific observations.",
    )
    claim_boundaries: List[str] = Field(
        default_factory=list,
        description="Validation constraints.",
    )
    validation_gaps: List[str] = Field(
        default_factory=list,
        description="Open validation gaps.",
    )
    agent_ready_summary: str = Field(
        default="",
        description="LLM-optimized summary.",
    )
    raw_result: Dict[str, Any] = Field(
        default_factory=dict,
        description="Raw processor output.",
    )
    provenance: Dict[str, Any] = Field(
        default_factory=dict,
        description="Provenance metadata.",
    )
    sample_id: Optional[str] = Field(
        default=None,
        description="Optional sample identifier for provenance tracking.",
    )
    source_file: Optional[str] = Field(
        default=None,
        description="Optional source file path or name for provenance tracking.",
    )
    validation_status: str = Field(
        default="needs_review",
        description="Validation readiness status: needs_review, reviewed, accepted.",
    )
    agent_readiness: bool = Field(
        default=False,
        description="Whether this evidence is ready for agent consumption.",
    )
    tags: List[str] = Field(
        default_factory=list,
        description="Optional tags.",
    )


# ============================================================================
# XRD Ingest Body
# ============================================================================


class EvidenceIngestXRDBody(BaseModel):
    """
    Request body for POST /evidence/ingest/xrd.

    Accepts the result of an already-completed XRD processing run
    (as returned by POST /process or POST /skills/xrd/process)
    and converts it into an EvidenceRecord via the XRD normalizer.

    The normalizer does NOT re-run the XRD pipeline. It wraps an
    existing result into the evidence schema.
    """
    project_id: str = Field(
        description="Project this evidence belongs to.",
    )
    xrd_result: Dict[str, Any] = Field(
        description=(
            "The XRD processing result dictionary, as returned by "
            "POST /process. Must contain at least: x, y_raw, detected_peaks, "
            "fitted_peaks, sn_ratio."
        ),
    )
    processing_params: Dict[str, Any] = Field(
        default_factory=dict,
        description="Processing parameters that produced the result (for provenance).",
    )
    sample_id: Optional[str] = Field(
        default=None,
        description="Optional sample identifier for provenance tracking.",
    )
    source_file: Optional[str] = Field(
        default=None,
        description="Optional source file path or name for provenance tracking.",
    )
    tags: List[str] = Field(
        default_factory=list,
        description="Optional tags for categorization.",
    )


# ============================================================================
# Summary and Agent Context
# ============================================================================


class EvidenceSummary(BaseModel):
    """
    Aggregated summary of all evidence for a project.

    Used by GET /projects/{project_id}/evidence/summary.
    """
    project_id: str = Field(
        description="Project identifier.",
    )
    total_evidence_count: int = Field(
        description="Total number of evidence records for this project.",
    )
    techniques: List[str] = Field(
        default_factory=list,
        description="List of unique techniques represented in the project.",
    )
    latest_evidence_ids: List[str] = Field(
        default_factory=list,
        description="Evidence IDs of the most recent record per technique.",
    )
    latest_by_technique: Dict[str, str] = Field(
        default_factory=dict,
        description="Mapping of technique name to latest evidence_id.",
    )
    open_validation_gaps: List[str] = Field(
        default_factory=list,
        description="Deduplicated list of all open validation gaps across evidence.",
    )


class AgentContext(BaseModel):
    """
    Agent-ready context bundle for a project.

    Used by GET /projects/{project_id}/agent-context.
    Provides the agent with the full current state of evidence
    for reasoning about next steps.
    """
    project_id: str = Field(
        description="Project identifier.",
    )
    evidence_count: int = Field(
        description="Number of evidence records available.",
    )
    techniques_available: List[str] = Field(
        default_factory=list,
        description="Techniques with evidence in this project.",
    )
    latest_summaries: List[Dict[str, Any]] = Field(
        default_factory=list,
        description=(
            "Per-technique latest evidence summaries. Each dict contains "
            "technique, evidence_id, agent_ready_summary, claim_boundaries, "
            "validation_gaps."
        ),
    )
    all_validation_gaps: List[str] = Field(
        default_factory=list,
        description="Deduplicated list of all open validation gaps.",
    )
    all_claim_boundaries: List[str] = Field(
        default_factory=list,
        description="Deduplicated list of all claim boundaries across evidence.",
    )
