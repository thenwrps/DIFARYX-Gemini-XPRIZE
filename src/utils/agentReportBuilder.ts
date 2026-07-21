/**
 * agentReportBuilder.ts
 *
 * Compiles a structured scientific report from all 5 deterministic tabs
 * (Goal, Parameters, Evidence, Trace, Boundary) for the Agent Workspace.
 * Produces a `DemoExportOptions` payload consumable by `exportDemoArtifact`.
 */

import type { DemoExportSection, DemoExportFormat } from './demoExport';
import { exportDemoArtifact } from './demoExport';
import type { AgentContext, ParameterGroup } from './agentContext';
import type { RegistryProject } from '../data/demoProjectRegistry';
import type { AgentEvidenceWorkspace } from './agentEvidenceModel';
import type {
  ResearchEvidenceItem,
  ReasoningProvenance,
  ClaimBoundaryArtifact,
} from '../types/researchEvidence';

// -----------------------------------------------------------------------------
// Public export
// -----------------------------------------------------------------------------

export interface AgentReportInput {
  projectId: string;
  projectTitle?: string;
  materialSystem?: string;
  objective?: string;
  jobType?: string;
  claimStatus?: string;
  mode: string;
  agentContext: AgentContext;
  registryProject?: RegistryProject;
  evidenceWorkspace?: AgentEvidenceWorkspace;
  toolTrace?: NormalizedToolTraceEntry[];
  researchEvidence: ResearchEvidenceItem[];
  reasoningProvenance: ReasoningProvenance | null;
  claimBoundary: ClaimBoundaryArtifact | null;
  isConditionLocked?: boolean;
}

export interface NormalizedToolTraceEntry {
  id: string;
  toolName: string;
  callType: string;
  argsSummary: string;
  resultSummary: string;
  evidenceImpact: string;
  approvalStatus: string;
  timestamp: string;
  status: 'pending' | 'running' | 'complete' | 'error';
}

export function exportAgentReport(
  input: AgentReportInput,
  format: DemoExportFormat = 'md',
): void {
  const sections = buildAgentReportSections(input);
  exportDemoArtifact(format, {
    filenameBase: `agent-report-${input.projectId}`,
    title: `Scientific Agent Report: ${input.projectTitle || input.projectId}`,
    sections,
  });
}

export function buildAgentReportSections(input: AgentReportInput): DemoExportSection[] {
  const sections: DemoExportSection[] = [];

  // 1. Goal section
  sections.push(buildGoalSection(input));

  // 2. Parameters section
  sections.push(buildParametersSection(input));

  // 3. Evidence section
  sections.push(buildEvidenceSection(input));

  // 4. Trace section
  sections.push(buildTraceSection(input));

  // 5. Boundary section
  sections.push(buildBoundarySection(input));

  return sections;
}

// -----------------------------------------------------------------------------
// Section Builders
// -----------------------------------------------------------------------------

function buildGoalSection(input: AgentReportInput): DemoExportSection {
  const lines: string[] = [];

  if (input.projectTitle) lines.push(`Project: ${input.projectTitle}`);
  if (input.materialSystem) lines.push(`Material System: ${input.materialSystem}`);
  if (input.jobType) lines.push(`Job Type: ${input.jobType}`);
  if (input.claimStatus) lines.push(`Claim Status: ${input.claimStatus}`);
  if (input.objective) lines.push(`Objective: ${input.objective}`);
  lines.push(`Mode: ${input.mode}`);

  // Project context from agentContext
  const ctx = input.agentContext;
  if (ctx.projectTitle) lines.push(`Context Project: ${ctx.projectTitle}`);
  if (ctx.materialSystem) lines.push(`Context Material: ${ctx.materialSystem}`);
  if (ctx.primaryTechnique) lines.push(`Primary Technique: ${ctx.primaryTechnique}`);
  if (ctx.evidenceMode) lines.push(`Evidence Mode: ${ctx.evidenceMode}`);

  // Evidence layers
  if (ctx.evidenceLayers?.length) {
    lines.push('');
    lines.push('Evidence Layers:');
    ctx.evidenceLayers.forEach((layer) => {
      lines.push(`  - ${layer.technique}: ${layer.role} [${layer.status}]`);
    });
  }

  // Workflow steps summary
  if (ctx.workflowSteps?.length) {
    lines.push('');
    lines.push('Workflow Steps:');
    ctx.workflowSteps.forEach((step) => {
      lines.push(`  ${step.number}. ${step.title} [${step.status}]`);
    });
  }

  return {
    heading: '1. Goal & Context',
    lines,
  };
}

