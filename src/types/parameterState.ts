/**
 * Parameter State Type Definitions
 * 
 * Single source of truth for technique processing parameters.
 * Shared between Workspace and Agent.
 */

import type { TechniqueParameterValue } from '../data/techniqueWorkspaceContent';
import type { CanonicalParameterContext } from '../data/parameterDefinitions';

export type ParameterSource = 'workspace' | 'agent' | 'system';
export type ParameterProvenanceSource = 'default' | 'user-adjusted' | 'agent-optimized' | 'locked';

/**
 * Provenance information for a single parameter
 */
export interface ParameterProvenance {
  source: ParameterProvenanceSource;
  updatedBy: ParameterSource;
  updatedAt: string;
  previousValue?: TechniqueParameterValue;
  scientificImpact?: string;
}

/**
 * Unified parameter state for a technique
 * Scoped by projectId + technique + optional datasetId/sessionId
 */
export interface TechniqueParameterState {
  // Scoping
  projectId: string;
  technique: 'xrd' | 'xps' | 'ftir' | 'raman';
  datasetId?: string;
  sessionId?: string;
  
  // Parameter values
  defaultValues: Record<string, TechniqueParameterValue>;
  overrides: Record<string, TechniqueParameterValue>;
  effectiveValues: Record<string, TechniqueParameterValue>;
  
  // Provenance
  lastUpdatedBy: ParameterSource;
  updatedAt: string;
  parameterProvenance: Record<string, ParameterProvenance>;
  
  // Processing state
  dirty: boolean;
  processingRequired: boolean;
  affectedStepIds: string[];
  
  // Version tracking
  version: number;

  /** Authoritative v3 context consumed by both Workspace and Agent. */
  schemaVersion: string;
  canonicalContext: CanonicalParameterContext;
}

/**
 * Legacy v1 override format for migration
 */
export interface LegacyParameterOverrides {
  [parameterLabel: string]: TechniqueParameterValue;
}
