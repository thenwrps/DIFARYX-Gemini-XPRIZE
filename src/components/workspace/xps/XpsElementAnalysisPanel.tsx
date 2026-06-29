import React, { useEffect, useMemo } from 'react';
import { ArrowLeft, Atom, AlertTriangle, BookOpen, Layers, Shield } from 'lucide-react';
import { Graph } from '../../ui/Graph';
import { sanitizeScientificWording } from '../../../utils/claimBoundaryPresentation';
import {
  getElementRegionWindow,
  getReferencesForElement,
} from '../../../data/xpsReferenceData';
import {
  runXpsProcessing,
  type XpsProcessingParams,
  type StateAggregation,
} from '../../../agents/xpsAgent/runner';
import type { XpsDataset } from '../../../data/xpsDemoData';
import { levelToConfidence } from '../../../data/xpsElementEvidence';
import type { XpsElementEvidence } from '../../../agent/mcp/types';

/**
 * Element Selection Analysis — in-place, survey-first sub-view.
 *
 * Renders a FILTERED interpretation of the authoritative survey spectrum for a
 * single selected element. The peak set is derived from the same XPS processing
 * as the survey (region-focused = strict subset of the survey detection), so the
 * Survey View and Element View never disagree. All reference states come from the
 * canonical XPS reference module — no parallel data, no speculative claims.
 */

interface XpsElementAnalysisPanelProps {
  /** Element selected from the survey (e.g. 'Cu'). */
  element: string;
  /** Authoritative survey spectrum points: x = binding energy (eV), y = counts. */
  spectrumPoints: Array<{ x: number; y: number }>;
  /** Current XPS processing parameters (calibration, background, smoothing...). */
  processingParams?: XpsProcessingParams;
  /** Restore the original survey context. */
  onBackToSurvey: () => void;
  /**
   * Emits the element-focused evidence derived from the (deterministic) survey
   * processing so the workspace can persist it for the agent reasoning layer.
   */
  onElementEvidence?: (evidence: XpsElementEvidence) => void;
}

const CONFIDENCE_STYLE: Record<string, string> = {
  high: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  medium: 'bg-amber-50 border-amber-200 text-amber-700',
  low: 'bg-slate-50 border-slate-200 text-slate-600',
};

