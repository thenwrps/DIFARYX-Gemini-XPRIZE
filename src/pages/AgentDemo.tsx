import React, { useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  Bot,
  Brain,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  ClipboardList,
  Database,
  Download,
  FileText,
  FlaskConical,
  Grid3X3,
  Layers,
  Loader2,
  Lock,
  Microscope,
  Play,
  Target,
  Terminal,
} from 'lucide-react';
import { Graph } from '../components/ui/Graph';
import { Card } from '../components/ui/Card';
import { DashboardLayout } from '../components/layout/DashboardLayout';
import { useAuth } from '../contexts/AuthContext';
import { useXrdWorkflowRuntime, getStageLabel, isXrdBackendEvidenceRecord } from '../context/XrdWorkflowRuntimeContext';
import { runXrdPhaseIdentificationAgent } from '../agents/xrdAgent';
import {
  demoProjects,
  getProject,
  getProjectDatasets,
  saveAgentRunResult,
  DEFAULT_PROJECT_ID,
} from '../data/demoProjects';
import { getAnalysisSessions, getAnalysisSession } from '../data/analysisSessions';
import type {
  AgentRunResult,
  DemoDataset,
  DemoPeak,
  DemoProject,
  Technique,
  ClaimStatus,
  ValidationState,
} from '../data/demoProjects';
import { generateRunId, saveRun, type AgentRun } from '../data/runModel';
import { buildEvidencePacket } from '../agent/mcp/evidencePacket';
import { callReasoningAPI } from '../server/api/reasoning';
import { getProviderStatus } from '../server/llm/router';
import type { ReasoningOutput, ToolResult } from '../agent/mcp/types';
import {
  createNotebookEntryFromRefinement,
  createProcessingResultFromXrdDemo,
  getLatestProcessingResult,
  getProcessingResult,
  normalizeNotebookTemplateMode,
  refineDiscussionFromProcessing,
  saveAgentDiscussionRefinement,
  saveNotebookEntry,
  saveProcessingResult,
  type NotebookEntry,
} from '../data/workflowPipeline';
import {
  selectXrdWorkflowScientificEvidence,
  selectXrdWorkflowReferenceMatchEvidence,
  extractScientificEvidenceFields,
  extractReferenceMatchFields,
  selectXrdQualityMetrics,
  selectXrdPhaseMatchSummary,
} from '../data/xrdWorkflowHandoffSelectors';
import { LeftSidebar } from '../components/agent-demo/LeftSidebar';
import { MainHeader } from '../components/agent-demo/MainHeader';
import { CenterColumn } from '../components/agent-demo/CenterColumn';
import { RightPanel } from '../components/agent-demo/RightPanel';
import { MultiTechPopover } from '../components/agent-demo/MultiTechPopover';
import { evaluate as evaluateFusionEngine, createEvidenceNodes, type EvidenceNode, type FusionResult, type PeakInput } from '../engines/fusionEngine';
import {
  getLatestExperimentConditionLock,
  unlockExperimentConditions,
  lockExperimentConditions,
  type ExperimentConditionLock,
} from '../data/experimentConditionLock';
import {
  type AgentEvidenceWorkspace,
  type TechniqueId,
  type SelectedTechniqueState,
  type EvidenceReference,
  type TraceEventType,
  applyParameterChange,
  toggleTechnique,
  changeFocusedTechnique,
} from '../utils/agentEvidenceModel';
import {
  demoProjectRegistry,
  getFocusedEvidenceSource,
  getRegistryProject,
  isKnownProjectId,
  normalizeRegistryProjectId,
  type RegistryProject,
  type DemoReferencePlaceholder,
} from '../data/demoProjectRegistry';
import {
  getRuntimeBadgeClass,
  getRuntimeBadgeLabel,
  getRuntimeContextForEvidenceSource,
  requiresApproval,
  type RuntimeMode,
} from '../runtime/difaryxRuntimeMode';
import { getProjectEvidenceSnapshot, type ProjectEvidenceSnapshot } from '../utils/evidenceSnapshot';
import { createUploadedEvidenceRegistryProject } from '../utils/uploadedEvidenceProjectContext';
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

type TechniqueContext = Technique;
type AgentMode = 'deterministic' | 'guided' | 'autonomous';
type ModelMode = 'deterministic' | 'vertex-gemini' | 'gemma';
type ExecutionMode = 'auto' | 'step';
type ReasoningStepStatus = 'pending' | 'running' | 'complete';
type RunStatus = 'idle' | 'running' | 'complete';
type ToolStatus = ReasoningStepStatus | 'error';
type GraphType = 'xrd' | 'xps' | 'ftir' | 'raman';
type LogType = 'system' | 'tool' | 'success' | 'info';
type ToolCallType = 'deterministic-tool' | 'approval-gate' | 'local-write';
type ToolApprovalStatus = 'not-required' | 'approved' | 'gated' | 'pending';

type ExecutionLogEntry = {
  stamp: string;
  message: string;
  type: LogType;
};

type ToolTraceEntry = {
  id: string;
  timestamp: string;
  context: TechniqueContext;
  toolName: string;
  displayName: string;
  callType: ToolCallType;
  provider?: ModelMode;
  status: ToolStatus;
  argsSummary: string;
  resultSummary: string;
  evidenceImpact: string;
  approvalStatus: ToolApprovalStatus;
  durationMs: number;
  canInsertLlmReasoningAfter?: boolean;
};

type StageTemplate = {
  id: string;
  label: string;
  shortLabel: string;
  detail: string;
  toolName: string;
  displayName: string;
  inputSummary: string;
  outputSummary: string;
  durationMs: number;
  canInsertLlmReasoningAfter?: boolean;
};

type DecisionResult = {
  runId: string;
  primaryResult: string;
  subtitle: string;
  reasoningTrace: FusionResult['reasoningTrace'];
  conclusion: string;
  basis: string[];
  crossTech: string;
  limitations: string[];
  decision: string;
  highlightedEvidenceIds: string[];
  metrics: Array<{ label: string; value: string; tone?: 'cyan' | 'emerald' | 'violet' | 'amber' }>;
  detailRows: Array<Record<string, string | number>>;
};

type AgentDemoState = {
  projectId: string;
  sessionId?: string;
  mode: AgentMode;
  context: TechniqueContext;
  datasetId: string;
  selectedTechnique?: Technique;
  modelMode: ModelMode;
  graphState: {
    showMarkers: boolean;
  };
  reasoningState: {
    status: RunStatus;
    currentStepIndex: number;
    executionMode: ExecutionMode;
    result: DecisionResult | null;
    logs: ExecutionLogEntry[];
  };
  toolTrace: ToolTraceEntry[];
  llmState: {
    output: ReasoningOutput | null;
    usedLlm: boolean;
    fallbackUsed: boolean;
  };
};

type DatasetOption = {
  dataset: DemoDataset;
  project: DemoProject;
};

const DEFAULT_MISSION =
  'Investigate the selected scientific dataset and produce an evidence-linked material characterization interpretation.';

const AGENT_MODES: Record<AgentMode, {
  label: string;
  purpose: string;
  tabs: string[];
  primaryAction: string;
  inputLabel: string;
  inputPlaceholder: string;
}> = {
  deterministic: {
    label: 'Deterministic',
    purpose: 'Controlled reproducible workflow',
    tabs: ['Goal', 'Parameters', 'Evidence', 'Trace', 'Boundary'],
    primaryAction: 'Run Workflow',
    inputLabel: 'Goal',
    inputPlaceholder: 'Set a controlled goal for this project, such as checking secondary phases, reviewing peak evidence, or validating the claim boundary.',
  },
  guided: {
    label: 'Guided',
    purpose: 'Researcher-agent interpretation',
    tabs: ['Question', 'Evidence', 'Discussion', 'Boundary', 'Notebook'],
    primaryAction: 'Review Evidence',
    inputLabel: 'Researcher Question',
    inputPlaceholder: 'Ask the agent to interpret the selected evidence, compare techniques, or refine the scientific claim.',
  },
  autonomous: {
    label: 'Autonomous',
    purpose: 'Agent-led evidence review',
    tabs: ['Objective', 'Plan', 'Findings', 'Gaps', 'Decision'],
    primaryAction: 'Start Review',
    inputLabel: 'Review Objective',
    inputPlaceholder: 'Define the review objective. The agent will inspect evidence, identify validation gaps, and recommend the next scientific action.',
  },
};

const normalizeAgentMode = (value: string | null): AgentMode => {
  if (value === 'guided' || value === 'autonomous' || value === 'deterministic') return value;
  return 'deterministic';
};

const MODEL_MODE_LABELS: Record<ModelMode, string> = {
  deterministic: 'Deterministic Workflow',
  'vertex-gemini': 'Model Layer Pending',
  gemma: 'Open Model Pending',
};

const CONTEXT_ORDER: TechniqueContext[] = ['XRD', 'XPS', 'FTIR', 'Raman'];

const CONTEXT_CONFIG: Record<
  TechniqueContext,
  {
    label: string;
    graphType: GraphType;
    featureName: string;
    decisionKind: string;
    iconTone: string;
    stages: StageTemplate[];
    defaultFeatureCount: number;
  }
