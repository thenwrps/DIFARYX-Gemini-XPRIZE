import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

type SpectrumType = 'xrd' | 'xps' | 'ftir' | 'raman';

// ── External data props (new — for scientific engine) ────────────────

interface ExternalPoint {
  x: number;
  y: number;
}

interface PeakMarker {
  position: number;
  intensity: number;
  label?: string;
  role?: 'selected' | 'linked';
}

const TOOLTIP_CONTENT_STYLE = {
  backgroundColor: '#0f172a',
  borderColor: 'rgba(148,163,184,0.25)',
  borderRadius: '8px',
  color: '#e2e8f0',
  boxShadow: '0 12px 30px rgba(15,23,42,0.35)',
};
const TOOLTIP_ITEM_STYLE = { color: '#e2e8f0' };
const TOOLTIP_LABEL_STYLE = { color: '#cbd5e1' };

const HEIGHT_CLASSES: Record<string, string> = {
  '100%': 'h-full min-h-[120px]',
  '150': 'h-[150px] min-h-[150px]',
  '200': 'h-[200px] min-h-[200px]',
  '250': 'h-[250px] min-h-[250px]',
  '300': 'h-[300px] min-h-[300px]',
  '350': 'h-[350px] min-h-[350px]',
  '400': 'h-[400px] min-h-[400px]',
  '500': 'h-[500px] min-h-[500px]',
};

type ContainerSize = { width: number; height: number };

function useContainerSize(ref: React.RefObject<HTMLElement>): ContainerSize {
  const [size, setSize] = useState<ContainerSize>({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame: number | null = null;

    const update = () => {
      const next = el.getBoundingClientRect();
      const width = Math.round(next.width);
      const height = Math.round(next.height);
      setSize((prev) => {
        if (prev.width === width && prev.height === height) return prev;
        return { width, height };
      });
    };
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    });
    ro.observe(el);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, [ref]);

  return size;
}

// ── Component props ──────────────────────────────────────────────────

export interface OverlaySeries {
  id: string;
  name: string;
  color?: string;
  data: ExternalPoint[];
}

interface GraphProps {
  type?: SpectrumType;
  height?: number | string;
  showCalculated?: boolean;
  showBackground?: boolean;
  showResidual?: boolean;
  showLegend?: boolean;
  /** When provided, renders this data instead of internally generated data */
  externalData?: ExternalPoint[];
  /** Secondary overlay datasets for multi-sample comparison of the same technique */
  overlaySeries?: OverlaySeries[];
  /** Baseline curve to overlay */
  baselineData?: ExternalPoint[];
  /** Peak position markers */
  peakMarkers?: PeakMarker[];
  /** Optional axis labels for uploaded or externally mapped signals */
  xAxisLabel?: string;
  yAxisLabel?: string;
  onChartClick?: (x: number, y: number) => void;
  hideAxes?: boolean;
  hideGrid?: boolean;
  /** Shows bounded reference markers. Can also be toggled with the R key while focused. */
  showReferencePeaks?: boolean;
  /** Keeps the previous signal visible while a parent recalculates it. */
  isLoading?: boolean;
}

// ── Internal data types ──────────────────────────────────────────────

interface SpectrumPoint {
  x: number;
  observed: number;
  calculated: number;
  background: number;
  residual: number;
  residualDisplay: number;
}

interface ExternalSpectrumPoint {
  x: number;
  observed: number;
  baseline?: number;
}

const SETTINGS: Record<
  SpectrumType,
  {
    range: [number, number];
    reversed: boolean;
    xLabel: string;
    yLabel: string;
    yDomain: [number, number];
    residualOffset: number;
    color: string;
  }