export function XpsElementAnalysisPanel({
  element,
  spectrumPoints,
  processingParams,
  onBackToSurvey,
  onElementEvidence,
}: XpsElementAnalysisPanelProps) {
  const regionWindow = getElementRegionWindow(element);
  const references = useMemo(() => getReferencesForElement(element), [element]);

  // Region-focused processing = the survey detection filtered to this element's
  // core-level window (deterministic, reproducible, traceable).
  const result = useMemo(() => {
    if (!spectrumPoints.length || !regionWindow) return null;
    const dataset: XpsDataset = {
      id: `element-view-${element}`,
      label: `${element} ${regionWindow.label}`,
      region: regionWindow.label,
      sampleName: 'Survey-derived element view',
      fileName: 'survey',
      signal: {
        bindingEnergy: spectrumPoints.map((p) => p.x),
        intensity: spectrumPoints.map((p) => p.y),
      },
      baseline: [],
      peaks: [],
      matches: [],
    };
    return runXpsProcessing(dataset, { ...processingParams, region: regionWindow.label });
  }, [element, spectrumPoints, processingParams, regionWindow]);

  const focusedSpectrum = useMemo(() => {
    if (!regionWindow) return spectrumPoints;
    return spectrumPoints.filter((p) => p.x >= regionWindow.min && p.x <= regionWindow.max);
  }, [spectrumPoints, regionWindow]);

  const matchedPeaks = result?.peaks ?? [];
  const aggregations: StateAggregation[] = result?.stateAggregations ?? [];
  const confidence = result?.confidence ?? 'low';
  const caveats = result?.caveats ?? [];

  // Emit element-focused evidence (deterministic, derived from the survey
  // processing) so the workspace can persist it for the agent reasoning layer.
  useEffect(() => {
    if (!onElementEvidence || !result || !regionWindow) return;
    const elementAggregations = aggregations.filter((agg) => agg.element === element);
    const elementMatches = result.matches?.filter((m) => m.element === element) ?? [];
    const firstMatch = elementMatches[0];
    const evidence: XpsElementEvidence = {
      selectedElement: element,
      candidateStates: elementAggregations.map((agg) => ({
        label: agg.state,
        confidence: levelToConfidence(agg.confidence),
        matchedPeaks: agg.matchedCount,
      })),
      satellitePresent: elementAggregations.some((agg) => agg.hasSatellite),
      regionWindow: { min: regionWindow.min, max: regionWindow.max },
      caveats: result.caveats,
      dbSource: firstMatch?.dbSource,
      sourceId: firstMatch?.sourceId,
      sourceDoi: firstMatch?.sourceDoi,
      matchSource: firstMatch?.matchSource,
      formula: firstMatch?.formula,
    };
    onElementEvidence(evidence);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [element, result, regionWindow]);

  return (
    <div className="min-h-0 flex-1 overflow-auto p-3 space-y-3">
      {/* Header / context */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Atom size={16} className="text-primary" />
          <div>
            <h3 className="text-sm font-bold text-text-main">
              Element Selection Analysis — {element}
            </h3>
            <p className="text-[11px] text-text-muted">
              Filtered interpretation of the survey scan
              {regionWindow ? ` · region ${regionWindow.label} (${regionWindow.min}–${regionWindow.max} eV)` : ''}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onBackToSurvey}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs font-semibold text-text-main hover:bg-surface-hover transition-colors"
        >
          <ArrowLeft size={13} /> Back to Survey
        </button>
      </div>

      {!regionWindow ? (
        <div className="rounded border border-border bg-surface-hover/30 p-3 text-xs text-text-muted">
          No canonical reference window is available for {element}.
        </div>
      ) : (
        <>
          {/* Focused spectrum (reuses the shared Graph component) */}
          <div className="rounded border border-border bg-background p-2">
            <div className="h-[260px]">
              <Graph
                type="xps"
                height="100%"
                externalData={focusedSpectrum}
                xAxisLabel="Binding energy (eV)"
                yAxisLabel="Counts"
                showBackground={false}
                showCalculated={false}
                showResidual={false}
              />
            </div>
          </div>

          {/* Scientific confidence indicator (evidence-bound, hedged) */}
          <div className="rounded border border-border bg-surface-hover/30 p-3">
            <div className="flex items-center gap-2">
              <Shield size={14} className="text-primary" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-text-main">
                Evidence confidence
              </span>
              <span
                className={`ml-auto rounded-full border px-2 py-0.5 text-[10px] font-semibold ${CONFIDENCE_STYLE[confidence] ?? CONFIDENCE_STYLE.low}`}
              >
                {confidence.toUpperCase()}
              </span>
            </div>
            {caveats.length > 0 && (
              <ul className="mt-2 space-y-1">
                {caveats.map((caveat, i) => (
                  <li key={i} className="text-[11px] leading-snug text-text-muted">
                    - {sanitizeScientificWording(caveat)}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 border-t border-border/60 pt-2 text-[10px] italic text-text-muted">
              {sanitizeScientificWording(
                `Region-focused evidence for ${element}; surface-sensitive assignment requires complementary validation and does not by itself establish bulk composition.`,
              )}
            </p>
          </div>

          {/* Core-level reference states (canonical) */}
          <div className="rounded border border-border bg-background">
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
              <BookOpen size={13} className="text-primary" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-text-main">
                Reference core-level states ({element})
              </span>
            </div>
            <table className="w-full text-left">
              <thead className="bg-surface-hover text-[10px] uppercase tracking-wide text-text-muted">
                <tr>
                  <th className="px-3 py-1.5 font-bold">Oxidation state</th>
                  <th className="px-3 py-1.5 font-bold">Core level</th>
                  <th className="px-3 py-1.5 font-bold">BE (eV)</th>
                  <th className="px-3 py-1.5 font-bold">Spin-orbit</th>
                  <th className="px-3 py-1.5 font-bold">Satellite</th>
                </tr>
              </thead>
              <tbody>
                {references.map((ref, i) => (
                  <tr key={`${ref.oxidationState}-${ref.coreLevel}-${i}`} className="border-t border-border/60 text-xs">
                    <td className="px-3 py-1.5 font-semibold text-text-main">{ref.oxidationState}</td>
                    <td className="px-3 py-1.5 font-mono text-text-main">{ref.coreLevel}</td>
                    <td className="px-3 py-1.5 font-mono text-text-main">{ref.bindingEnergy.toFixed(1)}</td>
                    <td className="px-3 py-1.5 text-text-muted">
                      {ref.spinOrbitSplitting != null ? `${ref.spinOrbitSplitting.toFixed(1)} eV` : '—'}
                    </td>
                    <td className="px-3 py-1.5 text-text-muted">
                      {ref.satelliteOffset != null
                        ? `+${ref.satelliteOffset.toFixed(1)} eV`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-3 py-1.5 text-[10px] text-text-muted">
              Source: {references[0]?.literatureSource ?? 'canonical XPS reference database'}
            </p>
          </div>

          {/* Matched peaks (from the same survey processing, region-focused) */}
          <div className="rounded border border-border bg-background">
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
              <Layers size={13} className="text-primary" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-text-main">
                Matched peaks in region ({matchedPeaks.length})
              </span>
            </div>
            {matchedPeaks.length > 0 ? (
              <table className="w-full text-left">
                <thead className="bg-surface-hover text-[10px] uppercase tracking-wide text-text-muted">
                  <tr>
                    <th className="px-3 py-1.5 font-bold">BE (eV)</th>
                    <th className="px-3 py-1.5 font-bold">Intensity</th>
                    <th className="px-3 py-1.5 font-bold">Candidate assignment</th>
                  </tr>
                </thead>
                <tbody>
                  {matchedPeaks.map((peak, i) => (
                    <tr key={i} className="border-t border-border/60 text-xs">
                      <td className="px-3 py-1.5 font-mono text-text-main">{peak.bindingEnergy.toFixed(1)}</td>
                      <td className="px-3 py-1.5 font-mono text-text-muted">{Math.round(peak.intensity)}</td>
                      <td className="px-3 py-1.5 text-text-muted">{peak.assignment || 'Unassigned'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="px-3 py-2 text-[11px] text-text-muted">
                No survey peaks fall within the {element} core-level window.
              </p>
            )}
          </div>

          {/* Oxidation-state candidates (state aggregations) */}
          {aggregations.length > 0 && (
            <div className="rounded border border-border bg-background">
              <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                <AlertTriangle size={13} className="text-amber-600" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-text-main">
                  Oxidation-state candidates
                </span>
              </div>
              <ul className="divide-y divide-border/60">
                {aggregations
                  .filter((agg) => agg.element === element)
                  .map((agg, i) => (
                    <li key={i} className="px-3 py-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-text-main">{agg.state}</span>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${CONFIDENCE_STYLE[agg.confidence] ?? CONFIDENCE_STYLE.low}`}
                        >
                          {agg.confidence.toUpperCase()}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-text-muted">
                        Orbitals: {agg.matchedOrbitals.join(', ') || '—'}
                        {agg.hasPrimary ? ' · primary present' : ''}
                        {agg.hasSpinOrbitPartner ? ' · spin-orbit partner' : ''}
                        {agg.hasSatellite ? ' · satellite evidence' : ''}
                      </p>
                      {agg.caveats.length > 0 && (
                        <p className="mt-0.5 text-[10px] italic text-amber-700">
                          {sanitizeScientificWording(agg.caveats[0])}
                        </p>
                      )}
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
