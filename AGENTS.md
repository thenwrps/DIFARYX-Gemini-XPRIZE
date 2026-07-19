# DIFARYX Agent Operating Guide

**Version: 2026.05**

---

# Project Identity

## Organization

**dFRYX lab**

## Core Product

**DIFARYX**

DIFARYX is an autonomous scientific workflow intelligence system for experimental R&D.

The system helps researchers transform experimental evidence into defensible scientific decisions through structured reasoning, validation awareness, and reproducible scientific memory.

DIFARYX is **not**:

- An XRD application
- A spectra viewer
- A graph dashboard
- A notebook replacement
- A report generator

XRD, XPS, FTIR, and Raman are demonstration evidence sources used to showcase the broader DIFARYX workflow.

The product identity is **scientific workflow intelligence**.

---

# Core Workflow

All features must support the canonical DIFARYX workflow:

```text
Research Objective
↓
Experimental Setup / Context
↓
Evidence Workspace
↓
Agent Reasoning
↓
Validation Gap
↓
Next Experiment / Decision
↓
Notebook Memory
↓
Scientific Report
```

Compact narrative:

> Goal → Plan → Execute → Evidence → Reason → Decision → Report

Agents must preserve this workflow.

Do not collapse the workflow into a single result state.

---

# Current Product Scope

Supported techniques:

- XRD
- XPS
- FTIR
- Raman

Fallback mode:

- Unknown Signal

Unknown Signal may only provide:

- Signal inspection
- Pattern observations
- Anomaly discussion

Unknown Signal must never generate material-specific conclusions.

---

# Scientific Reasoning Rules

Scientific reasoning is evidence-first.

Evidence must precede interpretation.

Interpretation must precede conclusions.

Validation requirements must remain visible.

Agents must explicitly separate:

- Evidence
- Interpretation
- Hypothesis
- Conclusion
- Validation Gap

Do not present interpretations as facts.

Preferred wording:

- Evidence suggests
- Evidence supports
- Consistent with
- May indicate
- Appears compatible with

Avoid:

- Proves
- Confirms
- Definitely is
- Guarantees
- Unquestionably demonstrates

unless validation requirements have been satisfied.

---

# Technique Boundaries

## XRD

Can support:

- Crystallographic evidence
- Phase-related evidence
- Peak-matching evidence
- Structural-consistency evidence

Cannot independently confirm:

- Phase purity
- Synthesis success
- Composition
- Material performance

## XPS

Can support:

- Surface-composition evidence
- Oxidation-state evidence
- Surface-chemistry evidence

Cannot independently determine:

- Bulk composition
- Complete phase assignment
- Phase purity

## FTIR

Can support:

- Bonding evidence
- Functional-group evidence
- Chemical-environment evidence

Cannot independently determine:

- Crystal structure
- Phase purity
- Crystallographic identity

## Raman

Can support:

- Vibrational-fingerprint evidence
- Local structural evidence
- Symmetry-related evidence

Cannot independently replace:

- Crystallographic validation
- Phase-purity validation

---

# Condition Lock Architecture

Experimental conditions are first-class evidence.

Agents must preserve condition context throughout the workflow.

## Sample Preparation

Preserve:

- Precursor information
- Composition
- Synthesis route
- Temperatures
- Durations
- Atmosphere

## Measurement Conditions

Preserve:

- Instrument configuration
- Acquisition parameters
- Scan settings
- Measurement settings

## Processing Conditions

Preserve:

- Smoothing
- Baseline correction
- Normalization
- Fitting choices
- Transformations

## Validation Conditions

Preserve:

- Reference sets
- Thresholds
- Approval status
- Validation assumptions

Condition information must remain available during:

- Workspace analysis
- Agent reasoning
- Notebook generation
- Report generation
- Evidence handoff
- Fusion workflows

---

# Uploaded Signal Rules

Uploaded Signal is currently **Public Beta**.

