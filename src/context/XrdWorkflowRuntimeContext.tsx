/**
 * XRD Workflow Runtime Context
 *
 * Centralized reactive state orchestration layer for managing live XRD workflow sessions.
 * Synchronizes runtime events between execution workspace and downstream consumers.
 *
 * Phase X6A: Single source of active operational state across app surfaces during execution.
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react';
import type { XRDBackendEvidenceRecord } from '../data/xrdBackendEvidence';
import { readLatestXrdBackendEvidenceResult } from '../data/xrdBackendEvidence';
import {
  selectXrdWorkflowScientificEvidence,
  selectXrdWorkflowReferenceMatchEvidence,
  selectXrdDatasetContextEcho,
  selectXrdProcessingProvenance,
  extractScientificEvidenceFields,
  extractReferenceMatchFields,
} from '../data/xrdWorkflowHandoffSelectors';
import type { XrdWorkflowSession, XrdWorkflowEvent } from '../types/xrdWorkflowSession';
import { xrdSessionReducer } from '../store/xrdSessionReducer';
import { buildXrdWorkflowSession } from '../utils/xrdSessionAdapter';

// ── Runtime State Types ─────────────────────────────────────────────────

/**
 * Static schema version injected into every runtime context instance.
 * Downstream hydration checks can compare against this to detect stale evidence.
 */
export const DIFARYX_XRD_SCHEMA_VERSION = '1.1.0';

// ── Session Persistence ─────────────────────────────────────────────────

/**
 * sessionStorage key for lightweight runtime session pointers.
 * Heavy data stays in localStorage; this only holds metadata for hydration.
 */
const XRD_RUNTIME_SESSION_KEY = 'difaryx_xrd_runtime_session';

/**
 * Lightweight packet persisted to sessionStorage.
 * Contains only version + lookup pointers — never raw graph/signal data.
 */
interface XrdRuntimeSessionPacket {
  version: string;
  projectId: string;
  uploadedRunId?: string;
  fileName?: string;
  isValidated7E4: boolean;
}

function readSessionPacket(): XrdRuntimeSessionPacket | null {
  try {
    if (typeof window === 'undefined') return null;
    const raw = window.sessionStorage.getItem(XRD_RUNTIME_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as XrdRuntimeSessionPacket;
  } catch {
    return null;
  }
}

function writeSessionPacket(packet: XrdRuntimeSessionPacket): void {
  try {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(XRD_RUNTIME_SESSION_KEY, JSON.stringify(packet));
  } catch {
    // Silently ignore quota errors.
  }
}

function clearSessionPacket(): void {
  try {
    if (typeof window === 'undefined') return;
    window.sessionStorage.removeItem(XRD_RUNTIME_SESSION_KEY);
  } catch {
    // Silently ignore.
  }
}

/**
 * Hydrate runtime state from a sessionStorage pointer.
 * Resolves the full evidence record from localStorage via the data layer.
 * Returns null (triggering a version-mismatch notification) if the schema
 * version doesn't match DIFARYX_XRD_SCHEMA_VERSION.
 */
function hydrateFromSession(): {
  evidence: XRDBackendEvidenceRecord | null;
  isValidated7E4: boolean;
  resetNotification: string | null;
} {
  const packet = readSessionPacket();
  if (!packet) {
    return { evidence: null, isValidated7E4: false, resetNotification: null };
  }

  // Schema version gate
  if (packet.version !== DIFARYX_XRD_SCHEMA_VERSION) {
    clearSessionPacket();
    return {
      evidence: null,
      isValidated7E4: false,
      resetNotification:
        `Session data was created with schema v${packet.version} but the current runtime requires v${DIFARYX_XRD_SCHEMA_VERSION}. Session has been safely reset.`,
    };
  }

  // Resolve full record from localStorage via existing data-layer helper
  const record = readLatestXrdBackendEvidenceResult(
    packet.projectId,
    packet.uploadedRunId ?? undefined,
  );

  if (!record) {
    // Pointer exists but the underlying record was evicted — clean up gracefully
    clearSessionPacket();
    return { evidence: null, isValidated7E4: false, resetNotification: null };
  }

  return {
    evidence: record,
    isValidated7E4: packet.isValidated7E4,
    resetNotification: null,
  };
}

/**
 * XRD workflow pipeline execution stages.
 * Represents the current active processing step.
 */
export type XrdWorkflowStage =
  | 'baseline'
  | 'smooth'
  | 'peak_detect'
  | 'fit_peaks'
  | 'match_ref'
  | 'boundary'
  | null;

/**
 * Current evidence in the runtime session.
 * Canonical shape: only a fully-persisted backend evidence record, or null.
 */
export type XrdRuntimeEvidence = XRDBackendEvidenceRecord | null;

/**
 * Type guard: checks whether a value is a valid XRDBackendEvidenceRecord.
 * Use this before accessing evidence fields from the runtime context.
 */
export function isXrdBackendEvidenceRecord(value: unknown): value is XRDBackendEvidenceRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.projectId === 'string' &&
    typeof record.timestamp === 'string' &&
    typeof record.detectedPeakCount === 'number' &&
    typeof record.fittedPeakCount === 'number' &&
    typeof record.snRatio === 'number' &&
    typeof record.baselineDeviation === 'number' &&
    typeof record.isPhaseMatched === 'boolean'
  );
}

