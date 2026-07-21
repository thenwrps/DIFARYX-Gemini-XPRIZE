/**
 * Parameter State Manager
 * 
 * Single source of truth for technique processing parameters.
 * Manages state persistence, migration, and cross-tab sync.
 */

import type { TechniqueParameterValue, TechniqueWorkspaceId } from '../data/techniqueWorkspaceContent';
import {
  PARAMETER_SCHEMA_VERSION,
  createCanonicalParameterContext,
  getCanonicalDefaultValues,
  getCanonicalParameterDefinitions,
  getWorkspaceParameterControls,
  migrateLegacyParameterValues,
  type CanonicalParameterValue,
  type ParameterSource as CanonicalParameterSource,
} from '../data/parameterDefinitions';
import type {
  TechniqueParameterState,
  ParameterSource,
  ParameterProvenance,
  LegacyParameterOverrides,
} from '../types/parameterState';

const STORAGE_PREFIX_V3 = 'difaryx-canonical-parameter-context:v3';
const STORAGE_PREFIX_V2 = 'difaryx-parameter-state:v2';
const STORAGE_PREFIX_V1 = 'difaryx-workspace-parameter-overrides:v1';

/**
 * Check if localStorage is available
 */
function canUseLocalStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

/**
 * Get storage key for parameter state
 */
export function getParameterStateStorageKey(
  projectId: string,
  technique: 'xrd' | 'xps' | 'ftir' | 'raman',
  datasetId?: string,
  sessionId?: string
): string {
  const base = `${STORAGE_PREFIX_V3}:${projectId}:${technique}`;
  if (datasetId) return `${base}:${datasetId}`;
  if (sessionId) return `${base}:session:${sessionId}`;
  return base;
}

/**
 * Mark parameter state as clean (processing completed)
 */
export function markParameterStateClean(
  projectId: string,
  technique: 'xrd' | 'xps' | 'ftir' | 'raman',
  datasetId?: string,
  sessionId?: string
): TechniqueParameterState {
  const state = readParameterState(projectId, technique, datasetId, sessionId);
  
  if (!state.dirty && !state.processingRequired) {
    return state; // Already clean
  }
  
  const updatedState: TechniqueParameterState = {
    ...state,
    dirty: false,
    processingRequired: false,
    affectedStepIds: [],
    version: state.version + 1,
  };
  
  writeParameterState(updatedState);
  return updatedState;
}

/**
 * Get v1 storage key for legacy overrides
 */
function getStorageKeyV1(projectId: string, technique: TechniqueWorkspaceId): string {
  return `${STORAGE_PREFIX_V1}:${projectId}:${technique}`;
}

/**
 * Get default values for a technique from workspace config
 */
function getDefaultValues(technique: TechniqueWorkspaceId): Record<string, TechniqueParameterValue> {
  const values = getCanonicalDefaultValues(technique, { workspaceOnly: true });
  return Object.fromEntries(
    Object.entries(values).filter((entry): entry is [string, TechniqueParameterValue] => entry[1] !== null),
  );
}

function canonicalSource(source: ParameterSource): CanonicalParameterSource {
  if (source === 'workspace') return 'user';
  if (source === 'agent') return 'agent_inferred';
  return 'system_default';
}

function coerceParameterValue(
  technique: TechniqueWorkspaceId,
  parameterId: string,
  value: TechniqueParameterValue,
): TechniqueParameterValue {
  const definition = getCanonicalParameterDefinitions(technique).find((item) => item.id === parameterId);
  if (!definition) return value;
  if (definition.type === 'number' && typeof value === 'string' && value.trim() !== '') {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : value;
  }
  if (definition.type === 'boolean' && typeof value === 'string') {
    if (value === 'true') return true;
    if (value === 'false') return false;
  }
  if (definition.type === 'multi_select' && typeof value === 'string') {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }
  return value;
}

