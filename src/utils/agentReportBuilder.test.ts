import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AgentContext } from './agentContext';
import type { AgentEvidenceWorkspace } from './agentEvidenceModel';
import {
  buildAgentReportSections,
  exportAgentReport,
  type AgentReportInput,
} from './agentReportBuilder';
import { exportDemoArtifact } from './demoExport';
import type { RegistryProject } from '../data/demoProjectRegistry';
import type { ClaimBoundaryArtifact, ResearchEvidenceItem, ReasoningProvenance } from '../types/researchEvidence';

vi.mock('./demoExport', () => ({
  exportDemoArtifact: vi.fn(),
}));

function makeAgentContext(): AgentContext {
  return {
    projectId: 'project-1',
    projectTitle: 'Copper Ferrite Review',
    materialSystem: 'CuFe2O4',
    objective: 'Assess the project phase assignment.',
    jobType: 'research',
    evidenceMode: 'single-tech',
    primaryTechnique: 'XRD',
    selectedTechnique: 'XRD',
    activeTechniques: ['XRD'],
    includedTechniques: ['XRD'],
    evidenceLayers: [
      {
        technique: 'XRD',
        role: 'primary structural evidence',
        status: 'available',
        summary: 'Major reflections support the spinel assignment.',
        limitation: 'Refinement is still required for phase-purity claims.',
        claimContribution: 'Supports phase assignment.',
        parameters: { range: '10-80 degrees' },
        hasGraphData: false,
        graphData: [],
        graphType: 'xrd',
      },
    ],
    workspaceTitle: 'XRD Phase Identification',
    workspaceDescription: 'Primary structural evidence workflow.',
    workflowSteps: [
      {
        number: 1,
        title: 'Load evidence',
        description: 'Load the configured XRD dataset.',
        status: 'complete',
      },
    ],
    metricCards: [],
    parameterGroups: [
      {
        id: 'XRD',
        title: 'XRD Parameters',
        params: [
          {
            key: 'Peak threshold',
            value: 'Auto',
            provenance: 'demo-default',
            editable: true,
          },
        ],
      },
    ],
    parameterOverrides: [],
    hasParameterOverrides: false,
    discussionContext: {
      interpretation: 'The pattern is consistent with the candidate phase.',
      agreement: 'Moderate agreement.',
      uncertainty: 'Purity remains unvalidated.',
    },
    comparisonContext: {
      paperScholar: 'Local reference comparison.',
      agentCompare: 'Pattern comparison complete.',
    },
    traceContext: {
      mode: 'deterministic',
      jobType: 'research',
      steps: [{ label: 'Load evidence', detail: 'Loaded the XRD dataset.' }],
      outputLabel: 'Publication-limited claim / next experiment',
    },
    boundaryContext: {
      jobType: 'research',
      supported: ['XRD supports phase assignment'],
      validationLimited: ['Phase purity requires refinement'],
      cannotConclude: ['Bulk purity from XRD alone'],
      requiredNext: ['Run Rietveld refinement'],
    },
    evidenceSummary: 'Evidence supports the selected phase assignment.',
    claimBoundary: 'Phase assignment supported; phase purity requires validation.',
    validationGaps: [],
    recommendedActions: [],
    hasGraphData: false,
    graphType: 'xrd',
    graphData: [],
    notebookPayload: {
      projectId: 'project-1',
      projectTitle: 'Copper Ferrite Review',
      jobType: 'research',
      mode: 'deterministic',
      evidenceMode: 'single-tech',
      activeTechniques: ['XRD'],
      includedTechniques: ['XRD'],
      selectedTechnique: 'XRD',
      evidenceLayers: [],
      claimBoundary: 'Phase purity requires validation.',
      validationGaps: [],
      recommendedActions: [],
      parameterOverrides: [],
    },
  };
}

