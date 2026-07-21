/**
 * Compatibility facade for the legacy Agent parameter editor.
 *
 * Workspace and Agent now read/write the same canonical v3 parameter state.
 * These functions retain the old call signatures while delegating persistence
 * to parameterStateManager.
 */

import type { Technique } from '../data/demoProjects';
import type { TechniqueParameterValue, TechniqueWorkspaceId } from '../data/techniqueWorkspaceContent';
import type { ParameterGroupId } from './projectEvidence';
import type { WorkspaceParameters } from './agentContext';
import {
  getParameterStateStorageKey,
  readParameterState,
  resetParameters,
  setParameterOverrides,
} from './parameterStateManager';

export type ParameterOverrideValue = TechniqueParameterValue | string;
export type ParameterOverrideMap = Record<string, ParameterOverrideValue>;

function normalizeTechniqueKey(
  technique: Technique | TechniqueWorkspaceId | ParameterGroupId,
): TechniqueWorkspaceId | null {
  const value = String(technique).toLowerCase();
  return value === 'xrd' || value === 'xps' || value === 'ftir' || value === 'raman' ? value : null;
}

export function getParameterOverrideStorageKey(
  projectId: string,
  technique: Technique | TechniqueWorkspaceId | ParameterGroupId,
) {
  const techniqueKey = normalizeTechniqueKey(technique);
  return techniqueKey ? getParameterStateStorageKey(projectId, techniqueKey) : null;
}

export function readTechniqueParameterOverrides(
  projectId: string,
  technique: Technique | TechniqueWorkspaceId | ParameterGroupId,
): ParameterOverrideMap {
  const techniqueKey = normalizeTechniqueKey(technique);
  if (!techniqueKey) return {};
  return { ...readParameterState(projectId, techniqueKey).overrides };
}

export function writeTechniqueParameterOverrides(
  projectId: string,
  technique: Technique | TechniqueWorkspaceId | ParameterGroupId,
  overrides: ParameterOverrideMap,
) {
  const techniqueKey = normalizeTechniqueKey(technique);
  if (!techniqueKey) return;
  const cleaned = Object.fromEntries(
    Object.entries(overrides).filter(([, value]) => value !== undefined && value !== ''),
  ) as Record<string, TechniqueParameterValue>;
  resetParameters(projectId, techniqueKey);
  if (Object.keys(cleaned).length > 0) {
    setParameterOverrides(projectId, techniqueKey, cleaned, 'workspace');
  }
}

export function clearTechniqueParameterOverrides(
  projectId: string,
  technique: Technique | TechniqueWorkspaceId | ParameterGroupId,
) {
  const techniqueKey = normalizeTechniqueKey(technique);
  if (techniqueKey) resetParameters(projectId, techniqueKey);
}

export function readProjectWorkspaceParameters(projectId: string, techniques: Technique[]): WorkspaceParameters {
  return techniques.reduce<WorkspaceParameters>((acc, technique) => {
    const techniqueKey = normalizeTechniqueKey(technique);
    if (!techniqueKey) return acc;
    const overrides = readParameterState(projectId, techniqueKey).overrides;
    if (Object.keys(overrides).length > 0) {
      acc[technique as ParameterGroupId] = Object.fromEntries(
        Object.entries(overrides).map(([key, value]) => [key, String(value)]),
      );
    }
    return acc;
  }, {});
}

export function writeProjectWorkspaceParameters(projectId: string, parameters: WorkspaceParameters) {
  (Object.keys(parameters) as ParameterGroupId[]).forEach((groupId) => {
    writeTechniqueParameterOverrides(projectId, groupId, parameters[groupId] ?? {});
  });
}

export function clearProjectWorkspaceParameters(projectId: string, techniques: Technique[]) {
  techniques.forEach((technique) => clearTechniqueParameterOverrides(projectId, technique));
}
