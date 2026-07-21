import {
  createEvidenceNodes,
  evaluate,
} from '../../engines/fusionEngine';
import type {
  EvidenceNode,
  FusionInput,
  FusionResult,
  RawEvidenceInput,
} from '../../engines/fusionEngine';

/** Exact compatibility wrapper over the existing fusion engine. */
export class FusionService {
  createEvidenceNodes(input: RawEvidenceInput): EvidenceNode[] {
    return createEvidenceNodes(input);
  }

  evaluate(input: FusionInput): FusionResult {
    return evaluate(input);
  }
}
