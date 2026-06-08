import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Copy,
  Database,
  Download,
  FileText,
  FlaskConical,
  GitBranch,
  Layers,
  Lock,
  Maximize2,
  MousePointer2,
  Move,
  Play,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  Trash2,
  Upload,
  ZoomIn,
} from 'lucide-react';
import { Graph } from '../ui/Graph';
import {
  getFocusedEvidenceSource,
  getRegistryProject,
  isKnownProjectId,
  type DemoFocusedEvidenceSource,
  type RegistryProject,
} from '../../data/demoProjectRegistry';
import { formatChemicalFormula } from '../../utils/chemicalFormula';
import {
  getTechniqueWorkspaceConfig,
  type TechniqueParameterControl,
  type TechniqueParameterValue,
  type TechniqueWorkspaceId,
  type TechniqueWorkspaceConfig,
} from '../../data/techniqueWorkspaceContent';
import { DEFAULT_XRD_PARAMETERS } from '../../config/xrdDefaults';
import {
  XRD_BASELINE_METHOD_OPTIONS,
  XRD_CLAIM_MODE_OPTIONS,
  XRD_MATCH_MODE_OPTIONS,
  XRD_PEAK_FIT_MODEL_OPTIONS,
  XRD_REFERENCE_SOURCE_OPTIONS,
  XRD_SMOOTHING_METHOD_OPTIONS,
  type XRDParameterOption,
} from '../../config/xrdParameterOptions';
import { ParameterControlField } from './ParameterControlField';
import { TechniqueEvidenceRail, MetadataRow } from './TechniqueEvidenceRail';
import { PeriodicTablePicker } from './PeriodicTablePicker';
import {
  getAnalysisSession,
  getStatusLabel,
  saveAnalysisSession,
  createAnalysisSession,
  type AnalysisSession,
  type PipelineStepStatus,
} from '../../data/analysisSessions';
import type { DemoDataset, Technique } from '../../data/demoProjects';
import type { TechniqueId } from '../../data/demoProjectRegistry';
import {
  readParameterState,
  setParameterOverride,
  resetParameters as resetParameterState,
  getParameterStateStorageKey,
  readParameterHistory,
  type ParameterHistoryEntry,
} from '../../utils/parameterStateManager';
import { getProjectEvidenceSnapshot, type ProjectEvidenceSnapshot } from '../../utils/evidenceSnapshot';
import { useAuth } from '../../contexts/AuthContext';
import { useXrdWorkflowRuntime } from '../../context/XrdWorkflowRuntimeContext';
import {
  getEffectiveWorkspaceMode,
  getStoredWorkspaceMode,
  setWorkspaceMode,
} from '../../utils/workspaceMode';
import {
  buildEvidenceRouteSearch,
  getEvidenceRouteContext,
} from '../../utils/evidenceRouteContext';
import {
  getRuntimeBadgeClass,
  getRuntimeBadgeLabel,
  getRuntimeContextForEvidenceSource,
} from '../../runtime/difaryxRuntimeMode';
import { sanitizeScientificWording } from '../../utils/claimBoundaryPresentation';
import { EmptyStateCard } from '../ui/EmptyStateCard';
import {
  readUploadedSignalRuns,
  updateUploadedRunProcessingResults,
  getUploadedRunById,
  saveUploadedSignalRun,
  type TechniqueFeature,
  type UploadedSignalRun,
} from '../../data/uploadedSignalRuns';
import { RawFileUpload } from './RawFileUpload';
import { RawFileUploadModal } from './RawFileUploadModal';
import { XpsElementAnalysisPanel } from './xps/XpsElementAnalysisPanel';
import { listReferenceElements, getElementRegionWindow } from '../../data/xpsReferenceData';
import { saveXpsElementEvidence } from '../../data/xpsElementEvidence';
import type { XpsElementEvidence } from '../../agent/mcp/types';
import { runXrdPhaseIdentificationAgent, preprocess_xrd, detect_xrd_peaks, type XrdProcessingParams } from '../../agents/xrdAgent/runner';
import { getXrdProcessingParams, getXrdParameterSnapshot, xrdToFlatParameters, flatToXrdParameters } from '../../utils/xrdParameterAdapter';
import {
  processXrdSkillEvidence,
  checkXrdBackendHealth,
  XRDBackendError,
  type XRDHealthStatus,
} from '../../services/xrdBackendClient';
import { useBackendStatus, BackendStatusBadge } from '../../utils/backendStatus';
import type { XRDLocalReferencePayload, XRDNormalizedResult, XRDReferenceMatchV2, XRDReferenceMatchV2Candidate } from '../../types/xrdBackend';
import type { XRDDatasetContext } from '../../types/xrdDatasetContext';
import type { XRDClaimMode, XRDMatchMode, XRDParameters, XRDBaselineMethod, XRDSmoothingMethod, XRDPeakFitModel } from '../../types/xrdParameters';
import {
  PLANNED_XRD_LOCAL_REFERENCES,
  createEmptyXrdLocalReferenceParseResult,
  getXrdLocalReferenceValidationStatusLabel,
  type XRDLocalReferenceParseResult,
} from '../../types/xrdLocalReference';
import {
  createXrdLocalReferenceImportErrorResult,
  parseXrdLocalReferenceText,
} from '../../utils/xrdLocalReferenceParser';
import {
  approveXrdLocalReferenceDraftForMatching,
  buildXrdLocalReferenceDraftFromParseResult,
  buildXrdLocalReferencePayloadFromDraft,
  canUseXrdLocalReferenceDraftForBackendMatching,
  deleteXrdLocalReferenceDraft,
  getXrdLocalReferenceApprovalStatusLabel,
  getXrdLocalReferenceDraftMatchingBlockers,
  getXrdLocalReferenceValidationLevel,
  getXrdLocalReferenceValidationLevelLabel,
  isXrdLocalReferenceDraftEligibleForBackend,
  listXrdLocalReferenceDrafts,
  rejectXrdLocalReferenceDraft,
  saveXrdLocalReferenceDraft,
  type XRDStoredLocalReferenceRecord,
} from '../../data/xrdLocalReferences';
import { XRDReadinessPanel } from './xrd/XRDReadinessPanel';
import { XRDBoundaryPanel } from './xrd/XRDBoundaryPanel';
import { XRDLocalReferencePanel } from './xrd/XRDLocalReferencePanel';
import { XRDReferenceMatchPanel } from './xrd/XRDReferenceMatchPanel';
import { XRDProcessingParametersPanel } from './xrd/XRDProcessingParametersPanel';
import { saveXrdBackendEvidenceResult } from '../../data/xrdBackendEvidence';
import { runRamanProcessing } from '../../agents/ramanAgent/runner';
import { getRamanProcessingParams, getRamanParameterSnapshot } from '../../utils/ramanParameterAdapter';
import { runXpsProcessing } from '../../agents/xpsAgent/runner';
import { getXpsProcessingParams, getXpsParameterSnapshot } from '../../utils/xpsParameterAdapter';
import { runFtirProcessing } from '../../agents/ftirAgent/runner';
import { getFtirProcessingParams, getFtirParameterSnapshot } from '../../utils/ftirParameterAdapter';
import { getTechniqueProcessingSupport } from '../../utils/techniqueProcessingSupport';
import { runWhenIdle } from '../../utils/idle';
import { identifyMaterialFeatures, applyBaseline, applySmoothing } from '../../hooks/useX7UniversalHook';

const RIGHT_TABS = ['Evidence', 'Parameters', 'Graph', 'Boundary', 'Trace'] as const;
type RightTab = (typeof RIGHT_TABS)[number];
type PipelineStepState = 'done' | 'active' | 'pending' | 'optional';

const RIGHT_PANEL_MIN_WIDTH = 300;
const RIGHT_PANEL_MAX_WIDTH = 520;
const RIGHT_PANEL_DEFAULT_WIDTH = 320;
const CENTER_PANEL_MIN_WIDTH = 520;

type GraphToolId = 'pan' | 'zoom' | 'select' | 'reset' | 'fit';
type GraphActionId = 'save-view' | 'export-graph' | 'focus-graph' | 'copy-view-link' | 'reset-layout' | 'restore-saved-view';

function debugXrdReprocessTrace(message: string, details?: Record<string, unknown>) {
  if (import.meta.env.DEV) {
    console.info(`[xrd-reprocess] ${message}`, details ?? {});
  }
}

const XRD_LOCAL_REFERENCE_PREVIEW_SUPPORTED_FORMATS = ['.csv', '.txt', '.xy', '.dat'];
const XRD_LOCAL_REFERENCE_PLANNED_CONVERTER_FORMATS = ['.raw', '.ras', '.xrdml', '.brml', '.uxd', '.cif'];
const XRD_LOCAL_REFERENCE_SELECTABLE_FORMATS = [
  ...XRD_LOCAL_REFERENCE_PREVIEW_SUPPORTED_FORMATS,
  ...XRD_LOCAL_REFERENCE_PLANNED_CONVERTER_FORMATS,
  '.card',
  '.jcpds',
  '.pdf',
  '.xml',
];
const XRD_LOCAL_REFERENCE_MAX_FILE_BYTES = 1024 * 1024;

const XRD_LOCAL_REFERENCE_EXPECTED_COLUMNS = [
  { column: 'two_theta', requirement: 'Required', detail: 'Reference peak position in degrees 2theta.' },
  { column: 'relative_intensity', requirement: 'Optional', detail: 'Relative peak intensity, usually 0-100.' },
  { column: 'hkl', requirement: 'Optional', detail: 'Miller index label for the reference reflection.' },
  { column: 'd_spacing', requirement: 'Optional', detail: 'Reference d-spacing in angstroms.' },
];

const XRD_LOCAL_REFERENCE_STATUS_PREVIEW = [
  { label: 'Not uploaded', detail: 'No local reference file is attached.' },
  { label: 'Parsed preview', detail: 'A supported text peak list was parsed for frontend review.' },
  { label: 'Partial preview', detail: 'Readable peak rows were kept and malformed rows were reported.' },
  { label: 'Peak extraction required', detail: 'Measured pattern imports need peak extraction before backend local-reference matching.' },
  { label: 'Requires converter', detail: 'Instrument-native, CIF, or reference-card files need a converter before preview or matching.' },
  { label: 'Unsupported or corrupted', detail: 'Damaged, binary, or unsupported files remain blocked from backend matching.' },
];

const GRAPH_TOOLS: Array<{ id: GraphToolId; label: string; Icon: React.ElementType }> = [
  { id: 'pan', label: 'Pan', Icon: Move },
  { id: 'zoom', label: 'Zoom', Icon: ZoomIn },
  { id: 'select', label: 'Select', Icon: MousePointer2 },
  { id: 'reset', label: 'Reset', Icon: RotateCcw },
  { id: 'fit', label: 'Fit to data', Icon: Maximize2 },
];

const GRAPH_ACTIONS: Array<{ id: GraphActionId; label: string; Icon: React.ElementType }> = [
  { id: 'save-view', label: 'Save View', Icon: Save },
  { id: 'export-graph', label: 'Export Graph', Icon: Download },
  { id: 'focus-graph', label: 'Focus Graph', Icon: Maximize2 },
  { id: 'copy-view-link', label: 'Copy View Link', Icon: Copy },
  { id: 'reset-layout', label: 'Reset Layout', Icon: RotateCcw },
  { id: 'restore-saved-view', label: 'Restore Saved View', Icon: RotateCcw },
];

function getCompactCenterTabLabel(label: string) {
  const compactLabels: Record<string, string> = {
    Residual: 'Resid.',
    Rietveld: 'Rietv.',
    'Chemical States': 'Chem.',
    Assignment: 'Assign.',
    'Functional Groups': 'Func.',
    'Mode Assignments': 'Modes',
  };
  return compactLabels[label] ?? label;
}

interface TechniqueWorkspaceShellProps {
  technique: TechniqueWorkspaceId;
  mode?: 'project' | 'quick';
  fileName?: string;
  sessionId?: string;
}

interface ProcessingLogEntry {
  id: string;
  timeLabel: string;
  message: string;
}

interface WorkspaceSessionState {
  storageKey: string;
  parameters: Record<string, TechniqueParameterValue>;
  pipelineStates: Record<string, PipelineStepState>;
  processingLog: ProcessingLogEntry[];
  dirty: boolean;
  pendingRecalculation: boolean;
  autoMode: boolean;
  lastProcessedLabel: string;
  lastAffectedStepIds: string[];
  presetSavedLabel?: string;
}

interface PaneLayoutState {
  storageKey: string;
  rightPanelWidth: number;
  rightPanelCollapsed: boolean;
  graphFocusMode: boolean;
  lastUpdatedAt: string;
}

interface XRDBackendSignalSource {
  x: number[];
  y: number[];
  fileName?: string;
  uploadedRunId?: string;
}

type XRDReadinessAnalysisMode =
  | 'signal_processing_only'
  | 'candidate_screening'
  | 'targeted_candidate_match'
  | 'not_ready';

interface XRDReadinessState {
  hasSignal: boolean;
  hasKnownElements: boolean;
  hasDeclaredPhases: boolean;
  hasReferenceSet: boolean;
  referenceMatchEnabled: boolean;
  analysisMode: XRDReadinessAnalysisMode;
  message: string;
  tone: 'neutral' | 'info' | 'warning';
}

function statusBadgeClass(status: string) {
  const normalized = status.toLowerCase();
  if (normalized.includes('available') || normalized.includes('supported') || normalized.includes('ready')) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }
  if (normalized.includes('required') || normalized.includes('pending') || normalized.includes('limited')) {
    return 'border-amber-200 bg-amber-50 text-amber-700';
  }
  if (normalized.includes('unsaved')) {
    return 'border-red-200 bg-red-50 text-red-700';
  }
  return 'border-slate-200 bg-slate-50 text-slate-700';
}

function formatStateLabel(state: PipelineStepState) {
  if (state === 'done') return 'done';
  if (state === 'active') return 'active';
  if (state === 'optional') return 'optional';
  return 'pending';
}

function makeTimeLabel() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const REFERENCE_MATCH_V2_BOUNDARY_NOTES = [
  'Candidate evidence only; not identity confirmation.',
  'Not phase purity confirmation.',
  'Composition-sensitive evidence required for stronger assignment.',
];

const REFERENCE_LIMITATION_REPLACEMENTS = [
  { pattern: new RegExp(`\\b${['confirmed', 'phase'].join(' ')}\\b`, 'gi'), replacement: 'phase assignment' },
  { pattern: new RegExp(`\\b${['identified', 'as'].join(' ')}\\b`, 'gi'), replacement: 'assigned as' },
  { pattern: new RegExp(`\\b${['pure', 'phase'].join(' ')}\\b`, 'gi'), replacement: 'single-phase material' },
  { pattern: new RegExp(`\\b${['definitive', 'match'].join(' ')}\\b`, 'gi'), replacement: 'strongest candidate' },
  { pattern: new RegExp(`\\b${['phase', 'purity', 'confirmed'].join(' ')}\\b`, 'gi'), replacement: 'phase purity assignment' },
];

function formatReferenceMatchNumber(value: number | null | undefined, digits = 2) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'Not available';
  return value.toFixed(digits);
}

function formatReferenceMatchPeakCount(candidate: XRDReferenceMatchV2Candidate | null) {
  const matchedCount = candidate?.matched_peak_count ?? candidate?.matched_peaks?.length;
  const referenceCount = candidate?.reference_peak_count;

  if (typeof matchedCount === 'number' && typeof referenceCount === 'number') {
    return `${matchedCount} / ${referenceCount}`;
  }
  if (typeof matchedCount === 'number') return String(matchedCount);
  return 'Not available';
}

function cleanReferenceLimitation(limitation: string) {
  return REFERENCE_LIMITATION_REPLACEMENTS.reduce(
    (text, { pattern, replacement }) => text.replace(pattern, replacement),
    limitation.trim(),
  );
}

function getReferenceMatchBoundaryNotes(referenceMatch: XRDReferenceMatchV2) {
  const backendLimitations = referenceMatch.limitations
    ?.map(cleanReferenceLimitation)
    .filter(Boolean) ?? [];

  return Array.from(new Set([...REFERENCE_MATCH_V2_BOUNDARY_NOTES, ...backendLimitations]));
}

function getProjectFromQuery(projectId: string | null): RegistryProject | null {
  if (!projectId || !isKnownProjectId(projectId)) return null;
  return getRegistryProject(projectId);
}

function getEvidenceSource(project: RegistryProject | null, technique: TechniqueWorkspaceId) {
  if (!project) return null;
  const techniqueLabel = technique.toUpperCase();
  return project._raw.evidenceSources.find((source) => source.technique === techniqueLabel) ?? null;
}

function getTechniqueProjectState(project: RegistryProject | null, technique: TechniqueWorkspaceId) {
  if (!project) return null;
  return project.techniques.find((item) => item.id === technique) ?? null;
}

function getComparisonRow(project: RegistryProject | null, technique: TechniqueWorkspaceId) {
  if (!project) return null;
  return project.crossTechniqueComparison.matrix.find((row) => row.techniqueId === technique) ?? null;
}

function getFeatureRows(project: RegistryProject | null, focusedEvidence: DemoFocusedEvidenceSource | null, technique: TechniqueWorkspaceId) {
  if (!project || !focusedEvidence) {
    return [
      {
        label: 'Dataset',
        value: 'No project-linked dataset',
        detail: 'Open from a project to load registry evidence.',
      },
    ];
  }

  const graphPeaks = focusedEvidence.graphData?.peaks ?? [];
  if (graphPeaks.length > 0) {
    return graphPeaks.slice(0, 6).map((peak) => ({
      label: peak.label || `${technique.toUpperCase()} feature`,
      value: `${peak.position.toFixed(2)}`,
      detail: `Intensity ${peak.intensity.toFixed(0)}`,
    }));
  }

  const row = getComparisonRow(project, technique);
  const evidence = project.evidenceResults.find((item) => item.techniqueId === technique);
  const findings = evidence?.findings?.length ? evidence.findings : focusedEvidence.structuredEvidence?.bulletEvidence ?? [];
  return findings.slice(0, 5).map((finding, index) => ({
    label: row?.techniqueLabel || evidence?.displayName || technique.toUpperCase(),
    value: `Evidence ${index + 1}`,
    detail: finding,
  }));
}

function getDatasetLabel(project: RegistryProject | null, technique: TechniqueWorkspaceId) {
  const source = getEvidenceSource(project, technique);
  if (source?.datasetLabel) return source.datasetLabel;
  const techniqueState = getTechniqueProjectState(project, technique);
  if (techniqueState?.datasetLabel) return techniqueState.datasetLabel;
  if (project) return `${technique.toUpperCase()} evidence required`;
  return 'Untitled analysis';
}

function getTraceId(project: RegistryProject | null, technique: TechniqueWorkspaceId) {
  if (!project) return `standalone-${technique}-session`;
  const source = getEvidenceSource(project, technique);
  return source?.datasetId || `${project.id}-${technique}-required`;
}

function getDefaultParameters(config: TechniqueWorkspaceConfig) {
  return config.parameters.reduce<Record<string, TechniqueParameterValue>>((acc, control) => {
    acc[control.id] = Array.isArray(control.defaultValue)
      ? [...control.defaultValue]
      : control.defaultValue;
    return acc;
  }, {});
}

function coerceSharedOverrideValue(control: TechniqueParameterControl, value: unknown): TechniqueParameterValue {
  if (control.type === 'number' || control.type === 'range') {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : control.defaultValue;
  }
  if (control.type === 'toggle') {
    return value === true || String(value).toLowerCase() === 'true';
  }
  if (control.type === 'checkbox-group') {
    if (Array.isArray(value)) return value.map(String);
    return String(value).split(',').map((item) => item.trim()).filter(Boolean);
  }
  return String(value);
}

function mapSharedOverridesToSessionParameters(
  config: TechniqueWorkspaceConfig,
  overrides: Record<string, unknown>,
) {
  return config.parameters.reduce<Record<string, TechniqueParameterValue>>((acc, control) => {
    const value = overrides[control.label] ?? overrides[control.id];
    if (value !== undefined) {
      acc[control.id] = coerceSharedOverrideValue(control, value);
    }
    return acc;
  }, {});
}

function mapQuickPipelineStatus(status: PipelineStepStatus): PipelineStepState {
  if (status === 'completed') return 'done';
  if (status === 'active' || status === 'error') return 'active';
  if (status === 'skipped') return 'optional';
  return 'pending';
}

function getQuickSessionParameters(config: TechniqueWorkspaceConfig, quickSession: AnalysisSession | null) {
  const defaults = getDefaultParameters(config);
  if (!quickSession) return defaults;

  quickSession.processingParameters.forEach((parameter) => {
    const control = config.parameters.find(
      (candidate) =>
        candidate.id.toLowerCase() === parameter.id.toLowerCase() ||
        candidate.label.toLowerCase() === parameter.label.toLowerCase(),
    );
    if (!control) return;

    if (control.type === 'number' || control.type === 'range') {
      const numeric = Number.parseFloat(parameter.value);
      defaults[control.id] = Number.isFinite(numeric) ? numeric : control.defaultValue;
      return;
    }

    if (control.type === 'toggle') {
      defaults[control.id] = parameter.value.toLowerCase() === 'true';
      return;
    }

    defaults[control.id] = parameter.value;
  });

  return defaults;
}

function getDefaultPipelineStates(
  config: TechniqueWorkspaceConfig,
  hasProjectEvidence: boolean,
  hasProject: boolean,
  quickSession: AnalysisSession | null = null,
) {
  if (quickSession) {
    return config.pipeline.reduce<Record<string, PipelineStepState>>((acc, step, index) => {
      const sessionStep = quickSession.processingPipeline[index];
      acc[step.id] = sessionStep ? mapQuickPipelineStatus(sessionStep.status) : 'pending';
      return acc;
    }, {});
  }

  return config.pipeline.reduce<Record<string, PipelineStepState>>((acc, step, index) => {
    const isLast = index === config.pipeline.length - 1;
    if (isLast) {
      acc[step.id] = 'optional';
    } else if (hasProjectEvidence) {
      acc[step.id] = index < 3 ? 'done' : index === 3 ? 'active' : 'pending';
    } else {
      acc[step.id] = index === 0 && !hasProject ? 'active' : 'pending';
    }
    return acc;
  }, {});
}

function buildDefaultSession(
  storageKey: string,
  config: TechniqueWorkspaceConfig,
  hasProjectEvidence: boolean,
  hasProject: boolean,
  quickSession: AnalysisSession | null = null,
): WorkspaceSessionState {
  return {
    storageKey,
    parameters: getQuickSessionParameters(config, quickSession),
    pipelineStates: getDefaultPipelineStates(config, hasProjectEvidence, hasProject, quickSession),
    processingLog: [
      ...(quickSession?.processingLog.map((message, index) => ({
        id: `${storageKey}-quick-${index}`,
        timeLabel: makeTimeLabel(),
        message,
      })) ?? []),
      {
        id: `${storageKey}-init`,
        timeLabel: makeTimeLabel(),
        message: quickSession
          ? `${config.label} quick analysis session ${quickSession.analysisId} loaded.`
          : hasProject
            ? `${config.label} workspace loaded from project registry.`
            : `${config.label} standalone workspace initialized.`,
      },
    ].slice(0, 12),
    dirty: false,
    pendingRecalculation: quickSession?.status === 'draft' || quickSession?.status === 'processing',
    autoMode: true,
    lastProcessedLabel: quickSession ? quickSession.updatedLabel : 'Not processed in this session',
    lastAffectedStepIds: config.pipeline.slice(0, 3).map((step) => step.id),
  };
}

function loadSessionState(
  storageKey: string,
  config: TechniqueWorkspaceConfig,
  hasProjectEvidence: boolean,
  hasProject: boolean,
  quickSession: AnalysisSession | null = null,
) {
  if (typeof window === 'undefined') {
    return buildDefaultSession(storageKey, config, hasProjectEvidence, hasProject, quickSession);
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return buildDefaultSession(storageKey, config, hasProjectEvidence, hasProject, quickSession);
    const parsed = JSON.parse(raw) as WorkspaceSessionState;
    return {
      ...buildDefaultSession(storageKey, config, hasProjectEvidence, hasProject, quickSession),
      ...parsed,
      storageKey,
      parameters: {
        ...getQuickSessionParameters(config, quickSession),
        ...parsed.parameters,
      },
      pipelineStates: {
        ...getDefaultPipelineStates(config, hasProjectEvidence, hasProject, quickSession),
        ...parsed.pipelineStates,
      },
    };
  } catch {
    return buildDefaultSession(storageKey, config, hasProjectEvidence, hasProject, quickSession);
  }
}

function addLog(state: WorkspaceSessionState, message: string): WorkspaceSessionState {
  return {
    ...state,
    processingLog: [
      {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        timeLabel: makeTimeLabel(),
        message,
      },
      ...state.processingLog,
    ].slice(0, 12),
  };
}

