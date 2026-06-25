/**
 * FTIR Parameter Adapter
 *
 * Converts parameter state effectiveValues to FtirProcessingParams format
 * for use with runFtirProcessing.
 */

import type { FtirProcessingParams } from '../agents/ftirAgent/types';
import type { TechniqueParameterValue } from '../data/techniqueWorkspaceContent';
import { readParameterState } from './parameterStateManager';

/**
 * Convert parameter state effective values to FtirProcessingParams
 */
export function convertToFtirProcessingParams(
  effectiveValues: Record<string, TechniqueParameterValue>
): FtirProcessingParams | undefined {
  const params: FtirProcessingParams = {};
  let hasAnyParams = false;

  // Baseline correction
  const baselineMethod = effectiveValues['baselineMethod'];
  if (baselineMethod === 'Rubberband' || baselineMethod === 'ALS' || baselineMethod === 'Polynomial' || baselineMethod === 'None') {
    params.baselineMethod = baselineMethod as any;
    hasAnyParams = true;
  }

  // Smoothing
  const smoothingMethod = effectiveValues['smoothingMethod'];
  if (smoothingMethod === 'Savitzky-Golay' || smoothingMethod === 'Moving Average') {
    params.smoothingMethod = smoothingMethod as 'Savitzky-Golay' | 'Moving Average';
    hasAnyParams = true;
  }

  // Band detection
  const bandThreshold = effectiveValues['bandThreshold'];
  if (typeof bandThreshold === 'number' && bandThreshold >= 0.01 && bandThreshold <= 1) {
    params.bandMinHeight = bandThreshold;
    hasAnyParams = true;
  }

  // Wavenumber range (affects baseline and band detection)
  const wavenumberMin = effectiveValues['wavenumberMin'];
  const wavenumberMax = effectiveValues['wavenumberMax'];
  if (typeof wavenumberMin === 'number' && typeof wavenumberMax === 'number') {
    // Store for reference but FTIR agent doesn't have explicit range params
    // This would affect the input data filtering
    hasAnyParams = true;
  }

  // Return undefined if no parameters were set (use defaults)
  return hasAnyParams ? params : undefined;
}

/**
 * Get FTIR processing params for a project
 */
export function getFtirProcessingParams(
  projectId: string,
  datasetId?: string
): FtirProcessingParams | undefined {
  const paramState = readParameterState(projectId, 'ftir', datasetId);
  return convertToFtirProcessingParams(paramState.effectiveValues);
}

/**
 * Get parameter snapshot for logging/provenance
 */
export interface FtirParameterSnapshot {
  projectId: string;
  technique: 'ftir';
  datasetId?: string;
  effectiveValues: Record<string, TechniqueParameterValue>;
  processingParams: FtirProcessingParams | undefined;
  hasOverrides: boolean;
  overrideCount: number;
  lastUpdatedBy: 'workspace' | 'agent' | 'system';
  updatedAt: string;
  version: number;
}

export function getFtirParameterSnapshot(
  projectId: string,
  datasetId?: string
): FtirParameterSnapshot {
  const paramState = readParameterState(projectId, 'ftir', datasetId);
  const processingParams = convertToFtirProcessingParams(paramState.effectiveValues);

  return {
    projectId,
    technique: 'ftir',
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
