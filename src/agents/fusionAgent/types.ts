/**
 * Fusion Agent Type Definitions
 * 
 * Cross-Tech Evidence Fusion for combining XPS, FTIR, Raman, and XRD evidence
 * using unweighted independent counting and canonical phase registry validation.
 */

import type { UniversalEvidenceNode } from '../../types/universalEvidence.js';

export type FusionTier = 'CORROBORATED' | 'SUPPORTED' | 'SINGLE-SOURCE' | 'CONTESTED' | 'UNVERIFIED';

export interface TechniqueContribution {
  technique: string;
  contributionType: 'PHASE_MATCH' | 'OXIDATION_STATE_CONSISTENCY' | 'FUNCTIONAL_GROUP_SUPPORT' | 'CONTRADICTION';
  sourceNode: UniversalEvidenceNode;
  rawConfidence: number;
}

export interface FusedFinding {
  canonicalFormula: string;
  canonicalPolymorph?: string;
  formulaTier: FusionTier;
  polymorphTier: FusionTier;
  supportingContributions: TechniqueContribution[];
  contestingContributions: TechniqueContribution[];
  absentTechniques: string[];
  isSurfaceBulkDiscrepancy: boolean;
  inheritedCaveats: string[];
}

