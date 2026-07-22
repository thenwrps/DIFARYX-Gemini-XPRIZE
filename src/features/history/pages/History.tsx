import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, BookOpen, Bot, ClipboardList, FileText, FolderOpen, History, Target, Trash2 } from 'lucide-react';
import { DashboardLayout } from '../../../shared/layout/DashboardLayout';
import { Card } from '../../../shared/ui/Card';
import { EmptyStateCard } from '../../../shared/ui/EmptyStateCard';
import { ApprovalLedgerPanel } from '../../runtime/components/ApprovalLedgerPanel';
import { useAuth } from '../../../contexts/AuthContext';
import { formatChemicalFormula } from '../../../utils';
import {
  claimStatusColorClass,
  claimStatusLabel,
  demoProjectRegistry,
  getAllExperimentHistoryEvents,
  normalizeRegistryProjectId,
  type DemoExperimentHistoryEvent,
  type ExperimentEventType,
  type TechniqueId,
} from '../../../data/demoProjectRegistry';
import {
  getEffectiveWorkspaceMode,
  getStoredWorkspaceMode,
  setWorkspaceMode,
} from '../../../utils/workspaceMode';
import { getApprovalLedgerEntries, type ApprovalLedgerEntry } from '../../../runtime/approvalLedger';
import { deleteAnalysisSession, getAnalysisSessions, getStatusLabel, type AnalysisSession } from '../../../data/analysisSessions';
import { deleteUploadedSignalRun } from '../../../data/uploadedSignalRuns';
import { runWhenIdle } from '../../../utils/idle';

const EVENT_TYPES: ExperimentEventType[] = [
  'dataset_loaded',
  'parameter_checked',
  'evidence_processed',
  'validation_gap_identified',
  'notebook_entry_created',
  'report_draft_updated',
  'agent_run',
  'cross_tech_review',
];

const TECHNIQUES: TechniqueId[] = ['xrd', 'xps', 'ftir', 'raman', 'multi'];
const USER_HISTORY_SOURCE_MODES: ApprovalLedgerEntry['sourceMode'][] = ['user_uploaded', 'google_drive_connected', 'mixed'];

function techniqueLabel(id: TechniqueId) {
  if (id === 'xrd') return 'XRD';
  if (id === 'xps') return 'XPS';
  if (id === 'ftir') return 'FTIR';
  if (id === 'raman') return 'Raman';
  return 'Multi-tech';
}

function eventLabel(type: string) {
  return type.replace(/_/g, ' ');
}

function uploadedSessionQuery(session: AnalysisSession) {
  const params = new URLSearchParams();
  params.set('source', 'user_uploaded');
  params.set('sessionId', session.analysisId);
  if (session.uploadedRunId) params.set('upload', session.uploadedRunId);
  return params.toString();
}

function uploadedTechniqueWorkspacePath(session: AnalysisSession) {
  const query = uploadedSessionQuery(session);
  return `/workspace/${session.technique}?mode=quick&${query}`;
}

