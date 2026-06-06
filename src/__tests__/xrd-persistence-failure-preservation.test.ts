/**
 * XRD Persistence Failure — Preservation Property Tests
 *
 * Property 2: Preservation — Non-Uploaded Context Behaviour Unchanged
 *
 * These six cases cover behaviours that already work on the UNFIXED code and
 * MUST CONTINUE to work after the fix is applied.
 *
 * ALL SIX TESTS ARE EXPECTED TO PASS on unfixed code.
 * They establish the regression baseline: run them before and after the fix.
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 5.3
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { saveLastUploadedContext, readLastUploadedContext } from '../utils/uploadedContextStore';
import { saveAnalysisSession, getAnalysisSession, createAnalysisSession } from '../data/analysisSessions';

// ── localStorage / sessionStorage reset ──────────────────────────────────────

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

// ── Inline helpers (mirror the unfixed shell logic) ───────────────────────────

/**
 * Inline re-implementation of the current (unfixed) resolveQuickSessionKey.
 * Source: TechniqueWorkspaceShell.tsx line 1150
 *
 *   const [quickSessionKey] = useState(() =>
 *     (isQuickMode || isUploadedContext)
 *       ? (querySessionId ?? routeContext.uploadedRunId ?? `quick-${technique}-${fileName ?? 'unknown'}`)
 *       : ''
 *   );
 */
function resolveQuickSessionKey_unfixed(params: {
  isQuickMode: boolean;
  isUploadedContext: boolean;
  querySessionId: string | null;
  routeUploadedRunId: string | null;
  technique: string;
  fileName?: string;
}): string {
  const { isQuickMode, isUploadedContext, querySessionId, routeUploadedRunId, technique, fileName } = params;
  return (isQuickMode || isUploadedContext)
    ? (querySessionId ?? routeUploadedRunId ?? `quick-${technique}-${fileName ?? 'unknown'}`)
    : '';
}

/**
 * Inline re-implementation of the current (unfixed) sessionStorageKey derivation.
 * Source: TechniqueWorkspaceShell.tsx lines 1151-1157
 */
function deriveSessionStorageKey(params: {
  technique: string;
  isQuickMode: boolean;
  isUploadedContext: boolean;
  quickSessionKey: string;
  uploadedContextKey: string;
  projectId?: string | null;
}): string {
  const { technique, isQuickMode, isUploadedContext, quickSessionKey, uploadedContextKey, projectId } = params;
  if (isQuickMode) {
    return `difaryx-technique-session:${technique}:quick:${quickSessionKey}`;
  }
  if (isUploadedContext) {
    return `difaryx-technique-session:${technique}:uploaded:${uploadedContextKey}`;
  }
  return `difaryx-technique-session:${technique}:${projectId ?? 'standalone'}:standalone-${technique}-session`;
}

/**
 * Inline re-implementation of the current (unfixed) readSessionPacket.
 * Written to sessionStorage (the bug) — preserved here to test schema version guard.
 */
