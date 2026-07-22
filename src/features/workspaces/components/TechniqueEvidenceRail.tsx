import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, Circle, Database, Download, FileText, Layers, Play, Save, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { TechniqueWorkspaceConfig } from '../../../data/techniqueWorkspaceContent';
import { formatChemicalFormula } from '../../../utils/chemicalFormula';

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
  extraMetadata?: { label: string; value: React.ReactNode }[];
  pipelineStates: Record<string, PipelineStepState>;
  autoMode: boolean;
  onToggleAutoMode: () => void;
  onSaveSession: () => void;
  attachProjectPath: string;
  agentPath: string;
  notebookPath: string;
  reportPath: string;
  exportPath: string;
  multiTechPath?: string;
  onStepClick?: (stepId: string) => void;
  selectedStepId?: string | null;
  datasetEditor?: React.ReactNode;
  collapsed?: boolean;
  onExpand?: () => void;
  onCollapse?: () => void;
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

export function MetadataRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[68px_minmax(0,1fr)] gap-2 border-b border-border/60 py-1 last:border-b-0">
      <dt className="text-[10px] font-bold uppercase tracking-wide text-text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-[11px] font-semibold leading-relaxed text-text-main">{value}</dd>
    </div>
  );
}

function DatasetTab({
  config,
  dataset,
  extraMetadata,
  datasetEditor,
}: Pick<TechniqueEvidenceRailProps, 'config' | 'dataset' | 'datasetEditor' | 'extraMetadata'>) {
  return (
    <div className="space-y-3">
      <div className="rounded border border-border bg-background p-2">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded bg-primary/10 text-primary">
            <Database size={13} />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Dataset</p>
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
        <MetadataRow label="Technique" value={
          <div className="flex flex-col gap-0.5">
            <span className="font-bold text-text-main leading-tight">{config.label}</span>
            <span className="text-[9px] font-medium text-text-muted leading-tight">{config.fullName}</span>
          </div>
        } />
        <MetadataRow label="Source" value={dataset.source} />
        <MetadataRow label="Status" value={
          <div className="flex flex-col gap-0.5">
            <span className="font-bold text-text-main leading-tight">{dataset.parseState}</span>
            <span className="text-[9px] font-medium text-text-muted leading-tight">{dataset.processingState}</span>
          </div>
        } />
        <MetadataRow label="Project" value={dataset.projectAttachment} />
        <MetadataRow label="State" value={
          <div className="flex flex-col gap-0.5">
            <span className="font-bold text-text-main leading-tight">{dataset.lifecycleState}</span>
            <span className="text-[9px] font-medium text-text-muted leading-tight">{dataset.permissionState} &middot; {dataset.saveState}</span>
          </div>
        } />
        {extraMetadata?.map((item, index) => (
          <MetadataRow key={`extra-${index}`} label={item.label} value={item.value} />
        ))}
      </dl>

      {datasetEditor && (
        <div className="pt-2">
          {datasetEditor}
        </div>
      )}
    </div>
  );
}

