import type {
  XRDLocalReferenceParseResult,
  XRDLocalReferenceParseStatus,
  XRDLocalReferencePeak,
  XRDReferenceFileKind,
  XRDReferenceImportCapability,
  XRDReferenceImportDiagnostics,
  XRDReferenceTextBinaryLikelihood,
} from '../types/xrdLocalReference';
import type { XRDLocalReferencePayload } from '../types/xrdBackend';

export const XRD_LOCAL_REFERENCES_STORAGE_KEY = 'difaryx.xrdLocalReferences.v1';

const MAX_STORED_DRAFTS = 8;
const MAX_STORED_PEAKS_PER_DRAFT = 200;
const MAX_STORED_MESSAGES = 12;

export type XRDLocalReferenceValidationLevel =
  | 'usable_preview'
  | 'limited_preview'
  | 'invalid_preview';

export interface XRDStoredLocalReferenceRecord {
  id: string;
  projectId?: string;
  uploadedRunId?: string;
  sourceFileName: string;
  sourceFileType?: '.csv' | '.txt' | '.xy' | '.dat';
  savedAt: string;
  parseResult: XRDLocalReferenceParseResult;
  validationStatus: XRDLocalReferenceParseStatus;
  validationLevel: XRDLocalReferenceValidationLevel;
  backendAvailable: false;
  usedForMatching: false;
}

export interface XRDLocalReferenceDraftContext {
  projectId?: string;
  uploadedRunId?: string;
}

function canUseStorage(): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage !== undefined;
  } catch {
    return false;
  }
}

