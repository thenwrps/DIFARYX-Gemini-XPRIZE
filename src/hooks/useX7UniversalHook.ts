import { useState, useEffect } from 'react';
import { UNIVERSAL_SPECTRAL_LIBRARY } from '../constants/spectralLibrary';
import { UNIVERSAL_MASTER_LIBRARY } from '../constants/universalKnowledgeBase';

// ============================================================================
// Core Interfaces & Types
// ============================================================================

export interface StripeQuotaState {
  trialStartDate: string; // ISO String
  premiumActive: boolean;
  usage: {
    'bright-data': number; // limit 10
    'gemini-pro': number;  // limit 20
  };
}

export interface GoogleDriveStorageState {
  serviceAccount: string; // "difaryx-storage@difaryx-enterprise.iam.gserviceaccount.com"
  connected: boolean;
  storageUsageBytes: number;
  storageLimitBytes: number;
}

export interface GmailEmailResult {
  id: string;
  sender: string;
  subject: string;
  receivedAt: string;
  body: string;
  hasAttachment: boolean;
  attachmentName?: string;
  labDataPayload?: any; // Mock data (XRD/XPS spectra)
}

export interface ScholarReference {
  id: string;
  title: string;
  authors: string[];
  year: number;
  journal: string;
  doi?: string;
  conditions: {
    wavelength: number; // in Å
    material: string;
    temperature: number; // in K
  };
}

export interface ReliabilityReport {
  score: number; // 0-100
  breakdown: {
    wavelengthScore: number;  // weighted 50%
    materialScore: number;    // weighted 30%
    temperatureScore: number; // weighted 20%
  };
  matched: boolean;
  details: string[];
}

export interface ImmutableResearchSnapshot {
  id: string;
  timestamp: string;
  hash: string;
  state: any;
  provenance: {
    instrumentFingerprint: string;
    softwareVersion: string;
  };
}

export interface UseX7UniversalHookResult {
  // Stripe Monetization & Quota Layer
  hasPremiumAccess: boolean;
  quotaState: StripeQuotaState;
  checkUsageQuota: (service: 'bright-data' | 'gemini-pro') => boolean;
  reportUsageToStripe: (service: 'bright-data' | 'gemini-pro', amount: number) => void;
  togglePremiumAccess: () => void;
  resetQuotaUsage: () => void;

  // Workspace Integration (Data Lake)
  driveStorage: GoogleDriveStorageState;
  uploadToDrive: (fileName: string, content: string) => Promise<{ id: string; url: string }>;
  gmailConnected: boolean;
  connectGmail: () => void;
  disconnectGmail: () => void;
  scanGmail: (query?: string) => Promise<GmailEmailResult[]>;
  sendGmailReport: (to: string, subject: string, bodyText: string) => Promise<void>;
  listDriveFiles: () => Promise<Array<{ id: string; name: string }>>;
  getDriveFileContent: (fileId: string) => Promise<string>;
  connectedEmail: string;

  // External Intelligence Hook
  searchScholar: (query: string) => Promise<ScholarReference[]>;
  compareContext: (
    experiment: { wavelength: number; material: string; temperature: number },
    reference: { wavelength: number; material: string; temperature: number }
  ) => ReliabilityReport;
  brightDataError: string | null;
  clearBrightDataError: () => void;

  // Vertex AI Intelligence
  analyzeWithVertexAI: (payload: any) => Promise<any>;

  // Immutable State Logic
  snapshots: ImmutableResearchSnapshot[];
  saveSnapshot: (
    state: any,
    provenance: { instrumentFingerprint: string; softwareVersion: string }
  ) => ImmutableResearchSnapshot;
  verifySnapshot: (id: string, currentState: any) => boolean;
  clearSnapshots: () => void;

  // Signal Processing & Peak Assignment
  parseSpectrumFile: (fileContent: string, technique: 'FTIR' | 'RAMAN') => Array<{ x: number; y: number }>;
  applyBaseline: (data: Array<{ x: number; y: number }>, method: 'Rubberband' | 'ALS' | 'Polynomial' | 'Rolling Ball') => Array<{ x: number; y: number }>;
  applySmoothing: (data: Array<{ x: number; y: number }>, method: 'Savitzky-Golay' | 'Moving Average') => Array<{ x: number; y: number }>;
  applyNormalization: (data: Array<{ x: number; y: number }>, method: 'Min-max' | 'Area' | 'Vector') => Array<{ x: number; y: number }>;
  removeCosmicRays: (data: Array<{ x: number; y: number }>) => Array<{ x: number; y: number }>;
  identifyFunctionalGroups: (
    peaks: any[],
    technique: 'FTIR' | 'RAMAN'
  ) => PeakAssignmentResult[];
  identifyMaterialFeatures: (
    peaks: any[],
    technique: 'XRD' | 'FTIR' | 'RAMAN',
    industryFilter: string
  ) => PeakAssignmentResult[];
}

export interface PeakAssignmentResult {
  position: number;
  intensity: number;
  assignment: string;
  confidence: number;
  details?: string;
}


// ============================================================================
// Helper Utilities
// ============================================================================

/**
 * Computes a deterministic pseudo-SHA256 hash (64 hex characters) of any object
 * to verify data integrity in the immutable snapshots.
 */
export function computeDeterministicHash(obj: any): string {
  const str = JSON.stringify(obj || {});
  let hash1 = 5381;
  let hash2 = 89;

  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash1 = (hash1 << 5) + hash1 + char; /* hash1 * 33 + c */
    hash2 = (hash2 << 5) - hash2 + char; /* hash2 * 31 + c */
  }

  // Generate 64 characters hash representation
  const part1 = Math.abs(hash1).toString(16).padStart(8, '0');
  const part2 = Math.abs(hash2).toString(16).padStart(8, '0');
  const part3 = Math.abs(hash1 ^ hash2).toString(16).padStart(8, '0');
  const part4 = Math.abs(hash1 + hash2).toString(16).padStart(8, '0');
  const part5 = Math.abs(hash1 * 3).toString(16).padStart(8, '0');
  const part6 = Math.abs(hash2 * 7).toString(16).padStart(8, '0');
  const part7 = Math.abs((hash1 ^ 0x55555555) >>> 0).toString(16).padStart(8, '0');
  const part8 = Math.abs((hash2 ^ 0xAAAAAAAA) >>> 0).toString(16).padStart(8, '0');

  return (part1 + part2 + part3 + part4 + part5 + part6 + part7 + part8).toLowerCase().substring(0, 64);
}

/**
 * Enterprise Production Hard Lock Error Handler.
 * Evaluates HTTP status codes (401 Unauthorized, 403 Forbidden/Quota, 429 Rate Limit)
 * and triggers immediate execution locks via explicit error throws.
 */
export function handleApiResponseError(responseStatus: number, serviceName: string): void {
  if (responseStatus === 401 || responseStatus === 403 || responseStatus === 429) {
    localStorage.removeItem('difaryx_google_user_token');
  }

  if (responseStatus === 401) {
    throw new Error(
      `SaaS Hard Lock Exception [HTTP 401]: Google OAuth Access Token has expired or is unauthorized for service [${serviceName}]. Please sign in or re-authenticate to restore connectivity.`
    );
  }
  if (responseStatus === 403) {
    throw new Error(
      `SaaS Hard Lock Exception [HTTP 403]: Access Forbidden or API Quota limits exhausted for service [${serviceName}]. Operations have been locked to prevent billing leaks.`
    );
  }
  if (responseStatus === 429) {
    throw new Error(
      `SaaS Hard Lock Exception [HTTP 429]: Rate limit exceeded for service [${serviceName}]. Operations locked to safeguard API usage.`
    );
  }
  if (responseStatus >= 400) {
    throw new Error(
      `SaaS Hard Lock Exception [HTTP ${responseStatus}]: Unexpected error occurred during communication with API [${serviceName}].`
    );
  }
}

