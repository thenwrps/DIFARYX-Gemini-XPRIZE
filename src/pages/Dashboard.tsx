import React, { useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '../components/layout/DashboardLayout';
import { Card } from '../components/ui/Card';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Bot,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  FlaskConical,
  Layers,
  Lightbulb,
  Plus,
  Target,
  Upload,
  Workflow,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ActivityTimelineWidget } from '../components/dashboard/ActivityTimelineWidget';
import { ExperimentModal } from '../components/workspace/ExperimentModal';
import { CreateMenu } from '../components/dashboard/CreateMenu';
import { ProjectNotebookWizard } from '../components/dashboard/ProjectNotebookWizard';
import { QuickExperimentSetup } from '../components/dashboard/QuickExperimentSetup';
import { useAuth } from '../contexts/AuthContext';
import {
  DEFAULT_PROJECT_ID,
  DemoExperiment,
  Technique,
  DemoProject,
  demoProjects,
  getDefaultTechnique,
  getTechniqueLabels,
  getLocalExperiments,
  getNotebookPath,
  getProject,
  makeTechniquePattern,
  getLocalProjectNotebooks,
  getNotebookTypeBadge,
  getNotebookActionLabel,
  isNotebookSetupComplete,
  deleteProjectNotebook,
  type ProjectNotebook,
} from '../data/demoProjects';
import {
  getConditionBoundaryNotes,
  getConditionLockStatusLabel,
} from '../data/experimentConditionLock';
import { formatChemicalFormula } from '../utils';
import { ScientificConfidenceSummary, getEvidenceStrengthQualifier } from '../components/ui/ScientificConfidenceSummary';
import {
  claimStatusColorClass,
  claimStatusLabel,
  demoProjectRegistry,
  jobTypeBadgeClass,
  jobTypeLabel,
  type RegistryProject,
  type TechniqueId,
} from '../data/demoProjectRegistry';
import { DemoProjectGraph } from '../components/graphs/DemoProjectGraph';
import { getProjectEvidenceSnapshot } from '../utils/evidenceSnapshot';
import { getRuntimeBadgeClass, getRuntimeBadgeLabel } from '../runtime/difaryxRuntimeMode';
import { getAnalysisSessions, deleteAnalysisSession, type AnalysisSession, seedAnalysisSessions } from '../data/analysisSessions';
import { deleteUploadedSignalRun, getUploadedRunById } from '../data/uploadedSignalRuns';
import {
  getStoredWorkspaceMode,
  setWorkspaceMode,
  getWorkspaceModeLabel,
  getWorkspaceModeBadgeClass,
  getEffectiveWorkspaceMode,
  toWorkspaceMode,
  type WorkspaceMode,
} from '../utils/workspaceMode';
import { runWhenIdle } from '../utils/idle';
import { downloadSessionBundle, importSessionBundle } from '../utils/sessionBundle';
import { EmptyStateCard } from '../components/ui/EmptyStateCard';


/* ─── workflow chain (top of dashboard) ─── */
const WORKFLOW_STEPS = [
  'Research Objective',
  'Experimental Context',
  'Science Skills',
  'Agent Reasoning',
  'Validation Gaps',
  'Next Decision',
  'Notebook Memory',
];

/* ─── severity / urgency helpers ─── */
function gapSeverityColor(severity: string) {
  if (severity === 'critical') return 'text-red-600 bg-red-50 border-red-200';
  if (severity === 'moderate') return 'text-amber-600 bg-amber-50 border-amber-200';
  return 'text-text-muted bg-surface border-border';
}

function urgencyColor(urgency: string) {
  if (urgency === 'high') return 'text-red-600';
  if (urgency === 'medium') return 'text-amber-600';
  return 'text-text-muted';
}

function claimStatusColor(status: string) {
  if (status === 'strongly_supported') return 'text-emerald-600';
  if (status === 'supported') return 'text-cyan';
  if (status === 'partial') return 'text-amber-500';
  return 'text-text-muted';
}

function readinessBarColor(percent: number) {
  if (percent >= 80) return 'bg-emerald-500';
  if (percent >= 50) return 'bg-amber-500';
  return 'bg-red-400';
}

function readinessLabelColor(percent: number) {
  if (percent >= 80) return 'text-emerald-600';
  if (percent >= 50) return 'text-amber-600';
  return 'text-red-500';
}

// Project type labels come from `getProjectJobTypeLabel` / `getProjectJobTypeBadgeColor`
// in `utils/projectEvidence.ts` so the Dashboard and Agent stay aligned.