function makeEvidenceWorkspace(): AgentEvidenceWorkspace {
  return {
    projectId: 'project-1',
    jobType: 'research',
    objective: 'Assess the project phase assignment.',
    focusedTechnique: 'xrd',
    hasParameterOverrides: false,
    claimBoundary: {
      supported: ['XRD supports phase assignment'],
      validationLimited: ['Phase purity requires refinement'],
      cannotConclude: ['Bulk purity from XRD alone'],
      requiredNext: ['Run Rietveld refinement'],
    },
    trace: [],
    techniques: [
      {
        techniqueId: 'xrd',
        displayName: 'XRD',
        evidenceRole: 'primary-structural',
        availability: 'available',
        selected: true,
        parameters: [],
        graphSource: {
          techniqueId: 'xrd',
          hasRealGraph: false,
          structuredEvidenceAvailable: true,
        },
        evidenceResult: {
          techniqueId: 'xrd',
          displayName: 'XRD',
          summary: 'Major reflections support the spinel assignment.',
          extractedFindings: ['The strongest reflection matches the candidate phase.'],
          validationLimits: ['Refinement is required for phase purity.'],
          requiredReferences: [],
          missingReferences: [],
          nextAction: 'Run Rietveld refinement.',
        },
        validationLimits: ['Refinement is required for phase purity.'],
        requiredReferences: [],
        missingReferences: [],
        nextAction: 'Run Rietveld refinement.',
      },
    ],
  };
}

function makeClaimBoundary(): ClaimBoundaryArtifact {
  return {
    provider: 'deterministic',
    signals: {
      evidenceStrength: 'moderate',
      confidence: 0.8,
      contradictions: ['XPS surface evidence is not bulk evidence.'],
      missingValidation: ['Rietveld refinement is missing.'],
    },
    renderedClaimBoundary: ['Phase purity cannot be concluded from the current evidence.'],
  };
}

function makeInput(overrides: Partial<AgentReportInput> = {}): AgentReportInput {
  const researchEvidence: ResearchEvidenceItem[] = [
    {
      title: 'Spinel ferrite reference',
      authors: ['A. Researcher'],
      year: 2024,
      journal: 'Journal of Materials Evidence',
      doi: '10.0000/example',
      relevanceScore: 0.9,
      source: 'local',
    },
  ];
  const reasoningProvenance: ReasoningProvenance = {
    literatureSource: 'local',
    literatureCount: 1,
    reasoningProvider: 'deterministic',
    fallbackUsed: false,
    generatedAt: '2026-07-21T00:00:00.000Z',
  };
  const registryProject = {
    _raw: {
      validationGaps: [{ description: 'Registered refinement gap.' }],
    },
  } as unknown as RegistryProject;

  return {
    projectId: 'project-1',
    projectTitle: 'Copper Ferrite Review',
    materialSystem: 'CuFe2O4',
    objective: 'Assess the project phase assignment.',
    jobType: 'research',
    claimStatus: 'requires_validation',
    mode: 'deterministic',
    agentContext: makeAgentContext(),
    registryProject,
    evidenceWorkspace: makeEvidenceWorkspace(),
    researchEvidence,
    reasoningProvenance,
    claimBoundary: makeClaimBoundary(),
    isConditionLocked: true,
    toolTrace: [
      {
        id: 'trace-complete',
        toolName: 'xrd_runner',
        callType: 'deterministic',
        argsSummary: 'project-1',
        resultSummary: '13 peaks detected',
        evidenceImpact: 'Supports phase assignment',
        approvalStatus: 'approved',
        timestamp: '2026-07-21T00:00:01.000Z',
        status: 'complete',
      },
      {
        id: 'trace-running',
        toolName: 'fusion_engine',
        callType: 'fusion',
        argsSummary: 'XRD nodes',
        resultSummary: 'Running',
        evidenceImpact: 'Combines evidence',
        approvalStatus: 'pending',
        timestamp: '2026-07-21T00:00:02.000Z',
        status: 'running',
      },
      {
        id: 'trace-error',
        toolName: 'literature_search',
        callType: 'lookup',
        argsSummary: 'spinel ferrite',
        resultSummary: 'Unavailable',
        evidenceImpact: 'Literature gap remains',
        approvalStatus: 'not-connected',
        timestamp: '2026-07-21T00:00:03.000Z',
        status: 'error',
      },
      {
        id: 'trace-pending',
        toolName: 'refinement',
        callType: 'validation',
        argsSummary: 'Rietveld',
        resultSummary: 'Queued',
        evidenceImpact: 'Required for purity claim',
        approvalStatus: 'required',
        timestamp: '2026-07-21T00:00:04.000Z',
        status: 'pending',
      },
    ],
    ...overrides,
  };
}

