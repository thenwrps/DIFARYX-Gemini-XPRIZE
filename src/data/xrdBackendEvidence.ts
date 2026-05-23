/**
 * XRD Backend Evidence Persistence
 *
 * Stores the normalised result returned by the Python XRD backend so that
 * downstream surfaces – Agent Mode, Notebook, and Report – can consume it
 * without re-invoking the backend.
 *
 * Storage key convention:
 *   difaryx-local:xrd-backend-evidence
 *
 * Each record is keyed by (projectId, uploadedRunId | fileName) so that
 * multiple datasets can coexist. Only compact metadata is persisted to
 * stay well within localStorage limits.
 */

import type { ScientificEvidenceObject, XRDNormalizedResult, XRDReferenceMatchV2 } from '../types/xrdBackend';

// ── Storage key ─────────────────────────────────────────────────────

const XRD_BACKEND_EVIDENCE_KEY = 'difaryx-local:xrd-backend-evidence';
const MAX_STORED_SCIENTIFIC_EVIDENCE_BYTES = 48_000;
const DEFAULT_REFERENCE_MATCH_V2_LIMITATIONS = [
  'Candidate match is based on peak-position agreement.',
  'Chemical identity requires composition-sensitive evidence.',
  'Phase purity is not confirmed by XRD matching alone.',
];
const PROHIBITED_REFERENCE_MATCH_V2_LIMITATION_PATTERNS = [
  /confirmed identity/i,
  /identified as/i,
  /definitive match/i,
  /phase purity confirmed/i,
];

// ── Persisted shape ─────────────────────────────────────────────────

export interface XRDBackendEvidenceRecord {
  /** Project the evidence belongs to (or "__unassigned__" for quick-analysis). */
  projectId: string;
  /** Uploaded run id when available. */
  uploadedRunId?: string;
  /** Original file name when available. */
  fileName?: string;
  /** ISO-8601 timestamp of when the record was saved. */
  timestamp: string;

  // ── Compact backend result metadata ─────────────────────────────
  detectedPeakCount: number;
  fittedPeakCount: number;
  snRatio: number;
  baselineDeviation: number;
  peakResolution: XRDNormalizedResult['peakResolution'];
  primaryPhase: string | null;
  matchedPeakCount: number;
  phaseSummary: string | null;
  isPhaseMatched: boolean;
  /** Number of residual points available (full array excluded for size). */
  yResidualCount: number;
  /** Compact skill handoff metadata persisted even when the full object is too large. */
  scientificEvidenceSummary?: XRDSkillEvidenceSummary;
  /** Compact reference candidate evidence persisted for later handoff. */
  referenceMatchV2Summary?: XRDReferenceMatchV2EvidenceSummary;
  /** Full JSON-safe skill evidence when it remains small enough for localStorage. */
  scientificEvidenceObject?: ScientificEvidenceObject;
}

export interface XRDSkillEvidenceSummary {
  evidenceId: string;
  skillId: string;
  skillLabel: string;
  technique: string;
  inputReference: string;
  schemaVersion: string;
  createdAt: string;
  claimBoundary: 'validation-limited scientific claim';
}

export interface XRDReferenceMatchV2EvidenceSummary {
  status: string;
  claimLevel: string;
  referenceSetId?: string;
  candidateCount?: number;
  primaryCandidate?: {
    phaseId?: string;
    phaseLabel?: string;
    formula?: string;
    structureFamily?: string;
    databaseRef?: string;
    score?: number;
    matchedPeakCount?: number;
    referencePeakCount?: number;
    coverageRatio?: number;
    meanDeltaTwoTheta?: number | null;
    positionScore?: number;
    coverageScore?: number;
    chemistryScore?: number;
  };
  matchedPeaksPreview?: Array<{
    measuredTwoTheta: number;
    referenceTwoTheta: number;
    deltaTwoTheta: number;
    hkl?: string | null;
    referenceRelativeIntensity?: number | null;
  }>;
  phaseConfirmed: false;
  phasePurityConfirmed: false;
  limitations: string[];
  savedAt: string;
}

// ── Helpers ─────────────────────────────────────────────────────────

function canUseStorage(): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage !== undefined;
  } catch {
    return false;
  }
}

function readAll(): XRDBackendEvidenceRecord[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(XRD_BACKEND_EVIDENCE_KEY);
    return raw ? (JSON.parse(raw) as XRDBackendEvidenceRecord[]) : [];
  } catch {
    return [];
  }
}

function writeAll(records: XRDBackendEvidenceRecord[]): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(XRD_BACKEND_EVIDENCE_KEY, JSON.stringify(records));
  } catch {
    // Silently ignore quota errors.
  }
}

