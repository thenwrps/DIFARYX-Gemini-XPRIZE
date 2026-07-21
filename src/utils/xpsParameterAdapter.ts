/**
 * XPS Parameter Adapter
 *
 * Converts parameter state effectiveValues to XpsProcessingParams format
 * for use with runXpsProcessing.
 */

import type { XpsProcessingParams } from '../agents/xpsAgent/runner';
import type { TechniqueParameterValue } from '../data/techniqueWorkspaceContent';
import { readParameterState } from './parameterStateManager';
import { getCalibrationShift, getCalibrationStandardById } from '../data/xpsReferenceData';

/**
 * Convert parameter state effective values to XpsProcessingParams
 */
export function convertToXpsProcessingParams(
  effectiveValues: Record<string, TechniqueParameterValue>
): XpsProcessingParams | undefined {
  const params: XpsProcessingParams = {};
  let hasAnyParams = false;

  // Energy calibration — data-driven from canonical XPS_CALIBRATION_STANDARDS
  // (single source of truth). Accepts either the standard id or its label.
  const energyCalRef = effectiveValues['energyCalibrationReference'];
  if (typeof energyCalRef === 'string' && getCalibrationStandardById(energyCalRef)) {
    params.energyShift = getCalibrationShift(energyCalRef);
    hasAnyParams = true;
  }

  // Region focus (Survey | Cu 2p | Fe 2p | ...). Propagates UI → adapter →
  // processing params → runner. 'Survey' is the default authoritative behavior.
  const regionSelection = effectiveValues['regionSelection'];
  if (typeof regionSelection === 'string' && regionSelection.length > 0) {
    params.region = regionSelection;
    hasAnyParams = true;
  }

  const surveyPeakProminence = effectiveValues['surveyPeakProminence'];
  if (typeof surveyPeakProminence === 'number' && Number.isFinite(surveyPeakProminence)) {
    params.peakProminence = surveyPeakProminence;
    hasAnyParams = true;
  }

  const surveyPeakMinDistance = effectiveValues['surveyPeakMinDistance'];
  if (typeof surveyPeakMinDistance === 'number' && Number.isFinite(surveyPeakMinDistance)) {
    params.peakMinDistance = surveyPeakMinDistance;
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