export default function HistoryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const effectiveWorkspaceMode = getEffectiveWorkspaceMode({
    authUser: user,
    searchParams,
    storedMode: getStoredWorkspaceMode(),
  });
  const showUserHistory = effectiveWorkspaceMode === 'user';
  const projectFilter = normalizeRegistryProjectId(searchParams.get('project')) || '';
  const techniqueFilter = (searchParams.get('technique') || '') as TechniqueId | '';
  const eventTypeFilter = (searchParams.get('eventType') || '') as ExperimentEventType | '';

  const events = React.useMemo<DemoExperimentHistoryEvent[]>(() => {
    if (showUserHistory) return [];
    let next = getAllExperimentHistoryEvents();
    if (projectFilter) next = next.filter((event) => event.projectId === projectFilter);
    if (techniqueFilter) next = next.filter((event) => event.techniqueId === techniqueFilter);
    if (eventTypeFilter) next = next.filter((event) => event.eventType === eventTypeFilter);
    return next;
  }, [projectFilter, techniqueFilter, eventTypeFilter, showUserHistory]);

  const [userLedgerEntryCount, setUserLedgerEntryCount] = React.useState(0);
  const [userUploadedSessions, setUserUploadedSessions] = React.useState<AnalysisSession[]>([]);

  React.useEffect(() => {
    if (!showUserHistory) return;

    return runWhenIdle(() => {
      setUserLedgerEntryCount(
        getApprovalLedgerEntries().filter((entry) => USER_HISTORY_SOURCE_MODES.includes(entry.sourceMode)).length,
      );
      setUserUploadedSessions(
        getAnalysisSessions()
          .filter((session) => session.source === 'user_uploaded')
          .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)),
      );
    });
  }, [showUserHistory]);

  const handleDeleteUserUploadedSession = (session: AnalysisSession) => {
    const confirmed = window.confirm(`Delete ${session.fileName} from local uploaded evidence history?`);
    if (!confirmed) return;

    deleteAnalysisSession(session.analysisId);
    if (session.uploadedRunId) deleteUploadedSignalRun(session.uploadedRunId);
    setUserUploadedSessions((current) => current.filter((item) => item.analysisId !== session.analysisId));
  };

  const updateFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: false });
  };

  const selectedProject = projectFilter
    && !showUserHistory
    ? demoProjectRegistry.find((project) => project.id === projectFilter)
    : null;

  const switchToDemoHistory = () => {
    setWorkspaceMode('demo');
    const next = new URLSearchParams(searchParams);
    next.set('mode', 'demo');
    setSearchParams(next, { replace: false });
  };

  return (
    <DashboardLayout>
      <div className="h-full overflow-y-auto p-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">DIFARYX records</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">Experiment History</h1>
            <p className="mt-1 text-sm text-text-muted">
              {showUserHistory
                ? 'User Workspace history shows uploaded and connected evidence activity only.'
                : 'Registry-backed event history for datasets, parameters, evidence processing, validation gaps, notebook memory, and report drafts.'}
            </p>
            {user?.provider === 'google' && user.email && (
              <p className="mt-1 text-xs text-text-muted">Signed in as <span className="font-semibold text-text-main">{user.email}</span></p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              {showUserHistory ? userUploadedSessions.length + userLedgerEntryCount : events.length} visible events
            </span>
            <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold text-text-muted">
              {showUserHistory ? 'User Workspace' : `${demoProjectRegistry.length} projects`}
            </span>
            {showUserHistory && (
              <button
                type="button"
                onClick={switchToDemoHistory}
                className="rounded-full border border-primary bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primary/90"
              >
                Show demo history
              </button>
            )}
          </div>
        </div>

        {!showUserHistory && (
        <Card className="mb-5 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">Filters</span>
            <select
              aria-label="Project"
              value={projectFilter}
              onChange={(event) => updateFilter('project', event.target.value)}
              className="h-9 rounded-md border border-border bg-background px-3 text-xs font-semibold text-text-main"
            >
              <option value="">Project: All</option>
              {demoProjectRegistry.map((project) => (
                <option key={project.id} value={project.id}>{project.title}</option>
              ))}
            </select>
            <select
              aria-label="Technique"
              value={techniqueFilter}
              onChange={(event) => updateFilter('technique', event.target.value)}
              className="h-9 rounded-md border border-border bg-background px-3 text-xs font-semibold text-text-main"
            >
              <option value="">Technique: All</option>
              {TECHNIQUES.map((technique) => (
                <option key={technique} value={technique}>{techniqueLabel(technique)}</option>
              ))}
            </select>
            <select
              aria-label="Event type"
              value={eventTypeFilter}
              onChange={(event) => updateFilter('eventType', event.target.value)}
              className="h-9 rounded-md border border-border bg-background px-3 text-xs font-semibold text-text-main"
            >
              <option value="">Event: All</option>
              {EVENT_TYPES.map((type) => (
                <option key={type} value={type}>{eventLabel(type)}</option>
              ))}
            </select>
            {(projectFilter || techniqueFilter || eventTypeFilter) && (
              <button
                type="button"
                onClick={() => setSearchParams(new URLSearchParams(), { replace: false })}
                className="h-9 rounded-md border border-border bg-background px-3 text-xs font-semibold text-text-muted hover:bg-surface-hover"
              >
                Clear filters
              </button>
            )}
          </div>
        </Card>
        )}

        {selectedProject && (
          <Card className="mb-5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">Selected project</p>
                <h2 className="mt-1 text-lg font-bold text-text-main">{formatChemicalFormula(selectedProject.title)}</h2>
                <p className="mt-1 text-sm text-text-muted">{selectedProject.evidenceSummary}</p>
              </div>
              <div className="text-right text-xs">
                <p className={`font-bold ${claimStatusColorClass(selectedProject.claimStatus)}`}>
                  {claimStatusLabel(selectedProject.claimStatus)}
                </p>
                <p className="mt-1 text-text-muted">Readiness {selectedProject.reportReadiness}%</p>
              </div>
            </div>
          </Card>
        )}

        {showUserHistory && userLedgerEntryCount === 0 && userUploadedSessions.length === 0 && (
          <EmptyStateCard
            type="generic"
            title="No user history yet"
            description="Upload evidence or connect a read-only evidence preview to create user_uploaded or google_connected activity."
            actionText="Switch to Demo Mode"
            onAction={switchToDemoHistory}
            className="mb-5 bg-white"
          />
        )}

        {showUserHistory && userUploadedSessions.length > 0 && (
          <Card className="mb-5 overflow-x-auto rounded-lg bg-white">
            <div className="grid min-w-[880px] grid-cols-[minmax(240px,1fr)_96px_92px_410px] gap-3 border-b border-border bg-slate-50 px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-text-muted">
              <span>Uploaded evidence</span>
              <span>Technique</span>
              <span>Status</span>
              <span>Actions</span>
            </div>
            {userUploadedSessions.map((session) => {
              const query = uploadedSessionQuery(session);
              return (
                <div key={session.analysisId} className="grid min-w-[880px] grid-cols-[minmax(240px,1fr)_96px_92px_410px] items-center gap-3 border-b border-border px-4 py-3 text-sm last:border-b-0">
                  <div className="min-w-0">
                    <p className="truncate font-bold text-text-main">{session.fileName}</p>
                    <p className="mt-1 truncate text-xs text-text-muted">{session.analysisId} / source=user_uploaded</p>
                  </div>
                  <span className="w-fit rounded bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase text-primary">
                    {session.technique.toUpperCase()}
                  </span>
                  <span className="text-xs font-semibold text-text-muted">{getStatusLabel(session.status)}</span>
                  <div className="flex flex-nowrap gap-1.5 whitespace-nowrap">
                    <Link
                      to={uploadedTechniqueWorkspacePath(session)}
                      className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[10px] font-semibold text-text-main hover:bg-surface-hover"
                    >
                      <FolderOpen size={12} /> Workspace
                    </Link>
                    <Link
                      to={`/demo/agent?${query}`}
                      className="inline-flex h-7 items-center gap-1 rounded-md border border-primary bg-primary/10 px-2 text-[10px] font-semibold text-primary hover:bg-primary/20"
                    >
                      <Bot size={12} /> Agent
                    </Link>
                    <Link
                      to={`/notebook?${query}`}
                      className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[10px] font-semibold text-text-main hover:bg-surface-hover"
                    >
                      <BookOpen size={12} /> Notebook
                    </Link>
                    <Link
                      to={`/reports?${query}`}
                      className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[10px] font-semibold text-text-main hover:bg-surface-hover"
                    >
                      <FileText size={12} /> Report
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleDeleteUserUploadedSession(session)}
                      className="inline-flex h-7 items-center gap-1 rounded-md border border-red-200 px-2 text-[10px] font-semibold text-red-700 hover:bg-red-50"
                    >
                      <Trash2 size={12} /> Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </Card>
        )}

        <div className="mb-5">
          <ApprovalLedgerPanel
            projectId={!showUserHistory ? projectFilter || undefined : undefined}
            sourceModes={showUserHistory ? USER_HISTORY_SOURCE_MODES : undefined}
            description={showUserHistory ? 'User Workspace preview trail for uploaded or read-only connected evidence. Demo-preloaded entries are hidden by default.' : undefined}
            limit={6}
          />
        </div>

        {!showUserHistory && (
        <Card className="overflow-hidden">
          <div className="grid grid-cols-[1.3fr_1fr_0.7fr_0.8fr_0.8fr_1fr_0.9fr] gap-3 border-b border-border bg-surface-hover/40 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
            <div>Event</div>
            <div>Project</div>
            <div>Technique</div>
            <div>Type</div>
            <div>Time</div>
            <div>Boundary impact</div>
            <div>Links</div>
          </div>
          {events.map((event) => (
            <div
              key={event.id}
              className="grid grid-cols-[1.3fr_1fr_0.7fr_0.8fr_0.8fr_1fr_0.9fr] gap-3 border-b border-border px-5 py-3 text-sm last:border-b-0"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 font-semibold text-text-main">
                  <ClipboardList size={14} className="shrink-0 text-primary" />
                  <span className="truncate">{event.title}</span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-text-muted">{event.summary}</p>
              </div>
              <div className="min-w-0 text-text-main">{formatChemicalFormula(event.projectTitle)}</div>
              <div>
                <span className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-primary">
                  {techniqueLabel(event.techniqueId)}
                </span>
              </div>
              <div>
                <span className="rounded border border-border bg-background px-2 py-0.5 text-[10px] font-semibold text-text-muted">
                  {eventLabel(event.eventType)}
                </span>
              </div>
              <div className="text-xs text-text-muted">{event.timestampLabel}</div>
              <div className="text-xs leading-relaxed text-text-muted">{event.boundaryImpact}</div>
              <div className="flex flex-wrap gap-1">
                <Link
                  to={`/workspace/analysis?project=${event.projectId}&mode=demo`}
                  className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[10px] font-semibold text-text-main hover:bg-surface-hover"
                >
                  <FolderOpen size={12} /> Workspace
                </Link>
                <Link
                  to={`/demo/agent?project=${event.projectId}&mode=demo`}
                  className="inline-flex h-7 items-center gap-1 rounded-md border border-primary bg-primary/10 px-2 text-[10px] font-semibold text-primary hover:bg-primary/20"
                >
                  <Bot size={12} /> Agent
                </Link>
              </div>
            </div>
          ))}
          {events.length === 0 && (
            <div className="p-6 border-t border-border bg-white">
              <EmptyStateCard
                type="generic"
                title="No events match filter"
                description="No experiment history events match the current project, technique, or event type filters."
              />
            </div>
          )}
        </Card>
        )}

        {!showUserHistory && (
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {demoProjectRegistry.map((project) => (
            <Link key={project.id} to={`/history?project=${project.id}&mode=demo`}>
              <Card className="p-3 transition-colors hover:border-primary/40">
                <div className="flex items-center gap-2">
                  <Target size={14} className="text-primary" />
                  <h3 className="text-sm font-bold text-text-main">{formatChemicalFormula(project.title)}</h3>
                </div>
                <p className="mt-2 text-xs text-text-muted">{project.experimentHistory.length} registry events</p>
                <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-primary">
                  Filter history <ArrowRight size={11} />
                </p>
              </Card>
            </Link>
          ))}
        </div>
        )}
      </div>
    </DashboardLayout>
  );
}
