import type { AgentEvidencePacket, ReasoningOutput } from '../../agent/mcp/types';
import { buildScientificBaselineResult } from '../../agent/prompt/canonicalAgentPrompt';

/**
 * Generate deterministic reasoning output from evidence packet.
 * This is the fallback when LLM is not available or fails.
 */
export function generateDeterministicReasoning(packet: AgentEvidencePacket): ReasoningOutput {
  const startTime = Date.now();
  const analysisResult = buildScientificBaselineResult(packet);
  const topCandidate = packet.candidates[0];

  if (!topCandidate) {
    throw new Error('No candidates available for deterministic reasoning');
  }

  const evidenceSummary: string[] = [
    `${packet.signalSummary.featureCount} ${packet.context.toUpperCase()} features detected and analyzed`,
    `Top candidate ${topCandidate.label} shows ${topCandidate.matchedFeatures}/${topCandidate.totalFeatures} feature matches`,
    `Fused evidence score: ${(packet.fusedScore * 100).toFixed(1)}%`,
  ];

  if (topCandidate.score >= 0.85) {
    evidenceSummary.push('Strong agreement across multiple evidence dimensions');
  } else if (topCandidate.score >= 0.70) {
    evidenceSummary.push('Moderate agreement with some uncertainty factors');
  } else {
    evidenceSummary.push('Limited agreement, significant uncertainty present');
  }

  const rejectedAlternatives: string[] = [];
  for (let i = 1; i < Math.min(4, packet.candidates.length); i++) {
    const candidate = packet.candidates[i];
    rejectedAlternatives.push(
      `${candidate.label}: lower match score (${(candidate.score * 100).toFixed(1)}% vs ${(topCandidate.score * 100).toFixed(1)}%)`,
    );
  }

  const decisionLogic = `Selected ${topCandidate.label} based on highest feature match score (${(topCandidate.score * 100).toFixed(1)}%) and strongest agreement with detected ${packet.context.toUpperCase()} features. The candidate shows ${topCandidate.matchedFeatures} matched features out of ${topCandidate.totalFeatures} expected. ${topCandidate.missingFeatures.length > 0 ? `Missing features: ${topCandidate.missingFeatures.join(', ')}. ` : ''}${topCandidate.unexplainedFeatures.length > 0 ? `Unexplained features: ${topCandidate.unexplainedFeatures.join(', ')} suggest possible impurities or secondary phases.` : 'All detected features are explained by this assignment.'}`;

  const uncertainty: string[] = [...packet.uncertaintyFlags];
  if (topCandidate.missingFeatures.length > 0) {
    uncertainty.push(`Missing expected features: ${topCandidate.missingFeatures.join(', ')}`);
  }
  if (topCandidate.unexplainedFeatures.length > 0) {
    uncertainty.push(`Unexplained features present: ${topCandidate.unexplainedFeatures.join(', ')}`);
  }
  if (uncertainty.length === 0) {
    uncertainty.push('No significant uncertainty factors identified');
  }

  const recommendedNextStep =
    packet.context === 'xrd'
      ? 'Validate with complementary techniques (XPS for surface chemistry, Raman for structural confirmation)'
      : packet.context === 'xps'
        ? 'Perform quantitative peak fitting and compare with XRD phase assignment'
        : packet.context === 'ftir'
          ? 'Cross-reference bonding signatures with XRD and XPS results'
          : 'Compare Raman fingerprint with XRD phase assignment and literature references';

  const durationMs = Date.now() - startTime;

  return {
    primaryResult: topCandidate.label,
    confidence: Math.max(0, Math.min(1, topCandidate.score * 0.95)),
    evidenceSummary,
    rejectedAlternatives,
    decisionLogic,
    uncertainty,
    recommendedNextStep,
    analysisResult,
    metadata: {
      provider: 'deterministic',
      model: 'rule-based-analysis-v3',
      durationMs,
      timestamp: new Date().toISOString(),
      parameterSchemaVersion: analysisResult.provenance.parameterSchemaVersion,
    },
  };
}
