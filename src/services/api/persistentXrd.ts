import { getAgentApiUrl } from './agentApiUrl';
import { notifySessionInvalidated } from '../auth/serverSession';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const EVIDENCE_STATUSES = new Set(['unavailable', 'processing', 'ready', 'superseded', 'failed']);
const SNAPSHOT_STATUSES = new Set(['processing', 'ready', 'superseded', 'failed']);
const REASONING_STATUSES = new Set(['pending', 'running', 'succeeded', 'fallback', 'failed']);

export type UploadStatus =
  | 'created'
  | 'uploading'
  | 'uploaded'
  | 'finalizing'
  | 'finalized'
  | 'failed';
export type ValidationStatus = 'pending' | 'running' | 'succeeded' | 'failed';
export type EvidenceStatus = 'unavailable' | 'processing' | 'ready' | 'superseded' | 'failed';

export interface PersistentXrdDataset {
  id: string;
  organizationId: string;
  projectId: string;
  title: string;
  technique: 'xrd';
  displayFilename: string;
  declaredContentType: string;
  byteSize: number;
  clientChecksumSha256: string | null;
  datasetStatus: string;
  evidenceStatus: EvidenceStatus;
  failureCode: string | null;
  originalObjectId: string | null;
  currentEvidenceId: string | null;
  measurementMetadata: Record<string, unknown>;
  processingParameters: Record<string, unknown>;
  experimentContext: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  latestUpload: {
    id: string;
    sessionStatus: string;
    expectedByteSize: number;
    checksumAlgorithm: 'sha256';
    clientChecksumSha256: string | null;
    expiresAt: string;
    finalizedAt: string | null;
    failureCode: string | null;
  } | null;
  latestValidation: {
    id: string;
    status: string;
    attemptNumber: number;
    maxAttempts: number;
    failureCode: string | null;
    failureDetails: Record<string, unknown> | null;
    createdAt: string;
    completedAt: string | null;
  } | null;
  evidence: {
    id: string;
    version: number;
    status: string;
    contentSha256: string;
    schemaVersion: string;
    processorVersion: string;
    validationWarnings: string[];
    scientificLimitations: string[];
    createdAt: string;
  } | null;
}

export interface PersistentReasoningRun {
  id: string;
  organizationId: string;
  projectId: string;
  projectTitle?: string;
  datasetId: string;
  datasetTitle?: string;
  evidenceSnapshotId: string;
  evidenceContentSha256: string;
  executionMode: string;
  status: 'pending' | 'running' | 'succeeded' | 'fallback' | 'failed';
  provider: string;
  model: string | null;
  promptVersion: string;
  policyVersion: string;
  structuredOutput: Record<string, unknown> | null;
  fallbackUsed: boolean;
  quotaClassification: string;
  requestId: string;
  failureCode: string | null;
  failureMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface PersistentCanonicalEvidence {
  id: string;
  organizationId: string;
  projectId: string;
  datasetId: string;
  uploadSessionId: string;
  validationAttemptId: string;
  version: number;
  status: 'ready' | 'superseded' | 'failed' | 'processing';
  schemaVersion: string;
  processorVersion: string;
  contentSha256: string;
  content: Record<string, unknown>;
  validationWarnings: string[];
  scientificLimitations: string[];
  provenance: Record<string, unknown>;
  createdAt: string;
}

export interface PersistentNotebookReference {
  id: string;
  organizationId: string;
  projectId: string;
  projectTitle: string;
  datasetId: string;
  datasetTitle: string;
  evidenceSnapshotId: string;
  reasoningRunId: string;
  reasoningStatus: string;
  provider: string;
  label: string;
  createdAt: string;
}

export class PersistentApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly errorCode: string,
    message: string,
    public readonly requestId?: string,
  ) {
    super(message);
  }
}

async function requestJson(
  path: string,
  organizationId: string,
  options: { method?: 'GET' | 'POST'; body?: unknown; signal?: AbortSignal } = {},
): Promise<unknown> {
  const response = await fetch(getAgentApiUrl(path), {
    method: options.method ?? 'GET',
    credentials: 'include',
    cache: 'no-store',
    signal: options.signal,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'Active-Organization': organizationId,
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const value = await readResponse(response);
  if (!response.ok) throwApiError(response, value);
  return value;
}

async function readResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new PersistentApiError(
      response.status || 503,
      'INVALID_SERVER_RESPONSE',
      'The persistent service returned an invalid response.',
      response.headers.get('X-Request-Id') ?? undefined,
    );
  }
}

