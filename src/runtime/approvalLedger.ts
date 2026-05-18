import type { ApprovalActionPreview, ApprovalActionType, ApprovalRiskLevel } from './actionApproval';
import type { EvidenceBundleSource } from './evidenceBundle';
import type {
  EvidenceSourceMode,
  PermissionMode,
  RuntimeApprovalStatus,
  RuntimeMode,
} from './difaryxRuntimeMode';

const APPROVAL_LEDGER_STORAGE_KEY = 'difaryx-approval-ledger:v1';
const MAX_LEDGER_ENTRIES = 120;

export type ApprovalLedgerDecision =
  | 'preview_opened'
  | 'local_preview_continued'
  | 'blocked_connected_write'
  | 'cancelled';

export interface ApprovalLedgerEntry {
  ledgerId: string;
  timestamp: string;
  actionId: string;
  actionType: ApprovalActionType;
  actionLabel: string;
  projectId: string;
  projectName: string;
  sampleIdentity: string;
  bundleId?: string;
  sourceMode: EvidenceSourceMode | EvidenceBundleSource;
  runtimeMode: RuntimeMode;
  permissionMode: PermissionMode;
  approvalStatus: RuntimeApprovalStatus;
  decision: ApprovalLedgerDecision;
  riskLevel: ApprovalRiskLevel;
  destinationLabel: string;
  evidenceSummary: string[];
  validationGaps: string[];
  claimBoundary: string[];
  supportedAssignment: string;
  reviewerLabel: string;
  notes: string;
}

export interface ApprovalLedgerState {
  entries: ApprovalLedgerEntry[];
  lastUpdatedAt: string | null;
}

interface CreateApprovalLedgerEntryOptions {
  reviewerLabel?: string;
  notes?: string;
}

export interface ApprovalLedgerSummary {
  entries: ApprovalLedgerEntry[];
  total: number;
  lastUpdatedAt: string | null;
  byDecision: Record<ApprovalLedgerDecision, number>;
  recentLines: string[];
}

const EMPTY_STATE: ApprovalLedgerState = {
  entries: [],
  lastUpdatedAt: null,
};

