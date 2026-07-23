import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import vercelApp from '../../api/index';
import type { AgentEvidencePacket } from '../../src/agent/mcp/types';

const packet: AgentEvidencePacket = {
  context: 'xrd',
  datasetId: 'vercel-adapter-test',
  datasetName: 'synthetic-public-data.csv',
  materialSystem: 'synthetic test material',
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

interface VercelConfig {
  rewrites?: Array<{ source: string; destination: string }>;
}

describe('Vercel Gemini backend adapter', () => {
  it('exports the existing Express health endpoints', async () => {
    const [liveness, readiness] = await Promise.all([
      request(vercelApp).get('/health'),
      request(vercelApp).get('/api/health'),
    ]);

    expect(liveness.status).toBe(200);
    expect(liveness.body).toMatchObject({
      ok: true,
      service: 'difaryx-gemini-backend',
    });
    expect(readiness.status).toBe(200);
    expect(readiness.body).toMatchObject({
      ok: true,
      providerMode: 'developer',
      model: 'gemini-2.5-flash',
    });
  });

  it('preserves both deterministic reasoning endpoint contracts', async () => {
    const [reasoning, legacyReasoning] = await Promise.all([
      request(vercelApp)
        .post('/api/reasoning')
        .send({ packet, provider: 'deterministic' }),
      request(vercelApp)
        .post('/api/llm/reason')
        .send({ packet, modelMode: 'deterministic' }),
    ]);

    expect(reasoning.status).toBe(200);
    expect(reasoning.body).toMatchObject({
      success: true,
      fallbackUsed: false,
      output: { metadata: { provider: 'deterministic' } },
    });
    expect(legacyReasoning.status).toBe(200);
    expect(legacyReasoning.body).toMatchObject({
      fallbackUsed: false,
      output: { metadata: { provider: 'deterministic' } },
    });
    expect(legacyReasoning.body).not.toHaveProperty('success');
  });

  it('routes API and liveness requests before the SPA fallback', () => {
    const configPath = fileURLToPath(new URL('../../vercel.json', import.meta.url));
    const config = JSON.parse(readFileSync(configPath, 'utf8')) as VercelConfig;

    expect(config.rewrites).toEqual([
      { source: '/api/:path*', destination: '/api' },
      { source: '/health', destination: '/api' },
      { source: '/(.*)', destination: '/index.html' },
    ]);
  });
});
