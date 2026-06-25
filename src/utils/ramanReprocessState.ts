/**
 * Raman reprocess + save state-machine helpers.
 *
 * These pure functions encode the contract for Phase 7:
 *   1. applyParameters must trigger reprocess() for raman (in addition to xrd/ftir).
 *   2. reprocess() is the only path that may clear pendingRecalculation on success.
 *   3. saveSession must NEVER clear pendingRecalculation — it only clears dirty.
 *      Whether the log message is "saved" or "pending recalculation" is decided by
 *      the value of pendingRecalculation coming in.
 *
 * Extracting these as pure functions makes the contract testable without rendering
 * the full workspace component.
 */

export type ReprocessTechnique = 'xrd' | 'ftir' | 'xps' | 'raman' | (string & {});

export function shouldTriggerReprocessOnApply(technique: string): boolean {
  return (
    technique === 'xrd' ||
    technique === 'ftir' ||
    technique === 'xps' ||
    technique === 'raman'
  );
}

export interface ReprocessUnwiredNotice {
  logMessage: string;
}

export function buildReprocessUnwiredNotice(technique: string): ReprocessUnwiredNotice {
  return {
    logMessage: `[params] Apply Parameters is not wired for technique '${technique}' — parameter state was persisted but output was not reprocessed.`,
  };
}

export interface SaveSessionInput {
  dirty: boolean;
  pendingRecalculation: boolean;
}

export interface SaveSessionResult {
  nextDirty: boolean;
  nextPendingRecalculation: boolean;
  logMessage: string;
}

/**
 * Compute the post-save session-state patch.
 *
 * Contract:
 *   - dirty is ALWAYS cleared (Save persists the parameters).
 *   - pendingRecalculation is NEVER touched here.
 *     Reprocess is the single owner of clearing it, and only on success.
 *   - The log message reflects the actual output state:
 *       * if pendingRecalculation=true  → parameters saved but output is still stale
 *       * if pendingRecalculation=false → processing result saved successfully
 */
export function computeSaveSessionUpdate(prev: SaveSessionInput): SaveSessionResult {
  return {
    nextDirty: false,
    nextPendingRecalculation: prev.pendingRecalculation,
    logMessage: prev.pendingRecalculation
      ? 'Parameters saved. Output is still pending recalculation — click Apply Parameters to refresh processed peaks/features.'
      : 'Processing result saved to local session state.',
  };
}
