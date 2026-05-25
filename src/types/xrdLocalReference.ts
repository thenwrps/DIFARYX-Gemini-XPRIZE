/**
 * XRD Local Reference Contract
 *
 * Frontend contract for uploaded/project-local reference metadata,
 * import diagnostics, and request-scoped matching eligibility.
 */

export type XRDLocalReferenceSourceType = "uploaded_reference" | "project_local_reference";

export type XRDLocalReferenceValidationStatus =
  | "not_uploaded"
  | "uploaded_unvalidated"
  | "validated_for_project"
  | "not_supported_yet";

export type XRDReferenceImportStatus =
  | "not_uploaded"
  | "detected"
  | "parsed_preview"
  | "repaired_preview"
  | "partial_preview"
  | "unsupported_format"
  | "corrupted_file"
  | "parse_error"
  | "requires_converter"
  | "not_supported_yet";

export type XRDReferenceFileKind =
  | "text_peak_list"
  | "exported_text_pattern"
  | "instrument_native"
  | "crystallographic_cif"
  | "reference_database_card"
  | "unknown_binary"
  | "unknown_text";

export type XRDReferenceTextBinaryLikelihood =
  | "likely_text"
  | "likely_binary"
  | "mixed"
  | "unknown";

export interface XRDReferenceImportDiagnostics {
  fileKind: XRDReferenceFileKind;
  detectedFormat?: string;
  fileSizeBytes?: number;
  textBinaryLikelihood: XRDReferenceTextBinaryLikelihood;
  parsedRowCount: number;
  ignoredRowCount: number;
  warnings: string[];
  errors: string[];
  isEligibleForBackendMatching: boolean;
}

export interface XRDReferenceImportCapability {
  canPreview: boolean;
  canParsePeaks: boolean;
  requiresConverter: boolean;
  plannedConverter: boolean;
  isEligibleForBackendMatching: boolean;
  notes: string[];
}

export interface XRDLocalReferencePeak {
  twoTheta: number;
  relativeIntensity?: number;
  hkl?: string;
  dSpacing?: number;
}

export type XRDLocalReferenceParseStatus = XRDReferenceImportStatus;

export interface XRDLocalReferenceValidation {
  hasTwoTheta: boolean;
  hasAtLeastThreePeaks: boolean;
  hasRelativeIntensity: boolean;
  hasRequiredMetadata: boolean;
  warnings: string[];
  errors: string[];
}

export interface XRDLocalReferenceCellParameters {
  a?: number;
  b?: number;
  c?: number;
  alpha?: number;
  beta?: number;
  gamma?: number;
}

export interface XRDCifMetadata {
  dataBlockName?: string;
  atomSiteCount?: number;
  hasCellParameters: boolean;
  hasSpaceGroup: boolean;
  hasAtomSites: boolean;
  conversionMode: "metadata_only" | "estimated_peak_preview" | "not_supported_yet";
}

export interface XRDLocalReferenceParseResult {
  sourceFileName: string;
  sourceFileType?: ".csv" | ".txt" | ".xy" | ".dat";
  parsedAt: string;
  status: XRDLocalReferenceParseStatus;
  referenceLabel?: string;
  formula?: string;
  materialFamily?: string;
  structureName?: string;
  formulaFromCif?: string;
  spaceGroup?: string;
  crystalSystem?: string;
  cellParameters?: XRDLocalReferenceCellParameters;
  cifMetadata?: XRDCifMetadata;
  elements: string[];
  peaks: XRDLocalReferencePeak[];
  validation: XRDLocalReferenceValidation;
  fileKind: XRDReferenceFileKind;
  detectedFormat?: string;
  fileSizeBytes?: number;
  textBinaryLikelihood: XRDReferenceTextBinaryLikelihood;
  parsedRowCount: number;
  ignoredRowCount: number;
  importDiagnostics: XRDReferenceImportDiagnostics;
  importCapability: XRDReferenceImportCapability;
  isEligibleForBackendMatching: boolean;
  backendAvailable: false;
  usedForMatching: false;
}

