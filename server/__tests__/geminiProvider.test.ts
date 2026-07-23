import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentEvidencePacket } from '../../src/agent/mcp/types';
import { loadServerConfig } from '../config';
import {
  buildGeminiClientOptions,
  callGemini,
  getGeminiProviderStatus,
} from '../llm/providers/geminiProvider';
import { routeReasoning } from '../llm/router';

const packet: AgentEvidencePacket = {
  context: 'xrd',
  datasetId: 'provider-test-dataset',
  datasetName: 'provider-test.csv',
  materialSystem: 'test material',
  signalSummary: { featureCount: 1, signalQuality: 'medium' },
  detectedFeatures: [{ position: 10, intensity: 100, confidence: 0.8 }],
  candidates: [{
    label: 'Candidate A',
    score: 0.8,
    matchedFeatures: 1,
    totalFeatures: 1,
    missingFeatures: [],
    unexplainedFeatures: [],
  }],
  fusedScore: 0.8,
  uncertaintyFlags: [],
  processingNotes: [],
  toolTrace: [],
};

afterEach(() => {
  vi.unstubAllEnvs();
});

function syntheticModelResponse() {
  return {
    claims: ['Candidate A'],
    supportingEvidence: ['Synthetic bounded evidence for a network-free test'],
    contradictingEvidence: [],
    interpretation: 'Evidence suggests Candidate A while validation remains required.',
    validationStatus: 'validation_limited',
    validationGap: ['Independent validation required'],
    confidence: { measurementQuality: 0.8, interpretation: 0.7 },
    missingInformation: [],
    requiredNextAction: ['Validate with complementary evidence'],
  };
}

describe('Gemini provider configuration', () => {
  it('selects the Developer API by default without inferring Vertex mode', () => {
    const config = loadServerConfig({
      GEMINI_API_KEY: 'test-only-placeholder',
      GEMINI_MODEL: 'gemini-2.5-flash',
      GOOGLE_CLOUD_PROJECT: 'ambient-project',
      GOOGLE_CLOUD_LOCATION: 'global',
      GOOGLE_GENAI_USE_VERTEXAI: 'true',
    });

    expect(getGeminiProviderStatus(config)).toEqual({
      configured: true,
      mode: 'developer',
      provider: 'gemini-developer-api',
    });
    expect(buildGeminiClientOptions(config)).toEqual({
      apiKey: 'test-only-placeholder',
      vertexai: false,
    });
  });

  it('rejects Developer mode when the server API key is missing', () => {
    const config = loadServerConfig({
      GEMINI_PROVIDER_MODE: 'developer',
      GEMINI_MODEL: 'gemini-2.5-flash',
    });

    expect(getGeminiProviderStatus(config)).toMatchObject({
      configured: false,
      mode: 'developer',
      provider: 'gemini-developer-api',
    });
    expect(() => buildGeminiClientOptions(config)).toThrow('Gemini provider is not configured');
  });

  it('requires the configured model in Developer mode', () => {
    const config = loadServerConfig({
      GEMINI_PROVIDER_MODE: 'developer',
      GEMINI_API_KEY: 'test-only-placeholder',
    });

    expect(getGeminiProviderStatus(config).configured).toBe(false);
    expect(() => buildGeminiClientOptions(config)).toThrow('Gemini provider is not configured');
  });

  it('selects Vertex mode without requiring or forwarding a Developer API key', () => {
    const config = loadServerConfig({
      GEMINI_PROVIDER_MODE: 'vertex',
      GEMINI_MODEL: 'gemini-2.5-flash',
      GOOGLE_CLOUD_PROJECT: 'test-project',
      GOOGLE_CLOUD_LOCATION: 'global',
      GOOGLE_GENAI_USE_VERTEXAI: 'false',
    });

    expect(getGeminiProviderStatus(config)).toEqual({
      configured: true,
      mode: 'vertex',
      provider: 'vertex-gemini',
    });
    expect(buildGeminiClientOptions(config)).toEqual({
      vertexai: true,
      project: 'test-project',
      location: 'global',
    });
  });

  it.each([
    {
      mode: 'developer' as const,
      environment: {
        GEMINI_PROVIDER_MODE: 'developer',
        GEMINI_API_KEY: 'test-only-placeholder',
        GEMINI_MODEL: 'gemini-2.5-flash',
      },
      expectedProvider: 'gemini-developer-api',
    },
    {
      mode: 'vertex' as const,
      environment: {
        GEMINI_PROVIDER_MODE: 'vertex',
        GEMINI_MODEL: 'gemini-2.5-flash',
        GOOGLE_CLOUD_PROJECT: 'test-project',
        GOOGLE_CLOUD_LOCATION: 'global',
      },
      expectedProvider: 'vertex-gemini',
    },
  ])('returns accurate $mode response metadata without an external request', async ({
    environment,
    expectedProvider,
  }) => {
    const generateContent = vi.fn(async () => ({
      text: JSON.stringify(syntheticModelResponse()),
    }));

    const output = await callGemini(packet, undefined, {
      config: loadServerConfig(environment),
      generateContent,
    });

    expect(generateContent).toHaveBeenCalledOnce();
    expect(output.metadata).toMatchObject({
      provider: expectedProvider,
      model: 'gemini-2.5-flash',
    });
  });

  it('validates both project and location in Vertex mode', () => {
    const missingProject = loadServerConfig({
      GEMINI_PROVIDER_MODE: 'vertex',
      GEMINI_MODEL: 'gemini-2.5-flash',
      GOOGLE_CLOUD_LOCATION: 'global',
    });
    const missingLocation = loadServerConfig({
      GEMINI_PROVIDER_MODE: 'vertex',
      GEMINI_MODEL: 'gemini-2.5-flash',
      GOOGLE_CLOUD_PROJECT: 'test-project',
    });

    expect(getGeminiProviderStatus(missingProject).configured).toBe(false);
    expect(getGeminiProviderStatus(missingLocation).configured).toBe(false);
    expect(() => buildGeminiClientOptions(missingProject)).toThrow('Gemini provider is not configured');
    expect(() => buildGeminiClientOptions(missingLocation)).toThrow('Gemini provider is not configured');
  });

  it('requires the configured model in Vertex mode', () => {
    const config = loadServerConfig({
      GEMINI_PROVIDER_MODE: 'vertex',
      GOOGLE_CLOUD_PROJECT: 'test-project',
      GOOGLE_CLOUD_LOCATION: 'global',
    });

    expect(getGeminiProviderStatus(config).configured).toBe(false);
    expect(() => buildGeminiClientOptions(config)).toThrow('Gemini provider is not configured');
  });

  it('preserves deterministic fallback when Developer mode is unconfigured', async () => {
    vi.stubEnv('GEMINI_PROVIDER_MODE', 'developer');
    vi.stubEnv('GEMINI_MODEL', 'gemini-2.5-flash');
    vi.stubEnv('GEMINI_API_KEY', '');

    const response = await routeReasoning(packet, 'gemini-2.5-flash');

    expect(response).toMatchObject({
      success: true,
      fallbackUsed: true,
      output: { metadata: { provider: 'deterministic' } },
    });
  });

  it('rejects invalid application provider modes without exposing configuration values', () => {
    expect(() => loadServerConfig({
      GEMINI_PROVIDER_MODE: 'test-only-invalid-mode',
      GEMINI_API_KEY: 'test-only-placeholder',
    })).toThrow('Invalid GEMINI_PROVIDER_MODE configuration');
  });
});
