# DIFARYX System Summary — 7 Categories (ละเอียด)

---

## 1. Workspace

### 1.1 ภาพรวม

**ไฟล์หลัก**: `src/pages/TechniqueWorkspace.tsx` (1518 บรรทัด)  
**Shared Shell**: `src/components/workspace/TechniqueWorkspaceShell.tsx`

Workspace เป็น UI หลักสำหรับแต่ละ technique (XRD, XPS, FTIR, Raman) โดยรองรับ:
- เลือก project จาก `demoProjects` (มี 5 demo projects: CuFe₂O₄/SBA-15, NiFe₂O₄, CoFe₂O₄, Fe₃O₄ NPs, BaTiO₃)
- เลือก dataset จาก `getDatasetsByTechnique(projectId, technique)` 
- เลือก processing run จาก `getProcessingRuns(datasetId)` / `getLatestProcessingRun(datasetId)`
- อัปโหลดไฟล์ .csv, .txt, .xy (สองคอลัมน์) → `parseTwoColumnText()` ต้องมี ≥8 rows
- สร้าง experiment ใหม่ผ่าน `ExperimentConditionLock` panel
- Export 5 รูปแบบ: PDF, DOCX, CSV, TXT, PNG

### 1.2 Preprocessing Pipeline

แต่ละ technique มีปุ่ม toggle เป็นของตัวเอง:

**XRD:**
- `baseline` → `rollingPercentileBaseline()` (radius=42, fraction=0.16)  
- `smoothing` → `smoothData()` (moving average, window=2 neighbors)  
- `normalize` → `normalizeData()` (scale to 0–100)  
- `crop` → filter `x >= cropMin && x <= cropMax` (default 10–80° 2θ)

**XPS:**
- `baseline` → subtract minY * 0.72  
- `background/subtract` → Shirley-like background  
- `region` dropdown: Survey | Cu 2p (920–970 eV) | Fe 2p (700–735 eV) | O 1s (520–542 eV)
- `Peak Fit` button → `getTechniqueFeatures()` → `FEATURE_TEMPLATES.XPS` (predefined peaks)

**FTIR:**
- `baseline adjust` toggle + offset slider (-12 to 12) + slope slider (-8 to 8)
- `smoothing` toggle  
- `normalize` toggle

**Raman:**
- `baseline` toggle  
- `smoothing` toggle  
- `normalize` toggle

**Processing chain** (`processedData` via `useMemo`):
1. XPS region filter → XRD crop → baseline/background subtraction (minY * 0.72) + FTIR offset/slope → smoothing (moving average 2-neighbor) → normalize (0–100)

### 1.3 Parameter Controls

- **UI State parameters**: `imported`, `baseline`, `smoothing`, `normalize`, `xpsBackground`, `ftirOffset`, `ftirSlope`, `cropMin`, `cropMax`, `xpsRegion`  
- **Condition Lock** (`ExperimentConditionLock`): 
  - `synthesisConditions`: method, precursorRatio, solvent, pH, temperature, time, calcinationTemperature, calcinationTime, atmosphere, postTreatment
  - `measurementConditions`: instrument, radiationOrSource, scanRange, stepSize, scanRate, calibrationReference, acquisitionMode
  - `processingConditions`: baselineCorrection, smoothing, normalization, peakDetection, fittingModel, referenceDatabase
  - `validationConditions`: replicateRequired (boolean), referenceValidationRequired (boolean), crossTechniqueRequired (string[]), refinementRequired (boolean), publicationClaimAllowed (boolean)
  - `userConfirmed`, `lockedAt`, `completenessStatus: 'missing' | 'draft' | 'locked' | 'incomplete' | 'validation-limited'`
- **Flow**: User ต้อง Lock conditions ก่อน create experiment → `handleLockInlineConditions()` → `lockExperimentConditions()` → validate completeness → ถ้าไม่ lock จะ submit ไม่ได้ (`disabled={!conditionLock.userConfirmed}`)

### 1.4 Pattern / Peaks / Match / Residual

**Feature Detection (Workspace level):**
- `handleDetect()` → `getTechniqueFeatures(project.xrdPeaks, activeTechnique)` 
- XRD: ใช้ `project.xrdPeaks` จริง (9 peaks)
- XPS/FTIR/Raman: ใช้ `FEATURE_TEMPLATES` (hardcoded peaks ตาม technique)

**Phase Matching (Workspace level):**
- `handleMatch()` → ใช้ detectedFeatures → set `matched = true`
- Evidence output rows:
  - XRD: ['Detected peaks', '9 diffraction peaks'], ['Candidate phase', project.phase], ['Evidence role', 'Primary'], ['Caveat', 'Requires surface validation (XPS)']
  - Others: ['Tool output', `{Technique} evidence packet`], ['Agent status', 'Ready for fusion'], ['Evidence role', 'Pending'], ['Caveat', 'Review alongside XRD and multi-tech context']

**Residual / Rietveld**: Not implemented at workspace level. Residual is discussed only in XRD agent's peak conflict analysis.

**Feature Table UI**: 
- Columns: Feature # | Position | Intensity | d-spacing (XRD only, via `dSpacing()`) | Assignment
- d-spacing formula: `λ / (2*sin(θ))` where λ = 1.5406 Å (Cu Kα)

### 1.5 Trace / Boundary / Evidence

**Processing Log** (`log` state):
- `appendLog(message)` → prepend timestamp `[HH:MM:SS] - {message}` → max entries scrollable 52vh
- Tracked events: import, detect, clear peaks, match, baseline toggle, smoothing toggle, normalize toggle, crop, save evidence, save run, export, experiment create

**Claim Status Labels** (`formatClaimStatus()`):
- `strongly_supported` → 'Supported'
- `supported` → 'Requires validation'
- `partial` → 'Validation-limited'
- `inconclusive` → 'Publication-limited'
- default → 'Claim boundary'

**Evidence Output** (`Evidence[]`):
```typescript
interface Evidence {
  id: string;           // `${datasetId}-${technique.toLowerCase()}-evidence-${Date.now()}`
  technique: Technique;
  datasetId: string;
  claim: string;        // "N diffraction peaks support the assigned ferrite phase" หรือเทคนิคอื่นๆ
  evidenceRole: 'primary' | 'supporting' | 'context';
  support: string;      // feature labels joined by "; "
  limitations?: string; // per-technique caveat
}
```
Saved to localStorage via `saveEvidence(item)`, retrieved via `getSavedEvidence(projectId, technique)`

