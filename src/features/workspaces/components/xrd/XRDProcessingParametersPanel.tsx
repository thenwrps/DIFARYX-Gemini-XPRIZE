/**
 * XRD Processing Parameters Panel (Phase R1D extraction)
 *
 * Displays XRD processing parameter controls for range, radiation, baseline,
 * smoothing, peak detection, and peak fitting.
 *
 * Receives props only; does not read localStorage or call backend.
 */

import React from 'react';
import { FlaskConical, GitBranch, Search, Sparkles } from 'lucide-react';
import type { XRDParameters, XRDBaselineMethod, XRDSmoothingMethod, XRDPeakFitModel } from '../../../../types/xrdParameters';

interface XRDProcessingParametersPanelProps {
  // Parameter groups
  range: XRDParameters['range'];
  radiation: XRDParameters['radiation'];
  baseline: XRDParameters['baseline'];
  smoothing: XRDParameters['smoothing'];
  peakDetection: XRDParameters['peakDetection'];
  peakFitting: XRDParameters['peakFitting'];
  
  // Options
  baselineMethodOptions: Array<{ value: string; label: string }>;
  smoothingMethodOptions: Array<{ value: string; label: string }>;
  peakFitModelOptions: Array<{ value: string; label: string }>;
  
  // Callbacks
  onRangeChange: (updates: Partial<XRDParameters['range']>) => void;
  onRadiationChange: (updates: Partial<XRDParameters['radiation']>) => void;
  onBaselineChange: (updates: Partial<XRDParameters['baseline']>) => void;
  onSmoothingChange: (updates: Partial<XRDParameters['smoothing']>) => void;
  onPeakDetectionChange: (updates: Partial<XRDParameters['peakDetection']>) => void;
  onPeakFittingChange: (updates: Partial<XRDParameters['peakFitting']>) => void;
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

function XRDFieldLabel({ label, unit }: { label: string; unit?: string }) {
  return (
    <span className="flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-wide text-text-muted">
      {label}
      {unit && <span className="normal-case tracking-normal">{unit}</span>}
    </span>
  );
}

function XRDReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border bg-background px-2 py-1.5">
      <XRDFieldLabel label={label} />
      <div className="mt-1 flex h-8 items-center rounded border border-border bg-slate-50 px-2 text-xs font-semibold text-text-main">
        {value}
      </div>
    </div>
  );
}

function XRDToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
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

function getXrdRadiationSourceLabel(source: string) {
  if (source === 'cu_ka') return 'Cu Kα';
  return source;
}

export function XRDProcessingParametersPanel({
  range,
  radiation,
  baseline,
  smoothing,
  peakDetection,
  peakFitting,
  baselineMethodOptions,
  smoothingMethodOptions,
  peakFitModelOptions,
  onRangeChange,
  onRadiationChange,
  onBaselineChange,
  onSmoothingChange,
  onPeakDetectionChange,
  onPeakFittingChange,
}: XRDProcessingParametersPanelProps) {
  return (
    <>
      <Panel title="Range & Radiation" icon={<FlaskConical size={13} />}>
        <div className="grid grid-cols-2 gap-2">
          <XRDNumberField
            label="2theta min"
            value={range.twoThetaMin}
            min={0}
            max={180}
            step={0.1}
            unit="deg"
            onChange={(twoThetaMin) => onRangeChange({ twoThetaMin })}
          />
          <XRDNumberField
            label="2theta max"
            value={range.twoThetaMax}
            min={0}
            max={180}
            step={0.1}
            unit="deg"
            onChange={(twoThetaMax) => onRangeChange({ twoThetaMax })}
          />
          <XRDReadOnlyField label="Radiation source" value={getXrdRadiationSourceLabel(radiation.source)} />
          <XRDNumberField
            label="Wavelength"
            value={radiation.wavelengthAngstrom}
            min={0}
            step={0.0001}
            unit="angstrom"
            onChange={(wavelengthAngstrom) => onRadiationChange({ wavelengthAngstrom })}
          />
        </div>
      </Panel>

      <Panel title="Baseline" icon={<GitBranch size={13} />}>
        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2">
            <XRDSelectField
              label="Method"
              value={baseline.method}
              options={baselineMethodOptions}
              onChange={(method) => onBaselineChange({ method: method as XRDBaselineMethod })}
            />
          </div>
          <XRDNumberField
            label="Lambda"
            value={baseline.lambda}
            min={0}
            step={1000}
            onChange={(lambda) => onBaselineChange({ lambda })}
          />
          <XRDNumberField
            label="p"
            value={baseline.p}
            min={0}
            max={1}
            step={0.01}
            onChange={(p) => onBaselineChange({ p })}
          />
        </div>
      </Panel>

      <Panel title="Smoothing" icon={<GitBranch size={13} />}>
        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2">
            <XRDSelectField
              label="Method"
              value={smoothing.method}
              options={smoothingMethodOptions}
              onChange={(method) => onSmoothingChange({ method: method as XRDSmoothingMethod })}
            />
          </div>
          <XRDNumberField
            label="Window size"
            value={smoothing.windowSize}
            min={1}
            step={2}
            onChange={(windowSize) => onSmoothingChange({ windowSize })}
          />
          <XRDNumberField
            label="Polynomial order"
            value={smoothing.polynomialOrder}
            min={0}
            step={1}
            onChange={(polynomialOrder) => onSmoothingChange({ polynomialOrder })}
          />
        </div>
      </Panel>

      <Panel title="Peak Detection" icon={<Search size={13} />}>
        <div className="grid grid-cols-2 gap-2">
          <XRDNumberField
            label="Min prominence"
            value={peakDetection.minProminence}
            min={0}
            max={1}
            step={0.01}
            onChange={(minProminence) => onPeakDetectionChange({ minProminence })}
          />
          <XRDNumberField
            label="Min distance"
            value={peakDetection.minDistanceDeg}
            min={0}
            step={0.01}
            unit="deg"
            onChange={(minDistanceDeg) => onPeakDetectionChange({ minDistanceDeg })}
          />
          <XRDNumberField
            label="Min height ratio"
            value={peakDetection.minHeightRatio}
            min={0}
            max={1}
            step={0.01}
            onChange={(minHeightRatio) => onPeakDetectionChange({ minHeightRatio })}
          />
          <XRDNumberField
            label="Max peak count"
            value={peakDetection.maxPeakCount}
            min={1}
            step={1}
            onChange={(maxPeakCount) => onPeakDetectionChange({ maxPeakCount })}
          />
        </div>
      </Panel>

      <Panel title="Peak Fitting" icon={<Sparkles size={13} />}>
        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2">
            <XRDSelectField
              label="Model"
              value={peakFitting.model}
              options={peakFitModelOptions}
              onChange={(model) => onPeakFittingChange({ model: model as XRDPeakFitModel })}
            />
          </div>
          <XRDNumberField
            label="Fit window"
            value={peakFitting.fitWindowDeg}
            min={0}
            step={0.1}
            unit="deg"
            onChange={(fitWindowDeg) => onPeakFittingChange({ fitWindowDeg })}
          />
          <XRDNumberField
            label="Max iterations"
            value={peakFitting.maxIterations}
            min={1}
            step={1}
            onChange={(maxIterations) => onPeakFittingChange({ maxIterations })}
          />
          <div className="col-span-2">
            <XRDToggleField
              label="Calculate crystallite size"
              checked={peakFitting.calculateCrystalliteSize}
              onChange={(calculateCrystalliteSize) => onPeakFittingChange({ calculateCrystalliteSize })}
            />
          </div>
        </div>
      </Panel>
    </>
  );
}
