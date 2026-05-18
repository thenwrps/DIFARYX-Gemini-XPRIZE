/**
 * Workspace Mode State Management
 * 
 * Separates Demo Mode from User Workspace Mode.
 * - Demo Mode: Shows preloaded demo projects
 * - User Mode: Shows user-uploaded/created projects only
 */

export type WorkspaceMode = 'demo' | 'user';
export type EffectiveWorkspaceMode = WorkspaceMode | 'demo_explicit';

interface WorkspaceAuthUserLike {
  provider?: string | null;
}

interface EffectiveWorkspaceModeOptions {
  authUser?: WorkspaceAuthUserLike | null;
  searchParams?: URLSearchParams | string | null;
  storedMode?: WorkspaceMode | null;
}

const WORKSPACE_MODE_KEY = 'difaryx-workspace-mode:v1';
const WORKSPACE_MODE_EXPLICIT_KEY = 'difaryx-workspace-mode-explicit:v1';

/**
 * Check if localStorage is available
 */
function canUseLocalStorage(): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage !== null;
  } catch {
    return false;
  }
}

/**
 * Get current workspace mode
 */
export function getStoredWorkspaceMode(): WorkspaceMode | null {
  if (!canUseLocalStorage()) return null;

  try {
    const stored = window.localStorage.getItem(WORKSPACE_MODE_KEY);
    if (stored === 'user' || stored === 'demo') return stored;
  } catch {
    return null;
  }

  return null;
}

export function isStoredWorkspaceModeExplicit(): boolean {
  if (!canUseLocalStorage()) return false;

  try {
    return window.localStorage.getItem(WORKSPACE_MODE_EXPLICIT_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Set workspace mode
 */
export function setWorkspaceMode(mode: WorkspaceMode): void {
  if (!canUseLocalStorage()) return;
  
  try {
    window.localStorage.setItem(WORKSPACE_MODE_KEY, mode);
    window.localStorage.setItem(WORKSPACE_MODE_EXPLICIT_KEY, 'true');
    
    // Dispatch custom event for cross-component reactivity
    window.dispatchEvent(new CustomEvent('workspace-mode-changed', { detail: { mode } }));
  } catch (error) {
    console.warn('Failed to save workspace mode:', error);
  }
}

export function clearWorkspaceMode(): void {
  if (!canUseLocalStorage()) return;

  try {
    window.localStorage.removeItem(WORKSPACE_MODE_KEY);
    window.localStorage.removeItem(WORKSPACE_MODE_EXPLICIT_KEY);
    window.dispatchEvent(new CustomEvent('workspace-mode-changed', { detail: { mode: 'demo' satisfies WorkspaceMode } }));
  } catch {
    return;
  }
}

function normalizeSearchParams(searchParams?: URLSearchParams | string | null): URLSearchParams {
  if (searchParams instanceof URLSearchParams) return searchParams;
  if (typeof searchParams === 'string') return new URLSearchParams(searchParams);
  return new URLSearchParams();
}

export function hasRealGoogleOAuthUser(authUser?: WorkspaceAuthUserLike | null): boolean {
  return authUser?.provider === 'google';
}

export function getEffectiveWorkspaceMode({
  authUser,
  searchParams,
  storedMode,
}: EffectiveWorkspaceModeOptions): EffectiveWorkspaceMode {
  const params = normalizeSearchParams(searchParams);
  const urlMode = params.get('mode');

  if (urlMode === 'demo') return 'demo_explicit';

  if (hasRealGoogleOAuthUser(authUser)) {
    if (urlMode === 'user') return 'user';
    if (storedMode === 'demo' && isStoredWorkspaceModeExplicit()) return 'demo_explicit';
    return 'user';
  }

  return 'demo';
}

export function toWorkspaceMode(mode: EffectiveWorkspaceMode): WorkspaceMode {
  return mode === 'user' ? 'user' : 'demo';
}

export function isUserWorkspaceMode(mode: EffectiveWorkspaceMode): boolean {
  return mode === 'user';
}

export function isDemoWorkspaceMode(mode: EffectiveWorkspaceMode): boolean {
  return mode === 'demo' || mode === 'demo_explicit';
}

/**
 * Get workspace mode label
 */
export function getWorkspaceModeLabel(mode: WorkspaceMode): string {
  return mode === 'demo' ? 'Demo Mode' : 'User Workspace';
}

/**
 * Get workspace mode badge class
 */
export function getWorkspaceModeBadgeClass(mode: WorkspaceMode): string {
  return mode === 'demo'
    ? 'bg-slate-100 border-slate-300 text-slate-700'
    : 'bg-blue-50 border-blue-300 text-blue-700';
}
