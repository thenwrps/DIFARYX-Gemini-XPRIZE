import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  FileText,
  FlaskConical,
  Layers3,
  NotebookTabs,
  Upload,
} from 'lucide-react';
import { DashboardLayout } from '../components/layout/DashboardLayout';
import { Card } from '../components/ui/Card';
import { useAuth } from '../contexts/AuthContext';
import { formatChemicalFormula } from '../utils';
import {
  getStoredWorkspaceMode,
  setWorkspaceMode,
} from '../utils/workspaceMode';
import {
  buildEvidenceRouteSearch,
  getEvidenceRouteContext,
  type EvidenceRouteContext,
} from '../utils/evidenceRouteContext';
import { getProjectEvidenceSnapshot } from '../utils/evidenceSnapshot';
import {
  claimStatusColorClass,
  claimStatusLabel,
  demoProjectRegistry,
  getRegistryProject,
  isKnownProjectId,
  jobTypeBadgeClass,
  jobTypeLabel,
  normalizeRegistryProjectId,
  type RegistryProject,
  type TechniqueId,
} from '../data/demoProjectRegistry';

const TECHNIQUE_ORDER: TechniqueId[] = ['xrd', 'xps', 'ftir', 'raman'];

const workflowSteps = [
  { label: 'Project', to: null },
  { label: 'Evidence', to: '/workspace' },
  { label: 'Technique Analysis', to: '/workspace' },
  { label: 'Agent Reasoning', to: '/demo/agent' },
  { label: 'Notebook', to: '/notebook' },
  { label: 'Report', to: '/reports' },
];

function techniqueLabel(id: TechniqueId) {
  if (id === 'xrd') return 'XRD';
  if (id === 'xps') return 'XPS';
  if (id === 'ftir') return 'FTIR';
  if (id === 'raman') return 'Raman';
  return 'Multi-tech';
}

function techniqueFullName(id: TechniqueId) {
  if (id === 'xrd') return 'X-ray diffraction';
  if (id === 'xps') return 'X-ray photoelectron spectroscopy';
  if (id === 'ftir') return 'Fourier transform infrared';
  if (id === 'raman') return 'Raman spectroscopy';
  return 'Cross-technique evidence';
}

function techniqueRoute(technique: TechniqueId, projectId: string) {
  return `/workspace/${technique}?project=${projectId}&mode=demo`;
}

function projectTechniqueIds(project: RegistryProject) {
  return project.selectedTechniques.filter((technique): technique is Exclude<TechniqueId, 'multi'> => (
    technique !== 'multi'
  ));
}

