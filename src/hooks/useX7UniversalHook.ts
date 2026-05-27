import { useState, useEffect } from 'react';

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

  // External Intelligence Hook
  searchScholar: (query: string) => Promise<ScholarReference[]>;
  compareContext: (
    experiment: { wavelength: number; material: string; temperature: number },
    reference: { wavelength: number; material: string; temperature: number }
  ) => ReliabilityReport;

  // Immutable State Logic
  snapshots: ImmutableResearchSnapshot[];
  saveSnapshot: (
    state: any,
    provenance: { instrumentFingerprint: string; softwareVersion: string }
  ) => ImmutableResearchSnapshot;
  verifySnapshot: (id: string, currentState: any) => boolean;
  clearSnapshots: () => void;
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

// ============================================================================
// Hook Implementation
// ============================================================================

const STORAGE_KEYS = {
  STRIPE_QUOTA: 'difaryx_x7_stripe_quota',
  DRIVE_STORAGE: 'difaryx_x7_drive_storage',
  GMAIL_CONNECTED: 'difaryx_x7_gmail_connected',
  SNAPSHOTS: 'difaryx_immutable_snapshots',
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

  // 3. Gmail Connection State Setup
  const [gmailConnected, setGmailConnected] = useState<boolean>(() => {
    return localStorage.getItem(STORAGE_KEYS.GMAIL_CONNECTED) === 'true';
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

  // Synchronize States to Local Storage on Change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.STRIPE_QUOTA, JSON.stringify(quotaState));
  }, [quotaState]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.DRIVE_STORAGE, JSON.stringify(driveStorage));
  }, [driveStorage]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.GMAIL_CONNECTED, String(gmailConnected));
  }, [gmailConnected]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.SNAPSHOTS, JSON.stringify(snapshots));
  }, [snapshots]);

  // ==========================================================================
  // Stripe Monetization & Quota Logic (with SaaS Hard Locks)
  // ==========================================================================

  // Determine if active trial remains (within 14 days)
  const isTrialActive = () => {
    const start = new Date(quotaState.trialStartDate).getTime();
    const now = Date.now();
    const diffDays = (now - start) / (1000 * 60 * 60 * 24);
    return diffDays >= 0 && diffDays < 14;
  };

  const hasPremiumAccess = quotaState.premiumActive || isTrialActive();

  /**
   * Evaluates if there is enough quota remaining.
   * Throws an error (Hard Lock) if premium access is invalid or quota limits are breached.
   */
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

  /**
   * Reports usage of a specific API call.
   * Increments usage counters and reports to Stripe.
   * Throws an error (Hard Lock) if the action is blocked due to subscription or quota issues.
   */
  const reportUsageToStripe = (service: 'bright-data' | 'gemini-pro', amount: number): void => {
    // Check quota first (throws Error if locked or full)
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
  // Workspace Integration (Google Drive Storage & Gmail Scans)
  // ==========================================================================

  const uploadToDrive = async (fileName: string, content: string): Promise<{ id: string; url: string }> => {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 600));

    const contentBytes = new Blob([content]).size;
    const newUsage = Math.min(
      driveStorage.storageUsageBytes + contentBytes,
      driveStorage.storageLimitBytes
    );

    setDriveStorage((prev) => ({
      ...prev,
      storageUsageBytes: newUsage,
    }));

    const fileId = `gdrive_sa_${Math.random().toString(36).substring(2, 10)}`;
    const url = `https://drive.google.com/file/d/${fileId}/view?usp=drivesdk`;

    console.log(`[Google Drive] Service Account uploaded file: ${fileName} (${contentBytes} bytes). Path: difaryx-storage@...`);

    return { id: fileId, url };
  };

  const connectGmail = () => setGmailConnected(true);
  const disconnectGmail = () => setGmailConnected(false);

  const scanGmail = async (query: string = ''): Promise<GmailEmailResult[]> => {
    if (!gmailConnected) {
      throw new Error('Gmail integration not connected. Authenticate via User OAuth first.');
    }

    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 800));

    // Mock data lake email source containing lab reports and scientific spectra
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

    // Filter based on search query
    if (!query) return mockEmails;
    const lowerQuery = query.toLowerCase();
    return mockEmails.filter(
      (email) =>
        email.subject.toLowerCase().includes(lowerQuery) ||
        email.body.toLowerCase().includes(lowerQuery) ||
        email.sender.toLowerCase().includes(lowerQuery)
    );
  };

  // ==========================================================================
  // External Intelligence & Google Scholar (Bright Data)
  // ==========================================================================

  const searchScholar = async (query: string): Promise<ScholarReference[]> => {
    // Track usage to Stripe (throws if out of quota / no premium)
    reportUsageToStripe('bright-data', 1);

    // Simulate Bright Data SERP request latency
    await new Promise((resolve) => setTimeout(resolve, 900));

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

    // Filter references loosely by search query keywords
    const keywords = query.toLowerCase().split(/\s+/);
    return mockReferences.filter((ref) => {
      const matchText = `${ref.title} ${ref.journal} ${ref.conditions.material}`.toLowerCase();
      return keywords.some((kw) => matchText.includes(kw));
    });
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
      // Linear scaling deduction: 20 points at 5K diff down to 0 points at 50K diff
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
  // Immutable Research Snapshots (Integrity Protection & Prevent Overwrite)
  // ==========================================================================

  const saveSnapshot = (
    state: any,
    provenance: { instrumentFingerprint: string; softwareVersion: string }
  ): ImmutableResearchSnapshot => {
    // 1. Compute deterministic hash
    const stateHash = computeDeterministicHash(state);
    const snapshotId = `snap_${stateHash.substring(0, 12)}`;

    // 2. Enforce strictly write-once immutability in local storage
    const exists = snapshots.some((snap) => snap.id === snapshotId || snap.hash === stateHash);
    if (exists) {
      throw new Error(
        `Integrity Violation Error: A research snapshot with this content/ID [${snapshotId}] already exists. Overwriting historical research memory is strictly blocked to preserve absolute data provenance.`
      );
    }

    const newSnapshot: ImmutableResearchSnapshot = {
      id: snapshotId,
      timestamp: new Date().toISOString(),
      hash: stateHash,
      state,
      provenance: {
        instrumentFingerprint: provenance.instrumentFingerprint,
        softwareVersion: provenance.softwareVersion,
      },
    };

    setSnapshots((prev) => [...prev, newSnapshot]);
    console.log(`[Research Integrity] Saved immutable snapshot: ${snapshotId}. Hash: ${stateHash}`);

    return newSnapshot;
  };

  const verifySnapshot = (id: string, currentState: any): boolean => {
    const snapshot = snapshots.find((snap) => snap.id === id);
    if (!snapshot) {
      console.warn(`[Research Integrity] Verification failed: Snapshot ID [${id}] not found.`);
      return false;
    }

    const calculatedHash = computeDeterministicHash(currentState);
    const isValid = calculatedHash === snapshot.hash;

    if (isValid) {
      console.log(`[Research Integrity] Verification PASSED for snapshot ${id}. Data matches hash.`);
    } else {
      console.error(
        `[Research Integrity] Verification FAILED for snapshot ${id}! Expected: ${snapshot.hash}, Calculated: ${calculatedHash}`
      );
    }

    return isValid;
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

    searchScholar,
    compareContext,

    snapshots,
    saveSnapshot,
    verifySnapshot,
    clearSnapshots,
  };
}