function throwApiError(response: Response, value: unknown): never {
  const record = asRecord(value);
  const code = typeof record?.errorCode === 'string'
    ? record.errorCode
    : response.status === 401
      ? 'AUTHENTICATION_REQUIRED'
      : response.status === 403
        ? 'ACCESS_DENIED'
        : 'PERSISTENCE_ERROR';
  const message = typeof record?.error === 'string'
    ? record.error
    : 'Persistent XRD request failed.';
  if (response.status === 401) notifySessionInvalidated();
  throw new PersistentApiError(
    response.status,
    code,
    message,
    response.headers.get('X-Request-Id') ?? undefined,
  );
}

export async function listPersistentXrdDatasets(
  organizationId: string,
  projectId: string,
  signal?: AbortSignal,
): Promise<PersistentXrdDataset[]> {
  const value = asRecord(await requestJson(
    `/api/persistent/projects/${encodeURIComponent(projectId)}/datasets?limit=100`,
    organizationId,
    { signal },
  ));
  if (!Array.isArray(value?.items)) throw invalidResponse();
  return value.items.map(validateDataset);
}

export async function createPersistentXrdDataset(
  organizationId: string,
  projectId: string,
  input: {
    title: string;
    measurementMetadata?: Record<string, unknown>;
    processingParameters?: Record<string, unknown>;
    experimentContext?: Record<string, unknown>;
  },
): Promise<PersistentXrdDataset> {
  return validateDataset(await requestJson(
    `/api/persistent/projects/${encodeURIComponent(projectId)}/datasets`,
    organizationId,
    {
      method: 'POST',
      body: {
        title: input.title,
        measurementMetadata: input.measurementMetadata ?? {},
        processingParameters: input.processingParameters ?? {},
        experimentContext: input.experimentContext ?? {},
      },
    },
  ));
}

export async function getPersistentXrdDataset(
  organizationId: string,
  datasetId: string,
  signal?: AbortSignal,
): Promise<PersistentXrdDataset> {
  return validateDataset(await requestJson(
    `/api/persistent/datasets/${encodeURIComponent(datasetId)}`,
    organizationId,
    { signal },
  ));
}

export async function getPersistentCanonicalEvidence(
  organizationId: string,
  evidenceId: string,
  signal?: AbortSignal,
): Promise<PersistentCanonicalEvidence> {
  return validateCanonicalEvidence(await requestJson(
    `/api/persistent/evidence/${encodeURIComponent(evidenceId)}`,
    organizationId,
    { signal },
  ));
}

export async function sha256File(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function createPersistentUploadIntent(
  organizationId: string,
  datasetId: string,
  file: File,
  checksum: string,
  idempotencyKey: string,
): Promise<{ uploadId: string; uploadUrl: string; uploadStatus: string }> {
  const value = asRecord(await requestJson(
    `/api/persistent/datasets/${encodeURIComponent(datasetId)}/uploads`,
    organizationId,
    {
      method: 'POST',
      body: {
        originalFilename: file.name,
        displayFilename: file.name,
        declaredContentType: normalizeMime(file),
        byteSize: file.size,
        clientChecksumSha256: checksum,
        idempotencyKey,
      },
    },
  ));
  if (
    !isUuid(value?.uploadId)
    || typeof value.uploadUrl !== 'string'
    || !value.uploadUrl.startsWith('/api/persistent/uploads/')
    || typeof value.uploadStatus !== 'string'
  ) throw invalidResponse();
  return {
    uploadId: value.uploadId,
    uploadUrl: value.uploadUrl,
    uploadStatus: value.uploadStatus,
  };
}

export function uploadPersistentFile(
  organizationId: string,
  uploadId: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(
      'PUT',
      getAgentApiUrl(`/api/persistent/uploads/${encodeURIComponent(uploadId)}/content`),
    );
    xhr.withCredentials = true;
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.setRequestHeader('Active-Organization', organizationId);
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
      }
    };
    xhr.onerror = () => reject(new PersistentApiError(
      503,
      'UPLOAD_NETWORK_ERROR',
      'The raw XRD upload could not reach the persistent service.',
    ));
    xhr.onload = () => {
      let value: unknown;
      try {
        value = JSON.parse(xhr.responseText || '{}');
      } catch {
        reject(invalidResponse());
        return;
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        const record = asRecord(value);
        if (xhr.status === 401) notifySessionInvalidated();
        reject(new PersistentApiError(
          xhr.status,
          typeof record?.errorCode === 'string' ? record.errorCode : 'UPLOAD_FAILED',
          typeof record?.error === 'string' ? record.error : 'Raw XRD upload failed.',
          xhr.getResponseHeader('X-Request-Id') ?? undefined,
        ));
        return;
      }
      onProgress(100);
      resolve();
    };
    xhr.send(file);
  });
}

