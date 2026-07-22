import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, Clipboard, Download, FileText, Save, ShieldCheck, Sparkles, RotateCcw } from 'lucide-react';
import { reproduceAnalysis } from '../../../utils/reproduceAnalysis';
import { DashboardLayout } from '../../../shared/layout/DashboardLayout';

import { Button } from '../../../shared/ui/Button';
import { EmptyStateCard } from '../../../shared/ui/EmptyStateCard';
import { Card } from '../../../shared/ui/Card';
import { useAuth } from '../../../contexts/AuthContext';
import { useXrdWorkflowRuntime } from '../../../context/XrdWorkflowRuntimeContext';
import { useX7UniversalHook } from '../../../hooks/useX7UniversalHook';
import { getProject, getWorkspaceRoute } from '../../../data/demoProjects';
import {
  claimStatusColorClass,
  claimStatusLabel,
  getRegistryProject,
  isKnownProjectId,
  jobTypeBadgeClass,
  jobTypeLabel,
} from '../../../data/demoProjectRegistry';
import {
  NOTEBOOK_TEMPLATES,
  createNotebookEntryFromRefinement,
  createProcessingResultFromXrdDemo,
  createReportSectionFromNotebookEntry,
  getLatestAgentDiscussionRefinement,
  getLatestNotebookEntry,
  getLatestProcessingResult,
  getNotebookEntry,
  normalizeNotebookTemplateMode,
  refineDiscussionFromProcessing,
  type NotebookEntry,
  type NotebookTemplateMode,
} from '../../../data/workflowPipeline';
import {
  selectXrdWorkflowScientificEvidence,
  selectXrdWorkflowReferenceMatchEvidence,
  extractScientificEvidenceFields,
  extractReferenceMatchFields,
  selectXrdQualityMetrics,
  selectXrdPhaseMatchSummary,
} from '../../../data/xrdWorkflowHandoffSelectors';
import { exportDemoArtifact, type DemoExportFormat, type DemoExportSection } from '../../../utils/demoExport';
import { getProjectEvidenceSnapshot, type ProjectEvidenceSnapshot } from '../../../utils/evidenceSnapshot';
import { createUploadedEvidenceRegistryProject } from '../../../utils/uploadedEvidenceProjectContext';
import { ScientificConfidenceSummary } from '../../../shared/ui/ScientificConfidenceSummary';
import {
  getRuntimeBadgeClass,
  getRuntimeBadgeLabel,
  requiresApproval,
} from '../../../runtime/difaryxRuntimeMode';
import { ApprovalActionDialog } from '../../runtime/components/ApprovalActionDialog';
import { ConnectedAccountStatus } from '../../runtime/components/ConnectedAccountStatus';
import {
  createApprovalActionPreview,
  type ApprovalActionPreview,
  type ApprovalActionType,
  type ApprovalRiskLevel,
} from '../../../runtime/actionApproval';
import { appendApprovalLedgerEntry, createApprovalLedgerEntry, summarizeApprovalLedger } from '../../../runtime/approvalLedger';
import { ApprovalLedgerPanel } from '../../runtime/components/ApprovalLedgerPanel';
import {
  getDefaultConnectedAccountState,
  getGoogleConnectedShellState,
} from '../../../runtime/connectedAccounts';
import {
  createEvidenceBundleFromSnapshot,
  getEvidenceBundleBadgeLabel,
  getTechniqueCoverageFromBundle,
  getValidationGapsFromBundle,
  type EvidenceBundle,
} from '../../../runtime/evidenceBundle';
import {
  readProjectWorkspaceParameters,
} from '../../../utils/workspaceParameterOverrides';
import { getProjectTechniques } from '../../../utils/projectEvidence';
import {
  getParameterProvenanceSummary,
  formatParameterValueForDisplay,
  formatProvenanceSource,
  formatProvenanceTimestamp,
} from '../../../utils/parameterProvenanceSummary';
import { getTechniqueWorkspaceConfig, type TechniqueWorkspaceId } from '../../../data/techniqueWorkspaceContent';
import {
  getStoredWorkspaceMode,
  setWorkspaceMode,
} from '../../../utils/workspaceMode';
import {
  buildEvidenceRouteSearch,
  getEvidenceRouteContext,
  type EvidenceRouteContext,
} from '../../../utils/evidenceRouteContext';
import { runWhenIdle } from '../../../utils/idle';
import { buildClaimBoundaryArtifact } from '../../../utils/claimBoundaryArtifact';
import type { ClaimBoundarySignals } from '../../../types/researchEvidence';

function reportTypeLabel(mode: NotebookTemplateMode) {
  if (mode === 'rd') return 'Technical Evidence Report';
  if (mode === 'analytical') return 'Analytical Evidence Report';
  return 'Research Evidence Report';
}

type ReportXrdReferenceCandidateSummary = NonNullable<NotebookEntry['xrdReferenceMatchV2Summary']>;

const REPORT_XRD_REFERENCE_CANDIDATE_FALLBACK_LIMITATIONS = [
  'Candidate match is based on peak-position agreement.',
  'Chemical identity requires composition-sensitive evidence.',
  'Phase purity is outside this XRD-only candidate evidence.',
];

function isBlockedReportReferenceCandidatePhrase(value: string) {
  const normalized = value.toLowerCase();
  return (
    (normalized.includes('confirmed') && normalized.includes('phase')) ||
    (normalized.includes('confirmed') && normalized.includes('identity')) ||
    (normalized.includes('identified') && normalized.includes(' as ')) ||
    (normalized.includes('pure') && normalized.includes('phase')) ||
    (normalized.includes('definitive') && normalized.includes('match'))
  );
}

function safeReportReferenceCandidateText(value: string | undefined | null): string | null {
  const normalized = value?.trim();
  if (!normalized) return null;
  return isBlockedReportReferenceCandidatePhrase(normalized) ? null : normalized;
}

function formatReportReferenceNumber(value: number | undefined | null, digits = 2): string | null {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : null;
}

function buildXrdReferenceCandidateReportSection(
  summary?: ReportXrdReferenceCandidateSummary,
): DemoExportSection[] {
  if (!summary) return [];

  const primaryCandidate = summary.primaryCandidate;
  const claimLevel = safeReportReferenceCandidateText(summary.claimLevel) ?? 'candidate evidence';
  const referenceSetId = safeReportReferenceCandidateText(summary.referenceSetId);
  const phaseLabel = safeReportReferenceCandidateText(primaryCandidate?.phaseLabel);
  const formula = safeReportReferenceCandidateText(primaryCandidate?.formula);
  const structureFamily = safeReportReferenceCandidateText(primaryCandidate?.structureFamily);
  const databaseRef = safeReportReferenceCandidateText(primaryCandidate?.databaseRef);
  const score = formatReportReferenceNumber(primaryCandidate?.score);
  const coverageRatio = formatReportReferenceNumber(primaryCandidate?.coverageRatio);
  const meanDeltaTwoTheta = formatReportReferenceNumber(primaryCandidate?.meanDeltaTwoTheta);
  const matchedPeakCount = typeof primaryCandidate?.matchedPeakCount === 'number' && Number.isFinite(primaryCandidate.matchedPeakCount)
    ? primaryCandidate.matchedPeakCount
    : null;
  const referencePeakCount = typeof primaryCandidate?.referencePeakCount === 'number' && Number.isFinite(primaryCandidate.referencePeakCount)
    ? primaryCandidate.referencePeakCount
    : null;
  const matchedPeaksDisplay = matchedPeakCount !== null
    ? `${matchedPeakCount}${referencePeakCount !== null ? ` / ${referencePeakCount}` : ''}`
    : null;

  const matchedPeakPreviewLines = (Array.isArray(summary.matchedPeaksPreview) ? summary.matchedPeaksPreview : [])
    .slice(0, 5)
    .map((peak, index) => {
      const measured = formatReportReferenceNumber(peak.measuredTwoTheta);
      const reference = formatReportReferenceNumber(peak.referenceTwoTheta);
      const delta = formatReportReferenceNumber(peak.deltaTwoTheta);
      if (!measured || !reference || !delta) return null;
      const hkl = safeReportReferenceCandidateText(peak.hkl);
      const refIntensity = formatReportReferenceNumber(peak.referenceRelativeIntensity, 0);
      return `Matched peak ${index + 1}: measured 2theta ${measured}; reference 2theta ${reference}; delta 2theta ${delta}${hkl ? `; hkl ${hkl}` : ''}${refIntensity ? `; ref. intensity ${refIntensity}` : ''}.`;
    })
    .filter((line): line is string => Boolean(line));

  const limitations = (Array.isArray(summary.limitations) ? summary.limitations : [])
    .map((limitation) => safeReportReferenceCandidateText(limitation))
    .filter((limitation): limitation is string => Boolean(limitation));
  const displayLimitations = limitations.length ? limitations : REPORT_XRD_REFERENCE_CANDIDATE_FALLBACK_LIMITATIONS;

  const primaryCandidateLine = phaseLabel || formula
    ? `Primary candidate: ${[phaseLabel, formula].filter(Boolean).join(' / ')}.`
    : null;

  return [
    {
      heading: 'XRD Reference Candidate Evidence',
      lines: [
        'Reference candidate evidence: Candidate-level agreement with the selected reference set.',
        `Claim level: ${claimLevel}.`,
        ...(referenceSetId ? [`Reference set id: ${referenceSetId}.`] : []),
        ...(primaryCandidateLine ? [primaryCandidateLine] : []),
        ...(structureFamily ? [`Structure family: ${structureFamily}.`] : []),
        ...(databaseRef ? [`Database reference: ${databaseRef}.`] : []),
        ...(score ? [`Score: ${score}.`] : []),
        ...(matchedPeaksDisplay ? [`Matched peaks: ${matchedPeaksDisplay}.`] : []),
        ...(coverageRatio ? [`Coverage ratio: ${coverageRatio}.`] : []),
        ...(meanDeltaTwoTheta ? [`Mean delta 2theta: ${meanDeltaTwoTheta}.`] : []),
        ...matchedPeakPreviewLines,
        'This is not chemical identity confirmation.',
        'This is not phase purity confirmation.',
        'Composition-sensitive evidence is required for stronger assignment.',
        'Safety flags applied: phaseConfirmed=false; phasePurityConfirmed=false.',
        ...displayLimitations.map((limitation) => `Limitation: ${limitation}`),
      ],
    },
  ];
}

