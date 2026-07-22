/**
 * XRD Readiness Panel (Phase R1A extraction)
 *
 * Displays XRD analysis readiness state based on signal, reference set,
 * known elements, and declared phases.
 *
 * Receives props only; does not read localStorage.
 */

import React from 'react';
import { CheckCircle2 } from 'lucide-react';

type XRDReadinessAnalysisMode =
  | 'signal_processing_only'
  | 'candidate_screening'
  | 'targeted_candidate_match'
  | 'not_ready';

interface XRDReadinessPanelProps {
  analysisMode: XRDReadinessAnalysisMode;
  hasSignal: boolean;
  hasReferenceSet: boolean;
  hasKnownElements: boolean;
  hasDeclaredPhases: boolean;
  referenceMatchEnabled: boolean;
  message: string;
  tone: 'neutral' | 'info' | 'warning';
}

function formatAnalysisMode(mode: XRDReadinessAnalysisMode): string {
  switch (mode) {
    case 'signal_processing_only':
      return 'Signal processing only';
    case 'candidate_screening':
      return 'Candidate screening';
    case 'targeted_candidate_match':
      return 'Targeted candidate match';
    case 'not_ready':
      return 'Not ready';
    default:
      return mode;
  }
}

function Panel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-sm border border-border bg-surface">
      <div className="flex items-center gap-1.5 border-b border-border px-2 py-1.5">
        <span className="text-text-muted">{icon}</span>
        <h3 className="text-xs font-bold uppercase tracking-wide text-text-muted">{title}</h3>
      </div>
      <div className="space-y-2 px-2 py-2 text-[11px] leading-relaxed">{children}</div>
    </div>
  );
}

function XRDStatusText({ tone, children }: { tone: 'neutral' | 'info' | 'warning'; children: React.ReactNode }) {
  const bgClass = {
    neutral: 'bg-slate-50 border-slate-200 text-slate-700',
    info: 'bg-blue-50 border-blue-200 text-blue-700',
    warning: 'bg-amber-50 border-amber-200 text-amber-700',
  }[tone];

  return (
    <p className={`rounded border px-2 py-1.5 text-[10px] leading-relaxed ${bgClass}`}>
      {children}
    </p>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-[10px]">
      <span className="font-semibold text-text-muted">{label}</span>
      <span className="font-mono text-text-main">{value}</span>
    </div>
  );
}

export function XRDReadinessPanel({
  analysisMode,
  hasSignal,
  hasReferenceSet,
  hasKnownElements,
  hasDeclaredPhases,
  referenceMatchEnabled,
  message,
  tone,
}: XRDReadinessPanelProps) {
  return (
    <Panel title="XRD Readiness" icon={<CheckCircle2 size={13} />}>
      <XRDStatusText tone={tone}>{message}</XRDStatusText>
      <div className="mt-2 grid grid-cols-2 gap-1">
        <Metric label="Analysis mode" value={formatAnalysisMode(analysisMode)} />
        <Metric label="Signal" value={hasSignal ? 'Available' : 'Not ready'} />
        <Metric label="Reference set" value={hasReferenceSet ? 'Selected' : 'Required'} />
        <Metric label="Known elements" value={hasKnownElements ? 'Provided' : 'Not provided'} />
        <Metric label="Declared phases" value={hasDeclaredPhases ? 'Provided' : 'Optional'} />
        <Metric label="Reference match" value={referenceMatchEnabled ? 'Enabled' : 'Disabled'} />
      </div>
      <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1.5">
        <p className="text-[9px] font-bold uppercase tracking-wide text-amber-900">Boundary</p>
        <ul className="mt-1 space-y-0.5 text-[10px] leading-relaxed text-amber-900">
          <li>No chemical identity confirmation.</li>
          <li>No phase purity confirmation.</li>
          <li>Candidate evidence only when reference matching is used.</li>
        </ul>
      </div>
    </Panel>
  );
}