// ============================================================================
// Mock Fallbacks for Local Offline Testing
// ============================================================================

function getMockEmails(query: string = ''): GmailEmailResult[] {
  const mockEmails: GmailEmailResult[] = [
    {
      id: 'email_001',
      sender: 'analyst.group@research-labs.org',
      subject: 'XRD Phase ID Report - Cu-Fe2O4 spinel nanoparticles',
      receivedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
      body: 'Here is the summary of the spinel nanoparticle XRD scanning. The source wavelength utilized was Cu-Ka 1.5406 Å. Run conducted at room temperature (298 K). Samples belong to the CuFe2O4 phase system with possible spinel impurities.',
      hasAttachment: true,
      attachmentName: 'spinel_xrd_raw.csv',
      labDataPayload: {
        wavelength: 1.5406,
        material: 'CuFe2O4',
        temperature: 298,
        technique: 'xrd',
      },
    },
    {
      id: 'email_002',
      sender: 'facilities@materials-dept.univ.edu',
      subject: 'High-Temp XRD Characterization Run: CuFe2O4',
      receivedAt: new Date(Date.now() - 3600000 * 18).toISOString(),
      body: 'XRD patterns collected for Cu-Fe2O4 spinel under extreme thermal conditions. Run was held at 473 K to check structural stability. Standard copper source (wavelength 1.5406 Å) was active. Impurity levels observed.',
      hasAttachment: true,
      attachmentName: 'ht_cufe2o4_473k.csv',
      labDataPayload: {
        wavelength: 1.5406,
        material: 'CuFe2O4',
        temperature: 473,
        technique: 'xrd',
      },
    },
    {
      id: 'email_003',
      sender: 'beamline.operator@synchrotron-facility.gov',
      subject: 'Synchrotron calibration results: spinel composition',
      receivedAt: new Date(Date.now() - 3600000 * 48).toISOString(),
      body: 'Synchrotron high-energy characterization accomplished. Main wavelength calibrated at 0.9754 Å. Measurement performed at 298 K on copper iron spinel. Patterns indicate significant shifts compared to copper tube results.',
      hasAttachment: true,
      attachmentName: 'synchrotron_spinel_0.9754a.csv',
      labDataPayload: {
        wavelength: 0.9754,
        material: 'CuFe2O4',
        temperature: 298,
        technique: 'xrd',
      },
    },
  ];

  if (!query) return mockEmails;
  const lowerQuery = query.toLowerCase();
  return mockEmails.filter(
    (email) =>
      email.subject.toLowerCase().includes(lowerQuery) ||
      email.body.toLowerCase().includes(lowerQuery) ||
      email.sender.toLowerCase().includes(lowerQuery)
  );
}

function getLocalScholarRefs(query: string): ScholarReference[] {
  const mockReferences: ScholarReference[] = [
    {
      id: 'ref_scholar_01',
      title: 'Crystalline phase structure and magnetic coupling in CuFe2O4 Spinel',
      authors: ['H. Chen', 'T. Osgood'],
      year: 2022,
      journal: 'Physical Review Materials',
      doi: '10.1103/PhysRevMaterials.6.024408',
      conditions: {
        wavelength: 1.5406, // Cu-Ka
        material: 'CuFe2O4',
        temperature: 298, // 25C
      },
    },
    {
      id: 'ref_scholar_02',
      title: 'Thermal expansion and phase transformations of copper ferrite spinels',
      authors: ['K. Lindqvist', 'S. Johansson'],
      year: 2020,
      journal: 'Journal of Applied Crystallography',
      doi: '10.1107/S160076892000412X',
      conditions: {
        wavelength: 1.5406, // Cu-Ka
        material: 'CuFe2O4',
        temperature: 473, // 200C
      },
    },
    {
      id: 'ref_scholar_03',
      title: 'Synchrotron powder diffraction of standard ferrites at room temperature',
      authors: ['F. Rossi', 'G. Bianchi'],
      year: 2024,
      journal: 'Nature Materials Science',
      doi: '10.1038/s41563-024-08819-y',
      conditions: {
        wavelength: 0.9754, // Synchrotron radiation
        material: 'CuFe2O4',
        temperature: 298,
      },
    },
  ];

  const keywords = query.toLowerCase().split(/\s+/);
  return mockReferences.filter((ref) => {
    const matchText = `${ref.title} ${ref.journal} ${ref.conditions.material}`.toLowerCase();
    return keywords.some((kw) => matchText.includes(kw));
  });
}

// ============================================================================
// Math & Signal Processing Algorithms
// ============================================================================

export function generateMockFtirFileContent(): string {
  const points = [];
  for (let x = 400; x <= 4000; x += 4) {
    let y = 0.05;
    // tetrahedral band
    y += 0.6 * Math.exp(-Math.pow((x - 585) / 40, 2));
    // octahedral band
    y += 0.4 * Math.exp(-Math.pow((x - 410) / 30, 2));
    // H2O broad band
    y += 0.15 * Math.exp(-Math.pow((x - 3420) / 200, 2));
    // H2O bend
    y += 0.08 * Math.exp(-Math.pow((x - 1625) / 45, 2));
    // noise
    const noise = Math.sin(x * 12.3) * 0.002 + Math.cos(x * 7.7) * 0.001;
    // 0.5% White noise
    const whiteNoise = (Math.sin(x * 98.7) * Math.cos(x * 123.45)) * 0.005 * 1.35;
    y += noise + whiteNoise;
    points.push(`${x},${y.toFixed(4)}`);
  }
  return `Wavenumber (cm-1), Absorbance\n` + points.join('\n');
}

export function generateMockRamanFileContent(): string {
  const points = [];
  for (let x = 200; x <= 1800; x += 2) {
    let y = 15.0 + (x - 200) * 0.01; // background
    // Raman peaks
    y += 180 * Math.exp(-Math.pow((x - 688) / 15, 2)); // A1g (ferrite)
    y += 55 * Math.exp(-Math.pow((x - 565) / 18, 2));  // Supporting
    y += 70 * Math.exp(-Math.pow((x - 480) / 12, 2));  // Supporting
    y += 45 * Math.exp(-Math.pow((x - 335) / 20, 2));  // Supporting

    // Carbon residue modes
    y += 40 * Math.exp(-Math.pow((x - 1352) / 35, 2)); // D-band
    y += 50 * Math.exp(-Math.pow((x - 1585) / 25, 2)); // G-band

    // Cosmic Ray Spike at 950 cm^-1
    if (x === 950) {
      y += 850;
    }

    // noise
    const noise = Math.sin(x * 5.5) * 0.5 + Math.cos(x * 13.1) * 0.3;
    // 0.5% White noise
    const whiteNoise = (Math.sin(x * 98.7) * Math.cos(x * 123.45)) * 0.005 * 211;
    y += noise + whiteNoise;
    points.push(`${x},${y.toFixed(2)}`);
  }
  return `Raman Shift (cm-1), Intensity\n` + points.join('\n');
}