**Workspace Status Labels** (เรียงตามลำดับ):
1. `matched` → 'Phase matched' (XRD) / 'Assignments saved' (others)
2. `featuresAvailable` → 'Peaks detected' (XRD) / 'Features detected' (others)
3. `imported` → 'Dataset imported'
4. `processingCount > 0` → 'Processed trace'
5. `latestSavedRun` → 'Saved run loaded'
6. default → 'Raw preview'

---

## 2. Technique Skills

### 2.1 XRD Skill — `src/agents/xrdAgent/runner.ts` (733 บรรทัด)

**Pipeline 7 ขั้นตอน:**

1. **`validate_xrd_input(input: XrdAgentInput): XrdValidationResult`**
   - ตรวจ: datasetId required, sampleName, point count ≥ 80, numeric validity, 2θ range 10–80°
   - Return: `{ ok, errors[], warnings[], pointCount, xRange: [min, max] | null }`

2. **`preprocess_xrd(dataPoints, params?): XrdPreprocessedPoint[]`**
   - `sortPoints()` → เรียงตาม x
   - `movingAverage(sorted, radius=2)` → smoothing
   - `rollingPercentileBaseline(smoothed, radius=42, fraction=0.16)` → baseline estimate
   - Subtract baseline → `corrected = max(0, smoothed - baseline)`
   - Normalize → `normalized = (corrected / maxCorrected) * 100`
   - Return: `{ x, rawIntensity, smoothedIntensity, baselineIntensity, correctedIntensity, normalizedIntensity }`

3. **`detect_xrd_peaks(preprocessed, params?): XrdDetectedPeak[]`**
   - `estimateNoise()` → estimate noise level จาก normalized values
   - Default thresholds: `minHeight = max(5.5, noise*4)`, `minProminence = max(3.2, noise*3.5)`, `minSeparation = 0.44`
   - For i = 2 to N-2: local maximum check (peak > prev && peak >= next)
   - `localProminence(data, i, radius=18)` → difference จาก local minimum ใน window
   - `findFwhm(data, i)` → half-max interpolation → FWHM
   - Classification: `FWHM > 1.25` → 'broad', else 'sharp'
   - `calculateDSpacing(position, wavelength=1.5406)` → d-spacing
   - `mergeNearbyPeaks()` → merge ถ้า < minSeparation
   - Return: `{ id, position, intensity, rawIntensity, prominence, fwhm, dSpacing, classification, label }[]`

4. **`search_phase_database(detectedPeaks, phaseDatabase): XrdPhaseSearchResult[]`**
   - Match แต่ละ phase ใน `XRD_PHASE_DATABASE` กับ detected peaks
   - `matchReferencePeaks(phase, observedPeaks)`:
     - Filter sharp peaks → สำหรับ reference peak แต่ละอัน หา observed peak ที่ใกล้ที่สุด (delta ≤ MATCH_TOLERANCE = 0.2°)
     - Unique matching (แต่ละ observed peak ใช้ได้ครั้งเดียว)
     - Return: `{ phase, matches[], missingPeaks[], explainedObservedPeakIds[] }`

5. **`score_phase_candidates(searchResults, detectedPeaks): XrdPhaseCandidate[]`**
   - `calculateWeightedPeakScore()`: strong peaks (relativeIntensity > 30) weight = 2.0, weak = 1.0
   - `calculateStrongPeakMatchRatio()`: ratio of matched strong peaks
   - `calculateMissingStrongPeaksPenalty()`: penalty = missingStrong / totalStrong
   - `calculateUnexplainedPeaksPenalty()`: penalty = unexplained / totalSharp
   - Raw score = `weightedPeakScore * 0.6 + matchRatio * 0.4 - missingPenalty * 0.35 - unexplainedPenalty * 0.35`
   - Threshold rules:
     - ถ้า score > 0.85 แต่ strongPeakMatchRatio < 0.80 → cap at 0.85
     - ถ้า matchedReferencePeakRatio < 0.50 → max score 0.49
   - Sort by score descending → top candidate
   
6. **`analyze_peak_conflicts(candidates, detectedPeaks): XrdConflictAnalysis`**
   - Find unexplained peaks (intensity ≥ 12) ที่ primary candidate ไม่ได้อธิบาย
   - Find broad features
   - Find missing strong peaks
   - **Ambiguity detection**: candidates ที่ score ต่าง ≤ 0.05 → ambiguous
   - **Impurity detection**: `findImpurityFlags()` → candidates ที่อธิบาย unexplained peaks ได้ ≥2 หรือมี strong feature ≥ 45
   - Return: `{ primaryCandidate, missingStrongPeaks[], unexplainedPeaks[], broadFeatures[], possibleImpurities[], ambiguousCandidates[], notes[] }`

7. **`generate_xrd_interpretation(conflicts, candidates): XrdInterpretation`**
   - Evidence statements (top 5 matched peaks with Δ2θ, d-spacing)
   - Conflict statements (missing strong peaks, unexplained peaks, impurities, ambiguity)
   - Caveats (crystal system, space group, lattice parameter, JCPDS card, ±0.2° tolerance)
   - Decision statement (high ≥ 85%, medium ≥ 65%, low)
   
**Output**: `XrdInterpretation`:
```typescript
{
  primaryPhase: string;        // "CuFe2O4" หรือ "No assignment"
  decision: string;            // full scientific decision
  confidenceScore: number;     // 0–100
  confidenceLevel: 'high' | 'medium' | 'low';
  evidence: string[];          // matched peak statements
  conflicts: string[];         // conflict detail
  caveats: string[];           // limitations
  summary: string;             // one-line summary
}
```

**Limitations**: 
- แค่ compact reference set (ไม่ครอบคลุมทุก phase)
- Position-based deterministic matching (±0.2°)
- Intensity differences ใช้แค่ใน scoring (ไม่ใช่ fitting)
- ไม่สามารถ confirm phase purity, synthesis success, composition, material performance

---

### 2.2 XPS Skill — `src/agents/xpsAgent/runner.ts` (824 บรรทัด)

**Pipeline 6 ขั้นตอน:**

1. **`calibrateEnergy(bindingEnergy, shift)`** → shift ค่า BE ทุกค่า

2. **`subtractBackground(intensity, method, iterations, smoothingFactor)`** 
   - Linear: straight line from start to end
   - Shirley (simplified): iterative weighted percentile
   - Return: `{ intensity (corrected), baseline }`

3. **`smoothData(intensity, windowSize=5)`** → moving average