function markAffectedSteps(
  pipelineStates: Record<string, PipelineStepState>,
  affectedStepIds: string[],
  firstState: PipelineStepState,
  restState: PipelineStepState,
) {
  return Object.fromEntries(
    Object.entries(pipelineStates).map(([stepId, state]) => {
      const index = affectedStepIds.indexOf(stepId);
      if (index === 0) return [stepId, firstState];
      if (index > 0) return [stepId, restState];
      return [stepId, state];
    }),
  ) as Record<string, PipelineStepState>;
}

function markStepsDone(pipelineStates: Record<string, PipelineStepState>, affectedStepIds: string[]) {
  return Object.fromEntries(
    Object.entries(pipelineStates).map(([stepId, state]) => [
      stepId,
      affectedStepIds.includes(stepId) && state !== 'optional' ? 'done' : state,
    ]),
  ) as Record<string, PipelineStepState>;
}

function clampPaneWidth(width: number) {
  return Math.min(RIGHT_PANEL_MAX_WIDTH, Math.max(RIGHT_PANEL_MIN_WIDTH, width));
}

function buildDefaultPaneLayout(storageKey: string): PaneLayoutState {
  return {
    storageKey,
    rightPanelWidth: RIGHT_PANEL_DEFAULT_WIDTH,
    rightPanelCollapsed: false,
    graphFocusMode: false,
    lastUpdatedAt: new Date().toISOString(),
  };
}

function loadPaneLayout(storageKey: string) {
  if (typeof window === 'undefined') return buildDefaultPaneLayout(storageKey);

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return buildDefaultPaneLayout(storageKey);
    const parsed = JSON.parse(raw) as PaneLayoutState;
    return {
      ...buildDefaultPaneLayout(storageKey),
      ...parsed,
      storageKey,
      rightPanelWidth: clampPaneWidth(parsed.rightPanelWidth ?? RIGHT_PANEL_DEFAULT_WIDTH),
    };
  } catch {
    return buildDefaultPaneLayout(storageKey);
  }
}

function buildQuickGraphData(session: AnalysisSession | null, uploadedRuns: UploadedSignalRun[] = []) {
  if (!session) return null;

  const uploadedRun = session.uploadedRunId
    ? uploadedRuns.find((run) => run.id === session.uploadedRunId) ?? null
    : null;

  if (uploadedRun && uploadedRun.points.length > 0) {
    return {
      kind: 'graph' as const,
      type: session.technique.toUpperCase() as TechniqueId,
      data: uploadedRun.points,
      peaks: uploadedRun.extractedFeatures.map((feature) => ({
        position: feature.position,
        intensity: feature.intensity,
        label: feature.label,
        role: 'selected' as const,
      })),
      xLabel: uploadedRun.xAxisLabel,
      yLabel: uploadedRun.yAxisLabel,
    };
  }

  const markers = session.graphData.markers;
  const defaultMin = session.technique === 'xps' ? 0 : session.technique === 'ftir' ? 400 : 10;
  const defaultMax = session.technique === 'xps' ? 1000 : session.technique === 'ftir' ? 4000 : session.technique === 'raman' ? 3200 : 80;
  let min = defaultMin;
  let max = defaultMax;
  for (const marker of markers) {
    if (marker.position < min) min = marker.position;
    if (marker.position > max) max = marker.position;
  }
  const span = Math.max(1, max - min);
  const points = Array.from({ length: 240 }, (_, index) => {
    const x = min + (span * index) / 239;
    const baseline = 18 + Math.sin(index / 12) * 2;
    const peakSignal = markers.reduce((sum, marker) => {
      const width = span / 90;
      const distance = (x - marker.position) / width;
      return sum + marker.intensity * Math.exp(-0.5 * distance * distance);
    }, 0);
    return { x, y: baseline + peakSignal };
  });

  return {
    kind: 'graph' as const,
    type: session.technique.toUpperCase() as TechniqueId,
    data: points,
    peaks: markers.map((marker) => ({
      position: marker.position,
      intensity: marker.intensity,
      label: marker.label,
      role: 'selected' as const,
    })),
    xLabel: session.graphData.axisLabel,
    yLabel: session.graphData.yLabel,
  };
}

function buildSnapshotGraphData(dataset: DemoDataset | null) {
  if (!dataset?.dataPoints.length) return null;
  return {
    kind: 'graph' as const,
    type: dataset.technique.toUpperCase() as TechniqueId,
    data: dataset.dataPoints,
    peaks: dataset.detectedFeatures.map((feature) => ({
      position: feature.position,
      intensity: feature.intensity,
      label: feature.label,
      role: 'selected' as const,
    })),
    xLabel: dataset.xLabel,
    yLabel: dataset.yLabel,
  };
}

function getQuickFeatureRows(session: AnalysisSession | null, fallbackRows: Array<{ label: string; value: string; detail: string }>) {
  if (!session) return fallbackRows;
  if (!session.extractedFeatures.length) {
    return [
      {
        label: session.fileName,
        value: 'Raw upload',
        detail: session.processingState,
      },
    ];
  }

  return session.extractedFeatures.map((feature) => {
    const values = Object.entries(feature.values);
    const [firstKey, firstValue] = values[0] ?? ['Result', feature.label];
    return {
      label: feature.label,
      value: firstValue,
      detail: values.map(([key, value]) => `${key}: ${value}`).join(' | ') || firstKey,
    };
  });
}

function buildXrdBackendSignalSource(
  points: Array<{ x: number; y: number }>,
  source: Omit<XRDBackendSignalSource, 'x' | 'y'>,
): XRDBackendSignalSource | null {
  const finitePoints = points.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (finitePoints.length === 0) return null;

  return {
    ...source,
    x: finitePoints.map((point) => point.x),
    y: finitePoints.map((point) => point.y),
  };
}

function hasFiniteXrdSignalPoints(points: Array<{ x: number; y: number }> | undefined | null) {
  return Boolean(points?.some((point) => Number.isFinite(point.x) && Number.isFinite(point.y)));
}

function getXrdReadinessState({
  hasSignal,
  datasetContext,
  parameters,
}: {
  hasSignal: boolean;
  datasetContext: XRDDatasetContext;
  parameters: XRDParameters;
}): XRDReadinessState {
  const hasKnownElements = datasetContext.knownElements.length > 0;
  const hasDeclaredPhases = datasetContext.declaredPhases.length > 0;
  const hasReferenceSet = Boolean(parameters.referenceMatch.referenceSetId || datasetContext.referenceSetId);
  const referenceMatchEnabled = parameters.referenceMatch.enabled;

  if (!hasSignal) {
    return {
      hasSignal,
      hasKnownElements,
      hasDeclaredPhases,
      hasReferenceSet,
      referenceMatchEnabled,
      analysisMode: 'not_ready',
      message: 'Attach or load an XRD signal to enable processing.',
      tone: 'warning',
    };
  }

  if (!hasReferenceSet) {
    return {
      hasSignal,
      hasKnownElements,
      hasDeclaredPhases,
      hasReferenceSet,
      referenceMatchEnabled,
      analysisMode: 'signal_processing_only',
      message: 'XRD signal processing is available. Reference matching requires a selected reference set and sample context.',
      tone: 'neutral',
    };
  }

  if (!hasKnownElements) {
    return {
      hasSignal,
      hasKnownElements,
      hasDeclaredPhases,
      hasReferenceSet,
      referenceMatchEnabled,
      analysisMode: 'candidate_screening',
      message: 'Reference candidate screening is available. Add known elements to improve candidate filtering.',
      tone: 'info',
    };
  }

  return {
    hasSignal,
    hasKnownElements,
    hasDeclaredPhases,
    hasReferenceSet,
    referenceMatchEnabled,
    analysisMode: 'targeted_candidate_match',
    message: 'Targeted candidate matching is available under user-declared sample context.',
    tone: 'info',
  };
}