export async function finalizePersistentUpload(
  organizationId: string,
  uploadId: string,
): Promise<void> {
  await requestJson(
    `/api/persistent/uploads/${encodeURIComponent(uploadId)}/finalize`,
    organizationId,
    { method: 'POST', body: {} },
  );
}

export async function runPersistentReasoning(
  organizationId: string,
  input: {
    projectId: string;
    datasetId: string;
    evidenceSnapshotId: string;
    provider: 'deterministic' | 'gemini-2.5-flash';
    idempotencyKey: string;
  },
): Promise<PersistentReasoningRun> {
  return validateReasoningRun(await requestJson(
    '/api/persistent/reasoning',
    organizationId,
    { method: 'POST', body: input },
  ));
}

export async function getPersistentReasoningRun(
  organizationId: string,
  reasoningRunId: string,
  signal?: AbortSignal,
): Promise<PersistentReasoningRun> {
  return validateReasoningRun(await requestJson(
    `/api/persistent/reasoning/${encodeURIComponent(reasoningRunId)}`,
    organizationId,
    { signal },
  ));
}

export async function listPersistentHistory(
  organizationId: string,
  filters: { projectId?: string; datasetId?: string } = {},
  signal?: AbortSignal,
): Promise<PersistentReasoningRun[]> {
  const query = new URLSearchParams({ limit: '100' });
  if (filters.projectId) query.set('projectId', filters.projectId);
  if (filters.datasetId) query.set('datasetId', filters.datasetId);
  const value = asRecord(await requestJson(
    `/api/persistent/history?${query.toString()}`,
    organizationId,
    { signal },
  ));
  if (!Array.isArray(value?.items)) throw invalidResponse();
  return value.items.map(validateReasoningRun);
}

export async function createPersistentNotebookReference(
  organizationId: string,
  reasoningRunId: string,
  label: string,
): Promise<PersistentNotebookReference> {
  return validateNotebookReference(await requestJson(
    '/api/persistent/notebook-references',
    organizationId,
    { method: 'POST', body: { reasoningRunId, label } },
  ));
}

export async function listPersistentNotebookReferences(
  organizationId: string,
  signal?: AbortSignal,
): Promise<PersistentNotebookReference[]> {
  const value = asRecord(await requestJson(
    '/api/persistent/notebook-references',
    organizationId,
    { signal },
  ));
  if (!Array.isArray(value?.items)) throw invalidResponse();
  return value.items.map(validateNotebookReference);
}

function validateDataset(value: unknown): PersistentXrdDataset {
  const record = asRecord(value);
  if (
    !isUuid(record?.id)
    || !isUuid(record.organizationId)
    || !isUuid(record.projectId)
    || typeof record.title !== 'string'
    || record.technique !== 'xrd'
    || typeof record.displayFilename !== 'string'
    || typeof record.declaredContentType !== 'string'
    || typeof record.byteSize !== 'number'
    || !Number.isSafeInteger(record.byteSize)
    || record.byteSize < 0
    || !isNullableSha256(record.clientChecksumSha256)
    || typeof record.datasetStatus !== 'string'
    || typeof record.evidenceStatus !== 'string'
    || !EVIDENCE_STATUSES.has(record.evidenceStatus)
    || !isNullableString(record.failureCode)
    || !isNullableUuid(record.originalObjectId)
    || !isNullableUuid(record.currentEvidenceId)
    || typeof record.createdAt !== 'string'
    || typeof record.updatedAt !== 'string'
    || !asRecord(record.measurementMetadata)
    || !asRecord(record.processingParameters)
    || !asRecord(record.experimentContext)
  ) throw invalidResponse();
  return record as unknown as PersistentXrdDataset;
}

