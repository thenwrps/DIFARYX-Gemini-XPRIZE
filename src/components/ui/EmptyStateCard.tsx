import React from 'react';
import { 
  AlertTriangle, 
  HelpCircle, 
  Database, 
  BookOpen, 
  FileWarning, 
  RefreshCw, 
  LucideIcon 
} from 'lucide-react';

export type EmptyStateCardType = 
  | 'no_match'
  | 'not_executed'
  | 'missing_evidence'
  | 'missing_references'
  | 'import_failure'
  | 'export_failure'
  | 'generic';

interface EmptyStateCardProps {
  type: EmptyStateCardType;
  title?: string;
  description?: string;
  actionText?: string;
  onAction?: () => void;
  className?: string;
}

export function EmptyStateCard({
  type,
  title,
  description,
  actionText,
  onAction,
  className = '',
}: EmptyStateCardProps) {
  
  const getPreset = () => {
    switch (type) {
      case 'no_match':
        return {
          icon: AlertTriangle,
          iconColor: 'text-amber-500 bg-amber-50 border-amber-200',
          title: title || 'No Matching References Found',
          description: description || 'The active pattern does not exceed the correlation threshold for the selected database.',
        };
      case 'not_executed':
        return {
          icon: HelpCircle,
          iconColor: 'text-slate-500 bg-slate-50 border-slate-200',
          title: title || 'Analysis Not Executed',
          description: description || 'Configure parameters and execute the workspace agent to generate scientific findings.',
        };
      case 'missing_evidence':
        return {
          icon: Database,
          iconColor: 'text-red-500 bg-red-50 border-red-200',
          title: title || 'Evidence Source Missing',
          description: description || 'Please upload a compatible signal run (CSV/TXT) or seed demo evidence to proceed.',
        };
      case 'missing_references':
        return {
          icon: BookOpen,
          iconColor: 'text-amber-500 bg-amber-50 border-amber-200',
          title: title || 'Validation References Missing',
          description: description || 'At least one approved reference database is required to establish validation boundaries.',
        };
      case 'import_failure':
        return {
          icon: FileWarning,
          iconColor: 'text-red-500 bg-red-50 border-red-200',
          title: title || 'Import Operation Failed',
          description: description || 'The provided package was rejected. Verify file integrity and version compatibility.',
        };
      case 'export_failure':
        return {
          icon: RefreshCw,
          iconColor: 'text-red-500 bg-red-50 border-red-200',
          title: title || 'Export Operation Aborted',
          description: description || 'Unable to serialize local state. Ensure localStorage is available and active.',
        };
      default:
        return {
          icon: HelpCircle,
          iconColor: 'text-slate-400 bg-slate-50 border-slate-200',
          title: title || 'Information Unavailable',
          description: description || 'The requested view state is not ready or has not been initialized.',
        };
    }
  };

  const preset = getPreset();
  const Icon = preset.icon;

  return (
    <div 
      className={`flex flex-col items-center justify-center text-center p-6 rounded-lg border border-dashed border-border bg-surface/30 min-h-[160px] ${className}`}
      role="region"
      aria-label={preset.title}
    >
      <div className={`p-2.5 rounded-full border mb-3 flex items-center justify-center ${preset.iconColor}`}>
        <Icon size={20} className="shrink-0" aria-hidden="true" />
      </div>
      
      <h4 className="text-xs font-bold text-text-main uppercase tracking-wider mb-1.5">
        {preset.title}
      </h4>
      
      <p className="text-[11px] leading-relaxed text-text-muted max-w-[280px] mb-3">
        {preset.description}
      </p>

      {actionText && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="inline-flex h-7 items-center justify-center rounded bg-primary/10 border border-primary/20 px-3 text-[10px] font-semibold text-primary hover:bg-primary/20 focus:outline-none focus:ring-1 focus:ring-primary focus:ring-offset-1 transition-all"
        >
          {actionText}
        </button>
      )}
    </div>
  );
}
