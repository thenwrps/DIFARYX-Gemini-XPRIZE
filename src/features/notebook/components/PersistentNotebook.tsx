import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, BookOpen, Database, History, RefreshCw } from 'lucide-react';
import { DashboardLayout } from '../../../shared/layout/DashboardLayout';
import { Card } from '../../../shared/ui/Card';
import { useOrganization } from '../../../contexts/OrganizationContext';
import {
  listPersistentNotebookReferences,
  PersistentApiError,
  type PersistentNotebookReference,
} from '../../../services/api/persistentXrd';

export function PersistentNotebook() {
  const { activeOrganizationId, status: organizationStatus } = useOrganization();
  const [references, setReferences] = React.useState<PersistentNotebookReference[]>([]);
  const [status, setStatus] = React.useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [error, setError] = React.useState<PersistentApiError | null>(null);
  const [generation, setGeneration] = React.useState(0);

  React.useEffect(() => {
    if (!activeOrganizationId) {
      setReferences([]);
      setStatus('idle');
      return;
    }
    const controller = new AbortController();
    setStatus('loading');
    setError(null);
    void listPersistentNotebookReferences(activeOrganizationId, controller.signal)
      .then((items) => {
        setReferences(items);
        setStatus('ready');
      })
      .catch((caught) => {
        if (caught instanceof Error && caught.name === 'AbortError') return;
        setError(toPersistentError(caught));
        setStatus('error');
      });
    return () => controller.abort();
  }, [activeOrganizationId, generation]);

  return (
    <DashboardLayout>
      <div className="h-full overflow-y-auto bg-slate-50 p-6">
        <div className="mx-auto max-w-6xl space-y-4">
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                Reproducible scientific memory
              </p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight">Persistent XRD Notebook</h1>
              <p className="mt-1 text-sm text-text-muted">
                Notebook entries reference persisted reasoning and immutable evidence; they do not duplicate mutable browser state.
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
                to="/history"
                className="inline-flex h-9 items-center gap-1 rounded-md bg-primary px-3 text-xs font-bold text-white"
              >
                <History size={13} /> History
              </Link>
            </div>
          </header>

          {!activeOrganizationId && (
            <Card className="p-5 text-sm text-text-muted">
              {organizationStatus === 'loading'
                ? 'Loading authorized organizations...'
                : 'Select an authorized organization in the Workspace Hub to view persistent notebook references.'}
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
            <Card className="p-5 text-sm text-text-muted">Loading persistent notebook references...</Card>
          )}

          {activeOrganizationId && status === 'ready' && references.length === 0 && (
            <Card className="p-8 text-center">
              <BookOpen className="mx-auto text-text-muted" size={30} />
              <h2 className="mt-3 text-sm font-bold">No persistent notebook references</h2>
              <p className="mt-1 text-xs text-text-muted">
                From an XRD reasoning result, choose Reference in Notebook.
              </p>
            </Card>
          )}

          <div className="grid gap-3 lg:grid-cols-2">
            {references.map((reference) => (
              <Card key={reference.id} className="p-4">
                <div className="flex items-start gap-3">
                  <BookOpen className="mt-0.5 shrink-0 text-primary" size={20} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-sm font-bold">{reference.label}</h2>
                      <span className="rounded-full border border-border bg-slate-50 px-2 py-0.5 text-[10px] font-bold">
                        {reference.reasoningStatus}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-text-muted">
                      {reference.projectTitle} / {reference.datasetTitle}
                    </p>
                    <dl className="mt-3 space-y-1 rounded-md border border-border bg-slate-50 p-3 text-[11px]">
                      <ReferenceRow label="Provider" value={reference.provider} />
                      <ReferenceRow label="Reasoning" value={reference.reasoningRunId} />
                      <ReferenceRow label="Evidence" value={reference.evidenceSnapshotId} />
                      <ReferenceRow label="Referenced" value={formatDate(reference.createdAt)} />
                    </dl>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link
                        to={`/workspace/xrd?project=${encodeURIComponent(reference.projectId)}&dataset=${encodeURIComponent(reference.datasetId)}`}
                        className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-white px-3 text-xs font-semibold"
                      >
                        <Database size={12} /> Open evidence
                      </Link>
                      <Link
                        to={`/history?project=${encodeURIComponent(reference.projectId)}&dataset=${encodeURIComponent(reference.datasetId)}`}
                        className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-white px-3 text-xs font-semibold"
                      >
                        <History size={12} /> Open history
                      </Link>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

function ReferenceRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[70px_minmax(0,1fr)] gap-2">
      <dt className="font-bold text-text-muted">{label}</dt>
      <dd className="truncate font-mono text-text-main">{value}</dd>
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
        value instanceof Error ? value.message : 'Persistent Notebook could not be loaded.',
      );
}