> = {
  XRD: {
    label: 'XRD Phase Identification',
    graphType: 'xrd',
    featureName: 'Diffraction peaks',
    decisionKind: 'Phase interpretation',
    iconTone: 'text-cyan-300',
    defaultFeatureCount: 9,
    stages: [
      {
        id: 'dataset',
        label: 'Load Dataset',
        shortLabel: 'Dataset',
        detail: 'XRD Science Skill: Loading diffraction spectrum and scan metadata.',
        toolName: 'load_xrd_dataset',
        displayName: 'XRD Science Skill: Load Dataset',
        inputSummary: '2theta-intensity spectrum',
        outputSummary: 'Spectrum loaded and checked',
        durationMs: 560,
      },
      {
        id: 'features',
        label: 'Peak Detection',
        shortLabel: 'Features',
        detail: 'XRD Science Skill: Extracting peaks from active spectrum.',
        toolName: 'detect_xrd_peaks',
        displayName: 'XRD Science Skill: Peak Detection',
        inputSummary: 'Baseline-corrected XRD trace',
        outputSummary: 'Diffraction peaks detected',
        durationMs: 640,
      },
      {
        id: 'search',
        label: 'Candidate Search',
        shortLabel: 'Search',
        detail: 'XRD Science Skill: Querying reference patterns for compatible phases.',
        toolName: 'search_phase_database',
        displayName: 'XRD Science Skill: Candidate Search',
        inputSummary: 'Observed peak positions',
        outputSummary: 'Candidate phase references retrieved',
        durationMs: 680,
      },
      {
        id: 'score',
        label: 'Evaluate Candidates',
        shortLabel: 'Evaluating',
        detail: 'XRD Science Skill: Evaluating phase candidates against structural profiles.',
        toolName: 'evaluate_phase_candidates',
        displayName: 'XRD Science Skill: Candidate Evaluation',
        inputSummary: 'Observed peaks and candidate references',
        outputSummary: 'Candidate evaluation prepared',
        durationMs: 620,
      },
      {
        id: 'fusion',
        label: 'Evidence Fusion',
        shortLabel: 'Fusion',
        detail: 'Cross-Technique Fusion Skill: Correlating bulk structural findings with surface and molecular evidence.',
        toolName: 'analyze_peak_conflicts',
        displayName: 'Cross-Technique Fusion Skill',
        inputSummary: 'Ranked candidates and unexplained features',
        outputSummary: 'Conflict analysis prepared',
        durationMs: 580,
        canInsertLlmReasoningAfter: true,
      },
      {
        id: 'ai_interpretation',
        label: 'Interpretation',
        shortLabel: 'Interpret',
        detail: 'Evidence-to-Report Skill: Formulating a validation-limited interpretation chain.',
        toolName: 'interpretation_refinement',
        displayName: 'Evidence-to-Report Skill: Interpreter',
        inputSummary: 'Aggregated evidence from deterministic analysis',
        outputSummary: 'Skill-derived interpretation generated',
        durationMs: 720,
      },
      {
        id: 'decision',
        label: 'Claim Boundary Review',
        shortLabel: 'Boundary',
        detail: 'Validation Boundary Skill: Reviewing claim limitations and next experimental steps.',
        toolName: 'generate_xrd_interpretation',
        displayName: 'Validation Boundary Skill: Claim Review',
        inputSummary: 'Evaluation results, evidence, conflicts, and caveats',
        outputSummary: 'Validation-limited scientific claim prepared',
        durationMs: 620,
      },
    ],
  },
  XPS: {
    label: 'XPS Surface Chemistry',
    graphType: 'xps',
    featureName: 'Core-level components',
    decisionKind: 'Surface chemistry interpretation',
    iconTone: 'text-violet-300',
    defaultFeatureCount: 5,
    stages: [
      {
        id: 'dataset',
        label: 'Load Dataset',
        shortLabel: 'Dataset',
        detail: 'XPS Science Skill: Loading binding-energy spectrum and acquisition metadata.',
        toolName: 'load_xps_spectrum',
        displayName: 'XPS Science Skill: Load Dataset',
        inputSummary: 'Binding-energy intensity spectrum',
        outputSummary: 'XPS spectrum loaded',
        durationMs: 560,
      },
      {
        id: 'background',
        label: 'Background Model',
        shortLabel: 'Process',
        detail: 'XPS Science Skill: Subtracting Shirley/Tougaard background and checking envelope.',
        toolName: 'subtract_xps_background',
        displayName: 'XPS Science Skill: Background Model',
        inputSummary: 'Raw survey and core-level envelope',
        outputSummary: 'Background-adjusted signal prepared',
        durationMs: 620,
      },
      {
        id: 'components',
        label: 'Component Detection',
        shortLabel: 'Features',
        detail: 'XPS Science Skill: Extracting core photoelectron envelopes (Cu, Fe, O).',
        toolName: 'detect_core_level_components',
        displayName: 'XPS Science Skill: Component Detection',
        inputSummary: 'Processed XPS spectrum',
        outputSummary: 'Core-level components detected',
        durationMs: 650,
      },
      {
        id: 'assignment',
        label: 'Chemistry Assignment',
        shortLabel: 'Assign',
        detail: 'XPS Science Skill: Mapping component peaks to oxidation states.',
        toolName: 'assign_oxidation_states',
        displayName: 'XPS Science Skill: Chemistry Assignment',
        inputSummary: 'Detected component windows',
        outputSummary: 'Surface chemistry candidates ranked',
        durationMs: 600,
      },
      {
        id: 'fusion',
        label: 'Evidence Fusion',
        shortLabel: 'Fusion',
        detail: 'Cross-Technique Fusion Skill: Correlating surface chemical states with bulk phase indications.',
        toolName: 'evaluate_surface_evidence',
        displayName: 'Cross-Technique Fusion Skill',
        inputSummary: 'Assignments, project context, and known limitations',
        outputSummary: 'Surface evidence fused',
        durationMs: 580,
        canInsertLlmReasoningAfter: true,
      },
      {
        id: 'ai_interpretation',
        label: 'Interpretation',
        shortLabel: 'Interpret',
        detail: 'Evidence-to-Report Skill: Formulating a validation-limited interpretation chain.',
        toolName: 'interpretation_refinement',
        displayName: 'Evidence-to-Report Skill: Interpreter',
        inputSummary: 'Aggregated evidence from deterministic analysis',
        outputSummary: 'Skill-derived interpretation generated',
        durationMs: 720,
      },
      {
        id: 'decision',
        label: 'Claim Boundary Review',
        shortLabel: 'Boundary',
        detail: 'Validation Boundary Skill: Reviewing claim limitations and next experimental steps.',
        toolName: 'decision_logic',
        displayName: 'Validation Boundary Skill: Claim Review',
        inputSummary: 'Evidence summary and limitations',
        outputSummary: 'Validation-limited scientific claim prepared',
        durationMs: 620,
      },
    ],
  },
  FTIR: {
    label: 'FTIR Bonding Analysis',
    graphType: 'ftir',
    featureName: 'Vibrational bands',
    decisionKind: 'Bonding interpretation',
    iconTone: 'text-rose-300',
    defaultFeatureCount: 4,
    stages: [
      {
        id: 'dataset',
        label: 'Load Dataset',
        shortLabel: 'Dataset',
        detail: 'FTIR Science Skill: Loading transmittance spectrum and sample metadata.',
        toolName: 'load_ftir_spectrum',
        displayName: 'FTIR Science Skill: Load Dataset',
        inputSummary: 'Wavenumber-transmittance spectrum',
        outputSummary: 'FTIR spectrum loaded',
        durationMs: 540,
      },
      {
        id: 'baseline',
        label: 'Baseline Check',
        shortLabel: 'Process',
        detail: 'FTIR Science Skill: Subtracting baseline envelope and calibrating intensity.',
        toolName: 'correct_ftir_baseline',
        displayName: 'FTIR Science Skill: Baseline Check',
        inputSummary: 'Raw FTIR trace',
        outputSummary: 'Baseline-adjusted trace prepared',
        durationMs: 600,
      },
      {
        id: 'bands',
        label: 'Band Detection',
        shortLabel: 'Features',
        detail: 'FTIR Science Skill: Extracting diagnostic functional bands.',
        toolName: 'detect_ftir_bands',
        displayName: 'FTIR Science Skill: Band Detection',
        inputSummary: 'Processed FTIR spectrum',
        outputSummary: 'Vibrational bands detected',
        durationMs: 640,
      },
      {
        id: 'assignment',
        label: 'Mode Assignment',
        shortLabel: 'Assign',
        detail: 'FTIR Science Skill: Mapping bands to functional group bonds.',
        toolName: 'assign_vibrational_modes',
        displayName: 'FTIR Science Skill: Mode Assignment',
        inputSummary: 'Detected band positions',
        outputSummary: 'Band assignments generated',
        durationMs: 620,
      },
      {
        id: 'fusion',
        label: 'Evidence Fusion',
        shortLabel: 'Fusion',
        detail: 'Cross-Technique Fusion Skill: Correlating functional group presence with bulk and surface phases.',
        toolName: 'evaluate_bonding_evidence',
        displayName: 'Cross-Technique Fusion Skill',
        inputSummary: 'Band assignments and material context',
        outputSummary: 'Bonding evidence fused',
        durationMs: 580,
        canInsertLlmReasoningAfter: true,
      },
      {
        id: 'ai_interpretation',
        label: 'Interpretation',
        shortLabel: 'Interpret',
        detail: 'Evidence-to-Report Skill: Formulating a validation-limited interpretation chain.',
        toolName: 'interpretation_refinement',
        displayName: 'Evidence-to-Report Skill: Interpreter',
        inputSummary: 'Aggregated evidence from deterministic analysis',
        outputSummary: 'Skill-derived interpretation generated',
        durationMs: 720,
      },
      {
        id: 'decision',
        label: 'Claim Boundary Review',
        shortLabel: 'Boundary',
        detail: 'Validation Boundary Skill: Reviewing claim limitations and next experimental steps.',
        toolName: 'decision_logic',
        displayName: 'Validation Boundary Skill: Claim Review',
        inputSummary: 'Evidence summary and caveats',
        outputSummary: 'Validation-limited scientific claim prepared',
        durationMs: 620,
      },
    ],
  },
  Raman: {
    label: 'Raman Structural Fingerprint',
    graphType: 'raman',
    featureName: 'Raman modes',
    decisionKind: 'Structural fingerprint interpretation',
    iconTone: 'text-emerald-300',
    defaultFeatureCount: 6,
    stages: [
      {
        id: 'dataset',
        label: 'Load Dataset',
        shortLabel: 'Dataset',
        detail: 'Raman Science Skill: Loading Raman shift spectrum and sample metadata.',
        toolName: 'load_raman_spectrum',
        displayName: 'Raman Science Skill: Load Dataset',
        inputSummary: 'Raman shift-intensity spectrum',
        outputSummary: 'Raman spectrum loaded',
        durationMs: 540,
      },
      {
        id: 'preprocess',
        label: 'Signal Check',
        shortLabel: 'Process',
        detail: 'Raman Science Skill: Removing fluorescence background and cosmic ray anomalies.',
        toolName: 'preprocess_raman_signal',
        displayName: 'Raman Science Skill: Signal Check',
        inputSummary: 'Raw Raman trace',
        outputSummary: 'Processed Raman trace prepared',
        durationMs: 600,
      },
      {
        id: 'modes',
        label: 'Mode Detection',
        shortLabel: 'Features',
        detail: 'Raman Science Skill: Extracting Raman-active lattice vibrational modes.',
        toolName: 'detect_raman_modes',
        displayName: 'Raman Science Skill: Mode Detection',
        inputSummary: 'Processed Raman spectrum',
        outputSummary: 'Raman modes detected',
        durationMs: 650,
      },
      {
        id: 'fingerprint',
        label: 'Fingerprint Match',
        shortLabel: 'Match',
        detail: 'Raman Science Skill: Matching lattice modes with symmetry database fingerprints.',
        toolName: 'match_structural_fingerprint',
        displayName: 'Raman Science Skill: Fingerprint Match',
        inputSummary: 'Detected mode positions',
        outputSummary: 'Structural fingerprints ranked',
        durationMs: 620,
      },
      {
        id: 'fusion',
        label: 'Evidence Fusion',
        shortLabel: 'Fusion',
        detail: 'Cross-Technique Fusion Skill: Correlating local vibrational fingerprint with bulk phase data.',
        toolName: 'evaluate_structural_evidence',
        displayName: 'Cross-Technique Fusion Skill',
        inputSummary: 'Mode assignments and material context',
        outputSummary: 'Structural evidence fused',
        durationMs: 580,
        canInsertLlmReasoningAfter: true,
      },
      {
        id: 'ai_interpretation',
        label: 'Interpretation',
        shortLabel: 'Interpret',
        detail: 'Evidence-to-Report Skill: Formulating a validation-limited interpretation chain.',
        toolName: 'interpretation_refinement',
        displayName: 'Evidence-to-Report Skill: Interpreter',
        inputSummary: 'Aggregated evidence from deterministic analysis',
        outputSummary: 'Skill-derived interpretation generated',
        durationMs: 720,
      },
      {
        id: 'decision',
        label: 'Claim Boundary Review',
        shortLabel: 'Boundary',
        detail: 'Validation Boundary Skill: Reviewing claim limitations and next experimental steps.',
        toolName: 'decision_logic',
        displayName: 'Validation Boundary Skill: Claim Review',
        inputSummary: 'Evidence summary and limitations',
        outputSummary: 'Validation-limited scientific claim prepared',
        durationMs: 620,
      },
    ],
  },
};

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/**
 * Convert detected XRD peaks to PeakInput format for fusionEngine
 */
function convertXrdPeaksToPeakInput(
  detectedPeaks: DemoPeak[],
): PeakInput[] {
  return detectedPeaks.map((peak, index) => ({
    id: `xrd-peak-${index}`,
    position: peak.position,
    intensity: peak.intensity,
    label: peak.label,
  }));
}

/**
 * Convert demo dataset features to PeakInput format for fusionEngine
 */
function convertDatasetFeaturesToPeakInput(
  dataset: DemoDataset,
): PeakInput[] {
  return dataset.detectedFeatures.map((feature, index) => ({
    id: `${dataset.id}-feature-${index}`,
    position: feature.position,
    intensity: feature.intensity,
    label: feature.label || `Feature at ${feature.position.toFixed(1)}`,
  }));
}

const TECHNIQUE_DISPLAY: Record<TechniqueContext, {
  featureLabel: string;
  rangeLabel: string;
  dominantLabel: string;
  qualityLabel: string;
  observedLabel: string;
  formatRange: (min: number, max: number) => string;
  formatPosition: (value: number) => string;
}> = {
  XRD: {
    featureLabel: 'Detected peaks',
    rangeLabel: '2Î¸ range',
    dominantLabel: 'Dominant reflections',
    qualityLabel: 'Signal quality',
    observedLabel: 'Observed peaks (2Î¸)',
    formatRange: (min, max) => `${min.toFixed(1)} deg - ${max.toFixed(1)} deg`,
    formatPosition: (value) => `${value.toFixed(1)} deg`,
  },
  Raman: {
    featureLabel: 'Detected bands',
    rangeLabel: 'Raman shift range',
    dominantLabel: 'Dominant bands',
    qualityLabel: 'Spectral quality',
    observedLabel: 'Observed bands (cm-1)',
    formatRange: (min, max) => `${Math.round(min)} - ${Math.round(max)} cm-1`,
    formatPosition: (value) => `${Math.round(value)} cm-1`,
  },
  FTIR: {
    featureLabel: 'Detected bands',
    rangeLabel: 'Wavenumber range',
    dominantLabel: 'Dominant absorption bands',
    qualityLabel: 'Baseline quality',
    observedLabel: 'Observed bands (cm-1)',
    formatRange: (min, max) => `${Math.round(min)} - ${Math.round(max)} cm-1`,
    formatPosition: (value) => `${Math.round(value)} cm-1`,
  },
  XPS: {
    featureLabel: 'Detected components',
    rangeLabel: 'Binding energy window',
    dominantLabel: 'Dominant core levels',
    qualityLabel: 'Fit quality',
    observedLabel: 'Observed core levels (eV)',
    formatRange: (min, max) => `${Math.round(min)} - ${Math.round(max)} cm-1`,
    formatPosition: (value) => `${value.toFixed(1)} deg`,
  },
};

function getUnitForTechnique(technique: Technique): string {
  switch (technique) {
    case 'XRD': return '2Î¸';
    case 'Raman': return 'cm-1';
    case 'FTIR': return 'cm-1';
    case 'XPS': return 'eV';
    default: return '';
  }
}

function contextToGraphType(context: TechniqueContext): GraphType {
  return CONTEXT_CONFIG[context].graphType;
}

function makePendingDatasetOption(project: DemoProject, context: TechniqueContext): DatasetOption {
  return {
    project,
    dataset: {
      id: `${project.id}-${context.toLowerCase()}-pending`,
      projectId: project.id,
      technique: context,
      fileName: `${project.name} ${context} evidence pending`,
      sampleName: project.name,
      xLabel: context === 'XRD' ? '2θ (°)' : context === 'XPS' ? 'Binding Energy (eV)' : context === 'FTIR' ? 'Wavenumber (cm⁻¹)' : 'Raman Shift (cm⁻¹)',
      yLabel: 'Signal',
      dataPoints: [],
      metadata: {
        experimentTitle: `${project.name} ${context} evidence pending`,
        sampleName: project.name,
        materialSystem: project.material,
        operator: 'DIFARYX demo',
        date: project.lastUpdated,
        notes: `No project-linked ${context} dataset is available yet.`,
      },
      processingState: {
        imported: false,
        baseline: false,
        smoothing: false,
        normalize: false,
      },
      detectedFeatures: [],
      evidence: [],
      savedRuns: [],
    },
  };
}

function getDatasetOptions(context: TechniqueContext, projectId?: string): DatasetOption[] {
  const projects = projectId
    ? demoProjects.filter((project) => project.id === projectId)
    : demoProjects;

  return projects.flatMap((project) =>
    getProjectDatasets(project.id)
      .filter((dataset) => dataset.technique === context)
      .map((dataset) => ({ project, dataset })),
  );
}

function getDefaultContext(project: DemoProject): TechniqueContext {
  return project.techniques.find((technique) => CONTEXT_ORDER.includes(technique)) ?? 'XRD';
}

function getDefaultDatasetId(context: TechniqueContext, projectId: string) {
  const options = getDatasetOptions(context, projectId);
  return options[0]?.dataset.id ?? `${projectId}-${context.toLowerCase()}-pending`;
}

function getDatasetOption(context: TechniqueContext, datasetId: string, projectId: string): DatasetOption {
  const project = getProject(projectId) ?? getProject(DEFAULT_PROJECT_ID)!;
  const options = getDatasetOptions(context, project.id);
  return options.find((option) => option.dataset.id === datasetId) ?? options[0] ?? makePendingDatasetOption(project, context);
}

function makeInitialState(
  projectId: string,
  mode: AgentMode,
  defaultTechnique?: TechniqueContext,
  sessionId?: string,
): AgentDemoState {
  const normalizedProjectId = normalizeRegistryProjectId(projectId) || DEFAULT_PROJECT_ID;
  const project = getProject(normalizedProjectId) ?? getProject(DEFAULT_PROJECT_ID)!;
  const context = defaultTechnique || getDefaultContext(project);
  const datasetId = getDefaultDatasetId(context, project.id);

  return {
    projectId: project.id,
    sessionId,
    mode,
    context,
    datasetId,
    modelMode: 'deterministic',
    graphState: {
      showMarkers: false,
    },
    reasoningState: {
      status: 'idle',
      currentStepIndex: -1,
      executionMode: 'auto',
      result: null,
      logs: [],
    },
    toolTrace: createToolTrace(context),
    llmState: {
      output: null,
      usedLlm: false,
      fallbackUsed: false,
    },
  };
}

function formatStamp(index: number) {
  return `00:${String(2 + index * 4).padStart(2, '0')}`;
}

function mapToolTraceToExecutionSteps(
  toolTrace: ToolTraceEntry[],
  stages: StageTemplate[],
): Array<{
  number: number;
  title: string;
  description: string;
  tool: string;
  time: string;
  status: 'pending' | 'running' | 'complete' | 'error';
}> {
  return toolTrace.map((entry, index) => ({
    number: index + 1,
    title: stages[index]?.label || entry.displayName,
    description: stages[index]?.detail || entry.argsSummary,
    tool: entry.displayName,
    time: `${(entry.durationMs / 1000).toFixed(1)}s`,
    status: entry.status,
  }));
}


function createToolTrace(context: TechniqueContext): ToolTraceEntry[] {
  return CONTEXT_CONFIG[context].stages.map((stage, index) => ({
    id: `${context.toLowerCase()}-${stage.id}`,
    timestamp: formatStamp(index),
    context,
    toolName: stage.toolName,
    displayName: stage.displayName,
    callType: 'deterministic-tool',
    provider: 'deterministic',
    status: 'pending',
    argsSummary: stage.inputSummary,
    resultSummary: stage.outputSummary,
    evidenceImpact: stage.detail,
    approvalStatus: 'not-required',
    durationMs: stage.durationMs,
    canInsertLlmReasoningAfter: stage.canInsertLlmReasoningAfter,
  }));
}