function buildCanonicalContext(
  technique: TechniqueWorkspaceId,
  datasetId: string | undefined,
  values: Record<string, TechniqueParameterValue>,
  source: ParameterSource,
  migratedFrom?: string,
) {
  return createCanonicalParameterContext(technique, {
    datasetId: datasetId ?? 'unscoped-dataset',
    values: values as Record<string, CanonicalParameterValue>,
    sources: Object.fromEntries(Object.keys(values).map((id) => [id, canonicalSource(source)])),
    migratedFrom,
  });
}

function synchronizeCanonicalContext(state: TechniqueParameterState) {
  const sources = Object.fromEntries(
    Object.keys(state.effectiveValues).map((id) => [
      id,
      Object.prototype.hasOwnProperty.call(state.overrides, id)
        ? canonicalSource(state.parameterProvenance[id]?.updatedBy ?? state.lastUpdatedBy)
        : 'system_default',
    ]),
  ) as Record<string, CanonicalParameterSource>;
  return createCanonicalParameterContext(state.technique, {
    datasetId: state.datasetId ?? state.canonicalContext?.datasetId ?? 'unscoped-dataset',
    sourceFiles: state.canonicalContext?.sourceFiles ?? [],
    values: state.effectiveValues as Record<string, CanonicalParameterValue>,
    sources,
    analysisMode: state.canonicalContext?.analysisMode.id ?? 'scientific-baseline',
    now: state.updatedAt,
    migratedFrom: state.canonicalContext?.provenance.migratedFrom,
    processingProfileVersion: state.canonicalContext?.provenance.processingProfileVersion,
    referenceSnapshotVersion: state.canonicalContext?.provenance.referenceSnapshotVersion,
  });
}

/**
 * Migrate v1 overrides to v2 state
 */
function migrateV1ToV2(
  projectId: string,
  technique: TechniqueWorkspaceId,
  datasetId?: string
): TechniqueParameterState | null {
  if (!canUseLocalStorage()) return null;
  
  const v1Key = getStorageKeyV1(projectId, technique);
  const v1Data = window.localStorage.getItem(v1Key);
  
  if (!v1Data) return null;
  
  try {
    const v1Overrides: LegacyParameterOverrides = JSON.parse(v1Data);
    const defaultValues = getDefaultValues(technique);
    const controls = getWorkspaceParameterControls(technique);
    
    // Map v1 label-based overrides to v2 id-based overrides
    const overrides: Record<string, TechniqueParameterValue> = {};
    const parameterProvenance: Record<string, ParameterProvenance> = {};
    const now = new Date().toISOString();
    
    Object.entries(v1Overrides).forEach(([label, value]) => {
      // Find control by label
      const control = controls.find(p => p.label === label || p.label.replace(' (Not active)', '') === label);
      if (control) {
        overrides[control.id] = value;
        parameterProvenance[control.id] = {
          source: 'user-adjusted',
          updatedBy: 'workspace',
          updatedAt: now,
        };
      }
    });
    
    const effectiveValues = { ...defaultValues, ...overrides };
    
    const state: TechniqueParameterState = {
      projectId,
      technique,
      datasetId,
      defaultValues,
      overrides,
      effectiveValues,
      lastUpdatedBy: 'workspace',
      updatedAt: now,
      parameterProvenance,
      dirty: false,
      processingRequired: false,
      affectedStepIds: [],
      version: 1,
      schemaVersion: PARAMETER_SCHEMA_VERSION,
      canonicalContext: buildCanonicalContext(technique, datasetId, effectiveValues, 'workspace', 'workspace-overrides-v1'),
    };
    
    return state;
  } catch (error) {
    console.warn(`Failed to migrate v1 overrides for ${technique}:`, error);
    return null;
  }
}

/**
 * Create initial parameter state
 */
function createInitialState(
  projectId: string,
  technique: TechniqueWorkspaceId,
  datasetId?: string
): TechniqueParameterState {
  const defaultValues = getDefaultValues(technique);
  const canonicalContext = buildCanonicalContext(technique, datasetId, defaultValues, 'system');
  
  return {
    projectId,
    technique,
    datasetId,
    defaultValues,
    overrides: {},
    effectiveValues: { ...defaultValues },
    lastUpdatedBy: 'system',
    updatedAt: new Date().toISOString(),
    parameterProvenance: {},
    dirty: false,
    processingRequired: false,
    affectedStepIds: [],
    version: 1,
    schemaVersion: PARAMETER_SCHEMA_VERSION,
    canonicalContext,
  };
}