function isRecordLike(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function compactMessages(messages: unknown): string[] {
  return Array.isArray(messages)
    ? messages.filter((message): message is string => typeof message === 'string').slice(0, MAX_STORED_MESSAGES)
    : [];
}

function compactPeak(peak: XRDLocalReferencePeak): XRDLocalReferencePeak {
  return {
    twoTheta: peak.twoTheta,
    ...(Number.isFinite(peak.relativeIntensity) ? { relativeIntensity: peak.relativeIntensity } : {}),
    ...(peak.hkl ? { hkl: peak.hkl } : {}),
    ...(Number.isFinite(peak.dSpacing) ? { dSpacing: peak.dSpacing } : {}),
  };
}

function getFallbackImportDiagnostics(parseResult: XRDLocalReferenceParseResult): XRDReferenceImportDiagnostics {
  const warnings = compactMessages(parseResult.validation?.warnings);
  const errors = compactMessages(parseResult.validation?.errors);
  const isEligibleForBackendMatching = Boolean(
    parseResult.isEligibleForBackendMatching
      ?? (parseResult.peaks.length >= 3 && errors.length === 0 && parseResult.status === 'parsed_preview'),
  );

  return {
    fileKind: (parseResult.fileKind ?? 'text_peak_list') as XRDReferenceFileKind,
    ...(parseResult.detectedFormat ? { detectedFormat: parseResult.detectedFormat } : {}),
    ...(parseResult.fileSizeBytes !== undefined ? { fileSizeBytes: parseResult.fileSizeBytes } : {}),
    textBinaryLikelihood: (parseResult.textBinaryLikelihood ?? 'unknown') as XRDReferenceTextBinaryLikelihood,
    parsedRowCount: parseResult.parsedRowCount ?? parseResult.peaks.length,
    ignoredRowCount: parseResult.ignoredRowCount ?? 0,
    warnings,
    errors,
    isEligibleForBackendMatching,
  };
}

function getFallbackImportCapability(
  parseResult: XRDLocalReferenceParseResult,
  diagnostics: XRDReferenceImportDiagnostics,
): XRDReferenceImportCapability {
  return {
    canPreview: parseResult.peaks.length > 0,
    canParsePeaks: parseResult.peaks.length > 0,
    requiresConverter: parseResult.status === 'requires_converter',
    plannedConverter: parseResult.status === 'requires_converter' || parseResult.status === 'not_supported_yet',
    isEligibleForBackendMatching: diagnostics.isEligibleForBackendMatching,
    notes: parseResult.importCapability?.notes?.slice(0, MAX_STORED_MESSAGES) ?? [],
  };
}

function compactParseResult(parseResult: XRDLocalReferenceParseResult): XRDLocalReferenceParseResult {
  const peaks = parseResult.peaks
    .filter((peak) => Number.isFinite(peak.twoTheta))
    .slice(0, MAX_STORED_PEAKS_PER_DRAFT)
    .map(compactPeak);
  const diagnostics = getFallbackImportDiagnostics({
    ...parseResult,
    peaks,
  });
  const importCapability = getFallbackImportCapability(parseResult, diagnostics);

  return {
    sourceFileName: parseResult.sourceFileName,
    ...(parseResult.sourceFileType ? { sourceFileType: parseResult.sourceFileType } : {}),
    parsedAt: parseResult.parsedAt,
    status: parseResult.status,
    ...(parseResult.referenceLabel ? { referenceLabel: parseResult.referenceLabel } : {}),
    ...(parseResult.formula ? { formula: parseResult.formula } : {}),
    ...(parseResult.materialFamily ? { materialFamily: parseResult.materialFamily } : {}),
    ...(parseResult.structureName ? { structureName: parseResult.structureName } : {}),
    ...(parseResult.formulaFromCif ? { formulaFromCif: parseResult.formulaFromCif } : {}),
    ...(parseResult.spaceGroup ? { spaceGroup: parseResult.spaceGroup } : {}),
    ...(parseResult.crystalSystem ? { crystalSystem: parseResult.crystalSystem } : {}),
    ...(parseResult.cellParameters ? { cellParameters: parseResult.cellParameters } : {}),
    ...(parseResult.cifMetadata ? { cifMetadata: parseResult.cifMetadata } : {}),
    elements: parseResult.elements.slice(0, 16),
    peaks,
    validation: {
      hasTwoTheta: parseResult.validation.hasTwoTheta,
      hasAtLeastThreePeaks: parseResult.validation.hasAtLeastThreePeaks,
      hasRelativeIntensity: parseResult.validation.hasRelativeIntensity,
      hasRequiredMetadata: parseResult.validation.hasRequiredMetadata,
      warnings: compactMessages(parseResult.validation.warnings),
      errors: compactMessages(parseResult.validation.errors),
    },
    fileKind: diagnostics.fileKind,
    ...(diagnostics.detectedFormat ? { detectedFormat: diagnostics.detectedFormat } : {}),
    ...(diagnostics.fileSizeBytes !== undefined ? { fileSizeBytes: diagnostics.fileSizeBytes } : {}),
    textBinaryLikelihood: diagnostics.textBinaryLikelihood,
    parsedRowCount: diagnostics.parsedRowCount,
    ignoredRowCount: diagnostics.ignoredRowCount,
    importDiagnostics: diagnostics,
    importCapability,
    isEligibleForBackendMatching: diagnostics.isEligibleForBackendMatching,
    backendAvailable: false,
    usedForMatching: false,
  };
}

function compactRecord(record: XRDStoredLocalReferenceRecord): XRDStoredLocalReferenceRecord {
  const parseResult = compactParseResult(record.parseResult);

  return {
    id: record.id,
    ...(record.projectId ? { projectId: record.projectId } : {}),
    ...(record.uploadedRunId ? { uploadedRunId: record.uploadedRunId } : {}),
    sourceFileName: record.sourceFileName || parseResult.sourceFileName,
    ...(record.sourceFileType || parseResult.sourceFileType
      ? { sourceFileType: record.sourceFileType ?? parseResult.sourceFileType }
      : {}),
    savedAt: record.savedAt,
    parseResult,
    validationStatus: parseResult.status,
    validationLevel: getXrdLocalReferenceValidationLevel(parseResult),
    backendAvailable: false,
    usedForMatching: false,
  };
}

function readAll(): XRDStoredLocalReferenceRecord[] {
  if (!canUseStorage()) return [];

  try {
    const raw = window.localStorage.getItem(XRD_LOCAL_REFERENCES_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(isStoredLocalReferenceRecord)
      .map(compactRecord)
      .sort(sortBySavedAtDesc)
      .slice(0, MAX_STORED_DRAFTS);
  } catch {
    return [];
  }
}

function writeAll(records: XRDStoredLocalReferenceRecord[]): boolean {
  if (!canUseStorage()) return false;

  try {
    window.localStorage.setItem(
      XRD_LOCAL_REFERENCES_STORAGE_KEY,
      JSON.stringify(records.map(compactRecord).sort(sortBySavedAtDesc).slice(0, MAX_STORED_DRAFTS)),
    );
    return true;
  } catch {
    return false;
  }
}

function sortBySavedAtDesc(a: XRDStoredLocalReferenceRecord, b: XRDStoredLocalReferenceRecord): number {
  return Date.parse(b.savedAt) - Date.parse(a.savedAt);
}

function isStoredLocalReferenceRecord(value: unknown): value is XRDStoredLocalReferenceRecord {
  if (!isRecordLike(value)) return false;
  if (typeof value.id !== 'string') return false;
  if (typeof value.sourceFileName !== 'string') return false;
  if (typeof value.savedAt !== 'string') return false;
  if (!isRecordLike(value.parseResult)) return false;
  if (typeof value.parseResult.sourceFileName !== 'string') return false;
  if (typeof value.parseResult.parsedAt !== 'string') return false;
  if (typeof value.parseResult.status !== 'string') return false;
  if (!Array.isArray(value.parseResult.elements)) return false;
  if (!Array.isArray(value.parseResult.peaks)) return false;
  if (!isRecordLike(value.parseResult.validation)) return false;
  if (value.backendAvailable !== false || value.usedForMatching !== false) return false;

  return true;
}

function createDraftId(parseResult: XRDLocalReferenceParseResult, context: XRDLocalReferenceDraftContext): string {
  const sourceToken = (parseResult.sourceFileName || 'local-reference')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 36) || 'local-reference';
  const scopeToken = context.projectId ?? context.uploadedRunId ?? 'session';
  return `xrd-local-ref-${scopeToken}-${sourceToken}-${Date.now().toString(36)}`;
}

export function getXrdLocalReferenceValidationLevel(
  parseResult: XRDLocalReferenceParseResult,
): XRDLocalReferenceValidationLevel {
  const { validation } = parseResult;
  if (
    !validation.hasTwoTheta
    || validation.errors.length > 0
    || parseResult.status === 'parse_error'
    || parseResult.status === 'corrupted_file'
    || parseResult.status === 'unsupported_format'
    || parseResult.status === 'requires_converter'
    || parseResult.status === 'not_supported_yet'
  ) {
    return 'invalid_preview';
  }
  if (validation.hasAtLeastThreePeaks && validation.hasRelativeIntensity) {
    return 'usable_preview';
  }
  return 'limited_preview';
}

export function getXrdLocalReferenceValidationLevelLabel(level: XRDLocalReferenceValidationLevel): string {
  switch (level) {
    case 'usable_preview':
      return 'Usable preview';
    case 'limited_preview':
      return 'Limited preview';
    case 'invalid_preview':
      return 'Invalid preview';
    default:
      return level;
  }
}

export function buildXrdLocalReferenceDraftFromParseResult(
  parseResult: XRDLocalReferenceParseResult,
  context: XRDLocalReferenceDraftContext = {},
): XRDStoredLocalReferenceRecord {
  const savedAt = new Date().toISOString();
  const compactedParseResult = compactParseResult(parseResult);

  return {
    id: createDraftId(compactedParseResult, context),
    ...(context.projectId ? { projectId: context.projectId } : {}),
    ...(context.uploadedRunId ? { uploadedRunId: context.uploadedRunId } : {}),
    sourceFileName: compactedParseResult.sourceFileName,
    ...(compactedParseResult.sourceFileType ? { sourceFileType: compactedParseResult.sourceFileType } : {}),
    savedAt,
    parseResult: compactedParseResult,
    validationStatus: compactedParseResult.status,
    validationLevel: getXrdLocalReferenceValidationLevel(compactedParseResult),
    backendAvailable: false,
    usedForMatching: false,
  };
}

export function saveXrdLocalReferenceDraft(
  record: XRDStoredLocalReferenceRecord,
): XRDStoredLocalReferenceRecord | null {
  const compactedRecord = compactRecord(record);
  const existing = readAll();
  const next = [
    compactedRecord,
    ...existing.filter((item) => item.id !== compactedRecord.id),
  ].slice(0, MAX_STORED_DRAFTS);

  return writeAll(next) ? compactedRecord : null;
}

export function listXrdLocalReferenceDrafts(projectId?: string): XRDStoredLocalReferenceRecord[] {
  const records = readAll();
  if (projectId) {
    return records.filter((record) => record.projectId === projectId);
  }
  return records.filter((record) => !record.projectId);
}

export function readLatestXrdLocalReferenceDraft(projectId?: string): XRDStoredLocalReferenceRecord | null {
  return listXrdLocalReferenceDrafts(projectId)[0] ?? null;
}

export function deleteXrdLocalReferenceDraft(id: string): boolean {
  const existing = readAll();
  const next = existing.filter((record) => record.id !== id);
  if (next.length === existing.length) return false;
  return writeAll(next);
}

export function isXrdLocalReferenceDraftEligibleForBackend(
  draft: XRDStoredLocalReferenceRecord | null | undefined,
): boolean {
  return Boolean(draft?.parseResult.isEligibleForBackendMatching);
}

export function buildXrdLocalReferencePayloadFromDraft(
  draft: XRDStoredLocalReferenceRecord,
): XRDLocalReferencePayload {
  const parseResult = draft.parseResult;
  const referenceLabel = parseResult.referenceLabel
    || draft.sourceFileName.replace(/\.[^.]+$/, '')
    || 'Saved local reference';

  return {
    enabled: true,
    sourceType: draft.uploadedRunId ? 'uploaded_reference' : 'project_local_reference',
    referenceLabel,
    ...(parseResult.formula ? { formula: parseResult.formula } : {}),
    ...(parseResult.materialFamily ? { materialFamily: parseResult.materialFamily } : {}),
    elements: parseResult.elements,
    sourceFileName: draft.sourceFileName,
    peaks: parseResult.peaks.map((peak) => ({
      twoTheta: peak.twoTheta,
      ...(Number.isFinite(peak.relativeIntensity) ? { relativeIntensity: peak.relativeIntensity } : {}),
      ...(peak.hkl ? { hkl: peak.hkl } : {}),
      ...(Number.isFinite(peak.dSpacing) ? { dSpacing: peak.dSpacing } : {}),
    })),
  };
}
