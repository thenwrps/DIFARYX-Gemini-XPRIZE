import React, { useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '../../../shared/layout/DashboardLayout';
import {
  AlertTriangle,
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Download,
  FlaskConical,
  Layers,
  Lightbulb,
  LogIn,
  Plus,
  Shield,
  Upload,
} from 'lucide-react';
import { Button, cn } from '../../../shared/ui/Button';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ExperimentModal } from '../../workspaces/components/ExperimentModal';
import { CreateMenu } from '../components/CreateMenu';
import { ProjectNotebookWizard } from '../components/ProjectNotebookWizard';
import { QuickExperimentSetup } from '../components/QuickExperimentSetup';
import { useAuth } from '../../../contexts/AuthContext';
import { DEFAULT_PROJECT_ID } from '../../../data/demoProjects';
import { formatChemicalFormula } from '../../../utils';
import {
  getEvidenceStrengthQualifier,
  getConfidenceLevel,
} from '../../../shared/ui/ScientificConfidenceSummary';
import {
  claimStatusLabel,
  demoProjectRegistry,
  jobTypeLabel,
  type RegistryProject,
  type TechniqueId,
  type DemoGraphData,
} from '../../../data/demoProjectRegistry';
import { DemoProjectGraph } from '../../../shared/visualization/DemoProjectGraph';
import { getProjectEvidenceSnapshot } from '../../../utils/evidenceSnapshot';
import {
  getAnalysisSessions,
  type AnalysisSession,
} from '../../../data/analysisSessions';
import {
  getStoredWorkspaceMode,
  setWorkspaceMode,
  getWorkspaceModeLabel,
  getWorkspaceModeBadgeClass,
  getEffectiveWorkspaceMode,
  toWorkspaceMode,
  type WorkspaceMode,
} from '../../../utils/workspaceMode';
import { runWhenIdle } from '../../../utils/idle';
import { downloadSessionBundle, importSessionBundle } from '../../../utils/sessionBundle';
import './Dashboard.css';

/* ─── Workflow strip labels ─── */
const WORKFLOW_STEPS = [
  'Research Objective',
  'Experimental Context',
  'Science Skills',
  'Agent Reasoning',
  'Validation Gaps',
  'Next Decision',
  'Notebook Memory',
];

/* ─── Types ─── */
type DashMode = 'professional' | 'guidance';
type MainTab = 'projects' | 'analysis';

/* ──────────────────────────────────────────────────────────────
   ModeToggle
   ────────────────────────────────────────────────────────────── */
