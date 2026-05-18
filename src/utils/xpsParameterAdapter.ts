/**
 * XPS Parameter Adapter
 *
 * Converts parameter state effectiveValues to XpsProcessingParams format
 * for use with runXpsProcessing.
 */

import type { XpsProcessingParams } from '../agents/xpsAgent/runner';
import type { TechniqueParameterValue } from '../data/techniqueWorkspaceContent';
import { readParameterState } from './parameterStateManager';

/**
 * Convert parameter state effective values to XpsProcessingParams
 */
export function convertToXpsProcessingParams(
  effectiveValues: Record<string, TechniqueParameterValue>
): XpsProcessingParams | undefined {
  const params: XpsProcessingParams = {};
  let hasAnyParams = false;

  // Energy calibration
  const energyCalRef = effectiveValues['energyCalibrationReference'];
  if (energyCalRef === 'C 1s 284.8 eV') {
    params.energyShift = 0; // Default C 1s reference
    hasAnyParams = true;
  } else if (energyCalRef === 'Au 4f7/2') {
    params.energyShift = -200.2; // Au 4f7/2 at 84.0 eV vs C 1s at 284.8 eV
    hasAnyParams = true;
  }

  // Background subtraction
  const backgroundMethod = effectiveValues['backgroundMethod'];
  if (backgroundMethod === 'Shirley' || backgroundMethod === 'Tougaard' || backgroundMethod === 'Linear') {
    params.backgroundMethod = backgroundMethod as 'Shirley' | 'Tougaard' | 'Linear';
    hasAnyParams = true;
  }

  // Smoothing (XPS uses smoothingWindowSize, not method)
  // Workspace has smoothingMethod but agent uses smoothingWindowSize
  // Map method to window size: Savitzky-Golay -> 5, Moving Average -> 3
  const smoothingMethod = effectiveValues['smoothingMethod'];
  if (smoothingMethod === 'Savitzky-Golay') {
    params.smoothingWindowSize = 5;
    hasAnyParams = true;
  } else if (smoothingMethod === 'Moving Average') {
    params.smoothingWindowSize = 3;
    hasAnyParams = true;
  }

  // Peak model
  const peakModel = effectiveValues['peakModel'];
  if (peakModel === 'Gaussian-Lorentzian') {
    params.peakModel = 'Pseudo-Voigt'; // Map to closest available
    hasAnyParams = true;
  } else if (peakModel === 'Gaussian') {
    params.peakModel = 'Gaussian';
    hasAnyParams = true;
  } else if (peakModel === 'Voigt') {
    params.peakModel = 'Pseudo-Voigt';
    hasAnyParams = true;
  }

  // Charge correction (not in XpsProcessingParams, skip for now)

  // Return undefined if no parameters were set (use defaults)
  return hasAnyParams ? params : undefined;
}

/**
 * Get XPS processing params for a project
 */
export function getXpsProcessingParams(
  projectId: string,
  datasetId?: string
): XpsProcessingParams | undefined {
  const paramState = readParameterState(projectId, 'xps', datasetId);
  return convertToXpsProcessingParams(paramState.effectiveValues);
}

/**
 * Get parameter snapshot for logging/provenance
 */
export interface XpsParameterSnapshot {
  projectId: string;
  technique: 'xps';
  datasetId?: string;
  effectiveValues: Record<string, TechniqueParameterValue>;
  processingParams: XpsProcessingParams | undefined;
  hasOverrides: boolean;
  overrideCount: number;
  lastUpdatedBy: 'workspace' | 'agent' | 'system';
  updatedAt: string;
  version: number;
}

export function getXpsParameterSnapshot(
  projectId: string,
  datasetId?: string
): XpsParameterSnapshot {
  const paramState = readParameterState(projectId, 'xps', datasetId);
  const processingParams = convertToXpsProcessingParams(paramState.effectiveValues);

  return {
    projectId,
    technique: 'xps',
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