function buildParametersSection(input: AgentReportInput): DemoExportSection {
  const lines: string[] = [];

  if (input.isConditionLocked !== undefined) {
    lines.push(`Condition Lock: ${input.isConditionLocked ? 'Locked' : 'Unlocked'}`);
  }

  lines.push('');
  lines.push('Parameter Groups:');

  const groups = input.agentContext.parameterGroups;
  if (groups && groups.length > 0) {
    groups.forEach((group: ParameterGroup) => {
      lines.push(`\n[${group.id}] ${group.title || group.id}`);
      if (group.params && group.params.length > 0) {
        group.params.forEach((param) => {
          const value = param.value !== undefined && param.value !== null
            ? String(param.value)
            : '(not set)';
          const provenance = param.provenance
            ? ` (source: ${param.provenance})`
            : '';
          lines.push(`  - ${param.key}: ${value}${provenance}`);
        });
      }
    });
  } else {
    lines.push('  (No parameter groups available)');
  }

  if (input.agentContext.hasParameterOverrides) {
    lines.push('');
    lines.push('Parameter Overrides Active: Yes');
  }

  return {
    heading: '2. Parameters & Conditions',
    lines,
  };
}

function buildEvidenceSection(input: AgentReportInput): DemoExportSection {
  const lines: string[] = [];

  // Research evidence items
  if (input.researchEvidence && input.researchEvidence.length > 0) {
    lines.push(`Research Evidence Items: ${input.researchEvidence.length}`);
    lines.push('');
    input.researchEvidence.forEach((item, idx) => {
      lines.push(`  ${idx + 1}. ${item.title || 'Evidence item'}`);
      if (item.authors?.length) lines.push(`     Authors: ${item.authors.join(', ')}`);
      if (item.journal) lines.push(`     Journal: ${item.journal}`);
      if (item.year) lines.push(`     Year: ${item.year}`);
      if (item.doi) lines.push(`     DOI: ${item.doi}`);
      if (item.relevanceScore !== undefined) lines.push(`     Relevance: ${item.relevanceScore}`);
      if (item.source) lines.push(`     Source: ${item.source}`);
      lines.push('');
    });
  }

  // Reasoning provenance
  if (input.reasoningProvenance) {
    lines.push('Reasoning Provenance:');
    const rp = input.reasoningProvenance;
    if (rp.literatureSource) lines.push(`  Literature Source: ${rp.literatureSource}`);
    if (rp.reasoningProvider) lines.push(`  Reasoning Provider: ${rp.reasoningProvider}`);
    if (rp.literatureCount !== undefined) lines.push(`  Literature Count: ${rp.literatureCount}`);
    if (rp.fallbackUsed !== undefined) lines.push(`  Fallback Used: ${rp.fallbackUsed ? 'Yes' : 'No'}`);
    if (rp.generatedAt) lines.push(`  Generated At: ${rp.generatedAt}`);
    lines.push('');
  }

  // Evidence workspace data
  if (input.evidenceWorkspace) {
    const ws = input.evidenceWorkspace;
    lines.push('Evidence Workspace:');
    lines.push(`  Project ID: ${ws.projectId}`);
    if (ws.jobType) lines.push(`  Job Type: ${ws.jobType}`);
    if (ws.objective) lines.push(`  Objective: ${ws.objective}`);
    if (ws.focusedTechnique) lines.push(`  Focused Technique: ${ws.focusedTechnique}`);

    if (ws.techniques && ws.techniques.length > 0) {
      lines.push('');
      lines.push('  Selected Techniques:');
      ws.techniques.forEach((t) => {
        const sel = t.selected ? '[selected]' : '[deselected]';
        lines.push(`    - ${t.displayName} (${t.techniqueId}) ${sel}`);
        if (t.evidenceRole) lines.push(`      Role: ${t.evidenceRole}`);
        if (t.availability) lines.push(`      Availability: ${t.availability}`);
        if (t.evidenceResult?.summary) lines.push(`      Evidence: ${t.evidenceResult.summary}`);
        if (t.evidenceResult?.extractedFindings?.length) {
          t.evidenceResult.extractedFindings.forEach((f: string) => {
            lines.push(`        - ${f}`);
          });
        }
        if (t.validationLimits?.length) {
          lines.push(`      Validation Limits:`);
          t.validationLimits.forEach((limit: string) => lines.push(`        - ${limit}`));
        }
      });
    }
  }

  return {
    heading: '3. Evidence & Reasoning',
    lines,
  };
}

