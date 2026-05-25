import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, BarChart3, ChevronDown, ChevronLeft, ChevronRight, Download, FileText, FlaskConical, MoreHorizontal, Plus, Printer, Save, Share2, Target, X } from 'lucide-react';
import { DashboardLayout } from '../components/layout/DashboardLayout';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { AIInsightPanel } from '../components/ui/AIInsightPanel';
import { ExperimentModal } from '../components/workspace/ExperimentModal';
import { useAuth } from '../contexts/AuthContext';
import { useXrdWorkflowRuntime } from '../context/XrdWorkflowRuntimeContext';
import { formatChemicalFormula } from '../utils';
import {
  ProcessingRun,
  demoProjects,
  generateNotebookSections,
  getAgentPath,
  getDataset,
  getLocalExperiments,
  getLocalProjectNotebooks,
  deleteProjectNotebook,
  getNotebookPath,
  getNotebookTypeBadge,
  getProcessingRun,
  getProcessingRuns,
  getProject,
  getProjectDatasets,
  getProjectInsight,
  getWorkspaceRoute,
  loadAgentRunResult,
  type DemoDataset,
  type DemoProject,
  type ProjectNotebook,
  type Technique,
} from '../data/demoProjects';
import {
  getRegistryProject,
  isKnownProjectId,
  claimStatusLabel,
  claimStatusColorClass,
  jobTypeLabel,
  jobTypeBadgeClass,
  type RegistryProject,
} from '../data/demoProjectRegistry';
import { DemoExportFormat, exportDemoArtifact } from '../utils/demoExport';
import { getRun, type AgentRun } from '../data/runModel';
import {
  NOTEBOOK_TEMPLATES,
  createNotebookEntryFromRefinement,
  createProcessingResultFromXrdDemo,
  createReportSectionFromNotebookEntry,
  getLatestAgentDiscussionRefinement,
  getLatestNotebookEntry,
  getLatestProcessingResult,
  getNotebookEntry,
  normalizeNotebookTemplateMode,
  refineDiscussionFromProcessing,
  saveAgentDiscussionRefinement,
  saveNotebookEntry,
  saveProcessingResult,
  type NotebookTemplateMode,
} from '../data/workflowPipeline';
import {
  selectXrdWorkflowScientificEvidence,
  selectXrdWorkflowReferenceMatchEvidence,
  extractScientificEvidenceFields,
  extractReferenceMatchFields,
  selectXrdQualityMetrics,
  selectXrdPhaseMatchSummary,
} from '../data/xrdWorkflowHandoffSelectors';
import {
  XRD_DEMO_DATASETS,
  getXrdProjectCompatibility,
  isDatasetCompatibleWithProject,
} from '../data/xrdDemoDatasets';
import { getLockedContext } from '../data/lockedContext';
import {
  formatConditionLockTimestamp,
  getConditionBoundaryNotes,
  getExperimentConditionLock,
  getConditionLockSectionLines,
  getConditionLockStatusLabel,
} from '../data/experimentConditionLock';
import { getProjectEvidenceSnapshot, type ProjectEvidenceSnapshot } from '../utils/evidenceSnapshot';
import { createUploadedEvidenceRegistryProject } from '../utils/uploadedEvidenceProjectContext';
import { ConnectedAccountStatus } from '../components/runtime/ConnectedAccountStatus';
import { getRuntimeBadgeClass, getRuntimeBadgeLabel, requiresApproval } from '../runtime/difaryxRuntimeMode';
import {
  createApprovalActionPreview,
  type ApprovalActionPreview,
  type ApprovalActionType,
  type ApprovalRiskLevel,
} from '../runtime/actionApproval';
import { appendApprovalLedgerEntry, createApprovalLedgerEntry, summarizeApprovalLedger } from '../runtime/approvalLedger';
import { ApprovalLedgerPanel } from '../components/runtime/ApprovalLedgerPanel';
import { ApprovalActionDialog } from '../components/runtime/ApprovalActionDialog';
import {
  getDefaultConnectedAccountState,
  getGoogleConnectedShellState,
} from '../runtime/connectedAccounts';
import {
  createEvidenceBundleFromSnapshot,
  getEvidenceBundleBadgeLabel,
  getTechniqueCoverageFromBundle,
} from '../runtime/evidenceBundle';
import {
  readProjectWorkspaceParameters,
} from '../utils/workspaceParameterOverrides';
import {
  getParameterProvenanceSummary,
  formatParameterValueForDisplay,
  formatProvenanceSource,
  formatProvenanceTimestamp,
  generateParameterProvenanceMarkdown,
} from '../utils/parameterProvenanceSummary';
import type { TechniqueWorkspaceId } from '../data/techniqueWorkspaceContent';
import { getProjectTechniques } from '../utils/projectEvidence';
import {
  getStoredWorkspaceMode,
  setWorkspaceMode,
} from '../utils/workspaceMode';
import {
  buildEvidenceRouteSearch,
  getEvidenceRouteContext,
  type EvidenceRouteContext,
} from '../utils/evidenceRouteContext';
import { runWhenIdle } from '../utils/idle';

const NOTEBOOK_TEMPLATE_MODES: NotebookTemplateMode[] = ['research', 'rd', 'analytical'];
const NOTEBOOK_TABS = ['Objective / Context', 'Evidence', 'Interpretation', 'Validation Gap', 'Decision'] as const;
type ActiveNotebookTab = typeof NOTEBOOK_TABS[number];

function formatClaimStatus(status: string): string {
  switch (status) {
    case 'strongly_supported': return 'Supported assignment with validation boundaries';
    case 'supported': return 'Requires validation';
    case 'partial': return 'Validation-limited';
    case 'inconclusive': return 'Publication-limited';
    case 'contradicted': return 'Claim boundary';
    default: return status;
  }
}

const NOTEBOOK_REFERENCE_CANDIDATE_BOUNDARY_LINES = [
  'Candidate evidence only',
  'Not identity confirmation',
  'Not phase purity confirmation',
  'Composition-sensitive evidence required for stronger assignment',
];

const NOTEBOOK_REFERENCE_CANDIDATE_FALLBACK_LIMITATIONS = [
  'Candidate match is based on peak-position agreement.',
  'Chemical identity requires composition-sensitive evidence.',
  'Phase purity is outside this XRD-only candidate evidence.',
];

function isBlockedNotebookReferenceCandidatePhrase(value: string) {
  const normalized = value.toLowerCase();
  return (
    (normalized.includes('confirmed') && normalized.includes('phase')) ||
    (normalized.includes('confirmed') && normalized.includes('identity')) ||
    (normalized.includes('identified') && normalized.includes(' as ')) ||
    (normalized.includes('pure') && normalized.includes('phase')) ||
    (normalized.includes('definitive') && normalized.includes('match'))
  );
}

function safeNotebookReferenceCandidateText(value: string | undefined | null): string | null {
  const normalized = value?.trim();
  if (!normalized) return null;
  return isBlockedNotebookReferenceCandidatePhrase(normalized) ? null : normalized;
}

function formatNotebookReferenceNumber(value: number | undefined | null, digits = 2): string | null {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : null;
}

function formatNotebookReferenceTimestamp(value: string | undefined | null): string {
  if (!value) return 'timestamp pending';
  try {
    const d = new Date(value);
    return isNaN(d.getTime()) ? 'timestamp pending' : d.toLocaleString();
  } catch {
    return 'timestamp pending';
  }
}

/**
 * Safe confidence display: returns the mapped claim-status label when it
 * resolves to a known phrase; otherwise derives a neutral fallback from
 * active-project evidence and validation-gap state.
 */
function resolveConfidenceLabel(
  claimStatus: string | undefined | null,
  hasEvidenceLinked: boolean,
  openValidationGaps: number,
): string {
  const known = new Set([
    'strongly_supported',
    'supported',
    'partial',
    'inconclusive',
    'contradicted',
  ]);
  if (claimStatus && known.has(claimStatus)) {
    const label = formatClaimStatus(claimStatus);
    if (label && label.trim()) return label;
  }
  if (!hasEvidenceLinked) return 'Pending';
  if (openValidationGaps > 0) return 'Medium-high - validation-limited';
  return 'High';
}

const NOTEBOOK_TEMPLATE_DETAILS: Record<
  NotebookTemplateMode,
  {
    description: string;
    output: string;
    status: string;
    primaryLabel: string;
    reportPreview: string;
    badges: string[];
  }
> = {
  research: {
    description:
      'For hypothesis-driven research, evidence fusion, claim boundaries, mechanism discussion, and manuscript-ready interpretation.',
    output: 'Report-ready for internal scientific review; publication-level claims remain validation-limited.',
    status: 'Publication-limited',
    primaryLabel: 'Refined Discussion',
    reportPreview: 'Manuscript discussion section generated from this notebook entry.',
    badges: ['Source workflow', 'Refined discussion', 'Evidence review', 'Claim boundary', 'Validation notes'],
  },
  rd: {
    description:
      'For prototype development, technical validation, optimization, feasibility review, and go/no-go decisions.',
    output: 'Technical report + development status + next action.',
    status: 'Review-ready',
    primaryLabel: 'Go/No-Go Rationale',
    reportPreview: 'Technical report section generated from prototype metrics, risk review, and decision rationale.',
    badges: ['Source workflow', 'Risk review', 'Go/No-Go rationale', 'Development status', 'Next development plan'],
  },
  analytical: {
    description:
      'For sample analysis, method execution, calibration, QA/QC, result validity, and analytical reporting.',
    output: 'Analytical report + QA/QC status + review or retest decision.',
    status: 'Report-ready',
    primaryLabel: 'Reviewed Result',
    reportPreview: 'Analytical report section generated from method, QA/QC, and result validity.',
    badges: ['Source workflow', 'QA/QC review', 'Result validity', 'Analytical result', 'Review / Retest'],
  },
};

type SupportingDataItem = {
  technique: string;
  evidence: string;
  strength: 'Ready' | 'Review' | 'In Progress';
  dataset: string;
  caveat: string;
};

const DETERMINISTIC_TRACE = [
  'load_xrd_dataset',
  'detect_xrd_peaks',
  'search_phase_database',
  'evaluate_phase_candidates',
  'analyze_peak_conflicts',
  'interpretation_refinement',
  'generate_xrd_discussion',
];

const SBA15_DETERMINISTIC_TRACE = [
  'load_primary_xrd_dataset',
  'detect_xrd_reflections',
  'compare_spinel_reference_scope',
  'attach_raman_ftir_context',
  'flag_xps_surface_state_gap',
  'validation_boundary_review',
  'generate_multitech_discussion',
];

const NIFE2O4_DETERMINISTIC_TRACE = [
  'load_xrd_control_dataset',
  'detect_spinel_reflections',
  'compare_nickel_ferrite_reference',
  'confirm_absence_secondary_oxide',
  'generate_control_sample_discussion',
];

const COFE2O4_DETERMINISTIC_TRACE = [
  'load_xrd_and_xps_datasets',
  'detect_xrd_spinel_reflections',
  'evaluate_cobalt_ferrite_phase',
  'analyze_xps_oxidation_envelope',
  'flag_xps_fit_refinement_gap',
  'generate_multitech_discussion',
];

const FE3O4_DETERMINISTIC_TRACE = [
  'load_ftir_spectrum',
  'assign_metal_oxygen_band',
  'load_raman_spectrum',
  'compare_iron_oxide_nanoparticle_references',
  'flag_xrd_phase_ambiguity_gap',
  'generate_nanoparticle_surface_discussion',
];

function hasMatchedXrdDemoData(projectId: string): boolean {
  /* Check XRD-compatible datasets first */
  const compatibility = getXrdProjectCompatibility(projectId);
  if (compatibility) {
    const hasXrdMatch = compatibility.datasetIds.some((datasetId) => (
      isDatasetCompatibleWithProject(datasetId, projectId) &&
      XRD_DEMO_DATASETS.some((dataset) => dataset.id === datasetId)
    ));
    if (hasXrdMatch) return true;
  }

  /* Also check if the project has non-XRD built-in evidence sources (FTIR, Raman, XPS) */
  const project = getProject(projectId);
  if (project && project.evidenceSources && project.evidenceSources.length > 0) {
    return true;
  }

  return false;
}

function getProjectNotebookContent(projectId: string) {
  const registryProject = getRegistryProject(projectId);
  const notebook = registryProject.notebook;
  const supportingData: SupportingDataItem[] = registryProject.evidenceResults.map((item) => {
    const technique = registryProject.techniques.find((tech) => tech.id === item.techniqueId);
    return {
      technique: item.displayName,
      evidence: item.summary,
      strength: item.supportsClaim ? 'Ready' : 'Review',
      dataset: technique?.datasetLabel || `${item.displayName} dataset`,
      caveat: item.limitation,
    };
  });

  return {
    experimentTitle: notebook.title,
    summary: registryProject.evidenceSummary,
    discussion: notebook.interpretation,
    reportPreview: notebook.reportDraft,
    keyEvidence: notebook.evidenceBasis,
    supportingData,
    validationNotes: [
      notebook.validationBoundary,
      registryProject.crossTechniqueComparison.validationGap,
      registryProject.crossTechniqueComparison.recommendedNextAction,
      ...registryProject.crossTechniqueComparison.missingEvidence,
    ],
    runLog: registryProject.experimentHistory.map((event) => [
      event.eventType.replace(/_/g, ' '),
      `${event.timestampLabel} - ${event.summary}`,
    ]),
    phaseLabel: registryProject._raw.phase,
    peakDetection: registryProject._raw.notebook.peakDetection,
  };

}

function sanitizeTraceStep(step: string) {
  const legacyModelStep = 'gemini' + '_reasoner';
  const legacyModelLabel = 'Gemini' + ' reasoner';
  return step
    .replaceAll(legacyModelStep, 'interpretation_refinement')
    .replaceAll(legacyModelLabel, 'interpretation refinement');
}

type NotebookCsvValue = string | number | boolean | null | undefined;
type NotebookCsvRow = Record<string, NotebookCsvValue>;

const NOTEBOOK_CSV_COLUMNS = [
  'project_id',
  'project_name',
  'sample_id',
  'technique',
  'dataset_id',
  'x_value',
  'y_value',
  'x_unit',
  'y_unit',
  'processed_signal',
  'peak_position',
  'peak_intensity',
  'assignment',
  'quality_flag',
  'validation_status',
  'claim_boundary',
  'source_file',
  'processing_method',
  'notebook_entry_id',
  'exported_at',
];

function toCsvSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function csvEscape(value: NotebookCsvValue) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function downloadNotebookCsv(filename: string, rows: NotebookCsvRow[]) {
  const extraColumns = rows.flatMap((row) => Object.keys(row)).filter((key) => !NOTEBOOK_CSV_COLUMNS.includes(key));
  const headers = [...NOTEBOOK_CSV_COLUMNS, ...Array.from(new Set(extraColumns))];
  const content = [headers.join(','), ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(','))].join('\n');
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function axisUnit(label: string) {
  const match = label.match(/\(([^)]+)\)/);
  return match?.[1] ?? label;
}

function processingMethodLabel(dataset: DemoDataset) {
  const activeSteps = Object.entries(dataset.processingState)
    .filter(([, value]) => value === true)
    .map(([key]) => key.replace(/([a-z])([A-Z])/g, '$1 $2'));
  return activeSteps.length > 0 ? activeSteps.join(' + ') : 'preloaded raw signal';
}

function validationStatusForProject(registryProject: RegistryProject) {
  if (registryProject.claimStatus === 'supported_assignment' || registryProject.claimStatus === 'report_ready') {
    return 'supported_assignment';
  }
  if (registryProject.claimStatus === 'processing_required') return 'insufficient_evidence';
  if (registryProject.claimStatus === 'validation_limited') return 'validation_limited';
  return 'tentative_assignment';
}

function qualityFlagForEvidence(registryProject: RegistryProject, supportsClaim?: boolean) {
  if (!supportsClaim) return registryProject.claimStatus === 'processing_required' ? 'insufficient_evidence' : 'tentative_assignment';
  return registryProject.validationGapCount > 0 ? 'validation_limited' : 'supported_assignment';
}

function evidenceForDataset(registryProject: RegistryProject, dataset: DemoDataset) {
  const techniqueId = dataset.technique.toLowerCase();
  return registryProject.evidenceResults.find((item) => item.techniqueId === techniqueId);
}

function baseCsvFields(
  project: DemoProject,
  registryProject: RegistryProject,
  dataset: DemoDataset | null,
  notebookEntryId: string,
  exportedAt: string,
): NotebookCsvRow {
  const evidence = dataset ? evidenceForDataset(registryProject, dataset) : null;
  return {
    project_id: project.id,
    project_name: project.name,
    sample_id: dataset?.sampleName ?? registryProject.context.sampleDescription,
    technique: dataset?.technique ?? 'multi',
    dataset_id: dataset?.id ?? `${project.id}-notebook-summary`,
    x_value: '',
    y_value: '',
    x_unit: dataset ? axisUnit(dataset.xLabel) : '',
    y_unit: dataset ? axisUnit(dataset.yLabel) : '',
    processed_signal: '',
    peak_position: '',
    peak_intensity: '',
    assignment: evidence?.supportsClaim ? 'supported_assignment' : validationStatusForProject(registryProject),
    quality_flag: qualityFlagForEvidence(registryProject, evidence?.supportsClaim),
    validation_status: validationStatusForProject(registryProject),
    claim_boundary: evidence?.limitation ?? registryProject.notebook.validationBoundary,
    source_file: dataset?.fileName ?? 'project evidence registry',
    processing_method: dataset ? processingMethodLabel(dataset) : 'registry evidence summary',
    notebook_entry_id: notebookEntryId,
    exported_at: exportedAt,
  };
}

function buildRawSignalRows(
  project: DemoProject,
  registryProject: RegistryProject,
  dataset: DemoDataset,
  notebookEntryId: string,
  exportedAt: string,
) {
  const base = baseCsvFields(project, registryProject, dataset, notebookEntryId, exportedAt);
  return dataset.dataPoints.map((point) => ({
    ...base,
    x_value: point.x,
    y_value: point.y,
    processed_signal: point.y,
  }));
}

function buildFeatureRows(
  project: DemoProject,
  registryProject: RegistryProject,
  dataset: DemoDataset,
  notebookEntryId: string,
  exportedAt: string,
) {
  const base = baseCsvFields(project, registryProject, dataset, notebookEntryId, exportedAt);
  const evidence = evidenceForDataset(registryProject, dataset);
  if (dataset.detectedFeatures.length > 0) {
    return dataset.detectedFeatures.map((feature) => ({
      ...base,
      peak_position: feature.position,
      peak_intensity: feature.intensity,
      assignment: feature.label || base.assignment,
    }));
  }
  const findings = evidence?.findings.length ? evidence.findings : [evidence?.summary ?? 'No extracted features recorded for this technique.'];
  return findings.map((finding, index) => ({
    ...base,
    peak_position: '',
    peak_intensity: '',
    assignment: evidence?.supportsClaim ? `supported_assignment: ${finding}` : `tentative_assignment: ${finding}`,
    feature_index: index + 1,
  }));
}

