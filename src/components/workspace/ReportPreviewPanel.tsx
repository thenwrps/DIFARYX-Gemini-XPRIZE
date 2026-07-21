import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  EyeOff,
  FileDown,
  FileText,
  Loader2,
  Sparkles,
} from 'lucide-react';
import type { PeakResult, ReferencePresentation, TechniqueId, WorkspaceFile } from '../../utils/reportPreviewTypes';
import {
  exportReportAsDocx,
  exportReportAsMarkdown,
  exportReportAsPdf,
  type ReportData,
} from '../../utils/reportExportEngine';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AnalysisMode = 'gpt-5.6-scientific' | 'gemini-2.5-flash' | 'scientific-baseline';

interface ReportPreviewPanelProps {
  file: WorkspaceFile;
  mode: AnalysisMode;
  referenceContext: ReferencePresentation;
  expanded?: boolean;
}

interface SectionDef {
  id: string;
  label: string;
  labelTh: string;
  defaultEnabled: boolean;
}

const SECTION_DEFS: SectionDef[] = [
  { id: 'header', label: 'Title & Header', labelTh: 'ชื่อรายงานและ Header', defaultEnabled: true },
  { id: 'objective', label: 'Objective', labelTh: 'วัตถุประสงค์', defaultEnabled: true },
  { id: 'observations', label: 'Experimental Results', labelTh: 'ผลการทดลอง', defaultEnabled: true },
  { id: 'peakTable', label: 'Peak Table', labelTh: 'ตาราง Peak', defaultEnabled: true },
  { id: 'graph', label: 'Spectrum Graph', labelTh: 'ภาพกราฟ', defaultEnabled: true },
  { id: 'reference', label: 'Reference & Units', labelTh: 'Reference and units', defaultEnabled: true },
  { id: 'interpretation', label: 'Interpretation', labelTh: 'การตีความ', defaultEnabled: true },
  { id: 'validationGap', label: 'Validation Gap', labelTh: 'ข้อจำกัด', defaultEnabled: true },
  { id: 'nextAction', label: 'Next Experiment', labelTh: 'ทดลองถัดไป', defaultEnabled: true },
  { id: 'metadata', label: 'Reproducibility', labelTh: 'Metadata', defaultEnabled: true },
];

const MODE_LABELS: Record<AnalysisMode, string> = {
  'gpt-5.6-scientific': 'GPT-5.6 Scientific Reasoning',
  'gemini-2.5-flash': 'Gemini 2.5 Flash',
  'scientific-baseline': 'Scientific Baseline Mode',
};

const TECHNIQUE_LABELS: Record<TechniqueId, string> = {
  xrd: 'X-Ray Diffraction (XRD)',
  xps: 'X-Ray Photoelectron Spectroscopy (XPS)',
  ftir: 'Fourier-Transform Infrared Spectroscopy (FTIR)',
  raman: 'Raman Spectroscopy',
};

// ---------------------------------------------------------------------------
// Mini-graph rendered as pure SVG for the report preview
// ---------------------------------------------------------------------------

