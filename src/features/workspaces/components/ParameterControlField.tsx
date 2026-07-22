import type { TechniqueParameterControl, TechniqueParameterValue } from '../../../data/techniqueWorkspaceContent';

interface ParameterControlFieldProps {
  control: TechniqueParameterControl;
  value: TechniqueParameterValue;
  onChange: (control: TechniqueParameterControl, value: TechniqueParameterValue) => void;
  onToggleCheckbox: (control: TechniqueParameterControl, option: string) => void;
  disabled?: boolean;
  highlighted?: boolean;
}

export function ParameterControlField({
  control,
  value,
  onChange,
  onToggleCheckbox,
  disabled = false,
  highlighted = false,
}: ParameterControlFieldProps) {
  const baseInputClass = `mt-1 h-8 w-full rounded border border-border bg-white px-2 text-xs font-semibold text-text-main focus:border-primary focus:outline-none ${
    disabled ? 'opacity-50 cursor-not-allowed' : ''
  }`;

  return (
    <label
      id={`param-control-${control.id}`}
      className={`block rounded border px-2 py-1.5 transition-all duration-300 ${
        highlighted
          ? 'border-primary bg-primary/[0.04] ring-1 ring-primary/30 shadow-sm'
          : 'border-border bg-background'
      }`}
    >
      <span className="flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-wide text-text-muted">
        <span>{control.label}</span>
        <span className="flex items-center gap-1 normal-case tracking-normal">
          {!control.active && <span className="rounded bg-amber-50 px-1 py-0.5 text-[9px] text-amber-800">Stored only</span>}
          {control.unit && <span>{control.unit}</span>}
        </span>
      </span>

      {control.type === 'select' && (
        <select
          value={String(value)}
          onChange={(event) => onChange(control, event.target.value)}
          disabled={disabled}
          className={baseInputClass}
        >
          {(control.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      )}

      {control.type === 'number' && (
        <input
          type="number"
          value={Number(value)}
          min={control.min}
          max={control.max}
          step={control.step}
          onChange={(event) => onChange(control, Number(event.target.value))}
          disabled={disabled}
          className={baseInputClass}
        />
      )}

      {control.type === 'range' && (
        <div className="mt-1 flex items-center gap-2">
          <input
            type="range"
            value={Number(value)}
            min={control.min}
            max={control.max}
            step={control.step}
            onChange={(event) => onChange(control, Number(event.target.value))}
            disabled={disabled}
            className="min-w-0 flex-1 accent-blue-600"
          />
          <input
            type="number"
            value={Number(value)}
            min={control.min}
            max={control.max}
            step={control.step}
            onChange={(event) => onChange(control, Number(event.target.value))}
            disabled={disabled}
            className="h-8 w-20 rounded border border-border bg-white px-2 text-xs font-semibold text-text-main focus:border-primary focus:outline-none"
          />
        </div>
      )}

      {control.type === 'text' && (
        <input
          type="text"
          value={String(value)}
          onChange={(event) => onChange(control, event.target.value)}
          disabled={disabled}
          className={baseInputClass}
        />
      )}

      {control.type === 'toggle' && (
        <button
          type="button"
          role="switch"
          aria-checked={Boolean(value)}
          onClick={() => !disabled && onChange(control, !Boolean(value))}
          disabled={disabled}
          className={`mt-1 inline-flex h-7 w-full items-center justify-between rounded border px-2 text-xs font-bold ${
            value ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-600'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <span>{value ? 'Enabled' : 'Disabled'}</span>
          <span className={`h-4 w-8 rounded-full p-0.5 ${value ? 'bg-emerald-500' : 'bg-slate-300'}`}>
            <span
              className={`block h-3 w-3 rounded-full bg-white transition-transform ${value ? 'translate-x-4' : 'translate-x-0'}`}
            />
          </span>
        </button>
      )}

      {control.type === 'checkbox-group' && (
        <div className="mt-1 space-y-1">
          {(control.options ?? []).map((option) => {
            const values = Array.isArray(value) ? value : [];
            return (
              <label key={option} className="flex items-center gap-2 text-[11px] font-semibold text-text-main">
                <input
                  type="checkbox"
                  checked={values.includes(option)}
                  onChange={() => !disabled && onToggleCheckbox(control, option)}
                  disabled={disabled}
                  className="h-3.5 w-3.5 accent-blue-600"
                />
                {option}
              </label>
            );
          })}
        </div>
      )}
    </label>
  );
}
