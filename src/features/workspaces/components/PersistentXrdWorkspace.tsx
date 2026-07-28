import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  BookOpen,
  Bot,
  CheckCircle2,
  Database,
  FileUp,
  History,
  LoaderCircle,
  RefreshCw,
} from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { DashboardLayout } from '../../../shared/layout/DashboardLayout';
import { Card } from '../../../shared/ui/Card';
import { useOrganization } from '../../../contexts/OrganizationContext';
import {
  createPersistentNotebookReference,
  createPersistentUploadIntent,
  createPersistentXrdDataset,
  finalizePersistentUpload,
  getPersistentCanonicalEvidence,
  getPersistentReasoningRun,
  getPersistentXrdDataset,
  listPersistentHistory,
  listPersistentXrdDatasets,
  PersistentApiError,
  type PersistentCanonicalEvidence,
  type PersistentReasoningRun,
  type PersistentXrdDataset,
  runPersistentReasoning,
  sha256File,
  uploadPersistentFile,
} from '../../../services/api/persistentXrd';

const POLL_INTERVAL_MS = 2_000;
const MAX_POLL_ATTEMPTS = 60;
const TERMINAL_DATASET_STATES = new Set([
  'valid',
  'invalid',
  'quarantined',
  'failed',
  'cancelled',
  'expired',
]);

type WorkflowStage =
  | 'idle'
  | 'hashing'
  | 'uploading'
  | 'finalizing'
  | 'validating'
  | 'reasoning';

