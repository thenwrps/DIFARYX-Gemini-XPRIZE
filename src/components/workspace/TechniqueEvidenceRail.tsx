import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, Circle, Database, Download, FileText, Layers, Play, Save, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { TechniqueWorkspaceConfig } from '../../data/techniqueWorkspaceContent';
import { formatChemicalFormula } from '../../utils/chemicalFormula';

export type PipelineStepState = 'done' | 'active' | 'pending' | 'optional';

interface DatasetRailState {
  fileName: string;
  sessionId: string;
  source: string;
  parseState: string;
  processingState: string;
  projectAttachment: string;
  lifecycleState: string;
  permissionState: string;
  saveState: string;
  nextIntent?: string | null;
}

interface TechniqueEvidenceRailProps {
  config: TechniqueWorkspaceConfig;
  dataset: DatasetRailState;
  pipelineStates: Record<string, PipelineStepState>;
  autoMode: boolean;
  onToggleAutoMode: () => void;
  onSaveSession: () => void;
  attachProjectPath: string;
  agentPath: string;
  notebookPath: string;
  reportPath: string;
  exportPath: string;
}

function statusBadgeClass(status: string) {
  const normalized = status.toLowerCase();
  if (normalized.includes('available') || normalized.includes('supported') || normalized.includes('ready') || normalized.includes('complete')) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }
  if (normalized.includes('required') || normalized.includes('pending') || normalized.includes('limited') || normalized.includes('draft')) {
    return 'border-amber-200 bg-amber-50 text-amber-700';
  }
  if (normalized.includes('unsaved')) {
    return 'border-red-200 bg-red-50 text-red-700';
  }
  return 'border-slate-200 bg-slate-50 text-slate-700';
}

function pipelineStateClass(state: PipelineStepState) {
  if (state === 'done') return 'text-emerald-700';
  if (state === 'active') return 'text-blue-700';
  if (state === 'optional') return 'text-slate-500';
  return 'text-amber-700';
}

function pipelineStateIcon(state: PipelineStepState) {
  if (state === 'done') return <CheckCircle2 size={12} className="text-emerald-600" />;
  if (state === 'active') return <Play size={12} className="text-blue-600" />;
  if (state === 'optional') return <Circle size={12} className="text-slate-400" />;
  return <AlertTriangle size={12} className="text-amber-600" />;
}

function formatStateLabel(state: PipelineStepState) {
  if (state === 'done') return 'done';
  if (state === 'active') return 'active';
  if (state === 'optional') return 'optional';
  return 'pending';
}

function MetadataRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[74px_minmax(0,1fr)] gap-2 border-b border-border/60 py-1.5 last:border-b-0">
      <dt className="text-[10px] font-bold uppercase tracking-wide text-text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-[11px] font-semibold leading-relaxed text-text-main">{value}</dd>
    </div>
  );
}

