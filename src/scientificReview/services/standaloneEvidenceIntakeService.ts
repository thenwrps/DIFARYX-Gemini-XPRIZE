import { createAnalysisSession, saveAnalysisSession, type AnalysisTechnique } from '../../data/analysisSessions';
import {
  SUPPORTED_UPLOAD_EXTENSIONS,
  parseUploadedSignalText,
  saveUploadedSignalRun,
  type ParsedUploadedSignalSuccess,
  type Technique as UploadedTechnique,
  type UploadedSignalRun,
} from '../../data/uploadedSignalRuns';
import type { DemoProject, Technique } from '../../data/demoProjects';
import { uploadRawData } from '../../services/uploadService';
import { getProjectEvidenceSnapshot, type ProjectEvidenceSnapshot } from '../../utils/evidenceSnapshot';

export type EvidenceIntakeStatus =
  | 'uploading'
  | 'parsing'
  | 'ready'
  | 'needs metadata'
  | 'unsupported'
  | 'validation failed';

export interface StandaloneReviewMetadata {
  objective: string;
  materialSystem: string;
  decisionRequired: string;
}

export interface EvidenceFileIntakeResult {
  status: EvidenceIntakeStatus;
  detectedTechnique: UploadedTechnique;
  selectedTechnique: UploadedTechnique;
  parsed?: ParsedUploadedSignalSuccess;
  run?: UploadedSignalRun;
  message: string;
}

const SUPPORTED_TECHNIQUES: Technique[] = ['XRD', 'XPS', 'FTIR', 'Raman'];

export function hasValidScientificObjective(objective: string): boolean {
  return objective.trim().length >= 8;
}

export function isSupportedEvidenceFile(fileName: string): boolean {
  const extension = fileName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';
  return SUPPORTED_UPLOAD_EXTENSIONS.includes(extension as typeof SUPPORTED_UPLOAD_EXTENSIONS[number]);
}

export async function validateEvidenceFile(
  file: File,
  selectedTechnique?: UploadedTechnique,
  onStatus?: (status: EvidenceIntakeStatus) => void,
): Promise<EvidenceFileIntakeResult> {
  if (!isSupportedEvidenceFile(file.name)) {
    return {
      status: 'unsupported',
      detectedTechnique: 'Unknown',
      selectedTechnique: 'Unknown',
      message: `Unsupported format. Use ${SUPPORTED_UPLOAD_EXTENSIONS.map((extension) => `.${extension}`).join(', ')}.`,
    };
  }

  onStatus?.('parsing');
  let parsed;
  try {
    parsed = parseUploadedSignalText(file.name, await file.text());
  } catch {
    return {
      status: 'validation failed',
      detectedTechnique: 'Unknown',
      selectedTechnique: 'Unknown',
      message: 'DIFARYX could not read this file in the browser.',
    };
  }

  if (parsed.ok === false) {
    return {
      status: parsed.evidenceQuality.state === 'unsupported_format' ? 'unsupported' : 'validation failed',
      detectedTechnique: 'Unknown',
      selectedTechnique: 'Unknown',
      message: parsed.error,
    };
  }

  const detectedTechnique = parsed.suggestedTechnique;
  const technique = selectedTechnique && selectedTechnique !== 'Unknown'
    ? selectedTechnique
    : detectedTechnique;

  if (technique === 'Unknown') {
    return {
      status: 'needs metadata',
      detectedTechnique,
      selectedTechnique: 'Unknown',
      parsed,
      message: 'Signal parsed, but the technique could not be determined. Select the technique to validate compatibility.',
    };
  }

  try {
    const run = await uploadRawData(file, technique);
    if (!run.evidenceQuality.canInterpret) {
      return {
        status: 'validation failed',
        detectedTechnique,
        selectedTechnique: technique,
        parsed,
        run,
        message: run.evidenceQuality.messages[run.evidenceQuality.messages.length - 1] ?? run.evidenceQuality.label,
      };
    }
    return {
      status: 'ready',
      detectedTechnique,
      selectedTechnique: technique,
      parsed,
      run,
      message: `${run.extractedFeatures.length} bounded feature${run.extractedFeatures.length === 1 ? '' : 's'} passed the evidence gate.`,
    };
  } catch (error) {
    return {
      status: 'validation failed',
      detectedTechnique,
      selectedTechnique: technique,
      parsed,
      message: error instanceof Error ? error.message : 'Evidence validation failed.',
    };
  }
}

function toAnalysisTechnique(technique: UploadedTechnique): AnalysisTechnique | null {
  if (technique === 'XRD') return 'xrd';
  if (technique === 'XPS') return 'xps';
  if (technique === 'FTIR') return 'ftir';
  if (technique === 'Raman') return 'raman';
  return null;
}

