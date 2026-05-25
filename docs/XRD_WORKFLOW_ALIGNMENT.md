# XRD Workflow Alignment Map (Phase X0)

## Purpose

This document maps the current scattered XRD state across frontend UI, backend payload, backend result, evidence persistence, Agent, Notebook, and Report surfaces. It identifies duplicated fields, handoff copies, and provides a concrete migration map toward a unified evidence workflow contract.

**Created:** Phase X0 (Post R1A-R1D component extraction)  
**Status:** Planning + alignment layer only (no runtime changes yet)  
**Contract:** `src/types/xrdWorkflowContract.ts`

---

## Current Source of Truth Table

| Domain | Current Type/Location | Owner | Mutability | Persisted? |
|--------|----------------------|-------|------------|------------|
| **Dataset Context** | `XRDDatasetContext` (frontend) | Workspace UI | Mutable | localStorage (workspace state) |
| **Processing Parameters** | `XRDParameters` (frontend) | Workspace UI | Mutable | localStorage (workspace state) |
| **Local Reference** | `XRDStoredLocalReferenceRecord` (frontend storage) | Local reference panel | Append-only | localStorage (draft approval) |
| **Backend Payload** | `XRDProcessPayload` → `XRDBackendGroupedParameters` + `XRDBackendDatasetContext` | Adapter layer | Immutable | No (request only) |
| **Backend Result** | `XRDProcessResponse` → `XRDNormalizedResult` | Backend processing | Immutable | Yes (xrdBackendEvidence) |
| **Reference Match v2** | `XRDReferenceMatchV2` | Backend reference service | Immutable | Yes (compact summary) |
| **Scientific Evidence** | `ScientificEvidenceObject` | Backend skill handoff | Immutable | Conditional (size limit) |
| **Agent Handoff** | `ProcessingResult` (workflowPipeline) | Agent demo | Immutable | No (demo state only) |
| **Notebook Handoff** | `NotebookEntry` + `xrdBackendEvidenceSummary` | Notebook template | Immutable | Demo state only |
| **Report Handoff** | Inline properties in `ReportBuilder` | Report builder | Immutable | No (derived from notebook) |

---

## Duplicated State Table

The following fields are **copied or transformed** across multiple surfaces, creating maintenance burden and consistency risks:

### 1. Sample Identity & Context

| Field | Frontend (UI) | Backend Payload | Backend Result | Evidence Storage | Agent/Notebook |
|-------|---------------|----------------|----------------|------------------|----------------|
| `sampleId` | `XRDDatasetContext.sampleId` | `XRDBackendDatasetContext.sample_id` | ❌ Not in result | `XRDBackendEvidenceRecord` (indirect via key) | `ProcessingResult.sampleId` |
| `sampleName` | `XRDDatasetContext.sampleName` | `XRDBackendDatasetContext.sample_name` | ❌ Not in result | ❌ Not persisted | ❌ Not in handoff |
| `materialClass` | `XRDDatasetContext.materialClass` | `XRDBackendDatasetContext.material_class` | ❌ Not in result | ❌ Not persisted | `ProcessingResult.materialSystem` |
| `knownElements` | `XRDDatasetContext.knownElements` | `XRDBackendDatasetContext.known_elements` | ❌ Not in result | ❌ Not persisted | ❌ Not in handoff |
| `declaredPhases` | `XRDDatasetContext.declaredPhases` | `XRDBackendDatasetContext.declared_phases` | ❌ Not in result | ❌ Not persisted | ❌ Not in handoff |

**Issue:** Dataset context is sent to backend but not returned. Evidence storage doesn't preserve it. Agent/Notebook must re-fetch from workspace state or reconstruct.

### 2. Processing Parameters

| Field | Frontend (UI) | Backend Payload | Backend Result | Evidence Storage | Agent/Notebook |
|-------|---------------|----------------|----------------|------------------|----------------|
| `range` | `XRDParameters.range` | `XRDBackendGroupedParameters.range` | ❌ Not in result | ❌ Not persisted | ❌ Not in handoff |
| `radiation` | `XRDParameters.radiation` | `XRDBackendGroupedParameters.radiation` | ❌ Not in result | ❌ Not persisted | ❌ Not in handoff |
| `baseline.method` | `XRDParameters.baseline.method` | `XRDBackendGroupedParameters.baseline.method` | ❌ Not in result | ❌ Not persisted | ❌ Not in handoff |
| `smoothing.method` | `XRDParameters.smoothing.method` | `XRDBackendGroupedParameters.smoothing.method` | ❌ Not in result | ❌ Not persisted | ❌ Not in handoff |
| `peakFitting.model` | `XRDParameters.peakFitting.model` | `XRDBackendGroupedParameters.peak_fitting.model` | ❌ Not in result | ❌ Not persisted | ❌ Not in handoff |
| `referenceMatch.referenceSetId` | `XRDParameters.referenceMatch.referenceSetId` | `XRDBackendGroupedParameters.reference_match.reference_set_id` | `XRDReferenceMatchV2.reference_set_id` | `XRDReferenceMatchV2EvidenceSummary.referenceSetId` | ❌ Not in handoff |

