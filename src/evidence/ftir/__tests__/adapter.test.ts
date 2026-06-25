/**
 * Unit tests — FTIR Evidence Adapter (P0.2)
 *
 * Scope:
 *   - Band mapping (FtirDetectedBand → UniversalEvidenceNode)
 *   - Signal descriptor (unit detection + quality rating)
 *   - Provenance preservation
 *   - Contract validation (FtirAdapterContractError)
 *   - Determinism (pure function, no hidden state)
 *   - Negative assertions: adapter does NOT produce reasoning artifacts
 *
 * Out of scope (deferred to later phases):
 *   - ValidationGap generation
 *   - Functional-group mapping
 *   - Confidence reasoning
 *   - Caveat generation
 */

import { describe, it, expect } from 'vitest';

import {
  adaptFtirProcessingResult,
  ftirBandToEvidenceNode,
  buildFtirSignalDescriptor,
  buildFtirProvenance,
  FtirAdapterContractError,
  type FtirAdapterInput,
  type FtirEvidence,
} from '../adapter';

import { FTIR_EVIDENCE_SCHEMA_VERSION } from '../types';

import type {
  FtirDetectedBand,
  FtirProcessingResult,
  FtirProcessingParams,
  FtirInterpretation,
  FtirValidationResult,
} from '../../../agents/ftirAgent/types';
import type { EvidenceProvenance } from '../../../types/universalEvidence';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const FIXED_TIMESTAMP = '2026-05-27T14:30:00.000Z';
const FIXED_EVIDENCE_ID = 'ftir-ev-test-001';

function makeBand(overrides: Partial<FtirDetectedBand> = {}): FtirDetectedBand {
  return {
    id: 'b1',
    wavenumber: 3420,
    intensity: 0.7,
    rawIntensity: 0.68,
    prominence: 0.5,
    fwhm: 120,
    area: 80,
    classification: 'broad',
    assignment: 'O–H stretching',
    label: 'O–H',
    ...overrides,
  };
}

function makeParams(overrides: Partial<FtirProcessingParams> = {}): FtirProcessingParams {
  return {
    baselineMethod: 'Rubberband',
    smoothingMethod: 'Savitzky-Golay',
    bandProminence: 0.1,
    wavenumberTolerance: 30,
    ...overrides,
  };
}

function makeInterpretation(): FtirInterpretation {
  return {
    dominantFunctionalGroups: ['Surface hydroxyl'],
    chemicalInterpretation: 'test interpretation (NOT to be propagated by adapter)',
    decision: 'test decision (NOT to be propagated by adapter)',
    confidenceScore: 75,
    confidenceLevel: 'medium',
    evidence: ['test evidence (NOT to be propagated by adapter)'],
    ambiguities: [],
    caveats: ['test caveat (NOT to be propagated by adapter)'],
    summary: 'test summary (NOT to be propagated by adapter)',
  };
}

function makeValidation(ok = true): FtirValidationResult {
  return {
    ok,
    errors: [],
    warnings: [],
    pointCount: 620,
    wavenumberRange: [400, 4000],
  };
}

function makeResult(
  bands: FtirDetectedBand[],
  params: Partial<FtirProcessingParams> = {},
): FtirProcessingResult {
  return {
    signal: {
      wavenumber: bands.map((b) => b.wavenumber),
      absorbance: bands.map((b) => b.intensity),
    },
    baseline: bands.map(() => 0.1),
    bands,
    matches: [],
    functionalGroupCandidates: [],
    interpretation: makeInterpretation(),
    validation: makeValidation(bands.length > 0),
    executionLog: [],
    parametersUsed: makeParams(params),
  };
}

function makeRawTransmittancePoints(): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < 200; i++) {
    const wn = 4000 - (i / 199) * 3600;
    let y = 95;
    if (wn > 3200 && wn < 3600) y -= 25;
    else if (wn > 1680 && wn < 1750) y -= 22;
    points.push({ x: wn, y });
  }
  return points;
}