function solveLinearSystem(A: number[][], B: number[]): number[] {
  const n = B.length;
  for (let i = 0; i < n; i++) {
    let maxEl = Math.abs(A[i][i]);
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(A[k][i]) > maxEl) {
        maxEl = Math.abs(A[k][i]);
        maxRow = k;
      }
    }
    const tempA = A[maxRow];
    A[maxRow] = A[i];
    A[i] = tempA;
    const tempB = B[maxRow];
    B[maxRow] = B[i];
    B[i] = tempB;

    if (Math.abs(A[i][i]) < 1e-12) {
      return new Array(n).fill(0);
    }

    for (let k = i + 1; k < n; k++) {
      const c = -A[k][i] / A[i][i];
      for (let j = i; j < n; j++) {
        if (i === j) {
          A[k][j] = 0;
        } else {
          A[k][j] += c * A[i][j];
        }
      }
      B[k] += c * B[i];
    }
  }

  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = B[i];
    for (let j = i + 1; j < n; j++) {
      sum -= A[i][j] * x[j];
    }
    x[i] = sum / A[i][i];
  }
  return x;
}

function fitPolynomial(points: Array<{ x: number; y: number }>, degree: number): number[] {
  const n = points.length;
  const m = degree + 1;
  const X: number[][] = Array.from({ length: m }, () => new Array(m).fill(0));
  const B: number[] = new Array(m).fill(0);

  for (let i = 0; i < n; i++) {
    const px = points[i].x;
    const py = points[i].y;

    const powers = new Array(2 * degree + 1);
    powers[0] = 1;
    for (let k = 1; k <= 2 * degree; k++) {
      powers[k] = powers[k-1] * px;
    }

    for (let row = 0; row < m; row++) {
      for (let col = 0; col < m; col++) {
        X[row][col] += powers[row + col];
      }
      B[row] += py * (row === 0 ? 1 : powers[row]);
    }
  }

  return solveLinearSystem(X, B);
}

function rubberbandBaseline(points: Array<{ x: number; y: number }>): number[] {
  const n = points.length;
  if (n < 2) return points.map(p => Math.max(0, p.y));

  const pivots: number[] = [0, n - 1];

  function addPivots(start: number, end: number) {
    if (end - start <= 1) return;

    const xStart = points[start].x;
    const yStart = points[start].y;
    const xEnd = points[end].x;
    const yEnd = points[end].y;

    let maxDist = 0;
    let pivotIndex = -1;

    for (let i = start + 1; i < end; i++) {
      const xVal = points[i].x;
      const yVal = points[i].y;

      const t = (xVal - xStart) / (xEnd - xStart);
      const yInterp = yStart + t * (yEnd - yStart);

      const dist = yInterp - yVal;
      if (dist > maxDist && dist > 1e-6) {
        maxDist = dist;
        pivotIndex = i;
      }
    }

    if (pivotIndex !== -1) {
      pivots.push(pivotIndex);
      pivots.sort((a, b) => a - b);

      const idx = pivots.indexOf(pivotIndex);
      addPivots(pivots[idx - 1], pivotIndex);
      addPivots(pivotIndex, pivots[idx + 1]);
    }
  }

  addPivots(0, n - 1);

  const baseline = new Array(n);
  for (let j = 0; j < pivots.length - 1; j++) {
    const startIdx = pivots[j];
    const endIdx = pivots[j + 1];

    const xStart = points[startIdx].x;
    const yStart = points[startIdx].y;
    const xEnd = points[endIdx].x;
    const yEnd = points[endIdx].y;

    for (let i = startIdx; i <= endIdx; i++) {
      const t = (points[i].x - xStart) / (xEnd - xStart);
      baseline[i] = Math.max(0, yStart + t * (yEnd - yStart));
    }
  }
  return baseline;
}

function alsBaseline(points: Array<{ x: number; y: number }>, lam = 1e7, p = 0.01, iters = 10): number[] {
  const n = points.length;
  const y = points.map(pt => pt.y);
  const z = [...y];
  const w = new Array(n).fill(1.0);

  const H: number[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) {
    H[i] = new Array(n).fill(0);
  }
  for (let i = 0; i < n - 2; i++) {
    H[i][i] += 1; H[i][i+1] += -2; H[i][i+2] += 1;
    H[i+1][i] += -2; H[i+1][i+1] += 4; H[i+1][i+2] += -2;
    H[i+2][i] += 1; H[i+2][i+1] += -2; H[i+2][i+2] += 1;
  }

  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < n; i++) {
      w[i] = y[i] > z[i] ? p : 1 - p;
    }

    for (let gs = 0; gs < 15; gs++) {
      for (let i = 0; i < n; i++) {
        let sum = w[i] * y[i];
        let diag = w[i] + lam * H[i][i];
        for (let j = Math.max(0, i - 2); j <= Math.min(n - 1, i + 2); j++) {
          if (i !== j) {
            sum -= lam * H[i][j] * z[j];
          }
        }
        z[i] = Math.max(0, sum / diag);
      }
    }
  }
  return z;
}

function rollingBallBaseline(points: Array<{ x: number; y: number }>, windowSize = 80): number[] {
  const n = points.length;
  const y = points.map(p => p.y);

  const half = Math.floor(windowSize / 2);
  const eroded = new Array(n);
  for (let i = 0; i < n; i++) {
    let minVal = Infinity;
    const start = Math.max(0, i - half);
    const end = Math.min(n, i + half + 1);
    for (let j = start; j < end; j++) {
      if (y[j] < minVal) {
        minVal = y[j];
      }
    }
    eroded[i] = Math.max(0, minVal);
  }

  const baseline = new Array(n);
  for (let i = 0; i < n; i++) {
    let maxVal = -Infinity;
    const start = Math.max(0, i - half);
    const end = Math.min(n, i + half + 1);
    for (let j = start; j < end; j++) {
      if (eroded[j] > maxVal) {
        maxVal = eroded[j];
      }
    }
    baseline[i] = Math.max(0, maxVal);
  }

  const smoothedBaseline = new Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    let count = 0;
    const start = Math.max(0, i - 10);
    const end = Math.min(n, i + 11);
    for (let j = start; j < end; j++) {
      sum += baseline[j];
      count++;
    }
    smoothedBaseline[i] = Math.max(0, sum / count);
  }

  return smoothedBaseline;
}

function savitzkyGolayCoefficients(windowSize: number, degree: number): number[] {
  const m = Math.floor(windowSize / 2);
  const n = windowSize;
  const d = degree;

  const J: number[][] = Array.from({ length: n }, () => new Array(d + 1).fill(0));
  for (let i = 0; i < n; i++) {
    const xVal = i - m;
    let power = 1;
    for (let j = 0; j <= d; j++) {
      J[i][j] = power;
      power *= xVal;
    }
  }

  const JT_J: number[][] = Array.from({ length: d + 1 }, () => new Array(d + 1).fill(0));
  for (let r = 0; r <= d; r++) {
    for (let c = 0; c <= d; c++) {
      let sum = 0;
      for (let i = 0; i < n; i++) {
        sum += J[i][r] * J[i][c];
      }
      JT_J[r][c] = sum;
    }
  }

  const identity: number[][] = Array.from({ length: d + 1 }, (_, i) => {
    const row = new Array(d + 1).fill(0);
    row[i] = 1;
    return row;
  });

  const JT_J_inv: number[][] = Array.from({ length: d + 1 }, () => new Array(d + 1).fill(0));
  for (let col = 0; col <= d; col++) {
    const A_copy = JT_J.map(row => [...row]);
    const B_copy = identity[col];
    const sol = solveLinearSystem(A_copy, B_copy);
    for (let r = 0; r <= d; r++) {
      JT_J_inv[r][col] = sol[r];
    }
  }

  const coeffs = new Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = 0; j <= d; j++) {
      sum += JT_J_inv[0][j] * J[i][j];
    }
    coeffs[i] = sum;
  }

  return coeffs;
}

// ============================================================================
// Hook Implementation
// ============================================================================


const STORAGE_KEYS = {
  STRIPE_QUOTA: 'difaryx_x7_stripe_quota',
  DRIVE_STORAGE: 'difaryx_x7_drive_storage',
  SNAPSHOTS: 'difaryx_immutable_snapshots',
  TOKEN: 'difaryx_google_user_token',
};

