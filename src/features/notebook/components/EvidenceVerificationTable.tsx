/**
 * ============================================================================
 * DIFARYX — Evidence Verification Table: Technique-Specific Data Split
 * ============================================================================
 *
 * Renders technique-specific verification tables that strictly separate
 * experimental data provenance from agent interpretations, following the
 * platform evidence-interpretation boundary rule.
 *
 * Layout:
 *   ┌─────────────────────────────────────────┐
 *   │  Experimental Data Provenance (Top)      │
 *   │  Raw extracted peak values, binding      │
 *   │  energies, wavenumbers, Raman shifts     │
 *   ├─────────────────────────────────────────┤
 *   │  Evidence Data ↑ | Agent Interpretation ↓│  ← Divider
 *   ├─────────────────────────────────────────┤
 *   │  Agent Interpretation (Bottom)           │
 *   │  Confidence, quality flags, next steps   │
 *   └─────────────────────────────────────────┘
 *
 * @component
 * ============================================================================
 */

import React from 'react';
import type {
  AnalysisFeature,
  AnalysisInterpretation,
} from '../../../data/analysisSessions';
import type { XpsEvidenceMetadata } from '../../../types/universalEvidence';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EvidenceVerificationTableProps {
  /** Technique identifier (XRD, XPS, FTIR, Raman). */
  technique: string;
  /** Extracted features for this technique. */
  features: AnalysisFeature[];
  /** Agent interpretation data from the session. */
  interpretation?: AnalysisInterpretation;
}

// ---------------------------------------------------------------------------
// Technique Display Metadata
// ---------------------------------------------------------------------------

interface TechniqueDisplayMeta {
  nameLabel: string;
  valueHeader: string;
  axisLabels: { x: string; y: string };
  metadataSubHeaders: string[];
}

const TECHNIQUE_META: Record<string, TechniqueDisplayMeta> = {
  XRD: {
    nameLabel: 'Peak / Phase',
    valueHeader: '2θ / d-spacing / Intensity',
    axisLabels: { x: '2θ (°)', y: 'Intensity (a.u.)' },
    metadataSubHeaders: ['Phase', 'd-spacing (Å)', 'hkl', 'Relative Intensity'],
  },
  XPS: {
    nameLabel: 'Identified Element / Core-Level Shell',
    valueHeader: 'Sub-Peak BE (eV) / ΔE / Bonding Assignment',
    axisLabels: { x: 'Binding Energy (eV)', y: 'Counts (a.u.)' },
    metadataSubHeaders: [
      'Identified Element',
      'Core-Level Shell',
      'Sub-Peak BE (eV)',
      'Splitting Interval (ΔE)',
      'Dynamic Bonding Assignment',
      'FWHM (eV)',
      'Atomic %',
      'Charging Calibration Offset',
    ],
  },
  FTIR: {
    nameLabel: 'Band / Functional Group',
    valueHeader: 'Wavenumber (cm⁻¹) / Transmittance',
    axisLabels: { x: 'Wavenumber (cm⁻¹)', y: 'Transmittance / Absorbance' },
    metadataSubHeaders: ['Wavenumber (cm⁻¹)', 'Functional Group', 'Vibrational Mode', 'Bonding Environment', 'Band Type'],
  },
  RAMAN: {
    nameLabel: 'Phonon Mode / Symmetry',
    valueHeader: 'Raman Shift (cm⁻¹) / Intensity',
    axisLabels: { x: 'Raman Shift (cm⁻¹)', y: 'Intensity (a.u.)' },
    metadataSubHeaders: ['Raman Shift (cm⁻¹)', 'Phonon Mode', 'Symmetry Label', 'Mode Assignment', 'Band Type'],
  },
};

const DEFAULT_META: TechniqueDisplayMeta = {
  nameLabel: 'Feature',
  valueHeader: 'Values',
  axisLabels: { x: 'X-axis', y: 'Y-axis' },
  metadataSubHeaders: [],
};

// ---------------------------------------------------------------------------
// Severity Color Helper
// ---------------------------------------------------------------------------