/* ─── evidence coverage bar ─── */
function EvidenceCoverageBar({ project }: { project: DemoProject }) {
  const total = project.techniqueMetadata.length;
  const ready = project.techniqueMetadata.filter((t) => t.dataAvailable).length;
  const percent = total > 0 ? Math.round((ready / total) * 100) : 0;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-text-muted font-medium">Evidence Coverage</span>
        <span className="text-text-main font-semibold">{ready}/{total} sources</span>
      </div>
      <div className="h-1.5 rounded-full bg-surface overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${percent >= 80 ? 'bg-emerald-500' : percent >= 50 ? 'bg-amber-500' : 'bg-red-400'}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

/* ─── project card — graph-first layout ─── */
function ProjectCard({ project }: { project: RegistryProject }) {
  const navigate = useNavigate();
  const initialEvidenceSnapshot = useMemo(
    () => getProjectEvidenceSnapshot(project.id, { deferStoredContext: true }),
    [project.id],
  );
  const [evidenceSnapshot, setEvidenceSnapshot] = useState(initialEvidenceSnapshot);

  useEffect(() => {
    setEvidenceSnapshot(initialEvidenceSnapshot);
    return runWhenIdle(() => {
      setEvidenceSnapshot(getProjectEvidenceSnapshot(project.id));
    });
  }, [initialEvidenceSnapshot, project.id]);
  const evidenceSourceCount = evidenceSnapshot.availableTechniques.length + evidenceSnapshot.pendingTechniques.length;
  const evidenceCoverageLabel = `${evidenceSnapshot.availableTechniques.length}/${evidenceSourceCount || 0} sources`;
  const firstValidationGap = evidenceSnapshot.validationGaps[0];
  const claimBoundaryLabel =
    evidenceSnapshot.claimBoundary.requiresValidation[0] ??
    evidenceSnapshot.claimBoundary.notSupportedYet[0] ??
    'Claim boundary preserved.';
  const evidenceSummary = evidenceSnapshot.evidenceEntries[0]?.support ?? project.evidenceSummary;
  const runtimeContext = {
    sourceMode: evidenceSnapshot.sourceMode ?? 'demo_preloaded',
    runtimeMode: evidenceSnapshot.runtimeMode ?? 'demo',
    permissionMode: evidenceSnapshot.permissionMode ?? 'read_only',
    sourceLabel: evidenceSnapshot.sourceLabel ?? 'Demo evidence',
    approvalStatus: evidenceSnapshot.approvalStatus ?? 'not_required',
  } as const;

  // Canonical registry project — single source of truth shared across app
  const projectJobLabel = `${jobTypeLabel(project.jobType)} PROJECT`;
  const exportReady = project.reportReadiness >= 80;
  const readinessLabel = evidenceSnapshot.pendingTechniques.length > 0
    ? 'Validation-limited'
    : project.reportReadiness >= 80
      ? 'Reference-supported'
      : project.reportReadiness >= 50
        ? 'Validation-limited'
        : 'Complementary required';
  const readinessColor = project.reportReadiness >= 80
    ? 'text-primary'
    : project.reportReadiness >= 50
    ? 'text-cyan'
    : 'text-amber-600';

  return (
    <Card
      className="cursor-pointer hover:border-primary/50 transition-colors group flex flex-col h-full"
      onClick={() => navigate(`/workspace/analysis?project=${project.id}&mode=demo`)}
    >
      {/* header */}
      <div className="p-4 border-b border-border bg-surface-hover/30 flex justify-between items-start">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${jobTypeBadgeClass(project.jobType)}`}>
              {projectJobLabel}
            </span>
          </div>
          <h3 className="font-bold text-sm text-text-main group-hover:text-primary transition-colors">
            {formatChemicalFormula(project.title)}
          </h3>
          <div className="flex items-center gap-1.5 text-[11px] text-text-muted mt-1">
            <Clock size={11} /> {project.createdLabel}
          </div>
        </div>
        <div className="text-right">
          <div className={`text-xs font-bold ${claimStatusColorClass(project.claimStatus)}`}>{claimStatusLabel(project.claimStatus)}</div>
          <div className="text-[9px] text-text-muted uppercase tracking-wider">Status</div>
        </div>
      </div>

      {/* graph — shared registry source so Dashboard/Workspace/Agent/History match */}
      <div className="h-[180px] px-2 py-2 border-b border-border/50">
        <DemoProjectGraph source={project.graphPreview} compact height="100%" />
      </div>

      {/* body */}
      <div className="flex-1 p-4 flex flex-col gap-2">
        <p className="text-[11px] text-text-muted leading-relaxed line-clamp-2">{formatChemicalFormula(evidenceSummary)}</p>

        {/* technique pills + readiness */}
        <div className="flex items-center justify-between">
          <div className="flex flex-wrap gap-1">
            {evidenceSnapshot.availableTechniques.map((tech) => (
              <span key={tech} className="rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary">
                {tech} Skill
              </span>
            ))}
            {evidenceSnapshot.pendingTechniques.map((tech) => (
              <span key={`pending-${tech}`} className="rounded-full border border-amber-500/30 bg-amber-500/5 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-700">
                {tech} pending
              </span>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <FileText size={11} className={readinessColor} />
            <span className={`text-[10px] font-semibold ${readinessColor}`}>{readinessLabel}</span>
          </div>
        </div>

        {/* mode / status / validation chips */}
        <div className="flex flex-wrap gap-1">
          <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[9px] font-medium text-text-muted">
            {jobTypeLabel(project.jobType)} Mode
          </span>
          <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[9px] font-medium text-text-muted">
            {project.statusLabel}
          </span>
          <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[9px] font-medium text-text-muted">
            {evidenceSnapshot.validationGaps.length} validation gap{evidenceSnapshot.validationGaps.length === 1 ? '' : 's'}
          </span>
          <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[9px] font-medium text-text-muted">
            {evidenceCoverageLabel}
          </span>
          <span className={`rounded-full border px-2 py-0.5 text-[9px] font-medium ${getRuntimeBadgeClass(runtimeContext)}`}>
            {getRuntimeBadgeLabel(runtimeContext)}
          </span>
        </div>

        <ScientificConfidenceSummary
          compact
          claimStatus={project.claimStatus}
          readinessPercent={project.reportReadiness}
          validationGaps={evidenceSnapshot.validationGaps}
          availableTechniques={evidenceSnapshot.availableTechniques}
          pendingTechniques={evidenceSnapshot.pendingTechniques}
          className="mt-1"
        />

        <div className="text-[10px] font-medium text-text-dim tracking-wide mt-1">
          <span className="text-text-muted">Phase Indication:</span> {formatChemicalFormula(evidenceSnapshot.supportedAssignment)} ({getEvidenceStrengthQualifier(project.claimStatus)})
        </div>
        <div className="text-[10px] font-medium text-text-dim tracking-wide line-clamp-1" title={firstValidationGap?.description ?? claimBoundaryLabel}>
          <span className="text-text-muted">Boundary:</span> {firstValidationGap?.description ?? claimBoundaryLabel}
        </div>

        {/* pipeline */}
        <div className="text-[10px] font-medium text-text-dim tracking-wide">
          Science Skill Execution <span className="text-primary/60">→</span> Validation Check <span className="text-primary/60">→</span> Notebook Memory
        </div>
      </div>

      {/* footer actions */}
      <div className="mt-auto p-3 pt-0 border-t border-border">
        <div className="grid grid-cols-5 gap-1.5 pt-3">
          <Link
            to={`/workspace/analysis?project=${project.id}&mode=demo`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex h-8 items-center justify-center rounded-md border border-primary bg-primary/10 px-2 text-[10px] font-semibold text-primary hover:bg-primary/20 transition-colors whitespace-nowrap"
          >
            Analyze
          </Link>
          <Link
            to={`/workspace/multi?project=${project.id}&mode=demo`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex h-8 items-center justify-center rounded-md border border-border px-2 text-[10px] font-medium text-text-muted hover:bg-surface-hover hover:text-text-main transition-colors whitespace-nowrap"
            title="Review cross-technique comparison"
          >
            Review
          </Link>
          <Link
            to={`/notebook?project=${project.id}&mode=demo`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex h-8 items-center justify-center rounded-md border border-border px-2 text-[10px] font-medium text-text-muted hover:bg-surface-hover hover:text-text-main transition-colors whitespace-nowrap"
          >
            Notebook
          </Link>
          <Link
            to={`/history?project=${project.id}&mode=demo`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex h-8 items-center justify-center rounded-md border border-border px-2 text-[10px] font-medium text-text-muted hover:bg-surface-hover hover:text-text-main transition-colors whitespace-nowrap focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
            aria-label={`View history for project ${project.title}`}
            title={`View history for project ${project.title}`}
          >
            History
          </Link>
          {exportReady ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/reports?project=${project.id}&mode=demo`);
              }}
              className="inline-flex h-8 items-center justify-center rounded-md border border-border px-2 text-[10px] font-medium text-text-muted hover:bg-surface-hover hover:text-text-main transition-colors whitespace-nowrap focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
              aria-label={`Export report for project ${project.title}`}
              title={`Export report for project ${project.title}`}
            >
              Export
            </button>
          ) : (
            <button
              type="button"
              disabled
              title="Report readiness too low for export."
              className="inline-flex h-8 items-center justify-center rounded-md border border-border px-2 text-[10px] font-medium text-text-muted whitespace-nowrap opacity-50 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
              aria-label="Report readiness too low for export"
            >
              Export
            </button>
          )}
        </div>
      </div>
    </Card>
  );
}

