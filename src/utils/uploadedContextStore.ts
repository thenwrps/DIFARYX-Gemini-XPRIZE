/**
 * uploadedContextStore.ts
 *
 * Persists the last-active uploaded evidence context so that a browser
 * refresh can restore the uploaded workspace without requiring URL params.
 *
 * This is intentionally minimal — it stores only the IDs needed to look up
 * the already-persisted UploadedSignalRun and AnalysisSession records.
 */

const UPLOADED_CONTEXT_KEY = 'difaryx-last-uploaded-context:v1';

export interface StoredUploadedContext {
  sessionId: string;
  uploadedRunId: string;
  technique: string;
  projectId?: string;
  savedAt: string;
}

function canUseLocalStorage(): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage !== null;
  } catch {
    return false;
  }
}

/**
 * Save the active uploaded context to localStorage.
 * Call this whenever an uploaded evidence context is successfully established.
 */
export function saveLastUploadedContext(ctx: Omit<StoredUploadedContext, 'savedAt'>): void {
  if (!canUseLocalStorage()) return;
  try {
    const record: StoredUploadedContext = { ...ctx, savedAt: new Date().toISOString() };
    window.localStorage.setItem(UPLOADED_CONTEXT_KEY, JSON.stringify(record));
  } catch {
    // Ignore storage errors — persistence is best-effort
  }
}

/**
 * Read the last-saved uploaded context from localStorage.
 * Returns null if nothing was saved or the stored value is malformed.
 */
export function readLastUploadedContext(): StoredUploadedContext | null {
  if (!canUseLocalStorage()) return null;
  try {
    const raw = window.localStorage.getItem(UPLOADED_CONTEXT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as Record<string, unknown>).sessionId === 'string' &&
      typeof (parsed as Record<string, unknown>).uploadedRunId === 'string' &&
      typeof (parsed as Record<string, unknown>).technique === 'string'
    ) {
      return parsed as StoredUploadedContext;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Clear the stored uploaded context (e.g. when user explicitly discards the upload).
 */
export function clearLastUploadedContext(): void {
  if (!canUseLocalStorage()) return;
  try {
    window.localStorage.removeItem(UPLOADED_CONTEXT_KEY);
  } catch {
    // Ignore
  }
}