4. **`detectPeaks(bindingEnergy, intensity, prominence, minDistance)`** → local maxima + prominence + min distance + FWHM + area (trapezoidal approximation)

5. **`fitPeaks(peaks, model)`** → simulate refinement (intensity * 0.98, FWHM * 1.02)

6. **`assignChemicalStates(peaks, tolerance, useIntensity)`**:
   - Classify satellite peaks (940–945 eV for Cu²⁺)
   - Match ordinary peaks → `XPS_REFERENCE_DATABASE` (built from `XPS_REFERENCE_DATA`)
   - `findBestMatch(peak, references)` → Gaussian-weighted score `exp(-delta²/(2σ²)) * diagnosticWeight`
   - `aggregateByState(matches, allPeaks)`:
     - Group by `{element}-{state}`
     - Track: matchedOrbitals, totalScore, weightedArea, diagnosticPeakCount, hasPrimary, hasSpinOrbitPartner (2p3/2+2p1/2, 3d5/2+3d3/2, 4f7/2+4f5/2), hasSatellite
     - **Confidence rules**:
       - HIGH: Primary + Partner + Satellite (Cu²⁺) หรือ Primary + Partner (others)
       - MEDIUM: Primary + (Partner OR Satellite)
       - LOW: No primary หรือ insufficient
   - Generate `scientificSummary` (dominant state + minor contributions)

**Output**: `XpsProcessingResult`:
```typescript
{
  signal: { bindingEnergy: number[], intensity: number[] },
  baseline: number[],
  peaks: XpsPeak[],
  matches: XpsChemicalStateMatch[],
  stateAggregations: StateAggregation[],
  confidence: 'high' | 'medium' | 'low',
  caveats: string[],
  scientificSummary: string,
  processingSteps: string[],
  parametersUsed: XpsProcessingParams
}
```

**Limitations**: 
- Simplified Shirley/Tougaard
- Cannot determine bulk composition, complete phase assignment, phase purity
- Surface-sensitive (top ~10 nm)

---

### 2.3 FTIR Skill — `src/agents/ftirAgent/runner.ts` (1065 บรรทัด)

**Pipeline 6 ขั้นตอน:**

1. **`correctBaseline(dataPoints, method, polynomialOrder, iterations)`** → `applyBaseline()` จาก useX7UniversalHook
2. **`smoothData(dataPoints, method, windowSize, polynomialOrder)`** → `applySmoothing()`
3. **`detectBands(dataPoints, prominence, minDistance, minHeight)`**:
   - Local maxima + prominence + FWHM → classification (narrow < 50, medium 50–100, broad > 100 cm⁻¹)
   - Strict filter: intensity ≥ 0.08, FWHM ≤ 500, prominence ≥ 0.04, area ≥ 2.0
   - Flat region reject (2000–3000 cm⁻¹ ยกเว้น C-H ~2920)
   - Near-duplicate removal (keep stronger within 40 cm⁻¹)
4. **`assignBands(bands, database, tolerance)`** → match กับ `FTIR_GROUP_CORRELATION_TABLE` (10 reference ranges) ด้วย position + width scoring
5. **`matchFunctionalGroups(matches, bands, ambiguityThreshold)`**:
   - Supporting band validation (e.g., water bending + surface hydroxyl)
   - Overlap hypothesis scoring (carbonate/carboxylate 1400–1650 cm⁻¹)
   - Cross-band interpretation (water ↔ hydroxyl consistency)
   - Width-based scoring adjustment
   - Hard caps: ambiguous → 60%, missing support → 70%, broad → 65%, overlap → 60%, global cap 90%
6. **`generateInterpretation(candidates, bands, allMatches)`**:
   - Chemical interpretation (hydrated metal oxide, carbonate ambiguity)
   - Global confidence: average score - ambiguity penalty (2%) - broad penalty (1.5%) - missing support (2%) + matched bonus (5%)
   - Cap: A1g+supporting → 75%, A1g only → 70%, no A1g → 45%

**Output**: `FtirProcessingResult`:
```typescript
{
  signal: { wavenumber: number[], absorbance: number[] },
  baseline: number[],
  bands: FtirDetectedBand[],
  matches: FtirBandMatch[],
  candidates: FtirFunctionalGroupCandidate[],
  interpretation: FtirInterpretation,
  validation: { ok, errors, warnings, pointCount, wavenumberRange },
  executionLog: any[],
  parametersUsed: FtirProcessingParams
}
```

**Limitations**: 
- Cannot determine crystal structure, phase purity, crystallographic identity
- Carbonate/carboxylate overlap unresolvable by FTIR alone
- Broad O-H band may include multiple contributions

---

### 2.4 Raman Skill — `src/agents/ramanAgent/runner.ts` (543 บรรทัด)

**Pipeline 6 ขั้นตอน:**

1. **Cosmic Ray Removal** → `removeCosmicRays()` (median filter)
2. **Baseline Correction** → `correctBaseline(dataPoints, method)` (Polynomial/Rubberband/Linear/ALS/Rolling Ball)
3. **Smoothing** → `smoothData(dataPoints, windowSize=9)` (Savitzky-Golay)
4. **Peak Detection** → `detectPeaks(dataPoints, prominence=0.12, minDistance=25, minHeight=0.10)`:
   - Local maxima + prominence + FWHM → classification (sharp < 30, medium 30–60, broad > 60 cm⁻¹)
   - Strict filter: intensity ≥ 0.10, FWHM ≤ 200, prominence ≥ 0.08, area ≥ 3.0
   - Near-duplicate removal (keep stronger within 30 cm⁻¹)
5. **Mode Assignment** → `assignModes(peaks, database)` → match กับ `RAMAN_MODE_DATABASE` (`RAMAN_STARTER_DATABASE`):
   - Spinel modes: A1g (~690 cm⁻¹), T2g (~585 cm⁻¹), Eg (~300 cm⁻¹)
   - Carbon modes: D band (~1350 cm⁻¹), G band (~1580 cm⁻¹)
6. **Mode Matching + Interpretation** → `matchModes()` + `generateInterpretation()`:
   - Strict hierarchy: A1g > supporting ferrite modes (Eg/T2g/F2g) > others
   - Confidence caps: A1g+supporting → 75%, A1g only → 70%, no A1g → 45%
   - D/G penalty: multiplicative 0.90
   - Broad peak penalty: -3% per broad peak

