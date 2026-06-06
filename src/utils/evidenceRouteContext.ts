import {
  getEffectiveWorkspaceMode,
  type EffectiveWorkspaceMode,
  type WorkspaceMode,
} from './workspaceMode';
import { buildEvidenceContextQuery, parseEvidenceContext } from './evidenceContext';
import {
  readLastUploadedContext,
  saveLastUploadedContext,
} from './uploadedContextStore';

interface RouteAuthUserLike {
  provider?: string | null;
}

export type RouteEvidenceSourceMode =
  | 'user_uploaded'
  | 'google_drive_connected'
  | 'mixed'
  | 'demo_preloaded'
  | null;

export interface EvidenceRouteContext {
  source: string | null;
  sourceMode: RouteEvidenceSourceMode;
  sessionId: string | null;
  uploadedRunId: string | null;
  driveFileId: string | null;
  projectId: string | null;
  technique: string | null;
  isUploadedContext: boolean;
  isGoogleConnectedContext: boolean;
  isDemoExplicit: boolean;
  hasEvidenceContext: boolean;
  effectiveWorkspaceMode: EffectiveWorkspaceMode;
}

interface EvidenceRouteContextOptions {
  authUser?: RouteAuthUserLike | null;
  searchParams?: URLSearchParams | string | null;
  storedMode?: WorkspaceMode | null;
}

function normalizeSearchParams(searchParams?: URLSearchParams | string | null): URLSearchParams {
  if (searchParams instanceof URLSearchParams) return searchParams;
  if (typeof searchParams === 'string') return new URLSearchParams(searchParams);
  return new URLSearchParams();
}

function firstParam(params: URLSearchParams, names: string[]): string | null {
  for (const name of names) {
    const value = params.get(name);
    if (value) return value;
  }
  return null;
}

export function getEvidenceRouteContext({
  authUser,
  searchParams,
  storedMode,
}: EvidenceRouteContextOptions): EvidenceRouteContext {
  const params = normalizeSearchParams(searchParams);
  const canonicalContext = parseEvidenceContext(params);
  const rawSource = params.get('source');
  const sessionId = firstParam(params, ['sessionId', 'analysisId', 'session']);
  const uploadedRunId = firstParam(params, ['upload', 'uploadId', 'uploadedRunId', 'uploadedRun']);
  const driveFileId = firstParam(params, ['driveFileId', 'driveImportId']);
  const projectId = firstParam(params, ['project', 'project_id']);
  const technique = canonicalContext?.technique ?? params.get('technique');
  const isDemoExplicit = params.get('mode') === 'demo';

  // ── Refresh-restore: if the URL has no uploaded-context params but we have a
  //    stored context from a previous session, restore it automatically so that
  //    a plain refresh does not wipe the uploaded workspace.
  const urlHasUploadedContext = Boolean(
    canonicalContext?.mode === 'uploaded' ||
      rawSource === 'user_uploaded' ||
      rawSource === 'uploaded-beta' ||
      rawSource === 'quick_analysis' ||
      sessionId ||
      uploadedRunId,
  );
  const urlHasDemoOrProjectContext = Boolean(
    rawSource === 'demo_preloaded' ||
      params.get('mode') === 'demo' ||
      (params.get('project') && !uploadedRunId && !sessionId),
  );
  const stored = !urlHasUploadedContext && !urlHasDemoOrProjectContext
    ? readLastUploadedContext()
    : null;

  const effectiveSessionId = sessionId ?? stored?.sessionId ?? null;
  const effectiveUploadedRunId = uploadedRunId ?? stored?.uploadedRunId ?? null;
  const effectiveTechnique = technique ?? stored?.technique ?? null;
  const effectiveSource = rawSource ?? (stored ? 'user_uploaded' : null);

  const isUploadedContext = Boolean(
    canonicalContext?.mode === 'uploaded' ||
      effectiveSource === 'user_uploaded' ||
      effectiveSource === 'uploaded-beta' ||
      effectiveSource === 'quick_analysis' ||
      effectiveSessionId ||
      effectiveUploadedRunId,
  );
  const isGoogleConnectedContext = Boolean(
    rawSource === 'google_drive_connected' ||
      rawSource === 'google-drive-connected' ||
      driveFileId,
  );

  const sourceMode: RouteEvidenceSourceMode = isUploadedContext
    ? 'user_uploaded'
    : isGoogleConnectedContext
      ? 'google_drive_connected'
      : rawSource === 'mixed'
        ? 'mixed'
        : isDemoExplicit
          ? 'demo_preloaded'
          : null;

  // Persist the context whenever we have valid uploaded IDs (including first-load from URL)
  if (isUploadedContext && effectiveSessionId && effectiveUploadedRunId) {
    saveLastUploadedContext({
      sessionId: effectiveSessionId,
      uploadedRunId: effectiveUploadedRunId,
      technique: effectiveTechnique ?? 'xrd',
      projectId: projectId ?? stored?.projectId,
    });
  }

  return {
    source: isUploadedContext ? 'user_uploaded' : rawSource,
    sourceMode,
    sessionId: effectiveSessionId,
    uploadedRunId: effectiveUploadedRunId,
    driveFileId,
    projectId,
    technique: effectiveTechnique,
    isUploadedContext,
    isGoogleConnectedContext,
    isDemoExplicit,
    hasEvidenceContext: Boolean(isUploadedContext || isGoogleConnectedContext || rawSource === 'mixed'),
    effectiveWorkspaceMode: isUploadedContext || isGoogleConnectedContext
      ? 'user'
      : getEffectiveWorkspaceMode({ authUser, searchParams: params, storedMode }),
  };
}

export function hasUploadedEvidenceContext(searchParams?: URLSearchParams | string | null): boolean {
  return getEvidenceRouteContext({ searchParams }).isUploadedContext;
}

export function buildEvidenceRouteSearch(context: EvidenceRouteContext): string {
  if (context.isUploadedContext && context.source === 'user_uploaded' && context.sessionId && context.uploadedRunId) {
    return buildEvidenceContextQuery({
      mode: 'uploaded',
      source: 'user_uploaded',
      sessionId: context.sessionId,
      uploadId: context.uploadedRunId,
      technique: context.technique ?? 'xrd',
      projectId: context.projectId ?? undefined,
    });
  }

  const params = new URLSearchParams();
  if (context.isUploadedContext) params.set('source', 'user_uploaded');
  else if (context.source) params.set('source', context.source);
  if (context.sessionId) params.set('sessionId', context.sessionId);
  if (context.uploadedRunId) params.set('upload', context.uploadedRunId);
  if (context.technique) params.set('technique', context.technique);
  if (context.driveFileId) params.set('driveFileId', context.driveFileId);
  return params.toString();
}

export function appendEvidenceRouteSearch(path: string, context: EvidenceRouteContext): string {
  const query = buildEvidenceRouteSearch(context);
  if (!query) return path;
  return path.includes('?') ? `${path}&${query}` : `${path}?${query}`;
}