function buildNotebookSummaryRows(
  project: DemoProject,
  registryProject: RegistryProject,
  notebookEntryId: string,
  exportedAt: string,
) {
  const toTechnique = (value: string): Technique | null => {
    if (value === 'xrd') return 'XRD';
    if (value === 'xps') return 'XPS';
    if (value === 'ftir') return 'FTIR';
    if (value === 'raman') return 'Raman';
    return null;
  };
  return registryProject.evidenceResults.map((item, index) => {
    const rawTechnique = toTechnique(item.techniqueId);
    const dataset = rawTechnique
      ? getProjectDatasets(project.id).find((candidate) => candidate.technique === rawTechnique) ?? null
      : null;
    return {
      ...baseCsvFields(project, registryProject, dataset, notebookEntryId, exportedAt),
      technique: item.displayName,
      dataset_id: dataset?.id ?? `${project.id}-${item.techniqueId}-registry`,
      assignment: item.supportsClaim ? 'supported_assignment' : 'tentative_assignment',
      quality_flag: qualityFlagForEvidence(registryProject, item.supportsClaim),
      validation_status: validationStatusForProject(registryProject),
      claim_boundary: item.limitation,
      processing_method: dataset ? processingMethodLabel(dataset) : 'registry evidence summary',
      evidence_summary: item.summary,
      limitation: item.limitation,
      feature_index: index + 1,
    };
  });
}

function getSnapshotStatusLabel(snapshot: ProjectEvidenceSnapshot, fallbackStatus: string) {
  if ((snapshot.evidenceEntries ?? []).length === 0) return 'Requires dataset';
  if ((snapshot.pendingTechniques ?? []).length > 0 || (snapshot.validationGaps ?? []).length > 0) {
    return 'Validation-limited';
  }
  return fallbackStatus;
}

function getSnapshotEvidenceLine(snapshot: ProjectEvidenceSnapshot) {
  return snapshot.evidenceEntries?.[0]?.support ?? `Evidence review pending for ${snapshot.projectName}.`;
}

function getSnapshotClaimBoundaryLines(snapshot: ProjectEvidenceSnapshot) {
  return [
    ...snapshot.claimBoundary.supported.map((line) => `Supported: ${line}`),
    ...snapshot.claimBoundary.requiresValidation.map((line) => `Requires validation: ${line}`),
    ...snapshot.claimBoundary.notSupportedYet.map((line) => `Not supported yet: ${line}`),
    ...(snapshot.claimBoundary.contextual ?? []).map((line) => `Contextual: ${line}`),
    ...(snapshot.claimBoundary.pending ?? []).map((line) => `Pending: ${line}`),
  ];
}