**Output**: `RamanProcessingResult`:
```typescript
{
  signal: { ramanShift: number[], intensity: number[] },
  baseline: number[],
  peaks: RamanDetectedPeak[],
  matches: RamanPeakMatch[],
  modeCandidate: RamanModeCandidate[],
  interpretation: RamanInterpretation,
  validation: { ok, errors, warnings, pointCount, ramanShiftRange },
  executionLog: any[],
  parametersUsed: RamanProcessingParams
}
```

**Limitations**:
- Cannot independently replace crystallographic validation
- Cannot distinguish isostructural spinels (e.g., CoFe₂O₄ vs NiFe₂O₄)
- Intensity ratios sensitive to baseline, laser power, sample orientation
- D/G bands indicate carbon, not ferrite identity

---

## 3. Science Skill

### 3.1 Material Context

**Source**: `src/data/demoProjects.ts` → `DemoProject` interface:
```typescript
{
  id: string;              // 'cufe2o4-sba15', 'nife2o4', 'cafe2o4', 'fe3o4-np', 'batio3'
  name: string;            // 'CuFe2O4/SBA-15', 'NiFe2O4', etc.
  material: string;        // 'CuFe2O4', 'NiFe2O4', 'CoFe2O4', 'Fe3O4', 'BaTiO3'
  objective: string;       // research objective
  jobType?: 'research' | 'rnd' | 'analytical';
  techniques: Technique[]; //  ['XRD', 'XPS', 'FTIR', 'Raman'] หรือ subset
  claimStatus: 'strongly_supported' | 'supported' | 'partial' | 'inconclusive' | 'contradicted';
  validationState: 'complete' | 'partial' | 'requires_validation';
  phase: string;           // phase name
  xrdPeaks: DemoPeak[];   // 9 diffraction peaks
  evidence: string[];
  validationGaps: ValidationGap[];
  nextDecisions: NextDecision[];
  notebook: { title, pipeline, peakDetection, phaseIdentification };
}
```

**Condition Context** (`ExperimentConditionLock`):
- Synthesis: method, precursorRatio, solvent, pH, temperature, time, calcination, atmosphere
- Measurement: instrument, source, scanRange, stepSize, scanRate, calibration
- Processing: baselineCorrection, smoothing, normalization, peakDetection, fittingModel, referenceDB
- Validation: replicateRequired, referenceValidationRequired, crossTechniqueRequired[], refinementRequired, publicationClaimAllowed

### 3.2 Phase / Bonding / Oxidation / Structure Reasoning

| Aspect | XRD | XPS | FTIR | Raman |
|--------|-----|-----|------|-------|
| **Primary Output** | Phase candidate + score | Element oxidation state + confidence | Functional group + confidence | Mode assignment + confidence |
| **Reference** | `XRD_PHASE_DATABASE` (COD/JCPDS) | `XPS_REFERENCE_DATA` (literature) | `FTIR_GROUP_CORRELATION_TABLE` (literature) | `RAMAN_MODE_DATABASE` (RRUFF/literature) |
| **Scoring** | Weighted peak matching + penalties | Gaussian-weighted BE tolerance | Position + width + support | Position + width + support |
| **Confidence** | High ≥ 85%, Medium ≥ 65%, Low | High: primary+partner+satellite; Medium: primary+one; Low: otherwise | High > 75%, Medium > 50%, Low | A1g+supporting > 70%, A1g only > 60%, else Low |
| **Caveats** | ±0.2° deterministic, compact set | Surface only, simplified Shirley | No phase info, overlap ambiguity | Isostructural ambiguity, D/G bands |

### 3.3 Cross-Tech Interpretation (Fusion Engine)

**ไฟล์**: `src/engines/fusionEngine/fusionEngine.ts` (1413 บรรทัด)

**Concept Mapping** (evidence ID → concept):
```
xrd-spinel          → 'cubic-spinel-lattice'
raman-a1g           → 'tetrahedral-site-vibration'  
xrd-non-spinel      → 'alternative-crystalline-phase'
xrd-amorphous       → 'absence-of-long-range-order'
raman-disorder      → 'structural-disorder'
ftir-mo-band        → 'metal-oxygen-framework'
ftir-oxide-band     → 'oxide-bonding'
xps-oxide           → 'oxidized-surface-state'
xps-mixed-state     → 'mixed-oxidation-state'
```

**Category Mapping**:
```
crystalline: xrd-spinel, raman-a1g, xrd-non-spinel, ftir-mo-band, ftir-oxide-band, xps-oxide
non-crystalline: xrd-amorphous, raman-disorder, xps-mixed-state
```

**3 Competing Claims**:

| Claim | Type | Required Evidence | Incompatible Concepts |
|-------|------|------------------|----------------------|
| `spinel-ferrite` | structure | raman-a1g, xrd-spinel | absence-of-long-range-order, structural-disorder |
| `non-spinel-oxide` | structure | xrd-non-spinel, xps-oxide | cubic-spinel-lattice, absence-of-long-range-order |
| `amorphous-disordered` | structure | xrd-amorphous, raman-disorder | cubic-spinel-lattice, tetrahedral-site-vibration, alternative-crystalline-phase |

**Validation Priority**:
1. Concept contradiction (highest priority) → INVALID
2. Category contradiction → INVALID  
3. ID-based contradiction → INVALID
4. All required evidence present → ACTIVE
5. Some required evidence → PARTIAL
6. No required evidence → UNSUPPORTED

**Output States**:
- Exclusive conflict → mutually exclusive models
- All invalid → contradictory dataset
- 1 active + others invalid → strong assignment (enhanced conclusion)
- Multiple active → conflict
- 1 active → dominant claim (spinel/non-spinel/amorphous specific narrative)
- Multiple partial → competing hypotheses
- No active → insufficient evidence

### 3.4 Alternative Explanation

- **FTIR**: Carbonate/carboxylate overlap ambiguity (1400–1650 cm⁻¹) → explicit ambiguity detection with hypothesis scoring
- **XRD**: Multiple candidates within 5% score → `ambiguousCandidates[]` with recommendation for complementary techniques
- **XPS**: Mixed Cu oxidation states (Cu⁺ + Cu²⁺) → caveat generation
- **Raman**: D/G bands → carbon contamination ambiguity (multiply confidence by 0.90, force medium confidence)
- **Fusion Engine**: Multiple ACTIVE claims → conflict result + competing hypotheses

---

## 4. Agent Workspace — `src/pages/AgentDemo.tsx` (3938 บรรทัด)

### 4.1 Core Concepts

