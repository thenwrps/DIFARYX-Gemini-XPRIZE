/**
 * XRD Parameter Adapter
 *
 * Converts parameter state effectiveValues to XrdProcessingParams format
 * for use with runXrdPhaseIdentificationAgent.
 */

import type { XrdProcessingParams } from '../agents/xrdAgent/runner';
import type { TechniqueParameterValue } from '../data/techniqueWorkspaceContent';
import { readParameterState } from './parameterStateManager';

/**
 * Convert parameter state effective values to XrdProcessingParams
 */
export function convertToXrdProcessingParams(
  effectiveValues: Record<string, TechniqueParameterValue>
): XrdProcessingParams | undefined {
  const params: XrdProcessingParams = {};
  let hasAnyParams = false;

  // Smoothing parameters
  const smoothingWindowSize = effectiveValues['smoothing_window_size'];
  if (typeof smoothingWindowSize === 'number' && smoothingWindowSize >= 3 && smoothingWindowSize <= 21) {
    // Convert window_size to radius (window_size = 2*radius + 1)
    params.smoothingRadius = Math.floor(smoothingWindowSize / 2);
    hasAnyParams = true;
  }

  // Baseline correction parameters
  const baselineMethod = effectiveValues['baseline_method'];
  const baselineLambda = effectiveValues['baseline_lambda'];

  if (baselineMethod === 'ALS' && typeof baselineLambda === 'number' && baselineLambda >= 1e2 && baselineLambda <= 1e9) {
    // Map lambda to fraction: higher lambda -> higher fraction (less removal)
    // lambda range: 1e2 to 1e9, fraction range: 0.05 to 0.3
    const logLambda = Math.log10(baselineLambda);
    const baselineFraction = Math.max(0.05, Math.min(0.3, 0.05 + (logLambda - 2) / (9 - 2) * (0.3 - 0.05)));
    params.baselineFraction = baselineFraction;
    // Keep default radius for now
    params.baselineRadius = 42;
    hasAnyParams = true;
  }

  // Peak detection parameters
  const minHeight = effectiveValues['peak_min_height'];
  if (typeof minHeight === 'number' && minHeight >= 0) {
    params.minHeight = minHeight;
    hasAnyParams = true;
  }

  const minProminence = effectiveValues['peak_min_prominence'];
  if (typeof minProminence === 'number' && minProminence >= 0) {
    params.minProminence = minProminence;
    hasAnyParams = true;
  }

  // Return undefined if no parameters were set (use defaults)
  return hasAnyParams ? params : undefined;
}

/**
 * Get XRD processing params for a project
 */
export function getXrdProcessingParams(
  projectId: string,
  datasetId?: string
): XrdProcessingParams | undefined {
  const paramState = readParameterState(projectId, 'xrd', datasetId);
  return convertToXrdProcessingParams(paramState.effectiveValues);
}

/**
 * Get parameter snapshot for logging/provenance
 */
export interface XrdParameterSnapshot {
  projectId: string;
  technique: 'xrd';
  datasetId?: string;
  effectiveValues: Record<string, TechniqueParameterValue>;
  processingParams: XrdProcessingParams | undefined;
  hasOverrides: boolean;
  overrideCount: number;
  lastUpdatedBy: 'workspace' | 'agent' | 'system';
  updatedAt: string;
  version: number;
}

export function getXrdParameterSnapshot(
  projectId: string,
  datasetId?: string
): XrdParameterSnapshot {
  const paramState = readParameterState(projectId, 'xrd', datasetId);
  const processingParams = convertToXrdProcessingParams(paramState.effectiveValues);

  return {
    projectId,
    technique: 'xrd',
    datasetId,
    effectiveValues: paramState.effectiveValues,
    processingParams,
    hasOverrides: Object.keys(paramState.overrides).length > 0,
    overrideCount: Object.keys(paramState.overrides).length,
    lastUpdatedBy: paramState.lastUpdatedBy,
    updatedAt: paramState.updatedAt,
    version: paramState.version,
  };
}