function resetRunState(
  previous: AgentDemoState,
  context = previous.context,
  datasetId = previous.datasetId,
): AgentDemoState {
  return {
    ...previous,
    context,
    datasetId,
    graphState: {
      showMarkers: false,
    },
    reasoningState: {
      ...previous.reasoningState,
      status: 'idle',
      currentStepIndex: -1,
      result: null,
      logs: [],
    },
    toolTrace: createToolTrace(context),
    llmState: {
      output: null,
      usedLlm: false,
      fallbackUsed: false,
    },
  };
}

function reasoningStatus(index: number, state: AgentDemoState): ReasoningStepStatus {
  const { currentStepIndex, status } = state.reasoningState;
  if (status === 'running' && index === currentStepIndex) return 'running';
  if (index <= currentStepIndex) return 'complete';
  return 'pending';
}

function updateTraceStatus(
  trace: ToolTraceEntry[],
  index: number,
  status: ToolStatus,
): ToolTraceEntry[] {
  return trace.map((entry, itemIndex) =>
    itemIndex === index ? { ...entry, status } : entry,
  );
}

function logClass(type: LogType) {
  if (type === 'tool') return 'text-cyan-300';
  if (type === 'success') return 'text-emerald-300';
  if (type === 'system') return 'text-indigo-200';
  return 'text-slate-300';
}

function statusClass(status: ReasoningStepStatus) {
  if (status === 'complete') return 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300';
  if (status === 'running') return 'border-cyan-400/40 bg-cyan-400/10 text-cyan-300';
  return 'border-slate-800 bg-[#070B12] text-slate-500';
}

function toolStatusIcon(status: ToolStatus) {
  if (status === 'complete') return <CheckCircle2 size={12} className="text-emerald-300" />;
  if (status === 'running') return <Loader2 size={12} className="animate-spin text-cyan-300" />;
  if (status === 'error') return <AlertTriangle size={12} className="text-amber-300" />;
  return <CircleDot size={12} className="text-slate-600" />;
}

function formatReviewStatus(status: string) {
  switch (status) {
    case 'strongly_supported':
    case 'complete':
      return 'Supported';
    case 'supported':
      return 'Requires validation';
    case 'partial':
      return 'Validation-limited';
    case 'pending':
      return 'Pending';
    default:
      return 'Claim boundary';
  }
}

type XRDReferenceMatchV2SummaryForAgent = NonNullable<XRDBackendEvidenceRecord['referenceMatchV2Summary']>;

const XRD_REFERENCE_CANDIDATE_DEFAULT_LIMITATIONS = [
  'Candidate match is based on peak-position agreement.',
  'Chemical identity requires composition-sensitive evidence.',
  'Phase purity is outside this XRD-only candidate evidence.',
];

function isBlockedReferenceCandidatePhrase(value: string) {
  const normalized = value.toLowerCase();
  return (
    (normalized.includes('confirmed') && normalized.includes('phase')) ||
    (normalized.includes('confirmed') && normalized.includes('identity')) ||
    (normalized.includes('identified') && normalized.includes(' as ')) ||
    (normalized.includes('pure') && normalized.includes('phase')) ||
    (normalized.includes('definitive') && normalized.includes('match'))
  );
}

function safeReferenceCandidateText(value: string | undefined | null): string | null {
  const normalized = value?.trim();
  if (!normalized) return null;
  return isBlockedReferenceCandidatePhrase(normalized) ? null : normalized;
}

function formatAgentNumber(value: number | undefined | null, digits = 2) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : null;
}

function finiteAgentNumber(value: number | undefined | null): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function buildReferenceCandidateAgentEvidence(summary: XRDReferenceMatchV2SummaryForAgent) {
  const primaryCandidate = summary.primaryCandidate;
  const candidateLabel = safeReferenceCandidateText(primaryCandidate?.phaseLabel);
  const formula = safeReferenceCandidateText(primaryCandidate?.formula);
  const claimLevel = safeReferenceCandidateText(summary.claimLevel) ?? 'candidate evidence';
  const referenceSet = safeReferenceCandidateText(summary.referenceSetId);
  const score = formatAgentNumber(primaryCandidate?.score);
  const coverage = formatAgentNumber(primaryCandidate?.coverageRatio);
  const meanDelta = formatAgentNumber(primaryCandidate?.meanDeltaTwoTheta);
  const matchedPeakCount = primaryCandidate?.matchedPeakCount;
  const referencePeakCount = primaryCandidate?.referencePeakCount;
  const matchedPeakRatio =
    typeof matchedPeakCount === 'number' && Number.isFinite(matchedPeakCount)
      ? `${matchedPeakCount}${typeof referencePeakCount === 'number' && Number.isFinite(referencePeakCount) ? `/${referencePeakCount}` : ''}`
      : null;
  const peakPreview = summary.matchedPeaksPreview
    ?.slice(0, 5)
    .map((peak) => {
      const measured = formatAgentNumber(peak.measuredTwoTheta);
      const reference = formatAgentNumber(peak.referenceTwoTheta);
      const delta = formatAgentNumber(peak.deltaTwoTheta);
      if (!measured || !reference || !delta) return null;
      const hkl = safeReferenceCandidateText(peak.hkl);
      return `${measured}->${reference} deg${hkl ? ` (${hkl})` : ''}, delta ${delta}`;
    })
    .filter((peak): peak is string => Boolean(peak));

  const evidenceLines = [
    `Reference-supported candidate evidence available: claim level ${claimLevel}${referenceSet ? ` using ${referenceSet}` : ''}.`,
  ];

  if (candidateLabel || formula) {
    evidenceLines.push(
      `Primary reference candidate: ${[candidateLabel, formula].filter(Boolean).join(' / ')}.`,
    );
  }

  const scoringParts = [
    score ? `score ${score}` : null,
    coverage ? `coverage ${coverage}` : null,
    matchedPeakRatio ? `${matchedPeakRatio} matched peaks` : null,
    meanDelta ? `mean delta 2theta ${meanDelta}` : null,
  ].filter(Boolean);

  if (scoringParts.length > 0) {
    evidenceLines.push(`Peak-level reference agreement: ${scoringParts.join(', ')}.`);
  }

  if (peakPreview && peakPreview.length > 0) {
    evidenceLines.push(`Matched peak preview: ${peakPreview.join('; ')}.`);
  }

  const limitations = (summary.limitations?.length ? summary.limitations : XRD_REFERENCE_CANDIDATE_DEFAULT_LIMITATIONS)
    .map((limitation) => safeReferenceCandidateText(limitation))
    .filter((limitation): limitation is string => Boolean(limitation));

  return {
    evidenceLines,
    limitations: limitations.length > 0 ? limitations : XRD_REFERENCE_CANDIDATE_DEFAULT_LIMITATIONS,
    candidateLabel,
    formula,
    claimLevel,
  };
}

function buildNotebookReferenceCandidateEvidence(
  summary: XRDReferenceMatchV2SummaryForAgent,
): NotebookEntry['xrdReferenceMatchV2Summary'] {
  const candidateEvidence = buildReferenceCandidateAgentEvidence(summary);
  const primaryCandidate = summary.primaryCandidate;
  const phaseLabel = safeReferenceCandidateText(primaryCandidate?.phaseLabel);
  const formula = safeReferenceCandidateText(primaryCandidate?.formula);
  const structureFamily = safeReferenceCandidateText(primaryCandidate?.structureFamily);
  const databaseRef = safeReferenceCandidateText(primaryCandidate?.databaseRef);
  const score = finiteAgentNumber(primaryCandidate?.score);
  const matchedPeakCount = finiteAgentNumber(primaryCandidate?.matchedPeakCount);
  const referencePeakCount = finiteAgentNumber(primaryCandidate?.referencePeakCount);
  const coverageRatio = finiteAgentNumber(primaryCandidate?.coverageRatio);
  const meanDeltaTwoTheta = finiteAgentNumber(primaryCandidate?.meanDeltaTwoTheta);

  const notebookPrimaryCandidate = primaryCandidate
    ? {
        ...(phaseLabel ? { phaseLabel } : {}),
        ...(formula ? { formula } : {}),
        ...(structureFamily ? { structureFamily } : {}),
        ...(databaseRef ? { databaseRef } : {}),
        ...(score !== undefined ? { score } : {}),
        ...(matchedPeakCount !== undefined ? { matchedPeakCount } : {}),
        ...(referencePeakCount !== undefined ? { referencePeakCount } : {}),
        ...(coverageRatio !== undefined ? { coverageRatio } : {}),
        meanDeltaTwoTheta: meanDeltaTwoTheta ?? null,
      }
    : undefined;

  const matchedPeaksPreview = summary.matchedPeaksPreview
    ?.slice(0, 5)
    .map((peak) => {
      const measuredTwoTheta = finiteAgentNumber(peak.measuredTwoTheta);
      const referenceTwoTheta = finiteAgentNumber(peak.referenceTwoTheta);
      const deltaTwoTheta = finiteAgentNumber(peak.deltaTwoTheta);
      if (
        measuredTwoTheta === undefined ||
        referenceTwoTheta === undefined ||
        deltaTwoTheta === undefined
      ) {
        return null;
      }
      return {
        measuredTwoTheta,
        referenceTwoTheta,
        deltaTwoTheta,
        hkl: safeReferenceCandidateText(peak.hkl),
        referenceRelativeIntensity: finiteAgentNumber(peak.referenceRelativeIntensity) ?? null,
      };
    })
    .filter(Boolean) as NonNullable<NonNullable<NotebookEntry['xrdReferenceMatchV2Summary']>['matchedPeaksPreview']>;

  return {
    label: 'Reference candidate evidence',
    status: safeReferenceCandidateText(summary.status) ?? 'candidate evidence',
    claimLevel: candidateEvidence.claimLevel,
    ...(safeReferenceCandidateText(summary.referenceSetId) ? { referenceSetId: safeReferenceCandidateText(summary.referenceSetId) as string } : {}),
    ...(finiteAgentNumber(summary.candidateCount) !== undefined ? { candidateCount: finiteAgentNumber(summary.candidateCount) } : {}),
    ...(notebookPrimaryCandidate && Object.keys(notebookPrimaryCandidate).length > 0 ? { primaryCandidate: notebookPrimaryCandidate } : {}),
    ...(matchedPeaksPreview && matchedPeaksPreview.length > 0 ? { matchedPeaksPreview } : {}),
    limitations: candidateEvidence.limitations,
    phaseConfirmed: false,
    phasePurityConfirmed: false,
    savedAt: safeReferenceCandidateText(summary.savedAt) ?? undefined,
  };
}

import { formatChemicalFormula } from '../utils';
import { buildAgentContext, type AgentContext, type WorkspaceParameters } from '../utils/agentContext';
import { readLatestXrdBackendEvidenceResult, type XRDBackendEvidenceRecord } from '../data/xrdBackendEvidence';
import type { XRDWorkflowReferenceMatchEvidence } from '../types/xrdWorkflowContract';
import {
  getProjectTechniques,
  getProjectParameterGroups,
  type ParameterGroupId,
} from '../utils/projectEvidence';
import { ApprovalActionDialog } from '../components/runtime/ApprovalActionDialog';
import { ConnectedAccountStatus } from '../components/runtime/ConnectedAccountStatus';
import {
  createApprovalActionPreview,
  type ApprovalActionPreview,
  type ApprovalActionType,
  type ApprovalRiskLevel,
} from '../runtime/actionApproval';
import { appendApprovalLedgerEntry, createApprovalLedgerEntry } from '../runtime/approvalLedger';
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
  clearTechniqueParameterOverrides,
  getParameterOverrideStorageKey,
  readProjectWorkspaceParameters,
  writeProjectWorkspaceParameters,
} from '../utils/workspaceParameterOverrides';
import {
  getParameterProvenanceSummary,
  formatProvenanceSource,
} from '../utils/parameterProvenanceSummary';
import type { TechniqueWorkspaceId } from '../data/techniqueWorkspaceContent';
import { getXrdProcessingParams, getXrdParameterSnapshot } from '../utils/xrdParameterAdapter';
import { getRamanParameterSnapshot } from '../utils/ramanParameterAdapter';
import { getXpsParameterSnapshot } from '../utils/xpsParameterAdapter';
import { getFtirParameterSnapshot } from '../utils/ftirParameterAdapter';

function FormulaText({
  children,
  className = '',
}: {
  children: string | number;
  className?: string;
}) {
  return <span className={`agent-formula ${className}`}>{formatChemicalFormula(String(children))}</span>;
}

function asDemoPeaks(peaks: Array<{ position: number; intensity: number; label?: string }>): DemoPeak[] {
  return peaks.map((peak, index) => ({
    position: Number(peak.position.toFixed(2)),
    intensity: Number(peak.intensity.toFixed(1)),
    label: peak.label ?? `F${index + 1}`,
  }));
}

function registryJobTypeForAgent(project: RegistryProject): AgentEvidenceWorkspace['jobType'] {
  if (project.jobType === 'rd') return 'rnd';
  return project.jobType;
}

function roleForTechnique(techniqueId: TechniqueId): SelectedTechniqueState['evidenceRole'] {
  if (techniqueId === 'xps') return 'surface-state';
  if (techniqueId === 'raman') return 'vibrational-support';
  if (techniqueId === 'ftir') return 'bonding-context';
  return 'primary-structural';
}

function mapReference(ref: DemoReferencePlaceholder): EvidenceReference {
  return {
    type: ref.type === 'google_scholar' ? 'google-scholar' : ref.type,
    label: ref.label,
    status: ref.status === 'not_connected' ? 'not-connected' : ref.status,
    whyItMatters: ref.note,
    boundaryImpact: ref.note,
  };
}

