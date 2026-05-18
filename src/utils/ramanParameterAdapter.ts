/**
 * Raman Parameter Adapter
 *
 * Converts parameter state effectiveValues to RamanProcessingParams format
 * for use with runRamanProcessing.
 */

import type { RamanProcessingParams } from '../agents/ramanAgent/types';
import type { TechniqueParameterValue } from '../data/techniqueWorkspaceContent';
import { readParameterState } from './parameterStateManager';

/**
 * Convert parameter state effective values to RamanProcessingParams
 */
export function convertToRamanProcessingParams(
  effectiveValues: Record<string, TechniqueParameterValue>
): RamanProcessingParams | undefined {
  const params: RamanProcessingParams = {};
  let hasAnyParams = false;

  // Baseline correction
  const baselineMethod = effectiveValues['baselineMethod'];
  if (baselineMethod === 'Polynomial' || baselineMethod === 'Rubberband' || baselineMethod === 'Linear') {
    params.baselineMethod = baselineMethod as 'Polynomial' | 'Rubberband' | 'Linear';
    hasAnyParams = true;
  }

  const polynomialOrder = effectiveValues['polynomialOrder'];
  if (typeof polynomialOrder === 'number' && polynomialOrder >= 1 && polynomialOrder <= 8) {
    params.polynomialOrder = polynomialOrder;
    hasAnyParams = true;
  }

  // Smoothing
  const smoothingMethod = effectiveValues['smoothingMethod'];
  if (smoothingMethod === 'Moving Average' || smoothingMethod === 'Savitzky-Golay') {
    params.smoothingMethod = smoothingMethod as 'Moving Average' | 'Savitzky-Golay';
    hasAnyParams = true;
  }

  // Peak detection
  const peakThreshold = effectiveValues['peakThreshold'];
  if (typeof peakThreshold === 'number' && peakThreshold >= 0.01 && peakThreshold <= 1) {
    params.peakMinHeight = peakThreshold;
    hasAnyParams = true;
  }

  // Return undefined if no parameters were set (use defaults)
  return hasAnyParams ? params : undefined;
}

/**
 * Get Raman processing params for a project
 */
export function getRamanProcessingParams(
  projectId: string,
  datasetId?: string
): RamanProcessingParams | undefined {
  const paramState = readParameterState(projectId, 'raman', datasetId);
  return convertToRamanProcessingParams(paramState.effectiveValues);
}

/**
 * Get parameter snapshot for logging/provenance
 */
export interface RamanParameterSnapshot {
  projectId: string;
  technique: 'raman';
  datasetId?: string;
  effectiveValues: Record<string, TechniqueParameterValue>;
  processingParams: RamanProcessingParams | undefined;
  hasOverrides: boolean;
  overrideCount: number;
  lastUpdatedBy: 'workspace' | 'agent' | 'system';
  updatedAt: string;
  version: number;
}

export function getRamanParameterSnapshot(
  projectId: string,
  datasetId?: string
): RamanParameterSnapshot {
  const paramState = readParameterState(projectId, 'raman', datasetId);
  const processingParams = convertToRamanProcessingParams(paramState.effectiveValues);

  return {
    projectId,
    technique: 'raman',
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