function validateReasoningRun(value: unknown): PersistentReasoningRun {
  const record = asRecord(value);
  if (
    !isUuid(record?.id)
    || !isUuid(record.organizationId)
    || !isUuid(record.projectId)
    || !isUuid(record.datasetId)
    || !isUuid(record.evidenceSnapshotId)
    || typeof record.evidenceContentSha256 !== 'string'
    || !SHA256_PATTERN.test(record.evidenceContentSha256)
    || typeof record.executionMode !== 'string'
    || typeof record.status !== 'string'
    || !REASONING_STATUSES.has(record.status)
    || typeof record.provider !== 'string'
    || !isNullableString(record.model)
    || typeof record.promptVersion !== 'string'
    || typeof record.policyVersion !== 'string'
    || !(record.structuredOutput === null || asRecord(record.structuredOutput))
    || typeof record.fallbackUsed !== 'boolean'
    || typeof record.quotaClassification !== 'string'
    || typeof record.requestId !== 'string'
    || !isNullableString(record.failureCode)
    || !isNullableString(record.failureMessage)
    || typeof record.createdAt !== 'string'
    || !isNullableString(record.completedAt)
  ) throw invalidResponse();
  return record as unknown as PersistentReasoningRun;
}

function validateCanonicalEvidence(value: unknown): PersistentCanonicalEvidence {
  const record = asRecord(value);
  if (
    !isUuid(record?.id)
    || !isUuid(record.organizationId)
    || !isUuid(record.projectId)
    || !isUuid(record.datasetId)
    || !isUuid(record.uploadSessionId)
    || !isUuid(record.validationAttemptId)
    || typeof record.version !== 'number'
    || !Number.isSafeInteger(record.version)
    || record.version < 1
    || typeof record.status !== 'string'
    || !SNAPSHOT_STATUSES.has(record.status)
    || typeof record.schemaVersion !== 'string'
    || typeof record.processorVersion !== 'string'
    || typeof record.contentSha256 !== 'string'
    || !SHA256_PATTERN.test(record.contentSha256)
    || !asRecord(record.content)
    || !isStringArray(record.validationWarnings)
    || !isStringArray(record.scientificLimitations)
    || !asRecord(record.provenance)
    || typeof record.createdAt !== 'string'
  ) throw invalidResponse();
  return record as unknown as PersistentCanonicalEvidence;
}

function validateNotebookReference(value: unknown): PersistentNotebookReference {
  const record = asRecord(value);
  if (
    !isUuid(record?.id)
    || !isUuid(record.organizationId)
    || !isUuid(record.projectId)
    || typeof record.projectTitle !== 'string'
    || !isUuid(record.datasetId)
    || typeof record.datasetTitle !== 'string'
    || !isUuid(record.evidenceSnapshotId)
    || !isUuid(record.reasoningRunId)
    || typeof record.reasoningStatus !== 'string'
    || typeof record.provider !== 'string'
    || typeof record.label !== 'string'
    || typeof record.createdAt !== 'string'
  ) throw invalidResponse();
  return record as unknown as PersistentNotebookReference;
}

function normalizeMime(file: File): string {
  const normalized = file.type.split(';', 1)[0].trim().toLowerCase();
  if (['text/csv', 'text/plain', 'application/octet-stream'].includes(normalized)) {
    return normalized;
  }
  return file.name.toLowerCase().endsWith('.csv') ? 'text/csv' : 'text/plain';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function isNullableUuid(value: unknown): value is string | null {
  return value === null || isUuid(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isNullableSha256(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && SHA256_PATTERN.test(value));
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function invalidResponse(): PersistentApiError {
  return new PersistentApiError(
    502,
    'INVALID_SERVER_RESPONSE',
    'The persistent service returned an invalid response.',
  );
}