**Issue:** Processing parameters are sent to backend but not returned in result. Evidence storage doesn't preserve processing provenance. Agent/Notebook cannot cite parameter choices without re-reading workspace state.

### 3. Reference Matching Evidence

| Field | Frontend (UI) | Backend Payload | Backend Result | Evidence Storage | Agent/Notebook |
|-------|---------------|----------------|----------------|------------------|----------------|
| `referenceSetId` | `XRDParameters.referenceMatch.referenceSetId` | `XRDBackendGroupedParameters.reference_match.reference_set_id` | `XRDReferenceMatchV2.reference_set_id` | `XRDReferenceMatchV2EvidenceSummary.referenceSetId` | ❌ Not in handoff |
| `status` | ❌ Not in UI state | ❌ Not in payload | `XRDReferenceMatchV2.status` | `XRDReferenceMatchV2EvidenceSummary.status` | ❌ Not in handoff |
| `claimLevel` | ❌ Not in UI state | ❌ Not in payload | `XRDReferenceMatchV2.claim_level` | `XRDReferenceMatchV2EvidenceSummary.claimLevel` | ❌ Not in handoff |
| `primaryCandidate` | ❌ Not in UI state | ❌ Not in payload | `XRDReferenceMatchV2.primary_candidate` | `XRDReferenceMatchV2EvidenceSummary.primaryCandidate` | ❌ Not in handoff |
| `limitations` | ❌ Not in UI state | ❌ Not in payload | `XRDReferenceMatchV2.limitations` | `XRDReferenceMatchV2EvidenceSummary.limitations` | `ProcessingResult.limitations` |

**Issue:** Reference match v2 evidence is compact in storage but not structured for Agent/Notebook handoff. Primary candidate and limitations are copied manually.

### 4. Scientific Evidence Object

| Field | Frontend (UI) | Backend Payload | Backend Result | Evidence Storage | Agent/Notebook |
|-------|---------------|----------------|----------------|------------------|----------------|
| `evidenceId` | ❌ Not in UI state | ❌ Not in payload | `ScientificEvidenceObject.evidence_id` | `XRDSkillEvidenceSummary.evidenceId` | ❌ Not in handoff |
| `scientificObservations` | ❌ Not in UI state | ❌ Not in payload | `ScientificEvidenceObject.scientific_observations` | ❌ Not persisted (size) | `ProcessingResult.evidenceReview` |
| `claimBoundaries` | ❌ Not in UI state | ❌ Not in payload | `ScientificEvidenceObject.claim_boundaries` | ❌ Not persisted (size) | `ProcessingResult.limitations` |
| `validationGaps` | ❌ Not in UI state | ❌ Not in payload | `ScientificEvidenceObject.validation_gaps` | ❌ Not persisted (size) | `ProcessingResult.followUpValidation` |
| `agentReadySummary` | ❌ Not in UI state | ❌ Not in payload | `ScientificEvidenceObject.agent_ready_summary` | ❌ Not persisted (size) | `ProcessingResult.summary` |

**Issue:** Full scientific evidence object is excluded from storage due to size limits. Agent/Notebook receive manual copies of observations/boundaries/gaps. No provenance chain.

### 5. Quality Metrics

| Field | Frontend (UI) | Backend Payload | Backend Result | Evidence Storage | Agent/Notebook |
|-------|---------------|----------------|----------------|------------------|----------------|
| `detectedPeakCount` | ❌ Not in UI state | ❌ Not in payload | `XRDProcessResponse.detected_peaks.length` | `XRDBackendEvidenceRecord.detectedPeakCount` | `ProcessingResult.detectedFeatures.length` |
| `fittedPeakCount` | ❌ Not in UI state | ❌ Not in payload | `XRDProcessResponse.fitted_peaks.length` | `XRDBackendEvidenceRecord.fittedPeakCount` | ❌ Not in handoff |
| `snRatio` | ❌ Not in UI state | ❌ Not in payload | `XRDProcessResponse.sn_ratio` | `XRDBackendEvidenceRecord.snRatio` | `ProcessingResult.metrics` (as string) |
| `peakResolution` | ❌ Not in UI state | ❌ Not in payload | `XRDProcessResponse.peak_resolution` | `XRDBackendEvidenceRecord.peakResolution` | ❌ Not in handoff |

