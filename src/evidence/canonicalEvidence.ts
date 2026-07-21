import type { CanonicalParameterContext, CanonicalTechnique } from '../data/parameterDefinitions';

export type EvidenceOutputKind =
  | 'detected_peak'
  | 'peak_fit'
  | 'reference_match'
  | 'refinement_result'
  | 'element_identity'
  | 'oxidation_state'
  | 'atomic_percentage'
  | 'sampling_depth_estimate'
  | 'fit_quality'
  | 'residual'
  | 'detected_band'
  | 'functional_group_assignment'
  | 'band_confidence'
  | 'interference_warning'
  | 'detected_raman_mode'
  | 'mode_assignment'
  | 'symmetry_evidence'
  | 'defect_disorder_indication'
  | 'fluorescence_warning'
  | 'heating_warning';

export interface CanonicalEvidenceOutput<T = unknown> {
  id: string;
  kind: EvidenceOutputKind;
  value: T;
  sourceFilename: string;
  technique: CanonicalTechnique;
  processingProfileVersion: string;
  referenceDatabase: {
    provider: string;
    version: string;
  };
  parameterIds: string[];
  confidence: number;
  warnings: string[];
  generatedAt: string;
}

export function createEvidenceOutput<T>(
  context: CanonicalParameterContext,
  input: Omit<CanonicalEvidenceOutput<T>,
    'sourceFilename' | 'technique' | 'processingProfileVersion' | 'referenceDatabase' | 'generatedAt'> & {
      sourceFilename?: string;
      generatedAt?: string;
    },
): CanonicalEvidenceOutput<T> {
  const referenceProvider = context.interpretationParameters.find((item) => item.id === 'referenceDatabase')?.value;
  const referenceVersion = context.interpretationParameters.find((item) => item.id === 'referenceDatabaseVersion')?.value;
  return {
    ...input,
    sourceFilename: input.sourceFilename ?? context.sourceFiles[0]?.filename ?? 'not_available',
    technique: context.technique,
    processingProfileVersion: context.provenance.processingProfileVersion,
    referenceDatabase: {
      provider: typeof referenceProvider === 'string' ? referenceProvider : 'not_available',
      version: typeof referenceVersion === 'string' ? referenceVersion : 'not_available',
    },
    confidence: Math.max(0, Math.min(1, input.confidence)),
    warnings: [...input.warnings],
    parameterIds: [...input.parameterIds],
    generatedAt: input.generatedAt ?? new Date().toISOString(),
  };
}

export function validateEvidenceOutput(output: CanonicalEvidenceOutput): string[] {
  const errors: string[] = [];
  if (!output.sourceFilename) errors.push('sourceFilename is required');
  if (!output.processingProfileVersion) errors.push('processingProfileVersion is required');
  if (!output.referenceDatabase.provider || !output.referenceDatabase.version) errors.push('reference database provider and version are required');
  if (output.parameterIds.length === 0) errors.push('at least one parameter ID is required');
  if (!Number.isFinite(output.confidence) || output.confidence < 0 || output.confidence > 1) errors.push('confidence must be between 0 and 1');
  return errors;
}
