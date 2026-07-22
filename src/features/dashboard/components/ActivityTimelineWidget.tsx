import React from 'react';
import { Card } from '../../../shared/ui/Card';
import {
  Activity,
  Layers,
  Upload,
  Sliders,
  Save,
  FileText,
  RefreshCw
} from 'lucide-react';
import { getProvenanceTimelineEvents, type TimelineEvent } from '../../../utils/provenanceTimeline';

export function ActivityTimelineWidget({ projectId }: { projectId?: string }) {
  const events = React.useMemo(() => {
    return getProvenanceTimelineEvents(projectId);
  }, [projectId]);

  const getEventIcon = (type: TimelineEvent['type']) => {
    switch (type) {
      case 'project_created':
        return <Layers className="text-blue-500 shrink-0" size={13} />;
      case 'file_uploaded':
        return <Upload className="text-emerald-500 shrink-0" size={13} />;
      case 'parameter_changed':
        return <Sliders className="text-purple-500 shrink-0" size={13} />;
      case 'notebook_saved':
        return <Save className="text-amber-500 shrink-0" size={13} />;
      case 'report_exported':
        return <FileText className="text-pink-500 shrink-0" size={13} />;
      case 'session_imported':
      case 'session_exported':
        return <RefreshCw className="text-cyan-500 shrink-0" size={13} />;
      default:
        return <Activity className="text-slate-400 shrink-0" size={13} />;
    }
  };

  const getEventBadgeClass = (type: TimelineEvent['type']) => {
    switch (type) {
      case 'project_created':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'file_uploaded':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'parameter_changed':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'notebook_saved':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'report_exported':
        return 'bg-pink-50 text-pink-700 border-pink-200';
      case 'session_imported':
      case 'session_exported':
        return 'bg-cyan-50 text-cyan-700 border-cyan-200';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  return (
    <Card className="rounded-lg bg-surface border border-border p-4 flex flex-col min-h-0 h-full">
      <div className="flex items-center gap-2 mb-3 border-b border-border pb-2 shrink-0">
        <Activity size={15} className="text-primary" />
        <h3 className="text-xs font-bold text-text-main uppercase tracking-wider">Provenance Timeline</h3>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 pr-1 max-h-[480px]">
        {events.length === 0 ? (
          <div className="text-[11px] text-text-muted text-center py-6">No provenance events recorded.</div>
        ) : (
          <div className="relative border-l border-border pl-4 ml-1.5 space-y-3 py-1">
            {events.map((event, idx) => {
              const dateStr = new Date(event.timestamp).toLocaleString([], {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              });
              return (
                <div key={idx} className="relative">
                  {/* Timeline bullet icon */}
                  <span className="absolute -left-[23px] top-1.5 flex h-4 w-4 items-center justify-center rounded-full border border-border bg-white shadow-sm">
                    {getEventIcon(event.type)}
                  </span>
                  
                  <div className="text-[11px]">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-bold text-text-main leading-tight">{event.title}</span>
                      <span className="text-[9px] text-text-dim shrink-0">{dateStr}</span>
                    </div>
                    <p className="text-text-muted mt-0.5 leading-snug">{event.description}</p>
                    {event.projectName && !projectId && (
                      <span className="inline-block mt-1 rounded bg-slate-100 border border-slate-200 px-1 py-0.2 text-[8px] font-bold text-text-muted">
                        {event.projectName}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}
