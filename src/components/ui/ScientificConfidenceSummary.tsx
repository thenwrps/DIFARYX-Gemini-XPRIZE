import React from 'react';
import { Shield, CheckCircle2, AlertTriangle, Layers, Activity } from 'lucide-react';

interface ScientificConfidenceSummaryProps {
  claimStatus: string;
  readinessPercent: number;
  validationGaps: Array<{ severity: string }>;
  availableTechniques: string[];
  pendingTechniques: string[];
  className?: string;
  compact?: boolean;
  projectId?: string;
}

export function getConfidenceLevel(claimStatus: string, projectId?: string): 'HIGH' | 'MEDIUM-HIGH' | 'MEDIUM' | 'LOW' {
  if (projectId === 'cufe2o4-sba15') return 'MEDIUM';
  const status = claimStatus?.toLowerCase() || '';
  if (status === 'supported_assignment' || status === 'strongly_supported' || status === 'report_ready') return 'HIGH';
  if (status === 'requires_validation' || status === 'supported') return 'MEDIUM-HIGH';
  if (status === 'validation_limited' || status === 'partial') return 'MEDIUM';
  return 'LOW';
}

export function getEvidenceStrengthQualifier(claimStatus: string, projectId?: string): string {
  if (projectId === 'cufe2o4-sba15') return 'Limited Evidence';
  const status = claimStatus?.toLowerCase() || '';
  if (status === 'supported_assignment' || status === 'strongly_supported' || status === 'report_ready') return 'Strong Evidence';
  if (status === 'requires_validation' || status === 'supported') return 'Moderate Evidence';
  if (status === 'validation_limited' || status === 'partial') return 'Limited Evidence';
  return 'Weak Evidence';
}

