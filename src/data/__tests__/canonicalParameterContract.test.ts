import { beforeEach, describe, expect, it } from 'vitest';
import {
  ANALYSIS_MODE_REGISTRY,
  CANONICAL_PARAMETER_REGISTRY,
  PARAMETER_SCHEMA_VERSION,
  createCanonicalParameterContext,
  getCanonicalDefaultValues,
  getCanonicalParameter,
  getCanonicalParameterDefinitions,
  getWorkspaceParameterControls,
  lockCanonicalParameterContext,
  migrateLegacyParameterValues,
  updateCanonicalParameterContext,
  validateCanonicalParameterContext,
  type CanonicalParameterValue,
  type CanonicalTechnique,
} from '../parameterDefinitions';
import {
  attachParameterContextToConditionLock,
  createDraftExperimentConditionLock,
  getConditionLockParameterContext,
  lockExperimentConditions,
} from '../experimentConditionLock';
import { createEvidenceOutput, validateEvidenceOutput } from '../../evidence/canonicalEvidence';
import {
  buildCanonicalAgentPrompt,
  buildScientificBaselineResult,
  normalizeAgentModelOutput,
} from '../../agent/prompt/canonicalAgentPrompt';
import type { AgentEvidencePacket } from '../../agent/mcp/types';
import {
  readParameterState,
  setParameterOverride,
} from '../../utils/parameterStateManager';
import { readTechniqueParameterOverrides } from '../../utils/workspaceParameterOverrides';
import { runXpsProcessing } from '../../agents/xpsAgent/runner';
import { buildAgentProcessingPlan } from '../../agent/processing/processingStepPlanner';

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

const techniques: CanonicalTechnique[] = ['xrd', 'xps', 'ftir', 'raman'];

function requiredValues(technique: CanonicalTechnique): Record<string, CanonicalParameterValue> {
  return Object.fromEntries(getCanonicalParameterDefinitions(technique)
    .filter((item) => item.required && (item.defaultValue === null || item.defaultValue === ''))
    .map((item) => [item.id,
      item.type === 'number' ? Math.max(item.allowedRange?.min ?? 1, 1)
        : item.type === 'boolean' ? true
          : item.type === 'multi_select' ? [item.options[0] ?? 'provided']
            : item.type === 'select' ? item.options[0]
              : item.type === 'datetime' ? '2026-07-21T00:00:00.000Z'
                : 'provided',
    ]));
}

function packet(technique: CanonicalTechnique = 'xrd'): AgentEvidencePacket {
  const context = createCanonicalParameterContext(technique, {
    datasetId: `${technique}-dataset`,
    sourceFiles: [{ filename: `${technique}-source.csv`, sha256: 'a'.repeat(64), role: 'primary' }],
    values: requiredValues(technique),
    analysisMode: 'scientific-baseline',
    now: '2026-07-21T00:00:00.000Z',
  });
  return {
    context: technique,
    datasetId: context.datasetId,
    datasetName: context.sourceFiles[0].filename,
    materialSystem: 'test material',
    signalSummary: { featureCount: 1, signalQuality: 'medium' },
    detectedFeatures: [{ position: 35.5, intensity: 100, confidence: 0.8 }],
    candidates: [{ label: 'candidate', score: 0.8, matchedFeatures: 1, totalFeatures: 1, missingFeatures: [], unexplainedFeatures: [] }],
    fusedScore: 0.8,
    uncertaintyFlags: ['reference validation pending'],
    processingNotes: ['deterministic feature detection'],
    toolTrace: [],
    parameterContext: context,
    analysisMode: 'scientific-baseline',
  };
}