function ModeToggle({
  mode,
  onChange,
}: {
  mode: DashMode;
  onChange: (m: DashMode) => void;
}) {
  return (
    <div
      className="flex items-center rounded-lg p-0.5 db-toggle-wrap"
      role="group"
      aria-label="Dashboard view mode"
    >
      {(['professional', 'guidance'] as DashMode[]).map((m) => {
        const active = mode === m;
        const Icon = m === 'professional' ? BrainCircuit : Lightbulb;
        const label = m === 'professional' ? 'Professional' : 'Guidance';
        const baseClass = cn(
          'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold transition-all select-none',
          active ? 'bg-white shadow-sm db-heading' : 'hover:bg-white/60 db-inactive',
        );
        const iconClass = active ? 'db-indigo' : 'db-inactive';
        return active ? (
          <button key={m} type="button" onClick={() => onChange(m)} className={baseClass} aria-pressed="true">
            <Icon size={13} className={iconClass} />{label}
          </button>
        ) : (
          <button key={m} type="button" onClick={() => onChange(m)} className={baseClass} aria-pressed="false">
            <Icon size={13} className={iconClass} />{label}
          </button>
        );
      })}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   SkillWorkflowStrip (Guidance-only)
   ────────────────────────────────────────────────────────────── */
function SkillWorkflowStrip() {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-[10px] px-3 py-2 shrink-0 db-card">
      <span className="text-[10px] font-bold uppercase tracking-[0.06em] shrink-0 mr-1 db-muted">
        Skill Workflow
      </span>

      {!collapsed && (
        <div className="flex items-center gap-1 flex-wrap min-w-0">
          {WORKFLOW_STEPS.map((step, i) => (
            <React.Fragment key={step}>
              <span
                className="text-[11px] font-medium px-2 py-0.5 rounded-[5px] whitespace-nowrap db-workflow-step"
              >
                {step}
              </span>
              {i < WORKFLOW_STEPS.length - 1 && (
                <ArrowRight size={10} className="db-muted" />
              )}
            </React.Fragment>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="ml-auto shrink-0 rounded p-0.5 hover:bg-slate-100 transition-colors db-muted"
        aria-label={collapsed ? 'Expand workflow strip' : 'Collapse workflow strip'}
      >
        {collapsed ? <ChevronRight size={14} /> : <ChevronUp size={14} />}
      </button>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   DonutRing
   ────────────────────────────────────────────────────────────── */
function DonutRing({ percent, color, size = 36 }: { percent: number; color: string; size?: number }) {
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.max(0, Math.min(100, percent)) / 100) * circ;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f0f1f3" strokeWidth={4} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={4}
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x={size / 2}
        y={size / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="8.5"
        fontWeight="700"
        fontFamily="Inter, system-ui, sans-serif"
        fill={color}
      >
        {percent}%
      </text>
    </svg>
  );
}

/* ──────────────────────────────────────────────────────────────
   CoverageDots
   ────────────────────────────────────────────────────────────── */
function CoverageDots({ available, total }: { available: number; total: number }) {
  const count = Math.max(total, 1);
  const dots = Array.from({ length: count }, (_, i) => i < available);
  return (
    <div className="flex items-center gap-1">
      <span className="text-[9.5px] font-semibold uppercase tracking-[0.06em] mr-0.5 tabular-nums db-muted">
        {available}/{total}
      </span>
      {dots.map((filled, i) => (
        <span
          key={i}
          className={cn(
            'inline-block w-2 h-2 rounded-full border',
            filled ? 'db-indigo-bg border-[#4f46e5]' : 'border-[#98a2b3] bg-transparent',
          )}
        />
      ))}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   ReadinessRow
   ────────────────────────────────────────────────────────────── */
function ReadinessRow({
  project,
  evidenceSnapshot,
}: {
  project: RegistryProject;
  evidenceSnapshot: ReturnType<typeof getProjectEvidenceSnapshot>;
}) {
  const level = getConfidenceLevel(project.claimStatus, project.id);
  const qualifier = getEvidenceStrengthQualifier(project.claimStatus, project.id);
  const percent = project.reportReadiness;
  const gaps = evidenceSnapshot.validationGaps;
  const available = evidenceSnapshot.availableTechniques.length;
  const total = available + evidenceSnapshot.pendingTechniques.length;

  const criticalCount = gaps.filter((g) => g.severity?.toLowerCase() === 'critical').length;
  const highCount = gaps.filter((g) => {
    const s = g.severity?.toLowerCase();
    return s === 'high' || s === 'major' || s === 'moderate';
  }).length;
  const medCount = gaps.filter((g) => {
    const s = g.severity?.toLowerCase();
    return s === 'medium' || s === 'minor';
  }).length;
  const lowCount = gaps.filter((g) => g.severity?.toLowerCase() === 'low').length;
  const conflictsCount = criticalCount;

  const ringColor =
    level === 'HIGH' ? '#12b76a'
    : level === 'MEDIUM-HIGH' ? '#4f46e5'
    : level === 'MEDIUM' ? '#f79009'
    : '#d32f2f';

  const levelChipClass =
    level === 'HIGH' ? 'db-emerald-chip'
    : level === 'MEDIUM-HIGH' ? 'bg-[#f0f5ff] text-[#4f46e5] border-[#dbeafe]'
    : level === 'MEDIUM' ? 'db-amber-chip'
    : 'bg-[#fff1f2] text-[#d32f2f] border-[#fecdd3]';

  const breakdownParts: string[] = [];
  if (highCount > 0) breakdownParts.push(`${highCount} high`);
  if (medCount > 0) breakdownParts.push(`${medCount} med`);
  if (lowCount > 0) breakdownParts.push(`${lowCount} low`);
  const breakdown = breakdownParts.join(', ');

  return (
    <div className="mt-auto pt-2.5 flex items-center gap-2 flex-wrap db-hairline-t">
      <DonutRing percent={percent} color={ringColor} size={36} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className={cn(
              'text-[10px] font-bold uppercase tracking-[0.06em] px-1.5 py-0.5 rounded border',
              levelChipClass,
            )}
          >
            {level === 'MEDIUM-HIGH' ? 'MED-HIGH' : level}
          </span>
          <span className="text-[11px] db-body">{qualifier}</span>
        </div>
        <div className="text-[10px] mt-0.5 tabular-nums db-muted">
          <span className={conflictsCount > 0 ? 'db-red' : 'db-muted'}>
            Conflicts {conflictsCount}
          </span>
          {' | '}
          <span>Gaps {gaps.length}</span>
          {breakdown && <span className="ml-1 db-muted">· {breakdown}</span>}
        </div>
      </div>

      <CoverageDots available={available} total={total} />
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   AnalysisHighlights
   ────────────────────────────────────────────────────────────── */
function AnalysisHighlights({
  project,
  evidenceSnapshot,
}: {
  project: RegistryProject;
  evidenceSnapshot: ReturnType<typeof getProjectEvidenceSnapshot>;
}) {
  const phaseText = evidenceSnapshot.supportedAssignment
    ? formatChemicalFormula(evidenceSnapshot.supportedAssignment)
    : formatChemicalFormula(project.evidenceSummary.slice(0, 80));
  const qualifier = getEvidenceStrengthQualifier(project.claimStatus);

  const boundaryText =
    evidenceSnapshot.validationGaps[0]?.description ??
    (evidenceSnapshot.claimBoundary as any).requiresValidation?.[0] ??
    (evidenceSnapshot.claimBoundary as any).notSupportedYet?.[0] ??
    'Claim boundary preserved.';

  const hasConflict = evidenceSnapshot.validationGaps.some(
    (g) => g.severity?.toLowerCase() === 'critical',
  );

  return (
    <div className="flex flex-col gap-2">
      {/* Emerald — Phase */}
      <div className="flex items-start gap-2">
        <span className="shrink-0 flex items-center justify-center rounded-md w-[22px] h-[22px] db-emerald-icon-bg">
          <Shield size={12} />
        </span>
        <div className="min-w-0">
          <div className="text-[9.5px] font-bold uppercase tracking-[0.06em] mb-0.5 db-emerald-text">
            Phase Indication
          </div>
          <div className="text-[11px] leading-snug db-body">
            {phaseText}
            {qualifier && <span className="db-muted"> — {qualifier}</span>}
          </div>
        </div>
      </div>

      {/* Amber — Validation boundary */}
      <div className="flex items-start gap-2">
        <span className="shrink-0 flex items-center justify-center rounded-md w-[22px] h-[22px] db-amber-icon-bg">
          <AlertTriangle size={12} />
        </span>
        <div className="min-w-0">
          <div className="text-[9.5px] font-bold uppercase tracking-[0.06em] mb-0.5 db-amber-text">
            {hasConflict ? 'Conflict · Needs Resolution' : 'Validation Boundary'}
          </div>
          <div
            className="text-[11px] leading-snug line-clamp-2 db-body"
            title={boundaryText}
          >
            {boundaryText}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   MoreMenu (card footer popover)
   ────────────────────────────────────────────────────────────── */
function MoreMenu({ project, open, onClose }: { project: RegistryProject; open: boolean; onClose: () => void }) {
  if (!open) return null;
  const items = [
    { label: 'Review evidence', to: `/workspace/multi?project=${project.id}&mode=demo` },
    { label: 'Open notebook', to: `/notebook?project=${project.id}&mode=demo` },
    { label: 'Version history', to: `/history?project=${project.id}&mode=demo` },
    { label: 'Export report', to: `/reports?project=${project.id}&mode=demo` },
  ];
  return (
    <div className="absolute right-0 bottom-full mb-1 z-20 w-44 rounded-lg border bg-white py-1 shadow-lg db-more-menu">
      {items.map((item) => (
        <Link
          key={item.label}
          to={item.to}
          onClick={onClose}
          className="flex h-8 items-center px-3 text-[12px] font-medium hover:bg-slate-50 transition-colors db-body"
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   ProjectCardV5
   ────────────────────────────────────────────────────────────── */
function ProjectCardV5({ project }: { project: RegistryProject }) {
  const [moreOpen, setMoreOpen] = useState(false);

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

  const techniqueCount =
    evidenceSnapshot.availableTechniques.length + evidenceSnapshot.pendingTechniques.length;

  const availableTechs = useMemo(() => {
    return Object.keys(project.workspaceGraphs || {}) as TechniqueId[];
  }, [project.workspaceGraphs]);

  const [selectedTech, setSelectedTech] = useState<TechniqueId>(() => {
    return (project.graphPreview?.type as TechniqueId) || availableTechs[0] || 'xrd';
  });

  const currentSource = useMemo(() => {
    return project.workspaceGraphs?.[selectedTech] || project.graphPreview;
  }, [project.workspaceGraphs, selectedTech, project.graphPreview]);

  // Type tag styles
  const typeTagClass =
    project.jobType === 'research'
      ? 'db-tag-research'
      : project.jobType === 'rd'
        ? 'db-tag-rd'
        : 'bg-[#f0fdf4] text-[#166534] border-[#bbf7d0]';

  // Status chip — use whitespace-nowrap + a shortened readable label to prevent mid-word clip
  const isReportReady =
    project.claimStatus === 'supported_assignment' || project.claimStatus === 'report_ready';
  const statusDotClass  = isReportReady ? 'db-emerald-icon-bg' : 'bg-[#f79009]';
  const rawLabel = claimStatusLabel(project.claimStatus);
  const statusText      = isReportReady
    ? 'Report ready'
    : rawLabel.replace('Validation-limited scientific claim', 'Validation-limited')
               .replace('Validation-limited scientific', 'Validation-limited')
               .replace(' (Report-ready)', '');
  const statusChipClass = isReportReady ? 'db-emerald-chip' : 'db-amber-chip';

  return (
    <div className="flex flex-col rounded-[12px] overflow-visible transition-shadow hover:shadow-md db-card">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2.5">
        <span
          className={cn(
            'text-[9.5px] font-bold uppercase tracking-[0.06em] px-2 py-0.5 rounded-[5px] border',
            typeTagClass,
          )}
        >
          {jobTypeLabel(project.jobType)} Project
        </span>
        <span
          className={cn(
            'flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-[5px] border whitespace-nowrap',
            statusChipClass,
          )}
        >
          <span className={cn('inline-block w-1.5 h-1.5 rounded-full shrink-0', statusDotClass)} />
          {statusText}
        </span>
      </div>

      {/* Title + subtitle */}
      <div className="px-4 pb-2">
        <h3 className="text-[15px] font-bold leading-snug db-heading">
          {formatChemicalFormula(project.title)}
        </h3>
        <p className="text-[11px] mt-0.5 tabular-nums db-muted">
          {techniqueCount} technique{techniqueCount !== 1 ? 's' : ''} · updated {project.createdLabel}
        </p>
      </div>

      {/* Spectrum hero — inner panel clips the graph, card stays overflow-visible for the popover */}
      <div className="mx-3 mb-2.5 rounded-[8px] overflow-hidden db-inner-panel">
        <div className="flex items-center justify-between px-3 py-1.5 db-inner-border-b">
          <span className="text-[9.5px] font-bold uppercase tracking-[0.06em] db-muted">
            Spectrum Preview
          </span>
          {availableTechs.length > 0 && (
            <select
              value={selectedTech}
              onChange={(e) => setSelectedTech(e.target.value as TechniqueId)}
              title="Select analysis technique"
              className="text-[10.5px] font-semibold bg-white border border-slate-200 rounded px-1.5 py-0.5 outline-none cursor-pointer focus:border-indigo-400 db-body"
            >
              {availableTechs.map((tech) => (
                <option key={tech} value={tech}>
                  {tech === 'xrd' ? 'XRD Pattern' : tech === 'xps' ? 'XPS Spectra' : tech === 'ftir' ? 'FTIR Spectra' : tech === 'raman' ? 'Raman Spectra' : tech.toUpperCase()}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="h-[120px]">
          <DemoProjectGraph
            source={currentSource}
            compact
            height={110}
            hideAxes={true}
            hideGrid={true}
          />
        </div>
      </div>

      {/* Analysis highlights */}
      <div className="px-4 pb-2.5">
        <AnalysisHighlights project={project} evidenceSnapshot={evidenceSnapshot} />
      </div>

      {/* Readiness row */}
      <div className="px-4 pb-3">
        <ReadinessRow project={project} evidenceSnapshot={evidenceSnapshot} />
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 px-3 py-2.5 db-hairline-t">
        {/* Split Analyze */}
        <div className="flex rounded-[8px] overflow-visible flex-1">
          <Link
            to={`/workspace/analysis?project=${project.id}&mode=demo`}
            className="flex-1 inline-flex items-center justify-center h-8 px-3 text-[12px] font-semibold text-white rounded-l-[8px] transition-colors hover:opacity-90 db-indigo-bg"
          >
            Analyze
          </Link>
          <div className="relative">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setMoreOpen((o) => !o); }}
              className="h-8 px-2 inline-flex items-center border-l rounded-r-[8px] text-white transition-colors hover:opacity-90 db-indigo-dk-bg"
              aria-label="More analyze actions"
            >
              <ChevronDown size={13} />
            </button>
            <MoreMenu project={project} open={moreOpen} onClose={() => setMoreOpen(false)} />
          </div>
        </div>

        {/* Standalone More */}
        <div className="relative">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setMoreOpen((o) => !o); }}
            className="inline-flex h-8 items-center gap-1 px-3 rounded-[8px] border text-[12px] font-medium transition-colors hover:bg-slate-50 db-card-border db-body"
          >
            More
            <ChevronDown size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   Technique badge helper (used by AnalysisSessionCard)
   ────────────────────────────────────────────────────────────── */
function getTechBadgeClass(technique: string): string {
  switch (technique.toLowerCase()) {
    case 'xrd':
      return 'bg-[#eef2ff] text-[#4338ca] border-[#c7d2fe]';
    case 'xps':
      return 'db-amber-chip';
    case 'ftir':
      return 'bg-[#ecfeff] text-[#0e7490] border-[#a5f3fc]';
    case 'raman':
      return 'bg-[#f5f3ff] text-[#7c3aed] border-[#ddd6fe]';
    default:
      return 'bg-[#f8fafc] db-body border-[#e2e8f0]';
  }
}

/* Generate high-fidelity synthetic spectrum points for preview graphs */
function makeSessionGraphPoints(technique: string) {
  const settings: Record<string, { min: number; max: number; peaks: Array<[number, number, number]> }> = {
    xrd: { min: 10, max: 80, peaks: [[20.9, 26, 1.2], [35.5, 92, 0.35], [43.2, 52, 0.4], [57.1, 38, 0.5]] },
    xps: { min: 0, max: 1200, peaks: [[284.8, 40, 16], [531.4, 72, 20], [710.8, 84, 18], [933.4, 78, 22]] },
    ftir: { min: 400, max: 4000, peaks: [[620, 58, 45], [1084, 80, 85], [1625, 38, 75], [3420, 42, 170]] },
    raman: { min: 100, max: 3200, peaks: [[382, 22, 28], [585, 64, 28], [690, 94, 34], [1348, 42, 62]] },
  };
  const config = settings[technique] || settings.xrd;
  const count = 100;
  return Array.from({ length: count }, (_, index) => {
    const x = config.min + ((config.max - config.min) * index) / (count - 1);
    const base = technique === 'ftir' ? 92 : 8 + 3 * Math.sin(index / 12);
    const y = config.peaks.reduce((sum, [center, height, width]) => {
      const scaled = (x - center) / width;
      const peak = height * Math.exp(-0.5 * scaled * scaled);
      return technique === 'ftir' ? sum - peak * 0.45 : sum + peak;
    }, base);
    return { x: Number(x.toFixed(2)), y: Number(y.toFixed(3)) };
  });
}

/* Workspace URL for an analysis session */
function sessionWorkspaceUrl(session: AnalysisSession): string {
  return `/workspace/${session.technique}?mode=demo&session=${session.analysisId}`;
}

/* Agent URL for an analysis session */
function sessionAgentUrl(session: AnalysisSession): string {
  return `/demo/agent?technique=${session.technique}&session=${session.analysisId}&mode=demo`;
}

/* ──────────────────────────────────────────────────────────────
   AnalysisSessionCard
   Full-card version of an analysis session for the Sample Analysis
   tab grid. Mirrors the visual system of ProjectCardV5 (simplified).
   IMPORTANT: No inline analysis — buttons route OUT to Workspace / Agent.
   ────────────────────────────────────────────────────────────── */
function AnalysisSessionCard({ session }: { session: AnalysisSession }) {
  const isValidated = session.status === 'completed' || session.status === 'saved';
  const techBadgeClass = getTechBadgeClass(session.technique);

  /* Build the same graph source that the dashboard/workspace uses */
  const graphSource = useMemo<DemoGraphData>(() => ({
    kind: 'graph',
    type: session.technique,
    xLabel: session.graphData.axisLabel,
    yLabel: session.graphData.yLabel,
    data: makeSessionGraphPoints(session.technique),
    peaks: session.graphData.markers,
  }), [session]);

  const statusLabel = useMemo(() => {
    switch (session.status) {
      case 'saved': return 'Saved (Validated)';
      case 'completed': return 'Completed (Validated)';
      case 'draft': return 'Draft (Pending)';
      case 'needs-review': return 'Needs Review (Pending)';
      default: return session.status.charAt(0).toUpperCase() + session.status.slice(1);
    }
  }, [session.status]);

  return (
    <div className="flex flex-col rounded-[12px] overflow-visible transition-shadow hover:shadow-md db-card">
      {/* Header: technique badge + status pill */}
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2.5">
        <span
          className={cn(
            'text-[9.5px] font-bold uppercase tracking-[0.06em] px-2 py-0.5 rounded-[5px] border',
            techBadgeClass,
          )}
        >
          {session.technique.toUpperCase()}
        </span>
        <span
          className={cn(
            'flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-[5px] border whitespace-nowrap',
            isValidated ? 'db-emerald-chip' : 'db-amber-chip',
          )}
        >
          <span
            className={cn(
              'inline-block w-1.5 h-1.5 rounded-full shrink-0',
              isValidated ? 'db-emerald-icon-bg' : 'bg-[#f79009]',
            )}
          />
          {statusLabel}
        </span>
      </div>

      {/* Title + subtitle */}
      <div className="px-4 pb-2">
        <h3 className="text-[14px] font-bold leading-snug db-heading">
          {formatChemicalFormula(session.title)}
        </h3>
        <p className="text-[11px] mt-0.5 tabular-nums db-muted">
          {session.owner} · {session.updatedLabel}
          {session.projectName && <span> · {session.projectName}</span>}
        </p>
      </div>

      {/* Mini spectrum — reuses DemoProjectGraph */}
      <div className="mx-3 mb-2.5 rounded-[8px] overflow-hidden db-inner-panel">
        <div className="flex items-center px-3 py-1.5 db-inner-border-b">
          <span className="text-[9.5px] font-bold uppercase tracking-[0.06em] db-muted">
            Spectrum Preview
          </span>
        </div>
        <div className="h-[100px]">
          <DemoProjectGraph
            source={graphSource}
            compact
            height={90}
            hideAxes={true}
            hideGrid={true}
          />
        </div>
      </div>

      {/* Footer: Workspace + Agent buttons only — no Analyze */}
      <div className="flex items-center gap-2 px-3 py-2.5 db-hairline-t mt-auto">
        <Link
          to={sessionWorkspaceUrl(session)}
          className="flex-1 inline-flex items-center justify-center h-8 px-3 text-[12px] font-semibold text-white rounded-[8px] transition-colors hover:opacity-90 db-indigo-bg"
        >
          Open in Workspace
        </Link>
        <Link
          to={sessionAgentUrl(session)}
          className="inline-flex h-8 items-center gap-1 px-3 rounded-[8px] border text-[12px] font-medium transition-colors hover:bg-slate-50 whitespace-nowrap db-card-border db-body"
        >
          <BrainCircuit size={12} />
          Agent
        </Link>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Dashboard — main component
   ══════════════════════════════════════════════════════════════ */
export default function Dashboard() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const isOAuthUser = isAuthenticated && user?.provider === 'google';

  const [feedback, setFeedback] = useState('');
  const [experimentModalOpen, setExperimentModalOpen] = useState(false);
  const [experimentProjectId, setExperimentProjectId] = useState(DEFAULT_PROJECT_ID);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [projectNotebookWizardOpen, setProjectNotebookWizardOpen] = useState(false);
  const [quickExperimentSetupOpen, setQuickExperimentSetupOpen] = useState(false);
  const [experimentContext, setExperimentContext] = useState<{
    type: 'research' | 'rd' | 'analytical';
    attachment: 'standalone' | 'attach';
  } | null>(null);

  /* Dashboard presentation mode (independent chrome density axis) */
  const [dashMode, setDashMode] = useState<DashMode>(
    () =>
      (localStorage.getItem('difaryx.dashboard.mode') as DashMode) || 'guidance',
  );
  const handleDashModeChange = (m: DashMode) => {
    localStorage.setItem('difaryx.dashboard.mode', m);
    setDashMode(m);
  };

  /* Main content tab */
  const [activeTab, setActiveTab] = useState<MainTab>('projects');

  /* Workspace / data mode (demo vs user) — kept fully independent */
  const [workspaceMode, setWorkspaceModeState] = useState<WorkspaceMode>('demo');
  const showDemoProjects = workspaceMode !== 'user';

  const [analysisSessions, setAnalysisSessions] = useState<AnalysisSession[]>([]);

  useEffect(() => {
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
    if (storedMode === null && resolvedMode === 'user') {
      setWorkspaceMode('user');
    }
  }, [location.search, user]);

  const handleGoogleSignIn = () => navigate('/signin', { state: { from: location } });

  const handleExportSession = () => {
    downloadSessionBundle();
    setFeedback('Session package exported');
    setTimeout(() => setFeedback(''), 2000);
  };

  const handleImportSessionClick = () => {
    const input = document.getElementById('session-file-input') as HTMLInputElement;
    if (input) { input.value = ''; input.click(); }
  };

  const handleSessionFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const res = importSessionBundle(text);
      if (res.success) {
        setFeedback('Session package imported. Reloading...');
        setTimeout(() => window.location.reload(), 1200);
      } else {
        alert(`Session import failed: ${res.error}`);
      }
    } catch (e: any) {
      alert(`Unable to read session file: ${e.message || String(e)}`);
    }
  };

  return (
    <>
      <DashboardLayout>
        <div className="flex flex-col h-full overflow-hidden p-4 md:p-5 gap-3 db-page-bg">
          {/* ── Header row ── */}
          <div className="flex items-start justify-between gap-3 shrink-0">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-[18px] font-bold tracking-tight leading-tight db-heading">
                  Workflow Intelligence Dashboard
                </h1>
                <span
                  className={cn(
                    'px-2 py-0.5 rounded text-[10px] font-semibold border',
                    getWorkspaceModeBadgeClass(workspaceMode),
                  )}
                >
                  {getWorkspaceModeLabel(workspaceMode)}
                </span>
              </div>
              {!showDemoProjects && (
                <p className="text-[12px] mt-0.5 leading-snug db-body">
                  User workspace mode — demo data hidden.
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
              {feedback && (
                <span className="hidden md:inline-flex items-center rounded-md border border-primary/20 bg-primary/10 px-3 text-xs font-semibold text-primary">
                  {feedback}
                </span>
              )}

              <ModeToggle mode={dashMode} onChange={handleDashModeChange} />

              <input
                type="file"
                id="session-file-input"
                accept=".difaryx"
                onChange={handleSessionFileChange}
                className="hidden"
                aria-label="Import session bundle"
              />
              <Button
                variant="outline"
                className="h-8 w-8 p-0 flex items-center justify-center"
                onClick={handleExportSession}
                aria-label="Export session bundle"
                title="Export Session"
              >
                <Download size={14} />
              </Button>
              <Button
                variant="outline"
                className="h-8 w-8 p-0 flex items-center justify-center"
                onClick={handleImportSessionClick}
                aria-label="Import session bundle"
                title="Import Session"
              >
                <Upload size={14} />
              </Button>
              {!isOAuthUser && showDemoProjects && (
                <Button
                  variant="outline"
                  className="h-8 w-8 p-0 flex items-center justify-center"
                  onClick={handleGoogleSignIn}
                  title="Sign in"
                  aria-label="Sign in"
                >
                  <LogIn size={14} />
                </Button>
              )}
              <Button
                variant="primary"
                className="gap-1.5 text-[12px] h-8 px-3 font-bold"
                onClick={() => setCreateMenuOpen(true)}
              >
                <Plus size={13} /> New
              </Button>
            </div>
          </div>

          {/* ── Guidance: skill-workflow strip ── */}
          {dashMode === 'guidance' && showDemoProjects && <SkillWorkflowStrip />}

          {/* ── Section tab bar ── */}
          <div className="flex items-center justify-between shrink-0">
            <div
              className="flex items-center gap-0.5 rounded-lg p-0.5 db-toggle-wrap"
              role="tablist"
              aria-label="Content section"
            >
              {/* Projects tab */}
              {activeTab === 'projects' ? (
                <button
                  type="button" role="tab" aria-selected="true"
                  onClick={() => setActiveTab('projects')}
                  className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold transition-all select-none bg-white shadow-sm db-heading"
                >
                  <Layers size={12} className="db-indigo" />
                  Projects
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full tabular-nums db-badge-indigo">
                    {showDemoProjects ? demoProjectRegistry.length : 0}
                  </span>
                </button>
              ) : (
                <button
                  type="button" role="tab" aria-selected="false"
                  onClick={() => setActiveTab('projects')}
                  className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold transition-all select-none hover:bg-white/60 db-inactive"
                >
                  <Layers size={12} className="db-inactive" />
                  Projects
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full tabular-nums db-toggle-wrap db-muted">
                    {showDemoProjects ? demoProjectRegistry.length : 0}
                  </span>
                </button>
              )}

              {/* Sample Analysis tab */}
              {activeTab === 'analysis' ? (
                <button
                  type="button" role="tab" aria-selected="true"
                  onClick={() => setActiveTab('analysis')}
                  className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold transition-all select-none bg-white shadow-sm db-heading"
                >
                  <FlaskConical size={12} className="db-indigo" />
                  Sample Analysis
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full tabular-nums db-badge-indigo">
                    {analysisSessions.length}
                  </span>
                </button>
              ) : (
                <button
                  type="button" role="tab" aria-selected="false"
                  onClick={() => setActiveTab('analysis')}
                  className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold transition-all select-none hover:bg-white/60 db-inactive"
                >
                  <FlaskConical size={12} className="db-inactive" />
                  Sample Analysis
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full tabular-nums db-toggle-wrap db-muted">
                    {analysisSessions.length}
                  </span>
                </button>
              )}
            </div>


            {dashMode === 'guidance' && (
              <p className="text-[11px] italic hidden lg:block db-muted">
                {activeTab === 'projects'
                  ? 'Active projects with multi-technique evidence.'
                  : 'Individual sample analyses — open in Workspace or Agent.'}
              </p>
            )}
          </div>

          {/* ── Body ── */}
          {activeTab === 'projects' ? (
            /* Project grid — full width now that side panel is removed */
            <div className="flex-1 min-h-0">
              {showDemoProjects ? (
                <div className="grid grid-cols-2 gap-3.5 content-start min-h-0 overflow-y-auto pb-2 h-full">
                  {demoProjectRegistry.map((project) => (
                    <ProjectCardV5 key={project.id} project={project} />
                  ))}
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center flex-col gap-4 bg-white border border-slate-200 rounded-[12px] p-6 shadow-sm h-full">
                  <p className="text-sm text-text-muted text-center max-w-sm">
                    No user project exists yet. Upload evidence or create a project notebook.
                  </p>
                  <div className="flex gap-3">
                    <Button
                      variant="primary"
                      className="gap-2 text-[12px] h-8 px-3 font-semibold"
                      onClick={() => setProjectNotebookWizardOpen(true)}
                    >
                      <Plus size={14} /> Create Project
                    </Button>
                    <Button
                      variant="outline"
                      className="gap-2 text-[12px] h-8 px-3 font-semibold"
                      onClick={() => navigate('/dashboard?mode=demo', { replace: true })}
                    >
                      Use Demo Project
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Sample Analysis — card grid, no row list, no inline analysis */
            <div className="flex-1 min-h-0">
              {(() => {
                const activeSessions = showDemoProjects
                  ? analysisSessions.filter((s) => s.source !== 'user_uploaded')
                  : analysisSessions.filter((s) => s.source === 'user_uploaded');
                return activeSessions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-3 text-[12px] db-muted">
                    <FlaskConical size={28} />
                    No analysis sessions
                  </div>
                ) : (
                  <div className="grid grid-cols-2 xl:grid-cols-3 gap-3.5 content-start min-h-0 overflow-y-auto pb-2 h-full">
                    {activeSessions.map((session) => (
                      <AnalysisSessionCard key={session.analysisId} session={session} />
                    ))}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </DashboardLayout>

      {/* ── Portals ── */}
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
          setFeedback('Experiment, dataset, and condition record added');
          window.setTimeout(() => setFeedback(''), 1800);
          setExperimentContext(null);
        }}
      />

      {experimentModalOpen && experimentContext && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] max-w-md">
          <div className="rounded-md border border-primary bg-primary/10 px-4 py-2 shadow-lg">
            <p className="text-sm font-semibold text-primary text-center">
              Quick Experiment ·{' '}
              {experimentContext.type === 'research'
                ? 'Research Experiment'
                : experimentContext.type === 'rd'
                  ? 'R&D Trial'
                  : 'Analytical Run'}{' '}
              · {experimentContext.attachment === 'standalone' ? 'Standalone entry' : 'Attach to project'}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