function NotebookEmptyState({ email }: { email?: string }) {
  return (
    <DashboardLayout>
      <div className="h-full overflow-y-auto bg-slate-50 p-6">
        <div className="mx-auto max-w-5xl">
          <div className="mb-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">Notebook Lab</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-text-main">User Notebook</h1>
            {email && <p className="mt-1 text-sm text-text-muted">Signed in as {email}</p>}
          </div>
          <Card className="rounded-lg border-dashed bg-white p-10 text-center">
            <FileText size={42} className="mx-auto text-text-dim" />
            <h2 className="mt-4 text-lg font-bold text-text-main">No user notebook entries yet</h2>
            <p className="mt-2 text-sm text-text-muted">Upload evidence or create a notebook entry</p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Link
                to="/analysis?source=user_uploaded&next=notebook"
                className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-xs font-bold text-white hover:bg-primary/90"
              >
                Upload evidence
              </Link>
              <Link
                to="/dashboard"
                className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-white px-3 text-xs font-bold text-text-main hover:bg-slate-50"
              >
                Create notebook entry
              </Link>
              <Link
                to="/notebook?project=cu-fe2o4-spinel&mode=demo"
                onClick={() => setWorkspaceMode('demo')}
                className="inline-flex h-9 items-center justify-center rounded-md border border-primary bg-primary/10 px-3 text-xs font-bold text-primary hover:bg-primary/20"
              >
                Use demo notebook
              </Link>
            </div>
            <p className="mt-5 text-xs font-semibold text-amber-700">External writes disabled</p>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}

function NotebookDemoProjectPrompt({ projectId }: { projectId: string }) {
  return (
    <DashboardLayout>
      <div className="h-full overflow-y-auto bg-slate-50 p-6">
        <Card className="mx-auto max-w-4xl rounded-lg bg-white p-6">
          <h1 className="text-xl font-bold text-text-main">This is a demo project. Open in Demo Mode?</h1>
          <p className="mt-2 text-sm text-text-muted">
            User Workspace does not auto-load demo notebook context after Google sign-in.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              to={`/notebook?project=${projectId}&mode=demo`}
              onClick={() => setWorkspaceMode('demo')}
              className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-xs font-bold text-white hover:bg-primary/90"
            >
              Open in Demo Mode
            </Link>
            <Link
              to="/notebook"
              className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-white px-3 text-xs font-bold text-text-main hover:bg-slate-50"
            >
              Return to User Notebook
            </Link>
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}

function UploadedNotebookContext({ routeContext }: { routeContext: EvidenceRouteContext }) {
  const snapshot = getProjectEvidenceSnapshot(null, {
    source: routeContext.source,
    analysisSessionId: routeContext.sessionId,
    uploadedRunId: routeContext.uploadedRunId,
    driveFileId: routeContext.driveFileId,
    projectIdExplicit: false,
  });
  const dataset = snapshot.activeDataset;
  const graphData = dataset?.dataPoints ?? [];
  const features = dataset?.detectedFeatures ?? [];
  const evidenceQuery = buildEvidenceRouteSearch(routeContext);
  const suffix = evidenceQuery ? `?${evidenceQuery}` : '';
  const technique = snapshot.primaryTechnique.toLowerCase();
  const workspacePath = `/workspace/${technique}?mode=quick${evidenceQuery ? `&${evidenceQuery}` : ''}`;
  const missingTitle = !dataset
    ? 'Uploaded evidence not found'
    : graphData.length === 0
      ? 'Graph data unavailable'
      : null;

  return (
    <DashboardLayout>
      <div className="h-full overflow-y-auto bg-slate-50 p-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-blue-700">Notebook / User Workspace</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-text-main">{dataset?.fileName ?? snapshot.sampleIdentity}</h1>
              <p className="mt-1 text-sm text-text-muted">Uploaded evidence summary and provenance. Demo project list is hidden for this context.</p>
            </div>
            <span className={`rounded-full border px-3 py-1 text-xs font-bold ${getRuntimeBadgeClass({
              sourceMode: snapshot.sourceMode ?? 'user_uploaded',
              runtimeMode: snapshot.runtimeMode ?? 'demo',
              permissionMode: snapshot.permissionMode ?? 'read_only',
              sourceLabel: snapshot.sourceLabel ?? 'User-uploaded evidence',
              approvalStatus: snapshot.approvalStatus ?? 'not_required',
            })}`}>
              {snapshot.sourceLabel ?? 'User-uploaded evidence'}
            </span>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <Card className="rounded-lg bg-white p-5">
              <h2 className="text-lg font-bold text-text-main">Uploaded evidence summary</h2>
              {missingTitle && (
                <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                  <p className="font-bold">{missingTitle}</p>
                  <p className="mt-1">
                    {!dataset
                      ? 'The requested session/upload pair was not found in local browser storage.'
                      : 'The uploaded snapshot loaded, but no graph points are available for notebook rendering.'}
                  </p>
                </div>
              )}
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-md border border-border bg-slate-50 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Active dataset</p>
                  <p className="mt-1 truncate text-sm font-bold text-text-main">{dataset?.fileName ?? 'Uploaded evidence'}</p>
                </div>
                <div className="rounded-md border border-border bg-slate-50 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Technique</p>
                  <p className="mt-1 text-sm font-bold text-text-main">{snapshot.availableTechniques.join(', ') || 'Metadata only'}</p>
                </div>
                <div className="rounded-md border border-border bg-slate-50 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Source</p>
                  <p className="mt-1 text-sm font-bold text-text-main">source=user_uploaded</p>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <section className="rounded-md border border-border bg-white p-3">
                  <h3 className="text-sm font-bold text-text-main">Skill-derived Evidence Basis</h3>
                  <p className="mt-2 text-sm leading-relaxed text-text-muted">
                    {snapshot.evidenceEntries[0]?.support ?? 'Uploaded evidence is available as metadata-only context until more signal features are detected.'}
                  </p>
                </section>
                <section className="rounded-md border border-border bg-white p-3">
                  <h3 className="text-sm font-bold text-text-main">Graph and detected reflections</h3>
                  <p className="mt-2 text-sm leading-relaxed text-text-muted">
                    Graph points: {graphData.length}. Detected features: {features.length}.
                  </p>
                  {features.length > 0 && (
                    <ul className="mt-2 space-y-1 text-sm text-text-muted">
                      {features.slice(0, 6).map((feature, index) => (
                        <li key={`${feature.position}-${index}`}>
                          - {feature.label} / {feature.position} / intensity {feature.intensity}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
                <section className="rounded-md border border-border bg-white p-3">
                  <h3 className="text-sm font-bold text-text-main">Provenance</h3>
                  <p className="mt-2 text-sm leading-relaxed text-text-muted">
                    File: {dataset?.fileName ?? routeContext.uploadedRunId ?? 'local upload'} / Session: {routeContext.sessionId ?? 'local'} / External writes disabled.
                  </p>
                </section>
                <section className="rounded-md border border-amber-200 bg-amber-50 p-3">
                  <h3 className="text-sm font-bold text-amber-900">Validation boundary</h3>
                  <ul className="mt-2 space-y-1 text-sm text-amber-950">
                    {snapshot.claimBoundary.requiresValidation.slice(0, 4).map((item) => (
                      <li key={item}>- {item}</li>
                    ))}
                  </ul>
                </section>
              </div>
            </Card>

            <Card className="rounded-lg bg-white p-4">
              <h2 className="text-sm font-bold text-text-main">Next actions</h2>
              <div className="mt-3 grid gap-2">
                <Link to={workspacePath} className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-xs font-bold text-white hover:bg-primary/90">
                  Open Workspace
                </Link>
                <Link to={`/demo/agent${suffix}`} className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-white px-3 text-xs font-bold text-text-main hover:bg-slate-50">
                  Send to Agent
                </Link>
                <Link to={`/report${suffix}${suffix ? '&' : '?'}template=xrd-summary`} className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-white px-3 text-xs font-bold text-text-main hover:bg-slate-50">
                  Create Report
                </Link>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

export default function NotebookLab() {
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const requestedProjectId = searchParams.get('project');
  const routeContext = getEvidenceRouteContext({
    authUser: user,
    searchParams,
    storedMode: getStoredWorkspaceMode(),
  });
  const effectiveWorkspaceMode = routeContext.effectiveWorkspaceMode;

  if (routeContext.isUploadedContext) {
    return <UploadedNotebookContext routeContext={routeContext} />;
  }

  // Show empty state only if user mode with no uploaded evidence and no explicit demo project
  if (effectiveWorkspaceMode === 'user' && requestedProjectId && isKnownProjectId(requestedProjectId)) {
    return <NotebookDemoProjectPrompt projectId={requestedProjectId} />;
  }

  if (effectiveWorkspaceMode === 'user' && !routeContext.isUploadedContext) {
    return <NotebookEmptyState email={user?.email} />;
  }

  return <NotebookLabContent routeContext={routeContext} />;
}

function NotebookLabContent({ routeContext }: { routeContext: EvidenceRouteContext }) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isUploadedContext = routeContext.isUploadedContext;
  const project = isUploadedContext
    ? null
    : (getProject(searchParams.get('project')) ?? getProject(null))!;

  // Get evidence snapshot first for uploaded context
  const initialEvidenceSnapshot = useMemo(() => getProjectEvidenceSnapshot(isUploadedContext ? null : project?.id, {
    source: routeContext.source,
    analysisSessionId: routeContext.sessionId,
    uploadedRunId: routeContext.uploadedRunId,
    driveFileId: routeContext.driveFileId,
    deferStoredContext: !isUploadedContext,
  }), [isUploadedContext, project?.id, routeContext]);
  const [evidenceSnapshot, setEvidenceSnapshot] = useState(initialEvidenceSnapshot);

  useEffect(() => {
    setEvidenceSnapshot(initialEvidenceSnapshot);
    if (isUploadedContext) return;

    return runWhenIdle(() => {
      setEvidenceSnapshot(getProjectEvidenceSnapshot(project?.id, {
        source: routeContext.source,
        analysisSessionId: routeContext.sessionId,
        uploadedRunId: routeContext.uploadedRunId,
        driveFileId: routeContext.driveFileId,
      }));
    });
  }, [initialEvidenceSnapshot, isUploadedContext, project?.id, routeContext]);

  // For uploaded context, create safe registry project from evidence snapshot
  const registryProject = isUploadedContext
    ? createUploadedEvidenceRegistryProject(evidenceSnapshot)
    : getRegistryProject(project!.id);

  // Use registryProject._raw as the source of truth for project data
  const currentProject = registryProject._raw;

  const runId = searchParams.get('run');
  const entryId = searchParams.get('entry');
  const experimentId = searchParams.get('experiment');
  const agentRun = runId ? getRun(runId) : null;
  const [templateMode, setTemplateMode] = useState<NotebookTemplateMode>(
    () => normalizeNotebookTemplateMode(searchParams.get('template')),
  );
  const [feedback, setFeedback] = useState('');
  const [approvalAction, setApprovalAction] = useState<ApprovalActionPreview | null>(null);

  // Phase X6C: Runtime context orchestration for validation state
  const {
    isValidated7E4: runtimeIsValidated,
    currentEvidence: runtimeEvidence,
  } = useXrdWorkflowRuntime();

  // Bundle gating: only create bundle when appropriate (not for uploaded evidence)
  const evidenceBundle = useMemo(() => {
    if (isUploadedContext) {
      return null;
    }

    const availableTechniques = evidenceSnapshot.availableTechniques ?? [];
    const techniqueCount = availableTechniques.length;
    const context: import('../runtime/evidenceBundle').BundleCreationContext = {
      route: '/notebook',
      techniqueCount,
      hasMultiTechIntent: techniqueCount >= 2 || searchParams.get('bundle') === 'mixed',
      isDemoProject: evidenceSnapshot.sourceMode === 'demo_preloaded',
      hasDemoPreloadedBundle: currentProject.id === 'cu-fe2o4-spinel' && techniqueCount >= 2,
      userAction: 'send_to_notebook',
    };

    // Only create bundle if gating logic approves
    const shouldCreate = techniqueCount >= 2 || context.hasDemoPreloadedBundle;
    if (!shouldCreate) {
      return null;
    }

    return createEvidenceBundleFromSnapshot(evidenceSnapshot, {
      includeDemoContext: searchParams.get('bundle') === 'mixed' || searchParams.get('source') === 'mixed',
      lifecycleState: 'sent_to_notebook',
      creationReason: 'notebook_report_handoff',
    });
  }, [evidenceSnapshot, searchParams, currentProject.id]);

  const bundleTechniqueCoverage = useMemo(
    () => evidenceBundle ? getTechniqueCoverageFromBundle(evidenceBundle) : [],
    [evidenceBundle],
  );
  const [experimentModalOpen, setExperimentModalOpen] = useState(false);
  const [isProjectRailCollapsed, setIsProjectRailCollapsed] = useState(false);
  const [expandedProjectIds, setExpandedProjectIds] = useState<string[]>(() => [searchParams.get('project') ?? 'cu-fe2o4-spinel']);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(() => searchParams.get('project') ?? currentProject.id);
  const [selectedExperimentId, setSelectedExperimentId] = useState<string | null>(() => searchParams.get('experiment'));
  const [activeNotebookTab, setActiveNotebookTab] = useState<ActiveNotebookTab>('Objective / Context');
  const [selectedEvidenceTechnique, setSelectedEvidenceTechnique] = useState<Technique>(() => evidenceSnapshot.primaryTechnique);
  const [isEvidenceDrawerOpen, setIsEvidenceDrawerOpen] = useState(false);
  const [localExperiments, setLocalExperiments] = useState<ReturnType<typeof getLocalExperiments>>([]);
  const [wizardNotebooks, setWizardNotebooks] = useState<ProjectNotebook[]>([]);

  useEffect(() => {
    return runWhenIdle(() => {
      setLocalExperiments(getLocalExperiments());
      setWizardNotebooks(getLocalProjectNotebooks());
    });
  }, []);

  const activeWizardNotebook = useMemo(() => {
    const projectParam = searchParams.get('project');
    if (!projectParam) return null;
    // Demo project IDs always use the demo notebook branch - never treat them as wizard notebooks
    if (demoProjects.some((p) => p.id === projectParam)) return null;
    return wizardNotebooks.find((nb) => nb.id === projectParam) ?? null;
  }, [searchParams, wizardNotebooks]);
  const [observations, setObservations] = useState<string[]>([]);
  const [attachedRun, setAttachedRun] = useState<string | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [contextDetailsOpen, setContextDetailsOpen] = useState(false);
  const [auditTrailOpen, setAuditTrailOpen] = useState(false);
  const [observationOpen, setObservationOpen] = useState(false);
  const [observationDraft, setObservationDraft] = useState('');
  const [attachRunOpen, setAttachRunOpen] = useState(false);

  // Read workspace parameters for the current project
  const workspaceParameters = useMemo(
    () => readProjectWorkspaceParameters(currentProject.id, getProjectTechniques(currentProject)),
    [currentProject.id],
  );

  useEffect(() => {
    const availableTechniques = evidenceSnapshot.availableTechniques ?? [];
    const selectableTechniques = availableTechniques.length
      ? availableTechniques
      : [evidenceSnapshot.primaryTechnique];
    if (!selectableTechniques.includes(selectedEvidenceTechnique)) {
      setSelectedEvidenceTechnique(selectableTechniques[0] ?? evidenceSnapshot.primaryTechnique);
    }
  }, [currentProject.id, evidenceSnapshot.availableTechniques, evidenceSnapshot.primaryTechnique, selectedEvidenceTechnique]);
  const runResult = useMemo(() => loadAgentRunResult(currentProject.id), [currentProject.id]);
  const workspaceRun = useMemo(() => getProcessingRun(runId), [runId]);
  const workspaceDataset = useMemo(
    () => (workspaceRun ? getDataset(workspaceRun.datasetId) : null),
    [workspaceRun],
  );
  const availableRuns = useMemo(
    () => getProcessingRuns().filter((run) => run.projectId === currentProject.id),
    [currentProject.id, feedback],
  );
  const selectedExperiment = useMemo(() => {
    const projectExperiments = localExperiments.filter((experiment) => experiment.projectId === currentProject.id);
    return (
      projectExperiments.find((experiment) => experiment.id === experimentId) ??
      [...projectExperiments].reverse().find((experiment) => experiment.conditionLock) ??
      null
    );
  }, [experimentId, localExperiments, currentProject.id]);
  const experimentConditionLock = selectedExperiment?.conditionLock ?? getExperimentConditionLock(currentProject.id, experimentId);
  const experimentConditionLines = getConditionLockSectionLines(experimentConditionLock);
  const experimentConditionBoundaryNotes = getConditionBoundaryNotes(experimentConditionLock, currentProject.techniques);
  const experimentConditionStatus = getConditionLockStatusLabel(experimentConditionLock);
  const attachedRunRecord = useMemo(() => getProcessingRun(attachedRun), [attachedRun]);
  const selectableExportTechniques = evidenceSnapshot.availableTechniques.length
    ? evidenceSnapshot.availableTechniques
    : [evidenceSnapshot.primaryTechnique];
  const selectedTechniqueForExport = selectableExportTechniques.includes(selectedEvidenceTechnique)
    ? selectedEvidenceTechnique
    : selectableExportTechniques[0] ?? evidenceSnapshot.primaryTechnique;
  const selectedEvidenceDataset = useMemo(
    () =>
      getProjectDatasets(currentProject.id).find((dataset) => dataset.technique === selectedTechniqueForExport) ??
      (evidenceSnapshot.activeDataset?.technique === selectedTechniqueForExport ? evidenceSnapshot.activeDataset : null),
    [currentProject.id, selectedTechniqueForExport, evidenceSnapshot.activeDataset],
  );
  const hasUploadedEvidenceSnapshot = evidenceSnapshot.sourceMode === 'user_uploaded';
  const hasMatchedNotebookData = hasUploadedEvidenceSnapshot
    ? evidenceSnapshot.evidenceEntries.length > 0
    : hasMatchedXrdDemoData(currentProject.id);
  const projectNotebookContent = getProjectNotebookContent(currentProject.id);
  const notebookTemplate = NOTEBOOK_TEMPLATES[templateMode];
  const workflowProcessingResult = useMemo(
    () => evidenceSnapshot.reportContext ?? getLatestProcessingResult(currentProject.id) ?? createProcessingResultFromXrdDemo(currentProject.id, workspaceParameters),
    [currentProject.id, feedback, evidenceSnapshot.reportContext, workspaceParameters],
  );
  const workflowRefinement = useMemo(
    () =>
      getLatestAgentDiscussionRefinement(currentProject.id, templateMode) ??
      refineDiscussionFromProcessing(workflowProcessingResult, templateMode),
    [currentProject.id, templateMode, workflowProcessingResult, feedback],
  );
  const workflowNotebookEntry = useMemo(() => {
    const entryFromRoute = getNotebookEntry(entryId);
    if (entryFromRoute?.templateMode === templateMode) return entryFromRoute;
    return (
      (evidenceSnapshot.notebookContext?.templateMode === templateMode ? evidenceSnapshot.notebookContext : null) ??
      getLatestNotebookEntry(currentProject.id, templateMode) ??
      createNotebookEntryFromRefinement(workflowRefinement, templateMode)
    );
  }, [entryId, currentProject.id, templateMode, workflowRefinement, feedback, evidenceSnapshot.notebookContext]);
  const workflowReportSection = useMemo(
    () => createReportSectionFromNotebookEntry(workflowNotebookEntry),
    [workflowNotebookEntry],
  );
  const notebookTemplateDetails = NOTEBOOK_TEMPLATE_DETAILS[templateMode];
  const displayNotebookStatus = hasMatchedNotebookData
    ? (evidenceBundle?.missingRequiredTechniques ?? []).length > 0 || (evidenceBundle?.validationGaps ?? []).length > 0
      ? 'Validation-limited'
      : getSnapshotStatusLabel(evidenceSnapshot, claimStatusLabel(registryProject.claimStatus))
    : 'Requires dataset';
  const runtimeContext = {
    sourceMode: evidenceSnapshot.sourceMode ?? 'demo_preloaded',
    runtimeMode: evidenceSnapshot.runtimeMode ?? 'demo',
    permissionMode: evidenceSnapshot.permissionMode ?? 'read_only',
    sourceLabel: evidenceSnapshot.sourceLabel ?? 'Demo evidence',
    approvalStatus: evidenceSnapshot.approvalStatus ?? 'not_required',
  } as const;
  const connectedAccountState = runtimeContext.sourceMode === 'google_drive_connected'
    ? getGoogleConnectedShellState()
    : getDefaultConnectedAccountState();
  const canExportNotebook = hasMatchedNotebookData && registryProject.reportReadiness >= 80;
  const primaryNotebookSection = workflowNotebookEntry.sections[0];
  const supportingNotebookSections = workflowNotebookEntry.sections.slice(1);
  const notebook = useMemo(() => {
    // If we have an agent run, use that data
    if (agentRun) {
      return {
        title: `Characterization Run: ${currentProject.name}`,
        summary: agentRun.outputs.interpretation,
        decision: agentRun.outputs.phase,
        claimStatus: currentProject.claimStatus,
        validationState: currentProject.validationState,
        evidence: agentRun.outputs.evidence,
        warnings: agentRun.outputs.caveats,
        recommendations: agentRun.outputs.recommendations,
        processingPipeline: [
          `Mission: ${agentRun.mission}`,
          `Selected datasets: ${agentRun.outputs.selectedDatasets.join(', ')}`,
          `Detected ${agentRun.outputs.detectedPeaks?.length ?? 0} peaks`,
          'Prepared evidence-linked interpretation with traceable decision context',
        ],
        peakDetection: `${agentRun.outputs.detectedPeaks?.length ?? 0} peaks detected in evidence review`,
        phaseInterpretation: `${agentRun.outputs.phase} - ${agentRun.outputs.confidenceLabel}`,
      };
    }

    const base = generateNotebookSections(currentProject, runResult);
    if (!workspaceRun) return base;

    const claimStatus = workspaceRun.matchResult?.claimStatus ?? currentProject.claimStatus;

    return {
      ...base,
      summary: `${workspaceRun.technique} workspace run generated from ${workspaceDataset?.fileName ?? 'selected dataset'} with ${workspaceRun.detectedFeatures.length} detected features and traceable processing parameters.`,
      decision: workspaceRun.matchResult?.phase ?? `${workspaceRun.technique} evidence saved for ${currentProject.name}`,
      claimStatus,
      validationState: currentProject.validationState,
      evidence: workspaceRun.evidence.map((item) => item.claim),
      warnings: workspaceRun.matchResult?.missingPeaks.length
        ? [`Missing or weak references: ${workspaceRun.matchResult.missingPeaks.join(', ')}.`]
        : [],
      recommendations: currentProject.recommendations,
      processingPipeline: [
        `Dataset: ${workspaceDataset?.fileName ?? workspaceRun.datasetId}.`,
        `Technique: ${workspaceRun.technique}.`,
        ...Object.entries(workspaceRun.parameters).map(([key, value]) => `${key}: ${String(value)}`),
        `Detected features: ${workspaceRun.detectedFeatures.length}.`,
        'Saved evidence and generated notebook section.',
      ],
      peakDetection: `${workspaceRun.detectedFeatures.length} ${workspaceRun.technique === 'XRD' ? 'peaks' : 'features'} detected in the workspace run.`,
      phaseInterpretation: workspaceRun.matchResult
        ? `${workspaceRun.matchResult.phase}. ${workspaceRun.matchResult.caveat}`
        : base.phaseInterpretation,
    };
  }, [project, runResult, workspaceDataset, workspaceRun]);
  const keyEvidenceItems = hasMatchedNotebookData
    ? evidenceSnapshot.evidenceEntries.map((entry) =>
        `${entry.technique}: ${entry.support}${entry.limitations ? ` (${entry.limitations})` : ''}`,
      ).slice(0, 5)
    : [
        'No matched processing result is linked to this notebook entry.',
        'Evidence has not been generated for this project in the deterministic XRD demo workflow.',
        'Load a compatible dataset before saving notebook interpretation.',
      ];
  const technicalTrace = hasMatchedNotebookData
    ? registryProject.agentWorkflow.trace.map((event) => event.label)
    : ['No matched processing result', 'Requires compatible dataset', 'Evidence not generated'];

  const toggleProjectExpansion = (projectId: string) => {
    setExpandedProjectIds((current) =>
      current.includes(projectId) ? current.filter((id) => id !== projectId) : [...current, projectId],
    );
  };

  const openProjectNotebook = (projectId: string) => {
    setSelectedProjectId(projectId);
    setSelectedExperimentId(null);
    navigate(`/notebook?project=${projectId}&mode=demo`);
  };

  const openExperimentNotebook = (nextExperimentId: string, nextProjectId: string) => {
    setSelectedProjectId(nextProjectId);
    setSelectedExperimentId(nextExperimentId);
    setExpandedProjectIds((current) => current.includes(nextProjectId) ? current : [...current, nextProjectId]);
    navigate(`/notebook?project=${nextProjectId}&mode=demo&experiment=${nextExperimentId}`);
  };

  const confidenceLabel = claimStatusLabel(registryProject.claimStatus);
  const uploadedRouteSearch = isUploadedContext ? buildEvidenceRouteSearch(routeContext) : '';
  const withDemoMode = (path: string) => path.includes('?') ? `${path}&mode=demo` : `${path}?mode=demo`;
  const snapshotDiscussionLine = hasUploadedEvidenceSnapshot
    ? `${getSnapshotEvidenceLine(evidenceSnapshot)} ${getSnapshotClaimBoundaryLines(evidenceSnapshot)[0] ?? 'Uploaded evidence remains validation-limited.'}`
    : projectNotebookContent.discussion;

  const evidenceTraceItems = [
    ...evidenceSnapshot.availableTechniques.map((technique) => {
      const item = currentProject.techniqueMetadata.find((metadata) => metadata.key === technique);
      const entry = evidenceSnapshot.evidenceEntries.find((candidate) => candidate.technique === technique);
      return {
        technique,
        role: item?.role ?? (technique === 'XRD' ? 'Bulk phase' : technique === 'XPS' ? 'Surface state' : technique === 'FTIR' ? 'Bonding context' : 'Lattice mode'),
        status: 'available',
        confidence: entry?.support ?? displayNotebookStatus,
      };
    }),
    ...evidenceSnapshot.pendingTechniques.map((technique) => ({
      technique,
      role: technique === 'XRD' ? 'Bulk phase validation' : technique === 'XPS' ? 'Surface-state validation' : technique === 'FTIR' ? 'Bonding-context validation' : 'Vibrational validation',
      status: 'pending validation',
      confidence: 'Pending validation evidence',
    })),
  ];

  const showFeedback = (message: string) => {
    setFeedback(message);
    window.setTimeout(() => setFeedback(''), 1800);
  };

  const openApprovalPreview = (
    actionType: ApprovalActionType,
    actionLabel: string,
    destinationLabel: string,
    riskLevel?: ApprovalRiskLevel,
  ) => {
    const action = createApprovalActionPreview({
      actionId: `notebook-${actionType}-${Date.now()}`,
      actionType,
      actionLabel,
      destinationLabel,
      evidenceSnapshot,
      runtimeContext,
      evidenceBundle: evidenceBundle ?? undefined,
      riskLevel,
    });
    appendApprovalLedgerEntry(createApprovalLedgerEntry(action, 'preview_opened'));
    setApprovalAction(action);
  };

  const logLocalNotebookAction = (
    actionType: ApprovalActionType,
    actionLabel: string,
    destinationLabel: string,
    riskLevel?: ApprovalRiskLevel,
  ) => {
    const action = createApprovalActionPreview({
      actionId: `notebook-${actionType}-${Date.now()}`,
      actionType,
      actionLabel,
      destinationLabel,
      evidenceSnapshot,
      runtimeContext,
      evidenceBundle: evidenceBundle ?? undefined,
      riskLevel,
    });
    appendApprovalLedgerEntry(createApprovalLedgerEntry(action, 'local_preview_continued', {
      notes: 'Notebook local/demo action completed in this browser. No external write executed.',
    }));
  };

  const exportFeedbackMessage = (format: DemoExportFormat) => {
    if (format === 'md') {
      return 'Markdown notebook memory downloaded.';
    }
    if (format === 'png') {
      return 'Notebook snapshot downloaded.';
    }
    return 'Use Report for formal document exports.';
  };

  const copyShareLink = async () => {
    const url = isUploadedContext && uploadedRouteSearch
      ? `${window.location.origin}/notebook?${uploadedRouteSearch}&template=${templateMode}`
      : `${window.location.origin}/notebook?project=${currentProject.id}&mode=demo&template=${templateMode}&entry=${workflowNotebookEntry.id}${workspaceRun ? `&run=${workspaceRun.id}` : ''}`;
    try {
      await navigator.clipboard.writeText(url);
      showFeedback('Share link copied');
    } catch {
      showFeedback(`Share link ready: ${url}`);
    }
  };

  const exportMarkdown = () => {
    const lockedContext = getLockedContext(currentProject.id);
    const evidenceMarkdown = keyEvidenceItems.map((item) => `- ${item}`).join('\n');
    const validationMarkdown = [
      ...(evidenceSnapshot.validationGaps ?? []).map((gap) => `${gap.description} Resolution: ${gap.suggestedResolution}`),
      ...(evidenceSnapshot.pendingTechniques ?? []).map((technique) => `${technique} validation evidence is pending.`),
    ].map((item) => `- ${item}`).join('\n');
    const traceMarkdown = technicalTrace.map((step, index) => `${index + 1}. ${sanitizeTraceStep(step)}`).join('\n');
    const sourceRunLines = projectNotebookContent.runLog.map(([label, value]) => `${label}: ${value}`).join('\n');
    const ledgerSummary = summarizeApprovalLedger({
      projectId: currentProject.id,
      bundleId: evidenceBundle?.bundleId ?? `single-${currentProject.id}`,
      limit: 4
    });
    const approvalLedgerMarkdown = ledgerSummary.recentLines.length
      ? ledgerSummary.recentLines.map((line) => `- ${line}`).join('\n')
      : '- No approval preview history recorded for this project/bundle in this browser.';
    const claimBoundaryMarkdown = (
      getSnapshotClaimBoundaryLines(evidenceSnapshot).length
        ? getSnapshotClaimBoundaryLines(evidenceSnapshot)
        : workflowNotebookEntry.sections.find((section) => section.heading === 'Claim Boundary')?.lines ?? [
        'Requires validation: matched processing result is required before claim-boundary review.',
      ]
    ).map((line) => `- ${line}`).join('\n');
    const experimentConditionMarkdown = [
      ...experimentConditionLines,
      ...experimentConditionBoundaryNotes.map((note) => `Claim boundary: ${note}`),
    ].map((line) => `- ${line}`).join('\n');
    const lockedContextMarkdown = lockedContext
      ? `## Locked Scientific Context

Sample Identity: ${lockedContext.sampleIdentity}
Technique: ${lockedContext.technique}
Source Dataset: ${lockedContext.sourceDataset}
Source Processing Path: ${lockedContext.sourceProcessingPath}
Reference Scope: ${lockedContext.referenceScope}
Claim Boundary: ${lockedContext.claimBoundary}

`
      : '';

    const bundleMarkdown = evidenceBundle
      ? `## Evidence Bundle
Bundle ID: ${evidenceBundle.bundleId}
Source: ${getEvidenceBundleBadgeLabel(evidenceBundle)}
Files: ${(evidenceBundle.files ?? []).map((file) => `${file.technique}: ${file.fileName} (${file.sourceLabel})`).join('; ') || 'No evidence files linked'}
Technique Coverage: ${bundleTechniqueCoverage.map((item) => `${item.technique}: ${item.status}`).join(', ')}
Completeness: ${evidenceBundle.evidenceCompletenessScore}%

`
      : '';

    const availableTechniques = (registryProject?.techniques.filter(t => t.available).map(t => t.id as TechniqueWorkspaceId) ?? []);
    const parameterProvenanceMarkdown = generateParameterProvenanceMarkdown(currentProject.id, availableTechniques);

    const markdown = `# DIFARYX Notebook Memory

## Experiment
${evidenceSnapshot.projectName}

${lockedContextMarkdown}## Source Workflow
Evidence processing + interpretation refinement

## Pipeline
Processing Result -> Interpretation Refinement -> Notebook Memory -> Report Handoff

## Mode
${notebookTemplate.label}

## Status
${displayNotebookStatus}

## Summary
${getSnapshotEvidenceLine(evidenceSnapshot)}

## Refined Discussion
${snapshotDiscussionLine}

## Key Evidence
${evidenceMarkdown}

${bundleMarkdown}## Claim Boundary
${claimBoundaryMarkdown}

## Experiment Conditions
${experimentConditionMarkdown}

## Validation Notes
${validationMarkdown}

## Technical Trace
${traceMarkdown}

${parameterProvenanceMarkdown}
## Provenance
${sourceRunLines}

## Local Approval Preview Ledger
${approvalLedgerMarkdown}
`;
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `DIFARYX_${currentProject.id}_Notebook_Memory.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showFeedback('Markdown notebook memory downloaded.');
  };

  const exportNotebook = (format: DemoExportFormat) => {
    if (!hasMatchedNotebookData) {
      setExportMenuOpen(false);
      showFeedback('Requires matched processing result before export.');
      return;
    }

    if (requiresApproval(runtimeContext)) {
      setExportMenuOpen(false);
      openApprovalPreview(
        'notebook_commit',
        `${format.toUpperCase()} notebook export`,
        'Notebook memory local export preview',
        'low',
      );
      return;
    }

    if (format === 'md') {
      exportMarkdown();
      logLocalNotebookAction('notebook_commit', 'Markdown notebook export', 'Notebook memory local export preview', 'low');
      setExportMenuOpen(false);
      return;
    }
    if (format === 'png') {
      exportDemoArtifact('png', {
        filenameBase: `DIFARYX_${currentProject.id}_Notebook_Memory`,
        title: 'DIFARYX Notebook Memory',
        sections: [
          { heading: 'Experiment', lines: [projectNotebookContent.experimentTitle] },
          { heading: 'Summary', lines: [getSnapshotEvidenceLine(evidenceSnapshot)] },
          { heading: 'Interpretation', lines: [snapshotDiscussionLine] },
          { heading: 'Key Evidence', lines: keyEvidenceItems },
          { heading: 'Experiment Conditions', lines: experimentConditionLines },
          { heading: 'Status', lines: [displayNotebookStatus] },
          { heading: 'Provenance', lines: projectNotebookContent.runLog.map(([label, value]) => `${label}: ${value}`) },
        ],
      });
      setExportMenuOpen(false);
      logLocalNotebookAction('notebook_commit', 'PNG notebook export', 'Notebook snapshot local export preview', 'low');
      showFeedback('Notebook snapshot downloaded.');
      return;
    }
    setExportMenuOpen(false);
    showFeedback(exportFeedbackMessage(format));
  };

  const exportNotebookCsv = (kind: 'raw' | 'features' | 'summary') => {
    if (requiresApproval(runtimeContext)) {
      openApprovalPreview(
        'report_export',
        `${kind} CSV export`,
        'Notebook evidence CSV local export preview',
        'medium',
      );
      return;
    }

    const exportedAt = new Date().toISOString();
    const projectSlug = toCsvSlug(currentProject.id);

    if (kind === 'summary') {
      const rows = buildNotebookSummaryRows(currentProject, registryProject, workflowNotebookEntry.id, exportedAt);
      downloadNotebookCsv(`difaryx_${projectSlug}_notebook-evidence-summary.csv`, rows);
      logLocalNotebookAction('report_export', 'Evidence summary CSV export', 'Notebook evidence CSV local export preview', 'medium');
      showFeedback('Notebook evidence summary CSV exported.');
      return;
    }

    if (!selectedEvidenceDataset) {
      showFeedback('No dataset is linked for the selected technique.');
      return;
    }

    if (kind === 'raw') {
      const rawRows = buildRawSignalRows(currentProject, registryProject, selectedEvidenceDataset, workflowNotebookEntry.id, exportedAt);
      if (rawRows.length > 0) {
        downloadNotebookCsv(
          `difaryx_${projectSlug}_${selectedEvidenceDataset.technique.toLowerCase()}_raw-data.csv`,
          rawRows,
        );
        logLocalNotebookAction('report_export', 'Raw signal CSV export', 'Notebook evidence CSV local export preview', 'medium');
        showFeedback('Raw signal CSV exported.');
        return;
      }
      const featureRows = buildFeatureRows(currentProject, registryProject, selectedEvidenceDataset, workflowNotebookEntry.id, exportedAt);
      downloadNotebookCsv(
        `difaryx_${projectSlug}_${selectedEvidenceDataset.technique.toLowerCase()}_features.csv`,
        featureRows,
      );
      logLocalNotebookAction('report_export', 'Feature CSV export', 'Notebook evidence CSV local export preview', 'medium');
      showFeedback('Raw signal unavailable; feature CSV exported.');
      return;
    }

    const featureRows = buildFeatureRows(currentProject, registryProject, selectedEvidenceDataset, workflowNotebookEntry.id, exportedAt);
    downloadNotebookCsv(
      `difaryx_${projectSlug}_${selectedEvidenceDataset.technique.toLowerCase()}_features.csv`,
      featureRows,
    );
    logLocalNotebookAction('report_export', 'Feature CSV export', 'Notebook evidence CSV local export preview', 'medium');
    showFeedback('Extracted features CSV exported.');
  };

  const printReport = () => {
    window.print();
    showFeedback('Print dialog opened');
  };

  const addObservation = () => {
    const text = observationDraft.trim() || `${currentProject.name} evidence reviewed in notebook.`;
    const nextObservation = `Added observation ${observations.length + 1}: ${text}`;
    setObservations((current) => [nextObservation, ...current]);
    setObservationDraft('');
    setObservationOpen(false);
    showFeedback('Added observation saved');
  };

  const attachRunToNotebook = (run: ProcessingRun) => {
    setAttachedRun(run.id);
    setAttachRunOpen(false);
    showFeedback(`${run.technique} data attached`);
  };

  const saveWorkflowNotebookEntry = () => {
    if (!hasMatchedNotebookData) {
      showFeedback('Requires matched processing result before saving.');
      return;
    }

    if (requiresApproval(runtimeContext)) {
      openApprovalPreview(
        'notebook_commit',
        'Notebook commit',
        'Notebook scientific memory preview',
        'low',
      );
      return;
    }

    saveProcessingResult(workflowProcessingResult);
    const refinement = refineDiscussionFromProcessing(workflowProcessingResult, templateMode);
    saveAgentDiscussionRefinement(refinement);
    const entry = createNotebookEntryFromRefinement(refinement, templateMode);
    saveNotebookEntry(entry);
    logLocalNotebookAction('notebook_commit', 'Notebook commit', 'Notebook scientific memory preview', 'low');
    showFeedback(`${NOTEBOOK_TEMPLATES[templateMode].label} entry saved`);
  };

  const handleReportHandoffClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!requiresApproval(runtimeContext)) {
      logLocalNotebookAction(
        'report_generation',
        'Report handoff',
        'Evidence-to-report builder local preview',
        'medium',
      );
      return;
    }
    event.preventDefault();
    openApprovalPreview(
      'report_generation',
      'Report handoff',
      'Evidence-to-report builder local preview',
      'medium',
    );
  };

  const copyAgentSummary = async () => {
    const summary = hasMatchedNotebookData
      ? snapshotDiscussionLine
      : 'No matched processing result is linked to this project. Notebook interpretation remains pending.';
    try {
      await navigator.clipboard.writeText(summary);
      showFeedback('Summary copied');
    } catch {
      showFeedback('Summary ready to copy');
    }
  };

  return (
    <DashboardLayout>
      <div className="flex-1 h-full flex overflow-hidden bg-background">
        <div className={`${isProjectRailCollapsed ? 'w-16' : 'w-72'} border-r border-border bg-surface flex flex-col shrink-0 transition-all duration-200`}>
          <div className="p-3 border-b border-border flex justify-between items-center gap-2">
            {!isProjectRailCollapsed && <h2 className="text-xs font-bold uppercase tracking-wider text-text-muted">Projects</h2>}
            <div className="flex items-center gap-1">
              {!isProjectRailCollapsed && <Button variant="ghost" size="sm" className="px-2 h-7" onClick={() => setExperimentModalOpen(true)}><Plus size={14} /></Button>}
              <Button variant="ghost" size="sm" className="px-2 h-7" onClick={() => setIsProjectRailCollapsed((collapsed) => !collapsed)}>
                {isProjectRailCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
              </Button>
            </div>
          </div>
          <div className="p-2 space-y-1 flex-1 overflow-y-auto">
            {demoProjects.map((item) => {
              const itemHasMatchedData = hasMatchedXrdDemoData(item.id);
              const isExpanded = expandedProjectIds.includes(item.id);
              const isActiveProject = !activeWizardNotebook && item.id === currentProject.id;
              const projectExperiments = localExperiments.filter((experiment) => experiment.projectId === item.id);

              return (
                <div key={item.id}>
                  <div className={`flex items-center gap-1 rounded-md border ${isActiveProject ? 'bg-primary/10 text-primary border-primary/20' : 'text-text-muted hover:bg-surface-hover hover:text-text-main border-transparent'}`}>
                    <button type="button" onClick={() => openProjectNotebook(item.id)} className={`${isProjectRailCollapsed ? 'w-full justify-center px-2' : 'flex-1 px-2'} flex items-center gap-2 py-2 text-left text-xs font-medium leading-snug`}>
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-background text-[10px] font-bold">{item.name.slice(0, 2).toUpperCase()}</span>
                      {!isProjectRailCollapsed && (
                        <span className="min-w-0">
                          <span className="block truncate">{item.name}</span>
                          <span className={`mt-0.5 block text-[10px] font-semibold ${itemHasMatchedData ? 'text-primary' : 'text-amber-600'}`}>
                            {itemHasMatchedData ? item.reportReadiness.label : 'Requires dataset'}
                          </span>
                        </span>
                      )}
                    </button>
                    {!isProjectRailCollapsed && (
                      <button type="button" onClick={() => toggleProjectExpansion(item.id)} className="mr-1 rounded p-1 hover:bg-background" aria-label={`Toggle ${item.name} experiments`}>
                        <ChevronDown size={13} className={`transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
                      </button>
                    )}
                  </div>
                  {!isProjectRailCollapsed && isExpanded && (
                    <div className="ml-9 mt-1 space-y-1 border-l border-border pl-2">
                      <button type="button" onClick={() => openProjectNotebook(item.id)} className={`block w-full rounded px-2 py-1.5 text-left text-[11px] ${isActiveProject && !experimentId ? 'text-primary' : 'text-text-muted hover:text-text-main hover:bg-surface-hover'}`}>
                        {item.notebook.title}
                      </button>
                      {projectExperiments.map((experiment) => (
                        <button key={experiment.id} type="button" onClick={() => openExperimentNotebook(experiment.id, experiment.projectId)} className={`block w-full rounded px-2 py-1.5 text-left text-[11px] ${experiment.id === selectedExperimentId ? 'text-primary bg-primary/5' : 'text-text-muted hover:text-text-main hover:bg-surface-hover'}`}>
                          <span className="block truncate">{experiment.title}</span>
                          <span className="block truncate text-[10px] text-text-dim">{experiment.technique} - {experiment.fileName}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {wizardNotebooks.map((nb) => {
              const isActive = nb.id === activeWizardNotebook?.id;
              const statusLabel = nb.workflowStatus === 'evidence_ready' ? 'Evidence ready' : 'Setup ready';
              const statusColor = nb.workflowStatus === 'evidence_ready' ? 'text-primary' : 'text-amber-600';
              const modeLabel = nb.mode === 'research' ? 'Research' : nb.mode === 'rd' ? 'R&D' : 'Analytical Job';
              return (
                <Link
                  key={nb.id}
                  to={`/notebook?project=${nb.id}&mode=demo`}
                  className={`block w-full text-left px-3 py-2 rounded-md text-xs font-medium leading-snug transition-colors border ${
                    isActive
                      ? 'bg-primary/5 text-primary border-primary/20'
                      : 'text-text-muted hover:bg-surface-hover hover:text-text-main border-transparent'
                  }`}
                >
                  {isProjectRailCollapsed ? <span className="block text-center">{nb.title.slice(0, 2).toUpperCase()}</span> : (
                    <>
                      <span className="block truncate">{nb.title}</span>
                      <span className="mt-1 block text-[10px] text-text-dim">{modeLabel}</span>
                      <span className={`mt-0.5 block text-[10px] font-semibold ${statusColor}`}>
                        {statusLabel}
                      </span>
                    </>
                  )}
                </Link>
              );
            })}
          </div>
        </div>

        <div className="flex-1 min-w-0 flex flex-col overflow-y-auto relative">
          {activeWizardNotebook ? (
            <div className="flex-1 p-6 max-w-4xl mx-auto w-full">
              {/* Header */}
              <div className="mb-6">
                <div className="flex items-center gap-2 text-[11px] text-text-muted mb-2">
                  <span>{getNotebookTypeBadge(activeWizardNotebook.mode)}</span>
                  <span>{activeWizardNotebook.workflowStatus ?? 'setup_ready'}</span>
                  <span>{activeWizardNotebook.createdDate || 'Draft'}</span>
                  <span className={activeWizardNotebook.workflowStatus === 'evidence_ready' ? 'text-primary font-semibold' : 'text-amber-600 font-semibold'}>
                    {activeWizardNotebook.workflowStatus === 'evidence_ready' ? 'Evidence ready' : 'Setup ready'}
                  </span>
                </div>
                <h1 className="text-base font-bold text-text-main">{activeWizardNotebook.title}</h1>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {[
                    ['Type', getNotebookTypeBadge(activeWizardNotebook.mode)],
                    ['Status', activeWizardNotebook.workflowStatus === 'evidence_ready' ? 'Evidence ready' : 'Setup ready'],
                  ].map(([label, value]) => (
                    <span key={label} className="rounded-md border border-border bg-background px-2.5 py-1 text-[11px] font-semibold text-text-muted">
                      <span className="text-text-dim">{label}: </span>
                      <span className="text-text-main">{value}</span>
                    </span>
                  ))}
                </div>
              </div>

              {/* Workflow pipeline */}
              <div className="mb-4 rounded-lg border border-border bg-surface p-4">
                <h2 className="text-xs font-bold uppercase tracking-wider text-text-dim mb-2">Workflow</h2>
                <p className="text-[11px] text-text-muted leading-relaxed">
                  {activeWizardNotebook.mode === 'research'
                    ? 'Research Objective -> Experimental Context -> Evidence Workspace -> Agent Reasoning -> Validation Gap -> Next Experiment / Decision -> Decision Log -> Notebook Memory -> Report'
                    : activeWizardNotebook.mode === 'rd'
                    ? 'R&D Objective -> Development Context -> Evidence Workspace -> Agent Reasoning -> Validation Gap -> Next Action / Decision -> Decision Log -> Notebook Memory -> Report'
                    : 'Analytical Objective -> Analytical Context -> Evidence Workspace -> Agent Reasoning -> Validation Gap -> Result Decision / Disposition -> Decision Log -> Notebook Memory -> Report'}
                </p>
              </div>

              {/* Objective */}
              {(() => {
                const sf = activeWizardNotebook.setupFields ?? {};
                const objectiveText =
                  activeWizardNotebook.objective?.trim() ||
                  (activeWizardNotebook.mode === 'research'
                    ? sf['projectDescription'] || sf['scientificQuestion'] || ''
                    : activeWizardNotebook.mode === 'rd'
                    ? sf['projectDescription'] || sf['productGoal'] || sf['decisionNeeded'] || ''
                    : sf['jobDescription'] || sf['analysisPurpose'] || '');
                const objectiveLabel =
                  activeWizardNotebook.mode === 'research' ? 'Research Objective'
                  : activeWizardNotebook.mode === 'rd' ? 'R&D Objective'
                  : 'Analytical Objective';
                return (
                  <div className="mb-4 rounded-lg border border-border bg-surface p-4">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-text-dim mb-2">{objectiveLabel}</h2>
                    {objectiveText ? (
                      <p className="text-sm text-text-main leading-relaxed">{objectiveText}</p>
                    ) : (
                      <p className="text-xs text-text-muted italic">No objective text was provided during setup.</p>
                    )}
                  </div>
                );
              })()}

              {/* Setup fields - context section, non-empty values only */}
              {(() => {
                const sf = activeWizardNotebook.setupFields ?? {};
                // For each mode, pick the context fields (exclude the one already shown as objective)
                const contextKeys =
                  activeWizardNotebook.mode === 'research'
                    ? ['sampleSystem', 'plannedTechniques', 'scientificQuestion', 'projectDescription']
                    : activeWizardNotebook.mode === 'rd'
                    ? ['productGoal', 'targetKpi', 'decisionNeeded', 'projectDescription']
                    : ['sampleSubmitted', 'analysisPurpose', 'methodSop', 'jobDescription'];
                const entries = contextKeys
                  .map((k) => [k, sf[k]] as [string, string])
                  .filter(([, v]) => v && v.trim());
                if (entries.length === 0) return null;
                const contextLabel =
                  activeWizardNotebook.mode === 'research' ? 'Experimental Context'
                  : activeWizardNotebook.mode === 'rd' ? 'Development Context'
                  : 'Analytical Context';
                const keyLabels: Record<string, string> = {
                  projectDescription: 'Project Description',
                  scientificQuestion: 'Scientific Question',
                  sampleSystem: 'Sample System',
                  plannedTechniques: 'Planned Techniques',
                  productGoal: 'Product / Process Goal',
                  targetKpi: 'Target KPI',
                  decisionNeeded: 'Decision Needed',
                  jobDescription: 'Job / Request Description',
                  sampleSubmitted: 'Sample Submitted',
                  analysisPurpose: 'Analysis Purpose',
                  methodSop: 'Method / SOP',
                };
                return (
                  <div className="mb-4 rounded-lg border border-border bg-surface p-4">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-text-dim mb-3">{contextLabel}</h2>
                    <div className="space-y-2">
                      {entries.map(([key, value]) => (
                        <div key={key} className="flex gap-3 text-sm">
                          <span className="text-text-dim min-w-[140px] shrink-0">{keyLabels[key] ?? key}:</span>
                          <span className="text-text-main">{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Data import status */}
              {(() => {
                const imp = activeWizardNotebook.initialDataImport;
                const hasFiles = imp && !imp.skipped && imp.files.length > 0;
                return (
                  <div className="mb-4 rounded-lg border border-border bg-surface p-4">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-text-dim mb-3">Data Import</h2>
                    {hasFiles ? (
                      <div className="space-y-1.5">
                        <p className="text-xs text-primary font-semibold mb-2">
                          {imp!.files.length} file{imp!.files.length > 1 ? 's' : ''} attached
                        </p>
                        {imp!.files.map((file, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs text-text-muted">
                            <FileText size={12} className="text-primary shrink-0" />
                            <span className="font-medium text-text-main">{file.name}</span>
                            <span className="text-text-dim">({file.type || 'unknown'})</span>
                            <span className="ml-auto text-[10px] text-amber-600 font-semibold uppercase">Pending parse</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-text-muted">No data attached yet. Open a workspace to begin evidence collection.</p>
                    )}
                  </div>
                );
              })()}

              {/* Action buttons */}
              <div className="mb-4 flex flex-wrap gap-2">
                <Link
                  to="/workspace/multi"
                  className="inline-flex h-8 items-center justify-center rounded-md border border-primary bg-primary/10 px-3 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors"
                >
                  Open Workspace
                </Link>
                <Link
                  to="/history"
                  className="inline-flex h-8 items-center justify-center rounded-md border border-border px-3 text-xs font-medium text-text-muted hover:bg-surface-hover hover:text-text-main transition-colors"
                >
                  View History
                </Link>
                <button
                  type="button"
                  disabled
                  title="Import data files from the workspace or dashboard."
                  className="inline-flex h-8 items-center justify-center rounded-md border border-border px-3 text-xs font-medium text-text-muted opacity-50 cursor-not-allowed"
                >
                  Add Data
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`Delete "${activeWizardNotebook.title}"? This cannot be undone.`)) {
                      deleteProjectNotebook(activeWizardNotebook.id);
                      setWizardNotebooks(getLocalProjectNotebooks());
                      navigate('/notebook');
                    }
                  }}
                  className="inline-flex h-8 items-center justify-center rounded-md border border-red-300 px-3 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                >
                  Delete Project
                </button>
              </div>

              {/* Next steps */}
              <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-4">
                <h2 className="text-xs font-bold uppercase tracking-wider text-primary mb-2">Next Steps</h2>
                <ul className="space-y-1 text-xs text-text-muted">
                  {activeWizardNotebook.workflowStatus !== 'evidence_ready' && (
                    <li className="flex items-start gap-2"><ArrowRight size={12} className="mt-0.5 text-primary shrink-0" /> Add experiments or import data files to begin evidence collection.</li>
                  )}
                  <li className="flex items-start gap-2"><ArrowRight size={12} className="mt-0.5 text-primary shrink-0" /> Open a workspace to process evidence and generate a processing result.</li>
                  <li className="flex items-start gap-2"><ArrowRight size={12} className="mt-0.5 text-primary shrink-0" /> Run the agent to generate a reasoning trace and decision.</li>
                  <li className="flex items-start gap-2"><ArrowRight size={12} className="mt-0.5 text-primary shrink-0" /> Save a notebook entry to preserve the scientific memory.</li>
                </ul>
              </div>
            </div>
          ) : (
            <>
              {/* Compact notebook header */}
              <div className="sticky top-0 z-10 border-b border-border bg-surface/95 px-4 py-2 backdrop-blur">
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="text-sm font-bold text-text-main">Notebook Lab / {evidenceSnapshot.projectName}</span>
                    <span className={`h-6 px-2 flex items-center rounded text-[10px] font-semibold ${hasMatchedNotebookData ? claimStatusColorClass(registryProject.claimStatus) : 'bg-amber-50 border border-amber-200 text-amber-700'}`}>{displayNotebookStatus}</span>
                    <span className="h-6 px-2 flex items-center rounded bg-blue-50 border border-blue-200 text-[10px] font-semibold text-blue-700">{registryProject.reportReadiness}% ready</span>
                    <span className="h-6 px-2 flex items-center rounded bg-cyan-50 border border-cyan-200 text-[10px] font-semibold text-cyan-700">{evidenceSnapshot.availableTechniques.join(', ') || 'Pending'}</span>
                    {/* Phase X6C: Runtime validation badge from workspace context */}
                    {runtimeIsValidated && runtimeEvidence && (
                      <span className="h-6 px-2 flex items-center rounded bg-emerald-50 border border-emerald-600 text-[10px] font-semibold text-emerald-700">
                        7E.4 Validated
                      </span>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    {feedback && (
                      <span className="hidden items-center rounded border border-primary/20 bg-primary/10 px-2 text-[11px] font-semibold text-primary sm:inline-flex">{feedback}</span>
                    )}
                    <Button variant="primary" size="sm" disabled={!hasMatchedNotebookData} title={!hasMatchedNotebookData ? 'Requires matched processing result before saving.' : undefined} className="h-7 gap-1.5 px-2 text-xs" onClick={saveWorkflowNotebookEntry}><Save size={12} /> Save Entry</Button>
                    <Link
                      to={isUploadedContext && uploadedRouteSearch
                        ? `/report?${uploadedRouteSearch}&template=xrd-summary`
                        : `/reports?project=${currentProject.id}&mode=demo&template=${templateMode}&entry=${workflowNotebookEntry.id}`}
                      onClick={handleReportHandoffClick}
                      className="inline-flex h-7 items-center rounded-md border border-primary/30 bg-primary/5 px-2 text-xs font-semibold text-primary hover:bg-primary/10 transition-colors"
                    >
                      Send to Report <ArrowRight size={12} className="ml-1" />
                    </Link>
                    <div className="relative">
                      <Button variant="outline" size="sm" className="h-7 gap-1.5 px-2 text-xs" onClick={() => setMoreMenuOpen((open) => !open)}><MoreHorizontal size={12} /> More</Button>
                      {moreMenuOpen && (
                        <div className="absolute right-0 top-9 z-20 w-56 rounded-lg border border-border bg-white p-2 shadow-xl">
                          <button type="button" onClick={() => { setIsEvidenceDrawerOpen(true); setMoreMenuOpen(false); }} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-semibold text-text-main hover:bg-surface-hover"><FlaskConical size={12} /> Evidence Trace</button>
                          <button type="button" disabled={!selectedEvidenceDataset} onClick={() => { exportNotebookCsv('raw'); setMoreMenuOpen(false); }} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-semibold text-text-main hover:bg-surface-hover disabled:cursor-not-allowed disabled:text-slate-400"><Download size={12} /> Export raw signal CSV</button>
                          <button type="button" disabled={!selectedEvidenceDataset} onClick={() => { exportNotebookCsv('features'); setMoreMenuOpen(false); }} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-semibold text-text-main hover:bg-surface-hover disabled:cursor-not-allowed disabled:text-slate-400"><Download size={12} /> Export features CSV</button>
                          <button type="button" onClick={() => { exportNotebookCsv('summary'); setMoreMenuOpen(false); }} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-semibold text-text-main hover:bg-surface-hover"><Download size={12} /> Export summary CSV</button>
                          <button type="button" onClick={() => { copyShareLink(); setMoreMenuOpen(false); }} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-semibold text-text-main hover:bg-surface-hover border-t border-border"><Share2 size={12} /> Share</button>
                          <button type="button" onClick={() => { printReport(); setMoreMenuOpen(false); }} disabled={!hasMatchedNotebookData} title={!hasMatchedNotebookData ? 'Requires matched processing result before printing.' : undefined} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-semibold text-text-main hover:bg-surface-hover disabled:cursor-not-allowed disabled:text-slate-400"><Printer size={12} /> Print</button>
                          <button type="button" onClick={() => { setObservationOpen(true); setMoreMenuOpen(false); }} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-semibold text-text-main hover:bg-surface-hover"><Plus size={12} /> Observe</button>
                          <button type="button" onClick={() => { setAttachRunOpen(true); setMoreMenuOpen(false); }} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-semibold text-text-main hover:bg-surface-hover"><FileText size={12} /> Attach</button>
                          <button type="button" onClick={() => { setContextDetailsOpen((open) => !open); setMoreMenuOpen(false); }} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-semibold text-text-main hover:bg-surface-hover border-t border-border"><Target size={12} /> Context Details</button>
                          <button type="button" onClick={() => { setAuditTrailOpen((open) => !open); setMoreMenuOpen(false); }} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-semibold text-text-main hover:bg-surface-hover"><BarChart3 size={12} /> Audit Trail</button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Context Details Drawer */}
                {contextDetailsOpen && (
                  <div className="border-t border-border bg-slate-50 px-4 py-3 mt-2">
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
                      <div>
                        <span className="font-semibold text-slate-600">Mode:</span>
                        <span className="ml-2 text-slate-700">{notebookTemplate.label}</span>
                      </div>
                      <div>
                        <span className="font-semibold text-slate-600">Job type:</span>
                        <span className="ml-2 text-slate-700">{jobTypeLabel(registryProject.jobType)}</span>
                      </div>
                      <div>
                        <span className="font-semibold text-slate-600">Sample:</span>
                        <span className="ml-2 text-slate-700">{formatChemicalFormula(evidenceSnapshot.sampleIdentity)}</span>
                      </div>
                      <div>
                        <span className="font-semibold text-slate-600">Bundle:</span>
                        <span className="ml-2 text-slate-700">{evidenceBundle ? getEvidenceBundleBadgeLabel(evidenceBundle) : 'No bundle yet'}</span>
                      </div>
                      <div>
                        <span className="font-semibold text-slate-600">Pending:</span>
                        <span className="ml-2 text-slate-700">{evidenceSnapshot.pendingTechniques.join(', ') || 'None'}</span>
                      </div>
                      <div>
                        <span className="font-semibold text-slate-600">Validation gaps:</span>
                        <span className="ml-2 text-slate-700">{evidenceSnapshot.validationGaps.length}</span>
                      </div>
                      <div>
                        <span className="font-semibold text-slate-600">Export status:</span>
                        <span className="ml-2 text-slate-700">{registryProject.reportReadiness >= 80 ? 'Ready' : 'Blocked'}</span>
                      </div>
                      <div>
                        <span className="font-semibold text-slate-600">Runtime source:</span>
                        <span className="ml-2 text-slate-700">{getRuntimeBadgeLabel(runtimeContext)}</span>
                      </div>
                      {getLockedContext(currentProject.id) && (
                        <div className="col-span-2">
                          <span className="font-semibold text-slate-600">Context:</span>
                          <span className="ml-2 text-amber-700">Locked context preserved</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Audit Trail Drawer */}
                {auditTrailOpen && evidenceBundle && (
                  <div className="border-t border-border bg-slate-50 px-4 py-3 mt-2">
                    <ApprovalLedgerPanel projectId={currentProject.id} bundleId={evidenceBundle.bundleId} limit={10} compact={false} />
                  </div>
                )}

                <div className="mt-2 flex items-center gap-0.5 -mb-px overflow-x-auto">
                  {NOTEBOOK_TABS.map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setActiveNotebookTab(tab)}
                      className={`whitespace-nowrap rounded-t border-b-2 px-3 py-1 text-[11px] font-semibold transition-colors ${
                        activeNotebookTab === tab
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-transparent text-text-muted hover:border-border hover:text-text-main'
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
              </div>
          {observationOpen && (
            <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/30 p-4">
              <div className="w-full max-w-lg rounded-xl border border-border bg-white p-5 shadow-2xl">
                <h2 className="text-base font-bold text-text-main">Add Observation</h2>
                <p className="mt-1 text-sm text-text-muted">Add a demo notebook note tied to the current project context.</p>
                <textarea
                  value={observationDraft}
                  onChange={(event) => setObservationDraft(event.target.value)}
                  placeholder="Example: Raman A1g mode remains consistent with the XRD phase assignment."
                  className="mt-4 h-28 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-main outline-none focus:border-primary"
                />
                <div className="mt-4 flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setObservationOpen(false)}>Cancel</Button>
                  <Button size="sm" onClick={addObservation}>Add Observation</Button>
                </div>
              </div>
            </div>
          )}

          {attachRunOpen && (
            <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/30 p-4">
              <div className="w-full max-w-2xl rounded-xl border border-border bg-white p-5 shadow-2xl">
                <h2 className="text-base font-bold text-text-main">Attach Data</h2>
                <p className="mt-1 text-sm text-text-muted">Select saved processing data to link into this notebook.</p>
                <div className="mt-4 max-h-72 space-y-2 overflow-y-auto">
                  {availableRuns.length === 0 && (
                    <p className="rounded-md border border-border bg-background p-3 text-sm text-text-muted">
                      No upstream processing data attached yet. Save processed evidence in a workspace, then attach it here.
                    </p>
                  )}
                  {availableRuns.slice().reverse().map((run) => {
                    const dataset = getDataset(run.datasetId);
                    return (
                      <button
                        key={run.id}
                        type="button"
                        onClick={() => attachRunToNotebook(run)}
                        className="block w-full rounded-md border border-border bg-background p-3 text-left text-sm hover:border-primary/40 hover:bg-primary/5"
                      >
                        <span className="font-semibold text-text-main">{run.technique} run - {dataset?.fileName ?? run.datasetId}</span>
                        <span className="mt-1 block text-xs text-text-muted">
                          {new Date(run.timestamp).toLocaleString()} / {run.detectedFeatures.length} features / {formatClaimStatus(run.matchResult?.claimStatus || 'supported')}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-4 flex justify-end">
                  <Button variant="outline" size="sm" onClick={() => setAttachRunOpen(false)}>Back to notebook</Button>
                </div>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
          <div className="p-3 max-w-7xl w-full mx-auto">

            {/* Invalid project fallback banner */}
            {(() => {
              const requested = searchParams.get('project');
              if (requested && !isKnownProjectId(requested)) {
                const fallback = getRegistryProject(null);
                return (
                  <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
                    <span className="font-semibold">Project not found.</span>{' '}
                    Showing the default project context: {fallback.title}.
                  </div>
                );
              }
              return null;
            })()}

            {activeNotebookTab === 'Objective / Context' && (() => {
              const lockedContext = getLockedContext(currentProject.id);
              const characterizationGoal = hasMatchedNotebookData
                ? evidenceSnapshot.supportedAssignment
                : `Establish a matched processing result for ${evidenceSnapshot.projectName} before characterization goal is defined.`;
              const topDecision = currentProject.nextDecisions[0];
              const decisionQuestion = topDecision
                ? topDecision.description || topDecision.label
                : hasMatchedNotebookData
                  ? `Is the current evidence sufficient to advance the ${evidenceSnapshot.projectName} interpretation beyond validation-limited status?`
                  : `What dataset is required to begin ${evidenceSnapshot.projectName} characterization?`;

              return (
              <div className="space-y-2">
                {!hasMatchedNotebookData && (
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700">Notebook status: </span>
                    <span className="text-xs text-text-muted">No matched processing result. Load a compatible dataset to generate evidence and notebook interpretation.</span>
                  </div>
                )}

                {/* Compact Primary Summary */}
                <div className="rounded-md border border-border bg-surface px-3 py-2.5 space-y-2">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-text-dim">Research Objective</div>
                    <div className="mt-1 text-sm leading-snug text-text-main">{currentProject.objective}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-text-dim">Sample Identity</div>
                      <div className="mt-1 text-sm text-text-main">{lockedContext?.sampleIdentity ?? evidenceSnapshot.sampleIdentity}</div>
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-text-dim">Active Dataset</div>
                      <div className="mt-1 text-sm text-text-main">{evidenceSnapshot.activeDataset?.fileName ?? evidenceSnapshot.evidenceEntries?.[0]?.datasetLabel ?? 'Pending evidence source'}</div>
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-text-dim">Validation Status</div>
                    <div className="mt-1 text-sm text-text-main">{claimStatusLabel(registryProject.claimStatus)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-text-dim">Claim Boundary</div>
                    <div className="mt-1 text-sm text-text-main">
                      {evidenceSnapshot.validationGaps.length > 0
                        ? `${evidenceSnapshot.validationGaps.length} validation gap${evidenceSnapshot.validationGaps.length > 1 ? 's' : ''} identified`
                        : 'Evidence-supported assignment within validation boundaries'}
                    </div>
                  </div>
                </div>

                {/* Collapsible Context Details */}
                <div className="rounded-md border border-border bg-surface">
                  <button
                    type="button"
                    onClick={() => setContextDetailsOpen((open) => !open)}
                    className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-surface-hover"
                  >
                    <span className="text-xs font-semibold text-text-main">Context Details</span>
                    <ChevronDown size={14} className={`text-text-muted transition-transform ${contextDetailsOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {contextDetailsOpen && (
                    <div className="border-t border-border px-3 py-2 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${getRuntimeBadgeClass(runtimeContext)}`}>
                          {getRuntimeBadgeLabel(runtimeContext, 'source')}
                        </span>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${getRuntimeBadgeClass(runtimeContext)}`}>
                          {getRuntimeBadgeLabel(runtimeContext, 'permission')}
                        </span>
                        <ConnectedAccountStatus
                          state={connectedAccountState}
                          capabilities={runtimeContext.sourceMode === 'google_drive_connected' ? ['drive_import', 'drive_export_future', 'gmail_draft_future'] : ['storage_future']}
                          compact
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                        <div>
                          <span className="font-semibold text-slate-600">Runtime source:</span>
                          <span className="ml-2 text-slate-700">{getRuntimeBadgeLabel(runtimeContext)}</span>
                        </div>
                        {evidenceBundle && (
                          <>
                            <div>
                              <span className="font-semibold text-slate-600">Evidence bundle:</span>
                              <span className="ml-2 text-slate-700">{evidenceBundle.bundleId} / {getEvidenceBundleBadgeLabel(evidenceBundle)}</span>
                            </div>
                            <div className="col-span-2">
                              <span className="font-semibold text-slate-600">Files included:</span>
                              <span className="ml-2 text-slate-700">{(evidenceBundle.files ?? []).map((file) => `${file.technique}: ${file.fileName}`).join('; ') || 'No evidence files linked'}</span>
                            </div>
                            <div>
                              <span className="font-semibold text-slate-600">Technique coverage:</span>
                              <span className="ml-2 text-slate-700">{bundleTechniqueCoverage.map((item) => `${item.technique}: ${item.status}`).join(', ')}</span>
                            </div>
                            <div>
                              <span className="font-semibold text-slate-600">Bundle completeness:</span>
                              <span className="ml-2 text-slate-700">{evidenceBundle.evidenceCompletenessScore}%</span>
                            </div>
                          </>
                        )}
                        <div />
                        {evidenceBundle && (
                          <div>
                            <span className="font-semibold text-slate-600">Bundle completeness:</span>
                            <span className="ml-2 text-slate-700">{evidenceBundle.evidenceCompletenessScore}%</span>
                          </div>
                        )}
                        <div>
                          <span className="font-semibold text-slate-600">Claim status:</span>
                          <span className="ml-2 text-slate-700">{claimStatusLabel(registryProject.claimStatus)}</span>
                        </div>
                        <div>
                          <span className="font-semibold text-slate-600">Job type / mode:</span>
                          <span className="ml-2 text-slate-700">{jobTypeLabel(registryProject.jobType)} / {notebookTemplate.label}</span>
                        </div>
                        <div>
                          <span className="font-semibold text-slate-600">Available techniques:</span>
                          <span className="ml-2 text-slate-700">{(evidenceSnapshot.availableTechniques ?? []).join(', ') || 'None linked'}</span>
                        </div>
                        <div>
                          <span className="font-semibold text-slate-600">Pending validation:</span>
                          <span className="ml-2 text-slate-700">{(evidenceSnapshot.pendingTechniques ?? []).join(', ') || 'None'}</span>
                        </div>
                        <div>
                          <span className="font-semibold text-slate-600">Validation gaps:</span>
                          <span className="ml-2 text-slate-700">{evidenceSnapshot.validationGaps.length}</span>
                        </div>
                        <div>
                          <span className="font-semibold text-slate-600">Condition lock:</span>
                          <span className="ml-2 text-slate-700">{experimentConditionStatus}</span>
                        </div>
                        <div className="col-span-2">
                          <span className="font-semibold text-slate-600">Workflow path:</span>
                          <span className="ml-2 text-slate-700">{registryProject.workflowPath.join(' -> ')}</span>
                        </div>
                        {lockedContext?.sourceDataset && (
                          <div className="col-span-2">
                            <span className="font-semibold text-slate-600">Source dataset:</span>
                            <span className="ml-2 text-slate-700">{lockedContext.sourceDataset}</span>
                          </div>
                        )}
                        <div className="col-span-2 pt-2 border-t border-border">
                          <span className="font-semibold text-slate-600">Characterization Goal:</span>
                          <div className="mt-1 text-slate-700">{characterizationGoal}</div>
                        </div>
                        <div className="col-span-2 pt-2 border-t border-border">
                          <span className="font-semibold text-primary">Decision Question:</span>
                          <div className="mt-1 text-slate-700">{decisionQuestion}</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Notebook Mode Selection */}
                <div className="rounded-md border border-border bg-surface px-3 py-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-text-dim mb-1.5">Notebook Mode</div>
                  <div className="grid grid-cols-1 gap-1.5 md:grid-cols-3">
                    {NOTEBOOK_TEMPLATE_MODES.map((mode) => {
                      const template = NOTEBOOK_TEMPLATES[mode];
                      const details = NOTEBOOK_TEMPLATE_DETAILS[mode];
                      const isSelected = templateMode === mode;
                      return (
                        <button key={mode} type="button" aria-pressed={isSelected} onClick={() => setTemplateMode(mode)}
                          className={`rounded-md border px-2.5 py-2 text-left transition-colors ${isSelected ? 'border-primary bg-primary/5 text-primary' : 'border-border bg-background text-text-muted hover:border-primary/30 hover:text-text-main'}`}>
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-xs font-bold text-text-main">{template.label}</div>
                            {isSelected && <span className="rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary">Selected</span>}
                          </div>
                          <p className="mt-0.5 text-[11px] leading-snug text-text-muted">{details.description}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
              );
            })()}

            {activeNotebookTab === 'Evidence' && (
              <div className="space-y-2">
                <div className="rounded-md border border-border bg-surface px-3 py-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-text-dim">Peak Detection: </span>
                  <span className="text-sm text-text-main">{evidenceSnapshot.activeDataset ? projectNotebookContent.peakDetection : `${evidenceSnapshot.primaryTechnique} evidence source pending.`}</span>
                </div>
                <div className="rounded-md border border-primary/20 bg-surface px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-primary">Data Export</div>
                      <p className="mt-0.5 truncate text-xs text-text-muted">
                        {selectedEvidenceDataset
                          ? `${selectedEvidenceDataset.fileName} / ${selectedEvidenceDataset.dataPoints.length} raw points`
                          : 'No dataset is linked for the selected technique.'}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <select
                        value={selectedTechniqueForExport}
                        onChange={(event) => setSelectedEvidenceTechnique(event.target.value as Technique)}
                        className="h-7 rounded-md border border-border bg-background px-2 text-xs font-semibold text-text-main outline-none focus:border-primary"
                      >
                        {selectableExportTechniques.map((technique) => (
                          <option key={technique} value={technique}>{technique}</option>
                        ))}
                      </select>
                      <Button variant="outline" size="sm" disabled={!selectedEvidenceDataset} className="h-7 gap-1.5 px-2 text-xs" onClick={() => exportNotebookCsv('raw')}>
                        <Download size={12} /> Export Raw CSV
                      </Button>
                      <Button variant="outline" size="sm" disabled={!selectedEvidenceDataset} className="h-7 gap-1.5 px-2 text-xs" onClick={() => exportNotebookCsv('features')}>
                        <Download size={12} /> Export Features CSV
                      </Button>
                      <Button variant="outline" size="sm" className="h-7 gap-1.5 px-2 text-xs" onClick={() => exportNotebookCsv('summary')}>
                        <Download size={12} /> Export Evidence Summary CSV
                      </Button>
                      <Link
                        to={isUploadedContext && uploadedRouteSearch
                          ? `/report?${uploadedRouteSearch}&template=xrd-summary`
                          : `/reports?project=${currentProject.id}&mode=demo&template=${templateMode}&entry=${workflowNotebookEntry.id}`}
                        onClick={handleReportHandoffClick}
                        className="inline-flex h-7 items-center rounded-md border border-primary/30 bg-primary/5 px-2 text-xs font-semibold text-primary hover:bg-primary/10 transition-colors"
                      >
                        Send to Report <ArrowRight size={12} className="ml-1" />
                      </Link>
                    </div>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-text-dim mb-1">Skill-derived Evidence Basis</div>
                  <div className="space-y-1">
                    {keyEvidenceItems.map((item) => (
                      <div key={item} className="flex items-start gap-2 rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-text-main">
                        <span className="text-primary mt-0.5 shrink-0">-</span>
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-text-dim mb-1">Skill-derived Scientific Evidence Sources</div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {hasMatchedNotebookData ? (
                      <>
                      {evidenceSnapshot.evidenceEntries.map((item) => (
                      <div key={item.id} className="rounded-md border border-border bg-surface px-2.5 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-bold text-text-main">{item.technique}</span>
                          <span className={`text-xs font-semibold ${item.status === 'pending' ? 'text-amber-600' : 'text-primary'}`}>{item.status === 'pending' ? 'Pending' : 'Available'}</span>
                        </div>
                        <p className="mt-1 text-sm leading-snug text-text-main">{item.support}</p>
                        <p className="mt-0.5 text-[11px] text-text-muted">Dataset: {item.datasetLabel}</p>
                        {item.limitations && <p className="text-[11px] text-text-muted">{item.limitations}</p>}
                      </div>
                    ))}
                      {evidenceSnapshot.pendingTechniques.map((technique) => (
                        <div key={`pending-source-${technique}`} className="rounded-md border border-amber-500/30 bg-amber-500/5 px-2.5 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-bold text-text-main">{technique}</span>
                            <span className="text-xs font-semibold text-amber-700">Pending validation</span>
                          </div>
                          <p className="mt-1 text-sm leading-snug text-text-main">{technique} evidence is required before closing the validation boundary.</p>
                        </div>
                      ))}
                      </>
                    ) : (
                      <div className="col-span-2 rounded-md border border-dashed border-border bg-surface/50 px-3 py-2 text-center">
                        <p className="text-xs text-text-muted">No evidence sources linked yet. Process data in a workspace to generate evidence.</p>
                      </div>
                    )}
                  </div>
                </div>
                {workflowNotebookEntry?.xrdBackendEvidenceSummary && (() => {
                  const xbe = workflowNotebookEntry.xrdBackendEvidenceSummary;
                  const qm = selectXrdQualityMetrics(workflowNotebookEntry) || xbe;
                  const pm = selectXrdPhaseMatchSummary(workflowNotebookEntry) || xbe;
                  const formatSn = Number.isFinite(qm.snRatio) ? (qm.snRatio as number).toFixed(1) : 'N/A';
                  const formatBaseline = Number.isFinite(qm.baselineDeviation) ? (qm.baselineDeviation as number).toFixed(3) : 'N/A';
                  const formatSavedAt = (() => {
                    try {
                      const d = new Date(xbe.savedAt);
                      return isNaN(d.getTime()) ? 'timestamp pending' : d.toLocaleString();
                    } catch {
                      return 'timestamp pending';
                    }
                  })();
                  return (
                    <div className="rounded-md border border-border bg-surface px-3 py-2">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-text-dim mb-1.5">{xbe.label}</div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3 lg:grid-cols-4">
                        <div><span className="text-text-dim">Detected peaks:</span> <span className="font-semibold text-text-main">{qm.detectedPeakCount}</span></div>
                        <div><span className="text-text-dim">Fitted peaks:</span> <span className="font-semibold text-text-main">{qm.fittedPeakCount}</span></div>
                        <div><span className="text-text-dim">S/N ratio:</span> <span className="font-semibold text-text-main">{formatSn}</span></div>
                        <div><span className="text-text-dim">Baseline deviation:</span> <span className="font-semibold text-text-main">{formatBaseline}</span></div>
                        <div><span className="text-text-dim">Peak resolution:</span> <span className="font-semibold text-text-main">{qm.peakResolution ?? 'N/A'}</span></div>
                        <div><span className="text-text-dim">Matched peaks:</span> <span className="font-semibold text-text-main">{pm?.matchedPeakCount ?? 0}</span></div>
                      </div>
                      {pm?.primaryPhase && (
                        <div className="mt-1.5 text-xs">
                          <span className="text-text-dim">Reference-supported phase indication:</span>{' '}
                          <span className="font-semibold text-text-main">{pm.primaryPhase}</span>
                        </div>
                      )}
                      {/* Phase X5C: Pure renderer using centralized selectors */}
                      {(() => {
                        const sciEvidence = selectXrdWorkflowScientificEvidence(workflowNotebookEntry || { xrdBackendEvidenceSummary: xbe });
                        if (!sciEvidence) return null;
                        const fields = extractScientificEvidenceFields(sciEvidence);
                        if (!fields) return null;
                        return (
                          <div className="mt-1.5 space-y-0.5 text-xs">
                            <p className="font-semibold text-text-main">Scientific evidence object received</p>
                            <p className="text-text-muted">Skill: {fields.skillLabel}</p>
                            <p className="break-all text-text-muted">Evidence ID: {fields.evidenceId}</p>
                            <p className="break-all text-text-muted">Input reference: SHA-256 {fields.inputReference}</p>
                            <p className="text-text-muted">Claim boundary: {fields.claimBoundary}</p>
                          </div>
                        );
                      })()}
                      {xbe.phaseSummary && (
                        <p className="mt-1 text-xs text-text-muted">{xbe.phaseSummary}</p>
                      )}
                      <p className="mt-1.5 text-[11px] text-amber-700 font-medium">{xbe.caveat}</p>
                      <p className="mt-0.5 text-[10px] text-text-dim">
                        Saved: {formatSavedAt} · Validation-limited notebook entry
                      </p>
                    </div>
                  );
                })()}
                {/* Phase X5A: Use selector helper for unified handoff → individual → legacy fallback */}
                {(() => {
                  const refEvidence = selectXrdWorkflowReferenceMatchEvidence(workflowNotebookEntry);
                  if (!refEvidence) return null;
                  const rm = extractReferenceMatchFields(refEvidence);
                  if (!rm) return null;
                  const primary = rm.primaryCandidate;
                  const status = safeNotebookReferenceCandidateText(rm.status) ?? 'candidate evidence';
                  const claimLevel = safeNotebookReferenceCandidateText(rm.claimLevel) ?? 'candidate evidence';
                  const referenceSet = safeNotebookReferenceCandidateText(rm.referenceSetId);
                  const phaseLabel = safeNotebookReferenceCandidateText(primary?.phaseLabel);
                  const formula = safeNotebookReferenceCandidateText(primary?.formula);
                  const structureFamily = safeNotebookReferenceCandidateText(primary?.structureFamily);
                  const databaseRef = safeNotebookReferenceCandidateText(primary?.databaseRef);
                  const score = formatNotebookReferenceNumber(primary?.score);
                  const coverageRatio = formatNotebookReferenceNumber(primary?.coverageRatio);
                  const meanDelta = formatNotebookReferenceNumber(primary?.meanDeltaTwoTheta);
                  const matchedPeakCount = typeof primary?.matchedPeakCount === 'number' && Number.isFinite(primary.matchedPeakCount)
                    ? primary.matchedPeakCount
                    : null;
                  const referencePeakCount = typeof primary?.referencePeakCount === 'number' && Number.isFinite(primary.referencePeakCount)
                    ? primary.referencePeakCount
                    : null;
                  const matchedPeakLabel = matchedPeakCount !== null
                    ? `${matchedPeakCount}${referencePeakCount !== null ? ` / ${referencePeakCount}` : ''}`
                    : null;
                  const candidateCount = typeof rm.candidateCount === 'number' && Number.isFinite(rm.candidateCount)
                    ? rm.candidateCount
                    : null;
                  const matchedPeakRows = (Array.isArray(rm.matchedPeaksPreview) ? rm.matchedPeaksPreview : [])
                    .slice(0, 5)
                    .map((peak) => {
                      const measured = formatNotebookReferenceNumber(peak.measuredTwoTheta);
                      const reference = formatNotebookReferenceNumber(peak.referenceTwoTheta);
                      const delta = formatNotebookReferenceNumber(peak.deltaTwoTheta);
                      if (!measured || !reference || !delta) return null;
                      return {
                        measured,
                        reference,
                        delta,
                        hkl: safeNotebookReferenceCandidateText(peak.hkl) ?? 'N/A',
                        intensity: formatNotebookReferenceNumber(peak.referenceRelativeIntensity, 0) ?? 'N/A',
                      };
                    })
                    .filter((peak): peak is { measured: string; reference: string; delta: string; hkl: string; intensity: string } => Boolean(peak));
                  const limitations = (Array.isArray(rm.limitations) ? rm.limitations : [])
                    .map((limitation) => safeNotebookReferenceCandidateText(limitation))
                    .filter((limitation): limitation is string => Boolean(limitation));
                  const displayLimitations = limitations.length > 0
                    ? limitations
                    : NOTEBOOK_REFERENCE_CANDIDATE_FALLBACK_LIMITATIONS;
                  return (
                    <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-primary">Reference Candidate Evidence</div>
                          <p className="mt-0.5 text-xs text-text-muted">
                            Candidate-level agreement with selected reference evidence.
                          </p>
                        </div>
                        <span className="rounded-full border border-primary/25 bg-surface px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                          {status}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {NOTEBOOK_REFERENCE_CANDIDATE_BOUNDARY_LINES.map((line) => (
                          <span key={line} className="rounded border border-amber-500/25 bg-amber-500/5 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                            {line}
                          </span>
                        ))}
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3 lg:grid-cols-4">
                        <div><span className="text-text-dim">Claim level:</span> <span className="font-semibold text-text-main">{claimLevel}</span></div>
                        {referenceSet && <div><span className="text-text-dim">Reference set:</span> <span className="font-semibold text-text-main">{referenceSet}</span></div>}
                        {candidateCount !== null && <div><span className="text-text-dim">Candidates:</span> <span className="font-semibold text-text-main">{candidateCount}</span></div>}
                        {score && <div><span className="text-text-dim">Score:</span> <span className="font-semibold text-text-main">{score}</span></div>}
                        {matchedPeakLabel && <div><span className="text-text-dim">Matched peaks:</span> <span className="font-semibold text-text-main">{matchedPeakLabel}</span></div>}
                        {coverageRatio && <div><span className="text-text-dim">Coverage ratio:</span> <span className="font-semibold text-text-main">{coverageRatio}</span></div>}
                        {meanDelta && <div><span className="text-text-dim">Mean delta 2theta:</span> <span className="font-semibold text-text-main">{meanDelta}</span></div>}
                      </div>
                      {(phaseLabel || formula || structureFamily || databaseRef) && (
                        <div className="mt-1.5 rounded border border-primary/15 bg-surface px-2 py-1 text-xs">
                          {(phaseLabel || formula) && (
                            <div>
                              <span className="text-text-dim">Primary candidate:</span>{' '}
                              <span className="font-semibold text-text-main">
                                {phaseLabel}
                                {phaseLabel && formula ? ' / ' : ''}
                                {formula ? formatChemicalFormula(formula) : null}
                              </span>
                            </div>
                          )}
                          {structureFamily && (
                            <div><span className="text-text-dim">Structure family:</span> <span className="text-text-main">{structureFamily}</span></div>
                          )}
                          {databaseRef && (
                            <div><span className="text-text-dim">Database ref:</span> <span className="text-text-main">{databaseRef}</span></div>
                          )}
                        </div>
                      )}
                      {matchedPeakRows.length > 0 && (
                        <div className="mt-2 overflow-hidden rounded border border-border bg-surface text-[11px]">
                          <div className="grid grid-cols-5 gap-1 border-b border-border px-2 py-1 font-semibold text-text-dim">
                            <span>Measured 2theta</span>
                            <span>Reference 2theta</span>
                            <span>Delta 2theta</span>
                            <span>hkl</span>
                            <span>Ref. intensity</span>
                          </div>
                          {matchedPeakRows.map((peak, index) => (
                            <div key={`${peak.measured}-${peak.reference}-${index}`} className="grid grid-cols-5 gap-1 px-2 py-1 text-text-main odd:bg-background/60">
                              <span>{peak.measured}</span>
                              <span>{peak.reference}</span>
                              <span>{peak.delta}</span>
                              <span>{peak.hkl}</span>
                              <span>{peak.intensity}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="mt-2 space-y-0.5">
                        {displayLimitations.slice(0, 4).map((limitation) => (
                          <p key={limitation} className="text-[11px] leading-snug text-text-muted">- {limitation}</p>
                        ))}
                      </div>
                      <p className="mt-1.5 text-[10px] text-text-dim">
                        Saved: {formatNotebookReferenceTimestamp(rm.savedAt)}
                      </p>
                    </div>
                  );
                })()}
                <div className="rounded-md border border-border bg-surface px-3 py-2">
                  <div className="flex items-start justify-between gap-3 mb-1.5">
                    <div>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-text-dim">Experiment Conditions: </span>
                      <span className="text-sm font-bold text-text-main">{experimentConditionStatus}</span>
                    </div>
                    <div className="text-[11px] text-text-muted">Locked at: {formatConditionLockTimestamp(experimentConditionLock)}</div>
                  </div>
                  <div className="space-y-0.5">
                    {experimentConditionLines.map((line) => (
                      <div key={line} className="rounded border border-border bg-background px-2 py-0.5 text-[11px] text-text-muted">{line}</div>
                    ))}
                  </div>
                  {experimentConditionBoundaryNotes.length > 0 && (
                    <div className="mt-1.5 rounded border border-amber-500/20 bg-amber-500/5 px-2 py-1.5">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 mb-0.5">Condition-aware claim boundary</div>
                      {experimentConditionBoundaryNotes.slice(0, 3).map((note) => (
                        <p key={note} className="text-[11px] leading-snug text-text-muted">- {note}</p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeNotebookTab === 'Interpretation' && (
              <div className="space-y-2">
                <div className="rounded-md border border-border bg-surface px-3 py-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-text-dim">Phase Identification: </span>
                      <span className="text-sm font-semibold text-text-main">{hasMatchedNotebookData ? evidenceSnapshot.supportedAssignment : `No phase assignment for ${evidenceSnapshot.projectName} until matched data is linked.`}</span>
                    </div>
                    <span className="text-[11px] text-text-muted">Confidence: {confidenceLabel}</span>
                  </div>
                </div>
                <div className="rounded-md border border-primary/20 bg-surface px-3 py-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-primary mb-1">Reasoning Summary - {notebookTemplateDetails.primaryLabel}</div>
                  <p className="text-sm leading-snug text-text-main">
                    {hasMatchedNotebookData ? snapshotDiscussionLine : 'No matched processing result is linked to this notebook entry.'}
                  </p>
                  <div className="mt-1.5 rounded border border-primary/20 bg-primary/5 px-2 py-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">Discussion readiness: </span>
                    <span className="text-xs font-semibold text-text-main">{displayNotebookStatus}: {hasMatchedNotebookData ? notebookTemplateDetails.output : 'Load compatible data before notebook interpretation.'}</span>
                  </div>
                </div>
                {hasMatchedNotebookData && projectNotebookContent.supportingData.length > 0 && (
                  <div className="rounded-md border border-border bg-surface px-3 py-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-text-dim mb-1">Cross-Technique Consistency</div>
                    <div className="space-y-1">
                      {projectNotebookContent.supportingData.map((item) => (
                        <div key={item.technique} className="flex items-start gap-2 rounded border border-border bg-background px-2 py-1 text-xs">
                          <span className="font-bold text-text-main w-14 shrink-0">{item.technique}</span>
                          <span className="text-text-muted flex-1">{item.evidence}</span>
                          <span className={`shrink-0 font-semibold ${item.strength === 'Review' ? 'text-amber-600' : item.strength === 'Ready' ? 'text-primary' : 'text-cyan'}`}>{item.strength}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {hasMatchedNotebookData && (
                  <div className="rounded-md border border-amber-500/20 bg-surface px-3 py-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 mb-1">Caveats</div>
                    <div className="space-y-0.5">
                      {evidenceSnapshot.evidenceEntries.map((item) => (
                        <p key={`caveat-${item.id}`} className="text-xs leading-snug text-text-muted">- <span className="font-semibold text-text-main">{item.technique}:</span> {item.limitations ?? 'Evidence included in validation boundary.'}</p>
                      ))}
                      {evidenceSnapshot.pendingTechniques.map((technique) => (
                        <p key={`pending-caveat-${technique}`} className="text-xs leading-snug text-text-muted">- <span className="font-semibold text-text-main">{technique}:</span> Pending validation evidence.</p>
                      ))}
                    </div>
                  </div>
                )}
                {hasMatchedNotebookData && (() => {
                  const claimSection = workflowNotebookEntry.sections.find((s) => s.heading === 'Claim Boundary');
                  return claimSection ? (
                    <div className="rounded-md border border-border bg-surface px-3 py-2">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-text-dim mb-1">Claim Boundary</div>
                      {claimSection.lines.map((line) => <p key={line} className="text-sm leading-snug text-text-main">{line}</p>)}
                    </div>
                  ) : null;
                })()}
                {hasMatchedNotebookData && supportingNotebookSections.filter(s => s.heading !== 'Claim Boundary').length > 0 && (
                  <div className="rounded-md border border-border bg-surface px-3 py-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-text-dim mb-1">Additional Sections</div>
                    <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                      {supportingNotebookSections.filter(s => s.heading !== 'Claim Boundary').map((section) => (
                        <div key={section.heading} className="rounded border border-border bg-background px-2.5 py-1.5">
                          <div className="text-xs font-bold text-text-main mb-0.5">{section.heading}</div>
                          {section.lines.map((line) => <p key={line} className="text-xs leading-snug text-text-muted">{line}</p>)}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="rounded-md border border-border bg-surface px-3 py-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-text-dim mb-1">Reasoning micro-flow</div>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-text-muted">
                    {workflowRefinement.microFlow.map((step, index) => (
                      <React.Fragment key={step}>
                        <span className="rounded-full border border-border bg-background px-2 py-0.5">{step}</span>
                        {index < workflowRefinement.microFlow.length - 1 && <ArrowRight size={11} className="text-primary" />}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
                {observations.length > 0 && (
                  <div className="rounded-md border border-border bg-surface px-3 py-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-text-dim mb-1">Observations</div>
                    <div className="space-y-1">
                      {observations.map((obs) => (
                        <div key={obs} className="rounded border border-border bg-background px-2 py-1 text-xs text-text-main">{obs}</div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeNotebookTab === 'Validation Gap' && (
              <div className="space-y-2">
                <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 mb-1">Limitations</div>
                  <div className="space-y-1">
                    {(evidenceSnapshot.validationGaps.length > 0 ? evidenceSnapshot.validationGaps : []).map((gap) => (
                      <div key={gap.id} className="rounded border border-border bg-background px-2.5 py-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-semibold leading-snug text-text-main">{gap.description}</div>
                          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700">{gap.severity}</span>
                        </div>
                        <p className="mt-0.5 text-xs text-text-muted">{gap.suggestedResolution}</p>
                      </div>
                    ))}
                    {evidenceSnapshot.validationGaps.length === 0 && (
                      <p className="text-sm text-text-muted">No open validation gaps are registered for this project.</p>
                    )}
                  </div>
                </div>
                <div className="rounded-md border border-border bg-surface px-3 py-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-text-dim mb-1">Missing References And Boundary</div>
                  <div className="space-y-1">
                    <p className="text-sm leading-snug text-text-main">
                      <span className="font-semibold">Boundary:</span> {getSnapshotClaimBoundaryLines(evidenceSnapshot)[0] ?? registryProject.notebook.validationBoundary}
                    </p>
                    {[...registryProject.notebook.missingReferences, ...evidenceSnapshot.pendingTechniques.map((technique) => `${technique} validation evidence pending`)].map((reference) => (
                      <p key={reference} className="text-xs leading-snug text-text-muted">- {reference}</p>
                    ))}
                  </div>
                </div>
                <div className="rounded-md border border-border bg-surface px-3 py-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-text-dim mb-1">Missing Evidence</div>
                  {hasMatchedNotebookData ? (
                    <div className="space-y-1">
                      {evidenceSnapshot.pendingTechniques.length === 0 ? (
                        <p className="text-xs text-text-muted">All linked technique evidence is marked ready for this project.</p>
                      ) : evidenceSnapshot.pendingTechniques.map((technique) => (
                        <div key={`missing-${technique}`} className="flex items-start gap-2 rounded border border-border bg-background px-2 py-1 text-xs">
                          <span className="font-bold text-text-main w-14 shrink-0">{technique}</span>
                          <span className="text-text-muted flex-1">{technique} evidence is pending for validation closure.</span>
                          <span className="shrink-0 font-semibold text-amber-600">Pending</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-text-muted">No evidence linked for {currentProject.name} yet.</p>
                  )}
                </div>
                <div className="rounded-md border border-border bg-surface px-3 py-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-text-dim mb-1">Follow-up Validation</div>
                  <div className="space-y-1">
                    {(hasMatchedNotebookData
                      ? [
                          ...evidenceSnapshot.validationGaps.map((gap) => gap.suggestedResolution),
                          ...evidenceSnapshot.pendingTechniques.map((technique) => `Add ${technique} evidence before validation closure.`),
                        ]
                      : ['Load a matched processing result before validation closure.']).map((item, index) => (
                      <div key={item} className="flex items-start gap-2 rounded border border-border bg-background px-2 py-1 text-sm leading-snug text-text-muted">
                        <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">{index + 1}</div>
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-md border border-border bg-surface px-3 py-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-text-dim">Publication Limitations</div>
                  <p className="mt-0.5 text-sm text-text-main">Claim status: <span className="font-semibold">{confidenceLabel}</span></p>
                  <p className="text-xs leading-snug text-text-muted">Memory state: {hasMatchedNotebookData ? 'Ready to hand off to the Evidence-to-Report builder; publication-level claims remain validation-limited until open gaps are closed.' : `Publication not available for ${currentProject.name} until matched evidence is linked.`}</p>
                </div>
              </div>
            )}

            {activeNotebookTab === 'Decision' && (() => {
              const decisionState = !hasMatchedNotebookData
                ? 'Hold'
                : evidenceSnapshot.validationGaps.length > 0 || evidenceSnapshot.pendingTechniques.length > 0 ? 'Validate next' : 'Proceed';
              const decisionStateColor = decisionState === 'Proceed'
                ? 'text-primary border-primary/30 bg-primary/10'
                : decisionState === 'Validate next' ? 'text-amber-700 border-amber-500/30 bg-amber-500/10'
                : 'text-text-muted border-border bg-background';
              return (
              <div className="space-y-2">
                <div className="rounded-md border border-primary/20 bg-surface px-3 py-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-primary mb-0.5">Next Decision</div>
                      <h3 className="text-sm font-bold text-text-main">{notebook.decision}</h3>
                      <p className="mt-1 text-sm leading-snug text-text-muted">{notebook.summary}</p>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${decisionStateColor}`}>{decisionState}</span>
                  </div>
                </div>
                <div className="rounded-md border border-border bg-surface px-3 py-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-text-dim mb-1">Scientific Decision State</div>
                  <div className="grid grid-cols-1 gap-x-3 gap-y-0.5 text-sm text-text-main sm:grid-cols-2">
                    <div><span className="text-text-dim">Status: </span>{decisionState}</div>
                    <div><span className="text-text-dim">Notebook readiness: </span>{displayNotebookStatus}</div>
                    <div><span className="text-text-dim">Open validation gaps: </span>{evidenceSnapshot.validationGaps.length}</div>
                    <div><span className="text-text-dim">Pending techniques: </span>{evidenceSnapshot.pendingTechniques.join(', ') || 'None'}</div>
                    <div><span className="text-text-dim">Evidence linked: </span>{hasMatchedNotebookData ? 'Linked' : 'Pending'}</div>
                  </div>
                </div>
                <div className="rounded-md border border-border bg-surface px-3 py-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-text-dim">Confidence Rationale</div>
                  <p className="mt-0.5 text-sm text-text-main">Claim status: <span className="font-semibold">{confidenceLabel}</span></p>
                  <p className="text-xs leading-snug text-text-muted">
                    {hasMatchedNotebookData
                      ? `Rationale based on ${evidenceSnapshot.availableTechniques.length} available technique evidence source${evidenceSnapshot.availableTechniques.length === 1 ? '' : 's'}, ${evidenceSnapshot.pendingTechniques.length} pending technique${evidenceSnapshot.pendingTechniques.length === 1 ? '' : 's'}, and ${evidenceSnapshot.validationGaps.length} open validation gap${evidenceSnapshot.validationGaps.length === 1 ? '' : 's'}.`
                      : `No matched processing result is linked to ${evidenceSnapshot.projectName}; confidence remains pending.`}
                  </p>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-text-dim mb-1">Candidate Decisions</div>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    {currentProject.nextDecisions.map((decision) => (
                      <div key={decision.id} className="rounded-md border border-border bg-surface px-2.5 py-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-bold text-text-main">{decision.label}</div>
                          <span className="text-xs font-semibold text-primary">{decision.urgency}</span>
                        </div>
                        <p className="mt-0.5 text-sm leading-snug text-text-muted">{decision.description}</p>
                        {decision.linkedTechnique && <p className="mt-0.5 text-[11px] text-text-dim">Linked technique: {decision.linkedTechnique}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              );
            })()}

          </div>
          </div>
          {isEvidenceDrawerOpen && (
            <div className="fixed inset-0 z-40 flex justify-end bg-slate-950/30">
              <div className="h-full w-full max-w-md border-l border-border bg-surface shadow-2xl">
                <div className="flex items-start justify-between gap-3 border-b border-border p-4">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-primary">Evidence Trace</div>
                    <h2 className="mt-1 text-base font-bold text-text-main">{evidenceSnapshot.projectName}</h2>
                    <p className="mt-1 text-xs text-text-muted">Technique roles, evidence status, and confidence context.</p>
                  </div>
                  <Button variant="ghost" size="sm" className="px-2" onClick={() => setIsEvidenceDrawerOpen(false)}>
                    <X size={16} />
                  </Button>
                </div>
                <div className="space-y-3 overflow-y-auto p-4">
                  {evidenceTraceItems.map((item) => (
                    <div key={`${item.technique}-${item.role}`} className="rounded-lg border border-border bg-background p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-bold text-text-main">{item.technique}</div>
                        <span className="rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-[10px] font-bold uppercase text-primary">
                          {item.status}
                        </span>
                      </div>
                      <p className="mt-2 text-xs font-semibold text-text-muted">{item.role}</p>
                      <p className="mt-1 text-xs text-text-main">{item.confidence}</p>
                    </div>
                  ))}
                  <div className="rounded-lg border border-border bg-background p-3">
                    <div className="text-xs font-semibold uppercase tracking-wider text-text-muted">Project-specific sources</div>
                    <div className="mt-2 space-y-2">
                      {evidenceSnapshot.evidenceEntries.map((source) => (
                        <div key={source.id} className="rounded-md border border-border bg-surface p-2">
                          <div className="text-xs font-bold text-text-main">{source.technique} - {source.datasetLabel}</div>
                          <p className="mt-1 text-[11px] leading-relaxed text-text-muted">{source.support}</p>
                        </div>
                      ))}
                      {evidenceSnapshot.pendingTechniques.map((technique) => (
                        <div key={`drawer-pending-${technique}`} className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2">
                          <div className="text-xs font-bold text-text-main">{technique} - Pending validation</div>
                          <p className="mt-1 text-[11px] leading-relaxed text-text-muted">Evidence required before closing the claim boundary.</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          <div className="hidden">
            <div>
            <section className="grid grid-cols-1 gap-2.5 lg:grid-cols-[minmax(0,0.95fr)_minmax(280px,0.85fr)_minmax(280px,0.95fr)]">
              <div className="min-w-0">
                <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-text-muted">Characterization Overview</div>
                {hasMatchedNotebookData ? (
                  <div className="max-h-[288px] overflow-y-auto rounded-xl">
                    <AIInsightPanel result={getProjectInsight(currentProject)} />
                  </div>
                ) : (
                  <Card className="p-4">
                    <div className="text-sm font-semibold text-text-main">Validation pending</div>
                    <p className="mt-2 text-sm leading-relaxed text-text-muted">
                      No matched processing result is linked to this project. Evidence and report discussion are not generated.
                    </p>
                  </Card>
                )}
              </div>
              <div className="min-w-0 rounded-xl border border-border bg-surface p-3">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wider text-text-muted">Experiment Conditions</div>
                    <div className="mt-1 text-sm font-bold text-text-main">{experimentConditionStatus}</div>
                    <p className="mt-1 text-xs leading-relaxed text-text-muted">
                      Locked conditions define reproducibility constraints before interpretation handoff.
                    </p>
                  </div>
                  <div className="rounded-md border border-border bg-background px-2.5 py-1.5 text-[11px] text-text-muted">
                    Locked at: {formatConditionLockTimestamp(experimentConditionLock)}
                  </div>
                </div>
                <div className="mt-2 space-y-1">
                  {experimentConditionLines.map((line) => (
                    <div key={line} className="rounded-md border border-border bg-background px-2 py-1 text-[11px] leading-relaxed text-text-muted">
                      {line}
                    </div>
                  ))}
                </div>
                <div className="mt-2 rounded-md border border-amber-500/20 bg-amber-500/5 p-1.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">Condition-aware claim boundary</div>
                  <ul className="mt-1 space-y-0.5 text-[11px] leading-relaxed text-text-muted">
                    {experimentConditionBoundaryNotes.slice(0, 3).map((note) => (
                      <li key={note}>- {note}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="min-w-0 rounded-xl border border-primary/20 bg-surface p-2.5">
                <div className="text-xs font-semibold uppercase tracking-wider text-primary">Refined Discussion / Report Preview</div>
                <div className="mt-2 rounded-md border border-border bg-background p-2.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                    {notebookTemplateDetails.primaryLabel}
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-text-main">
                    {hasMatchedNotebookData
                      ? snapshotDiscussionLine
                      : 'No matched processing result is linked to this notebook entry.'}
                  </p>
                </div>
                <div className="mt-2 rounded-md border border-border bg-background p-2.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Report section</div>
                  <p className="mt-2 text-xs leading-relaxed text-text-main">
                    {hasMatchedNotebookData
                      ? (hasUploadedEvidenceSnapshot ? getSnapshotEvidenceLine(evidenceSnapshot) : projectNotebookContent.reportPreview)
                      : 'No report-oriented section is available until a matched processing result is linked to this project.'}
                  </p>
                </div>
                <div className="mt-2 rounded-md border border-primary/20 bg-primary/5 p-1.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-primary">Discussion readiness</div>
                  <p className="mt-1 text-xs font-semibold text-text-main">
                    {displayNotebookStatus}: {hasMatchedNotebookData ? notebookTemplateDetails.output : 'Load compatible data before report-ready discussion.'}
                  </p>
                </div>
              </div>
            </section>

            {!hasMatchedNotebookData && (
              <section className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
                <div className="text-[11px] font-bold uppercase tracking-wider text-amber-700">Notebook status</div>
                <h3 className="mt-1 text-base font-bold text-text-main">No matched processing result</h3>
                <p className="mt-2 text-sm leading-relaxed text-text-muted">
                  This project does not yet have a matched deterministic XRD processing result. Notebook discussion, report preview, and export remain validation pending until compatible evidence is processed.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {['Requires dataset', 'No matched processing result', 'Evidence not generated'].map((badge) => (
                    <span key={badge} className="rounded-full border border-amber-500/30 bg-background px-3 py-1 text-xs font-semibold text-amber-700">
                      {badge}
                    </span>
                  ))}
                </div>
              </section>
            )}

            <details className="rounded-xl border border-border bg-surface">
              <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-text-main">
                <span>Template selector and workflow details</span>
                <span className="rounded-md border border-primary/20 bg-primary/5 px-2.5 py-1 text-[11px] text-primary">
                  Secondary record details
                </span>
              </summary>
              <div className="space-y-4 border-t border-border p-4">
              <details className="rounded-xl border border-border bg-surface">
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-text-main">
                  <span>Template mode</span>
                  <span className="rounded-md border border-primary/20 bg-primary/5 px-2.5 py-1 text-[11px] text-primary">
                    {notebookTemplate.label} - {notebookTemplateDetails.primaryLabel}
                  </span>
                </summary>
                <div className="border-t border-border p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h3 className="text-base font-bold text-text-main">Notebook Template Selector</h3>
                    <p className="mt-1 text-sm text-text-muted">
                      Choose the experiment mode for this notebook entry.
                    </p>
                  </div>
                  <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-right">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-primary">Report template</div>
                    <div className="mt-1 text-sm font-bold capitalize text-text-main">
                      {notebookTemplate.reportTemplate.replace('_', ' ')}
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-3">
                  {NOTEBOOK_TEMPLATE_MODES.map((mode) => {
                    const template = NOTEBOOK_TEMPLATES[mode];
                    const details = NOTEBOOK_TEMPLATE_DETAILS[mode];
                    const isSelected = templateMode === mode;

                    return (
                      <button
                        key={mode}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => setTemplateMode(mode)}
                        className={`rounded-lg border p-3 text-left transition-colors ${
                          isSelected
                            ? 'border-primary bg-primary/5 text-primary'
                            : 'border-border bg-background text-text-muted hover:border-primary/30 hover:text-text-main'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-sm font-bold text-text-main">{template.label}</div>
                          {isSelected && (
                            <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary">
                              Selected
                            </span>
                          )}
                        </div>
                        <p className="mt-2 text-xs leading-relaxed text-text-muted">{details.description}</p>
                        <div className="mt-3 rounded-md border border-border bg-surface px-2 py-1.5">
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Output</div>
                          <div className="mt-0.5 text-xs font-semibold text-text-main">{details.output}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4 rounded-lg border border-border bg-background p-3">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">Template micro-flow</div>
                      <div className="mt-1 text-sm font-semibold text-text-main">{notebookTemplateDetails.primaryLabel}</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-text-muted">
                      {workflowRefinement.microFlow.map((step, index) => (
                        <React.Fragment key={step}>
                          <span className="rounded-full border border-border bg-surface px-2.5 py-1">{step}</span>
                          {index < workflowRefinement.microFlow.length - 1 && <ArrowRight size={13} className="text-primary" />}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-1.5">
                  {notebookTemplate.stepperLabels.map((step) => (
                    <span key={step} className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-semibold text-text-muted">
                      {step}
                    </span>
                  ))}
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <div className="rounded-lg border border-border bg-background p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">Tabs</div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {notebookTemplate.tabs.map((tab) => (
                        <span key={tab} className="rounded-md border border-border bg-surface px-2 py-1 text-xs font-medium text-text-main">
                          {tab}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-background p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">Statuses</div>
                    <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                      {(hasMatchedNotebookData
                        ? workflowNotebookEntry.statusSummary
                        : [
                            { label: 'Notebook Status', value: 'Requires dataset' },
                            { label: 'Evidence Status', value: 'No matched processing result' },
                          ]).map((status) => (
                        <div key={status.label} className="rounded-md border border-border bg-surface px-2 py-1.5">
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">{status.label}</div>
                          <div className="text-xs font-bold text-text-main">{status.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                </div>
              </details>

              <div className="rounded-xl border border-primary/20 bg-surface p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-primary">
                      {notebookTemplateDetails.primaryLabel}
                    </div>
                    <p className="mt-1 text-sm font-medium text-text-muted">
                      Source workflow converted into a template-based scientific record
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-text-muted">
                    {workflowRefinement.microFlow.map((step, index) => (
                      <React.Fragment key={step}>
                        <span className="rounded-full border border-border bg-background px-2.5 py-1">{step}</span>
                        {index < workflowRefinement.microFlow.length - 1 && <ArrowRight size={13} className="text-primary" />}
                      </React.Fragment>
                    ))}
                  </div>
                </div>

                <div className="mt-3 rounded-lg border border-border bg-background p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                    {hasMatchedNotebookData ? primaryNotebookSection?.heading ?? notebookTemplateDetails.primaryLabel : 'No matched processing result'}
                  </div>
                  <div className="mt-2 space-y-2">
                    {(hasMatchedNotebookData
                      ? [snapshotDiscussionLine]
                      : ['This project does not have a matched processing result in the deterministic notebook workflow. Load compatible data before creating report-ready discussion.']).map((line) => (
                      <p key={line} className="text-sm leading-relaxed text-text-main">{line}</p>
                    ))}
                  </div>
                </div>

                <details className="mt-3 rounded-lg border border-border bg-background">
                  <summary className="cursor-pointer list-none px-3 py-2 text-xs font-semibold text-text-main">
                    Additional notebook sections
                  </summary>
                  <div className="grid grid-cols-1 gap-3 border-t border-border p-3 lg:grid-cols-2">
                    {(hasMatchedNotebookData ? supportingNotebookSections : [
                      {
                        heading: 'Validation Pending',
                        lines: ['No matched processing result is available for this project.', 'Evidence and report sections remain unavailable until compatible data is processed.'],
                      },
                    ]).map((section) => (
                      <div key={section.heading} className="rounded-lg border border-border bg-surface p-3">
                        <div className="text-xs font-bold text-text-main">{section.heading}</div>
                        <div className="mt-2 space-y-2">
                          {section.lines.map((line) => (
                            <p key={line} className="text-xs leading-relaxed text-text-muted">{line}</p>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              </div>

              <div className="rounded-xl border border-border bg-surface p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-text-muted">Report Section Preview</div>
                    <h3 className="mt-1 text-base font-bold text-text-main">
                      {hasMatchedNotebookData ? workflowReportSection.heading : 'No report section available'}
                    </h3>
                    <p className="mt-1 text-sm text-text-muted">{notebookTemplateDetails.reportPreview}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled
                    title="Report route is not enabled in this demo. Export-ready sections are generated from notebook entries."
                    className="gap-2"
                  >
                    <Download size={14} /> Export Report Section
                  </Button>
                </div>
                <div className="mt-3 rounded-lg border border-border bg-background p-3">
                  <p className="text-sm leading-relaxed text-text-main">
                    {hasMatchedNotebookData
                      ? (hasUploadedEvidenceSnapshot ? getSnapshotEvidenceLine(evidenceSnapshot) : projectNotebookContent.reportPreview)
                      : 'No report-oriented section is available until a matched processing result is linked to this project.'}
                  </p>
                </div>
                <p className="mt-2 text-xs text-text-muted">
                  Report route is not enabled in this demo. Export-ready sections are generated from notebook entries.
                </p>
              </div>
              </div>
            </details>

            <details className="rounded-xl border border-border bg-surface">
              <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-text-main">
                <span>Supplementary notebook record</span>
                <span className="rounded-md border border-border bg-background px-2.5 py-1 text-[11px] text-text-muted">
                  Supporting data, run log, exports, trace, and validation notes
                </span>
              </summary>
              <div className="space-y-4 border-t border-border p-4">
            <section className="space-y-4">
              <div className="rounded-xl border border-primary/20 bg-surface p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h3 className="text-base font-bold text-text-main">Source Workflow</h3>
                    <p className="mt-2 text-sm text-text-muted">Project: {currentProject.name}</p>
                    <p className="mt-1 text-sm text-text-main">
                  Demo notebook entry generated from the current interpretation context.
                    </p>
                  </div>
                  <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-right">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-primary">Discussion readiness</div>
                    <div className="mt-1 text-sm font-bold text-text-main">{displayNotebookStatus}</div>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {[
                    ['Mode', notebookTemplate.label],
                    ['Source workflow', 'XRD processing + interpretation refinement'],
                    ['Pipeline', 'Processing Result -> Interpretation Refinement -> Notebook Entry -> Report Section'],
                    ['Discussion readiness', displayNotebookStatus],
                    ['Report section', hasMatchedNotebookData ? workflowReportSection.heading : 'No report section available'],
                    ['Evidence status', hasMatchedNotebookData ? 'Requires validation' : 'No matched processing result'],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-md border border-border bg-background p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">{label}</div>
                      <div className="mt-1 text-sm font-semibold text-text-main">{value}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {notebookTemplateDetails.badges.map((badge) => (
                    <span key={badge} className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                      {badge}
                    </span>
                  ))}
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-text-muted border-b border-border pb-2">Skill-derived Scientific Evidence Sources</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {hasMatchedNotebookData ? projectNotebookContent.supportingData.map((item) => (
                  <div key={item.technique} className="rounded-lg border border-border bg-surface p-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-bold text-text-main">{item.technique}</span>
                      <span className={`text-xs font-semibold ${item.strength === 'Review' ? 'text-amber-600' : item.strength === 'Ready' ? 'text-primary' : 'text-cyan'}`}>
                        {item.strength}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-text-main">{item.evidence}</p>
                    <p className="mt-2 text-xs font-medium text-text-muted">Linked dataset: {item.dataset}</p>
                    <p className="mt-1 text-xs text-text-muted">{item.caveat}</p>
                  </div>
                )) : (
                  <div className="col-span-2 rounded-lg border border-dashed border-border bg-surface/50 p-4 text-center">
                    <p className="text-xs text-text-muted">No evidence sources linked yet. Process data in a workspace to generate evidence.</p>
                  </div>
                )}
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-text-muted border-b border-border pb-2">{notebookTemplateDetails.primaryLabel}</h3>
              <div className="rounded-lg border border-border bg-surface p-4">
                {(hasMatchedNotebookData
                  ? [snapshotDiscussionLine]
                  : ['No matched processing result is linked to this notebook entry. Evidence has not been generated for this project in the deterministic XRD demo workflow.']).map((line) => (
                  <p key={line} className="text-sm leading-relaxed text-text-main">{line}</p>
                ))}
                <div className="mt-4 rounded-md border border-primary/20 bg-primary/5 p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-primary">Discussion readiness</div>
                  <p className="mt-1 text-sm font-semibold text-text-main">
                    {displayNotebookStatus}: {hasMatchedNotebookData ? notebookTemplateDetails.output : 'Load compatible data before report-ready discussion.'}
                  </p>
                </div>
              </div>
            </section>

            <details className="space-y-3">
              <summary className="cursor-pointer list-none text-sm font-semibold uppercase tracking-wider text-text-muted border-b border-border pb-2 hover:text-text-main transition-colors">
                Parameter Provenance
              </summary>
              <div className="pt-3 space-y-3">
                {(() => {
                  const availableTechniques = (registryProject?.techniques.filter(t => t.available).map(t => t.id as TechniqueWorkspaceId) ?? []);
                  const parameterSummaries = availableTechniques.map(technique =>
                    getParameterProvenanceSummary(currentProject.id, technique)
                  ).filter(s => s.hasOverrides);

                  if (parameterSummaries.length === 0) {
                    return (
                      <div className="rounded-lg border border-border bg-surface p-4">
                        <p className="text-sm text-text-muted">Default processing parameters used for all techniques.</p>
                      </div>
                    );
                  }

                  return parameterSummaries.map(summary => (
                    <div key={summary.technique} className="rounded-lg border border-border bg-surface p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-bold text-text-main">{summary.techniqueLabel}</h4>
                        <span className="text-xs font-semibold text-primary">
                          {summary.overrideCount} parameter{summary.overrideCount !== 1 ? 's' : ''} modified
                        </span>
                      </div>
                      <div className="text-xs text-text-muted">
                        Last updated: {formatProvenanceTimestamp(summary.lastUpdatedAt)} by {formatProvenanceSource(summary.lastUpdatedBy)}
                      </div>
                      <div className="space-y-2">
                        {summary.changedParameters.map(param => (
                          <div key={param.id} className="rounded-md border border-border bg-background p-2.5">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1">
                                <div className="text-xs font-semibold text-text-main">{param.label}</div>
                                <div className="mt-1 flex items-center gap-2 text-xs text-text-muted">
                                  <span>Default: {formatParameterValueForDisplay(param.defaultValue)}{param.unit ? ` ${param.unit}` : ''}</span>
                                  <span className="text-primary">→</span>
                                  <span className="font-semibold text-text-main">Effective: {formatParameterValueForDisplay(param.effectiveValue)}{param.unit ? ` ${param.unit}` : ''}</span>
                                </div>
                              </div>
                              <span className="shrink-0 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                                {formatProvenanceSource(param.provenance.updatedBy)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </details>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-text-muted border-b border-border pb-2">Notebook Run Log</h3>
              <div className="rounded-lg border border-border bg-surface p-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {[
                    ...(hasMatchedNotebookData ? projectNotebookContent.runLog : [
                      ['Processing run', 'No matched processing result'],
                      ['Refinement', 'Not available'],
                      ['Dataset', 'No matched dataset'],
                      ['Workflow version', 'difaryx-analysis-v0.1'],
                    ]),
                    ['Template mode', notebookTemplate.label],
                    ['Discussion readiness', displayNotebookStatus],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-md border border-border bg-background p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">{label}</div>
                      <div className="mt-1 text-sm font-semibold text-text-main">{value}</div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-text-muted border-b border-border pb-2">Limitations and Follow-up Validation</h3>
              <div className="space-y-2">
                {(hasMatchedNotebookData
                  ? projectNotebookContent.validationNotes
                  : ['Load a matched processing result before notebook export.', 'Evidence review is not generated for this project yet.']).map((item, index) => (
                  <div key={item} className="flex items-start gap-3 rounded-md border border-border bg-surface p-3 text-sm text-text-muted">
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                      {index + 1}
                    </div>
                    {item}
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-text-muted">Report Exports</h3>
                <ConnectedAccountStatus
                  state={connectedAccountState}
                  capabilities={runtimeContext.sourceMode === 'google_drive_connected' ? ['drive_export_future', 'gmail_draft_future'] : ['storage_future']}
                  compact
                />
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Button
                  variant="outline"
                  disabled={!hasMatchedNotebookData}
                  title={!hasMatchedNotebookData ? 'Requires matched processing result before export.' : undefined}
                  className="gap-2"
                  onClick={() => exportNotebook('md')}
                >
                  <Download size={14} /> Export Markdown
                </Button>
                <Button
                  variant="outline"
                  disabled={!hasMatchedNotebookData}
                  title={!hasMatchedNotebookData ? 'Requires matched processing result before export.' : undefined}
                  className="gap-2"
                  onClick={() => exportNotebook('png')}
                >
                  <Download size={14} /> Export PNG Snapshot
                </Button>
                {(['pdf', 'docx', 'csv'] as DemoExportFormat[]).map((format) => (
                  <Button key={format} variant="outline" disabled title="Available in the connected beta workflow." className="gap-2 text-slate-400 cursor-not-allowed">
                    <Download size={14} /> {format.toUpperCase()} - Connected beta workflow
                  </Button>
                ))}
                <Button variant="outline" className="gap-2" onClick={copyAgentSummary}>
                  <Share2 size={14} /> Copy Summary
                </Button>
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-text-muted border-b border-border pb-2">Summary</h3>
              <p className="text-sm text-text-main leading-relaxed">
                {hasMatchedNotebookData ? getSnapshotEvidenceLine(evidenceSnapshot) : 'No matched processing result is linked to this notebook entry.'}
              </p>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-text-muted border-b border-border pb-2">Report-ready Discussion</h3>
              <div className="bg-surface p-4 rounded-md border border-border">
                <div className="text-sm leading-relaxed text-text-main">
                  {hasMatchedNotebookData
                    ? (hasUploadedEvidenceSnapshot ? getSnapshotEvidenceLine(evidenceSnapshot) : projectNotebookContent.reportPreview)
                    : 'Report-ready discussion is unavailable until a matched processing result is linked to this project.'}
                </div>
                <div className="mt-3 flex items-center justify-between gap-4">
                  <div className="text-xs text-text-muted">
                    Short conclusion: {hasMatchedNotebookData ? 'Supported assignment with validation boundaries.' : 'No matched processing result.'}
                  </div>
                  <div className={`text-sm font-bold ${
                    notebook.claimStatus === 'strongly_supported' ? 'text-emerald-600' :
                    notebook.claimStatus === 'supported' ? 'text-cyan' :
                    notebook.claimStatus === 'partial' ? 'text-amber-500' :
                    'text-text-muted'
                  }`}>{hasMatchedNotebookData ? formatClaimStatus(notebook.claimStatus) : 'Requires dataset'}</div>
                </div>
              </div>
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-900">
                {hasMatchedNotebookData
                  ? 'XRD provides bulk-averaged structural evidence. Surface-sensitive and phase-purity claims remain validation-limited.'
                  : 'Notebook status: Requires dataset. Evidence not generated.'}
              </div>
            </section>

            {workspaceRun && (
              <section className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-text-muted border-b border-border pb-2">Workspace Data</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="bg-surface p-4 rounded-md border border-border">
                    <div className="text-xs text-text-muted mb-1">Dataset</div>
                    <div className="text-sm font-semibold text-text-main">{workspaceDataset?.fileName ?? workspaceRun.datasetId}</div>
                    <div className="text-xs text-text-muted mt-1">{workspaceDataset?.metadata.sampleName}</div>
                  </div>
                  <div className="bg-surface p-4 rounded-md border border-border">
                    <div className="text-xs text-text-muted mb-1">Technique</div>
                    <div className="text-sm font-semibold text-text-main">{workspaceRun.technique}</div>
                    <div className="text-xs text-text-muted mt-1">{new Date(workspaceRun.timestamp).toLocaleString()}</div>
                  </div>
                  <div className="bg-surface p-4 rounded-md border border-border sm:col-span-2">
                    <div className="text-xs text-text-muted mb-2">Processing Parameters</div>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(workspaceRun.parameters).map(([key, value]) => (
                        <span key={key} className="rounded-md border border-border bg-background px-2 py-1 text-xs text-text-muted">
                          {key}: {String(value)}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            )}

            {(observations.length > 0 || attachedRun) && (
              <section className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-text-muted border-b border-border pb-2">Notebook Additions</h3>
                {attachedRun && (
                  <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-sm text-text-muted">
                    <div className="font-semibold text-text-main">
                      Linked data: {attachedRunRecord?.technique ?? 'Workspace'} analysis
                    </div>
                    <div className="mt-1">
                      {attachedRunRecord
                        ? `${new Date(attachedRunRecord.timestamp).toLocaleString()} - ${attachedRunRecord.detectedFeatures.length} features - ${formatClaimStatus(attachedRunRecord.matchResult?.claimStatus || 'supported')}`
                        : attachedRun}
                    </div>
                  </div>
                )}
                {observations.map((observation) => (
                  <div key={observation} className="rounded-md border border-border bg-surface p-3 text-sm text-text-muted">
                    {observation}
                  </div>
                ))}
              </section>
            )}

            <section className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-text-muted border-b border-border pb-2">
                <span className="flex items-center gap-2"><FlaskConical size={14} /> Technical Trace</span>
              </h3>
              <p className="text-xs text-text-muted mb-2">Internal processing steps retained for reproducibility.</p>
              <div className="bg-surface p-4 rounded-md border border-border text-sm font-mono text-text-dim space-y-2">
                {technicalTrace.map((step, i) => (
                  <p key={step}>{i + 1}. {sanitizeTraceStep(step)}</p>
                ))}
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-text-muted border-b border-border pb-2">
                <span className="flex items-center gap-2"><BarChart3 size={14} /> Peak Detection Results</span>
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-surface p-4 rounded-md border border-border">
                  <div className="text-xs text-text-muted mb-1">Peaks Detected</div>
                  <div className="text-2xl font-bold text-primary">
                    {hasMatchedNotebookData ? workspaceRun?.detectedFeatures.length ?? currentProject.xrdPeaks.length : 0}
                  </div>
                </div>
                <div className="bg-surface p-4 rounded-md border border-border">
                  <div className="text-xs text-text-muted mb-1">Peak Positions</div>
                  <div className="text-sm font-mono text-text-main">
                    {hasMatchedNotebookData
                      ? (workspaceRun?.detectedFeatures ?? currentProject.xrdPeaks).map((peak) => `${peak.position.toFixed(1)} ${workspaceRun && workspaceRun.technique !== 'XRD' ? '' : 'deg'}`).join(', ')
                      : 'No matched dataset'}
                  </div>
                </div>
              </div>
              <p className="text-sm text-text-muted">
                {hasMatchedNotebookData ? projectNotebookContent.peakDetection : 'No peak detection display is available until compatible evidence is processed.'}
              </p>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-text-muted border-b border-border pb-2">
                <span className="flex items-center gap-2"><Target size={14} /> Phase Identification</span>
              </h3>
              <div className="bg-surface p-4 rounded-md border border-border flex items-center justify-between">
                <div>
                  <div className="text-lg font-bold">{hasMatchedNotebookData ? projectNotebookContent.phaseLabel : currentProject.name}</div>
                  <div className="text-xs text-text-muted mt-1">
                    {hasMatchedNotebookData
                      ? notebook.phaseInterpretation
                      : 'No matched processing result for this project.'}
                  </div>
                </div>
                <div className={`text-sm font-bold ${
                  notebook.claimStatus === 'strongly_supported' ? 'text-emerald-600' :
                  notebook.claimStatus === 'supported' ? 'text-cyan' :
                  notebook.claimStatus === 'partial' ? 'text-amber-500' :
                  'text-text-muted'
                }`}>{confidenceLabel}</div>
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-text-muted border-b border-border pb-2">Key Evidence</h3>
              <div className="space-y-2">
                {keyEvidenceItems.map((item, i) => (
                  <div key={item} className="flex items-start gap-3 rounded-md border border-border bg-surface p-3 text-sm text-text-muted">
                    <div className="h-5 w-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold shrink-0">
                      {i + 1}
                    </div>
                    {item}
                  </div>
                ))}
              </div>
            </section>

            <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Link to={withDemoMode(workspaceRun ? getWorkspaceRoute(currentProject, workspaceRun.technique, workspaceRun.datasetId) : getWorkspaceRoute(currentProject))} className="rounded-md border border-border bg-surface p-3 text-sm font-semibold text-text-main hover:border-primary/40 transition-colors">
                {workspaceRun ? `Open ${workspaceRun.technique} Analysis` : 'Open Workspace'} <ArrowRight size={14} className="inline ml-1" />
              </Link>
              <Link
                to={withDemoMode(hasMatchedNotebookData ? getAgentPath(currentProject) : getWorkspaceRoute(currentProject))}
                className="rounded-md border border-cyan/40 bg-surface p-3 text-sm font-semibold text-cyan hover:bg-cyan/10 transition-colors"
              >
                {hasMatchedNotebookData ? 'Open Refinement' : 'Open Workspace'} <ArrowRight size={14} className="inline ml-1" />
              </Link>
              <button
                onClick={() => exportNotebook('md')}
                disabled={!hasMatchedNotebookData}
                title={!hasMatchedNotebookData ? 'Requires matched processing result before export.' : undefined}
                className="rounded-md border border-border bg-surface p-3 text-left text-sm font-semibold text-text-main hover:bg-surface-hover transition-colors"
              >
                <FileText size={14} className="inline mr-1" /> Export Markdown
              </button>
            </section>
              </div>
            </details>
          </div>
            </div>
            </>
          )}
        </div>

        <div className="hidden">
          <div className="p-6">
            <div className="mb-4 text-xs font-semibold text-text-muted uppercase tracking-wider">Characterization Overview</div>
            {hasMatchedNotebookData ? (
              <AIInsightPanel result={getProjectInsight(currentProject)} />
            ) : (
              <Card className="p-4">
                <div className="text-sm font-semibold text-text-main">Validation pending</div>
                <p className="mt-2 text-sm leading-relaxed text-text-muted">
                  No matched processing result is linked to this project. Evidence and report discussion are not generated.
                </p>
              </Card>
            )}
          </div>
        </div>
      </div>
      <ExperimentModal
        open={experimentModalOpen}
        defaultProjectId={currentProject.id}
        onClose={() => setExperimentModalOpen(false)}
        onCreated={() => {
          setLocalExperiments(getLocalExperiments());
          showFeedback('Experiment, dataset, and condition record added');
        }}
      />
      <ApprovalActionDialog
        action={approvalAction}
        onClose={() => setApprovalAction(null)}
        onContinueLocal={() => {
          setApprovalAction(null);
          showFeedback('Local notebook preview retained. No external action executed.');
        }}
      />
    </DashboardLayout>
  );
}