function getV2StorageKey(
  projectId: string,
  technique: TechniqueWorkspaceId,
  datasetId?: string,
  sessionId?: string,
): string {
  const base = `${STORAGE_PREFIX_V2}:${projectId}:${technique}`;
  if (datasetId) return `${base}:${datasetId}`;
  if (sessionId) return `${base}:session:${sessionId}`;
  return base;
}

function migrateV2State(
  state: Partial<TechniqueParameterState>,
  projectId: string,
  technique: TechniqueWorkspaceId,
  datasetId?: string,
  sessionId?: string,
): TechniqueParameterState {
  const defaultValues = getDefaultValues(technique);
  const overrides = migrateLegacyParameterValues(technique, state.overrides ?? {}) as Record<string, TechniqueParameterValue>;
  const effectiveValues = { ...defaultValues, ...overrides };
  const updatedAt = state.updatedAt ?? new Date().toISOString();
  return {
    projectId,
    technique,
    datasetId,
    sessionId,
    defaultValues,
    overrides,
    effectiveValues,
    lastUpdatedBy: state.lastUpdatedBy ?? 'system',
    updatedAt,
    parameterProvenance: state.parameterProvenance ?? {},
    dirty: state.dirty ?? false,
    processingRequired: state.processingRequired ?? false,
    affectedStepIds: state.affectedStepIds ?? [],
    version: (state.version ?? 0) + 1,
    schemaVersion: PARAMETER_SCHEMA_VERSION,
    canonicalContext: buildCanonicalContext(technique, datasetId, effectiveValues, state.lastUpdatedBy ?? 'system', 'parameter-state-v2'),
  };
}

/**
 * Read parameter state from localStorage
 */
export function readParameterState(
  projectId: string,
  technique: TechniqueWorkspaceId,
  datasetId?: string,
  sessionId?: string
): TechniqueParameterState {
  if (!canUseLocalStorage()) {
    return createInitialState(projectId, technique, datasetId);
  }
  
  const key = getParameterStateStorageKey(projectId, technique, datasetId, sessionId);
  const data = window.localStorage.getItem(key);
  
  // Try to read v2 state
  if (data) {
    try {
      const parsed: Partial<TechniqueParameterState> = JSON.parse(data);
      const state = parsed.schemaVersion === PARAMETER_SCHEMA_VERSION && parsed.canonicalContext
        ? parsed as TechniqueParameterState
        : migrateV2State(parsed, projectId, technique, datasetId, sessionId);
      
      // Ensure effectiveValues is up to date
      const defaultValues = getDefaultValues(technique);
      state.defaultValues = defaultValues;
      state.effectiveValues = { ...defaultValues, ...state.overrides };
      state.canonicalContext = synchronizeCanonicalContext(state);
      
      return state;
    } catch (error) {
      console.warn(`Failed to parse v2 state for ${technique}:`, error);
    }
  }

  const v2Data = window.localStorage.getItem(getV2StorageKey(projectId, technique, datasetId, sessionId));
  if (v2Data) {
    try {
      const migrated = migrateV2State(JSON.parse(v2Data), projectId, technique, datasetId, sessionId);
      writeParameterState(migrated);
      return migrated;
    } catch (error) {
      console.warn(`Failed to migrate v2 parameter state for ${technique}:`, error);
    }
  }
  
  // Try to migrate from v1
  const migratedState = migrateV1ToV2(projectId, technique, datasetId);
  if (migratedState) {
    // Save migrated state
    writeParameterState(migratedState);
    return migratedState;
  }
  
  // Create new state
  return createInitialState(projectId, technique, datasetId);
}

/**
 * Write parameter state to localStorage
 */