**3 Agent Modes**:
| Mode | Description | Tabs | Primary Action |
|------|------------|------|---------------|
| `deterministic` | Controlled reproducible workflow | Goal, Parameters, Evidence, Trace, Boundary | Run Workflow |
| `guided` | Researcher-agent interpretation | Question, Evidence, Discussion, Boundary, Notebook | Review Evidence |
| `autonomous` | Agent-led evidence review | Objective, Plan, Findings, Gaps, Decision | Start Review |

**4 Technique Contexts**: XRD, XPS, FTIR, Raman  
แต่ละ context มี `CONTEXT_CONFIG` กำหนด 7 stages:

| Stage | XRD | XPS | FTIR | Raman |
|-------|-----|-----|------|-------|
| 1. Dataset | load_xrd_dataset | load_xps_spectrum | load_ftir_spectrum | load_raman_spectrum |
| 2. Process | detect_xrd_peaks | subtract_xps_background | correct_ftir_baseline | preprocess_raman_signal |
| 3. Features | search_phase_database | detect_core_level_components | detect_ftir_bands | detect_raman_modes |
| 4. Assign | evaluate_phase_candidates | assign_oxidation_states | assign_vibrational_modes | match_structural_fingerprint |
| 5. Fusion | analyze_peak_conflicts | evaluate_surface_evidence | evaluate_bonding_evidence | evaluate_structural_evidence |
| 6. Interpret | interpretation_refinement | interpretation_refinement | interpretation_refinement | interpretation_refinement |
| 7. Boundary | generate_xrd_interpretation | decision_logic | decision_logic | decision_logic |

### 4.2 What Agent Can Do

1. **Run deterministic XRD workflow**: เรียก `runXrdPhaseIdentificationAgent()` → validation → preprocessing → peak detection → phase search → scoring → conflict analysis → interpretation
2. **Evidence fusion**: `evaluateFusionEngine(evidenceNodes)` / `createEvidenceNodes(peakInputs)` → `FusionResult`
3. **Evidence packet building**: `buildXRDEvidencePacket()` / `buildGenericEvidencePacket()` → `AgentEvidencePacket`
4. **Literature search**: `searchLiterature()` → `ResearchEvidenceItem[]`
5. **Claim boundary artifact**: `buildClaimBoundaryArtifact()` → `ClaimBoundaryArtifact`
6. **Discussion refinement**: `refineDiscussionFromProcessing()` → save to notebook
7. **XPS element evidence**: `readLatestXpsElementEvidence()` → `detectXpsXrdOxidationContradiction()` → `xpsOxidationStatePeakInputs()`
8. **Context switching**: เปลี่ยน technique กลางคันได้ → reset state + create new tool trace
9. **Execution modes**: `'auto'` (รันทุก stage อัตโนมัติ) หรือ `'step'` (pause ทีละ stage)

### 4.3 What Agent Cannot Do

1. **Multi-technique autonomous orchestration** — ไม่สามารถรันหลายเทคนิคพร้อมกัน หรือตัดสินใจเองว่าจะใช้เทคนิคไหน
2. **Real LLM reasoning** — `modelMode` มีแค่ `'deterministic'` ที่ active; `'vertex-gemini'` และ `'gemma'` แสดง 'Model Layer Pending'
3. **Dynamic tool selection** — stages ถูกกำหนดตายตัวใน `CONTEXT_CONFIG`; agent ไม่สามารถเพิ่ม/ลด/เรียงลำดับ stages เอง
4. **Backend Python engines** — `server/python/xrd_engine` และ `xps_engine` มีอยู่แต่ไม่ได้เชื่อมกับ agent workspace
5. **Self-correction** — ไม่มี retry loop ถ้า tool fail
6. **Autonomous parameter tuning** — parameters มาจาก user settings หรือ defaults
7. **Tool approval gating** — `approvalStatus` ใน type system แต่ deterministic mode ไม่ enforce

### 4.4 Tools / Skills Agent Can Call

**XRD tools** (7 tools):
- `load_xrd_dataset` (XRD Science Skill: Load Dataset)
- `detect_xrd_peaks` (XRD Science Skill: Peak Detection)
- `search_phase_database` (XRD Science Skill: Candidate Search)
- `evaluate_phase_candidates` (XRD Science Skill: Candidate Evaluation)
- `analyze_peak_conflicts` (Cross-Technique Fusion Skill)
- `interpretation_refinement` (Evidence-to-Report Skill: Interpreter)
- `generate_xrd_interpretation` (Validation Boundary Skill: Claim Review)

**XPS tools** (6 tools):
- `load_xps_spectrum` → `subtract_xps_background` → `detect_core_level_components` → `assign_oxidation_states` → `evaluate_surface_evidence` → `interpretation_refinement` → `decision_logic`

**FTIR tools** (6 tools):
- `load_ftir_spectrum` → `correct_ftir_baseline` → `detect_ftir_bands` → `assign_vibrational_modes` → `evaluate_bonding_evidence` → `interpretation_refinement` → `decision_logic`

**Raman tools** (6 tools):
- `load_raman_spectrum` → `preprocess_raman_signal` → `detect_raman_modes` → `match_structural_fingerprint` → `evaluate_structural_evidence` → `interpretation_refinement` → `decision_logic`

### 4.5 State Management

**AgentDemoState** (full state):
```typescript
{
  projectId, sessionId, mode, context, datasetId,
  modelMode: 'deterministic' | 'vertex-gemini' | 'gemma',
  graphState: { showMarkers },
  reasoningState: { status, currentStepIndex, executionMode, result: DecisionResult | null, logs[] },
  toolTrace: ToolTraceEntry[],
  llmState: { output, usedLlm, fallbackUsed },
  researchEvidence: ResearchEvidenceItem[],
  provenance: ReasoningProvenance | null,
  literatureTrace: LiteratureSearchTrace | null,
  claimBoundary: ClaimBoundaryArtifact | null
}
```

---

## 5. Notebook Lab — `src/pages/NotebookLab.tsx` (4025 บรรทัด)

### 5.1 Hypothesis Storage

- **`saveNotebookEntry(entry: NotebookEntry)`** → saves to localStorage
- **`createNotebookEntryFromRefinement(refinement)`** → converts discussion refinement → notebook entry
- **3 Template Modes** (`NotebookTemplateMode`):
  - `'research'`: hypothesis-driven, manuscript-ready, publication-limited
  - `'rd'`: prototype development, go/no-go, technical report
  - `'analytical'`: sample analysis, QA/QC, analytical report
