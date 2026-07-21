import {
  buildClaimBoundaryArtifact,
  type ClaimBoundaryInput,
} from '../../utils/claimBoundaryArtifact';
import type { ReasoningProvider } from '../../types/researchEvidence';
import type { ClaimBoundaryArtifact } from '../domain/contracts';
import type { ScientificReasoningOutput } from '../model/ScientificReasoningModel';

/** Delegates all wording and boundary rendering to the existing implementation. */
export class ClaimBoundaryService {
  build(input: ClaimBoundaryInput): ClaimBoundaryArtifact {
    return buildClaimBoundaryArtifact(input);
  }

  buildFromReasoning(
    technique: string,
    output: ScientificReasoningOutput,
    contradictions: string[] = [],
    missingValidation: string[] = [],
  ): ClaimBoundaryArtifact {
    const provider: ReasoningProvider =
      output.metadata.actualProvider === 'vertex-gemini' || output.metadata.actualProvider === 'gemma'
        ? 'vertex'
        : 'deterministic';
    return this.build({
      technique,
      provider,
      confidence: output.confidence,
      contradictions: [...output.rejectedAlternatives, ...contradictions],
      missingValidation: [...output.uncertainty, ...missingValidation],
    });
  }
}