function WorkspaceEmptyState({ email }: { email?: string }) {
  return (
    <DashboardLayout>
      <div className="flex-1 overflow-y-auto bg-slate-50">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-text-main">Workspace</h1>
            <p className="mt-1 text-sm text-text-muted">
              {email ? `Signed in as ${email}. ` : ''}User Workspace is empty until evidence is uploaded or a project is created.
            </p>
          </div>
          <Card className="rounded-lg border-dashed bg-white p-10 text-center">
            <Upload size={42} className="mx-auto text-text-dim" />
            <h2 className="mt-4 text-lg font-bold text-text-main">No active user project</h2>
            <p className="mt-2 text-sm text-text-muted">Upload evidence to start</p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Link
                to="/analysis?source=user_uploaded"
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
                to="/workspace?project=cu-fe2o4-spinel&mode=demo"
                onClick={() => setWorkspaceMode('demo')}
                className="inline-flex h-9 items-center justify-center rounded-md border border-primary bg-primary/10 px-3 text-xs font-bold text-primary hover:bg-primary/20"
              >
                Use demo project
              </Link>
            </div>
            <p className="mt-5 text-xs font-semibold text-amber-700">External writes disabled</p>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}

function DemoProjectPrompt({ projectId }: { projectId: string }) {
  return (
    <DashboardLayout>
      <div className="flex-1 overflow-y-auto bg-slate-50">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4">
          <Card className="rounded-lg bg-white p-6">
            <h1 className="text-xl font-bold text-text-main">Demo project requires Demo Mode</h1>
            <p className="mt-2 text-sm text-text-muted">
              This route points to a preloaded demo project. User Workspace will not auto-load demo data after Google sign-in.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link
                to={`/workspace?project=${projectId}&mode=demo`}
                onClick={() => setWorkspaceMode('demo')}
                className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-xs font-bold text-white hover:bg-primary/90"
              >
                Open in Demo Mode
              </Link>
              <Link
                to="/workspace"
                className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-white px-3 text-xs font-bold text-text-main hover:bg-slate-50"
              >
                Return to User Workspace
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}

function UploadedWorkspaceState({ routeContext, email }: { routeContext: EvidenceRouteContext; email?: string }) {
  const snapshot = getProjectEvidenceSnapshot(null, {
    source: routeContext.source,
    analysisSessionId: routeContext.sessionId,
    uploadedRunId: routeContext.uploadedRunId,
    driveFileId: routeContext.driveFileId,
    projectIdExplicit: false,
  });
  const evidenceQuery = buildEvidenceRouteSearch(routeContext);
  const technique = snapshot.primaryTechnique.toLowerCase() as TechniqueId;
  const techniqueQuery = `mode=quick${evidenceQuery ? `&${evidenceQuery}` : ''}`;
  const workspacePath = `/workspace/${technique}?${techniqueQuery}`;
  const suffix = evidenceQuery ? `?${evidenceQuery}` : '';
  const activeDataset = snapshot.activeDataset;

  return (
    <DashboardLayout>
      <div className="flex-1 overflow-y-auto bg-slate-50">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-text-main">Workspace</h1>
            <p className="mt-1 text-sm text-text-muted">
              {email ? `Signed in as ${email}. ` : ''}User-uploaded evidence is active in the User Workspace.
            </p>
          </div>

          <Card className="rounded-lg bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <span className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-700">
                  User-uploaded evidence
                </span>
                <h2 className="mt-3 text-lg font-bold text-text-main">{activeDataset?.fileName ?? snapshot.sampleIdentity}</h2>
                <p className="mt-1 text-sm text-text-muted">
                  {snapshot.primaryTechnique} / {snapshot.sourceLabel ?? 'User-uploaded evidence'} / External writes disabled
                </p>
              </div>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                {snapshot.availableTechniques.join(', ') || 'Metadata only'}
              </span>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-md border border-border bg-slate-50 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Active dataset</p>
                <p className="mt-1 truncate text-sm font-bold text-text-main">{activeDataset?.fileName ?? 'Uploaded evidence'}</p>
              </div>
              <div className="rounded-md border border-border bg-slate-50 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Session</p>
                <p className="mt-1 truncate text-sm font-bold text-text-main">{routeContext.sessionId ?? routeContext.uploadedRunId ?? 'Local upload'}</p>
              </div>
              <div className="rounded-md border border-border bg-slate-50 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Validation</p>
                <p className="mt-1 text-sm font-bold text-text-main">{snapshot.validationGaps.length} open boundary note{snapshot.validationGaps.length === 1 ? '' : 's'}</p>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <Link to={workspacePath} className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-xs font-bold text-white hover:bg-primary/90">
                Open technique workspace
              </Link>
              <Link to={`/demo/agent${suffix}`} className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-white px-3 text-xs font-bold text-text-main hover:bg-slate-50">
                Send to Agent
              </Link>
              <Link to={`/notebook${suffix}`} className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-white px-3 text-xs font-bold text-text-main hover:bg-slate-50">
                Send to Notebook
              </Link>
              <Link to={`/reports${suffix}`} className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-white px-3 text-xs font-bold text-text-main hover:bg-slate-50">
                Create Report
              </Link>
              <Link to={`/workspace/multi${suffix}`} className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-white px-3 text-xs font-bold text-text-main hover:bg-slate-50">
                Open Multi-Tech
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}

function HubCard({
  icon: Icon,
  title,
  purpose,
  children,
  cta,
}: {
  icon: React.ElementType;
  title: string;
  purpose: string;
  children?: React.ReactNode;
  cta?: React.ReactNode;
}) {
  return (
    <Card className="flex min-h-[220px] flex-col rounded-lg bg-white p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon size={18} />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-text-main">{title}</h2>
          <p className="mt-1 text-xs leading-relaxed text-text-muted">{purpose}</p>
        </div>
      </div>
      <div className="mt-4 flex-1">{children}</div>
      {cta && <div className="mt-4">{cta}</div>}
    </Card>
  );
}

export default function WorkspaceLauncher() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const requestedProjectId = searchParams.get('project');
  const routeContext = getEvidenceRouteContext({
    authUser: user,
    searchParams,
    storedMode: getStoredWorkspaceMode(),
  });
  const effectiveWorkspaceMode = routeContext.effectiveWorkspaceMode;
  const isUserWorkspace = effectiveWorkspaceMode === 'user';
  const knownDemoProjectRequested = Boolean(requestedProjectId) && isKnownProjectId(requestedProjectId);

  if (routeContext.isUploadedContext) {
    return <UploadedWorkspaceState routeContext={routeContext} email={user?.email} />;
  }

  if (isUserWorkspace && knownDemoProjectRequested) {
    return <DemoProjectPrompt projectId={requestedProjectId!} />;
  }

  if (isUserWorkspace) {
    return <WorkspaceEmptyState email={user?.email} />;
  }

  const projectId = normalizeRegistryProjectId(requestedProjectId);
  const project = getRegistryProject(projectId);
  const invalidProjectRequested = Boolean(requestedProjectId) && !isKnownProjectId(requestedProjectId);
  const availableTechniques = projectTechniqueIds(project);
  const missingTechniques = TECHNIQUE_ORDER.filter((technique) => !availableTechniques.includes(technique));
  const nextAction = project.crossTechniqueComparison.recommendedNextAction || project.notebook.decision;

  const updateProject = (nextProjectId: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('project', nextProjectId);
    setSearchParams(next, { replace: false });
  };

  return (
    <DashboardLayout>
      <div className="flex-1 overflow-y-auto bg-slate-50">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 p-4">
          {invalidProjectRequested && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
              <span className="font-semibold">Project not found.</span> Showing {formatChemicalFormula(project.title)} demo workspace.
            </div>
          )}

          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-text-main">Workspace</h1>
              <p className="mt-1 text-sm text-text-muted">
                Continue project-linked analysis, review technique evidence, or open multi-tech reasoning.
              </p>
            </div>
            <label className="min-w-[260px] text-xs">
              <span className="mb-1 block font-bold uppercase tracking-wider text-text-muted">Active project</span>
              <select
                value={project.id}
                onChange={(event) => updateProject(event.target.value)}
                className="h-10 w-full rounded-md border border-border bg-white px-3 text-sm font-semibold text-text-main shadow-sm outline-none focus:border-primary"
              >
                {demoProjectRegistry.map((item) => (
                  <option key={item.id} value={item.id}>{item.title}</option>
                ))}
              </select>
            </label>
          </div>

          <Card className="rounded-lg bg-white px-3 py-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {workflowSteps.map((step, index) => {
                const path = step.to
                  ? `${step.to}?project=${project.id}&mode=demo`
                  : `/project/${project.id}`;
                return (
                  <React.Fragment key={step.label}>
                    <Link
                      to={path}
                      className="rounded-full border border-border bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
                    >
                      {step.label}
                    </Link>
                    {index < workflowSteps.length - 1 && (
                      <span className="text-[10px] font-semibold text-primary">-&gt;</span>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </Card>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_330px]">
            <div className="grid gap-3 lg:grid-cols-3">
              <HubCard
                icon={Upload}
                title="Quick Analysis"
                purpose="Fast file drop or quick technique-specific check without full project setup."
                cta={
                  <Link
                    to="/analysis?source=user_uploaded"
                    className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-primary px-3 text-xs font-bold text-white hover:bg-primary/90"
                  >
                    Open Quick Analysis <ArrowRight size={13} />
                  </Link>
                }
              >
                <div className="rounded-md border border-dashed border-primary/30 bg-primary/5 p-3 text-xs text-text-muted">
                  Start outside a project, then save, attach, export, or send the result to Notebook or Agent.
                </div>
              </HubCard>

              <HubCard
                icon={FlaskConical}
                title="Technique Workspace"
                purpose="Deep analysis of one selected technique in the current project."
              >
                <div className="grid grid-cols-2 gap-2">
                  {TECHNIQUE_ORDER.map((technique) => {
                    const available = availableTechniques.includes(technique);
                    return (
                      <Link
                        key={technique}
                        to={techniqueRoute(technique, project.id)}
                        className={`rounded-md border px-2 py-2 text-xs transition-colors ${
                          available
                            ? 'border-primary/25 bg-primary/5 text-primary hover:bg-primary/10'
                            : 'border-border bg-slate-50 text-slate-500 hover:bg-slate-100'
                        }`}
                      >
                        <span className="block font-bold">{techniqueLabel(technique)}</span>
                        <span className="mt-1 block text-[10px] leading-snug">
                          {available ? 'Available' : 'Pending / required'}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </HubCard>

              <HubCard
                icon={Layers3}
                title="Multi-Tech Workspace"
                purpose="Cross-technique comparison and inference across available techniques."
                cta={
                  <Link
                    to={`/workspace/multi?project=${project.id}&mode=demo`}
                    className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-primary bg-primary/10 px-3 text-xs font-bold text-primary hover:bg-primary/20"
                  >
                    Open Multi-Tech Comparison <ArrowRight size={13} />
                  </Link>
                }
              >
                <div className="space-y-2 text-xs">
                  <div className="rounded-md border border-border bg-slate-50 px-2 py-2">
                    <span className="font-bold text-text-main">{availableTechniques.length}</span>
                    <span className="ml-1 text-text-muted">available techniques for comparison</span>
                  </div>
                  <p className="leading-relaxed text-text-muted">{project.crossTechniqueComparison.agreementSummary}</p>
                </div>
              </HubCard>
            </div>

            <Card className="rounded-lg bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className={`rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${jobTypeBadgeClass(project.jobType)}`}>
                    {jobTypeLabel(project.jobType)}
                  </span>
                  <h2 className="mt-2 text-base font-bold text-text-main">{formatChemicalFormula(project.title)}</h2>
                  <p className="mt-1 text-xs leading-relaxed text-text-muted">{project.materialSystem}</p>
                </div>
                <span className={`text-xs font-bold ${claimStatusColorClass(project.claimStatus)}`}>
                  {claimStatusLabel(project.claimStatus)}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-md border border-border bg-slate-50 p-2">
                  <p className="font-semibold text-text-muted">Report readiness</p>
                  <p className="mt-1 text-lg font-bold text-text-main">{project.reportReadiness}%</p>
                </div>
                <div className="rounded-md border border-border bg-slate-50 p-2">
                  <p className="font-semibold text-text-muted">Validation gaps</p>
                  <p className="mt-1 text-lg font-bold text-text-main">{project.validationGapCount}</p>
                </div>
              </div>

              <div className="mt-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Available techniques</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {availableTechniques.map((technique) => (
                    <span key={technique} className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-[10px] font-bold uppercase text-primary">
                      <CheckCircle2 size={10} /> {techniqueLabel(technique)}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Missing required evidence</p>
                <p className="mt-1 text-xs leading-relaxed text-text-main">
                  {missingTechniques.length > 0
                    ? missingTechniques.map(techniqueLabel).join(', ')
                    : 'No required technique gap is visible in the selected demo scope.'}
                </p>
              </div>

              <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Next recommended action</p>
                <p className="mt-1 text-xs leading-relaxed text-amber-950">{nextAction}</p>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <Link
                  to={`/demo/agent?project=${project.id}&mode=demo`}
                  className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-border bg-white px-2 text-[11px] font-bold text-text-main hover:bg-slate-50"
                >
                  <Bot size={12} /> Agent
                </Link>
                <Link
                  to={`/notebook?project=${project.id}&mode=demo`}
                  className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-border bg-white px-2 text-[11px] font-bold text-text-main hover:bg-slate-50"
                >
                  <NotebookTabs size={12} /> Notebook
                </Link>
                <Link
                  to={`/reports?project=${project.id}&mode=demo`}
                  className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-border bg-white px-2 text-[11px] font-bold text-text-main hover:bg-slate-50"
                >
                  <FileText size={12} /> Report
                </Link>
                <Link
                  to={`/project/${project.id}`}
                  className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-border bg-white px-2 text-[11px] font-bold text-text-main hover:bg-slate-50"
                >
                  Project <ArrowRight size={12} />
                </Link>
              </div>
            </Card>
          </div>

          <p className="text-[11px] text-text-muted">
            Dashboard answers what is happening across workflows. Workspace answers what to work on now for the selected project.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}
