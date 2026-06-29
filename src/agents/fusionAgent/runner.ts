/**
 * Fusion Agent Runner
 * 
 * Cross-Tech Evidence Fusion for combining XPS, FTIR, Raman, and XRD evidence
 * using unweighted independent counting and canonical phase registry validation.
 */

import { evaluateFusionEngine } from '../../engines/fusionEngine/index.js';
import type { UniversalEvidenceNode } from '../../types/universalEvidence.js';
import type { FusedFinding } from './types.js';
import { getXrdDemoDataset } from '../../data/xrdDemoDatasets.js';
import { runXrdPhaseIdentificationAgent } from '../xrdAgent/runner.js';
import { runXpsProcessing } from '../xpsAgent/runner.js';
import { runFtirProcessing } from '../ftirAgent/runner.js';
import { runRamanProcessing } from '../ramanAgent/runner.js';
import { xpsDemoData } from '../../data/xpsDemoData.js';
import { ftirDemoData } from '../../data/ftirDemoData.js';
import { ramanDemoData } from '../../data/ramanDemoData.js';
import { adaptXrdEvidence } from '../../evidence/xrd/adapter.js';
import { adaptXpsEvidence } from '../../evidence/xps/adapter.js';
import { adaptFtirEvidence } from '../../evidence/ftir/adapter.js';
import { adaptRamanEvidence } from '../../evidence/raman/adapter.js';

/**
 * Builds universal evidence nodes from the 4 technique datasets and processing runners.
 */
export function buildUniversalEvidenceNodes(): UniversalEvidenceNode[] {
  const xrdDataset = getXrdDemoDataset('xrd-cufe2o4-clean');
  const xrdResult = runXrdPhaseIdentificationAgent({
    datasetId: xrdDataset.id,
    sampleName: xrdDataset.sampleName,
    dataPoints: xrdDataset.dataPoints,
  });
  const xrdNodes = adaptXrdEvidence(xrdResult, xrdDataset.id, xrdDataset.sampleName);

  const xpsResult = runXpsProcessing(xpsDemoData);
  const xpsNodes = adaptXpsEvidence(xpsResult, xpsDemoData.id, xpsDemoData.sampleName);

  const ftirResult = runFtirProcessing(ftirDemoData);
  const ftirNodes = adaptFtirEvidence(ftirResult, ftirDemoData.id, ftirDemoData.sampleName);

  const ramanResult = runRamanProcessing(ramanDemoData);
  const ramanNodes = adaptRamanEvidence(ramanResult, ramanDemoData.id, ramanDemoData.sampleName);

  return [...xrdNodes, ...xpsNodes, ...ftirNodes, ...ramanNodes];
}

/**
 * Executes the Phase 2 Fusion Core reasoning engine over universal evidence nodes.
 * Replaces the legacy weighted/hardcoded claim calculation path.
 */
export function runUniversalFusionAgent(nodes?: UniversalEvidenceNode[]): FusedFinding[] {
  const inputNodes = nodes && nodes.length > 0 ? nodes : buildUniversalEvidenceNodes();
  const findings = evaluateFusionEngine(inputNodes);

  // Ensure UNVERIFIED tier is explicitly handled if no matches are produced
  if (findings.length === 0) {
    return [
      {
        canonicalFormula: 'Unknown Material System',
        canonicalPolymorph: 'Unverified Phase',
        formulaTier: 'UNVERIFIED',
        polymorphTier: 'UNVERIFIED',
        supportingContributions: [],
        contestingContributions: [],
        absentTechniques: ['XRD', 'XPS', 'FTIR', 'Raman'],
        isSurfaceBulkDiscrepancy: false,
        inheritedCaveats: ['No cross-technique evidence converged on a verified canonical registry phase.'],
      },
    ];
  }

  return findings;
}