export function useX7UniversalHook(): UseX7UniversalHookResult {
  // 1. Stripe Monetization State Setup
  const [quotaState, setQuotaState] = useState<StripeQuotaState>(() => {
    const stored = localStorage.getItem(STORAGE_KEYS.STRIPE_QUOTA);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        // Fallback to default
      }
    }
    return {
      trialStartDate: new Date().toISOString(),
      premiumActive: false,
      usage: {
        'bright-data': 0,
        'gemini-pro': 0,
      },
    };
  });

  // 2. Google Drive Storage State Setup
  const [driveStorage, setDriveStorage] = useState<GoogleDriveStorageState>(() => {
    const stored = localStorage.getItem(STORAGE_KEYS.DRIVE_STORAGE);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        // Fallback to default
      }
    }
    return {
      serviceAccount: 'difaryx-storage@difaryx-enterprise.iam.gserviceaccount.com',
      connected: true,
      storageUsageBytes: 34521098, // Start with ~32MB default mock files
      storageLimitBytes: 10 * 1024 * 1024 * 1024, // 10 GB
    };
  });

  // 3. Gmail OAuth connection based on localStorage token presence
  const [gmailConnected, setGmailConnected] = useState<boolean>(() => {
    return !!localStorage.getItem(STORAGE_KEYS.TOKEN);
  });

  // 4. Immutable Snapshots State Setup
  const [snapshots, setSnapshots] = useState<ImmutableResearchSnapshot[]>(() => {
    const stored = localStorage.getItem(STORAGE_KEYS.SNAPSHOTS);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        // Fallback to default
      }
    }
    return [];
  });

  // 5. Dynamic Profile State and Error handlers
  const [connectedEmail, setConnectedEmail] = useState<string>('nwrps.yingyuen@gmail.com');
  const [brightDataError, setBrightDataError] = useState<string | null>(null);
  const clearBrightDataError = () => setBrightDataError(null);

  // Synchronize Google Profile email dynamically via OAuth token if connected
  useEffect(() => {
    const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
    if (token) {
      fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then(res => {
        if (res.ok) return res.json();
        throw new Error('Failed to fetch profile');
      })
      .then(data => {
        if (data.email) {
          setConnectedEmail(data.email);
        }
      })
      .catch(err => {
        console.warn('Failed to load Google user info:', err);
        setConnectedEmail('nwrps.yingyuen@gmail.com'); // default fallback
      });
    } else {
      setConnectedEmail('nwrps.yingyuen@gmail.com');
    }
  }, [gmailConnected]);

  // URL Hash Listener for OAuth Implicit Flow Token Capture
  useEffect(() => {
    if (window.location.hash) {
      const hash = window.location.hash.substring(1);
      const params = new URLSearchParams(hash);
      const accessToken = params.get('access_token');
      if (accessToken) {
        localStorage.setItem(STORAGE_KEYS.TOKEN, accessToken);
        setGmailConnected(true);
        console.log('[OAuth 2.0 Flow] Access Token captured and stored successfully.');

        // Remove hash from URL to keep address bar clean
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    }
  }, []);

  // Synchronize States to Local Storage on Change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.STRIPE_QUOTA, JSON.stringify(quotaState));
  }, [quotaState]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.DRIVE_STORAGE, JSON.stringify(driveStorage));
  }, [driveStorage]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.SNAPSHOTS, JSON.stringify(snapshots));
  }, [snapshots]);

  // ==========================================================================
  // Stripe Monetization & Quota Logic (with SaaS Hard Locks)
  // ==========================================================================

  const isTrialActive = () => {
    const start = new Date(quotaState.trialStartDate).getTime();
    const now = Date.now();
    const diffDays = (now - start) / (1000 * 60 * 60 * 24);
    return diffDays >= 0 && diffDays < 14;
  };

  const hasPremiumAccess = quotaState.premiumActive || isTrialActive();

  const checkUsageQuota = (service: 'bright-data' | 'gemini-pro'): boolean => {
    if (!hasPremiumAccess) {
      throw new Error(
        'SaaS Subscription Guardrail Block: Active Premium access or trial is required. Access denied.'
      );
    }

    const currentUsage = quotaState.usage[service] || 0;
    const limit = service === 'bright-data' ? 10 : 20;

    if (currentUsage >= limit) {
      throw new Error(
        `SaaS Quota Guardrail Block: Quota limit of ${limit} exceeded for API Service [${service}]. Current usage is ${currentUsage}/${limit}. Call was blocked to prevent billing leaks. Please upgrade your subscription.`
      );
    }

    return true;
  };

  const reportUsageToStripe = (service: 'bright-data' | 'gemini-pro', amount: number): void => {
    checkUsageQuota(service);

    setQuotaState((prev) => {
      const nextUsage = { ...prev.usage };
      nextUsage[service] = (nextUsage[service] || 0) + amount;

      console.log(`[Stripe Telemetry] Reported ${amount} units for ${service}. New total: ${nextUsage[service]}`);

      return {
        ...prev,
        usage: nextUsage,
      };
    });
  };

  const togglePremiumAccess = () => {
    setQuotaState((prev) => ({
      ...prev,
      premiumActive: !prev.premiumActive,
    }));
  };

  const resetQuotaUsage = () => {
    setQuotaState((prev) => ({
      ...prev,
      usage: {
        'bright-data': 0,
        'gemini-pro': 0,
      },
    }));
  };

  // ==========================================================================
  // Workspace Integration (Drive API & Gmail API)
  // ==========================================================================

  const connectGmail = () => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
    if (!clientId) {
      console.error('VITE_GOOGLE_CLIENT_ID is not configured in .env');
      throw new Error('OAuth Redirect Failed: Client ID not configured.');
    }

    const redirectUri = window.location.origin + '/auth/callback'; // Always dynamic redirect URI matching client config
    const scopes = [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/cloud-platform',
      'openid',
      'email',
      'profile'
    ].join(' ');

    const oauthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&response_type=token&scope=${encodeURIComponent(scopes)}&prompt=consent`;

    console.log('[OAuth 2.0 Flow] Redirecting user for Google Workspace permissions...');
    window.location.assign(oauthUrl);
  };

  const disconnectGmail = () => {
    localStorage.removeItem(STORAGE_KEYS.TOKEN);
    setGmailConnected(false);
  };

  /**
   * Google Drive API v3 - Multipart File Upload
   * Uploads file containing lab research into VITE_GDRIVE_FOLDER_ID
   */
  const uploadToDrive = async (fileName: string, content: string): Promise<{ id: string; url: string }> => {
    const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
    if (!token) {
      throw new Error(
        'SaaS Hard Lock Exception: No active Google OAuth token. Connect your Google account first.'
      );
    }

    const folderId = import.meta.env.VITE_GDRIVE_FOLDER_ID;
    const metadata = {
      name: fileName,
      mimeType: 'text/plain',
      parents: folderId ? [folderId] : undefined,
    };

    const boundary = 'difaryx_multipart_boundary';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const body = [
      delimiter,
      'Content-Type: application/json; charset=UTF-8\r\n\r\n',
      JSON.stringify(metadata),
      delimiter,
      'Content-Type: text/plain; charset=UTF-8\r\n\r\n',
      content,
      closeDelimiter,
    ].join('');

    try {
      const response = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': `multipart/related; boundary=${boundary}`,
          },
          body,
        }
      );

      if (!response.ok) {
        handleApiResponseError(response.status, 'Google Drive API');
      }

      const result = await response.json();
      const fileId = result.id;
      const url = `https://drive.google.com/file/d/${fileId}/view?usp=drivesdk`;

      // Update storage tracking state
      const contentBytes = new Blob([content]).size;
      setDriveStorage((prev) => ({
        ...prev,
        storageUsageBytes: Math.min(prev.storageUsageBytes + contentBytes, prev.storageLimitBytes),
      }));

      console.log(`[Google Drive] Successfully uploaded file ${fileName} via Drive API.`);

      return { id: fileId, url };
    } catch (err: any) {
      if (err.message.includes('SaaS Hard Lock')) {
        setGmailConnected(false);
        throw err;
      }
      throw new Error(`Google Drive API Upload Error: ${err.message || err}`);
    }
  };

  /**
   * Gmail API Integration - Scans mailbox for lab results.
   * Falls back to mock data lake results for demo continuity if search list is empty.
   */
  const scanGmail = async (query: string = ''): Promise<GmailEmailResult[]> => {
    const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
    if (!token) {
      throw new Error(
        'SaaS Hard Lock Exception: No active Google OAuth token. Connect your Google account first.'
      );
    }

    const searchQuery = query
      ? `${query} has:attachment`
      : 'spinel XRD XPS FTIR has:attachment';

    try {
      const response = await fetch(
        `https://gmail.googleapis.com/v1/users/me/messages?q=${encodeURIComponent(searchQuery)}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        handleApiResponseError(response.status, 'Gmail API Messages List');
      }

      const listData = await response.json();
      const messages = listData.messages || [];

      if (messages.length === 0) {
        console.warn(
          '[Gmail API] No actual emails found matching query. Falling back to local mock data.'
        );
        return getMockEmails(query);
      }

      // Fetch detail payloads for up to 3 emails
      const fetchedResults: GmailEmailResult[] = [];
      for (const msg of messages.slice(0, 3)) {
        const detailResponse = await fetch(
          `https://gmail.googleapis.com/v1/users/me/messages/${msg.id}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!detailResponse.ok) {
          handleApiResponseError(detailResponse.status, 'Gmail API Message Detail');
        }

        const msgData = await detailResponse.json();
        const headers = msgData.payload?.headers || [];
        const subject = headers.find((h: any) => h.name.toLowerCase() === 'subject')?.value || 'No Subject';
        const sender = headers.find((h: any) => h.name.toLowerCase() === 'from')?.value || 'Unknown';
        const date = headers.find((h: any) => h.name.toLowerCase() === 'date')?.value || new Date().toISOString();
        const body = msgData.snippet || 'No preview.';

        const parts = msgData.payload?.parts || [];
        const attachmentPart = parts.find((p: any) => p.filename && p.filename.length > 0);
        const hasAttachment = !!attachmentPart;

        fetchedResults.push({
          id: msg.id,
          sender,
          subject,
          receivedAt: new Date(date).toISOString(),
          body,
          hasAttachment,
          attachmentName: attachmentPart?.filename,
          labDataPayload: {
            wavelength: 1.5406, // Default standard Cu-Ka
            material: subject.toLowerCase().includes('spinel') ? 'CuFe2O4' : 'Unknown',
            temperature: 298,
            technique: 'xrd',
            realGmailMessageId: msg.id,
          },
        });
      }

      return fetchedResults;
    } catch (err: any) {
      if (err.message.includes('SaaS Hard Lock')) {
        setGmailConnected(false);
        throw err;
      }
      console.warn(
        '[Gmail API] Error fetching. Falling back to mock data lake results for demo continuity.',
        err
      );
      return getMockEmails(query);
    }
  };

  /**
   * Gmail API Send Message
   * Sends research summary email using user OAuth Token.
   */
  const sendGmailReport = async (to: string, subject: string, bodyText: string): Promise<void> => {
    const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
    if (!token) {
      throw new Error(
        'SaaS Hard Lock Exception: No active Google OAuth token. Connect your Google account first.'
      );
    }

    // Build RFC 2822 MIME message
    const utf8Subject = `=?utf-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`;
    const messageParts = [
      `To: ${to}`,
      `Subject: ${utf8Subject}`,
      'Content-Type: text/plain; charset="UTF-8"',
      'MIME-Version: 1.0',
      'Content-Transfer-Encoding: 7bit',
      '',
      bodyText,
    ];
    const message = messageParts.join('\r\n');

    // Base64url encode the message
    const encodedMessage = btoa(unescape(encodeURIComponent(message)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    try {
      const response = await fetch(
        'https://gmail.googleapis.com/v1/users/me/messages/send',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            raw: encodedMessage,
          }),
        }
      );

      if (!response.ok) {
        handleApiResponseError(response.status, 'Gmail Send API');
      }

      console.log('[Gmail Send] Report sent successfully to:', to);
    } catch (err: any) {
      if (err.message.includes('SaaS Hard Lock')) {
        setGmailConnected(false);
        throw err;
      }
      throw new Error(`Gmail API Send Error: ${err.message || err}`);
    }
  };

  /**
   * Google Drive API - List files in VITE_GDRIVE_FOLDER_ID
   */
  const listDriveFiles = async (): Promise<Array<{ id: string; name: string }>> => {
    const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
    if (!token) {
      throw new Error(
        'SaaS Hard Lock Exception: No active Google OAuth token. Connect your Google account first.'
      );
    }

    const folderId = import.meta.env.VITE_GDRIVE_FOLDER_ID;
    const query = folderId ? `q='${folderId}'+in+parents` : '';

    try {
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files?${query}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        handleApiResponseError(response.status, 'Google Drive List API');
      }

      const result = await response.json();
      const files = result.files || [];
      // Always append mock files for demo reliability
      if (!files.some((f: any) => f.name === '04_CoFe2O4_FTIR.txt')) {
        files.push({ id: '04_CoFe2O4_FTIR.txt', name: '04_CoFe2O4_FTIR.txt' });
      }
      if (!files.some((f: any) => f.name === '03_CoFe2O4_Raman.txt')) {
        files.push({ id: '03_CoFe2O4_Raman.txt', name: '03_CoFe2O4_Raman.txt' });
      }
      return files;
    } catch (err: any) {
      if (err.message.includes('SaaS Hard Lock')) {
        setGmailConnected(false);
        throw err;
      }
      console.warn('[Google Drive] Listing files failed. Falling back to mock drive files list.', err);
      return [
        { id: 'drive-cufe2o4-xrd', name: 'spinel_nanoparticles_xrd_raw.csv' },
        { id: 'drive-cufe2o4-xps', name: 'spinel_surface_oxidation_xps.csv' },
        { id: '04_CoFe2O4_FTIR.txt', name: '04_CoFe2O4_FTIR.txt' },
        { id: '03_CoFe2O4_Raman.txt', name: '03_CoFe2O4_Raman.txt' },
        { id: 'drive-cufe2o4-ftir', name: 'tetrahedral_spinel_ftir_band.csv' },
        { id: 'drive-cufe2o4-raman', name: 'spinel_raman_symmetry_modes.csv' },
      ];
    }
  };

  /**
   * Google Drive API - Download file content
   */
  const getDriveFileContent = async (fileId: string): Promise<string> => {
    // Intercept our new mock files immediately
    if (fileId.includes('04_CoFe2O4_FTIR') || fileId.includes('04_CoFe2O4_FTIR.txt')) {
      return generateMockFtirFileContent();
    }
    if (fileId.includes('03_CoFe2O4_Raman') || fileId.includes('03_CoFe2O4_Raman.txt')) {
      return generateMockRamanFileContent();
    }

    const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
    if (!token) {
      throw new Error(
        'SaaS Hard Lock Exception: No active Google OAuth token. Connect your Google account first.'
      );
    }

    try {
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        handleApiResponseError(response.status, 'Google Drive Download API');
      }

      return await response.text();
    } catch (err: any) {
      if (err.message.includes('SaaS Hard Lock')) {
        setGmailConnected(false);
        throw err;
      }
      console.warn('[Google Drive] Download failed. Falling back to mock file content.', err);
      if (fileId.includes('xps')) {
        return `Cu-Fe2O4 XPS Data\nBinding Energy, Intensity\n933.5, 520\n953.2, 280`;
      }
      if (fileId.includes('ftir')) {
        return generateMockFtirFileContent();
      }
      if (fileId.includes('raman')) {
        return generateMockRamanFileContent();
      }
      return `Cu-Fe2O4 XRD Data\n2theta, Intensity\n18.3, 22\n30.1, 58\n35.5, 100\n43.2, 48\n57.1, 39\n62.7, 34`;
    }
  };


  // ==========================================================================
  // External Intelligence & Google Scholar (Bright Data)
  // ==========================================================================

  /**
   * Google Scholar search via Bright Data SERP API.
   * Utilizes serp_api1 zone name and handles fallbacks gracefully to ensure
   * Bragg's Law comparisons remain active in the demo.
   */
  const searchScholar = async (query: string): Promise<ScholarReference[]> => {
    const apiKey = import.meta.env.VITE_BRIGHTDATA_API_KEY;
    if (!apiKey) {
      console.warn(
        '[Bright Data SERP] API key not configured in environment. Using local reference database.'
      );
      await new Promise((resolve) => setTimeout(resolve, 800));
      return getLocalScholarRefs(query);
    }

    try {
      // Quota check & report is wrapped inside the try block to avoid uncaught SaaS crashes
      reportUsageToStripe('bright-data', 1);

      const response = await fetch('https://api.brightdata.com/serp/req', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          zone: 'serp_api1', // Correct zone name matching the user's active configuration
          url: `https://scholar.google.com/scholar?q=${encodeURIComponent(query)}`,
        }),
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403 || response.status === 429) {
          const errorMsg = `SaaS Hard Lock Alert: Bright Data SERP API returned HTTP ${response.status} (Quota Exceeded/Unauthorized). Scholar searches locked. Falling back to local reference database.`;
          setBrightDataError(errorMsg);
        }
        handleApiResponseError(response.status, 'Bright Data SERP API');
      }

      const data = await response.json();
      const results = data.organic_results || [];

      if (results.length === 0) {
        return getLocalScholarRefs(query);
      }

      return results.map((item: any, idx: number) => ({
        id: `ref_brightdata_${idx}`,
        title: item.title || 'Scholar Reference',
        authors: item.author_info?.split(' - ') || ['Unknown Authors'],
        year: parseInt(item.publication_info?.match(/\d{4}/)?.[0] || '2024'),
        journal: item.publication_info || 'Google Scholar Index',
        doi: item.resources?.[0]?.url,
        conditions: {
          wavelength: 1.5406, // standard lab Cu-Ka
          material: query.toLowerCase().includes('spinel') ? 'CuFe2O4' : 'Unknown',
          temperature: 298,
        },
      }));
    } catch (err: any) {
      console.warn(
        '[Bright Data SERP] Failed to fetch. Falling back to local references dataset.',
        err
      );

      // Capture quota limit error or SaaS Hard Lock error and set it for the Settings screen alert
      if (err.message && (err.message.includes('SaaS Hard Lock') || err.message.includes('SaaS Quota') || err.message.includes('Subscription'))) {
        setBrightDataError(err.message);
      } else {
        setBrightDataError(`Bright Data Connectivity Warning: ${err.message || String(err)}`);
      }

      return getLocalScholarRefs(query);
    }
  };

  /**
   * Scientific Context Comparison Scoring:
   * Uses Bragg's Law considerations for wavelength weight (50%),
   * Material match (30%), and Temperature proximity (20%).
   */
  const compareContext = (
    experiment: { wavelength: number; material: string; temperature: number },
    reference: { wavelength: number; material: string; temperature: number }
  ): ReliabilityReport => {
    const details: string[] = [];

    // 1. Wavelength Match (50% weight)
    let wavelengthScore = 0;
    const wavelengthDiff = Math.abs(experiment.wavelength - reference.wavelength);

    if (wavelengthDiff < 0.0001) {
      wavelengthScore = 50;
      details.push(
        `Wavelength match: EXACT match at ${experiment.wavelength} Å. Direct peak comparison in 2-theta is valid. (Bragg's Law holds correctly).`
      );
    } else {
      wavelengthScore = 0;
      details.push(
        `Wavelength mismatch: Experiment (${experiment.wavelength} Å) vs Reference (${reference.wavelength} Å). According to Bragg's law (nλ = 2d sin θ), peak positions (2θ) are shifted. Raw spectra cannot be matched directly without converting to d-spacing (d = λ / 2sinθ).`
      );
    }

    // 2. Material Composition Overlap (30% weight)
    let materialScore = 0;
    const expMat = experiment.material.trim().toLowerCase().replace(/[-_ ]/g, '');
    const refMat = reference.material.trim().toLowerCase().replace(/[-_ ]/g, '');

    if (expMat === refMat) {
      materialScore = 30;
      details.push(`Material match: EXACT composition match (${experiment.material}).`);
    } else if (expMat.includes(refMat) || refMat.includes(expMat)) {
      materialScore = 15;
      details.push(
        `Material overlap: PARTIAL match. Composition of experiment (${experiment.material}) and reference (${reference.material}) overlap.`
      );
    } else {
      materialScore = 0;
      details.push(
        `Material mismatch: Composition mismatch between experiment (${experiment.material}) and reference (${reference.material}).`
      );
    }

    // 3. Temperature Proximity (20% weight)
    let temperatureScore = 0;
    const tempDiff = Math.abs(experiment.temperature - reference.temperature);

    if (tempDiff <= 5) {
      temperatureScore = 20;
      details.push(
        `Temperature proximity: EXCELLENT match. Delta is ${tempDiff.toFixed(1)} K. Thermal expansion effects on lattice constants are negligible.`
      );
    } else if (tempDiff <= 50) {
      const pct = 1 - (tempDiff - 5) / 45;
      temperatureScore = Math.round(20 * pct * 10) / 10;
      details.push(
        `Temperature proximity: MODERATE deviation. Delta is ${tempDiff.toFixed(1)} K. Lattice constants might show minor thermal expansion shift (Score: ${temperatureScore}/20).`
      );
    } else {
      temperatureScore = 0;
      details.push(
        `Temperature proximity: SEVERE deviation. Delta is ${tempDiff.toFixed(1)} K. Higher thermal agitation or phase transitions might be present, rendering structural comparison unreliable under raw states.`
      );
    }

    const totalScore = Math.round((wavelengthScore + materialScore + temperatureScore) * 10) / 10;
    const matched = totalScore >= 75;

    return {
      score: totalScore,
      breakdown: {
        wavelengthScore,
        materialScore,
        temperatureScore,
      },
      matched,
      details,
    };
  };

  // ==========================================================================
  // Vertex AI Intelligence
  // ==========================================================================

  /**
   * Direct Client-Side Vertex AI API Call.
   * Sends research payload using the User OAuth Token inside authorization headers.
   * Utilizes projectId, location, and model parameters from environmental configuration.
   */
  const analyzeWithVertexAI = async (payload: any): Promise<any> => {
    const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
    if (!token) {
      throw new Error(
        'SaaS Hard Lock Exception: No active Google OAuth token. Connect your Google account first.'
      );
    }

    const projectId = import.meta.env.VITE_GOOGLE_CLOUD_PROJECT;
    const location = import.meta.env.VITE_GOOGLE_CLOUD_LOCATION || 'us-central1';
    const model = import.meta.env.VITE_VERTEX_AI_MODEL || 'gemini-1.5-pro';

    if (!projectId) {
      throw new Error(
        'SaaS Configuration Guardrail Block: VITE_GOOGLE_CLOUD_PROJECT is not configured in .env.'
      );
    }

    // Deduct and report usage unit
    reportUsageToStripe('gemini-pro', 1);

    const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:generateContent`;

    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `You are DIFARYX, an autonomous scientific reasoning engine. Perform a deep structural analysis and characterize this research payload:

${JSON.stringify(payload, null, 2)}

Identify any phase match candidates, XRD diffraction parameters, thermal states, and output a structured scientific assessment.`,
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.15,
      },
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        handleApiResponseError(response.status, 'Vertex AI API Endpoint');
      }

      const result = await response.json();
      console.log('[Vertex AI] Completed structural payload characterization.');
      return result;
    } catch (err: any) {
      if (err.message.includes('SaaS Hard Lock')) {
        setGmailConnected(false);
        throw err;
      }
      throw new Error(`Vertex AI API Request Failure: ${err.message || err}`);
    }
  };

  const saveSnapshot = (
    state: any,
    provenance: { instrumentFingerprint: string; softwareVersion: string }
  ): ImmutableResearchSnapshot => {
    const id = `snap-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const timestamp = new Date().toISOString();
    const hash = computeDeterministicHash(state);
    const newSnapshot: ImmutableResearchSnapshot = {
      id,
      timestamp,
      hash,
      state,
      provenance,
    };
    setSnapshots((prev) => [...prev, newSnapshot]);
    return newSnapshot;
  };

  const verifySnapshot = (id: string, currentState: any): boolean => {
    const found = snapshots.find(s => s.id === id);
    if (!found) return false;
    return found.hash === computeDeterministicHash(currentState);
  };

  const clearSnapshots = () => {
    setSnapshots([]);
  };

  return {
    hasPremiumAccess,
    quotaState,
    checkUsageQuota,
    reportUsageToStripe,
    togglePremiumAccess,
    resetQuotaUsage,

    driveStorage,
    uploadToDrive,
    gmailConnected,
    connectGmail,
    disconnectGmail,
    scanGmail,
    sendGmailReport,
    listDriveFiles,
    getDriveFileContent,
    connectedEmail,

    searchScholar,
    compareContext,
    brightDataError,
    clearBrightDataError,

    analyzeWithVertexAI,

    snapshots,
    saveSnapshot,
    verifySnapshot,
    clearSnapshots,

    parseSpectrumFile,
    applyBaseline,
    applySmoothing,
    applyNormalization,
    removeCosmicRays,
    identifyFunctionalGroups,
    identifyMaterialFeatures,
  };
}

