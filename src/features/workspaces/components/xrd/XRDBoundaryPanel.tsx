/**
 * XRD Boundary Panel (Phase R1A extraction)
 *
 * Displays XRD claim boundary parameters and controls.
 *
 * Receives props only; does not read localStorage.
 */

import React from 'react';
import { Lock } from 'lucide-react';

interface XRDBoundaryPanelProps {
  enabled: boolean;
  claimMode: string;
  requireComplementaryEvidence: boolean;
  requireReferenceSetForMatch: boolean;
  requireSampleContextForTargetedMatch: boolean;
  allowIdentityClaim: boolean;
  allowPhasePurityClaim: boolean;
  claimModeOptions: Array<{ value: string; label: string }>;
  onEnabledChange: (enabled: boolean) => void;
  onClaimModeChange: (claimMode: string) => void;
  onRequireComplementaryEvidenceChange: (value: boolean) => void;
  onRequireReferenceSetForMatchChange: (value: boolean) => void;
  onRequireSampleContextForTargetedMatchChange: (value: boolean) => void;
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

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-[10px]">
      <span className="font-semibold text-text-muted">{label}</span>
      <span className="font-mono text-text-main">{value}</span>
    </div>
  );
}

export function XRDBoundaryPanel({
  enabled,
  claimMode,
  requireComplementaryEvidence,
  requireReferenceSetForMatch,
  requireSampleContextForTargetedMatch,
  allowIdentityClaim,
  allowPhasePurityClaim,
  claimModeOptions,
  onEnabledChange,
  onClaimModeChange,
  onRequireComplementaryEvidenceChange,
  onRequireReferenceSetForMatchChange,
  onRequireSampleContextForTargetedMatchChange,
}: XRDBoundaryPanelProps) {
  return (
    <Panel title="Boundary" icon={<Lock size={13} />}>
      <XRDStatusText tone="warning">
        Identity confirmation and phase purity confirmation remain blocked.
      </XRDStatusText>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="col-span-2">
          <XRDToggleField
            label="Boundary gate"
            checked={enabled}
            onChange={onEnabledChange}
          />
        </div>
        <div className="col-span-2">
          <XRDSelectField
            label="Claim mode"
            value={claimMode}
            options={claimModeOptions}
            onChange={onClaimModeChange}
          />
        </div>
        <XRDToggleField
          label="Require complementary evidence"
          checked={requireComplementaryEvidence}
          onChange={onRequireComplementaryEvidenceChange}
        />
        <XRDToggleField
          label="Require reference set"
          checked={requireReferenceSetForMatch}
          onChange={onRequireReferenceSetForMatchChange}
        />
        <div className="col-span-2">
          <XRDToggleField
            label="Require sample context for targeted match"
            checked={requireSampleContextForTargetedMatch}
            onChange={onRequireSampleContextForTargetedMatchChange}
          />
        </div>
      </div>
      <div className="mt-2 space-y-1">
        <Metric label="Identity confirmation" value={allowIdentityClaim ? 'Enabled' : 'Blocked'} />
        <Metric label="Phase purity confirmation" value={allowPhasePurityClaim ? 'Enabled' : 'Blocked'} />
      </div>
    </Panel>
  );
}
