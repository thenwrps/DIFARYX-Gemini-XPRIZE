/**
 * ============================================================================
 * DIFARYX — Universal Knowledge Base: Registry Factory & Central Resolver
 * ============================================================================
 *
 * This module is the centralized entry point for the Universal Materials
 * Knowledge Base. It:
 *
 *   1. Imports all MaterialRuleSet implementations from the registry
 *   2. Builds a lookup map (materialId → MaterialRuleSet)
 *   3. Provides dynamic resolution: given a sample formula or alias,
 *      returns the correct MaterialRuleSet for the reasoning engine
 *   4. Exports all types, interfaces, and individual rule sets for
 *      direct access when needed
 *
 * ARCHITECTURE: Registry + Strategy Pattern
 *   - Each material file exports a singleton MaterialRuleSet
 *   - This factory maps material IDs and aliases → rule sets
 *   - The reasoning engine calls `resolveMaterialRuleSet(formula)` to
 *     dynamically select the correct knowledge for any sample
 *
 * USAGE:
 *   import { resolveMaterialRuleSet, getAllMaterialIds } from './knowledgeBase';
 *   const rules = resolveMaterialRuleSet('LiFePO4');
 *   // → energyStorageRuleSet
 *
 * @module reasoningEngine/knowledgeBase
 * ============================================================================
 */

import type { MaterialRuleSet, MaterialClass } from './baseTypes';
import { tio2RuleSet } from './tio2Rules';
import { energyStorageRuleSet } from './energyStorageRules';
import { quantumDotRuleSet } from './quantumDotRules';
import { catalystRuleSet } from './catalystRules';
import { highEntropyAlloyRuleSet } from './highEntropyAlloyRules';
import { zeoliteRuleSet } from './zeoliteRules';
import { conductingPolymerRuleSet } from './conductingPolymerRules';
import { bioImplantsRuleSet } from './bioImplantsRules';
import { superconductorRuleSet } from './superconductorRules';

// ---------------------------------------------------------------------------
// Registry — All Material Rule Sets
// ---------------------------------------------------------------------------

/**
 * Ordered array of all registered MaterialRuleSet implementations.
 * The order determines priority when multiple rule sets match a query.
 * More specific materials should come first.
 */
const ALL_RULE_SETS: MaterialRuleSet[] = [
  tio2RuleSet,
  energyStorageRuleSet,
  quantumDotRuleSet,
  catalystRuleSet,
  highEntropyAlloyRuleSet,
  zeoliteRuleSet,
  conductingPolymerRuleSet,
  bioImplantsRuleSet,
  superconductorRuleSet,
];

/**
 * Primary lookup map: materialId → MaterialRuleSet
 */
const RULE_SET_BY_ID = new Map<string, MaterialRuleSet>();

/**
 * Alias lookup map: lowercase alias → materialId
 */
const ALIAS_TO_ID = new Map<string, string>();

// Build the registry on module load
for (const rs of ALL_RULE_SETS) {
  RULE_SET_BY_ID.set(rs.materialId, rs);
  for (const alias of rs.aliases) {
    ALIAS_TO_ID.set(alias.toLowerCase(), rs.materialId);
  }
  // Also register the formula itself
  ALIAS_TO_ID.set(rs.formula.toLowerCase(), rs.materialId);
}

// ---------------------------------------------------------------------------
// Resolution Functions
// ---------------------------------------------------------------------------

/**
 * Resolve a MaterialRuleSet from a sample formula, alias, or material ID.
 *
 * Resolution strategy (in priority order):
 *   1. Exact materialId match
 *   2. Alias match (case-insensitive)
 *   3. Formula substring match in aliases
 *   4. Undefined (no match found)
 *
 * @param formulaOrId - Sample formula, material ID, or alias string
 * @returns The matching MaterialRuleSet, or undefined if not found
 */
export function resolveMaterialRuleSet(formulaOrId: string): MaterialRuleSet | undefined {
  if (!formulaOrId) return undefined;

  const normalized = formulaOrId.trim();

  // 1. Exact materialId match
  const byId = RULE_SET_BY_ID.get(normalized);
  if (byId) return byId;

  // 2. Alias match (case-insensitive)
  const byAlias = ALIAS_TO_ID.get(normalized.toLowerCase());
  if (byAlias) {
    const rs = RULE_SET_BY_ID.get(byAlias);
    if (rs) return rs;
  }

  // 3. Substring match against all aliases
  const lower = normalized.toLowerCase();
  for (const rs of ALL_RULE_SETS) {
    if (rs.aliases.some((a) => lower.includes(a.toLowerCase()) || a.toLowerCase().includes(lower))) {
      return rs;
    }
    if (lower.includes(rs.formula.toLowerCase()) || rs.formula.toLowerCase().includes(lower)) {
      return rs;
    }
  }

  return undefined;
}

/**
 * Resolve a MaterialRuleSet by material class.
 * Returns all rule sets belonging to the specified class.
 *
 * @param materialClass - The material class to filter by
 * @returns Array of matching MaterialRuleSet implementations
 */
export function resolveByMaterialClass(materialClass: MaterialClass): MaterialRuleSet[] {
  return ALL_RULE_SETS.filter((rs) => rs.materialClass === materialClass);
}

/**
 * Get all registered material IDs.
 */
export function getAllMaterialIds(): string[] {
  return ALL_RULE_SETS.map((rs) => rs.materialId);
}

/**
 * Get the full registry of all rule sets.
 */
export function getAllRuleSets(): readonly MaterialRuleSet[] {
  return ALL_RULE_SETS;
}

/**
 * Get a specific rule set by material ID.
 */
export function getRuleSetById(materialId: string): MaterialRuleSet | undefined {
  return RULE_SET_BY_ID.get(materialId);
}

// ---------------------------------------------------------------------------
// Re-exports — Types & Individual Rule Sets
// ---------------------------------------------------------------------------

// Re-export all types from baseTypes
export type {
  MaterialClass,
  XrdPeakReference,
  XrdPhaseReference,
  RamanModeReference,
  RamanPhaseReference,
  XpsPeakReference,
  XpsMaterialReference,
  FtirBandReference,
  FtirMaterialReference,
  PhaseReference,
  CrossValidationRuleDefinition,
  CrossValidationCondition,
  RecommendationEntry,
  PhaseInferenceResult,
  OxidationStateResult,
  MaterialRuleSet,
} from './baseTypes';

// Re-export individual rule sets
export { tio2RuleSet } from './tio2Rules';
export { energyStorageRuleSet } from './energyStorageRules';
export { quantumDotRuleSet } from './quantumDotRules';
export { catalystRuleSet } from './catalystRules';
export { highEntropyAlloyRuleSet } from './highEntropyAlloyRules';
export { zeoliteRuleSet } from './zeoliteRules';
export { conductingPolymerRuleSet } from './conductingPolymerRules';
export { bioImplantsRuleSet } from './bioImplantsRules';
export { superconductorRuleSet } from './superconductorRules';