function buildEvidenceWorkspaceFromRegistry(project: RegistryProject): AgentEvidenceWorkspace {
  const selectedIds = Array.from(
    new Set([
      ...project.selectedTechniques,
      ...project.crossTechniqueComparison.matrix.map((row) => row.techniqueId),
    ]),
  ).filter((id): id is Exclude<TechniqueId, 'multi'> =>
    ['xrd', 'xps', 'ftir', 'raman'].includes(id),
  );
  const defaultFocus =
    project.primaryTechnique && selectedIds.includes(project.primaryTechnique as Exclude<TechniqueId, 'multi'>)
      ? project.primaryTechnique
      : selectedIds[0] || 'xrd';
  const references = project.crossTechniqueComparison.references.map(mapReference);

  const techniques: SelectedTechniqueState[] = selectedIds.map((techniqueId) => {
    const technique = project.techniques.find((item) => item.id === techniqueId);
    const evidence = project.evidenceResults.find((item) => item.techniqueId === techniqueId);
    const row = project.crossTechniqueComparison.matrix.find((item) => item.techniqueId === techniqueId);
    const source = project.workspaceGraphs[techniqueId];
    const requiredReferences = references.filter((ref) =>
      ['required', 'missing', 'not-connected'].includes(ref.status),
    );

    return {
      techniqueId,
      displayName: technique?.label || evidence?.displayName || techniqueId.toUpperCase(),
      evidenceRole: roleForTechnique(techniqueId),
      availability: source ? 'available' : 'missing',
      selected: true,
      parameters: (technique?.parameters || []).map((parameter) => ({
        key: parameter.key,
        value: parameter.value,
        editable: parameter.editable,
        provenance: parameter.provenance,
        effectSummary: parameter.effectSummary,
      })),
      graphSource: {
        techniqueId,
        hasRealGraph: source?.kind === 'graph',
        graphDatasetId: technique?.datasetLabel,
        structuredEvidenceAvailable: source?.kind === 'structured',
      },
      evidenceResult: {
        techniqueId,
        displayName: technique?.label || evidence?.displayName || techniqueId.toUpperCase(),
        summary: evidence?.summary || row?.keyFinding || technique?.description || project.evidenceSummary,
        extractedFindings: evidence?.findings?.length ? evidence.findings : row ? [row.keyFinding] : [project.evidenceSummary],
        validationLimits: [row?.limitation || evidence?.limitation || project.notebook.validationBoundary],
        requiredReferences,
        missingReferences: references.filter((ref) => ['missing', 'not-connected'].includes(ref.status)),
        nextAction: row?.nextAction || project.crossTechniqueComparison.recommendedNextAction,
      },
      validationLimits: [row?.limitation || evidence?.limitation || project.notebook.validationBoundary],
      requiredReferences,
      missingReferences: references.filter((ref) => ['missing', 'not-connected'].includes(ref.status)),
      nextAction: row?.nextAction || project.crossTechniqueComparison.recommendedNextAction,
    };
  });

  return {
    projectId: project.id,
    jobType: registryJobTypeForAgent(project),
    objective: project.objective,
    techniques,
    focusedTechnique: defaultFocus,
    trace: project.agentWorkflow.trace.map((event) => ({
      stepNumber: event.stepNumber,
      timestamp: `step-${event.stepNumber}`,
      eventType: event.eventType === 'project_loaded' ? 'evidence_selected' : event.eventType === 'parameter_checked' ? 'parameter_changed' : event.eventType as TraceEventType,
      eventLabel: event.label,
      input: event.input,
      reasoning: event.reasoning,
      output: event.output,
      boundaryImpact: event.boundaryImpact,
    })),
    claimBoundary: project.agentWorkflow.claimBoundary,
    hasParameterOverrides: false,
  };
}

function techniqueIdToContext(techniqueId: TechniqueId): TechniqueContext | null {
  if (techniqueId === 'xrd') return 'XRD';
  if (techniqueId === 'xps') return 'XPS';
  if (techniqueId === 'ftir') return 'FTIR';
  if (techniqueId === 'raman') return 'Raman';
  return null;
}

/**
 * Create decision result using fusionEngine as the single reasoning authority
 * No local numeric review math - fusionEngine controls interpretation output
 */
function createDecisionResult(
  context: TechniqueContext,
  option: DatasetOption,
  xrdAnalysis: ReturnType<typeof runXrdPhaseIdentificationAgent> | null,
): DecisionResult {
  const { project, dataset } = option;
  const config = CONTEXT_CONFIG[context];

  // Convert detected features to PeakInput format and create EvidenceNodes using central function
  let peakInputs: PeakInput[];

  if (context === 'XRD' && xrdAnalysis) {
    // Use XRD analysis peaks
    const demoPeaks = asDemoPeaks(xrdAnalysis.detectedPeaks);
    peakInputs = convertXrdPeaksToPeakInput(demoPeaks);
  } else {
    // Use dataset features
    peakInputs = convertDatasetFeaturesToPeakInput(dataset);
  }

  // Create evidence nodes using central fusionEngine function
  const evidenceNodes = peakInputs.length > 0
    ? createEvidenceNodes({ technique: context, peaks: peakInputs })
    : [{
        id: 'fallback-evidence',
        technique: context,
        x: 0,
        unit: getUnitForTechnique(context),
        label: 'Preliminary observation',
      }];

  // Call fusionEngine as the single reasoning authority
  const fusionResult: FusionResult = evaluateFusionEngine({ evidence: evidenceNodes });

  // Extract feature count for metrics
  const featureCount = context === 'XRD' && xrdAnalysis
    ? xrdAnalysis.detectedPeaks.length
    : dataset.detectedFeatures.length;

  // Build technique-specific metric cards
  const dominantClaim = fusionResult.reasoningTrace.find(t => t.isDominant);
  const display = TECHNIQUE_DISPLAY[context];
  const xs = dataset.dataPoints.length > 0
    ? dataset.dataPoints.map((p) => p.x)
    : peakInputs.map((p) => p.position);
  const xMin = xs.length ? Math.min(...xs) : 0;
  const xMax = xs.length ? Math.max(...xs) : 0;
  const rangeValue = xs.length ? display.formatRange(xMin, xMax) : 'Not available';
  const topPeaks = [...peakInputs].sort((a, b) => b.intensity - a.intensity).slice(0, 2);
  const dominantValue = topPeaks.length > 0
    ? topPeaks.map((p) => display.formatPosition(p.position)).join(', ')
    : 'Pending';
  const metrics: Array<{ label: string; value: string; tone?: 'cyan' | 'emerald' | 'violet' | 'amber' }> = [
    { label: display.featureLabel, value: String(featureCount), tone: 'cyan' },
    { label: display.rangeLabel, value: rangeValue, tone: 'emerald' },
    { label: display.dominantLabel, value: dominantValue, tone: 'violet' },
    { label: display.qualityLabel, value: formatReviewStatus(dominantClaim?.status ?? 'unsupported'), tone: 'amber' },
  ];

  // Build detail rows from reasoning trace
  const detailRows = fusionResult.reasoningTrace.map((trace, index) => ({
    Claim: trace.claimId,
    Review: formatReviewStatus(trace.status),
    Evidence: `${trace.evidenceIds.length} nodes`,
    Conflicts: trace.contradictingEvidenceIds.length > 0 ? 'Yes' : 'No',
  }));

  return {
    runId: generateRunId(),
    primaryResult: fusionResult.conclusion,
    subtitle: `${config.label} - Fusion Engine Interpretation`,
    reasoningTrace: fusionResult.reasoningTrace,
    conclusion: fusionResult.conclusion,
    basis: fusionResult.basis,
    crossTech: fusionResult.crossTech,
    limitations: fusionResult.limitations,
    decision: fusionResult.decision,
    highlightedEvidenceIds: fusionResult.highlightedEvidenceIds,
    metrics,
    detailRows,
  };
}

function toAgentRunResult(
  result: DecisionResult,
  context: TechniqueContext,
  option: DatasetOption,
  pipeline: string[],
  detectedPeaks: DemoPeak[],
): AgentRunResult {
  return {
    projectId: option.project.id,
    projectName: option.project.name,
    material: option.project.material,
    selectedDatasets: [context],
    decision: result.primaryResult,
    claimStatus: 'partial' as ClaimStatus,
    validationState: 'limited' as ValidationState,
    evidence: result.basis,
    warnings: result.limitations,
    recommendations: [result.decision],
    detectedPeaks,
    pipeline,
    generatedAt: '2026-04-30T00:00:00.000Z',
    summary: `${CONTEXT_CONFIG[context].label}: ${result.conclusion}`,
  };
}

