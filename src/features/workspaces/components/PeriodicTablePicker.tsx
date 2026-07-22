import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { PERIODIC_ELEMENTS } from './elements';
import { ChevronDown, X } from 'lucide-react';

export type SelectionMode = 'all' | 'none' | 'any' | 'optional';

export interface PeriodicTablePickerProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  variant?: 'default' | 'compact';
}

const parseSelections = (str: string): Record<string, SelectionMode> => {
  const result: Record<string, SelectionMode> = {};
  if (!str) return result;
  str.split(',').forEach(part => {
    const s = part.trim();
    if (!s) return;
    if (s.endsWith('(All)')) result[s.replace('(All)', '').trim()] = 'all';
    else if (s.endsWith('(None)')) result[s.replace('(None)', '').trim()] = 'none';
    else if (s.endsWith('(Any)')) result[s.replace('(Any)', '').trim()] = 'any';
    else if (s.endsWith('(Optional)')) result[s.replace('(Optional)', '').trim()] = 'optional';
    else result[s] = 'all'; 
  });
  return result;
};

const serializeSelections = (selections: Record<string, SelectionMode>): string => {
  return Object.entries(selections)
    .map(([sym, mode]) => {
      if (mode === 'all') return `${sym}(All)`;
      if (mode === 'none') return `${sym}(None)`;
      if (mode === 'any') return `${sym}(Any)`;
      if (mode === 'optional') return `${sym}(Optional)`;
      return sym;
    })
    .join(', ');
};

const getBadgeStyles = (mode: SelectionMode) => {
  switch (mode) {
    case 'all': return 'border-emerald-500 bg-emerald-100 text-emerald-800 shadow-emerald-500/20';
    case 'none': return 'border-red-500 bg-red-100 text-red-800 shadow-red-500/20';
    case 'any': return 'border-blue-500 bg-blue-100 text-blue-800 shadow-blue-500/20';
    case 'optional': return 'border-amber-400 bg-amber-100 text-amber-800 shadow-amber-400/20';
  }
};

const getCellStyles = (mode?: SelectionMode) => {
  if (!mode) return 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300';
  switch (mode) {
    case 'all': return 'bg-emerald-100 border-emerald-500 text-emerald-900 font-bold';
    case 'none': return 'bg-red-100 border-red-500 text-red-900 font-bold';
    case 'any': return 'bg-blue-100 border-blue-500 text-blue-900 font-bold';
    case 'optional': return 'bg-amber-100 border-amber-500 text-amber-900 font-bold';
  }
};