function makeScientificEvidenceSummary(
  evidenceObject: ScientificEvidenceObject | undefined,
): XRDSkillEvidenceSummary | undefined {
  if (!evidenceObject) return undefined;

  return {
    evidenceId: evidenceObject.evidence_id,
    skillId: evidenceObject.skill_id,
    skillLabel: evidenceObject.skill_label,
    technique: evidenceObject.technique,
    inputReference: evidenceObject.input_reference,
    schemaVersion: evidenceObject.schema_version,
    createdAt: evidenceObject.created_at,
    claimBoundary: 'validation-limited scientific claim',
  };
}

function cloneSmallJsonSafeEvidenceObject(
  evidenceObject: ScientificEvidenceObject | undefined,
): ScientificEvidenceObject | undefined {
  if (!evidenceObject) return undefined;

  try {
    const json = JSON.stringify(evidenceObject);
    const byteLength = typeof TextEncoder === 'undefined'
      ? json.length
      : new TextEncoder().encode(json).byteLength;

    if (byteLength > MAX_STORED_SCIENTIFIC_EVIDENCE_BYTES) {
      return undefined;
    }

    return JSON.parse(json) as ScientificEvidenceObject;
  } catch {
    return undefined;
  }
}

function optionalFiniteNumber(value: number | null | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function optionalString(value: string | null | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function compactLimitations(limitations: string[] | undefined): string[] {
  const normalized = limitations
    ?.map((limitation) => limitation.trim())
    .filter((limitation) => (
      Boolean(limitation) &&
      !PROHIBITED_REFERENCE_MATCH_V2_LIMITATION_PATTERNS.some((pattern) => pattern.test(limitation))
    ));

  return normalized && normalized.length > 0
    ? normalized
    : DEFAULT_REFERENCE_MATCH_V2_LIMITATIONS;
}

export function buildReferenceMatchV2EvidenceSummary(
  referenceMatchV2: XRDReferenceMatchV2 | null | undefined,
  savedAt: string,
): XRDReferenceMatchV2EvidenceSummary | undefined {
  if (!referenceMatchV2) return undefined;

  const primaryCandidate = referenceMatchV2.primary_candidate;
  const matchedPeaksPreview = primaryCandidate?.matched_peaks
    ?.map((peak) => {
      const measuredTwoTheta = optionalFiniteNumber(peak.measured_two_theta);
      const referenceTwoTheta = optionalFiniteNumber(peak.reference_two_theta);
      const deltaTwoTheta = optionalFiniteNumber(peak.delta_two_theta);

      if (
        measuredTwoTheta === undefined ||
        referenceTwoTheta === undefined ||
        deltaTwoTheta === undefined
      ) {
        return null;
      }

      return {
        measuredTwoTheta,
        referenceTwoTheta,
        deltaTwoTheta,
        hkl: peak.hkl ?? null,
        referenceRelativeIntensity: peak.reference_relative_intensity ?? null,
      };
    })
    .filter((peak): peak is NonNullable<typeof peak> => peak !== null)
    .slice(0, 5);

  const primaryCandidateSummary = primaryCandidate
    ? {
        ...(optionalString(primaryCandidate.phase_id) ? { phaseId: optionalString(primaryCandidate.phase_id) } : {}),
        ...(optionalString(primaryCandidate.phase_label) ? { phaseLabel: optionalString(primaryCandidate.phase_label) } : {}),
        ...(optionalString(primaryCandidate.formula) ? { formula: optionalString(primaryCandidate.formula) } : {}),
        ...(optionalString(primaryCandidate.structure_family) ? { structureFamily: optionalString(primaryCandidate.structure_family) } : {}),
        ...(optionalString(primaryCandidate.database_ref) ? { databaseRef: optionalString(primaryCandidate.database_ref) } : {}),
        ...(optionalFiniteNumber(primaryCandidate.score) !== undefined ? { score: optionalFiniteNumber(primaryCandidate.score) } : {}),
        ...(optionalFiniteNumber(primaryCandidate.matched_peak_count) !== undefined ? { matchedPeakCount: optionalFiniteNumber(primaryCandidate.matched_peak_count) } : {}),
        ...(optionalFiniteNumber(primaryCandidate.reference_peak_count) !== undefined ? { referencePeakCount: optionalFiniteNumber(primaryCandidate.reference_peak_count) } : {}),
        ...(optionalFiniteNumber(primaryCandidate.coverage_ratio) !== undefined ? { coverageRatio: optionalFiniteNumber(primaryCandidate.coverage_ratio) } : {}),
        meanDeltaTwoTheta: primaryCandidate.mean_delta_two_theta ?? null,
        ...(optionalFiniteNumber(primaryCandidate.position_score) !== undefined ? { positionScore: optionalFiniteNumber(primaryCandidate.position_score) } : {}),
        ...(optionalFiniteNumber(primaryCandidate.coverage_score) !== undefined ? { coverageScore: optionalFiniteNumber(primaryCandidate.coverage_score) } : {}),
        ...(optionalFiniteNumber(primaryCandidate.chemistry_score) !== undefined ? { chemistryScore: optionalFiniteNumber(primaryCandidate.chemistry_score) } : {}),
      }
    : undefined;

  return {
    status: referenceMatchV2.status ?? 'no_match',
    claimLevel: referenceMatchV2.claim_level ?? 'none',
    ...(optionalString(referenceMatchV2.reference_set_id) ? { referenceSetId: optionalString(referenceMatchV2.reference_set_id) } : {}),
    ...(optionalFiniteNumber(referenceMatchV2.candidate_count) !== undefined ? { candidateCount: optionalFiniteNumber(referenceMatchV2.candidate_count) } : {}),
    ...(primaryCandidateSummary ? { primaryCandidate: primaryCandidateSummary } : {}),
    ...(matchedPeaksPreview && matchedPeaksPreview.length > 0 ? { matchedPeaksPreview } : {}),
    phaseConfirmed: false,
    phasePurityConfirmed: false,
    limitations: compactLimitations(referenceMatchV2.limitations),
    savedAt,
  };
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Persist (or upsert) a normalised XRD backend result for later handoff.
 *
 * Returns the saved record.
 */
export function saveXrdBackendEvidenceResult(
  projectId: string | undefined | null,
  uploadedRunId: string | undefined | null,
  result: XRDNormalizedResult,
  fileName?: string,
): XRDBackendEvidenceRecord {
  const effectiveProjectId = projectId?.trim() || '__unassigned__';
  const timestamp = new Date().toISOString();
  const scientificEvidenceSummary = makeScientificEvidenceSummary(result.scientificEvidenceObject);
  const scientificEvidenceObject = cloneSmallJsonSafeEvidenceObject(result.scientificEvidenceObject);
  const referenceMatchV2Summary = buildReferenceMatchV2EvidenceSummary(result.referenceMatchV2, timestamp);

  const record: XRDBackendEvidenceRecord = {
    projectId: effectiveProjectId,
    uploadedRunId: uploadedRunId ?? undefined,
    fileName,
    timestamp,
    detectedPeakCount: result.detectedPeakCount,
    fittedPeakCount: result.fittedPeakCount,
    snRatio: result.snRatio,
    baselineDeviation: result.baselineDeviation,
    peakResolution: result.peakResolution,
    primaryPhase: result.primaryPhase,
    matchedPeakCount: result.matchedPeakCount,
    phaseSummary: result.phaseSummary,
    isPhaseMatched: result.isPhaseMatched,
    yResidualCount: result.yResidual?.length ?? 0,
    ...(scientificEvidenceSummary ? { scientificEvidenceSummary } : {}),
    ...(referenceMatchV2Summary ? { referenceMatchV2Summary } : {}),
    ...(scientificEvidenceObject ? { scientificEvidenceObject } : {}),
  };

  const existing = readAll();

  // Upsert: replace matching record by (projectId + uploadedRunId) or (projectId + fileName).
  const next = [
    ...existing.filter((item) => {
      if (item.projectId !== record.projectId) return true;
      if (record.uploadedRunId && item.uploadedRunId === record.uploadedRunId) return false;
      if (!record.uploadedRunId && record.fileName && item.fileName === record.fileName) return false;
      return true;
    }),
    record,
  ];

  writeAll(next);
  return record;
}

/**
 * Read the latest XRD backend evidence record for the given project/run pair.
 *
 * Pass `uploadedRunId` to match a specific uploaded run.
 * If omitted, returns the latest record for the project.
 */
export function readLatestXrdBackendEvidenceResult(
  projectId: string | undefined | null,
  uploadedRunId?: string | null,
): XRDBackendEvidenceRecord | null {
  const effectiveProjectId = projectId?.trim() || '__unassigned__';
  const records = readAll().filter((r) => r.projectId === effectiveProjectId);

  if (records.length === 0) return null;

  if (uploadedRunId) {
    const match = records.find((r) => r.uploadedRunId === uploadedRunId);
    return match ?? null;
  }

  // Return most-recent by timestamp.
  return records.sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
}

/**
 * Read all XRD backend evidence records for a project (may include
 * multiple datasets).
 */
export function readAllXrdBackendEvidenceResults(
  projectId: string | undefined | null,
): XRDBackendEvidenceRecord[] {
  const effectiveProjectId = projectId?.trim() || '__unassigned__';
  return readAll().filter((r) => r.projectId === effectiveProjectId);
}
