/**
 * FTIR Evidence — public surface
 *
 * Consumers (reasoning, notebook, report, fusion) should import from this
 * module only. Re-exports preserve a stable entry point even if internal
 * files are split later.
 */

export type {
  FtirSignalUnit,
  FtirUnitDetectionSource,
  FtirSignalDescriptor,
  FtirRawPoint,
  FtirUnitDetectionResult,
  FtirEvidence,
} from './types';

export {
  detectFtirSignalUnit,
  summarize,
  FTIR_TECHNIQUE,
  FTIR_EVIDENCE_SCHEMA_VERSION,
  FTIR_MEDIUM_CONFIDENCE_THRESHOLD,
  FTIR_HIGH_CONFIDENCE_THRESHOLD,
} from './types';

export type {
  FtirAdapterInput,
} from './adapter';

export {
  FtirAdapterContractError,
  adaptFtirProcessingResult,
  ftirBandToEvidenceNode,
  buildFtirSignalDescriptor,
  buildFtirProvenance,
} from './adapter';
