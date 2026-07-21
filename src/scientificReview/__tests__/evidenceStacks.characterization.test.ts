import { describe, expect, it } from 'vitest';
import { DEFAULT_PROJECT_ID, getProject, getProjectDatasets } from '../../data/demoProjects';
import { buildEvidencePacket as buildActivePacket } from '../../agent/mcp/evidencePacket';
import { buildEvidencePacket as buildLegacyPacket } from '../../services/evidencePacket';

const project = getProject(DEFAULT_PROJECT_ID)!;
const dataset = getProjectDatasets(DEFAULT_PROJECT_ID).find((item) => item.technique === 'Raman')!;

const xrdAnalysis = {
  detectedPeaks: [{ position: 35.5, intensity: 100, label: '(311)' }],
  candidates: [{
    phase: { name: 'Candidate phase', peaks: [{ position: 35.5 }] },
    score: 0.8,
    matches: [{ position: 35.5 }],
    missing: [],
    unexplained: [],
  }],
  interpretation: {
    decision: 'Candidate phase',
    confidence: 0.8,
    evidence: ['one feature'],
    caveats: [],
  },
};

describe('duplicate evidence-stack characterization', () => {
  it('identifies the MCP builder as the active AgentDemo-compatible packet shape', () => {
    const packet = buildActivePacket(
      'XRD',
      dataset,
      project,
      xrdAnalysis,
      1,
      80,
      [],
    );

    expect(packet.context).toBe('xrd');
    expect(packet.toolTrace).toEqual([]);
    expect(packet.detectedFeatures).toHaveLength(1);
    expect(packet.candidates[0].label).toBe('Candidate phase');
  });

  it('documents the legacy XRD schema difference without redirecting it', () => {
    const active = buildActivePacket('XRD', dataset, project, xrdAnalysis, 1, 80, []);
    const legacy = buildLegacyPacket('XRD', dataset, project, xrdAnalysis, 1, 'supported');

    expect(legacy.context).toBe(active.context);
    expect(legacy.detectedFeatures).toEqual(active.detectedFeatures);
    expect('toolTrace' in legacy).toBe(false);
    expect(legacy.processingNotes).toEqual(active.processingNotes);
  });

  it('records intentional non-XRD behavior differences between builders', () => {
    const active = buildActivePacket('Raman', dataset, project, null, 4, 80, []);
    const legacy = buildLegacyPacket('Raman', dataset, project, null, 4, 'supported');

    expect(active.toolTrace).toEqual([]);
    expect('toolTrace' in legacy).toBe(false);
    expect(active.candidates[0].label).not.toBe(legacy.candidates[0].label);
    expect(active.uncertaintyFlags).not.toEqual(legacy.uncertaintyFlags);
    expect(active.processingNotes).toContain('Evidence treated as supportive, not standalone phase claim');
  });
});