function buildTraceSection(input: AgentReportInput): DemoExportSection {
  const lines: string[] = [];

  // Tool trace
  const trace = input.toolTrace;
  if (trace && trace.length > 0) {
    lines.push(`Tool Execution Trace (${trace.length} steps):`);
    lines.push('');
    trace.forEach((entry, idx) => {
      const statusIcon = entry.status === 'complete' ? '[OK]' : entry.status === 'running' ? '[RUN]' : entry.status === 'error' ? '[ERR]' : '[PEND]';
      lines.push(`  ${idx + 1}. ${statusIcon} ${entry.toolName || entry.id}`);
      if (entry.callType) lines.push(`     Call Type: ${entry.callType}`);
      if (entry.argsSummary) lines.push(`     Input: ${entry.argsSummary}`);
      if (entry.resultSummary) lines.push(`     Output: ${entry.resultSummary}`);
      if (entry.evidenceImpact) lines.push(`     Impact: ${entry.evidenceImpact}`);
      if (entry.approvalStatus) lines.push(`     Approval: ${entry.approvalStatus}`);
      if (entry.timestamp) lines.push(`     Time: ${entry.timestamp}`);
      lines.push('');
    });
  }

  // Trace context from agent context
  const traceCtx = input.agentContext.traceContext;
  if (traceCtx) {
    lines.push('Agent Trace Context:');
    if (traceCtx.steps && traceCtx.steps.length > 0) {
      lines.push(`  Total Steps: ${traceCtx.steps.length}`);
      traceCtx.steps.forEach((step, idx) => {
        lines.push(`  ${idx + 1}. ${step.label || 'Step ' + (idx + 1)}`);
        if (step.detail) lines.push(`     ${step.detail}`);
      });
    }
    if (traceCtx.mode) lines.push(`  Mode: ${traceCtx.mode}`);
    if (traceCtx.outputLabel) lines.push(`  Output: ${traceCtx.outputLabel}`);
  }

  return {
    heading: '4. Execution Trace',
    lines,
  };
}

function buildBoundarySection(input: AgentReportInput): DemoExportSection {
  const lines: string[] = [];

  // Claim boundary artifact
  if (input.claimBoundary) {
    const cb = input.claimBoundary;
    lines.push('Claim Boundary:');
    if (cb.provider) lines.push(`  Provider: ${cb.provider}`);
    if (cb.signals) {
      if (cb.signals.evidenceStrength) lines.push(`  Evidence Strength: ${cb.signals.evidenceStrength}`);
      if (cb.signals.confidence !== undefined) lines.push(`  Confidence: ${cb.signals.confidence}`);
      if (cb.signals.contradictions && cb.signals.contradictions.length > 0) {
        lines.push('');
        lines.push('  Contradictions:');
        cb.signals.contradictions.forEach((c: string) => lines.push(`    - ${c}`));
      }
      if (cb.signals.missingValidation && cb.signals.missingValidation.length > 0) {
        lines.push('');
        lines.push('  Missing Validation:');
        cb.signals.missingValidation.forEach((mv: string) => lines.push(`    - ${mv}`));
      }
    }
    if (cb.renderedClaimBoundary && cb.renderedClaimBoundary.length > 0) {
      lines.push('');
      lines.push('  Rendered Claim Boundary:');
      cb.renderedClaimBoundary.forEach((line: string) => lines.push(`    - ${line}`));
    }
    lines.push('');
  }

  // Boundary context from agent context
  const bc = input.agentContext.boundaryContext;
  if (bc) {
    lines.push('Validation Boundary Context:');
    if (bc.jobType) lines.push(`  Job Type: ${bc.jobType}`);
    if (bc.supported && bc.supported.length > 0) {
      lines.push('  Supported Claims:');
      bc.supported.forEach((s: string) => lines.push(`    - ${s}`));
    }
    if (bc.validationLimited && bc.validationLimited.length > 0) {
      lines.push('  Validation-Limited Claims:');
      bc.validationLimited.forEach((vl: string) => lines.push(`    - ${vl}`));
    }
    if (bc.cannotConclude && bc.cannotConclude.length > 0) {
      lines.push('  Cannot Conclude:');
      bc.cannotConclude.forEach((cc: string) => lines.push(`    - ${cc}`));
    }
    if (bc.requiredNext && bc.requiredNext.length > 0) {
      lines.push('  Required Next Actions:');
      bc.requiredNext.forEach((rn: string) => lines.push(`    - ${rn}`));
    }
    lines.push('');
  }

  // Validation gaps from registry
  const registryGaps = input.registryProject?._raw?.validationGaps;
  if (registryGaps && registryGaps.length > 0) {
    lines.push('Registered Validation Gaps:');
    registryGaps.forEach((gap: string | { description?: string }) => {
      const gapText = typeof gap === 'string' ? gap : (gap as { description?: string }).description || String(gap);
      lines.push(`  - ${gapText}`);
    });
  }

  return {
    heading: '5. Boundary & Validation',
    lines,
  };
}
