import type { Technique } from '../../data/demoProjects';
import type {
  ScientificReviewResult,
} from '../domain/contracts';
import {
  EvidenceBundleService,
} from './evidenceBundleService';
import { ClaimBoundaryService } from './claimBoundaryService';
import type {
  EvidenceSourceAdapter,
  EvidenceSourceRequest,
} from '../sources/EvidenceSourceAdapter';
import type { AgentEvidencePacket } from '../../agent/mcp/types';
import type { ScientificReasoningModel } from '../model/ScientificReasoningModel';

export interface ScientificReviewRequest {
  source: EvidenceSourceRequest;
  modelInput: AgentEvidencePacket;
  technique: Technique;
  evidenceSnapshotId?: string;
  universalEvidenceNodeIds?: string[];
  contradictions?: string[];
  missingValidation?: string[];
}

/**
 * Compatibility facade only. It does not persist, own stages, or change the
 * page-level execution controller.
 */
export class ScientificReviewService {
  constructor(
    private readonly sourceAdapter: EvidenceSourceAdapter,
    private readonly model: ScientificReasoningModel,
    private readonly evidenceBundleService = new EvidenceBundleService(),
    private readonly claimBoundaryService = new ClaimBoundaryService(),
  ) {}

  async review(request: ScientificReviewRequest): Promise<ScientificReviewResult> {
    const source = this.sourceAdapter.resolve(request.source);
    const evidence = this.evidenceBundleService.build({
      source,
      modelInput: request.modelInput,
      evidenceSnapshotId: request.evidenceSnapshotId,
      universalEvidenceNodeIds: request.universalEvidenceNodeIds,
    });
    const reasoning = await this.model.review({
      packet: evidence.coordination.modelInput,
      evidenceSnapshotId: evidence.coordination.source.evidenceSnapshotId,
    });
    const claimBoundary = this.claimBoundaryService.buildFromReasoning(
      request.technique,
      reasoning,
      request.contradictions,
      request.missingValidation,
    );
    const provenance = {
      provider: reasoning.metadata.provider,
      actualProvider: reasoning.metadata.actualProvider,
      modelId: reasoning.metadata.modelId,
      responseId: reasoning.metadata.responseId,
      promptVersion: reasoning.metadata.promptVersion,
      reasoningEffort: reasoning.metadata.reasoningEffort,
      latencyMs: reasoning.metadata.latencyMs,
      fallbackUsed: reasoning.metadata.fallbackUsed,
      evidenceSnapshotId: evidence.coordination.source.evidenceSnapshotId,
      recordedAt: reasoning.metadata.timestamp,
    };

    return {
      evidence: evidence.coordination,
      reasoning,
      claimBoundary,
      provenance,
      compatibilityWarnings: [...source.warnings],
    };
  }
}
