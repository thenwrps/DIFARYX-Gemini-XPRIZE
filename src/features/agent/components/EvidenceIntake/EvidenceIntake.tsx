import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FilePlus2,
  FileText,
  Loader2,
  Upload,
  X,
} from 'lucide-react';
import type { Technique, UploadedSignalRun } from '../../../../data/uploadedSignalRuns';
import {
  hasValidScientificObjective,
  validateEvidenceFile,
  type EvidenceIntakeStatus,
  type StandaloneReviewMetadata,
} from '../../../../scientificReview/services/standaloneEvidenceIntakeService';

const ACCEPTED_FILES = '.csv,.txt,.xy,.dat';
const TECHNIQUES: Technique[] = ['XRD', 'XPS', 'FTIR', 'Raman'];

interface EvidenceIntakeItem {
  id: string;
  file: File;
  detectedTechnique: Technique;
  selectedTechnique: Technique;
  status: EvidenceIntakeStatus;
  message: string;
  run?: UploadedSignalRun;
}

interface StandaloneEvidenceEmptyStateProps {
  metadata: StandaloneReviewMetadata;
  readyEvidenceCount?: number;
  onMetadataChange: (metadata: StandaloneReviewMetadata) => void;
  onFilesSelected: (files: File[]) => void;
  onUsePreparedSample: () => void;
}

export function StandaloneEvidenceEmptyState({
  metadata,
  readyEvidenceCount = 0,
  onMetadataChange,
  onFilesSelected,
  onUsePreparedSample,
}: StandaloneEvidenceEmptyStateProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const update = (key: keyof StandaloneReviewMetadata, value: string) => {
    onMetadataChange({ ...metadata, [key]: value });
  };

  return (
    <main className="flex min-h-0 flex-1 bg-[#F7F9FC] p-4">
      <div className="mx-auto grid h-full w-full max-w-[1050px] grid-cols-[minmax(0,1fr)_360px] overflow-hidden rounded-xl border border-slate-200 bg-white">
        <section className="flex min-h-0 flex-col justify-center p-8">
          <div className="max-w-xl">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white"><FilePlus2 size={19} /></div>
            <h1 className="mt-4 text-2xl font-semibold text-slate-950">Start a scientific review</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">Add experimental signal files before the Objective → Evidence → Reasoning → Validation → Decision → Memory workflow begins.</p>
          </div>

          <div
            onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => { event.preventDefault(); setDragActive(false); }}
            onDrop={(event) => {
              event.preventDefault();
              setDragActive(false);
              onFilesSelected(Array.from(event.dataTransfer.files));
            }}
            className={`mt-6 flex min-h-[220px] flex-col items-center justify-center rounded-xl border border-dashed px-6 text-center transition-colors ${dragActive ? 'border-blue-600 bg-blue-50' : 'border-slate-300 bg-slate-50'}`}
          >
            <input ref={inputRef} type="file" multiple accept={ACCEPTED_FILES} className="hidden" onChange={(event) => { onFilesSelected(Array.from(event.target.files ?? [])); event.target.value = ''; }} />
            <Upload size={28} className="text-blue-600" />
            <div className="mt-3 text-sm font-semibold text-slate-900">Drag and drop experimental files</div>
            <div className="mt-1 text-xs text-slate-500">{readyEvidenceCount > 0 ? `${readyEvidenceCount} validated evidence source${readyEvidenceCount === 1 ? '' : 's'} ready` : 'Real parser support: CSV, TXT, XY, DAT'}</div>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => inputRef.current?.click()} className="rounded-md bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700">Browse files</button>
              <button type="button" onClick={onUsePreparedSample} className="rounded-md border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100">Use prepared sample</button>
            </div>
          </div>
        </section>

        <section className="border-l border-slate-200 bg-slate-50 p-6">
          <h2 className="text-sm font-semibold text-slate-950">Review context</h2>
          <p className="mt-1 text-[11px] leading-4 text-slate-600">The objective and one validated evidence source are required to run the review.</p>
          <div className="mt-5 space-y-4">
            <label className="block text-xs font-semibold text-slate-800">
              Research objective
              <textarea value={metadata.objective} onChange={(event) => update('objective', event.target.value)} rows={4} placeholder="What scientific question should GPT-5.6 evaluate?" className="mt-1.5 w-full resize-none rounded-md border border-slate-300 bg-white p-2.5 text-xs font-normal leading-5 text-slate-900 outline-none placeholder:text-slate-500 focus:border-blue-600 focus:ring-1 focus:ring-blue-600" />
              {metadata.objective.length > 0 && !hasValidScientificObjective(metadata.objective) && <span className="mt-1 block text-[10px] font-normal text-amber-700">Use at least 8 characters for a valid objective.</span>}
            </label>
            <label className="block text-xs font-semibold text-slate-800">
              Material system
              <input value={metadata.materialSystem} onChange={(event) => update('materialSystem', event.target.value)} placeholder="Sample or material under study" className="mt-1.5 h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs font-normal text-slate-900 outline-none placeholder:text-slate-500 focus:border-blue-600 focus:ring-1 focus:ring-blue-600" />
            </label>
            <label className="block text-xs font-semibold text-slate-800">
              Decision required
              <textarea value={metadata.decisionRequired} onChange={(event) => update('decisionRequired', event.target.value)} rows={3} placeholder="What decision should this review inform?" className="mt-1.5 w-full resize-none rounded-md border border-slate-300 bg-white p-2.5 text-xs font-normal leading-5 text-slate-900 outline-none placeholder:text-slate-500 focus:border-blue-600 focus:ring-1 focus:ring-blue-600" />
            </label>
          </div>
        </section>
      </div>
    </main>
  );
}