- Per-project notebook structure: **5 tabs** (Objective/Context, Evidence, Interpretation, Validation Gap, Decision)
- `getProjectNotebookContent(projectId)` → pulls from `registryProject.notebook`

### 5.2 Reasoning Storage

- **`reasoningTrace[]`** จาก `FusionResult` → claim-level trace with evidence IDs, contradiction IDs, status, group, isExclusiveConflict, categoryConflict, conceptMatch, conceptConflict, isDominant
- **`getProjectEvidenceSnapshot(projectId)`** → `ProjectEvidenceSnapshot` (full evidence state with provenance)
- **`refineDiscussionFromProcessing(processingResult)`** → generates narrative text
- **`saveAgentDiscussionRefinement(projectId, discussion)`** → stores refinement to localStorage
- **`getLatestAgentDiscussionRefinement(projectId)`** → retrieves latest discussion
- **`getLatestNotebookEntry(projectId)`** → retrieves latest notebook entry

### 5.3 Parameter Decision Storage

- **`ProcessingRun.parameters`** → full snapshot:
  ```typescript
  {
    imported: boolean,
    baseline: boolean,
    backgroundSubtract: boolean,
    smoothing: boolean,
    normalize: boolean,
    ftirOffset: number,
    ftirSlope: number,
    cropMin: number | '',
    cropMax: number | '',
    region: string    // XPS region
  }
  ```
- **`ExperimentConditionLock`** → 4 กลุ่ม conditions (synthesis, measurement, processing, validation)
- **`getParameterProvenanceSummary()`** → formatted parameter trace
- **`generateParameterProvenanceMarkdown()`** → markdown for notebook/report
- **`formatParameterValueForDisplay()`** → human-readable parameter display
- **`readProjectWorkspaceParameters(projectId)`** → reads saved parameters

### 5.4 Run History / Failed Attempt Storage

- **`saveProcessingRun(run: ProcessingRun)`** → saves with auto-generated id + timestamp
- **`getProcessingRuns(datasetId)`** → returns all runs for dataset
- **`getLatestProcessingRun(datasetId)`** → returns most recent run
- **`ProcessingRun` interface**:
  ```typescript
  {
    id, datasetId, projectId, technique, timestamp,
    parameters: Record<string, string | number | boolean>,
    outputData: SpectrumPoint[],
    detectedFeatures: DemoPeak[],
    evidence: Evidence[],
    matchResult: { phase, claimStatus, matchedPeaks, missingPeaks, unexplainedPeaks, caveat },
    log: string[]
  }
  ```
- **`getRun(runId)` / `saveRun(run: AgentRun)`** → for AgentRun persistence  
- **Failed runs**: Error states in `XrdAgentResult.executionLog[]` with step, status ('error' | 'warning' | 'complete'), summary
- **localStorage keys**: local experiments, datasets, processing runs, saved evidence, agent runs

---

## 6. Reports

### 6.1 Report Data Sources

| Source | Data | Access Method |
|--------|------|--------------|
| Workspace Processing Runs | Parameters, features, match, log | `getProcessingRuns(datasetId)` |
| Agent Execution Results | Interpretation, confidence, evidence | `getRun(runId)`, `loadAgentRunResult()` |
| Evidence Nodes | Claim, support, limitations, role | `getSavedEvidence(projectId, technique)` |
| Notebook Entries | Hypothesis, discussion, report draft | `getNotebookEntry(projectId)`, `getLatestNotebookEntry()` |
| Condition Lock | Synthesis, measurement, processing, validation | `getExperimentConditionLock(projectId, experimentId)` |
| Evidence Snapshot | Full evidence state with provenance | `getProjectEvidenceSnapshot(projectId)` |
| Processing Results | XRD workflow handoff data | `getProcessingResult(projectId)`, `getLatestProcessingResult()` |

### 6.2 Trace

**3 Levels of Trace:**

1. **Fusion Level**: `FusionResult.reasoningTrace[]`:
   ```typescript
   ReasoningTraceItem {
     claimId: string;           // 'spinel-ferrite' | 'non-spinel-oxide' | 'amorphous-disordered'
     status: 'active' | 'partial' | 'unsupported' | 'invalid';
     evidenceIds: string[];     // evidence that supports
     contradictingEvidenceIds: string[];
     group: string;             // 'structure' | 'none'
     isExclusiveConflict: boolean;
     categoryConflict: boolean;
     conceptMatch: boolean;
     conceptConflict: boolean;
     isDominant: boolean;
   }
   ```

2. **Agent Level**: `XrdExecutionLogEntry[]`:
   ```typescript
   { step: string; status: 'complete' | 'warning' | 'error'; summary: string }
   ```
   Steps: validate_xrd_input → preprocess_xrd → detect_xrd_peaks → search_phase_database → score_phase_candidates → analyze_peak_conflicts → generate_xrd_interpretation

3. **Tool Trace Level**: `ToolTraceEntry[]`:
   ```typescript
   {
     id, timestamp, context, toolName, displayName,
     callType: 'deterministic-tool' | 'approval-gate' | 'local-write',
     provider, status: 'pending' | 'running' | 'complete' | 'error',
     argsSummary, resultSummary, evidenceImpact,
     approvalStatus: 'not-required' | 'approved' | 'gated' | 'pending',
     durationMs, canInsertLlmReasoningAfter?
   }
   ```

**Audit Trace Window**: `src/components/notebook/AuditTraceWindow.tsx`

### 6.3 Claim Boundary

**`ClaimBoundaryArtifact`** (via `buildClaimBoundaryArtifact()`):
- Structured signals + deterministically rendered text
- Generation function: `src/utils/claimBoundaryArtifact.ts`

**Claim Status Mapping**:
| Status | Display Label |
|--------|--------------|
| `strongly_supported` | 'Supported' |
| `supported` | 'Requires validation' |
| `partial` | 'Validation-limited' |
| `inconclusive` | 'Publication-limited' |
| `contradicted` | 'Contradicted' |

**Safety Checks**:
- `isBlockedNotebookReferenceCandidatePhrase(value)`: blocks "confirmed phase", "confirmed identity", "identified as", "pure phase", "definitive match"
- `sanitizeScientificWording()`: enforces safe wording throughout
- `NOTEBOOK_REFERENCE_CANDIDATE_BOUNDARY_LINES`: ["Candidate evidence only", "Not identity confirmation", "Not phase purity confirmation", "Composition-sensitive evidence required for stronger assignment"]

