import React from 'react';
import { cn } from '../ui/Button';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ScientificTechnique = 'xrd' | 'ftir' | 'xps' | 'raman';
export type FeatureSource = 'auto' | 'manual' | 'imported';

export interface ScientificFeature {
  id?: string;
  technique?: ScientificTechnique;
  position?: number;
  positionUnit?: string;
  intensity?: number;
  width?: number;
  fwhm?: number;
  dSpacing?: number;
  snr?: number;
  label?: string;
  assignment?: string;
  confidence?: number;
  source?: FeatureSource;
}

interface ScientificFeatureTableProps {
  features?: ScientificFeature[] | null;
  technique: ScientificTechnique;
  className?: string;
}

// ---------------------------------------------------------------------------
// Technique Column Config
// ---------------------------------------------------------------------------

interface ColumnDef {
  key: string;
  header: string;
  accessor: (feature: ScientificFeature) => string;
  align: 'left' | 'right';
}

const DASH = '—';

function fmtNum(value: number | undefined, decimals = 2): string {
  if (value === undefined || value === null || !Number.isFinite(value)) return DASH;
  return value.toFixed(decimals);
}

function fmtConfidence(value: number | undefined): string {
  if (value === undefined || value === null) return DASH;
  if (!Number.isFinite(value)) return DASH;
  const pct = value <= 1 ? value * 100 : value;
  return `${pct.toFixed(0)}%`;
}

function positionLabel(technique: ScientificTechnique): string {
  switch (technique) {
    case 'xrd': return '2θ (°)';
    case 'ftir': return 'Wavenumber (cm⁻¹)';
    case 'xps': return 'BE (eV)';
    case 'raman': return 'Shift (cm⁻¹)';
  }
}

function buildColumns(technique: ScientificTechnique): ColumnDef[] {
  const base: ColumnDef[] = [
    {
      key: 'label',
      header: 'Label',
      accessor: (f) => f.label ?? DASH,
      align: 'left',
    },
    {
      key: 'position',
      header: positionLabel(technique),
      accessor: (f) => fmtNum(f.position, 2),
      align: 'right',
    },
    {
      key: 'intensity',
      header: 'Intensity',
      accessor: (f) => fmtNum(f.intensity, 1),
      align: 'right',
    },
  ];

  const techniqueSpecific: ColumnDef[] = [];

  switch (technique) {
    case 'xrd':
      techniqueSpecific.push(
        {
          key: 'fwhm',
          header: 'FWHM (°)',
          accessor: (f) => fmtNum(f.fwhm ?? f.width, 3),
          align: 'right',
        },
        {
          key: 'dSpacing',
          header: 'd (Å)',
          accessor: (f) => fmtNum(f.dSpacing, 3),
          align: 'right',
        },
        {
          key: 'snr',
          header: 'SNR',
          accessor: (f) => fmtNum(f.snr, 1),
          align: 'right',
        },
      );
      break;

    case 'ftir':
      techniqueSpecific.push(
        {
          key: 'width',
          header: 'Width (cm⁻¹)',
          accessor: (f) => fmtNum(f.width ?? f.fwhm, 1),
          align: 'right',
        },
      );
      break;

    case 'xps':
      techniqueSpecific.push(
        {
          key: 'fwhm',
          header: 'FWHM (eV)',
          accessor: (f) => fmtNum(f.fwhm ?? f.width, 2),
          align: 'right',
        },
      );
      break;

    case 'raman':
      techniqueSpecific.push(
        {
          key: 'fwhm',
          header: 'FWHM (cm⁻¹)',
          accessor: (f) => fmtNum(f.fwhm ?? f.width, 1),
          align: 'right',
        },
      );
      break;
  }

  techniqueSpecific.push(
    {
      key: 'assignment',
      header: 'Assignment',
      accessor: (f) => f.assignment ?? DASH,
      align: 'left',
    },
    {
      key: 'confidence',
      header: 'Confidence',
      accessor: (f) => fmtConfidence(f.confidence),
      align: 'right',
    },
  );

  return [...base, ...techniqueSpecific];
}

// ---------------------------------------------------------------------------
// Empty State
// ---------------------------------------------------------------------------

