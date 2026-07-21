import type { AgentEvidencePacket } from '../../agent/mcp/types';
import type { EvidenceBundle } from '../../runtime/evidenceBundle';
import type { ProjectEvidenceSnapshot } from '../../utils/evidenceSnapshot';
import type { UniversalEvidenceNode } from '../../types/universalEvidence';
import type { ClaimBoundaryArtifact as ExistingClaimBoundaryArtifact } from '../../types/researchEvidence';
import type { ScientificReasoningOutput } from '../model/ScientificReasoningModel';

/** Compatibility alias. The existing artifact remains the single type. */
export type ClaimBoundaryArtifact = ExistingClaimBoundaryArtifact;

export type ScientificReviewSessionStatus = 'projection' | 'active' | 'completed' | 'needs-review';

/**
 * Projection over existing analysis, run, processing, evidence, and notebook
 * records. This is intentionally not a persisted review lifecycle entity.
 */
export interface ScientificReviewSession {
  reviewId: string;
  projectId: string;
  analysisSessionId?: string;
  evidenceSnapshotId?: string;
  activeRunId?: string;
  processingRunId?: string;
  notebookEntryId?: string;
  status: ScientificReviewSessionStatus;
  createdAt: string;
  updatedAt: string;
  authoritativeRecordIds: {
    analysisSessionId?: string;
    agentRunId?: string;
    processingRunId?: string;
    notebookEntryId?: string;
  };
  derived: {
    runtimeBundleId?: string;
    claimBoundary?: ClaimBoundaryArtifact;
    reasoning?: ScientificReasoningOutput;
  };
  compatibility: {
    sourceLabel?: string;
    warnings: string[];
    persistable: false;
  };
}

export interface EvidenceSourceReference {
  sourceKind: 'sample' | 'project' | 'upload';
  projectId: string;
  datasetId?: string;
  evidenceSnapshotId: string;
  runtimeBundleId?: string;
}

/**
 * Coordination envelope: one canonical model packet plus references to the
 * source-context and fusion representations. It does not duplicate those
 * representations.
 */
export interface AgentEvidenceBundle {
  bundleId: string;
  projectId: string;
  source: EvidenceSourceReference;
  sourceSnapshot: Pick<ProjectEvidenceSnapshot, 'projectId' | 'projectName' | 'sampleIdentity'>;
  runtimeEvidenceBundle: Pick<EvidenceBundle, 'bundleId' | 'availableTechniques' | 'pendingTechniques' | 'validationGaps'>;
  modelInput: AgentEvidencePacket;
  universalEvidenceNodeIds: UniversalEvidenceNode['id'][];
  compatibilityWarnings: string[];
  reviewReady: boolean;
}

export interface ReviewProvenance {
  provider: string;
  actualProvider?: string;
  modelId?: string;
  responseId?: string;
  promptVersion?: string;
  reasoningEffort?: string;
  latencyMs?: number;
  fallbackUsed: boolean;
  evidenceSnapshotId: string;
  recordedAt: string;
}

export interface ScientificReviewResult {
  reviewId?: string;
  evidence: AgentEvidenceBundle;
  reasoning: ScientificReasoningOutput;
  claimBoundary: ClaimBoundaryArtifact;
  provenance: ReviewProvenance;
  compatibilityWarnings: string[];
}