**Issue:** Quality metrics are stored in evidence but transformed into string metrics for Agent/Notebook. No direct access to structured quality assessment.

---

## Desired Source of Truth (Unified Workflow)

### Single Workflow Run

**Canonical shape:** `XRDWorkflowRunContext`

- **Dataset Context:** `XRDWorkflowDatasetContext` (frontend workspace → backend → storage → handoff)
- **Processing Parameters:** `XRDWorkflowProcessingParameters` (frontend workspace → backend → storage → handoff)
- **Reference Context:** `XRDWorkflowReferenceContext` (frontend workspace + local reference storage → backend → storage → handoff)
- **Claim Boundary:** `XRDWorkflowClaimBoundary` (frontend boundary panel + backend enforcement → storage → handoff)

### Evidence Flow

1. **Frontend UI** owns dataset context and processing parameters
2. **Backend** receives full context via payload, returns processing results + reference match + scientific evidence
3. **Storage** persists backend evidence + compact summaries (within localStorage limits)
4. **Agent/Notebook/Report** consume structured handoff state (provenance + evidence + boundaries)

### No More Manual Copies

- Dataset context propagates automatically
- Processing provenance included in evidence
- Reference match evidence structured for handoff
- Scientific observations/boundaries/gaps included in handoff (compact)
- Quality metrics accessible as structured data

---

## Frontend/Backend/Storage/Handoff Alignment Map

### Current Alignment Issues

| Issue | Current Behavior | Desired Behavior |
|-------|------------------|------------------|
| **Dataset context lost** | Sent to backend but not returned in result | Backend echoes dataset context in result |
| **Processing provenance missing** | Parameters sent to backend but not preserved | Backend includes processing provenance in evidence object |
| **Reference match not structured for handoff** | Compact summary in storage, manual copy to Agent | Structured handoff shape for Agent/Notebook |
| **Scientific evidence excluded** | Too large for localStorage, manual copies | Compact summary included in handoff, full object optional |
| **Quality metrics as strings** | Converted to string metrics for Agent | Structured quality metrics in handoff |
| **No provenance chain** | Agent/Notebook can't trace back to workspace parameters | Full provenance chain: workspace → backend → evidence → handoff |
| **Duplicated field names** | `sampleId` vs `sample_id` vs `sampleIdentifier` | Unified naming across all surfaces |

### Alignment Targets

#### 1. Frontend → Backend Payload

**Current:**
- Frontend: `XRDDatasetContext` + `XRDParameters`
- Adapter: `xrdParameterAdapter.ts` transforms to `XRDBackendDatasetContext` + `XRDBackendGroupedParameters`
- Backend: Python `XRDDatasetContext` + `XRDParameters` schemas

**Target:**
- Frontend: `XRDWorkflowDatasetContext` + `XRDWorkflowProcessingParameters`
- Adapter: Minimal snake_case transform only
- Backend: Aligned schemas with same structure

#### 2. Backend Result → Storage

**Current:**
- Backend: `XRDProcessResponse` + `XRDReferenceMatchV2` + `ScientificEvidenceObject`
- Normalization: `normalizeXrdResult()` in `xrdResultNormalizer.ts`
- Storage: `XRDBackendEvidenceRecord` with compact summaries

**Target:**
- Backend: `XRDWorkflowBackendEvidence` (structured)
- Normalization: Minimal, preserve structure
- Storage: `XRDWorkflowBackendEvidence` (compact summaries, exclude large arrays)

#### 3. Storage → Agent/Notebook/Report Handoff

**Current:**
- Storage: `XRDBackendEvidenceRecord` with partial fields
- Agent: Manual `ProcessingResult` construction in `AgentDemo.tsx`
- Notebook: Manual `NotebookEntry` construction in `NotebookLab.tsx`
- Report: Manual property extraction in `ReportBuilder.tsx`

**Target:**
- Storage: `XRDWorkflowBackendEvidence` + `XRDWorkflowRunContext` provenance
- Agent: Consumes `XRDWorkflowHandoffState` directly
- Notebook: Consumes `XRDWorkflowHandoffState` directly
- Report: Consumes `XRDWorkflowHandoffState` directly

---

## Next Migration Phases

### Phase X1: Backend Echo (Dataset Context + Processing Provenance)

**Goal:** Backend returns dataset context and processing provenance in result.

**Changes:**
- Backend: Add `dataset_context_echo` and `processing_provenance` to `XRDProcessResponse`
- Backend: Echo received dataset context (no transformation)
- Backend: Include compact processing provenance (method names, key thresholds)
- Frontend: Store echoed context in `XRDBackendEvidenceRecord`

**Benefits:**
- Evidence records become self-contained
- Agent/Notebook can cite parameter choices without workspace lookup
- Provenance chain established

