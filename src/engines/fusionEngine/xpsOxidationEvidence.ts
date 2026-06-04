/**
 * XPS Oxidation-State Evidence → Fusion adapter
 *
 * Bridges element-focused XPS evidence (oxidation-state candidates) into the
 * fusion engine so it participates in candidate support scoring and
 * contradiction detection — not only in agent basis text.
 *
 * Deterministic and evidence-bound. No positive-confirmation language.
 */

import type { PeakInput } from './types';
import type { XpsElementEvidence } from '../../agent/mcp/types';

/**
 * Normalize an oxidation-state label (e.g. 'Cu²⁺', 'Co(II/III)', 'C(+4)') into
 * an ASCII assignment string the fusion XPS evidence-id heuristic understands
 * (it looks for substrings like 'cu2+', 'fe3+', 'mixed', 'oxide').
 */
export function normalizeOxidationAssignment(label: string): string {
  const ascii = (label || '')
    .replace(/⁰/g, '0')
    .replace(/⁺/g, '+')
    .replace(/⁻/g, '-')
    .replace(/²/g, '2')
    .replace(/³/g, '3')
    .replace(/⁴/g, '4')
    .toLowerCase();

  // Mixed / multivalent environments (e.g. Co(II/III)) → mixed-oxidation-state.
  if (ascii.includes('ii/iii') || ascii.includes('mixed') || /\d\+\/\d\+/.test(ascii)) {
    return `mixed ${ascii}`;
  }
  return ascii;
}

/** True when a candidate label denotes a reduced / mixed-valence environment. */
export function isReducedOrMixedState(label: string): boolean {
  const ascii = normalizeOxidationAssignment(label);
  if (ascii.includes('mixed') || ascii.includes('(0)') || ascii.includes('metal')) {
    return true;
  }
  // Charge magnitude: an explicit digit ('2+','3+') or a bare '+' (= +1, e.g. Cu⁺).
  const explicit = ascii.match(/(\d)\+/);
  if (explicit) return parseInt(explicit[1], 10) <= 1;
  return ascii.includes('+'); // bare '+' denotes a +1 (reduced) state
}

/**
 * Convert XPS oxidation-state candidate states into fusion-consumable
 * `PeakInput[]` (tagged via assignment so createEvidenceNodes maps them to the
 * XPS oxidation-state evidence vocabulary). Region-window midpoint is used as a
 * representative binding-energy position.
 */
export function xpsOxidationStatePeakInputs(evidence: XpsElementEvidence): PeakInput[] {
  const window = evidence.regionWindow;
  const midpoint = window ? (window.min + window.max) / 2 : 0;
  return evidence.candidateStates.map((state, index) => ({
    id: `xps-oxidation-${evidence.selectedElement}-${index}`,
    position: Number(midpoint.toFixed(1)),
    intensity: Math.round(state.confidence * 100),
    label: state.label,
    assignment: normalizeOxidationAssignment(state.label),
  }));
}

export interface XpsXrdOxidationContradiction {
  hasContradiction: boolean;
  /** Hedged, user-facing messages describing the inconsistency. */
  messages: string[];
  /** Candidate state labels implicated in the inconsistency. */
  conflictingStates: string[];
}

/** Heuristic: does the XRD phase indicate a defined fully-oxidized oxide/spinel? */
function isFullyOxidizedOxidePhase(xrdPrimaryPhase: string | null | undefined): boolean {
  const phase = (xrdPrimaryPhase || '').toLowerCase();
  if (!phase) return false;
  return (
    phase.includes('ferrite') ||
    phase.includes('spinel') ||
    phase.includes('oxide') ||
    /[a-z]+\d*o\d/.test(phase) // e.g. cufe2o4, fe2o3, fe3o4
  );
}

/**
 * Detect whether XPS oxidation-state evidence appears inconsistent with the
 * XRD-indicated primary phase. Cross-technique check (single-context fusion
 * runs do not co-evaluate XRD + XPS), kept deterministic and demo-bounded.
 *
 * Rule: a defined fully-oxidized oxide/spinel phase (e.g. CuFe₂O₄) is not
 * expected to present reduced / mixed-valence surface states; if XPS indicates
 * such states, surface a hedged contradiction for interpretation.
 */
export function detectXpsXrdOxidationContradiction(
  evidence: XpsElementEvidence,
  xrdPrimaryPhase: string | null | undefined,
): XpsXrdOxidationContradiction {
  const empty: XpsXrdOxidationContradiction = {
    hasContradiction: false,
    messages: [],
    conflictingStates: [],
  };
  if (!evidence || !isFullyOxidizedOxidePhase(xrdPrimaryPhase)) return empty;

  const conflictingStates = evidence.candidateStates
    .filter((state) => isReducedOrMixedState(state.label))
    .map((state) => state.label);

  if (conflictingStates.length === 0) return empty;

  return {
    hasContradiction: true,
    conflictingStates,
    messages: [
      `XPS ${evidence.selectedElement} oxidation-state evidence (${conflictingStates.join(', ')}) appears inconsistent with the XRD-indicated phase (${xrdPrimaryPhase}), which suggests fully oxidized states.`,
      'This surface-versus-bulk difference may indicate surface reduction or a secondary phase and should be reconciled before interpretation.',
    ],
  };
}