export function DatasetTab({
  config,
  dataset,
  onSaveSession,
  attachProjectPath,
  agentPath,
  notebookPath,
  reportPath,
  exportPath,
}: Pick<
  TechniqueEvidenceRailProps,
  'config' | 'dataset' | 'onSaveSession' | 'attachProjectPath' | 'agentPath' | 'notebookPath' | 'reportPath' | 'exportPath'
>) {
  return (
    <div className="space-y-3">
      <div className="rounded border border-border bg-background p-2">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded bg-primary/10 text-primary">
            <Database size={13} />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Uploaded Dataset</p>
            <p className="mt-0.5 break-words text-xs font-semibold leading-snug text-text-main">
              {formatChemicalFormula(dataset.fileName)}
            </p>
          </div>
        </div>
      </div>

      {dataset.nextIntent && (
        <div className="rounded border border-blue-100 bg-blue-50/70 px-2 py-1.5 text-[11px] font-semibold text-blue-900">
          Next: {dataset.nextIntent}
        </div>
      )}

      <dl className="rounded border border-border bg-background px-2">
        <MetadataRow label="Session ID" value={dataset.sessionId} />
        <MetadataRow label="Technique" value={`${config.label} / ${config.fullName}`} />
        <MetadataRow label="Source" value={dataset.source} />
        <MetadataRow label="Parse state" value={dataset.parseState} />
        <MetadataRow label="Processing" value={dataset.processingState} />
        <MetadataRow label="Project" value={dataset.projectAttachment} />
        <MetadataRow label="State" value={dataset.lifecycleState} />
        <MetadataRow label="Local" value={`${dataset.permissionState} / ${dataset.saveState}`} />
      </dl>

      <div className="flex flex-wrap gap-1.5">
        {[dataset.parseState, dataset.processingState, dataset.lifecycleState, dataset.saveState].map((status) => (
          <span key={status} className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusBadgeClass(status)}`}>
            {status}
          </span>
        ))}
      </div>

      <div className="space-y-1.5">
        <button
          type="button"
          onClick={onSaveSession}
          className="flex h-8 w-full items-center justify-between rounded border border-border px-2.5 text-[11px] font-semibold text-text-main transition-colors hover:bg-surface-hover"
        >
          Save Quick Session <Save size={13} />
        </button>
        <Link
          to={attachProjectPath}
          className="flex h-8 w-full items-center justify-between rounded border border-amber-300 bg-amber-50 px-2.5 text-[11px] font-semibold text-amber-800 transition-colors hover:bg-amber-100"
        >
          Attach to Project <Layers size={13} />
        </Link>
        <Link
          to={agentPath}
          className="flex h-8 w-full items-center justify-between rounded bg-primary px-2.5 text-[11px] font-semibold text-white transition-colors hover:bg-primary/90"
        >
          Send to Agent <Sparkles size={13} />
        </Link>
        <Link
          to={notebookPath}
          className="flex h-8 w-full items-center justify-between rounded border border-border px-2.5 text-[11px] font-semibold text-text-main transition-colors hover:bg-surface-hover"
        >
          Send to Notebook <FileText size={13} />
        </Link>
        <Link
          to={reportPath}
          className="flex h-8 w-full items-center justify-between rounded border border-border px-2.5 text-[11px] font-semibold text-text-main transition-colors hover:bg-surface-hover"
        >
          Create Report <FileText size={13} />
        </Link>
        <Link
          to={exportPath}
          className="flex h-8 w-full items-center justify-between rounded border border-border px-2.5 text-[11px] font-semibold text-text-main transition-colors hover:bg-surface-hover"
        >
          Export <Download size={13} />
        </Link>
      </div>
    </div>
  );
}

export function ProcessingPipelineTab({
  config,
  pipelineStates,
  autoMode,
  onToggleAutoMode,
}: Pick<TechniqueEvidenceRailProps, 'config' | 'pipelineStates' | 'autoMode' | 'onToggleAutoMode'>) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-wider text-primary">Processing Pipeline</p>
        <button
          type="button"
          role="switch"
          aria-checked={autoMode}
          onClick={onToggleAutoMode}
          className={`inline-flex h-5 items-center rounded-full px-1 text-[9px] font-bold transition-colors ${
            autoMode ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
          }`}
        >
          {autoMode ? 'Auto' : 'Manual'}
        </button>
      </div>

      <div className="rounded border border-border bg-background">
        {config.pipeline.map((step, index) => {
          const state = pipelineStates[step.id] ?? 'pending';
          return (
            <div key={step.id} className="flex items-center gap-2 border-b border-border/60 px-2 py-1.5 last:border-b-0">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-700">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-text-main">{step.label}</span>
              <span className={`shrink-0 text-[9px] font-bold uppercase ${pipelineStateClass(state)}`}>
                {formatStateLabel(state)}
              </span>
              {pipelineStateIcon(state)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function TechniqueEvidenceRail(props: TechniqueEvidenceRailProps) {
  const [activeTab, setActiveTab] = useState<'dataset' | 'pipeline'>('dataset');

  return (
    <aside className="flex w-[260px] shrink-0 flex-col overflow-hidden border-r border-border bg-surface">
      <div className="grid shrink-0 grid-cols-2 gap-1 border-b border-border p-2">
        <button
          type="button"
          onClick={() => setActiveTab('dataset')}
          className={`h-8 rounded text-[10px] font-bold uppercase tracking-wide transition-colors ${
            activeTab === 'dataset' ? 'bg-primary text-white' : 'bg-background text-text-muted hover:bg-surface-hover hover:text-text-main'
          }`}
        >
          Dataset
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('pipeline')}
          className={`h-8 rounded text-[10px] font-bold uppercase tracking-wide transition-colors ${
            activeTab === 'pipeline' ? 'bg-primary text-white' : 'bg-background text-text-muted hover:bg-surface-hover hover:text-text-main'
          }`}
        >
          Processing Pipeline
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {activeTab === 'dataset' ? <DatasetTab {...props} /> : <ProcessingPipelineTab {...props} />}
      </div>
    </aside>
  );
}
