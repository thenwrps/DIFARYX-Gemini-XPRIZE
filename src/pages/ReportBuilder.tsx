import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, Clipboard, Download, FileText, Save, ShieldCheck } from 'lucide-react';
import { DashboardLayout } from '../components/layout/DashboardLayout';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { useAuth } from '../contexts/AuthContext';
import { getProject, getWorkspaceRoute } from '../data/demoProjects';
import {
  claimStatusColorClass,
  claimStatusLabel,
  getRegistryProject,
  isKnownProjectId,
  jobTypeBadgeClass,
  jobTypeLabel,
} from '../data/demoProjectRegistry';
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
} from '../data/workflowPipeline';
import { exportDemoArtifact, type DemoExportFormat, type DemoExportSection } from '../utils/demoExport';
import { getProjectEvidenceSnapshot, type ProjectEvidenceSnapshot } from '../utils/evidenceSnapshot';
import { createUploadedEvidenceRegistryProject } from '../utils/uploadedEvidenceProjectContext';
import {
  getRuntimeBadgeClass,
  getRuntimeBadgeLabel,
  requiresApproval,
} from '../runtime/difaryxRuntimeMode';
import { ApprovalActionDialog } from '../components/runtime/ApprovalActionDialog';
import { ConnectedAccountStatus } from '../components/runtime/ConnectedAccountStatus';
import {
  createApprovalActionPreview,
  type ApprovalActionPreview,
  type ApprovalActionType,
  type ApprovalRiskLevel,
} from '../runtime/actionApproval';
import { appendApprovalLedgerEntry, createApprovalLedgerEntry, summarizeApprovalLedger } from '../runtime/approvalLedger';
import { ApprovalLedgerPanel } from '../components/runtime/ApprovalLedgerPanel';
import {
  getDefaultConnectedAccountState,
  getGoogleConnectedShellState,
} from '../runtime/connectedAccounts';
import {
  createEvidenceBundleFromSnapshot,
  getEvidenceBundleBadgeLabel,
  getTechniqueCoverageFromBundle,
  getValidationGapsFromBundle,
  type EvidenceBundle,
} from '../runtime/evidenceBundle';
import {
  readProjectWorkspaceParameters,
} from '../utils/workspaceParameterOverrides';
import { getProjectTechniques } from '../utils/projectEvidence';
import {
  getParameterProvenanceSummary,
  formatParameterValueForDisplay,
  formatProvenanceSource,
  formatProvenanceTimestamp,
} from '../utils/parameterProvenanceSummary';
import type { TechniqueWorkspaceId } from '../data/techniqueWorkspaceContent';
import {
  getStoredWorkspaceMode,
  setWorkspaceMode,
} from '../utils/workspaceMode';
import {
  buildEvidenceRouteSearch,
  getEvidenceRouteContext,
  type EvidenceRouteContext,
} from '../utils/evidenceRouteContext';
import { runWhenIdle } from '../utils/idle';

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
  xrdReferenceMatchV2Summary?: NotebookEntry['xrdReferenceMatchV2Summary'],
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
  const hasAnyOverrides = parameterSummaries.some(s => s.hasOverrides);
  const parameterProvenanceLines = hasAnyOverrides
    ? parameterSummaries.flatMap(summary => {
        if (!summary.hasOverrides) return [];
        return [
          `${summary.techniqueLabel}: ${summary.overrideCount} parameter${summary.overrideCount !== 1 ? 's' : ''} modified (last updated by ${formatProvenanceSource(summary.lastUpdatedBy)})`,
          ...summary.changedParameters.map(param =>
            `  ${param.label}: ${formatParameterValueForDisplay(param.defaultValue)}${param.unit ? ` ${param.unit}` : ''} → ${formatParameterValueForDisplay(param.effectiveValue)}${param.unit ? ` ${param.unit}` : ''} (${formatProvenanceSource(param.provenance.updatedBy)})`
          ),
        ];
      })
    : ['Default processing parameters used for all techniques.'];

  const xrdBackendEvidenceSection: DemoExportSection[] = xrdBackendEvidenceSummary
    ? [
        {
          heading: 'Skill-derived Backend XRD Evidence',
          lines: (() => {
            const xbe = xrdBackendEvidenceSummary;
            const snDisplay = Number.isFinite(xbe.snRatio) ? xbe.snRatio.toFixed(1) : 'N/A';
            const baselineDisplay = Number.isFinite(xbe.baselineDeviation) ? xbe.baselineDeviation.toFixed(3) : 'N/A';
            const savedDate = new Date(xbe.savedAt);
            const savedDisplay = Number.isNaN(savedDate.getTime()) ? xbe.savedAt || 'N/A' : savedDate.toISOString();

            return [
              `Detected peak count: ${xbe.detectedPeakCount}.`,
              `Fitted peak count: ${xbe.fittedPeakCount}.`,
              `Signal-to-noise ratio: ${snDisplay}.`,
              `Baseline deviation: ${baselineDisplay}.`,
              `Peak resolution: ${xbe.peakResolution ?? 'N/A'}.`,
              `Reference-supported phase indication: ${xbe.primaryPhase ?? 'N/A'}.`,
              `Matched peak count: ${xbe.matchedPeakCount}.`,
              `Phase summary: ${xbe.phaseSummary ?? 'N/A'}.`,
              `Evidence saved: ${savedDisplay}.`,
              ...(xbe.scientificEvidenceSummary
                ? [
                    'Scientific evidence object received.',
                    `Skill: ${xbe.scientificEvidenceSummary.skillLabel}.`,
                    `Evidence ID: ${xbe.scientificEvidenceSummary.evidenceId}.`,
                    `Input reference: SHA-256 ${xbe.scientificEvidenceSummary.inputReference}.`,
                    `Claim boundary: ${xbe.scientificEvidenceSummary.claimBoundary}.`,
                  ]
                : []),
              xbe.caveat || 'Phase purity requires reference validation and/or complementary evidence.',
            ];
          })(),
        },
      ]
    : [];
  const xrdReferenceCandidateSection = buildXrdReferenceCandidateReportSection(xrdReferenceMatchV2Summary);

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
      lines: [registryProject.crossTechniqueComparison.recommendedNextAction, registryProject.notebook.decision],
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
          <Card className="rounded-lg border-dashed bg-white p-10 text-center">
            <FileText size={42} className="mx-auto text-text-dim" />
            <h2 className="mt-4 text-lg font-bold text-text-main">No user report drafts yet</h2>
            <p className="mt-2 text-sm text-text-muted">Create report from uploaded evidence</p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Link
                to="/analysis?source=user_uploaded&next=report"
                className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-xs font-bold text-white hover:bg-primary/90"
              >
                Upload evidence
              </Link>
              <Link
                to="/notebook"
                className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-white px-3 text-xs font-bold text-text-main hover:bg-slate-50"
              >
                Create report draft
              </Link>
              <Link
                to="/reports?project=cu-fe2o4-spinel&mode=demo"
                onClick={() => setWorkspaceMode('demo')}
                className="inline-flex h-9 items-center justify-center rounded-md border border-primary bg-primary/10 px-3 text-xs font-bold text-primary hover:bg-primary/20"
              >
                Use demo report
              </Link>
            </div>
            <p className="mt-5 text-xs font-semibold text-amber-700">External writes disabled</p>
          </Card>
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
        `Source: user_uploaded`,
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
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => exportUploadedReport('md')}><Download size={13} /> Export Markdown</Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => exportUploadedReport('pdf')}><Download size={13} /> Export PDF</Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => exportUploadedReport('docx')}><Download size={13} /> Export DOCX</Button>
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
                  <p className="mt-1 text-sm font-bold text-text-main">source=user_uploaded</p>
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

  // Bundle gating: only create bundle when appropriate (not for uploaded evidence)
  const evidenceBundle = useMemo(() => {
    if (isUploadedContext) {
      return null;
    }

    const availableTechniques = evidenceSnapshot.availableTechniques ?? [];
    const techniqueCount = availableTechniques.length;
    const context: import('../runtime/evidenceBundle').BundleCreationContext = {
      route: '/reports',
      techniqueCount,
      hasMultiTechIntent: techniqueCount >= 2 || searchParams.get('bundle') === 'mixed',
      isDemoProject: evidenceSnapshot.sourceMode === 'demo_preloaded',
      hasDemoPreloadedBundle: currentProject.id === 'cu-fe2o4-spinel' && techniqueCount >= 2,
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
      workflowNotebookEntry?.xrdReferenceMatchV2Summary,
    ),
    [
      evidenceSnapshot,
      evidenceBundle,
      registryProject,
      workflowReportSection,
      workflowNotebookEntry?.xrdBackendEvidenceSummary,
      workflowNotebookEntry?.xrdReferenceMatchV2Summary,
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
              </div>
              <h1 className="mt-1 truncate text-xl font-bold text-text-main">{evidenceSnapshot.projectName} Evidence Report</h1>
              <p className="mt-1 text-sm text-text-muted">
                Formal report preview prepared from notebook entry {workflowNotebookEntry.id}.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {feedback && <span className="rounded border border-primary/20 bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary">{feedback}</span>}
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => exportReport('md')}><Download size={13} /> Export Markdown</Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => exportReport('pdf')}><Download size={13} /> Export PDF</Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => exportReport('docx')}><Download size={13} /> Export DOCX</Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={copyReport}><Clipboard size={13} /> Copy report</Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => openFutureExportPreview('google_drive_export_future')}><Download size={13} /> Drive export</Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => openFutureExportPreview('gmail_draft_future')}><FileText size={13} /> Preview Gmail Draft</Button>
              <Button size="sm" className="gap-1.5" onClick={saveReportVersion}><Save size={13} /> Save version</Button>
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

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden p-3 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="min-h-0 overflow-y-auto rounded-lg border border-border bg-surface p-3">
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
            {evidenceBundle && (
              <div className="mt-3">
                <ApprovalLedgerPanel projectId={currentProject.id} bundleId={evidenceBundle.bundleId} limit={4} compact />
              </div>
            )}
            <div className="mt-3 flex flex-col gap-2">
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