**Risk:** Increases backend response size slightly (~1-2 KB per result)

### Phase X2: Structured Reference Match Handoff

**Goal:** Reference match v2 evidence in structured handoff shape.

**Changes:**
- Storage: Replace `XRDReferenceMatchV2EvidenceSummary` with `XRDWorkflowReferenceMatchEvidence`
- Agent/Notebook: Consume structured reference match evidence directly
- Remove manual primary candidate extraction

**Benefits:**
- No more manual reference match copying
- Consistent reference evidence across surfaces
- Easier to add new reference match fields

**Risk:** Minimal, mostly renaming

### Phase X3: Compact Scientific Evidence Handoff

**Goal:** Include compact scientific evidence in handoff (observations, boundaries, gaps).

**Changes:**
- Storage: Always persist `XRDWorkflowScientificEvidence` compact summary (exclude raw_result)
- Agent/Notebook: Consume scientific evidence summary directly
- Remove manual observations/boundaries/gaps copying

**Benefits:**
- No more manual scientific evidence copying
- Consistent evidence across surfaces
- Full provenance from backend skill handoff

**Risk:** Increases storage slightly (~2-3 KB per result)

### Phase X4: Unified Handoff State

**Goal:** Single handoff contract for Agent/Notebook/Report.

**Changes:**
- Create `buildXrdWorkflowHandoffState()` utility
- Consolidates evidence + provenance + boundaries
- Agent/Notebook/Report consume `XRDWorkflowHandoffState` only

**Benefits:**
- Single source of truth for handoff
- No more per-surface manual construction
- Easier to add new handoff fields (add once, all surfaces benefit)

**Risk:** Requires coordinated changes across Agent, Notebook, Report

### Phase X5: Deprecate Old Types

**Goal:** Migrate all runtime code to unified workflow contract.

**Changes:**
- Replace `XRDDatasetContext` with `XRDWorkflowDatasetContext` (alias or direct replacement)
- Replace `XRDParameters` with `XRDWorkflowProcessingParameters` (alias or direct replacement)
- Replace `XRDBackendEvidenceRecord` with `XRDWorkflowBackendEvidence` (alias or direct replacement)
- Remove adapter transformations (minimal snake_case only)

**Benefits:**
- Full alignment achieved
- No more duplicated types
- Consistent naming across all surfaces

**Risk:** Large refactor, requires careful migration and testing

---

## Current State: What Remains Where

### Frontend-Only

- **Workspace UI state:** `XRDDatasetContext`, `XRDParameters` (mutable, localStorage)
- **Local reference approval workflow:** `XRDStoredLocalReferenceRecord` (append-only, localStorage)
- **Boundary panel configuration:** `XRDBoundaryParameters` (mutable, localStorage)
- **UI components:** Readiness, Boundary, Local Reference, Reference Match, Processing Parameters panels

### Backend-Owned

- **Processing result:** `XRDProcessResponse` (immutable, request-scoped)
- **Reference match v2:** `XRDReferenceMatchV2` (immutable, request-scoped)
- **Scientific evidence object:** `ScientificEvidenceObject` (immutable, request-scoped)
- **Peak detection/fitting:** `XRDDetectedPeak`, `XRDFittedPeak` (immutable, request-scoped)

### Duplicated (Needs Consolidation)

- **Dataset context:** Frontend workspace, backend payload, (missing in result), (missing in storage), Agent handoff
- **Processing parameters:** Frontend workspace, backend payload, (missing in result), (missing in storage), (missing in handoff)
- **Reference set ID:** Frontend workspace, backend payload, backend result, storage summary, (missing in handoff)
- **Quality metrics:** (missing in UI), (missing in payload), backend result, storage, Agent handoff (as strings)
- **Scientific observations/boundaries/gaps:** (missing in UI), (missing in payload), backend result, (excluded from storage), Agent handoff (manual copy)

---

## Summary

Phase X0 establishes the unified workflow contract and documents the current scattered state. Key findings:

1. **Dataset context and processing parameters** are sent to backend but not returned, causing loss of provenance
2. **Scientific evidence object** is excluded from storage due to size, forcing manual copies
3. **Reference match v2 evidence** is stored compactly but not structured for handoff
4. **Agent/Notebook/Report** perform manual field extraction and string conversion
5. **No provenance chain** from workspace parameters to Agent/Notebook reasoning

Next phases (X1-X5) will progressively migrate toward the unified contract, eliminating duplications and establishing a clear evidence workflow: **Frontend UI → Backend → Storage → Agent/Notebook/Report**.

The unified contract is now available in `src/types/xrdWorkflowContract.ts` as a bridge layer. No runtime changes yet—this is a planning and alignment tool for future migration.
