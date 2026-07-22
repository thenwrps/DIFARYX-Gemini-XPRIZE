import { describe, expect, it } from 'vitest';
import { DEFAULT_PROJECT_ID, getProject, getProjectDatasets } from '../../data/demoProjects';
import { getXrdProcessingParams } from '../../utils/xrdParameterAdapter';
import { runXrdPhaseIdentificationAgent } from '../../agents/xrdAgent';
import { createDecisionResult, toAgentRunResult } from '../../features/agent/pages/ClassicAgentDemo';

describe('current AgentDemo execution characterization', () => {
  it('keeps deterministic XRD runner output stable for the same input', () => {
    const project = getProject(DEFAULT_PROJECT_ID)!;
    const dataset = getProjectDatasets(DEFAULT_PROJECT_ID).find((item) => item.technique === 'XRD')!;
    const input = {
      datasetId: dataset.id,
      sampleName: dataset.sampleName,
      sourceLabel: dataset.fileName,
      dataPoints: dataset.dataPoints,
    };
    const first = runXrdPhaseIdentificationAgent(input, getXrdProcessingParams(project.id));
    const second = runXrdPhaseIdentificationAgent(input, getXrdProcessingParams(project.id));

    expect(second).toEqual(first);
    expect(first.detectedPeaks.length).toBeGreaterThan(0);
    expect(first.candidates.length).toBeGreaterThan(0);
  });

  it('keeps pure decision and compatibility-result fields available to AgentDemo', () => {
    const project = getProject(DEFAULT_PROJECT_ID)!;
    const dataset = getProjectDatasets(DEFAULT_PROJECT_ID).find((item) => item.technique === 'XRD')!;
    const decision = createDecisionResult('XRD', { project, dataset } as any, null);
    const result = toAgentRunResult(decision, 'XRD', { project, dataset } as any, ['validate_xrd_input'], []);

    expect(decision.primaryResult).toBeTruthy();
    expect(decision.reasoningTrace).toBeInstanceOf(Array);
    expect(result.projectId).toBe(project.id);
    expect(result.selectedDatasets).toEqual(['XRD']);
    expect(result.pipeline).toEqual(['validate_xrd_input']);
  });
});
