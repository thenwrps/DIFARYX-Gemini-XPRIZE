import {
  getEffectiveWorkspaceMode,
  type EffectiveWorkspaceMode,
  type WorkspaceMode,
} from './workspaceMode';

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
  const rawSource = params.get('source');
  const sessionId = firstParam(params, ['sessionId', 'analysisId', 'session']);
  const uploadedRunId = firstParam(params, ['upload', 'uploadedRunId', 'uploadedRun']);
  const driveFileId = firstParam(params, ['driveFileId', 'driveImportId']);
  const projectId = firstParam(params, ['project', 'project_id']);
  const isDemoExplicit = params.get('mode') === 'demo';
  const isUploadedContext = Boolean(
    rawSource === 'user_uploaded' ||
      rawSource === 'uploaded-beta' ||
      rawSource === 'quick_analysis' ||
      sessionId ||
      uploadedRunId,
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

  return {
    source: isUploadedContext ? 'user_uploaded' : rawSource,
    sourceMode,
    sessionId,
    uploadedRunId,
    driveFileId,
    projectId,
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
  const params = new URLSearchParams();
  if (context.isUploadedContext) params.set('source', 'user_uploaded');
  else if (context.source) params.set('source', context.source);
  if (context.sessionId) params.set('sessionId', context.sessionId);
  if (context.uploadedRunId) params.set('upload', context.uploadedRunId);
  if (context.driveFileId) params.set('driveFileId', context.driveFileId);
  return params.toString();
}

export function appendEvidenceRouteSearch(path: string, context: EvidenceRouteContext): string {
  const query = buildEvidenceRouteSearch(context);
  if (!query) return path;
  return path.includes('?') ? `${path}&${query}` : `${path}?${query}`;
}
