/** First-class Agent/Notebook/Report context for validated uploaded evidence. */
import type { ProjectEvidenceSnapshot } from './evidenceSnapshot';
import type { DemoGraphData, RegistryProject, TechniqueId } from '../data/demoProjectRegistry';
import type { ClaimStatus, DemoProject, JobType, Technique, ValidationState } from '../data/demoProjects';
import type { UploadedSignalRun } from '../data/uploadedSignalRuns';
import type { StandaloneReviewMetadata } from '../scientificReview/services/standaloneEvidenceIntakeService';

const ALL_TECHNIQUES: Technique[] = ['XRD', 'XPS', 'FTIR', 'Raman'];

export interface UploadedRegistryProjectOptions {
  runs?: UploadedSignalRun[];
  metadata?: StandaloneReviewMetadata;
  baseProject?: RegistryProject | null;
}

function techniqueRole(technique: Technique): string {
  if (technique === 'XRD') return 'Bulk phase identification';
  if (technique === 'XPS') return 'Surface state analysis';
  if (technique === 'FTIR') return 'Bonding analysis';
  return 'Vibrational mode analysis';
}

function graphForRun(run: UploadedSignalRun): DemoGraphData {
  return {
    kind: 'graph',
    type: run.technique.toLowerCase() as TechniqueId,
    xLabel: run.xAxisLabel,
    yLabel: run.yAxisLabel,
    data: run.points,
    peaks: run.extractedFeatures.map((feature) => ({
      position: feature.position,
      intensity: feature.intensity,
      label: feature.label,
    })),
  };
}

