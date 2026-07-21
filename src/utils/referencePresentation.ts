import type { CanonicalParameterValue } from '../data/parameterDefinitions';
import type { ImportedReferenceFile, ReferencePresentation, ReferenceUnitRow, TechniqueId } from './reportPreviewTypes';

const NOT_AVAILABLE = 'Not available';
const ANGSTROM = '\u00c5';
const TWO_THETA = '\u00b0 2\u03b8';
const WAVENUMBER = 'cm\u207b\u00b9';
const REFERENCE_FILE_STORAGE_PREFIX = 'difaryx-reference-file:v1';

function referenceFileStorageKey(projectId: string, technique: TechniqueId): string {
  return `${REFERENCE_FILE_STORAGE_PREFIX}:${projectId}:${technique}`;
}

export function readImportedReferenceFile(projectId: string, technique: TechniqueId): ImportedReferenceFile | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(referenceFileStorageKey(projectId, technique));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ImportedReferenceFile>;
    if (
      typeof parsed.filename !== 'string'
      || typeof parsed.size !== 'number'
      || typeof parsed.mediaType !== 'string'
      || typeof parsed.importedAt !== 'string'
    ) return null;
    return {
      filename: parsed.filename,
      size: parsed.size,
      mediaType: parsed.mediaType,
      importedAt: parsed.importedAt,
      status: 'pending_certified_site_approval',
    };
  } catch {
    return null;
  }
}

export function writeImportedReferenceFile(projectId: string, technique: TechniqueId, file: ImportedReferenceFile): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(referenceFileStorageKey(projectId, technique), JSON.stringify(file));
  } catch {
    // Local persistence is best effort. The active UI state remains available.
  }
}

function valueText(values: Record<string, CanonicalParameterValue>, id: string, fallback = NOT_AVAILABLE): string {
  const value = values[id];
  if (value === null || value === undefined || value === '') return fallback;
  if (Array.isArray(value)) return value.length ? value.join(', ') : fallback;
  if (typeof value === 'number') return Number.isInteger(value) ? value.toLocaleString('en-US') : value.toLocaleString('en-US', { maximumFractionDigits: 4 });
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

function rangeText(values: Record<string, CanonicalParameterValue>, minId: string, maxId: string, unit: string): ReferenceUnitRow {
  const min = valueText(values, minId);
  const max = valueText(values, maxId);
  return {
    label: 'Spectral range',
    value: min === NOT_AVAILABLE || max === NOT_AVAILABLE ? NOT_AVAILABLE : `${min} - ${max}`,
    unit,
  };
}

function humanizeStatus(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function hasCustomOrImportedReference(values: Record<string, CanonicalParameterValue>): boolean {
  const referenceSignals = [
    valueText(values, 'referenceDatabase', ''),
    valueText(values, 'referenceSetId', ''),
    valueText(values, 'assignmentLibrary', ''),
    valueText(values, 'modeLibrary', ''),
  ].join(' ').toLowerCase().replace(/[_-]+/g, ' ');

  return /custom|upload|import|project local|local reference/.test(referenceSignals);
}

export function buildReferencePresentation(
  technique: TechniqueId,
  values: Record<string, CanonicalParameterValue>,
  xLabel: string,
  yLabel: string,
  importedFile?: ImportedReferenceFile | null,
): ReferencePresentation {
  const provider = valueText(values, 'referenceDatabase');
  const version = valueText(values, 'referenceDatabaseVersion');
  const license = valueText(values, 'referenceDatabaseLicense');
  const customOrImported = hasCustomOrImportedReference(values) || Boolean(importedFile);
  const xrdApprovalStatus = valueText(values, 'referenceApprovalStatus', 'Not reviewed');

  const unitRows: ReferenceUnitRow[] = technique === 'xrd'
    ? [
      { label: 'Peak position', value: xLabel || '2θ', unit: TWO_THETA },
      { label: 'Intensity', value: yLabel || 'Intensity', unit: 'a.u.' },
      { label: 'Radiation wavelength', value: valueText(values, 'wavelength'), unit: ANGSTROM },
      { label: 'd-spacing', value: 'Derived from matched peak position', unit: ANGSTROM },
      { label: 'Matching tolerance', value: valueText(values, 'matchingTolerance'), unit: TWO_THETA },
    ]
    : technique === 'xps'
      ? [
        { label: 'Spectrum scope', value: valueText(values, 'regionSelection', valueText(values, 'analyzerMode')) },
        { label: 'Binding-energy axis', value: xLabel || 'Binding energy', unit: 'eV' },
        { label: 'Signal axis', value: yLabel || 'Counts / s' },
        { label: 'Survey detection spacing', value: valueText(values, 'surveyPeakMinDistance'), unit: 'eV' },
        {
          label: 'Element reference',
          value: valueText(values, 'regionSelection').toLowerCase() === 'survey'
            ? 'Stored, not active in Survey scope'
            : `${valueText(values, 'referencePeak')} at ${valueText(values, 'referenceEnergy')} eV`,
          status: valueText(values, 'regionSelection').toLowerCase() === 'survey' ? 'Not active' : 'Active',
        },
        { label: 'Matching tolerance', value: valueText(values, 'matchingTolerance'), unit: 'eV' },
      ]
      : technique === 'ftir'
        ? [
          { label: 'Measurement mode', value: valueText(values, 'measurementMode') },
          { label: 'Signal representation', value: valueText(values, 'signalRepresentation') },
          { label: 'Wavenumber axis', value: xLabel || 'Wavenumber', unit: WAVENUMBER },
          { label: 'Signal axis', value: yLabel || valueText(values, 'signalRepresentation') },
          rangeText(values, 'wavenumberMin', 'wavenumberMax', WAVENUMBER),
          { label: 'Matching tolerance', value: valueText(values, 'matchingTolerance'), unit: WAVENUMBER },
        ]
        : [
          { label: 'Raman-shift axis', value: xLabel || 'Raman shift', unit: WAVENUMBER },
          { label: 'Intensity', value: yLabel || 'Intensity', unit: 'a.u.' },
          { label: 'Laser wavelength', value: valueText(values, 'laserWavelength'), unit: 'nm' },
          rangeText(values, 'ramanShiftMin', 'ramanShiftMax', WAVENUMBER),
          { label: 'Matching tolerance', value: valueText(values, 'matchingTolerance'), unit: WAVENUMBER },
        ];

  return {
    provider,
    version,
    license,
    approvalStatus: customOrImported
      ? `${humanizeStatus(xrdApprovalStatus)} (local record)`
      : technique === 'xrd'
        ? humanizeStatus(xrdApprovalStatus)
        : 'Provider reference',
    certificationRemark: customOrImported
      ? `Custom/imported reference${importedFile ? ` (${importedFile.filename})` : ''}: not approved by a certified site. Treat matches as candidate evidence only, not validated reference evidence.`
      : null,
    unitRows,
    importedFile: importedFile ?? undefined,
  };
}
