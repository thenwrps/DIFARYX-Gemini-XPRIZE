/**
 * reportPreviewTypes.ts
 *
 * Shared types re-exported so that ReportPreviewPanel and
 * reportExportEngine can reference workspace types without
 * circular imports back into the monolithic workspace file.
 */

export interface PeakResult {
  position: number;
  intensity: number;
  spacing: string;
  assignment: string;
  reference: string;
  score: number;
  confidence: 'High' | 'Medium' | 'Limited';
}

export type TechniqueId = 'xrd' | 'xps' | 'ftir' | 'raman';

export interface ReferenceUnitRow {
  label: string;
  value: string;
  unit?: string;
  status?: string;
}

export interface ImportedReferenceFile {
  filename: string;
  size: number;
  mediaType: string;
  importedAt: string;
  status: 'pending_certified_site_approval';
}

export interface ReferencePresentation {
  provider: string;
  version: string;
  license: string;
  approvalStatus: string;
  certificationRemark: string | null;
  unitRows: ReferenceUnitRow[];
  importedFile?: ImportedReferenceFile;
}

export interface WorkspaceFile {
  id: string;
  filename: string;
  extension: string;
  technique: TechniqueId;
  status: 'Processed' | 'Validated' | 'Needs review' | 'Processing';
  uploadedAt: string;
  instrument: string;
  sampleId: string;
  xLabel: string;
  yLabel: string;
  points: Array<{ x: number; y: number }>;
  peaks: PeakResult[];
  observation: string;
  interpretation: string;
  validationGap: string;
  nextExperiment: string;
  quality: string;
}
