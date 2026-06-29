/**
 * Cross-Technique Consistency Registry
 * 
 * Pure matching utilities for transparent multi-technique fusion.
 * Implements normalized phase identity and chemical consistency checking across
 * XRD, Raman, FTIR, and XPS evidence nodes without relying on database-specific IDs.
 */

import type { UniversalEvidenceNode } from '../../types/universalEvidence.js';

/**
 * Normalize a chemical formula string for comparison.
 * Strips whitespace and normalizes formatting.
 */
function normalizeFormula(formula?: string): string {
  if (!formula) return '';
  return formula.replace(/\s+/g, '').toUpperCase();
}

/**
 * Normalize a phase label or summary string for comparison.
 * Removes parenthetical content (like formulas), hyphens/underscores, and lowercases.
 */
function normalizeLabel(label?: string): string {
  if (!label) return '';
  return label
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ') // remove parenthetical terms e.g. (Fe3O4)
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if two evidence nodes refer to the same normalized phase identity.
 * Matches by exact canonical formula OR matching normalized phase label.
 * Never requires identical database reference IDs.
 */
export function matchesPhase(nodeA: UniversalEvidenceNode, nodeB: UniversalEvidenceNode): boolean {
  if (!nodeA || !nodeB) return false;

  // 1. Compare by normalized formula if both present
  const formA = normalizeFormula(nodeA.provenance?.formula);
  const formB = normalizeFormula(nodeB.provenance?.formula);
  if (formA && formB && formA === formB) {
    return true;
  }

  // 2. Compare by normalized label
  const labelA = normalizeLabel(nodeA.label);
  const labelB = normalizeLabel(nodeB.label);
  if (labelA && labelB) {
    if (labelA === labelB) return true;
    // Check if one normalized label is a significant substring of the other (min 4 chars to avoid false positives)
    if (labelA.length >= 4 && labelB.includes(labelA)) return true;
    if (labelB.length >= 4 && labelA.includes(labelB)) return true;
  }

  return false;
}

/**
 * Check if an evidence node confirms or indicates the presence of a given chemical element symbol.
 */
export function matchesElement(node: UniversalEvidenceNode, elementSymbol: string): boolean {
  if (!node || !elementSymbol) return false;

  const target = elementSymbol.trim();
  if (!target) return false;

  // Regex matches element symbol not followed by a lowercase letter (to distinguish e.g. Fe from Ferrite or C from Cu)
  const regex = new RegExp(`${target}(?![a-z])`);

  const fieldsToCheck = [
    node.provenance?.formula,
    node.label,
    node.provenance?.summary
  ];

  for (const field of fieldsToCheck) {
    if (field && regex.test(field)) {
      return true;
    }
  }

  return false;
}

/**
 * Normalize oxidation state representation to common tokens for matching.
 * e.g., "³⁺", "3+", "+3", "(III)" -> "3+"
 */
function normalizeOxidationState(stateStr: string): string {
  if (!stateStr) return '';
  return stateStr
    .replace(/³⁺|\(III\)|\bIII\b|\+3|3\+/gi, '3+')
    .replace(/²⁺|\(II\)|\bII\b|\+2|2\+/gi, '2+')
    .replace(/¹⁺|\(I\)|\bI\b|\+1|1\+/gi, '1+')
    .replace(/⁴⁺|\(IV\)|\bIV\b|\+4|4\+/gi, '4+')
    .replace(/⁰|\(0\)|\bmetallic\b|(?<![\d.])0(?!\d)/gi, '0+');
}

/**
 * Check if an evidence node matches a specific oxidation state.
 */
export function matchesOxidationState(node: UniversalEvidenceNode, expectedState: string): boolean {
  if (!node || !expectedState) return false;

  const normExpected = normalizeOxidationState(expectedState);
  if (!normExpected) return false;

  const fieldsToCheck = [
    node.label,
    node.provenance?.summary,
    node.provenance?.formula
  ];

  for (const field of fieldsToCheck) {
    if (field) {
      const normField = normalizeOxidationState(field);
      if (normField.includes(normExpected)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Registry entry definition for canonical chemical phases.
 */
export interface CanonicalPhaseRegistryEntry {
  formula: string;
  compatibleOxidationStates: string[];
  forbiddenStates: string[];
  polymorphResolutionCap: string;
  xpsMainBE: number[];
  xpsSatellite: {
    expected: boolean;
    forbiddenRange?: [number, number];
    expectedBE?: number;
  };
}

/**
 * Canonical Phase Registry storing chemical consistency boundaries and XPS reference anchors.
 */
export const CANONICAL_PHASE_REGISTRY: Record<string, CanonicalPhaseRegistryEntry> = {
  'TIO2': {
    formula: 'TiO2',
    compatibleOxidationStates: ['4+'],
    forbiddenStates: ['0', '2+', '3+'],
    polymorphResolutionCap: 'Requires XRD or Raman for polymorph resolution (anatase vs rutile)',
    xpsMainBE: [458.6, 464.3],
    xpsSatellite: { expected: false },
  },
  'FE2O3': {
    formula: 'Fe2O3',
    compatibleOxidationStates: ['3+'],
    forbiddenStates: ['0', '2+'],
    polymorphResolutionCap: 'Requires XRD or Raman for polymorph resolution (hematite vs maghemite)',
    xpsMainBE: [711.0],
    xpsSatellite: { expected: true, expectedBE: 718.8 },
  },
  'FE3O4': {
    formula: 'Fe3O4',
    compatibleOxidationStates: ['2+', '3+'],
    forbiddenStates: ['0', '1+'],
    polymorphResolutionCap: 'Spinel inverse structure confirmed via combined Raman A1g and XPS Fe 2p satellite absence',
    xpsMainBE: [710.6],
    xpsSatellite: { expected: false, forbiddenRange: [718.0, 720.0] },
  },
  'CUFE2O4': {
    formula: 'CuFe2O4',
    compatibleOxidationStates: ['2+', '3+'],
    forbiddenStates: ['0', '1+'],
    polymorphResolutionCap: 'Tetragonal vs cubic spinel resolution requires XRD lattice parameter splitting',
    xpsMainBE: [933.5, 710.8],
    xpsSatellite: { expected: true, expectedBE: 942.2 },
  },
  'CUO': {
    formula: 'CuO',
    compatibleOxidationStates: ['2+'],
    forbiddenStates: ['0', '1+'],
    polymorphResolutionCap: 'Monoclinic tenorite structure',
    xpsMainBE: [933.6],
    xpsSatellite: { expected: true, expectedBE: 942.2 },
  },
  'CU2O': {
    formula: 'Cu2O',
    compatibleOxidationStates: ['1+'],
    forbiddenStates: ['0', '2+'],
    polymorphResolutionCap: 'Cubic cuprite structure',
    xpsMainBE: [932.5],
    xpsSatellite: { expected: false },
  },
  'ZNO': {
    formula: 'ZnO',
    compatibleOxidationStates: ['2+'],
    forbiddenStates: ['0', '1+'],
    polymorphResolutionCap: 'Hexagonal wurtzite structure',
    xpsMainBE: [1021.7],
    xpsSatellite: { expected: false },
  },
};
