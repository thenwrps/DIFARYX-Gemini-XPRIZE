/**
 * Claim Boundary Artifact Builder
 *
 * Bridges structured reasoning signals (from Vertex AI or the deterministic
 * engine) to the deterministic presentation layer (claimBoundaryPresentation.ts),
 * which remains the SINGLE source of user-facing claim-boundary wording.
 *
 * Reasoning engines (Vertex/LLM) emit structured signals ONLY. They never
 * author the final wording. This builder:
 *   1. normalizes signals into a typed ClaimBoundarySignals object, and
 *   2. renders deterministic, hedged user-facing text from those signals.
 *
 * Both the raw signals and the rendered text are preserved together
 * (ClaimBoundaryArtifact) so audits / reports / explainability views consume
 * the signals instead of reverse-engineering presentation prose.
 *
 * Shared by AgentDemo and ReportBuilder (no UI/React imports here).
 */

import type {
  ClaimBoundaryArtifact,
  ClaimBoundarySignals,
  EvidenceStrength,
  ReasoningProvider,
} from '../types/researchEvidence';
import {
  formatTechniqueLimitation,
  formatEvidenceStrength,
  formatClaimBoundaryList,
  sanitizeScientificWording,
} from './claimBoundaryPresentation';

export interface ClaimBoundaryInput {
  technique: string;
  provider: ReasoningProvider;
  /** 0..1 confidence. */
  confidence: number;
  contradictions?: string[];
  /** Validation gaps (deterministic ∪ reasoning), de-duplicated by the caller or here. */
  missingValidation?: string[];
}

/** Derives a coarse evidence-strength band from confidence + contradictions. */
export function strengthFromConfidence(
  confidence: number,
  hasContradictions: boolean,
): EvidenceStrength {
  if (confidence <= 0) return 'inconclusive';
  if (hasContradictions && confidence < 0.5) return 'inconclusive';
  if (confidence >= 0.8) return 'strong';
  if (confidence >= 0.5) return 'moderate';
  return 'weak';
}

/**
 * Builds the claim-boundary artifact: structured signals + deterministically
 * rendered, user-facing text. The rendered text comes exclusively from
 * claimBoundaryPresentation.ts helpers.
 */
export function buildClaimBoundaryArtifact(input: ClaimBoundaryInput): ClaimBoundaryArtifact {
  const contradictions = (input.contradictions ?? []).map((c) => (c || '').trim()).filter(Boolean);
  const missingValidation = Array.from(
    new Set((input.missingValidation ?? []).map((m) => (m || '').trim()).filter(Boolean)),
  );
  const confidence = Math.max(0, Math.min(1, Number.isFinite(input.confidence) ? input.confidence : 0));
  const evidenceStrength = strengthFromConfidence(confidence, contradictions.length > 0);

  const signals: ClaimBoundarySignals = {
    evidenceStrength,
    contradictions,
    missingValidation,
    confidence,
  };

  // ── Deterministic rendering (single source of user-facing wording) ──
  const rendered: string[] = [
    `${formatEvidenceStrength(evidenceStrength)} the candidate interpretation (confidence ${(confidence * 100).toFixed(0)}%).`,
    formatTechniqueLimitation(input.technique),
  ];
  if (contradictions.length > 0) {
    rendered.push('Contradicting signals to resolve:', ...formatClaimBoundaryList(contradictions));
  }
  if (missingValidation.length > 0) {
    rendered.push('Validation still required:', ...formatClaimBoundaryList(missingValidation));
  }

  return {
    provider: input.provider,
    signals,
    renderedClaimBoundary: rendered.map(sanitizeScientificWording),
  };
}