Supported formats:

- `csv`
- `txt`
- `xy`
- `dat`

Agents must:

1. Validate signal quality.
2. Inspect completeness.
3. Determine technique compatibility.
4. Establish confidence boundaries.
5. Generate validation requirements.

Weak signals must generate one of these states:

- `BLOCKED`
- `LIMITED CONFIDENCE`

Never hallucinate material identification.

Never fabricate phase assignments.

---

# Evidence Traceability

All scientific claims must be traceable.

Every claim should connect to:

```text
Claim
↓
Evidence
↓
Observations
↓
Limitations
↓
Confidence
↓
Validation Gap
↓
Next Recommended Action
```

Agents must not generate orphan conclusions.

Reasoning should remain explainable and auditable.

---

# Multi-Tech Evidence Fusion

Fusion workflows must preserve source attribution.

Agents must maintain:

- XRD evidence provenance
- XPS evidence provenance
- FTIR evidence provenance
- Raman evidence provenance

Do not merge evidence in a way that obscures source techniques.

Conflicts between techniques should remain visible.

Validation gaps should remain visible.

---

# XRD Local Reference Validation

Approval-aware validation is mandatory.

Local reference matching requires:

- Approved reference
- Technically eligible reference
- No critical validation errors
- Sufficient peak count
- Supported import state

Reject references when status includes:

- `not_reviewed`
- `requires_peak_extraction`
- `requires_converter`
- `unsupported_format`
- `corrupted_file`
- `parse_error`
- `not_supported_yet`

Do not bypass approval checks.

Do not weaken validation gates.

---

# Safety Rules

Do not rewrite the entire application.

Do not reframe DIFARYX as:

- Only an XRD tool
- Only a spectroscopy tool
- Only a graph viewer
- Only a materials dashboard

Do not remove:

- Graph components
- Evidence workspaces
- Reasoning stages
- Validation-gap stages
- Notebook-handoff stages

Do not hide graphs during agent execution.

Do not replace reasoning chains with a simple completion state.

Preserve:

- Objective
- Context
- Evidence
- Reasoning
- Validation gap
- Decision
- Notebook/report

Keep the demo deterministic.

Do not introduce backend services unless explicitly requested.

Do not add dependencies without approval.

Do not modify routing without approval.

Do not remove existing `localStorage` workflows.

Do not weaken scientific guardrails.

---

# Important Routes

| Route | Purpose |
| --- | --- |
| `/` | DIFARYX landing experience |
| `/login` | Demo authentication entry |
| `/dashboard` | Project dashboard |
| `/demo/agent` | Scientific agent workflow demo |
| `/workspace/xrd` | XRD evidence workspace |
| `/workspace/xps` | XPS evidence workspace |
| `/workspace/ftir` | FTIR evidence workspace |
| `/workspace/raman` | Raman evidence workspace |
| `/workspace/multi` | Multi-tech evidence fusion |
| `/notebook` | Scientific memory and reporting |
| `/history` | Provenance history |
| `/settings` | Demo settings |

---

# Current Technology Stack

## Frontend

- React 19
- TypeScript
- Vite
- React Router DOM
- Tailwind CSS
- Recharts

## Backend

- Python
- FastAPI

## Visualization

- Recharts

## Video

- Remotion

---

# Engineering Expectations

Prefer:

- Deterministic behavior
- Explainable outputs
- Traceable reasoning
- Schema-first design
- Validation-first architecture
- Scientific transparency

Avoid:

- Hidden assumptions
- Unsupported conclusions
- Black-box reasoning
- Evidence-free outputs

---

# Build Commands

```powershell
npm run dev
npm.cmd run build
```

---

# Mission

Build DIFARYX into a trustworthy scientific workflow intelligence system that transforms experimental evidence into validated decisions and reproducible scientific memory.

Every contribution should strengthen:

> Evidence → Reasoning → Decision → Memory

rather than only improving visual presentation.