function MiniSpectrumSvg({
  points,
  peaks,
  xLabel,
  yLabel,
  technique,
}: {
  points: Array<{ x: number; y: number }>;
  peaks: PeakResult[];
  xLabel: string;
  yLabel: string;
  technique: TechniqueId;
}) {
  const w = 640;
  const h = 220;
  const pad = { top: 16, right: 24, bottom: 36, left: 52 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  if (points.length < 2) return null;

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys) * 0.95;
  const yMax = Math.max(...ys) * 1.05;

  const sx = (v: number) => pad.left + ((v - xMin) / (xMax - xMin)) * plotW;
  const sy = (v: number) => pad.top + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

  const pathD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`)
    .join(' ');

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ maxHeight: 220 }}>
      {/* grid */}
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <line
          key={f}
          x1={pad.left}
          x2={w - pad.right}
          y1={pad.top + plotH * (1 - f)}
          y2={pad.top + plotH * (1 - f)}
          stroke="#e2e8f0"
          strokeWidth={0.5}
        />
      ))}

      {/* signal */}
      <path d={pathD} fill="none" stroke="#2563eb" strokeWidth={1.5} />

      {/* peak markers */}
      {peaks.map((pk) => {
        const px = sx(pk.position);
        const nearest = points.reduce((best, p) =>
          Math.abs(p.x - pk.position) < Math.abs(best.x - pk.position) ? p : best,
        );
        const py = sy(nearest.y);
        return (
          <g key={pk.position}>
            <line x1={px} x2={px} y1={py - 6} y2={pad.top} stroke="#ef4444" strokeWidth={0.7} strokeDasharray="3,2" />
            <circle cx={px} cy={py} r={2.5} fill="#0f172a" />
            <text x={px} y={pad.top - 3} textAnchor="middle" fontSize={7} fill="#64748b">
              {pk.assignment}
            </text>
          </g>
        );
      })}

      {/* axes labels */}
      <text x={pad.left + plotW / 2} y={h - 4} textAnchor="middle" fontSize={9} fill="#64748b">
        {xLabel}
      </text>
      <text
        x={12}
        y={pad.top + plotH / 2}
        textAnchor="middle"
        fontSize={9}
        fill="#64748b"
        transform={`rotate(-90, 12, ${pad.top + plotH / 2})`}
      >
        {yLabel}
      </text>

      {/* axis ticks */}
      {[0, 0.25, 0.5, 0.75, 1].map((f) => {
        const v = xMin + f * (xMax - xMin);
        return (
          <text key={`x-${f}`} x={sx(v)} y={h - pad.bottom + 16} textAnchor="middle" fontSize={7.5} fill="#94a3b8">
            {v.toFixed(0)}
          </text>
        );
      })}
      {[0, 0.5, 1].map((f) => {
        const v = yMin + f * (yMax - yMin);
        return (
          <text key={`y-${f}`} x={pad.left - 6} y={sy(v) + 3} textAnchor="end" fontSize={7.5} fill="#94a3b8">
            {v.toFixed(0)}
          </text>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReportPreviewPanel({ file, mode, referenceContext, expanded = false }: ReportPreviewPanelProps) {
  const [enabledSections, setEnabledSections] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(SECTION_DEFS.map((s) => [s.id, s.defaultEnabled])),
  );
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [exporting, setExporting] = useState<'pdf' | 'docx' | 'md' | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const isAi = mode !== 'scientific-baseline';
  const techniqueLabel = TECHNIQUE_LABELS[file.technique];
  const modeLabel = MODE_LABELS[mode];
  const reportDate = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });

  const toggle = useCallback((id: string) => {
    setEnabledSections((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const toggleAll = useCallback((on: boolean) => {
    setEnabledSections(Object.fromEntries(SECTION_DEFS.map((s) => [s.id, on])));
  }, []);

  const reportData = useMemo((): ReportData => ({
    title: `${file.sampleId} — ${techniqueLabel} Evidence Review`,
    date: reportDate,
    projectId: file.id,
    technique: file.technique,
    techniqueLabel,
    filename: file.filename,
    instrument: file.instrument,
    sampleId: file.sampleId,
    analysisMode: mode,
    modeLabel,
    objective: `Evaluate technique-specific evidence for the ${file.sampleId} experimental system.`,
    observation: file.observation,
    interpretation: isAi ? file.interpretation : 'Advanced interpretation unavailable in Scientific Baseline Mode.',
    validationGap: file.validationGap,
    nextExperiment: file.nextExperiment,
    quality: file.quality,
    peaks: file.peaks,
    points: file.points,
    xLabel: file.xLabel,
    yLabel: file.yLabel,
    reference: referenceContext,
    sourceDigest: 'sha256:9f2…c18',
    processingVersion: 'baseline-v2.4 · peaks-v1.9',
    enabledSections,
  }), [file, mode, isAi, techniqueLabel, modeLabel, reportDate, referenceContext, enabledSections]);

  const handleExport = useCallback(async (format: 'pdf' | 'docx' | 'md') => {
    setExporting(format);
    try {
      if (format === 'md') {
        exportReportAsMarkdown(reportData);
      } else if (format === 'docx') {
        await exportReportAsDocx(reportData);
      } else if (format === 'pdf' && previewRef.current) {
        await exportReportAsPdf(previewRef.current, reportData.title);
      }
    } catch (err) {
      console.error(`Export ${format} failed:`, err);
    } finally {
      setExporting(null);
    }
  }, [reportData]);

  // Count how many sections are enabled
  const enabledCount = Object.values(enabledSections).filter(Boolean).length;

  return (
    <div className={`flex min-h-0 min-w-0 max-w-full gap-0 ${expanded ? 'h-full' : ''}`}>
      {/* ---- Section toggles sidebar ---- */}
      {sidebarOpen && (
        <div className="flex w-[200px] shrink-0 flex-col border-r border-slate-200 bg-slate-50/80">
          <div className="flex h-9 items-center justify-between border-b border-slate-200 px-3">
            <span className="text-[10px] font-bold text-slate-700">Report sections</span>
            <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[8.5px] font-bold text-slate-600">
              {enabledCount}/{SECTION_DEFS.length}
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
            <div className="mb-2 flex gap-1">
              <button
                type="button"
                onClick={() => toggleAll(true)}
                className="flex h-6 flex-1 items-center justify-center gap-1 rounded bg-blue-50 text-[8.5px] font-semibold text-blue-700 hover:bg-blue-100"
              >
                <Eye size={10} /> All on
              </button>
              <button
                type="button"
                onClick={() => toggleAll(false)}
                className="flex h-6 flex-1 items-center justify-center gap-1 rounded bg-slate-100 text-[8.5px] font-semibold text-slate-600 hover:bg-slate-200"
              >
                <EyeOff size={10} /> All off
              </button>
            </div>
            <div className="space-y-0.5">
              {SECTION_DEFS.map((section) => {
                const on = enabledSections[section.id];
                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => toggle(section.id)}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${
                      on ? 'bg-white ring-1 ring-blue-200' : 'hover:bg-white/60'
                    }`}
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-white transition-colors ${
                        on ? 'border-blue-600 bg-blue-600' : 'border-slate-300 bg-white'
                      }`}
                    >
                      {on && <Check size={10} strokeWidth={3} />}
                    </span>
                    <span className="min-w-0">
                      <span className={`block truncate text-[9.5px] font-semibold ${on ? 'text-slate-900' : 'text-slate-500'}`}>
                        {section.label}
                      </span>
                      <span className="block truncate text-[8px] text-slate-400">{section.labelTh}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Export buttons */}
          <div className="shrink-0 space-y-1 border-t border-slate-200 p-2">
            <button
              type="button"
              onClick={() => handleExport('pdf')}
              disabled={exporting !== null}
              className="flex h-7 w-full items-center justify-center gap-1.5 rounded-md bg-red-600 text-[9.5px] font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {exporting === 'pdf' ? <Loader2 size={11} className="animate-spin" /> : <FileDown size={11} />}
              Export PDF
            </button>
            <button
              type="button"
              onClick={() => handleExport('docx')}
              disabled={exporting !== null}
              className="flex h-7 w-full items-center justify-center gap-1.5 rounded-md bg-blue-600 text-[9.5px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {exporting === 'docx' ? <Loader2 size={11} className="animate-spin" /> : <FileText size={11} />}
              Export DOCX
            </button>
            <button
              type="button"
              onClick={() => handleExport('md')}
              disabled={exporting !== null}
              className="flex h-7 w-full items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white text-[9.5px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {exporting === 'md' ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />}
              Export Markdown
            </button>
          </div>
        </div>
      )}

      {/* ---- Toggle sidebar button ---- */}
      <button
        type="button"
        onClick={() => setSidebarOpen((p) => !p)}
        className="flex w-5 shrink-0 items-center justify-center bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
        aria-label={sidebarOpen ? 'Collapse section panel' : 'Expand section panel'}
      >
        {sidebarOpen ? <ChevronDown size={12} className="rotate-90" /> : <ChevronUp size={12} className="rotate-90" />}
      </button>

      {/* ---- Document Preview ---- */}
      <div className="min-h-0 min-w-0 flex-1 overflow-auto bg-slate-200/60 p-4">
        <div
          ref={previewRef}
          className="mx-auto w-full max-w-[720px] rounded-sm bg-white shadow-[0_2px_20px_rgba(0,0,0,0.08)]"
          style={{
            fontFamily: '"Georgia", "Times New Roman", "Noto Serif", serif',
            padding: '48px 52px 40px',
            minHeight: expanded ? 600 : 420,
          }}
        >
          {/* ---------- Header ---------- */}
          {enabledSections.header && (
            <div className="mb-6 border-b-2 border-slate-800 pb-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p
                    className="text-[10px] font-bold uppercase tracking-[0.15em]"
                    style={{ fontFamily: '"Calibri", "Helvetica Neue", sans-serif', color: '#2563eb' }}
                  >
                    DIFARYX Scientific Analysis Report
                  </p>
                  <h1 className="mt-1.5 text-[18px] font-bold leading-tight text-slate-950">
                    {file.sampleId} — {techniqueLabel.split(' (')[0]} Evidence Review
                  </h1>
                  <p className="mt-1 text-[10px] text-slate-500" style={{ fontFamily: 'sans-serif' }}>
                    {reportDate} · {file.filename} · {modeLabel}
                  </p>
                </div>
                <span
                  className="shrink-0 rounded border border-amber-400 bg-amber-50 px-2 py-0.5 text-[9px] font-bold text-amber-700"
                  style={{ fontFamily: 'sans-serif' }}
                >
                  DRAFT
                </span>
              </div>
              <div
                className="mt-3 grid grid-cols-4 gap-2 text-[9px]"
                style={{ fontFamily: '"Calibri", sans-serif' }}
              >
                {[
                  ['Sample', file.sampleId],
                  ['Instrument', file.instrument],
                  ['Technique', TECHNIQUE_LABELS[file.technique].split(' (')[0]],
                  ['Data quality', file.quality.split(';')[0]],
                ].map(([k, v]) => (
                  <div key={k} className="rounded bg-slate-50 px-2 py-1.5">
                    <p className="font-semibold text-slate-500">{k}</p>
                    <p className="mt-0.5 font-bold text-slate-800">{v}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ---------- Content sections ---------- */}
          <div className="space-y-5">
            <SectionRenderer id="objective" num={1} title="Objective" enabled={enabledSections.objective} enabledSections={enabledSections}>
              <p className="text-[11px] leading-[1.65] text-slate-700">
                Evaluate technique-specific evidence for the {file.sampleId} experimental system.
              </p>
            </SectionRenderer>

            <SectionRenderer id="observations" num={2} title="Experimental Observations" enabled={enabledSections.observations} enabledSections={enabledSections}>
              <p className="text-[11px] leading-[1.65] text-slate-700">{file.observation}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {file.peaks.slice(0, 5).map((pk) => (
                  <span
                    key={pk.position}
                    className="rounded bg-blue-50 px-1.5 py-0.5 text-[9px] font-semibold text-blue-800"
                    style={{ fontFamily: 'sans-serif' }}
                  >
                    {pk.position} {file.technique === 'xrd' ? '° 2θ' : file.technique === 'xps' ? 'eV' : 'cm⁻¹'} · {pk.assignment}
                  </span>
                ))}
              </div>
            </SectionRenderer>

            <SectionRenderer id="peakTable" num={3} title="Detected Features" enabled={enabledSections.peakTable} enabledSections={enabledSections}>
              <div className="overflow-x-auto">
                <table
                  className="w-full border-collapse text-[9.5px]"
                  style={{ fontFamily: '"Calibri", sans-serif' }}
                >
                  <thead>
                    <tr className="border-b-2 border-slate-300 text-left text-slate-600">
                      <th className="py-1.5 pr-2 font-semibold">#</th>
                      <th className="py-1.5 pr-2 font-semibold">Position</th>
                      <th className="py-1.5 pr-2 font-semibold">Intensity</th>
                      <th className="py-1.5 pr-2 font-semibold">{file.technique === 'xrd' ? 'd-spacing' : 'Spacing'}</th>
                      <th className="py-1.5 pr-2 font-semibold">Assignment</th>
                      <th className="py-1.5 pr-2 font-semibold">Reference</th>
                      <th className="py-1.5 pr-2 font-semibold">Score</th>
                      <th className="py-1.5 font-semibold">Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {file.peaks.map((pk, i) => (
                      <tr key={pk.position} className="border-b border-slate-100">
                        <td className="py-1.5 pr-2 text-slate-400">{i + 1}</td>
                        <td className="py-1.5 pr-2 font-mono font-semibold text-slate-900">
                          {pk.position.toFixed(2)}
                        </td>
                        <td className="py-1.5 pr-2 font-mono text-slate-700">{pk.intensity.toFixed(1)}</td>
                        <td className="py-1.5 pr-2 font-mono text-slate-600">{pk.spacing}</td>
                        <td className="py-1.5 pr-2 font-semibold text-slate-800">{pk.assignment}</td>
                        <td className="py-1.5 pr-2 text-slate-600">{pk.reference}</td>
                        <td className="py-1.5 pr-2 font-mono font-semibold text-slate-800">
                          {(pk.score * 100).toFixed(0)}%
                        </td>
                        <td className="py-1.5">
                          <span
                            className={`rounded px-1 py-0.5 text-[8.5px] font-bold ${
                              pk.confidence === 'High'
                                ? 'bg-emerald-50 text-emerald-700'
                                : pk.confidence === 'Medium'
                                  ? 'bg-blue-50 text-blue-700'
                                  : 'bg-amber-50 text-amber-800'
                            }`}
                            style={{ fontFamily: 'sans-serif' }}
                          >
                            {pk.confidence}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionRenderer>

            <SectionRenderer id="graph" num={4} title="Spectrum Graph" enabled={enabledSections.graph} enabledSections={enabledSections}>
              <div className="rounded border border-slate-200 bg-slate-50/50 p-3">
                <MiniSpectrumSvg
                  points={file.points}
                  peaks={file.peaks}
                  xLabel={file.xLabel}
                  yLabel={file.yLabel}
                  technique={file.technique}
                />
                <p className="mt-2 text-center text-[8.5px] text-slate-500" style={{ fontFamily: 'sans-serif' }}>
                  Figure 1. {techniqueLabel.split(' (')[0]} spectrum of {file.sampleId} · {file.xLabel} vs {file.yLabel}
                </p>
              </div>
            </SectionRenderer>

            <SectionRenderer id="reference" num={5} title={`${techniqueLabel.split(' (')[0]} Reference and Units`} enabled={enabledSections.reference} enabledSections={enabledSections}>
              <div className="rounded border border-slate-200 bg-slate-50 p-3" style={{ fontFamily: 'sans-serif' }}>
                <div className="grid grid-cols-2 gap-x-5 gap-y-2 text-[9.5px]">
                  {[
                    ['Provider', referenceContext.provider],
                    ['Version', referenceContext.version],
                    ['License', referenceContext.license],
                    ['Approval status', referenceContext.approvalStatus],
                    ...(referenceContext.importedFile ? [['Imported file', referenceContext.importedFile.filename]] : []),
                  ].map(([label, value]) => (
                    <div key={label} className="min-w-0">
                      <p className="font-semibold text-slate-500">{label}</p>
                      <p className="mt-0.5 break-words font-semibold text-slate-800">{value}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 border-t border-slate-200 pt-2">
                  <p className="text-[9px] font-bold text-slate-700">Technique-specific units</p>
                  <div className="mt-1.5 grid grid-cols-2 gap-x-5 gap-y-1.5 text-[9px]">
                    {referenceContext.unitRows.map((row) => (
                      <div key={row.label} className="flex min-w-0 items-start justify-between gap-2">
                        <span className="text-slate-500">{row.label}</span>
                        <span className="text-right font-semibold text-slate-800">{row.value}{row.unit ? ` ${row.unit}` : ''}{row.status ? ` (${row.status})` : ''}</span>
                      </div>
                    ))}
                  </div>
                </div>
                {referenceContext.certificationRemark && (
                  <div className="mt-3 rounded border border-amber-200 bg-amber-50 px-2.5 py-2 text-[9.5px] leading-[1.55] text-amber-950">
                    <span className="font-bold">Reference validation remark:</span> {referenceContext.certificationRemark}
                  </div>
                )}
              </div>
            </SectionRenderer>

            <SectionRenderer id="interpretation" num={6} title="Interpretation" enabled={enabledSections.interpretation} enabledSections={enabledSections}>
              {isAi ? (
                <div>
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <Sparkles size={10} className="text-blue-600" />
                    <span className="text-[8.5px] font-bold text-blue-700" style={{ fontFamily: 'sans-serif' }}>
                      {MODE_LABELS[mode]}
                    </span>
                  </div>
                  <p className="text-[11px] leading-[1.65] text-slate-700">{file.interpretation}</p>
                </div>
              ) : (
                <p className="text-[11px] italic text-slate-500">
                  Advanced interpretation unavailable in Scientific Baseline Mode.
                </p>
              )}
            </SectionRenderer>

            <SectionRenderer id="validationGap" num={6} title="Validation Gap" enabled={enabledSections.validationGap} enabledSections={enabledSections}>
              <div className="rounded border-l-[3px] border-amber-400 bg-amber-50/60 py-2 pl-3 pr-2">
                <p className="text-[10px] font-bold text-amber-800" style={{ fontFamily: 'sans-serif' }}>
                  Validation-limited
                </p>
                <p className="mt-1 text-[11px] leading-[1.65] text-amber-900/80">{file.validationGap}</p>
              </div>
            </SectionRenderer>

            <SectionRenderer id="nextAction" num={7} title="Recommended Next Experiment" enabled={enabledSections.nextAction} enabledSections={enabledSections}>
              <p className="text-[11px] leading-[1.65] text-slate-700">{file.nextExperiment}</p>
            </SectionRenderer>

            <SectionRenderer id="metadata" num={8} title="Reproducibility Metadata" enabled={enabledSections.metadata} enabledSections={enabledSections}>
              <div
                className="rounded bg-slate-50 p-3 text-[9.5px]"
                style={{ fontFamily: '"Calibri", sans-serif' }}
              >
                <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                  {[
                    ['Source digest', 'sha256:9f2…c18'],
                    ['Processing', 'baseline-v2.4 · peaks-v1.9'],
                    ['Analysis mode', modeLabel],
                    ['Data quality', file.quality],
                    ['Source file', file.filename],
                    ['Instrument', file.instrument],
                  ].map(([k, v]) => (
                    <div key={k} className="flex gap-1.5">
                      <span className="font-semibold text-slate-500">{k}:</span>
                      <span className="font-mono font-semibold text-slate-800">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </SectionRenderer>
          </div>

          {/* ---------- Footer ---------- */}
          <div className="mt-8 border-t border-slate-300 pt-3 text-center text-[8.5px] text-slate-400" style={{ fontFamily: 'sans-serif' }}>
            Generated by <span className="font-bold text-blue-600">DIFARYX</span> — Scientific Workflow Intelligence · {reportDate}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section renderer — handles numbering based on which sections are enabled
// ---------------------------------------------------------------------------

function SectionRenderer({
  id,
  num,
  title,
  enabled,
  enabledSections,
  children,
}: {
  id: string;
  num: number;
  title: string;
  enabled: boolean;
  enabledSections: Record<string, boolean>;
  children: React.ReactNode;
}) {
  if (!enabled) return null;

  // Calculate real section number based on enabled sections
  const orderedIds = SECTION_DEFS.filter((s) => s.id !== 'header').map((s) => s.id);
  let realNum = 0;
  for (const sid of orderedIds) {
    if (enabledSections[sid]) realNum++;
    if (sid === id) break;
  }

  return (
    <section>
      <h2
        className="mb-1.5 text-[12.5px] font-bold text-slate-950"
        style={{ fontFamily: '"Calibri", "Helvetica Neue", sans-serif' }}
      >
        {realNum}. {title}
      </h2>
      {children}
    </section>
  );
}
