/**
 * Unit tests — FTIR Evidence Contract (P0.1)
 *
 * Scope: schema conformance, JSON serializability, unit detection
 * determinism, and reuse of canonical contracts.
 *
 * Out of scope: processing logic, notebook rendering, fusion logic.
 */

import { describe, it, expect } from 'vitest';

import {
  detectFtirSignalUnit,
  summarize,
  FTIR_TECHNIQUE,
  FTIR_EVIDENCE_SCHEMA_VERSION,
  FTIR_MEDIUM_CONFIDENCE_THRESHOLD,
  FTIR_HIGH_CONFIDENCE_THRESHOLD,
  type FtirEvidence,
  type FtirSignalDescriptor,
  type FtirUnitDetectionResult,
  type FtirRawPoint,
} from '../types';

import type { UniversalEvidenceNode } from '../../../types/universalEvidence';
import type { ValidationGap } from '../../../engines/reasoningEngine/types';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function transmittanceFixture(): FtirRawPoint[] {
  // Mimic a typical FTIR transmittance spectrum: baseline near 95%, bands dip downward.
  const points: FtirRawPoint[] = [];
  for (let i = 0; i < 200; i++) {
    const wn = 4000 - (i / 199) * 3600; // 4000 → 400 cm⁻¹
    let y = 95;
    if (wn > 3200 && wn < 3600) y -= 25;        // O–H
    else if (wn > 2850 && wn < 2960) y -= 8;    // C–H
    else if (wn > 1680 && wn < 1750) y -= 22;   // C=O
    else if (wn > 1000 && wn < 1200) y -= 18;   // C–O
    points.push({ x: wn, y });
  }
  return points;
}

function absorbanceFixture(): FtirRawPoint[] {
  const points: FtirRawPoint[] = [];
  for (let i = 0; i < 200; i++) {
    const wn = 4000 - (i / 199) * 3600;
    let y = 0.05;
    if (wn > 3200 && wn < 3600) y += 0.7;
    else if (wn > 2850 && wn < 2960) y += 0.2;
    else if (wn > 1680 && wn < 1750) y += 0.9;
    points.push({ x: wn, y });
  }
  return points;
}

function minimalFtirEvidence(): FtirEvidence {
  const provenance = {
    datasetId: 'ds-2024-001',
    sampleName: 'CS-10',
    materialClass: 'cellulose composite',
    processingHash: 'sha256:abc123',
    createdAt: '2026-05-27T14:30:00Z',
    engineVersion: 'ftir-evidence/0.1.0',
  };

  const band: UniversalEvidenceNode = {
    id: 'ftir-band-1',
    technique: 'FTIR',
    primaryAxis: 3420,
    primaryAxisUnit: 'cm⁻¹',
    value: 0.7,
    valueUnit: 'absorbance',
    label: 'O–H stretch',
    concept: 'hydroxyl',
    role: 'primary',
    confidence: 'high',
    techniqueMetadata: {
      vibrationalMode: 'O–H stretch',
      functionalGroup: 'hydroxyl',
      bandType: 'broad',
      intensityCategory: 'strong',
    },
    provenance,
  };

  const gap: ValidationGap = {
    gapId: 'GAP-MISS-001',
    category: 'missing_technique',
    severity: 'critical',
    techniques: ['XRD'],
    description:
      'Bulk crystallographic identity cannot be confirmed from FTIR alone.',
    interpretation:
      'FTIR is a surface/bonding probe and does not access long-range order.',
    relatedCorrelationIds: [],
    recommendation: 'Acquire XRD pattern to identify crystalline phase.',
    timestamp: '2026-05-27T14:30:00Z',
  };

  const signal: FtirSignalDescriptor = {
    unit: 'absorbance',
    wavenumberRange: [400, 4000],
    pointCount: 620,
    unitDetection: 'inferred_from_range',
    unitDetectionConfidence: 0.7,
    rawQuality: 'good',
    axisReversed: true,
  };

  return {
    evidenceId: 'ftir-ev-2024-001',
    technique: 'FTIR',
    assembledAt: '2026-05-27T14:30:00Z',
    bands: [band],
    functionalGroups: [band],
    signal,
    confidence: {
      overall: 'medium',
      overallScore: 0.65,
      byGroup: { hydroxyl: 0.7 },
      reasons: ['Strong O–H stretch; no supporting band yet detected.'],
    },
    validationGaps: [gap],
    provenance,
    caveats: [
      'Broad O–H band may include contributions from surface hydroxyl and adsorbed water.',
    ],
  };
}