describe('agentReportBuilder', () => {
  beforeEach(() => {
    vi.mocked(exportDemoArtifact).mockClear();
  });

  it('builds exactly five sections in the expected order', () => {
    const sections = buildAgentReportSections(makeInput());

    expect(sections).toHaveLength(5);
    expect(sections.map((section) => section.heading)).toEqual([
      '1. Goal & Context',
      '2. Parameters & Conditions',
      '3. Evidence & Reasoning',
      '4. Execution Trace',
      '5. Boundary & Validation',
    ]);

    expect(sections[0].lines.join('\n')).toContain('Copper Ferrite Review');
    expect(sections[1].lines.join('\n')).toContain('Peak threshold: Auto');
    expect(sections[2].lines.join('\n')).toContain('Spinel ferrite reference');
    expect(sections[2].lines.join('\n')).toContain('The strongest reflection matches');
    expect(sections[3].lines.join('\n')).toContain('xrd_runner');
    expect(sections[4].lines.join('\n')).toContain('Phase purity cannot be concluded');
  });

  it('handles minimal valid input without undefined or null output', () => {
    const sections = buildAgentReportSections(makeInput({
      projectTitle: undefined,
      materialSystem: undefined,
      objective: undefined,
      jobType: undefined,
      claimStatus: undefined,
      registryProject: undefined,
      evidenceWorkspace: undefined,
      toolTrace: undefined,
      researchEvidence: [],
      reasoningProvenance: null,
      claimBoundary: null,
      isConditionLocked: undefined,
    }));
    const output = sections.flatMap((section) => section.lines).join('\n');

    expect(() => buildAgentReportSections(makeInput())).not.toThrow();
    expect(output).not.toMatch(/\b(undefined|null)\b/);
  });

  it('preserves supported, validation-limited, cannot-conclude, and next actions', () => {
    const boundary = buildAgentReportSections(makeInput())[4].lines.join('\n');

    expect(boundary).toContain('XRD supports phase assignment');
    expect(boundary).toContain('Phase purity requires refinement');
    expect(boundary).toContain('Bulk purity from XRD alone');
    expect(boundary).toContain('Run Rietveld refinement');
    expect(boundary).toContain('Rietveld refinement is missing.');
    expect(boundary).toContain('XPS surface evidence is not bulk evidence.');
    expect(boundary).toContain('Registered refinement gap.');
  });

  it('maps complete, running, error, and pending tool trace states', () => {
    const trace = buildAgentReportSections(makeInput())[3].lines.join('\n');

    expect(trace).toContain('[OK] xrd_runner');
    expect(trace).toContain('[RUN] fusion_engine');
    expect(trace).toContain('[ERR] literature_search');
    expect(trace).toContain('[PEND] refinement');
    expect(trace).toContain('Input: project-1');
    expect(trace).toContain('Output: 13 peaks detected');
    expect(trace).toContain('Impact: Supports phase assignment');
    expect(trace).toContain('Approval: approved');
    expect(trace).toContain('Time: 2026-07-21T00:00:01.000Z');
  });

  it('exports Markdown and TXT through the shared export infrastructure', () => {
    exportAgentReport(makeInput(), 'md');
    expect(exportDemoArtifact).toHaveBeenLastCalledWith(
      'md',
      expect.objectContaining({
        filenameBase: 'agent-report-project-1',
        title: 'Scientific Agent Report: Copper Ferrite Review',
        sections: expect.any(Array),
      }),
    );

    exportAgentReport(makeInput({ projectTitle: undefined }), 'txt');
    expect(exportDemoArtifact).toHaveBeenLastCalledWith(
      'txt',
      expect.objectContaining({
        filenameBase: 'agent-report-project-1',
        title: 'Scientific Agent Report: project-1',
        sections: expect.any(Array),
      }),
    );
  });
});
