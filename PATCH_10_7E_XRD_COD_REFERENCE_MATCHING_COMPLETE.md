# Patch 10.7E: XRD Genuine COD Reference Database Matching

**Status:** ✅ COMPLETE & APPROVED TO MERGE  
**Date:** 2026-06-26  
**Baseline:** Patch 10.7D (Technique Adapters)  
**Scope:** Eliminate hardcoded mock phase identification registries and Miller index contradictions; implement genuine Crystallography Open Database (COD) SQLite matching via `pymatgen`.

---

## Executive Summary

Patch 10.7E successfully upgrades the DIFARYX XRD evidence pipeline from demonstration labeling to auditable, crystallography-backed phase identification. By ingesting genuine CIF files from the Crystallography Open Database (COD) via `pymatgen`, the system dynamically computes Bragg reflections, d-spacings, and structure factors.

Flagship phase verifications confirmed against live COD records:
- **`COD 5910028` ("Cuprospinel")**: Formula $\text{CuFe}_2\text{O}_4$, Space Group $Fd\bar{3}m$ (No. 227), $a = 8.369$ Å $\rightarrow$ **Cubic $\text{CuFe}_2\text{O}_4$ confirmed**.
- **`COD 9011012`**: Formula $\text{CuFe}_2\text{O}_4$, Space Group $I4_1/amd$ (No. 141), $a = 5.82$ Å, $c = 8.73$ Å $\rightarrow$ **Tetragonal $\text{CuFe}_2\text{O}_4$ confirmed**.

---

## Pre-Merge Architectural Safeguards Implemented

### 1. Synthetic Silica Provenance (Blocker Resolved)
- **Issue:** Amorphous SBA-15 mesoporous silica has no crystal lattice and therefore no valid COD entry. Previous iterations fabricated placeholder COD ID `"0000001"`.
- **Fix:** Assigned `codId: undefined` (`null` in JSON serialization) and `dbSource: 'synthetic'`. Surfaced explicitly throughout TypeScript types, FastAPI schemas, and UI components as a `"Synthetic Profile"` rather than false COD provenance.

### 2. Stoichiometric Formula Verification Gate (Blocker Resolved)
- **Issue:** Manual CIF assignment risks citing incorrect wyckoff structures or corrupted files.
- **Fix:** Implemented an automated formula gate inside `seed_from_cifs()` in `api/database_indexer.py`. The ingestion engine parses `_chemical_formula_sum` from every downloaded CIF and asserts exact stoichiometric ratio matching against expected experimental formulas prior to calculating diffraction patterns.

### 3. Spinel Ferrite Canonical Reflection Indexing (Regression Guard Resolved)
- **Issue:** Miller index contradiction where cubic spinel $\text{CuFe}_2\text{O}_4$ ~35.5° 2θ reflection was mislabeled $(400)$.
- **Fix:** Reconciled `pymatgen` intensity cutoff threshold to `0.1%` relative intensity and added reflection equivalence normalization (`(333)` $\rightarrow$ `(511)` for cubic spinels). All 8 canonical reflections index cleanly within consistent $\pm 0.2^\circ$ tolerance gates without missing peak penalties.

---

## Verification & Quality Gates

All CI quality verification gates passed cleanly with zero errors:

```powershell
npm run typecheck    # Clean (0 errors)
npm run lint         # Clean (0 errors) - Updated globalIgnores for backend/venv/brain
npm test             # Clean (16 passed across all suites)
```

### Automated Traces Verified (`npm test`)
1. **`techniqueDatasetAdapters.test.ts`**: 14/14 tests passing.
2. **`spinelMillerIndexing.test.ts`**: Verified canonical reflection index mapping and $\pm 0.2^\circ$ tolerance reconciliation.
3. **`codMatching.test.ts`**: Verified positive match attribution (`CuFe2O4` $\rightarrow$ `COD 5910028`, `Fd-3m`) and negative out-of-set trace rejection (`BaTiO3` returns no confident claim).

---

## Logged Tech Debt & Next Pass Backlog

Per user sign-off instructions, the following two follow-up items are logged as technical debt for execution in the next pass (non-blocking for Patch 10.7E merge):

### Tech Debt 1: Enforce Formula Gate & SQLite Build in CI (`npm test`)
- **Current State:** The CIF stoichiometric formula gate (`seed_from_cifs`) and SQLite indexer build (`xrd_reference.db`) execute on manual invocation of `database_indexer.py` or runtime fallback seeding.
- **Risk:** If a CIF file is modified or replaced in the repository without running the indexer script manually, regressions could bypass standard `npm test` checks.
- **Required Action:** Add a dedicated CI step or pytest suite that executes `build_database()`, asserts exactly 15 indexed phases (14 COD + 1 synthetic profile), and enforces formula gate assertions during automated CI pipeline runs.

### Tech Debt 2: Live Backend `/match` Endpoint Integration Test
- **Current State:** `codMatching.test.ts` runs under Vitest without the Python FastAPI backend running, validating the client-side fallback registry (`XRD_PHASE_DATABASE`). While both client and backend registries are generated from the exact same `pymatgen` seed script, no live runtime test prevents future divergence.
- **Required Action:** Create an integration test (using `httpx` or `supertest`) that starts/calls the live FastAPI `POST /match` endpoint (or invokes `reference_db_service.match_peaks` directly against `xrd_reference.db`), asserting identical ranking scores and COD ID `5910028` attribution for cubic $\text{CuFe}_2\text{O}_4$.
