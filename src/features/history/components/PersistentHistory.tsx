import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, BookOpen, Database, History, RefreshCw } from 'lucide-react';
import { DashboardLayout } from '../../../shared/layout/DashboardLayout';
import { Card } from '../../../shared/ui/Card';
import { useOrganization } from '../../../contexts/OrganizationContext';
import {
  listPersistentHistory,
  PersistentApiError,
  type PersistentReasoningRun,
} from '../../../services/api/persistentXrd';

export function PersistentHistory() {
  const { activeOrganizationId, status: organizationStatus } = useOrganization();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project') ?? undefined;
  const datasetId = searchParams.get('dataset') ?? undefined;
  const [runs, setRuns] = React.useState<PersistentReasoningRun[]>([]);
  const [status, setStatus] = React.useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [error, setError] = React.useState<PersistentApiError | null>(null);
  const [generation, setGeneration] = React.useState(0);

  React.useEffect(() => {
    if (!activeOrganizationId) {
      setRuns([]);
      setStatus('idle');
      return;
    }
    const controller = new AbortController();
    setStatus('loading');
    setError(null);
    void listPersistentHistory(
      activeOrganizationId,
      { projectId, datasetId },
      controller.signal,
    ).then((items) => {
      setRuns(items);
      setStatus('ready');
    }).catch((caught) => {
      if (caught instanceof Error && caught.name === 'AbortError') return;
      setError(toPersistentError(caught));
      setStatus('error');
    });
    return () => controller.abort();
  }, [activeOrganizationId, datasetId, generation, projectId]);

  return (
    <DashboardLayout>
      <div className="h-full overflow-y-auto bg-slate-50 p-6">
        <div className="mx-auto max-w-6xl space-y-4">
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                Server-authoritative provenance
              </p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight">Persistent XRD History</h1>
              <p className="mt-1 text-sm text-text-muted">
                Reasoning runs remain linked to the exact immutable evidence checksum used at execution.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setGeneration((value) => value + 1)}
                disabled={!activeOrganizationId || status === 'loading'}
                className="inline-flex h-9 items-center gap-1 rounded-md border border-border bg-white px-3 text-xs font-semibold disabled:opacity-50"
              >
                <RefreshCw size={13} /> Refresh
              </button>
              <Link
                to="/notebook"
                className="inline-flex h-9 items-center gap-1 rounded-md bg-primary px-3 text-xs font-bold text-white"
              >
                <BookOpen size={13} /> Notebook
              </Link>
            </div>
          </header>

          {!activeOrganizationId && (
            <Card className="p-5 text-sm text-text-muted">
              {organizationStatus === 'loading'
                ? 'Loading authorized organizations...'
                : 'Select an authorized organization in the Workspace Hub to view persistent history.'}
            </Card>
          )}

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-900">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 shrink-0" size={16} />
                <div>
                  <p className="font-bold">{error.errorCode.replace(/_/g, ' ')}</p>
                  <p className="mt-1">{error.message}</p>
                  {error.requestId && <p className="mt-1 font-mono">Request {error.requestId}</p>}
                </div>
              </div>
            </div>
          )}

          {activeOrganizationId && status === 'loading' && (
            <Card className="p-5 text-sm text-text-muted">Loading persistent reasoning history...</Card>
          )}

          {activeOrganizationId && status === 'ready' && runs.length === 0 && (
            <Card className="p-8 text-center">
              <History className="mx-auto text-text-muted" size={30} />
              <h2 className="mt-3 text-sm font-bold">No persistent reasoning runs</h2>
              <p className="mt-1 text-xs text-text-muted">
                Process an XRD dataset and run evidence-first reasoning to create an auditable record.
              </p>
            </Card>
          )}

          <div className="space-y-3">
            {runs.map((run) => (
              <Card key={run.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-sm font-bold">{run.datasetTitle ?? 'Persistent XRD dataset'}</h2>
                      <span className="rounded-full border border-border bg-slate-50 px-2 py-0.5 text-[10px] font-bold">
                        {run.status}
                      </span>
                      {run.fallbackUsed && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                          deterministic provider-error fallback
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-text-muted">
                      {run.projectTitle ?? 'Authorized project'} / {run.provider}
                    </p>
                    <p className="mt-1 font-mono text-[10px] text-text-muted">
                      Evidence {run.evidenceSnapshotId} / {run.evidenceContentSha256.slice(0, 16)}...
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Link
                      to={`/workspace/xrd?project=${encodeURIComponent(run.projectId)}&dataset=${encodeURIComponent(run.datasetId)}`}
                      className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-3 text-xs font-semibold"
                    >
                      <Database size={12} /> Evidence
                    </Link>
                    <Link
                      to="/notebook"
                      className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-3 text-xs font-semibold"
                    >
                      <BookOpen size={12} /> Notebook
                    </Link>
                  </div>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-4">
                  <Metric label="Mode" value={run.executionMode} />
                  <Metric label="Quota" value={run.quotaClassification} />
                  <Metric label="Prompt" value={run.promptVersion} />
                  <Metric label="Completed" value={formatDate(run.completedAt ?? run.createdAt)} />
                </div>
                {run.status === 'failed' && (
                  <p className="mt-3 rounded-md border border-red-100 bg-red-50 p-2 text-xs text-red-800">
                    {run.failureCode ?? 'REASONING_FAILED'}: {run.failureMessage ?? 'No details available.'}
                  </p>
                )}
              </Card>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-slate-50 p-2">
      <p className="text-[9px] font-bold uppercase tracking-wider text-text-muted">{label}</p>
      <p className="mt-1 truncate text-xs font-semibold">{value}</p>
    </div>
  );
}

function formatDate(value: string): string {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? value : new Date(timestamp).toLocaleString();
}

function toPersistentError(value: unknown): PersistentApiError {
  return value instanceof PersistentApiError
    ? value
    : new PersistentApiError(
        500,
        'PERSISTENCE_ERROR',
        value instanceof Error ? value.message : 'Persistent History could not be loaded.',
      );
}
