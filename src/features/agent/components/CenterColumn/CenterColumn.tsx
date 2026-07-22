import React from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Database,
  Download,
  FileCheck2,
  FlaskConical,
  Save,
  ShieldAlert,
  Target,
} from 'lucide-react';
import { Graph } from '../../../../shared/ui/Graph';
import { DemoProjectGraph } from '../../../../shared/visualization/DemoProjectGraph';
import { CompactWorkflowStepper, type ScientificStageId } from './CompactWorkflowStepper';
import { EvidenceWorkspaceCard } from './EvidenceWorkspaceCard';
import type { AgentContext, EvidenceLayer } from '../../../../utils/agentContext';
import type { AgentEvidenceWorkspace, TechniqueId } from '../../../../utils/agentEvidenceModel';
import type { DemoFocusedEvidenceSource, RegistryProject } from '../../../../data/demoProjectRegistry';
import type { ClaimBoundaryArtifact, ReasoningProvenance } from '../../../../types/researchEvidence';

interface CenterColumnProps {
  agentContext: AgentContext;
  activeStage: ScientificStageId;
  completedThrough: ScientificStageId;
  onStageChange: (stage: ScientificStageId) => void;
  evidenceWorkspace?: AgentEvidenceWorkspace;
  focusedEvidenceSource?: DemoFocusedEvidenceSource;
  onFocusedTechniqueChange?: (techniqueId: TechniqueId) => void;
  registryProject?: RegistryProject;
  bundleCoverage?: number;
  bundleLabel?: string;
  fallbackUsed?: boolean;
  reasoningProvenance?: ReasoningProvenance | null;
  claimBoundary?: ClaimBoundaryArtifact | null;
  onSaveToNotebook?: () => void;
  onExportReport?: () => void;
}

function StageHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
        <p className="mt-1 max-w-[72ch] text-[12px] leading-5 text-slate-600">{description}</p>
      </div>
    </div>
  );
}

function EvidenceGraph({
  agentContext,
  focusedEvidenceSource,
}: Pick<CenterColumnProps, 'agentContext' | 'focusedEvidenceSource'>) {
  const selectedLayer = agentContext.evidenceLayers.find(
    (layer: EvidenceLayer) => layer.technique === agentContext.selectedTechnique,
  );
  const shouldShowGraph = Boolean(selectedLayer?.hasGraphData && selectedLayer.graphData.length > 0);

  if (focusedEvidenceSource?.sourceType === 'graph' && focusedEvidenceSource.graphData) {
    return <DemoProjectGraph source={focusedEvidenceSource.graphData} height="100%" showLegend />;
  }
  if (focusedEvidenceSource?.sourceType === 'structured' && focusedEvidenceSource.structuredEvidence) {
    return <DemoProjectGraph source={focusedEvidenceSource.structuredEvidence} height="100%" />;
  }
  if (shouldShowGraph && selectedLayer) {
    return (
      <Graph
        type={selectedLayer.graphType}
        height="100%"
        externalData={selectedLayer.graphData}
        peakMarkers={selectedLayer.peakMarkers}
        baselineData={selectedLayer.baselineData}
        showBackground
        showCalculated={false}
        showResidual={false}
      />
    );
  }
  return <EvidenceWorkspaceCard layer={selectedLayer} context={agentContext} />;
}

