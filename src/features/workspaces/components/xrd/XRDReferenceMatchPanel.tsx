/**
 * XRD Reference Match Panel (Phase R1C extraction)
 *
 * Displays XRD reference candidate matching controls and parameters.
 *
 * Receives props only; does not read localStorage or call backend.
 */

import React from 'react';
import { FileText } from 'lucide-react';

interface XRDReferenceMatchPanelProps {
  // Reference match parameters
  enabled: boolean;
  matchMode: string;
  referenceSource: string;
  candidatePhaseIds: string[];
  toleranceTwoTheta: number;
  minMatchedPeaks: number;
  minCoverageRatio: number;
  minScore: number;
  useRelativeIntensity: boolean;
  intensityToleranceRatio: number;
  allowUnknownSearch: boolean;
  allowIdentityClaim: boolean;
  allowPhasePurityClaim: boolean;
  
  // Options
  matchModeOptions: Array<{ value: string; label: string }>;
  referenceSourceOptions: Array<{ value: string; label: string }>;
  analysisMode: string;
  analysisModeOptions: Array<{ value: string; label: string }>;
  
  // Callbacks
  onEnabledChange: (enabled: boolean) => void;
  onMatchModeChange: (matchMode: string) => void;
  onReferenceSourceChange: (referenceSource: string) => void;
  onAnalysisModeChange: (analysisMode: string) => void;
  onCandidatePhaseIdsChange: (candidatePhaseIds: string) => void;
  onToleranceTwoThetaChange: (toleranceTwoTheta: number) => void;
  onMinMatchedPeaksChange: (minMatchedPeaks: number) => void;
  onMinCoverageRatioChange: (minCoverageRatio: number) => void;
  onMinScoreChange: (minScore: number) => void;
  onUseRelativeIntensityChange: (useRelativeIntensity: boolean) => void;
  onIntensityToleranceRatioChange: (intensityToleranceRatio: number) => void;
  onAllowUnknownSearchChange: (allowUnknownSearch: boolean) => void;
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

function XRDToggleField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-2 text-[10px]">
      <span className="font-semibold text-text-muted">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3 w-3 cursor-pointer rounded border-border text-primary focus:ring-1 focus:ring-primary"
      />
    </label>
  );
}

function XRDSelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-[10px]">
      <span className="font-semibold text-text-muted">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border border-border bg-surface px-1.5 py-1 text-[10px] text-text-main focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function XRDTextField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-[10px]">
      <span className="font-semibold text-text-muted">{label}</span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border border-border bg-surface px-1.5 py-1 text-[10px] text-text-main placeholder:text-text-muted/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      />
    </label>
  );
}

function XRDNumberField({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-[10px]">
      <span className="flex items-center justify-between gap-2 font-semibold text-text-muted">
        {label}
        {unit && <span className="font-normal">{unit}</span>}
      </span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="rounded border border-border bg-surface px-1.5 py-1 text-[10px] text-text-main focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      />
    </label>
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

export function XRDReferenceMatchPanel({
  enabled,
  matchMode,
  referenceSource,
  candidatePhaseIds,
  toleranceTwoTheta,
  minMatchedPeaks,
  minCoverageRatio,
  minScore,
  useRelativeIntensity,
  intensityToleranceRatio,
  allowUnknownSearch,
  allowIdentityClaim,
  allowPhasePurityClaim,
  matchModeOptions,
  referenceSourceOptions,
  analysisMode,
  analysisModeOptions,
  onEnabledChange,
  onMatchModeChange,
  onReferenceSourceChange,
  onAnalysisModeChange,
  onCandidatePhaseIdsChange,
  onToleranceTwoThetaChange,
  onMinMatchedPeaksChange,
  onMinCoverageRatioChange,
  onMinScoreChange,
  onUseRelativeIntensityChange,
  onIntensityToleranceRatioChange,
  onAllowUnknownSearchChange,
}: XRDReferenceMatchPanelProps) {
  return (
    <Panel title="Reference Candidate Match" icon={<FileText size={13} />}>
      <div className="space-y-1.5">
        <XRDStatusText tone="info">XRD reference matching is candidate evidence only.</XRDStatusText>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="col-span-2">
          <XRDToggleField
            label="Reference match"
            checked={enabled}
            onChange={onEnabledChange}
          />
        </div>
        <div className="col-span-2">
          <XRDSelectField
            label="Match mode"
            value={matchMode}
            options={matchModeOptions}
            onChange={onMatchModeChange}
          />
        </div>
        <div className="col-span-2 grid grid-cols-2 gap-2">
          <XRDSelectField
            label="Reference source"
            value={referenceSource}
            options={referenceSourceOptions}
            onChange={onReferenceSourceChange}
          />
          <XRDSelectField
            label="Analysis mode"
            value={analysisMode}
            options={analysisModeOptions}
            onChange={onAnalysisModeChange}
          />
        </div>
        <div className="col-span-2">
          <XRDTextField
            label="Candidate phase ids"
            value={(candidatePhaseIds || []).join(', ')}
            onChange={onCandidatePhaseIdsChange}
            placeholder="e.g. cofe2o4_icsd_15342, sba15_amorphous_reference"
          />
        </div>
      </div>
      
      {/* Overview Metrics for Advanced Matching Parameters */}
      <div className="mt-3 rounded border border-border bg-slate-50/50 p-2">
        <h4 className="mb-2 text-[10px] font-semibold text-text-muted">Advanced parameters</h4>
        <div className="space-y-1">
          <Metric label="2theta tolerance" value={`${toleranceTwoTheta} deg`} />
          <Metric label="Min matched peaks" value={minMatchedPeaks} />
          <Metric label="Min coverage ratio" value={minCoverageRatio} />
          <Metric label="Min score" value={minScore} />
          <Metric label="Relative intensity" value={useRelativeIntensity ? 'Enabled' : 'Disabled'} />
          {useRelativeIntensity && <Metric label="Intensity tolerance" value={intensityToleranceRatio} />}
          <Metric label="Unknown search" value={allowUnknownSearch ? 'Enabled' : 'Disabled'} />
        </div>
      </div>

      <div className="mt-2 space-y-1">
        <Metric label="Identity claim" value={allowIdentityClaim ? 'Enabled' : 'Blocked'} />
        <Metric label="Phase purity claim" value={allowPhasePurityClaim ? 'Enabled' : 'Blocked'} />
      </div>
    </Panel>
  );
}