**Limitations Array** (ตัวอย่างจาก FusionResult):
- "XRD provides bulk-averaged structure; surface reconstruction or amorphous surface layers not detected"
- "Cation distribution between tetrahedral and octahedral sites not determined from current evidence"
- "Raman selection rules may obscure certain vibrational modes depending on laser polarization"
- "Additional structural refinement required for definitive phase identification"

### 6.4 Evidence Fusion

**Fusion Engine** (`src/engines/fusionEngine/fusionEngine.ts`):
- Input: `EvidenceNode[]` (id, technique, x, unit, label, inferredCategory?, concept?)
- Evidence IDs ถูก map ไปยัง concepts (ดู 3.3)
- 3 competing claims with required/optional/contradicting evidence
- Concept, category, ID contradiction detection
- Exclusive group conflict (mutually exclusive models)
- 6 output states (exclusive conflict, contradictory, strong assignment, conflict, dominant, competing hypotheses, insufficient)

**Claim Graph Engine** (`src/engines/claimGraph/`):
- Alternative fusion path via `evaluateClaimGraph()`
- Evidence propagation + status tracking
- Fallback: ถ้า ClaimGraph fail → legacy fusion engine

**Multi-Tech Workspace**:
- `src/pages/MultiTechWorkspace.tsx` — visual fusion UI
- `src/pages/FusionWorkspace.tsx` — contribution matrix visualization
- `ContributionMatrix` component: shows technique contributions to claims

**Consistency Registry** (`src/engines/fusionEngine/consistencyRegistry.ts`):
- `CANONICAL_PHASE_REGISTRY`
- `matchesPhase()` / `matchesOxidationState()` — cross-technique phase validation
- Unweighted independent counting approach

### 6.5 Export Formats

**`exportDemoArtifact(format, config)`** (`src/utils/demoExport.ts`):
```typescript
function exportDemoArtifact(
  format: 'pdf' | 'docx' | 'csv' | 'txt' | 'png',
  config: {
    filenameBase: string,
    title: string,
    sections: [{ heading: string, lines: (string | undefined)[] }],
    csvRows?: Record<string, unknown>[]
  }
)
```

Report Sections (ตัวอย่าง):
1. **Dataset**: fileName, sampleName, labels
2. **Processing state**: status, baseline, background, smoothing, normalize, region
3. **Detected features**: feature labels, positions, intensities
4. **Processing log**: timestamped log entries

**Notebook Export**: PDF via browser Print/Download, `sanitizeExportContent()` for safety

---

## 7. How Each Part Connects

### 7.1 Data Flow Diagram (ละเอียด)

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ WORKSPACE (TechniqueWorkspace.tsx)                                                  │
│                                                                                     │
│  User → เลือก project/dataset → ปรับ parameters → detect → match → save evidence   │
│                                                                                     │
│  Output: ProcessingRun (localStorage)                                               │
│  { datasetId, projectId, technique, parameters, outputData,                         │
│    detectedFeatures, evidence[], matchResult, log }                                 │
│                                                                                     │
│  Evidence (localStorage)                                                            │
│  { id, technique, datasetId, claim, evidenceRole, support, limitations }            │
└────────────────────────┬────────────────────────────────────────────────────────────┘
                         │
                         │ 1. getProcessingRuns(datasetId) → ProcessingRun[]
                         │    getSavedEvidence(projectId, technique) → Evidence[]
                         │    getLatestProcessingRun(datasetId) → ProcessingRun | null
                         ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ TECHNIQUE SKILL (Agent Runners)                                                     │
│                                                                                     │
│  XRD: runXrdPhaseIdentificationAgent(input, params?) → XrdAgentResult              │
│    validation → preprocess → detect → search → score → conflicts → interpretation  │
│                                                                                     │
│  XPS: runXpsProcessing(dataset, params?) → XpsProcessingResult                      │
│    calibrate → background → smooth → detect → fit → assign → aggregate              │
│                                                                                     │
│  FTIR: runFtirProcessing(dataset, params?) → FtirProcessingResult                   │
│    baseline → smooth → normalize → detect → assign → match → interpret              │
│                                                                                     │
│  Raman: runRamanProcessing(dataset, params?) → RamanProcessingResult                │
│    cosmic → baseline → smooth → detect → assign → match → interpret                 │
└────────────────────────┬────────────────────────────────────────────────────────────┘
                         │
                         │ 2. adaptXrdEvidence(result, datasetId, sampleName) → UniversalEvidenceNode[]
                         │    adaptXpsEvidence(result, datasetId, sampleName) → UniversalEvidenceNode[]
                         │    adaptFtirEvidence(result, datasetId, sampleName) → UniversalEvidenceNode[]
                         │    adaptRamanEvidence(result, datasetId, sampleName) → UniversalEvidenceNode[]
                         ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ SCIENCE SKILL (Evidence Adapters → UniversalEvidenceNode)                          │
│                                                                                     │
│  UniversalEvidenceNode:                                                             │
│  { id, technique: 'XRD' | 'XPS' | 'FTIR' | 'Raman' | 'TEM' | 'BET' | ... (11),    │
│    primaryAxis, primaryAxisUnit, value, valueUnit, label, concept?,                 │
│    inferredCategory?: 'crystalline' | 'non-crystalline',                            │
│    role?: 'primary' | 'supporting' | 'validation' | 'contextual',                   │
│    confidence?: 'high' | 'medium' | 'low' | 'uncertain',                            │
│    techniqueMetadata?: XRD | XPS | FTIR | Raman | XAS | TEM | BET | TPD | NMR |    │
│                        SEM | XRF metadata,                                          │
│    provenance?: { datasetId, sampleName, processingHash?, createdAt, dbSource?,     │
│                  sourceId?, sourceDoi?, matchSource?, formula?, summary?,           │
│                  tolerance?, rawConfidence? } }                                     │
└────────────────────────┬────────────────────────────────────────────────────────────┘
                         │
                         │ 3. evaluateFusionEngine(nodes) → FusionResult
                         │    หรือ evaluateClaimGraph(input) → ClaimGraphResult (fallback)
                         ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ EVIDENCE FUSION (Fusion Engine)                                                     │
