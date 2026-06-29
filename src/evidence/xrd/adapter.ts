/**
 * XRD Evidence Adapter — Transport Boundary
 * Maps XrdAgentResult into UniversalEvidenceNode[] preserving exact provenance.
 */

import type { XrdAgentResult } from '../../agents/xrdAgent/types.js';
import type { UniversalEvidenceNode } from '../../types/universalEvidence.js';

export function adaptXrdEvidence(
  result: XrdAgentResult,
  datasetId: string,
  sampleName?: string,
): UniversalEvidenceNode[] {
  if (!result || !Array.isArray(result.candidates)) return [];
  const nowIso = new Date().toISOString();

  return result.candidates.map((candidate, idx) => {
    const strongestMatch = candidate.matches?.[0]?.observedPeak;
    return {
      id: `xrd-cand-${idx + 1}`,
      technique: 'XRD',
      primaryAxis: strongestMatch?.position ?? 0,
      primaryAxisUnit: '°2θ',
      value: candidate.score,
      valueUnit: 'confidence_score',
      label: candidate.phase.name,
      concept: 'crystalline',
      role: 'primary',
      confidence: candidate.confidenceLevel,
      provenance: {
        datasetId,
        sampleName,
        createdAt: nowIso,
        dbSource: candidate.dbSource,
        sourceId: candidate.sourceId,
        sourceDoi: candidate.sourceDoi,
        matchSource: candidate.matchSource,
        formula: candidate.formula,
        summary: candidate.summary,
        tolerance: candidate.tolerance,
        rawConfidence: candidate.rawConfidence ?? candidate.score,
      },
    };
  });
}