// ============================================================================
// Top-Level Signal Processing & Peak Assignment Functions (for hook and direct import)
// ============================================================================

export function parseSpectrumFile(fileContent: string, technique: 'FTIR' | 'RAMAN'): Array<{ x: number; y: number }> {
  if (!fileContent) return [];
  const lines = fileContent.split(/\r?\n/);
  const data: Array<{ x: number; y: number }> = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(/[\s,;'\t]+/);
    if (parts.length >= 2) {
      const x = parseFloat(parts[0]);
      const y = parseFloat(parts[1]);
      if (!isNaN(x) && !isNaN(y)) {
        data.push({ x, y });
      }
    }
  }
  data.sort((a, b) => a.x - b.x);
  return data;
}

export function applyBaseline(
  data: Array<{ x: number; y: number }>,
  method: 'Rubberband' | 'ALS' | 'Polynomial' | 'Rolling Ball'
): Array<{ x: number; y: number }> {
  if (data.length === 0) return [];

  let baseline: number[];
  if (method === 'Rubberband') {
    baseline = rubberbandBaseline(data);
  } else if (method === 'ALS') {
    baseline = alsBaseline(data);
  } else if (method === 'Rolling Ball') {
    baseline = rollingBallBaseline(data);
  } else {
    // Polynomial Fit
    const xMin = data[0].x;
    const xMax = data[data.length - 1].x;
    const xSpan = xMax - xMin || 1;
    const normPoints = data.map(p => ({
      x: (p.x - xMin) / xSpan * 2 - 1,
      y: p.y
    }));

    let currentPoints = normPoints.map(p => ({ ...p }));
    let coeffs = new Array(4).fill(0);
    for (let iter = 0; iter < 10; iter++) {
      coeffs = fitPolynomial(currentPoints, 3);
      currentPoints = normPoints.map(p => {
        let polyVal = 0;
        for (let d = 0; d < coeffs.length; d++) {
          polyVal += coeffs[d] * Math.pow(p.x, d);
        }
        return {
          x: p.x,
          y: Math.max(0, Math.min(p.y, polyVal))
        };
      });
    }
    baseline = data.map((p, idx) => {
      const xn = normPoints[idx].x;
      let val = 0;
      for (let d = 0; d < coeffs.length; d++) {
        val += coeffs[d] * Math.pow(xn, d);
      }
      return Math.max(0, val);
    });
  }

  return data.map((p, i) => ({
    x: p.x,
    y: Math.max(0, p.y - baseline[i])
  }));
}

export function applySmoothing(
  data: Array<{ x: number; y: number }>,
  method: 'Savitzky-Golay' | 'Moving Average'
): Array<{ x: number; y: number }> {
  const n = data.length;
  if (n === 0) return [];
  if (n < 5) return data.map(p => ({ ...p }));

  const result = data.map(p => ({ ...p }));
  const windowSize = 9;
  const degree = 3;

  if (method === 'Savitzky-Golay') {
    const coeffs = savitzkyGolayCoefficients(windowSize, degree);
    const m = Math.floor(windowSize / 2);

    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let k = 0; k < windowSize; k++) {
        let idx = i - m + k;
        if (idx < 0) {
          idx = -idx;
        } else if (idx >= n) {
          idx = 2 * n - 2 - idx;
        }
        sum += coeffs[k] * data[idx].y;
      }
      result[i].y = sum;
    }
  } else {
    const m = Math.floor(windowSize / 2);
    for (let i = 0; i < n; i++) {
      let sum = 0;
      let count = 0;
      for (let k = -m; k <= m; k++) {
        const idx = i + k;
        if (idx >= 0 && idx < n) {
          sum += data[idx].y;
          count++;
        }
      }
      result[i].y = sum / count;
    }
  }

  return result;
}

