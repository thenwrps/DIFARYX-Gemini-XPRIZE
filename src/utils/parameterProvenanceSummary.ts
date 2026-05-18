/**
 * Parameter Provenance Summary Utilities
 * 
 * Helpers for displaying parameter provenance in Notebook and Report.
 */

import type { TechniqueParameterValue, TechniqueWorkspaceId } from '../data/techniqueWorkspaceContent';
import { getTechniqueWorkspaceConfig } from '../data/techniqueWorkspaceContent';

// Re-export for convenience
export type { TechniqueWorkspaceId } from '../data/techniqueWorkspaceContent';
import { readParameterState } from './parameterStateManager';
import type { TechniqueParameterState, ParameterProvenance } from '../types/parameterState';

export interface ChangedParameter {
  id: string;
  label: string;
  defaultValue: TechniqueParameterValue;
  effectiveValue: TechniqueParameterValue;
  provenance: ParameterProvenance;
  unit?: string;
}

export interface ParameterProvenanceSummary {
  technique: TechniqueWorkspaceId;
  techniqueLabel: string;
  hasOverrides: boolean;
  overrideCount: number;
  changedParameters: ChangedParameter[];
  lastUpdatedBy: 'workspace' | 'agent' | 'system';
  lastUpdatedAt: string;
  state: TechniqueParameterState;
}

/**
 * Format parameter value for display
 */
export function formatParameterValueForDisplay(value: TechniqueParameterValue): string {
  if (value === null || value === undefined) {
    return '—';
  }
  
  if (typeof value === 'boolean') {
    return value ? 'Enabled' : 'Disabled';
  }
  
  if (typeof value === 'number') {
    // Format numbers with appropriate precision
    if (Number.isInteger(value)) {
      return value.toString();
    }
    // Scientific notation for very small/large numbers
    if (Math.abs(value) >= 1e6 || (Math.abs(value) < 0.001 && value !== 0)) {
      return value.toExponential(2);
    }
    // Regular decimal for normal range
    return value.toFixed(3).replace(/\.?0+$/, '');
  }
  
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(', ') : 'None';
  }
  
  return String(value);
}

/**
 * Get changed parameters for a technique
 */
export function getChangedParameters(
  projectId: string,
  technique: TechniqueWorkspaceId,
  datasetId?: string
): ChangedParameter[] {
  const state = readParameterState(projectId, technique, datasetId);
  const config = getTechniqueWorkspaceConfig(technique);
  
  if (!config) return [];
  
  const changedParams: ChangedParameter[] = [];
  
  Object.entries(state.overrides).forEach(([parameterId, effectiveValue]) => {
    const control = config.parameters.find(p => p.id === parameterId);
    if (!control) return;
    
    const provenance = state.parameterProvenance[parameterId];
    if (!provenance) return;
    
    changedParams.push({
      id: parameterId,
      label: control.label,
      defaultValue: state.defaultValues[parameterId],
      effectiveValue,
      provenance,
      unit: control.unit,
    });
  });
  
  return changedParams;
}

/**
 * Get parameter provenance summary for a technique
 */
export function getParameterProvenanceSummary(
  projectId: string,
  technique: TechniqueWorkspaceId,
  datasetId?: string
): ParameterProvenanceSummary {
  const state = readParameterState(projectId, technique, datasetId);
  const config = getTechniqueWorkspaceConfig(technique);
  const changedParameters = getChangedParameters(projectId, technique, datasetId);
  
  return {
    technique,
    techniqueLabel: config?.label || technique.toUpperCase(),
    hasOverrides: Object.keys(state.overrides).length > 0,
    overrideCount: Object.keys(state.overrides).length,
    changedParameters,
    lastUpdatedBy: state.lastUpdatedBy,
    lastUpdatedAt: state.updatedAt,
    state,
  };
}

/**
 * Format provenance source for display
 */
export function formatProvenanceSource(source: 'workspace' | 'agent' | 'system'): string {
  switch (source) {
    case 'workspace':
      return 'Workspace';
    case 'agent':
      return 'Agent';
    case 'system':
      return 'System';
    default:
      return 'Unknown';
  }
}

/**
 * Format timestamp for display
 */
export function formatProvenanceTimestamp(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return timestamp;
  }
}

/**
 * Generate markdown for parameter provenance (for notebook export)
 */
export function generateParameterProvenanceMarkdown(
  projectId: string,
  techniques: TechniqueWorkspaceId[]
): string {
  const sections: string[] = [];
  
  sections.push('## Processing Parameters\n');
  
  let hasAnyOverrides = false;
  
  techniques.forEach(technique => {
    const summary = getParameterProvenanceSummary(projectId, technique);
    
    if (summary.hasOverrides) {
      hasAnyOverrides = true;
      sections.push(`### ${summary.techniqueLabel}\n`);
      sections.push(`**Modified Parameters:** ${summary.overrideCount}\n`);
      sections.push(`**Last Updated:** ${formatProvenanceTimestamp(summary.lastUpdatedAt)} by ${formatProvenanceSource(summary.lastUpdatedBy)}\n`);
      sections.push('\n| Parameter | Default | Effective | Updated By | Updated At |');
      sections.push('\n|-----------|---------|-----------|------------|------------|');
      
      summary.changedParameters.forEach(param => {
        const defaultStr = formatParameterValueForDisplay(param.defaultValue);
        const effectiveStr = formatParameterValueForDisplay(param.effectiveValue);
        const unitStr = param.unit ? ` ${param.unit}` : '';
        const updatedBy = formatProvenanceSource(param.provenance.updatedBy);
        const updatedAt = formatProvenanceTimestamp(param.provenance.updatedAt);
        
        sections.push(`\n| ${param.label} | ${defaultStr}${unitStr} | ${effectiveStr}${unitStr} | ${updatedBy} | ${updatedAt} |`);
      });
      
      sections.push('\n');
    }
  });
  
  if (!hasAnyOverrides) {
    sections.push('**Status:** Default processing parameters used for all techniques.\n');
  }
  
  return sections.join('');
}