export function ScientificConfidenceSummary({
  claimStatus,
  readinessPercent,
  validationGaps,
  availableTechniques,
  pendingTechniques,
  className = '',
  compact = false,
  projectId,
}: ScientificConfidenceSummaryProps) {
  const level = getConfidenceLevel(claimStatus, projectId);
  const criticalCount = validationGaps.filter((gap) => {
    const s = gap.severity?.toLowerCase();
    return s === 'critical';
  }).length;
  const highCount = validationGaps.filter((gap) => {
    const s = gap.severity?.toLowerCase();
    return s === 'high' || s === 'moderate' || s === 'major';
  }).length;
  const mediumCount = validationGaps.filter((gap) => {
    const s = gap.severity?.toLowerCase();
    return s === 'medium' || s === 'minor';
  }).length;
  const lowCount = validationGaps.filter((gap) => {
    const s = gap.severity?.toLowerCase();
    return s === 'low';
  }).length;

  const gapCount = validationGaps.length;
  const coverageAvailable = availableTechniques.length;
  const coverageTotal = availableTechniques.length + pendingTechniques.length;

  const levelColorClass = {
    HIGH: 'text-emerald-700 bg-emerald-50/50 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/50',
    'MEDIUM-HIGH': 'text-blue-700 bg-blue-50/50 border-blue-200 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900/50',
    MEDIUM: 'text-amber-700 bg-amber-50/50 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/50',
    LOW: 'text-red-700 bg-red-50/50 border-red-200 dark:bg-red-950/20 dark:text-red-400 dark:border-red-900/50',
  }[level];

  if (compact) {
    return (
      <div 
         className={`rounded-lg border p-3 bg-surface dark:bg-navy-light/30 border-border dark:border-slate-800 ${className}`}
        title={`Scientific Confidence: ${level} (${getEvidenceStrengthQualifier(claimStatus, projectId)})`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Shield size={13} className="text-text-muted dark:text-slate-400 shrink-0" />
            <span className="text-xs font-semibold text-text-main dark:text-slate-200">Confidence</span>
          </div>
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold border uppercase tracking-wider ${levelColorClass}`}>
            {level}
          </span>
        </div>
        <div className="mt-2.5 grid grid-cols-4 gap-2 text-xs text-text-main dark:text-slate-200">
          <div title="Overall Readiness Score based on verified evidence layers">
            <span className="text-text-muted dark:text-slate-400 block text-[10px] font-medium leading-none mb-1">Score</span>
            <span className="font-semibold">{readinessPercent}%</span>
          </div>
          <div title={`Evidence Coverage: ${coverageAvailable} of ${coverageTotal} techniques completed`}>
            <span className="text-text-muted dark:text-slate-400 block text-[10px] font-medium leading-none mb-1">Coverage</span>
            <span className="font-semibold">{coverageAvailable}/{coverageTotal}</span>
          </div>
          <div title={`${criticalCount} Critical contradictions detected in signal alignment`}>
            <span className="text-text-muted dark:text-slate-400 block text-[10px] font-medium leading-none mb-1">Conflicts</span>
            <span className="font-semibold">{criticalCount}</span>
          </div>
          <div title={`Validation Gaps: ${gapCount} items (${criticalCount} Critical, ${highCount} High, ${mediumCount} Medium, ${lowCount} Low)`}>
            <span className="text-text-muted dark:text-slate-400 block text-[10px] font-medium leading-none mb-1">Gaps</span>
            <div className="flex flex-col">
              <span className="font-semibold leading-tight">{gapCount}</span>
              <span className="text-[9px] text-text-muted dark:text-slate-400 font-medium whitespace-nowrap mt-0.5">
                C:{criticalCount} H:{highCount} M:{mediumCount} L:{lowCount}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border p-4 bg-background dark:bg-navy border-border dark:border-slate-800 ${className}`}>
      <div className="flex items-center justify-between gap-3 border-b border-border dark:border-slate-800 pb-3 mb-4">
        <div className="flex items-center gap-2">
          <Shield size={16} className="text-primary dark:text-accent" />
          <h3 className="font-semibold text-sm text-text-main dark:text-slate-200">Scientific Confidence</h3>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="text-xs text-text-muted dark:text-slate-400 font-medium">
            {getEvidenceStrengthQualifier(claimStatus, projectId)}
          </span>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold border uppercase tracking-wider ${levelColorClass}`}>
            Level: {level}
          </span>
        </div>
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
        <div 
          className="rounded-lg border border-border bg-surface p-3 flex flex-col justify-between min-h-[82px] dark:border-slate-800 dark:bg-navy-light/20"
          title="Overall readiness score calculated from active evidence layers"
        >
          <div className="text-xs font-medium text-text-muted dark:text-slate-400 flex items-start gap-1.5">
            <Activity size={13} className="text-text-muted dark:text-slate-400 shrink-0 mt-0.5" />
            <span className="leading-tight">Overall score</span>
          </div>
          <span className="mt-2 text-lg font-bold text-text-main dark:text-slate-200">{readinessPercent}%</span>
        </div>

        <div 
          className="rounded-lg border border-border bg-surface p-3 flex flex-col justify-between min-h-[82px] dark:border-slate-800 dark:bg-navy-light/20"
          title="Completed measurement techniques relative to the experimental plan"
        >
          <div className="text-xs font-medium text-text-muted dark:text-slate-400 flex items-start gap-1.5">
            <Layers size={13} className="text-text-muted dark:text-slate-400 shrink-0 mt-0.5" />
            <span className="leading-tight">Evidence coverage</span>
          </div>
          <span className="mt-2 text-lg font-bold text-text-main dark:text-slate-200">{coverageAvailable}/{coverageTotal}</span>
        </div>

        <div 
          className={`rounded-lg border p-3 flex flex-col justify-between min-h-[82px] ${
            criticalCount > 0
              ? 'border-red-200 bg-red-50/20 dark:border-red-900/30 dark:bg-red-950/10'
              : 'border-border bg-surface dark:border-slate-800 dark:bg-navy-light/20'
          }`}
          title="Conflicting signal features or phase mismatches between techniques"
        >
          <div className="text-xs font-medium text-text-muted dark:text-slate-400 flex items-start gap-1.5">
            <AlertTriangle size={13} className={`shrink-0 mt-0.5 ${criticalCount > 0 ? 'text-red-500' : 'text-text-muted dark:text-slate-400'}`} />
            <span className="leading-tight">Critical contradictions</span>
          </div>
          <span className={`mt-2 text-lg font-bold ${criticalCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-text-main dark:text-slate-200'}`}>{criticalCount}</span>
        </div>

        <div 
          className={`rounded-lg border p-3 flex flex-col justify-between min-h-[82px] ${
            gapCount > 0
              ? 'border-amber-200 bg-amber-50/10 dark:border-amber-900/30 dark:bg-amber-950/10'
              : 'border-emerald-200 bg-emerald-50/10 dark:border-emerald-900/30 dark:bg-emerald-950/10'
          }`}
          title="Open validation checks categorized by severity (Critical, High, Medium, Low)"
        >
          <div>
            <div className="text-xs font-medium text-text-muted dark:text-slate-400 flex items-start gap-1.5">
              <CheckCircle2 size={13} className={`shrink-0 mt-0.5 ${gapCount > 0 ? 'text-amber-500' : 'text-emerald-500'}`} />
              <span className="leading-tight">Validation gaps</span>
            </div>
            <span className={`mt-2 block text-lg font-bold ${gapCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{gapCount}</span>
          </div>
          {gapCount > 0 && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1 text-[10px] font-semibold">
              <span className="rounded bg-red-50/50 border border-red-100 px-1 py-0.5 text-red-600 dark:bg-red-950/30 dark:border-red-900/50 dark:text-red-400">C:{criticalCount}</span>
              <span className="rounded bg-amber-50/50 border border-amber-100 px-1 py-0.5 text-amber-600 dark:bg-amber-950/30 dark:border-amber-900/50 dark:text-amber-400">H:{highCount}</span>
              <span className="rounded bg-blue-50/50 border border-blue-100 px-1 py-0.5 text-blue-600 dark:bg-blue-950/30 dark:border-blue-900/50 dark:text-blue-400">M:{mediumCount}</span>
              <span className="rounded bg-emerald-50/50 border border-emerald-100 px-1 py-0.5 text-emerald-600 dark:bg-emerald-950/30 dark:border-emerald-900/50 dark:text-emerald-400">L:{lowCount}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