describe('canonical parameter registry', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'window', {
      value: { localStorage: new MemoryStorage() },
      configurable: true,
    });
  });

  it('uses one complete schema shape for all four techniques', () => {
    for (const technique of techniques) {
      const definitions = CANONICAL_PARAMETER_REGISTRY[technique];
      expect(definitions.length).toBeGreaterThan(20);
      for (const item of definitions) {
        expect(item).toEqual(expect.objectContaining({
          id: expect.any(String),
          label: expect.any(String),
          category: expect.stringMatching(/measurement|processing|interpretation|validation/),
          type: expect.any(String),
          required: expect.any(Boolean),
          active: expect.any(Boolean),
          locked: expect.any(Boolean),
          source: expect.any(String),
          version: PARAMETER_SCHEMA_VERSION,
          affects: expect.any(Array),
          options: expect.any(Array),
        }));
        expect('allowedRange' in item).toBe(true);
        expect('defaultValue' in item).toBe(true);
        expect('unit' in item).toBe(true);
      }
    }
  });

  it('validates units, required fields, allowed ranges, and optional fields', () => {
    for (const technique of techniques) {
      const context = createCanonicalParameterContext(technique, {
        datasetId: `${technique}-dataset`,
        sourceFiles: [{ filename: `${technique}.csv`, sha256: 'b'.repeat(64) }],
        values: requiredValues(technique),
      });
      expect(validateCanonicalParameterContext(context).errors.filter((item) => item.code === 'REQUIRED')).toEqual([]);
    }
    const xrd = createCanonicalParameterContext('xrd', {
      datasetId: 'xrd-range',
      sourceFiles: [{ filename: 'xrd.xy', sha256: 'c'.repeat(64) }],
      values: { ...requiredValues('xrd'), wavelength: 99 },
    });
    expect(getCanonicalParameter(xrd, 'wavelength')?.unit).toBe('Å');
    expect(validateCanonicalParameterContext(xrd).errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ parameterId: 'wavelength', code: 'RANGE' }),
    ]));
  });

  it('stores inactive parameters without marking them as applied', () => {
    const context = createCanonicalParameterContext('xps', {
      datasetId: 'xps-inactive',
      sourceFiles: [{ filename: 'xps.csv', sha256: 'd'.repeat(64) }],
      values: { smoothingMethod: 'Savitzky-Golay' },
    });
    expect(getCanonicalParameter(context, 'smoothingMethod')).toMatchObject({
      active: false,
      stored: true,
      status: 'stored_but_not_active',
    });
    expect(validateCanonicalParameterContext(context).errors.some((item) => item.code === 'INACTIVE_APPLIED')).toBe(false);
  });

  it('activates XPS controls according to Survey versus element-region scope', () => {
    const survey = createCanonicalParameterContext('xps', {
      datasetId: 'xps-survey',
      values: { regionSelection: 'Survey' },
    });
    expect(getCanonicalParameter(survey, 'surveyPeakProminence')).toMatchObject({ active: true, status: 'active_and_applied' });
    expect(getCanonicalParameter(survey, 'referencePeak')).toMatchObject({ active: false, status: 'stored_but_not_active' });
    expect(getCanonicalParameter(survey, 'peakModel')).toMatchObject({ active: false, status: 'stored_but_not_active' });

    const element = createCanonicalParameterContext('xps', {
      datasetId: 'xps-cu-region',
      values: { regionSelection: 'Cu 2p' },
    });
    expect(getCanonicalParameter(element, 'surveyPeakProminence')).toMatchObject({ active: false, status: 'stored_but_not_active' });
    expect(getCanonicalParameter(element, 'referencePeak')).toMatchObject({ active: true, status: 'active_and_applied' });
    expect(getCanonicalParameter(element, 'peakModel')).toMatchObject({ active: true, status: 'active_and_applied' });

    const surveyControls = getWorkspaceParameterControls('xps', { regionSelection: 'Survey' });
    const elementControls = getWorkspaceParameterControls('xps', { regionSelection: 'Fe 2p' });
    expect(surveyControls.find((item) => item.id === 'referencePeak')?.active).toBe(false);
    expect(elementControls.find((item) => item.id === 'referencePeak')?.active).toBe(true);
  });

  it('keeps XPS Survey processing separate from element-region fitting', () => {
    const dataset = {
      id: 'xps-scope-test',
      label: 'XPS scope test',
      region: 'Survey',
      sampleName: 'scope sample',
      fileName: 'scope.csv',
      signal: {
        bindingEnergy: [940, 936, 933.5, 931, 928],
        intensity: [10, 30, 100, 28, 9],
      },
      baseline: [],
      peaks: [],
      matches: [],
    };
    const survey = runXpsProcessing(dataset, { region: 'Survey', smoothingWindowSize: 1 });
    expect(survey.matches).toEqual([]);
    expect(survey.stateAggregations).toEqual([]);
    expect(survey.processingSteps).toContain('Peak fitting: not applied in Survey scope');

    const element = runXpsProcessing(dataset, { region: 'Cu 2p', smoothingWindowSize: 1 });
    expect(element.processingSteps.some((step) => step.startsWith('Peak fitting:'))).toBe(true);
    expect(element.processingSteps).not.toContain('Peak fitting: not applied in Survey scope');
  });

  it('builds guided processing steps from the same canonical controls', () => {
    for (const technique of techniques) {
      const values = getCanonicalDefaultValues(technique);
      const controls = getWorkspaceParameterControls(technique, values);
      const plan = buildAgentProcessingPlan(technique, controls, values);
      expect(plan.map((step) => step.id)).toEqual(['prepare', 'correct', 'detect', 'validate']);
      for (const step of plan) {
        expect(step.controls.every((control) => control.active)).toBe(true);
        expect(step.controls.every((control) => controls.some((item) => item.id === control.id))).toBe(true);
      }
    }

    const surveyValues = { ...getCanonicalDefaultValues('xps'), regionSelection: 'Survey' };
    const surveyPlan = buildAgentProcessingPlan('xps', getWorkspaceParameterControls('xps', surveyValues), surveyValues);
    expect(surveyPlan.find((step) => step.id === 'detect')?.controls.map((control) => control.id)).toEqual([
      'surveyPeakProminence',
      'surveyPeakMinDistance',
    ]);
    expect(surveyPlan.flatMap((step) => step.controls).some((control) => control.id === 'referencePeak')).toBe(false);

    const elementValues = { ...getCanonicalDefaultValues('xps'), regionSelection: 'Fe 2p' };
    const elementPlan = buildAgentProcessingPlan('xps', getWorkspaceParameterControls('xps', elementValues), elementValues);
    expect(elementPlan.find((step) => step.id === 'correct')?.controls.map((control) => control.id)).toEqual(expect.arrayContaining([
      'referencePeak',
      'referenceEnergy',
      'energyShift',
    ]));
    expect(elementPlan.find((step) => step.id === 'detect')?.controls.map((control) => control.id)).toContain('peakModel');
    expect(elementPlan.flatMap((step) => step.controls).some((control) => control.id === 'surveyPeakProminence')).toBe(false);
  });

  it('resolves conflicting defaults from only the canonical registry', () => {
    expect(getCanonicalDefaultValues('xrd').smoothingWindow).toBe(7);
    expect(getCanonicalDefaultValues('xrd').referenceDatabase).toBe('COD');
    expect(getCanonicalDefaultValues('xrd').referenceDatabaseVersion).toBe('demo-curated-2026.07');
    expect(getCanonicalDefaultValues('xrd').referenceDatabaseLicense).toBe('CC0-1.0');
    expect(getCanonicalDefaultValues('xps').smoothingMethod).toBe('None');
    expect(getCanonicalDefaultValues('ftir').baselineMethod).toBe('Rubberband');
    expect(getWorkspaceParameterControls('xrd').find((item) => item.id === 'smoothingWindow')?.defaultValue).toBe(7);
  });

  it('migrates legacy IDs while preserving explicit values', () => {
    expect(migrateLegacyParameterValues('xrd', {
      smoothing_window_size: 11,
      peak_min_prominence: 0.22,
      unknown: 'discarded',
    })).toEqual({ smoothingWindow: 11, minimumProminence: 0.22 });
  });

  it('persists a shared Workspace and Agent state with parameter versioning', () => {
    const initial = readParameterState('project-1', 'xrd');
    expect(initial.schemaVersion).toBe(PARAMETER_SCHEMA_VERSION);
    const changed = setParameterOverride('project-1', 'xrd', 'smoothingWindow', 9, 'workspace');
    expect(changed.version).toBeGreaterThan(initial.version);
    expect(readTechniqueParameterOverrides('project-1', 'XRD')).toEqual({ smoothingWindow: 9 });
    expect(getCanonicalParameter(readParameterState('project-1', 'xrd').canonicalContext, 'smoothingWindow')?.value).toBe(9);
  });
});