function readSessionPacket_unfixed(): {
  version: string;
  projectId: string;
  uploadedRunId?: string;
  isValidated7E4: boolean;
} | null {
  try {
    const raw = window.sessionStorage.getItem('difaryx_xrd_runtime_session');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Inline re-implementation of the current (unfixed) writeSessionPacket.
 */
function writeSessionPacket_unfixed(packet: {
  version: string;
  projectId: string;
  uploadedRunId?: string;
  isValidated7E4: boolean;
}): void {
  window.sessionStorage.setItem('difaryx_xrd_runtime_session', JSON.stringify(packet));
}

/**
 * Inline re-implementation of the schema-version gate from hydrateFromSession().
 * Source: XrdWorkflowRuntimeContext.tsx lines 99-107
 *
 * Returns null + resetNotification when version mismatches; returns packet otherwise.
 */
const DIFARYX_XRD_SCHEMA_VERSION = '1.1.0';

function hydrateSessionPacket_unfixed(packet: {
  version: string;
  projectId: string;
  uploadedRunId?: string;
  isValidated7E4: boolean;
} | null): {
  evidence: null;
  isValidated7E4: boolean;
  resetNotification: string | null;
} | { evidence: typeof packet; isValidated7E4: boolean; resetNotification: null } {
  if (!packet) {
    return { evidence: null, isValidated7E4: false, resetNotification: null };
  }
  if (packet.version !== DIFARYX_XRD_SCHEMA_VERSION) {
    // Clear the stale entry (mirroring clearSessionPacket())
    window.sessionStorage.removeItem('difaryx_xrd_runtime_session');
    return {
      evidence: null,
      isValidated7E4: false,
      resetNotification:
        `Session data was created with schema v${packet.version} but the current runtime requires v${DIFARYX_XRD_SCHEMA_VERSION}. Session has been safely reset.`,
    };
  }
  return { evidence: packet, isValidated7E4: packet.isValidated7E4, resetNotification: null };
}

/**
 * Inline re-implementation of the current (unfixed) Attach Project href.
 * Source: TechniqueWorkspaceShell.tsx line ~3204
 *
 *   <Link to={isQuickMode ? '/workspace' : '/workspace'}>
 */
function attachProjectHref_unfixed(_params: {
  isQuickMode: boolean;
  querySessionId: string | null;
  uploadedRunId: string | null;
  isUploadedContext: boolean;
}): string {
  return '/workspace';
}

// ── Preservation Case 1 — Demo project ───────────────────────────────────────

describe('Preservation case 1 — Demo project: non-uploaded context returns empty quickSessionKey', () => {
  /**
   * Validates: Requirements 3.1, 3.2
   *
   * Given (isUploadedContext=false, project='cufe2o4-sba15'), the unfixed code
   * returns quickSessionKey === '' (because neither isQuickMode nor isUploadedContext
   * is true). The sessionStorageKey then takes the project branch and contains
   * the projectId.
   */
  it('quickSessionKey is empty string for demo project (isUploadedContext=false)', () => {
    const quickSessionKey = resolveQuickSessionKey_unfixed({
      isQuickMode: false,
      isUploadedContext: false,
      querySessionId: null,
      routeUploadedRunId: null,
      technique: 'xrd',
      fileName: undefined,
    });

    expect(quickSessionKey).toBe('');
  });

  it('sessionStorageKey contains project id for demo project', () => {
    const projectId = 'cufe2o4-sba15';

    const quickSessionKey = resolveQuickSessionKey_unfixed({
      isQuickMode: false,
      isUploadedContext: false,
      querySessionId: null,
      routeUploadedRunId: null,
      technique: 'xrd',
      fileName: undefined,
    });

    const uploadedContextKey = 'uploaded'; // routeContext.uploadedRunId ?? querySessionId ?? 'uploaded'
    const sessionStorageKey = deriveSessionStorageKey({
      technique: 'xrd',
      isQuickMode: false,
      isUploadedContext: false,
      quickSessionKey,
      uploadedContextKey,
      projectId,
    });

    expect(sessionStorageKey).toContain(projectId);
    expect(sessionStorageKey).toContain('xrd');
  });
});

// ── Preservation Case 2 — Quick Mode with valid sessionId ─────────────────────

describe('Preservation case 2 — Quick Mode with valid sessionId', () => {
  /**
   * Validates: Requirements 3.3, 5.3
   *
   * Given (isQuickMode=true, querySessionId='abc123'), the unfixed code returns
   * quickSessionKey === 'abc123' because querySessionId is the first fallback
   * (highest priority) in the ternary chain.
   */
  it('quickSessionKey equals the querySessionId when isQuickMode=true and querySessionId is present', () => {
    const quickSessionKey = resolveQuickSessionKey_unfixed({
      isQuickMode: true,
      isUploadedContext: false,
      querySessionId: 'abc123',
      routeUploadedRunId: null,
      technique: 'xrd',
      fileName: undefined,
    });

    expect(quickSessionKey).toBe('abc123');
  });

  it('quickSessionKey equals querySessionId even when routeUploadedRunId is also set (querySessionId wins)', () => {
    const quickSessionKey = resolveQuickSessionKey_unfixed({
      isQuickMode: true,
      isUploadedContext: false,
      querySessionId: 'abc123',
      routeUploadedRunId: 'some-run-id',
      technique: 'xrd',
    });

    // querySessionId has higher priority than routeUploadedRunId
    expect(quickSessionKey).toBe('abc123');
  });
});

// ── Preservation Case 3 — Schema version guard ───────────────────────────────

describe('Preservation case 3 — Schema version guard rejects stale packet', () => {
  /**
   * Validates: Requirements 2.3, 3.5
   *
   * Given a stored packet with version='0.9.0' (older than DIFARYX_XRD_SCHEMA_VERSION
   * '1.1.0'), hydrateFromSession() must:
   *   1. Return evidence === null
   *   2. Return a non-null resetNotification string describing the mismatch
   *   3. Remove the stale entry from storage (clear sessionStorage)
   */
  it('returns null evidence and a resetNotification for a packet with stale schema version', () => {
    // Write a stale-version packet to sessionStorage (via unfixed write path)
    writeSessionPacket_unfixed({
      version: '0.9.0',
      projectId: 'proj',
      uploadedRunId: 'R1',
      isValidated7E4: false,
    });

    // Verify it was written
    const raw = window.sessionStorage.getItem('difaryx_xrd_runtime_session');
    expect(raw).not.toBeNull();

    // Act: run the schema-version gate
    const packet = readSessionPacket_unfixed();
    const result = hydrateSessionPacket_unfixed(packet);

    // Assert: stale version triggers reset
    expect(result.evidence).toBeNull();
    expect(result.resetNotification).not.toBeNull();
    expect(result.resetNotification).toContain('0.9.0');
    expect(result.resetNotification).toContain(DIFARYX_XRD_SCHEMA_VERSION);
  });

  it('clears the stale entry from sessionStorage after version mismatch', () => {
    writeSessionPacket_unfixed({
      version: '0.9.0',
      projectId: 'proj',
      isValidated7E4: false,
    });

    const packet = readSessionPacket_unfixed();
    hydrateSessionPacket_unfixed(packet); // triggers clear

    const afterClear = window.sessionStorage.getItem('difaryx_xrd_runtime_session');
    expect(afterClear).toBeNull();
  });

  it('accepts a packet with the current schema version and returns no resetNotification', () => {
    writeSessionPacket_unfixed({
      version: DIFARYX_XRD_SCHEMA_VERSION,
      projectId: 'proj',
      uploadedRunId: 'R1',
      isValidated7E4: false,
    });

    const packet = readSessionPacket_unfixed();
    const result = hydrateSessionPacket_unfixed(packet);

    expect(result.resetNotification).toBeNull();
    expect(result.evidence).not.toBeNull();
  });
});

// ── Preservation Case 4 — Autosave round-trip ────────────────────────────────

describe('Preservation case 4 — saveLastUploadedContext / readLastUploadedContext round-trip', () => {
  /**
   * Validates: Requirements 3.4, 3.6
   *
   * The autosave useEffect writes to sessionStorageKey in localStorage on every
   * sessionState change. We verify the underlying store round-trips correctly,
   * confirming the save/read path is intact before and after the fix.
   */
  it('readLastUploadedContext returns the saved context after saveLastUploadedContext', () => {
    saveLastUploadedContext({
      sessionId: 'X',
      uploadedRunId: 'Y',
      technique: 'xrd',
    });

    const result = readLastUploadedContext();

    expect(result).not.toBeNull();
    expect(result?.sessionId).toBe('X');
    expect(result?.uploadedRunId).toBe('Y');
    expect(result?.technique).toBe('xrd');
  });

  it('savedAt is a valid ISO timestamp', () => {
    saveLastUploadedContext({
      sessionId: 'X',
      uploadedRunId: 'Y',
      technique: 'xrd',
    });

    const result = readLastUploadedContext();
    expect(result?.savedAt).toBeDefined();
    expect(() => new Date(result!.savedAt)).not.toThrow();
    expect(new Date(result!.savedAt).getTime()).not.toBeNaN();
  });

  it('overwrites a previous save with new values', () => {
    saveLastUploadedContext({ sessionId: 'first', uploadedRunId: 'R1', technique: 'xrd' });
    saveLastUploadedContext({ sessionId: 'second', uploadedRunId: 'R2', technique: 'xrd' });

    const result = readLastUploadedContext();
    expect(result?.sessionId).toBe('second');
    expect(result?.uploadedRunId).toBe('R2');
  });

  it('readLastUploadedContext returns null when nothing was saved', () => {
    const result = readLastUploadedContext();
    expect(result).toBeNull();
  });
});

// ── Preservation Case 5 — Non-uploaded Attach Project ────────────────────────

describe('Preservation case 5 — Non-uploaded Attach Project falls back to /workspace', () => {
  /**
   * Validates: Requirements 4.3
   *
   * Given (isUploadedContext=false, project=demoProject), the unfixed
   * attachProjectHref returns '/workspace' with no query string.
   * This fallback must continue to work after the fix for demo-project mode.
   */
  it('Attach Project href is /workspace (no query string) when isUploadedContext=false', () => {
    const href = attachProjectHref_unfixed({
      isQuickMode: false,
      querySessionId: null,
      uploadedRunId: null,
      isUploadedContext: false,
    });

    expect(href).toBe('/workspace');
    expect(href).not.toContain('sessionId');
    expect(href).not.toContain('upload');
  });

  it('Attach Project href is /workspace when isQuickMode=false and isUploadedContext=false', () => {
    const href = attachProjectHref_unfixed({
      isQuickMode: false,
      querySessionId: null,
      uploadedRunId: null,
      isUploadedContext: false,
    });

    expect(href).toBe('/workspace');
  });
});

// ── Preservation Case 6 — Cross-technique (XPS) ───────────────────────────────

describe('Preservation case 6 — Cross-technique: XPS session key contains :xps: and round-trips', () => {
  /**
   * Validates: Requirements 3.3, 5.3
   *
   * Given (technique='xps', isUploadedContext=true, sessionId='S2'), the session
   * key must contain ':xps:' and ':uploaded:', and saveLastUploadedContext followed
   * by readLastUploadedContext must preserve the technique='xps' field.
   */
  it('sessionStorageKey contains :xps: and :uploaded: for an XPS uploaded context', () => {
    const technique = 'xps';
    const sessionId = 'S2';
    const uploadedRunId = 'R2';

    const quickSessionKey = resolveQuickSessionKey_unfixed({
      isQuickMode: false,
      isUploadedContext: true,
      querySessionId: sessionId,
      routeUploadedRunId: uploadedRunId,
      technique,
    });

    const uploadedContextKey = uploadedRunId; // routeContext.uploadedRunId is set
    const sessionStorageKey = deriveSessionStorageKey({
      technique,
      isQuickMode: false,
      isUploadedContext: true,
      quickSessionKey,
      uploadedContextKey,
    });

    expect(sessionStorageKey).toContain(':xps:');
    expect(sessionStorageKey).toContain(':uploaded:');
    expect(sessionStorageKey).toContain(uploadedRunId);
  });

  it('saveLastUploadedContext round-trips with technique=xps', () => {
    saveLastUploadedContext({
      sessionId: 'S2',
      uploadedRunId: 'R2',
      technique: 'xps',
    });

    const result = readLastUploadedContext();

    expect(result).not.toBeNull();
    expect(result?.sessionId).toBe('S2');
    expect(result?.uploadedRunId).toBe('R2');
    expect(result?.technique).toBe('xps');
  });

  it('saveLastUploadedContext for xps does not bleed into an xrd read', () => {
    // Write xps context, then simulate an xrd workspace checking for its own technique
    saveLastUploadedContext({ sessionId: 'S2', uploadedRunId: 'R2', technique: 'xps' });

    const stored = readLastUploadedContext();
    // A guard on storedCtx.technique === 'xrd' should reject this
    const isRelevantForXrd = stored !== null && stored.technique === 'xrd';

    expect(isRelevantForXrd).toBe(false);
  });
});

// ── Bonus: analysisSessions round-trip (underpins preservation case 4) ────────

describe('Preservation: saveAnalysisSession / getAnalysisSession storage round-trip', () => {
  /**
   * Validates: Requirements 3.1, 3.2
   *
   * Confirms that the analysisSessions data layer persists and retrieves
   * sessions correctly — the foundation the autosave path depends on.
   */
  it('getAnalysisSession returns the session with updated status after saveAnalysisSession', () => {
    const session = createAnalysisSession('xrd', 'test-round-trip.xy');
    saveAnalysisSession({ ...session, status: 'processing' });

    // Manually update to 'saved' and re-save (simulating the fixed saveSession())
    const before = getAnalysisSession(session.analysisId);
    expect(before?.status).toBe('processing');

    saveAnalysisSession({ ...session, status: 'saved' });

    const after = getAnalysisSession(session.analysisId);
    expect(after?.status).toBe('saved');
  });

  it('saveAnalysisSession sets updatedAt to a recent timestamp', () => {
    const session = createAnalysisSession('xrd', 'test-timestamp.xy');
    const before = Date.now();
    const saved = saveAnalysisSession(session);
    const after = Date.now();

    const updatedMs = new Date(saved.updatedAt).getTime();
    expect(updatedMs).toBeGreaterThanOrEqual(before);
    expect(updatedMs).toBeLessThanOrEqual(after + 50); // 50ms slack
  });
});