export function applyNormalization(
  data: Array<{ x: number; y: number }>,
  method: 'Min-max' | 'Area' | 'Vector'
): Array<{ x: number; y: number }> {
  if (data.length === 0) return [];

  const yVals = data.map(p => p.y);
  const min = Math.min(...yVals);
  const max = Math.max(...yVals);

  if (method === 'Min-max') {
    const range = max - min || 1;
    return data.map(p => ({
      x: p.x,
      y: (p.y - min) / range
    }));
  } else if (method === 'Area') {
    let area = 0;
    for (let i = 0; i < data.length - 1; i++) {
      const dx = Math.abs(data[i+1].x - data[i].x);
      const avgY = (data[i].y + data[i+1].y) / 2;
      area += avgY * dx;
    }
    if (area === 0) area = 1;
    return data.map(p => ({
      x: p.x,
      y: p.y / area
    }));
  } else if (method === 'Vector') {
    const sumSquares = yVals.reduce((acc, val) => acc + val * val, 0);
    const norm = Math.sqrt(sumSquares) || 1;
    return data.map(p => ({
      x: p.x,
      y: p.y / norm
    }));
  }

  return data.map(p => ({ ...p }));
}

export function removeCosmicRays(data: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  if (data.length < 5) return data.map(p => ({ ...p }));

  const result = data.map(p => ({ ...p }));
  const n = data.length;

  for (let i = 2; i < n - 2; i++) {
    const window = [data[i-2].y, data[i-1].y, data[i].y, data[i+1].y, data[i+2].y];
    const sorted = [...window].sort((a, b) => a - b);
    const median = sorted[2];

    const windowNoCenter = [data[i-2].y, data[i-1].y, data[i+1].y, data[i+2].y];
    const sortedNoCenter = [...windowNoCenter].sort((a, b) => a - b);
    const medianNoCenter = (sortedNoCenter[1] + sortedNoCenter[2]) / 2;
    const mad = windowNoCenter.reduce((acc, val) => acc + Math.abs(val - medianNoCenter), 0) / 4;

    const threshold = Math.max(5 * mad, 5.0);

    if (data[i].y - median > threshold) {
      result[i].y = median;
    }
  }
  return result;
}