describe('Condition Lock and evidence outputs', () => {
  it('persists an immutable canonical snapshot including inactive state', () => {
    const context = createCanonicalParameterContext('raman', {
      datasetId: 'raman-lock',
      sourceFiles: [{ filename: 'raman.dat', sha256: 'e'.repeat(64) }],
      values: { ...requiredValues('raman'), cosmicRayMethod: 'spike-filter' },
    });
    const attached = attachParameterContextToConditionLock(createDraftExperimentConditionLock(), context);
    const locked = lockExperimentConditions(attached, '2026-07-21T01:00:00.000Z');
    const snapshot = getConditionLockParameterContext(locked, 'raman');
    expect(snapshot?.status).toBe('locked');
    expect(snapshot?.schemaVersion).toBe(PARAMETER_SCHEMA_VERSION);
    expect(getCanonicalParameter(snapshot!, 'cosmicRayMethod')).toMatchObject({ locked: true, active: false });
    expect(JSON.parse(JSON.stringify(locked)).parameterContexts.raman.datasetId).toBe('raman-lock');
  });

  it('marks post-run changes and keeps results separate from parameters', () => {
    const context = lockCanonicalParameterContext(createCanonicalParameterContext('xrd', {
      datasetId: 'xrd-output',
      sourceFiles: [{ filename: 'source.xy', sha256: 'f'.repeat(64) }],
    }));
    const modified = updateCanonicalParameterContext(context, { smoothingWindow: 9 }, 'user');
    expect(getCanonicalParameter(modified, 'smoothingWindow')?.status).toBe('modified_after_run');
    const output = createEvidenceOutput(modified, {
      id: 'peak-1',
      kind: 'detected_peak',
      value: { position: 35.5, fwhm: 0.3 },
      parameterIds: ['smoothingWindow', 'minimumProminence'],
      confidence: 0.8,
      warnings: [],
    });
    expect(validateEvidenceOutput(output)).toEqual([]);
    expect(output.sourceFilename).toBe('source.xy');
    expect(output.processingProfileVersion).toBe('xrd-processing-v3');
    expect(getCanonicalParameterDefinitions('xrd').some((item) => item.id === 'detectedPeaks')).toBe(false);
  });
});

