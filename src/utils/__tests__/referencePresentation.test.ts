import { describe, expect, it } from 'vitest';
import { buildReferencePresentation } from '../referencePresentation';

describe('reference presentation', () => {
  it('keeps reference and units technique-specific', () => {
    const xrd = buildReferencePresentation('xrd', {
      referenceDatabase: 'COD',
      referenceDatabaseVersion: '2026.07',
      referenceDatabaseLicense: 'CC0-1.0',
      referenceApprovalStatus: 'approved',
      wavelength: 1.5406,
      matchingTolerance: 0.1,
    }, '2θ (°)', 'Intensity (a.u.)');
    const xps = buildReferencePresentation('xps', {
      referenceDatabase: 'NIST XPS',
      referenceDatabaseVersion: '2026.07',
      referenceDatabaseLicense: 'Provider terms',
      regionSelection: 'Survey',
      surveyPeakMinDistance: 0.5,
      matchingTolerance: 0.3,
    }, 'Binding energy (eV)', 'Counts / s');

    expect(xrd.unitRows.some((row) => row.label === 'd-spacing')).toBe(true);
    expect(xps.unitRows.some((row) => row.label === 'Spectrum scope' && row.value === 'Survey')).toBe(true);
    expect(xps.unitRows.some((row) => row.label === 'd-spacing')).toBe(false);
  });

  it('adds a certified-site approval remark for custom or uploaded references', () => {
    const presentation = buildReferencePresentation('ftir', {
      referenceDatabase: 'Uploaded reference',
      referenceDatabaseVersion: 'local-1',
      referenceDatabaseLicense: 'User supplied',
    }, 'Wavenumber', 'Absorbance');

    expect(presentation.certificationRemark).toContain('not approved by a certified site');
  });

  it('keeps element-only XPS reference controls visibly inactive in Survey scope', () => {
    const presentation = buildReferencePresentation('xps', {
      referenceDatabase: 'NIST XPS',
      regionSelection: 'Survey',
      referencePeak: 'C1s',
      referenceEnergy: 284.8,
    }, 'Binding energy (eV)', 'Counts / s');
    const elementReference = presentation.unitRows.find((row) => row.label === 'Element reference');

    expect(elementReference?.status).toBe('Not active');
    expect(elementReference?.value).toContain('Stored, not active');
  });
});