> = {
  xrd: {
    range: [10, 80],
    reversed: false,
    xLabel: '2\u03b8 (\u00b0)',
    yLabel: 'Intensity (a.u.)',
    yDomain: [-8, 115],
    residualOffset: 4,
    color: '#2563eb',
  },
  xps: {
    range: [0, 1200],
    reversed: true,
    xLabel: 'Binding energy (eV)',
    yLabel: 'Counts (a.u.)',
    yDomain: [-8, 145],
    residualOffset: 7,
    color: '#8b5cf6',
  },
  ftir: {
    range: [400, 4000],
    reversed: true,
    xLabel: 'Wavenumber (cm\u207b\u00b9)',
    yLabel: 'Transmittance (%)',
    yDomain: [24, 102],
    residualOffset: 31,
    color: '#ef4444',
  },
  raman: {
    range: [100, 3200],
    reversed: false,
    xLabel: 'Raman shift (cm\u207b\u00b9)',
    yLabel: 'Intensity (a.u.)',
    yDomain: [-8, 120],
    residualOffset: 5,
    color: '#10b981',
  },
};

function gaussian(x: number, center: number, width: number) {
  const scaled = (x - center) / width;
  return Math.exp(-0.5 * scaled * scaled);
}

function lorentzian(x: number, center: number, width: number) {
  const scaled = (x - center) / width;
  return 1 / (1 + scaled * scaled);
}

function pseudoVoigt(x: number, center: number, width: number, mix = 0.35) {
  return mix * lorentzian(x, center, width) + (1 - mix) * gaussian(x, center, width);
}

function instrumentNoise(index: number, x: number, amplitude: number) {
  return amplitude * (
    0.48 * Math.sin(index * 1.73) +
    0.31 * Math.sin(index * 0.47 + 1.6) +
    0.21 * Math.sin(x * 0.91)
  );
}

function xrdSignal(x: number, index: number) {
  const background = 7.5 + 2.2 * Math.exp(-(x - 10) / 35) + 0.8 * Math.sin(x * 0.18);
  const peaks = [
    { c: 17.1, h: 76, w: 0.16 },
    { c: 20.8, h: 24, w: 0.2 },
    { c: 25.6, h: 18, w: 0.22 },
    { c: 29.7, h: 34, w: 0.2 },
    { c: 35.6, h: 96, w: 0.18 },
    { c: 36.5, h: 38, w: 0.16 },
    { c: 40.7, h: 26, w: 0.21 },
    { c: 52.4, h: 58, w: 0.2 },
    { c: 57.2, h: 29, w: 0.2 },
    { c: 61.6, h: 36, w: 0.19 },
    { c: 65.1, h: 20, w: 0.22 },
    { c: 74.2, h: 15, w: 0.24 },
  ];

  const calculated = peaks.reduce((sum, peak) => {
    const main = peak.h * pseudoVoigt(x, peak.c, peak.w, 0.28);
    const kAlpha2 = peak.h * 0.18 * pseudoVoigt(x, peak.c + 0.12, peak.w * 1.25, 0.35);
    return sum + main + kAlpha2;
  }, background);

  return {
    background,
    calculated,
    observed: calculated + instrumentNoise(index, x, 1.15),
  };
}

interface SpectrumPoint {
  x: number;
  observed: number;
  calculated: number;
  background: number;
  residual: number;
  residualDisplay: number;
}

interface ExternalSpectrumPoint {
  x: number;
  observed: number;
  baseline?: number;
}



function xpsSignal(x: number, index: number) {
  const background = 20 + 18 * Math.exp(-x / 520) + 10 * (1 - x / 1200);
  const peaks = [
    { c: 55, h: 18, w: 4.8 },
    { c: 133, h: 34, w: 5.2 },
    { c: 285, h: 40, w: 6.2 },
    { c: 531, h: 72, w: 7.4 },
    { c: 710, h: 82, w: 8.8 },
    { c: 724, h: 56, w: 9.5 },
    { c: 933, h: 52, w: 8.8 },
    { c: 953, h: 36, w: 10.5 },
  ];

  const calculated = peaks.reduce(
    (sum, peak) => sum + peak.h * pseudoVoigt(x, peak.c, peak.w, 0.58),
    background,
  );

  return {
    background,
    calculated,
    observed: calculated + instrumentNoise(index, x, 1.8),
  };
}