export function PeriodicTablePicker({ label, value, onChange, placeholder, variant = 'default' }: PeriodicTablePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeMode, setActiveMode] = useState<SelectionMode>('all');
  const containerRef = useRef<HTMLDivElement>(null);

  const selections = parseSelections(value);



  const handleCellClick = (symbol: string) => {
    const newSelections = { ...selections };
    if (newSelections[symbol] === activeMode) {
      // Toggle off if clicking the same mode
      delete newSelections[symbol];
    } else {
      // Set to active mode
      newSelections[symbol] = activeMode;
    }
    onChange(serializeSelections(newSelections));
  };

  const handleRemove = (symbol: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSelections = { ...selections };
    delete newSelections[symbol];
    onChange(serializeSelections(newSelections));
  };

  const handleClear = () => {
    onChange('');
  };

  const handleApplyToAll = () => {
    const newSelections: Record<string, SelectionMode> = {};
    PERIODIC_ELEMENTS.forEach(el => {
      newSelections[el.symbol] = activeMode;
    });
    onChange(serializeSelections(newSelections));
  };

  const visibleEntries = Object.entries(selections).filter(([sym, mode]) => mode !== 'none');
  const noneCount = Object.keys(selections).length - visibleEntries.length;
  const hasSelections = Object.keys(selections).length > 0;

  return (
    <div className="relative flex flex-col space-y-1.5" ref={containerRef}>
      {/* Label */}
      <span className="text-[10px] font-bold uppercase tracking-wide text-text-muted">
        {label}
      </span>

      {/* Faux Input Field */}
      <div 
        className={`flex w-full items-center justify-between rounded border cursor-pointer transition-colors ${
          isOpen ? 'border-primary ring-2 ring-primary/20 bg-white' : 'border-border bg-surface hover:border-slate-400'
        } ${variant === 'compact' ? 'min-h-7 px-2 py-0.5' : 'min-h-9 px-3 py-1.5'}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex flex-wrap items-center gap-1.5 flex-1 overflow-hidden">
          {visibleEntries.length > 0 ? (
            <>
              {visibleEntries.map(([sym, mode]) => (
                <span 
                  key={sym} 
                  className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-bold shadow-sm ${getBadgeStyles(mode)}`}
                >
                  {sym}
                  <X size={10} className="cursor-pointer opacity-70 hover:opacity-100" onClick={(e) => handleRemove(sym, e)} />
                </span>
              ))}
              {noneCount > 0 && (
                <span className="text-[10px] font-medium text-slate-400">+{noneCount} excluded</span>
              )}
            </>
          ) : noneCount > 0 ? (
            <span className="text-[10px] font-medium text-slate-400">{noneCount} elements excluded</span>
          ) : (
            <span className="text-xs text-text-muted/60">{placeholder}</span>
          )}
        </div>
        <div className="flex items-center gap-1 pl-2">
          {hasSelections && (
            <button 
              type="button"
              className="text-text-muted hover:text-text-main p-0.5 rounded-full hover:bg-slate-200 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                handleClear();
              }}
            >
              <X size={12} />
            </button>
          )}
          <ChevronDown size={14} className={`text-text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {/* Modal Overlay via Portal */}
      {isOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm transition-opacity">
          <div 
            className="flex flex-col w-[720px] max-w-[95vw] rounded-xl border border-slate-200 bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800">Select Known Elements</h3>
              <button 
                type="button" 
                onClick={() => setIsOpen(false)}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            
            {/* Periodic Table Grid */}
            <div className="overflow-x-auto">
              <div className="grid grid-cols-[repeat(18,minmax(0,1fr))] gap-1 min-w-[640px]">
                {PERIODIC_ELEMENTS.map(el => (
                  <div 
                    key={el.symbol}
                    className={`relative flex cursor-pointer select-none flex-col items-center justify-center rounded border transition-colors ${getCellStyles(selections[el.symbol])}`}
                    style={{ 
                      gridRow: el.row, 
                      gridColumn: el.col,
                      aspectRatio: '1',
                      padding: '2px'
                    }}
                    onClick={() => handleCellClick(el.symbol)}
                    title={`${el.symbol} (Z=${el.z})`}
                  >
                    <span className="text-xs font-bold leading-none">{el.symbol}</span>
                    <span className="text-[8px] opacity-70 mt-0.5">{el.z}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Controls Footer */}
            <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
              <div className="flex items-center gap-4">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Selection Mode:</span>
                <div className="flex gap-4">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" checked={activeMode === 'all'} onChange={() => setActiveMode('all')} className="accent-emerald-600 h-3 w-3" />
                    <span className="text-[11px] font-semibold text-emerald-700">All (Must have)</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" checked={activeMode === 'none'} onChange={() => setActiveMode('none')} className="accent-red-600 h-3 w-3" />
                    <span className="text-[11px] font-semibold text-red-700">None</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" checked={activeMode === 'any'} onChange={() => setActiveMode('any')} className="accent-blue-600 h-3 w-3" />
                    <span className="text-[11px] font-semibold text-blue-700">Any</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" checked={activeMode === 'optional'} onChange={() => setActiveMode('optional')} className="accent-amber-600 h-3 w-3" />
                    <span className="text-[11px] font-semibold text-amber-700">Optional</span>
                  </label>
                </div>
              </div>
              
              <div className="flex gap-2">
                <button 
                  type="button" 
                  onClick={handleApplyToAll}
                  className="rounded bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200 transition-colors"
                >
                  Apply to All
                </button>
                <button 
                  type="button" 
                  onClick={handleClear}
                  className="rounded bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200 transition-colors"
                >
                  Reset
                </button>
                <button 
                  type="button" 
                  onClick={() => setIsOpen(false)}
                  className="rounded bg-primary px-4 py-1.5 text-xs font-bold text-white hover:bg-primary/90 transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