/**
 * XRD workflow runtime state.
 * Encapsulates live session information during execution.
 */
export interface XrdWorkflowRuntimeState {
  /** Current evidence (input request or output record) */
  currentEvidence: XrdRuntimeEvidence;
  
  /** Active pipeline execution stage */
  activeStage: XrdWorkflowStage;
  
  /** Phase 7E.4 validated peak extraction approval status */
  isValidated7E4: boolean;
  
  /** Background processing in progress */
  isProcessing: boolean;
  
  /** Sample identifier from current evidence */
  sampleId: string | null;
  
  /** Material class from current evidence */
  materialClass: string | null;

  /**
   * Non-null when the session was reset due to a schema version mismatch.
   * UI layers should render this as an alert banner and then dismiss it.
   */
  sessionResetNotification: string | null;

  /** Canonical workflow session (Shadow Layer) */
  currentSession: XrdWorkflowSession | null;
}

/**
 * XRD workflow runtime context actions.
 * Dispatch/updater functions for managing runtime state.
 */
export interface XrdWorkflowRuntimeActions {
  /** Update current runtime evidence */
  updateRuntimeEvidence: (evidence: XrdRuntimeEvidence) => void;
  
  /** Set active pipeline stage */
  setActiveStage: (stage: XrdWorkflowStage) => void;
  
  /** Set Phase 7E.4 validation/approval status */
  set7E4ValidationStatus: (status: boolean) => void;
  
  /** Set background processing status */
  setProcessingStatus: (isProcessing: boolean) => void;
  
  /** Reset runtime state to initial values */
  resetRuntimeState: () => void;

  /** Dismiss the session reset notification banner */
  dismissSessionResetNotification: () => void;

  /** Dispatch state machine event */
  dispatchWorkflowEvent: (event: XrdWorkflowEvent) => void;
}

/**
 * Combined runtime context value.
 * Provides both state and actions to consumers.
 */
export interface XrdWorkflowRuntimeContextValue extends XrdWorkflowRuntimeState, XrdWorkflowRuntimeActions {}

// ── Context Creation ────────────────────────────────────────────────────

const XrdWorkflowRuntimeContext = createContext<XrdWorkflowRuntimeContextValue | undefined>(undefined);

// ── Initial State ───────────────────────────────────────────────────────

const INITIAL_RUNTIME_STATE: XrdWorkflowRuntimeState = {
  currentEvidence: null,
  activeStage: null,
  isValidated7E4: false,
  isProcessing: false,
  sampleId: null,
  materialClass: null,
  sessionResetNotification: null,
};

// ── Provider Component ──────────────────────────────────────────────────

export interface XrdWorkflowRuntimeProviderProps {
  children: ReactNode;
}

/**
 * XRD Workflow Runtime Context Provider.
 * Wraps application surfaces to provide centralized runtime state.
 */