function ftirSignal(x: number, index: number) {
  const background = 94 - 1.8 * Math.sin((x - 400) / 620) - 2.4 * Math.exp(-(4000 - x) / 900);
  const bands = [
    { c: 3420, h: 18, w: 150 },
    { c: 2920, h: 7, w: 45 },
    { c: 2850, h: 5, w: 42 },
    { c: 1715, h: 22, w: 55 },
    { c: 1625, h: 10, w: 62 },
    { c: 1385, h: 8, w: 48 },
    { c: 1110, h: 31, w: 72 },
    { c: 1035, h: 22, w: 48 },
    { c: 620, h: 18, w: 42 },
    { c: 565, h: 15, w: 36 },
  ];

  const calculated = bands.reduce(
    (sum, band) => sum - band.h * gaussian(x, band.c, band.w),
    background,
  );

  return {
    background,
    calculated,
    observed: calculated + instrumentNoise(index, x, 0.55),
  };
}

function ramanSignal(x: number, index: number) {
  const background = 8 + 18 * Math.exp(-(x - 100) / 1650) + 2.5 * Math.sin(x / 430);
  const peaks = [
    { c: 220, h: 12, w: 12 },
    { c: 382, h: 20, w: 16 },
    { c: 585, h: 42, w: 18 },
    { c: 690, h: 70, w: 20 },
    { c: 960, h: 26, w: 22 },
    { c: 1348, h: 35, w: 34 },
    { c: 1582, h: 48, w: 38 },
    { c: 2690, h: 24, w: 52 },
  ];

  const calculated = peaks.reduce(
    (sum, peak) => sum + peak.h * pseudoVoigt(x, peak.c, peak.w, 0.45),
    background,
  );

  return {
    background,
    calculated,
    observed: calculated + instrumentNoise(index, x, 1.25),
  };
}

// ── Internal data types ──────────────────────────────────────────────

function getSignal(type: SpectrumType, x: number, index: number) {
  if (type === 'xps') return xpsSignal(x, index);
  if (type === 'ftir') return ftirSignal(x, index);
  if (type === 'raman') return ramanSignal(x, index);
  return xrdSignal(x, index);
}

function generateData(type: SpectrumType): SpectrumPoint[] {
  const settings = SETTINGS[type];
  const [min, max] = settings.range;
  const points = type === 'xrd' ? 760 : 620;

  return Array.from({ length: points }, (_, index) => {
    const fraction = index / (points - 1);
    const x = min + (max - min) * fraction;
    const signal = getSignal(type, x, index);
    const residual = signal.observed - signal.calculated;

    return {
      x: Number(x.toFixed(type === 'xrd' ? 2 : 1)),
      observed: Number(signal.observed.toFixed(3)),
      calculated: Number(signal.calculated.toFixed(3)),
      background: Number(signal.background.toFixed(3)),
      residual: Number(residual.toFixed(3)),
      residualDisplay: Number((settings.residualOffset + residual * 2).toFixed(3)),
    };
  });
}

// ── Convert external data to chart format ────────────────────────────

function convertExternalData(
  data: ExternalPoint[],
  baseline?: ExternalPoint[],
): ExternalSpectrumPoint[] {
  return data.map((pt, i) => ({
    x: pt.x,
    observed: pt.y,
    baseline: baseline && baseline[i] ? baseline[i].y : undefined,
  }));
}

const tooltipNames: Record<string, string> = {
  observed: 'Observed',
  calculated: 'Fitted',
  background: 'Background',
  baseline: 'Baseline',
  residualDisplay: 'Residual (offset)',
};

const legendNames: Record<string, string> = {
  observed: 'Observed',
  calculated: 'Fitted',
  background: 'Background',
  baseline: 'Baseline',
  residualDisplay: 'Residual',
  referencePeaks: 'Reference Peaks',
};

