/**
 * ============================================================================
 * DIFARYX — Audit Trace Window: Processing Log Display Component
 * ============================================================================
 *
 * Renders the full `processingLog` array from an AnalysisSession as a
 * clean, monospace, scrollable audit trail panel.
 *
 * Features:
 * - Phase-tag color-coded badges ([GOAL], [PLAN], [EXECUTE], [INSPECT],
 *   [REASON], [DECIDE], [REPORT])
 * - Automatic detection and amber-highlighting of Phase 4.5 autonomous
 *   self-correction entries
 * - Timestamp alignment for readable audit columns
 *
 * @component
 * ============================================================================
 */

import React, { useMemo } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AuditTraceWindowProps {
  /** The full processing log array from the active AnalysisSession. */
  processingLog: string[];
  /** Optional title override for the panel header. */
  title?: string;
}

interface ParsedLogEntry {
  raw: string;
  timestamp: string;
  phase: string;
  message: string;
  isSelfCorrection: boolean;
}

// ---------------------------------------------------------------------------
// Phase Badge Color Map
// ---------------------------------------------------------------------------

const PHASE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  GOAL:     { bg: 'bg-blue-900/40',   text: 'text-blue-300',   border: 'border-blue-500/30' },
  PLAN:     { bg: 'bg-indigo-900/40', text: 'text-indigo-300', border: 'border-indigo-500/30' },
  EXECUTE:  { bg: 'bg-green-900/40',  text: 'text-green-300',  border: 'border-green-500/30' },
  INSPECT:  { bg: 'bg-teal-900/40',   text: 'text-teal-300',   border: 'border-teal-500/30' },
  REASON:   { bg: 'bg-purple-900/40', text: 'text-purple-300', border: 'border-purple-500/30' },
  DECIDE:   { bg: 'bg-amber-900/40',  text: 'text-amber-300',  border: 'border-amber-500/30' },
  REPORT:   { bg: 'bg-cyan-900/40',   text: 'text-cyan-300',   border: 'border-cyan-500/30' },
};

const DEFAULT_PHASE_COLOR = { bg: 'bg-gray-800/40', text: 'text-gray-400', border: 'border-gray-600/30' };

// ---------------------------------------------------------------------------
// Self-Correction Detection Keywords
// ---------------------------------------------------------------------------

const SELF_CORRECTION_KEYWORDS = [
  'self-correction',
  'self-correction cycle',
  'hyperparameter',
  'threshold',
  'iteration',
  'parameter adjustment',
  'autonomous adjustment',
  'auto-tune',
  'self-tuning',
  'recalibrat',
];

// ---------------------------------------------------------------------------
// Log Entry Parser
// ---------------------------------------------------------------------------

/**
 * Parse a raw log line into structured components.
 * Expected format: "YYYY-MM-DDTHH:mm:ss.sssZ [PHASE] message"
 * Fallback: tries to extract [PHASE] tag from anywhere in the string.
 */
function parseLogEntry(raw: string): ParsedLogEntry {
  // Try to match timestamp + [PHASE] + message
  const fullPattern = /^(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)\s+\[([A-Z_]+)\]\s+(.*)$/;
  const fullMatch = raw.match(fullPattern);

  if (fullMatch) {
    const timestamp = fullMatch[1];
    const phase = fullMatch[2];
    const message = fullMatch[3];
    return {
      raw,
      timestamp: formatTimestamp(timestamp),
      phase,
      message,
      isSelfCorrection: detectSelfCorrection(message),
    };
  }

  // Fallback: try to find [PHASE] anywhere
  const phasePattern = /\[([A-Z_]+)\]/;
  const phaseMatch = raw.match(phasePattern);

  if (phaseMatch) {
    const phase = phaseMatch[1];
    const message = raw.replace(phaseMatch[0], '').trim();
    return {
      raw,
      timestamp: '',
      phase,
      message,
      isSelfCorrection: detectSelfCorrection(message),
    };
  }

  // No phase tag found — treat entire line as message
  return {
    raw,
    timestamp: '',
    phase: 'INFO',
    message: raw,
    isSelfCorrection: detectSelfCorrection(raw),
  };
}

function formatTimestamp(ts: string): string {
  try {
    const date = new Date(ts);
    if (isNaN(date.getTime())) return ts;
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return ts;
  }
}

function detectSelfCorrection(text: string): boolean {
  const lower = text.toLowerCase();
  return SELF_CORRECTION_KEYWORDS.some((kw) => lower.includes(kw));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const AuditTraceWindow: React.FC<AuditTraceWindowProps> = ({
  processingLog,
  title = 'Processing Trace Log',
}) => {
  const parsedEntries = useMemo(
    () => processingLog.map(parseLogEntry),
    [processingLog],
  );

  const selfCorrectionCount = useMemo(
    () => parsedEntries.filter((e) => e.isSelfCorrection).length,
    [parsedEntries],
  );

  if (processingLog.length === 0) {
    return (
      <div className="rounded-xl border border-gray-700/50 bg-gray-900/30 p-6">
        <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-gray-500" />
          {title}
        </h3>
        <p className="text-gray-500 text-sm italic">
          No processing log entries available for this session.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-700/50 bg-gray-900/30 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          {title}
        </h3>
        <div className="flex items-center gap-3">
          {selfCorrectionCount > 0 && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-900/50 text-amber-300 border border-amber-500/30">
              {selfCorrectionCount} Autonomous Adjustment{selfCorrectionCount !== 1 ? 's' : ''}
            </span>
          )}
          <span className="text-[10px] text-gray-500">
            {processingLog.length} entr{processingLog.length !== 1 ? 'ies' : 'y'}
          </span>
        </div>
      </div>

      {/* Log Panel */}
      <div
        className="max-h-[480px] overflow-y-auto rounded-lg border border-gray-800/60 bg-gray-950/50"
        style={{ fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace" }}
      >
        <div className="p-3 space-y-0.5">
          {parsedEntries.map((entry, idx) => {
            const phaseColor = PHASE_COLORS[entry.phase] || DEFAULT_PHASE_COLOR;

            return (
              <div
                key={idx}
                className={`flex items-start gap-2 px-3 py-1.5 rounded-md text-xs leading-relaxed transition-colors ${
                  entry.isSelfCorrection
                    ? 'bg-amber-950/30 border border-amber-500/20'
                    : 'hover:bg-gray-800/30'
                }`}
              >
                {/* Timestamp */}
                {entry.timestamp && (
                  <span className="text-gray-600 shrink-0 w-[64px] text-right tabular-nums">
                    {entry.timestamp}
                  </span>
                )}

                {/* Phase Badge */}
                <span
                  className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${phaseColor.bg} ${phaseColor.text} ${phaseColor.border}`}
                >
                  {entry.phase}
                </span>

                {/* Self-Correction Badge */}
                {entry.isSelfCorrection && (
                  <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-900/50 text-amber-200 border border-amber-500/30">
                    Autonomous Adjustment
                  </span>
                )}

                {/* Message */}
                <span
                  className={`flex-1 ${
                    entry.isSelfCorrection ? 'text-amber-200/90' : 'text-gray-300'
                  }`}
                >
                  {entry.message}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default AuditTraceWindow;