function makeGraphPoints(technique: string) {
  const settings: Record<string, { min: number; max: number; peaks: Array<[number, number, number]> }> = {
    xrd: {
      min: 10,
      max: 80,
      peaks: [
        [20.9, 26, 1.2],
        [35.5, 92, 0.35],
        [43.2, 52, 0.4],
        [57.1, 38, 0.5],
      ],
    },
    xps: {
      min: 0,
      max: 1200,
      peaks: [
        [284.8, 40, 16],
        [531.4, 72, 20],
        [710.8, 84, 18],
        [933.4, 78, 22],
      ],
    },
    ftir: {
      min: 400,
      max: 4000,
      peaks: [
        [620, 58, 45],
        [1084, 80, 85],
        [1625, 38, 75],
        [3420, 42, 170],
      ],
    },
    raman: {
      min: 100,
      max: 3200,
      peaks: [
        [382, 22, 28],
        [585, 64, 28],
        [690, 94, 34],
        [1348, 42, 62],
      ],
    },
  };
  const config = settings[technique.toLowerCase()] || settings['xrd'];
  const count = 150;
  return Array.from({ length: count }, (_, index) => {
    const x = config.min + ((config.max - config.min) * index) / (count - 1);
    const base = technique.toLowerCase() === 'ftir' ? 92 : 8 + 3 * Math.sin(index / 12);
    const y = config.peaks.reduce((sum, [center, height, width]) => {
      const scaled = (x - center) / width;
      const peak = height * Math.exp(-0.5 * scaled * scaled);
      return technique.toLowerCase() === 'ftir' ? sum - peak * 0.45 : sum + peak;
    }, base);
    return { x: Number(x.toFixed(2)), y: Number(y.toFixed(3)) };
  });
}

interface EvidenceCardProps {
  session: AnalysisSession;
  onDelete?: (session: AnalysisSession) => void;
}