const techniqueLegendOverrides: Record<SpectrumType, Partial<Record<string, string>>> = {
  xrd: {
    referencePeaks: 'Reference Peaks',
  },
  xps: {
    referencePeaks: 'Chemical References',
  },
  ftir: {
    referencePeaks: 'Band References',
  },
  raman: {
    referencePeaks: 'Mode References',
  },
};

function PeakMarkerDot(props: {
  cx?: number;
  cy?: number;
  payload?: ExternalSpectrumPoint;
  peakMarkers: PeakMarker[];
  type?: SpectrumType;
}) {
  const { cx, cy, payload, peakMarkers, type = 'xrd' } = props;
  if (cx == null || cy == null || !payload) return null;

  const threshold = type === 'xrd' ? 0.15 : type === 'xps' ? 0.5 : type === 'ftir' ? 5.0 : 2.0;

  const marker = peakMarkers.find(
    (m) => Math.abs(m.position - payload.x) < threshold,
  );
  if (!marker) return null;

  return (
    <g opacity={0.6}>
      <circle cx={cx} cy={cy} r={2.5} fill="#f59e0b" stroke="#fbbf24" strokeWidth={0.8} />
    </g>
  );
}


// ── Shared onClick handler for LineChart ─────────────────────────────

function handleChartClick(
  nextState: Record<string, unknown> | undefined,
  onChartClick: ((x: number, y: number) => void) | undefined,
) {
  if (!nextState || nextState.activeLabel === undefined || !onChartClick) return;
  const clickedX = Number(nextState.activeLabel);
  const activePayload = nextState.activePayload as Array<Record<string, unknown>> | undefined;
  let clickedY = 0;
  if (activePayload && activePayload.length > 0) {
    const obsObj = activePayload.find((p: Record<string, unknown>) => p.dataKey === 'observed' || p.name === 'observed');
    clickedY = obsObj ? Number((obsObj as Record<string, unknown>).value) : Number((activePayload[0] as Record<string, unknown>).value);
  }
  onChartClick(clickedX, clickedY);
}

// ── Main Component ───────────────────────────────────────────────────

function getLabeledMarkerPositions(type: SpectrumType, markers: PeakMarker[]) {
  const selectedWithLabels = markers.filter((marker) => marker.label && marker.role === 'selected');
  if (type !== 'xrd' || selectedWithLabels.length <= 3) {
    return new Set(selectedWithLabels.map((marker) => marker.position));
  }

  return new Set(
    [...selectedWithLabels]
      .sort((a, b) => b.intensity - a.intensity)
      .slice(0, 3)
      .map((marker) => marker.position),
  );
}