export function identifyFunctionalGroups(
  peaks: any[],
  technique: 'FTIR' | 'RAMAN'
): PeakAssignmentResult[] {
  const library = UNIVERSAL_SPECTRAL_LIBRARY[technique] || [];
  const results: PeakAssignmentResult[] = [];

  for (const peak of peaks) {
    const pos = typeof peak.position === 'number' ? peak.position :
                typeof peak.wavenumber === 'number' ? peak.wavenumber :
                typeof peak.ramanShift === 'number' ? peak.ramanShift :
                typeof peak.x === 'number' ? peak.x : 0;

    const val = typeof peak.intensity === 'number' ? peak.intensity :
                typeof peak.y === 'number' ? peak.y : 0;

    if (pos === 0) continue;

    const matches = library.filter(range => pos >= range.min && pos <= range.max);
    if (matches.length > 0) {
      const bestMatch = matches[0];
      const center = (bestMatch.min + bestMatch.max) / 2;
      const rangeSpan = bestMatch.max - bestMatch.min || 1;
      const distance = Math.abs(pos - center);
      const confidence = Math.max(50, Math.round(100 * (1 - (distance / (rangeSpan / 2)) * 0.5)));

      results.push({
        position: pos,
        intensity: val,
        assignment: bestMatch.assignment,
        confidence: confidence,
        details: bestMatch.description
      });
    }
  }

  return results;
}

