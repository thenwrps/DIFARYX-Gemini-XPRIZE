/**
 * Research Evidence & Reasoning Provenance Types
 *
 * Lightweight, presentation-independent data models for the evidence-first
 * reasoning workflow:
 *   Literature Search -> Research Evidence Card -> Evidence Fusion ->
 *   Vertex Reasoning (structured signals only) -> Validation Gaps ->
 *   Claim Boundary Presentation (deterministic renderer).
 *
 * Scope notes (intentional, do NOT "consolidate"):
 *  - `EvidenceProvenance` (src/types/universalEvidence.ts) is DATA/dataset-level
 *    provenance (datasetId, processingHash). It is a different concern and must
 *    remain untouched.
 *  - `UniversalResearchEvidence` (src/types/universalResearchEvidence.ts) is the
 *    internal 7-stage immutable artifact chain. `ResearchEvidenceItem` below is a
 *    lightweight literature-citation record for the Research Evidence Card.
 *
 * This module has NO UI / React / AgentDemo imports so it stays reusable by
 * AgentDemo, ReportBuilder, notebook workflows, and future autonomous agents.
 */

import type { ScholarReference } from '../hooks/useX7UniversalHook';

// ---------------------------------------------------------------------------
// Constrained source / provider enums (Requirement A)
// Never store provider/source as free strings: prevents drift, simplifies
// filtering / analytics / reporting. UI labels are derived via helpers below.
// ---------------------------------------------------------------------------

/** Where a literature reference was retrieved from. */
export type LiteratureSource = 'brightdata' | 'local';

/** Which engine produced the reasoning signals. */
export type ReasoningProvider = 'vertex' | 'deterministic';

// ---------------------------------------------------------------------------
// Structured research evidence (Requirement: structured citations, not text)
// ---------------------------------------------------------------------------

/**
 * A single literature citation rendered by the Research Evidence Card.
 * Structured (not display text) to enable future ranking, filtering,
 * citation export, and provenance tracking.
 */
export interface ResearchEvidenceItem {
  title: string;
  authors: string[];
  year?: number;
  journal?: string;
  doi?: string;
  /** 0..1 relevance score when available (e.g. from ranking). */
  relevanceScore?: number;
  source: LiteratureSource;
}

// ---------------------------------------------------------------------------
// Central reasoning provenance (Requirement #5 + A)
// ---------------------------------------------------------------------------

/**
 * Single source of truth for "where did this reasoning come from".
 * Stored once in workflow state and consumed by every card.
 * Pluggable for future literature providers via the `literatureSource` enum.
 */
export interface ReasoningProvenance {
  literatureSource: LiteratureSource;
  literatureCount: number;
  reasoningProvider: ReasoningProvider;
  fallbackUsed: boolean;
  /** ISO 8601 timestamp. */
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Claim boundary signals (Requirement B)
// Preserve raw structured signals ALONGSIDE the deterministically rendered text
// so audits, explainability views, report generation, and model comparisons
// consume signals rather than reverse-engineering presentation text.
// ---------------------------------------------------------------------------

export type EvidenceStrength = 'strong' | 'moderate' | 'weak' | 'inconclusive';

/**
 * Structured reasoning signals emitted by the reasoning layer (Vertex or
 * deterministic). These are NEVER shown verbatim to the user; they feed
 * claimBoundaryPresentation.ts which is the single deterministic renderer.
 */
export interface ClaimBoundarySignals {
  evidenceStrength: EvidenceStrength;
  contradictions: string[];
  missingValidation: string[];
  /** 0..1. */
  confidence: number;
}

/**
 * Both the raw signals and the deterministically rendered, user-facing text.
 * Stored together so downstream consumers never reverse-engineer prose.
 */
export interface ClaimBoundaryArtifact {
  provider: ReasoningProvider;
  signals: ClaimBoundarySignals;
  /** Output of the deterministic presentation layer. */
  renderedClaimBoundary: string[];
}

// ---------------------------------------------------------------------------
// Structured literature-search trace entry (Requirement D)
// Machine-readable; the human-readable trace line is rendered from this object.
// ---------------------------------------------------------------------------

export interface LiteratureSearchTrace {
  type: 'literature-search';
  query: string;
  source: LiteratureSource;
  fallbackUsed: boolean;
  resultCount: number;
  topReference?: string;
}

// ---------------------------------------------------------------------------
// Label helpers (Requirement A: derive UI labels, do not store them)
// ---------------------------------------------------------------------------

export function literatureSourceLabel(source: LiteratureSource): string {
  switch (source) {
    case 'brightdata':
      return 'BrightData Scholar';
    case 'local':
      return 'Local Reference DB';
    default:
      return 'Unknown Source';
  }
}

export function reasoningProviderLabel(provider: ReasoningProvider): string {
  switch (provider) {
    case 'vertex':
      return 'Vertex AI';
    case 'deterministic':
      return 'Deterministic Engine';
    default:
      return 'Unknown Provider';
  }
}

/** Renders the structured literature-search trace into a human-readable block. */
export function formatLiteratureSearchTrace(trace: LiteratureSearchTrace): string {
  const lines = [
    '[Literature Search]',
    `Query: "${trace.query}"`,
    `Source: ${literatureSourceLabel(trace.source)}${trace.fallbackUsed ? ' (fallback)' : ''}`,
    `Results: ${trace.resultCount} reference${trace.resultCount === 1 ? '' : 's'}`,
  ];
  if (trace.topReference) {
    lines.push(`Top Reference: ${trace.topReference}`);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

/** Maps a hook `ScholarReference` into a structured `ResearchEvidenceItem`. */
export function scholarRefToEvidenceItem(
  ref: ScholarReference,
  source: LiteratureSource,
): ResearchEvidenceItem {
  return {
    title: ref.title,
    authors: ref.authors,
    year: ref.year,
    journal: ref.journal,
    doi: ref.doi,
    source,
  };
}
