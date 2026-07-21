import { isRealBackendEnabled } from '../utils/featureToggle';
import {
  createUploadedSignalRun,
  parseUploadedSignalText,
  mapUploadedSignalColumns,
  AXIS_DEFAULTS_BY_TECHNIQUE,
  checkTechniqueCompatibility,
  inferTechnique,
  type UploadedSignalRun,
  type Technique
} from '../data/uploadedSignalRuns';

// Base URL defaults to http://localhost:8000
const DEFAULT_BASE_URL = 'http://localhost:8000';

function getBackendBaseUrl(): string {
  return import.meta.env.VITE_XRD_API_URL || import.meta.env.VITE_XRD_BACKEND_URL || DEFAULT_BASE_URL;
}

export function normalizeUploadTechnique(technique: string): Technique {
  const upperTech = technique.toUpperCase();
  if (upperTech === 'RAMAN') return 'Raman';
  if (upperTech === 'XRD' || upperTech === 'XPS' || upperTech === 'FTIR') return upperTech;
  return 'Unknown';
}

/**
 * Helper to read a file as text in the browser.
 */
function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

/**
 * Standard client-side fallback parsing when backend is offline or disabled.
 */
async function fallbackLocalUpload(file: File, technique: string): Promise<UploadedSignalRun> {
  console.info('[upload-service] Performing local client-side fallback parsing for:', file.name);
  const text = await readFileAsText(file);
  const parsed = parseUploadedSignalText(file.name, text);
  
  if (!parsed.ok) {
    throw new Error((parsed as any).error || 'Failed to parse file content locally.');
  }

  // Map technique string to uppercase Technique
  const cleanTechnique = normalizeUploadTechnique(technique);

  const axisDefaults = AXIS_DEFAULTS_BY_TECHNIQUE[cleanTechnique] || AXIS_DEFAULTS_BY_TECHNIQUE.Unknown;
  const mappedPoints = mapUploadedSignalColumns(
    parsed,
    parsed.columnMapping.xColumn,
    parsed.columnMapping.yColumn
  );

  const compat = checkTechniqueCompatibility(mappedPoints, cleanTechnique, parsed.suggestedTechnique);
  if (!compat.compatible) {
    throw new Error(compat.message);
  }

  const run = createUploadedSignalRun({
    fileName: parsed.fileName,
    technique: cleanTechnique,
    sampleIdentity: file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '),
    xAxisLabel: axisDefaults.xAxisLabel,
    yAxisLabel: axisDefaults.yAxisLabel,
    referenceScope: 'Upload-derived evidence; validation checks pending',
    points: mappedPoints,
  });

  return run;
}

/**
 * Upload raw data file to FastAPI backend or fallback to local parsing.
 * 
 * Endpoint: POST /api/v1/analysis/upload (multipart/form-data)
 */
export async function uploadRawData(file: File, technique: string): Promise<UploadedSignalRun> {
  // If feature toggle is off, run local fallback immediately
  if (!isRealBackendEnabled()) {
    return fallbackLocalUpload(file, technique);
  }

  const baseUrl = getBackendBaseUrl();
  const url = `${baseUrl}/api/v1/analysis/upload`;

  try {
    console.info(`[upload-service] Attempting real backend upload to ${url}`);
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('technique', technique.toLowerCase());

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

    const response = await fetch(url, {
      method: 'POST',
      body: formData,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: Failed to process raw file on the server.`);
    }

    const data = await response.json();
    console.info('[upload-service] Backend processing successful:', data);

    // Map backend response back to our frontend's UploadedSignalRun shape.
    // Supporting various possible backend structures for robustness.
    let points = data.points || [];
    if (Array.isArray(data.x) && Array.isArray(data.y)) {
      points = data.x.map((xVal: number, idx: number) => ({ x: xVal, y: data.y[idx] }));
    }

    const cleanTechnique = normalizeUploadTechnique(data.technique || technique);

    const axisDefaults = AXIS_DEFAULTS_BY_TECHNIQUE[cleanTechnique] || AXIS_DEFAULTS_BY_TECHNIQUE.Unknown;

    const suggested = inferTechnique(file.name, points);
    const compat = checkTechniqueCompatibility(points, cleanTechnique, suggested);
    if (!compat.compatible) {
      throw new Error(compat.message);
    }

    const run = createUploadedSignalRun({
      fileName: data.fileName || file.name,
      technique: cleanTechnique,
      sampleIdentity: data.sampleIdentity || file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '),
      xAxisLabel: data.xAxisLabel || axisDefaults.xAxisLabel,
      yAxisLabel: data.yAxisLabel || axisDefaults.yAxisLabel,
      referenceScope: data.referenceScope || 'Backend-analyzed data; further verification recommended',
      points: points,
    });

    return run;
  } catch (error) {
    console.warn('[upload-service] Real backend upload failed or timed out. Falling back to local parser.', error);
    // Offline / Network Error / Timeout fallback
    return fallbackLocalUpload(file, technique);
  }
}