function AgentUserWorkspaceEmptyState({ email }: { email?: string }) {
  return (
    <DashboardLayout>
      <div className="h-full overflow-y-auto bg-slate-50 p-6">
        <div className="mx-auto max-w-5xl">
          <div className="mb-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">Agent Workspace</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-text-main">User Agent Workspace</h1>
            {email && <p className="mt-1 text-sm text-text-muted">Signed in as {email}</p>}
          </div>
          <Card className="rounded-lg border-dashed bg-white p-10 text-center">
            <Bot size={42} className="mx-auto text-text-dim" />
            <h2 className="mt-4 text-lg font-bold text-text-main">No active user workflow</h2>
            <p className="mt-2 text-sm text-text-muted">Upload evidence or create a project before running the user agent workspace.</p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Link
                to="/workspace?action=upload&source=user_uploaded&next=agent"
                className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-xs font-bold text-white hover:bg-primary/90"
              >
                Upload evidence
              </Link>
              <Link
                to="/dashboard"
                className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-white px-3 text-xs font-bold text-text-main hover:bg-slate-50"
              >
                Create project
              </Link>
              <Link
                to="/demo/agent?project=cu-fe2o4-spinel&mode=demo"
                onClick={() => setWorkspaceMode('demo')}
                className="inline-flex h-9 items-center justify-center rounded-md border border-primary bg-primary/10 px-3 text-xs font-bold text-primary hover:bg-primary/20"
              >
                Open demo agent workflow
              </Link>
            </div>
            <p className="mt-5 text-xs font-semibold text-amber-700">External writes disabled</p>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}

function UploadedAgentContext({ routeContext }: { routeContext: EvidenceRouteContext }) {
  const snapshot = getProjectEvidenceSnapshot(null, {
    source: routeContext.source,
    analysisSessionId: routeContext.sessionId,
    uploadedRunId: routeContext.uploadedRunId,
    driveFileId: routeContext.driveFileId,
    projectIdExplicit: false,
  });
  const dataset = snapshot.activeDataset;
  const evidenceQuery = buildEvidenceRouteSearch(routeContext);
  const suffix = evidenceQuery ? `?${evidenceQuery}` : '';
  const technique = snapshot.primaryTechnique.toLowerCase();
  const workspacePath = `/workspace/${technique}?mode=quick${evidenceQuery ? `&${evidenceQuery}` : ''}`;

  return (
    <DashboardLayout>
      <div className="h-full overflow-y-auto bg-slate-50 p-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-blue-700">User Workspace</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-text-main">Uploaded Evidence Review</h1>
              <p className="mt-1 text-sm text-text-muted">Agent context is scoped to the uploaded file and does not load demo project defaults.</p>
            </div>
            <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
              source=user_uploaded
            </span>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
            <Card className="rounded-lg bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-text-main">{dataset?.fileName ?? snapshot.sampleIdentity}</h2>
                  <p className="mt-1 text-sm text-text-muted">
                    {snapshot.primaryTechnique} / {snapshot.sourceLabel ?? 'User-uploaded evidence'} / External writes disabled
                  </p>
                </div>
                <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-700">
                  {snapshot.permissionMode === 'read_only' ? 'read_only' : snapshot.permissionMode}
                </span>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-md border border-border bg-slate-50 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Detected technique</p>
                  <p className="mt-1 text-sm font-bold text-text-main">{snapshot.availableTechniques.join(', ') || 'Metadata only'}</p>
                </div>
                <div className="rounded-md border border-border bg-slate-50 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Parsed features</p>
                  <p className="mt-1 text-sm font-bold text-text-main">{dataset?.detectedFeatures.length ?? 0}</p>
                </div>
                <div className="rounded-md border border-border bg-slate-50 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Session</p>
                  <p className="mt-1 truncate text-sm font-bold text-text-main">{routeContext.sessionId ?? routeContext.uploadedRunId ?? 'Local upload'}</p>
                </div>
              </div>

              <div className="mt-4 rounded-md border border-border bg-slate-50 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Workflow log</p>
                <div className="mt-2 space-y-2 text-xs text-text-main">
                  <p>Loaded uploaded evidence context.</p>
                  <p>Preserved source=user_uploaded for Agent, Notebook, Report, and Workspace handoff.</p>
                  <p>No external write action is enabled.</p>
                </div>
              </div>
            </Card>

            <Card className="rounded-lg bg-white p-4">
              <h2 className="text-sm font-bold text-text-main">Next actions</h2>
              <div className="mt-3 grid gap-2">
                <Link to={workspacePath} className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-xs font-bold text-white hover:bg-primary/90">
                  Open Workspace
                </Link>
                <Link to={`/notebook${suffix}${suffix ? '&' : '?'}template=research`} className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-white px-3 text-xs font-bold text-text-main hover:bg-slate-50">
                  Send to Notebook
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

function withUploadedEvidenceContext(
  context: AgentContext,
  snapshot: ProjectEvidenceSnapshot,
): AgentContext {
  if (snapshot.sourceMode !== 'user_uploaded' || !snapshot.activeDataset) return context;

  const dataset = snapshot.activeDataset;
  const technique = dataset.technique;
  const graphType = technique.toLowerCase() as GraphType;
  const graphData = dataset.dataPoints ?? [];
  const peakMarkers = (dataset.detectedFeatures ?? []).map((feature) => ({
    position: feature.position,
    intensity: feature.intensity,
    label: feature.label,
  }));
  const uploadedLayer = {
    technique,
    role: 'User-uploaded evidence',
    status: graphData.length > 0 ? 'available' as const : 'pending' as const,
    summary: snapshot.evidenceEntries[0]?.support ?? `Uploaded ${technique} evidence loaded from ${dataset.fileName}.`,
    limitation: snapshot.validationGaps[0]?.description ?? 'Validation limited until attached to a project.',
    claimContribution: 'Provides uploaded signal evidence for bounded review.',
    parameters: {},
    hasGraphData: graphData.length > 0,
    graphData,
    graphType,
    baselineData: undefined,
    peakMarkers,
  };
  const evidenceLayers = [
    uploadedLayer,
    ...context.evidenceLayers.filter((layer) => layer.technique !== technique),
  ];
  const metricCards = [
    { label: 'Uploaded file', value: dataset.fileName, sublabel: snapshot.sampleIdentity },
    { label: 'Graph points', value: String(graphData.length), sublabel: graphData.length > 0 ? 'present' : 'unavailable' },
    { label: 'Detected peaks', value: String(peakMarkers.length), sublabel: technique },
    { label: 'Signal quality', value: snapshot.processingSupportLabel ?? 'Validation limited' },
  ];

  return {
    ...context,
    selectedTechnique: technique,
    primaryTechnique: technique,
    activeTechniques: snapshot.availableTechniques.length ? snapshot.availableTechniques : [technique],
    includedTechniques: snapshot.availableTechniques.length ? snapshot.availableTechniques : [technique],
    evidenceLayers,
    workspaceTitle: `${technique} Uploaded Evidence Review`,
    workspaceDescription: `${dataset.fileName} / session-scoped user_uploaded evidence.`,
    metricCards,
    evidenceSummary: uploadedLayer.summary,
    claimBoundary: snapshot.claimBoundary.requiresValidation[0] ?? uploadedLayer.limitation,
    validationGaps: snapshot.validationGaps ?? [],
    hasGraphData: graphData.length > 0,
    graphType,
    graphData,
    peakMarkers,
    notebookPayload: {
      ...context.notebookPayload,
      projectId: snapshot.projectId,
      projectTitle: snapshot.projectName,
      activeTechniques: snapshot.availableTechniques.length ? snapshot.availableTechniques : [technique],
      includedTechniques: snapshot.availableTechniques.length ? snapshot.availableTechniques : [technique],
      selectedTechnique: technique,
      evidenceLayers,
      validationGaps: snapshot.validationGaps ?? [],
    },
  };
}

export default function AgentDemo() {
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const routeContext = getEvidenceRouteContext({
    authUser: user,
    searchParams,
    storedMode: getStoredWorkspaceMode(),
  });
  const hasExplicitDemoProject = Boolean(searchParams.get('project'));
  const effectiveWorkspaceMode = routeContext.effectiveWorkspaceMode;

  // Show empty state only if user mode with no uploaded evidence and no explicit demo project
  if (effectiveWorkspaceMode === 'user' && !hasExplicitDemoProject && !routeContext.isUploadedContext) {
    return <AgentUserWorkspaceEmptyState email={user?.email} />;
  }

  // Pass routeContext to AgentDemoContent for uploaded evidence integration
  return <AgentDemoContent routeContext={routeContext} />;
}

function AgentDemoContent({ routeContext }: { routeContext: EvidenceRouteContext }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // For uploaded evidence, derive context from routeContext instead of URL project param
  const isUploadedContext = routeContext.isUploadedContext;
  const projectIdFromUrl = isUploadedContext
    ? 'uploaded-evidence-temp' // Temporary ID for uploaded evidence
    : (normalizeRegistryProjectId(searchParams.get('project')) || DEFAULT_PROJECT_ID);
  const modeFromUrl = normalizeAgentMode(searchParams.get('mode'));

  const [missionText, setMissionText] = useState(DEFAULT_MISSION);
  const [feedback, setFeedback] = useState('');
  const [runtimeMode, setRuntimeMode] = useState<RuntimeMode>('demo');
  const [agentState, setAgentState] = useState<AgentDemoState>(() => {
    let initialTech: TechniqueContext | undefined = undefined;
    if (isUploadedContext) {
      const snap = getProjectEvidenceSnapshot(null, {
        source: routeContext.source,
        analysisSessionId: routeContext.sessionId,
        uploadedRunId: routeContext.uploadedRunId,
        driveFileId: routeContext.driveFileId,
        runtimeMode: 'demo',
        deferStoredContext: false,
      });
      initialTech = snap.primaryTechnique as TechniqueContext;
    }
    return makeInitialState(projectIdFromUrl, modeFromUrl, initialTech, routeContext.sessionId || undefined);
  });
  const [approvalAction, setApprovalAction] = useState<ApprovalActionPreview | null>(null);
  const [actionsDropdownOpen, setActionsDropdownOpen] = useState(false);
  const [moreDetailsOpen, setMoreDetailsOpen] = useState(false);
  const runningGuardRef = useRef(false);
  const runTokenRef = useRef(0);

  // Phase X6C: Runtime context orchestration for processing state and evidence
  const {
    currentEvidence: runtimeEvidence,
    isProcessing: runtimeIsProcessing,
    activeStage: runtimeActiveStage,
    isValidated7E4: runtimeIsValidated,
  } = useXrdWorkflowRuntime();

  // Add error boundary
  const [hasError, setHasError] = useState(false);

  React.useEffect(() => {
    const errorHandler = (error: ErrorEvent) => {
      console.error('AgentDemo Error:', error);
      setHasError(true);
    };
    window.addEventListener('error', errorHandler);
    return () => window.removeEventListener('error', errorHandler);
  }, []);

  React.useEffect(() => {
    const isUploaded = routeContext.isUploadedContext;
    const newProjectId = isUploaded
      ? 'uploaded-evidence-temp'
      : (normalizeRegistryProjectId(searchParams.get('project')) || DEFAULT_PROJECT_ID);
    const newMode = normalizeAgentMode(searchParams.get('mode'));
    const newSessionId = isUploaded ? (routeContext.sessionId || undefined) : undefined;

    if (
      newProjectId !== agentState.projectId ||
      newMode !== agentState.mode ||
      newSessionId !== agentState.sessionId
    ) {
      let defaultTech: TechniqueContext | undefined = undefined;
      if (isUploaded) {
        const snap = getProjectEvidenceSnapshot(null, {
          source: routeContext.source,
          analysisSessionId: routeContext.sessionId,
          uploadedRunId: routeContext.uploadedRunId,
          driveFileId: routeContext.driveFileId,
          runtimeMode,
          deferStoredContext: false,
        });
        defaultTech = snap.primaryTechnique as TechniqueContext;
      }
      setAgentState(makeInitialState(newProjectId, newMode, defaultTech, newSessionId));
    }
  }, [searchParams, routeContext, runtimeMode]);

  if (hasError) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#070B12] text-white">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Error Loading Agent Demo</h1>
          <p className="text-slate-400">Please check the console for details</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-blue-600 rounded-lg"
          >
            Reload Page
          </button>
        </div>
      </div>
    );
  }

  // For uploaded evidence, getProjectEvidenceSnapshot handles it directly
  const initialEvidenceSnapshot = useMemo(
    () => getProjectEvidenceSnapshot(isUploadedContext ? null : agentState.projectId, {
      source: routeContext.source,
      analysisSessionId: routeContext.sessionId,
      uploadedRunId: routeContext.uploadedRunId,
      driveFileId: routeContext.driveFileId,
      runtimeMode,
      deferStoredContext: !isUploadedContext,
    }),
    [isUploadedContext, agentState.projectId, runtimeMode, routeContext],
  );
  const [evidenceSnapshot, setEvidenceSnapshot] = useState(initialEvidenceSnapshot);

  React.useEffect(() => {
    setEvidenceSnapshot(initialEvidenceSnapshot);
    if (isUploadedContext) return;

    return runWhenIdle(() => {
      setEvidenceSnapshot(getProjectEvidenceSnapshot(agentState.projectId, {
        source: routeContext.source,
        analysisSessionId: routeContext.sessionId,
        uploadedRunId: routeContext.uploadedRunId,
        driveFileId: routeContext.driveFileId,
        runtimeMode,
      }));
    });
  }, [initialEvidenceSnapshot, isUploadedContext, agentState.projectId, runtimeMode, routeContext]);

  // For uploaded context, create safe registry project from evidence snapshot
  const registryProject = isUploadedContext
    ? createUploadedEvidenceRegistryProject(evidenceSnapshot)
    : getRegistryProject(agentState.projectId);

  const currentProject = registryProject._raw;
  const runtimeContext = runtimeMode === 'connected'
    ? getRuntimeContextForEvidenceSource('google_drive_connected', 'connected')
    : {
        sourceMode: evidenceSnapshot.sourceMode ?? 'demo_preloaded',
        runtimeMode: evidenceSnapshot.runtimeMode ?? 'demo',
        permissionMode: evidenceSnapshot.permissionMode ?? 'read_only',
        sourceLabel: evidenceSnapshot.sourceLabel ?? 'Demo evidence',
        approvalStatus: evidenceSnapshot.approvalStatus ?? 'not_required',
      } as const;
  const connectedAccountState = runtimeContext.sourceMode === 'google_drive_connected'
    ? getGoogleConnectedShellState()
    : getDefaultConnectedAccountState();

  // Bundle gating: only create bundle when appropriate (not for uploaded evidence)
  const evidenceBundle = useMemo(() => {
    // Don't create bundle for uploaded evidence context
    if (isUploadedContext) {
      return null;
    }

    const availableTechniques = evidenceSnapshot.availableTechniques ?? [];
    const techniqueCount = availableTechniques.length;
    const context: import('../runtime/evidenceBundle').BundleCreationContext = {
      route: '/demo/agent',
      techniqueCount,
      hasMultiTechIntent: techniqueCount >= 2 || searchParams.get('bundle') === 'mixed',
      isDemoProject: evidenceSnapshot.sourceMode === 'demo_preloaded',
      hasDemoPreloadedBundle: currentProject.id === 'cu-fe2o4-spinel' && techniqueCount >= 2,
    };

    // Only create bundle if gating logic approves
    const shouldCreate = techniqueCount >= 2 || context.hasDemoPreloadedBundle;
    if (!shouldCreate) {
      return null;
    }

    return createEvidenceBundleFromSnapshot(evidenceSnapshot, {
      includeDemoContext: searchParams.get('bundle') === 'mixed' || searchParams.get('source') === 'mixed',
      lifecycleState: 'created',
      creationReason: context.hasDemoPreloadedBundle ? 'demo_preloaded' : 'agent_requested_evidence_package',
    });
  }, [isUploadedContext, evidenceSnapshot, searchParams, currentProject.id]);

  const bundleTechniqueCoverage = useMemo(
    () => evidenceBundle ? getTechniqueCoverageFromBundle(evidenceBundle) : [],
    [evidenceBundle],
  );
  const datasetOptions = useMemo(
    () => getDatasetOptions(agentState.context, agentState.projectId),
    [agentState.context, agentState.projectId],
  );
  const selectedOption = useMemo(
    () => isUploadedContext && evidenceSnapshot.activeDataset
      ? { project: currentProject, dataset: evidenceSnapshot.activeDataset }
      : getDatasetOption(agentState.context, agentState.datasetId, agentState.projectId),
    [isUploadedContext, evidenceSnapshot.activeDataset, currentProject, agentState.context, agentState.datasetId, agentState.projectId],
  );
  const selectedDataset = selectedOption.dataset;
  const selectedProject = currentProject;

  // Condition lock state - now controllable
  const [experimentConditionLock, setExperimentConditionLock] = useState<ExperimentConditionLock | null>(
    () => getLatestExperimentConditionLock(currentProject.id)
  );

  // Workspace parameter state: committed overrides + draft edits
  const [workspaceParameters, setWorkspaceParameters] = useState<WorkspaceParameters>(
    () => readProjectWorkspaceParameters(currentProject.id, getProjectTechniques(currentProject)),
  );
  const [draftParameters, setDraftParameters] = useState<WorkspaceParameters>({});

  const experimentConditionTopBarLabel = experimentConditionLock?.userConfirmed ? 'Locked' : 'Not locked';
  const contextConfig = CONTEXT_CONFIG[agentState.context];
  const stages = contextConfig.stages;
  const modeConfig = AGENT_MODES[agentState.mode];
  const xrdAnalysis = useMemo(
    () => {
      if (agentState.context !== 'XRD') return null;
      const processingParams = getXrdProcessingParams(selectedProject.id);
      return runXrdPhaseIdentificationAgent({
        datasetId: selectedDataset.id,
        sampleName: selectedDataset.sampleName,
        sourceLabel: selectedDataset.fileName,
        dataPoints: selectedDataset.dataPoints,
      }, processingParams);
    },
    [agentState.context, selectedDataset, selectedProject.id],
  );
  // Phase X6C: Read persisted XRD backend evidence + runtime evidence for Agent reasoning enrichment.
  // Prioritize runtime evidence when available, fallback to localStorage.
  const [xrdBackendEvidence, setXrdBackendEvidence] = useState<XRDBackendEvidenceRecord | null>(null);

  React.useEffect(() => {
    if (agentState.context !== 'XRD') {
      setXrdBackendEvidence(null);
      return;
    }

    // Phase X6C: Use runtime evidence if available (live workspace updates)
    if (isXrdBackendEvidenceRecord(runtimeEvidence)) {
      setXrdBackendEvidence(runtimeEvidence);
      return;
    }

    // Fallback: Read from localStorage when runtime evidence not available
    return runWhenIdle(() => {
      try {
        setXrdBackendEvidence(readLatestXrdBackendEvidenceResult(selectedProject.id, undefined));
      } catch {
        setXrdBackendEvidence(null);
      }
    });
  }, [agentState.context, selectedProject.id, runtimeEvidence]);

  const peakMarkers = useMemo(
    () =>
      agentState.context === 'XRD' && (agentState.graphState.showMarkers || agentState.reasoningState.result)
        ? asDemoPeaks(
            xrdAnalysis?.detectedPeaks.length
              ? xrdAnalysis.detectedPeaks
              : selectedDataset.detectedFeatures,
          )
        : undefined,
    [
      agentState.context,
      agentState.graphState.showMarkers,
      agentState.reasoningState.result,
      selectedDataset.detectedFeatures,
      xrdAnalysis,
    ],
  );
  const baselineData = agentState.context === 'XRD' ? xrdAnalysis?.baselineData : undefined;
  const currentResult = agentState.reasoningState.result;
  const runComplete = agentState.reasoningState.status === 'complete' && !!currentResult;
  const progressPercent =
    agentState.reasoningState.currentStepIndex < 0
      ? 0
      : Math.min(100, ((agentState.reasoningState.currentStepIndex + 1) / stages.length) * 100);
  const templateMode = normalizeNotebookTemplateMode(searchParams.get('template'));
  const evidenceRouteSearch = isUploadedContext ? buildEvidenceRouteSearch(routeContext) : '';
  const evidenceRouteSuffix = evidenceRouteSearch ? `&${evidenceRouteSearch}` : '';
  const workflowProcessingResult = useMemo(
    () => {
      const requestedProcessingResult = getProcessingResult(searchParams.get('processing'));
      const routeProcessingResult =
        requestedProcessingResult?.projectId === selectedProject.id ? requestedProcessingResult : null;

      return routeProcessingResult ??
        evidenceSnapshot.reportContext ??
        getLatestProcessingResult(selectedProject.id) ??
        createProcessingResultFromXrdDemo(selectedProject.id, workspaceParameters);
    },
    [searchParams, selectedProject.id, evidenceSnapshot.reportContext, workspaceParameters],
  );

  const showFeedback = (message: string) => {
    setFeedback(message);
    window.setTimeout(() => setFeedback(''), 2600);
  };

  const appendLog = (entry: ExecutionLogEntry) => {
    setAgentState((current) => ({
      ...current,
      reasoningState: {
        ...current.reasoningState,
        logs: [...current.reasoningState.logs, entry],
      },
    }));
  };

  const markTool = (index: number, status: ToolStatus) => {
    setAgentState((current) => ({
      ...current,
      toolTrace: updateTraceStatus(current.toolTrace, index, status),
    }));
  };

  const guardConnectedRuntime = (
    actionLabel: string,
    actionType: ApprovalActionType,
    destinationLabel: string,
    riskLevel?: ApprovalRiskLevel,
  ) => {
    if (!requiresApproval(runtimeContext)) return false;
    const action = createApprovalActionPreview({
      actionId: `agent-${actionType}-${Date.now()}`,
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
    appendLog({
      stamp: '[approval]',
      message: `${actionLabel} is approval-gated in ${getRuntimeBadgeLabel(runtimeContext, 'runtime')}. No external action was executed.`,
      type: 'system',
    });
    setAgentState((current) => ({
      ...current,
      toolTrace: current.toolTrace.map((entry) => ({
        ...entry,
        callType: 'approval-gate',
        approvalStatus: 'gated',
      })),
    }));
    showFeedback(`${getRuntimeBadgeLabel(runtimeContext, 'permission')}: no external action executed.`);
    return true;
  };

  const logLocalAction = (
    actionLabel: string,
    actionType: ApprovalActionType,
    destinationLabel: string,
    riskLevel?: ApprovalRiskLevel,
  ) => {
    const action = createApprovalActionPreview({
      actionId: `agent-${actionType}-${Date.now()}`,
      actionType,
      actionLabel,
      destinationLabel,
      evidenceSnapshot,
      runtimeContext,
      evidenceBundle: evidenceBundle ?? undefined,
      riskLevel,
    });
    appendApprovalLedgerEntry(createApprovalLedgerEntry(action, 'local_preview_continued', {
      notes: 'Local deterministic action completed in the frontend demo. No external write executed.',
    }));
  };

  const finalizeRun = (
    context: TechniqueContext,
    option: DatasetOption,
    xrdResult: ReturnType<typeof runXrdPhaseIdentificationAgent> | null,
  ) => {
    const decision = createDecisionResult(context, option, xrdResult);

    // ── Enrich with persisted XRD backend evidence (additive, non-breaking) ──
    if (context === 'XRD' && xrdBackendEvidence) {
      const be = xrdBackendEvidence;
      const qm = selectXrdQualityMetrics(be);
      const pm = selectXrdPhaseMatchSummary(be);
      const backendBasis: string[] = [];
      if (qm) {
        backendBasis.push(
          `Backend-supported XRD evidence: ${qm.detectedPeakCount} peaks detected, ${qm.fittedPeakCount} fitted, S/N ratio ${Number.isFinite(qm.snRatio) ? qm.snRatio.toFixed(1) : 'N/A'}, baseline deviation ${Number.isFinite(qm.baselineDeviation) ? qm.baselineDeviation.toFixed(3) : 'N/A'}`,
          `Peak resolution: ${qm.peakResolution || 'N/A'}`,
        );
      }
      if (pm) {
        if (pm.isPhaseMatched && pm.primaryPhase) {
          backendBasis.push(
            `Reference-supported phase indication: ${pm.primaryPhase} (${pm.matchedPeakCount} reference peaks matched)`,
          );
        }
        if (pm.phaseSummary) {
          backendBasis.push(`Phase summary: ${pm.phaseSummary}`);
        }
      }
      // Phase X5C: Pure renderer using centralized selectors
      const scientificEvidence = selectXrdWorkflowScientificEvidence(be);
      if (scientificEvidence) {
        const fields = extractScientificEvidenceFields(scientificEvidence);
        if (fields) {
          backendBasis.push(
            `Scientific evidence object received from ${fields.skillLabel}; evidence ID ${fields.evidenceId}; input reference SHA-256 ${fields.inputReference}; claim boundary: ${fields.claimBoundary}.`,
          );
        }
      }
      // Phase X5C: Use selector + extractor, no inline adapter logic
      const refEvidenceSelected = selectXrdWorkflowReferenceMatchEvidence(be);
      const refEvidenceFields = extractReferenceMatchFields(refEvidenceSelected);

      if (refEvidenceFields) {
        const candidateEvidence = buildReferenceCandidateAgentEvidence(refEvidenceFields as any);
        backendBasis.push(...candidateEvidence.evidenceLines);
        decision.limitations = [
          ...decision.limitations,
          ...candidateEvidence.limitations,
          'Requires composition-sensitive evidence for stronger assignment.',
        ];
        decision.metrics = [
          ...decision.metrics,
          { label: 'Reference candidate', value: candidateEvidence.candidateLabel ?? 'Loaded', tone: 'violet' },
          { label: 'Claim level', value: candidateEvidence.claimLevel, tone: 'amber' },
        ];
        decision.detailRows = [
          ...decision.detailRows,
          {
            Claim: 'reference-candidate',
            Review: candidateEvidence.claimLevel,
            Evidence: candidateEvidence.candidateLabel
              ? `${candidateEvidence.candidateLabel}${candidateEvidence.formula ? ` / ${candidateEvidence.formula}` : ''}`
              : 'Candidate-level agreement',
            Conflicts: 'Bounded',
          },
        ];
        decision.decision = `${decision.decision} | Reference-supported candidate evidence is available at ${candidateEvidence.claimLevel}; composition-sensitive evidence is required for a stronger assignment.`;
      }

      decision.basis = [...decision.basis, ...backendBasis];

      // Add bounded limitation when phase match is available
      if (pm?.isPhaseMatched && pm?.primaryPhase) {
        decision.limitations = [
          ...decision.limitations,
          'Phase purity requires reference validation and/or complementary evidence',
        ];
      }

      // Append backend reference to decision text (non-replacing)
      if (be.isPhaseMatched && be.primaryPhase) {
        decision.decision = `${decision.decision} | Reference-supported phase indication: ${be.primaryPhase} (${be.matchedPeakCount} peaks matched). Phase purity requires reference validation and/or complementary evidence.`;
      }
    }

    const detectedPeaks =
      context === 'XRD'
        ? asDemoPeaks(xrdResult?.detectedPeaks.length ? xrdResult.detectedPeaks : option.dataset.detectedFeatures)
        : [];
    const pipeline = CONTEXT_CONFIG[context].stages.map((stage) => stage.toolName);
    const runResult = toAgentRunResult(decision, context, option, pipeline, detectedPeaks);

    saveAgentRunResult(runResult);

    const agentRun: AgentRun = {
      id: decision.runId,
      projectId: option.project.id,
      createdAt: new Date().toISOString(),
      mission: missionText.trim() || DEFAULT_MISSION,
      workspaceParameters: workspaceParameters,
      outputs: {
        phase: decision.primaryResult,
        confidence: 85, // Placeholder - fusionEngine doesn't use numeric confidence
        confidenceLabel: 'Status',
        evidence: decision.basis,
        interpretation: decision.crossTech,
        caveats: decision.limitations,
        recommendations: [decision.decision],
        detectedPeaks,
        selectedDatasets: [context],
      },
    };
    saveRun(agentRun);

    setAgentState((current) => ({
      ...current,
      reasoningState: {
        ...current.reasoningState,
        status: 'complete',
        currentStepIndex: CONTEXT_CONFIG[context].stages.length - 1,
        result: decision,
      },
      llmState: {
        output: null,
        usedLlm: false,
        fallbackUsed: false,
      },
    }));
    appendLog({
      stamp: '[decision]',
      message: `${CONTEXT_CONFIG[context].decisionKind} prepared: ${decision.conclusion}`,
      type: 'success',
    });
  };

  const runAuto = async (
    context = agentState.context,
    datasetId = agentState.datasetId,
  ) => {
    if (runningGuardRef.current) return;
    runningGuardRef.current = true;
    const token = runTokenRef.current + 1;
    runTokenRef.current = token;
    const option = isUploadedContext && evidenceSnapshot.activeDataset
      ? { project: currentProject, dataset: evidenceSnapshot.activeDataset }
      : getDatasetOption(context, datasetId, agentState.projectId);
    const config = CONTEXT_CONFIG[context];
    const xrdResult =
      context === 'XRD'
        ? (() => {
            const processingParams = getXrdProcessingParams(currentProject.id);
            const paramSnapshot = getXrdParameterSnapshot(currentProject.id);
            const result = runXrdPhaseIdentificationAgent({
              datasetId: option.dataset.id,
              sampleName: option.dataset.sampleName,
              sourceLabel: option.dataset.fileName,
              dataPoints: option.dataset.dataPoints,
            }, processingParams);
            // Log parameter snapshot used for processing
            if (paramSnapshot.hasOverrides) {
              appendLog({
                stamp: '[params]',
                message: `Applied ${paramSnapshot.overrideCount} custom XRD parameter${paramSnapshot.overrideCount !== 1 ? 's' : ''} (last updated by ${paramSnapshot.lastUpdatedBy})`,
                type: 'system',
              });
            }
            return result;
          })()
        : null;

    // Log parameter snapshots for other techniques (provenance-only, no actual processing)
    if (context === 'Raman') {
      const paramSnapshot = getRamanParameterSnapshot(agentState.projectId);
      if (paramSnapshot.hasOverrides) {
        appendLog({
          stamp: '[params]',
          message: `Applied ${paramSnapshot.overrideCount} custom Raman parameter${paramSnapshot.overrideCount !== 1 ? 's' : ''} (last updated by ${paramSnapshot.lastUpdatedBy})`,
          type: 'system',
        });
      }
    } else if (context === 'XPS') {
      const paramSnapshot = getXpsParameterSnapshot(agentState.projectId);
      if (paramSnapshot.hasOverrides) {
        appendLog({
          stamp: '[params]',
          message: `Applied ${paramSnapshot.overrideCount} custom XPS parameter${paramSnapshot.overrideCount !== 1 ? 's' : ''} (last updated by ${paramSnapshot.lastUpdatedBy})`,
          type: 'system',
        });
      }
    } else if (context === 'FTIR') {
      const paramSnapshot = getFtirParameterSnapshot(agentState.projectId);
      if (paramSnapshot.hasOverrides) {
        appendLog({
          stamp: '[params]',
          message: `Applied ${paramSnapshot.overrideCount} custom FTIR parameter${paramSnapshot.overrideCount !== 1 ? 's' : ''} (last updated by ${paramSnapshot.lastUpdatedBy})`,
          type: 'system',
        });
      }
    }

    setFeedback('');
    setAgentState((current) => ({
      ...resetRunState(current, context, datasetId),
      reasoningState: {
        ...current.reasoningState,
        status: 'running',
        currentStepIndex: -1,
        result: null,
        logs: [
          {
            stamp: '[00:00]',
            message: `Fusion Engine initialized for ${config.label}: ${missionText.trim() || DEFAULT_MISSION}`,
            type: 'system',
          },
        ],
      },
    }));

    try {
      for (let index = 0; index < config.stages.length; index += 1) {
        if (runTokenRef.current !== token) return;
        const stage = config.stages[index];
        setAgentState((current) => ({
          ...current,
          graphState: {
            showMarkers: context === 'XRD' && index >= 1,
          },
          reasoningState: {
            ...current.reasoningState,
            status: 'running',
            currentStepIndex: index,
          },
          toolTrace: updateTraceStatus(current.toolTrace, index, 'running'),
        }));
        appendLog({
          stamp: `[${formatStamp(index)}]`,
          message: `${stage.displayName}: ${stage.detail}`,
          type: 'tool',
        });
        await wait(stage.durationMs);
        if (runTokenRef.current !== token) return;
        markTool(index, 'complete');
        appendLog({
          stamp: `[${formatStamp(index)}]`,
          message: stage.outputSummary,
          type: index === config.stages.length - 1 ? 'success' : 'info',
        });
      }

      await wait(300);
      if (runTokenRef.current !== token) return;

      finalizeRun(context, option, xrdResult);
    } finally {
      if (runTokenRef.current === token) {
        runningGuardRef.current = false;
      }
    }
  };

  const runStep = async () => {
    if (runningGuardRef.current) return;

    const nextIndex =
      agentState.reasoningState.status === 'complete'
        ? 0
        : agentState.reasoningState.currentStepIndex + 1;

    if (nextIndex >= stages.length) return;

    runningGuardRef.current = true;
    const token = runTokenRef.current + 1;
    runTokenRef.current = token;
    const option = selectedOption;
    const stage = stages[nextIndex];
    const xrdResult = xrdAnalysis;

    if (nextIndex === 0 || agentState.reasoningState.status === 'complete') {
      setAgentState((current) => ({
        ...resetRunState(current),
        reasoningState: {
          ...current.reasoningState,
          status: 'running',
          currentStepIndex: 0,
          result: null,
          logs: [
            {
              stamp: '[00:00]',
              message: `Step-by-step fusion engine run started for ${contextConfig.label}.`,
              type: 'system',
            },
          ],
        },
        toolTrace: updateTraceStatus(createToolTrace(agentState.context), 0, 'running'),
      }));
    } else {
      setAgentState((current) => ({
        ...current,
        graphState: {
          showMarkers: agentState.context === 'XRD' && nextIndex >= 1,
        },
        reasoningState: {
          ...current.reasoningState,
          status: 'running',
          currentStepIndex: nextIndex,
        },
        toolTrace: updateTraceStatus(current.toolTrace, nextIndex, 'running'),
      }));
    }

    appendLog({
      stamp: `[${formatStamp(nextIndex)}]`,
      message: `${stage.displayName}: ${stage.detail}`,
      type: 'tool',
    });

    try {
      await wait(stage.durationMs);
      if (runTokenRef.current !== token) return;
      setAgentState((current) => ({
        ...current,
        reasoningState: {
          ...current.reasoningState,
          status: nextIndex === stages.length - 1 ? 'running' : 'idle',
          currentStepIndex: nextIndex,
        },
        toolTrace: updateTraceStatus(current.toolTrace, nextIndex, 'complete'),
      }));
      appendLog({
        stamp: `[${formatStamp(nextIndex)}]`,
        message: stage.outputSummary,
        type: nextIndex === stages.length - 1 ? 'success' : 'info',
      });

      if (nextIndex === stages.length - 1) {
        await wait(300);
        if (runTokenRef.current !== token) return;
        finalizeRun(agentState.context, option, xrdResult);
      }
    } finally {
      if (runTokenRef.current === token) {
        runningGuardRef.current = false;
      }
    }
  };

  const resetExecution = () => {
    if (runningGuardRef.current) return;
    runTokenRef.current += 1;
    setFeedback('');
    setAgentState((current) => resetRunState(current));
  };

  const handleProjectChange = (newProjectId: string) => {
    if (runningGuardRef.current) return;
    const newProject = getRegistryProject(newProjectId);
    if (newProject) {
      setIncludedTechniques(getProjectTechniques(newProject._raw));
      setEvidenceWorkspace(buildEvidenceWorkspaceFromRegistry(newProject));
      setMultiTechOpen(false);
      setWorkspaceParameters(readProjectWorkspaceParameters(newProject._raw.id, getProjectTechniques(newProject._raw)));
      setDraftParameters({});
    }
    const newParams = new URLSearchParams(searchParams);
    newParams.set('project', newProjectId);
    setSearchParams(newParams);
  };

  const handleUploadedSessionChange = (sessionId: string) => {
    if (runningGuardRef.current) return;
    const session = getAnalysisSession(sessionId);
    if (!session) return;

    const newParams = new URLSearchParams(searchParams);
    newParams.set('source', 'user_uploaded');
    newParams.set('sessionId', session.analysisId);
    newParams.set('upload', session.uploadedRunId || session.analysisId);
    newParams.set('technique', session.technique.toLowerCase());
    newParams.delete('project');
    setSearchParams(newParams);
  };

  const handleModeChange = (newMode: AgentMode) => {
    if (runningGuardRef.current) return;
    const newParams = new URLSearchParams(searchParams);
    newParams.set('mode', newMode);
    setSearchParams(newParams);
  };

  const handleContextChange = (nextContext: TechniqueContext) => {
    if (runningGuardRef.current) return;
    const datasetId = getDefaultDatasetId(nextContext, agentState.projectId);
    runTokenRef.current += 1;
    setFeedback('');
    setAgentState((current) => resetRunState(current, nextContext, datasetId));
  };

  const handleDatasetChange = (nextDatasetId: string) => {
    if (runningGuardRef.current) return;
    const shouldAutoRun = agentState.reasoningState.executionMode === 'auto';
    runTokenRef.current += 1;
    setFeedback('');
    setAgentState((current) => resetRunState(current, current.context, nextDatasetId));
    if (shouldAutoRun) {
      window.setTimeout(() => {
        void runAuto(agentState.context, nextDatasetId);
      }, 0);
    }
  };

  const handleExecutionModeChange = (executionMode: ExecutionMode) => {
    if (runningGuardRef.current) return;
    setAgentState((current) => ({
      ...current,
      reasoningState: {
        ...current.reasoningState,
        executionMode,
      },
    }));
  };

  const handlePrimaryRun = () => {
    if (guardConnectedRuntime('Workflow execution', 'external_share', 'Connected workflow execution preview', 'high')) return;
    logLocalAction('Workflow execution', 'external_share', 'Local deterministic workflow execution', 'medium');
    if (agentState.reasoningState.executionMode === 'auto') {
      void runAuto();
      return;
    }
    void runStep();
  };

  const handleExportReport = () => {
    if (guardConnectedRuntime('Report export', 'report_export', 'Local report export preview', 'medium')) return;
    if (!currentResult) return;
    appendLog({
      stamp: '[report]',
      message: 'Report package prepared with graph evidence, reasoning trace, claim boundary, and caveats.',
      type: 'success',
    });
    logLocalAction('Report export', 'report_export', 'Local report export preview', 'medium');
    showFeedback('Export report preview prepared.');
  };

  const handleRefineInterpretation = () => {
    if (guardConnectedRuntime('Interpretation refinement', 'interpretation_refinement', 'Local interpretation refinement preview', 'medium')) return;
    saveProcessingResult(workflowProcessingResult);
    const refinement = refineDiscussionFromProcessing(workflowProcessingResult, templateMode);
    saveAgentDiscussionRefinement(refinement);
    appendLog({
      stamp: '[refine]',
      message: `Refined discussion prepared from ${workflowProcessingResult.technique} processing output using ${templateMode} notebook template.`,
      type: 'success',
    });
    logLocalAction('Interpretation refinement', 'interpretation_refinement', 'Local interpretation refinement preview', 'medium');
    showFeedback('Refined discussion prepared.');
  };

  const handleSaveToNotebook = () => {
    if (guardConnectedRuntime('Notebook handoff', 'notebook_commit', 'Notebook memory handoff preview', 'low')) return;
    if (currentResult) {
      const runResult = toAgentRunResult(
        currentResult,
        agentState.context,
        selectedOption,
        stages.map((stage) => stage.toolName),
        peakMarkers ?? [],
      );
      saveAgentRunResult(runResult);
    }

    saveProcessingResult(workflowProcessingResult);
    const refinement = refineDiscussionFromProcessing(workflowProcessingResult, templateMode);
    saveAgentDiscussionRefinement(refinement);
    const notebookEntry = createNotebookEntryFromRefinement(refinement, templateMode);
    // Phase X5C: Use selector + extractor, no inline adapter
    const refEvidenceSelected = selectXrdWorkflowReferenceMatchEvidence(xrdBackendEvidence);
    const refEvidenceFields = extractReferenceMatchFields(refEvidenceSelected);

    const xrdReferenceMatchV2Summary = refEvidenceFields
      ? buildNotebookReferenceCandidateEvidence(refEvidenceFields as any)
      : undefined;

    const entryToSave = xrdBackendEvidence
      ? (() => {
          const qm = selectXrdQualityMetrics(xrdBackendEvidence);
          const pm = selectXrdPhaseMatchSummary(xrdBackendEvidence);
          const sci = selectXrdWorkflowScientificEvidence(xrdBackendEvidence);
          return {
            ...notebookEntry,
            xrdBackendEvidenceSummary: {
              label: 'Backend-supported XRD evidence',
              detectedPeakCount: qm?.detectedPeakCount ?? 0,
              fittedPeakCount: qm?.fittedPeakCount ?? 0,
              snRatio: qm?.snRatio ?? 0,
              baselineDeviation: qm?.baselineDeviation ?? 0,
              peakResolution: qm?.peakResolution ?? null,
              primaryPhase: pm?.primaryPhase ?? null,
              matchedPeakCount: pm?.matchedPeakCount ?? 0,
              phaseSummary: pm?.phaseSummary ?? null,
              savedAt: xrdBackendEvidence.timestamp,
              caveat: 'Phase purity requires reference validation and/or complementary evidence.',
              scientificEvidenceSummary: sci ? {
                evidenceId: sci.evidenceId,
                skillId: sci.skillId,
                skillLabel: sci.skillLabel,
                technique: sci.technique,
                inputReference: sci.inputReference,
                schemaVersion: sci.schemaVersion,
                createdAt: sci.createdAt,
                claimBoundary: 'validation-limited scientific claim',
              } : undefined,
            },
            ...(xrdBackendEvidence.xrdWorkflowHandoffState ? { xrdWorkflowHandoffState: xrdBackendEvidence.xrdWorkflowHandoffState } : {}),
            ...(xrdBackendEvidence.workflowScientificEvidence ? { workflowScientificEvidence: xrdBackendEvidence.workflowScientificEvidence } : {}),
            ...(xrdBackendEvidence.workflowReferenceMatchEvidence ? { workflowReferenceMatchEvidence: xrdBackendEvidence.workflowReferenceMatchEvidence } : {}),
            ...(xrdReferenceMatchV2Summary ? { xrdReferenceMatchV2Summary } : {}),
          };
        })()
      : notebookEntry;

    saveNotebookEntry(entryToSave as NotebookEntry);
    logLocalAction('Notebook handoff', 'notebook_commit', 'Notebook memory handoff preview', 'low');
    appendLog({
      stamp: '[notebook]',
      message: xrdBackendEvidence
        ? `Saved deterministic demo notebook entry from the current interpretation context as ${notebookEntry.templateLabel}. Notebook handoff includes backend XRD evidence.`
        : `Saved deterministic demo notebook entry from the current interpretation context as ${notebookEntry.templateLabel}.`,
      type: 'success',
    });
    navigate(`/notebook?project=${selectedProject.id}&mode=demo&entry=${entryToSave.id}&template=${templateMode}${evidenceRouteSuffix}`);
  };

  const handleOpenSourceProcessing = () => {
    navigate(workflowProcessingResult.sourceRoute);
  };

  const handleViewClaimBoundary = () => {
    if (evidenceBundle) {
      appendLog({
        stamp: '[boundary]',
        message: `Bundle ${evidenceBundle.bundleId} reviewed: ${bundleTechniqueCoverage.filter((item) => item.status === 'available').length} techniques available, ${evidenceBundle.missingRequiredTechniques.length} missing required, claim boundary remains validation-limited.`,
        type: 'info',
      });
    } else {
      appendLog({
        stamp: '[boundary]',
        message: `Single-technique analysis: claim boundary remains validation-limited.`,
        type: 'info',
      });
    }
    showFeedback('Claim boundary ready in the review log.');
  };

  const handleGenerateReproducibleReport = () => {
    if (guardConnectedRuntime('Reproducible report generation', 'report_generation', 'Deterministic reproducible report preview', 'medium')) return;
    if (!currentResult) return;
    appendLog({
      stamp: '[repro]',
      message: `Reproducible report generated from deterministic reasoning trace: ${stages.map((stage) => stage.displayName).join(' -> ')}.`,
      type: 'tool',
    });
    logLocalAction('Reproducible report generation', 'report_generation', 'Deterministic reproducible report preview', 'medium');
    showFeedback('Reproducible report generated.');
  };

  // Prepare execution steps for CenterColumn
  const executionSteps = useMemo(
    () => mapToolTraceToExecutionSteps(agentState.toolTrace, stages),
    [agentState.toolTrace, stages],
  );

  // Multi-tech popover state
  const [includedTechniques, setIncludedTechniques] = useState<Technique[]>(
    () => getProjectTechniques(currentProject),
  );
  const [multiTechOpen, setMultiTechOpen] = useState(false);

  // Condition lock drives read-only mode for parameter editor
  const isConditionLocked = !!experimentConditionLock?.userConfirmed;

  // Handlers for unlock/lock conditions
  const handleUnlockConditions = () => {
    if (!experimentConditionLock) return;
    const unlocked = unlockExperimentConditions(experimentConditionLock);
    setExperimentConditionLock(unlocked);
  };

  const handleLockConditions = () => {
    if (!experimentConditionLock) return;
    const locked = lockExperimentConditions(experimentConditionLock);
    setExperimentConditionLock(locked);
  };

  // Evidence workspace: single source of truth for technique state, trace, and claim boundary
  const [evidenceWorkspace, setEvidenceWorkspace] = useState<AgentEvidenceWorkspace>(() => {
    return buildEvidenceWorkspaceFromRegistry(registryProject);
  });

  React.useEffect(() => {
    setEvidenceWorkspace(buildEvidenceWorkspaceFromRegistry(registryProject));
    setIncludedTechniques(getProjectTechniques(registryProject._raw));
    setWorkspaceParameters(readProjectWorkspaceParameters(registryProject._raw.id, getProjectTechniques(registryProject._raw)));
    setDraftParameters({});
  }, [registryProject.id]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const projectTechniques = getProjectTechniques(currentProject);
    const storageKeys = new Set(
      projectTechniques
        .map((technique) => getParameterOverrideStorageKey(currentProject.id, technique))
        .filter(Boolean),
    );
    if (storageKeys.size === 0) return;

    const handleStorage = (event: StorageEvent) => {
      if (!event.key || !storageKeys.has(event.key)) return;
      setWorkspaceParameters(readProjectWorkspaceParameters(currentProject.id, projectTechniques));
      setDraftParameters({});
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [currentProject.id]);

  // Build agent context from current project, mode, and applied parameter overrides
  const agentContext = useMemo(
    () => {
      const baseContext = buildAgentContext(currentProject, agentState.mode, {
        selectedTechnique: agentState.selectedTechnique,
        includedTechniques,
        workspaceParameters,
        isLocked: isConditionLocked,
      });
      return isUploadedContext ? withUploadedEvidenceContext(baseContext, evidenceSnapshot) : baseContext;
    },
    [
      currentProject,
      agentState.mode,
      agentState.selectedTechnique,
      includedTechniques,
      workspaceParameters,
      isConditionLocked,
      isUploadedContext,
      evidenceSnapshot,
    ],
  );
  const focusedEvidenceSource = useMemo(
    () => getFocusedEvidenceSource(registryProject, evidenceWorkspace.focusedTechnique),
    [registryProject, evidenceWorkspace.focusedTechnique],
  );

  const handleTechniqueSelect = (technique: Technique) => {
    if (runningGuardRef.current) return;
    const techniqueId = technique.toLowerCase() as TechniqueId;
    if (['xrd', 'xps', 'ftir', 'raman'].includes(techniqueId)) {
      setEvidenceWorkspace((prev) => changeFocusedTechnique(prev, techniqueId));
    }
    setAgentState((current) => ({
      ...current,
      selectedTechnique: technique,
    }));
  };

  const handleToggleIncluded = (technique: Technique) => {
    const techniqueId = technique.toLowerCase() as TechniqueId;
    if (!['xrd', 'xps', 'raman', 'ftir'].includes(techniqueId)) return;

    setEvidenceWorkspace((prev) => toggleTechnique(prev, techniqueId));

    setIncludedTechniques((prev) => {
      if (prev.includes(technique)) {
        return prev.length > 1 ? prev.filter((t) => t !== technique) : prev;
      }
      return [...prev, technique];
    });
  };

  // Parameter editor handlers
  const handleDraftParameterChange = (groupId: ParameterGroupId, key: string, value: string) => {
    setDraftParameters((prev) => {
      const groupDraft = { ...(prev[groupId] || {}) };
      groupDraft[key] = value;
      return { ...prev, [groupId]: groupDraft };
    });
  };

  const handleApplyParameters = () => {
    // Merge draft into committed overrides (drop entries matching baseline values)
    const baselineGroups = getProjectParameterGroups(currentProject);
    const merged: WorkspaceParameters = { ...workspaceParameters };
    (Object.keys(draftParameters) as ParameterGroupId[]).forEach((groupId) => {
      const baseline = baselineGroups.find((g) => g.id === groupId);
      if (!baseline) return;
      const committed = { ...(merged[groupId] || {}) };
      const draft = draftParameters[groupId] || {};
      Object.entries(draft).forEach(([k, v]) => {
        const baseParam = baseline.params.find((p) => p.key === k);
        if (baseParam && baseParam.value === v) {
          delete committed[k];
        } else {
          committed[k] = v;
        }
      });
      if (Object.keys(committed).length === 0) {
        delete merged[groupId];
      } else {
        merged[groupId] = committed;
      }
    });
    setWorkspaceParameters(merged);
    writeProjectWorkspaceParameters(currentProject.id, merged);

    // Apply parameter changes to evidence workspace
    let updatedWorkspace = evidenceWorkspace;
    (Object.keys(draftParameters) as ParameterGroupId[]).forEach((groupId) => {
      const draft = draftParameters[groupId] || {};
      Object.entries(draft).forEach(([key, value]) => {
        // Map groupId to techniqueId (xrd, xps, raman, ftir)
        const techniqueId = groupId as TechniqueId;
        if (['xrd', 'xps', 'raman', 'ftir'].includes(techniqueId)) {
          updatedWorkspace = applyParameterChange(updatedWorkspace, techniqueId, key, value);
        }
      });
    });
    setEvidenceWorkspace(updatedWorkspace);

    setDraftParameters({});
    showFeedback('Parameters applied to workspace context.');
  };

  const handleResetParameters = () => {
    const draftGroupIds = Object.keys(draftParameters) as ParameterGroupId[];
    const groupsToReset = draftGroupIds.length > 0
      ? draftGroupIds
      : [agentState.selectedTechnique as ParameterGroupId];

    setWorkspaceParameters((current) => {
      const next = { ...current };
      groupsToReset.forEach((groupId) => {
        delete next[groupId];
        clearTechniqueParameterOverrides(currentProject.id, groupId);
      });
      return next;
    });
    setDraftParameters((current) => {
      const next = { ...current };
      groupsToReset.forEach((groupId) => {
        delete next[groupId];
      });
      return next;
    });
    showFeedback(`${groupsToReset.join(', ')} parameters reset to demo defaults.`);
  };

  const handleFocusedTechniqueChange = (techniqueId: TechniqueId) => {
    setEvidenceWorkspace((prev) => changeFocusedTechnique(prev, techniqueId));
    const nextContext = techniqueIdToContext(techniqueId);
    if (nextContext) {
      const datasetId = getDefaultDatasetId(nextContext, agentState.projectId);
      setAgentState((current) => ({
        ...resetRunState(current, nextContext, datasetId),
        selectedTechnique: nextContext,
      }));
    }
  };

  const runtimeGovernance = runtimeContext;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#F7F9FC] text-slate-700 font-sans">
      <style>{`
        @keyframes agentInsightIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        .agent-insight-in { animation: agentInsightIn 380ms ease-out both; }
        .agent-formula sub { font-size: 0.72em; line-height: 0; position: relative; bottom: -0.25em; }
        .cockpit-scroll::-webkit-scrollbar{width:4px} .cockpit-scroll::-webkit-scrollbar-thumb{background:#1e293b;border-radius:2px}
      `}</style>

      {/* Phase X6C: Runtime processing status banner */}
      {runtimeIsProcessing && runtimeActiveStage && (
        <div className="shrink-0 border-b border-cyan-300 bg-cyan-50 px-4 py-2 text-[11px] text-cyan-900">
          <div className="flex items-center gap-2">
            <Loader2 size={12} className="animate-spin text-cyan-600" />
            <span className="font-semibold">Workspace processing active:</span>
            <span>{getStageLabel(runtimeActiveStage)}</span>
            {runtimeIsValidated && (
              <span className="ml-2 rounded border border-emerald-600 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                7E.4 Validated
              </span>
            )}
          </div>
        </div>
      )}

      {/* Invalid project fallback banner */}
      {(() => {
        const requested = searchParams.get('project');
        if (requested && !isKnownProjectId(requested)) {
          return (
            <div className="shrink-0 border-b border-amber-300 bg-amber-50 px-4 py-2 text-[11px] text-amber-900">
              <span className="font-semibold">Project not found.</span>{' '}
              Showing the default project context.
            </div>
          );
        }
        return null;
      })()}

      {/* COMPACT SINGLE-ROW HEADER */}
      <div className="shrink-0 border-b border-slate-200 bg-white px-4 py-2.5">
        <div className="flex items-center gap-2">
          {/* Project Selector */}
          <div className="relative">
            <select
              value={isUploadedContext ? (routeContext.sessionId || 'uploaded-evidence-temp') : agentState.projectId}
              disabled={runningGuardRef.current}
              onChange={(e) => {
                if (isUploadedContext) {
                  handleUploadedSessionChange(e.target.value);
                } else {
                  handleProjectChange(e.target.value);
                }
              }}
              className="h-7 px-2 pr-6 text-xs font-semibold bg-white border border-slate-300 rounded text-slate-700 appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:border-slate-400"
              title={currentProject.name}
            >
              {isUploadedContext ? (
                (() => {
                  const userSessions = getAnalysisSessions().filter(
                    (session) => session.source === 'user_uploaded'
                  );
                  if (userSessions.length === 0) {
                    return (
                      <option value="uploaded-evidence-temp">
                        {currentProject.name}
                      </option>
                    );
                  }
                  const currentSessionId = routeContext.sessionId;
                  const hasCurrent = userSessions.some((s) => s.analysisId === currentSessionId);
                  const items = [...userSessions];
                  if (currentSessionId && !hasCurrent) {
                    const currentSession = getAnalysisSession(currentSessionId);
                    if (currentSession) {
                      items.unshift(currentSession);
                    } else {
                      items.unshift({
                        analysisId: currentSessionId,
                        fileName: currentProject.name,
                        title: currentProject.name,
                      } as any);
                    }
                  }
                  return items.map((session) => (
                    <option key={session.analysisId} value={session.analysisId}>
                      {session.fileName || session.title}
                    </option>
                  ));
                })()
              ) : (
                demoProjectRegistry.map((proj) => (
                  <option key={proj.id} value={proj.id}>
                    {proj.title}
                  </option>
                ))
              )}
            </select>
            <ChevronDown size={12} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>

          {/* Workflow Selector */}
          {agentContext.evidenceMode === 'multi-tech' ? (
            <MultiTechPopover
              evidenceLayers={agentContext.evidenceLayers}
              includedTechniques={includedTechniques}
              selectedTechnique={agentContext.selectedTechnique}
              onToggleIncluded={handleToggleIncluded}
              onSelectTechnique={handleTechniqueSelect}
              isOpen={multiTechOpen}
              onToggleOpen={() => setMultiTechOpen((o) => !o)}
              disabled={runningGuardRef.current}
            />
          ) : (
            <div className="h-7 px-2.5 flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded text-[10px] font-semibold text-blue-700">
              <Microscope size={11} />
              <span className="truncate max-w-[120px]" title={agentContext.workspaceTitle}>{agentContext.workspaceTitle}</span>
            </div>
          )}

          {/* Runtime Mode / Source Chip */}
          <div className={`h-7 px-2 flex items-center rounded text-[10px] font-semibold border ${
            isUploadedContext
              ? 'bg-blue-50 border-blue-200 text-blue-700'
              : runtimeMode === 'demo'
              ? 'bg-slate-50 border-slate-200 text-slate-700'
              : 'bg-amber-50 border-amber-200 text-amber-700'
          }`}>
            <span>{isUploadedContext ? 'User evidence' : (runtimeMode === 'demo' ? 'Demo' : 'Connected')}</span>
          </div>

          {/* Read-only chip for uploaded evidence */}
          {isUploadedContext && (
            <div className="h-7 px-2 flex items-center rounded text-[10px] font-semibold border bg-slate-50 border-slate-300 text-slate-700">
              <span>Read-only</span>
            </div>
          )}

          {/* Bundle Compact Chip - only show if bundle exists (not for uploaded) */}
          {evidenceBundle && !isUploadedContext && (
            <div
              className="h-7 px-2 flex items-center gap-1 bg-cyan-50 border border-cyan-200 rounded text-[10px] font-semibold text-cyan-700"
              title={`${evidenceBundle.bundleId}: ${bundleTechniqueCoverage.map((item) => `${item.technique} ${item.status}`).join(', ')}`}
            >
              <Layers size={10} />
              <span>Bundle {evidenceBundle.evidenceCompletenessScore}%</span>
            </div>
          )}

          {/* Boundary Compact Chip */}
          <div className="h-7 px-2 flex items-center gap-1 bg-emerald-50 border border-emerald-200 rounded text-[10px] font-semibold text-emerald-700">
            <CheckCircle2 size={10} />
            <span>{isUploadedContext ? 'Validation limited' : ((evidenceSnapshot.validationGaps?.length ?? 0) > 0 ? 'Boundary gated' : 'Boundary ready')}</span>
          </div>

          {/* Backend XRD Evidence indicator */}
          {xrdBackendEvidence && (() => {
            const qm = selectXrdQualityMetrics(xrdBackendEvidence);
            const pm = selectXrdPhaseMatchSummary(xrdBackendEvidence);
            return (
              <div
                className="h-7 px-2 flex items-center gap-1 bg-violet-50 border border-violet-200 rounded text-[10px] font-semibold text-violet-700"
                title={`Backend XRD evidence: ${qm?.detectedPeakCount ?? 0} peaks, S/N ${Number.isFinite(qm?.snRatio) ? qm!.snRatio.toFixed(1) : 'N/A'}, ${pm?.primaryPhase ? `phase: ${pm.primaryPhase}` : 'no phase match'}`}
              >
                <Database size={10} />
                <span>Backend XRD evidence loaded</span>
              </div>
            );
          })()}

          {/* Phase X5C: Use selector + extractor, no inline adapter */}
          {(() => {
            const refEvidence = selectXrdWorkflowReferenceMatchEvidence(xrdBackendEvidence);
            const refFields = extractReferenceMatchFields(refEvidence);
            if (!refFields) return null;
            const primaryCandidate = refFields.primaryCandidate;
            const candidateLabel = primaryCandidate?.phaseLabel ?? primaryCandidate?.formula ?? 'Reference candidate';
            return (
              <div
                className="h-7 px-2 flex items-center gap-1 bg-blue-50 border border-blue-200 rounded text-[10px] font-semibold text-blue-700"
                title={`Reference candidate evidence loaded: ${candidateLabel}; claim level ${refFields.claimLevel ?? 'candidate'}; candidate-level agreement only.`}
              >
                <Database size={10} />
                <span>Reference candidate evidence loaded</span>
              </div>
            );
          })()}

          <div className="flex-1" />

          {/* Run Mode Toggle */}
          <div className="flex h-7 items-center gap-1 bg-white border border-slate-300 rounded px-1">
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 pl-1">Run:</span>
            <div className="flex gap-0.5">
              {(['auto', 'step'] as ExecutionMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  disabled={runningGuardRef.current}
                  onClick={() => handleExecutionModeChange(mode)}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors disabled:opacity-60 ${
                    agentState.reasoningState.executionMode === mode
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-600 hover:text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  {mode === 'auto' ? 'Auto' : 'Step'}
                </button>
              ))}
            </div>
          </div>

          {/* Run Workflow Button */}
          <button
            type="button"
            onClick={handlePrimaryRun}
            disabled={runningGuardRef.current}
            className="h-7 px-3 flex items-center gap-1.5 bg-gradient-to-r from-blue-600 to-blue-700 rounded text-[11px] font-bold text-white shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {agentState.reasoningState.status === 'running' ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Play size={12} fill="currentColor" />
            )}
            <span>Run Workflow</span>
          </button>

          {/* Actions Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setActionsDropdownOpen(!actionsDropdownOpen)}
              disabled={runningGuardRef.current}
              className="h-7 px-2.5 flex items-center gap-1 bg-white border border-slate-300 rounded text-[11px] font-semibold text-slate-700 hover:border-blue-400 hover:text-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                <span>Actions</span>
                <ChevronDown size={12} />
              </button>

              {actionsDropdownOpen && (
                <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-slate-200 rounded-lg shadow-lg z-50">
                  <button
                    type="button"
                    onClick={() => { resetExecution(); setActionsDropdownOpen(false); }}
                    disabled={runningGuardRef.current}
                    className="w-full px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <Terminal size={12} />
                    <span>Reset workflow</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { handleRefineInterpretation(); setActionsDropdownOpen(false); }}
                    disabled={runningGuardRef.current}
                    className="w-full px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <Brain size={12} />
                    <span>Refine interpretation</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { handleSaveToNotebook(); setActionsDropdownOpen(false); }}
                    disabled={runningGuardRef.current}
                    className="w-full px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <FileText size={12} />
                    <span>Save to Notebook</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { handleOpenSourceProcessing(); setActionsDropdownOpen(false); }}
                    disabled={runningGuardRef.current}
                    className="w-full px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <Database size={12} />
                    <span>View source evidence</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { handleViewClaimBoundary(); setActionsDropdownOpen(false); }}
                    disabled={runningGuardRef.current}
                    className="w-full px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <ClipboardList size={12} />
                    <span>View claim boundary</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { handleExportReport(); setActionsDropdownOpen(false); }}
                    disabled={runningGuardRef.current}
                    className="w-full px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 border-t border-slate-200"
                  >
                    <Download size={12} />
                    <span>Export report section</span>
                  </button>
                </div>
              )}
          </div>

          {/* More Details Button */}
          <button
            type="button"
            onClick={() => setMoreDetailsOpen(!moreDetailsOpen)}
            className="h-7 px-2.5 flex items-center gap-1 bg-white border border-slate-300 rounded text-[11px] font-semibold text-slate-700 hover:border-blue-400 hover:text-blue-700"
          >
            <span>More details</span>
            <ChevronDown size={12} className={`transition-transform ${moreDetailsOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* More Details Drawer */}
        {moreDetailsOpen && (
          <div className="border-t border-slate-200 bg-slate-50 px-4 py-3">
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
              <div>
                <span className="font-semibold text-slate-600">Mode:</span>
                <span className="ml-2 text-slate-700">{AGENT_MODES[agentState.mode].label}</span>
              </div>
              <div>
                <span className="font-semibold text-slate-600">Source mode:</span>
                <span className="ml-2 text-slate-700">{runtimeContext.sourceMode.replace(/_/g, ' ')}</span>
              </div>
              <div>
                <span className="font-semibold text-slate-600">Runtime mode:</span>
                <span className="ml-2 text-slate-700">{runtimeContext.runtimeMode}</span>
              </div>
              <div>
                <span className="font-semibold text-slate-600">Permission mode:</span>
                <span className="ml-2 text-slate-700">{runtimeContext.permissionMode.replace(/_/g, ' ')}</span>
              </div>
              <div>
                <span className="font-semibold text-slate-600">Approval status:</span>
                <span className="ml-2 text-slate-700">{runtimeContext.approvalStatus.replace(/_/g, ' ')}</span>
              </div>
              <div>
                <span className="font-semibold text-slate-600">Source label:</span>
                <span className="ml-2 text-slate-700">{runtimeContext.sourceLabel}</span>
              </div>
              {evidenceBundle && (
                <>
                  <div>
                    <span className="font-semibold text-slate-600">Evidence bundle:</span>
                    <span className="ml-2 text-slate-700">{getEvidenceBundleBadgeLabel(evidenceBundle)}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-600">Completeness:</span>
                    <span className="ml-2 text-slate-700">{evidenceBundle.evidenceCompletenessScore}%</span>
                  </div>
                </>
              )}
              <div>
                <span className="font-semibold text-slate-600">Experiment conditions:</span>
                <span className="ml-2 text-slate-700">{experimentConditionTopBarLabel}</span>
              </div>
              <div>
                <span className="font-semibold text-slate-600">Validation gaps:</span>
                <span className="ml-2 text-slate-700">{evidenceSnapshot.validationGaps?.length ?? 0} identified</span>
              </div>
              {runtimeContext.sourceMode === 'google_drive_connected' && (
                <>
                  <div>
                    <span className="font-semibold text-slate-600">Connected account:</span>
                    <span className="ml-2 text-slate-700">{connectedAccountState.providerLabel}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-600">Drive capabilities:</span>
                    <span className="ml-2 text-slate-700">Import enabled, Export future</span>
                  </div>
                </>
              )}
              <div className="col-span-2">
                <span className="font-semibold text-slate-600">Dataset:</span>
                <span className="ml-2 text-slate-700">{evidenceSnapshot.activeDataset?.fileName ?? 'No active dataset'}</span>
              </div>
              {(() => {
                const availableTechniques = registryProject?.techniques.filter(t => t.available).map(t => t.id as TechniqueWorkspaceId) ?? [];
                const parameterSummaries = availableTechniques.map(technique =>
                  getParameterProvenanceSummary(selectedProject.id, technique)
                ).filter(s => s.hasOverrides);

                if (parameterSummaries.length === 0) return null;

                return (
                  <div className="col-span-2 pt-2 border-t border-slate-200">
                    <span className="font-semibold text-slate-600">Modified parameters:</span>
                    <span className="ml-2 text-slate-700">
                      {parameterSummaries.map(s =>
                        `${s.techniqueLabel}: ${s.overrideCount} (${formatProvenanceSource(s.lastUpdatedBy)})`
                      ).join(', ')}
                    </span>
                  </div>
                );
              })()}
            </div>
          </div>
        )}
      </div>

      {/* Three-Column Layout */}
      <div className="flex flex-1 min-h-0">
        {/* Left Sidebar */}
        <LeftSidebar
          currentDataset={selectedDataset}
          currentProject={selectedProject}
          uploadedEvidenceSearch={evidenceRouteSearch || undefined}
          uploadedTechnique={evidenceSnapshot.primaryTechnique.toLowerCase()}
        />

        {/* Center Column */}
        <CenterColumn
          agentContext={agentContext}
          executionSteps={executionSteps}
          progressPercent={progressPercent}
          evidenceWorkspace={evidenceWorkspace}
          focusedEvidenceSource={focusedEvidenceSource}
          onFocusedTechniqueChange={handleFocusedTechniqueChange}
        />

        {/* Right Panel */}
        <RightPanel
          agentContext={agentContext}
          mode={agentState.mode}
          onSaveToNotebook={handleSaveToNotebook}
          onExportReport={handleExportReport}
          draftParameters={draftParameters}
          onDraftParameterChange={handleDraftParameterChange}
          onApplyParameters={handleApplyParameters}
          onResetParameters={handleResetParameters}
          isConditionLocked={isConditionLocked}
          onUnlockConditions={handleUnlockConditions}
          onLockConditions={handleLockConditions}
          evidenceWorkspace={evidenceWorkspace}
          registryProject={registryProject}
          toolTrace={agentState.toolTrace}
          runtimeMode={runtimeMode}
          approvalLedgerProjectId={selectedProject.id}
          approvalLedgerBundleId={evidenceBundle?.bundleId ?? `single-${selectedProject.id}`}
        />
      </div>
      <ApprovalActionDialog
        action={approvalAction}
        onClose={() => setApprovalAction(null)}
        onContinueLocal={() => {
          setApprovalAction(null);
          showFeedback('Local preview retained. No external action executed.');
        }}
      />
    </div>
  );
}

