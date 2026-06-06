/**
 * XRD Persistence Failure — Bug Condition Exploration Test (FROZEN / SKIPPED)
 *
 * Property 1: Bug Condition — Uploaded Evidence Context Lost on Hard Refresh
 *
 * This file contains four sub-cases, one per defect.
 * ALL FOUR TESTS ARE EXPECTED TO FAIL on unfixed code.
 * Failure = confirmation that the bug exists.
 *
 * DO NOT attempt to fix the code or this test when it fails.
 *
 * All describe blocks are marked describe.skip so that this file does
 * NOT block the default `vitest` / CI test run. To run these exploration
 * tests explicitly, temporarily remove the .skip markers.
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 2.1, 2.2, 3.1, 4.1
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { saveLastUploadedContext, readLastUploadedContext } from '../utils/uploadedContextStore';
import { saveAnalysisSession, getAnalysisSession, createAnalysisSession } from '../data/analysisSessions';

// ── Minimal localStorage / sessionStorage shims for the test environment ────

// vitest with jsdom provides localStorage and sessionStorage automatically.
// We reset them before each test for isolation.

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Inline re-implementation of the current (unfixed) readSessionPacket logic.
 * Reads from sessionStorage — the bug is here.
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
 * Inline re-implementation of the current (unfixed) writeSessionPacket logic.
 * Writes to sessionStorage — the bug is here.
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
 * Simulate the current (unfixed) quickSessionKey useState initialiser.
 * Source: TechniqueWorkspaceShell.tsx line 1149
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
 * Simulate the current (unfixed) saveSession React callback.
 * Source: TechniqueWorkspaceShell.tsx lines 3040-3053
 *
 * The real function only mutates React state (dirty: false).
 * It never calls saveAnalysisSession(). We model this as a no-op on the
 * storage layer.
 */
function saveSession_unfixed(_analysisId: string): void {
  // Real implementation:
  //   setSessionState((prev) => addLog({ ...prev, dirty: false, pendingRecalculation: false }, '...'));
  // This only updates React component state — it does NOT call saveAnalysisSession().
  // So from storage's perspective, nothing changes. We intentionally do nothing here.
}

/**
 * Simulate the current (unfixed) Attach Project link href.
 * Source: TechniqueWorkspaceShell.tsx line 3204
 *
 *   <Link to={isQuickMode ? '/workspace' : '/workspace'} ...>
 *
 * Both branches produce '/workspace' regardless of context — the bug.
 */
function attachProjectHref_unfixed(_params: {
  isQuickMode: boolean;
  querySessionId: string | null;
  uploadedRunId: string | null;
  isUploadedContext: boolean;
}): string {
  // Real implementation: to={isQuickMode ? '/workspace' : '/workspace'}
  return '/workspace';
}

// ── Defect 1 — Stale Key ─────────────────────────────────────────────────────

describe.skip('Defect 1 — Stale Key: quickSessionKey resolves to stored sessionId on clean-URL mount', () => {
  it('quickSessionKey should equal the stored sessionId when URL params are absent (FAILS on unfixed code)', () => {
    // Arrange: seed localStorage with a prior uploaded context
    saveLastUploadedContext({
      sessionId: 'S1',
      uploadedRunId: 'R1',
      technique: 'xrd',
    });

    // Verify the seed was written
    const stored = readLastUploadedContext();
    expect(stored?.sessionId).toBe('S1');

    // Act: simulate component mount with clean URL — querySessionId=null, routeUploadedRunId=null
    // This is what happens after a hard refresh when the URL no longer carries ?sessionId=
    const quickSessionKey = resolveQuickSessionKey_unfixed({
      isQuickMode: false,
      isUploadedContext: true,
      querySessionId: null,       // <-- clean URL: no ?sessionId= param
      routeUploadedRunId: null,   // <-- clean URL: no ?upload= param
      technique: 'xrd',
      fileName: undefined,
    });

    // Assert: quickSessionKey SHOULD equal 'S1' so the workspace can restore state.
    // WILL FAIL on unfixed code — resolves to 'quick-xrd-unknown' because the
    // initialiser does not consult readLastUploadedContext() as a belt-and-suspenders
    // fallback when both querySessionId and routeUploadedRunId are null.
    expect(quickSessionKey).toBe('S1');
    // Counter-example: quickSessionKey === 'quick-xrd-unknown'
  });
});

// ── Defect 2 — sessionStorage Eviction ───────────────────────────────────────

describe.skip('Defect 2 — sessionStorage Eviction: runtime packet survives hard refresh', () => {
  it('readSessionPacket() should return the written packet after sessionStorage.clear() (FAILS on unfixed code)', () => {
    // Arrange: write a session packet using the current (unfixed) write path
    writeSessionPacket_unfixed({
      version: '1.1.0',
      projectId: 'proj',
      uploadedRunId: 'R1',
      isValidated7E4: false,
    });

    // Verify it was written
    const beforeClear = readSessionPacket_unfixed();
    expect(beforeClear?.uploadedRunId).toBe('R1');

    // Act: simulate hard refresh — sessionStorage is cleared by the browser
    sessionStorage.clear();

    // Assert: the packet should still be readable after "refresh".
    // WILL FAIL on unfixed code — sessionStorage is cleared, so readSessionPacket()
    // returns null. The fix moves the write target to localStorage.
    const afterClear = readSessionPacket_unfixed();
    expect(afterClear).not.toBeNull();
    expect(afterClear?.uploadedRunId).toBe('R1');
    expect(afterClear?.version).toBe('1.1.0');
    // Counter-example: readSessionPacket() === null
  });
});

// ── Defect 3 — Save No-op ────────────────────────────────────────────────────

describe.skip('Defect 3 — Save No-op: saveSession() persists a checkpoint with status=saved', () => {
  it('getAnalysisSession(analysisId).status should equal "saved" after saveSession() is called (FAILS on unfixed code)', () => {
    // Arrange: create an analysis session in the processing state
    const session = createAnalysisSession('xrd', 'test-upload.xy');
    saveAnalysisSession({ ...session, status: 'processing' });

    const before = getAnalysisSession(session.analysisId);
    expect(before?.status).toBe('processing');

    // Act: call the unfixed saveSession — it is a no-op on the storage layer
    saveSession_unfixed(session.analysisId);

    // Assert: status should now be 'saved'.
    // WILL FAIL on unfixed code — saveSession() only updates React state (dirty: false)
    // and never calls saveAnalysisSession(), so the stored status remains 'processing'.
    const after = getAnalysisSession(session.analysisId);
    expect(after?.status).toBe('saved');
    // Counter-example: after.status === 'processing'
  });
});

// ── Defect 4 — Attach Project Drops Context ───────────────────────────────────

describe.skip('Defect 4 — Attach Project drops context: link href forwards sessionId and uploadedRunId', () => {
  it('Attach Project href should contain sessionId=S1 and upload=R1 when isUploadedContext=true (FAILS on unfixed code)', () => {
    // Arrange: uploaded context with known IDs
    const params = {
      isQuickMode: true,
      querySessionId: 'S1',
      uploadedRunId: 'R1',
      isUploadedContext: true,
    };

    // Act: compute the href using the unfixed logic
    const href = attachProjectHref_unfixed(params);

    // Assert: href should forward context so downstream pages receive the uploaded evidence IDs.
    // WILL FAIL on unfixed code — both branches of the ternary resolve to '/workspace' with
    // no query string. The fix builds the href using buildEvidenceRouteSearch(routeContext).
    expect(href).toContain('sessionId=S1');
    expect(href).toContain('upload=R1');
    // Counter-example: href === '/workspace'
  });
});
