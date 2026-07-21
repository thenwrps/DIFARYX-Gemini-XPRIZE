import {
  createEvidenceBundleFromSnapshot,
  type EvidenceBundle,
} from '../../runtime/evidenceBundle';
import type { AgentEvidencePacket } from '../../agent/mcp/types';
import { buildEvidencePacket } from '../../agent/mcp/evidencePacket';
import type { DemoDataset, DemoProject, Technique } from '../../data/demoProjects';
import type { ToolResult, XpsElementEvidence } from '../../agent/mcp/types';
import type { AgentEvidenceBundle } from '../domain/contracts';
import type { EvidenceSourceResult } from '../sources/EvidenceSourceAdapter';

export interface EvidenceBundleBuildInput {
  source: EvidenceSourceResult;
  modelInput: AgentEvidencePacket;
  universalEvidenceNodeIds?: string[];
  evidenceSnapshotId?: string;
}

export interface EvidenceBundleBuildResult {
  coordination: AgentEvidenceBundle;
  runtime: EvidenceBundle;
}

/** Coordinates existing source, runtime-bundle, fusion, and model views. */
export class EvidenceBundleService {
  /** Compatibility seam over the provisional active MCP builder. */
  buildActiveModelInput(
    context: Technique,
    dataset: DemoDataset,
    project: DemoProject,
    xrdAnalysis: any | null,
    featureCount: number,
    baseConfidence: number,
    toolTrace: ToolResult[],
    xpsElementEvidence?: XpsElementEvidence,
  ): AgentEvidencePacket {
    return buildEvidencePacket(
      context,
      dataset,
      project,
      xrdAnalysis,
      featureCount,
      baseConfidence,
      toolTrace,
      xpsElementEvidence,
    );
  }

  build(input: EvidenceBundleBuildInput): EvidenceBundleBuildResult {
    const runtime = createEvidenceBundleFromSnapshot(input.source.snapshot, {
      includeDemoContext: input.source.kind !== 'sample',
      lifecycleState: 'created',
      creationReason: input.source.kind === 'upload' ? 'uploaded_multi_file' : 'agent_requested_evidence_package',
    });
    const evidenceSnapshotId =
      input.evidenceSnapshotId ??
      `snapshot-${input.source.snapshot.projectId}-${input.source.dataset?.id ?? 'none'}`;
    const modelInputPacketId = `${runtime.bundleId}:mcp`;

    return {
      runtime,
      coordination: {
        bundleId: runtime.bundleId,
        projectId: runtime.projectId,
        source: {
          sourceKind: input.source.kind,
          projectId: input.source.snapshot.projectId,
          datasetId: input.source.dataset?.id,
          evidenceSnapshotId,
          runtimeBundleId: runtime.bundleId,
        },
        sourceSnapshot: {
          projectId: input.source.snapshot.projectId,
          projectName: input.source.snapshot.projectName,
          sampleIdentity: input.source.snapshot.sampleIdentity,
        },
        runtimeEvidenceBundle: {
          bundleId: runtime.bundleId,
          availableTechniques: runtime.availableTechniques,
          pendingTechniques: runtime.pendingTechniques,
          validationGaps: runtime.validationGaps,
        },
        modelInput: input.modelInput,
        universalEvidenceNodeIds: input.universalEvidenceNodeIds ?? [],
        compatibilityWarnings: [...input.source.warnings],
        reviewReady: input.source.reviewReady,
      },
    };
  }
}