export function writeParameterState(state: TechniqueParameterState): void {
  if (!canUseLocalStorage()) return;
  
  const key = getParameterStateStorageKey(state.projectId, state.technique, state.datasetId, state.sessionId);
  
  try {
    state.schemaVersion = PARAMETER_SCHEMA_VERSION;
    state.canonicalContext = synchronizeCanonicalContext(state);
    window.localStorage.setItem(key, JSON.stringify(state));
  } catch (error) {
    console.warn(`Failed to write parameter state for ${state.technique}:`, error);
  }
}

/**
 * Parameter Change History Entry Interface
 */
export interface ParameterHistoryEntry {
  timestamp: string;
  parameter: string;
  oldValue: unknown;
  newValue: unknown;
}

/**
 * Log parameter changes to history list in localStorage (capped at 50 entries)
 */
export function logParameterChange(
  projectId: string,
  technique: string,
  parameter: string,
  oldValue: unknown,
  newValue: unknown
): void {
  // Prevent logging if values are equal (deep compare arrays or primitives)
  if (oldValue === newValue || JSON.stringify(oldValue) === JSON.stringify(newValue)) return;
  if (!canUseLocalStorage()) return;

  const key = `difaryx-parameter-history-v1:${projectId}:${technique}`;
  try {
    const raw = window.localStorage.getItem(key);
    let history: ParameterHistoryEntry[] = [];
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) history = parsed;
    }

    history.unshift({
      timestamp: new Date().toISOString(),
      parameter,
      oldValue,
      newValue,
    });

    if (history.length > 50) {
      history = history.slice(0, 50);
    }

    window.localStorage.setItem(key, JSON.stringify(history));
  } catch (error) {
    console.warn('Failed to log parameter change:', error);
  }
}

/**
 * Read parameter history log from localStorage
 */
export function readParameterHistory(projectId: string, technique: string): ParameterHistoryEntry[] {
  if (!canUseLocalStorage()) return [];
  const key = `difaryx-parameter-history-v1:${projectId}:${technique}`;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const validated = parsed.filter((entry: any) => {
      return (
        entry &&
        typeof entry === 'object' &&
        entry.parameter &&
        entry.timestamp &&
        !isNaN(Date.parse(entry.timestamp))
      );
    });

    // Sort chronologically (latest first)
    return validated.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  } catch {
    return [];
  }
}

/**
 * Set a parameter override
 */
export function setParameterOverride(
  projectId: string,
  technique: TechniqueWorkspaceId,
  parameterId: string,
  value: TechniqueParameterValue,
  source: ParameterSource,
  scientificImpact?: string,
  datasetId?: string
): TechniqueParameterState {
  value = coerceParameterValue(technique, parameterId, value);
  const state = readParameterState(projectId, technique, datasetId);
  const now = new Date().toISOString();
  const controls = getWorkspaceParameterControls(technique, {
    ...state.effectiveValues,
    [parameterId]: value,
  });
  
  // Get previous value
  const previousValue = state.effectiveValues[parameterId];
  
  // Log change
  logParameterChange(projectId, technique, parameterId, previousValue, value);

  // Update overrides
  if (value === state.defaultValues[parameterId]) {
    // Value matches default, remove override
    delete state.overrides[parameterId];
    delete state.parameterProvenance[parameterId];
  } else {
    // Set override
    state.overrides[parameterId] = value;
    state.parameterProvenance[parameterId] = {
      source: 'user-adjusted',
      updatedBy: source,
      updatedAt: now,
      previousValue,
      scientificImpact,
    };
  }
  
  // Update effective values
  state.effectiveValues = { ...state.defaultValues, ...state.overrides };
  
  // Update metadata
  state.lastUpdatedBy = source;
  state.updatedAt = now;
  state.dirty = true;
  state.processingRequired = false;
  
  // Get affected step IDs
  const control = controls.find(p => p.id === parameterId);
  if (control?.active) {
    state.affectedStepIds = control.affectedStepIds;
    state.processingRequired = true;
  } else {
    state.affectedStepIds = [];
  }
  
  state.version += 1;
  
  writeParameterState(state);
  return state;
}