// ---------------------------------------------------------------------------
// 1. detectFtirSignalUnit
// ---------------------------------------------------------------------------

describe('detectFtirSignalUnit', () => {
  it('returns unknown for empty input', () => {
    const r = detectFtirSignalUnit([]);
    expect(r.unit).toBe('unknown');
    expect(r.confidence).toBe(0);
  });

  it('detects transmittance from [0, 100] range with mean > 30', () => {
    const r = detectFtirSignalUnit(transmittanceFixture());
    expect(r.unit).toBe('transmittance');
    expect(r.source).toBe('inferred_from_range');
    expect(r.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it('detects absorbance from [0, ~1.5] range', () => {
    const r = detectFtirSignalUnit(absorbanceFixture());
    expect(r.unit).toBe('absorbance');
    expect(r.source).toBe('inferred_from_range');
    expect(r.confidence).toBeGreaterThanOrEqual(0.65);
  });

  it('honors user-declared hint with confidence 1.0', () => {
    const r = detectFtirSignalUnit(transmittanceFixture(), {
      declaredUnit: 'transmittance',
    });
    expect(r.unit).toBe('transmittance');
    expect(r.source).toBe('user_declared');
    expect(r.confidence).toBe(1.0);
  });

  it('honors header label containing "transmittance"', () => {
    const r = detectFtirSignalUnit(transmittanceFixture(), {
      label: 'Transmittance (%)',
    });
    expect(r.unit).toBe('transmittance');
    expect(r.source).toBe('header_label');
    expect(r.confidence).toBe(0.95);
  });

  it('honors header label containing "A.U."', () => {
    const r = detectFtirSignalUnit(absorbanceFixture(), {
      label: 'Absorbance (A.U.)',
    });
    expect(r.unit).toBe('absorbance');
    expect(r.source).toBe('header_label');
    expect(r.confidence).toBe(0.95);
  });

  it('returns unknown when y-range is neither transmittance nor absorbance', () => {
    const weird: FtirRawPoint[] = [
      { x: 1000, y: 5000 },
      { x: 2000, y: 5500 },
    ];
    const r = detectFtirSignalUnit(weird);
    expect(r.unit).toBe('unknown');
    expect(r.confidence).toBe(0);
  });

  it('is deterministic — same input yields same output', () => {
    const pts = transmittanceFixture();
    const a = detectFtirSignalUnit(pts);
    const b = detectFtirSignalUnit(pts);
    expect(a).toEqual(b);
  });

  it('preserves summary statistics in result', () => {
    const pts = transmittanceFixture();
    const r: FtirUnitDetectionResult = detectFtirSignalUnit(pts);
    expect(r.statistics.yMin).toBeLessThan(r.statistics.yMean);
    expect(r.statistics.yMax).toBeGreaterThan(r.statistics.yMean);
    expect(r.statistics.yMean).toBeGreaterThan(30);
    expect(r.statistics.yMean).toBeLessThan(100);
  });
});

// ---------------------------------------------------------------------------
// 2. summarize (helper, exposed for testing only)
// ---------------------------------------------------------------------------

describe('summarize', () => {
  it('computes min, max, mean, std', () => {
    const stats = summarize([
      { x: 1, y: 0 },
      { x: 2, y: 10 },
      { x: 3, y: 20 },
    ]);
    expect(stats.yMin).toBe(0);
    expect(stats.yMax).toBe(20);
    expect(stats.yMean).toBeCloseTo(10, 6);
    expect(stats.yStd).toBeGreaterThan(0);
  });

  it('returns zeros for empty input', () => {
    const stats = summarize([]);
    expect(stats).toEqual({ yMin: 0, yMax: 0, yMean: 0, yStd: 0 });
  });

  it('ignores non-finite values', () => {
    const stats = summarize([
      { x: 1, y: 5 },
      { x: 2, y: Number.NaN },
      { x: 3, y: 15 },
    ]);
    expect(stats.yMin).toBe(5);
    expect(stats.yMax).toBe(15);
    expect(stats.yMean).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// 3. FtirEvidence structural conformance
// ---------------------------------------------------------------------------

describe('FtirEvidence schema', () => {
  it('round-trips through JSON.stringify / JSON.parse', () => {
    const ev = minimalFtirEvidence();
    const json = JSON.stringify(ev);
    const restored = JSON.parse(json) as FtirEvidence;
    expect(restored.evidenceId).toBe(ev.evidenceId);
    expect(restored.technique).toBe('FTIR');
    expect(restored.bands.length).toBe(1);
    expect(restored.bands[0].primaryAxis).toBe(3420);
    expect(restored.validationGaps.length).toBe(1);
    expect(restored.validationGaps[0].category).toBe('missing_technique');
  });

  it('technique tag is fixed to FTIR', () => {
    const ev = minimalFtirEvidence();
    expect(ev.technique).toBe('FTIR');
    expect(FTIR_TECHNIQUE).toBe('FTIR');
  });

  it('reuses UniversalEvidenceNode for bands (technique-agnostic shape)', () => {
    const ev = minimalFtirEvidence();
    const band = ev.bands[0];
    expect(band.technique).toBe('FTIR');
    expect(band.primaryAxisUnit).toBe('cm⁻¹');
    expect(band.provenance?.datasetId).toBe('ds-2024-001');
  });

  it('reuses ValidationGap schema (not a new FTIR-specific gap type)', () => {
    const ev = minimalFtirEvidence();
    const gap = ev.validationGaps[0];
    expect(gap.gapId).toMatch(/^GAP-/);
    expect(gap.techniques).toContain('XRD');
    expect(gap.recommendation.length).toBeGreaterThan(0);
  });

  it('confidence uses ConfidenceLevel vocabulary', () => {
    const ev = minimalFtirEvidence();
    expect(['high', 'medium', 'low', 'uncertain']).toContain(ev.confidence.overall);
    expect(ev.confidence.overallScore).toBeGreaterThanOrEqual(0);
    expect(ev.confidence.overallScore).toBeLessThanOrEqual(1);
  });

  it('caveats use evidence-first language (no overclaim verbs)', () => {
    const ev = minimalFtirEvidence();
    for (const caveat of ev.caveats) {
      expect(caveat).not.toMatch(/\bproves?\b/i);
      expect(caveat).not.toMatch(/\bconfirms?\b/i);
      expect(caveat).not.toMatch(/\bguarantees?\b/i);
      expect(caveat).not.toMatch(/\bdefinitely\b/i);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Constants
// ---------------------------------------------------------------------------

describe('FTIR evidence constants', () => {
  it('FTIR_EVIDENCE_SCHEMA_VERSION is a semver string', () => {
    expect(FTIR_EVIDENCE_SCHEMA_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('confidence thresholds are ordered (high > medium)', () => {
    expect(FTIR_HIGH_CONFIDENCE_THRESHOLD).toBeGreaterThan(
      FTIR_MEDIUM_CONFIDENCE_THRESHOLD,
    );
  });

  it('thresholds are within [0, 1]', () => {
    expect(FTIR_MEDIUM_CONFIDENCE_THRESHOLD).toBeGreaterThan(0);
    expect(FTIR_HIGH_CONFIDENCE_THRESHOLD).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// 5. Reuse guarantees — schema must NOT introduce technique-specific gap type
// ---------------------------------------------------------------------------

describe('Reuse guarantees (architecture rule)', () => {
  it('validationGaps uses engine ValidationGap, not an FTIR-local fork', () => {
    const ev = minimalFtirEvidence();
    // The actual shape comes from engines/reasoningEngine/types.ts ValidationGap.
    // We assert the shape is compatible (no new field like 'ftirSpecificReason').
    const gap = ev.validationGaps[0];
    expect(gap).toHaveProperty('gapId');
    expect(gap).toHaveProperty('category');
    expect(gap).toHaveProperty('severity');
    expect(gap).toHaveProperty('techniques');
    expect(gap).toHaveProperty('description');
    expect(gap).toHaveProperty('recommendation');
    expect(gap).toHaveProperty('timestamp');
    // Reject FTIR-only additions
    expect(gap).not.toHaveProperty('ftirSpecific');
  });

  it('provenance is shared EvidenceProvenance, not a local clone', () => {
    const ev = minimalFtirEvidence();
    const p = ev.provenance;
    expect(p).toHaveProperty('datasetId');
    expect(p).toHaveProperty('processingHash');
    expect(p).toHaveProperty('createdAt');
  });
});