function canUseLocalStorage() {
  try {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
  } catch {
    return false;
  }
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function asLedgerDecision(value: unknown): ApprovalLedgerDecision {
  if (
    value === 'preview_opened' ||
    value === 'local_preview_continued' ||
    value === 'blocked_connected_write' ||
    value === 'cancelled'
  ) {
    return value;
  }
  return 'preview_opened';
}

function normalizeLedgerEntry(value: unknown): ApprovalLedgerEntry | null {
  if (!value || typeof value !== 'object') return null;
  const entry = value as Partial<ApprovalLedgerEntry>;
  if (!entry.actionId || !entry.actionLabel || !entry.projectId) return null;
  return {
    ledgerId: typeof entry.ledgerId === 'string' ? entry.ledgerId : createLedgerId(),
    timestamp: typeof entry.timestamp === 'string' ? entry.timestamp : new Date().toISOString(),
    actionId: String(entry.actionId),
    actionType: entry.actionType ?? 'external_share',
    actionLabel: String(entry.actionLabel),
    projectId: String(entry.projectId),
    projectName: typeof entry.projectName === 'string' ? entry.projectName : 'Unknown project',
    sampleIdentity: typeof entry.sampleIdentity === 'string' ? entry.sampleIdentity : 'Unknown sample',
    bundleId: typeof entry.bundleId === 'string' ? entry.bundleId : undefined,
    sourceMode: entry.sourceMode ?? 'demo_preloaded',
    runtimeMode: entry.runtimeMode ?? 'demo',
    permissionMode: entry.permissionMode ?? 'read_only',
    approvalStatus: entry.approvalStatus ?? 'not_required',
    decision: asLedgerDecision(entry.decision),
    riskLevel: entry.riskLevel ?? 'medium',
    destinationLabel: typeof entry.destinationLabel === 'string' ? entry.destinationLabel : 'Local preview',
    evidenceSummary: asStringArray(entry.evidenceSummary),
    validationGaps: asStringArray(entry.validationGaps),
    claimBoundary: asStringArray(entry.claimBoundary),
    supportedAssignment: typeof entry.supportedAssignment === 'string' ? entry.supportedAssignment : 'Evidence-linked assignment pending',
    reviewerLabel: typeof entry.reviewerLabel === 'string' ? entry.reviewerLabel : 'Local demo reviewer',
    notes: typeof entry.notes === 'string' ? entry.notes : 'Local approval preview ledger entry.',
  };
}

function safeParseState(value: string | null): ApprovalLedgerState {
  if (!value) return EMPTY_STATE;
  try {
    const parsed = JSON.parse(value) as Partial<ApprovalLedgerState>;
    const entries = Array.isArray(parsed.entries)
      ? parsed.entries.map(normalizeLedgerEntry).filter((entry): entry is ApprovalLedgerEntry => Boolean(entry))
      : [];
    return {
      entries,
      lastUpdatedAt: typeof parsed.lastUpdatedAt === 'string' ? parsed.lastUpdatedAt : null,
    };
  } catch {
    return EMPTY_STATE;
  }
}

function writeApprovalLedgerState(state: ApprovalLedgerState) {
  if (!canUseLocalStorage()) return;
  try {
    window.localStorage.setItem(APPROVAL_LEDGER_STORAGE_KEY, JSON.stringify(state));
    window.dispatchEvent(new Event('difaryx-approval-ledger-updated'));
  } catch {
    // Ledger persistence is best-effort and must never break the route.
  }
}

function createLedgerId() {
  const randomId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `ledger-${randomId}`;
}

function defaultNotes(decision: ApprovalLedgerDecision, action: ApprovalActionPreview) {
  if (decision === 'preview_opened') return 'Approval preview opened in the deterministic frontend.';
  if (decision === 'local_preview_continued') return 'Researcher continued the local preview. No external write executed.';
  if (decision === 'blocked_connected_write') return action.blockedReason;
  return 'Approval preview closed without continuing the local preview.';
}

export function createApprovalLedgerEntry(
  action: ApprovalActionPreview,
  decision: ApprovalLedgerDecision,
  options: CreateApprovalLedgerEntryOptions = {},
): ApprovalLedgerEntry {
  return {
    ledgerId: createLedgerId(),
    timestamp: new Date().toISOString(),
    actionId: action.actionId,
    actionType: action.actionType,
    actionLabel: action.actionLabel,
    projectId: action.projectId,
    projectName: action.projectName,
    sampleIdentity: action.sampleIdentity,
    bundleId: action.bundleId,
    sourceMode: action.bundleSourceMode ?? action.sourceMode,
    runtimeMode: action.runtimeMode,
    permissionMode: action.permissionMode,
    approvalStatus: action.approvalStatus,
    decision,
    riskLevel: action.riskLevel,
    destinationLabel: action.destinationLabel,
    evidenceSummary: (action.evidenceSummary ?? []).slice(0, 6),
    validationGaps: (action.validationGaps ?? []).slice(0, 6),
    claimBoundary: (action.claimBoundary ?? []).slice(0, 6),
    supportedAssignment: action.supportedAssignment ?? 'Evidence-linked assignment pending',
    reviewerLabel: options.reviewerLabel ?? 'Local demo reviewer',
    notes: options.notes ?? defaultNotes(decision, action),
  };
}

export function appendApprovalLedgerEntry(entry: ApprovalLedgerEntry): ApprovalLedgerState {
  const current = getApprovalLedgerState();
  const nextState = {
    entries: [entry, ...(current.entries ?? [])].slice(0, MAX_LEDGER_ENTRIES),
    lastUpdatedAt: entry.timestamp,
  };
  writeApprovalLedgerState(nextState);
  return nextState;
}

export function getApprovalLedgerState(): ApprovalLedgerState {
  if (!canUseLocalStorage()) return EMPTY_STATE;
  try {
    return safeParseState(window.localStorage.getItem(APPROVAL_LEDGER_STORAGE_KEY));
  } catch {
    return EMPTY_STATE;
  }
}

export function getApprovalLedgerEntries(): ApprovalLedgerEntry[] {
  return getApprovalLedgerState().entries;
}

export function clearApprovalLedger(): ApprovalLedgerState {
  const nextState = { entries: [], lastUpdatedAt: new Date().toISOString() };
  writeApprovalLedgerState(nextState);
  return nextState;
}

export function getLedgerEntriesForProject(projectId: string): ApprovalLedgerEntry[] {
  return getApprovalLedgerEntries().filter((entry) => entry.projectId === projectId);
}

export function getLedgerEntriesForBundle(bundleId: string): ApprovalLedgerEntry[] {
  return getApprovalLedgerEntries().filter((entry) => entry.bundleId === bundleId);
}

export function summarizeApprovalLedger(options: {
  projectId?: string;
  bundleId?: string;
  limit?: number;
} = {}): ApprovalLedgerSummary {
  const state = getApprovalLedgerState();
  const filtered = (state.entries ?? []).filter((entry) => {
    if (options.projectId && entry.projectId !== options.projectId) return false;
    if (options.bundleId && entry.bundleId !== options.bundleId) return false;
    return true;
  });
  const byDecision: Record<ApprovalLedgerDecision, number> = {
    preview_opened: 0,
    local_preview_continued: 0,
    blocked_connected_write: 0,
    cancelled: 0,
  };
  filtered.forEach((entry) => {
    byDecision[entry.decision] += 1;
  });
  const recentLines = filtered.slice(0, options.limit ?? 4).map((entry) =>
    `${entry.timestamp}: ${entry.actionLabel} / ${entry.decision} / ${entry.permissionMode} / ${entry.projectName}`,
  );

  return {
    entries: filtered,
    total: filtered.length,
    lastUpdatedAt: state.lastUpdatedAt,
    byDecision,
    recentLines,
  };
}