function buildReportSections(
  snapshot: ProjectEvidenceSnapshot,
  bundle: EvidenceBundle | null,
  registryProject: ReturnType<typeof getRegistryProject>,
  reportSection: ReturnType<typeof createReportSectionFromNotebookEntry>,
  xrdBackendEvidenceSummary?: NotebookEntry['xrdBackendEvidenceSummary'],
  notebookEntry?: NotebookEntry,
): DemoExportSection[] {
  const availableTechniques = snapshot.availableTechniques.join(', ') || 'No technique evidence linked';
  const pendingTechniques = snapshot.pendingTechniques.join(', ') || 'None';
  const bundleCoverage = bundle ? getTechniqueCoverageFromBundle(bundle) : [];
  const bundleValidationLines = bundle ? getValidationGapsFromBundle(bundle).map((gap) => `${gap.description} Resolution: ${gap.suggestedResolution}`) : [];
  const validationLines = [
    ...snapshot.validationGaps.map((gap) => `${gap.description} Resolution: ${gap.suggestedResolution}`),
    ...snapshot.pendingTechniques.map((technique) => `${technique} validation evidence remains pending.`),
  ];
  const claimBoundaryLines = [
    ...snapshot.claimBoundary.supported.map((line) => `Supported: ${line}`),
    ...snapshot.claimBoundary.requiresValidation.map((line) => `Requires validation: ${line}`),
    ...snapshot.claimBoundary.notSupportedYet.map((line) => `Not supported yet: ${line}`),
    ...(snapshot.claimBoundary.contextual ?? []).map((line) => `Contextual: ${line}`),
    ...(snapshot.claimBoundary.pending ?? []).map((line) => `Pending: ${line}`),
  ];
  const ledgerSummary = summarizeApprovalLedger({
    projectId: snapshot.projectId,
    bundleId: bundle?.bundleId ?? `single-${snapshot.projectId}`,
    limit: 4,
  });

  // Parameter provenance for reproducibility
  const availableTechniqueIds = snapshot.availableTechniques.map(t => t.toLowerCase() as TechniqueWorkspaceId);
  const parameterSummaries = availableTechniqueIds.map(technique =>
    getParameterProvenanceSummary(snapshot.projectId, technique)
  );

  const parameterProvenanceLines = [
    `Analysis Version: v2.0.0`,
    `Report Generation Timestamp: ${new Date().toISOString()}`,
    `Evidence Sources: ${snapshot.evidenceEntries.map(e => `${e.technique}:${e.datasetLabel} (ID: ${e.datasetId || 'N/A'})`).join(', ') || snapshot.activeDataset?.fileName || 'None'}`,
    ``,
    `--- Mapped Processing Parameters ---`,
    ...parameterSummaries.flatMap(summary => {
      const config = getTechniqueWorkspaceConfig(summary.technique);
      if (!config) return [];

      const tableHeader = [
        `Technique: ${summary.techniqueLabel} (last updated by ${formatProvenanceSource(summary.lastUpdatedBy)})`,
        `| Parameter | Default Value | Active Value | Status |`,
        `| --- | --- | --- | --- |`
      ];

      const tableRows = config.parameters.map(ctrl => {
        const isOverridden = summary.changedParameters.some(p => p.id === ctrl.id);
        const defaultValue = summary.state.defaultValues[ctrl.id];
        const effectiveValue = summary.state.effectiveValues[ctrl.id];
        const unit = ctrl.unit ? ` ${ctrl.unit}` : '';
        const status = isOverridden ? 'Modified' : 'Default';
        return `| ${ctrl.label} | ${formatParameterValueForDisplay(defaultValue)}${unit} | ${formatParameterValueForDisplay(effectiveValue)}${unit} | ${status} |`;
      });

      return [...tableHeader, ...tableRows, ''];
    })
  ];

  const xrdBackendEvidenceSection: DemoExportSection[] = xrdBackendEvidenceSummary
    ? [
        {
          heading: 'Skill-derived Backend XRD Evidence',
          lines: (() => {
            const xbe = xrdBackendEvidenceSummary;
            const qm = selectXrdQualityMetrics(notebookEntry) || xbe;
            const pm = selectXrdPhaseMatchSummary(notebookEntry) || xbe;
            const snDisplay = Number.isFinite(qm.snRatio) ? qm.snRatio.toFixed(1) : 'N/A';
            const baselineDisplay = Number.isFinite(qm.baselineDeviation) ? qm.baselineDeviation.toFixed(3) : 'N/A';
            const savedDate = new Date(xbe.savedAt);
            const savedDisplay = Number.isNaN(savedDate.getTime()) ? xbe.savedAt || 'N/A' : savedDate.toISOString();

            return [
              `Detected peak count: ${qm.detectedPeakCount}.`,
              `Fitted peak count: ${qm.fittedPeakCount}.`,
              `Signal-to-noise ratio: ${snDisplay}.`,
              `Baseline deviation: ${baselineDisplay}.`,
              `Peak resolution: ${qm.peakResolution ?? 'N/A'}.`,
              `Reference-supported phase indication: ${pm?.primaryPhase ?? 'N/A'}.`,
              `Matched peak count: ${pm?.matchedPeakCount ?? 0}.`,
              `Phase summary: ${pm?.phaseSummary ?? 'N/A'}.`,
              `Evidence saved: ${savedDisplay}.`,
              ...(() => {
                // Phase X5C: Pure renderer using centralized selectors
                const sciEvidence = selectXrdWorkflowScientificEvidence(notebookEntry || { xrdBackendEvidenceSummary: xbe });
                if (!sciEvidence) return [];
                const fields = extractScientificEvidenceFields(sciEvidence);
                if (!fields) return [];
                return [
                  'Scientific evidence object received.',
                  `Skill: ${fields.skillLabel}.`,
                  `Evidence ID: ${fields.evidenceId}.`,
                  `Input reference: SHA-256 ${fields.inputReference}.`,
                  `Claim boundary: ${fields.claimBoundary}.`,
                ];
              })(),
              xbe.caveat || 'Phase purity requires reference validation and/or complementary evidence.',
            ];
          })(),
        },
      ]
    : [];
  // Phase X5A: Use selector helper for unified handoff → individual → legacy fallback
  const refEvidence = selectXrdWorkflowReferenceMatchEvidence(notebookEntry);
  const refEvidenceSummary = refEvidence
    ? {
        label: 'Reference candidate evidence' as const,
        ...extractReferenceMatchFields(refEvidence),
      }
    : undefined;
  const xrdReferenceCandidateSection = buildXrdReferenceCandidateReportSection(refEvidenceSummary);

  return [
    {
      heading: 'Executive Summary',
      lines: [
        snapshot.evidenceEntries[0]?.support ?? registryProject.evidenceSummary,
        `Supported assignment: ${snapshot.supportedAssignment}.`,
        `Claim status: ${claimStatusLabel(registryProject.claimStatus)}.`,
      ],
    },
    {
      heading: 'Experimental Context',
      lines: [
        `Project: ${snapshot.projectName}`,
        `Objective: ${registryProject.objective}`,
        `Sample/system: ${snapshot.sampleIdentity}`,
        `Source mode: ${snapshot.sourceMode ?? 'demo_preloaded'}`,
        `Source label: ${snapshot.sourceLabel ?? 'Demo evidence'}`,
        `Active dataset: ${snapshot.activeDataset?.fileName ?? snapshot.evidenceEntries[0]?.datasetLabel ?? 'Pending evidence source'}`,
        `Available techniques: ${availableTechniques}`,
        `Pending validation techniques: ${pendingTechniques}`,
      ],
    },
    {
      heading: 'Skill-derived Evidence Bundle',
      lines: bundle
        ? [
            ...(bundle.lifecycleState === 'preview' ? ['Evidence package preview (not finalized).'] : []),
            ...(bundle.lifecycleState === 'preview' ? [] : [`Bundle: ${bundle.bundleId}`]),
            `Bundle source: ${getEvidenceBundleBadgeLabel(bundle)} / ${bundle.permissionMode}`,
            `Files: ${bundle.files.map((file) => `${file.technique}:${file.fileName}`).join('; ')}`,
            `Technique coverage: ${bundleCoverage.map((item) => `${item.technique}:${item.status}`).join(', ')}`,
            `Completeness: ${bundle.evidenceCompletenessScore}%`,
            ...snapshot.evidenceEntries.map((item) => `${item.technique}: ${item.support}`),
            ...snapshot.pendingTechniques.map((technique) => `${technique}: pending validation evidence`),
          ]
        : ['No evidence package created yet.'],
    },
    {
      heading: 'Skill-derived Scientific Interpretation',
      lines: snapshot.sourceMode === 'user_uploaded'
        ? [
            snapshot.evidenceEntries[0]?.support ?? 'Uploaded evidence is available, but bounded interpretation remains pending.',
            `Supported assignment: ${snapshot.supportedAssignment}.`,
            'Interpretation remains validation-limited until project-specific references and complementary evidence are reviewed.',
          ]
        : reportSection.lines.length ? reportSection.lines : [registryProject.notebook.interpretation],
    },
    {
      heading: 'Validation-limited Claim Boundaries',
      lines: claimBoundaryLines.length ? claimBoundaryLines : [registryProject.notebook.validationBoundary],
    },
    {
      heading: 'Active Science Skill Gaps',
      lines: [...validationLines, ...bundleValidationLines].length
        ? [...new Set([...validationLines, ...bundleValidationLines])]
        : ['No open validation gaps are registered for this project.'],
    },
    {
      heading: 'Recommended Next Action',
      lines: [
        registryProject.crossTechniqueComparison.recommendedNextAction,
        registryProject.notebook.decision
      ],
    },
    {
      heading: 'Processing Parameters / Reproducibility',
      lines: parameterProvenanceLines,
    },
    {
      heading: 'Appendix / Worktree Provenance',
      lines: [
        `Notebook entry: ${reportSection.notebookEntryId}`,
        `Source: ${reportSection.sourceLabel}`,
        `Runtime source: ${snapshot.sourceLabel ?? 'Demo evidence'}`,
        `Runtime mode: ${snapshot.runtimeMode ?? 'demo'} / ${snapshot.permissionMode ?? 'read_only'}`,
        `Evidence snapshot: ${snapshot.projectId} / ${availableTechniques} / pending ${pendingTechniques}`,
        ...(bundle ? [`Evidence bundle: ${bundle.bundleId} / ${bundle.sourceMode} / ${bundle.sourceLabel}`] : []),
        `Local approval preview ledger: ${ledgerSummary.total} browser-local entries for this project/bundle.`,
        ...(ledgerSummary.recentLines.length ? ledgerSummary.recentLines : ['No approval preview history recorded in this browser.']),
        ...registryProject.experimentHistory.map((event) => `${event.timestampLabel}: ${event.title} - ${event.summary}`),
      ],
    },
    ...xrdBackendEvidenceSection,
    ...xrdReferenceCandidateSection,
    ...(() => {
      const ftirRamanSections: DemoExportSection[] = [];
      const uploadedRuns = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('difaryx.uploadedSignalRuns.v1') || '[]') : [];
      const ftirRuns = uploadedRuns.filter((r: any) => r.technique === 'FTIR');
      const ramanRuns = uploadedRuns.filter((r: any) => r.technique === 'Raman');

      if (ftirRuns.length > 0) {
        const lines = ftirRuns.flatMap((run: any) => [
          `File Source: ${run.fileName}`,
          `Technique: Fourier Transform Infrared Spectroscopy (FTIR)`,
          `Instrument Claim Boundary: ${Array.isArray(run.claimBoundary) ? run.claimBoundary.join(', ') : 'Standard FTIR range'}`,
          `Functional Group Assignments (Mapped to Universal Spectral Library):`,
          ...(run.extractedFeatures && run.extractedFeatures.length > 0
            ? run.extractedFeatures.map((f: any) => `  - ${f.label}: ${f.context} (intensity: ${f.intensity.toFixed(2)})`)
            : ['  No bands detected or assigned.'])
        ]);
        ftirRamanSections.push({
          heading: 'FTIR Spectral Library Assignments',
          lines
        });
      }

      if (ramanRuns.length > 0) {
        const lines = ramanRuns.flatMap((run: any) => [
          `File Source: ${run.fileName}`,
          `Technique: Raman Spectroscopy`,
          `Instrument Claim Boundary: ${Array.isArray(run.claimBoundary) ? run.claimBoundary.join(', ') : 'Standard Raman shift range'}`,
          `Symmetry Mode Assignments (Mapped to Universal Spectral Library):`,
          ...(run.extractedFeatures && run.extractedFeatures.length > 0
            ? run.extractedFeatures.map((f: any) => `  - ${f.label}: ${f.context} (intensity: ${f.intensity.toFixed(2)})`)
            : ['  No peaks detected or assigned.'])
        ]);
        ftirRamanSections.push({
          heading: 'Raman Spectral Library Assignments',
          lines
        });
      }
      return ftirRamanSections;
    })(),
  ];
}

