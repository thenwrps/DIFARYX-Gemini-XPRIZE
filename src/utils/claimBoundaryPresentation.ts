/**
 * Unified Claim Boundary Presentation Layer
 * 
 * Standardizes scientific language, status mappings, and technique limitations
 * to ensure evidence-first communication without altering reasoning logic.
 */

/**
 * Sanitizes over-confident terminology into hedged, evidence-first language.
 * Follows strict pilot and hackathon-ready guidelines.
 */
export function sanitizeScientificWording(text: string): string {
  if (!text) return text;
  
  return text
    .replace(/\bconfirmed\b/gi, 'evidence-supported')
    .replace(/\bproven\b/gi, 'indicated')
    .replace(/\bverified\b/gi, 'reference-supported')
    .replace(/\bidentified\b/gi, 'assigned candidate')
    .replace(/\bpure phase\b/gi, 'candidate phase assignment')
    .replace(/\bdefinitive composition\b/gi, 'suggested stoichiometry')
    .replace(/\bdefinitely is\b/gi, 'appears compatible with')
    .replace(/\bguarantees\b/gi, 'suggests')
    .replace(/\bunquestionably demonstrates\b/gi, 'strongly supports')
    .replace(/\bproves\b/gi, 'supports');
}

/**
 * Standardizes user-facing labels for internal claim status levels
 */
export function formatClaimStatus(status: string): string {
  const normStatus = (status || '').toLowerCase().trim();
  switch (normStatus) {
    case 'strongly_supported':
      return 'Reference-supported phase indication';
    case 'supported':
      return 'Candidate assignment';
    case 'partial':
      return 'Suggested interpretation';
    case 'inconclusive':
      return 'Validation-limited interpretation';
    case 'contradicted':
      return 'Contradicted claim boundary';
    default:
      return 'Suggested interpretation';
  }
}

/**
 * Cleans and standardizes lists of claim boundary descriptions
 */
export function formatClaimBoundaryList(list: string[]): string[] {
  if (!Array.isArray(list)) return [];
  return list
    .map(item => sanitizeScientificWording(item || ''))
    .filter(Boolean);
}

/**
 * Generates standardized technique limitation statements
 */
export function formatTechniqueLimitation(technique: string): string {
  const normTech = (technique || '').toUpperCase().trim();
  switch (normTech) {
    case 'XRD':
      return 'Crystallographic matching supports phase indication but does not independently confirm bulk phase purity.';
    case 'XPS':
      return 'XPS is surface-sensitive (~5 nm) and cannot independently determine bulk chemical composition.';
    case 'FTIR':
      return 'FTIR provides functional group/bonding context but cannot independently determine crystal structure.';
    case 'Raman':
      return 'Raman probes local vibrational modes/symmetry and requires crystallographic validation to assign phase purity.';
    default:
      return `${technique} provides localized evidence and requires complementary validation.`;
  }
}

/**
 * Maps claim boundary classifications/labels for display
 */
export function formatBoundaryLabel(category: string): string {
  const normCategory = (category || '').toLowerCase().trim();
  switch (normCategory) {
    case 'supported':
      return 'Evidence-supported claim boundary';
    case 'requiresvalidation':
    case 'requires_validation':
      return 'Validation-limited boundary';
    case 'notsupportedyet':
    case 'not_supported_yet':
      return 'Not-yet-validated boundary';
    case 'contextual':
      return 'Contextual background boundary';
    case 'pending':
      return 'Pending validation boundary';
    default:
      return 'Suggested interpretation';
  }
}

/**
 * Standardizes evidence strength phrases into hedged terminology for chips/badges
 */
export function formatEvidenceStrength(strength: string): string {
  const norm = (strength || '').toLowerCase().trim();
  if (norm.includes('high') || norm.includes('strong')) {
    return 'Strongly supports';
  }
  if (norm.includes('medium') || norm.includes('moderate')) {
    return 'Consistent with';
  }
  if (norm.includes('low') || norm.includes('weak')) {
    return 'May indicate / suggests';
  }
  return 'Suggested interpretation';
}

