import { logSessionActivity } from './provenanceTimeline';

const EXPORTABLE_KEY_PREFIXES = [
  'difaryx-workflow-notebook-entries',
  'difaryx-workflow-processing-results',
  'difaryx-workflow-discussion-refinements',
  'difaryx-analysis-sessions-v1',
  'difaryx.uploadedSignalRuns.v1',
  'difaryx.xrdLocalReferences.v1',
  'difaryx-parameter-state:v2:',
  'difaryx-parameter-history-v1:',
  'difaryx-xrd-backend-evidence-v1',
  'difaryx-approval-ledger:v1',
  'difaryx-technique-session:',
  'difaryx-session-portability-log-v1',
];

export interface SessionPackageManifest {
  packageVersion: string;
  createdAt: string;
  projectId?: string;
  techniques: string[];
  entryCount: number;
  reportCount: number;
}

export interface SessionPackage {
  manifest: SessionPackageManifest;
  storageData: Record<string, string>;
}

/**
 * Check if a localStorage key is exportable based on explicit registry
 */
function isKeyExportable(key: string): boolean {
  return EXPORTABLE_KEY_PREFIXES.some((prefix) => key.startsWith(prefix));
}

/**
 * Generate package manifest from current localStorage state
 */
export function generateManifest(projectId?: string): SessionPackageManifest {
  const now = new Date().toISOString();
  
  // Count techniques with sessions or uploads
  const techniquesSet = new Set<string>();
  try {
    const sessionsRaw = window.localStorage.getItem('difaryx-analysis-sessions-v1');
    if (sessionsRaw) {
      const sessions = JSON.parse(sessionsRaw);
      if (Array.isArray(sessions)) {
        sessions.forEach((s: any) => s?.technique && techniquesSet.add(s.technique.toLowerCase()));
      }
    }
  } catch (e) {
    console.warn('Failed to parse sessions for manifest:', e);
  }

  // Count notebook entries
  let entryCount = 0;
  try {
    const entriesRaw = window.localStorage.getItem('difaryx-workflow-notebook-entries');
    if (entriesRaw) {
      const entries = JSON.parse(entriesRaw);
      if (Array.isArray(entries)) entryCount = entries.length;
    }
  } catch (e) {
    console.warn('Failed to parse notebook entries for manifest:', e);
  }

  // Count reports (from approval ledger)
  let reportCount = 0;
  try {
    const ledgerRaw = window.localStorage.getItem('difaryx-approval-ledger:v1');
    if (ledgerRaw) {
      const ledger = JSON.parse(ledgerRaw);
      if (ledger && typeof ledger === 'object' && Array.isArray(ledger.entries)) {
        reportCount = ledger.entries.filter((e: any) => e.actionType === 'report_export' || e.actionType === 'report_generation').length;
      }
    }
  } catch (e) {
    console.warn('Failed to parse approval ledger for manifest:', e);
  }

  return {
    packageVersion: '2.0.0',
    createdAt: now,
    projectId,
    techniques: Array.from(techniquesSet),
    entryCount,
    reportCount,
  };
}

/**
 * Build the exportable session package
 */
export function buildSessionPackage(projectId?: string): SessionPackage {
  const manifest = generateManifest(projectId);
  const storageData: Record<string, string> = {};

  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (key && isKeyExportable(key)) {
      const val = window.localStorage.getItem(key);
      if (val !== null) {
        storageData[key] = val;
      }
    }
  }

  return {
    manifest,
    storageData,
  };
}

/**
 * Download the session package as a .difaryx file
 */
export function downloadSessionBundle(projectId?: string): void {
  const sessionPackage = buildSessionPackage(projectId);
  const jsonText = JSON.stringify(sessionPackage, null, 2);
  const blob = new Blob([jsonText], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = projectId 
    ? `difaryx-session-${projectId}-${dateStr}.difaryx`
    : `difaryx-session-full-${dateStr}.difaryx`;

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 400);

  // Log session export
  logSessionActivity('session_exported', projectId ? `Session bundle exported for project "${projectId}".` : 'Full session bundle exported.');
}

/**
 * Import a session package from JSON string
 */
export function importSessionBundle(jsonText: string): { success: boolean; error?: string } {
  let parsedPackage: any;
  try {
    parsedPackage = JSON.parse(jsonText);
  } catch (e: any) {
    return { success: false, error: `Corrupted session bundle: Failed to parse package JSON (${e.message || String(e)}).` };
  }
  
  try {
    // Validate package structure
    if (!parsedPackage || typeof parsedPackage !== 'object') {
      return { success: false, error: 'Invalid DIFARYX package: Bundle structure is invalid.' };
    }
    
    const { manifest, storageData } = parsedPackage;
    if (!manifest || typeof manifest !== 'object' || !storageData || typeof storageData !== 'object') {
      return { success: false, error: 'Invalid DIFARYX package: Manifest or storage payload is missing.' };
    }

    // Validate schema version
    if (!manifest.packageVersion || typeof manifest.packageVersion !== 'string') {
      return { success: false, error: 'Invalid DIFARYX package: Schema version identifier is missing.' };
    }
    
    if (!manifest.packageVersion.startsWith('2.')) {
      return { success: false, error: `Unsupported package version: Package version "${manifest.packageVersion}" is incompatible with this system (requires v2.x.x).` };
    }

    // Validate manifest integrity
    if (!Array.isArray(manifest.techniques)) {
      return { success: false, error: 'Invalid DIFARYX package: Manifest technique registry is missing or malformed.' };
    }

    if (!manifest.createdAt || isNaN(Date.parse(manifest.createdAt))) {
      return { success: false, error: 'Invalid DIFARYX package: Manifest timestamp is missing or invalid.' };
    }

    // Check key compatibility and count active keys
    const entries = Object.entries(storageData);
    if (entries.length === 0) {
      return { success: false, error: 'Invalid DIFARYX package: The bundle contains no active session or workflow data.' };
    }

    const hasValidKey = entries.some(([key]) => isKeyExportable(key));
    if (!hasValidKey) {
      return { success: false, error: 'Invalid DIFARYX package: The bundle contains no recognized DIFARYX data keys.' };
    }

    // Clear current exportable localStorage keys (clean import)
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && isKeyExportable(key)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => window.localStorage.removeItem(key));

    // Restore imported data
    entries.forEach(([key, val]) => {
      if (typeof val === 'string' && isKeyExportable(key)) {
        window.localStorage.setItem(key, val);
      }
    });

    // Log session import
    logSessionActivity('session_imported', `Session bundle imported with version ${manifest.packageVersion} (${manifest.entryCount} entries, ${manifest.reportCount} reports).`);

    return { success: true };
  } catch (e: any) {
    return { success: false, error: `Corrupted session bundle: System error during restoration (${e.message || String(e)}).` };
  }
}