export function PersistentXrdWorkspace() {
  const { activeOrganizationId } = useOrganization();
  const [searchParams, setSearchParams] = useSearchParams();
  const projectId = searchParams.get('project');
  const selectedDatasetId = searchParams.get('dataset');
  const [datasets, setDatasets] = React.useState<PersistentXrdDataset[]>([]);
  const [dataset, setDataset] = React.useState<PersistentXrdDataset | null>(null);
  const [reasoningRun, setReasoningRun] = React.useState<PersistentReasoningRun | null>(null);
  const [canonicalEvidence, setCanonicalEvidence] = React.useState<PersistentCanonicalEvidence | null>(null);
  const [stage, setStage] = React.useState<WorkflowStage>('idle');
  const [progress, setProgress] = React.useState(0);
  const [error, setError] = React.useState<PersistentApiError | null>(null);
  const [newDatasetTitle, setNewDatasetTitle] = React.useState('Persistent XRD dataset');
  const [isCreatingDataset, setIsCreatingDataset] = React.useState(false);
  const [notebookSaved, setNotebookSaved] = React.useState(false);
  const pollGeneration = React.useRef(0);
  const uploadAttemptCount = React.useRef(0);

  const loadDatasets = React.useCallback(async (signal?: AbortSignal) => {
    if (!activeOrganizationId || !projectId) return;
    const rows = await listPersistentXrdDatasets(
      activeOrganizationId,
      projectId,
      signal,
    );
    setDatasets(rows);
    if (selectedDatasetId) {
      const selected = rows.find((item) => item.id === selectedDatasetId)
        ?? await getPersistentXrdDataset(activeOrganizationId, selectedDatasetId, signal);
      setDataset(selected);
    } else if (rows[0]) {
      setDataset(rows[0]);
      const next = new URLSearchParams(searchParams);
      next.set('dataset', rows[0].id);
      setSearchParams(next, { replace: true });
    }
  }, [
    activeOrganizationId,
    projectId,
    searchParams,
    selectedDatasetId,
    setSearchParams,
  ]);

  React.useEffect(() => {
    const controller = new AbortController();
    setError(null);
    void loadDatasets(controller.signal).catch((caught) => {
      if (caught instanceof Error && caught.name === 'AbortError') return;
      setError(toPersistentError(caught));
    });
    return () => controller.abort();
  }, [loadDatasets]);

  React.useEffect(() => {
    if (!activeOrganizationId || !dataset?.id) return;
    const controller = new AbortController();
    void listPersistentHistory(
      activeOrganizationId,
      { datasetId: dataset.id },
      controller.signal,
    ).then((runs) => {
      setReasoningRun(runs[0] ?? null);
    }).catch(() => {
      // Dataset state remains usable even if History is temporarily unavailable.
    });
    return () => controller.abort();
  }, [activeOrganizationId, dataset?.id]);

  React.useEffect(() => {
    const evidenceId = dataset?.evidence?.id;
    if (!activeOrganizationId || !evidenceId) {
      setCanonicalEvidence(null);
      return;
    }
    const controller = new AbortController();
    void getPersistentCanonicalEvidence(
      activeOrganizationId,
      evidenceId,
      controller.signal,
    ).then((value) => {
      if (
        value.datasetId !== dataset.id
        || value.projectId !== dataset.projectId
        || value.contentSha256 !== dataset.evidence?.contentSha256
      ) {
        throw new PersistentApiError(
          409,
          'EVIDENCE_PROVENANCE_MISMATCH',
          'Canonical evidence provenance does not match the selected dataset.',
        );
      }
      setCanonicalEvidence(value);
    }).catch((caught) => {
      if (caught instanceof Error && caught.name === 'AbortError') return;
      setCanonicalEvidence(null);
      setError(toPersistentError(caught));
    });
    return () => controller.abort();
  }, [
    activeOrganizationId,
    dataset?.evidence?.contentSha256,
    dataset?.evidence?.id,
    dataset?.id,
    dataset?.projectId,
  ]);

  React.useEffect(() => {
    if (
      !activeOrganizationId
      || !dataset
      || stage !== 'idle'
      || !(
        ['pending_validation', 'validating'].includes(dataset.datasetStatus)
        || dataset.evidenceStatus === 'processing'
        || ['uploading', 'streaming', 'finalizing'].includes(
          dataset.latestUpload?.sessionStatus ?? '',
        )
      )
    ) return;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
        const authoritative = await getPersistentXrdDataset(
          activeOrganizationId,
          dataset.id,
          controller.signal,
        );
        if (cancelled) return;
        setDataset(authoritative);
        setDatasets((current) => current.map((item) => (
          item.id === authoritative.id ? authoritative : item
        )));
        if (
          TERMINAL_DATASET_STATES.has(authoritative.datasetStatus)
          || authoritative.evidenceStatus === 'failed'
          || ['failed', 'expired', 'cancelled'].includes(
            authoritative.latestUpload?.sessionStatus ?? '',
          )
        ) return;
        await wait(POLL_INTERVAL_MS);
      }
      if (!cancelled) {
        setError(new PersistentApiError(
          504,
          'VALIDATION_TIMEOUT',
          'Validation is still running. Reload to continue from authoritative server state.',
        ));
      }
    })().catch((caught) => {
      if (cancelled || (caught instanceof Error && caught.name === 'AbortError')) return;
      setError(toPersistentError(caught));
    });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    activeOrganizationId,
    dataset?.datasetStatus,
    dataset?.evidenceStatus,
    dataset?.id,
    dataset?.latestUpload?.sessionStatus,
    stage,
  ]);

  React.useEffect(() => {
    if (
      !activeOrganizationId
      || !reasoningRun
      || reasoningRun.status !== 'running'
      || stage !== 'idle'
    ) return;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
        const authoritative = await getPersistentReasoningRun(
          activeOrganizationId,
          reasoningRun.id,
          controller.signal,
        );
        if (cancelled) return;
        setReasoningRun(authoritative);
        if (['succeeded', 'fallback', 'failed'].includes(authoritative.status)) return;
        await wait(POLL_INTERVAL_MS);
      }
      if (!cancelled) {
        setError(new PersistentApiError(
          504,
          'REASONING_TIMEOUT',
          'Reasoning is still running. Reload to continue from authoritative server state.',
        ));
      }
    })().catch((caught) => {
      if (cancelled || (caught instanceof Error && caught.name === 'AbortError')) return;
      setError(toPersistentError(caught));
    });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [activeOrganizationId, reasoningRun?.id, reasoningRun?.status, stage]);

  const selectDataset = (nextDataset: PersistentXrdDataset) => {
    pollGeneration.current += 1;
    setDataset(nextDataset);
    setCanonicalEvidence(null);
    setReasoningRun(null);
    setNotebookSaved(false);
    setError(null);
    uploadAttemptCount.current = 0;
    const next = new URLSearchParams(searchParams);
    next.set('dataset', nextDataset.id);
    setSearchParams(next, { replace: false });
  };

  const handleCreateDataset = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!activeOrganizationId || !projectId || isCreatingDataset) return;
    setIsCreatingDataset(true);
    setError(null);
    try {
      const created = await createPersistentXrdDataset(
        activeOrganizationId,
        projectId,
        {
          title: newDatasetTitle,
          measurementMetadata: {},
          processingParameters: {},
          experimentContext: {
            conditionLock: 'preserved_server_side',
          },
        },
      );
      setDatasets((current) => [created, ...current]);
      selectDataset(created);
    } catch (caught) {
      setError(toPersistentError(caught));
    } finally {
      setIsCreatingDataset(false);
    }
  };

  const handleUpload = async (file: File) => {
    if (!activeOrganizationId || !dataset) return;
    pollGeneration.current += 1;
    setError(null);
    setReasoningRun(null);
    setNotebookSaved(false);
    setProgress(0);
    try {
      validateSelectedFile(file);
      setStage('hashing');
      const checksum = await sha256File(file);
      const priorUploadFailed = Boolean(
        dataset.latestUpload
        && ['failed', 'expired', 'cancelled'].includes(dataset.latestUpload.sessionStatus),
      );
      const retrySuffix = priorUploadFailed || uploadAttemptCount.current > 0
        ? `:retry:${crypto.randomUUID()}`
        : '';
      uploadAttemptCount.current += 1;
      const idempotencyKey = `xrd-upload:${dataset.id}:${checksum}${retrySuffix}`;
      const intent = await createPersistentUploadIntent(
        activeOrganizationId,
        dataset.id,
        file,
        checksum,
        idempotencyKey,
      );
      setStage('uploading');
      await uploadPersistentFile(
        activeOrganizationId,
        intent.uploadId,
        file,
        setProgress,
      );
      setStage('finalizing');
      await finalizePersistentUpload(activeOrganizationId, intent.uploadId);
      setStage('validating');
      await pollDataset(activeOrganizationId, dataset.id);
    } catch (caught) {
      setError(toPersistentError(caught));
      setStage('idle');
      try {
        const authoritative = await getPersistentXrdDataset(activeOrganizationId, dataset.id);
        setDataset(authoritative);
        setDatasets((current) => current.map((item) => (
          item.id === authoritative.id ? authoritative : item
        )));
      } catch {
        // Preserve the original bounded upload failure.
      }
    }
  };

  const pollDataset = async (organizationId: string, datasetId: string) => {
    const generation = ++pollGeneration.current;
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
      const authoritative = await getPersistentXrdDataset(organizationId, datasetId);
      if (generation !== pollGeneration.current) return;
      setDataset(authoritative);
      setDatasets((current) => current.map((item) => (
        item.id === authoritative.id ? authoritative : item
      )));
      if (
        TERMINAL_DATASET_STATES.has(authoritative.datasetStatus)
        || authoritative.evidenceStatus === 'failed'
      ) {
        setStage('idle');
        return;
      }
      await wait(POLL_INTERVAL_MS);
    }
    if (generation === pollGeneration.current) {
      setStage('idle');
      setError(new PersistentApiError(
        504,
        'VALIDATION_TIMEOUT',
        'Validation is still running. Reload to continue from authoritative server state.',
      ));
    }
  };

  React.useEffect(() => {
    const upload = dataset?.latestUpload;
    if (
      !activeOrganizationId
      || !dataset
      || !upload
      || stage !== 'idle'
      || dataset.originalObjectId
      || !['uploaded', 'finalizing'].includes(upload.sessionStatus)
    ) return;
    let cancelled = false;
    setStage('finalizing');
    void finalizePersistentUpload(activeOrganizationId, upload.id)
      .then(() => {
        if (cancelled) return;
        setStage('validating');
        return pollDataset(activeOrganizationId, dataset.id);
      })
      .catch(async (caught) => {
        if (cancelled) return;
        setError(toPersistentError(caught));
        setStage('idle');
        try {
          const authoritative = await getPersistentXrdDataset(
            activeOrganizationId,
            dataset.id,
          );
          if (!cancelled) setDataset(authoritative);
        } catch {
          // Preserve the original bounded finalization failure.
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    activeOrganizationId,
    dataset?.id,
    dataset?.latestUpload?.id,
    dataset?.latestUpload?.sessionStatus,
    dataset?.originalObjectId,
  ]);

  const handleReasoning = async (provider: 'deterministic' | 'gemini-2.5-flash') => {
    if (!activeOrganizationId || !projectId || !dataset?.evidence?.id) return;
    setStage('reasoning');
    setError(null);
    try {
      const run = await runPersistentReasoning(activeOrganizationId, {
        projectId,
        datasetId: dataset.id,
        evidenceSnapshotId: dataset.evidence.id,
        provider,
        idempotencyKey: reasoningRun?.status === 'failed'
          ? `xrd-reason:${dataset.evidence.id}:${provider}:retry:${crypto.randomUUID()}`
          : `xrd-reason:${dataset.evidence.id}:${provider}`,
      });
      setReasoningRun(run);
    } catch (caught) {
      setError(toPersistentError(caught));
      try {
        const runs = await listPersistentHistory(
          activeOrganizationId,
          { datasetId: dataset.id },
        );
        setReasoningRun(runs[0] ?? null);
      } catch {
        // Preserve the original bounded reasoning failure.
      }
    } finally {
      setStage('idle');
    }
  };

  const handleNotebookReference = async () => {
    if (!activeOrganizationId || !reasoningRun) return;
    setError(null);
    try {
      await createPersistentNotebookReference(
        activeOrganizationId,
        reasoningRun.id,
        `${dataset?.title ?? 'XRD'} reasoning`,
      );
      setNotebookSaved(true);
    } catch (caught) {
      setError(toPersistentError(caught));
    }
  };

  if (!projectId) {
    return (
      <DashboardLayout>
        <div className="flex h-full items-center justify-center bg-slate-50 p-6">
          <Card className="max-w-lg p-6 text-center">
            <Database className="mx-auto text-primary" size={34} />
            <h1 className="mt-3 text-lg font-bold">Select a persistent project first</h1>
            <p className="mt-2 text-sm text-text-muted">
              XRD datasets inherit their tenant and ownership from an authorized server project.
            </p>
            <Link
              to="/workspace"
              className="mt-4 inline-flex rounded-md bg-primary px-4 py-2 text-xs font-bold text-white"
            >
              Open Workspace Hub
            </Link>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="h-full overflow-y-auto bg-slate-50 p-4">
        <div className="mx-auto max-w-7xl space-y-3">
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold">Persistent XRD Workspace</h1>
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800">
                  Server authoritative
                </span>
              </div>
              <p className="mt-1 text-xs text-text-muted">
                Upload, validation, evidence, reasoning, History, and Notebook references survive refresh.
              </p>
            </div>
            <div className="flex gap-2">
              <Link
                to={`/history?mode=server&project=${projectId}`}
                className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-white px-3 text-xs font-semibold"
              >
                <History size={13} /> History
              </Link>
              <Link
                to="/notebook?mode=server"
                className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-white px-3 text-xs font-semibold"
              >
                <BookOpen size={13} /> Notebook
              </Link>
            </div>
          </header>

          {error && <PersistentErrorBanner error={error} />}

          <div className="grid gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
            <Card className="space-y-3 p-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
                  Authorized XRD datasets
                </p>
                <div className="mt-2 space-y-1.5">
                  {datasets.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => selectDataset(item)}
                      className={`w-full rounded-md border p-2 text-left ${
                        dataset?.id === item.id
                          ? 'border-primary bg-blue-50'
                          : 'border-border bg-white hover:bg-slate-50'
                      }`}
                    >
                      <p className="truncate text-xs font-bold">{item.title}</p>
                      <p className="mt-1 text-[10px] text-text-muted">
                        {item.datasetStatus} / evidence {item.evidenceStatus}
                      </p>
                    </button>
                  ))}
                  {datasets.length === 0 && (
                    <p className="rounded-md border border-dashed p-3 text-xs text-text-muted">
                      No persistent XRD datasets yet.
                    </p>
                  )}
                </div>
              </div>

              <form onSubmit={handleCreateDataset} className="space-y-2 border-t border-border pt-3">
                <label className="block text-[10px] font-bold uppercase text-text-muted">
                  New XRD dataset
                </label>
                <input
                  value={newDatasetTitle}
                  onChange={(event) => setNewDatasetTitle(event.target.value)}
                  maxLength={255}
                  className="h-9 w-full rounded-md border border-border px-2 text-xs"
                />
                <button
                  type="submit"
                  disabled={isCreatingDataset || !newDatasetTitle.trim()}
                  className="h-8 w-full rounded-md bg-primary text-xs font-bold text-white disabled:opacity-50"
                >
                  {isCreatingDataset ? 'Creating…' : 'Create dataset'}
                </button>
              </form>
            </Card>

            <div className="space-y-3">
              {dataset ? (
                <>
                  <Card className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
                          Dataset
                        </p>
                        <h2 className="mt-1 text-base font-bold">{dataset.title}</h2>
                        <p className="mt-1 font-mono text-[10px] text-text-muted">{dataset.id}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (!activeOrganizationId) return;
                          setStage('validating');
                          void pollDataset(activeOrganizationId, dataset.id).catch((caught) => {
                            setStage('idle');
                            setError(toPersistentError(caught));
                          });
                        }}
                        className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-3 text-xs font-semibold"
                      >
                        <RefreshCw size={12} /> Reload authoritative state
                      </button>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-4">
                      <StatusMetric label="Upload" value={uploadLabel(dataset)} />
                      <StatusMetric label="Validation" value={validationLabel(dataset)} />
                      <StatusMetric label="Evidence" value={dataset.evidenceStatus} />
                      <StatusMetric label="Version" value={dataset.evidence ? `v${dataset.evidence.version}` : '—'} />
                    </div>
                  </Card>

                  {!dataset.originalObjectId && (
                    <Card className="p-4">
                      <div className="flex items-start gap-3">
                        <FileUp className="mt-0.5 text-primary" size={22} />
                        <div className="flex-1">
                          <h3 className="text-sm font-bold">Upload original XRD signal</h3>
                          <p className="mt-1 text-xs text-text-muted">
                            Supported: CSV, TXT, XY, DAT. The server verifies byte size and SHA-256 before immutable finalization.
                          </p>
                          <label className="mt-3 inline-flex cursor-pointer rounded-md bg-primary px-4 py-2 text-xs font-bold text-white">
                            Select XRD file
                            <input
                              type="file"
                              accept=".csv,.txt,.xy,.dat,text/csv,text/plain"
                              className="hidden"
                              disabled={stage !== 'idle' || reasoningRun?.status === 'running'}
                              onChange={(event) => {
                                const file = event.target.files?.[0];
                                if (file) void handleUpload(file);
                                event.currentTarget.value = '';
                              }}
                            />
                          </label>
                          {stage !== 'idle' && stage !== 'reasoning' && (
                            <div className="mt-3">
                              <div className="flex justify-between text-[10px] font-semibold text-text-muted">
                                <span>{stageLabel(stage)}</span>
                                <span>{stage === 'uploading' ? `${progress}%` : 'Authoritative state pending'}</span>
                              </div>
                              <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200">
                                <div
                                  className="h-full bg-primary transition-all"
                                  style={{ width: `${stage === 'uploading' ? progress : 100}%` }}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </Card>
                  )}

                  <CanonicalEvidenceCard dataset={dataset} evidence={canonicalEvidence} />

                  {dataset.evidenceStatus === 'ready' && dataset.evidence && (
                    <Card className="p-4">
                      <div className="flex items-start gap-3">
                        <Bot className="mt-0.5 text-primary" size={22} />
                        <div className="flex-1">
                          <h3 className="text-sm font-bold">Persistent evidence-first reasoning</h3>
                          <p className="mt-1 text-xs text-text-muted">
                            The server loads evidence snapshot {dataset.evidence.id}; browser-provided points are not accepted.
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={stage !== 'idle' || reasoningRun?.status === 'running'}
                              onClick={() => void handleReasoning('deterministic')}
                              className="rounded-md border border-primary bg-blue-50 px-3 py-2 text-xs font-bold text-primary disabled:opacity-50"
                            >
                              Run deterministic reasoning
                            </button>
                            <button
                              type="button"
                              disabled={stage !== 'idle'}
                              onClick={() => void handleReasoning('gemini-2.5-flash')}
                              className="rounded-md bg-primary px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                            >
                              Run configured Gemini
                            </button>
                            {stage === 'reasoning' && (
                              <span className="inline-flex items-center gap-1 text-xs text-text-muted">
                                <LoaderCircle className="animate-spin" size={13} /> Persisting reasoning…
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </Card>
                  )}

                  {reasoningRun && (
                    <ReasoningResultCard
                      run={reasoningRun}
                      notebookSaved={notebookSaved}
                      onNotebookReference={() => void handleNotebookReference()}
                    />
                  )}
                </>
              ) : (
                <Card className="p-8 text-center text-sm text-text-muted">
                  Create or select an authorized XRD dataset.
                </Card>
              )}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

function CanonicalEvidenceCard({
  dataset,
  evidence,
}: {
  dataset: PersistentXrdDataset;
  evidence: PersistentCanonicalEvidence | null;
}) {
  const chartData = React.useMemo(() => buildChartData(evidence), [evidence]);
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        {dataset.evidenceStatus === 'ready'
          ? <CheckCircle2 className="mt-0.5 text-emerald-600" size={21} />
          : dataset.evidenceStatus === 'failed'
            ? <AlertTriangle className="mt-0.5 text-red-600" size={21} />
            : <LoaderCircle className="mt-0.5 text-amber-600" size={21} />}
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold">Canonical XRD evidence</h3>
          {dataset.evidence ? (
            <>
              <p className="mt-1 text-xs text-text-muted">
                Immutable snapshot {dataset.evidence.id} / SHA-256 {dataset.evidence.contentSha256.slice(0, 16)}…
              </p>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                <BoundaryList
                  title="Validation warnings"
                  values={dataset.evidence.validationWarnings}
                  empty="No parser warnings recorded."
                />
                <BoundaryList
                  title="Scientific limitations"
                  values={dataset.evidence.scientificLimitations}
                  empty="Limitations unavailable."
                />
              </div>
              <div className="mt-3 rounded-md border border-border bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
                      Evidence workspace graph
                    </p>
                    <p className="mt-1 text-xs text-text-muted">
                      Raw signal, server-processed smoothing, and baseline remain visible during reasoning.
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-text-muted">
                    {chartData.length ? `${chartData.length} rendered points` : 'Loading canonical arrays'}
                  </span>
                </div>
                <div className="mt-3 h-64">
                  {chartData.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis
                          dataKey="x"
                          type="number"
                          domain={['dataMin', 'dataMax']}
                          tick={{ fontSize: 10 }}
                          label={{ value: '2 theta (deg)', position: 'insideBottom', offset: -4, fontSize: 10 }}
                        />
                        <YAxis tick={{ fontSize: 10 }} width={52} />
                        <Tooltip
                          contentStyle={{ fontSize: 11, borderRadius: 6 }}
                          labelFormatter={(value) => `2 theta ${Number(value).toFixed(3)} deg`}
                        />
                        <Line type="monotone" dataKey="raw" stroke="#94a3b8" dot={false} strokeWidth={1} name="Raw" />
                        <Line type="monotone" dataKey="smoothed" stroke="#2563eb" dot={false} strokeWidth={1.5} name="Smoothed" />
                        <Line type="monotone" dataKey="baseline" stroke="#f59e0b" dot={false} strokeWidth={1} name="Baseline" />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full items-center justify-center rounded-md border border-dashed border-border bg-slate-50 text-xs text-text-muted">
                      Canonical processed arrays are loading from the authorized evidence snapshot.
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-3">
                <JsonBoundary
                  title="Measurement conditions"
                  value={dataset.measurementMetadata}
                />
                <JsonBoundary
                  title="Processing conditions"
                  value={dataset.processingParameters}
                />
                <JsonBoundary
                  title="Experiment context"
                  value={dataset.experimentContext}
                />
              </div>
            </>
          ) : (
            <p className="mt-1 text-xs text-text-muted">
              {dataset.evidenceStatus === 'failed'
                ? `Evidence creation failed${dataset.failureCode ? `: ${dataset.failureCode}` : '.'}`
                : 'Evidence remains unavailable until upload validation and XRD processing succeed.'}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

function JsonBoundary({
  title,
  value,
}: {
  title: string;
  value: Record<string, unknown>;
}) {
  const entries = Object.entries(value).slice(0, 4);
  return (
    <div className="rounded-md border border-border bg-slate-50 p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">{title}</p>
      {entries.length ? (
        <dl className="mt-2 space-y-1 text-[11px]">
          {entries.map(([key, item]) => (
            <div key={key} className="flex justify-between gap-2">
              <dt className="truncate text-text-muted">{key}</dt>
              <dd className="max-w-[60%] truncate font-semibold text-text-main">
                {formatStructuredValue(item)}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-2 text-xs text-text-muted">Not supplied; no metadata fabricated.</p>
      )}
    </div>
  );
}

function ReasoningResultCard({
  run,
  notebookSaved,
  onNotebookReference,
}: {
  run: PersistentReasoningRun;
  notebookSaved: boolean;
  onNotebookReference: () => void;
}) {
  const output = run.structuredOutput ?? {};
  const claims = Array.isArray(output.claims)
    ? output.claims
    : typeof output.decisionLogic === 'string'
      ? [output.decisionLogic]
      : [];
  const observations = Array.isArray(output.observations)
    ? output.observations
    : Array.isArray(output.evidenceSummary)
      ? output.evidenceSummary
      : [];
  const validationGaps = Array.isArray(output.validationGaps)
    ? output.validationGaps
    : Array.isArray(output.uncertainty)
      ? output.uncertainty
      : [];
  const primaryResult = typeof output.primaryResult === 'string'
    ? output.primaryResult
    : 'No bounded decision recorded.';
  const recommendedNextStep = typeof output.recommendedNextStep === 'string'
    ? output.recommendedNextStep
    : 'Review the validation gap before the next experiment.';
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
            Persisted reasoning run
          </p>
          <h3 className="mt-1 text-sm font-bold">
            {run.provider} / {run.status}
            {run.fallbackUsed ? ' / deterministic provider-error fallback' : ''}
          </h3>
          <p className="mt-1 font-mono text-[10px] text-text-muted">{run.id}</p>
        </div>
        <button
          type="button"
          onClick={onNotebookReference}
          disabled={notebookSaved || !['succeeded', 'fallback'].includes(run.status)}
          className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-3 text-xs font-semibold disabled:opacity-50"
        >
          <BookOpen size={12} /> {notebookSaved ? 'Referenced in Notebook' : 'Reference in Notebook'}
        </button>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <div className="rounded-md border border-primary/20 bg-blue-50 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-primary">
            Bounded conclusion
          </p>
          <p className="mt-1 text-sm font-semibold text-text-main">{primaryResult}</p>
          <p className="mt-1 text-[11px] text-text-muted">
            This remains evidence-limited and does not independently establish composition or phase purity.
          </p>
        </div>
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">
            Next experiment / decision
          </p>
          <p className="mt-1 text-sm font-semibold text-text-main">{recommendedNextStep}</p>
        </div>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <BoundaryList title="Evidence" values={observations} empty="No structured observations." />
        <BoundaryList title="Interpretation / hypothesis" values={claims} empty="No bounded interpretation." />
        <BoundaryList title="Validation gap" values={validationGaps} empty="No validation gaps recorded." />
      </div>
    </Card>
  );
}

function BoundaryList({
  title,
  values,
  empty,
}: {
  title: string;
  values: unknown[];
  empty: string;
}) {
  return (
    <div className="rounded-md border border-border bg-slate-50 p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">{title}</p>
      {values.length ? (
        <ul className="mt-2 space-y-1 text-xs leading-relaxed text-text-main">
          {values.slice(0, 5).map((value, index) => (
            <li key={`${title}-${index}`}>• {formatStructuredValue(value)}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-text-muted">{empty}</p>
      )}
    </div>
  );
}

function PersistentErrorBanner({ error }: { error: PersistentApiError }) {
  return (
    <div className="rounded-md border border-red-200 bg-red-50 p-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 shrink-0 text-red-600" size={17} />
        <div>
          <p className="text-xs font-bold text-red-900">{errorLabel(error.errorCode)}</p>
          <p className="mt-1 text-xs text-red-800">{error.message}</p>
          {error.requestId && (
            <p className="mt-1 font-mono text-[10px] text-red-700">Request {error.requestId}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-slate-50 p-2">
      <p className="text-[9px] font-bold uppercase tracking-wider text-text-muted">{label}</p>
      <p className="mt-1 truncate text-xs font-semibold text-text-main">{value}</p>
    </div>
  );
}

function uploadLabel(dataset: PersistentXrdDataset): string {
  if (!dataset.latestUpload) return 'created';
  return dataset.latestUpload.sessionStatus;
}

function validationLabel(dataset: PersistentXrdDataset): string {
  const status = dataset.latestValidation?.status;
  if (!status) return dataset.originalObjectId ? 'pending' : 'not started';
  if (status === 'claimed' || status === 'running') return 'running';
  if (status === 'passed') return 'succeeded';
  if (['failed', 'quarantined', 'cancelled'].includes(status)) return 'failed';
  return 'pending';
}

function stageLabel(stage: WorkflowStage): string {
  if (stage === 'hashing') return 'Computing SHA-256';
  if (stage === 'uploading') return 'Uploading immutable raw object';
  if (stage === 'finalizing') return 'Verifying and finalizing upload';
  if (stage === 'validating') return 'Validating and processing XRD';
  return 'Working';
}

function validateSelectedFile(file: File) {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!extension || !['csv', 'txt', 'xy', 'dat'].includes(extension)) {
    throw new PersistentApiError(
      400,
      'UNSUPPORTED_XRD_FORMAT',
      'Select a CSV, TXT, XY, or DAT XRD signal file.',
    );
  }
  if (file.size <= 0) {
    throw new PersistentApiError(400, 'EMPTY_FILE', 'The selected file is empty.');
  }
}

function errorLabel(code: string): string {
  const labels: Record<string, string> = {
    AUTHENTICATION_REQUIRED: 'Authentication expired',
    ACCESS_DENIED: 'Authorization denied',
    UPLOAD_FAILED: 'Raw upload failed',
    CHECKSUM_MISMATCH: 'Checksum mismatch',
    INVALID_CHECKSUM: 'Checksum rejected',
    VALIDATION_TIMEOUT: 'Validation still running',
    EVIDENCE_NOT_READY: 'Canonical evidence unavailable',
    GEMINI_QUOTA_EXCEEDED: 'Gemini quota reached',
    GEMINI_QUOTA_UNAVAILABLE: 'Gemini quota store unavailable',
    GEMINI_NOT_CONFIGURED: 'Gemini service unavailable',
    PERSISTENCE_SERVICE_UNAVAILABLE: 'Persistent service unavailable',
  };
  return labels[code] ?? code.replace(/_/g, ' ').toLowerCase();
}

function toPersistentError(value: unknown): PersistentApiError {
  return value instanceof PersistentApiError
    ? value
    : new PersistentApiError(
        500,
        'PERSISTENCE_ERROR',
        value instanceof Error ? value.message : 'Persistent XRD workflow failed.',
      );
}

function formatStructuredValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of ['text', 'claim', 'observation', 'description', 'summary']) {
      if (typeof record[key] === 'string') return record[key];
    }
    return JSON.stringify(value);
  }
  return String(value);
}

function buildChartData(evidence: PersistentCanonicalEvidence | null): Array<{
  x: number;
  raw: number;
  smoothed: number;
  baseline: number;
}> {
  const processed = asRecord(asRecord(evidence?.content)?.processedOutput);
  const xValues = numericArray(processed?.x);
  const rawValues = numericArray(processed?.y_raw);
  const smoothedValues = numericArray(processed?.y_smoothed);
  const baselineValues = numericArray(processed?.y_baseline);
  const length = Math.min(
    xValues.length,
    rawValues.length,
    smoothedValues.length,
    baselineValues.length,
  );
  if (length < 2) return [];
  const step = Math.max(1, Math.ceil(length / 1_500));
  const rows = [];
  for (let index = 0; index < length; index += step) {
    rows.push({
      x: xValues[index],
      raw: rawValues[index],
      smoothed: smoothedValues[index],
      baseline: baselineValues[index],
    });
  }
  if ((length - 1) % step !== 0) {
    const index = length - 1;
    rows.push({
      x: xValues[index],
      raw: rawValues[index],
      smoothed: smoothedValues[index],
      baseline: baselineValues[index],
    });
  }
  return rows;
}

function numericArray(value: unknown): number[] {
  if (
    !Array.isArray(value)
    || !value.every((item) => typeof item === 'number' && Number.isFinite(item))
  ) return [];
  return value;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}
