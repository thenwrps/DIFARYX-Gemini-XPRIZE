# AGENTS.md

# DIFARYX Agent Operating Guide

Version: 2026.05

---

# Project Identity

## Organization

dFRYX lab

## Core Product

DIFARYX

DIFARYX is an autonomous scientific workflow intelligence system for experimental R&D.

The system helps researchers transform experimental evidence into defensible scientific decisions through structured reasoning, validation awareness, and reproducible scientific memory.

DIFARYX is NOT:

* an XRD application
* a spectra viewer
* a graph dashboard
* a notebook replacement
* a report generator

XRD, XPS, FTIR, and Raman are demonstration evidence sources used to showcase the broader DIFARYX workflow.

The product identity is scientific workflow intelligence.

---

# Core Workflow

All features must support the canonical DIFARYX workflow:

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

Compact narrative:

Goal → Plan → Execute → Evidence → Reason → Decision → Report

Agents must preserve this workflow.

Do not collapse the workflow into a single result state.

---

# Current Product Scope

Supported techniques:

* XRD
* XPS
* FTIR
* Raman

Fallback mode:

* Unknown Signal

Unknown Signal may only provide:

* signal inspection
* pattern observations
* anomaly discussion

Unknown Signal must never generate material-specific conclusions.

---

# Scientific Reasoning Rules

Scientific reasoning is evidence-first.

Evidence must precede interpretation.

Interpretation must precede conclusions.

Validation requirements must remain visible.

Agents must explicitly separate:

* Evidence
* Interpretation
* Hypothesis
* Conclusion
* Validation Gap

Do not present interpretations as facts.

Preferred wording:

* evidence suggests
* evidence supports
* consistent with
* may indicate
* appears compatible with

Avoid:

* proves
* confirms
* definitely is
* guarantees
* unquestionably demonstrates

unless validation requirements have been satisfied.

---

# Technique Boundaries

## XRD

Can support:

* crystallographic evidence
* phase-related evidence
* peak matching evidence
* structural consistency evidence

Cannot independently confirm:

* phase purity
* synthesis success
* composition
* material performance

---

## XPS

Can support:

* surface composition evidence
* oxidation state evidence
* surface chemistry evidence

Cannot independently determine:

* bulk composition
* complete phase assignment
* phase purity

---

## FTIR

Can support:

* bonding evidence
* functional-group evidence
* chemical environment evidence

Cannot independently determine:

* crystal structure
* phase purity
* crystallographic identity

---

## Raman

Can support:

* vibrational fingerprint evidence
* local structural evidence
* symmetry-related evidence

Cannot independently replace:

* crystallographic validation
* phase purity validation

---

# Condition Lock Architecture

Experimental conditions are first-class evidence.

Agents must preserve condition context throughout the workflow.

Preserve:

## Sample Preparation

* precursor information
* composition
* synthesis route
* temperatures
* durations
* atmosphere

## Measurement Conditions

* instrument configuration
* acquisition parameters
* scan settings
* measurement settings

## Processing Conditions

* smoothing
* baseline correction
* normalization
* fitting choices
* transformations

## Validation Conditions

* reference sets
* thresholds
* approval status
* validation assumptions

Condition information must remain available during:

* workspace analysis
* agent reasoning
* notebook generation
* report generation
* evidence handoff
* fusion workflows

---

# Uploaded Signal Rules

Uploaded Signal is currently Public Beta.

Supported formats:

* csv
* txt
* xy
* dat

Agents must:

1. validate signal quality
2. inspect completeness
3. determine technique compatibility
4. establish confidence boundaries
5. generate validation requirements

Weak signals must generate:

* BLOCKED
  or
* LIMITED CONFIDENCE

states.

Never hallucinate material identification.

Never fabricate phase assignments.

---

# Evidence Traceability

All scientific claims must be traceable.

Every claim should connect to:

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

Agents must not generate orphan conclusions.

Reasoning should remain explainable and auditable.

---

# Multi-Tech Evidence Fusion

Fusion workflows must preserve source attribution.

Agents must maintain:

* XRD evidence provenance
* XPS evidence provenance
* FTIR evidence provenance
* Raman evidence provenance

Do not merge evidence in a way that obscures source techniques.

Conflicts between techniques should remain visible.

Validation gaps should remain visible.

---

# XRD Local Reference Validation

Approval-aware validation is mandatory.

Local reference matching requires:

* approved reference
* technically eligible reference
* no critical validation errors
* sufficient peak count
* supported import state

Reject references when status includes:

* not_reviewed
* requires_peak_extraction
* requires_converter
* unsupported_format
* corrupted_file
* parse_error
* not_supported_yet

Do not bypass approval checks.

Do not weaken validation gates.

---

# Safety Rules

Do not rewrite the entire application.

Do not reframe DIFARYX as:

* only an XRD tool
* only a spectroscopy tool
* only a graph viewer
* only a materials dashboard

Do not remove:

* graph components
* evidence workspaces
* reasoning stages
* validation gap stages
* notebook handoff stages

Do not hide graphs during agent execution.

Do not replace reasoning chains with a simple completion state.

Preserve:

* objective
* context
* evidence
* reasoning
* validation gap
* decision
* notebook/report

Keep the demo deterministic.

Do not introduce backend services unless explicitly requested.

Do not add dependencies without approval.

Do not modify routing without approval.

Do not remove existing localStorage workflows.

Do not weaken scientific guardrails.

---

# Important Routes

| Route            | Purpose                         |
| ---------------- | ------------------------------- |
| /                | DIFARYX landing experience      |
| /login           | Demo authentication entry       |
| /dashboard       | Project dashboard               |
| /demo/agent      | Scientific agent workflow demo  |
| /workspace/xrd   | XRD evidence workspace          |
| /workspace/xps   | XPS evidence workspace          |
| /workspace/ftir  | FTIR evidence workspace         |
| /workspace/raman | Raman evidence workspace        |
| /workspace/multi | Multi-tech evidence fusion      |
| /notebook        | Scientific memory and reporting |
| /history         | Provenance history              |
| /settings        | Demo settings                   |

---

# Current Technology Stack

Frontend

* React 19
* TypeScript
* Vite
* React Router DOM
* Tailwind CSS
* Recharts

Backend

* Python
* FastAPI

Visualization

* Recharts

Video

* Remotion

---

# Engineering Expectations

Prefer:

* deterministic behavior
* explainable outputs
* traceable reasoning
* schema-first design
* validation-first architecture
* scientific transparency

Avoid:

* hidden assumptions
* unsupported conclusions
* black-box reasoning
* evidence-free outputs

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

Evidence → Reasoning → Decision → Memory

rather than only improving visual presentation.
