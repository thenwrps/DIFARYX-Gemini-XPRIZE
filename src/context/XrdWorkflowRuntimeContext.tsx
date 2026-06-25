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
    const raw = window.localStorage.getItem(XRD_RUNTIME_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as XrdRuntimeSessionPacket;
  } catch {
    return null;
  }
}

function writeSessionPacket(packet: XrdRuntimeSessionPacket): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(XRD_RUNTIME_SESSION_KEY, JSON.stringify(packet));
}

function clearSessionPacket(): void {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(XRD_RUNTIME_SESSION_KEY);
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

  /** Publish current session */
  publishSession: (versionTag: string) => void;

  /** Revert live evidence to published snapshot */
  revertToPublished: () => void;
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
  currentSession: null,
};

// ── Provider Component ──────────────────────────────────────────────────

export interface XrdWorkflowRuntimeProviderProps {
  children: ReactNode;
}

/**
 * XRD Workflow Runtime Context Provider.
 * Wraps application surfaces to provide centralized runtime state.
 */
const XRD_ACTIVE_SESSION_DRAFT_KEY = 'difaryx_xrd_active_session_draft';

function loadSessionDraft(): XrdWorkflowSession | null {
  try {
    if (typeof window === 'undefined') return null;
    const raw = window.sessionStorage.getItem(XRD_ACTIVE_SESSION_DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as XrdWorkflowSession;
  } catch {
    return null;
  }
}

/**
 * XRD Workflow Runtime Context Provider.
 * Wraps application surfaces to provide centralized runtime state.
 */
export function XrdWorkflowRuntimeProvider({ children }: XrdWorkflowRuntimeProviderProps) {
  // Load draft session from sessionStorage (Hydration First)
  const draftSession = loadSessionDraft();

  // ── Hydrate initial state from sessionStorage on mount ───────────────
  const hydrationRef = useRef<ReturnType<typeof hydrateFromSession> | null>(null);
  if (hydrationRef.current === null) {
    hydrationRef.current = hydrateFromSession();
  }
  const hydrated = hydrationRef.current;

  // Initialize operational variables prioritizing draftSession
  const [currentEvidence, setCurrentEvidence] = useState<XrdRuntimeEvidence>(() => {
    if (draftSession && draftSession.evidence) {
      const nextEvidence = draftSession.evidence;
      const qm = draftSession.processing?.qualityMetrics;
      const pm = nextEvidence.phaseMatch;
      
      const tempEvidenceRecordForHandoff: XRDBackendEvidenceRecord = {
        projectId: draftSession.projectId || '__unassigned__',
        uploadedRunId: draftSession.datasetContext?.referenceSetId,
        fileName: undefined,
        timestamp: draftSession.createdAt,
        detectedPeakCount: qm?.detectedPeakCount ?? 0,
        fittedPeakCount: qm?.fittedPeakCount ?? 0,
        snRatio: qm?.snRatio ?? 0,
        baselineDeviation: qm?.baselineDeviation ?? 0,
        peakResolution: qm?.peakResolution || 'screening-grade',
        primaryPhase: pm?.primaryPhase ?? null,
        matchedPeakCount: pm?.matchedPeakCount ?? 0,
        phaseSummary: pm?.phaseSummary ?? null,
        isPhaseMatched: pm?.isPhaseMatched ?? false,
        yResidualCount: 0,
        workflowScientificEvidence: nextEvidence.scientificEvidence,
        workflowReferenceMatchEvidence: nextEvidence.referenceMatch,
        datasetContextEcho: undefined,
        processingProvenance: draftSession.processing?.provenance,
      };

      const handoffState = buildXrdWorkflowSession({
        sessionId: draftSession.sessionId,
        projectId: draftSession.projectId || 'guest-sandbox',
        isProcessing: draftSession.runtime.status === 'processing',
        activeStage: draftSession.runtime.activeStage,
        isValidated7E4: draftSession.validation?.isValidated7E4 ?? false,
        evidenceRecord: tempEvidenceRecordForHandoff,
        userName: draftSession.userName,
        userEmail: draftSession.userEmail,
        organization: draftSession.organization,
        userRole: draftSession.userRole,
      }).xrdWorkflowHandoffState;

      return {
        ...tempEvidenceRecordForHandoff,
        xrdWorkflowHandoffState: handoffState,
      };
    }
    return hydrated.evidence;
  });

  const [activeStage, setActiveStageState] = useState<XrdWorkflowStage>(() => {
    if (draftSession && draftSession.runtime.activeStage) {
      switch (draftSession.runtime.activeStage) {
        case 'baseline': return 'baseline';
        case 'smoothing': return 'smooth';
        case 'peak_detection': return 'peak_detect';
        case 'fitting': return 'fit_peaks';
        case 'reference_matching': return 'match_ref';
        case 'handoff': return 'boundary';
      }
    }
    return null;
  });

  const [isValidated7E4, setIsValidated7E4] = useState(() => {
    if (draftSession && draftSession.validation) {
      return draftSession.validation.isValidated7E4;
    }
    return hydrated.isValidated7E4;
  });

  const [isProcessing, setIsProcessing] = useState(() => {
    if (draftSession && draftSession.runtime.status) {
      return draftSession.runtime.status === 'processing';
    }
    return false;
  });

  const [sessionResetNotification, setSessionResetNotification] = useState<string | null>(
    hydrated.resetNotification,
  );

  // Canonical Session State (Shadow Layer)
  const [currentSession, setCurrentSession] = useState<XrdWorkflowSession | null>(() => {
    if (!draftSession) return null;
    return {
      ...draftSession,
      projectId: draftSession.projectId || 'guest-sandbox',
    };
  });

  // Synchronize currentSession when currentEvidence changes
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
          projectId: prev?.projectId || currentEvidence.projectId || 'guest-sandbox',
          isProcessing,
          activeStage,
          isValidated7E4,
          evidenceRecord: currentEvidence,
          userName: prev?.userName,
          userEmail: prev?.userEmail,
          organization: prev?.organization,
          userRole: prev?.userRole,
        });
      });
    } else {
      setCurrentSession((prev) => {
        if (prev && prev.contract.migratedFromLegacy === false) {
          return prev;
        }
        return null;
      });
    }
  }, [currentEvidence]);

  // Save currentSession to sessionStorage draft continuously
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (currentSession) {
      window.sessionStorage.setItem(XRD_ACTIVE_SESSION_DRAFT_KEY, JSON.stringify(currentSession));
    } else {
      window.sessionStorage.removeItem(XRD_ACTIVE_SESSION_DRAFT_KEY);
    }
  }, [currentSession]);

  // ── State Transition Dispatcher with Controlled Shadow Sync ──────────
  const dispatchWorkflowEvent = useCallback((event: XrdWorkflowEvent) => {
    setCurrentSession((prevSession) => {
      // 1. Build initial session if not present
      const activeSession = prevSession || buildXrdWorkflowSession({
        projectId: currentEvidence?.projectId || 'guest-sandbox',
        isProcessing,
        activeStage,
        isValidated7E4,
        evidenceRecord: currentEvidence,
      });

      // 2. Reduce next state
      const nextSession = xrdSessionReducer(activeSession, event);

      // 3. Strict Transition Priority Check:
      // If reducer rejected transition, do not update legacy flags
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

      // 5. Radiate evidence changes to currentEvidence
      if (nextSession.evidence) {
        const nextEvidence = nextSession.evidence;
        const qm = nextSession.processing?.qualityMetrics;
        const pm = nextEvidence.phaseMatch;

        const tempEvidenceRecordForHandoff: XRDBackendEvidenceRecord = {
          projectId: nextSession.projectId || currentEvidence?.projectId || '__unassigned__',
          uploadedRunId: currentEvidence?.uploadedRunId,
          fileName: currentEvidence?.fileName,
          timestamp: nextSession.createdAt,
          detectedPeakCount: qm?.detectedPeakCount ?? 0,
          fittedPeakCount: qm?.fittedPeakCount ?? 0,
          snRatio: qm?.snRatio ?? 0,
          baselineDeviation: qm?.baselineDeviation ?? 0,
          peakResolution: qm?.peakResolution || 'screening-grade',
          primaryPhase: pm?.primaryPhase ?? null,
          matchedPeakCount: pm?.matchedPeakCount ?? 0,
          phaseSummary: pm?.phaseSummary ?? null,
          isPhaseMatched: pm?.isPhaseMatched ?? false,
          yResidualCount: currentEvidence?.yResidualCount ?? 0,
          workflowScientificEvidence: nextEvidence.scientificEvidence,
          workflowReferenceMatchEvidence: nextEvidence.referenceMatch,
          datasetContextEcho: currentEvidence?.datasetContextEcho,
          processingProvenance: nextSession.processing?.provenance || currentEvidence?.processingProvenance,
        };

        const handoffState = buildXrdWorkflowSession({
          sessionId: nextSession.sessionId,
          projectId: nextSession.projectId || tempEvidenceRecordForHandoff.projectId || 'guest-sandbox',
          isProcessing: nextIsProcessing,
          activeStage: nextLegacyStage,
          isValidated7E4: nextIsValidated7E4,
          evidenceRecord: tempEvidenceRecordForHandoff,
          userName: nextSession.userName,
          userEmail: nextSession.userEmail,
          organization: nextSession.organization,
          userRole: nextSession.userRole,
        }).xrdWorkflowHandoffState;

        const reconstructedEvidence: XRDBackendEvidenceRecord = {
          ...tempEvidenceRecordForHandoff,
          xrdWorkflowHandoffState: handoffState,
        };

        setCurrentEvidence((prev) => {
          if (JSON.stringify(prev) === JSON.stringify(reconstructedEvidence)) {
            return prev;
          }
          return reconstructedEvidence;
        });
      } else {
        setCurrentEvidence((prev) => {
          if (prev === null) return null;
          return null;
        });
      }

      if (event.type === 'FORCE_RESET_SESSION') {
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
    try {
      writeSessionPacket(packet);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Storage quota exceeded';
      console.error('Failed to write session packet:', message);
      setSessionResetNotification(`Save failed: ${message}`);
    }
  }, [currentEvidence, isValidated7E4]);

  // Derive sample information from current evidence (strict canonical shape)
  const sampleId = currentEvidence?.projectId ?? null;

  const materialClass = currentEvidence?.primaryPhase ?? null;

  // Actions
  const updateRuntimeEvidence = useCallback((evidence: XrdRuntimeEvidence) => {
    if (!evidence) {
      const newSessionId = `xrd-session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      dispatchWorkflowEvent({ type: 'FORCE_RESET_SESSION', payload: { newSessionId } });
      return;
    }

    // Ensure we are in processing status before appending evidence
    const statusCheck = currentSession?.runtime.status;
    if (statusCheck !== 'processing') {
      dispatchWorkflowEvent({ type: 'START_PROCESSING', payload: { stage: 'baseline' } });
    }

    // 1. Dispatch APPEND_SCIENTIFIC_EVIDENCE
    dispatchWorkflowEvent({
      type: 'APPEND_SCIENTIFIC_EVIDENCE',
      payload: {
        scientificData: evidence,
      },
    });

    // 2. Dispatch APPEND_REFERENCE_MATCH
    if (evidence.workflowReferenceMatchEvidence) {
      dispatchWorkflowEvent({
        type: 'APPEND_REFERENCE_MATCH',
        payload: {
          referenceData: evidence.workflowReferenceMatchEvidence,
          phaseSummary: {
            isPhaseMatched: evidence.isPhaseMatched ?? false,
            primaryPhase: evidence.primaryPhase ?? null,
            matchedPeakCount: evidence.matchedPeakCount ?? 0,
            phaseSummary: evidence.phaseSummary ?? null,
          },
        },
      });
    }

    // 3. Dispatch SET_VALIDATION_GAPS
    const validationGaps: string[] = [];
    if (evidence.xrdWorkflowHandoffState?.validationGaps) {
      validationGaps.push(...evidence.xrdWorkflowHandoffState.validationGaps);
    } else {
      if (evidence.workflowScientificEvidence?.validationGaps) {
        validationGaps.push(...evidence.workflowScientificEvidence.validationGaps);
      }
      if (evidence.workflowReferenceMatchEvidence?.limitations) {
        validationGaps.push(...evidence.workflowReferenceMatchEvidence.limitations);
      }
    }
    dispatchWorkflowEvent({
      type: 'SET_VALIDATION_GAPS',
      payload: {
        gaps: validationGaps,
      },
    });

    // 4. Complete processing
    dispatchWorkflowEvent({ type: 'COMPLETE_PROCESSING' });
  }, [dispatchWorkflowEvent, currentSession]);

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

  const publishSession = useCallback((versionTag: string) => {
    dispatchWorkflowEvent({ type: 'PUBLISH_SESSION', payload: { versionTag } });
  }, [dispatchWorkflowEvent]);

  const revertToPublished = useCallback(() => {
    dispatchWorkflowEvent({ type: 'REVERT_TO_PUBLISHED' });
  }, [dispatchWorkflowEvent]);

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
    publishSession,
    revertToPublished,
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
