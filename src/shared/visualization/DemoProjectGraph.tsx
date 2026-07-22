import React from 'react';
import type {
  DemoGraphData,
  DemoGraphSource,
  DemoStructuredEvidence,
  TechniqueId,
} from '../../data/demoProjectRegistry';

const Graph = React.lazy(() =>
  import('../ui/Graph').then((module) => ({ default: module.Graph }))
);

/**
 * DemoProjectGraph — shared graph/evidence renderer.
 *
 * The same project must always show the same graph across Dashboard,
 * Analysis Workspace, Agent, and History. This component is the single
 * shared renderer for project graph/evidence sources.
 *
 * - If given a graph source with real data, renders `<Graph />` with
 *   external data and peak markers.
 * - If given a structured evidence source (no real graph data), renders
 *   a compact evidence card.
 */

interface DemoProjectGraphProps {
  source: DemoGraphSource;
  compact?: boolean;
  focusedTechnique?: TechniqueId;
  height?: string | number;
  showLegend?: boolean;
  hideAxes?: boolean;
  hideGrid?: boolean;
}

function isGraph(source: DemoGraphSource): source is DemoGraphData {
  return source.kind === 'graph';
}

function isStructured(source: DemoGraphSource): source is DemoStructuredEvidence {
  return source.kind === 'structured';
}

function techniqueLabel(id: TechniqueId): string {
  switch (id) {
    case 'xrd':
      return 'XRD';
    case 'xps':
      return 'XPS';
    case 'ftir':
      return 'FTIR';
    case 'raman':
      return 'Raman';
    case 'multi':
      return 'Multi-tech';
    default:
      return id;
  }
}

export function DemoProjectGraph({
  source,
  compact = false,
  height,
  showLegend = false,
  hideAxes = false,
  hideGrid = false,
}: DemoProjectGraphProps) {
  if (isGraph(source)) {
    const graphType = source.type === 'multi' ? 'xrd' : source.type;
    const peakMarkers = source.peaks?.map((p) => ({
      position: p.position,
      intensity: p.intensity,
      label: p.label,
    }));

    const fallbackHeight = height ?? (compact ? '100%' : 400);

    return (
      <React.Suspense
        fallback={
          <div
            className="flex w-full min-h-[120px] h-full items-center justify-center bg-slate-950/90 border border-slate-800 rounded-lg relative overflow-hidden"
          >
            {/* Subtle grid lines to mimic a real chart backdrop */}
            <div className="absolute inset-0 grid grid-cols-6 grid-rows-4 opacity-[0.03]">
              {Array.from({ length: 24 }).map((_, i) => (
                <div key={i} className="border-t border-l border-white" />
              ))}
            </div>
            {/* Sleek, pulsing loader */}
            <div className="flex flex-col items-center gap-1.5 z-10">
              <div className="h-5 w-5 rounded-full border-2 border-slate-800 border-t-blue-500 animate-spin" />
              <span className="text-[9px] font-mono tracking-widest text-slate-500 uppercase">
                Loading spectrum...
              </span>
            </div>
          </div>
        }
      >
        <Graph
          type={graphType as 'xrd' | 'xps' | 'ftir' | 'raman'}
          height={height ?? (compact ? '100%' : 400)}
          externalData={source.data}
          peakMarkers={peakMarkers}
          xAxisLabel={source.xLabel}
          yAxisLabel={source.yLabel}
          showBackground={!compact}
          showCalculated={!compact}
          showResidual={false}
          showLegend={showLegend}
          hideAxes={hideAxes}
          hideGrid={hideGrid}
        />
      </React.Suspense>
    );
  }

  if (isStructured(source)) {
    return (
      <div className="flex h-full min-h-[160px] flex-col rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            {techniqueLabel(source.type)} · Structured evidence
          </div>
          <span className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-700">
            No graph data
          </span>
        </div>
        <div className="text-sm font-semibold text-slate-900">{source.title}</div>
        <ul className="mt-2 flex-1 space-y-1 text-xs text-slate-700">
          {source.bulletEvidence.map((b, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-blue-500">•</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
        <div className="mt-2 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-600">
          <span className="font-semibold text-slate-800">Limitation:</span>{' '}
          {source.limitation}
        </div>
      </div>
    );
  }

  return null;
}

export default DemoProjectGraph;