/**
 * Set multiple parameter overrides
 */
export function setParameterOverrides(
  projectId: string,
  technique: TechniqueWorkspaceId,
  overrides: Record<string, TechniqueParameterValue>,
  source: ParameterSource,
  datasetId?: string
): TechniqueParameterState {
  const state = readParameterState(projectId, technique, datasetId);
  const now = new Date().toISOString();
  const controls = getWorkspaceParameterControls(technique, {
    ...state.effectiveValues,
    ...overrides,
  });
  const affectedStepIds = new Set<string>();
  
  Object.entries(overrides).forEach(([parameterId, value]) => {
    value = coerceParameterValue(technique, parameterId, value);
    const previousValue = state.effectiveValues[parameterId];
    
    // Log change
    logParameterChange(projectId, technique, parameterId, previousValue, value);

    if (value === state.defaultValues[parameterId]) {
      delete state.overrides[parameterId];
      delete state.parameterProvenance[parameterId];
    } else {
      state.overrides[parameterId] = value;
      state.parameterProvenance[parameterId] = {
        source: 'user-adjusted',
        updatedBy: source,
        updatedAt: now,
        previousValue,
      };
    }
    
    // Collect affected step IDs
    const control = controls.find(p => p.id === parameterId);
    if (control?.active) {
      control.affectedStepIds.forEach(id => affectedStepIds.add(id));
    }
  });
  
  state.effectiveValues = { ...state.defaultValues, ...state.overrides };
  state.lastUpdatedBy = source;
  state.updatedAt = now;
  state.dirty = true;
  state.processingRequired = affectedStepIds.size > 0;
  state.affectedStepIds = Array.from(affectedStepIds);
  state.version += 1;
  
  writeParameterState(state);
  return state;
}

/**
 * Reset parameters to defaults
 */
export function resetParameters(
  projectId: string,
  technique: TechniqueWorkspaceId,
  datasetId?: string
): TechniqueParameterState {
  const state = readParameterState(projectId, technique, datasetId);
  
  // Log change
  logParameterChange(projectId, technique, 'all_parameters', 'overridden_values', 'reset_to_defaults');

  state.overrides = {};
  state.effectiveValues = { ...state.defaultValues };
  state.parameterProvenance = {};
  state.lastUpdatedBy = 'system';
  state.updatedAt = new Date().toISOString();
  state.dirty = false;
  state.processingRequired = false;
  state.affectedStepIds = [];
  state.version += 1;
  
  writeParameterState(state);
  return state;
}

/**
 * Clear parameter override for a specific parameter
 */
export function clearParameterOverride(
  projectId: string,
  technique: TechniqueWorkspaceId,
  parameterId: string,
  datasetId?: string
): TechniqueParameterState {
  const state = readParameterState(projectId, technique, datasetId);
  
  delete state.overrides[parameterId];
  delete state.parameterProvenance[parameterId];
  state.effectiveValues = { ...state.defaultValues, ...state.overrides };
  state.lastUpdatedBy = 'system';
  state.updatedAt = new Date().toISOString();
  state.version += 1;
  
  writeParameterState(state);
  return state;
}

/**
 * Get parameter provenance
 */
export function getParameterProvenance(
  projectId: string,
  technique: TechniqueWorkspaceId,
  parameterId: string,
  datasetId?: string
): ParameterProvenance | null {
  const state = readParameterState(projectId, technique, datasetId);
  return state.parameterProvenance[parameterId] || null;
}

/**
 * Mark state as dirty or clean
 */
export function markDirty(
  projectId: string,
  technique: TechniqueWorkspaceId,
  dirty: boolean,
  datasetId?: string
): TechniqueParameterState {
  const state = readParameterState(projectId, technique, datasetId);
  state.dirty = dirty;
  if (!dirty) {
    state.processingRequired = false;
  }
  writeParameterState(state);
  return state;
}