export function identifyMaterialFeatures(
  peaks: any[],
  technique: 'XRD' | 'FTIR' | 'RAMAN',
  industryFilter: string
): PeakAssignmentResult[] {
  let normalizedIndustry: 'Pharma' | 'Polymers' | 'Advanced Energy' | 'Minerals/Catalysts' | 'All' = 'All';
  const filterLower = (industryFilter || '').toLowerCase();

  if (
    filterLower.includes('ยา') ||
    filterLower.includes('pharma') ||
    filterLower.includes('organic') ||
    filterLower.includes('api')
  ) {
    normalizedIndustry = 'Pharma';
  } else if (
    filterLower.includes('พลาสติก') ||
    filterLower.includes('polymer') ||
    filterLower.includes('pet') ||
    filterLower.includes('nylon') ||
    filterLower.includes('macromolecule')
  ) {
    normalizedIndustry = 'Polymers';
  } else if (
    filterLower.includes('นาโน') ||
    filterLower.includes('พลังงาน') ||
    filterLower.includes('energy') ||
    filterLower.includes('semiconductor') ||
    filterLower.includes('solar') ||
    filterLower.includes('mxene') ||
    filterLower.includes('physics') ||
    filterLower.includes('solid state')
  ) {
    normalizedIndustry = 'Advanced Energy';
  } else if (
    filterLower.includes('แร่') ||
    filterLower.includes('เร่ง') ||
    filterLower.includes('mineral') ||
    filterLower.includes('catalyst') ||
    filterLower.includes('zeolite') ||
    filterLower.includes('spinel') ||
    filterLower.includes('ferrite') ||
    filterLower.includes('inorganic')
  ) {
    normalizedIndustry = 'Minerals/Catalysts';
  }

  const library = UNIVERSAL_MASTER_LIBRARY;
  const results: PeakAssignmentResult[] = [];

  for (const peak of peaks) {
    let pos = 0;
    if (typeof peak === 'number') {
      pos = peak;
    } else if (peak) {
      pos = typeof peak.position === 'number' ? peak.position :
            typeof peak.wavenumber === 'number' ? peak.wavenumber :
            typeof peak.ramanShift === 'number' ? peak.ramanShift :
            typeof peak.x === 'number' ? peak.x : 0;
    }
    if (pos === 0 || isNaN(pos)) continue;

    let val = 100;
    if (peak && typeof peak === 'object') {
      val = typeof peak.intensity === 'number' ? peak.intensity :
            typeof peak.y === 'number' ? peak.y : 100;
    }

    let bestMatch: {
      assignment: string;
      confidence: number;
      details: string;
    } | null = null;

    for (const entry of library) {
      if (normalizedIndustry !== 'All' && entry.industry !== normalizedIndustry) {
        continue;
      }

      if (technique === 'XRD' && entry.xrdPeaks) {
        for (const ref of entry.xrdPeaks) {
          const diff = Math.abs(pos - ref.position);
          if (diff <= 0.35) {
            const confidence = Math.max(50, Math.round(100 - (diff / 0.35) * 50));
            const hklText = ref.hkl ? ` (${ref.hkl})` : '';
            const assignment = `${entry.name}${hklText}`;
            const details = `Matched with ${entry.name} reference peak at ${ref.position}° 2-theta. hkl: ${ref.hkl || 'N/A'}. (Diff: ${diff.toFixed(2)}°)`;

            if (!bestMatch || confidence > bestMatch.confidence) {
              bestMatch = { assignment, confidence, details };
            }
          }
        }
      } else if (technique === 'FTIR' && entry.ftirBands) {
        for (const band of entry.ftirBands) {
          if (pos >= band.min && pos <= band.max) {
            const center = (band.min + band.max) / 2;
            const span = band.max - band.min || 1;
            const diff = Math.abs(pos - center);
            const confidence = Math.max(50, Math.round(100 - (diff / (span / 2)) * 50));
            const assignment = `${entry.name} - ${band.assignment}`;
            const details = `${band.description} (Band range: ${band.min}-${band.max} cm⁻¹)`;

            if (!bestMatch || confidence > bestMatch.confidence) {
              bestMatch = { assignment, confidence, details };
            }
          }
        }
      } else if (technique === 'RAMAN' && entry.ramanModes) {
        for (const mode of entry.ramanModes) {
          if (pos >= mode.min && pos <= mode.max) {
            const center = (mode.min + mode.max) / 2;
            const span = mode.max - mode.min || 1;
            const diff = Math.abs(pos - center);
            const confidence = Math.max(50, Math.round(100 - (diff / (span / 2)) * 50));
            const assignment = `${entry.name} - ${mode.assignment}`;
            const details = `${mode.description} (Mode range: ${mode.min}-${mode.max} cm⁻¹)`;

            if (!bestMatch || confidence > bestMatch.confidence) {
              bestMatch = { assignment, confidence, details };
            }
          }
        }
      }
    }

    if (bestMatch) {
      results.push({
        position: pos,
        intensity: val,
        assignment: bestMatch.assignment,
        confidence: bestMatch.confidence,
        details: bestMatch.details
      });
    } else {
      results.push({
        position: pos,
        intensity: val,
        assignment: 'Unassigned',
        confidence: 0,
        details: `No reference peak found in selected industry mode (${normalizedIndustry})`
      });
    }
  }

  return results;
}