function getSeverityColor(severity: string): string {
  switch (severity) {
    case 'critical':
      return 'text-red-400 bg-red-900/30 border-red-500/30';
    case 'high':
      return 'text-orange-400 bg-orange-900/30 border-orange-500/30';
    case 'medium':
      return 'text-amber-400 bg-amber-900/30 border-amber-500/30';
    case 'low':
      return 'text-blue-400 bg-blue-900/30 border-blue-500/30';
    case 'info':
      return 'text-gray-400 bg-gray-800/30 border-gray-600/30';
    default:
      return 'text-gray-400 bg-gray-800/30 border-gray-600/30';
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const EvidenceVerificationTable: React.FC<EvidenceVerificationTableProps> = ({
  technique,
  features,
  interpretation,
}) => {
  const meta = TECHNIQUE_META[technique.toUpperCase()] || DEFAULT_META;

  // Collect all unique value keys across features for dynamic columns
  const valueKeys = React.useMemo(() => {
    const keySet = new Set<string>();
    for (const feature of features) {
      for (const key of Object.keys(feature.values)) {
        keySet.add(key);
      }
    }
    return Array.from(keySet);
  }, [features]);

  return (
    <div className="rounded-xl border border-gray-700/50 bg-gray-900/30 p-6 space-y-0">
      {/* ── Top Section: Experimental Data Provenance ── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-400" />
          <h4 className="text-sm font-semibold text-emerald-300">
            Experimental Data Provenance
          </h4>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-900/40 text-emerald-400 border border-emerald-500/20">
            {technique}
          </span>
        </div>

        {/* Axis Labels Sub-Header */}
        <div className="flex items-center gap-4 mb-2 px-1">
          <span className="text-[10px] text-gray-500">
            <span className="font-medium text-gray-400">X-axis:</span> {meta.axisLabels.x}
          </span>
          <span className="text-gray-700">|</span>
          <span className="text-[10px] text-gray-500">
            <span className="font-medium text-gray-400">Y-axis:</span> {meta.axisLabels.y}
          </span>
          {meta.metadataSubHeaders.length > 0 && (
            <>
              <span className="text-gray-700">|</span>
              <span className="text-[10px] text-gray-500">
                <span className="font-medium text-gray-400">Expected metadata:</span>{' '}
                {meta.metadataSubHeaders.join(' · ')}
              </span>
            </>
          )}
        </div>

        {features.length === 0 ? (
          <p className="text-gray-500 text-xs italic pl-4">
            No extracted features available for {technique}.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-800/50">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-800/60 bg-gray-900/50">
                  <th className="text-left px-3 py-2 text-gray-400 font-medium">
                    #
                  </th>
                  <th className="text-left px-3 py-2 text-gray-400 font-medium">
                    {meta.nameLabel}
                  </th>
                  {valueKeys.map((key) => (
                    <th
                      key={key}
                      className="text-right px-3 py-2 text-gray-400 font-medium"
                    >
                      {formatValueKey(key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {features.map((feature, idx) => (
                  <React.Fragment key={feature.id}>
                    <tr className="border-b border-gray-800/30 hover:bg-gray-800/20 transition-colors">
                      <td className="px-3 py-2 text-gray-500 tabular-nums">
                        {idx + 1}
                      </td>
                      <td className="px-3 py-2 text-gray-300 font-medium">
                        {feature.label}
                      </td>
                      {valueKeys.map((key) => (
                        <td
                          key={key}
                          className="px-3 py-2 text-right text-gray-200 tabular-nums"
                        >
                          {feature.values[key] ?? '—'}
                        </td>
                      ))}
                    </tr>
                    {/* ── XPS Registry-Enriched Sub-Row ── */}
                    {technique.toUpperCase() === 'XPS' && renderXpsEnrichmentRow(feature)}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Divider: Evidence ↔ Interpretation Boundary ── */}
      <div className="flex items-center gap-3 py-4">
        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-600 to-transparent" />
        <span className="text-[10px] font-semibold tracking-widest uppercase text-gray-500 whitespace-nowrap px-3">
          Evidence Data ↑&nbsp;&nbsp;|&nbsp;&nbsp;Agent Interpretation ↓
        </span>
        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-600 to-transparent" />
      </div>

      {/* ── Bottom Section: Agent Interpretation ── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="inline-block w-2 h-2 rounded-full bg-purple-400" />
          <h4 className="text-sm font-semibold text-purple-300">
            Agent Interpretation
          </h4>
        </div>

        {!interpretation ? (
          <p className="text-gray-500 text-xs italic pl-4">
            No agent interpretation available for this session.
          </p>
        ) : (
          <div className="space-y-3">
            {/* Confidence Summary */}
            <div className="rounded-lg border border-gray-800/50 bg-gray-900/20 p-3">
              <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">
                Confidence Assessment
              </span>
              <p className="text-gray-300 text-xs mt-1">
                {interpretation.confidence}
              </p>
            </div>

            {/* Evidence Contribution */}
            {interpretation.evidenceContribution && (
              <div className="rounded-lg border border-gray-800/50 bg-gray-900/20 p-3">
                <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">
                  Evidence Contribution
                </span>
                <p className="text-gray-300 text-xs mt-1">
                  {interpretation.evidenceContribution}
                </p>
              </div>
            )}

            {/* Validation Impact */}
            {interpretation.validationImpact && (
              <div className="rounded-lg border border-gray-800/50 bg-gray-900/20 p-3">
                <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">
                  Validation Impact
                </span>
                <p className="text-gray-300 text-xs mt-1">
                  {interpretation.validationImpact}
                </p>
              </div>
            )}

            {/* Quality Flags */}
            {interpretation.qualityFlags && interpretation.qualityFlags.length > 0 && (
              <div className="rounded-lg border border-gray-800/50 bg-gray-900/20 p-3">
                <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">
                  Quality Flags
                </span>
                <div className="mt-2 space-y-1">
                  {interpretation.qualityFlags.map((flag, idx) => {
                    // Extract severity from flag text like "[CRITICAL] ..."
                    const severityMatch = flag.match(/^\[(\w+)\]/);
                    const severity = severityMatch ? severityMatch[1].toLowerCase() : 'info';
                    const colorClass = getSeverityColor(severity);

                    return (
                      <div
                        key={idx}
                        className={`text-[11px] px-2 py-1 rounded border ${colorClass}`}
                      >
                        {flag}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Recommended Next Steps */}
            {interpretation.recommendedNextSteps &&
              interpretation.recommendedNextSteps.length > 0 && (
                <div className="rounded-lg border border-gray-800/50 bg-gray-900/20 p-3">
                  <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">
                    Recommended Next Steps
                  </span>
                  <ul className="mt-2 space-y-1">
                    {interpretation.recommendedNextSteps.map((step, idx) => (
                      <li
                        key={idx}
                        className="text-xs text-gray-300 flex items-start gap-2"
                      >
                        <span className="text-purple-400 mt-0.5">→</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
          </div>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format a camelCase or snake_case value key into a readable column header.
 * e.g. "binding_energy" → "Binding Energy", "position" → "Position"
 */
function formatValueKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// XPS Registry-Enriched Sub-Row Renderer
// ---------------------------------------------------------------------------

/**
 * Render an XPS enrichment sub-row beneath the main feature row.
 *
 * When the feature's metadata contains registry-enriched fields (element,
 * shell, bondingAssignment, doubletSplitting, chargingCalibrationOffset),
 * this renders a high-density detail row showing the full deconvolution
 * window and chemical environment mapping.
 *
 * Returns null if no enriched XPS metadata is available on the feature.
 */
function renderXpsEnrichmentRow(feature: AnalysisFeature): React.ReactNode {
  const meta = feature.metadata as (XpsEvidenceMetadata & Record<string, unknown>) | undefined;
  if (!meta) return null;

  const hasEnrichment = meta.element || meta.shell || meta.bondingAssignment || meta.doubletSplitting;
  if (!hasEnrichment) return null;

  return (
    <tr className="border-b border-gray-800/20 bg-gray-900/10">
      <td colSpan={2} className="px-3 py-1.5" />
      <td colSpan={100} className="px-3 py-1.5">
        <div className="flex flex-wrap items-center gap-2">
          {/* Element & Shell Badge */}
          {meta.element && meta.shell && (
            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-cyan-900/40 text-cyan-300 border border-cyan-500/20 font-mono">
              {meta.element} {meta.shell}
            </span>
          )}

          {/* Sub-Peak Binding Energy */}
          {feature.values.binding_energy && (
            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-blue-900/40 text-blue-300 border border-blue-500/20 font-mono">
              {feature.values.binding_energy} eV
            </span>
          )}

          {/* Doublet Splitting Interval */}
          {meta.doubletSplitting && (
            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-indigo-900/40 text-indigo-300 border border-indigo-500/20 font-mono">
              ΔE = {typeof meta.doubletSplitting === 'number' ? meta.doubletSplitting.toFixed(1) : meta.doubletSplitting} eV
            </span>
          )}

          {/* Dynamic Bonding Assignment */}
          {meta.bondingAssignment && (
            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-900/30 text-emerald-300 border border-emerald-500/20">
              {meta.bondingAssignment}
            </span>
          )}

          {/* Charging Calibration Offset */}
          {meta.chargingCalibrationOffset !== undefined && meta.chargingCalibrationOffset !== 0 && (
            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-900/30 text-amber-300 border border-amber-500/20 font-mono">
              C 1s offset: {meta.chargingCalibrationOffset >= 0 ? '+' : ''}
              {typeof meta.chargingCalibrationOffset === 'number' ? meta.chargingCalibrationOffset.toFixed(1) : meta.chargingCalibrationOffset} eV
            </span>
          )}

          {/* Chemical State (legacy fallback) */}
          {meta.chemicalState && !meta.bondingAssignment && (
            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-purple-900/30 text-purple-300 border border-purple-500/20">
              {meta.chemicalState}
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}

export default EvidenceVerificationTable;