function ObjectiveView({ agentContext, registryProject }: Pick<CenterColumnProps, 'agentContext' | 'registryProject'>) {
  return (
    <div className="grid h-full min-h-0 grid-cols-[1.15fr_0.85fr] gap-4">
      <section className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-6">
        <div>
          <div className="mb-4 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white">
            <Target size={18} />
          </div>
          <h2 className="max-w-[28ch] text-2xl font-semibold leading-8 text-slate-950">{agentContext.objective}</h2>
          <p className="mt-4 max-w-[64ch] text-sm leading-6 text-slate-600">
            Evaluate the available experimental evidence for {agentContext.materialSystem}, preserve technique boundaries, and identify the next experiment required for a defensible decision.
          </p>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3 border-t border-slate-200 pt-4 text-xs">
          <div><span className="text-slate-500">Material system</span><div className="mt-1 font-semibold text-slate-900">{agentContext.materialSystem}</div></div>
          <div><span className="text-slate-500">Review type</span><div className="mt-1 font-semibold text-slate-900">{agentContext.evidenceMode === 'multi-tech' ? 'Multi-tech evidence review' : `${agentContext.primaryTechnique} evidence review`}</div></div>
        </div>
      </section>
      <section className="rounded-xl bg-slate-950 p-5 text-white">
        <div className="text-xs font-semibold text-blue-300">Scientific question</div>
        <p className="mt-3 text-lg font-medium leading-7">What does the current evidence support, what remains uncertain, and which measurement should be acquired next?</p>
        <div className="mt-6 space-y-3 text-xs text-slate-300">
          <div className="flex items-center gap-2"><CheckCircle2 size={14} className="text-emerald-400" />Evidence precedes interpretation</div>
          <div className="flex items-center gap-2"><CheckCircle2 size={14} className="text-emerald-400" />Validation gaps remain visible</div>
          <div className="flex items-center gap-2"><CheckCircle2 size={14} className="text-emerald-400" />Decision is preserved in scientific memory</div>
        </div>
        {registryProject?.notebook.validationBoundary && (
          <div className="mt-6 rounded-lg bg-white/10 p-3 text-[11px] leading-5 text-slate-200">
            Boundary: {registryProject.notebook.validationBoundary}
          </div>
        )}
      </section>
    </div>
  );
}

