import React, { useEffect, useState } from 'react';
import {
  Brain,
  CheckCircle2,
  Database,
  FileText,
  Lock,
  ShieldAlert,
  Target,
  Terminal,
  Unlock,
} from 'lucide-react';
import type { AgentContext, WorkspaceParameters } from '../../../utils/agentContext';
import type { ParameterGroupId } from '../../../utils/projectEvidence';
import type { AgentEvidenceWorkspace } from '../../../utils/agentEvidenceModel';
import type { RegistryProject } from '../../../data/demoProjectRegistry';
import type { RuntimeMode } from '../../../runtime/difaryxRuntimeMode';
import type { ClaimBoundaryArtifact, ReasoningProvenance, ResearchEvidenceItem } from '../../../types/researchEvidence';
import type { ScientificStageId } from '../CenterColumn/CompactWorkflowStepper';
import { ANALYSIS_MODE_REGISTRY, PARAMETER_SCHEMA_VERSION } from '../../../data/parameterDefinitions';

type InspectorTab = 'context' | 'evidence' | 'reasoning' | 'validation' | 'trace';

interface NormalizedToolTraceEntry {
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

interface RightPanelProps {
  agentContext: AgentContext;
  mode: 'deterministic' | 'guided' | 'autonomous';
  activeStage?: ScientificStageId;
  onSaveToNotebook?: () => void;
  onExportReport?: () => void;
  draftParameters?: WorkspaceParameters;
  onDraftParameterChange?: (groupId: ParameterGroupId, key: string, value: string) => void;
  onApplyParameters?: () => void;
  onResetParameters?: () => void;
  isConditionLocked?: boolean;
  onUnlockConditions?: () => void;
  onLockConditions?: () => void;
  evidenceWorkspace?: AgentEvidenceWorkspace;
  registryProject?: RegistryProject;
  toolTrace?: NormalizedToolTraceEntry[];
  runtimeMode?: RuntimeMode;
  approvalLedgerProjectId?: string;
  approvalLedgerBundleId?: string;
  modelMode?: 'scientific-baseline' | 'gpt-5.6' | 'gemini-2.5-flash';
  llmState?: { output: unknown; usedLlm: boolean; fallbackUsed: boolean };
  researchEvidence?: ResearchEvidenceItem[];
  reasoningProvenance?: ReasoningProvenance | null;
  claimBoundary?: ClaimBoundaryArtifact | null;
  bundleLabel?: string;
}

const TABS: Array<{ id: InspectorTab; label: string }> = [
  { id: 'context', label: 'Context' },
  { id: 'evidence', label: 'Evidence' },
  { id: 'reasoning', label: 'Reasoning' },
  { id: 'validation', label: 'Validation' },
  { id: 'trace', label: 'Trace' },
];

const STAGE_TO_TAB: Record<ScientificStageId, InspectorTab> = {
  objective: 'context',
  evidence: 'evidence',
  reasoning: 'reasoning',
  validation: 'validation',
  decision: 'validation',
  memory: 'trace',
};

function InspectorCard({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-900"><Icon size={14} className="text-blue-600" />{title}</div>
      {children}
    </section>
  );
}

function CompactRow({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="grid grid-cols-[104px_1fr] gap-2 border-t border-slate-100 py-1.5 first:border-t-0"><span className="text-[10px] text-slate-500">{label}</span><span className="text-[11px] font-medium leading-4 text-slate-800">{value}</span></div>;
}

function BoundaryList({ title, items, tone }: { title: string; items: string[]; tone: 'emerald' | 'amber' | 'rose' }) {
  const styles = { emerald: 'bg-emerald-50 text-emerald-900', amber: 'bg-amber-50 text-amber-950', rose: 'bg-rose-50 text-rose-950' };
  return (
    <div className={`rounded-md p-2 ${styles[tone]}`}>
      <div className="text-[10px] font-semibold">{title}</div>
      <ul className="mt-1 space-y-1 text-[10px] leading-4">{(items.length ? items : ['None recorded']).slice(0, 3).map((item, index) => <li key={index}>• {item}</li>)}</ul>
    </div>
  );
}

export function RightPanel(props: RightPanelProps) {
  const [activeTab, setActiveTab] = useState<InspectorTab>('context');
  useEffect(() => {
    if (props.activeStage) setActiveTab(STAGE_TO_TAB[props.activeStage]);
  }, [props.activeStage]);

  const boundary = props.registryProject?.agentWorkflow.claimBoundary ?? props.agentContext.boundaryContext;
  const fallbackUsed = props.llmState?.fallbackUsed ?? props.reasoningProvenance?.fallbackUsed ?? false;
  const selectedMode = props.modelMode === 'gpt-5.6'
    ? ANALYSIS_MODE_REGISTRY['gpt-5.6-scientific']
    : props.modelMode === 'gemini-2.5-flash'
      ? ANALYSIS_MODE_REGISTRY['gemini-2.5-flash']
      : ANALYSIS_MODE_REGISTRY['scientific-baseline'];
  const availableLayers = props.agentContext.evidenceLayers.filter((layer) => layer.status === 'available');
  const missingLayers = props.agentContext.evidenceLayers.filter((layer) => layer.status !== 'available');

  return (
    <aside className="flex w-[348px] shrink-0 flex-col border-l border-slate-200 bg-slate-50">
      <div className="border-b border-slate-200 bg-white px-3 pt-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs font-semibold text-slate-950">Inspector</div>
          <div className="text-[10px] text-slate-500">Structured review record</div>
        </div>
        <div className="grid grid-cols-5">
          {TABS.map((tab) => (
            <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={`border-b-2 px-1 py-2 text-[10px] font-semibold transition-colors ${activeTab === tab.id ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-900'}`}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {activeTab === 'context' && (
          <>
            <InspectorCard title="Review context" icon={Target}>
              <CompactRow label="Objective" value={props.agentContext.objective} />
              <CompactRow label="Material" value={props.agentContext.materialSystem} />
              <CompactRow label="Job type" value={props.agentContext.jobType === 'rnd' ? 'R&D' : props.agentContext.jobType} />
              <CompactRow label="Condition lock" value={props.isConditionLocked ? 'Locked' : 'Not locked'} />
              <CompactRow label="Overrides" value={`${props.agentContext.parameterOverrides.length} parameter changes`} />
            </InspectorCard>
            <button type="button" onClick={props.isConditionLocked ? props.onUnlockConditions : props.onLockConditions} className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-100">
              {props.isConditionLocked ? <Unlock size={13} /> : <Lock size={13} />}{props.isConditionLocked ? 'Unlock conditions' : 'Lock conditions'}
            </button>
          </>
        )}

        {activeTab === 'evidence' && (
          <>
            <InspectorCard title="Evidence bundle" icon={Database}>
              <CompactRow label="Bundle" value={props.bundleLabel ?? 'Prepared evidence bundle'} />
              <CompactRow label="Available" value={availableLayers.map((layer) => layer.technique).join(', ') || 'None'} />
              <CompactRow label="Missing" value={missingLayers.map((layer) => layer.technique).join(', ') || 'None required'} />
              <CompactRow label="Primary" value={props.agentContext.primaryTechnique} />
            </InspectorCard>
            <InspectorCard title="Extracted observations" icon={CheckCircle2}>
              <div className="space-y-2">{availableLayers.slice(0, 4).map((layer) => <div key={layer.technique} className="text-[10px] leading-4 text-slate-700"><span className="font-semibold text-slate-900">{layer.technique}:</span> {layer.summary}</div>)}</div>
            </InspectorCard>
          </>
        )}

        {activeTab === 'reasoning' && (
          <>
            <InspectorCard title="Model provenance" icon={Brain}>
              <CompactRow label="Active mode" value={selectedMode.label} />
              <CompactRow label="Model" value={selectedMode.model ?? 'No LLM'} />
              <CompactRow label="Execution" value={selectedMode.usesLlm ? (fallbackUsed ? 'Scientific Baseline fallback active' : 'Model reasoning active') : 'Rule-based analysis, limited interpretation'} />
              <CompactRow label="Generated" value={props.reasoningProvenance?.generatedAt ? new Date(props.reasoningProvenance.generatedAt).toLocaleString() : 'Prepared demo record'} />
              <CompactRow label="Schema" value={PARAMETER_SCHEMA_VERSION} />
              <CompactRow label="Literature" value={`${props.reasoningProvenance?.literatureCount ?? props.researchEvidence?.length ?? 0} linked references`} />
            </InspectorCard>
            <InspectorCard title="Scientific rationale" icon={FileText}>
              <p className="text-[11px] leading-5 text-slate-700">{props.registryProject?.notebook.interpretation ?? props.agentContext.discussionContext.interpretation}</p>
            </InspectorCard>
          </>
        )}

        {activeTab === 'validation' && (
          <>
            <BoundaryList title="Supported" items={boundary.supported} tone="emerald" />
            <BoundaryList title="Validation-limited" items={boundary.validationLimited} tone="amber" />
            <BoundaryList title="Cannot conclude" items={boundary.cannotConclude} tone="rose" />
            <InspectorCard title="Critical boundary" icon={ShieldAlert}>
              <CompactRow label="Gap" value={props.registryProject?.crossTechniqueComparison.validationGap ?? props.agentContext.validationGaps[0]?.description ?? 'No critical gap recorded'} />
              <CompactRow label="Required next" value={boundary.requiredNext[0] ?? props.registryProject?.crossTechniqueComparison.recommendedNextAction ?? 'Independent validation'} />
              <CompactRow label="Readiness" value={`${props.registryProject?.reportReadiness ?? 30}% publication readiness`} />
            </InspectorCard>
          </>
        )}

        {activeTab === 'trace' && (
          <InspectorCard title="Internal technical trace" icon={Terminal}>
            <div className="space-y-3">
              {(props.toolTrace?.length ? props.toolTrace.map((entry) => ({ id: entry.id, label: entry.toolName, detail: entry.resultSummary || entry.argsSummary, status: entry.status })) : props.agentContext.traceContext.steps.map((step, index) => ({ id: String(index), label: step.label, detail: step.detail, status: 'pending' as const }))).map((entry, index) => (
                <div key={entry.id} className="grid grid-cols-[20px_1fr] gap-2">
                  <div className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-semibold ${entry.status === 'complete' ? 'bg-emerald-100 text-emerald-800' : entry.status === 'running' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-600'}`}>{index + 1}</div>
                  <div><div className="text-[11px] font-semibold text-slate-900">{entry.label}</div><div className="mt-0.5 text-[10px] leading-4 text-slate-600">{entry.detail}</div></div>
                </div>
              ))}
            </div>
            <div className="mt-3 border-t border-slate-200 pt-2 text-[10px] text-slate-500">Runtime: {props.runtimeMode ?? 'demo'} · Technical stages are audit detail, not the user-facing workflow.</div>
          </InspectorCard>
        )}
      </div>
    </aside>
  );
}