describe('Agent modes and dynamic prompt', () => {
  it('constructs GPT-5.6 and Gemini prompts from the same canonical context', () => {
    const input = packet('xrd');
    const gpt = buildCanonicalAgentPrompt(input, 'gpt-5.6-scientific');
    const gemini = buildCanonicalAgentPrompt(input, 'gemini-2.5-flash');
    for (const prompt of [gpt, gemini]) {
      expect(prompt).toContain('xrd-source.csv');
      expect(prompt).toContain('parameterSchemaVersion');
      expect(prompt).toContain(PARAMETER_SCHEMA_VERSION);
      expect(prompt).toContain('parametersStoredButNotActive');
      expect(prompt).toContain('rawFileHash');
      expect(prompt).toContain('Return this exact JSON-first shape');
    }
    expect(gpt).toContain(ANALYSIS_MODE_REGISTRY['gpt-5.6-scientific'].label);
    expect(gemini).toContain(ANALYSIS_MODE_REGISTRY['gemini-2.5-flash'].label);
  });

  it('prevents LLM prompt construction and generated interpretation in Baseline Mode', () => {
    const input = packet('ftir');
    expect(() => buildCanonicalAgentPrompt(input, 'scientific-baseline')).toThrow('must not construct or invoke an LLM prompt');
    const result = buildScientificBaselineResult(input);
    expect(result.model).toBeNull();
    expect(result.interpretation).toBeNull();
    expect(result.claims).toEqual([]);
    expect(result.provenance.provider).toBe('deterministic');
  });

  it('rejects unsupported confirmed claims and preserves source/parameter provenance', () => {
    const input = packet('xps');
    expect(() => normalizeAgentModelOutput({
      claims: ['This confirms the bulk phase'],
      supportingEvidence: ['xps-source.csv using referencePeak'],
      contradictingEvidence: [],
      interpretation: 'Surface evidence only',
      validationStatus: 'validation_limited',
      validationGap: ['Bulk evidence missing'],
      confidence: { measurementQuality: 0.8, interpretation: 0.7 },
      missingInformation: [],
      requiredNextAction: ['Collect XRD evidence'],
    }, input, 'gpt-5.6-scientific', 10)).toThrow('confirmed claim');

    const normalized = normalizeAgentModelOutput({
      claims: ['Evidence is consistent with a surface chemical-state candidate'],
      supportingEvidence: ['xps-source.csv using referencePeak and matchingTolerance'],
      contradictingEvidence: [],
      interpretation: 'The surface evidence may indicate the candidate state.',
      validationStatus: 'validation_limited',
      validationGap: ['Bulk evidence missing'],
      confidence: { measurementQuality: 0.8, interpretation: 0.6 },
      missingInformation: [],
      requiredNextAction: ['Collect XRD evidence'],
    }, input, 'gpt-5.6-scientific', 10);
    expect(normalized.analysisResult?.sourceFiles).toEqual(['xps-source.csv']);
    expect(normalized.analysisResult?.parameterSnapshot.schemaVersion).toBe(PARAMETER_SCHEMA_VERSION);
    expect(normalized.metadata.model).toBe('GPT-5.6');
  });
});