export function XrdWorkflowRuntimeProvider({ children }: XrdWorkflowRuntimeProviderProps) {
  // ── Hydrate initial state from sessionStorage on mount ───────────────
  const hydrationRef = useRef<ReturnType<typeof hydrateFromSession> | null>(null);
  if (hydrationRef.current === null) {
    hydrationRef.current = hydrateFromSession();
  }
  const hydrated = hydrationRef.current;

  const [currentEvidence, setCurrentEvidence] = useState<XrdRuntimeEvidence>(
    hydrated.evidence,
  );
  const [activeStage, setActiveStageState] = useState<XrdWorkflowStage>(null);
  const [isValidated7E4, setIsValidated7E4] = useState(hydrated.isValidated7E4);
  // Always hydrate isProcessing as false — a refresh must never resume a stuck spinner
  const [isProcessing, setIsProcessing] = useState(false);
  const [sessionResetNotification, setSessionResetNotification] = useState<string | null>(
    hydrated.resetNotification,
  );

  // Canonical Session State (Shadow Layer)
  const [currentSession, setCurrentSession] = useState<XrdWorkflowSession | null>(null);

  // Synchronize currentSession on mount or when currentEvidence hydrates
  useEffect(() => {
    if (currentEvidence) {
      setCurrentSession((prev) => {
        if (
          prev &&
          prev.evidence?.phaseMatch?.isPhaseMatched === currentEvidence.isPhaseMatched &&
          prev.evidence?.scientificEvidence?.evidenceId === currentEvidence.workflowScientificEvidence?.evidenceId
        ) {
          return prev;
        }
        return buildXrdWorkflowSession({
          sessionId: prev?.sessionId,
          isProcessing,
          activeStage,
          isValidated7E4,
          evidenceRecord: currentEvidence,
        });
      });
    } else {
      setCurrentSession(null);
    }
  }, [currentEvidence]);

  // ── State Transition Dispatcher with Controlled Shadow Sync ──────────
  const dispatchWorkflowEvent = useCallback((event: XrdWorkflowEvent) => {
    setCurrentSession((prevSession) => {
      // 1. Build initial session if not present
      const activeSession = prevSession || buildXrdWorkflowSession({
        isProcessing,
        activeStage,
        isValidated7E4,
        evidenceRecord: currentEvidence,
      });

      // 2. Reduce next state
      const nextSession = xrdSessionReducer(activeSession, event);

      // 3. Strict Transition Priority Check:
      // If reducer rejected transition (returned identical state), do not update legacy flags
      if (nextSession === activeSession) {
        return prevSession;
      }

      // 4. Controlled Shadow Sync: Update legacy flags from nextSession.runtime
      const nextRuntime = nextSession.runtime;
      
      const nextIsProcessing = nextRuntime.status === 'processing';
      if (nextIsProcessing !== isProcessing) {
        setIsProcessing(nextIsProcessing);
      }

      let nextLegacyStage: XrdWorkflowStage = null;
      if (nextRuntime.activeStage) {
        switch (nextRuntime.activeStage) {
          case 'baseline': nextLegacyStage = 'baseline'; break;
          case 'smoothing': nextLegacyStage = 'smooth'; break;
          case 'peak_detection': nextLegacyStage = 'peak_detect'; break;
          case 'fitting': nextLegacyStage = 'fit_peaks'; break;
          case 'reference_matching': nextLegacyStage = 'match_ref'; break;
          case 'handoff': nextLegacyStage = 'boundary'; break;
        }
      }
      if (nextLegacyStage !== activeStage) {
        setActiveStageState(nextLegacyStage);
      }

      const nextIsValidated7E4 = nextSession.validation?.isValidated7E4 ?? false;
      if (nextIsValidated7E4 !== isValidated7E4) {
        setIsValidated7E4(nextIsValidated7E4);
      }

      if (event.type === 'FORCE_RESET_SESSION') {
        setCurrentEvidence(null);
        setSessionResetNotification(null);
        clearSessionPacket();
      }

      return nextSession;
    });
  }, [currentEvidence, isProcessing, activeStage, isValidated7E4]);

  // ── Session sync: persist lightweight pointer on state changes ───────
  useEffect(() => {
    if (!currentEvidence) {
      clearSessionPacket();
      return;
    }

    const packet: XrdRuntimeSessionPacket = {
      version: DIFARYX_XRD_SCHEMA_VERSION,
      projectId: currentEvidence.projectId,
      ...(currentEvidence.uploadedRunId ? { uploadedRunId: currentEvidence.uploadedRunId } : {}),
      ...(currentEvidence.fileName ? { fileName: currentEvidence.fileName } : {}),
      isValidated7E4,
    };
    writeSessionPacket(packet);
  }, [currentEvidence, isValidated7E4]);

  // Derive sample information from current evidence (strict canonical shape)
  const sampleId = currentEvidence?.projectId ?? null;

  const materialClass = currentEvidence?.primaryPhase ?? null;

  // Actions
  const updateRuntimeEvidence = useCallback((evidence: XrdRuntimeEvidence) => {
    if (evidence) {
      dispatchWorkflowEvent({ type: 'COMPLETE_PROCESSING' });
    }
    setCurrentEvidence(evidence);
    setCurrentSession((prev) => {
      const base = buildXrdWorkflowSession({
        sessionId: prev?.sessionId,
        isProcessing: false,
        activeStage: null,
        isValidated7E4,
        evidenceRecord: evidence,
      });
      return {
        ...base,
        runtime: {
          ...base.runtime,
          status: prev && prev.runtime.status === 'processing' ? 'completed' : base.runtime.status,
          activeStage: prev?.runtime.activeStage,
        }
      };
    });
  }, [dispatchWorkflowEvent, isValidated7E4]);

  const setActiveStage = useCallback((stage: XrdWorkflowStage) => {
    let nextStage: 'baseline' | 'smoothing' | 'peak_detection' | 'fitting' | 'reference_matching' | 'handoff' | undefined;
    if (stage) {
      switch (stage) {
        case 'baseline': nextStage = 'baseline'; break;
        case 'smooth': nextStage = 'smoothing'; break;
        case 'peak_detect': nextStage = 'peak_detection'; break;
        case 'fit_peaks': nextStage = 'fitting'; break;
        case 'match_ref': nextStage = 'reference_matching'; break;
        case 'boundary': nextStage = 'handoff'; break;
      }
    }
    if (nextStage) {
      dispatchWorkflowEvent({ type: 'UPDATE_STAGE', payload: { stage: nextStage } });
    } else {
      setActiveStageState(null);
    }
  }, [dispatchWorkflowEvent]);

  const setProcessingStatus = useCallback((processing: boolean) => {
    if (processing) {
      let currentStage: 'baseline' | 'smoothing' | 'peak_detection' | 'fitting' | 'reference_matching' | 'handoff' = 'baseline';
      if (activeStage) {
        switch (activeStage) {
          case 'baseline': currentStage = 'baseline'; break;
          case 'smooth': currentStage = 'smoothing'; break;
          case 'peak_detect': currentStage = 'peak_detection'; break;
          case 'fit_peaks': currentStage = 'fitting'; break;
          case 'match_ref': currentStage = 'reference_matching'; break;
          case 'boundary': currentStage = 'handoff'; break;
        }
      }
      dispatchWorkflowEvent({ type: 'START_PROCESSING', payload: { stage: currentStage } });
    } else {
      setIsProcessing(false);
    }
  }, [activeStage, dispatchWorkflowEvent]);

  const set7E4ValidationStatus = useCallback((status: boolean) => {
    dispatchWorkflowEvent({ type: 'SET_VALIDATION', payload: { isValidated7E4: status } });
  }, [dispatchWorkflowEvent]);

  const resetRuntimeState = useCallback(() => {
    const newSessionId = `xrd-session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    dispatchWorkflowEvent({ type: 'FORCE_RESET_SESSION', payload: { newSessionId } });
  }, [dispatchWorkflowEvent]);

  const dismissSessionResetNotification = useCallback(() => {
    setSessionResetNotification(null);
  }, []);

  const contextValue: XrdWorkflowRuntimeContextValue = {
    // State
    currentEvidence,
    activeStage,
    isValidated7E4,
    isProcessing,
    sampleId,
    materialClass,
    sessionResetNotification,
    currentSession,
    // Actions
    updateRuntimeEvidence,
    setActiveStage,
    set7E4ValidationStatus,
    setProcessingStatus,
    resetRuntimeState,
    dismissSessionResetNotification,
    dispatchWorkflowEvent,
  };

  return (
    <XrdWorkflowRuntimeContext.Provider value={contextValue}>
      {children}
    </XrdWorkflowRuntimeContext.Provider>
  );
}

// ── Custom Hook ─────────────────────────────────────────────────────────

/**
 * Custom hook to access XRD workflow runtime context.
 * Provides centralized state and actions for live workflow sessions.
 *
 * @throws {Error} If used outside of XrdWorkflowRuntimeProvider
 */
export function useXrdWorkflowRuntime(): XrdWorkflowRuntimeContextValue {
  const context = useContext(XrdWorkflowRuntimeContext);
  if (!context) {
    throw new Error('useXrdWorkflowRuntime must be used within XrdWorkflowRuntimeProvider');
  }
  return context;
}

// ── Selector Integration Helpers ────────────────────────────────────────

/**
 * Extract scientific evidence from runtime context using centralized selectors.
 * Returns normalized evidence fields or null.
 */
export function useXrdRuntimeScientificEvidence() {
  const { currentEvidence } = useXrdWorkflowRuntime();
  
  const scientificEvidence = selectXrdWorkflowScientificEvidence(currentEvidence);
  
  return extractScientificEvidenceFields(scientificEvidence);
}

/**
 * Extract reference match evidence from runtime context using centralized selectors.
 * Returns normalized evidence fields or null.
 */
export function useXrdRuntimeReferenceMatchEvidence() {
  const { currentEvidence } = useXrdWorkflowRuntime();
  
  const referenceEvidence = selectXrdWorkflowReferenceMatchEvidence(currentEvidence);
  
  return extractReferenceMatchFields(referenceEvidence);
}

/**
 * Extract dataset context from runtime context using centralized selectors.
 * Returns dataset context echo or undefined.
 */
export function useXrdRuntimeDatasetContext() {
  const { currentEvidence } = useXrdWorkflowRuntime();
  
  return selectXrdDatasetContextEcho(currentEvidence);
}

/**
 * Extract processing provenance from runtime context using centralized selectors.
 * Returns processing provenance or undefined.
 */
export function useXrdRuntimeProcessingProvenance() {
  const { currentEvidence } = useXrdWorkflowRuntime();
  
  return selectXrdProcessingProvenance(currentEvidence);
}

// ── Stage Utility Helpers ───────────────────────────────────────────────

/**
 * Get human-readable label for pipeline stage.
 */
export function getStageLabel(stage: XrdWorkflowStage): string {
  switch (stage) {
    case 'baseline':
      return 'Baseline Correction';
    case 'smooth':
      return 'Smoothing';
    case 'peak_detect':
      return 'Peak Detection';
    case 'fit_peaks':
      return 'Peak Fitting';
    case 'match_ref':
      return 'Reference Matching';
    case 'boundary':
      return 'Claim Boundary Assessment';
    case null:
      return 'Idle';
    default:
      return 'Unknown Stage';
  }
}

/**
 * Get progress percentage for pipeline stage (0-100).
 */
export function getStageProgress(stage: XrdWorkflowStage): number {
  switch (stage) {
    case null:
      return 0;
    case 'baseline':
      return 15;
    case 'smooth':
      return 30;
    case 'peak_detect':
      return 50;
    case 'fit_peaks':
      return 70;
    case 'match_ref':
      return 85;
    case 'boundary':
      return 95;
    default:
      return 0;
  }
}

/**
 * Check if stage requires Phase 7E.4 validation.
 */
export function stageRequires7E4Validation(stage: XrdWorkflowStage): boolean {
  return stage === 'peak_detect' || stage === 'fit_peaks';
}
