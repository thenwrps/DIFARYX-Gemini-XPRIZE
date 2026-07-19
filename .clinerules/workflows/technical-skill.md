# DIFARYX Engineering Workflows

This directory contains reusable engineering workflows for the DIFARYX platform.

Workflows are designed to standardize repetitive development, integration, validation, and deployment tasks across the DIFARYX scientific AI stack.

These workflows are optimized for:

* AI-assisted engineering
* Structured scientific software development
* Validation-aware integration
* Multi-technique workflow orchestration
* Frontend/backend synchronization
* Evidence-safe implementation practices

---

# Available Workflows

| Workflow               | Purpose                                               |
| ---------------------- | ----------------------------------------------------- |
| `/xrd-feature`         | Implement or extend XRD-related features              |
| `/backend-integration` | Integrate backend scientific processing features      |
| `/frontend-workspace`  | Build or modify workspace UI systems                  |
| `/evidence-pipeline`   | Implement structured evidence pipelines               |
| `/report-system`       | Extend notebook/report generation systems             |
| `/multi-technique`     | Add support for XPS, FTIR, Raman, or fusion workflows |
| `/validation-check`    | Run validation and verification workflows             |
| `/release-check`       | Prepare DIFARYX for demos or releases                 |
| `/hackathon-mode`      | Accelerated AI-assisted shipping workflow             |
| `/bugfix`              | Controlled debugging and regression-safe fixes        |

---

# Workflow Philosophy

DIFARYX workflows follow several core engineering principles:

* Preserve scientific validation boundaries
* Keep evidence traceable
* Avoid confirmatory scientific claims
* Maintain modular architecture
* Prefer additive integration over destructive rewrites
* Preserve cross-technique compatibility
* Validate before expanding scope
* Ship incrementally with verification

---

# Recommended Workflow Order

Typical DIFARYX feature development lifecycle:

1. `/backend-integration`
2. `/evidence-pipeline`
3. `/frontend-workspace`
4. `/validation-check`
5. `/report-system`
6. `/release-check`

---

# Workflow Categories

## Scientific Processing Workflows

Focused on backend scientific systems.

Includes:

* XRD processing
* Reference matching
* Evidence normalization
* Multi-technique orchestration
* Scientific metadata handling

---

## Frontend Workflows

Focused on workspace UI systems.

Includes:

* Technique workspaces
* Evidence rails
* Visualization systems
* Dataset interfaces
* Scientific dashboards

---

## Evidence & Reporting Workflows

Focused on scientific traceability systems.

Includes:

* Evidence persistence
* Notebook generation
* Report generation
* Claim limitation systems
* Validation-aware summaries

---

## Quality & Validation Workflows

Focused on engineering reliability.

Includes:

* Build verification
* Schema validation
* Smoke testing
* Regression prevention
* Cross-technique safety checks

---

# Example Usage

```bash
/xrd-feature
```

```bash
/backend-integration
```

```bash
/validation-check
```

---

# Workflow Design Principles

Each workflow should:

* define clear objectives
* preserve scientific integrity
* minimize regression risk
* maintain modularity
* verify build stability
* avoid scope explosion
* document validation boundaries

---

# AI-Assisted Engineering Notes

These workflows are designed specifically for:

* OpenAI Codex-assisted development
* Cline-assisted engineering
* rapid scientific software iteration
* structured AI collaboration

The workflows intentionally:

* break tasks into deterministic stages
* reduce ambiguity for AI systems
* preserve architecture consistency
* enforce validation-aware implementation

---

# Repository Context

Primary system domains:

* XRD
* XPS
* FTIR
* Raman
* Multi-technique evidence fusion
* Notebook/report orchestration
* Scientific AI reasoning systems

Primary stack:

* React
* TypeScript
* Vite
* TailwindCSS
* Recharts
* Python
* FastAPI
* Pydantic

---

# Suggested Future Workflows

Potential future additions:

* `/fusion-agent`
* `/dataset-import`
* `/scientific-visualization`
* `/reference-registry`
* `/agent-trace`
* `/workspace-refactor`
* `/demo-prep`
* `/performance-pass`
* `/schema-migration`
* `/release-candidate`

---

# Contribution Guidelines

When creating new workflows:

* keep workflows deterministic
* separate frontend/backend responsibilities
* include verification steps
* preserve validation-aware language
* avoid uncontrolled architecture rewrites
* ensure scientific traceability is maintained

---

# DIFARYX Engineering Goal

Build an AI-native scientific workflow platform that:

* structures evidence
* preserves scientific rigor
* enables traceable AI reasoning
* accelerates characterization workflows
* supports human-in-the-loop scientific analysis
