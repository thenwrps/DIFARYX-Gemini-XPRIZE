"""
DIFARYX Evidence Registry — In-Memory Evidence Store.

Multi-technique in-memory registry for scientific evidence records.
Provides CRUD operations, project-indexed queries, and agent-context
aggregation.  This is backend infrastructure; it does not depend on
any specific technique's processing logic.

All evidence records stored here conform to the EvidenceRecord schema
defined in api/evidence_schemas.py.
"""

from __future__ import annotations

import logging
import uuid
from collections import OrderedDict
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from api.evidence_schemas import (
    AgentContext,
    EvidenceCreateRequest,
    EvidenceRecord,
    EvidenceSummary,
)

logger = logging.getLogger("difaryx.evidence.registry")


class EvidenceRegistry:
    """
    In-memory evidence registry.

    Stores EvidenceRecord instances indexed by evidence_id and project_id.
    Designed for single-process operation (not thread-safe).
    """

    def __init__(self) -> None:
        # Primary store: evidence_id -> EvidenceRecord
        self._store: OrderedDict[str, EvidenceRecord] = OrderedDict()
        # Project index: project_id -> [evidence_id, ...] (insertion order)
        self._project_index: Dict[str, List[str]] = {}

    # ------------------------------------------------------------------
    # Core CRUD
    # ------------------------------------------------------------------

    def add(self, record: EvidenceRecord) -> EvidenceRecord:
        """
        Store an already-constructed EvidenceRecord.

        Parameters
        ----------
        record : EvidenceRecord
            Fully formed evidence record.

        Returns
        -------
        EvidenceRecord
            The same record (for chaining / confirmation).
        """
        self._store[record.evidence_id] = record

        if record.project_id:
            project_ids = self._project_index.setdefault(record.project_id, [])
            if record.evidence_id not in project_ids:
                project_ids.append(record.evidence_id)

        logger.info(
            "Evidence registered: id=%s project=%s technique=%s",
            record.evidence_id,
            record.project_id,
            record.technique,
        )
        return record

    def create(self, request: EvidenceCreateRequest) -> EvidenceRecord:
        """
        Create and store an EvidenceRecord from an EvidenceCreateRequest.

        Assigns evidence_id (UUIDv4) and created_at (ISO UTC) automatically.

        Parameters
        ----------
        request : EvidenceCreateRequest
            Evidence creation request body.

        Returns
        -------
        EvidenceRecord
            The newly created and stored record.
        """
        now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        record = EvidenceRecord(
            evidence_id=str(uuid.uuid4()),
            project_id=request.project_id,
            technique=request.technique,
            skill_id=request.skill_id,
            skill_label=request.skill_label,
            input_reference=request.input_reference,
            processing_summary=request.processing_summary,
            scientific_observations=request.scientific_observations,
            claim_boundaries=request.claim_boundaries,
            validation_gaps=request.validation_gaps,
            agent_ready_summary=request.agent_ready_summary,
            raw_result=request.raw_result,
            provenance=request.provenance,
            created_at=now,
            sample_id=request.sample_id,
            source_file=request.source_file,
            validation_status=request.validation_status,
            agent_readiness=request.agent_readiness,
            tags=request.tags,
        )
        return self.add(record)

    def get(self, evidence_id: str) -> Optional[EvidenceRecord]:
        """
        Retrieve a single evidence record by ID.

        Parameters
        ----------
        evidence_id : str
            UUID string identifying the evidence.

        Returns
        -------
        Optional[EvidenceRecord]
            The record if found, None otherwise.
        """
        return self._store.get(evidence_id)

    # ------------------------------------------------------------------
    # Project queries
    # ------------------------------------------------------------------

    def list_by_project(self, project_id: str) -> List[EvidenceRecord]:
        """
        List all evidence records for a project, most recent first.

        Parameters
        ----------
        project_id : str
            Project identifier.

        Returns
        -------
        List[EvidenceRecord]
            Records ordered by created_at descending (may be empty).
        """
        ids = self._project_index.get(project_id, [])
        records = [self._store[eid] for eid in ids if eid in self._store]
        records.sort(key=lambda r: r.created_at, reverse=True)
        return records

    def get_latest(
        self,
        project_id: str,
        technique: Optional[str] = None,
    ) -> Optional[EvidenceRecord]:
        """
        Get the most recent evidence record for a project.

        Parameters
        ----------
        project_id : str
            Project identifier.
        technique : Optional[str]
            Optional technique filter (case-insensitive, e.g. "XRD").

        Returns
        -------
        Optional[EvidenceRecord]
            The latest matching record, or None.
        """
        records = self.list_by_project(project_id)
        if technique:
            tech_upper = technique.strip().upper()
            records = [r for r in records if str(r.technique).upper() == tech_upper]
        return records[0] if records else None

    def get_summary(self, project_id: str) -> EvidenceSummary:
        """
        Build an aggregated summary of all evidence for a project.

        Parameters
        ----------
        project_id : str
            Project identifier.

        Returns
        -------
        EvidenceSummary
            Summary with counts, techniques, latest IDs, latest_by_technique,
            and deduplicated open validation gaps.
        """
        records = self.list_by_project(project_id)

        techniques_set: set[str] = set()
        latest_by_technique: Dict[str, str] = {}
        all_gaps: List[str] = []
        seen_gaps: set[str] = set()

        for rec in records:
            techniques_set.add(rec.technique)
            # list_by_project returns sorted descending, so first seen = latest
            if rec.technique not in latest_by_technique:
                latest_by_technique[rec.technique] = rec.evidence_id
            for gap in rec.validation_gaps:
                normalized = gap.strip()
                if normalized and normalized not in seen_gaps:
                    seen_gaps.add(normalized)
                    all_gaps.append(normalized)

        return EvidenceSummary(
            project_id=project_id,
            total_evidence_count=len(records),
            techniques=sorted(techniques_set),
            latest_evidence_ids=list(latest_by_technique.values()),
            latest_by_technique=latest_by_technique,
            open_validation_gaps=all_gaps,
        )

    def get_agent_context(self, project_id: str) -> AgentContext:
        """
        Build an agent-ready context bundle for a project.

        Parameters
        ----------
        project_id : str
            Project identifier.

        Returns
        -------
        AgentContext
            Context with per-technique summaries, validation gaps,
            and claim boundaries for agent reasoning.
        """
        records = self.list_by_project(project_id)

        techniques_set: set[str] = set()
        latest_summaries: List[Dict[str, Any]] = []
        seen_techniques: set[str] = set()
        all_gaps: List[str] = []
        seen_gaps: set[str] = set()
        all_claim_boundaries: List[str] = []
        seen_claims: set[str] = set()

        for rec in records:
            techniques_set.add(rec.technique)
            # First seen per technique = latest (sorted desc)
            if rec.technique not in seen_techniques:
                seen_techniques.add(rec.technique)
                latest_summaries.append({
                    "technique": rec.technique,
                    "evidence_id": rec.evidence_id,
                    "agent_ready_summary": rec.agent_ready_summary,
                    "claim_boundaries": rec.claim_boundaries,
                    "validation_gaps": rec.validation_gaps,
                })
            for gap in rec.validation_gaps:
                normalized = gap.strip()
                if normalized and normalized not in seen_gaps:
                    seen_gaps.add(normalized)
                    all_gaps.append(normalized)
            for cb in rec.claim_boundaries:
                normalized = cb.strip()
                if normalized and normalized not in seen_claims:
                    seen_claims.add(normalized)
                    all_claim_boundaries.append(normalized)

        return AgentContext(
            project_id=project_id,
            evidence_count=len(records),
            techniques_available=sorted(techniques_set),
            latest_summaries=latest_summaries,
            all_validation_gaps=all_gaps,
            all_claim_boundaries=all_claim_boundaries,
        )


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------

evidence_registry = EvidenceRegistry()