/**
 * XPS Evidence Adapter — Transport Boundary
 * Maps XpsProcessingResult into UniversalEvidenceNode[] preserving exact provenance.
 */

import type { XpsProcessingResult } from '../../agents/xpsAgent/runner.js';
import type { UniversalEvidenceNode } from '../../types/universalEvidence.js';

export function adaptXpsEvidence(
  result: XpsProcessingResult,
  datasetId: string,
  sampleName?: string,
): UniversalEvidenceNode[] {
  if (!result || !Array.isArray(result.matches)) return [];
  const nowIso = new Date().toISOString();

  return result.matches.map((match, idx) => {
    const confLevel = match.confidence > 0.8 ? 'high' : match.confidence > 0.5 ? 'medium' : 'low';
    return {
      id: `xps-cand-${idx + 1}`,
      technique: 'XPS',
      primaryAxis: match.observedBE ?? match.referenceBE ?? 0,
      primaryAxisUnit: 'eV',
      value: match.confidence,
      valueUnit: 'confidence_score',
      label: match.oxidationState,
      concept: 'oxidation_state',
      role: 'primary',
      confidence: confLevel,
      provenance: {
        datasetId,
        sampleName,
        createdAt: nowIso,
        dbSource: match.dbSource,
        sourceId: match.sourceId,
        sourceDoi: match.sourceDoi,
        matchSource: match.matchSource ?? match.dbSource,
        formula: match.formula,
        summary: match.summary,
        tolerance: match.tolerance,
        rawConfidence: match.rawConfidence ?? match.confidence,
      },
    };
  });
}
