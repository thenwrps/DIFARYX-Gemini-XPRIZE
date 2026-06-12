import { describe, it, expect } from 'vitest';
import {
  shouldTriggerReprocessOnApply,
  buildReprocessUnwiredNotice,
  computeSaveSessionUpdate,
} from '../utils/ramanReprocessState';

describe('Phase 7 — Raman Reprocess Wiring', () => {
  describe('shouldTriggerReprocessOnApply', () => {
    it('returns true for raman (Phase 7 fix)', () => {
      expect(shouldTriggerReprocessOnApply('raman')).toBe(true);
    });

    it('returns true for xrd (existing behavior)', () => {
      expect(shouldTriggerReprocessOnApply('xrd')).toBe(true);
    });

    it('returns true for ftir (existing behavior)', () => {
      expect(shouldTriggerReprocessOnApply('ftir')).toBe(true);
    });

    it('returns true for xps (Phase 6 output-wired: xpsParameterAdapter -> runXpsProcessing)', () => {
      expect(shouldTriggerReprocessOnApply('xps')).toBe(true);
    });

    it('returns true for all four supported techniques: xrd, ftir, xps, raman', () => {
      // Contract: Apply Parameters must trigger reprocess for every supported
      // technique whose parameters are output-wired through the adapter ->
      // processing runner chain.
      for (const t of ['xrd', 'ftir', 'xps', 'raman']) {
        expect(shouldTriggerReprocessOnApply(t), `expected ${t} to trigger reprocess`).toBe(true);
      }
    });

    it('returns false for unknown techniques', () => {
      expect(shouldTriggerReprocessOnApply('nmr')).toBe(false);
      expect(shouldTriggerReprocessOnApply('')).toBe(false);
    });
  });

  describe('buildReprocessUnwiredNotice', () => {
    it('produces a deterministic, honest log message naming the technique', () => {
      const { logMessage } = buildReprocessUnwiredNotice('xps');
      expect(logMessage).toContain('xps');
      expect(logMessage.toLowerCase()).toContain('not wired');
      expect(logMessage).toContain('reprocessed');
    });

    it('is a pure function — same input, same output', () => {
      const a = buildReprocessUnwiredNotice('xps');
      const b = buildReprocessUnwiredNotice('xps');
      expect(a).toEqual(b);
    });
  });

  describe('computeSaveSessionUpdate — pendingRecalculation contract', () => {
    it('clears dirty but PRESERVES pendingRecalculation when user just edited a parameter (dirty=true, pendingRecalculation=true)', () => {
      const result = computeSaveSessionUpdate({
        dirty: true,
        pendingRecalculation: true,
      });
      expect(result.nextDirty).toBe(false);
      expect(result.nextPendingRecalculation).toBe(true);
      expect(result.logMessage).toMatch(/pending recalculation/i);
    });

    it('clears dirty but PRESERVES pendingRecalculation when reprocess failed or has not run yet (dirty=false, pendingRecalculation=true)', () => {
      const result = computeSaveSessionUpdate({
        dirty: false,
        pendingRecalculation: true,
      });
      expect(result.nextDirty).toBe(false);
      expect(result.nextPendingRecalculation).toBe(true);
      expect(result.logMessage).toMatch(/pending recalculation/i);
    });

    it('clears dirty and keeps pendingRecalculation=false (reprocess already succeeded)', () => {
      const result = computeSaveSessionUpdate({
        dirty: false,
        pendingRecalculation: false,
      });
      expect(result.nextDirty).toBe(false);
      expect(result.nextPendingRecalculation).toBe(false);
      expect(result.logMessage).toBe('Processing result saved to local session state.');
    });

    it('never writes pendingRecalculation=false when prev was true (the Blocker 1 invariant)', () => {
      const cases = [
        { dirty: true, pendingRecalculation: true },
        { dirty: false, pendingRecalculation: true },
        { dirty: true, pendingRecalculation: false },
        { dirty: false, pendingRecalculation: false },
      ];
      for (const input of cases) {
        const r = computeSaveSessionUpdate(input);
        expect(
          r.nextPendingRecalculation,
          `expected pendingRecalculation to be preserved for input ${JSON.stringify(input)}`,
        ).toBe(input.pendingRecalculation);
      }
    });
  });
});
