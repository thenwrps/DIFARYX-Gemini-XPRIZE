/**
 * XPS Element-Focused Evidence — local persistence
 *
 * Stores element-focused XPS evidence (from the Element Selection Analysis view)
 * so the agent reasoning layer can consume what the user actually inspected.
 * Mirrors the XRD backend-evidence pattern (src/data/xrdBackendEvidence.ts):
 * a bounded, localStorage-backed, project-keyed record list with upsert +
 * read-latest semantics.
 *
 * Key: difaryx-local:xps-element-evidence
 */

import type { XpsElementEvidence } from '../agent/mcp/types';

const XPS_ELEMENT_EVIDENCE_KEY = 'difaryx-local:xps-element-evidence';

/** Max records retained (bounded to stay well within localStorage limits). */
const MAX_RECORDS = 50;

export interface XpsElementEvidenceRecord {
  id: string;
  projectId: string;
  element: string;
  evidence: XpsElementEvidence;
  savedAt: string;
}

function canUseStorage(): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage !== undefined;
  } catch {
    return false;
  }
}

function readAll(): XpsElementEvidenceRecord[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(XPS_ELEMENT_EVIDENCE_KEY);
    return raw ? (JSON.parse(raw) as XpsElementEvidenceRecord[]) : [];
  } catch {
    return [];
  }
}

function writeAll(records: XpsElementEvidenceRecord[]): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(XPS_ELEMENT_EVIDENCE_KEY, JSON.stringify(records));
  } catch {
    // Silently ignore quota errors.
  }
}

export function isXpsElementEvidenceRecord(value: unknown): value is XpsElementEvidenceRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<XpsElementEvidenceRecord>;
  return (
    typeof record.projectId === 'string' &&
    typeof record.element === 'string' &&
    typeof record.savedAt === 'string' &&
    !!record.evidence &&
    typeof record.evidence === 'object'
  );
}

/**
 * Persist element-focused XPS evidence. Upserts by (projectId, element) so the
 * latest analysis for each element replaces the previous one. Returns the
 * stored record (or null when storage is unavailable / inputs are invalid).
 */
export function saveXpsElementEvidence(
  projectId: string | undefined | null,
  evidence: XpsElementEvidence,
): XpsElementEvidenceRecord | null {
  if (!evidence || !evidence.selectedElement) return null;
  const effectiveProjectId = projectId?.trim() || '__unassigned__';
  const savedAt = new Date().toISOString();
  const record: XpsElementEvidenceRecord = {
    id: `${effectiveProjectId}-${evidence.selectedElement}`,
    projectId: effectiveProjectId,
    element: evidence.selectedElement,
    evidence,
    savedAt,
  };

  const records = readAll().filter(
    (item) => !(item.projectId === record.projectId && item.element === record.element),
  );
  records.push(record);

  // Keep the most recent MAX_RECORDS entries.
  const bounded = records
    .slice()
    .sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1))
    .slice(0, MAX_RECORDS);

  writeAll(bounded);
  return record;
}

/** All persisted records for a project (newest first). */
export function readXpsElementEvidenceForProject(
  projectId: string | undefined | null,
): XpsElementEvidenceRecord[] {
  const effectiveProjectId = projectId?.trim() || '__unassigned__';
  return readAll()
    .filter((r) => r.projectId === effectiveProjectId)
    .sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
}

/** Newest persisted element evidence for a project, or null. */
export function readLatestXpsElementEvidence(
  projectId: string | undefined | null,
): XpsElementEvidenceRecord | null {
  const records = readXpsElementEvidenceForProject(projectId);
  return records.length > 0 ? records[0] : null;
}

/**
 * Deterministic mapping from the runner's qualitative confidence level to a
 * numeric value (kept here so persistence + capture + tests share one source).
 */
export function levelToConfidence(level: 'high' | 'medium' | 'low' | string): number {
  switch (level) {
    case 'high':
      return 0.85;
    case 'medium':
      return 0.6;
    case 'low':
      return 0.35;
    default:
      return 0.35;
  }
}