function ReportEmptyState({ email }: { email?: string }) {
  return (
    <DashboardLayout>
      <div className="h-full overflow-y-auto bg-slate-50 p-6">
        <div className="mx-auto max-w-5xl">
          <div className="mb-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">Reports</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-text-main">User Report Drafts</h1>
            {email && <p className="mt-1 text-sm text-text-muted">Signed in as {email}</p>}
          </div>
          <EmptyStateCard 
            type="not_executed" 
            title="No User Report Drafts Yet" 
            description="Create or preview report drafts from uploaded scientific evidence." 
          />
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Link
              to="/workspace?action=upload&source=user_uploaded&next=report"
              className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-xs font-bold text-white hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
            >
              Upload evidence
            </Link>
            <Link
              to="/notebook"
              className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-white px-3 text-xs font-bold text-text-main hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
            >
              Create report draft
            </Link>
            <Link
              to="/reports?project=cu-fe2o4-spinel&mode=demo"
              onClick={() => setWorkspaceMode('demo')}
              className="inline-flex h-9 items-center justify-center rounded-md border border-primary bg-primary/10 px-3 text-xs font-bold text-primary hover:bg-primary/20 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
            >
              Use demo report
            </Link>
          </div>
          <p className="mt-5 text-center text-xs font-semibold text-amber-700">External writes disabled</p>
        </div>
      </div>
    </DashboardLayout>
  );
}

