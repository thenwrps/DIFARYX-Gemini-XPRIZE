import type { XRDProcessingProvenance } from './xrdBackend';
import type {
  XRDWorkflowScientificEvidence,
  XRDWorkflowReferenceMatchEvidence,
} from './xrdWorkflowContract';

export interface XrdWorkflowSession {
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  runtime: XrdWorkflowRuntimeState;
  datasetContext?: XrdWorkflowDatasetContext;
  processing?: XrdWorkflowProcessingState;
  evidence?: XrdWorkflowEvidenceState;
  validation?: XrdWorkflowValidationState;
  publication?: XrdWorkflowPublicationState;
  scientificBoundaries: XrdWorkflowScientificBoundaries;
  contract: XrdWorkflowContractMetadata;
}

export interface XrdWorkflowRuntimeState {
  status: 'idle' | 'processing' | 'completed' | 'failed';
  activeStage?: 'baseline' | 'smoothing' | 'peak_detection' | 'fitting' | 'reference_matching' | 'handoff';
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
}

export interface XrdWorkflowDatasetContext {
  referenceSource?: string;
  referenceSetId?: string;
  candidatePhaseIds?: string[];
  matchMode?: string;
  localReferenceEnabled?: boolean;
  parameterContractVersion?: string;
}

export interface XrdWorkflowProcessingQualityMetrics {
  detectedPeakCount: number;
  fittedPeakCount: number;
  snRatio: number;
  baselineDeviation: number;
  peakResolution: string | null;
}

export interface XrdWorkflowProcessingState {
  provenance?: XRDProcessingProvenance;
  groupedParametersReceived: boolean;
  processingMode?: string;
  qualityMetrics?: XrdWorkflowProcessingQualityMetrics;
}

export interface XrdWorkflowEvidenceState {
  scientificEvidence?: XRDWorkflowScientificEvidence; // แมปกับโครงสร้างเดิมของ workflowScientificEvidence
  referenceMatch?: XRDWorkflowReferenceMatchEvidence; // แมปกับโครงสร้างเดิมของ workflowReferenceMatchEvidence
  phaseMatch?: {
    isPhaseMatched: boolean;
    primaryPhase: string | null;
    matchedPeakCount: number;
    phaseSummary: string | null;
  };
  validationGaps?: string[];
  limitations?: string[];
}

export interface XrdWorkflowValidationState {
  isValidated7E4: boolean;
  validatedAt?: string;
  approvedLocalReferenceId?: string;
  validationStatus?: 'pending' | 'validated' | 'rejected';
}

export interface XrdWorkflowPublicationState {
  published: boolean;
  publishedAt?: string;
  notebookReady: boolean;
  reportReady: boolean;
  agentReady: boolean;
}

export interface XrdWorkflowScientificBoundaries {
  chemicalIdentityConfirmed: boolean;
  phasePurityConfirmed: boolean;
  candidateEvidenceOnly: boolean;
  requiresCompositionSensitiveEvidence: boolean;
  limitations: string[];
}

export interface XrdWorkflowContractMetadata {
  schemaVersion: 'x7a';
  source: 'legacy' | 'workflow' | 'session';
  migratedFromLegacy?: boolean;
}

export type XrdWorkflowEvent =
  | { type: 'START_PROCESSING'; payload: { stage: 'baseline' | 'smoothing' | 'peak_detection' | 'fitting' | 'reference_matching' | 'handoff' } }
  | { type: 'UPDATE_STAGE'; payload: { stage: 'baseline' | 'smoothing' | 'peak_detection' | 'fitting' | 'reference_matching' | 'handoff' } }
  | { type: 'COMPLETE_PROCESSING'; payload?: { completedAt?: string } }
  | { type: 'FAIL_PROCESSING'; payload: { errorMessage: string } }
  | { type: 'FORCE_RESET_SESSION'; payload: { newSessionId: string } }
  | { type: 'SET_VALIDATION'; payload: { isValidated7E4: boolean } };