│                                                                                     │
│  Input: UniversalEvidenceNode[]                                                     │
│  Mapping: evidence ID → concept (9 concepts)                                        │
│  Claims: spinel-ferrite, non-spinel-oxide, amorphous-disordered                     │
│  Validation: concept > category > ID contradiction → INVALID                        │
│  Output: FusionResult { conclusion, basis[], crossTech, limitations[],              │
│                         decision, reasoningTrace[], highlightedEvidenceIds[] }      │
│                                                                                     │
│  Consistency Registry: CANONICAL_PHASE_REGISTRY                                     │
│    matchesPhase(), matchesOxidationState()                                          │
└────────────────────────┬────────────────────────────────────────────────────────────┘
                         │
                         │ 4. FusionResult → AgentDemo.tsx DecisionResult
                         ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ AGENT WORKSPACE (AgentDemo.tsx)                                                     │
│                                                                                     │
│  Deterministic mode: 7 stages per technique                                         │
│  DecisionResult: { runId, primaryResult, subtitle, reasoningTrace,                  │
│                   conclusion, basis[], crossTech, limitations[], decision,           │
│                   highlightedEvidenceIds[], metrics[], detailRows[] }               │
│                                                                                     │
│  Output: saveAgentRunResult() → AgentRunResult (localStorage)                       │
│          saveRun(run) → AgentRun (localStorage)                                     │
└────────────────────────┬────────────────────────────────────────────────────────────┘
                         │
                         │ 5. saveNotebookEntry(entry) → localStorage
                         │    createNotebookEntryFromRefinement(refinement)
                         │    refineDiscussionFromProcessing(processingResult)
                         ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ NOTEBOOK (NotebookLab.tsx)                                                          │
│                                                                                     │
│  Tabs: Objective/Context | Evidence | Interpretation | Validation Gap | Decision    │
│  Template modes: research | rd | analytical                                         │
│                                                                                     │
│  Data stored:                                                                       │
│  - NotebookEntry: { projectId, title, summary, discussion, evidenceBasis,           │
│                     validationBoundary, reportDraft, templateMode, createdAt }      │
│  - ProcessingResult: full XRD workflow output                                       │
│  - AgentDiscussionRefinement: llm-refined discussion text                           │
│  - Evidence snapshot: full evidence + provenance                                    │
│  - Condition lock: full experimental condition record                               │
│  - Run history: ProcessingRun[] + AgentRun[]                                        │
└────────────────────────┬────────────────────────────────────────────────────────────┘
                         │
                         │ 6. exportDemoArtifact(format, {sections, csvRows})
                         ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ REPORTS (Export)                                                                   │
│                                                                                     │
│  Formats: PDF, DOCX, CSV, TXT, PNG                                                 │
│  Sections: Dataset, Processing state, Detected features, Processing log             │
│  Includes: trace (reasoningTrace, executionLog, toolTrace),                         │
│            claim boundary (ClaimBoundaryArtifact, limitations, caveats),            │
│            evidence fusion (crossTech, basis, conclusion),                          │
│            conditions (ExperimentConditionLock section lines),                      │
│            provenance (dataset ids, timestamps, source refs)                        │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Integration Points (Code-Level)

| Integration | Mechanism | Key Functions |
|-------------|-----------|---------------|
| localStorage | Shared persistence layer | `saveProcessingRun()`, `getProcessingRuns()`, `saveEvidence()`, `getSavedEvidence()`, `saveExperiment()`, `getLocalExperiments()`, `saveRun()`, `getRun()` |
| Evidence IDs | Cross-subsystem linking | `xrd-spinel`, `raman-a1g`, `xps-oxide`, `ftir-mo-band` → mapped in `EVIDENCE_CATEGORY` + `EVIDENCE_CONCEPT` |
| Condition Lock | Experiment → Notebook → Report | `lockExperimentConditions()`, `getExperimentConditionLock()`, `getConditionLockSectionLines()` |
| Processing Run IDs | Workspace ↔ Notebook ↔ Agent | `ProcessingRun.id` → query param `?run={id}` → `getProcessingRun(id)` |
| Project IDs | All pages | `projectId` → `getProject(id)`, `getRegistryProject(id)` |
| Agent Run IDs | Agent ↔ Notebook | `AgentRun.id` → `getRun(id)` → notebook routing |
| Evidence Adapters | Technique Skill → Fusion | `adaptXrdEvidence()`, `adaptXpsEvidence()`, `adaptFtirEvidence()`, `adaptRamanEvidence()` |
| Fusion Engine | Agent Workspace | `evaluateFusionEngine(nodes)`, `createEvidenceNodes(input)` |
| Discussion Refinement | Agent → Notebook | `refineDiscussionFromProcessing()`, `saveAgentDiscussionRefinement()`, `createNotebookEntryFromRefinement()` |

### 7.3 Key Data Flow Sequence (Example: XRD Full Workflow)

1. User imports dataset → `handleImport()` → saves `imported=true`
2. User adjusts baseline/smoothing/normalize → `useMemo` recomputes `processedData`
3. User clicks "Detect Peaks" → `handleDetect()` → `getTechniqueFeatures()` → `detectedFeatures` set
4. User clicks "Match Phase" → `handleMatch()` → `matched=true` → shows phase interpretation
5. User clicks "Save Evidence" → `handleSaveEvidence()` → `makeEvidence()` → `saveEvidence()` → localStorage
6. User clicks "Save Run" → `handleSaveRun()` → `createRun()` → `saveProcessingRun()` → localStorage
7. User clicks "Run Agent" → navigates to AgentDemo → `runXrdPhaseIdentificationAgent()`:
   - `validate_xrd_input()` → checks ≥80 points
   - `preprocess_xrd()` → smooth + baseline + normalize
   - `detect_xrd_peaks()` → local maxima + prominence + FWHM
   - `search_phase_database()` → match vs XRD_PHASE_DATABASE (±0.2°)
   - `score_phase_candidates()` → weighted scoring + penalties
   - `analyze_peak_conflicts()` → missing, unexplained, impurities, ambiguity
   - `generate_xrd_interpretation()` → evidence + conflicts + caveats
8. Agent calls `adaptXrdEvidence()` → `UniversalEvidenceNode[]` → `evaluateFusionEngine()` → `FusionResult`
9. Agent shows DecisionResult: conclusion, basis, crossTech, limitations
10. User clicks "Save to Notebook" → navigates to NotebookLab → `refineDiscussionFromProcessing()` → `saveNotebookEntry()`
11. Notebook renders: objective, evidence, interpretation, validation gap, decision
12. User exports → `exportDemoArtifact()` → PDF/DOCX/CSV/TXT/PNG with trace, boundary, fusion

---

*Generated from codebase analysis — 7 กรกฎาคม 2026*