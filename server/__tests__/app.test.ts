import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { AgentEvidencePacket } from '../../src/agent/mcp/types';
import { createApp } from '../app';
import { loadServerConfig } from '../config';

const packet: AgentEvidencePacket = {
  context: 'xrd',
  datasetId: 'server-test-dataset',
  datasetName: 'server-test.csv',
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

function productionConfig() {
  return loadServerConfig({
    NODE_ENV: 'production',
    ALLOWED_ORIGINS: 'https://app.example.test',
    GEMINI_PROVIDER_MODE: 'developer',
    GEMINI_API_KEY: 'test-only-placeholder',
    GOOGLE_GENAI_USE_VERTEXAI: 'false',
    GEMINI_MODEL: 'gemini-2.5-flash',
    PORT: '3001',
  });
}

function testApp() {
  return createApp({ config: productionConfig(), logger: () => undefined });
}

describe('DIFARYX server boundary', () => {
  it('returns liveness from GET /health', async () => {
    const response = await request(testApp()).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ok: true,
      service: 'difaryx-gemini-backend',
      version: '0.0.0',
    });
  });

  it('returns safe readiness metadata from GET /api/health', async () => {
    const response = await request(testApp()).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      ok: true,
      service: 'difaryx-gemini-backend',
      provider: 'gemini-developer-api',
      providerMode: 'developer',
      model: 'gemini-2.5-flash',
      providerConfigured: true,
    });
    expect(JSON.stringify(response.body)).not.toMatch(/credential|secret|token|project/i);
    expect(JSON.stringify(response.body)).not.toContain('test-only-placeholder');
  });

  it('reports optional Vertex mode without exposing configuration details', async () => {
    const config = loadServerConfig({
      NODE_ENV: 'production',
      ALLOWED_ORIGINS: 'https://app.example.test',
      GEMINI_PROVIDER_MODE: 'vertex',
      GOOGLE_GENAI_USE_VERTEXAI: 'true',
      GOOGLE_CLOUD_LOCATION: 'global',
      GEMINI_MODEL: 'gemini-2.5-flash',
    });
    const response = await request(createApp({ config, logger: () => undefined })).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      provider: 'vertex-gemini',
      providerMode: 'vertex',
      providerConfigured: false,
    });
    expect(response.body).not.toHaveProperty('project');
  });

  it('rejects a missing packet', async () => {
    const response = await request(testApp())
      .post('/api/reasoning')
      .send({ provider: 'deterministic' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Missing evidence packet');
  });

  it('rejects an invalid provider', async () => {
    const response = await request(testApp())
      .post('/api/reasoning')
      .send({ packet, provider: 'unsupported-model' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Unsupported provider');
  });

  it('preserves the deterministic success response shape', async () => {
    const response = await request(testApp())
      .post('/api/reasoning')
      .send({ packet, provider: 'deterministic' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      fallbackUsed: false,
      output: {
        primaryResult: 'Candidate A',
        metadata: { provider: 'deterministic' },
      },
    });
  });

  it('preserves the POST /api/llm/reason response shape', async () => {
    const response = await request(testApp())
      .post('/api/llm/reason')
      .send({ packet, modelMode: 'deterministic' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      fallbackUsed: false,
      output: {
        primaryResult: 'Candidate A',
        metadata: { provider: 'deterministic' },
      },
    });
    expect(response.body).not.toHaveProperty('success');
  });

  it('accepts an allowed CORS origin', async () => {
    const response = await request(testApp())
      .get('/health')
      .set('Origin', 'https://app.example.test');

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe('https://app.example.test');
  });

  it('rejects an unknown production CORS origin', async () => {
    const response = await request(testApp())
      .get('/health')
      .set('Origin', 'https://unknown.example.test');

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Origin not allowed');
  });

  it('sanitizes an unexpected provider error', async () => {
    const app = createApp({
      config: productionConfig(),
      logger: () => undefined,
      reasoningHandler: async () => {
        throw new Error('credential token and raw evidence must not escape');
      },
    });
    const response = await request(app)
      .post('/api/reasoning')
      .send({ packet, provider: 'deterministic' });

    expect(response.status).toBe(500);
    expect(response.body.error).toBe('Internal server error');
    expect(JSON.stringify(response.body)).not.toMatch(/credential|token|raw evidence/i);
  });

  it('returns an X-Request-Id header', async () => {
    const response = await request(testApp())
      .get('/health')
      .set('X-Request-Id', 'phase-2c-test');

    expect(response.headers['x-request-id']).toBe('phase-2c-test');
  });
});