function EvidenceView(props: CenterColumnProps) {
  const available = props.agentContext.evidenceLayers.filter((layer) => layer.status === 'available');
  const missing = props.agentContext.evidenceLayers.filter((layer) => layer.status !== 'available');
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <StageHeading title="Evidence bundle" description="Inspect the signal first, then review extracted observations and missing evidence." />
        <div className="shrink-0 text-right">
          <div className="text-2xl font-semibold text-slate-950">{props.bundleCoverage ?? Math.round((available.length / Math.max(1, props.agentContext.evidenceLayers.length)) * 100)}%</div>
          <div className="text-[10px] text-slate-500">bundle coverage</div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 border-y border-slate-200 py-2">
        <div className="text-[11px] font-medium text-slate-700">{props.bundleLabel ?? 'Prepared evidence bundle'}</div>
        <div className="flex gap-1.5">
          {props.evidenceWorkspace?.techniques.filter((item) => item.selected).map((technique) => (
            <button
              key={technique.techniqueId}
              type="button"
              onClick={() => props.onFocusedTechniqueChange?.(technique.techniqueId)}
              className={`rounded-md px-2 py-1 text-[10px] font-semibold ${props.evidenceWorkspace?.focusedTechnique === technique.techniqueId ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
            >
              {technique.displayName}
            </button>
          ))}
        </div>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_250px] gap-3">
        <div className="min-h-0 rounded-xl border border-slate-200 bg-slate-950 p-2">
          <EvidenceGraph agentContext={props.agentContext} focusedEvidenceSource={props.focusedEvidenceSource} />
        </div>
        <div className="min-h-0 overflow-y-auto rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-xs font-semibold text-slate-900">Key observations</div>
          <div className="mt-2 space-y-2">
            {available.flatMap((layer) => layer.summary ? [{ technique: layer.technique, text: layer.summary }] : []).slice(0, 4).map((item, index) => (
              <div key={`${item.technique}-${index}`} className="border-t border-slate-100 pt-2 first:border-t-0 first:pt-0">
                <div className="text-[10px] font-semibold text-blue-700">{item.technique}</div>
                <p className="mt-0.5 text-[11px] leading-4 text-slate-700">{item.text}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 border-t border-slate-200 pt-3">
            <div className="text-[10px] font-semibold text-slate-500">Availability</div>
            <div className="mt-1 text-[11px] text-emerald-700">Available: {available.map((layer) => layer.technique).join(', ') || 'None'}</div>
            <div className="mt-1 text-[11px] text-amber-700">Missing: {missing.map((layer) => layer.technique).join(', ') || 'No required technique missing'}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReasoningView(props: CenterColumnProps) {
  const project = props.registryProject;
  const supporting = project?.evidenceResults.filter((item) => item.supportsClaim) ?? [];
  const contradictions = props.claimBoundary?.signals.contradictions ?? [];
  const confidence = props.claimBoundary?.signals.confidence ?? Math.min(0.92, Math.max(0.55, (project?.reportReadiness ?? 70) / 100));
  const claim = project?.agentWorkflow.claimBoundary.supported[0] || props.agentContext.claimBoundary;
  const supportingEvidence = supporting.length
    ? supporting.map((item) => `${item.displayName}: ${item.summary}`)
    : props.agentContext.evidenceLayers
        .filter((layer) => layer.status === 'available')
        .map((layer) => `${layer.technique}: ${layer.summary}`);
  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <StageHeading title="Claim-evidence reasoning" description="GPT-5.6 separates evidence support, contradiction, rationale, and confidence for each scientific claim." />
      <section className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-slate-300 bg-white">
        <div className="grid grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_150px] border-b border-slate-200 bg-slate-50 px-4 py-2 text-[10px] font-semibold text-slate-600">
          <span>Claim and rationale</span><span>Evidence assessment</span><span>Confidence</span>
        </div>
        <div className="grid grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_150px] gap-4 p-4">
          <div>
            <div className="text-sm font-semibold leading-6 text-slate-950">{claim}</div>
            <p className="mt-3 text-[12px] leading-5 text-slate-600">{project?.notebook.interpretation ?? props.agentContext.discussionContext.interpretation}</p>
            <div className="mt-4 flex items-center gap-2 text-[10px] font-medium text-slate-500">
              <Database size={13} />
              Model provenance: GPT-5.6 Scientific Reasoning · {props.fallbackUsed ? 'Deterministic fallback active' : 'Reasoning replay'}
            </div>
          </div>
          <div className="space-y-3 text-[11px]">
            <div>
              <div className="font-semibold text-emerald-800">Supporting evidence</div>
              <ul className="mt-1 space-y-1 text-slate-700">
                {supportingEvidence.slice(0, 3).map((item, index) => (
                  <li key={index}>• {item}</li>
                ))}
              </ul>
            </div>
            <div>
              <div className="font-semibold text-rose-800">Contradicting evidence</div>
              <div className="mt-1 text-slate-700">{contradictions.length ? contradictions.join('; ') : 'None detected in the prepared evidence bundle.'}</div>
            </div>
          </div>
          <div>
            <div className="text-2xl font-semibold text-slate-950">{Math.round(confidence * 100)}%</div>
            <div className="mt-1 text-[11px] font-semibold text-emerald-700">{confidence >= 0.8 ? 'High' : confidence >= 0.6 ? 'Moderate' : 'Limited'}</div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-blue-600" style={{ width: `${confidence * 100}%` }} /></div>
          </div>
        </div>
      </section>
    </div>
  );
}

function BoundaryGroup({ title, items, tone }: { title: string; items: string[]; tone: 'supported' | 'limited' | 'blocked' }) {
  const styles = {
    supported: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    limited: 'border-amber-200 bg-amber-50 text-amber-950',
    blocked: 'border-rose-200 bg-rose-50 text-rose-950',
  };
  return (
    <section className={`min-w-0 rounded-xl border p-3 ${styles[tone]}`}>
      <div className="text-xs font-semibold">{title}</div>
      <ul className="mt-2 space-y-1.5 text-[11px] leading-4">
        {(items.length ? items : ['No statement recorded.']).slice(0, 3).map((item, index) => <li key={index}>• {item}</li>)}
      </ul>
    </section>
  );
}

function ValidationView(props: CenterColumnProps) {
  const boundary = props.registryProject?.agentWorkflow.claimBoundary ?? props.agentContext.boundaryContext;
  const criticalGap = props.agentContext.validationGaps.find((gap) => gap.severity === 'critical') ?? props.agentContext.validationGaps[0];
  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <StageHeading title="Validation boundary" description="The current evidence supports bounded statements while protecting unresolved scientific questions from overclaiming." />
      <div className="grid grid-cols-3 gap-3">
        <BoundaryGroup title="Supported" items={boundary.supported} tone="supported" />
        <BoundaryGroup title="Validation-limited" items={boundary.validationLimited} tone="limited" />
        <BoundaryGroup title="Cannot conclude" items={boundary.cannotConclude} tone="blocked" />
      </div>
      <section className="grid min-h-0 flex-1 grid-cols-[1.2fr_0.8fr] overflow-hidden rounded-xl border border-slate-300 bg-white">
        <div className="p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-rose-900"><ShieldAlert size={15} />Critical validation gap</div>
          <p className="mt-2 text-sm font-medium leading-6 text-slate-900">{criticalGap?.description ?? props.registryProject?.crossTechniqueComparison.validationGap ?? 'Complementary validation is required before the claim can be strengthened.'}</p>
          <div className="mt-4 text-[11px] text-slate-600"><span className="font-semibold text-slate-800">Missing technique or experiment:</span> {criticalGap?.suggestedResolution ?? boundary.requiredNext[0] ?? props.registryProject?.crossTechniqueComparison.recommendedNextAction}</div>
        </div>
        <div className="border-l border-slate-200 bg-slate-50 p-4 text-[11px]">
          <div className="flex justify-between border-b border-slate-200 pb-2"><span className="text-slate-500">Publication readiness</span><span className="font-semibold text-slate-900">{props.registryProject?.reportReadiness ?? 30}%</span></div>
          <div className="mt-3"><div className="font-semibold text-slate-800">Boundary reason</div><p className="mt-1 leading-4 text-slate-600">{props.registryProject?.notebook.validationBoundary ?? props.claimBoundary?.renderedClaimBoundary[0] ?? 'Evidence supports interpretation, but independent validation remains incomplete.'}</p></div>
        </div>
      </section>
    </div>
  );
}

function DecisionView(props: CenterColumnProps) {
  const next = props.agentContext.recommendedActions[0];
  const evidenceBasis = props.registryProject?.notebook.evidenceBasis ?? props.agentContext.evidenceLayers.filter((layer) => layer.status === 'available').map((layer) => layer.summary);
  const risk = props.registryProject?.notebook.validationGap ?? props.agentContext.validationGaps[0]?.description;
  const confidence = props.claimBoundary?.signals.confidence ?? ((props.registryProject?.reportReadiness ?? 70) / 100);
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <StageHeading title="Scientific decision" description="A bounded recommendation that connects the current evidence to the next highest-value experiment." />
      <section className="min-h-0 flex-1 overflow-hidden rounded-xl border border-blue-300 bg-white">
        <div className="flex items-center justify-between bg-slate-950 px-5 py-3 text-white">
          <div className="flex items-center gap-2 text-sm font-semibold"><FlaskConical size={17} className="text-blue-300" />Recommended decision</div>
          <span className="rounded-md bg-white/10 px-2 py-1 text-[10px] font-semibold">{Math.round(confidence * 100)}% confidence</span>
        </div>
        <div className="grid h-[calc(100%-48px)] grid-cols-[1.15fr_0.85fr]">
          <div className="p-5">
            <h3 className="text-xl font-semibold leading-7 text-slate-950">{next?.label ?? props.registryProject?.agentWorkflow.nextDecisionLabel ?? 'Proceed with the next validation experiment'}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">{next?.description ?? props.registryProject?.crossTechniqueComparison.recommendedNextAction}</p>
            <div className="mt-4 text-[11px]">
              <div className="font-semibold text-slate-900">Evidence basis</div>
              <ul className="mt-1 space-y-1 text-slate-600">{evidenceBasis.slice(0, 3).map((item, index) => <li key={index}>• {item}</li>)}</ul>
            </div>
          </div>
          <div className="border-l border-slate-200 bg-slate-50 p-4 text-[11px]">
            <div className="flex gap-2"><AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-600" /><div><div className="font-semibold text-slate-900">Remaining risk</div><p className="mt-1 leading-4 text-slate-600">{risk ?? 'Independent validation remains incomplete.'}</p></div></div>
            <div className="mt-4 flex gap-2"><ArrowRight size={14} className="mt-0.5 shrink-0 text-blue-600" /><div><div className="font-semibold text-slate-900">Expected information gain</div><p className="mt-1 leading-4 text-slate-600">Resolves the critical boundary and distinguishes a supported indication from a publication-ready conclusion.</p></div></div>
            <button type="button" onClick={props.onSaveToNotebook} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2">
              <FileCheck2 size={14} />Approve and save decision
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function MemoryView(props: CenterColumnProps) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <StageHeading title="Scientific memory" description="Preserve the objective, evidence basis, reasoning provenance, validation boundary, and next experiment as one reproducible record." />
      <div className="grid min-h-0 flex-1 grid-cols-[1.1fr_0.9fr] gap-4">
        <section className="min-h-0 overflow-y-auto rounded-xl border border-slate-300 bg-white p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-950"><BookOpen size={16} className="text-blue-600" />Notebook handoff preview</div>
          <div className="mt-4 space-y-3 text-[11px]">
            <div><div className="font-semibold text-slate-500">Objective</div><p className="mt-1 leading-4 text-slate-800">{props.agentContext.objective}</p></div>
            <div><div className="font-semibold text-slate-500">Decision record</div><p className="mt-1 leading-4 text-slate-800">{props.registryProject?.notebook.decision ?? props.agentContext.recommendedActions[0]?.description ?? 'Decision pending scientific review.'}</p></div>
            <div><div className="font-semibold text-slate-500">Validation boundary</div><p className="mt-1 leading-4 text-slate-800">{props.registryProject?.notebook.validationBoundary ?? props.agentContext.claimBoundary}</p></div>
          </div>
        </section>
        <section className="flex flex-col justify-between rounded-xl bg-slate-950 p-5 text-white">
          <div>
            <div className="text-sm font-semibold">Provenance summary</div>
            <div className="mt-4 space-y-2 text-[11px] text-slate-300">
              <div className="flex justify-between gap-4"><span>Reasoning model</span><span className="font-medium text-white">GPT-5.6</span></div>
              <div className="flex justify-between gap-4"><span>Evidence</span><span className="font-medium text-white">{props.bundleLabel ?? 'Prepared bundle'}</span></div>
              <div className="flex justify-between gap-4"><span>Fallback</span><span className="font-medium text-white">{props.fallbackUsed ? 'Active' : 'Not used'}</span></div>
              <div className="flex justify-between gap-4"><span>Techniques</span><span className="font-medium text-white">{props.agentContext.activeTechniques.join(', ')}</span></div>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <button type="button" onClick={props.onSaveToNotebook} className="inline-flex items-center justify-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-500"><Save size={14} />Save to Notebook</button>
            <button type="button" onClick={props.onExportReport} className="inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-600 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"><Download size={14} />Export Scientific Report</button>
          </div>
        </section>
      </div>
    </div>
  );
}

export function CenterColumn(props: CenterColumnProps) {
  const views: Record<ScientificStageId, React.ReactNode> = {
    objective: <ObjectiveView agentContext={props.agentContext} registryProject={props.registryProject} />,
    evidence: <EvidenceView {...props} />,
    reasoning: <ReasoningView {...props} />,
    validation: <ValidationView {...props} />,
    decision: <DecisionView {...props} />,
    memory: <MemoryView {...props} />,
  };

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-[#F7F9FC]">
      <CompactWorkflowStepper activeStage={props.activeStage} completedThrough={props.completedThrough} onStageChange={props.onStageChange} />
      <div className="min-h-0 flex-1 p-4">
        {views[props.activeStage]}
      </div>
    </main>
  );
}