function makeAdapterInput(
  overrides: Partial<FtirAdapterInput> = {},
): FtirAdapterInput {
  return {
    processingResult: makeResult([makeBand()]),
    rawPoints: makeRawTransmittancePoints(),
    sampleId: 'ds-2024-001',
    sampleName: 'CS-10',
    materialClass: 'cellulose composite',
    datasetCreatedAt: FIXED_TIMESTAMP,
    engineVersion: 'ftir-agent/test',
    assembledAt: FIXED_TIMESTAMP,
    evidenceId: FIXED_EVIDENCE_ID,
    ...overrides,
  };
}

function getMinimalProvenance(): EvidenceProvenance {
  return {
    datasetId: 'ds-test',
    sampleName: 'test',
    createdAt: FIXED_TIMESTAMP,
    engineVersion: 'ftir-agent/test',
  };
}

// ---------------------------------------------------------------------------
// 1. ftirBandToEvidenceNode
// ---------------------------------------------------------------------------

describe('ftirBandToEvidenceNode', () => {
  it('maps band fields onto the canonical UniversalEvidenceNode shape', () => {
    const band = makeBand({
      wavenumber: 1715,
      intensity: 0.9,
      classification: 'narrow',
      assignment: 'C=O stretch',
      label: undefined, // override default 'O–H' so assignment takes priority
    });
    const prov = getMinimalProvenance();
    const node = ftirBandToEvidenceNode(band, 0, prov);

    expect(node.id).toBe('ftir-band-1');
    expect(node.technique).toBe('FTIR');
    expect(node.primaryAxis).toBe(1715);
    expect(node.primaryAxisUnit).toBe('cm⁻¹');
    expect(node.value).toBe(0.9);
    expect(node.valueUnit).toBe('normalized_intensity');
    expect(node.label).toBe('C=O stretch');
    expect(node.role).toBe('primary');
    expect(node.provenance).toBe(prov);
  });

  it('maps narrow/medium/broad to sharp/shoulder/broad (FtirEvidenceMetadata vocabulary)', () => {
    const prov = getMinimalProvenance();
    const narrow = ftirBandToEvidenceNode(
      makeBand({ classification: 'narrow' }),
      0,
      prov,
    );
    const medium = ftirBandToEvidenceNode(
      makeBand({ classification: 'medium' }),
      0,
      prov,
    );
    const broad = ftirBandToEvidenceNode(
      makeBand({ classification: 'broad' }),
      0,
      prov,
    );

    expect((narrow.techniqueMetadata as { bandType?: string }).bandType).toBe('sharp');
    expect((medium.techniqueMetadata as { bandType?: string }).bandType).toBe('shoulder');
    expect((broad.techniqueMetadata as { bandType?: string }).bandType).toBe('broad');
  });

  it('uses fallback label when band has no assignment and no label', () => {
    const band = makeBand({ assignment: undefined, label: undefined, wavenumber: 1234.5 });
    const node = ftirBandToEvidenceNode(band, 0, getMinimalProvenance());
    expect(node.label).toBe('Band at 1234.5 cm⁻¹');
  });

  it('uses index for deterministic node id', () => {
    const a = ftirBandToEvidenceNode(makeBand(), 0, getMinimalProvenance());
    const b = ftirBandToEvidenceNode(makeBand(), 4, getMinimalProvenance());
    expect(a.id).toBe('ftir-band-1');
    expect(b.id).toBe('ftir-band-5');
  });

  it('maps intensity to intensityCategory (strong/medium/weak)', () => {
    const prov = getMinimalProvenance();
    const strong = ftirBandToEvidenceNode(makeBand({ intensity: 0.8 }), 0, prov);
    const medium = ftirBandToEvidenceNode(makeBand({ intensity: 0.3 }), 0, prov);
    const weak = ftirBandToEvidenceNode(makeBand({ intensity: 0.1 }), 0, prov);

    expect((strong.techniqueMetadata as { intensityCategory?: string }).intensityCategory).toBe('strong');
    expect((medium.techniqueMetadata as { intensityCategory?: string }).intensityCategory).toBe('medium');
    expect((weak.techniqueMetadata as { intensityCategory?: string }).intensityCategory).toBe('weak');
  });

  it('does NOT populate reasoning-layer fields (concept, confidence, functionalGroup)', () => {
    const node = ftirBandToEvidenceNode(makeBand(), 0, getMinimalProvenance());
    expect(node.concept).toBeUndefined();
    expect(node.confidence).toBeUndefined();
    const meta = node.techniqueMetadata as { functionalGroup?: string };
    expect(meta.functionalGroup).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 2. buildFtirSignalDescriptor
// ---------------------------------------------------------------------------

describe('buildFtirSignalDescriptor', () => {
  it('detects transmittance from [0, 100] range', () => {
    const desc = buildFtirSignalDescriptor(makeRawTransmittancePoints());
    expect(desc.unit).toBe('transmittance');
    expect(desc.pointCount).toBe(200);
  });

  it('marks axisReversed=true when wavenumber decreases (FTIR convention)', () => {
    const desc = buildFtirSignalDescriptor(makeRawTransmittancePoints());
    expect(desc.wavenumberRange).toEqual([400, 4000]);
    expect(desc.axisReversed).toBe(true);
  });

  it('marks axisReversed=false when wavenumber increases', () => {
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < 100; i++) pts.push({ x: 400 + i * 36, y: 0.5 });
    const desc = buildFtirSignalDescriptor(pts);
    expect(desc.axisReversed).toBe(false);
  });

  it('honors declared unit hint with confidence 1.0', () => {
    const desc = buildFtirSignalDescriptor(makeRawTransmittancePoints(), {
      declaredUnit: 'transmittance',
    });
    expect(desc.unit).toBe('transmittance');
    expect(desc.unitDetection).toBe('user_declared');
    expect(desc.unitDetectionConfidence).toBe(1.0);
  });

  it('rates rawQuality based on point count and std deviation', () => {
    const tooFew = [{ x: 1000, y: 0.5 }];
    expect(buildFtirSignalDescriptor(tooFew).rawQuality).toBe('insufficient');

    const flat = Array.from({ length: 100 }, () => ({ x: 1000, y: 0.5 }));
    expect(buildFtirSignalDescriptor(flat).rawQuality).toBe('weak');

    const noisy = Array.from({ length: 100 }, (_, i) => ({
      x: 1000 + i,
      y: 50 + (i % 2 === 0 ? 30 : -30),
    }));
    expect(buildFtirSignalDescriptor(noisy).rawQuality).toBe('excellent');
  });
});

// ---------------------------------------------------------------------------
// 3. buildFtirProvenance
// ---------------------------------------------------------------------------

describe('buildFtirProvenance', () => {
  it('preserves sampleId as datasetId and sampleName', () => {
    const input = makeAdapterInput();
    const prov = buildFtirProvenance(input, FIXED_TIMESTAMP);
    expect(prov.datasetId).toBe('ds-2024-001');
    expect(prov.sampleName).toBe('CS-10');
    expect(prov.materialClass).toBe('cellulose composite');
  });

  it('preserves processing parameters (only JSON-serializable subset)', () => {
    const input = makeAdapterInput();
    const prov = buildFtirProvenance(input, FIXED_TIMESTAMP);
    expect(prov.processingParameters).toBeDefined();
    const p = prov.processingParameters as Record<string, unknown>;
    expect(p.baselineMethod).toBe('Rubberband');
    expect(p.smoothingMethod).toBe('Savitzky-Golay');
    expect(p.bandProminence).toBe(0.1);
    expect(p.wavenumberTolerance).toBe(30);
  });

  it('defaults engineVersion to schema version when not provided', () => {
    // Build input without engineVersion entirely (avoid spread-override pitfalls).
    const base = makeAdapterInput();
    const { engineVersion: _omit, ...rest } = base;
    const input: FtirAdapterInput = rest as FtirAdapterInput;
    const prov = buildFtirProvenance(input, FIXED_TIMESTAMP);
    expect(prov.engineVersion).toBe(`ftir-agent/${FTIR_EVIDENCE_SCHEMA_VERSION}`);
  });

  it('honors caller-provided engineVersion', () => {
    const input = makeAdapterInput({ engineVersion: 'custom/1.2.3' });
    const prov = buildFtirProvenance(input, FIXED_TIMESTAMP);
    expect(prov.engineVersion).toBe('custom/1.2.3');
  });

  it('uses caller-provided createdAt (does not overwrite with defaultTimestamp)', () => {
    const input = makeAdapterInput({ datasetCreatedAt: '2024-01-01T00:00:00.000Z' });
    const prov = buildFtirProvenance(input, '2099-12-31T00:00:00.000Z');
    expect(prov.createdAt).toBe('2024-01-01T00:00:00.000Z');
  });

  it('leaves processingHash undefined (caller responsibility)', () => {
    const input = makeAdapterInput();
    const prov = buildFtirProvenance(input, FIXED_TIMESTAMP);
    expect(prov.processingHash).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 4. adaptFtirProcessingResult — happy path
// ---------------------------------------------------------------------------

describe('adaptFtirProcessingResult (happy path)', () => {
  it('returns a valid FtirEvidence bundle', () => {
    const ev = adaptFtirProcessingResult(makeAdapterInput());
    expect(ev.evidenceId).toBe(FIXED_EVIDENCE_ID);
    expect(ev.technique).toBe('FTIR');
    expect(ev.assembledAt).toBe(FIXED_TIMESTAMP);
  });

  it('maps every detected band into a UniversalEvidenceNode', () => {
    const bands = [
      makeBand({ wavenumber: 3420, classification: 'broad' }),
      makeBand({ wavenumber: 1715, classification: 'narrow' }),
      makeBand({ wavenumber: 1035, classification: 'medium' }),
    ];
    const input = makeAdapterInput({
      processingResult: makeResult(bands),
    });
    const ev = adaptFtirProcessingResult(input);
    expect(ev.bands).toHaveLength(3);
    expect(ev.bands[0].primaryAxis).toBe(3420);
    expect(ev.bands[1].primaryAxis).toBe(1715);
    expect(ev.bands[2].primaryAxis).toBe(1035);
  });

  it('builds signal descriptor from raw points', () => {
    const ev = adaptFtirProcessingResult(makeAdapterInput());
    expect(ev.signal.unit).toBe('transmittance');
    expect(ev.signal.pointCount).toBe(200);
    expect(ev.signal.axisReversed).toBe(true);
  });

  it('builds provenance from sample metadata', () => {
    const ev = adaptFtirProcessingResult(makeAdapterInput());
    expect(ev.provenance.datasetId).toBe('ds-2024-001');
    expect(ev.provenance.sampleName).toBe('CS-10');
    expect(ev.provenance.engineVersion).toBe('ftir-agent/test');
  });

  it('handles empty band list (returns valid empty bands array)', () => {
    const ev = adaptFtirProcessingResult(
      makeAdapterInput({ processingResult: makeResult([]) }),
    );
    expect(ev.bands).toEqual([]);
    expect(ev.evidenceId).toBe(FIXED_EVIDENCE_ID);
  });

  it('round-trips through JSON.stringify / JSON.parse', () => {
    const ev = adaptFtirProcessingResult(makeAdapterInput());
    const json = JSON.stringify(ev);
    const restored = JSON.parse(json) as FtirEvidence;
    expect(restored.evidenceId).toBe(ev.evidenceId);
    expect(restored.bands.length).toBe(ev.bands.length);
    expect(restored.signal.unit).toBe(ev.signal.unit);
  });

  it('generates a deterministic default evidenceId when not provided', () => {
    const input1 = makeAdapterInput({ evidenceId: undefined });
    const input2 = makeAdapterInput({ evidenceId: undefined });
    const ev1 = adaptFtirProcessingResult(input1);
    const ev2 = adaptFtirProcessingResult(input2);
    expect(ev1.evidenceId).toBe(ev2.evidenceId);
    expect(ev1.evidenceId).toMatch(/^ftir-ev-ds-2024-001-\d+-/);
  });
});

// ---------------------------------------------------------------------------
// 5. adaptFtirProcessingResult — contract validation
// ---------------------------------------------------------------------------

describe('adaptFtirProcessingResult (contract validation)', () => {
  it('throws FtirAdapterContractError on missing processingResult', () => {
    expect(() =>
      adaptFtirProcessingResult({
        ...makeAdapterInput(),
        processingResult: undefined as unknown as FtirProcessingResult,
      }),
    ).toThrow(FtirAdapterContractError);
  });

  it('throws FtirAdapterContractError on empty rawPoints', () => {
    expect(() =>
      adaptFtirProcessingResult(makeAdapterInput({ rawPoints: [] })),
    ).toThrow(FtirAdapterContractError);
  });

  it('throws FtirAdapterContractError on missing sampleId', () => {
    expect(() =>
      adaptFtirProcessingResult(
        makeAdapterInput({ sampleId: '' as unknown as string }),
      ),
    ).toThrow(FtirAdapterContractError);
  });

  it('throws FtirAdapterContractError when bands is not an array', () => {
    const badResult = {
      ...makeResult([makeBand()]),
      bands: null as unknown as FtirDetectedBand[],
    };
    expect(() =>
      adaptFtirProcessingResult(
        makeAdapterInput({ processingResult: badResult }),
      ),
    ).toThrow(FtirAdapterContractError);
  });

  it('error message includes the offending field name', () => {
    try {
      adaptFtirProcessingResult(makeAdapterInput({ rawPoints: [] }));
    } catch (e) {
      expect((e as FtirAdapterContractError).field).toBe('rawPoints');
      expect((e as Error).message).toContain('rawPoints');
    }
  });
});

// ---------------------------------------------------------------------------
// 6. Negative assertions — adapter does NOT do reasoning
// ---------------------------------------------------------------------------

describe('Adapter boundary — does NOT generate reasoning artifacts', () => {
  it('validationGaps is always empty (reasoning layer responsibility)', () => {
    const ev = adaptFtirProcessingResult(makeAdapterInput());
    expect(ev.validationGaps).toEqual([]);
  });

  it('functionalGroups is always empty (reasoning layer responsibility)', () => {
    const ev = adaptFtirProcessingResult(makeAdapterInput());
    expect(ev.functionalGroups).toEqual([]);
  });

  it('caveats is always empty (reasoning layer responsibility)', () => {
    const ev = adaptFtirProcessingResult(makeAdapterInput());
    expect(ev.caveats).toEqual([]);
  });

  it('confidence.overall is the sentinel "uncertain" (reasoning sets the real value)', () => {
    const ev = adaptFtirProcessingResult(makeAdapterInput());
    expect(ev.confidence.overall).toBe('uncertain');
    expect(ev.confidence.overallScore).toBe(0);
    expect(ev.confidence.byGroup).toEqual({});
  });

  it('does NOT propagate interpretation text from FtirProcessingResult', () => {
    const ev = adaptFtirProcessingResult(makeAdapterInput());
    // The interpretation strings from the agent are intentionally NOT copied
    // into the evidence bundle. The reasoning layer will rebuild them.
    const flat = JSON.stringify(ev);
    expect(flat).not.toContain('test interpretation (NOT to be propagated by adapter)');
    expect(flat).not.toContain('test caveat (NOT to be propagated by adapter)');
    expect(flat).not.toContain('test summary (NOT to be propagated by adapter)');
  });

  it('does NOT set concept or confidence on bands (reasoning layer sets these)', () => {
    const ev = adaptFtirProcessingResult(makeAdapterInput());
    for (const band of ev.bands) {
      expect(band.concept).toBeUndefined();
      expect(band.confidence).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// 7. Determinism
// ---------------------------------------------------------------------------

describe('Determinism', () => {
  it('same input → same output (when timestamps and id are injected)', () => {
    const input = makeAdapterInput();
    const a = adaptFtirProcessingResult(input);
    const b = adaptFtirProcessingResult(input);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('ftirBandToEvidenceNode is referentially transparent', () => {
    const band = makeBand();
    const prov = getMinimalProvenance();
    const a = ftirBandToEvidenceNode(band, 0, prov);
    const b = ftirBandToEvidenceNode(band, 0, prov);
    expect(a).toEqual(b);
  });
});