export function persistValidatedEvidenceRuns(
  runs: UploadedSignalRun[],
  options: { projectId?: string; projectName?: string } = {},
): void {
  runs.forEach((run) => {
    saveUploadedSignalRun(run);
    const technique = toAnalysisTechnique(run.technique);
    if (!technique) return;
    const created = createAnalysisSession(technique, run.fileName);
    saveAnalysisSession({
      ...created,
      source: 'user_uploaded',
      uploadedRunId: run.id,
      projectId: options.projectId,
      projectName: options.projectName,
      status: run.evidenceQuality.canInterpret ? 'completed' : 'needs-review',
      processingLog: [
        `Agent evidence intake created from ${run.fileName}`,
        `Upload run: ${run.id}`,
        `Technique: ${run.technique}`,
        `Evidence gate: ${run.evidenceQuality.label}`,
        ...created.processingLog,
      ],
    });
  });
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export function buildAggregateUploadedSnapshot(
  runs: UploadedSignalRun[],
  metadata: StandaloneReviewMetadata,
  project?: DemoProject | null,
): ProjectEvidenceSnapshot {
  const projectId = project?.id;
  const uploadSnapshots = runs.map((run) => getProjectEvidenceSnapshot(projectId ?? null, {
    source: 'user_uploaded',
    uploadedRunId: run.id,
    projectIdExplicit: Boolean(projectId),
    runtimeMode: 'demo',
  }));
  const baseSnapshot = project
    ? getProjectEvidenceSnapshot(project.id, { projectIdExplicit: true, deferStoredContext: true, runtimeMode: 'demo' })
    : null;
  const snapshots = [...(baseSnapshot ? [baseSnapshot] : []), ...uploadSnapshots];
  const availableTechniques = SUPPORTED_TECHNIQUES.filter((technique) =>
    snapshots.some((snapshot) => snapshot.availableTechniques.includes(technique)),
  );
  const missingTechniques = SUPPORTED_TECHNIQUES.filter((technique) => !availableTechniques.includes(technique));
  const latestUpload = uploadSnapshots[uploadSnapshots.length - 1];
  const activeDataset = latestUpload?.activeDataset ?? baseSnapshot?.activeDataset ?? null;
  const evidenceEntries = snapshots.flatMap((snapshot) => snapshot.evidenceEntries).filter((entry, index, all) =>
    all.findIndex((candidate) => candidate.id === entry.id) === index,
  );
  const validationGaps = snapshots.flatMap((snapshot) => snapshot.validationGaps).filter((gap, index, all) =>
    all.findIndex((candidate) => candidate.id === gap.id) === index,
  );
  const sampleIdentity = metadata.materialSystem.trim() || latestUpload?.sampleIdentity || project?.material || 'Material system not specified';

  return {
    projectId: project?.id ?? 'user-uploaded-workspace',
    projectName: project?.name ?? 'Standalone Scientific Review',
    sampleIdentity,
    primaryTechnique: activeDataset?.technique ?? availableTechniques[0] ?? 'XRD',
    availableTechniques,
    pendingTechniques: missingTechniques,
    evidenceEntries,
    activeDataset,
    validationGaps,
    claimBoundary: {
      supported: unique(snapshots.flatMap((snapshot) => snapshot.claimBoundary.supported)),
      requiresValidation: unique(snapshots.flatMap((snapshot) => snapshot.claimBoundary.requiresValidation)),
      notSupportedYet: unique(snapshots.flatMap((snapshot) => snapshot.claimBoundary.notSupportedYet)),
      contextual: unique([
        ...snapshots.flatMap((snapshot) => snapshot.claimBoundary.contextual),
        `Research objective: ${metadata.objective.trim()}`,
        ...(metadata.decisionRequired.trim() ? [`Decision required: ${metadata.decisionRequired.trim()}`] : []),
      ]),
      pending: missingTechniques.map((technique) => `${technique} evidence not yet included`),
    },
    supportedAssignment: `Uploaded ${availableTechniques.join(', ')} evidence for ${sampleIdentity}`,
    notebookContext: baseSnapshot?.notebookContext ?? null,
    reportContext: baseSnapshot?.reportContext ?? null,
    sourceMode: 'user_uploaded',
    runtimeMode: 'demo',
    permissionMode: 'read_only',
    sourceLabel: project ? 'Project context with uploaded evidence' : 'User-uploaded evidence',
    approvalStatus: 'not_required',
    processingSupportLevel: latestUpload?.processingSupportLevel,
    processingSupportLabel: latestUpload?.processingSupportLabel,
  };
}