export interface XRDReferenceImportResult {
  sourceFileName: string;
  sourceFileType?: ".csv" | ".txt" | ".xy" | ".dat";
  importedAt: string;
  status: XRDReferenceImportStatus;
  fileKind: XRDReferenceFileKind;
  detectedFormat?: string;
  fileSizeBytes?: number;
  textBinaryLikelihood: XRDReferenceTextBinaryLikelihood;
  parsedRowCount: number;
  ignoredRowCount: number;
  diagnostics: XRDReferenceImportDiagnostics;
  capability: XRDReferenceImportCapability;
  parseResult: XRDLocalReferenceParseResult;
  isEligibleForBackendMatching: boolean;
}

export interface XRDLocalReferenceMetadata {
  id: string;
  label: string;
  sourceType: XRDLocalReferenceSourceType;
  sourceFileName?: string;
  formula?: string;
  materialFamily?: string;
  elements: string[];
  phaseLabel?: string;
  referencePeakCount?: number;
  validationStatus: XRDLocalReferenceValidationStatus;
  backendAvailable: false;
  notes: string[];
}

export function createEmptyXrdLocalReferenceParseResult(): XRDLocalReferenceParseResult {
  const importDiagnostics: XRDReferenceImportDiagnostics = {
    fileKind: "unknown_text",
    textBinaryLikelihood: "unknown",
    parsedRowCount: 0,
    ignoredRowCount: 0,
    warnings: [],
    errors: [],
    isEligibleForBackendMatching: false,
  };
  const importCapability: XRDReferenceImportCapability = {
    canPreview: false,
    canParsePeaks: false,
    requiresConverter: false,
    plannedConverter: false,
    isEligibleForBackendMatching: false,
    notes: [],
  };

  return {
    sourceFileName: "",
    parsedAt: new Date(0).toISOString(),
    status: "not_uploaded",
    elements: [],
    peaks: [],
    validation: {
      hasTwoTheta: false,
      hasAtLeastThreePeaks: false,
      hasRelativeIntensity: false,
      hasRequiredMetadata: false,
      warnings: [],
      errors: [],
    },
    fileKind: "unknown_text",
    textBinaryLikelihood: "unknown",
    parsedRowCount: 0,
    ignoredRowCount: 0,
    importDiagnostics,
    importCapability,
    isEligibleForBackendMatching: false,
    backendAvailable: false,
    usedForMatching: false,
  };
}

export function getXrdLocalReferenceValidationStatusLabel(status: XRDLocalReferenceParseStatus): string {
  switch (status) {
    case "not_uploaded":
      return "Not uploaded";
    case "parsed_preview":
      return "Parsed preview";
    case "repaired_preview":
      return "Repaired preview";
    case "partial_preview":
      return "Partial preview";
    case "unsupported_format":
      return "Unsupported format";
    case "corrupted_file":
      return "Corrupted file";
    case "parse_error":
      return "Parse error";
    case "requires_converter":
      return "Converter required";
    case "not_supported_yet":
      return "Not supported yet";
    case "detected":
      return "Detected";
    default:
      return status;
  }
}

/**
 * Planned local reference registry entries.
 * These placeholder entries are not selectable for backend matching.
 */
export const PLANNED_XRD_LOCAL_REFERENCES: XRDLocalReferenceMetadata[] = [
  {
    id: "uploaded_reference_placeholder",
    label: "Uploaded Reference Pattern (Planned)",
    sourceType: "uploaded_reference",
    elements: [],
    validationStatus: "not_supported_yet",
    backendAvailable: false,
    notes: [
      "Uploaded local reference registry entries are planned for a future phase.",
      "This placeholder entry is not selectable for backend matching.",
      "Use an eligible saved parsed preview and explicit toggle for request-scoped matching.",
    ],
  },
  {
    id: "project_local_reference_placeholder",
    label: "Project Local Reference Set (Planned)",
    sourceType: "project_local_reference",
    elements: [],
    validationStatus: "not_supported_yet",
    backendAvailable: false,
    notes: [
      "Project-local reference sets are planned for a future phase.",
      "This placeholder entry is not selectable for backend matching.",
      "Use an eligible saved parsed preview and explicit toggle for request-scoped matching.",
    ],
  },
];