function EvidenceCard({ session, onDelete }: EvidenceCardProps) {
  const navigate = useNavigate();

  const getTechniqueColor = (tech: string) => {
    switch (tech.toLowerCase()) {
      case 'xrd':
        return {
          bg: 'bg-blue-50 border-blue-200 text-blue-700',
          accent: 'blue',
          pill: 'border-blue-300 bg-blue-50/50 text-blue-700',
          stroke: '#3b82f6'
        };
      case 'xps':
        return {
          bg: 'bg-indigo-50 border-indigo-200 text-indigo-700',
          accent: 'indigo',
          pill: 'border-indigo-300 bg-indigo-50/50 text-indigo-700',
          stroke: '#6366f1'
        };
      case 'ftir':
        return {
          bg: 'bg-rose-50 border-rose-200 text-rose-700',
          accent: 'rose',
          pill: 'border-rose-300 bg-rose-50/50 text-rose-700',
          stroke: '#f43f5e'
        };
      case 'raman':
        return {
          bg: 'bg-emerald-50 border-emerald-200 text-emerald-700',
          accent: 'emerald',
          pill: 'border-emerald-300 bg-emerald-50/50 text-emerald-700',
          stroke: '#10b981'
        };
      default:
        return {
          bg: 'bg-slate-50 border-slate-200 text-slate-700',
          accent: 'slate',
          pill: 'border-slate-300 bg-slate-50/50 text-slate-700',
          stroke: '#94a3b8'
        };
    }
  };

  const colors = getTechniqueColor(session.technique);
  
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-emerald-600 bg-emerald-50 border-emerald-200';
      case 'saved':
        return 'text-primary bg-primary/5 border-primary/20';
      case 'draft':
        return 'text-text-muted bg-surface border-border';
      case 'needs-review':
        return 'text-amber-600 bg-amber-50 border-amber-200';
      default:
        return 'text-text-muted bg-surface border-border';
    }
  };

  const query = new URLSearchParams();
  if (session.source === 'user_uploaded') {
    query.set('source', 'user_uploaded');
  }
  query.set('sessionId', session.analysisId);
  if (session.uploadedRunId) query.set('upload', session.uploadedRunId);
  if (session.projectId) query.set('project', session.projectId);
  
  const pathPrefix = session.source === 'user_uploaded' ? 'quick' : 'demo';
  const workspacePath = `/workspace/${session.technique}?mode=${pathPrefix}&${query.toString()}`;

  // Fetch real uploaded run if it's uploaded
  const uploadedRun = session.uploadedRunId ? getUploadedRunById(session.uploadedRunId) : null;
  const points = (uploadedRun && uploadedRun.points && uploadedRun.points.length > 0)
    ? uploadedRun.points
    : makeGraphPoints(session.technique);

  return (
    <Card
      className="cursor-pointer hover:border-primary/50 transition-all duration-200 group flex flex-col h-full bg-white shadow-sm hover:shadow-md"
      onClick={() => navigate(workspacePath)}
    >
      <div className="p-4 border-b border-border bg-surface-hover/20 flex justify-between items-start">
        <div className="min-w-0 flex-1">
          <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${colors.pill}`}>
            {session.technique.toUpperCase()} Evidence
          </span>
          <h3 className="font-bold text-sm text-text-main group-hover:text-primary transition-colors mt-2 truncate">
            {session.title}
          </h3>
          <div className="text-[10px] text-text-muted font-mono mt-1 truncate">
            {session.fileName} {session.fileSizeLabel ? `(${session.fileSizeLabel})` : ''}
          </div>
        </div>
        <div className="text-right ml-2 shrink-0">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${getStatusBadge(session.status)}`}>
            {session.status}
          </span>
          <div className="text-[9px] text-text-muted mt-1">{session.updatedLabel}</div>
        </div>
      </div>

      <div className="h-[180px] px-2 py-2 border-b border-border/50 bg-white">
        <DemoProjectGraph
          source={{
            kind: 'graph',
            type: session.technique.toLowerCase() as TechniqueId,
            xLabel: session.graphData.axisLabel,
            yLabel: session.graphData.yLabel,
            data: points,
            peaks: session.graphData.markers.map((m) => ({
              position: m.position,
              intensity: m.intensity,
              label: m.label,
            })),
          }}
          compact
          height="100%"
        />
      </div>

      <div className="flex-1 p-4 flex flex-col justify-between gap-3 bg-surface/10">
        <div className="space-y-1">
          <p className="text-[11px] text-text-main font-semibold leading-relaxed line-clamp-1">
            {session.processingState}
          </p>
          <ul className="space-y-1">
            {session.interpretation.quick.slice(0, 2).map((bullet, idx) => (
              <li key={idx} className="text-[10px] text-text-muted flex gap-1 items-start leading-tight">
                <span className="text-primary">•</span>
                <span className="line-clamp-2">{bullet}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-wrap gap-1 mt-auto pt-2 border-t border-border/30">
          <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[9px] font-medium text-text-muted">
            {session.source ? session.source.replace('_', ' ') : 'quick analysis'}
          </span>
          {session.projectName && (
            <span className="rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-[9px] font-medium text-primary truncate max-w-[150px]" title={session.projectName}>
              Linked: {session.projectName}
            </span>
          )}
        </div>
      </div>

      <div className="p-3 border-t border-border bg-surface-hover/10">
        <div className="grid grid-cols-4 gap-1.5">
          <Link
            to={workspacePath}
            onClick={(e) => e.stopPropagation()}
            className="col-span-2 inline-flex h-8 items-center justify-center rounded-md border border-primary bg-primary/10 px-2 text-[10px] font-semibold text-primary hover:bg-primary/20 transition-colors whitespace-nowrap"
          >
            Open Workspace
          </Link>
          <Link
            to={`/demo/agent?${query.toString()}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex h-8 items-center justify-center rounded-md border border-border px-2 text-[10px] font-medium text-text-muted hover:bg-surface-hover hover:text-text-main transition-colors whitespace-nowrap focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
            aria-label={`Open Agent workspace for ${session.fileName}`}
            title={`Open Agent workspace for ${session.fileName}`}
          >
            Agent
          </Link>
          {session.source === 'user_uploaded' && onDelete ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(session);
              }}
              className="inline-flex h-8 items-center justify-center rounded-md border border-red-200 px-2 text-[10px] font-medium text-red-600 hover:bg-red-50 transition-colors whitespace-nowrap focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
              aria-label={`Delete evidence ${session.fileName}`}
              title={`Delete evidence ${session.fileName}`}
            >
              Delete
            </button>
          ) : (
            <Link
              to={`/notebook?${query.toString()}`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex h-8 items-center justify-center rounded-md border border-border px-2 text-[10px] font-medium text-text-muted hover:bg-surface-hover hover:text-text-main transition-colors whitespace-nowrap focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
              aria-label={`Open Notebook for ${session.fileName}`}
              title={`Open Notebook for ${session.fileName}`}
            >
              Notebook
            </Link>
          )}
        </div>
      </div>
    </Card>
  );
}

function ExperimentCard({ experiment }: { experiment: DemoExperiment }) {
  const navigate = useNavigate();
  const project = getProject(experiment.projectId);
  if (!project) return null;
  const workspaceTechnique = project.techniques.includes(experiment.technique)
    ? experiment.technique
    : getDefaultTechnique(project);
  const conditionStatus = getConditionLockStatusLabel(experiment.conditionLock);

  return (
    <Card
      className="cursor-pointer hover:border-primary/50 transition-colors group flex flex-col h-full bg-white"
      onClick={() => navigate(`/workspace/${workspaceTechnique.toLowerCase()}?project=${project.id}&mode=demo`)}
    >
      <div className="p-4 border-b border-border bg-primary/5 flex justify-between items-start">
        <div>
          <span className="text-[9px] font-bold uppercase tracking-wider text-text-dim px-1.5 py-0.5 rounded border border-border bg-background">
            QUICK EXPERIMENT
          </span>
          <h3 className="font-semibold text-sm text-text-main group-hover:text-primary transition-colors mt-1">
            {experiment.title}
          </h3>
          <div className="flex items-center gap-1.5 text-[11px] text-text-muted mt-1">
            <Clock size={11} /> {experiment.date}
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm font-bold text-cyan">Demo</div>
          <div className="text-[9px] text-text-muted uppercase tracking-wider">local</div>
        </div>
      </div>
      <div className="flex-1 p-4 flex flex-col gap-2 bg-surface/10">
        <p className="text-[11px] text-text-main leading-relaxed line-clamp-2">{experiment.notes}</p>
        <div className="flex items-center gap-1">
          <span className="px-2 py-0.5 bg-surface border border-border rounded text-[10px] font-medium text-text-dim uppercase tracking-wider">
            {experiment.technique}
          </span>
        </div>
        <div className="flex flex-wrap gap-1 text-[9px]">
          {['Research Mode', conditionStatus, 'Validation required'].map((badge) => (
            <span key={badge} className="rounded-full border border-border bg-background px-2 py-0.5 font-medium text-text-muted">{badge}</span>
          ))}
        </div>
      </div>
      <div className="mt-auto p-4 pt-3 border-t border-border">
        <div className="grid grid-cols-3 gap-1.5">
          <Link
            to={`/workspace/${workspaceTechnique.toLowerCase()}?project=${project.id}&mode=demo`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex h-8 items-center justify-center rounded-md border border-primary bg-primary/10 px-2 text-[10px] font-semibold text-primary hover:bg-primary/20 transition-colors whitespace-nowrap"
          >
            Analyze
          </Link>
          <Link
            to={`${getNotebookPath(project)}&mode=demo`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex h-8 items-center justify-center rounded-md border border-border px-2 text-[10px] font-medium text-text-muted hover:bg-surface-hover hover:text-text-main transition-colors whitespace-nowrap"
          >
            Notebook
          </Link>
          <Link
            to={`/project/${project.id}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex h-8 items-center justify-center rounded-md border border-border px-2 text-[10px] font-medium text-text-muted hover:bg-surface-hover hover:text-text-main transition-colors whitespace-nowrap"
          >
            Details
          </Link>
        </div>
      </div>
    </Card>
  );
}

function NotebookCard({
  notebook,
  onDelete,
}: {
  notebook: ProjectNotebook;
  onDelete: (id: string) => void;
}) {
  const navigate = useNavigate();
  const typeBadge = getNotebookTypeBadge(notebook.mode);
  const modeLabel = notebook.mode === 'research' ? 'Research' : notebook.mode === 'rd' ? 'R&D' : 'Analytical';
  const setupComplete = isNotebookSetupComplete(notebook);
  const statusLabel = notebook.workflowStatus === 'evidence_ready' ? 'Evidence ready' : notebook.workflowStatus === 'setup_ready' ? 'Setup ready' : (setupComplete ? 'Ready' : 'Setup required');
  const statusColor = notebook.workflowStatus === 'evidence_ready' ? 'text-primary' : notebook.workflowStatus === 'setup_ready' ? 'text-amber-600' : (setupComplete ? 'text-primary' : 'text-amber-600');

  return (
    <Card
      className="cursor-pointer hover:border-primary/50 transition-colors group flex flex-col h-full bg-white"
      onClick={() => navigate(`/notebook?project=${notebook.id}&mode=demo`)}
    >
      <div className="p-4 border-b border-border bg-surface-hover/30">
        <div className="flex items-start justify-between">
          <span className="text-[9px] font-bold uppercase tracking-wider text-text-dim px-2 py-0.5 rounded border border-border bg-background">
            {typeBadge}
          </span>
          <span className={`text-xs font-bold ${statusColor}`}>{statusLabel}</span>
        </div>
        <h3 className="font-semibold text-sm text-text-main group-hover:text-primary transition-colors mt-1">
          {notebook.title}
        </h3>
        <div className="flex items-center gap-1.5 text-[11px] text-text-muted mt-1">
          <Clock size={11} /> {new Date(notebook.lastUpdated).toLocaleDateString()}
        </div>
      </div>
      <div className="flex-1 p-4 flex flex-col gap-2 bg-surface/10">
        <div className="flex items-center gap-1.5">
          <Target size={11} className="text-primary" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Objective</span>
        </div>
        <p className="text-[11px] text-text-main leading-relaxed line-clamp-2">{notebook.objective}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className="px-2 py-0.5 bg-surface border border-border rounded text-[10px] font-medium text-text-dim uppercase tracking-wider">{modeLabel}</span>
          <span className="text-[10px] text-text-dim">{notebook.initialDataImport && !notebook.initialDataImport.skipped && notebook.initialDataImport.files.length > 0 ? 'Data attached' : 'Data pending'}</span>
        </div>
      </div>
      <div className="mt-auto p-4 pt-3 border-t border-border">
        <div className="grid grid-cols-3 gap-1.5">
          <Link
            to={`/notebook?project=${notebook.id}&mode=demo`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex h-8 items-center justify-center rounded-md border border-primary bg-primary/10 px-2 text-[10px] font-semibold text-primary hover:bg-primary/20 transition-colors whitespace-nowrap focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
            aria-label={`Open Notebook for project ${notebook.title}`}
            title={`Open Notebook for project ${notebook.title}`}
          >
            Open
          </Link>
          <button
            type="button"
            disabled
            className="inline-flex h-8 items-center justify-center rounded-md border border-border px-2 text-[10px] font-medium text-text-muted opacity-50 whitespace-nowrap focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
            aria-label="Analyze action unavailable"
          >
            Analyze
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (window.confirm(`Delete "${notebook.title}"?`)) {
                onDelete(notebook.id);
              }
            }}
            className="inline-flex h-8 items-center justify-center rounded-md border border-red-300 px-2 text-[10px] font-medium text-red-600 hover:bg-red-50 transition-colors whitespace-nowrap focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
            aria-label={`Delete project ${notebook.title}`}
            title={`Delete project ${notebook.title}`}
          >
            Delete
          </button>
        </div>
      </div>
    </Card>
  );
}

/* ─── main dashboard ─── */

export default function Dashboard() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const isOAuthUser = isAuthenticated && user?.provider === 'google';
  const [feedback, setFeedback] = useState('');
  const [localExperiments, setLocalExperiments] = useState<DemoExperiment[]>([]);
  const [localNotebooks, setLocalNotebooks] = useState<ProjectNotebook[]>([]);
  const [experimentModalOpen, setExperimentModalOpen] = useState(false);
  const [experimentProjectId, setExperimentProjectId] = useState(DEFAULT_PROJECT_ID);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [projectNotebookWizardOpen, setProjectNotebookWizardOpen] = useState(false);
  const [quickExperimentSetupOpen, setQuickExperimentSetupOpen] = useState(false);
  const [uploadedSessionCount, setUploadedSessionCount] = useState(0);
  const [experimentContext, setExperimentContext] = useState<{
    type: 'research' | 'rd' | 'analytical';
    attachment: 'standalone' | 'attach';
  } | null>(null);
  const [workspaceMode, setWorkspaceModeState] = useState<WorkspaceMode>('demo');
  const showUserWorkspace = workspaceMode === 'user' && isOAuthUser;
  const showDemoProjects = !showUserWorkspace;

  const [activeTab, setActiveTab] = useState<'projects' | 'evidence'>('projects');
  const [analysisSessions, setAnalysisSessions] = useState<AnalysisSession[]>([]);

  useEffect(() => {
    setLocalExperiments(getLocalExperiments());
    setLocalNotebooks(getLocalProjectNotebooks());
    setAnalysisSessions(getAnalysisSessions());

    const handleModeChange = (e: CustomEvent) => {
      setWorkspaceModeState(e.detail.mode);
    };

    window.addEventListener('workspace-mode-changed', handleModeChange as EventListener);

    return () => {
      window.removeEventListener('workspace-mode-changed', handleModeChange as EventListener);
    };
  }, []);

  useEffect(() => {
    const storedMode = getStoredWorkspaceMode();
    const effectiveMode = getEffectiveWorkspaceMode({
      authUser: user,
      searchParams: new URLSearchParams(location.search),
      storedMode,
    });
    const resolvedMode = toWorkspaceMode(effectiveMode);

    setWorkspaceModeState((current) => (current === resolvedMode ? current : resolvedMode));

    if (isOAuthUser && storedMode === null && resolvedMode === 'user') {
      setWorkspaceMode('user');
    }
  }, [isOAuthUser, location.search, user]);

  useEffect(() => {
    if (!showUserWorkspace) {
      setUploadedSessionCount(0);
      return;
    }

    return runWhenIdle(() => {
      setUploadedSessionCount(getAnalysisSessions().filter((session) => session.source === 'user_uploaded').length);
    });
  }, [showUserWorkspace]);

  const handleSwitchMode = (mode: WorkspaceMode) => {
    if (mode === 'user' && !isOAuthUser) {
      navigate('/signin', { state: { from: location } });
      return;
    }

    setWorkspaceMode(mode);
    setWorkspaceModeState(mode);
    setFeedback(mode === 'demo' ? 'Switched to Demo Mode' : 'Switched to User Workspace');
    setTimeout(() => setFeedback(''), 2000);

    if (mode === 'demo') {
      navigate('/dashboard?mode=demo', { replace: true });
    } else {
      navigate('/dashboard', { replace: true });
    }
  };

  const handleGoogleSignIn = () => {
    navigate('/signin', { state: { from: location } });
  };

  const handleDeleteUploadedSession = (session: AnalysisSession) => {
    const confirmed = window.confirm(`Delete ${session.fileName} from local uploaded evidence history?`);
    if (!confirmed) return;

    deleteAnalysisSession(session.analysisId);
    if (session.uploadedRunId) deleteUploadedSignalRun(session.uploadedRunId);
    setAnalysisSessions(getAnalysisSessions());
    setUploadedSessionCount(getAnalysisSessions().filter((s) => s.source === 'user_uploaded').length);
  };

  const handleExportSession = () => {
    downloadSessionBundle();
    setFeedback('Session package exported');
    setTimeout(() => setFeedback(''), 2000);
  };

  const handleImportSessionClick = () => {
    const input = document.getElementById('session-file-input') as HTMLInputElement;
    if (input) {
      input.value = '';
      input.click();
    }
  };

  const handleSessionFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const res = importSessionBundle(text);
      if (res.success) {
        setFeedback('Session package imported. Reloading...');
        setTimeout(() => {
          window.location.reload();
        }, 1200);
      } else {
        alert(`Session import failed: ${res.error}`);
      }
    } catch (e: any) {
      alert(`Unable to read session file: ${e.message || String(e)}`);
    }
  };

  /* aggregate stats */
  const totalGaps = demoProjectRegistry.reduce((sum, p) => sum + p.validationGapCount, 0);
  const criticalGaps = demoProjectRegistry.reduce((sum, p) => sum + p._raw.validationGaps.filter((g) => g.severity === 'critical').length, 0);
  const avgReadiness = Math.round(demoProjectRegistry.reduce((sum, p) => sum + p.reportReadiness, 0) / demoProjectRegistry.length);

  return (
    <>
    <DashboardLayout>
      <div className="p-4 h-full overflow-y-auto">
        {/* header */}
        <div className="flex justify-between items-center mb-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">Workflow Intelligence Dashboard</h1>
              <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${getWorkspaceModeBadgeClass(workspaceMode)}`}>
                {getWorkspaceModeLabel(workspaceMode)}
              </span>
              {showUserWorkspace && (
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold border bg-amber-50 border-amber-300 text-amber-700">
                  External writes disabled
                </span>
              )}
            </div>
            <p className="text-text-muted mt-0.5 text-xs">
              {showDemoProjects ? 'Scientific research managed through modular skill layers, evidence validation, and analytical reasoning.' : 'No user project exists yet. Uploaded evidence sessions are stored separately in Analysis History.'}
            </p>
          </div>
          <div className="flex gap-3">
            {feedback && (
              <span className="hidden md:inline-flex items-center rounded-md border border-primary/20 bg-primary/10 px-3 text-xs font-semibold text-primary">
                {feedback}
              </span>
            )}
            <input
              type="file"
              id="session-file-input"
              accept=".difaryx"
              onChange={handleSessionFileChange}
              style={{ display: 'none' }}
              aria-label="Import Session Bundle file selector"
            />
            <Button
              variant="outline"
              className="gap-2 text-xs"
              onClick={handleExportSession}
              aria-label="Export all active session data as a .difaryx bundle file"
              title="Export all active session data as a .difaryx bundle file"
            >
              <Download size={14} /> Export Session
            </Button>
            <Button
              variant="outline"
              className="gap-2 text-xs"
              onClick={handleImportSessionClick}
              aria-label="Import a previously exported .difaryx session bundle file"
              title="Import a previously exported .difaryx session bundle file"
            >
              <Upload size={14} /> Import Session
            </Button>
            {!isOAuthUser && showDemoProjects && (
              <Button variant="outline" className="gap-2 text-xs" onClick={handleGoogleSignIn}>
                Sign in with Google
              </Button>
            )}
            <Button variant="primary" className="gap-2 text-xs font-bold" onClick={() => setCreateMenuOpen(true)}>
              <Plus size={14} /> New
            </Button>
          </div>
        </div>

        {showDemoProjects && (
          <>
            <div className="mb-4 rounded-md border border-border bg-surface px-3 py-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-[10px] font-bold uppercase tracking-wider text-text-muted">
                  Scientific Skill Layer Workflow
                </span>
                {WORKFLOW_STEPS.map((step, index) => (
                  <React.Fragment key={step}>
                    <span className="rounded-md border border-border bg-background px-2 py-0.5 text-[10px] font-semibold text-text-main">
                      {step}
                    </span>
                    {index < WORKFLOW_STEPS.length - 1 && (
                      <ArrowRight size={10} className="text-primary/50" />
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>

            <div className="mb-4 grid grid-cols-4 gap-3">
              <div className="rounded-md border border-border bg-surface px-3 py-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Projects</div>
                <div className="text-lg font-bold text-text-main">{demoProjectRegistry.length}</div>
                <div className="text-[10px] text-text-dim">Active research</div>
              </div>
              <div className="rounded-md border border-border bg-surface px-3 py-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Validation Gaps</div>
                <div className={`text-lg font-bold ${criticalGaps > 0 ? 'text-red-600' : 'text-amber-600'}`}>{totalGaps}</div>
                <div className="text-[10px] text-text-dim">{criticalGaps} critical</div>
              </div>
              <div className="rounded-md border border-border bg-surface px-3 py-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Decisions Pending</div>
                <div className="text-lg font-bold text-cyan">
                  {demoProjectRegistry.reduce((sum, p) => sum + p.decisionPendingCount, 0)}
                </div>
                <div className="text-[10px] text-text-dim">Next experiments</div>
              </div>
              <div className="rounded-md border border-border bg-surface px-3 py-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Report Readiness</div>
                <div className={`text-lg font-bold ${readinessLabelColor(avgReadiness)}`}>{avgReadiness}%</div>
                <div className="text-[10px] text-text-dim">Average across projects</div>
              </div>
            </div>
          </>
        )}
        {/* main switcher area */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start mb-6">
          <div className="lg:col-span-3 min-w-0">
          <div className="flex border-b border-border mb-6">
            <button
              className={`flex items-center gap-2 pb-3 px-6 text-sm font-bold border-b-2 transition-all relative focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none rounded-t-md ${
                activeTab === 'projects'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-text-muted hover:text-text-main'
              }`}
              onClick={() => setActiveTab('projects')}
              aria-label="View Projects list"
              title="View Projects list"
            >
              <Layers size={16} />
              Projects
              <span className={`ml-1.5 px-2 py-0.5 text-[10px] rounded-full font-bold ${
                activeTab === 'projects' ? 'bg-primary/10 text-primary' : 'bg-surface border border-border text-text-muted'
              }`}>
                {showDemoProjects ? demoProjectRegistry.length + localNotebooks.length : localNotebooks.length}
              </span>
            </button>
            <button
              className={`flex items-center gap-2 pb-3 px-6 text-sm font-bold border-b-2 transition-all relative focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none rounded-t-md ${
                activeTab === 'evidence'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-text-muted hover:text-text-main'
              }`}
              onClick={() => setActiveTab('evidence')}
              aria-label="View Scientific Evidence list"
              title="View Scientific Evidence list"
            >
              <FlaskConical size={16} />
              Scientific Evidence
              <span className={`ml-1.5 px-2 py-0.5 text-[10px] rounded-full font-bold ${
                activeTab === 'evidence' ? 'bg-primary/10 text-primary' : 'bg-surface border border-border text-text-muted'
              }`}>
                {(showDemoProjects ? analysisSessions.filter(s => s.source !== 'user_uploaded').length : analysisSessions.filter(s => s.source === 'user_uploaded').length) + localExperiments.length}
              </span>
            </button>
          </div>

          {activeTab === 'projects' ? (
            /* PROJECTS TAB */
            <div>
              {/* Header inside Projects Tab */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Layers size={14} className="text-primary" />
                  <h2 className="text-xs font-bold uppercase tracking-wider text-text-muted">
                    {showDemoProjects ? 'Active Research Projects' : 'User Projects'}
                  </h2>
                </div>
                {isOAuthUser && (
                  <Button variant="outline" size="sm" onClick={() => handleSwitchMode(showDemoProjects ? 'user' : 'demo')}>
                    {showDemoProjects ? 'Switch to User Workspace' : 'Use Demo Project'}
                  </Button>
                )}
              </div>

              {/* Grid or Empty State */}
              {(showDemoProjects ? demoProjectRegistry.length + localNotebooks.length : localNotebooks.length) > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Demo Projects */}
                  {showDemoProjects && demoProjectRegistry.map((project) => (
                    <ProjectCard key={project.id} project={project} />
                  ))}
                  {/* User Local Projects (Notebooks) */}
                  {[...localNotebooks]
                    .sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime())
                    .map((notebook) => (
                      <NotebookCard
                        key={notebook.id}
                        notebook={notebook}
                        onDelete={(id) => {
                          deleteProjectNotebook(id);
                          setLocalNotebooks(getLocalProjectNotebooks());
                        }}
                      />
                    ))}
                </div>
              ) : (
                <div className="space-y-4">
                  <EmptyStateCard
                    type="generic"
                    title="No User Projects Yet"
                    description="Create a project notebook to manage multiple related experiments, files, or analytical runs under a single scientific objective."
                  />
                  <div className="flex flex-wrap justify-center gap-3">
                    <Button variant="primary" className="gap-2 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none" onClick={() => setProjectNotebookWizardOpen(true)}>
                      <Plus size={16} /> Create Project
                    </Button>
                    <Button variant="outline" className="gap-2 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none" onClick={() => handleSwitchMode('demo')}>
                      Use Demo Project
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* EVIDENCE TAB */
            <div>
              {/* Header inside Evidence Tab */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <FlaskConical size={14} className="text-primary" />
                  <h2 className="text-xs font-bold uppercase tracking-wider text-text-muted">
                    {showDemoProjects ? 'Scientific Evidence Examples' : 'Uploaded Evidence'}
                  </h2>
                </div>
                {isOAuthUser && (
                  <Button variant="outline" size="sm" onClick={() => handleSwitchMode(showDemoProjects ? 'user' : 'demo')}>
                    {showDemoProjects ? 'Switch to User Workspace' : 'Use Demo Project'}
                  </Button>
                )}
              </div>

              {/* Grid or Empty State */}
              {((showDemoProjects ? analysisSessions.filter(s => s.source !== 'user_uploaded').length : analysisSessions.filter(s => s.source === 'user_uploaded').length) + localExperiments.length) > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Evidence Sessions (Demo or User) */}
                  {[...(showDemoProjects
                    ? analysisSessions.filter((s) => s.source !== 'user_uploaded')
                    : analysisSessions.filter((s) => s.source === 'user_uploaded')
                  )]
                    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
                    .map((session) => (
                      <EvidenceCard
                        key={session.analysisId}
                        session={session}
                        onDelete={session.source === 'user_uploaded' ? handleDeleteUploadedSession : undefined}
                      />
                    ))}
                  {/* Quick Experiments */}
                  {[...localExperiments]
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                    .map((experiment) => (
                      <ExperimentCard key={experiment.id} experiment={experiment} />
                    ))}
                </div>
              ) : (
                <div className="space-y-4">
                  <EmptyStateCard
                    type="missing_evidence"
                    title="No Scientific Evidence Yet"
                    description="Upload XRD, XPS, FTIR, or Raman spectrum files to begin single-technique processing and reasoning."
                  />
                  <div className="flex flex-wrap justify-center gap-3">
                    <Button variant="primary" className="gap-2 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none" onClick={() => navigate('/workspace?action=upload&source=user_uploaded')}>
                      <Plus size={16} /> Upload Evidence
                    </Button>
                    <Button variant="outline" className="gap-2 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none" onClick={() => setCreateMenuOpen(true)}>
                      <Plus size={16} /> Create Quick Experiment
                    </Button>
                    <Button variant="outline" className="gap-2 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none" onClick={() => handleSwitchMode('demo')}>
                      Use Demo Evidence
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
          </div>

          <div className="lg:col-span-1 shrink-0">
            <ActivityTimelineWidget />
          </div>
        </div>
      </div>
    </DashboardLayout>

    <CreateMenu
      open={createMenuOpen}
      onClose={() => setCreateMenuOpen(false)}
      onSelectOption={(option) => {
        if (option === 'experiment') {
          setQuickExperimentSetupOpen(true);
        } else if (option === 'project') {
          setProjectNotebookWizardOpen(true);
        } else if (option === 'import') {
          navigate('/workspace?action=upload&source=user_uploaded');
        }
      }}
    />

    <ProjectNotebookWizard
      open={projectNotebookWizardOpen}
      onClose={() => setProjectNotebookWizardOpen(false)}
      onCreated={() => {
        setLocalNotebooks(getLocalProjectNotebooks());
        setFeedback('Project Notebook created');
        window.setTimeout(() => setFeedback(''), 2000);
        setProjectNotebookWizardOpen(false);
      }}
    />

    <QuickExperimentSetup
      open={quickExperimentSetupOpen}
      onClose={() => setQuickExperimentSetupOpen(false)}
      onContinue={(data) => {
        setQuickExperimentSetupOpen(false);
        setExperimentContext(data);
        setExperimentProjectId(DEFAULT_PROJECT_ID);
        setExperimentModalOpen(true);
      }}
    />

    <ExperimentModal
      open={experimentModalOpen}
      defaultProjectId={experimentProjectId}
      onClose={() => {
        setExperimentModalOpen(false);
        setExperimentContext(null);
      }}
      onCreated={() => {
        setLocalExperiments(getLocalExperiments());
        setFeedback('Experiment, dataset, and condition record added');
        window.setTimeout(() => setFeedback(''), 1800);
        setExperimentContext(null);
      }}
    />

    {experimentModalOpen && experimentContext && (
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] max-w-md">
        <div className="rounded-md border border-primary bg-primary/10 px-4 py-2 shadow-lg">
          <p className="text-sm font-semibold text-primary text-center">
            Quick Experiment · {experimentContext.type === 'research' ? 'Research Experiment' : experimentContext.type === 'rd' ? 'R&D Trial' : 'Analytical Run'} · {experimentContext.attachment === 'standalone' ? 'Standalone entry' : 'Attach to project'}
          </p>
        </div>
      </div>
    )}
    </>
  );
}