interface EvidenceIntakeDrawerProps {
  open: boolean;
  queuedFiles: File[];
  queueVersion: number;
  onClose: () => void;
  onAddEvidence: (runs: UploadedSignalRun[]) => void;
}

const STATUS_STYLES: Record<EvidenceIntakeStatus, string> = {
  uploading: 'bg-blue-50 text-blue-800',
  parsing: 'bg-blue-50 text-blue-800',
  ready: 'bg-emerald-50 text-emerald-800',
  'needs metadata': 'bg-amber-50 text-amber-900',
  unsupported: 'bg-rose-50 text-rose-900',
  'validation failed': 'bg-rose-50 text-rose-900',
};

export function EvidenceIntakeDrawer({ open, queuedFiles, queueVersion, onClose, onAddEvidence }: EvidenceIntakeDrawerProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [items, setItems] = useState<EvidenceIntakeItem[]>([]);

  const updateItem = (id: string, update: Partial<EvidenceIntakeItem>) => {
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...update } : item));
  };

  const processFile = async (id: string, file: File, technique?: Technique) => {
    updateItem(id, { status: 'uploading', message: 'Preparing file for parser validation.' });
    const result = await validateEvidenceFile(file, technique, (status) => updateItem(id, { status }));
    updateItem(id, {
      status: result.status,
      detectedTechnique: result.detectedTechnique,
      selectedTechnique: result.selectedTechnique,
      message: result.message,
      run: result.status === 'ready' ? result.run : undefined,
    });
  };

  const addFiles = (files: File[]) => {
    const additions = files.map<EvidenceIntakeItem>((file, index) => ({
      id: `${file.name}-${file.size}-${file.lastModified}-${queueVersion}-${index}-${Date.now()}`,
      file,
      detectedTechnique: 'Unknown',
      selectedTechnique: 'Unknown',
      status: 'uploading',
      message: 'Preparing file for parser validation.',
    }));
    setItems((current) => [...current, ...additions]);
    additions.forEach((item) => { void processFile(item.id, item.file); });
  };

  useEffect(() => {
    if (open && queuedFiles.length > 0) addFiles(queuedFiles);
  }, [open, queueVersion]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;
  const readyRuns = items.flatMap((item) => item.status === 'ready' && item.run ? [item.run] : []);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/40" onMouseDown={onClose}>
      <aside role="dialog" aria-modal="true" aria-labelledby="evidence-intake-title" onMouseDown={(event) => event.stopPropagation()} className="ml-auto flex h-full w-[520px] flex-col bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div><h2 id="evidence-intake-title" className="text-base font-semibold text-slate-950">Add evidence</h2><p className="mt-1 text-[11px] text-slate-600">Files extend the active bundle after they pass parser and evidence-quality validation.</p></div>
          <button type="button" onClick={onClose} aria-label="Close evidence intake" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"><X size={17} /></button>
        </div>

        <div className="border-b border-slate-200 p-4">
          <input ref={inputRef} type="file" multiple accept={ACCEPTED_FILES} className="hidden" onChange={(event) => { addFiles(Array.from(event.target.files ?? [])); event.target.value = ''; }} />
          <button type="button" onClick={() => inputRef.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-blue-300 bg-blue-50 px-4 py-4 text-xs font-semibold text-blue-800 hover:border-blue-500">
            <Upload size={16} />Select additional files
          </button>
          <div className="mt-2 text-center text-[10px] text-slate-500">Supported formats: .csv, .txt, .xy, .dat</div>
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
          {items.length === 0 ? (
            <div className="flex h-full min-h-[240px] flex-col items-center justify-center text-center"><FileText size={30} className="text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-700">No files selected</p><p className="mt-1 text-xs text-slate-500">Choose one or more experimental signal files.</p></div>
          ) : items.map((item) => (
            <div key={item.id} className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-start gap-3">
                <div className="mt-0.5">{item.status === 'uploading' || item.status === 'parsing' ? <Loader2 size={16} className="animate-spin text-blue-600" /> : item.status === 'ready' ? <CheckCircle2 size={16} className="text-emerald-600" /> : <AlertTriangle size={16} className="text-rose-600" />}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2"><div className="truncate text-xs font-semibold text-slate-900" title={item.file.name}>{item.file.name}</div><span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold ${STATUS_STYLES[item.status]}`}>{item.status}</span></div>
                  <div className="mt-2 grid grid-cols-[110px_1fr] items-center gap-2 text-[10px]">
                    <span className="text-slate-500">Detected technique</span><span className="font-semibold text-slate-800">{item.detectedTechnique === 'Unknown' ? 'Uncertain' : item.detectedTechnique}</span>
                    {item.status === 'needs metadata' && <><label htmlFor={`${item.id}-technique`} className="text-slate-500">Select technique</label><select id={`${item.id}-technique`} value={item.selectedTechnique} onChange={(event) => { const technique = event.target.value as Technique; updateItem(item.id, { selectedTechnique: technique }); void processFile(item.id, item.file, technique); }} className="h-8 rounded-md border border-amber-300 bg-amber-50 px-2 text-[10px] font-semibold text-slate-900"><option value="Unknown">Choose technique</option>{TECHNIQUES.map((technique) => <option key={technique} value={technique}>{technique}</option>)}</select></>}
                  </div>
                  <p className={`mt-2 text-[10px] leading-4 ${item.status === 'ready' ? 'text-emerald-700' : item.status === 'uploading' || item.status === 'parsing' ? 'text-slate-600' : 'text-rose-700'}`}>{item.message}</p>
                </div>
                <button type="button" onClick={() => setItems((current) => current.filter((candidate) => candidate.id !== item.id))} aria-label={`Remove ${item.file.name}`} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-800"><X size={14} /></button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 px-5 py-4">
          <div className="text-[11px] text-slate-600">{readyRuns.length} ready · {items.length - readyRuns.length} requiring attention</div>
          <div className="flex gap-2"><button type="button" onClick={onClose} className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100">Cancel</button><button type="button" disabled={readyRuns.length === 0} onClick={() => { onAddEvidence(readyRuns); setItems([]); onClose(); }} className="rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">Add ready evidence</button></div>
        </div>
      </aside>
    </div>
  );
}
