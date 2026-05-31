import { setParameterOverrides } from './parameterStateManager';
import type { TechniqueWorkspaceId } from '../data/techniqueWorkspaceContent';

export function reproduceAnalysis(
  projectId: string,
  workspaceParameters: Record<string, any>,
  technique: TechniqueWorkspaceId,
  sessionId?: string,
  uploadId?: string
): void {
  // 1. Validate technique support
  const validTechniques: string[] = ['xrd', 'xps', 'ftir', 'raman'];
  const techLower = (technique || '').toLowerCase();
  
  if (!validTechniques.includes(techLower)) {
    alert(
      `DIFARYX Analysis Reproduction Error\n` +
      `------------------------------------\n` +
      `Error: Unsupported technique "${technique || 'unknown'}".\n\n` +
      `Recovery Guidance:\n` +
      `Only XRD, XPS, FTIR, and Raman workflows support parameter-level reproduction. ` +
      `Please select a notebook entry or report associated with one of these supported techniques.`
    );
    return;
  }

  // 2. Validate project context
  if (!projectId) {
    alert(
      `DIFARYX Analysis Reproduction Error\n` +
      `------------------------------------\n` +
      `Error: Project identifier is missing.\n\n` +
      `Recovery Guidance:\n` +
      `Reproduction requires an active, registered project context. ` +
      `Please navigate back to the Dashboard, select your project, and re-trigger reproduction.`
    );
    return;
  }

  // 3. Check for missing parameters (warn but allow default recovery)
  const isParamsEmpty = !workspaceParameters || Object.keys(workspaceParameters).length === 0;
  if (isParamsEmpty) {
    const proceed = confirm(
      `DIFARYX Reproduction Warning\n` +
      `----------------------------\n` +
      `Warning: No parameter snapshots were recorded in this notebook entry.\n\n` +
      `Recovery Guidance:\n` +
      `The workspace will load, but will fall back to using default instrument settings for ${technique.toUpperCase()}.\n\n` +
      `Do you wish to proceed with default parameters?`
    );
    if (!proceed) return;
  }

  // 4. Validate dataset availability (warn if deleted, but allow manual recovery by re-uploading)
  if (uploadId && typeof window !== 'undefined' && window.localStorage) {
    try {
      const runsRaw = window.localStorage.getItem('difaryx.uploadedSignalRuns.v1');
      let datasetExists = false;
      if (runsRaw) {
        const runs = JSON.parse(runsRaw);
        if (Array.isArray(runs)) {
          datasetExists = runs.some((run: any) => run.id === uploadId);
        }
      }
      if (!datasetExists) {
        const proceed = confirm(
          `DIFARYX Dataset Missing Warning\n` +
          `-------------------------------\n` +
          `Warning: The original uploaded signal dataset (ID: ${uploadId}) was deleted or cleared from local storage.\n\n` +
          `Recovery Guidance:\n` +
          `The technique workspace will load the saved parameters, but you will need to re-upload the target signal data in the workspace to execute the analysis.\n\n` +
          `Do you want to proceed and load the workspace?`
        );
        if (!proceed) return;
      }
    } catch (e) {
      console.warn('Failed to validate upload ID:', e);
    }
  }

  // Extract technique-specific parameters if they are nested under technique keys
  let flatParams: Record<string, any> = {};
  if (workspaceParameters && typeof workspaceParameters === 'object') {
    const techKey = technique.toLowerCase();
    const techUpper = technique.toUpperCase();
    if (workspaceParameters[techKey] && typeof workspaceParameters[techKey] === 'object') {
      flatParams = workspaceParameters[techKey];
    } else if (workspaceParameters[techUpper] && typeof workspaceParameters[techUpper] === 'object') {
      flatParams = workspaceParameters[techUpper];
    } else {
      // Fallback: assume it is flat
      flatParams = workspaceParameters;
    }
  }

  // Ensure parameter values are mapped and parsed correctly
  const overridesToSet: Record<string, any> = {};
  Object.entries(flatParams).forEach(([key, val]) => {
    // If the value is a string representation of a number, convert it
    if (typeof val === 'string' && val !== '') {
      if (val === 'true') {
        overridesToSet[key] = true;
      } else if (val === 'false') {
        overridesToSet[key] = false;
      } else {
        const num = Number(val);
        if (!isNaN(num)) {
          overridesToSet[key] = num;
        } else {
          overridesToSet[key] = val;
        }
      }
    } else {
      overridesToSet[key] = val;
    }
  });

  // Restore the overrides into localStorage for the technique
  setParameterOverrides(projectId || 'standalone', technique, overridesToSet, 'workspace');

  // Build the target route URL
  let targetUrl = `/workspace/${technique}?project=${projectId || 'standalone'}&reproduce=true`;
  if (sessionId) {
    targetUrl += `&sessionId=${sessionId}`;
  }
  if (uploadId) {
    targetUrl += `&upload=${uploadId}`;
  }

  // Redirect to target workspace (triggers hard reload to refresh state cleanly)
  window.location.href = targetUrl;
}
