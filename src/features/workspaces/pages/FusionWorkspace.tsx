import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  Layers,
  Zap,
} from 'lucide-react';
import { DashboardLayout } from '../../../shared/layout/DashboardLayout';
import { EmptyStateCard } from '../../../shared/ui/EmptyStateCard';
import { runUniversalFusionAgent } from '../../../agents/fusionAgent/runner';
import type { FusedFinding, FusionTier } from '../../../agents/fusionAgent/types';
import { getRegistryProject, normalizeRegistryProjectId } from '../../../data/demoProjectRegistry';
import { DEFAULT_PROJECT_ID } from '../../../data/demoProjects';
import { runWhenIdle } from '../../../utils/idle';

export default function FusionWorkspace() {
  const [searchParams] = useSearchParams();
  const registryProject = getRegistryProject(normalizeRegistryProjectId(searchParams.get('project')) || DEFAULT_PROJECT_ID);
  const [activeTab, setActiveTab] = useState<'decision' | 'matrix' | 'claims' | 'contradictions' | 'report'>('decision');
  const [fusedFindings, setFusedFindings] = useState<FusedFinding[] | null>(null);
  const requiredFusionTechniques = ['xps', 'ftir', 'raman'] as const;
  const missingFusionTechniques = requiredFusionTechniques.filter(
    (technique) => !registryProject.selectedTechniques.includes(technique),
  );
  const hasFusionBundle = missingFusionTechniques.length === 0;

  // Run fusion analysis
  const handleRunFusion = () => {
    if (!hasFusionBundle) {
      setFusedFindings(null);
      return;
    }

    const findings = runUniversalFusionAgent();
    setFusedFindings(findings);
  };

  // Auto-run fusion on mount
  React.useEffect(() => {
    return runWhenIdle(handleRunFusion);
  }, [registryProject.id, hasFusionBundle]);

  const getTierBadgeColor = (tier: FusionTier) => {
    switch (tier) {
      case 'CORROBORATED':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'SUPPORTED':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'SINGLE-SOURCE':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'CONTESTED':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'UNVERIFIED':
      default:
        return 'bg-gray-100 text-gray-700 border-gray-300';
    }
  };

  // Left Panel Content
  const leftPanel = (
    <div className="space-y-4">
      {/* Project Info */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Project Information</h3>
        <div className="space-y-2 text-sm">
          <div>
            <span className="text-gray-500">Project:</span>
            <span className="ml-2 font-medium">{registryProject.title}</span>
          </div>
          <div>
            <span className="text-gray-500">Sample:</span>
            <span className="ml-2 font-medium">{registryProject.materialSystem}</span>
          </div>
        </div>
      </div>

      {/* Included Techniques */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Included Techniques</h3>
        <div className="space-y-2">
          {registryProject.selectedTechniques
            .filter((technique) => technique !== 'multi')
            .map((technique) => (
              <div key={technique} className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <span>{technique.toUpperCase()}</span>
              </div>
            ))}
          {missingFusionTechniques.map((technique) => (
            <div key={technique} className="flex items-center gap-2 text-sm text-amber-700">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <span>{technique.toUpperCase()} pending</span>
            </div>
          ))}
        </div>
      </div>

      {/* Fusion Rules */}
      <div className="bg-blue-50 rounded-lg border border-blue-200 p-4">
        <h3 className="text-sm font-semibold text-blue-900 mb-2 flex items-center gap-2">
          <Layers className="w-4 h-4" />
          Fusion Rules
        </h3>
        <div className="text-xs text-blue-800 space-y-1">
          <div>• <strong>Unweighted Counting:</strong> Tiers derive strictly from independent evidence sources</div>
          <div>• <strong>Registry Pinned:</strong> Forbidden oxidation states trigger CONTESTED tier</div>
          <div>• <strong>Surface Stratification:</strong> XPS surface states vs bulk structural phases</div>
          <div className="mt-2 pt-2 border-t border-blue-200">
            Status based on unweighted independent convergence
          </div>
        </div>
      </div>

      {/* Run Fusion Button */}
      <button
        onClick={handleRunFusion}
        disabled={!hasFusionBundle}
        className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:text-gray-600 text-white font-medium py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors"
      >
        <Zap className="w-5 h-5" />
        {hasFusionBundle ? 'Run Fusion' : 'Fusion Pending Evidence'}
      </button>
    </div>
  );

  // Helper rendering FusedFinding card
  const renderFindingCard = (finding: FusedFinding, index: number) => (
    <div key={index} className="bg-white rounded-lg border border-gray-200 p-6 space-y-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-3">
        <h3 className="text-base font-bold text-gray-900">
          {finding.canonicalFormula} {finding.canonicalPolymorph ? `(${finding.canonicalPolymorph})` : ''}
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 font-semibold">Formula Tier:</span>
          <span className={`px-2.5 py-0.5 rounded text-xs font-bold border ${getTierBadgeColor(finding.formulaTier)}`}>
            {finding.formulaTier}
          </span>
          <span className="text-xs text-gray-500 font-semibold ml-2">Polymorph Tier:</span>
          <span className={`px-2.5 py-0.5 rounded text-xs font-bold border ${getTierBadgeColor(finding.polymorphTier)}`}>
            {finding.polymorphTier}
          </span>
        </div>
      </div>

      {finding.isSurfaceBulkDiscrepancy && (
        <div className="rounded border border-amber-300 bg-amber-50 p-3 text-xs font-medium text-amber-900 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <span>Surface vs. Bulk Discrepancy Detected: XPS surface chemistry diverges from bulk structural phases.</span>
        </div>
      )}

      <div>
        <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Supporting Contributions ({finding.supportingContributions.length})</h4>
        {finding.supportingContributions.length > 0 ? (
          <div className="space-y-2">
            {finding.supportingContributions.map((c, idx) => {
              const prov = c.sourceNode.provenance;
              return (
                <div key={idx} className="rounded border border-gray-200 bg-gray-50 p-2.5 text-xs text-gray-800">
                  <div className="font-semibold flex items-center justify-between">
                    <span>{c.technique} — {c.contributionType}</span>
                    <span className="text-gray-500 font-normal">Raw Conf: {Math.round(c.rawConfidence * 100)}%</span>
                  </div>
                  <div className="text-[11px] text-gray-600 mt-1 font-mono break-all">
                    Provenance: dbSource={prov?.dbSource ?? 'undefined'} | sourceId={prov?.sourceId ?? 'undefined'} | sourceDoi={prov?.sourceDoi ?? 'undefined'}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-xs text-gray-500 italic">No supporting contributions recorded.</div>
        )}
      </div>

      <div>
        <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Contesting Contributions ({finding.contestingContributions.length})</h4>
        {finding.contestingContributions.length > 0 ? (
          <div className="space-y-2">
            {finding.contestingContributions.map((c, idx) => {
              const prov = c.sourceNode.provenance;
              return (
                <div key={idx} className="rounded border border-red-200 bg-red-50 p-2.5 text-xs text-red-900">
                  <div className="font-semibold flex items-center justify-between">
                    <span>{c.technique} — {c.contributionType}</span>
                    <span className="text-red-700 font-normal">Raw Conf: {Math.round(c.rawConfidence * 100)}%</span>
                  </div>
                  <div className="text-[11px] text-red-800 mt-1 font-mono break-all">
                    Provenance: dbSource={prov?.dbSource ?? 'undefined'} | sourceId={prov?.sourceId ?? 'undefined'} | sourceDoi={prov?.sourceDoi ?? 'undefined'}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-xs text-gray-500 italic">No contesting contributions recorded.</div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-gray-100 text-xs">
        <div>
          <span className="font-bold text-gray-700 block mb-1">Absent Techniques:</span>
          <span className="text-gray-600">{finding.absentTechniques.length > 0 ? finding.absentTechniques.join(', ') : 'None'}</span>
        </div>
        <div>
          <span className="font-bold text-gray-700 block mb-1">Inherited Caveats:</span>
          <span className="text-gray-600">{finding.inheritedCaveats.length > 0 ? finding.inheritedCaveats.join('; ') : 'None'}</span>
        </div>
      </div>
    </div>
  );

  // Right Panel Content
  const rightPanel = fusedFindings ? (
    <div className="space-y-4">
      {/* Characterization Overview */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Characterization Overview</h3>
        <p className="text-sm text-gray-700 leading-relaxed">
          {fusedFindings.length > 0
            ? `Identified ${fusedFindings.length} canonical phase match(es). Primary finding: ${fusedFindings[0].canonicalFormula} (${fusedFindings[0].formulaTier}).`
            : 'No verified canonical phases evaluated (UNVERIFIED).'}
        </p>
      </div>

      {/* Interpretation Stats */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Evaluation Tiers</h3>
        <div className="space-y-3">
          <div>
            <div className="text-xs text-gray-500 mb-1">Highest Tier</div>
            <div className="flex items-center gap-2">
              <span className={`px-3 py-1 rounded-full text-sm font-medium border ${getTierBadgeColor(fusedFindings[0]?.formulaTier ?? 'UNVERIFIED')}`}>
                {fusedFindings[0]?.formulaTier ?? 'UNVERIFIED'}
              </span>
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">Total Findings Evaluated</div>
            <div className="text-lg font-semibold text-gray-900">
              {fusedFindings.length}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">Contested Findings</div>
            <div className="text-lg font-semibold text-gray-900">
              {fusedFindings.filter(f => f.formulaTier === 'CONTESTED' || f.polymorphTier === 'CONTESTED').length}
            </div>
          </div>
        </div>
      </div>

      {/* Recommended Validation */}
      <div className="bg-amber-50 rounded-lg border border-amber-200 p-4">
        <h3 className="text-sm font-semibold text-amber-900 mb-2 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          Validation Gaps & Caveats
        </h3>
        <ul className="text-xs text-amber-800 space-y-1">
          {fusedFindings.flatMap(f => f.inheritedCaveats).slice(0, 4).map((rec, idx) => (
            <li key={idx}>• {rec}</li>
          ))}
          {fusedFindings.flatMap(f => f.inheritedCaveats).length === 0 && (
            <li>• No critical validation caveats reported.</li>
          )}
        </ul>
      </div>
    </div>
  ) : (
    <div className="p-4">
      <EmptyStateCard
        type={hasFusionBundle ? "not_executed" : "missing_evidence"}
        title={hasFusionBundle ? "Fusion Analysis Not Executed" : "Fusion Evidence Pending"}
        description={hasFusionBundle ? "Run fusion to evaluate cross-technique results." : `Missing ${missingFusionTechniques.map((t) => t.toUpperCase()).join(', ')} evidence.`}
        actionText={hasFusionBundle ? "Run Fusion" : undefined}
        onAction={hasFusionBundle ? handleRunFusion : undefined}
      />
    </div>
  );

  // Center Panel Content
  const centerPanel = fusedFindings ? (
    <div className="h-full flex flex-col">
      {/* Tab Bar */}
      <div className="flex border-b border-gray-200 bg-white">
        <button
          onClick={() => setActiveTab('decision')}
          className={`px-6 py-3 text-sm font-medium transition-colors ${
            activeTab === 'decision'
              ? 'border-b-2 border-indigo-600 text-indigo-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Interpretation
        </button>
        <button
          onClick={() => setActiveTab('matrix')}
          className={`px-6 py-3 text-sm font-medium transition-colors ${
            activeTab === 'matrix'
              ? 'border-b-2 border-indigo-600 text-indigo-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Cross-Technique Insights
        </button>
        <button
          onClick={() => setActiveTab('claims')}
          className={`px-6 py-3 text-sm font-medium transition-colors ${
            activeTab === 'claims'
              ? 'border-b-2 border-indigo-600 text-indigo-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Review Cards
        </button>
        <button
          onClick={() => setActiveTab('contradictions')}
          className={`px-6 py-3 text-sm font-medium transition-colors ${
            activeTab === 'contradictions'
              ? 'border-b-2 border-indigo-600 text-indigo-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Contradictions
        </button>
        <button
          onClick={() => setActiveTab('report')}
          className={`px-6 py-3 text-sm font-medium transition-colors ${
            activeTab === 'report'
              ? 'border-b-2 border-indigo-600 text-indigo-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Report
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-auto p-6 bg-gray-50">
        {activeTab === 'decision' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Report-Ready Fusion Summary</h3>
              <p className="text-gray-700 leading-relaxed mb-4 text-sm">
                Cross-technique review evaluated {fusedFindings.length} phase candidates across independent evidence streams. Tiers are derived strictly from independent evidence counting and canonical phase compatibility.
              </p>
            </div>
            {fusedFindings.map((finding, idx) => renderFindingCard(finding, idx))}
          </div>
        )}

        {activeTab === 'matrix' && (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Canonical Phase</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-700">Formula Tier</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-700">Supporting Techniques</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-700">Contesting Techniques</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-700">Absent Techniques</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {fusedFindings.map((finding, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {finding.canonicalFormula} {finding.canonicalPolymorph ? `(${finding.canonicalPolymorph})` : ''}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-1 rounded text-xs font-bold border ${getTierBadgeColor(finding.formulaTier)}`}>
                          {finding.formulaTier}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-gray-700">
                        {finding.supportingContributions.map(c => c.technique).join(', ') || 'None'}
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-red-700 font-medium">
                        {finding.contestingContributions.map(c => c.technique).join(', ') || 'None'}
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-gray-500">
                        {finding.absentTechniques.join(', ') || 'None'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'claims' && (
          <div className="space-y-6">
            {fusedFindings.map((finding, idx) => renderFindingCard(finding, idx))}
          </div>
        )}

        {activeTab === 'contradictions' && (
          <div className="space-y-6">
            {fusedFindings.filter(f => f.formulaTier === 'CONTESTED' || f.polymorphTier === 'CONTESTED' || f.contestingContributions.length > 0 || f.isSurfaceBulkDiscrepancy).length === 0 ? (
              <EmptyStateCard
                type="generic"
                title="No Contradictions Detected"
                description="Cross-technique evaluation indicates consistent evidence boundaries. No conflicts identified."
              />
            ) : (
              fusedFindings
                .filter(f => f.formulaTier === 'CONTESTED' || f.polymorphTier === 'CONTESTED' || f.contestingContributions.length > 0 || f.isSurfaceBulkDiscrepancy)
                .map((finding, idx) => renderFindingCard(finding, idx))
            )}
          </div>
        )}

        {activeTab === 'report' && (
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="prose prose-sm max-w-none">
              <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans">
{`# Cross-Technique Evidence Fusion Report

## 1. Evaluated Phase Findings
${fusedFindings.map(f => `
### ${f.canonicalFormula} ${f.canonicalPolymorph ? `(${f.canonicalPolymorph})` : ''}
- **Formula Tier**: ${f.formulaTier}
- **Polymorph Tier**: ${f.polymorphTier}
- **Surface/Bulk Discrepancy**: ${f.isSurfaceBulkDiscrepancy ? 'Yes' : 'No'}
- **Supporting Contributions**: ${f.supportingContributions.map(c => `${c.technique} (${c.contributionType}) [dbSource: ${c.sourceNode.provenance?.dbSource ?? 'undefined'}, sourceId: ${c.sourceNode.provenance?.sourceId ?? 'undefined'}, DOI: ${c.sourceNode.provenance?.sourceDoi ?? 'undefined'}]`).join('; ') || 'None'}
- **Contesting Contributions**: ${f.contestingContributions.map(c => `${c.technique} (${c.contributionType})`).join('; ') || 'None'}
- **Absent Techniques**: ${f.absentTechniques.join(', ') || 'None'}
- **Inherited Caveats**: ${f.inheritedCaveats.join('; ') || 'None'}
`).join('\n')}
`}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  ) : (
    <div className="h-full flex items-center justify-center bg-gray-50 p-4">
      <EmptyStateCard
        type="not_executed"
        title="Fusion Results Not Loaded"
        description="Execute cross-technique fusion from the controls on the left."
      />
    </div>
  );

  return (
    <DashboardLayout>
      <div className="flex-1 overflow-y-auto bg-gray-50">
        <div className="grid min-h-full gap-4 p-4 xl:grid-cols-[280px_minmax(0,1fr)_320px]">
          <aside className="space-y-4">{leftPanel}</aside>
          <main className="min-w-0">{centerPanel}</main>
          <aside className="space-y-4">{rightPanel}</aside>
        </div>
      </div>
    </DashboardLayout>
  );
}
