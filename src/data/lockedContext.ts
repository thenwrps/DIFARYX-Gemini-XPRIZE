/**
 * Locked Scientific Context Data Layer
 * 
 * This module provides locked scientific context data for DIFARYX projects.
 * Locked context represents user-confirmed scientific constraints that cannot
 * be modified by the agent without explicit user action.
 * 
 * Supported projects: cu-fe2o4-spinel, cufe2o4-sba15
 * Unsupported projects return null and show fallback UI.
 */

export interface LockedScientificContext {
  sampleIdentity: string;
  technique: string;
  sourceDataset: string;
  sourceProcessingPath: string;
  referenceScope: string;
  claimBoundary: string;
}

export type LockedContextMap = Record<string, LockedScientificContext | undefined>;

/**
 * Locked context data for supported projects.
 * This data is deterministic and hardcoded for the demo.
 */
const LOCKED_CONTEXT_DATA: LockedContextMap = {
  'cu-fe2o4-spinel': {
    sampleIdentity: 'CuFe₂O₄ spinel ferrite',
    technique: 'XRD',
    sourceDataset: 'xrd-cufe2o4-clean',
    sourceProcessingPath: 'XRD Workspace / processing-cu-fe2o4-spinel-xrd-demo',
    referenceScope: 'spinel ferrite screening',
    claimBoundary: 'XRD supports phase assignment; phase purity remains validation-limited.',
  },
  'cufe2o4-sba15': {
    sampleIdentity: 'CuFe₂O₄/SBA-15 supported sample',
    technique: 'XRD with contextual Raman/FTIR evidence',
    sourceDataset: 'xrd-cufe2o4-sba15-demo',
    sourceProcessingPath: 'Multi-technique evidence context',
    referenceScope: 'supported copper ferrite on mesoporous silica context',
    claimBoundary: 'Do not describe as pure bulk CuFe₂O₄; phase purity remains validation-limited.',
  },
  nife2o4: {
    sampleIdentity: 'NiFe₂O₄ nickel ferrite',
    technique: 'XRD',
    sourceDataset: 'xrd-nife2o4-control',
    sourceProcessingPath: 'XRD Workspace / processing-nife2o4-control',
    referenceScope: 'nickel ferrite screening',
    claimBoundary: 'XRD supports phase assignment; phase purity remains validation-limited.',
  },
  cofe2o4: {
    sampleIdentity: 'CoFe₂O₄ cobalt ferrite',
    technique: 'XRD',
    sourceDataset: 'xrd-cofe2o4-control',
    sourceProcessingPath: 'XRD Workspace / processing-cofe2o4-control',
    referenceScope: 'cobalt ferrite screening',
    claimBoundary: 'XRD supports phase assignment; phase purity remains validation-limited.',
  },
  'fe3o4-nanoparticles': {
    sampleIdentity: 'Fe₃O₄ iron oxide nanoparticles',
    technique: 'FTIR and Raman',
    sourceDataset: 'ftir-fe3o4-nanoparticles-demo',
    sourceProcessingPath: 'Multi-technique evidence context',
    referenceScope: 'iron oxide screening',
    claimBoundary: 'FTIR and Raman support nanoparticle signatures; phase assignment is validation-limited.',
  },
};

/**
 * Retrieves locked scientific context for a given project ID.
 * 
 * @param projectId - The project identifier (e.g., 'cu-fe2o4-spinel')
 * @returns LockedScientificContext object if project is supported, null otherwise
 * 
 * @example
 * const context = getLockedContext('cu-fe2o4-spinel');
 * if (context) {
 *   console.log(context.sampleIdentity); // 'CuFe₂O₄ spinel ferrite'
 * }
 * 
 * @example
 * const context = getLockedContext('fe3o4-nanoparticles');
 * console.log(context); // null (unsupported project)
 */
export function getLockedContext(projectId: string): LockedScientificContext | null {
  return LOCKED_CONTEXT_DATA[projectId] ?? null;
}