function EmptyFeatureState({ technique }: { technique: ScientificTechnique }) {
  const label = technique.toUpperCase();
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <p className="text-xs text-text-muted">
        No features detected for {label}.
      </p>
      <p className="mt-1 text-[10px] text-text-muted/70">
        Feature data will appear here after analysis completes.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const ScientificFeatureTable: React.FC<ScientificFeatureTableProps> = ({
  features,
  technique,
  className,
}) => {
  const safeFeatures = features ?? [];
  const columns = React.useMemo(() => buildColumns(technique), [technique]);

  if (safeFeatures.length === 0) {
    return <EmptyFeatureState technique={technique} />;
  }

  return (
    <div className={cn('w-full overflow-x-auto', className)}>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border/60 bg-background/50">
            <th className="px-2 py-1.5 text-left text-[10px] font-medium text-text-muted">#</th>
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  'px-2 py-1.5 text-[10px] font-medium text-text-muted',
                  col.align === 'right' ? 'text-right' : 'text-left',
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {safeFeatures.map((feature, idx) => (
            <tr
              key={feature.id ?? `feature-${idx}`}
              className="border-b border-border/30 transition-colors hover:bg-surface/50"
            >
              <td className="px-2 py-1.5 tabular-nums text-text-muted">{idx + 1}</td>
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cn(
                    'px-2 py-1.5 tabular-nums text-text-main',
                    col.align === 'right' ? 'text-right' : 'text-left',
                  )}
                >
                  {col.accessor(feature)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Adapters — convert existing workspace data shapes to ScientificFeature
// ---------------------------------------------------------------------------

function safeParseFloat(value: string | undefined | null): number | undefined {
  if (value === undefined || value === null) return undefined;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : undefined;
}

function extractAssignment(detail: string | undefined): string | undefined {
  if (!detail) return undefined;
  const trimmed = detail.trim();
  if (!trimmed || trimmed === '—') return undefined;
  return trimmed;
}

export function featureRowToScientificFeature(
  row: { label: string; value: string; detail: string },
  index: number,
): ScientificFeature {
  const position = safeParseFloat(row.value);
  const intensityMatch = row.detail?.match(/Intensity\s+([\d.]+)/i);
  const intensity = intensityMatch ? safeParseFloat(intensityMatch[1]) : undefined;
  const assignment = !intensityMatch ? extractAssignment(row.detail) : undefined;

  return {
    id: `fr-${index}`,
    technique: 'xrd',
    position,
    intensity,
    label: row.label || undefined,
    assignment: assignment ?? (intensityMatch ? row.detail : undefined),
  };
}

export function peakMarkerToScientificFeature(
  peak: { position: number; intensity: number; label?: string; role?: string },
  index: number,
): ScientificFeature {
  return {
    id: `pm-${index}`,
    technique: 'xrd',
    position: peak.position,
    intensity: peak.intensity,
    label: peak.label || undefined,
  };
}

export function xrdPeakToScientificFeature(peak: {
  id?: string;
  position: number;
  intensity: number;
  fwhm?: number;
  dSpacing?: number;
  snr?: number;
  label?: string;
  assignment?: string;
  confidence?: number;
  prominence?: number;
}, index: number): ScientificFeature {
  return {
    id: peak.id ?? `xrd-${index}`,
    technique: 'xrd',
    position: peak.position,
    intensity: peak.intensity,
    fwhm: peak.fwhm,
    dSpacing: peak.dSpacing,
    snr: peak.snr,
    label: peak.label,
    assignment: peak.assignment,
    confidence: peak.confidence,
  };
}

export function xpsPeakToScientificFeature(peak: any, index: number): ScientificFeature {
  return {
    id: peak.id ?? `xps-${index}`,
    technique: 'xps',
    position: peak.position ?? peak.bindingEnergy,
    intensity: peak.intensity,
    fwhm: peak.fwhm ?? peak.width,
    label: peak.label,
    assignment: peak.assignment ?? peak.context,
    confidence: peak.confidence,
  };
}

export function techniqueFeatureToScientificFeature(f: {
  id?: string;
  label?: string;
  position?: number;
  intensity?: number;
  context?: string;
}): ScientificFeature {
  return {
    id: f.id,
    technique: 'xrd',
    position: f.position,
    intensity: f.intensity,
    label: f.label,
    assignment: f.context || undefined,
  };
}

export default ScientificFeatureTable;