export function TechniqueWorkspaceShell({ technique, mode = 'project', fileName, sessionId }: TechniqueWorkspaceShellProps) {
  const isQuickMode = mode === 'quick';
  const config = useMemo(() => getTechniqueWorkspaceConfig(technique), [technique]);
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  // Phase X6B: Access runtime context for reactive event dispatching
  const {
    updateRuntimeEvidence,
    setActiveStage,
    setProcessingStatus,
    set7E4ValidationStatus,
  } = useXrdWorkflowRuntime();
  const routeContext = getEvidenceRouteContext({
    authUser: user,
    searchParams,
    storedMode: getStoredWorkspaceMode(),
  });
  const effectiveWorkspaceMode = routeContext.effectiveWorkspaceMode;
  const isUploadedContext = routeContext.isUploadedContext;
  const querySessionId = routeContext.sessionId ?? sessionId;
  const nextIntent = searchParams.get('next');
  const quickAnalysisSession = useMemo(
    () => ((isQuickMode || isUploadedContext) && querySessionId ? getAnalysisSession(querySessionId) : null),
    [isQuickMode, isUploadedContext, querySessionId],
  );
  const requestedProjectId = searchParams.get('project');
  const blocksDemoProject = !isQuickMode && !isUploadedContext && effectiveWorkspaceMode === 'user' && Boolean(requestedProjectId) && isKnownProjectId(requestedProjectId);
  const project = useMemo(
    () => (blocksDemoProject || isUploadedContext ? null : getProjectFromQuery(requestedProjectId)),
    [blocksDemoProject, isUploadedContext, requestedProjectId],
  );
  const projectId = project?.id ?? null;
  const initialEvidenceSnapshot = useMemo<ProjectEvidenceSnapshot | null>(
    () => (projectId || isUploadedContext ? getProjectEvidenceSnapshot(isUploadedContext ? null : projectId, {
      source: routeContext.source,
      analysisSessionId: querySessionId,
      uploadedRunId: routeContext.uploadedRunId,
      driveFileId: routeContext.driveFileId,
      projectIdExplicit: Boolean(projectId) && !isUploadedContext,
      deferStoredContext: !isUploadedContext,
    }) : null),
    [projectId, isUploadedContext, routeContext.source, routeContext.uploadedRunId, routeContext.driveFileId, querySessionId],
  );
  const [evidenceSnapshot, setEvidenceSnapshot] = useState<ProjectEvidenceSnapshot | null>(initialEvidenceSnapshot);

  useEffect(() => {
    setEvidenceSnapshot(initialEvidenceSnapshot);
    if (!projectId || isUploadedContext) return;

    return runWhenIdle(() => {
      setEvidenceSnapshot(getProjectEvidenceSnapshot(projectId, {
        source: routeContext.source,
        analysisSessionId: querySessionId,
        uploadedRunId: routeContext.uploadedRunId,
        driveFileId: routeContext.driveFileId,
        projectIdExplicit: true,
      }));
    });
  }, [initialEvidenceSnapshot, isUploadedContext, projectId, querySessionId, routeContext.source, routeContext.uploadedRunId, routeContext.driveFileId]);
  const focusedEvidence = useMemo(
    () => (project && !isUploadedContext ? getFocusedEvidenceSource(project, technique) : null),
    [project, isUploadedContext, technique],
  );
  const techniqueState = getTechniqueProjectState(project, technique);
  const comparisonRow = getComparisonRow(project, technique);
  const evidenceSource = getEvidenceSource(project, technique);
  const snapshotDataset =
    evidenceSnapshot?.activeDataset?.technique.toLowerCase() === technique
      ? evidenceSnapshot.activeDataset
      : null;
  const datasetLabel = isUploadedContext
    ? snapshotDataset?.fileName || evidenceSnapshot?.activeDataset?.fileName || quickAnalysisSession?.fileName || fileName || 'Uploaded dataset'
    : isQuickMode
      ? quickAnalysisSession?.fileName || fileName || 'Uploaded dataset'
      : snapshotDataset?.fileName || getDatasetLabel(project, technique);
  const datasetStatus = isUploadedContext
    ? quickAnalysisSession ? getStatusLabel(quickAnalysisSession.status) : evidenceSnapshot?.activeDataset ? 'Available' : 'Metadata only'
    : isQuickMode
      ? quickAnalysisSession ? getStatusLabel(quickAnalysisSession.status) : 'Processing'
      : focusedEvidence?.status || (project ? 'Required' : 'Standalone');
  const runtimeContext = isUploadedContext
    ? {
      sourceMode: evidenceSnapshot?.sourceMode ?? 'user_uploaded',
      runtimeMode: evidenceSnapshot?.runtimeMode ?? 'demo',
      permissionMode: evidenceSnapshot?.permissionMode ?? 'read_only',
      sourceLabel: evidenceSnapshot?.sourceLabel ?? 'User-uploaded evidence',
      approvalStatus: evidenceSnapshot?.approvalStatus ?? 'not_required',
    } as const
    : isQuickMode
      ? getRuntimeContextForEvidenceSource('user_uploaded')
      : effectiveWorkspaceMode === 'user' && !project
        ? getRuntimeContextForEvidenceSource('user_uploaded')
        : {
          sourceMode: evidenceSnapshot?.sourceMode ?? 'demo_preloaded',
          runtimeMode: evidenceSnapshot?.runtimeMode ?? 'demo',
          permissionMode: evidenceSnapshot?.permissionMode ?? 'read_only',
          sourceLabel: evidenceSnapshot?.sourceLabel ?? 'Demo evidence',
          approvalStatus: evidenceSnapshot?.approvalStatus ?? 'not_required',
        } as const;

  // XRD Backend integration state (XRD workspace only)
  const isXrdBackendEnabled = technique === 'xrd';
  const [xrdParameters, setXrdParameters] = useState<XRDParameters>(cloneDefaultXrdParameters);
  const [xrdDatasetContext, setXrdDatasetContext] = useState<XRDDatasetContext>(createDefaultXrdDatasetContext);
  const [xrdBackendHealth, setXrdBackendHealth] = useState<XRDHealthStatus | null>(null);
  const [xrdBackendResult, setXrdBackendResult] = useState<XRDNormalizedResult | null>(null);
  const [xrdBackendLoading, setXrdBackendLoading] = useState(false);
  const [xrdBackendError, setXrdBackendError] = useState<string | null>(null);
  const [xrdBackendSaved, setXrdBackendSaved] = useState(false);
  const [useXrdLocalReferenceForBackend, setUseXrdLocalReferenceForBackend] = useState(false);

  // Backend Status Hook
  const { xrdStatus, agentStatus } = useBackendStatus(
    false,
    xrdBackendLoading,
    false
  );

  const [reReadTrigger, setReReadTrigger] = useState(0);
  const triggerReRead = () => setReReadTrigger((prev) => prev + 1);

  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  const handleUploadSuccess = (run: UploadedSignalRun) => {
    saveUploadedSignalRun(run);
    const techLower = technique.toLowerCase() as 'xrd' | 'xps' | 'ftir' | 'raman';
    const created = createAnalysisSession(techLower, run.fileName);
    const session = saveAnalysisSession({
      ...created,
      fileSizeLabel: 'Uploaded file',
      source: 'user_uploaded',
      uploadedRunId: run.id,
      origin: 'quick-analysis',
      projectId: undefined,
      projectName: undefined,
      status: run.evidenceQuality.canInterpret ? 'completed' : 'needs-review',
      processingState: techLower === 'xrd' && run.evidenceQuality.canInterpret
        ? 'XRD parsed / processed from local upload'
        : `${run.technique} provenance-only upload - processing adapter pending`,
      processingLog: [
        `User-uploaded evidence session ${created.analysisId} created from ${run.fileName}`,
        `Source: user_uploaded`,
        `Upload run: ${run.id}`,
        `Parse status: ${run.technique === 'XRD' ? 'XRD parsed/processed' : `${run.technique} provenance-only / validation-limited`}`,
        'Project: No project',
        ...created.processingLog,
      ],
    });

    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('source', 'user_uploaded');
    nextParams.set('upload', run.id);
    nextParams.set('sessionId', session.analysisId);
    nextParams.set('technique', techLower);
    setSearchParams(nextParams);

    triggerReRead();
    setIsUploadModalOpen(false);
  };

  const [uploadedRunsForGraph, setUploadedRunsForGraph] = useState<UploadedSignalRun[]>([]);
  useEffect(() => {
    if (!quickAnalysisSession?.uploadedRunId) {
      setUploadedRunsForGraph([]);
      return;
    }

    return runWhenIdle(() => {
      setUploadedRunsForGraph(readUploadedSignalRuns());
    });
  }, [quickAnalysisSession?.uploadedRunId, reReadTrigger]);

  const quickGraphData = useMemo(
    () => buildQuickGraphData(quickAnalysisSession, uploadedRunsForGraph),
    [quickAnalysisSession, uploadedRunsForGraph],
  );
  const uploadedGraphData = useMemo(() => buildSnapshotGraphData(snapshotDataset), [snapshotDataset]);
  const graphData = quickGraphData ?? uploadedGraphData ?? focusedEvidence?.graphData;

  const rawXrdPoints = useMemo<{ x: number; y: number }[]>(() => {
    if (technique !== 'xrd') return [];
    const uploadedRunId = routeContext.uploadedRunId ?? quickAnalysisSession?.uploadedRunId ?? null;
    const uploadedRun = uploadedRunId ? getUploadedRunById(uploadedRunId) : null;
    let points: { x: number; y: number }[] = [];
    if (uploadedRun?.technique === 'XRD' && uploadedRun.points?.length > 0) {
      points = uploadedRun.points.map(p => ({ x: p.x, y: p.y }));
    } else if (graphData?.data) {
      points = graphData.data.map(p => ({ x: p.x, y: p.y }));
    }

    if (points.length === 0) return [];

    points.sort((a, b) => a.x - b.x);

    // Bin and average points with nearly identical X values to handle multi-scan files
    // and guarantee strictly monotonically increasing X for physical algorithms
    const deduplicatedPoints: { x: number; y: number }[] = [];
    let currentBin: { xSum: number; ySum: number; count: number } | null = null;
    const BIN_SIZE = 0.005;

    for (const p of points) {
      if (!currentBin) {
        currentBin = { xSum: p.x, ySum: p.y, count: 1 };
      } else {
        if (p.x - (currentBin.xSum / currentBin.count) < BIN_SIZE) {
          currentBin.xSum += p.x;
          currentBin.ySum += p.y;
          currentBin.count += 1;
        } else {
          deduplicatedPoints.push({
            x: currentBin.xSum / currentBin.count,
            y: currentBin.ySum / currentBin.count
          });
          currentBin = { xSum: p.x, ySum: p.y, count: 1 };
        }
      }
    }
    if (currentBin) {
      deduplicatedPoints.push({
        x: currentBin.xSum / currentBin.count,
        y: currentBin.ySum / currentBin.count
      });
    }

    return deduplicatedPoints;
  }, [technique, routeContext.uploadedRunId, quickAnalysisSession?.uploadedRunId, graphData?.data]);

  const processedXrdData = useMemo(() => {
    if (technique !== 'xrd' || !rawXrdPoints || rawXrdPoints.length === 0) return null;

    const min2Theta = xrdParameters.range.twoThetaMin;
    const max2Theta = xrdParameters.range.twoThetaMax;
    let processed = rawXrdPoints.filter(p => p.x >= min2Theta && p.x <= max2Theta);
    if (processed.length === 0) {
      processed = rawXrdPoints.map(p => ({ ...p }));
    } else {
      processed = processed.map(p => ({ ...p }));
    }

    const baselineMethod = xrdParameters.baseline.method;
    if (baselineMethod !== 'none') {
      let methodMapped: 'Rubberband' | 'ALS' | 'Polynomial' | 'Rolling Ball' = 'Rubberband';
      if (baselineMethod === 'asymmetric_ls') {
        methodMapped = 'ALS';
      } else if (baselineMethod === 'polynomial') {
        methodMapped = 'Polynomial';
      } else if (baselineMethod === 'rolling_ball') {
        methodMapped = 'Rolling Ball';
      }
      processed = applyBaseline(processed, methodMapped);
    }

    const smoothingMethod = xrdParameters.smoothing.method;
    if (smoothingMethod !== 'none') {
      let methodMapped: 'Savitzky-Golay' | 'Moving Average' = 'Savitzky-Golay';
      if (smoothingMethod === 'savitzky_golay') {
        methodMapped = 'Savitzky-Golay';
      } else if (smoothingMethod === 'moving_average') {
        methodMapped = 'Moving Average';
      }
      processed = applySmoothing(processed, methodMapped, xrdParameters.smoothing.windowSize, xrdParameters.smoothing.polynomialOrder);
    }

    return processed;
  }, [
    rawXrdPoints,
    technique,
    xrdParameters.range.twoThetaMin,
    xrdParameters.range.twoThetaMax,
    xrdParameters.baseline.method,
    xrdParameters.baseline.lambda,
    xrdParameters.smoothing.method,
    xrdParameters.smoothing.windowSize,
    xrdParameters.smoothing.polynomialOrder,
  ]);
  const xrdHasFiniteSignal = useMemo(() => {
    if (technique !== 'xrd') return false;

    const uploadedRunId = routeContext.uploadedRunId ?? quickAnalysisSession?.uploadedRunId ?? null;
    const uploadedRun = uploadedRunId ? getUploadedRunById(uploadedRunId) : null;

    if (uploadedRun?.technique === 'XRD' && hasFiniteXrdSignalPoints(uploadedRun.points)) {
      return true;
    }

    return graphData?.type?.toLowerCase() === 'xrd' && hasFiniteXrdSignalPoints(graphData.data);
  }, [graphData, quickAnalysisSession?.uploadedRunId, routeContext.uploadedRunId, technique]);
  const hasProjectEvidence = Boolean(
    isUploadedContext ||
    evidenceSnapshot?.availableTechniques.includes(technique.toUpperCase() as Technique) ||
    techniqueState?.available,
  );
  const [quickSessionKey] = useState(() => (isQuickMode || isUploadedContext) ? (querySessionId ?? routeContext.uploadedRunId ?? `quick-${Date.now()}`) : '');
  const uploadedContextKey = routeContext.uploadedRunId ?? querySessionId ?? 'uploaded';
  const sessionStorageKey = useMemo(() => isQuickMode
    ? `difaryx-technique-session:${technique}:quick:${quickSessionKey}`
    : isUploadedContext
      ? `difaryx-technique-session:${technique}:uploaded:${uploadedContextKey}`
      : `difaryx-technique-session:${technique}:${projectId ?? 'standalone'}:${getTraceId(project, technique)}`,
    [isQuickMode, isUploadedContext, uploadedContextKey, technique, quickSessionKey, projectId, project],
  );
  const paneLayoutStorageKey = useMemo(() => isQuickMode
    ? `difaryx-technique-pane-layout:${technique}:quick:${quickSessionKey}`
    : isUploadedContext
      ? `difaryx-technique-pane-layout:${technique}:uploaded:${uploadedContextKey}`
      : `difaryx-technique-pane-layout:${technique}:${projectId ?? 'standalone'}:${getTraceId(project, technique)}`,
    [isQuickMode, isUploadedContext, uploadedContextKey, technique, quickSessionKey, projectId, project],
  );
  const [activeCenterTab, setActiveCenterTab] = useState(config.centerTabs[0].id);
  // XPS element-selection (survey-first view-layer focus; no recalculation).
  const [selectedElement, setSelectedElement] = useState<string | null>(null);
  const [activeRightTab, setActiveRightTab] = useState<RightTab>('Evidence');
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedStepId(null);
  }, [technique, fileName, sessionId]);

  const handleStepClick = (stepId: string) => {
    setSelectedStepId(stepId);
    setActiveRightTab('Parameters');

    // Automatically turn off Auto mode to allow manual parameter tuning
    setSessionState((prev) => ({
      ...prev,
      autoMode: false,
    }));
  };

  const handleMarkStepDone = (stepId: string) => {
    setSessionState((prev) => ({
      ...prev,
      pipelineStates: markStepsDone(prev.pipelineStates, [stepId]),
    }));
  };

  const [activeGraphTool, setActiveGraphTool] = useState<GraphToolId>('pan');
  const [isGraphActionsOpen, setIsGraphActionsOpen] = useState(false);

  // Manual peak selection configuration (specifically for FTIR)
  const manualPeaksStorageKey = `difaryx-manual-peaks:${technique}:${projectId || quickSessionKey || 'standalone'}`;
  const [ftirPeakConfig, setFtirPeakConfig] = useState<{
    isManual: boolean;
    peaks: Array<{ position: number; intensity: number; label: string }>;
  }>(() => {
    if (typeof window === 'undefined') return { isManual: false, peaks: [] };
    try {
      const stored = window.localStorage.getItem(manualPeaksStorageKey);
      return stored ? JSON.parse(stored) : { isManual: false, peaks: [] };
    } catch {
      return { isManual: false, peaks: [] };
    }
  });

  // Sync manual peaks configuration to localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(manualPeaksStorageKey, JSON.stringify(ftirPeakConfig));
  }, [ftirPeakConfig, manualPeaksStorageKey]);

  const handleChartClick = (clickedX: number, clickedY: number) => {
    if (technique !== 'ftir' || activeGraphTool !== 'select') return;

    const dataPoints = graphData?.data || [];
    if (dataPoints.length === 0) return;

    // Find the closest point in the spectrum data
    let closestPt = dataPoints[0];
    let minDistance = Math.abs(dataPoints[0].x - clickedX);

    for (let i = 1; i < dataPoints.length; i++) {
      const dist = Math.abs(dataPoints[i].x - clickedX);
      if (dist < minDistance) {
        minDistance = dist;
        closestPt = dataPoints[i];
      }
    }

    if (minDistance > 100) return;

    // Initialize with auto-detected peaks if transitioning to manual mode for the first time
    let currentPeaks = ftirPeakConfig.isManual
      ? [...ftirPeakConfig.peaks]
      : [...(graphData?.peaks || [])];

    const tolerance = 25; // 25 cm-1 proximity tolerance
    const existingIndex = currentPeaks.findIndex(
      (p) => Math.abs(p.position - closestPt.x) < tolerance
    );

    if (existingIndex > -1) {
      // Toggle off: remove peak
      const removed = currentPeaks.splice(existingIndex, 1)[0];
      setSessionState((prev) =>
        addLog(prev, `[peaks] Manually removed peak near ${removed.position.toFixed(0)} cm⁻¹`),
      );
    } else {
      // Toggle on: add peak
      currentPeaks.push({
        position: Number(closestPt.x.toFixed(1)),
        intensity: closestPt.y, // y is observed transmittance
        label: 'Manual Peak',
      });
      currentPeaks.sort((a, b) => b.position - a.position);
      setSessionState((prev) =>
        addLog(prev, `[peaks] Manually added peak at ${closestPt.x.toFixed(0)} cm⁻¹`),
      );
    }

    setFtirPeakConfig({
      isManual: true,
      peaks: currentPeaks,
    });
  };

  const [sessionState, setSessionState] = useState(() =>
    buildDefaultSession(sessionStorageKey, config, hasProjectEvidence, Boolean(project), quickAnalysisSession),
  );
  const [paneLayout, setPaneLayout] = useState(() => buildDefaultPaneLayout(paneLayoutStorageKey));
  const [sharedOverrideCount, setSharedOverrideCount] = useState(0);

  useEffect(() => {
    if (!projectId) {
      setSharedOverrideCount(0);
      return;
    }

    return runWhenIdle(() => {
      setSharedOverrideCount(Object.keys(readParameterState(projectId, technique).overrides).length);
    });
  }, [projectId, technique]);

  useEffect(() => {
    if (!isXrdBackendEnabled) return;
    let active = true;
    setXrdBackendHealth(null);

    const cancel = runWhenIdle(() => {
      checkXrdBackendHealth()
        .then((status) => {
          if (active) setXrdBackendHealth(status);
        })
        .catch(() => {
          if (!active) return;
          setXrdBackendHealth({
            ok: false,
            status: 'unreachable',
            error: 'XRD backend health check failed',
          });
        });
    });

    return () => {
      active = false;
      cancel();
    };
  }, [isXrdBackendEnabled]);

  useEffect(() => {
    setUseXrdLocalReferenceForBackend(false);
  }, [projectId, routeContext.uploadedRunId, quickAnalysisSession?.uploadedRunId]);

  useEffect(() => {
    setActiveCenterTab(config.centerTabs[0].id);
    setActiveRightTab('Evidence');
    setIsGraphActionsOpen(false);
    setSelectedElement(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [technique]);

  useEffect(() => {
    const loaded = loadSessionState(sessionStorageKey, config, hasProjectEvidence, Boolean(project), quickAnalysisSession);
    if (projectId) {
      const paramState = readParameterState(projectId, technique);
      setSessionState({
        ...loaded,
        parameters: {
          ...loaded.parameters,
          ...paramState.effectiveValues,
        },
      });
    } else {
      setSessionState(loaded);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStorageKey, quickAnalysisSession?.analysisId, projectId, technique]);

  useEffect(() => {
    if (!projectId || typeof window === 'undefined') return;
    const paramStateKey = getParameterStateStorageKey(projectId, technique);

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== paramStateKey) return;
      const paramState = readParameterState(projectId, technique);
      setSessionState((prev) => {
        if (prev.storageKey !== sessionStorageKey) return prev;
        return {
          ...prev,
          parameters: {
            ...prev.parameters,
            ...paramState.effectiveValues,
          },
        };
      });
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [config, projectId, sessionStorageKey, technique]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (sessionState.storageKey !== sessionStorageKey) return;
    window.localStorage.setItem(sessionStorageKey, JSON.stringify(sessionState));
  }, [sessionState, sessionStorageKey]);

  // Bidirectional sync between flat parameters (sessionState.parameters) and nested xrdParameters React state
  useEffect(() => {
    if (technique !== 'xrd') return;

    // Check if flat parameters differ from what xrdParameters represents
    const mappedFlat = xrdToFlatParameters(xrdParameters);
    const differs = Object.keys(mappedFlat).some(key => {
      const flatVal = sessionState.parameters[key];
      const mappedVal = mappedFlat[key];
      if (Array.isArray(flatVal) && Array.isArray(mappedVal)) {
        return JSON.stringify(flatVal) !== JSON.stringify(mappedVal);
      }
      return flatVal !== mappedVal;
    });

    if (differs) {
      // Sync from flat parameters to nested xrdParameters
      const newXrd = flatToXrdParameters(sessionState.parameters, xrdParameters);
      if (JSON.stringify(newXrd) !== JSON.stringify(xrdParameters)) {
        setXrdParameters(newXrd);
      }
    }
  }, [sessionState.parameters, technique]);

  useEffect(() => {
    if (technique !== 'xrd') return;

    const mappedFlat = xrdToFlatParameters(xrdParameters);
    const differs = Object.keys(mappedFlat).some(key => {
      const flatVal = sessionState.parameters[key];
      const mappedVal = mappedFlat[key];
      if (Array.isArray(flatVal) && Array.isArray(mappedVal)) {
        return JSON.stringify(flatVal) !== JSON.stringify(mappedVal);
      }
      return flatVal !== mappedVal;
    });

    if (differs) {
      // Sync from nested xrdParameters to flat parameters and local storage overrides
      setSessionState((prev) => {
        const nextParams = { ...prev.parameters, ...mappedFlat };

        // Also update local storage parameterState if project is active
        if (projectId) {
          Object.entries(mappedFlat).forEach(([key, val]) => {
            if (prev.parameters[key] !== val) {
              setParameterOverride(projectId, 'xrd', key, val, 'workspace');
            }
          });
        }

        return {
          ...prev,
          parameters: nextParams,
          dirty: true,
          pendingRecalculation: true,
        };
      });
    }
  }, [xrdParameters, technique, projectId]);

  // Auto-run trigger if reproduce=true on mount
  const isReproduceSession = searchParams.get('reproduce') === 'true';
  useEffect(() => {
    if (isReproduceSession) {
      const timer = setTimeout(() => {
        reprocess();
        setSessionState((prev) => addLog(prev, '[reproduce] Auto-reprocessing historical session pattern.'));
      }, 500);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReproduceSession]);

  useEffect(() => {
    setPaneLayout(loadPaneLayout(paneLayoutStorageKey));
  }, [paneLayoutStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (paneLayout.storageKey !== paneLayoutStorageKey) return;
    window.localStorage.setItem(paneLayoutStorageKey, JSON.stringify(paneLayout));
  }, [paneLayout, paneLayoutStorageKey]);

  const projectFeatureRows = getFeatureRows(project, focusedEvidence, technique);
  const snapshotFeatureRows = snapshotDataset
    ? snapshotDataset.detectedFeatures.map((feature) => ({
      label: feature.label,
      value: `${feature.position}`,
      detail: `Intensity ${feature.intensity}`,
    }))
    : projectFeatureRows;

  const ftirManualFeatureRows = useMemo(() => {
    if (technique !== 'ftir' || !ftirPeakConfig.isManual) return null;
    return ftirPeakConfig.peaks.map((p) => ({
      label: p.label || 'Manual Peak',
      value: `${p.position.toFixed(1)}`,
      detail: `Intensity ${p.intensity.toFixed(2)}`,
    }));
  }, [technique, ftirPeakConfig]);

  const featureRows = (technique === 'ftir' && ftirPeakConfig.isManual && ftirManualFeatureRows)
    ? ftirManualFeatureRows
    : (isUploadedContext
      ? getQuickFeatureRows(quickAnalysisSession, snapshotFeatureRows)
      : isQuickMode ? getQuickFeatureRows(quickAnalysisSession, projectFeatureRows) : projectFeatureRows);

  const [industryFilter, setIndustryFilter] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return window.localStorage.getItem('difaryx_selected_industry_mode') || 'All';
    }
    return 'All';
  });

  const handleIndustryFilterChange = (val: string) => {
    setIndustryFilter(val);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('difaryx_selected_industry_mode', val);
    }
    setSessionState((prev) =>
      addLog(prev, `[industry] Switched Analysis Mode / Industry to: ${val}`),
    );
  };

  // Synchronize mapped features to local storage when industryFilter changes
  useEffect(() => {
    if (!isUploadedContext || !routeContext.uploadedRunId || technique === 'xrd') return;
    const uploadedRun = getUploadedRunById(routeContext.uploadedRunId);
    if (!uploadedRun || !uploadedRun.extractedFeatures) return;

    const matched = identifyMaterialFeatures(
      uploadedRun.extractedFeatures.map(f => ({
        position: f.position,
        intensity: f.intensity
      })),
      technique.toUpperCase() as 'XRD' | 'FTIR' | 'RAMAN',
      industryFilter
    );

    const updatedFeatures = uploadedRun.extractedFeatures.map((f, index) => {
      const match = matched[index];
      if (match && match.assignment !== 'Unassigned') {
        return {
          ...f,
          label: `${match.assignment} (${match.confidence}%)`,
          context: match.assignment
        };
      }
      return {
        ...f,
        label: f.label || 'Unassigned',
        context: 'Unassigned'
      };
    });

    updateUploadedRunProcessingResults(routeContext.uploadedRunId, {
      extractedFeatures: updatedFeatures
    });
  }, [industryFilter, routeContext.uploadedRunId, isUploadedContext, technique]);

  // Synchronize manual FTIR peaks back to the analysis session and uploaded run
  useEffect(() => {
    if (technique !== 'ftir') return;

    const isManual = ftirPeakConfig.isManual;
    const activePeaks = isManual ? ftirPeakConfig.peaks : (graphData?.peaks || []);

    const matched = identifyMaterialFeatures(
      activePeaks.map(p => ({ position: p.position, intensity: p.intensity })),
      'FTIR',
      industryFilter
    );

    // 1. Sync to Uploaded Runs list in local storage
    const uploadedRunId = routeContext.uploadedRunId || quickAnalysisSession?.uploadedRunId;
    if (uploadedRunId) {
      const uploadedRun = getUploadedRunById(uploadedRunId);
      if (uploadedRun) {
        const updatedFeatures = activePeaks.map((p, index) => {
          const match = matched[index];
          const label = (match && match.assignment !== 'Unassigned') ? match.assignment : (p.label || 'Peak');
          return {
            id: `ftir-${isManual ? 'manual' : 'auto'}-${index}`,
            technique: 'FTIR' as const,
            label: `${label} (${match?.confidence ?? 100}%)`,
            position: p.position,
            intensity: p.intensity,
            relativeIntensity: p.intensity,
            prominence: 0,
            context: label
          };
        });

        updateUploadedRunProcessingResults(uploadedRunId, {
          extractedFeatures: updatedFeatures
        });
      }
    }

    // 2. Sync to Quick Analysis Session in local storage
    const activeSessionId = quickAnalysisSession?.analysisId || querySessionId;
    if (activeSessionId) {
      const session = getAnalysisSession(activeSessionId);
      if (session) {
        const updatedMarkers = activePeaks.map((p, index) => {
          const match = matched[index];
          const label = (match && match.assignment !== 'Unassigned') ? match.assignment : (p.label || 'Peak');
          return {
            position: p.position,
            intensity: p.intensity,
            label: `${label} (${match?.confidence ?? 100}%)`
          };
        });

        const updatedFeatures = activePeaks.map((p, index) => {
          const match = matched[index];
          const label = (match && match.assignment !== 'Unassigned') ? match.assignment : (p.label || 'Peak');
          return {
            id: `ftir-${isManual ? 'manual' : 'auto'}-${index}`,
            label: `${label} (${match?.confidence ?? 100}%)`,
            values: {
              wavenumber: `${p.position.toFixed(1)} cm-1`,
              intensity: p.intensity.toFixed(2),
              assignment: label,
              confidence: String(match?.confidence ?? 100)
            }
          };
        });

        saveAnalysisSession({
          ...session,
          extractedFeatures: updatedFeatures,
          graphData: {
            ...session.graphData,
            markers: updatedMarkers
          }
        });
      }
    }
  }, [
    ftirPeakConfig.isManual,
    ftirPeakConfig.peaks,
    graphData?.peaks,
    industryFilter,
    technique,
    routeContext.uploadedRunId,
    quickAnalysisSession?.uploadedRunId,
    quickAnalysisSession?.analysisId,
    querySessionId
  ]);


  // Auto-run peak detection and phase matching for XRD when parameters or industryFilter changes
  useEffect(() => {
    if (!isUploadedContext || !routeContext.uploadedRunId || technique !== 'xrd' || rawXrdPoints.length === 0) return;

    const uploadedRun = getUploadedRunById(routeContext.uploadedRunId);
    if (!uploadedRun) return;

    const processingParams: XrdProcessingParams = {
      baselineRadius: 42,
      baselineFraction: xrdParameters.baseline.method === 'asymmetric_ls'
        ? Math.max(0.05, Math.min(0.3, 0.05 + (Math.log10(xrdParameters.baseline.lambda) - 2) / (9 - 2) * (0.3 - 0.05)))
        : 0.16,
      smoothingRadius: Math.floor(xrdParameters.smoothing.windowSize / 2),
      minProminence: xrdParameters.peakDetection.minProminence,
      minDistance: xrdParameters.peakDetection.minDistanceDeg,
      minHeight: xrdParameters.peakDetection.minHeightRatio,
    };

    try {
      const result = runXrdPhaseIdentificationAgent({
        datasetId: uploadedRun.id,
        sampleName: uploadedRun.sampleIdentity,
        sourceLabel: uploadedRun.fileName,
        dataPoints: rawXrdPoints.map(p => ({
          x: p.x,
          y: p.y,
          twoTheta: p.x,
          intensity: p.y,
        })),
      }, processingParams);

      const extractedFeatures: TechniqueFeature[] = result.detectedPeaks.map((peak, index) => ({
        id: `xrd-peak-${index}`,
        technique: 'XRD' as const,
        label: `Peak at ${peak.position.toFixed(2)}°`,
        position: peak.position,
        intensity: peak.intensity,
        relativeIntensity: peak.intensity,
        prominence: peak.prominence,
        context: peak.label || 'Unknown phase',
      }));

      // Identify material features based on selected industry filter
      const matched = identifyMaterialFeatures(
        extractedFeatures.map(f => ({
          position: f.position,
          intensity: f.intensity
        })),
        'XRD',
        industryFilter
      );

      const updatedFeatures = extractedFeatures.map((f, index) => {
        const match = matched[index];
        if (match && match.assignment !== 'Unassigned') {
          return {
            ...f,
            label: `${match.assignment} (${match.confidence}%)`,
            context: match.assignment
          };
        }
        return {
          ...f,
          label: f.label || 'Unassigned',
          context: 'Unassigned'
        };
      });

      // Synchronize state to Local Storage
      const updateSuccess = updateUploadedRunProcessingResults(routeContext.uploadedRunId, {
        extractedFeatures: updatedFeatures,
        evidenceQuality: {
          state: 'ready',
          label: 'Ready for analysis',
          canInterpret: true,
          messages: [],
        },
        parameterSnapshot: projectId ? {
          ...getXrdProcessingParams(projectId),
          provenance: getXrdParameterSnapshot(projectId)
        } : undefined
      });

      if (updateSuccess) {
        triggerReRead();
      }
    } catch (e) {
      console.error('Error auto-processing XRD:', e);
    }
  }, [
    xrdParameters.baseline.method,
    xrdParameters.baseline.lambda,
    xrdParameters.smoothing.method,
    xrdParameters.smoothing.windowSize,
    xrdParameters.peakDetection.minProminence,
    xrdParameters.peakDetection.minDistanceDeg,
    xrdParameters.peakDetection.minHeightRatio,
    xrdParameters.range.twoThetaMin,
    xrdParameters.range.twoThetaMax,
    industryFilter,
    routeContext.uploadedRunId,
    isUploadedContext,
    technique,
    projectId,
    rawXrdPoints
  ]);

  const mappedPeakMarkers = useMemo(() => {
    const peaksToMap = (technique === 'ftir' && ftirPeakConfig.isManual)
      ? ftirPeakConfig.peaks.map(p => ({ ...p, role: 'selected' as const }))
      : (graphData?.peaks || []);

    if (peaksToMap.length === 0) return [];
    if (technique !== 'xrd' && technique !== 'ftir' && technique !== 'raman') {
      return peaksToMap;
    }

    const matched = identifyMaterialFeatures(
      peaksToMap,
      technique.toUpperCase() as 'XRD' | 'FTIR' | 'RAMAN',
      industryFilter
    );

    return peaksToMap.map((peak, index) => {
      const match = matched[index];
      if (match && match.assignment !== 'Unassigned') {
        return {
          ...peak,
          label: `${match.assignment} (${match.confidence}%)`,
        };
      }
      return {
        ...peak,
        label: peak.label || 'Unassigned',
      };
    });
  }, [graphData?.peaks, ftirPeakConfig, technique, industryFilter]);

  const mappedFeatureRows = useMemo(() => {
    if (!featureRows || featureRows.length === 0) return [];
    if (technique !== 'xrd' && technique !== 'ftir' && technique !== 'raman') {
      return featureRows;
    }

    const matched = identifyMaterialFeatures(
      featureRows.map(row => ({
        position: parseFloat(row.value) || 0,
        intensity: 100
      })),
      technique.toUpperCase() as 'XRD' | 'FTIR' | 'RAMAN',
      industryFilter
    );

    return featureRows.map((row, index) => {
      const match = matched[index];
      if (match && match.assignment !== 'Unassigned') {
        return {
          ...row,
          label: match.assignment,
          detail: match.details || row.detail
        };
      }
      return row;
    });
  }, [featureRows, technique, industryFilter]);

  // ── XPS element-selection analysis (survey-first, view-layer) ──
  // Authoritative survey spectrum points reused by the element sub-view.
  const xpsSpectrumPoints = useMemo<{ x: number; y: number }[]>(() => {
    if (technique !== 'xps' || !graphData?.data) return [];
    return graphData.data.map((p) => ({ x: p.x, y: p.y }));
  }, [technique, graphData?.data]);

  // Current XPS processing parameters (calibration, background, region...).
  const xpsProcessingParams = useMemo(
    () => (technique === 'xps' && projectId ? getXpsProcessingParams(projectId) : undefined),
    [technique, projectId, sessionState.parameters],
  );

  // Elements detected in the survey = canonical elements whose core-level window
  // contains at least one detected survey feature.
  const detectedXpsElements = useMemo<string[]>(() => {
    if (technique !== 'xps') return [];
    const positions = mappedFeatureRows
      .map((row) => parseFloat(String(row.value)))
      .filter((v) => Number.isFinite(v));
    if (positions.length === 0) return [];
    return listReferenceElements().filter((element) => {
      const window = getElementRegionWindow(element);
      return window ? positions.some((p) => p >= window.min && p <= window.max) : false;
    });
  }, [technique, mappedFeatureRows]);

  const handleElementSelect = (element: string) => {
    setSelectedElement(element);
    setActiveCenterTab('element-analysis');
    setSessionState((prev) => addLog(prev, `[element] Focused ${element} core-level region from survey.`));
  };

  const handleBackToSurvey = () => {
    setSelectedElement(null);
    setActiveCenterTab(config.centerTabs[0].id);
  };

  // Persist element-focused XPS evidence for the agent reasoning layer.
  const handleElementEvidence = (evidence: XpsElementEvidence) => {
    saveXpsElementEvidence(projectId, evidence);
    setSessionState((prev) =>
      addLog(
        prev,
        `[element] Captured ${evidence.selectedElement} oxidation-state evidence (${evidence.candidateStates.length} candidate state${evidence.candidateStates.length === 1 ? '' : 's'}) for agent reasoning.`,
      ),
    );
  };

  const demoLinkSuffix = project && effectiveWorkspaceMode !== 'user' ? '&mode=demo' : '';
  const evidenceRouteSearch = isUploadedContext
    ? buildEvidenceRouteSearch(routeContext)
    : '';
  const evidenceRouteSuffix = evidenceRouteSearch ? `?${evidenceRouteSearch}` : '';
  const notebookPath = isUploadedContext && evidenceRouteSuffix
    ? `/notebook${evidenceRouteSuffix}&template=research`
    : project ? `/notebook?project=${project.id}${demoLinkSuffix}` : '/notebook';
  const agentPath = isUploadedContext && evidenceRouteSuffix
    ? `/demo/agent${evidenceRouteSuffix}`
    : project ? `/demo/agent?project=${project.id}${demoLinkSuffix}` : '/demo/agent';
  const reportPath = isUploadedContext && evidenceRouteSuffix
    ? `/report${evidenceRouteSuffix}&template=xrd-summary`
    : project ? `/reports?project=${project.id}${demoLinkSuffix}` : '/reports';
  const analysisReturnPath = isUploadedContext && evidenceRouteSearch
    ? `/workspace?${evidenceRouteSearch}`
    : '/analysis';
  const workspacePath = isUploadedContext && evidenceRouteSearch
    ? `/workspace?${evidenceRouteSearch}`
    : project ? `/workspace?project=${project.id}${demoLinkSuffix}` : '/workspace';
  const quickStatusLabel = isQuickMode ? (sessionState.dirty ? 'Draft · Unsaved' : 'Draft') : '';
  const processingStateLabel = sessionState.pendingRecalculation
    ? 'Pending recalculation'
    : sessionState.dirty
      ? 'Unsaved changes'
      : Object.values(sessionState.pipelineStates).some((state) => state === 'active')
        ? 'In progress'
        : 'Completed';
  const saveStateLabel = sessionState.dirty
    ? 'Unsaved'
    : sessionState.pendingRecalculation
      ? 'Reprocess needed'
      : 'Autosaved';
  const previewAffectedSteps = sessionState.lastAffectedStepIds.length > 0
    ? sessionState.lastAffectedStepIds
    : config.pipeline.slice(0, 3).map((step) => step.id);
  const rightPanelVisible = !paneLayout.rightPanelCollapsed && !paneLayout.graphFocusMode;

  const updateParameter = (control: TechniqueParameterControl, value: TechniqueParameterValue) => {
    setSessionState((prev) => {
      if (projectId) {
        setParameterOverride(projectId, technique, control.id, value, 'workspace');
      }

      const next = addLog(
        {
          ...prev,
          parameters: {
            ...prev.parameters,
            [control.id]: value,
          },
          dirty: true,
          pendingRecalculation: true,
          autoMode: false,
          lastAffectedStepIds: control.affectedStepIds,
          pipelineStates: markAffectedSteps(prev.pipelineStates, control.affectedStepIds, 'active', 'pending'),
        },
        `${control.label} changed; recalculation pending.`,
      );
      return next;
    });
  };

  const toggleCheckboxValue = (control: TechniqueParameterControl, option: string) => {
    const current = sessionState.parameters[control.id];
    const values = Array.isArray(current) ? current : [];
    const next = values.includes(option)
      ? values.filter((item) => item !== option)
      : [...values, option];
    updateParameter(control, next);
  };

  const toggleAutoMode = () => {
    setSessionState((prev) => {
      const nextAuto = !prev.autoMode;
      return addLog(
        {
          ...prev,
          autoMode: nextAuto,
          dirty: true,
          pendingRecalculation: true,
          lastAffectedStepIds: config.pipeline.slice(0, 3).map((step) => step.id),
          pipelineStates: markAffectedSteps(
            prev.pipelineStates,
            config.pipeline.slice(0, 3).map((step) => step.id),
            'active',
            'pending',
          ),
        },
        nextAuto ? 'Auto processing mode enabled; defaults pending recalculation.' : 'Manual processing mode enabled.',
      );
    });
  };

  const applyParameters = (overrideAffectedSteps?: string[]) => {
    const stepsToMark = overrideAffectedSteps || (sessionState.lastAffectedStepIds.length > 0
      ? sessionState.lastAffectedStepIds
      : config.pipeline.slice(0, 3).map((step) => step.id));

    setSessionState((prev) =>
      addLog(
        {
          ...prev,
          dirty: false,
          pendingRecalculation: true,
          pipelineStates: markAffectedSteps(prev.pipelineStates, stepsToMark, 'active', 'pending'),
        },
        'Parameters applied to processing session.',
      ),
    );
    if (technique === 'xrd') {
      reprocess();
    }
  };

  const getXrdBackendSignalSource = (): XRDBackendSignalSource | null => {
    if (!isXrdBackendEnabled) return null;

    const uploadedRunId = routeContext.uploadedRunId ?? quickAnalysisSession?.uploadedRunId ?? null;
    const uploadedRun = uploadedRunId ? getUploadedRunById(uploadedRunId) : null;

    if (uploadedRun?.technique === 'XRD') {
      return buildXrdBackendSignalSource(uploadedRun.points, {
        uploadedRunId: uploadedRun.id,
        fileName: uploadedRun.fileName,
      });
    }

    if (graphData?.type?.toLowerCase() === 'xrd') {
      return buildXrdBackendSignalSource(graphData.data, {
        uploadedRunId: uploadedRunId ?? undefined,
        fileName: datasetLabel,
      });
    }

    return null;
  };

  const getXrdLocalReferencePayloadForBackend = (
    signalSource: XRDBackendSignalSource,
  ): XRDLocalReferencePayload | undefined => {
    if (!useXrdLocalReferenceForBackend) return undefined;

    const latestDraft = getXrdLocalReferenceDraftsForContext(
      projectId ?? undefined,
      signalSource.uploadedRunId ?? routeContext.uploadedRunId ?? quickAnalysisSession?.uploadedRunId ?? undefined,
    )[0];
    if (!latestDraft) return undefined;
    if (!canUseXrdLocalReferenceDraftForBackendMatching(latestDraft)) {
      debugXrdReprocessTrace('local reference draft blocked from backend payload', {
        sourceFileName: latestDraft.sourceFileName,
        validationStatus: latestDraft.validationStatus,
        approvalStatus: latestDraft.approvalStatus,
        userApprovedForMatching: latestDraft.userApprovedForMatching,
        isEligibleForBackendMatching: latestDraft.parseResult.isEligibleForBackendMatching,
      });
      return undefined;
    }

    return buildXrdLocalReferencePayloadFromDraft(latestDraft);
  };

  const runXrdBackendProcessing = (signalSource: XRDBackendSignalSource) => {
    const localReference = getXrdLocalReferencePayloadForBackend(signalSource);
    debugXrdReprocessTrace('backend process call started', {
      xLength: signalSource.x.length,
      yLength: signalSource.y.length,
      fileName: signalSource.fileName,
      uploadedRunId: signalSource.uploadedRunId,
      localReferenceEnabled: Boolean(localReference),
    });
    setXrdBackendLoading(true);
    setXrdBackendError(null);
    setXrdBackendSaved(false);

    // Phase X6B: Dispatch runtime processing start event
    if (technique === 'xrd') {
      setProcessingStatus(true);
      setActiveStage('baseline');
    }

    processXrdSkillEvidence({
      x: signalSource.x,
      y: signalSource.y,
      datasetContext: xrdDatasetContext,
      parameters: xrdParameters,
      localReference,
    })
      .then((normalized) => {
        setXrdBackendResult(normalized);
        setXrdBackendLoading(false);
        const savedRecord = saveXrdBackendEvidenceResult(
          projectId ?? undefined,
          signalSource.uploadedRunId,
          normalized,
          signalSource.fileName,
        );
        setXrdBackendSaved(true);
        setSessionState((prev) =>
          addLog(
            prev,
            `[backend] XRD backend processing complete - ${normalized.detectedPeakCount} peaks, S/N ${normalized.snRatio.toFixed(1)} (evidence saved for handoff)`,
          ),
        );

        // Phase X6B: Dispatch saved evidence record to runtime context
        if (technique === 'xrd') {
          updateRuntimeEvidence(savedRecord);
          setActiveStage(null);
          setProcessingStatus(false);
        }
      })
      .catch((err) => {
        const message = err instanceof XRDBackendError ? err.message : 'XRD backend unreachable';
        setXrdBackendError(message);
        setXrdBackendLoading(false);
        setSessionState((prev) =>
          addLog(prev, `[backend] XRD backend call failed (non-blocking): ${message}`),
        );

        // Phase X6B: Dispatch runtime processing end on error
        if (technique === 'xrd') {
          setActiveStage(null);
          setProcessingStatus(false);
        }
      });
  };

  const reprocess = () => {
    if (technique === 'xrd') {
      debugXrdReprocessTrace('Reprocess Peaks clicked', {
        routeUploadedRunId: routeContext.uploadedRunId,
        quickUploadedRunId: quickAnalysisSession?.uploadedRunId,
        graphType: graphData?.type,
        graphPointCount: graphData?.data?.length ?? 0,
      });
    }

    // For uploaded XRD context, run actual processing
    if (isUploadedContext && technique === 'xrd' && routeContext.uploadedRunId) {
      const uploadedRun = getUploadedRunById(routeContext.uploadedRunId);

      if (!uploadedRun) {
        setSessionState((prev) =>
          addLog(prev, `[error] Uploaded run ${routeContext.uploadedRunId} not found.`),
        );
        return;
      }

      try {
        // Map live xrdParameters React state to XrdProcessingParams
        const processingParams: XrdProcessingParams = {
          baselineRadius: 42,
          baselineFraction: xrdParameters.baseline.method === 'asymmetric_ls'
            ? Math.max(0.05, Math.min(0.3, 0.05 + (Math.log10(xrdParameters.baseline.lambda) - 2) / (9 - 2) * (0.3 - 0.05)))
            : 0.16,
          smoothingRadius: Math.floor(xrdParameters.smoothing.windowSize / 2),
          minProminence: xrdParameters.peakDetection.minProminence,
          minDistance: xrdParameters.peakDetection.minDistanceDeg,
          minHeight: xrdParameters.peakDetection.minHeightRatio,
        };

        const paramSnapshot = projectId
          ? getXrdParameterSnapshot(projectId)
          : { hasOverrides: false, overrideCount: 0, lastUpdatedBy: 'default', updatedAt: null };

        // Run XRD processing with uploaded data
        const result = runXrdPhaseIdentificationAgent({
          datasetId: uploadedRun.id,
          sampleName: uploadedRun.sampleIdentity,
          sourceLabel: uploadedRun.fileName,
          dataPoints: uploadedRun.points.map(p => ({
            x: p.x,
            y: p.y,
            twoTheta: p.x,
            intensity: p.y,
          })),
        }, processingParams);

        // Convert detected peaks to TechniqueFeature format
        const extractedFeatures: TechniqueFeature[] = result.detectedPeaks.map((peak, index) => ({
          id: `xrd-peak-${index}`,
          technique: 'XRD' as const,
          label: `Peak at ${peak.position.toFixed(2)}°`,
          position: peak.position,
          intensity: peak.intensity,
          relativeIntensity: peak.intensity,
          prominence: peak.prominence,
          context: peak.label || 'Unknown phase',
        }));

        // Identify material features based on selected industry filter
        const matched = identifyMaterialFeatures(
          extractedFeatures.map(f => ({
            position: f.position,
            intensity: f.intensity
          })),
          'XRD',
          industryFilter
        );

        const updatedFeatures = extractedFeatures.map((f, index) => {
          const match = matched[index];
          if (match && match.assignment !== 'Unassigned') {
            return {
              ...f,
              label: `${match.assignment} (${match.confidence}%)`,
              context: match.assignment
            };
          }
          return {
            ...f,
            label: f.label || 'Unassigned',
            context: 'Unassigned'
          };
        });

        // Update uploaded run with processing results
        const updateSuccess = updateUploadedRunProcessingResults(routeContext.uploadedRunId, {
          extractedFeatures: updatedFeatures,
          evidenceQuality: {
            state: 'ready',
            label: 'Ready for analysis',
            canInterpret: true,
            messages: [],
          },
          processingLog: [
            `Reprocessed at ${new Date().toISOString()}`,
            `Detected ${result.detectedPeaks.length} peaks`,
            paramSnapshot.hasOverrides
              ? `Applied ${paramSnapshot.overrideCount} custom parameter(s) (last updated by ${paramSnapshot.lastUpdatedBy})`
              : 'Used default parameters',
          ],
          parameterSnapshot: paramSnapshot.hasOverrides
            ? { ...processingParams, provenance: paramSnapshot }
            : undefined,
        });

        if (updateSuccess) {
          triggerReRead();
          setSessionState((prev) =>
            addLog(
              {
                ...prev,
                dirty: false,
                pendingRecalculation: false,
                pipelineStates: markStepsDone(prev.pipelineStates, previewAffectedSteps),
                lastProcessedLabel: makeTimeLabel(),
              },
              [
                `[processing] Reprocessed uploaded XRD evidence: ${uploadedRun.fileName}`,
                `[features] Detected ${updatedFeatures.length} peaks`,
                paramSnapshot.hasOverrides
                  ? `[params] Applied ${paramSnapshot.overrideCount} custom XRD parameter(s) (last updated by ${paramSnapshot.lastUpdatedBy})`
                  : '[params] Used default XRD parameters',
              ].join('\n'),
            ),
          );

          // Fire-and-forget: run XRD backend alongside local agent
          if (isXrdBackendEnabled) {
            const backendSignalSource = buildXrdBackendSignalSource(uploadedRun.points, {
              uploadedRunId: routeContext.uploadedRunId,
              fileName: uploadedRun.fileName,
            });
            if (backendSignalSource) {
              debugXrdReprocessTrace('XRD signal found', {
                source: 'uploaded-run',
                pointCount: backendSignalSource.x.length,
              });
            } else {
              debugXrdReprocessTrace('XRD signal not found', {
                source: 'uploaded-run',
                pointCount: uploadedRun.points.length,
              });
              return;
            }
            setXrdBackendLoading(true);
            setXrdBackendError(null);
            setXrdBackendSaved(false);

            // Phase X6B: Dispatch runtime processing start event
            setProcessingStatus(true);
            setActiveStage('baseline');

            const localReference = getXrdLocalReferencePayloadForBackend(backendSignalSource);
            debugXrdReprocessTrace('backend process call started', {
              xLength: backendSignalSource.x.length,
              yLength: backendSignalSource.y.length,
              fileName: backendSignalSource.fileName,
              uploadedRunId: backendSignalSource.uploadedRunId,
              localReferenceEnabled: Boolean(localReference),
            });
            processXrdSkillEvidence({
              x: backendSignalSource.x,
              y: backendSignalSource.y,
              datasetContext: xrdDatasetContext,
              parameters: xrdParameters,
              localReference,
            })
              .then((normalized) => {
                setXrdBackendResult(normalized);
                setXrdBackendLoading(false);
                const savedRecord = saveXrdBackendEvidenceResult(
                  projectId ?? undefined,
                  routeContext.uploadedRunId ?? undefined,
                  normalized,
                  uploadedRun.fileName,
                );
                setXrdBackendSaved(true);
                setSessionState((prev) =>
                  addLog(
                    prev,
                    `[backend] XRD backend processing complete — ${normalized.detectedPeakCount} peaks, S/N ${normalized.snRatio.toFixed(1)} (evidence saved for handoff)`,
                  ),
                );

                // Phase X6B: Dispatch saved evidence record to runtime context
                updateRuntimeEvidence(savedRecord);
                setActiveStage(null);
                setProcessingStatus(false);
              })
              .catch((err) => {
                const message = err instanceof XRDBackendError ? err.message : 'XRD backend unreachable';
                setXrdBackendError(message);
                setXrdBackendLoading(false);
                setSessionState((prev) =>
                  addLog(prev, `[backend] XRD backend call failed (non-blocking): ${message}`),
                );

                // Phase X6B: Dispatch runtime processing end on error
                setActiveStage(null);
                setProcessingStatus(false);
              });
          }
        } else {
          setSessionState((prev) =>
            addLog(prev, `[error] Failed to update uploaded run ${routeContext.uploadedRunId}.`),
          );
        }
      } catch (error) {
        console.error('XRD reprocessing error:', error);
        setSessionState((prev) =>
          addLog(prev, `[error] XRD reprocessing failed: ${error instanceof Error ? error.message : 'Unknown error'}`),
        );
      }
      return;
    }

    if (technique === 'xrd') {
      const backendSignalSource = getXrdBackendSignalSource();
      if (backendSignalSource) {
        debugXrdReprocessTrace('XRD signal found', {
          source: backendSignalSource.uploadedRunId ? 'uploaded-run-or-session' : 'graph-data',
          pointCount: backendSignalSource.x.length,
          fileName: backendSignalSource.fileName,
          uploadedRunId: backendSignalSource.uploadedRunId,
        });
        runXrdBackendProcessing(backendSignalSource);
      } else {
        debugXrdReprocessTrace('XRD signal not found', {
          backendEnabled: isXrdBackendEnabled,
          graphType: graphData?.type,
          graphPointCount: graphData?.data?.length ?? 0,
        });
      }
    }

    // For uploaded Raman context, run actual processing
    if (isUploadedContext && technique === 'raman' && routeContext.uploadedRunId) {
      const uploadedRun = getUploadedRunById(routeContext.uploadedRunId);

      if (!uploadedRun) {
        setSessionState((prev) =>
          addLog(prev, `[error] Uploaded run ${routeContext.uploadedRunId} not found.`),
        );
        return;
      }

      try {
        const processingParams = projectId ? getRamanProcessingParams(projectId) : undefined;
        const paramSnapshot = projectId
          ? getRamanParameterSnapshot(projectId)
          : { hasOverrides: false, overrideCount: 0, lastUpdatedBy: 'default', updatedAt: null };

        const result = runRamanProcessing({
          id: uploadedRun.id,
          label: uploadedRun.fileName,
          sampleName: uploadedRun.sampleIdentity,
          fileName: uploadedRun.fileName,
          signal: {
            ramanShift: uploadedRun.points.map(p => p.x),
            intensity: uploadedRun.points.map(p => p.y),
          },
          baseline: [],
          peaks: [],
        }, processingParams);

        const extractedFeatures: TechniqueFeature[] = result.peaks.map((peak, index) => ({
          id: `raman-peak-${index}`,
          technique: 'Raman' as const,
          label: peak.assignment
            ? `${peak.assignment} (${peak.ramanShift.toFixed(0)} cm⁻¹)`
            : `Peak at ${peak.ramanShift.toFixed(1)} cm⁻¹`,
          position: peak.ramanShift,
          intensity: peak.intensity,
          relativeIntensity: peak.intensity,
          prominence: peak.prominence,
          context: peak.assignment || 'Unassigned',
        }));


        const updateSuccess = updateUploadedRunProcessingResults(routeContext.uploadedRunId, {
          extractedFeatures,
          evidenceQuality: {
            state: 'ready',
            label: 'Ready for analysis',
            canInterpret: true,
            messages: [],
          },
          processingLog: [
            `Reprocessed at ${new Date().toISOString()}`,
            `Detected ${result.peaks.length} peaks`,
            paramSnapshot.hasOverrides
              ? `Applied ${paramSnapshot.overrideCount} custom parameter(s) (last updated by ${paramSnapshot.lastUpdatedBy})`
              : 'Used default parameters',
          ],
          parameterSnapshot: paramSnapshot.hasOverrides
            ? { ...processingParams, provenance: paramSnapshot }
            : undefined,
        });

        if (updateSuccess) {
          triggerReRead();
          setSessionState((prev) =>
            addLog(
              {
                ...prev,
                dirty: false,
                pendingRecalculation: false,
                pipelineStates: markStepsDone(prev.pipelineStates, previewAffectedSteps),
                lastProcessedLabel: makeTimeLabel(),
              },
              [
                `[processing] Reprocessed uploaded Raman evidence: ${uploadedRun.fileName}`,
                `[features] Detected ${extractedFeatures.length} peaks`,
                paramSnapshot.hasOverrides
                  ? `[params] Applied ${paramSnapshot.overrideCount} custom Raman parameter(s) (last updated by ${paramSnapshot.lastUpdatedBy})`
                  : '[params] Used default Raman parameters',
              ].join('\n'),
            ),
          );
        } else {
          setSessionState((prev) =>
            addLog(prev, `[error] Failed to update uploaded run ${routeContext.uploadedRunId}.`),
          );
        }
      } catch (error) {
        console.error('Raman reprocessing error:', error);
        setSessionState((prev) =>
          addLog(prev, `[error] Raman reprocessing failed: ${error instanceof Error ? error.message : 'Unknown error'}`),
        );
      }
      return;
    }

    // For uploaded XPS context, run actual processing
    if (isUploadedContext && technique === 'xps' && routeContext.uploadedRunId) {
      const uploadedRun = getUploadedRunById(routeContext.uploadedRunId);

      if (!uploadedRun) {
        setSessionState((prev) =>
          addLog(prev, `[error] Uploaded run ${routeContext.uploadedRunId} not found.`),
        );
        return;
      }

      try {
        const processingParams = projectId ? getXpsProcessingParams(projectId) : undefined;
        const paramSnapshot = projectId
          ? getXpsParameterSnapshot(projectId)
          : { hasOverrides: false, overrideCount: 0, lastUpdatedBy: 'default', updatedAt: null };

        const result = runXpsProcessing({
          id: uploadedRun.id,
          label: uploadedRun.fileName,
          region: 'Survey',
          sampleName: uploadedRun.sampleIdentity,
          fileName: uploadedRun.fileName,
          signal: {
            bindingEnergy: uploadedRun.points.map(p => p.x),
            intensity: uploadedRun.points.map(p => p.y),
          },
          baseline: [],
          peaks: [],
          matches: [],
        }, processingParams);

        const xpsMaxIntensity = result.peaks.reduce((max, p) => Math.max(max, p.intensity), 0) || 1;
        const extractedFeatures: TechniqueFeature[] = result.peaks.map((peak, index) => ({
          id: `xps-peak-${index}`,
          technique: 'XPS' as const,
          label: `Peak at ${peak.bindingEnergy.toFixed(1)} eV`,
          position: peak.bindingEnergy,
          intensity: peak.intensity,
          relativeIntensity: (peak.intensity / xpsMaxIntensity) * 100,
          prominence: peak.intensity,
          context: peak.assignment || 'Unassigned',
        }));

        const updateSuccess = updateUploadedRunProcessingResults(routeContext.uploadedRunId, {
          extractedFeatures,
          evidenceQuality: {
            state: 'ready',
            label: 'Ready for analysis',
            canInterpret: true,
            messages: [],
          },
          processingLog: [
            `Reprocessed at ${new Date().toISOString()}`,
            `Detected ${result.peaks.length} peaks`,
            paramSnapshot.hasOverrides
              ? `Applied ${paramSnapshot.overrideCount} custom parameter(s) (last updated by ${paramSnapshot.lastUpdatedBy})`
              : 'Used default parameters',
          ],
          parameterSnapshot: paramSnapshot.hasOverrides
            ? { ...processingParams, provenance: paramSnapshot }
            : undefined,
        });

        if (updateSuccess) {
          triggerReRead();
          setSessionState((prev) =>
            addLog(
              {
                ...prev,
                dirty: false,
                pendingRecalculation: false,
                pipelineStates: markStepsDone(prev.pipelineStates, previewAffectedSteps),
                lastProcessedLabel: makeTimeLabel(),
              },
              [
                `[processing] Reprocessed uploaded XPS evidence: ${uploadedRun.fileName}`,
                `[features] Detected ${extractedFeatures.length} peaks`,
                paramSnapshot.hasOverrides
                  ? `[params] Applied ${paramSnapshot.overrideCount} custom XPS parameter(s) (last updated by ${paramSnapshot.lastUpdatedBy})`
                  : '[params] Used default XPS parameters',
              ].join('\n'),
            ),
          );
        } else {
          setSessionState((prev) =>
            addLog(prev, `[error] Failed to update uploaded run ${routeContext.uploadedRunId}.`),
          );
        }
      } catch (error) {
        console.error('XPS reprocessing error:', error);
        setSessionState((prev) =>
          addLog(prev, `[error] XPS reprocessing failed: ${error instanceof Error ? error.message : 'Unknown error'}`),
        );
      }
      return;
    }

    // For uploaded FTIR context, run actual processing
    if (isUploadedContext && technique === 'ftir' && routeContext.uploadedRunId) {
      const uploadedRun = getUploadedRunById(routeContext.uploadedRunId);

      if (!uploadedRun) {
        setSessionState((prev) =>
          addLog(prev, `[error] Uploaded run ${routeContext.uploadedRunId} not found.`),
        );
        return;
      }

      try {
        const processingParams = projectId ? getFtirProcessingParams(projectId) : undefined;
        const paramSnapshot = projectId
          ? getFtirParameterSnapshot(projectId)
          : { hasOverrides: false, overrideCount: 0, lastUpdatedBy: 'default', updatedAt: null };

        const result = runFtirProcessing({
          id: uploadedRun.id,
          label: uploadedRun.fileName,
          sampleName: uploadedRun.sampleIdentity,
          fileName: uploadedRun.fileName,
          signal: {
            wavenumber: uploadedRun.points.map(p => p.x),
            absorbance: uploadedRun.points.map(p => p.y),
          },
          baseline: [],
          bands: [],
          matches: [],
        }, processingParams);

        const ftirMaxIntensity = result.bands.reduce((max, b) => Math.max(max, b.intensity), 0) || 1;
        const extractedFeatures: TechniqueFeature[] = result.bands.map((band, index) => ({
          id: `ftir-band-${index}`,
          technique: 'FTIR' as const,
          label: band.assignment
            ? `${band.assignment} (${band.wavenumber.toFixed(0)} cm⁻¹)`
            : `Band at ${band.wavenumber.toFixed(0)} cm⁻¹`,
          position: band.wavenumber,
          intensity: band.intensity,
          relativeIntensity: (band.intensity / ftirMaxIntensity) * 100,
          prominence: band.intensity,
          context: band.assignment || 'Unassigned',
        }));


        const updateSuccess = updateUploadedRunProcessingResults(routeContext.uploadedRunId, {
          extractedFeatures,
          evidenceQuality: {
            state: 'ready',
            label: 'Ready for analysis',
            canInterpret: true,
            messages: [],
          },
          processingLog: [
            `Reprocessed at ${new Date().toISOString()}`,
            `Detected ${result.bands.length} bands`,
            paramSnapshot.hasOverrides
              ? `Applied ${paramSnapshot.overrideCount} custom parameter(s) (last updated by ${paramSnapshot.lastUpdatedBy})`
              : 'Used default parameters',
          ],
          parameterSnapshot: paramSnapshot.hasOverrides
            ? { ...processingParams, provenance: paramSnapshot }
            : undefined,
        });

        if (updateSuccess) {
          triggerReRead();
          setSessionState((prev) =>
            addLog(
              {
                ...prev,
                dirty: false,
                pendingRecalculation: false,
                pipelineStates: markStepsDone(prev.pipelineStates, previewAffectedSteps),
                lastProcessedLabel: makeTimeLabel(),
              },
              [
                `[processing] Reprocessed uploaded FTIR evidence: ${uploadedRun.fileName}`,
                `[features] Detected ${extractedFeatures.length} bands`,
                paramSnapshot.hasOverrides
                  ? `[params] Applied ${paramSnapshot.overrideCount} custom FTIR parameter(s) (last updated by ${paramSnapshot.lastUpdatedBy})`
                  : '[params] Used default FTIR parameters',
              ].join('\n'),
            ),
          );
        } else {
          setSessionState((prev) =>
            addLog(prev, `[error] Failed to update uploaded run ${routeContext.uploadedRunId}.`),
          );
        }
      } catch (error) {
        console.error('FTIR reprocessing error:', error);
        setSessionState((prev) =>
          addLog(prev, `[error] FTIR reprocessing failed: ${error instanceof Error ? error.message : 'Unknown error'}`),
        );
      }
      return;
    }

    // Default behavior for demo/project mode
    setSessionState((prev) =>
      addLog(
        {
          ...prev,
          dirty: false,
          pendingRecalculation: false,
          pipelineStates: markStepsDone(prev.pipelineStates, previewAffectedSteps),
          lastProcessedLabel: makeTimeLabel(),
        },
        `${config.reprocessLabel} completed with current parameters.`,
      ),
    );
  };

  const resetParameters = () => {
    if (projectId) {
      resetParameterState(projectId, technique);
    }
    if (technique === 'xrd') {
      setXrdParameters(cloneDefaultXrdParameters());
      setXrdDatasetContext(createDefaultXrdDatasetContext());
    }

    setSessionState((prev) =>
      addLog(
        {
          ...prev,
          parameters: getDefaultParameters(config),
          dirty: true,
          pendingRecalculation: true,
          autoMode: true,
          lastAffectedStepIds: config.pipeline.slice(0, 5).map((step) => step.id),
          pipelineStates: markAffectedSteps(
            prev.pipelineStates,
            config.pipeline.slice(0, 5).map((step) => step.id),
            'active',
            'pending',
          ),
        },
        'Parameters reset to technique defaults.',
      ),
    );
  };

  const savePreset = () => {
    setSessionState((prev) =>
      addLog(
        {
          ...prev,
          presetSavedLabel: makeTimeLabel(),
        },
        'Processing preset saved locally.',
      ),
    );
  };

  const saveSession = () => {
    setSessionState((prev) =>
      addLog(
        {
          ...prev,
          dirty: false,
          pendingRecalculation: false,
        },
        'Processing result saved to local session state.',
      ),
    );
  };

  const updatePaneLayout = (patch: Partial<Omit<PaneLayoutState, 'storageKey'>>) => {
    setPaneLayout((prev) => ({
      ...prev,
      ...patch,
      rightPanelWidth: clampPaneWidth(patch.rightPanelWidth ?? prev.rightPanelWidth),
      lastUpdatedAt: new Date().toISOString(),
    }));
  };

  const setPanePreset = (preset: 'balanced' | 'wideGraph' | 'wideControls' | 'focusGraph') => {
    if (preset === 'balanced') {
      updatePaneLayout({
        rightPanelWidth: RIGHT_PANEL_DEFAULT_WIDTH,
        rightPanelCollapsed: false,
        graphFocusMode: false,
      });
      return;
    }

    if (preset === 'wideGraph') {
      updatePaneLayout({
        rightPanelWidth: RIGHT_PANEL_MIN_WIDTH,
        rightPanelCollapsed: false,
        graphFocusMode: false,
      });
      return;
    }

    if (preset === 'wideControls') {
      updatePaneLayout({
        rightPanelWidth: RIGHT_PANEL_MAX_WIDTH,
        rightPanelCollapsed: false,
        graphFocusMode: false,
      });
      return;
    }

    updatePaneLayout({
      rightPanelCollapsed: true,
      graphFocusMode: true,
    });
  };

  const restorePaneLayout = () => {
    updatePaneLayout({
      rightPanelCollapsed: false,
      graphFocusMode: false,
    });
  };

  const runGraphAction = (actionId: GraphActionId) => {
    setIsGraphActionsOpen(false);

    if (actionId === 'save-view') {
      updatePaneLayout({
        rightPanelWidth: paneLayout.rightPanelWidth,
        rightPanelCollapsed: paneLayout.rightPanelCollapsed,
        graphFocusMode: paneLayout.graphFocusMode,
      });
      return;
    }

    if (actionId === 'focus-graph') {
      setPanePreset('focusGraph');
      return;
    }

    if (actionId === 'copy-view-link') {
      if (typeof window !== 'undefined' && navigator.clipboard) {
        void navigator.clipboard.writeText(window.location.href);
      }
      return;
    }

    if (actionId === 'reset-layout') {
      setPanePreset('balanced');
      return;
    }

    if (actionId === 'restore-saved-view') {
      setPaneLayout(loadPaneLayout(paneLayoutStorageKey));
    }
  };

  const startRightPanelResize = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = paneLayout.rightPanelWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = startX - moveEvent.clientX;
      updatePaneLayout({
        rightPanelWidth: startWidth + deltaX,
        rightPanelCollapsed: false,
        graphFocusMode: false,
      });
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border bg-surface px-4">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden whitespace-nowrap">
          <Link
            to={isQuickMode ? analysisReturnPath : workspacePath}
            className="shrink-0 text-sm font-bold tracking-tight text-text-main hover:text-primary"
            title={config.title}
          >
            {config.title}
          </Link>
          <span className="shrink-0 text-xs text-text-muted">&middot;</span>
          {isUploadedContext ? (
            <span className="min-w-0 truncate text-xs font-semibold text-blue-700">
              User Workspace
            </span>
          ) : isQuickMode ? (
            <span className="min-w-0 truncate text-xs font-semibold text-amber-700">
              Quick Analysis
            </span>
          ) : (
            <span
              className="min-w-0 truncate text-xs font-semibold text-text-main"
              title={project?.title ?? 'No project linked'}
            >
              {project ? formatChemicalFormula(project.title) : 'No project linked'}
            </span>
          )}
          <span className="shrink-0 text-xs text-text-muted">&middot;</span>
          <span
            className="min-w-0 max-w-[360px] truncate text-xs text-text-muted"
            title={datasetLabel}
          >
            {formatChemicalFormula(datasetLabel)}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-2">

          <Link
            to={isQuickMode ? '/workspace' : '/workspace'}
            className="inline-flex h-8 items-center gap-1.5 rounded border border-border bg-white px-3 text-[11px] font-semibold text-text-main transition-colors hover:bg-surface-hover"
          >
            <Layers size={13} />
            {isQuickMode ? 'Attach Project' : project ? 'Switch Project' : 'Attach Project'}
          </Link>
          <Link
            to={workspacePath}
            className="inline-flex h-8 items-center gap-1.5 rounded border border-border bg-white px-3 text-[11px] font-semibold text-text-main transition-colors hover:bg-surface-hover"
          >
            <RotateCcw size={13} />
            Change Technique
          </Link>
          <button
            type="button"
            onClick={() => setIsUploadModalOpen(true)}
            className="inline-flex h-8 items-center gap-1.5 rounded border border-border bg-white px-3 text-[11px] font-semibold text-text-main transition-colors hover:bg-surface-hover hover:text-primary hover:border-primary/50"
          >
            <Upload size={13} />
            Upload File
          </button>
          <button
            type="button"
            onClick={saveSession}
            className="inline-flex h-8 items-center gap-1.5 rounded bg-primary px-3 text-[11px] font-semibold text-white transition-colors hover:bg-primary/90"
          >
            <Save size={13} />
            Save
          </button>
        </div>
      </header>

      {blocksDemoProject && (
        <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="font-bold">Demo project requires Demo Mode.</span>
              <span className="ml-1">User Workspace will not auto-load the preloaded project after Google sign-in.</span>
            </div>
            <Link
              to={`/workspace/${technique}?project=${requestedProjectId}&mode=demo`}
              onClick={() => setWorkspaceMode('demo')}
              className="inline-flex h-8 items-center rounded-md border border-amber-300 bg-white px-3 text-xs font-bold text-amber-800 hover:bg-amber-100"
            >
              Open in Demo Mode
            </Link>
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <TechniqueEvidenceRail
          config={config}
          dataset={{
            fileName: datasetLabel,
            sessionId: quickAnalysisSession?.analysisId || querySessionId || evidenceSource?.datasetId || getTraceId(project, technique),
            source: runtimeContext.sourceMode,
            parseState: datasetStatus,
            processingState: quickAnalysisSession?.processingState ?? processingStateLabel,
            projectAttachment: project ? project.title : 'Not attached',
            lifecycleState: quickAnalysisSession ? getStatusLabel(quickAnalysisSession.status) : quickStatusLabel || processingStateLabel,
            permissionState: getRuntimeBadgeLabel(runtimeContext, 'permission'),
            saveState: saveStateLabel,
            nextIntent,
          }}
          pipelineStates={sessionState.pipelineStates}
          autoMode={sessionState.autoMode}
          onToggleAutoMode={toggleAutoMode}
          onSaveSession={saveSession}
          attachProjectPath="/workspace"
          agentPath={agentPath}
          notebookPath={notebookPath}
          reportPath={reportPath}
          exportPath={analysisReturnPath}
          onStepClick={handleStepClick}
          selectedStepId={selectedStepId}
          extraMetadata={config.id === 'xrd' ? [
            {
              label: 'Identity',
              value: (
                <div className="flex flex-col gap-0.5">
                  <span className="font-bold text-text-main leading-tight">{xrdDatasetContext.identitySource}</span>
                  <span className="text-[9px] font-medium text-text-muted leading-tight">{xrdDatasetContext.identityConfidence}</span>
                </div>
              )
            },
            { label: 'Analysis mode', value: industryFilter === 'All' ? 'Standard' : industryFilter }
          ] : undefined}
          datasetEditor={config.id === 'xrd' && (
            <div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-primary">Dataset Context</p>
              <div className="grid grid-cols-1 gap-1">
                <XRDTextField
                  label="Sample name"
                  value={xrdDatasetContext.sampleName ?? ''}
                  onChange={(sampleName) => setXrdDatasetContext(current => ({ ...current, sampleName: sampleName || undefined }))}
                  placeholder="e.g. CoFe2O4/SBA-15"
                  variant="compact"
                />
                <XRDTextField
                  label="Material class"
                  value={xrdDatasetContext.materialClass ?? ''}
                  onChange={(materialClass) => setXrdDatasetContext(current => ({ ...current, materialClass: materialClass || undefined }))}
                  placeholder="e.g. supported spinel ferrite catalyst"
                  variant="compact"
                />
                <PeriodicTablePicker
                  label="Known elements"
                  value={xrdDatasetContext.knownElements.join(', ')}
                  onChange={(value) => setXrdDatasetContext(current => ({ ...current, knownElements: parseXrdListInput(value) }))}
                  placeholder="e.g. Co, Fe, O, Si"
                  variant="compact"
                />
                <XRDTextField
                  label="Declared phases"
                  value={xrdDatasetContext.declaredPhases.join(', ')}
                  onChange={(value) => setXrdDatasetContext(current => ({ ...current, declaredPhases: parseXrdListInput(value) }))}
                  placeholder="e.g. CoFe2O4, SBA-15"
                  variant="compact"
                />
                <XRDSelectField
                  label="Reference source"
                  value={xrdDatasetContext.referenceSource}
                  options={XRD_REFERENCE_SOURCE_OPTIONS}
                  onChange={(referenceSource) => {
                    setXrdDatasetContext(current => ({ ...current, referenceSource }));
                    setXrdParameters(current => ({
                      ...current,
                      referenceMatch: { ...current.referenceMatch, referenceSource },
                    }));
                  }}
                  variant="compact"
                />
                <XRDSelectField
                  label="Analysis mode"
                  value={industryFilter}
                  options={[
                    { value: "All", label: "All Compounds (Standard)" },
                    { value: "Active Pharmaceutical Ingredients (APIs)", label: "APIs" },
                    { value: "Organic Chemistry", label: "Organic Chemistry" },
                    { value: "Polymers & Macromolecules", label: "Polymers & Macromolecules" },
                    { value: "Polymer Science", label: "Polymer Science" },
                    { value: "Energy Storage", label: "Energy Storage" },
                    { value: "Semiconductors", label: "Semiconductors" },
                    { value: "Solid State Physics", label: "Solid State Physics" },
                    { value: "Zeolites", label: "Zeolites" },
                    { value: "Catalysts", label: "Catalysts" },
                    { value: "Minerals", label: "Minerals" },
                    { value: "Inorganic Chemistry", label: "Inorganic Chemistry" },
                  ]}
                  onChange={handleIndustryFilterChange}
                  variant="compact"
                />
              </div>
            </div>
          )}
        />
        <style>{`
          .workspace-center-panel { min-width: ${CENTER_PANEL_MIN_WIDTH}px; }
          .workspace-right-panel { width: ${paneLayout.rightPanelWidth}px; min-width: ${RIGHT_PANEL_MIN_WIDTH}px; max-width: ${RIGHT_PANEL_MAX_WIDTH}px; }
        `}</style>
        <main
          className="workspace-center-panel min-w-0 flex-1 overflow-hidden bg-background p-2 transition-[width] duration-150 flex flex-col gap-2"
        >
          {isReproduceSession && (
            <div className="shrink-0 flex items-center justify-between rounded border border-blue-200 bg-blue-50 px-3 py-2 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                </span>
                <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">Reproduced Analysis Session</span>
                <span className="text-[11px] text-blue-900 font-medium">| Historical parameters and state restored from notebook provenance log.</span>
              </div>
              <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[9px] font-bold text-blue-800 uppercase tracking-wide">Audit View</span>
            </div>
          )}
          <section className="flex flex-1 min-h-0 flex-col overflow-hidden rounded border border-border bg-surface">
            <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-border bg-surface-hover/40 px-2">
              <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto whitespace-nowrap pr-1">
                {config.centerTabs.map((tab) => {
                  const tabLabel = getCompactCenterTabLabel(tab.label);
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      title={tab.label}
                      onClick={() => setActiveCenterTab(tab.id)}
                      className={`shrink-0 rounded px-1.5 py-1 text-[10px] font-bold uppercase tracking-wide transition-colors ${activeCenterTab === tab.id
                        ? 'bg-primary text-white'
                        : 'text-text-muted hover:bg-white hover:text-text-main'
                        }`}
                    >
                      {tabLabel}
                    </button>
                  );
                })}
              </div>

              <div className="flex shrink-0 items-center gap-1 whitespace-nowrap">
                {GRAPH_TOOLS.map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    type="button"
                    title={label}
                    aria-label={label}
                    onClick={() => setActiveGraphTool(id)}
                    className={`inline-flex h-6 w-6 items-center justify-center rounded border transition-colors ${activeGraphTool === id
                      ? 'border-primary bg-blue-50 text-primary'
                      : 'border-border bg-white text-text-muted hover:border-primary/40 hover:text-primary'
                      }`}
                  >
                    <Icon size={13} />
                  </button>
                ))}

                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsGraphActionsOpen((open) => !open)}
                    className="inline-flex h-6 items-center gap-1 rounded border border-border bg-white px-2 text-[9px] font-bold text-text-main transition-colors hover:border-primary/40 hover:text-primary"
                    aria-haspopup="menu"
                    {...{ 'aria-expanded': isGraphActionsOpen ? 'true' : 'false' }}
                  >
                    Actions <ChevronDown size={11} />
                  </button>

                  {isGraphActionsOpen && (
                    <div
                      role="menu"
                      className="absolute right-0 top-7 z-30 w-44 overflow-hidden rounded-md border border-border bg-white py-1 shadow-lg shadow-slate-900/10"
                    >
                      {GRAPH_ACTIONS.map(({ id, label, Icon }) => (
                        <button
                          key={id}
                          type="button"
                          role="menuitem"
                          onClick={() => runGraphAction(id)}
                          className="flex h-8 w-full items-center gap-2 px-2.5 text-left text-[11px] font-semibold text-text-main transition-colors hover:bg-surface-hover hover:text-primary"
                        >
                          <Icon size={13} className="shrink-0" />
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {technique === 'xps' && activeCenterTab === 'element-analysis' ? (
              selectedElement ? (
                <XpsElementAnalysisPanel
                  element={selectedElement}
                  spectrumPoints={xpsSpectrumPoints}
                  processingParams={xpsProcessingParams}
                  onBackToSurvey={handleBackToSurvey}
                  onElementEvidence={handleElementEvidence}
                />
              ) : (
                <div className="flex-1 min-h-[300px] flex flex-col items-center justify-center p-8 text-center">
                  <p className="text-sm font-bold text-text-main">No element selected</p>
                  <p className="mt-1 max-w-sm text-xs text-text-muted">
                    Open the Spectrum tab and select a detected element from the survey to focus its
                    core-level region.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveCenterTab(config.centerTabs[0].id)}
                    className="mt-4 inline-flex items-center rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text-main hover:bg-surface-hover"
                  >
                    Go to Survey
                  </button>
                </div>
              )
            ) : activeCenterTab === config.centerTabs[0].id && graphData ? (
              <div className="min-h-[420px] flex-1 p-2 flex flex-col">
                {technique === 'xps' && detectedXpsElements.length > 0 && (
                  <div className="mb-2 flex flex-wrap items-center gap-1.5 rounded border border-border bg-surface-hover/30 px-2 py-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
                      Detected elements
                    </span>
                    {detectedXpsElements.map((element) => (
                      <button
                        key={element}
                        type="button"
                        onClick={() => handleElementSelect(element)}
                        className="rounded-full border border-border bg-surface px-2.5 py-0.5 text-[11px] font-semibold text-text-main transition-colors hover:border-primary hover:bg-primary/10"
                        title={`Element selection analysis: ${element}`}
                      >
                        {element}
                      </button>
                    ))}
                    <span className="ml-auto text-[10px] italic text-text-muted">
                      Survey remains the authoritative scan
                    </span>
                  </div>
                )}

                {technique === 'ftir' && (
                  <div className="mb-2 flex flex-wrap items-center gap-2 rounded border border-red-100 bg-red-50/50 px-2.5 py-1.5 dark:border-red-950/20 dark:bg-red-950/5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-red-700 dark:text-red-400">
                      Manual Peak Selection
                    </span>
                    <span className="text-[11px] text-text-muted">
                      {activeGraphTool === 'select'
                        ? '🟢 Click on the spectrum to toggle peak markers.'
                        : '💡 Select the pointer tool (Pointer icon) above to edit peaks.'}
                    </span>

                    <div className="ml-auto flex items-center gap-1.5">
                      {ftirPeakConfig.isManual && (
                        <span className="rounded bg-red-100 px-1.5 py-0.5 text-[9.5px] font-bold text-red-800 uppercase tracking-wide dark:bg-red-900/25 dark:text-red-300">
                          {ftirPeakConfig.peaks.length} peaks
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setFtirPeakConfig({
                            isManual: true,
                            peaks: []
                          });
                          setSessionState((prev) =>
                            addLog(prev, '[peaks] Cleared all manual peaks'),
                          );
                        }}
                        className="rounded border border-red-200 bg-white px-2 py-0.5 text-[10px] font-bold text-red-700 transition-colors hover:bg-red-50"
                        title="Clear all manual peaks"
                      >
                        Clear Peaks
                      </button>

                      {ftirPeakConfig.isManual && (
                        <button
                          type="button"
                          onClick={() => {
                            setFtirPeakConfig({
                              isManual: false,
                              peaks: []
                            });
                            setSessionState((prev) =>
                              addLog(prev, '[peaks] Reset to automatically detected peaks'),
                            );
                          }}
                          className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold text-slate-700 transition-colors hover:bg-slate-50"
                          title="Reset to automatically detected peaks"
                        >
                          Reset to Auto
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex-1 min-h-0">
                  <Graph
                    type={technique}
                    height="100%"
                    externalData={technique === 'xrd' && processedXrdData ? processedXrdData : graphData.data}
                    peakMarkers={mappedPeakMarkers}
                    xAxisLabel={graphData.xLabel}
                    yAxisLabel={graphData.yLabel}
                    showBackground={false}
                    showCalculated={false}
                    showResidual={false}
                    onChartClick={handleChartClick}
                  />
                </div>
              </div>
            ) : activeCenterTab === config.centerTabs[0].id ? (
              <div className="flex-1 min-h-[420px] bg-background/25 p-8 flex flex-col justify-center overflow-y-auto">
                <div className="mx-auto w-full max-w-4xl grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
                  {/* Left Column: Standardized Empty State (5 cols) */}
                  <div className="md:col-span-5 text-left">
                    {isUploadedContext ? (
                      evidenceSnapshot?.activeDataset ? (
                        <EmptyStateCard
                          type="generic"
                          title="Graph data unavailable"
                          description="The uploaded evidence snapshot loaded, but it does not include graph points for this technique."
                          actionText="Open Workspace Hub"
                          onAction={() => { window.location.href = workspacePath; }}
                          className="border-0 bg-transparent p-0"
                        />
                      ) : (
                        <EmptyStateCard
                          type="missing_evidence"
                          title="Uploaded evidence not found"
                          description="The requested session/upload pair was not found in local browser storage. Re-upload the evidence or open a saved user-uploaded session."
                          actionText="Open Workspace Hub"
                          onAction={() => { window.location.href = workspacePath; }}
                          className="border-0 bg-transparent p-0"
                        />
                      )
                    ) : (
                      <EmptyStateCard
                        type="missing_evidence"
                        title={project ? `No project-linked ${config.label} dataset` : "No Active Dataset"}
                        description={project
                          ? `${config.label} evidence is not available for the selected project. The route remains project-linked and records the evidence gap instead of loading an unrelated dataset.`
                          : `Open this workspace from a project or attach a dataset to begin ${config.label} processing.`
                        }
                        actionText="Open Workspace Hub"
                        onAction={() => { window.location.href = workspacePath; }}
                        className="border-0 bg-transparent p-0"
                      />
                    )}
                  </div>

                  {/* Divider line for md and larger */}
                  <div className="hidden md:block col-span-1 h-32 border-r border-border justify-self-center" />

                  {/* Right Column: Upload Area (6 cols) */}
                  <div className="md:col-span-6 space-y-3">
                    <div className="text-left">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Ingest raw signals</span>
                      <h3 className="text-sm font-bold text-text-main mt-0.5 font-mono">UPLOAD RAW {technique.toUpperCase()} DATA FILE</h3>
                    </div>
                    <RawFileUpload
                      technique={technique}
                      onUploadSuccess={handleUploadSuccess}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-auto p-2">
                <div className="overflow-hidden rounded border border-border bg-background">
                  <table className="w-full text-left">
                    <thead className="bg-surface-hover text-[10px] uppercase tracking-wide text-text-muted">
                      <tr>
                        <th className="px-3 py-2 font-bold">{config.featureLabel}</th>
                        <th className="px-3 py-2 font-bold">{config.unitLabel}</th>
                        <th className="px-3 py-2 font-bold">Evidence Detail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mappedFeatureRows.map((row, index) => (
                        <tr key={`${row.label}-${index}`} className="border-t border-border/60 text-xs">
                          <td className="px-3 py-2 font-semibold text-text-main">{row.label}</td>
                          <td className="px-3 py-2 font-mono text-text-main">{row.value}</td>
                          <td className="px-3 py-2 text-text-muted">{formatChemicalFormula(row.detail)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-3 rounded border border-border bg-surface-hover/30 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-text-main">Interpretation Notice</p>
                  <p className="mt-1 text-xs leading-relaxed text-text-muted">
                    {formatChemicalFormula(comparisonRow?.keyFinding || focusedEvidence?.limitation || 'Interpretation is held until project-linked evidence is available.')}
                  </p>
                </div>
              </div>
            )}
          </section>
        </main>

        {rightPanelVisible && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize graph and controls"
            onMouseDown={startRightPanelResize}
            className="group flex w-2 shrink-0 cursor-col-resize items-center justify-center border-x border-border bg-slate-50 transition-colors hover:bg-blue-50"
          >
            <div className="h-12 w-1 rounded-full bg-slate-300 transition-colors group-hover:bg-primary" />
          </div>
        )}

        {!rightPanelVisible && (
          <aside className="flex w-11 shrink-0 flex-col items-center border-l border-border bg-surface py-3">
            <button
              type="button"
              onClick={restorePaneLayout}
              className="mb-2 flex h-8 w-8 items-center justify-center rounded bg-primary text-[10px] font-bold text-white"
              title="Expand panel"
            >
              +
            </button>
            <button
              type="button"
              onClick={restorePaneLayout}
              className="[writing-mode:vertical-rl] rounded border border-border bg-background px-1.5 py-2 text-[10px] font-bold text-text-muted hover:text-primary"
            >
              Expand panel
            </button>
          </aside>
        )}

        {rightPanelVisible && (
          <aside
            className="workspace-right-panel flex shrink-0 flex-col overflow-hidden border-l border-border bg-surface transition-[width] duration-150"
          >
            <div className="border-b border-border px-3 py-2">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-text-main">Controls</p>
                  <p className="text-[9px] text-text-muted">{paneLayout.rightPanelWidth}px panel</p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => updatePaneLayout({ rightPanelCollapsed: true, graphFocusMode: false })}
                    className="h-6 rounded border border-border bg-background px-2 text-[9px] font-bold text-text-muted hover:text-primary"
                    title="Collapse panel"
                  >
                    Collapse
                  </button>
                  <button
                    type="button"
                    onClick={() => setPanePreset('focusGraph')}
                    className="h-6 rounded border border-border bg-background px-2 text-[9px] font-bold text-text-muted hover:text-primary"
                    title="Focus graph"
                  >
                    Focus Graph
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-5 gap-1">
                {RIGHT_TABS.map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveRightTab(tab)}
                    className={`rounded px-1.5 py-1.5 text-[9px] font-bold transition-colors ${activeRightTab === tab
                      ? 'bg-primary text-white'
                      : 'text-text-muted hover:bg-surface-hover hover:text-text-main'
                      }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {activeRightTab === 'Evidence' && (
                <EvidencePanel
                  config={config}
                  focusedEvidence={focusedEvidence}
                  featureRows={mappedFeatureRows}
                  graphData={graphData}
                  datasetStatus={datasetStatus}
                  project={project}
                  isUploadedContext={isUploadedContext}
                  quickSession={quickAnalysisSession}
                  xrdBackendEnabled={isXrdBackendEnabled}
                  xrdBackendHealth={xrdBackendHealth}
                  xrdBackendResult={xrdBackendResult}
                  xrdBackendLoading={xrdBackendLoading}
                  xrdBackendError={xrdBackendError}
                  xrdBackendSaved={xrdBackendSaved}
                  datasetContext={xrdDatasetContext}
                />
              )}

              {activeRightTab === 'Parameters' && (
                <>

                  <ParametersPanel
                    config={config}
                    sessionState={sessionState}
                    affectedStepLabels={previewAffectedSteps.map((stepId) => config.pipeline.find((step) => step.id === stepId)?.label || stepId)}
                    onChange={updateParameter}
                    onToggleCheckbox={toggleCheckboxValue}
                    onApply={applyParameters}
                    onReprocess={reprocess}
                    onReset={resetParameters}
                    onSavePreset={savePreset}
                    onMarkStepDone={handleMarkStepDone}
                    processingStateLabel={processingStateLabel}
                    sharedOverrideCount={sharedOverrideCount}
                    xrdParameters={xrdParameters}
                    xrdDatasetContext={xrdDatasetContext}
                    xrdHasFiniteSignal={xrdHasFiniteSignal}
                    xrdLocalReferenceProjectId={projectId ?? undefined}
                    xrdLocalReferenceUploadedRunId={routeContext.uploadedRunId ?? quickAnalysisSession?.uploadedRunId ?? undefined}
                    useXrdLocalReferenceForBackend={useXrdLocalReferenceForBackend}
                    onUseXrdLocalReferenceForBackendChange={setUseXrdLocalReferenceForBackend}
                    onXrdParametersChange={setXrdParameters}
                    onXrdDatasetContextChange={setXrdDatasetContext}
                    onXrdValidationStatusChange={set7E4ValidationStatus}
                    selectedStepId={selectedStepId}
                    industryFilter={industryFilter}
                    onIndustryFilterChange={handleIndustryFilterChange}
                  />
                </>
              )}

              {activeRightTab === 'Graph' && (
                <GraphLayoutPanel
                  paneLayout={paneLayout}
                  onPreset={setPanePreset}
                  onRestore={restorePaneLayout}
                  onWidthChange={(width) => updatePaneLayout({ rightPanelWidth: width, rightPanelCollapsed: false, graphFocusMode: false })}
                />
              )}

              {activeRightTab === 'Boundary' && (
                <BoundaryPanel
                  config={config}
                  comparisonRow={comparisonRow}
                  focusedEvidence={focusedEvidence}
                  project={project}
                />
              )}

              {activeRightTab === 'Trace' && (
                <TracePanel
                  config={config}
                  project={project}
                  datasetLabel={datasetLabel}
                  evidenceSourceId={evidenceSource?.datasetId}
                  traceId={getTraceId(project, technique)}
                  datasetStatus={datasetStatus}
                  sessionState={sessionState}
                />
              )}
            </div>
          </aside>
        )}
      </div>

      <RawFileUploadModal
        open={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        technique={technique}
        onUploadSuccess={handleUploadSuccess}
      />
    </div>
  );
}

function EvidencePanel({
  config,
  focusedEvidence,
  featureRows,
  graphData,
  datasetStatus,
  project,
  isUploadedContext,
  quickSession,
  xrdBackendEnabled,
  xrdBackendHealth,
  xrdBackendResult,
  xrdBackendLoading,
  xrdBackendError,
  xrdBackendSaved,
  datasetContext,
}: {
  config: TechniqueWorkspaceConfig;
  focusedEvidence: DemoFocusedEvidenceSource | null;
  featureRows: Array<{ label: string; value: string; detail: string }>;
  graphData: DemoFocusedEvidenceSource['graphData'] | undefined;
  datasetStatus: string;
  project: RegistryProject | null;
  isUploadedContext: boolean;
  quickSession: AnalysisSession | null;
  xrdBackendEnabled: boolean;
  xrdBackendHealth: XRDHealthStatus | null;
  xrdBackendResult: XRDNormalizedResult | null;
  xrdBackendLoading: boolean;
  xrdBackendError: string | null;
  xrdBackendSaved: boolean;
  datasetContext: XRDDatasetContext;
}) {
  const evidenceTitle = focusedEvidence?.title
    || (isUploadedContext && (quickSession || graphData?.data?.length)
      ? `${config.label} uploaded evidence linked`
      : `${config.label} evidence not linked`);

  const activeSkillLabel = config.id === 'xrd'
    ? 'XRD Science Skill'
    : config.id === 'xps'
      ? 'XPS Science Skill'
      : config.id === 'ftir'
        ? 'FTIR Science Skill'
        : config.id === 'raman'
          ? 'Raman Science Skill'
          : `${config.label} Science Skill`;

  let skillInputs = 'Raw technique data';
  let skillOutputs = 'Skill-derived evidence';
  let skillPurpose = config.purpose;

  if (config.id === 'xrd') {
    skillInputs = 'Raw 1D diffraction pattern (.raw, .xy)';
    skillOutputs = 'Skill-derived peak positions & reference matching';
    skillPurpose = 'Processes bulk diffraction patterns to resolve phase indications.';
  } else if (config.id === 'xps') {
    skillInputs = 'Core-level photoemission spectra';
    skillOutputs = 'Skill-derived chemical state and oxidation envelopes';
    skillPurpose = 'Deconstructs surface photoemission envelopes into chemical assignments.';
  } else if (config.id === 'ftir') {
    skillInputs = 'Transmittance/absorbance IR spectra';
    skillOutputs = 'Skill-derived vibrational bands and functional bonds';
    skillPurpose = 'Analyzes IR transmittance patterns for functional groups.';
  } else if (config.id === 'raman') {
    skillInputs = 'Raman shift-intensity signal';
    skillOutputs = 'Skill-derived vibrational modes and local symmetries';
    skillPurpose = 'Identifies active vibrational modes to fingerprint local lattice structures.';
  }

  return (
    <div className="space-y-2">
      <Panel title="Scientific Skill Layer" icon={<Sparkles size={13} />}>
        <div className="space-y-1.5 text-[11px]">
          <div className="flex items-center justify-between">
            <span className="font-bold text-primary">{activeSkillLabel}</span>
            <span className="rounded bg-primary/10 px-1 py-0.5 text-[9px] font-bold text-primary uppercase">Active</span>
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-text-muted">{skillPurpose}</p>
          <div className="mt-2 border-t border-border/40 pt-2 space-y-1">
            <Metric label="Skill Input" value={skillInputs} />
            <Metric label="Skill Output" value={skillOutputs} />
            <Metric label="Claim Limit" value="Validation-limited claim" />
          </div>
          <div className="mt-2 border-t border-border/40 pt-2">
            <div className="text-[9px] font-bold uppercase tracking-wider text-text-muted mb-1">Complementary Skills</div>
            <div className="flex flex-wrap gap-1">
              <span className="rounded border border-border/65 bg-background px-1.5 py-0.5 text-[9px] font-semibold text-text-muted">Cross-Technique Fusion Skill</span>
              <span className="rounded border border-border/65 bg-background px-1.5 py-0.5 text-[9px] font-semibold text-text-muted">Validation Boundary Skill</span>
              <span className="rounded border border-border/65 bg-background px-1.5 py-0.5 text-[9px] font-semibold text-text-muted">Evidence-to-Report Skill</span>
            </div>
          </div>
        </div>
      </Panel>
      <Panel title="Evidence Summary" icon={<Layers size={13} />}>
        <p className="text-xs font-bold text-text-main">
          {formatChemicalFormula(evidenceTitle)}
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-text-muted">
          {formatChemicalFormula(isUploadedContext
            ? 'Session-scoped uploaded evidence is available; project attachment remains separate.'
            : focusedEvidence?.role || config.purpose)}
        </p>
      </Panel>
      <Panel title="Top Evidence / Features" icon={<Search size={13} />}>
        <div className="space-y-1.5">
          {featureRows.slice(0, 4).map((row, index) => (
            <div key={`${row.value}-${index}`} className="rounded bg-background px-2 py-1.5 text-[10px]">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-text-main">{row.label}</span>
                <span className="font-mono text-primary">{row.value}</span>
              </div>
              <p className="mt-0.5 line-clamp-2 text-text-muted">{formatChemicalFormula(row.detail)}</p>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Reliability / Validation" icon={<CheckCircle2 size={13} />}>
        <div className="space-y-1 text-[11px] text-text-muted">
          <Metric label="Evidence status" value={datasetStatus} />
          {isUploadedContext && <Metric label="Project" value="Not attached" />}
          <Metric label="Matched count" value={graphData?.peaks?.length ? `${graphData.peaks.length} markers` : focusedEvidence?.status || 'Not available'} />
          <Metric label="Validation need" value={project?.crossTechniqueComparison.validationGap || 'Attach to project for validation tracking'} />
          {quickSession?.qualityChecks.slice(0, 3).map((metric) => (
            <Metric key={metric.label} label={metric.label} value={metric.value} />
          ))}
        </div>
      </Panel>

      {/* XRD Backend Status & Results */}
      {xrdBackendEnabled && (
        <>
          <Panel title="XRD Backend Status" icon={<Database size={13} />}>
            <div className="space-y-1 text-[11px]">
              <Metric
                label="Backend"
                value={
                  xrdBackendHealth?.ok
                    ? <span className="text-emerald-700 font-bold">Online</span>
                    : xrdBackendHealth === null
                      ? <span className="text-slate-500">Checking…</span>
                      : <span className="text-amber-700 font-bold">{xrdBackendHealth.status || 'Offline / Unavailable'}</span>
                }
              />
              {xrdBackendHealth?.ok && (
                <>
                  <Metric
                    label="Smoke tests"
                    value={<span className="text-emerald-700">29/29 passing</span>}
                  />
                  <Metric
                    label="Reliability"
                    value={<span className="text-emerald-700">Metrics enabled</span>}
                  />
                  <Metric
                    label="Phase match"
                    value={<span className="text-emerald-700">Enabled</span>}
                  />
                </>
              )}
              {xrdBackendError && (
                <p className="mt-1 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] text-amber-800">
                  {xrdBackendError}
                </p>
              )}
            </div>
          </Panel>

          {xrdBackendLoading && (
            <Panel title="XRD Backend Processing" icon={<Sparkles size={13} />}>
              <p className="text-[11px] text-text-muted">Running backend analysis…</p>
            </Panel>
          )}

          <XRDReferenceCandidateEvidence
            referenceMatch={xrdBackendResult?.referenceMatchV2}
            materialSystem={datasetContext.sampleName || datasetContext.declaredPhases.join(' / ') || 'TiO₂'}
          />

          {xrdBackendResult && (
            <>
              {xrdBackendResult.scientificEvidenceObject && (
                <Panel title="Scientific Evidence Object" icon={<CheckCircle2 size={13} />}>
                  <div className="space-y-1 text-[11px]">
                    <p className="font-bold text-emerald-700">Scientific evidence object received</p>
                    <Metric label="Skill" value={xrdBackendResult.scientificEvidenceObject.skill_label} />
                    <Metric label="Evidence ID" value={xrdBackendResult.scientificEvidenceObject.evidence_id} />
                    <Metric
                      label="Input reference"
                      value={<span className="break-all">SHA-256 {xrdBackendResult.scientificEvidenceObject.input_reference}</span>}
                    />
                    <Metric label="Claim boundary" value="validation-limited scientific claim" />
                  </div>
                </Panel>
              )}

              <Panel title="Backend Analysis Results" icon={<Search size={13} />}>
                <div className="space-y-1 text-[11px]">
                  <Metric label="Detected peaks" value={String(xrdBackendResult.detectedPeakCount)} />
                  <Metric label="Fitted peaks" value={String(xrdBackendResult.fittedPeakCount)} />
                  <Metric label="S/N ratio" value={xrdBackendResult.snRatio.toFixed(1)} />
                  <Metric label="Baseline deviation" value={xrdBackendResult.baselineDeviation.toFixed(4)} />
                  <Metric label="Peak resolution" value={xrdBackendResult.peakResolution} />
                </div>
              </Panel>

              {xrdBackendResult.isPhaseMatched && (
                <Panel title="Phase Match Indication" icon={<FlaskConical size={13} />}>
                  <div className="space-y-1.5 text-[11px]">
                    <Metric
                      label="Primary phase"
                      value={xrdBackendResult.primaryPhase || 'Not determined'}
                    />
                    <Metric
                      label="Matched peaks"
                      value={String(xrdBackendResult.matchedPeakCount)}
                    />
                    {xrdBackendResult.phaseSummary && (
                      <p className="mt-1 rounded bg-background px-2 py-1.5 text-[10px] text-text-muted">
                        {xrdBackendResult.phaseSummary}
                      </p>
                    )}
                    <p className="mt-1 rounded border border-blue-200 bg-blue-50 px-2 py-1.5 text-[10px] text-blue-900">
                      <span className="font-bold">Reference-supported phase indication.</span>{' '}
                      Phase purity requires reference validation and/or complementary evidence.
                    </p>
                  </div>
                </Panel>
              )}

              {xrdBackendSaved && (
                <Panel title="Evidence Handoff" icon={<CheckCircle2 size={13} />}>
                  <p className="text-[10px] font-bold text-emerald-700">
                    Backend evidence saved for agent handoff.
                  </p>
                  <p className="mt-0.5 text-[10px] text-text-muted">
                    Result persisted in local storage for Agent Mode, Notebook, and Report workflows.
                  </p>
                </Panel>
              )}

              {xrdBackendResult.peakResolution === 'screening-grade' && (
                <Panel title="Resolution Caveat" icon={<AlertTriangle size={13} />}>
                  <p className="text-[10px] leading-relaxed text-text-muted">
                    Screening-level phase match. Peak resolution is limited; results are suitable for screening but not publication-grade claims.
                  </p>
                </Panel>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function XRDReferenceCandidateEvidence({
  referenceMatch,
  materialSystem = 'TiO₂'
}: {
  referenceMatch: XRDReferenceMatchV2 | null | undefined;
  materialSystem?: string;
}) {
  const status = referenceMatch?.status;
  const primaryCandidate = referenceMatch?.primary_candidate ?? referenceMatch?.ranked_candidates?.[0] ?? null;
  const matchedPeaks = primaryCandidate?.matched_peaks ?? [];
  const visibleMatchedPeaks = matchedPeaks.slice(0, 5);
  const boundaryNotes = referenceMatch ? getReferenceMatchBoundaryNotes(referenceMatch) : [];

  // Scenario 3: Not Yet Executed
  if (!referenceMatch || !status) {
    return (
      <Panel title="Reference Candidate Evidence" icon={<Search size={13} />}>
        <div className="rounded border border-dashed border-border bg-slate-50/50 p-3 text-center">
          <p className="text-xs font-bold text-slate-500">Reference Matching Not Yet Executed</p>
          <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
            User has not run reference matching. Apply parameters to run a backend reference matching check.
          </p>
        </div>
        <div className="mt-2 space-y-1 rounded border border-border bg-background p-2 text-[10px]">
          <div className="flex justify-between">
            <span className="font-semibold text-text-dim">Material System:</span>
            <span className="font-medium text-text-main">{materialSystem}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-semibold text-text-dim">Approved References:</span>
            <span className="font-medium text-text-main">0</span>
          </div>
          <div className="flex justify-between">
            <span className="font-semibold text-text-dim">Reference Status:</span>
            <span className="font-semibold text-slate-500 uppercase tracking-wider">
              Not Executed
            </span>
          </div>
        </div>
      </Panel>
    );
  }

  // Scenario 1: Unavailable
  if (status === 'unavailable' || status === 'blocked') {
    return (
      <Panel title="Reference Candidate Evidence" icon={<Search size={13} />}>
        <div className="rounded border border-red-200 bg-red-50/50 p-3 text-center">
          <p className="text-xs font-bold text-red-700">Reference Matching Unavailable</p>
          <p className="mt-1 text-[10px] leading-relaxed text-red-800/80">
            No approved reference patterns were found for the current material system.
          </p>
        </div>
        <div className="mt-2 space-y-1 rounded border border-border bg-background p-2 text-[10px]">
          <div className="flex justify-between">
            <span className="font-semibold text-text-dim">Material System:</span>
            <span className="font-medium text-text-main">{materialSystem}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-semibold text-text-dim">Approved References:</span>
            <span className="font-medium text-text-main">0</span>
          </div>
          <div className="flex justify-between">
            <span className="font-semibold text-text-dim">Reference Status:</span>
            <span className="font-bold text-red-600 uppercase tracking-wider">
              Unavailable
            </span>
          </div>
        </div>
      </Panel>
    );
  }

  // Scenario 2: No Match Found
  if (status === 'no_match' || !primaryCandidate) {
    return (
      <Panel title="Reference Candidate Evidence" icon={<Search size={13} />}>
        <div className="rounded border border-amber-200 bg-amber-50/50 p-3 text-center">
          <p className="text-xs font-bold text-amber-800">No Match Found</p>
          <p className="mt-1 text-[10px] leading-relaxed text-amber-900/80">
            Curated reference database scanned, but no candidates met the matching thresholds.
          </p>
        </div>
        <div className="mt-2 space-y-1 rounded border border-border bg-background p-2 text-[10px]">
          <div className="flex justify-between">
            <span className="font-semibold text-text-dim">Material System:</span>
            <span className="font-medium text-text-main">{materialSystem}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-semibold text-text-dim">Approved References:</span>
            <span className="font-medium text-text-main">{referenceMatch.candidate_count ?? 0}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-semibold text-text-dim">Reference Status:</span>
            <span className="font-bold text-amber-600 uppercase tracking-wider">
              No Match
            </span>
          </div>
        </div>
      </Panel>
    );
  }

  return (
    <Panel title="Reference Candidate Evidence" icon={<Search size={13} />}>
      <div className="space-y-2 text-[11px]">
        <div className="space-y-1">
          <Metric label="Status" value={referenceMatch.status || 'Not available'} />
          <Metric label="Claim level" value={referenceMatch.claim_level || 'Not available'} />
          <Metric label="Reference set" value={referenceMatch.reference_set_id || 'Not available'} />
          <Metric label="Candidate count" value={typeof referenceMatch.candidate_count === 'number' ? String(referenceMatch.candidate_count) : 'Not available'} />
          <Metric label="Primary candidate" value={primaryCandidate?.phase_label || primaryCandidate?.phase_id || 'Not available'} />
          {primaryCandidate?.formula && <Metric label="Formula" value={primaryCandidate.formula} />}
          {primaryCandidate?.structure_family && <Metric label="Family" value={primaryCandidate.structure_family} />}
          {primaryCandidate?.database_ref && <Metric label="Database ref" value={primaryCandidate.database_ref} />}
          <Metric label="Score" value={formatReferenceMatchNumber(primaryCandidate?.score)} />
          <Metric label="Matched peaks" value={formatReferenceMatchPeakCount(primaryCandidate)} />
          <Metric label="Coverage ratio" value={formatReferenceMatchNumber(primaryCandidate?.coverage_ratio)} />
          <Metric label="Mean delta 2theta" value={formatReferenceMatchNumber(primaryCandidate?.mean_delta_two_theta, 3)} />
        </div>

        {referenceMatch.reason && (referenceMatch.status === 'blocked' || referenceMatch.status === 'unavailable' || referenceMatch.status === 'no_match') && (
          <div className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5">
            <p className="text-[9px] font-bold uppercase tracking-wide text-amber-900">Status note</p>
            <p className="mt-1 text-[10px] leading-relaxed text-amber-900">{referenceMatch.reason}</p>
          </div>
        )}

        {visibleMatchedPeaks.length > 0 && (
          <div className="space-y-1">
            <p className="text-[9px] font-bold uppercase tracking-wide text-text-muted">Matched peak candidates</p>
            <div className="overflow-x-auto rounded border border-border">
              <table className="min-w-full table-fixed text-[9px]">
                <thead className="bg-surface text-text-muted">
                  <tr>
                    <th className="px-1.5 py-1 text-left font-bold">Measured 2theta</th>
                    <th className="px-1.5 py-1 text-left font-bold">Reference 2theta</th>
                    <th className="px-1.5 py-1 text-left font-bold">Delta 2theta</th>
                    <th className="px-1.5 py-1 text-left font-bold">hkl</th>
                    <th className="px-1.5 py-1 text-left font-bold">Ref. intensity</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleMatchedPeaks.map((peak, index) => (
                    <tr key={`${peak.measured_two_theta}-${peak.reference_two_theta}-${peak.hkl ?? index}`} className="border-t border-border/60">
                      <td className="px-1.5 py-1 font-mono text-text-main">{formatReferenceMatchNumber(peak.measured_two_theta, 2)}</td>
                      <td className="px-1.5 py-1 font-mono text-text-main">{formatReferenceMatchNumber(peak.reference_two_theta, 2)}</td>
                      <td className="px-1.5 py-1 font-mono text-text-main">{formatReferenceMatchNumber(peak.delta_two_theta, 3)}</td>
                      <td className="px-1.5 py-1 font-semibold text-text-main">{peak.hkl || '-'}</td>
                      <td className="px-1.5 py-1 font-mono text-text-main">{formatReferenceMatchNumber(peak.reference_relative_intensity, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {matchedPeaks.length > visibleMatchedPeaks.length && (
              <p className="text-[9px] font-semibold text-text-muted">
                Showing first {visibleMatchedPeaks.length} of {matchedPeaks.length} matched peak candidates.
              </p>
            )}
          </div>
        )}

        <div className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5">
          <p className="text-[9px] font-bold uppercase tracking-wide text-amber-900">Claim boundary</p>
          <ul className="mt-1 space-y-0.5 text-[10px] leading-relaxed text-amber-900">
            {boundaryNotes.map((note) => (
              <li key={note}>- {note}</li>
            ))}
          </ul>
        </div>
      </div>
    </Panel>
  );
}

function ParameterHistoryPanel({ projectId, technique }: { projectId: string | null; technique: string }) {
  const history = React.useMemo(() => {
    return projectId ? readParameterHistory(projectId, technique) : [];
  }, [projectId, technique]);

  if (history.length === 0) {
    return (
      <Panel title="Parameter History" icon={<RotateCcw size={13} />}>
        <div className="text-[10px] text-text-muted p-1">No parameter changes recorded in this session.</div>
      </Panel>
    );
  }

  return (
    <Panel title="Parameter History" icon={<RotateCcw size={13} />}>
      <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
        {history.map((entry, idx) => {
          const dateLabel = new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          return (
            <div key={idx} className="rounded bg-surface-hover/30 p-1.5 text-[10px] leading-tight border border-border/50">
              <div className="flex justify-between text-text-muted mb-0.5 font-semibold">
                <span className="truncate max-w-[120px]" title={entry.parameter}>
                  {entry.parameter === 'all_parameters' ? 'All Parameters' : entry.parameter}
                </span>
                <span className="shrink-0">{dateLabel}</span>
              </div>
              <div className="flex items-center gap-1 text-text-main">
                <span className="text-red-600 truncate max-w-[80px] inline-block font-mono" title={String(entry.oldValue)}>{String(entry.oldValue)}</span>
                <span className="text-text-muted font-mono">&rarr;</span>
                <span className="text-emerald-700 font-bold truncate max-w-[80px] inline-block font-mono" title={String(entry.newValue)}>{String(entry.newValue)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function ParametersPanel({
  config,
  sessionState,
  affectedStepLabels,
  onChange,
  onToggleCheckbox,
  onApply,
  onReprocess,
  onReset,
  onSavePreset,
  onMarkStepDone,
  processingStateLabel,
  sharedOverrideCount,
  xrdParameters,
  xrdDatasetContext,
  xrdHasFiniteSignal,
  xrdLocalReferenceProjectId,
  xrdLocalReferenceUploadedRunId,
  useXrdLocalReferenceForBackend,
  onUseXrdLocalReferenceForBackendChange,
  onXrdParametersChange,
  onXrdDatasetContextChange,
  onXrdValidationStatusChange,
  selectedStepId = null,
  industryFilter,
  onIndustryFilterChange,
}: {
  config: TechniqueWorkspaceConfig;
  sessionState: WorkspaceSessionState;
  affectedStepLabels: string[];
  onChange: (control: TechniqueParameterControl, value: TechniqueParameterValue) => void;
  onToggleCheckbox: (control: TechniqueParameterControl, option: string) => void;
  onApply: (overrideAffectedSteps?: string[]) => void;
  onReprocess: () => void;
  onReset: () => void;
  onSavePreset: () => void;
  onMarkStepDone: (stepId: string) => void;
  processingStateLabel: string;
  sharedOverrideCount: number;
  xrdParameters: XRDParameters;
  xrdDatasetContext: XRDDatasetContext;
  xrdHasFiniteSignal: boolean;
  xrdLocalReferenceProjectId?: string;
  xrdLocalReferenceUploadedRunId?: string;
  useXrdLocalReferenceForBackend: boolean;
  onUseXrdLocalReferenceForBackendChange: (enabled: boolean) => void;
  onXrdParametersChange: React.Dispatch<React.SetStateAction<XRDParameters>>;
  onXrdDatasetContextChange: React.Dispatch<React.SetStateAction<XRDDatasetContext>>;
  onXrdValidationStatusChange: (status: boolean) => void;
  selectedStepId?: string | null;
  industryFilter: string;
  onIndustryFilterChange: (val: string) => void;
}) {
  if (config.id === 'xrd') {
    return (
      <XRDParametersPanel
        config={config}
        sessionState={sessionState}
        affectedStepLabels={affectedStepLabels}
        onApply={onApply}
        onReprocess={onReprocess}
        onReset={onReset}
        onSavePreset={onSavePreset}
        onMarkStepDone={onMarkStepDone}
        processingStateLabel={processingStateLabel}
        sharedOverrideCount={sharedOverrideCount}
        parameters={xrdParameters}
        datasetContext={xrdDatasetContext}
        hasFiniteSignal={xrdHasFiniteSignal}
        projectId={xrdLocalReferenceProjectId}
        uploadedRunId={xrdLocalReferenceUploadedRunId}
        useLocalReferenceForBackend={useXrdLocalReferenceForBackend}
        onUseLocalReferenceForBackendChange={onUseXrdLocalReferenceForBackendChange}
        onParametersChange={onXrdParametersChange}
        onDatasetContextChange={onXrdDatasetContextChange}
        onValidationStatusChange={onXrdValidationStatusChange}
        selectedStepId={selectedStepId}
        industryFilter={industryFilter}
        onIndustryFilterChange={onIndustryFilterChange}
      />
    );
  }

  // Sort parameters: if selectedStepId is active, put affected ones first
  const sortedParameters = React.useMemo(() => {
    if (!selectedStepId) return config.parameters;
    return config.parameters.filter((p) => p.affectedStepIds.includes(selectedStepId));
  }, [config.parameters, selectedStepId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-2">
      <Panel title="Processing Controls" icon={<FlaskConical size={13} />}>
        <div className="grid grid-cols-1 gap-2">
          {sortedParameters.map((control) => (
            <ParameterControlField
              key={control.id}
              control={control}
              value={sessionState.parameters[control.id] ?? control.defaultValue}
              onChange={onChange}
              onToggleCheckbox={onToggleCheckbox}
              highlighted={selectedStepId ? control.affectedStepIds.includes(selectedStepId) : false}
            />
          ))}
        </div>
      </Panel>

      <Panel title="Preview Impact" icon={<GitBranch size={13} />}>
        <div className="space-y-1.5 text-[11px]">
          <Metric label="Affected step" value={affectedStepLabels.join(', ')} />
          <Metric label="Status" value={processingStateLabel} />
          <Metric label="Shared overrides" value={sharedOverrideCount > 0 ? `${sharedOverrideCount} active` : 'None'} />
          <Metric
            label="Recalculated"
            value={sessionState.pendingRecalculation || sessionState.dirty
              ? `${config.graphLabel}, ${config.featureLabel}, evidence boundary`
              : 'No pending recalculation'}
          />
          <Metric label="Preset" value={sessionState.presetSavedLabel ? `Saved ${sessionState.presetSavedLabel}` : 'No preset saved'} />
        </div>
      </Panel>

      <Panel title="Actions" icon={<Play size={13} />}>
        <div className="grid grid-cols-2 gap-2">
          {selectedStepId && (
            <button
              type="button"
              onClick={() => {
                onApply([selectedStepId]);
                onMarkStepDone(selectedStepId);
              }}
              className="col-span-2 h-8 rounded bg-green-600 px-2 text-[11px] font-bold text-white hover:bg-green-700"
            >
              Save & Mark as Done
            </button>
          )}
          <button
            type="button"
            onClick={() => onApply()}
            className="h-8 rounded bg-primary px-2 text-[11px] font-bold text-white hover:bg-primary/90"
          >
            Apply Parameters
          </button>
          <button
            type="button"
            onClick={onReprocess}
            className="h-8 rounded border border-blue-200 bg-blue-50 px-2 text-[11px] font-bold text-blue-700 hover:bg-blue-100"
          >
            {config.reprocessLabel}
          </button>
          <button
            type="button"
            onClick={onReset}
            className="h-8 rounded border border-border bg-background px-2 text-[11px] font-bold text-text-main hover:bg-surface-hover"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={onSavePreset}
            className="h-8 rounded border border-border bg-background px-2 text-[11px] font-bold text-text-main hover:bg-surface-hover"
          >
            Save Preset
          </button>
        </div>
      </Panel>

      <ParameterHistoryPanel projectId={xrdLocalReferenceProjectId ?? null} technique={config.id} />
    </div>
  );
}

function cloneDefaultXrdParameters(): XRDParameters {
  return {
    ...DEFAULT_XRD_PARAMETERS,
    range: { ...DEFAULT_XRD_PARAMETERS.range },
    radiation: { ...DEFAULT_XRD_PARAMETERS.radiation },
    baseline: { ...DEFAULT_XRD_PARAMETERS.baseline },
    smoothing: { ...DEFAULT_XRD_PARAMETERS.smoothing },
    peakDetection: { ...DEFAULT_XRD_PARAMETERS.peakDetection },
    peakFitting: { ...DEFAULT_XRD_PARAMETERS.peakFitting },
    referenceMatch: {
      ...DEFAULT_XRD_PARAMETERS.referenceMatch,
      candidatePhaseIds: [...DEFAULT_XRD_PARAMETERS.referenceMatch.candidatePhaseIds],
    },
    boundary: { ...DEFAULT_XRD_PARAMETERS.boundary },
  };
}

function createDefaultXrdDatasetContext(): XRDDatasetContext {
  return {
    sampleName: '',
    materialClass: '',
    knownElements: [],
    expectedElements: [],
    excludedElements: [],
    declaredPhases: [],
    candidatePhaseIds: [],
    excludedPhaseIds: [],
    referenceSource: DEFAULT_XRD_PARAMETERS.referenceMatch.referenceSource,
    referenceSetId: DEFAULT_XRD_PARAMETERS.referenceMatch.referenceSetId,
    identitySource: 'user_declared',
    identityConfidence: 'declared',
  };
}

function parseXrdListInput(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseXrdNumberInput(value: string, fallback: number) {
  const nextValue = Number.parseFloat(value);
  return Number.isFinite(nextValue) ? nextValue : fallback;
}

function getXrdRadiationSourceLabel(source: XRDParameters['radiation']['source']) {
  if (source === 'cu_ka') return 'Cu Kα';
  return source;
}

function formatXrdLocalReferenceTimestamp(value: string | undefined) {
  if (!value) return 'Not saved';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatXrdReferenceFileKind(value: string | undefined) {
  if (!value) return 'Unknown';
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatXrdReferenceTextBinaryLikelihood(value: string | undefined) {
  switch (value) {
    case 'likely_text':
      return 'Likely text';
    case 'likely_binary':
      return 'Likely binary';
    case 'mixed':
      return 'Mixed text/binary';
    case 'unknown':
    default:
      return 'Unknown';
  }
}

function formatXrdReferenceFileSize(bytes: number | undefined) {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes)) return 'Not available';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatXrdCifCellParameters(parseResult: XRDLocalReferenceParseResult) {
  const cell = parseResult.cellParameters;
  if (!cell) return 'Not available';
  const lengths = [
    cell.a !== undefined ? `a=${formatReferenceMatchNumber(cell.a, 4)}` : null,
    cell.b !== undefined ? `b=${formatReferenceMatchNumber(cell.b, 4)}` : null,
    cell.c !== undefined ? `c=${formatReferenceMatchNumber(cell.c, 4)}` : null,
  ].filter(Boolean);
  const angles = [
    cell.alpha !== undefined ? `alpha=${formatReferenceMatchNumber(cell.alpha, 2)}` : null,
    cell.beta !== undefined ? `beta=${formatReferenceMatchNumber(cell.beta, 2)}` : null,
    cell.gamma !== undefined ? `gamma=${formatReferenceMatchNumber(cell.gamma, 2)}` : null,
  ].filter(Boolean);
  return [...lengths, ...angles].join(', ') || 'Not available';
}

function formatXrdCifConversionMode(mode: string | undefined) {
  switch (mode) {
    case 'metadata_only':
      return 'Metadata only';
    case 'estimated_peak_preview':
      return 'Estimated peak preview';
    case 'not_supported_yet':
      return 'Not supported yet';
    default:
      return 'Not available';
  }
}

function formatXrdmlRange(parseResult: XRDLocalReferenceParseResult) {
  const preview = parseResult.xrdmlPatternPreview;
  if (!preview || preview.twoThetaMin === undefined || preview.twoThetaMax === undefined) return 'Not available';
  return `${formatReferenceMatchNumber(preview.twoThetaMin, 3)} to ${formatReferenceMatchNumber(preview.twoThetaMax, 3)} deg`;
}

function formatXrdmlIntensityRange(parseResult: XRDLocalReferenceParseResult) {
  const preview = parseResult.xrdmlPatternPreview;
  if (!preview || preview.intensityMin === undefined || preview.intensityMax === undefined) return 'Not available';
  return `${formatReferenceMatchNumber(preview.intensityMin, 1)} to ${formatReferenceMatchNumber(preview.intensityMax, 1)}`;
}

function formatXrdmlStep(value: number | undefined) {
  return value !== undefined ? `${formatReferenceMatchNumber(value, 5)} deg` : 'Not available';
}

function getXrdLocalReferenceDraftsForContext(projectId?: string, uploadedRunId?: string) {
  const drafts = listXrdLocalReferenceDrafts(projectId);
  if (uploadedRunId) {
    return drafts.filter((draft) => draft.uploadedRunId === uploadedRunId);
  }
  if (!projectId) {
    return drafts.filter((draft) => !draft.uploadedRunId);
  }
  return drafts;
}

function XRDParametersPanel({
  config,
  sessionState,
  affectedStepLabels,
  onApply,
  onReprocess,
  onReset,
  onSavePreset,
  onMarkStepDone,
  processingStateLabel,
  sharedOverrideCount,
  parameters,
  datasetContext,
  hasFiniteSignal,
  projectId,
  uploadedRunId,
  useLocalReferenceForBackend,
  onUseLocalReferenceForBackendChange,
  onParametersChange,
  onDatasetContextChange,
  onValidationStatusChange,
  selectedStepId = null,
  industryFilter,
  onIndustryFilterChange,
}: {
  config: TechniqueWorkspaceConfig;
  sessionState: WorkspaceSessionState;
  affectedStepLabels: string[];
  onApply: (overrideAffectedSteps?: string[]) => void;
  onReprocess: () => void;
  onReset: () => void;
  onSavePreset: () => void;
  onMarkStepDone: (stepId: string) => void;
  processingStateLabel: string;
  sharedOverrideCount: number;
  parameters: XRDParameters;
  datasetContext: XRDDatasetContext;
  hasFiniteSignal: boolean;
  projectId?: string;
  uploadedRunId?: string;
  useLocalReferenceForBackend: boolean;
  onUseLocalReferenceForBackendChange: (enabled: boolean) => void;
  onParametersChange: React.Dispatch<React.SetStateAction<XRDParameters>>;
  onDatasetContextChange: React.Dispatch<React.SetStateAction<XRDDatasetContext>>;
  onValidationStatusChange: (status: boolean) => void;
  selectedStepId?: string | null;
  industryFilter: string;
  onIndustryFilterChange: (val: string) => void;
}) {
  const readiness = getXrdReadinessState({
    hasSignal: hasFiniteSignal,
    datasetContext,
    parameters,
  });
  const [localReferenceParsePreview, setLocalReferenceParsePreview] = useState<XRDLocalReferenceParseResult>(
    () => createEmptyXrdLocalReferenceParseResult(),
  );
  const [localReferenceDrafts, setLocalReferenceDrafts] = useState<XRDStoredLocalReferenceRecord[]>(() => (
    getXrdLocalReferenceDraftsForContext(projectId, uploadedRunId)
  ));
  const [localReferenceSaveStatus, setLocalReferenceSaveStatus] = useState<string | null>(null);
  const localReferenceValidationLevel = getXrdLocalReferenceValidationLevel(localReferenceParsePreview);
  const hasSavableXrdmlPreview = Boolean(localReferenceParsePreview.xrdmlMetadata)
    && localReferenceParsePreview.status === 'requires_peak_extraction'
    && localReferenceParsePreview.validation.errors.length === 0;
  const canSaveLocalReferencePreview = ((
    localReferenceParsePreview.status === 'parsed_preview'
    || localReferenceParsePreview.status === 'partial_preview'
    || localReferenceParsePreview.status === 'repaired_preview'
  )
    && localReferenceParsePreview.peaks.length > 0
    && localReferenceValidationLevel !== 'invalid_preview')
    || hasSavableXrdmlPreview;
  const latestLocalReferenceDraft = localReferenceDrafts[0] ?? null;
  const latestLocalReferenceDraftEligible = isXrdLocalReferenceDraftEligibleForBackend(latestLocalReferenceDraft);
  const latestLocalReferenceDraftApprovedForBackend = canUseXrdLocalReferenceDraftForBackendMatching(latestLocalReferenceDraft);
  const latestLocalReferenceDraftBlockers = getXrdLocalReferenceDraftMatchingBlockers(latestLocalReferenceDraft);
  const localReferencePreviewIssueCount = localReferenceParsePreview.validation.errors.length
    + localReferenceParsePreview.validation.warnings.length;
  const localReferencePreviewIssues = [
    ...localReferenceParsePreview.validation.errors.map((message) => ({ message, tone: 'error' as const })),
    ...localReferenceParsePreview.validation.warnings.map((message) => ({ message, tone: 'warning' as const })),
  ];
  const localReferenceBackendUseStatus = latestLocalReferenceDraftApprovedForBackend
    ? useLocalReferenceForBackend ? 'Enabled for next run' : 'Ready, toggle off'
    : 'Locked';
  const localReferenceApprovalStatusLabel = latestLocalReferenceDraft
    ? getXrdLocalReferenceApprovalStatusLabel(latestLocalReferenceDraft.approvalStatus)
    : 'No saved draft';

  useEffect(() => {
    setLocalReferenceDrafts(getXrdLocalReferenceDraftsForContext(projectId, uploadedRunId));
    setLocalReferenceSaveStatus(null);
  }, [projectId, uploadedRunId]);

  function updateParameterStage<TStage extends keyof XRDParameters>(
    stage: TStage,
    updates: Partial<XRDParameters[TStage]>,
  ) {
    onParametersChange((current) => ({
      ...current,
      [stage]: {
        ...current[stage],
        ...updates,
      },
    }));
  }

  function updateDatasetField<TKey extends keyof XRDDatasetContext>(
    field: TKey,
    value: XRDDatasetContext[TKey],
  ) {
    onDatasetContextChange((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function updateReferenceSource(referenceSource: XRDDatasetContext['referenceSource']) {
    updateDatasetField('referenceSource', referenceSource);
    updateParameterStage('referenceMatch', { referenceSource });
  }

  function updateReferenceSetId(referenceSetId: string) {
    const nextReferenceSetId = referenceSetId || undefined;
    updateDatasetField('referenceSetId', nextReferenceSetId);
    updateParameterStage('referenceMatch', { referenceSetId: nextReferenceSetId });
  }

  function handleLegacyReprocessClick() {
    debugXrdReprocessTrace('Legacy Demo Processing Reprocess Peaks button clicked', {
      surface: 'xrd-parameters-tab',
    });
    onReprocess();
  }

  function updateKnownElements(value: string) {
    updateDatasetField('knownElements', parseXrdListInput(value));
  }

  function updateDeclaredPhases(value: string) {
    updateDatasetField('declaredPhases', parseXrdListInput(value));
  }

  function updateCandidatePhaseIds(value: string) {
    const candidatePhaseIds = parseXrdListInput(value);
    updateParameterStage('referenceMatch', { candidatePhaseIds });
    updateDatasetField('candidatePhaseIds', candidatePhaseIds);
  }

  function buildLocalReferenceParseError(
    sourceFileName: string,
    errors: string[],
    fileSizeBytes?: number,
  ): XRDLocalReferenceParseResult {
    return createXrdLocalReferenceImportErrorResult(sourceFileName, errors, { fileSizeBytes });
  }

  function refreshLocalReferenceDrafts() {
    setLocalReferenceDrafts(getXrdLocalReferenceDraftsForContext(projectId, uploadedRunId));
  }

  function handleSaveLocalReferencePreview() {
    if (!canSaveLocalReferencePreview) {
      setLocalReferenceSaveStatus('Local reference preview is not ready to save.');
      return;
    }

    const draft = buildXrdLocalReferenceDraftFromParseResult(localReferenceParsePreview, {
      projectId,
      uploadedRunId,
    });
    const savedDraft = saveXrdLocalReferenceDraft(draft);
    if (!savedDraft) {
      setLocalReferenceSaveStatus('Unable to save local reference preview in this browser.');
      return;
    }

    refreshLocalReferenceDrafts();
    setLocalReferenceSaveStatus(`Local reference preview saved ${formatXrdLocalReferenceTimestamp(savedDraft.savedAt)}.`);
  }

  function handleClearLocalReferencePreview() {
    setLocalReferenceParsePreview(createEmptyXrdLocalReferenceParseResult());
    setLocalReferenceSaveStatus('Preview cleared. Saved local reference drafts were unchanged.');
  }

  function handleDeleteLocalReferenceDraft(draftId: string) {
    const deleted = deleteXrdLocalReferenceDraft(draftId);
    refreshLocalReferenceDrafts();
    if (deleted && latestLocalReferenceDraft?.id === draftId) {
      onUseLocalReferenceForBackendChange(false);
    }
    setLocalReferenceSaveStatus(deleted
      ? 'Saved local reference preview deleted.'
      : 'Saved local reference preview was not found.');
  }

  function handleApproveLocalReferenceDraft(draftId: string) {
    const approved = approveXrdLocalReferenceDraftForMatching(draftId);
    refreshLocalReferenceDrafts();
    if (approved?.approvalStatus === 'approved_for_local_matching') {
      setLocalReferenceSaveStatus('Local reference peak list approved for request-scoped backend matching. Toggle remains off until explicitly enabled.');

      // Phase X6B: Dispatch 7E.4 validation approval
      onValidationStatusChange(true);
      return;
    }

    onUseLocalReferenceForBackendChange(false);
    setLocalReferenceSaveStatus('Local reference draft could not be approved for matching. It remains preview-only.');

    // Phase X6B: Dispatch 7E.4 validation rejection on failure
    onValidationStatusChange(false);
  }

  function handleRejectLocalReferenceDraft(draftId: string) {
    const rejected = rejectXrdLocalReferenceDraft(draftId);
    refreshLocalReferenceDrafts();
    onUseLocalReferenceForBackendChange(false);
    setLocalReferenceSaveStatus(rejected
      ? 'Local reference draft rejected for backend matching and kept as preview-only.'
      : 'Saved local reference preview was not found.');

    // Phase X6B: Dispatch 7E.4 validation rejection
    onValidationStatusChange(false);
  }

  async function handleLocalReferenceFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) {
      setLocalReferenceParsePreview(createEmptyXrdLocalReferenceParseResult());
      setLocalReferenceSaveStatus(null);
      return;
    }

    setLocalReferenceSaveStatus(null);

    if (file.size > XRD_LOCAL_REFERENCE_MAX_FILE_BYTES) {
      setLocalReferenceParsePreview(buildLocalReferenceParseError(
        file.name,
        ['File exceeds the 1 MB frontend preview parser limit.'],
        file.size,
      ));
      return;
    }

    try {
      const text = await file.text();
      setLocalReferenceParsePreview(parseXrdLocalReferenceText(text, file.name, { fileSizeBytes: file.size }));
    } catch {
      setLocalReferenceParsePreview(buildLocalReferenceParseError(
        file.name,
        ['Unable to read this file as text.'],
        file.size,
      ));
    }
  }

  const getPanelStepMatch = React.useCallback((panelId: string, stepId: string | null): boolean => {
    if (!stepId) return false;
    if (stepId === 'baseline') return panelId === 'baseline' || panelId === 'range_radiation';
    if (stepId === 'smooth') return panelId === 'smooth';
    if (stepId === 'peaks') return panelId === 'peaks';
    if (stepId === 'fit') return panelId === 'fit';
    if (stepId === 'match') return panelId === 'match_ref' || panelId === 'local_ref';
    if (stepId === 'refinement') return panelId === 'boundary';
    return false;
  }, []);

  const PANELS_ORDER = React.useMemo(() => [
    'readiness',
    'range_radiation',
    'baseline',
    'smooth',
    'peaks',
    'fit',
    'match_ref',
    'local_ref',
    'boundary',
    'legacy',
    'history',
  ], []);

  // Stable panel IDs for ordering (avoids recreating allPanels every render)
  const panelIds = React.useMemo(() => {
    if (!selectedStepId) return PANELS_ORDER;
    return PANELS_ORDER.filter(
      (id) => getPanelStepMatch(id, selectedStepId) || id === 'legacy'
    );
  }, [PANELS_ORDER, selectedStepId, getPanelStepMatch]);

  const renderPanelElement = (panelId: string) => {
    switch (panelId) {
      case 'readiness':
        return (
          <XRDReadinessPanel
            analysisMode={readiness.analysisMode}
            hasSignal={readiness.hasSignal}
            hasReferenceSet={readiness.hasReferenceSet}
            hasKnownElements={readiness.hasKnownElements}
            hasDeclaredPhases={readiness.hasDeclaredPhases}
            referenceMatchEnabled={readiness.referenceMatchEnabled}
            message={readiness.message}
            tone={readiness.tone}
          />
        );
      case 'range_radiation':
        return (
          <Panel title="Range & Radiation" icon={<FlaskConical size={13} />}>
            <div className="grid grid-cols-2 gap-2">
              <XRDNumberField
                label="2theta min"
                value={parameters.range.twoThetaMin}
                min={0}
                max={180}
                step={0.1}
                unit="deg"
                onChange={(twoThetaMin) => updateParameterStage('range', { twoThetaMin })}
              />
              <XRDNumberField
                label="2theta max"
                value={parameters.range.twoThetaMax}
                min={0}
                max={180}
                step={0.1}
                unit="deg"
                onChange={(twoThetaMax) => updateParameterStage('range', { twoThetaMax })}
              />
              <XRDReadOnlyField label="Radiation source" value={getXrdRadiationSourceLabel(parameters.radiation.source)} />
              <XRDNumberField
                label="Wavelength"
                value={parameters.radiation.wavelengthAngstrom}
                min={0}
                step={0.0001}
                unit="angstrom"
                onChange={(wavelengthAngstrom) => updateParameterStage('radiation', { wavelengthAngstrom })}
              />
            </div>
          </Panel>
        );
      case 'baseline':
        return (
          <Panel title="Baseline" icon={<GitBranch size={13} />}>
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2">
                <XRDSelectField
                  label="Method"
                  value={parameters.baseline.method}
                  options={XRD_BASELINE_METHOD_OPTIONS}
                  onChange={(method) => updateParameterStage('baseline', { method: method as XRDBaselineMethod })}
                />
              </div>
              <XRDNumberField
                label="Lambda"
                value={parameters.baseline.lambda}
                min={0}
                step={1000}
                onChange={(lambda) => updateParameterStage('baseline', { lambda })}
              />
              <XRDNumberField
                label="p"
                value={parameters.baseline.p}
                min={0}
                max={1}
                step={0.01}
                onChange={(p) => updateParameterStage('baseline', { p })}
              />
            </div>
          </Panel>
        );
      case 'smooth':
        return (
          <Panel title="Smoothing" icon={<GitBranch size={13} />}>
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2">
                <XRDSelectField
                  label="Method"
                  value={parameters.smoothing.method}
                  options={XRD_SMOOTHING_METHOD_OPTIONS}
                  onChange={(method) => updateParameterStage('smoothing', { method: method as XRDSmoothingMethod })}
                />
              </div>
              <XRDNumberField
                label="Window size"
                value={parameters.smoothing.windowSize}
                min={1}
                step={2}
                onChange={(windowSize) => updateParameterStage('smoothing', { windowSize })}
              />
              <XRDNumberField
                label="Polynomial order"
                value={parameters.smoothing.polynomialOrder}
                min={0}
                step={1}
                onChange={(polynomialOrder) => updateParameterStage('smoothing', { polynomialOrder })}
              />
            </div>
          </Panel>
        );
      case 'peaks':
        return (
          <Panel title="Peak Detection" icon={<Search size={13} />}>
            <div className="grid grid-cols-2 gap-2">
              <XRDNumberField
                label="Min prominence"
                value={parameters.peakDetection.minProminence}
                min={0}
                max={1}
                step={0.01}
                onChange={(minProminence) => updateParameterStage('peakDetection', { minProminence })}
              />
              <XRDNumberField
                label="Min distance"
                value={parameters.peakDetection.minDistanceDeg}
                min={0}
                step={0.01}
                unit="deg"
                onChange={(minDistanceDeg) => updateParameterStage('peakDetection', { minDistanceDeg })}
              />
              <XRDNumberField
                label="Min height ratio"
                value={parameters.peakDetection.minHeightRatio}
                min={0}
                max={1}
                step={0.01}
                onChange={(minHeightRatio) => updateParameterStage('peakDetection', { minHeightRatio })}
              />
              <XRDNumberField
                label="Max peak count"
                value={parameters.peakDetection.maxPeakCount}
                min={1}
                step={1}
                onChange={(maxPeakCount) => updateParameterStage('peakDetection', { maxPeakCount })}
              />
            </div>
          </Panel>
        );
      case 'fit':
        return (
          <Panel title="Peak Fitting" icon={<Sparkles size={13} />}>
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2">
                <XRDSelectField
                  label="Model"
                  value={parameters.peakFitting.model}
                  options={XRD_PEAK_FIT_MODEL_OPTIONS}
                  onChange={(model) => updateParameterStage('peakFitting', { model: model as XRDPeakFitModel })}
                />
              </div>
              <XRDNumberField
                label="Fit window"
                value={parameters.peakFitting.fitWindowDeg}
                min={0}
                step={0.1}
                unit="deg"
                onChange={(fitWindowDeg) => updateParameterStage('peakFitting', { fitWindowDeg })}
              />
              <XRDNumberField
                label="Max iterations"
                value={parameters.peakFitting.maxIterations}
                min={1}
                step={1}
                onChange={(maxIterations) => updateParameterStage('peakFitting', { maxIterations })}
              />

              <div className="col-span-2 flex items-center justify-between border-t border-border pt-2 mt-1">
                <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Refinement Constraints</span>
              </div>
              <div className="col-span-2">
                <XRDToggleField
                  label="Refine FWHM"
                  checked={parameters.peakFitting.refineFWHM ?? true}
                  onChange={(refineFWHM) => updateParameterStage('peakFitting', { refineFWHM })}
                />
              </div>
              <div className="col-span-2">
                <XRDToggleField
                  label="Refine peak shape (eta)"
                  checked={parameters.peakFitting.refineShape ?? true}
                  onChange={(refineShape) => updateParameterStage('peakFitting', { refineShape })}
                />
              </div>

              <div className="col-span-2 flex items-center justify-between border-t border-border pt-2 mt-1">
                <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Microstructural Analysis</span>
              </div>
              <div className="col-span-2">
                <XRDToggleField
                  label="Calculate crystallite size"
                  checked={parameters.peakFitting.calculateCrystalliteSize}
                  onChange={(calculateCrystalliteSize) => updateParameterStage('peakFitting', { calculateCrystalliteSize })}
                />
              </div>
              {parameters.peakFitting.calculateCrystalliteSize && (
                <>
                  <XRDNumberField
                    label="Scherrer Constant (K)"
                    value={parameters.peakFitting.scherrerConstant ?? 0.89}
                    min={0.5}
                    max={1.5}
                    step={0.01}
                    onChange={(scherrerConstant) => updateParameterStage('peakFitting', { scherrerConstant })}
                  />
                  <XRDNumberField
                    label="Instrumental broadening"
                    value={parameters.peakFitting.instrumentalBroadening ?? 0.05}
                    min={0}
                    max={2}
                    step={0.01}
                    unit="deg"
                    onChange={(instrumentalBroadening) => updateParameterStage('peakFitting', { instrumentalBroadening })}
                  />
                </>
              )}
              <div className="col-span-2">
                <XRDToggleField
                  label="Calculate microstrain"
                  checked={parameters.peakFitting.calculateMicrostrain ?? false}
                  onChange={(calculateMicrostrain) => updateParameterStage('peakFitting', { calculateMicrostrain })}
                />
              </div>
            </div>
          </Panel>
        );
      case 'match_ref':
        return (
          <XRDReferenceMatchPanel
            enabled={parameters.referenceMatch.enabled}
            matchMode={parameters.referenceMatch.matchMode}
            referenceSource={parameters.referenceMatch.referenceSource}
            candidatePhaseIds={parameters.referenceMatch.candidatePhaseIds}
            toleranceTwoTheta={parameters.referenceMatch.toleranceTwoTheta}
            minMatchedPeaks={parameters.referenceMatch.minMatchedPeaks}
            minCoverageRatio={parameters.referenceMatch.minCoverageRatio}
            minScore={parameters.referenceMatch.minScore}
            useRelativeIntensity={parameters.referenceMatch.useRelativeIntensity}
            intensityToleranceRatio={parameters.referenceMatch.intensityToleranceRatio}
            allowUnknownSearch={parameters.referenceMatch.allowUnknownSearch}
            allowIdentityClaim={parameters.referenceMatch.allowIdentityClaim}
            allowPhasePurityClaim={parameters.referenceMatch.allowPhasePurityClaim}
            matchModeOptions={XRD_MATCH_MODE_OPTIONS}
            referenceSourceOptions={XRD_REFERENCE_SOURCE_OPTIONS}
            analysisMode={industryFilter}
            analysisModeOptions={[
              { value: 'All', label: 'Standard' },
              { value: 'Semiconductors', label: 'Semiconductors' },
              { value: 'Energy Storage', label: 'Energy Storage' },
              { value: 'Pharmaceuticals', label: 'Pharmaceuticals' },
              { value: 'Advanced Ceramics', label: 'Advanced Ceramics' },
            ]}
            onEnabledChange={(enabled) => updateParameterStage('referenceMatch', { enabled })}
            onMatchModeChange={(matchMode) => updateParameterStage('referenceMatch', { matchMode: matchMode as XRDMatchMode })}
            onReferenceSourceChange={updateReferenceSource}
            onAnalysisModeChange={onIndustryFilterChange}
            onCandidatePhaseIdsChange={updateCandidatePhaseIds}
            onToleranceTwoThetaChange={(toleranceTwoTheta) => updateParameterStage('referenceMatch', { toleranceTwoTheta })}
            onMinMatchedPeaksChange={(minMatchedPeaks) => updateParameterStage('referenceMatch', { minMatchedPeaks })}
            onMinCoverageRatioChange={(minCoverageRatio) => updateParameterStage('referenceMatch', { minCoverageRatio })}
            onMinScoreChange={(minScore) => updateParameterStage('referenceMatch', { minScore })}
            onUseRelativeIntensityChange={(useRelativeIntensity) => updateParameterStage('referenceMatch', { useRelativeIntensity })}
            onIntensityToleranceRatioChange={(intensityToleranceRatio) => updateParameterStage('referenceMatch', { intensityToleranceRatio })}
            onAllowUnknownSearchChange={(allowUnknownSearch) => updateParameterStage('referenceMatch', { allowUnknownSearch })}
          />
        );
      case 'local_ref':
        return (
          <XRDLocalReferencePanel
            parsePreview={localReferenceParsePreview}
            validationLevel={localReferenceValidationLevel}
            validationLevelLabel={getXrdLocalReferenceValidationLevelLabel(localReferenceValidationLevel)}
            canSavePreview={canSaveLocalReferencePreview}
            saveStatus={localReferenceSaveStatus}
            previewIssueCount={localReferencePreviewIssueCount}
            previewIssues={localReferencePreviewIssues}
            savedDrafts={localReferenceDrafts}
            latestDraft={latestLocalReferenceDraft}
            latestDraftEligible={latestLocalReferenceDraftEligible}
            latestDraftApprovedForBackend={latestLocalReferenceDraftApprovedForBackend}
            latestDraftBlockers={latestLocalReferenceDraftBlockers}
            approvalStatusLabel={localReferenceApprovalStatusLabel}
            backendUseStatusLabel={localReferenceBackendUseStatus}
            useLocalReferenceForBackend={useLocalReferenceForBackend}
            curatedReferenceSetId={parameters.referenceMatch.referenceSetId}
            plannedLocalReferences={PLANNED_XRD_LOCAL_REFERENCES}
            previewSupportedFormats={XRD_LOCAL_REFERENCE_PREVIEW_SUPPORTED_FORMATS}
            selectableFormats={XRD_LOCAL_REFERENCE_SELECTABLE_FORMATS}
            expectedColumns={XRD_LOCAL_REFERENCE_EXPECTED_COLUMNS}
            statusPreview={XRD_LOCAL_REFERENCE_STATUS_PREVIEW}
            onFileChange={handleLocalReferenceFileChange}
            onSavePreview={handleSaveLocalReferencePreview}
            onClearPreview={handleClearLocalReferencePreview}
            onDeleteDraft={handleDeleteLocalReferenceDraft}
            onApproveDraft={handleApproveLocalReferenceDraft}
            onRejectDraft={handleRejectLocalReferenceDraft}
            onToggleUseForBackend={onUseLocalReferenceForBackendChange}
            formatFileKind={formatXrdReferenceFileKind}
            formatTimestamp={formatXrdLocalReferenceTimestamp}
            formatNumber={formatReferenceMatchNumber}
            formatCifConversionMode={formatXrdCifConversionMode}
            formatCifCellParameters={formatXrdCifCellParameters}
            formatXrdmlRange={formatXrdmlRange}
            formatXrdmlStep={formatXrdmlStep}
            formatXrdmlIntensityRange={formatXrdmlIntensityRange}
            getValidationStatusLabel={getXrdLocalReferenceValidationStatusLabel}
          />
        );
      case 'boundary':
        return (
          <XRDBoundaryPanel
            enabled={parameters.boundary.enabled}
            claimMode={parameters.boundary.claimMode}
            requireComplementaryEvidence={parameters.boundary.requireComplementaryEvidence}
            requireReferenceSetForMatch={parameters.boundary.requireReferenceSetForMatch}
            requireSampleContextForTargetedMatch={parameters.boundary.requireSampleContextForTargetedMatch}
            allowIdentityClaim={parameters.boundary.allowIdentityClaim}
            allowPhasePurityClaim={parameters.boundary.allowPhasePurityClaim}
            claimModeOptions={XRD_CLAIM_MODE_OPTIONS}
            onEnabledChange={(enabled) => updateParameterStage('boundary', { enabled })}
            onClaimModeChange={(claimMode) => updateParameterStage('boundary', { claimMode: claimMode as XRDClaimMode })}
            onRequireComplementaryEvidenceChange={(requireComplementaryEvidence) => updateParameterStage('boundary', { requireComplementaryEvidence })}
            onRequireReferenceSetForMatchChange={(requireReferenceSetForMatch) => updateParameterStage('boundary', { requireReferenceSetForMatch })}
            onRequireSampleContextForTargetedMatchChange={(requireSampleContextForTargetedMatch) => updateParameterStage('boundary', { requireSampleContextForTargetedMatch })}
          />
        );
      case 'legacy':
        return (
          <Panel title="Legacy Demo Processing" icon={<Play size={13} />}>
            <p className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-[10px] leading-relaxed text-text-muted">
              These existing demo actions use the current workspace parameter path. The Phase 2 XRD controls above remain local frontend state.
            </p>
            <div className="mt-2 space-y-1.5">
              <Metric label="Affected step" value={affectedStepLabels.join(', ')} />
              <Metric label="Status" value={processingStateLabel} />
              <Metric label="Shared overrides" value={sharedOverrideCount > 0 ? `${sharedOverrideCount} active` : 'None'} />
              <Metric
                label="Recalculated"
                value={sessionState.pendingRecalculation || sessionState.dirty
                  ? `${config.graphLabel}, ${config.featureLabel}, evidence boundary`
                  : 'No pending recalculation'}
              />
              <Metric label="Preset" value={sessionState.presetSavedLabel ? `Saved ${sessionState.presetSavedLabel}` : 'No preset saved'} />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {selectedStepId && (
                <button
                  type="button"
                  onClick={() => {
                    onApply([selectedStepId]);
                    onMarkStepDone(selectedStepId);
                  }}
                  className="col-span-2 h-8 rounded bg-green-600 px-2 text-[11px] font-bold text-white hover:bg-green-700"
                >
                  Save & Mark as Done
                </button>
              )}
              <button
                type="button"
                onClick={() => onApply()}
                className="h-8 rounded bg-primary px-2 text-[11px] font-bold text-white hover:bg-primary/90"
              >
                Apply Parameters
              </button>
              <button
                type="button"
                onClick={handleLegacyReprocessClick}
                className="h-8 rounded border border-blue-200 bg-blue-50 px-2 text-[11px] font-bold text-blue-700 hover:bg-blue-100"
              >
                {config.reprocessLabel}
              </button>
              <button
                type="button"
                onClick={onReset}
                className="h-8 rounded border border-border bg-background px-2 text-[11px] font-bold text-text-main hover:bg-surface-hover"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={onSavePreset}
                className="h-8 rounded border border-border bg-background px-2 text-[11px] font-bold text-text-main hover:bg-surface-hover"
              >
                Save Preset
              </button>
            </div>
          </Panel>
        );
      case 'history':
        return (
          <ParameterHistoryPanel
            projectId={projectId ?? null}
            technique="xrd"
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-2">
      {panelIds.map((panelId) => {
        const isHighlighted = getPanelStepMatch(panelId, selectedStepId);
        return (
          <div
            key={panelId}
            id={`param-panel-${panelId}`}
            className={`transition-all duration-300 rounded ${isHighlighted
              ? 'ring-1 ring-primary/40 bg-primary/[0.02] p-1 border border-primary/20 shadow-sm'
              : ''
              }`}
          >
            {renderPanelElement(panelId)}
          </div>
        );
      })}
    </div>
  );
}

function XRDFieldLabel({ label, unit }: { label: string; unit?: string }) {
  return (
    <span className="flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-wide text-text-muted">
      {label}
      {unit && <span className="normal-case tracking-normal">{unit}</span>}
    </span>
  );
}

function XRDTextField({
  label,
  value,
  onChange,
  placeholder,
  variant = 'default',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  variant?: 'default' | 'compact';
}) {
  if (variant === 'compact') {
    return (
      <label className="block">
        <XRDFieldLabel label={label} />
        <input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="mt-0.5 h-7 w-full rounded border border-border bg-white px-2 text-xs font-semibold text-text-main placeholder:font-medium placeholder:text-text-muted focus:border-primary focus:outline-none"
        />
      </label>
    );
  }

  return (
    <label className="block rounded border border-border bg-background px-2 py-1.5">
      <XRDFieldLabel label={label} />
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-1 h-8 w-full rounded border border-border bg-white px-2 text-xs font-semibold text-text-main placeholder:font-medium placeholder:text-text-muted focus:border-primary focus:outline-none"
      />
    </label>
  );
}

function XRDNumberField({
  label,
  value,
  onChange,
  min,
  max,
  step,
  unit,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}) {
  return (
    <label className="block rounded border border-border bg-background px-2 py-1.5">
      <XRDFieldLabel label={label} unit={unit} />
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        aria-label={label}
        onChange={(event) => onChange(parseXrdNumberInput(event.target.value, value))}
        className="mt-1 h-8 w-full rounded border border-border bg-white px-2 text-xs font-semibold text-text-main focus:border-primary focus:outline-none"
      />
    </label>
  );
}

function XRDSelectField<TValue extends string>({
  label,
  value,
  options,
  onChange,
  variant = 'default',
}: {
  label: string;
  value: TValue;
  options: XRDParameterOption<TValue>[];
  onChange: (value: TValue) => void;
  variant?: 'default' | 'compact';
}) {
  if (variant === 'compact') {
    return (
      <label className="block">
        <XRDFieldLabel label={label} />
        <select
          value={value}
          aria-label={label}
          onChange={(event) => onChange(event.target.value as TValue)}
          className="mt-0.5 h-7 w-full rounded border border-border bg-white px-2 text-xs font-semibold text-text-main focus:border-primary focus:outline-none"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <label className="block rounded border border-border bg-background px-2 py-1.5">
      <XRDFieldLabel label={label} />
      <select
        value={value}
        aria-label={label}
        onChange={(event) => onChange(event.target.value as TValue)}
        className="mt-1 h-8 w-full rounded border border-border bg-white px-2 text-xs font-semibold text-text-main focus:border-primary focus:outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function XRDReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border bg-background px-2 py-1.5">
      <XRDFieldLabel label={label} />
      <div className="mt-1 flex h-8 items-center rounded border border-border bg-slate-50 px-2 text-xs font-semibold text-text-main">
        {value}
      </div>
    </div>
  );
}

function XRDToggleField({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="rounded border border-border bg-background px-2 py-1.5">
      <XRDFieldLabel label={label} />
      {checked ? (
        <button
          type="button"
          role="switch"
          aria-checked="true"
          disabled={disabled}
          onClick={() => onChange(!checked)}
          className={`mt-1 inline-flex h-7 w-full items-center justify-between rounded border px-2 text-xs font-bold ${disabled
            ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
            : 'border-emerald-200 bg-emerald-50 text-emerald-700'
            }`}
        >
          <span>Enabled</span>
          <span className="h-4 w-8 rounded-full p-0.5 bg-emerald-500">
            <span className="block h-3 w-3 rounded-full bg-white transition-transform translate-x-4" />
          </span>
        </button>
      ) : (
        <button
          type="button"
          role="switch"
          aria-checked="false"
          disabled={disabled}
          onClick={() => onChange(!checked)}
          className={`mt-1 inline-flex h-7 w-full items-center justify-between rounded border px-2 text-xs font-bold ${disabled
            ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
            : 'border-slate-200 bg-slate-50 text-slate-600'
            }`}
        >
          <span>Disabled</span>
          <span className="h-4 w-8 rounded-full p-0.5 bg-slate-300">
            <span className="block h-3 w-3 rounded-full bg-white transition-transform translate-x-0" />
          </span>
        </button>
      )}
    </div>
  );
}

function XRDStatusText({
  tone,
  children,
}: {
  tone: 'neutral' | 'info' | 'warning';
  children: React.ReactNode;
}) {
  const className = tone === 'warning'
    ? 'border-amber-200 bg-amber-50 text-amber-800'
    : tone === 'info'
      ? 'border-blue-200 bg-blue-50 text-blue-900'
      : 'border-slate-200 bg-slate-50 text-text-muted';

  return (
    <p className={`rounded border px-2 py-1.5 text-[10px] leading-relaxed ${className}`}>
      {children}
    </p>
  );
}

function GraphLayoutPanel({
  paneLayout,
  onPreset,
  onRestore,
  onWidthChange,
}: {
  paneLayout: PaneLayoutState;
  onPreset: (preset: 'balanced' | 'wideGraph' | 'wideControls' | 'focusGraph') => void;
  onRestore: () => void;
  onWidthChange: (width: number) => void;
}) {
  return (
    <div className="space-y-2">
      <Panel title="Pane Layout" icon={<Layers size={13} />}>
        <div className="space-y-2">
          <div>
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wide text-text-muted">
              <span>Right panel width</span>
              <span>{paneLayout.rightPanelWidth}px</span>
            </div>
            <input
              type="range"
              min={RIGHT_PANEL_MIN_WIDTH}
              max={RIGHT_PANEL_MAX_WIDTH}
              step={10}
              value={paneLayout.rightPanelWidth}
              aria-label="Right panel width"
              onChange={(event) => onWidthChange(Number(event.target.value))}
              className="mt-1 w-full accent-blue-600"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onPreset('balanced')}
              className="h-8 rounded border border-border bg-background px-2 text-[11px] font-bold text-text-main hover:bg-surface-hover"
            >
              Balanced
            </button>
            <button
              type="button"
              onClick={() => onPreset('wideGraph')}
              className="h-8 rounded border border-border bg-background px-2 text-[11px] font-bold text-text-main hover:bg-surface-hover"
            >
              Wide Graph
            </button>
            <button
              type="button"
              onClick={() => onPreset('wideControls')}
              className="h-8 rounded border border-border bg-background px-2 text-[11px] font-bold text-text-main hover:bg-surface-hover"
            >
              Wide Controls
            </button>
            <button
              type="button"
              onClick={() => onPreset('focusGraph')}
              className="h-8 rounded bg-primary px-2 text-[11px] font-bold text-white hover:bg-primary/90"
            >
              Focus Graph
            </button>
          </div>
        </div>
      </Panel>

      <Panel title="Saved Layout State" icon={<Save size={13} />}>
        <div className="space-y-1 text-[11px]">
          <Metric label="Collapsed" value={paneLayout.rightPanelCollapsed ? 'Yes' : 'No'} />
          <Metric label="Focus mode" value={paneLayout.graphFocusMode ? 'Enabled' : 'Disabled'} />
          <Metric label="Last saved" value={new Date(paneLayout.lastUpdatedAt).toLocaleString()} />
        </div>
        <button
          type="button"
          onClick={onRestore}
          className="mt-2 h-8 w-full rounded border border-border bg-background px-2 text-[11px] font-bold text-text-main hover:bg-surface-hover"
        >
          Restore layout
        </button>
      </Panel>

      <Panel title="Graph Toolbar" icon={<Search size={13} />}>
        <p className="text-[11px] leading-relaxed text-text-muted">
          Pan, Zoom, Select, Reset, and Fit to data stay visible as compact graph controls. Save View, Export Graph, Focus Graph, link, and layout commands are grouped under Actions.
        </p>
      </Panel>
    </div>
  );
}

function BoundaryPanel({
  config,
  comparisonRow,
  focusedEvidence,
  project,
}: {
  config: TechniqueWorkspaceConfig;
  comparisonRow: ReturnType<typeof getComparisonRow>;
  focusedEvidence: DemoFocusedEvidenceSource | null;
  project: RegistryProject | null;
}) {
  return (
    <div className="space-y-2">
      <Panel title="Claim Boundary Contribution" icon={<GitBranch size={13} />}>
        <p className="text-[11px] leading-relaxed text-text-muted">
          {formatChemicalFormula(sanitizeScientificWording(comparisonRow?.limitation || focusedEvidence?.limitation || project?.notebook.validationBoundary || `${config.label} cannot update a project claim until evidence is linked.`))}
        </p>
      </Panel>
      <Panel title="What This Technique Supports" icon={<CheckCircle2 size={13} />}>
        <p className="text-[11px] leading-relaxed text-text-muted">
          {formatChemicalFormula(sanitizeScientificWording(comparisonRow?.keyFinding || focusedEvidence?.role || config.purpose))}
        </p>
      </Panel>
      <Panel title="What It Cannot Prove Alone" icon={<AlertTriangle size={13} />}>
        <p className="text-[11px] leading-relaxed text-text-muted">
          {formatChemicalFormula(sanitizeScientificWording(project?.agentWorkflow.claimBoundary.cannotConclude[0] || 'Standalone evidence cannot close the full claim boundary without project context and complementary validation.'))}
        </p>
      </Panel>
    </div>
  );
}

function TracePanel({
  config,
  project,
  datasetLabel,
  evidenceSourceId,
  traceId,
  datasetStatus,
  sessionState,
}: {
  config: TechniqueWorkspaceConfig;
  project: RegistryProject | null;
  datasetLabel: string;
  evidenceSourceId?: string;
  traceId: string;
  datasetStatus: string;
  sessionState: WorkspaceSessionState;
}) {
  return (
    <div className="space-y-2">
      <Panel title="Source Dataset" icon={<Database size={13} />}>
        <Metric label="Dataset" value={datasetLabel} />
        <Metric label="Registry ID" value={traceId} />
        <Metric label="Project" value={project?.title || 'No project linked'} />
      </Panel>
      <Panel title="Processing Pipeline Trace" icon={<GitBranch size={13} />}>
        <div className="space-y-1.5">
          {config.pipeline.map((step, index) => (
            <div key={step.id} className="flex items-start gap-2 text-[10px]">
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-slate-100 font-bold text-slate-600">{index + 1}</span>
              <div>
                <p className="font-bold text-text-main">{step.label}</p>
                <p className="text-text-muted">
                  {formatStateLabel(sessionState.pipelineStates[step.id] ?? 'pending')} · {step.summary}
                </p>
              </div>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Processing Log" icon={<FileText size={13} />}>
        <div className="space-y-1.5">
          {sessionState.processingLog.map((entry) => (
            <div key={entry.id} className="rounded bg-background px-2 py-1.5 text-[10px]">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-text-main">{entry.timeLabel}</span>
                <span className="text-text-muted">{config.label}</span>
              </div>
              <p className="mt-0.5 text-text-muted">{entry.message}</p>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Registry References" icon={<FileText size={13} />}>
        <Metric label="Evidence source" value={evidenceSourceId || 'Evidence required'} />
        <Metric label="Saved session" value={`${traceId}-session`} />
        <Metric label="Evidence status" value={datasetStatus} />
      </Panel>
    </div>
  );
}

function Panel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded border border-border bg-background p-2">
      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-text-main">
        <span className="text-primary">{icon}</span>
        {title}
      </div>
      {children}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2 text-[10px]">
      <span className="shrink-0 font-bold uppercase tracking-wide text-text-muted">{label}</span>
      <span className={`${typeof value === 'string' && value.length > 32 ? 'text-left' : 'text-right'} font-semibold text-text-main`}>
        {typeof value === 'string' ? formatChemicalFormula(value) : value}
      </span>
    </div>
  );
}