export function Graph({
  type = 'xrd',
  height = 400,
  showCalculated = true,
  showBackground = false,
  showResidual = true,
  showLegend = true,
  externalData,
  overlaySeries,
  baselineData,
  peakMarkers,
  xAxisLabel,
  yAxisLabel,
  onChartClick,
  hideAxes = false,
  hideGrid = false,
  showReferencePeaks = true,
  isLoading = false,
}: GraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const noDataRef = useRef<HTMLDivElement>(null);
  const containerSize = useContainerSize(containerRef);
  const isContainerReady = containerSize.width > 0 && containerSize.height > 0;
  const useExternal = !!externalData && externalData.length > 0;
  const [viewDomain, setViewDomain] = useState<[number, number] | null>(null);
  const [referencePeaksVisible, setReferencePeaksVisible] = useState(showReferencePeaks);
  const internalData = useMemo(() => generateData(type), [type]);

  // External data path with multi-series overlay support
  const externalChartData = useMemo(() => {
    if (!useExternal) return [];
    const base = convertExternalData(externalData!, baselineData);
    if (!overlaySeries || overlaySeries.length === 0) return base;

    return base.map((row) => {
      const merged: Record<string, any> = { ...row };
      overlaySeries.forEach((series) => {
        const pt = series.data.find((p) => Math.abs(p.x - row.x) < 0.35);
        if (pt) {
          merged[series.id] = pt.y;
        }
      });
      return merged;
    });
  }, [useExternal, externalData, baselineData, overlaySeries]);

  const settings = SETTINGS[type];
  const displayXLabel = xAxisLabel ?? settings.xLabel;
  const displayYLabel = yAxisLabel ?? settings.yLabel;

  useEffect(() => {
    setReferencePeaksVisible(showReferencePeaks);
  }, [showReferencePeaks]);

  if (useExternal) {
    // External data rendering mode — use reduce to avoid stack overflow on large datasets
    let xMin = Infinity;
    let xMax = -Infinity;
    let yMin = Infinity;
    let yMax = -Infinity;
    for (let i = 0; i < externalChartData.length; i++) {
      const xi = externalChartData[i].x;
      const yi = externalChartData[i].observed;
      if (xi < xMin) xMin = xi;
      if (xi > xMax) xMax = xi;
      if (yi < yMin) yMin = yi;
      if (yi > yMax) yMax = yi;
    }
    const yPadding = (yMax - yMin) * 0.1 || 5;
    let yDomain: [number, number] = [
      yMin - yPadding,
      yMax + yPadding,
    ];
    if (type === 'ftir' && yAxisLabel?.includes('Transmittance')) {
      yDomain = [0, 100];
    }
    const xPadding = xMin === xMax ? 1 : 0;
    const xDomain: [number, number] = [
      Number.isFinite(xMin) ? xMin - xPadding : settings.range[0],
      Number.isFinite(xMax) ? xMax + xPadding : settings.range[1],
    ];

    const markers = referencePeaksVisible ? (peakMarkers ?? []) : [];
    const labeledMarkerPositions = getLabeledMarkerPositions(type, markers);
    const appliedXDomain = viewDomain ?? xDomain;

    const clampViewport = (requestedStart: number, requestedEnd: number): [number, number] => {
      const fullStart = Math.min(xDomain[0], xDomain[1]);
      const fullEnd = Math.max(xDomain[0], xDomain[1]);
      const fullSpan = fullEnd - fullStart;
      const requestedSpan = Math.max((xDomain[1] - xDomain[0]) / 80, requestedEnd - requestedStart);
      const span = Math.min(fullSpan, requestedSpan);
      let start = Math.max(fullStart, requestedStart);
      let end = start + span;

      if (end > fullEnd) {
        end = fullEnd;
        start = end - span;
      }

      return [start, end];
    };

    const updateViewport = (next: 'zoomIn' | 'zoomOut' | 'panLeft' | 'panRight' | 'reset') => {
      if (next === 'reset') {
        setViewDomain(null);
        return;
      }
      const [start, end] = viewDomain ?? xDomain;
      const span = end - start;
      if (next === 'zoomIn' || next === 'zoomOut') {
        const factor = next === 'zoomIn' ? 0.8 : 1.25;
        const middle = (start + end) / 2;
        const nextSpan = Math.min(xDomain[1] - xDomain[0], Math.max((xDomain[1] - xDomain[0]) / 80, span * factor));
        setViewDomain(clampViewport(middle - nextSpan / 2, middle + nextSpan / 2));
        return;
      }
      const shift = span * 0.15 * (next === 'panLeft' ? -1 : 1);
      setViewDomain(clampViewport(start + shift, end + shift));
    };

    const handleViewportKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;
      if (target.matches('input, textarea, select, button, [contenteditable="true"]') || target.isContentEditable) return;
      if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        updateViewport('zoomIn');
      } else if (event.key === '-') {
        event.preventDefault();
        updateViewport('zoomOut');
      } else if (event.key === '0') {
        event.preventDefault();
        updateViewport('reset');
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        updateViewport('panLeft');
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        updateViewport('panRight');
      } else if (event.key.toLowerCase() === 'r') {
        event.preventDefault();
        setReferencePeaksVisible((visible) => !visible);
      }
    };

    // Guard: if external data is empty or domain is invalid, render nothing
    if (!Number.isFinite(xMin) || !Number.isFinite(xMax) || xMin === xMax) {
      return (
        <div
          ref={noDataRef}
          className="graph-container w-full flex items-center justify-center text-xs text-text-muted"
        >
          No data
        </div>
      );
    }

    return (
      <div
        ref={containerRef}
        className="graph-container relative w-full rounded-[5px] outline-none focus-visible:ring-2 focus-visible:ring-primary"
        tabIndex={0}
        aria-label={`${type.toUpperCase()} signal graph. Use mouse wheel or plus and minus to zoom, arrow keys to pan, zero to reset, and R to toggle reference peaks.`}
        onKeyDown={handleViewportKeyDown}
        onDoubleClick={() => updateViewport('reset')}
        onWheel={(event) => {
          event.preventDefault();
          updateViewport(event.deltaY < 0 ? 'zoomIn' : 'zoomOut');
        }}
      >
        {isContainerReady && (
        <ResponsiveContainer width="100%" height="100%" minHeight={40} minWidth={40}>
          <LineChart
            data={externalChartData}
            margin={hideAxes ? { top: 4, right: 4, bottom: 4, left: 4 } : { top: 18, right: 24, bottom: 24, left: 24 }}
            onClick={(nextState: Record<string, unknown> | undefined) => handleChartClick(nextState, onChartClick)}
          >
            {!hideGrid && !hideAxes && (
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" vertical={false} />
            )}
            {!hideAxes && (
              <XAxis
                dataKey="x"
                stroke="#94a3b8"
                tick={{ fill: '#94a3b8', fontSize: 12 }}
                tickLine={{ stroke: '#64748b' }}
                axisLine={{ stroke: '#334155' }}
                label={{ value: displayXLabel, position: 'bottom', fill: '#94a3b8', fontSize: 12 }}
                type="number"
                domain={appliedXDomain}
                reversed={settings.reversed}
                tickFormatter={(value) => {
                  const numeric = Number(value);
                  if (!Number.isFinite(numeric)) return String(value);
                  return Math.abs(numeric) >= 100 ? numeric.toFixed(0) : numeric.toFixed(1).replace(/\.0$/, '');
                }}
              />
            )}
            {!hideAxes && (
              <YAxis
                stroke="#94a3b8"
                tick={{ fill: '#94a3b8', fontSize: 12 }}
                tickLine={{ stroke: '#64748b' }}
                axisLine={{ stroke: '#334155' }}
                label={{ value: displayYLabel, angle: -90, position: 'left', fill: '#94a3b8', fontSize: 12 }}
                domain={yDomain}
                allowDataOverflow
                tickFormatter={(v) => (Math.abs(v) < 0.5 ? '0' : String(Math.round(v)))}
              />
            )}
            <Tooltip
              formatter={(value, name) => [
                typeof value === 'number' ? value.toFixed(2) : value,
                tooltipNames[String(name)] ?? name,
              ]}
              labelFormatter={(value) => {
                const marker = markers.find((item) => Math.abs(item.position - Number(value)) < (type === 'xrd' ? 0.15 : type === 'raman' ? 2 : 0.5));
                return `${displayXLabel}: ${Number(value).toFixed(2)}${marker?.label ? ` · ${marker.label}${marker.role === 'selected' ? ' · Supported' : ''}` : ''}`;
              }}
              contentStyle={TOOLTIP_CONTENT_STYLE}
              itemStyle={TOOLTIP_ITEM_STYLE}
              labelStyle={TOOLTIP_LABEL_STYLE}
              cursor={{ stroke: '#64748b', strokeDasharray: '3 3', strokeWidth: 1 }}
            />
            {showLegend && (
              <Legend
                formatter={(value) => {
                  // Get technique-specific legend name or fall back to default
                  const overrides = techniqueLegendOverrides[type];
                  const name = (overrides && overrides[String(value)]) || legendNames[String(value)] || value;
                  // Apply hierarchy: Observed (bold), Fitted (medium), Baseline/Reference (faint)
                  if (value === 'observed') {
                    return <span className="font-bold opacity-100">{name}</span>;
                  } else if (value === 'calculated') {
                    return <span className="font-semibold opacity-90">{name}</span>;
                  } else if (value === 'baseline' || value === 'referencePeaks') {
                    return <span className="font-medium opacity-60">{name}</span>;
                  }
                  return name;
                }}
                wrapperStyle={{
                  paddingTop: '20px',
                  fontSize: '13px',
                  fontWeight: 600,
                  letterSpacing: '0.02em',
                }}
                iconType="line"
                iconSize={24}
              />
            )}

            {/* Reference peak sticks for bounded visual review */}
            {markers.map((m, i) => {
              const isSelected = m.role === 'selected';
              const isLinked = m.role === 'linked';

              return (
                <ReferenceLine
                  key={`peak-stick-${i}`}
                  x={m.position}
                  stroke={isSelected ? '#3b82f6' : isLinked ? '#06b6d4' : '#a0a0a0'}
                  strokeWidth={isSelected ? 2.5 : isLinked ? 2 : 1}
                  strokeOpacity={isSelected ? 0.85 : isLinked ? 0.6 : 0.18}
                  label={
                    m.label && labeledMarkerPositions.has(m.position)
                      ? {
                        value: m.label,
                        position: 'top',
                        fill: '#3b82f6',
                        fontSize: 9,
                        fontWeight: 600,
                        offset: 12,
                      }
                      : undefined
                  }
                />
              );
            })}

            {/* Baseline - ultra faint */}
            {showBackground && baselineData && (
              <Line
                type="monotone"
                dataKey="baseline"
                name="baseline"
                stroke="#94a3b8"
                strokeOpacity={0.15}
                dot={false}
                strokeWidth={1}
                strokeDasharray="4 4"
                isAnimationActive={false}
              />
            )}

            {/* Observed line - strong primary color */}
            <Line
              type="monotone"
              dataKey="observed"
              name="observed"
              stroke={settings.color}
              strokeWidth={2.5}
              dot={
                markers.length > 0
                  ? (dotProps: Record<string, unknown>) => (
                    <PeakMarkerDot
                      key={`dot-${dotProps.index}`}
                      {...dotProps}
                      peakMarkers={markers}
                      type={type}
                    />
                  )
                  : false
              }
              isAnimationActive={false}
            />

            {/* Secondary multi-sample overlay lines */}
            {overlaySeries?.map((series, idx) => {
              const palette = ['#f97316', '#10b981', '#ec4899', '#eab308', '#06b6d4', '#8b5cf6'];
              const strokeColor = series.color || palette[idx % palette.length];
              return (
                <Line
                  key={series.id}
                  type="monotone"
                  dataKey={series.id}
                  name={series.name}
                  stroke={strokeColor}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
        )}
        {isLoading && (
          <div className="absolute right-3 top-3 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-800" aria-live="polite">
            Processing signal…
          </div>
        )}
      </div>
    );
  }

  // ── Internal data rendering ──────────────────
  const residualOnly = showResidual && !showCalculated && !showBackground;
  const yDomain: [number, number] = residualOnly
    ? [settings.residualOffset - 8, settings.residualOffset + 8]
    : settings.yDomain;


  return (
    <div
      ref={containerRef}
      className="graph-container w-full relative"
    >
      {isContainerReady && (
      <ResponsiveContainer width="100%" height="100%" minHeight={40} minWidth={40}>
        <LineChart
          data={internalData}
          margin={hideAxes ? { top: 4, right: 4, bottom: 4, left: 4 } : { top: 16, right: 20, bottom: 16, left: 16 }}
          onClick={(nextState: Record<string, unknown> | undefined) => handleChartClick(nextState, onChartClick)}
        >
          {!hideGrid && !hideAxes && (
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" vertical={false} />
          )}
          {!hideAxes && (
            <XAxis
              dataKey="x"
              stroke="#94a3b8"
              tick={{ fill: '#94a3b8', fontSize: 12 }}
              tickLine={{ stroke: '#64748b' }}
              axisLine={{ stroke: '#334155' }}
              label={{ value: displayXLabel, position: 'bottom', fill: '#94a3b8', fontSize: 12 }}
              type="number"
              domain={settings.range}
              reversed={settings.reversed}
              tickFormatter={(value) => {
                const numeric = Number(value);
                if (!Number.isFinite(numeric)) return String(value);
                return Math.abs(numeric) >= 100 ? numeric.toFixed(0) : numeric.toFixed(1).replace(/\.0$/, '');
              }}
            />
          )}
          {!hideAxes && (
            <YAxis
              stroke="#94a3b8"
              tick={{ fill: '#94a3b8', fontSize: 12 }}
              tickLine={{ stroke: '#64748b' }}
              axisLine={{ stroke: '#334155' }}
              label={{ value: displayYLabel, angle: -90, position: 'left', fill: '#94a3b8', fontSize: 12 }}
              domain={yDomain}
              allowDataOverflow
              tickFormatter={(v) => (Math.abs(v) < 0.5 ? '0' : String(Math.round(v)))}
            />
          )}
          <Tooltip
            formatter={(value, name) => [
              typeof value === 'number' ? value.toFixed(2) : value,
              tooltipNames[String(name)] ?? name,
            ]}
            labelFormatter={(value) => `${displayXLabel}: ${Number(value).toFixed(2)}`}
            contentStyle={{
              backgroundColor: '#0f172a',
              borderColor: 'rgba(148,163,184,0.25)',
              borderRadius: '8px',
              color: '#e2e8f0',
              boxShadow: '0 12px 30px rgba(15,23,42,0.35)',
            }}
            itemStyle={{ color: '#e2e8f0' }}
            labelStyle={{ color: '#cbd5e1' }}
          />
          {showLegend && (
            <Legend
              formatter={(value: string | number) => {
                const overrides = techniqueLegendOverrides[type];
                return (overrides && overrides[String(value)]) || legendNames[String(value)] || String(value);
              }}
              wrapperStyle={{
                paddingTop: '16px',
                fontSize: '13px',
                fontWeight: 600,
                letterSpacing: '0.01em',
              }}
              iconType="line"
              iconSize={20}
            />
          )}

          {showResidual && (
            <>
              <ReferenceLine y={settings.residualOffset} stroke="#64748b" strokeDasharray="2 4" />
              <Line
                type="monotone"
                dataKey="residualDisplay"
                name="residualDisplay"
                stroke="#f97316"
                dot={false}
                strokeWidth={1}
                isAnimationActive={false}
              />
            </>
          )}
          {showBackground && !residualOnly && (
            <Line
              type="monotone"
              dataKey="background"
              name="background"
              stroke="#94a3b8"
              strokeOpacity={0.35}
              dot={false}
              strokeWidth={1}
              strokeDasharray="4 4"
              isAnimationActive={false}
            />
          )}
          {showCalculated && !residualOnly && (
            <Line
              type="monotone"
              dataKey="calculated"
              name="calculated"
              stroke="#60a5fa"
              strokeOpacity={0.7}
              dot={false}
              strokeWidth={2}
              isAnimationActive={false}
            />
          )}
          {!residualOnly && (
            <Line
              type="monotone"
              dataKey="observed"
              name="observed"
              stroke={settings.color}
              dot={false}
              strokeWidth={2.5}
              isAnimationActive={false}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
      )}
    </div>
  );
}