function ProcessingPipelineTab({
  config,
  pipelineStates,
  autoMode,
  onToggleAutoMode,
  onSaveSession,
  attachProjectPath,
  agentPath,
  notebookPath,
  reportPath,
  exportPath,
  multiTechPath,
  onStepClick,
  selectedStepId,
}: Pick<
  TechniqueEvidenceRailProps,
  | 'config'
  | 'pipelineStates'
  | 'autoMode'
  | 'onToggleAutoMode'
  | 'onSaveSession'
  | 'attachProjectPath'
  | 'agentPath'
  | 'notebookPath'
  | 'reportPath'
  | 'exportPath'
  | 'multiTechPath'
  | 'onStepClick'
  | 'selectedStepId'
>) {
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

      <div className="rounded border border-border bg-background overflow-hidden">
        {config.pipeline.map((step, index) => {
          const state = pipelineStates[step.id] ?? 'pending';
          const isSelected = selectedStepId === step.id;
          return (
            <div
              key={step.id}
              onClick={() => onStepClick?.(step.id)}
              className={`flex items-center gap-2 border-b border-border/60 px-2 py-2 last:border-b-0 cursor-pointer transition-all duration-200 ${
                isSelected
                  ? 'bg-primary/10 border-l-4 border-l-primary pl-1.5 font-bold'
                  : 'hover:bg-surface-hover/75'
              }`}
            >
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold transition-colors ${
                isSelected ? 'bg-primary text-white' : 'bg-slate-100 text-slate-700'
              }`}>
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

      <details className="group pt-1" open>
        <summary className="flex h-8 cursor-pointer list-none items-center justify-between rounded border border-border bg-background px-2.5 text-[11px] font-semibold text-text-main transition-colors hover:bg-surface-hover [&::-webkit-details-marker]:hidden">
          <span className="inline-flex items-center gap-1.5">
            <Sparkles size={13} className="text-primary" />
            Send this evidence to
          </span>
          <ChevronDown size={13} className="text-text-muted transition-transform group-open:rotate-180" />
        </summary>

        <div className="mt-1.5 space-y-1 rounded border border-border bg-background p-1.5">
          <button
            type="button"
            onClick={onSaveSession}
            className="flex h-7 w-full items-center justify-between rounded px-2 text-[10px] font-semibold text-text-main transition-colors hover:bg-surface-hover"
          >
            <span>Save session</span><span className="text-[9px] text-emerald-700">Saved locally</span>
          </button>
          <Link
            to={attachProjectPath}
            className="flex h-7 w-full items-center justify-between rounded px-2 text-[10px] font-semibold text-amber-800 transition-colors hover:bg-amber-50"
          >
            <span>Attach to project</span><span className="text-[9px] text-amber-700">Context-aware</span>
          </Link>
          <Link
            to={agentPath}
            className="flex h-7 w-full items-center justify-between rounded bg-primary px-2 text-[10px] font-semibold text-white transition-colors hover:bg-primary/90"
          >
            <span>Send to Agent</span><Sparkles size={12} />
          </Link>
          <Link
            to={notebookPath}
            className="flex h-7 w-full items-center justify-between rounded px-2 text-[10px] font-semibold text-text-main transition-colors hover:bg-surface-hover"
          >
            <span>Notebook</span><span className="text-[9px] text-emerald-700">Added</span>
          </Link>
          <Link
            to={reportPath}
            className="flex h-7 w-full items-center justify-between rounded px-2 text-[10px] font-semibold text-text-main transition-colors hover:bg-surface-hover"
          >
            <span>Report</span><span className="text-[9px] text-emerald-700">85% ready</span>
          </Link>
          {multiTechPath && (
            <Link
              to={multiTechPath}
              className="flex h-7 w-full items-center justify-between rounded px-2 text-[10px] font-semibold text-indigo-700 transition-colors hover:bg-indigo-50"
            >
              <span>Add to Cross-Technique Intelligence</span><Layers size={12} />
            </Link>
          )}
          <Link
            to={exportPath}
            className="flex h-7 w-full items-center justify-between rounded px-2 text-[10px] font-semibold text-text-main transition-colors hover:bg-surface-hover"
          >
            Export <Download size={12} />
          </Link>
        </div>
      </details>
    </div>
  );
}

export function TechniqueEvidenceRail(props: TechniqueEvidenceRailProps) {
  const [activeTab, setActiveTab] = useState<'dataset' | 'pipeline'>('dataset');
  const [compactDrawerOpen, setCompactDrawerOpen] = useState(false);

  if (props.collapsed) {
    return (
      <aside className="flex w-11 shrink-0 flex-col items-center border-r border-border bg-surface py-3">
        <button
          type="button"
          onClick={props.onExpand}
          className="tip flex h-8 w-8 items-center justify-center rounded-[5px] border border-border bg-white text-[11px] font-bold text-text-muted transition-colors hover:border-primary/40 hover:bg-blue-soft hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label="Expand dataset and pipeline panel"
          data-tip="Expand dataset and pipeline"
        >
          <Layers size={14} />
        </button>
      </aside>
    );
  }

  return (
    <aside className={compactDrawerOpen
      ? 'workspace-left-rail fixed inset-y-0 left-0 z-50 flex w-[300px] flex-col overflow-hidden border-r border-border bg-surface shadow-lg'
      : 'workspace-left-rail flex w-[260px] shrink-0 flex-col overflow-hidden border-r border-border bg-surface max-[1099px]:w-11'}>
      <button
        type="button"
        onClick={() => setCompactDrawerOpen(true)}
        className="tip hidden h-8 w-8 self-center rounded-[5px] border border-border bg-white text-text-muted transition-colors hover:bg-blue-soft hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary max-[1099px]:inline-flex max-[1099px]:items-center max-[1099px]:justify-center max-[1099px]:mt-3"
        aria-label="Open dataset and pipeline drawer"
        data-tip="Open dataset and pipeline"
      >
        <Layers size={14} />
      </button>
      <div className={`grid shrink-0 grid-cols-[1fr_1fr_28px] gap-1 border-b border-border p-2 ${compactDrawerOpen ? '' : 'max-[1099px]:hidden'}`}>
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
        <button
          type="button"
          onClick={() => {
            setCompactDrawerOpen(false);
            props.onCollapse?.();
          }}
          className="tip inline-flex h-8 items-center justify-center rounded-[5px] text-text-muted transition-colors hover:bg-blue-soft hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label="Collapse dataset and pipeline panel"
          data-tip="Collapse panel"
        >
          <Layers size={13} />
        </button>
      </div>

      <div className={`panelScroll min-h-0 flex-1 overflow-y-auto px-3 py-3 ${compactDrawerOpen ? '' : 'max-[1099px]:hidden'}`}>
        {activeTab === 'dataset' ? <DatasetTab {...props} /> : <ProcessingPipelineTab {...props} />}
      </div>
    </aside>
  );
}