export function createUploadedEvidenceRegistryProject(
  snapshot: ProjectEvidenceSnapshot,
  options: UploadedRegistryProjectOptions = {},
): RegistryProject {
  const runs = options.runs ?? [];
  const base = options.baseProject ?? null;
  const metadata = options.metadata;
  const uploadedId = snapshot.projectId || 'uploaded-evidence-temp';
  const uploadedName = base?.title ?? snapshot.projectName ?? snapshot.activeDataset?.fileName ?? 'Standalone Scientific Review';
  const uploadedTechniques = snapshot.availableTechniques as Technique[];
  const primaryTech = snapshot.primaryTechnique ?? uploadedTechniques[0] ?? 'XRD';
  const primaryTechniqueId = primaryTech.toLowerCase() as TechniqueId;
  const activeRun = runs.find((run) => run.technique === primaryTech) ?? runs[runs.length - 1];
  const graphData = activeRun?.points ?? snapshot.activeDataset?.dataPoints ?? [];
  const graphPeaks = activeRun
    ? activeRun.extractedFeatures.map((feature) => ({ position: feature.position, intensity: feature.intensity, label: feature.label }))
    : snapshot.activeDataset?.detectedFeatures.map((feature) => ({ position: feature.position, intensity: feature.intensity, label: feature.label })) ?? [];
  const graphSource: DemoGraphData = activeRun ? graphForRun(activeRun) : {
    kind: 'graph',
    type: primaryTechniqueId,
    xLabel: snapshot.activeDataset?.xLabel ?? 'Position',
    yLabel: snapshot.activeDataset?.yLabel ?? 'Intensity',
    data: graphData,
    peaks: graphPeaks,
  };
  const objective = metadata?.objective.trim() || base?.objective || `Analyze uploaded ${uploadedTechniques.join(', ') || primaryTech} evidence`;
  const materialSystem = metadata?.materialSystem.trim() || base?.materialSystem || snapshot.sampleIdentity || 'Unknown material';
  const decisionRequired = metadata?.decisionRequired.trim() || base?.notebook.decision || 'Determine the next validation experiment';
  const uploadSources = runs.map((run) => ({
    technique: run.technique as Technique,
    datasetId: run.id,
    datasetLabel: run.fileName,
    description: `${run.technique} uploaded signal passed the ${run.evidenceQuality.label.toLowerCase()} evidence gate.`,
    available: run.evidenceQuality.canInterpret,
  }));
  const mergedTechniques = ALL_TECHNIQUES.filter((technique) =>
    uploadedTechniques.includes(technique) || base?._raw.techniques.includes(technique),
  );
  const mergedSources = [
    ...(base?._raw.evidenceSources ?? []),
    ...uploadSources,
  ].filter((source, index, all) => all.findIndex((candidate) => candidate.datasetId === source.datasetId) === index);

  const rawProject: DemoProject = base ? {
    ...base._raw,
    objective,
    material: materialSystem,
    techniques: mergedTechniques,
    techniqueMetadata: mergedTechniques.map((technique) => base._raw.techniqueMetadata.find((item) => item.key === technique) ?? {
      key: technique,
      label: technique,
      role: techniqueRole(technique),
      status: 'ready' as const,
      dataAvailable: uploadedTechniques.includes(technique),
    }),
    evidenceSources: mergedSources,
    evidence: [...base._raw.evidence, ...snapshot.evidenceEntries.map((entry) => entry.support)],
    validationGaps: snapshot.validationGaps,
    nextDecisions: metadata?.decisionRequired.trim() ? [{ id: 'uploaded-decision', label: 'Decision required', description: decisionRequired, urgency: 'medium' as const }, ...base._raw.nextDecisions] : base._raw.nextDecisions,
    xrdPeaks: primaryTech === 'XRD' ? graphPeaks : base._raw.xrdPeaks,
  } : {
    id: uploadedId,
    name: uploadedName,
    material: materialSystem,
    objective,
    jobType: 'research' as JobType,
    techniques: uploadedTechniques,
    techniqueMetadata: uploadedTechniques.map((technique) => ({ key: technique, label: technique, role: techniqueRole(technique), status: 'ready' as const, dataAvailable: true })),
    evidenceSources: uploadSources,
    status: 'active',
    claimStatus: 'partial' as ClaimStatus,
    validationState: 'limited' as ValidationState,
    phase: 'Unknown',
    lastUpdated: new Date().toISOString(),
    createdDate: new Date().toISOString(),
    summary: `User-uploaded ${uploadedTechniques.join(', ')} evidence for ${materialSystem}`,
    xrdPeaks: primaryTech === 'XRD' ? graphPeaks : [],
    evidence: snapshot.evidenceEntries.map((entry) => entry.support),
    validationGaps: snapshot.validationGaps,
    nextDecisions: [{ id: 'uploaded-decision', label: 'Decision required', description: decisionRequired, urgency: 'medium' as const }],
    recommendations: [decisionRequired],
    reportReadiness: { notebookReady: true, exportReady: true, readinessPercent: 60, label: 'Validation-limited' },
    notebook: { title: `${materialSystem} Review`, pipeline: ['Upload', 'Parse', 'Evidence validation'], peakDetection: 'Completed', phaseIdentification: 'Validation-limited' },
    history: [],
    workspace: 'xrd',
  };

  const workspaceGraphs = { ...(base?.workspaceGraphs ?? {}) };
  runs.forEach((run) => { workspaceGraphs[run.technique.toLowerCase() as TechniqueId] = graphForRun(run); });
  if (!workspaceGraphs[primaryTechniqueId]) workspaceGraphs[primaryTechniqueId] = graphSource;
  const techniques = mergedTechniques.map((technique) => {
    const existing = base?.techniques.find((item) => item.id === technique.toLowerCase());
    const run = runs.find((item) => item.technique === technique);
    return existing ? { ...existing, available: existing.available || Boolean(run), datasetLabel: run?.fileName ?? existing.datasetLabel } : {
      id: technique.toLowerCase() as TechniqueId,
      label: technique,
      role: techniqueRole(technique),
      available: true,
      datasetLabel: run?.fileName ?? snapshot.evidenceEntries.find((entry) => entry.technique === technique)?.datasetLabel ?? 'Uploaded evidence',
      description: `User-uploaded ${technique} data`,
      parameters: [],
    };
  });
  const missingEvidence = ALL_TECHNIQUES.filter((technique) => !uploadedTechniques.includes(technique)).map((technique) => `${technique} evidence not included`);

  return {
    ...(base ?? {} as RegistryProject),
    id: uploadedId,
    title: uploadedName,
    materialSystem,
    jobType: base?.jobType ?? 'research',
    createdLabel: base?.createdLabel ?? 'Uploaded',
    statusLabel: base ? 'Project with uploaded evidence' : 'Standalone evidence review',
    claimStatus: 'validation_limited',
    reportReadiness: Math.max(base?.reportReadiness ?? 0, 60),
    validationGapCount: snapshot.validationGaps.length,
    decisionPendingCount: 1,
    objective,
    context: {
      materialSystem,
      sampleDescription: base?.context.sampleDescription ?? `User-uploaded evidence for ${materialSystem}`,
      experimentalSetup: base?.context.experimentalSetup ?? 'External upload',
      datasetSources: [...(base?.context.datasetSources ?? []), ...runs.map((run) => `${run.technique}: ${run.fileName}`)],
    },
    techniques,
    primaryTechnique: primaryTechniqueId,
    selectedTechniques: uploadedTechniques.map((technique) => technique.toLowerCase() as TechniqueId),
    graphPreview: graphSource,
    workspaceGraphs,
    evidenceSummary: `${snapshot.evidenceEntries.length} evidence source${snapshot.evidenceEntries.length === 1 ? '' : 's'} available across ${uploadedTechniques.join(', ')}`,
    evidenceResults: [
      ...(base?.evidenceResults ?? []),
      ...runs.map((run) => ({ techniqueId: run.technique.toLowerCase() as TechniqueId, displayName: run.technique, summary: `${run.extractedFeatures.length} bounded features from ${run.fileName}`, supportsClaim: true, limitation: run.claimBoundary.join(' '), findings: run.extractedFeatures.slice(0, 4).map((feature) => feature.label) })),
    ],
    crossTechniqueComparison: {
      ...(base?.crossTechniqueComparison ?? { agreementLevel: 'limited' as const, agreementSummary: 'Uploaded evidence awaits cross-technique review', matrix: [], references: [] }),
      missingEvidence,
      validationGap: snapshot.claimBoundary.requiresValidation[0] ?? 'Complementary validation remains required.',
      recommendedNextAction: decisionRequired,
    },
    agentWorkflow: {
      trace: base?.agentWorkflow.trace ?? [],
      claimBoundary: {
        supported: snapshot.claimBoundary.supported,
        validationLimited: snapshot.claimBoundary.requiresValidation,
        cannotConclude: snapshot.claimBoundary.notSupportedYet,
        requiredNext: snapshot.claimBoundary.pending,
      },
      nextDecisionLabel: decisionRequired,
    },
    notebook: {
      title: base?.notebook.title ?? `${materialSystem} Scientific Review`,
      objective,
      evidenceBasis: snapshot.evidenceEntries.map((entry) => entry.support),
      interpretation: 'Uploaded evidence is ready for bounded GPT-5.6 scientific reasoning.',
      validationGap: snapshot.claimBoundary.requiresValidation[0] ?? 'Complementary validation remains required.',
      decision: decisionRequired,
      reportDraft: `Scientific review of uploaded ${uploadedTechniques.join(', ')} evidence for ${materialSystem}.`,
      missingReferences: missingEvidence,
      claimStatus: 'validation_limited',
      validationBoundary: snapshot.claimBoundary.notSupportedYet.join(' '),
    },
    experimentHistory: base?.experimentHistory ?? [],
    workflowPath: ['objective', 'evidence', 'reasoning', 'gap', 'decision', 'memory'],
    _raw: rawProject,
  };
}

export function getUploadedProjectTechniques(registryProject: RegistryProject): Technique[] {
  return registryProject._raw.techniques;
}

export function isUploadedEvidenceProjectId(projectId: string): boolean {
  return projectId === 'uploaded-evidence-temp' || projectId === 'user-uploaded-workspace' || projectId.startsWith('uploaded:');
}
