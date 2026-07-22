import React from 'react';
import { CheckCircle2, Clock3, Database, FlaskConical, Plus, Target } from 'lucide-react';
import type { DemoDataset, DemoProject } from '../../../../data/demoProjects';

interface LeftSidebarProps {
  currentDataset: DemoDataset;
  currentProject: DemoProject;
  bundleLabel?: string;
  missingTechniques?: string[];
  onAddEvidence?: () => void;
}

export function LeftSidebar({ currentDataset, currentProject, bundleLabel, missingTechniques = [], onAddEvidence }: LeftSidebarProps) {
  const recentRuns = currentProject.history.slice(-3).reverse();

  return (
    <aside className="flex w-[236px] shrink-0 flex-col overflow-hidden border-r border-slate-200 bg-white">
      <div className="border-b border-slate-200 p-4">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-900">
          <Target size={14} className="text-blue-600" />
          Project objective
        </div>
        <p className="text-[12px] leading-5 text-slate-700">{currentProject.objective}</p>
      </div>

      <div className="border-b border-slate-200 p-4">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-900">
          <FlaskConical size={14} className="text-blue-600" />
          Material system
        </div>
        <div className="text-sm font-semibold text-slate-900">{currentProject.material}</div>
        <div className="mt-1 truncate text-[11px] text-slate-500" title={currentDataset.fileName}>
          Active dataset: {currentDataset.fileName}
        </div>
      </div>

      <div className="border-b border-slate-200 p-4">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-900">
          <Database size={14} className="text-blue-600" />
          Evidence sources
        </div>
        <div className="space-y-2">
          {currentProject.evidenceSources.map((source) => (
            <div key={`${source.technique}-${source.datasetId}`} className="flex items-start gap-2 text-[11px]">
              <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-emerald-600" />
              <div className="min-w-0">
                <div className="font-semibold text-slate-800">{source.technique}</div>
                <div className="truncate text-slate-500" title={source.datasetLabel}>{source.datasetLabel}</div>
              </div>
            </div>
          ))}
        </div>
        {bundleLabel && (
          <div className="mt-3 rounded-md bg-blue-50 px-2 py-1.5 text-[10px] font-semibold text-blue-800">
            {bundleLabel}
          </div>
        )}
        {missingTechniques.length > 0 && (
          <div className="mt-2 text-[10px] leading-4 text-amber-800">
            Missing: {missingTechniques.join(', ')}
          </div>
        )}
        {onAddEvidence && (
          <button type="button" onClick={onAddEvidence} className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-blue-300 bg-white px-2 py-1.5 text-[10px] font-semibold text-blue-800 hover:bg-blue-50">
            <Plus size={12} /> Add evidence
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-900">
          <Clock3 size={14} className="text-blue-600" />
          Previous runs
        </div>
        {recentRuns.length > 0 ? (
          <div className="space-y-3">
            {recentRuns.map((run, index) => (
              <div key={run.id ?? index} className="border-t border-slate-100 pt-2 first:border-t-0 first:pt-0">
                <div className="text-[11px] font-medium leading-4 text-slate-700">{run.run}</div>
                <div className="mt-0.5 text-[10px] text-slate-500">{run.technique} · {run.date}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11px] leading-4 text-slate-500">No previous scientific review is recorded.</p>
        )}
      </div>
    </aside>
  );
}