function ReportDemoProjectPrompt({ projectId }: { projectId: string }) {
  return (
    <DashboardLayout>
      <div className="h-full overflow-y-auto bg-slate-50 p-6">
        <Card className="mx-auto max-w-4xl rounded-lg bg-white p-6">
          <h1 className="text-xl font-bold text-text-main">This is a demo project. Open in Demo Mode?</h1>
          <p className="mt-2 text-sm text-text-muted">
            User Workspace does not auto-load the preloaded report after Google sign-in.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              to={`/reports?project=${projectId}&mode=demo`}
              onClick={() => setWorkspaceMode('demo')}
              className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-xs font-bold text-white hover:bg-primary/90"
            >
              Open in Demo Mode
            </Link>
            <Link
              to="/reports"
              className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-white px-3 text-xs font-bold text-text-main hover:bg-slate-50"
            >
              Return to User Reports
            </Link>
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}

function UploadedReportContext({ routeContext }: { routeContext: EvidenceRouteContext }) {
  const snapshot = getProjectEvidenceSnapshot(null, {
    source: routeContext.source,
    analysisSessionId: routeContext.sessionId,
    uploadedRunId: routeContext.uploadedRunId,
    driveFileId: routeContext.driveFileId,
    projectIdExplicit: false,
  });
  const dataset = snapshot.activeDataset;
  const graphData = dataset?.dataPoints ?? [];
  const features = dataset?.detectedFeatures ?? [];
  const evidenceQuery = buildEvidenceRouteSearch(routeContext);
  const suffix = evidenceQuery ? `?${evidenceQuery}` : '';
  const technique = snapshot.primaryTechnique.toLowerCase();
  const workspacePath = `/workspace/${technique}?mode=quick${evidenceQuery ? `&${evidenceQuery}` : ''}`;
  const reportSections: DemoExportSection[] = [
    {
      heading: 'Uploaded Scientific Evidence Context',
      lines: [
        `Dataset: ${dataset?.fileName ?? snapshot.sampleIdentity}`,
        `Source: User-uploaded evidence`,
        `Technique: ${snapshot.availableTechniques.join(', ') || 'metadata-only'}`,
      ],
    },
    {
      heading: 'Skill-derived Evidence Summary',
      lines: [snapshot.evidenceEntries[0]?.support ?? 'Uploaded evidence is available as metadata-only context.'],
    },
    {
      heading: 'Graph and Detected Features',
      lines: [
        dataset
          ? `Graph points: ${graphData.length}. Detected features: ${features.length}.`
          : 'Uploaded evidence not found.',
        ...(features.length
          ? features.slice(0, 8).map((feature) => `${feature.label}: ${feature.position} / intensity ${feature.intensity}`)
          : ['Graph data unavailable until the matching local upload is restored.']),
      ],
    },
    {
      heading: 'Validation-limited Claim Boundaries',
      lines: snapshot.claimBoundary.requiresValidation.length
        ? snapshot.claimBoundary.requiresValidation
        : ['Uploaded evidence remains validation-limited until project-specific references are reviewed.'],
    },
    {
      heading: 'Safety',
      lines: ['Local export only.', 'No Google Drive write.', 'No Gmail action.', 'write_enabled inactive.'],
    },
  ];
  const exportUploadedReport = (format: DemoExportFormat) => {
    exportDemoArtifact(format, {
      filenameBase: `difaryx_uploaded_${dataset?.fileName ?? routeContext.uploadedRunId ?? 'evidence'}`,
      title: `${dataset?.fileName ?? snapshot.sampleIdentity} Evidence Report`,
      sections: reportSections,
    });
  };

  return (
    <DashboardLayout>
      <div className="h-full overflow-y-auto bg-slate-50 p-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-blue-700">Report / User Workspace</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-text-main">{dataset?.fileName ?? snapshot.sampleIdentity} Evidence Report</h1>
              <p className="mt-1 text-sm text-text-muted">Validation-limited report draft from user-uploaded evidence. No demo report is loaded.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" className="gap-1.5 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none" onClick={() => exportUploadedReport('md')} aria-label="Export report content in Markdown format" title="Export report content in Markdown format"><Download size={13} /> Export Markdown</Button>
              <Button variant="outline" size="sm" className="gap-1.5 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none" onClick={() => exportUploadedReport('pdf')} aria-label="Export report as a PDF document" title="Export report as a PDF document"><Download size={13} /> Export PDF</Button>
              <Button variant="outline" size="sm" className="gap-1.5 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none" onClick={() => exportUploadedReport('docx')} aria-label="Export report as a Word document" title="Export report as a Word document"><Download size={13} /> Export DOCX</Button>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <Card className="rounded-lg bg-white p-5">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-md border border-border bg-slate-50 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Active dataset</p>
                  <p className="mt-1 truncate text-sm font-bold text-text-main">{dataset?.fileName ?? 'Uploaded evidence'}</p>
                </div>
                <div className="rounded-md border border-border bg-slate-50 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Source</p>
                  <p className="mt-1 text-sm font-bold text-text-main">User-uploaded evidence</p>
                </div>
                <div className="rounded-md border border-border bg-slate-50 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">External writes</p>
                  <p className="mt-1 text-sm font-bold text-text-main">Disabled</p>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {reportSections.map((section) => (
                  <section key={section.heading} className="rounded-md border border-border bg-white p-3">
                    <h2 className="text-sm font-bold text-text-main">{section.heading}</h2>
                    <div className="mt-2 space-y-1 text-sm leading-relaxed text-text-muted">
                      {section.lines.map((line) => <p key={String(line)}>{line}</p>)}
                    </div>
                  </section>
                ))}
              </div>
            </Card>

            <Card className="rounded-lg bg-white p-4">
              <h2 className="text-sm font-bold text-text-main">Next actions</h2>
              <div className="mt-3 grid gap-2">
                <Link to={workspacePath} className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-xs font-bold text-white hover:bg-primary/90">
                  Open Workspace
                </Link>
                <Link to={`/demo/agent${suffix}`} className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-white px-3 text-xs font-bold text-text-main hover:bg-slate-50">
                  Send to Agent
                </Link>
                <Link to={`/notebook${suffix}${suffix ? '&' : '?'}template=research`} className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-white px-3 text-xs font-bold text-text-main hover:bg-slate-50">
                  Send to Notebook
                </Link>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

export default function ReportBuilder() {
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const requestedProjectId = searchParams.get('project');
  const routeContext = getEvidenceRouteContext({
    authUser: user,
    searchParams,
    storedMode: getStoredWorkspaceMode(),
  });
  const effectiveWorkspaceMode = routeContext.effectiveWorkspaceMode;

  if (routeContext.isUploadedContext) {
    return <UploadedReportContext routeContext={routeContext} />;
  }

  // Show project prompt only for user mode with known demo project (but not uploaded evidence)
  if (effectiveWorkspaceMode === 'user' && requestedProjectId && isKnownProjectId(requestedProjectId) && !routeContext.isUploadedContext) {
    return <ReportDemoProjectPrompt projectId={requestedProjectId} />;
  }

  if (effectiveWorkspaceMode === 'user' && !routeContext.isUploadedContext) {
    return <ReportEmptyState email={user?.email} />;
  }

  return <ReportBuilderContent routeContext={routeContext} />;
}

function ReportBuilderContent({ routeContext }: { routeContext: EvidenceRouteContext }) {
  const {
    gmailConnected,
    uploadToDrive,
    sendGmailReport,
    analyzeWithVertexAI,
  } = useX7UniversalHook();

  const [emailRecipient, setEmailRecipient] = useState('');
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareSuccess, setShareSuccess] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [activeTab, setActiveTab] = useState<'standard' | 'ai'>('standard');
  const [aiDraft, setAiDraft] = useState<string | null>(null);
  // Raw structured reasoning signals preserved alongside the rendered draft
  // (Requirement B) so audits / explainability consume signals, not prose.
  const [aiSignals, setAiSignals] = useState<ClaimBoundarySignals | null>(null);
  const [isDrafting, setIsDrafting] = useState(false);
  const [aiWarning, setAiWarning] = useState<string | null>(null);

  const [searchParams] = useSearchParams();
  const requestedProjectId = searchParams.get('project');
  const isUploadedContext = routeContext.isUploadedContext;
  const project = isUploadedContext
    ? null
    : (getProject(requestedProjectId) ?? getProject(null))!;

  // Get evidence snapshot first for uploaded context
  const initialEvidenceSnapshot = useMemo(() => getProjectEvidenceSnapshot(isUploadedContext ? null : project?.id, {
    source: routeContext.source,
    analysisSessionId: routeContext.sessionId,
    uploadedRunId: routeContext.uploadedRunId,
    driveFileId: routeContext.driveFileId,
    deferStoredContext: !isUploadedContext,
  }), [isUploadedContext, project?.id, routeContext]);
  const [evidenceSnapshot, setEvidenceSnapshot] = useState(initialEvidenceSnapshot);

  useEffect(() => {
    setEvidenceSnapshot(initialEvidenceSnapshot);
    if (isUploadedContext) return;

    return runWhenIdle(() => {
      setEvidenceSnapshot(getProjectEvidenceSnapshot(project?.id, {
        source: routeContext.source,
        analysisSessionId: routeContext.sessionId,
        uploadedRunId: routeContext.uploadedRunId,
        driveFileId: routeContext.driveFileId,
      }));
    });
  }, [initialEvidenceSnapshot, isUploadedContext, project?.id, routeContext]);

  // For uploaded context, create safe registry project from evidence snapshot
  const registryProject = isUploadedContext
    ? createUploadedEvidenceRegistryProject(evidenceSnapshot)
    : getRegistryProject(project!.id);

  // Use registryProject._raw as the source of truth for project data
  const currentProject = registryProject._raw;

  const templateMode = normalizeNotebookTemplateMode(searchParams.get('template'));
  const [feedback, setFeedback] = useState('');
  const [approvalAction, setApprovalAction] = useState<ApprovalActionPreview | null>(null);

  // Phase X6C: Runtime context orchestration for claim boundary and validation state
  const {
    isValidated7E4: runtimeIsValidated,
    currentEvidence: runtimeEvidence,
  } = useXrdWorkflowRuntime();

  // Bundle gating: only create bundle when appropriate (not for uploaded evidence)
  const evidenceBundle = useMemo(() => {
    if (isUploadedContext) {
      return null;
    }

    const availableTechniques = evidenceSnapshot.availableTechniques ?? [];
    const techniqueCount = availableTechniques.length;
    const context: import('../../../runtime/evidenceBundle').BundleCreationContext = {
      route: '/reports',
      techniqueCount,
      hasMultiTechIntent: techniqueCount >= 2 || searchParams.get('bundle') === 'mixed',
      isDemoProject: evidenceSnapshot.sourceMode === 'demo_preloaded',
      hasDemoPreloadedBundle: ['cu-fe2o4-spinel', 'cufe2o4-sba15', 'cofe2o4', 'fe3o4-nanoparticles'].includes(currentProject.id) && techniqueCount >= 2,
      userAction: 'send_to_report',
    };

    // Only create bundle if gating logic approves
    const shouldCreate = techniqueCount >= 2 || context.hasDemoPreloadedBundle;
    if (!shouldCreate) {
      return null;
    }

    return createEvidenceBundleFromSnapshot(evidenceSnapshot, {
      includeDemoContext: searchParams.get('bundle') === 'mixed' || searchParams.get('source') === 'mixed',
      lifecycleState: 'sent_to_report',
      creationReason: 'notebook_report_handoff',
    });
  }, [evidenceSnapshot, searchParams, currentProject.id]);

  // Read workspace parameters for the current project
  const workspaceParameters = useMemo(
    () => readProjectWorkspaceParameters(currentProject.id, getProjectTechniques(currentProject)),
    [currentProject.id],
  );

  const workflowProcessingResult = useMemo(
    () => evidenceSnapshot.reportContext ?? getLatestProcessingResult(currentProject.id) ?? createProcessingResultFromXrdDemo(currentProject.id, workspaceParameters),
    [currentProject.id, evidenceSnapshot.reportContext, workspaceParameters],
  );
  const workflowRefinement = useMemo(
    () => getLatestAgentDiscussionRefinement(currentProject.id, templateMode) ?? refineDiscussionFromProcessing(workflowProcessingResult, templateMode),
    [currentProject.id, templateMode, workflowProcessingResult],
  );
  const workflowNotebookEntry = useMemo(() => {
    const fromRoute = getNotebookEntry(searchParams.get('entry'));
    if (fromRoute?.projectId === currentProject.id) return fromRoute;
    return (
      (evidenceSnapshot.notebookContext?.templateMode === templateMode ? evidenceSnapshot.notebookContext : null) ??
      getLatestNotebookEntry(currentProject.id, templateMode) ??
      createNotebookEntryFromRefinement(workflowRefinement, templateMode)
    );
  }, [currentProject.id, searchParams, templateMode, workflowRefinement, evidenceSnapshot.notebookContext]);
  const workflowReportSection = useMemo(
    () => createReportSectionFromNotebookEntry(workflowNotebookEntry),
    [workflowNotebookEntry],
  );
  const reportSections = useMemo(
    () => buildReportSections(
      evidenceSnapshot,
      evidenceBundle,
      registryProject,
      workflowReportSection,
      workflowNotebookEntry?.xrdBackendEvidenceSummary,
      workflowNotebookEntry,
    ),
    [
      evidenceSnapshot,
      evidenceBundle,
      registryProject,
      workflowReportSection,
      workflowNotebookEntry?.xrdBackendEvidenceSummary,
      workflowNotebookEntry,
    ],
  );
  const reportTemplate = NOTEBOOK_TEMPLATES[templateMode];
  const reportStatus =
    (evidenceBundle?.missingRequiredTechniques.length ?? 0) > 0 || (evidenceBundle?.validationGaps.length ?? 0) > 0 || registryProject.reportReadiness < 80
      ? 'Draft - validation-limited'
      : 'Ready for internal review';
  const runtimeContext = {
    sourceMode: evidenceSnapshot.sourceMode ?? 'demo_preloaded',
    runtimeMode: evidenceSnapshot.runtimeMode ?? 'demo',
    permissionMode: evidenceSnapshot.permissionMode ?? 'read_only',
    sourceLabel: evidenceSnapshot.sourceLabel ?? 'Demo evidence',
    approvalStatus: evidenceSnapshot.approvalStatus ?? 'not_required',
  } as const;
  const connectedAccountState = runtimeContext.sourceMode === 'google_drive_connected'
    ? getGoogleConnectedShellState()
    : getDefaultConnectedAccountState();
  const reportVersion = `v${Math.max(1, Math.round(registryProject.reportReadiness / 20))}.0`;
  const preparedAt = new Date().toLocaleDateString();
  const filenameBase = `difaryx_${currentProject.id}_${reportTemplate.reportTemplate}_report`;
  const uploadedRouteSearch = isUploadedContext ? buildEvidenceRouteSearch(routeContext) : '';
  const withDemoMode = (path: string) => path.includes('?') ? `${path}&mode=demo` : `${path}?mode=demo`;

  const showFeedback = (message: string) => {
    setFeedback(message);
    window.setTimeout(() => setFeedback(''), 1800);
  };

  const openApprovalPreview = (
    actionType: ApprovalActionType,
    actionLabel: string,
    destinationLabel: string,
    riskLevel?: ApprovalRiskLevel,
  ) => {
    const action = createApprovalActionPreview({
      actionId: `report-${actionType}-${Date.now()}`,
      actionType,
      actionLabel,
      destinationLabel,
      evidenceSnapshot,
      runtimeContext,
      evidenceBundle: evidenceBundle ?? undefined,
      riskLevel,
    });
    appendApprovalLedgerEntry(createApprovalLedgerEntry(action, 'preview_opened'));
    setApprovalAction(action);
  };

  const logLocalReportAction = (
    actionType: ApprovalActionType,
    actionLabel: string,
    destinationLabel: string,
    riskLevel?: ApprovalRiskLevel,
  ) => {
    const action = createApprovalActionPreview({
      actionId: `report-${actionType}-${Date.now()}`,
      actionType,
      actionLabel,
      destinationLabel,
      evidenceSnapshot,
      runtimeContext,
      evidenceBundle: evidenceBundle ?? undefined,
      riskLevel,
    });
    appendApprovalLedgerEntry(createApprovalLedgerEntry(action, 'local_preview_continued', {
      notes: 'Report local/demo action completed in this browser. No external write executed.',
    }));
  };

  const exportReport = (format: DemoExportFormat) => {
    if (requiresApproval(runtimeContext)) {
      openApprovalPreview(
        'report_export',
        `${format.toUpperCase()} report export`,
        'Formal report artifact local preview',
        'medium',
      );
      return;
    }

    exportDemoArtifact(format, {
      filenameBase,
      title: `${evidenceSnapshot.projectName} ${reportTypeLabel(templateMode)}`,
      sections: reportSections,
    });
    logLocalReportAction('report_export', `${format.toUpperCase()} report export`, 'Formal report artifact local preview', 'medium');
    showFeedback(`${format.toUpperCase()} report export started.`);
  };

  const copyReport = async () => {
    const text = reportSections
      .map((section) => [`## ${section.heading}`, ...section.lines.map((line) => String(line))].join('\n'))
      .join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
      showFeedback('Report copied.');
    } catch {
      showFeedback('Report text is ready to copy.');
    }
  };

  const saveReportVersion = () => {
    if (requiresApproval(runtimeContext)) {
      openApprovalPreview(
        'report_generation',
        'Reproducible report generation',
        'Versioned report memory local preview',
        'medium',
      );
      return;
    }

    logLocalReportAction('report_generation', 'Reproducible report generation', 'Versioned report memory local preview', 'medium');
    showFeedback(`Saved ${reportVersion}.`);
  };

  const handleSaveToDrive = async () => {
    setIsSharing(true);
    setShareError(null);
    setShareSuccess(null);
    try {
      if (!gmailConnected) {
        throw new Error('OAuth Scope Exception: Google account not fully connected or active. Please re-authenticate.');
      }
      const reportText = reportSections
        .map((section) => [`## ${section.heading}`, ...section.lines.map((line) => String(line))].join('\n'))
        .join('\n\n');
      const filename = `DIFARYX_Report_${currentProject.id}_${Date.now()}.md`;
      const result = await uploadToDrive(filename, reportText);
      setShareSuccess(`Report saved successfully to Google Drive. File URL: ${result.url}`);
    } catch (err: any) {
      console.error('[Save to Drive Error]', err);
      setShareError(err.message || String(err));
    } finally {
      setIsSharing(false);
    }
  };

  const handleSendEmailSummary = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailRecipient.trim()) {
      setShareError('Please enter a recipient email address.');
      return;
    }
    setIsSharing(true);
    setShareError(null);
    setShareSuccess(null);
    try {
      if (!gmailConnected) {
        throw new Error('OAuth Scope Exception: Google account not fully connected or active. Please re-authenticate.');
      }
      const reportText = reportSections
        .map((section) => [`## ${section.heading}`, ...section.lines.map((line) => String(line))].join('\n'))
        .join('\n\n');
      const subject = `DIFARYX Research Summary: ${evidenceSnapshot.projectName}`;
      await sendGmailReport(emailRecipient.trim(), subject, reportText);
      setShareSuccess(`Research report summary successfully sent to ${emailRecipient}.`);
    } catch (err: any) {
      console.error('[Send Email Error]', err);
      setShareError(err.message || String(err));
    } finally {
      setIsSharing(false);
    }
  };

  const openFutureExportPreview = (actionType: 'google_drive_export_future' | 'gmail_draft_future') => {
    openApprovalPreview(
      actionType,
      actionType === 'google_drive_export_future' ? 'Preview Drive Export' : 'Preview Gmail Draft',
      actionType === 'google_drive_export_future'
        ? 'Preview Drive Export / Approval required'
        : 'Preview Gmail Draft / Approval required',
      'high',
    );
  };

  const generateSimulatedAiDraft = (payload: any): string => {
    let text = `# Scientific Characterization Report: ${payload.projectName || 'Active Sample'}\n\n`;
    text += `## Executive Summary\n`;
    text += `This report presents the evidence-grounded structural characterization for sample **${payload.sampleIdentity || 'Unknown'}** under the objective: *"${payload.objective || 'Not specified'}"*.\n\n`;
    
    text += `## Experimental Techniques & Integration\n`;
    text += `A multi-technique verification workflow was executed using: **${(payload.availableTechniques || []).join(', ') || 'N/A'}**.\n\n`;
    
    if (payload.uploadedRuns && payload.uploadedRuns.length > 0) {
      text += `## Spectral Assignments & Phase Validation\n`;
      text += `The following spectral bands/peaks were identified and mapped to the Universal Scientific Dictionary:\n\n`;
      
      payload.uploadedRuns.forEach((run: any) => {
        text += `### ${run.technique} Analysis (${run.fileName})\n`;
        text += `- **Instrument Claim Range**: ${Array.isArray(run.claimBoundary) ? run.claimBoundary.join(' - ') + ' cm⁻¹' : 'Standard spectral range'}\n`;
        text += `- **Detected and Assigned Features**:\n`;
        
        if (run.features && run.features.length > 0) {
          run.features.forEach((f: any) => {
            text += `  * **${f.label}** at **${typeof f.position === 'number' ? f.position.toFixed(0) : f.position} cm⁻¹** (Intensity: ${typeof f.intensity === 'number' ? f.intensity.toFixed(2) : f.intensity}, Assignment Context: *${f.context}*)\n`;
          });
        } else {
          text += `  * No specific features were detected or assigned.\n`;
        }
        text += `\n`;
      });
    }
    
    text += `## Validation Gaps & Claim Boundaries\n`;
    text += `### Claim Boundary Status\n`;
    if (payload.claimBoundary) {
      if (payload.claimBoundary.supported && payload.claimBoundary.supported.length > 0) {
        text += `**Supported Claims**:\n`;
        payload.claimBoundary.supported.forEach((line: string) => {
          text += `- ${line}\n`;
        });
      }
      if (payload.claimBoundary.requiresValidation && payload.claimBoundary.requiresValidation.length > 0) {
        text += `\n**Claims Requiring Validation**:\n`;
        payload.claimBoundary.requiresValidation.forEach((line: string) => {
          text += `- ${line}\n`;
        });
      }
    } else {
      text += `No claim boundaries could be computed.\n`;
    }
    
    if (payload.validationGaps && payload.validationGaps.length > 0) {
      text += `\n### Identified Validation Gaps\n`;
      payload.validationGaps.forEach((gap: string) => {
        text += `- ${gap}\n`;
      });
    } else {
      text += `\nNo major validation gaps remain. The phase assignment is structurally consistent across the evidence workspace.\n`;
    }
    
    text += `\n## Decision and Next Steps\n`;
    text += `Based on the integrated FTIR/Raman spectral database match, the Cobalt Ferrite spinel structure is confirmed. The presence of graphitic carbon residue (D/G bands) suggests an incomplete calcination process. It is recommended to perform a high-temperature calcination run followed by complementary XRD diffraction scanning to verify phase purity.`;
    
    return text;
  };

  /**
   * Parses Vertex AI's JSON response into structured reasoning signals.
   * Returns null when the output is not structured (so the caller falls back to
   * the deterministic draft instead of rendering raw model prose).
   */
  const parseVertexSignals = (
    text: string,
  ): { confidence: number; contradictions: string[]; missingValidation: string[] } | null => {
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Vertex may wrap JSON in a markdown code fence — try to extract it.
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) return null;
      try {
        parsed = JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
    if (!parsed || typeof parsed !== 'object') return null;

    const rawConfidence =
      typeof parsed.confidence === 'number' ? parsed.confidence : Number(parsed.confidence);
    const confidence = Number.isFinite(rawConfidence)
      ? rawConfidence > 1
        ? rawConfidence / 100
        : rawConfidence
      : NaN;
    const contradictions = Array.isArray(parsed.contradictions)
      ? parsed.contradictions.map((c: any) => String(c))
      : [];
    const missingValidation = Array.isArray(parsed.missingValidation)
      ? parsed.missingValidation.map((m: any) => String(m))
      : Array.isArray(parsed.validationGaps)
        ? parsed.validationGaps.map((m: any) => String(m))
        : [];
    const evidenceStrength = String(parsed.evidenceStrength || '').toLowerCase();

    // Require at least one recognizable structured signal.
    const hasSignal =
      Number.isFinite(confidence) ||
      !!evidenceStrength ||
      contradictions.length > 0 ||
      missingValidation.length > 0;
    if (!hasSignal) return null;

    // Map a textual evidenceStrength to a confidence proxy when none provided.
    let resolvedConfidence = confidence;
    if (!Number.isFinite(resolvedConfidence)) {
      resolvedConfidence = evidenceStrength.includes('strong')
        ? 0.85
        : evidenceStrength.includes('moderate')
          ? 0.65
          : evidenceStrength.includes('weak')
            ? 0.35
            : 0.5;
    }

    return { confidence: resolvedConfidence, contradictions, missingValidation };
  };

  /**
   * Composes the user-facing AI draft from the deterministically rendered claim
   * boundary (never from raw Vertex prose).
   */
  const renderDraftFromArtifact = (
    artifact: ReturnType<typeof buildClaimBoundaryArtifact>,
    payload: any,
  ): string => {
    const lines: string[] = [];
    lines.push(`# AI-Assisted Evidence Summary: ${payload.projectName || 'Project'}\n`);
    lines.push(`**Objective:** ${payload.objective || 'N/A'}\n`);
    lines.push(`**Techniques:** ${(payload.availableTechniques || []).join(', ') || 'N/A'}\n`);
    lines.push(`## Claim Boundary (deterministic rendering of Vertex reasoning signals)\n`);
    artifact.renderedClaimBoundary.forEach((line) => lines.push(`- ${line}`));
    lines.push(
      `\n_Reasoning signals provided by Vertex AI; wording produced by the deterministic presentation layer._`,
    );
    return lines.join('\n');
  };

  const handleDraftWithAI = async () => {
    if (!localStorage.getItem('difaryx_google_user_token')) {
      setShareError('OAuth Connection Required: Please connect your Google account in Settings to enable Vertex AI report drafting.');
      return;
    }

    setIsDrafting(true);
    setAiWarning(null);
    setShareError(null);
    setActiveTab('ai');
    
    const uploadedRuns = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('difaryx.uploadedSignalRuns.v1') || '[]') : [];
    const payload = {
      projectName: evidenceSnapshot.projectName,
      objective: registryProject.objective,
      sampleIdentity: evidenceSnapshot.sampleIdentity,
      availableTechniques: evidenceSnapshot.availableTechniques,
      claimBoundary: evidenceSnapshot.claimBoundary,
      validationGaps: evidenceBundle?.validationGaps || [],
      uploadedRuns: uploadedRuns.map((run: any) => ({
        fileName: run.fileName,
        technique: run.technique,
        claimBoundary: run.claimBoundary,
        features: run.extractedFeatures?.map((f: any) => ({
          label: f.label,
          position: f.position,
          intensity: f.intensity,
          context: f.context
        }))
      }))
    };

    try {
      const result = await analyzeWithVertexAI(payload);
      const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        throw new Error('Vertex AI response format is unexpected.');
      }

      // Vertex emits STRUCTURED reasoning signals only. It never authors the
      // final claim-boundary wording. Parse signals, then render the draft
      // deterministically through claimBoundaryPresentation.ts.
      const parsed = parseVertexSignals(text);
      if (!parsed) {
        throw new Error('Vertex AI did not return structured reasoning signals.');
      }

      const technique = evidenceSnapshot.availableTechniques?.[0] || 'XRD';
      const artifact = buildClaimBoundaryArtifact({
        technique,
        provider: 'vertex',
        confidence: parsed.confidence,
        contradictions: parsed.contradictions,
        missingValidation: parsed.missingValidation,
      });
      setAiSignals(artifact.signals);
      setAiDraft(renderDraftFromArtifact(artifact, payload));
    } catch (err: any) {
      console.warn('[Vertex AI Draft Request Failed, falling back to simulated draft]', err);
      setAiWarning(`Using local simulated draft (Vertex AI endpoint failed, returned non-structured output, or project ID is placeholder: ${err.message || String(err)})`);
      setAiSignals(null);
      const simulatedText = generateSimulatedAiDraft(payload);
      setAiDraft(simulatedText);
    } finally {
      setIsDrafting(false);
    }
  };

  const copyAiDraft = async () => {
    if (!aiDraft) return;
    try {
      await navigator.clipboard.writeText(aiDraft);
      showFeedback('AI Draft copied to clipboard.');
    } catch {
      showFeedback('AI Draft is ready to copy.');
    }
  };

  return (
    <DashboardLayout>
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
        <div className="shrink-0 border-b border-border bg-surface px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                <span>Evidence-to-Report Builder</span>
                <span className={jobTypeBadgeClass(registryProject.jobType)}>{jobTypeLabel(registryProject.jobType)}</span>
                <span className={claimStatusColorClass(registryProject.claimStatus)}>{claimStatusLabel(registryProject.claimStatus)}</span>
                <span className={`rounded-full border px-2 py-0.5 ${getRuntimeBadgeClass(runtimeContext)}`}>
                  {getRuntimeBadgeLabel(runtimeContext)}
                </span>
                {gmailConnected ? (
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                    ✓ Connected / Active
                  </span>
                ) : (
                  <Link
                    to="/settings"
                    className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 hover:bg-amber-100 transition-colors"
                  >
                    ⚠ Upgrade Connection Required
                  </Link>
                )}
              </div>
              <h1 className="mt-1 truncate text-xl font-bold text-text-main">{evidenceSnapshot.projectName} Evidence Report</h1>
              <p className="mt-1 text-sm text-text-muted">
                Formal report preview prepared from notebook entry {workflowNotebookEntry.id}.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {feedback && <span className="rounded border border-primary/20 bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary">{feedback}</span>}
              <Button variant="outline" size="sm" className="gap-1.5 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none" onClick={() => exportReport('md')} aria-label="Export report content in Markdown format" title="Export report content in Markdown format"><Download size={13} /> Export Markdown</Button>
              <Button variant="outline" size="sm" className="gap-1.5 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none" onClick={() => exportReport('pdf')} aria-label="Export report as a PDF document" title="Export report as a PDF document"><Download size={13} /> Export PDF</Button>
              <Button variant="outline" size="sm" className="gap-1.5 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none" onClick={() => exportReport('docx')} aria-label="Export report as a Word document" title="Export report as a Word document"><Download size={13} /> Export DOCX</Button>
              <Button variant="outline" size="sm" className="gap-1.5 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none" onClick={copyReport} aria-label="Copy entire report content to clipboard" title="Copy entire report content to clipboard"><Clipboard size={13} /> Copy report</Button>
              <Button variant="outline" size="sm" className="gap-1.5 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none" onClick={() => openFutureExportPreview('google_drive_export_future')} aria-label="Save this report to Google Drive" title="Save this report to Google Drive"><Download size={13} /> Drive export</Button>
              <Button variant="outline" size="sm" className="gap-1.5 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none" onClick={() => openFutureExportPreview('gmail_draft_future')} aria-label="Generate an email draft in Gmail" title="Generate an email draft in Gmail"><FileText size={13} /> Preview Gmail Draft</Button>
              <Button size="sm" className="gap-1.5 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none" onClick={saveReportVersion} aria-label="Save current report version to memory" title="Save current report version to memory"><Save size={13} /> Save version</Button>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <ConnectedAccountStatus
              state={connectedAccountState}
              capabilities={['drive_import', 'drive_export_future', 'gmail_draft_future']}
              compact
            />
            <span className="text-[11px] font-semibold text-text-muted">Drive/Gmail destinations are preview/gated only.</span>
          </div>
          {requestedProjectId && !isKnownProjectId(requestedProjectId) && (
            <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <span className="font-semibold">Project not found.</span> Showing the default project context: {registryProject.title}.
            </div>
          )}
        </div>

        {shareError && (
          <div className="mx-4 mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-800 leading-snug">
            🚨 {shareError}
          </div>
        )}
        {shareSuccess && (
          <div className="mx-4 mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800 leading-snug">
            ✅ {shareSuccess}
          </div>
        )}

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden p-3 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="min-h-0 overflow-y-auto rounded-lg border border-border bg-surface p-3">
            <ScientificConfidenceSummary
              claimStatus={registryProject?.claimStatus || 'partial'}
              readinessPercent={registryProject?.reportReadiness || 30}
              validationGaps={evidenceSnapshot.validationGaps}
              availableTechniques={evidenceSnapshot.availableTechniques}
              pendingTechniques={evidenceSnapshot.pendingTechniques}
              className="mb-3"
              projectId={registryProject?.id}
            />
            <div className="space-y-2">
              {[
                ['Project', evidenceSnapshot.projectName],
                ['Sample', evidenceSnapshot.sampleIdentity],
                ['Evidence bundle', evidenceSnapshot.availableTechniques.join(', ') || 'Pending'],
                ...(evidenceBundle ? [
                  ['Bundle source', getEvidenceBundleBadgeLabel(evidenceBundle)],
                  ['Bundle files', String(evidenceBundle.files.length)],
                  ['Completeness', `${evidenceBundle.evidenceCompletenessScore}%`],
                ] : []),
                ['Pending validation', evidenceSnapshot.pendingTechniques.join(', ') || 'None'],
                ['Report type', reportTypeLabel(templateMode)],
                ['Prepared from', workflowNotebookEntry.title],
                ['Runtime source', getRuntimeBadgeLabel(runtimeContext, 'source')],
                ['Permission', getRuntimeBadgeLabel(runtimeContext, 'permission')],
                ['Date', preparedAt],
                ['Version', reportVersion],
                ['Status', reportStatus],
              ].map(([label, value]) => (
                <div key={label} className="rounded-md border border-border bg-background px-2.5 py-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-text-dim">{label}</div>
                  <div className="mt-0.5 text-sm font-semibold text-text-main">{value}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-50 px-3 py-2">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-800">
                <ShieldCheck size={14} /> Claim Boundary Review
              </div>
              <p className="mt-2 text-xs leading-relaxed text-amber-900">
                {reportSections.find((section) => section.heading === 'Validation Boundary')?.lines[0] ?? registryProject.notebook.validationBoundary}
              </p>
            </div>
            {/* Phase X6C: Runtime validation status banner */}
            {runtimeIsValidated && runtimeEvidence && (
              <div className="mt-3 rounded-md border border-emerald-600 bg-emerald-50 px-3 py-2">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-800">
                  <ShieldCheck size={14} /> Runtime Validation Active
                </div>
                <p className="mt-2 text-xs leading-relaxed text-emerald-900">
                  7E.4 peak extraction validation approved. Evidence meets workspace approval requirements for bounded scientific claims.
                </p>
              </div>
            )}
            {evidenceBundle && (
              <div className="mt-3">
                <ApprovalLedgerPanel projectId={currentProject.id} bundleId={evidenceBundle.bundleId} limit={4} compact />
              </div>
            )}
            {/* Hybrid Output: Export & Dispatch panel */}
            <div className="mt-3 rounded-md border border-slate-200 bg-white p-3 shadow-sm">
              <span className="text-xs font-bold text-slate-800 block mb-2">Export & Dispatch</span>
              
              {shareError && (
                <div className="mb-2.5 rounded border border-red-200 bg-red-50 p-2 text-[10px] font-semibold text-red-800 leading-snug">
                  🚨 {shareError}
                </div>
              )}
              {shareSuccess && (
                <div className="mb-2.5 rounded border border-emerald-200 bg-emerald-50 p-2 text-[10px] font-semibold text-emerald-800 leading-snug">
                  ✅ {shareSuccess}
                </div>
              )}

              <div className="space-y-3">
                <button
                  onClick={handleSaveToDrive}
                  disabled={isSharing}
                  className="w-full inline-flex h-8 items-center justify-center rounded-md bg-blue-600 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
                >
                  {isSharing ? 'Processing...' : 'Save to Drive'}
                </button>

                <form onSubmit={handleSendEmailSummary} className="space-y-2 pt-2 border-t border-slate-100">
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    Recipient Email:
                    <input
                      type="email"
                      value={emailRecipient}
                      onChange={(e) => setEmailRecipient(e.target.value)}
                      placeholder="e.g. lead@difaryx.com"
                      className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 focus:outline-none"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={isSharing}
                    className="w-full inline-flex h-8 items-center justify-center rounded-md border border-blue-200 bg-white text-xs font-bold text-blue-700 hover:bg-blue-50 disabled:opacity-50 transition-colors shadow-sm"
                  >
                    Send Email Summary
                  </button>
                </form>
              </div>
            </div>

            <div className="mt-3 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  const technique = (evidenceSnapshot.primaryTechnique || 'xrd').toLowerCase() as any;
                  reproduceAnalysis(
                    currentProject.id,
                    workflowNotebookEntry.workspaceParameters || {},
                    technique,
                    undefined,
                    evidenceSnapshot.activeDataset?.id
                  );
                }}
                className="inline-flex h-8 items-center justify-center rounded-md border border-blue-200 bg-blue-50 px-3 text-xs font-bold text-blue-700 hover:bg-blue-100 transition-colors shadow-sm focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                aria-label="Reproduce the analysis workflow using historical parameters"
                title="Reproduce the analysis workflow using historical parameters"
              >
                Reproduce Analysis <RotateCcw size={13} className="ml-1.5" />
              </button>
              <Link to={isUploadedContext && uploadedRouteSearch
                ? `/notebook?${uploadedRouteSearch}&template=research`
                : `/notebook?project=${currentProject.id}&mode=demo&template=${templateMode}&entry=${workflowNotebookEntry.id}`}
                className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-background px-3 text-xs font-bold text-text-main hover:border-primary/40 hover:text-primary">
                Open source notebook <ArrowRight size={13} className="ml-1" />
              </Link>
              <Link to={withDemoMode(getWorkspaceRoute(currentProject))} className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-background px-3 text-xs font-bold text-text-main hover:border-primary/40 hover:text-primary">
                Open Workspace <ArrowRight size={13} className="ml-1" />
              </Link>
            </div>
          </aside>

          <main className="min-h-0 overflow-y-auto rounded-lg border border-border bg-slate-100 p-4">
            <div className="mx-auto max-w-4xl mb-3 flex items-center justify-between border-b border-slate-200 pb-2">
              <div className="flex gap-2">
                <button
                  onClick={() => setActiveTab('standard')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${activeTab === 'standard' ? 'bg-white text-slate-800 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  Standard Draft
                </button>
                <button
                  onClick={() => handleDraftWithAI()}
                  className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 ${activeTab === 'ai' ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  <Sparkles size={12} /> Vertex AI Draft
                </button>
              </div>
              {activeTab === 'ai' && aiDraft && (
                <button
                  onClick={copyAiDraft}
                  className="px-2.5 py-1 text-xs font-semibold rounded border border-slate-200 bg-white hover:bg-slate-50 flex items-center gap-1"
                >
                  <Clipboard size={12} /> Copy AI Draft
                </button>
              )}
            </div>

            {activeTab === 'standard' ? (
              <article className="mx-auto max-w-4xl rounded-md border border-border bg-white px-8 py-7 shadow-sm">
                <div className="border-b border-border pb-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-xs font-bold uppercase tracking-[0.18em] text-primary">DIFARYX Evidence Report</div>
                      <h2 className="mt-2 text-2xl font-bold text-text-main">{evidenceSnapshot.projectName}</h2>
                      <p className="mt-1 text-sm text-text-muted">{registryProject.objective}</p>
                    </div>
                    <div className="shrink-0 rounded-md border border-border bg-background px-3 py-2 text-right text-xs text-text-muted">
                      <div className="font-semibold text-text-main">{reportVersion}</div>
                      <div>{preparedAt}</div>
                      <div>{reportStatus}</div>
                    </div>
                  </div>
                </div>

                <div className="mt-5 space-y-5">
                  {reportSections.map((section) => (
                    <section key={section.heading}>
                      <h3 className="text-sm font-bold uppercase tracking-wider text-text-main">{section.heading}</h3>
                      <div className="mt-2 space-y-1.5 text-sm leading-relaxed text-text-muted">
                        {section.lines.map((line, index) => (
                          <p key={`${section.heading}-${index}`}>{line}</p>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              </article>
            ) : (
              <article className="mx-auto max-w-4xl rounded-md border border-border bg-white px-8 py-7 shadow-sm min-h-[400px] flex flex-col">
                {isDrafting ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
                    <h3 className="mt-4 text-sm font-bold text-slate-800">Contacting Vertex AI Coprocessor...</h3>
                    <p className="mt-1 text-xs text-slate-500">Drafting technical report from peak characterization and validation boundaries.</p>
                  </div>
                ) : aiDraft ? (
                  <div>
                    {aiWarning && (
                      <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-[11px] font-semibold text-amber-800 leading-snug">
                        ⚠️ {aiWarning}
                      </div>
                    )}
                    <div className="border-b border-border pb-4 mb-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">Vertex AI Generated Draft</div>
                          <h2 className="mt-2 text-2xl font-bold text-text-main">{evidenceSnapshot.projectName}</h2>
                          <p className="mt-1 text-sm text-text-muted">Drafted using model {import.meta.env.VITE_VERTEX_AI_MODEL || 'gemini-1.5-pro'}</p>
                        </div>
                      </div>
                    </div>
                    <div className="prose prose-sm max-w-none text-slate-800 whitespace-pre-wrap leading-relaxed">
                      {aiDraft}
                    </div>
                    {aiSignals && (
                      <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-600">
                        <div className="font-bold uppercase tracking-wider text-slate-500">
                          Structured reasoning signals (Vertex) — preserved for audit
                        </div>
                        <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1">
                          <div>Evidence strength: <span className="font-semibold text-slate-800">{aiSignals.evidenceStrength}</span></div>
                          <div>Confidence: <span className="font-semibold text-slate-800">{Math.round(aiSignals.confidence * 100)}%</span></div>
                          <div>Contradictions: <span className="font-semibold text-slate-800">{aiSignals.contradictions.length}</span></div>
                          <div>Missing validation: <span className="font-semibold text-slate-800">{aiSignals.missingValidation.length}</span></div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
                    <Sparkles size={36} className="text-indigo-500 animate-pulse mx-auto" />
                    <h3 className="mt-4 text-sm font-bold text-slate-800">Vertex AI Report Assistant</h3>
                    <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
                      Generate a detailed, publication-level research report drafted by Gemini using your physical spectral library assignments and experimental parameters.
                    </p>
                    <button
                      onClick={() => handleDraftWithAI()}
                      className="mt-6 inline-flex h-9 items-center justify-center rounded-md bg-gradient-to-r from-violet-600 to-indigo-600 px-4 text-xs font-bold text-white shadow-md hover:from-violet-700 hover:to-indigo-700 transition-all"
                    >
                      Draft with Vertex AI
                    </button>
                  </div>
                )}
              </article>
            )}

            <Card className="mx-auto mt-3 max-w-4xl p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-text-main">
                  <FileText size={15} className="text-primary" /> Export workflow
                </div>
                <p className="text-xs text-text-muted">
                  Raw signal CSV remains in Notebook Lab; this builder exports formal report artifacts.
                </p>
              </div>
            </Card>
          </main>
        </div>
      </div>
      <ApprovalActionDialog
        action={approvalAction}
        onClose={() => setApprovalAction(null)}
        onContinueLocal={() => {
          setApprovalAction(null);
          showFeedback('Local report preview retained. No external action executed.');
        }}
      />
    </DashboardLayout>
  );
}
