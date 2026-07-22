import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BrainCircuit,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Columns3,
  Database,
  Download,
  Expand,
  Eye,
  FileChartColumn,
  FileText,
  GripHorizontal,
  GripVertical,
  Info,
  Layers,
  Maximize2,
  Menu,
  MessageSquareText,
  Minimize2,
  MoreHorizontal,
  MousePointer2,
  Move,
  PanelBottomOpen,
  PanelRightClose,
  PanelRightOpen,
  RotateCcw,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
  X,
  ZoomIn,
} from 'lucide-react';
import { Graph } from '../../../shared/ui/Graph';
import { RawFileUploadModal } from './RawFileUploadModal';
import { ReportPreviewPanel } from './ReportPreviewPanel';
import { processWorkspaceSignal } from '../../../utils/workspaceSignalProcessor';
import type { UploadedSignalRun } from '../../../data/uploadedSignalRuns';
import {
  buildReferencePresentation,
  readImportedReferenceFile,
  writeImportedReferenceFile,
} from '../../../utils/referencePresentation';
import type { ImportedReferenceFile, ReferencePresentation } from '../../../utils/reportPreviewTypes';
import {
  ANALYSIS_MODE_REGISTRY,
  PARAMETER_SCHEMA_VERSION,
  createCanonicalParameterContext,
  getCanonicalDefaultValues,
  getWorkspaceParameterControls,
  type AnalysisModeId,
  type CanonicalParameterValue,
  type CanonicalWorkspaceControl,
} from '../../../data/parameterDefinitions';
import { createEvidenceOutput, type EvidenceOutputKind } from '../../../evidence/canonicalEvidence';
import { readParameterState, setParameterOverride, setParameterOverrides } from '../../../utils/parameterStateManager';
import { getRegionWindowByValue } from '../../../data/xpsReferenceData';
import {
  buildAgentProcessingPlan,
  type AgentProcessingPlanStep,
  type ProcessingPlanStepId,
} from '../../../agent/processing/processingStepPlanner';

type TechniqueId = 'xrd' | 'xps' | 'ftir' | 'raman';
type AnalysisMode = AnalysisModeId;
type ResultTab = 'observations' | 'peaks' | 'reasoning' | 'validation' | 'report';
type InspectorTab = 'settings' | 'data' | 'discuss';
type GraphTool = 'zoom' | 'pan' | 'select';

interface SignalPoint {
  x: number;
  y: number;
}

interface PeakResult {
  position: number;
  intensity: number;
  spacing: string;
  assignment: string;
  reference: string;
  score: number;
  confidence: 'High' | 'Medium' | 'Limited';
}

interface WorkspaceFile {
  id: string;
  filename: string;
  extension: string;
  technique: TechniqueId;
  status: 'Processed' | 'Validated' | 'Needs review' | 'Processing';
  uploadedAt: string;
  instrument: string;
  sampleId: string;
  xLabel: string;
  yLabel: string;
  points: SignalPoint[];
  peaks: PeakResult[];
  observation: string;
  interpretation: string;
  validationGap: string;
  nextExperiment: string;
  quality: string;
}

const TECHNIQUE_META: Record<TechniqueId, { label: string; color: string; soft: string; role: string }> = {
  xrd: { label: 'XRD', color: '#2783DE', soft: '#E5F2FC', role: 'Crystallographic evidence' },
  xps: { label: 'XPS', color: '#7C5CE7', soft: '#F0ECFF', role: 'Surface chemistry evidence' },
  ftir: { label: 'FTIR', color: '#D95D52', soft: '#FCE9E7', role: 'Bonding evidence' },
  raman: { label: 'Raman', color: '#32875B', soft: '#E8F1EC', role: 'Vibrational evidence' },
};

const RESULT_TABS: Array<{ id: ResultTab; label: string; icon: React.ElementType }> = [
  { id: 'observations', label: 'Observations', icon: FileChartColumn },
  { id: 'peaks', label: 'Peak table', icon: Columns3 },
  { id: 'reasoning', label: 'Reasoning', icon: BrainCircuit },
  { id: 'validation', label: 'Validation', icon: ShieldCheck },
  { id: 'report', label: 'Report preview', icon: FileText },
];

const MODE_PROFILES: Record<AnalysisMode, {
  shortLabel: string;
  fullLabel: string;
  available: string;
  unavailable: string;
  depth: string;
  confidence: number;
}> = {
  'gpt-5.6-scientific': {
    shortLabel: 'GPT-5.6',
    fullLabel: 'GPT-5.6 Scientific Reasoning',
    available: 'Claim-evidence chains, cross-technique synthesis, validation rationale, contextual discussion',
    unavailable: 'Independent experimental validation',
    depth: 'Deep structured interpretation',
    confidence: 88,
  },
  'gemini-2.5-flash': {
    shortLabel: 'Gemini 2.5 Flash',
    fullLabel: 'Gemini 2.5 Flash',
    available: 'Rapid evidence summary, multimodal context, reference overview, concise discussion',
    unavailable: 'Full claim-evidence trace and deeper validation rationale in this workspace profile',
    depth: 'Rapid evidence synthesis',
    confidence: 79,
  },
  'scientific-baseline': {
    shortLabel: 'Baseline',
    fullLabel: 'Scientific Baseline Mode',
    available: 'Parsing, baseline correction, peak detection, reference matching, rule observations',
    unavailable: 'Generated reasoning, evidence synthesis, contextual discussion',
    depth: 'Measurements and rules only',
    confidence: 72,
  },
};

function gaussian(x: number, center: number, width: number, amplitude: number) {
  return amplitude * Math.exp(-0.5 * ((x - center) / width) ** 2);
}

function makeSignal(
  start: number,
  end: number,
  count: number,
  peaks: Array<[number, number, number]>,
  baseline = 4,
  inverted = false,
): SignalPoint[] {
  return Array.from({ length: count }, (_, index) => {
    const x = start + ((end - start) * index) / (count - 1);
    const wave = Math.sin(index * 0.37) * 0.65 + Math.cos(index * 0.11) * 0.38;
    const peakValue = peaks.reduce((sum, [center, width, amplitude]) => sum + gaussian(x, center, width, amplitude), 0);
    const raw = Math.max(0, baseline + wave + peakValue);
    return { x, y: inverted ? Math.max(1, 100 - raw) : raw };
  });
}

const DEFAULT_FILES: WorkspaceFile[] = [
  {
    id: 'xrd-001',
    filename: 'cuFe2o4_sba15_xrd_001.xy',
    extension: 'XY',
    technique: 'xrd',
    status: 'Validated',
    uploadedAt: '21 Jul 2026, 09:42',
    instrument: 'Bruker D8 Advance',
    sampleId: 'CFO-SBA15-07',
    xLabel: '2θ (°)',
    yLabel: 'Intensity (a.u.)',
    points: makeSignal(10, 80, 520, [[18.1, 0.22, 21], [30.1, 0.28, 43], [35.5, 0.24, 84], [43.2, 0.32, 34], [53.6, 0.34, 27], [57.1, 0.26, 49], [62.7, 0.3, 39]], 5),
    peaks: [
      { position: 30.12, intensity: 53.2, spacing: '2.966 Å', assignment: '(220)', reference: '30.10°', score: 0.96, confidence: 'High' },
      { position: 35.48, intensity: 94.1, spacing: '2.528 Å', assignment: '(311)', reference: '35.51°', score: 0.98, confidence: 'High' },
      { position: 43.21, intensity: 43.7, spacing: '2.092 Å', assignment: '(400)', reference: '43.18°', score: 0.94, confidence: 'High' },
      { position: 57.08, intensity: 58.6, spacing: '1.612 Å', assignment: '(511)', reference: '57.04°', score: 0.91, confidence: 'Medium' },
      { position: 62.69, intensity: 47.8, spacing: '1.481 Å', assignment: '(440)', reference: '62.62°', score: 0.89, confidence: 'Medium' },
    ],
    observation: 'Seven resolved reflections are detected. The strongest feature occurs at 35.48° 2θ with aligned reference markers at 30.10°, 35.51°, and 43.18°.',
    interpretation: 'The reflection pattern is consistent with spinel-related crystallographic evidence. The broad low-angle contribution may be compatible with the SBA-15 support.',
    validationGap: 'Phase purity and synthesis success cannot be concluded from this XRD pattern alone. Quantitative refinement and complementary composition evidence are missing.',
    nextExperiment: 'Run Rietveld refinement with an approved reference set, then compare bulk composition with ICP-OES or equivalent elemental analysis.',
    quality: 'High signal-to-background; 98.7% numeric rows accepted',
  },
  {
    id: 'xps-001',
    filename: 'cuFe2o4_sba15_xps_001.csv',
    extension: 'CSV',
    technique: 'xps',
    status: 'Processed',
    uploadedAt: '21 Jul 2026, 09:45',
    instrument: 'Thermo K-Alpha+',
    sampleId: 'CFO-SBA15-07',
    xLabel: 'Binding energy (eV)',
    yLabel: 'Counts / s',
    points: makeSignal(0, 1200, 620, [[103.4, 12, 48], [285, 13, 35], [530.2, 11, 66], [711.1, 10, 55], [724.6, 12, 31], [933.5, 10, 44]], 7),
    peaks: [
      { position: 103.4, intensity: 57.1, spacing: 'n/a', assignment: 'Si 2p', reference: '103.3 eV', score: 0.93, confidence: 'High' },
      { position: 530.2, intensity: 74.3, spacing: 'n/a', assignment: 'O 1s', reference: '530.1 eV', score: 0.96, confidence: 'High' },
      { position: 711.1, intensity: 64.8, spacing: 'n/a', assignment: 'Fe 2p₃/₂', reference: '710.8 eV', score: 0.88, confidence: 'Medium' },
      { position: 933.5, intensity: 52.9, spacing: 'n/a', assignment: 'Cu 2p₃/₂', reference: '933.6 eV', score: 0.9, confidence: 'Medium' },
    ],
    observation: 'Survey regions corresponding to Si, O, Fe, and Cu are detected. The Fe and Cu regions require calibrated high-resolution fitting before oxidation-state interpretation.',
    interpretation: 'The surface composition supports the presence of Cu- and Fe-containing species on a silica-related surface environment.',
    validationGap: 'Charge calibration and constrained component fitting are required. XPS cannot establish bulk composition or complete phase identity.',
    nextExperiment: 'Acquire calibrated high-resolution Fe 2p and Cu 2p regions with documented background and fitting constraints.',
    quality: 'Good survey coverage; charge reference requires review',
  },
  {
    id: 'ftir-001',
    filename: 'cuFe2o4_sba15_ftir_001.csv',
    extension: 'CSV',
    technique: 'ftir',
    status: 'Needs review',
    uploadedAt: '21 Jul 2026, 09:49',
    instrument: 'Nicolet iS50',
    sampleId: 'CFO-SBA15-07',
    xLabel: 'Wavenumber (cm⁻¹)',
    yLabel: 'Transmittance (%)',
    points: makeSignal(400, 4000, 560, [[580, 36, 26], [810, 40, 17], [1082, 78, 54], [1632, 60, 15], [3440, 190, 26]], 1, true),
    peaks: [
      { position: 580, intensity: 73.6, spacing: 'n/a', assignment: 'M–O vibration', reference: '570–600 cm⁻¹', score: 0.86, confidence: 'Medium' },
      { position: 810, intensity: 82.1, spacing: 'n/a', assignment: 'Si–O symmetric', reference: '800 cm⁻¹', score: 0.9, confidence: 'High' },
      { position: 1082, intensity: 45.3, spacing: 'n/a', assignment: 'Si–O–Si stretch', reference: '1080 cm⁻¹', score: 0.95, confidence: 'High' },
      { position: 3440, intensity: 72.8, spacing: 'n/a', assignment: 'O–H stretch', reference: '3200–3600 cm⁻¹', score: 0.78, confidence: 'Limited' },
    ],
    observation: 'A dominant band at 1082 cm⁻¹ and a secondary band near 810 cm⁻¹ are resolved. A broad O–H region is present from approximately 3200 to 3600 cm⁻¹.',
    interpretation: 'The bands support a silica-related bonding environment with a low-wavenumber metal–oxygen contribution.',
    validationGap: 'FTIR does not independently establish crystal structure or phase purity. Moisture contribution and baseline choice remain unresolved.',
    nextExperiment: 'Repeat after controlled drying and compare against approved support and precursor spectra using identical processing.',
    quality: 'Usable spectrum; baseline sensitivity at low wavenumber',
  },
  {
    id: 'raman-001',
    filename: 'cuFe2o4_sba15_raman_001.txt',
    extension: 'TXT',
    technique: 'raman',
    status: 'Processed',
    uploadedAt: '21 Jul 2026, 09:53',
    instrument: 'Renishaw inVia Qontor',
    sampleId: 'CFO-SBA15-07',
    xLabel: 'Raman shift (cm⁻¹)',
    yLabel: 'Intensity (a.u.)',
    points: makeSignal(100, 1200, 560, [[215, 9, 14], [305, 13, 19], [472, 17, 25], [586, 19, 36], [685, 18, 64]], 4),
    peaks: [
      { position: 215, intensity: 18.5, spacing: 'n/a', assignment: 'T₂g-related mode', reference: '210–220 cm⁻¹', score: 0.8, confidence: 'Medium' },
      { position: 472, intensity: 29.7, spacing: 'n/a', assignment: 'E₉-related mode', reference: '465–480 cm⁻¹', score: 0.84, confidence: 'Medium' },
      { position: 586, intensity: 40.2, spacing: 'n/a', assignment: 'T₂g-related mode', reference: '580–600 cm⁻¹', score: 0.87, confidence: 'Medium' },
      { position: 685, intensity: 68.3, spacing: 'n/a', assignment: 'A₁g-related mode', reference: '675–700 cm⁻¹', score: 0.92, confidence: 'High' },
    ],
    observation: 'Five reproducible Raman features are detected, including a dominant mode at 685 cm⁻¹ and lower-intensity modes at 215, 305, 472, and 586 cm⁻¹.',
    interpretation: 'The vibrational pattern appears compatible with a spinel-related local structure, subject to fluorescence and laser-heating controls.',
    validationGap: 'Raman cannot replace crystallographic validation. Laser power, exposure history, and replicate consistency require confirmation.',
    nextExperiment: 'Acquire power-dependent spectra at three locations and compare against the approved XRD evidence bundle.',
    quality: 'Good feature prominence; one cosmic-ray candidate removed',
  },
  {
    id: 'xrd-002',
    filename: 'cuFe2o4_pure_ref_xrd_002.xy',
    extension: 'XY',
    technique: 'xrd',
    status: 'Validated',
    uploadedAt: '21 Jul 2026, 10:15',
    instrument: 'Rigaku SmartLab',
    sampleId: 'CFO-PURE-REF',
    xLabel: '2θ (°)',
    yLabel: 'Intensity (a.u.)',
    points: makeSignal(10, 80, 520, [[18.3, 0.2, 35], [30.2, 0.25, 68], [35.6, 0.22, 100], [43.3, 0.28, 48], [57.2, 0.24, 62], [62.8, 0.26, 52]], 3),
    peaks: [
      { position: 30.2, intensity: 68.0, spacing: '2.957 Å', assignment: '(220)', reference: '30.10°', score: 0.98, confidence: 'High' },
      { position: 35.6, intensity: 100.0, spacing: '2.520 Å', assignment: '(311)', reference: '35.51°', score: 0.99, confidence: 'High' },
      { position: 43.3, intensity: 48.0, spacing: '2.088 Å', assignment: '(400)', reference: '43.18°', score: 0.96, confidence: 'High' },
      { position: 57.2, intensity: 62.0, spacing: '1.609 Å', assignment: '(511)', reference: '57.04°', score: 0.94, confidence: 'High' },
    ],
    observation: 'Pure phase CuFe₂O₄ reference pattern showing sharp, well-defined cubic spinel reflections without amorphous halo.',
    interpretation: 'High phase-purity spinel baseline for crystallographic comparison.',
    validationGap: 'Requires quantitative phase proportion analysis when overlaid with nanocomposite signals.',
    nextExperiment: 'Overlay with nanocomposite XRD to measure peak broadening and amorphous background contribution.',
    quality: 'Reference quality; SNR > 150',
  },
  {
    id: 'ftir-002',
    filename: 'sba15_pure_support_ftir_002.csv',
    extension: 'CSV',
    technique: 'ftir',
    status: 'Validated',
    uploadedAt: '21 Jul 2026, 10:20',
    instrument: 'Nicolet iS50',
    sampleId: 'SBA15-BLANK',
    xLabel: 'Wavenumber (cm⁻¹)',
    yLabel: 'Transmittance (%)',
    points: makeSignal(400, 4000, 560, [[460, 25, 20], [800, 35, 22], [1075, 80, 58], [1630, 45, 18], [3450, 180, 30]], 1, true),
    peaks: [
      { position: 460, intensity: 32.0, spacing: 'n/a', assignment: 'Si–O rocking', reference: '460 cm⁻¹', score: 0.95, confidence: 'High' },
      { position: 800, intensity: 85.0, spacing: 'n/a', assignment: 'Si–O symmetric', reference: '800 cm⁻¹', score: 0.96, confidence: 'High' },
      { position: 1075, intensity: 42.0, spacing: 'n/a', assignment: 'Si–O–Si asymmetric', reference: '1080 cm⁻¹', score: 0.98, confidence: 'High' },
    ],
    observation: 'Blank SBA-15 mesoporous silica support spectrum without metal-oxide vibrational contributions below 600 cm⁻¹.',
    interpretation: 'Provides silica support baseline for subtraction and bonding verification.',
    validationGap: 'Subsurface silanol groups require deconvolution.',
    nextExperiment: 'Perform spectral subtraction with composite FTIR to isolate Cu-O / Fe-O metal oxygen modes.',
    quality: 'High purity reference; purge nitrogen atmosphere',
  },
  {
    id: 'raman-002',
    filename: 'cuFe2o4_bulk_raman_002.txt',
    extension: 'TXT',
    technique: 'raman',
    status: 'Validated',
    uploadedAt: '21 Jul 2026, 10:25',
    instrument: 'Renishaw inVia Qontor',
    sampleId: 'CFO-BULK-REF',
    xLabel: 'Raman shift (cm⁻¹)',
    yLabel: 'Intensity (a.u.)',
    points: makeSignal(100, 1200, 560, [[220, 10, 18], [310, 12, 24], [480, 15, 32], [590, 16, 45], [690, 15, 85]], 3),
    peaks: [
      { position: 220, intensity: 24.0, spacing: 'n/a', assignment: 'T₂g mode', reference: '220 cm⁻¹', score: 0.91, confidence: 'High' },
      { position: 480, intensity: 38.0, spacing: 'n/a', assignment: 'E₉ mode', reference: '480 cm⁻¹', score: 0.93, confidence: 'High' },
      { position: 690, intensity: 88.0, spacing: 'n/a', assignment: 'A₁g mode (A-site Fe-O)', reference: '690 cm⁻¹', score: 0.97, confidence: 'High' },
    ],
    observation: 'Bulk CuFe₂O₄ reference spectrum with sharp A1g mode at 690 cm⁻¹.',
    interpretation: 'Standard vibrational fingerprint for bulk spinel copper ferrite.',
    validationGap: 'Laser heating shift requires verification across power density levels.',
    nextExperiment: 'Overlay with nanocomposite Raman to analyze phonon confinement shifts.',
    quality: 'High SNR; 532 nm laser at 0.5 mW',
  },
];

const statusClass: Record<WorkspaceFile['status'], string> = {
  Validated: 'bg-emerald-50 text-emerald-700',
  Processed: 'bg-blue-50 text-blue-700',
  'Needs review': 'bg-amber-50 text-amber-800',
  Processing: 'bg-slate-100 text-slate-700',
};

function downloadText(filename: string, content: string, type = 'text/plain') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onChange}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`relative h-4 w-7 rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-slate-300'}`}
    >
      <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform ${checked ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
    </button>
  );
}

function MetadataRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[92px_1fr] gap-3 border-b border-slate-100 py-2 last:border-0">
      <dt className="text-[10px] font-medium text-slate-500">{label}</dt>
      <dd className="min-w-0 break-words text-[10.5px] font-semibold leading-4 text-slate-800">{value}</dd>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[11px] font-bold text-slate-950">{children}</h3>;
}

function CompactParameterControl({
  control,
  value,
  onChange,
}: {
  control: CanonicalWorkspaceControl;
  value: Exclude<CanonicalParameterValue, null>;
  onChange: (value: Exclude<CanonicalParameterValue, null>) => void;
}) {
  const disabled = control.locked;
  const inputClass = 'mt-1 h-7 w-full rounded-md border border-slate-200 bg-white px-2 text-[10px] font-semibold text-slate-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:bg-slate-100 disabled:text-slate-500';

  return (
    <div className="border-b border-slate-100 pb-2 last:border-0 last:pb-0">
      <div className="flex items-start justify-between gap-2">
        <label htmlFor={`agent-param-${control.id}`} className="min-w-0 text-[10px] font-medium leading-4 text-slate-700">
          {control.label.replace(' (Not active)', '')}
        </label>
        <span className="flex shrink-0 items-center gap-1 text-[8.5px] text-slate-500">
          {!control.active && <span className="rounded bg-amber-50 px-1 py-0.5 font-semibold text-amber-800">Stored only</span>}
          {control.unit && <span>{control.unit}</span>}
        </span>
      </div>

      {control.type === 'select' && (
        <select id={`agent-param-${control.id}`} value={String(value)} onChange={(event) => onChange(event.target.value)} disabled={disabled} className={inputClass}>
          {(control.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      )}

      {(control.type === 'number' || control.type === 'range') && (
        <input id={`agent-param-${control.id}`} type="number" value={Number(value)} min={control.min} max={control.max} step={control.step} onChange={(event) => onChange(Number(event.target.value))} disabled={disabled} className={inputClass} />
      )}

      {control.type === 'text' && (
        <input id={`agent-param-${control.id}`} type="text" value={String(value)} onChange={(event) => onChange(event.target.value)} disabled={disabled} className={inputClass} />
      )}

      {control.type === 'toggle' && (
        <div className="mt-1 flex h-6 items-center justify-between rounded-md bg-slate-50 px-2">
          <span className="text-[9px] font-semibold text-slate-500">{Boolean(value) ? 'Enabled' : 'Disabled'}</span>
          <Toggle checked={Boolean(value)} onChange={() => !disabled && onChange(!Boolean(value))} label={control.label} />
        </div>
      )}

      {control.type === 'checkbox-group' && (
        <div id={`agent-param-${control.id}`} className="mt-1 flex flex-wrap gap-1.5">
          {(control.options ?? []).map((option) => {
            const selected = Array.isArray(value) && value.includes(option);
            return (
              <label key={option} className="inline-flex items-center gap-1 rounded bg-slate-50 px-1.5 py-1 text-[9px] font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={selected}
                  disabled={disabled}
                  onChange={() => {
                    const current = Array.isArray(value) ? value : [];
                    onChange(selected ? current.filter((item) => item !== option) : [...current, option]);
                  }}
                  className="h-3 w-3 accent-blue-600"
                />
                {option}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ProcessingPlanStepper({
  steps,
  selectedStepId,
  onSelect,
}: {
  steps: AgentProcessingPlanStep[];
  selectedStepId: ProcessingPlanStepId;
  onSelect: (stepId: ProcessingPlanStepId) => void;
}) {
  return (
    <div className="mt-2 grid grid-cols-4 gap-1" role="tablist" aria-label="Signal processing steps">
      {steps.map((step, index) => {
        const selected = step.id === selectedStepId;
        const ready = step.configured && !selected;
        const status = selected ? 'Configuring' : ready ? 'Ready' : 'Not used';
        const buttonStyle = selected
          ? { borderColor: '#2563EB', backgroundColor: '#EFF6FF', color: '#1D4ED8' }
          : ready
            ? { borderColor: '#86EFAC', backgroundColor: '#F0FDF4', color: '#15803D' }
            : { borderColor: '#E2E8F0', backgroundColor: '#F8FAFC', color: '#64748B' };
        const numberStyle = selected
          ? { backgroundColor: '#2563EB', borderColor: '#2563EB', color: '#FFFFFF' }
          : ready
            ? { backgroundColor: '#16A34A', borderColor: '#16A34A', color: '#FFFFFF' }
            : { backgroundColor: '#E2E8F0', borderColor: '#CBD5E1', color: '#475569' };
        return (
          <button
            key={step.id}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={`processing-step-${step.id}`}
            aria-label={`${index + 1}. ${step.label}, ${status}`}
            onClick={() => onSelect(step.id)}
            style={buttonStyle}
            className="min-w-0 rounded-md border px-1 py-1.5 text-center transition-colors hover:brightness-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
          >
            <span
              aria-hidden="true"
              style={numberStyle}
              className="mx-auto flex h-5 w-5 items-center justify-center rounded border text-[9px] font-bold tabular-nums"
            >
              {index + 1}
            </span>
            <span className="mt-1 block truncate text-[8.5px] font-semibold">{step.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function ConfidenceBar({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[10px]">
        <span className="font-medium text-slate-600">{label}</span>
        <span className="tabular-nums font-bold text-slate-900">{value}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full bg-primary" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function ResultContent({
  tab,
  file,
  mode,
  selectedPoint,
  referenceContext,
  expanded = false,
  onExport,
}: {
  tab: ResultTab;
  file: WorkspaceFile;
  mode: AnalysisMode;
  selectedPoint: { x: number; y: number } | null;
  referenceContext: ReferencePresentation;
  expanded?: boolean;
  onExport: () => void;
}) {
  const isAiMode = mode !== 'scientific-baseline';
  const isGpt = mode === 'gpt-5.6-scientific';
  const profile = MODE_PROFILES[mode];
  const confidence = profile.confidence;

  if (tab === 'peaks') {
    return (
      <div className="h-full w-full min-w-0 max-w-full overflow-auto overscroll-contain">
        <table className="w-full min-w-[680px] border-collapse text-left text-[10.5px]">
          <thead className="sticky top-0 z-10 bg-slate-50 text-slate-600">
            <tr>
              {['Position', 'Intensity', 'd-spacing', 'Assignment', 'Reference value', 'Match score', 'Confidence'].map((heading) => (
                <th key={heading} className="border-b border-slate-200 px-3 py-2 font-semibold">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {file.peaks.map((peak) => (
              <tr key={`${file.id}-${peak.position}`} className="border-b border-slate-100 hover:bg-blue-50/40">
                <td className="px-3 py-2 font-mono font-semibold text-slate-950">{peak.position.toFixed(2)} {file.technique === 'xrd' ? '°' : 'cm⁻¹'}</td>
                <td className="px-3 py-2 font-mono text-slate-700">{peak.intensity.toFixed(1)}</td>
                <td className="px-3 py-2 font-mono text-slate-700">{peak.spacing}</td>
                <td className="px-3 py-2 font-semibold text-slate-900">{peak.assignment}</td>
                <td className="px-3 py-2 text-slate-700">{peak.reference}</td>
                <td className="px-3 py-2 font-mono font-semibold text-slate-900">{(peak.score * 100).toFixed(0)}%</td>
                <td className="px-3 py-2"><span className={`rounded px-1.5 py-0.5 font-semibold ${peak.confidence === 'High' ? 'bg-emerald-50 text-emerald-700' : peak.confidence === 'Medium' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-800'}`}>{peak.confidence}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (tab === 'observations') {
    return (
      <div className={`grid min-w-0 max-w-full gap-4 ${expanded ? 'lg:grid-cols-[minmax(0,1fr)_280px]' : 'lg:grid-cols-[minmax(0,1fr)_minmax(180px,220px)]'}`}>
        <div className="min-w-0 space-y-3">
          <div>
            <SectionLabel>Extracted observations</SectionLabel>
            <p className="mt-1.5 max-w-[75ch] text-[11px] leading-[1.55] text-slate-700">{file.observation}</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {file.peaks.slice(0, 4).map((peak) => (
              <span key={peak.position} className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-700">
                {peak.position} {file.technique === 'xrd' ? '° 2θ' : 'cm⁻¹'} · {peak.assignment}
              </span>
            ))}
          </div>
          {selectedPoint && (
            <div className="rounded-md bg-blue-50 px-3 py-2 text-[10.5px] text-blue-900">
              Selected point: <span className="font-mono font-bold">x {selectedPoint.x.toFixed(2)}, y {selectedPoint.y.toFixed(2)}</span>
            </div>
          )}
          <label className="block">
            <span className="text-[10px] font-semibold text-slate-600">Ask about this result</span>
            <div className="mt-1 flex gap-2">
              <input disabled={!isAiMode} placeholder={isAiMode ? `Ask ${profile.shortLabel} about a peak, observation, or limitation…` : 'Unavailable in Scientific Baseline Mode'} className="h-8 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-3 text-[11px] text-slate-900 outline-none placeholder:text-slate-500 focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:bg-slate-100" />
              <button type="button" disabled={!isAiMode} className="rounded-md bg-slate-950 px-3 text-[10px] font-semibold text-white disabled:bg-slate-300">Ask result</button>
            </div>
          </label>
        </div>
        <div className="min-w-0 space-y-3 border-t border-slate-200 pt-3 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
          <ConfidenceBar value={confidence} label={mode === 'scientific-baseline' ? 'Rule score confidence' : `${profile.shortLabel} confidence`} />
          <MetadataRow label="Source" value={file.filename} />
          <MetadataRow label="Features" value={`${file.peaks.length} detected`} />
          <MetadataRow label="Quality" value={file.quality} />
        </div>
      </div>
    );
  }

  if (tab === 'reasoning') {
    if (!isAiMode) {
      return (
        <div className="flex h-full min-h-32 items-center justify-center">
          <div className="max-w-lg text-center">
            <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><BrainCircuit size={17} /></div>
            <h3 className="mt-3 text-[12px] font-bold text-slate-950">Advanced scientific reasoning is unavailable</h3>
            <p className="mt-1 text-[11px] leading-5 text-slate-600">Scientific Baseline Mode reports detected measurements, reference matches, and rule-based observations only. No GPT-5.6 or Gemini reasoning is used.</p>
          </div>
        </div>
      );
    }
    return (
      <div className="grid min-w-0 max-w-full gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 md:grid-cols-2">
        {[
          ['Scientific claim', file.interpretation],
          ['Supporting evidence', `${file.peaks.length} detected features align with bounded reference regions. ${file.observation}`],
          ['Contradicting evidence', 'Peak overlap, baseline sensitivity, and technique-specific scope limit a unique assignment.'],
          ['Rationale', isGpt
            ? 'The claim-evidence chain retains contradicting evidence and validation requirements before proposing a next experiment.'
            : 'The evidence is summarized rapidly with bounded wording. Use GPT-5.6 mode when a deeper claim-evidence trace and validation rationale are required.'],
          ['Model provenance', `${profile.fullLabel} · evidence bundle v1.7 · bounded-claims policy 2026.05`],
          ['Comparison profile', `${profile.depth}. Configured capabilities: ${profile.available}. This is a workspace profile, not a validated performance benchmark.`],
        ].map(([label, value]) => (
          <div key={label} className="min-w-0 bg-white p-3">
            <p className="text-[10px] font-bold text-slate-950">{label}</p>
            <p className="mt-1 text-[10.5px] leading-5 text-slate-600">{value}</p>
          </div>
        ))}
      </div>
    );
  }

  if (tab === 'validation') {
    return (
      <div className="grid min-w-0 max-w-full gap-3 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <div className="min-w-0 space-y-2">
          <div className="flex items-start gap-2 rounded-md bg-emerald-50 p-2.5 text-emerald-900"><Check size={14} className="mt-0.5 shrink-0" /><div><p className="text-[10px] font-bold">Supported</p><p className="mt-0.5 text-[10.5px] leading-4">Observed feature positions and bounded reference compatibility.</p></div></div>
          <div className="flex items-start gap-2 rounded-md bg-amber-50 p-2.5 text-amber-950"><AlertTriangle size={14} className="mt-0.5 shrink-0" /><div><p className="text-[10px] font-bold">Validation-limited</p><p className="mt-0.5 text-[10.5px] leading-4">{file.validationGap}</p></div></div>
          <div className="flex items-start gap-2 rounded-md bg-slate-100 p-2.5 text-slate-800"><X size={14} className="mt-0.5 shrink-0" /><div><p className="text-[10px] font-bold">Cannot conclude</p><p className="mt-0.5 text-[10.5px] leading-4">Phase purity, synthesis success, composition, or performance from this evidence alone.</p></div></div>
        </div>
        <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-3">
          <SectionLabel>Missing evidence</SectionLabel>
          <ul className="mt-2 space-y-1.5 text-[10.5px] text-slate-600">
            <li>• Approved reference provenance and eligibility record</li>
            <li>• Independent technique evidence under the same sample condition lock</li>
            <li>• Replicate or uncertainty assessment</li>
          </ul>
          <div className="mt-3 border-t border-slate-100 pt-3">
            <p className="text-[10px] font-bold text-slate-950">Required next experiment</p>
            <p className="mt-1 text-[10.5px] leading-5 text-slate-600">{file.nextExperiment}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ReportPreviewPanel file={file} mode={mode} referenceContext={referenceContext} expanded={expanded} />
  );
}

export function ScientificAnalysisWorkspace({
  initialTechnique,
  fileName,
  projectId = 'agent-workspace',
  surface = 'agent',
}: {
  initialTechnique: TechniqueId;
  mode?: 'quick' | 'project';
  fileName?: string;
  projectId?: string;
  sessionId?: string;
  surface?: 'agent' | 'technique';
}) {
  const [files, setFiles] = useState(DEFAULT_FILES);
  const initialFile = DEFAULT_FILES.find((item) => item.filename === fileName) ?? DEFAULT_FILES.find((item) => item.technique === initialTechnique) ?? DEFAULT_FILES[0];
  const [selectedId, setSelectedId] = useState(initialFile.id);
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>('gpt-5.6-scientific');
  const [generationTimestamp, setGenerationTimestamp] = useState(() => new Date().toISOString());
  const [activeResultTab, setActiveResultTab] = useState<ResultTab>('observations');
  const [activeInspectorTab, setActiveInspectorTab] = useState<InspectorTab>('settings');
  const [activeGraphTool, setActiveGraphTool] = useState<GraphTool>('pan');
  const [selectedPoint, setSelectedPoint] = useState<{ x: number; y: number } | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [inspectorWidth, setInspectorWidth] = useState(304);
  const [dockCollapsed, setDockCollapsed] = useState(true);
  const [dockHeight, setDockHeight] = useState(260);
  const [search, setSearch] = useState('');
  const [showGrid, setShowGrid] = useState(true);
  const [showReferences, setShowReferences] = useState(true);
  const [showPeakMarkers, setShowPeakMarkers] = useState(true);
  const [showBackgroundContribution, setShowBackgroundContribution] = useState(true);
  const [parameterState, setParameterState] = useState(() => readParameterState(projectId, initialFile.technique));
  const [importedReferenceFile, setImportedReferenceFile] = useState<ImportedReferenceFile | null>(() => readImportedReferenceFile(projectId, initialFile.technique));
  const [referenceImportError, setReferenceImportError] = useState<string | null>(null);
  const [selectedProcessingStepId, setSelectedProcessingStepId] = useState<ProcessingPlanStepId>('prepare');
  const [overlayFileIds, setOverlayFileIds] = useState<string[]>([]);
  const [activeFileMenuId, setActiveFileMenuId] = useState<string | null>(null);
  const [fileDetailsModalItem, setFileDetailsModalItem] = useState<WorkspaceFile | null>(null);
  const graphPanelRef = useRef<HTMLElement>(null);

  const toggleOverlayFile = useCallback((fileId: string) => {
    setOverlayFileIds((prev) =>
      prev.includes(fileId) ? prev.filter((id) => id !== fileId) : [...prev, fileId]
    );
  }, []);

  const toggleFileStatus = useCallback((fileId: string) => {
    setFiles((prev) =>
      prev.map((f) => {
        if (f.id !== fileId) return f;
        const nextStatus =
          f.status === 'Validated'
            ? 'Processed'
            : f.status === 'Processed'
              ? 'Needs review'
              : 'Validated';
        return { ...f, status: nextStatus };
      })
    );
  }, []);

  const removeFileFromWorkspace = useCallback((fileId: string) => {
    setFiles((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((f) => f.id !== fileId);
      if (selectedId === fileId) {
        setSelectedId(next[0].id);
      }
      return next;
    });
    setOverlayFileIds((prev) => prev.filter((id) => id !== fileId));
  }, [selectedId]);

  const file = files.find((item) => item.id === selectedId) ?? files[0];
  const meta = TECHNIQUE_META[file.technique];
  const filteredFiles = files.filter((item) => item.filename.toLowerCase().includes(search.toLowerCase()));
  const effectiveParameterValues = parameterState.technique === file.technique ? parameterState.effectiveValues : {};
  const xpsRegionSelection = file.technique === 'xps' ? String(effectiveParameterValues.regionSelection ?? 'Survey') : null;
  const xpsRegionWindow = useMemo(() => xpsRegionSelection ? getRegionWindowByValue(xpsRegionSelection) : undefined, [xpsRegionSelection]);
  const processedSignal = useMemo(
    () => processWorkspaceSignal(file.points, file.peaks, file.technique, effectiveParameterValues),
    [file.points, file.peaks, file.technique, effectiveParameterValues]
  );
  const graphPoints = processedSignal.points;
  const baselinePoints = processedSignal.baselinePoints;
  const peakMarkers = processedSignal.peakMarkers;
  const effectiveFile = useMemo(() => ({
    ...file,
    points: processedSignal.points,
    peaks: processedSignal.peaks,
  }), [file, processedSignal]);

  const overlaySeries = useMemo(() => {
    return overlayFileIds
      .map((id) => files.find((f) => f.id === id))
      .filter((f): f is WorkspaceFile => !!f && f.id !== file.id && f.technique === file.technique)
      .map((f, idx) => {
        const palette = ['#f97316', '#10b981', '#ec4899', '#eab308', '#06b6d4', '#8b5cf6'];
        return {
          id: f.id,
          name: f.filename,
          color: palette[idx % palette.length],
          data: f.points,
        };
      });
  }, [overlayFileIds, files, file]);
  const workspaceControls = useMemo(() => getWorkspaceParameterControls(file.technique, effectiveParameterValues), [effectiveParameterValues, file.technique]);
  const processingControls = useMemo(() => workspaceControls.filter((control) => control.category === 'processing'), [workspaceControls]);
  const storedProcessingControls = useMemo(() => processingControls.filter((control) => !control.active), [processingControls]);
  const referenceControls = useMemo(() => workspaceControls.filter((control) => [
    'referenceDatabase',
    'referenceDatabaseVersion',
    'referenceDatabaseLicense',
    ...(file.technique === 'xrd' ? ['referenceApprovalStatus'] : []),
  ].includes(control.id)), [file.technique, workspaceControls]);
  const referenceValues = useMemo(
    () => ({ ...getCanonicalDefaultValues(file.technique), ...effectiveParameterValues }),
    [effectiveParameterValues, file.technique],
  );
  const referencePresentation = useMemo(
    () => buildReferencePresentation(file.technique, referenceValues, file.xLabel, file.yLabel, importedReferenceFile),
    [file.technique, file.xLabel, file.yLabel, importedReferenceFile, referenceValues],
  );
  const referenceAccept = file.technique === 'xrd'
    ? '.cif,.xy,.xrdml,.dat,.csv,.txt'
    : '.csv,.txt,.dat,.json';
  const processingPlan = useMemo(
    () => buildAgentProcessingPlan(file.technique, workspaceControls, effectiveParameterValues),
    [effectiveParameterValues, file.technique, workspaceControls],
  );
  const selectedProcessingStep = processingPlan.find((step) => step.id === selectedProcessingStepId) ?? processingPlan[0];

  useEffect(() => {
    setParameterState(readParameterState(projectId, file.technique));
    setImportedReferenceFile(readImportedReferenceFile(projectId, file.technique));
    setReferenceImportError(null);
  }, [file.technique, projectId]);

  useEffect(() => {
    setSelectedProcessingStepId('prepare');
  }, [file.technique, xpsRegionSelection]);

  const parameterContext = useMemo(() => createCanonicalParameterContext(file.technique, {
    datasetId: file.id,
    sourceFiles: [{ filename: file.filename, sha256: null, role: 'primary' }],
    analysisMode,
    values: {
      ...effectiveParameterValues,
      instrument: file.instrument === 'Metadata not provided' ? null : file.instrument,
      sampleId: file.sampleId,
      rawSourceFilename: file.filename,
    },
    sources: {
      instrument: file.instrument === 'Metadata not provided' ? 'not_available' : 'imported_metadata',
      sampleId: 'imported_metadata',
      rawSourceFilename: 'imported_metadata',
    },
  }), [analysisMode, effectiveParameterValues, file]);
  const evidenceOutputs = useMemo(() => {
    const kinds: Record<TechniqueId, EvidenceOutputKind> = {
      xrd: 'detected_peak',
      xps: 'element_identity',
      ftir: 'detected_band',
      raman: 'detected_raman_mode',
    };
    const parameterIds = parameterContext.processingParameters
      .filter((item) => item.active)
      .map((item) => item.id);
    return file.peaks.map((peak, index) => createEvidenceOutput(parameterContext, {
      id: `${file.id}:feature:${index + 1}`,
      kind: kinds[file.technique],
      value: peak,
      parameterIds,
      confidence: peak.score,
      warnings: file.validationGap ? [file.validationGap] : [],
    }));
  }, [file, parameterContext]);

  const selectFile = (id: string) => {
    setSelectedId(id);
    setSelectedPoint(null);
    setActiveResultTab('observations');
  };

  const updateCanonicalControl = (control: CanonicalWorkspaceControl, value: Exclude<CanonicalParameterValue, null>) => {
    const nextState = setParameterOverride(
      projectId,
      file.technique,
      control.id,
      value,
      'workspace',
      `${control.label} updated from the ${surface} Inspector`,
    );
    setParameterState(nextState);
  };

  const applyRecommendedStepSettings = (step: AgentProcessingPlanStep) => {
    const recommendations = Object.fromEntries(
      step.controls
        .filter((control) => control.id !== 'regionSelection' && !control.locked)
        .map((control) => [control.id, control.defaultValue]),
    );
    if (Object.keys(recommendations).length === 0) return;
    setParameterState(setParameterOverrides(projectId, file.technique, recommendations, 'agent'));
  };

  const handleReferenceFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedReference = event.target.files?.[0];
    event.currentTarget.value = '';
    if (!selectedReference) return;

    if (selectedReference.size > 25 * 1024 * 1024) {
      setReferenceImportError('Reference files must be 25 MB or smaller.');
      return;
    }

    const imported: ImportedReferenceFile = {
      filename: selectedReference.name,
      size: selectedReference.size,
      mediaType: selectedReference.type || 'application/octet-stream',
      importedAt: new Date().toISOString(),
      status: 'pending_certified_site_approval',
    };
    const referenceVersion = `uploaded-${Date.now()}`;
    const overrides: Record<string, string> = {
      referenceDatabase: 'Uploaded reference',
      referenceDatabaseVersion: referenceVersion,
      referenceDatabaseLicense: 'User supplied; certification pending',
    };
    if (file.technique === 'xrd') {
      overrides.referenceSetId = `uploaded_reference:${selectedReference.name}`;
    }

    writeImportedReferenceFile(projectId, file.technique, imported);
    setImportedReferenceFile(imported);
    setReferenceImportError(null);
    setParameterState(setParameterOverrides(projectId, file.technique, overrides, 'workspace'));
  };

  const exportSource = (target = file) => {
    downloadText(target.filename.replace(/\.[^.]+$/, '.csv'), `x,y\n${target.points.map((point) => `${point.x},${point.y}`).join('\n')}`, 'text/csv');
  };

  const exportResult = () => {
    downloadText(`${file.filename.replace(/\.[^.]+$/, '')}_${activeResultTab}.json`, JSON.stringify({ filename: file.filename, technique: meta.label, mode: analysisMode, tab: activeResultTab, observation: file.observation, interpretation: analysisMode === 'scientific-baseline' ? null : file.interpretation, validationGap: file.validationGap, evidenceOutputs, parameterContext }, null, 2), 'application/json');
  };

  const handleUploadSuccess = (run: UploadedSignalRun) => {
    const technique = run.technique.toLowerCase() as TechniqueId;
    if (!TECHNIQUE_META[technique]) return;
    const uploaded: WorkspaceFile = {
      id: run.id,
      filename: run.fileName,
      extension: run.fileName.split('.').pop()?.toUpperCase() ?? 'DATA',
      technique,
      status: run.evidenceQuality.canInterpret ? 'Processed' : 'Needs review',
      uploadedAt: new Date(run.createdAt).toLocaleString(),
      instrument: 'Metadata not provided',
      sampleId: run.sampleIdentity,
      xLabel: run.xAxisLabel,
      yLabel: run.yAxisLabel,
      points: run.points,
      peaks: run.extractedFeatures.slice(0, 8).map((peak) => ({ position: peak.position, intensity: peak.intensity, spacing: 'n/a', assignment: peak.label, reference: 'Not matched', score: Math.min(0.95, Math.max(0.4, peak.prominence)), confidence: peak.prominence > 0.78 ? 'High' : peak.prominence > 0.55 ? 'Medium' : 'Limited' })),
      observation: `${run.extractedFeatures.length} signal features were extracted from the uploaded source. ${run.evidenceQuality.messages.join(' ')}`,
      interpretation: run.claimBoundary.join(' '),
      validationGap: run.claimBoundary.join(' '),
      nextExperiment: 'Review the uploaded condition lock and collect the missing validation evidence before advancing a scientific conclusion.',
      quality: run.evidenceQuality.label,
    };
    setFiles((current) => [uploaded, ...current.filter((item) => item.id !== uploaded.id)]);
    setSelectedId(uploaded.id);
  };

  const fullscreenGraph = async () => {
    if (!graphPanelRef.current) return;
    if (document.fullscreenElement) await document.exitFullscreen();
    else await graphPanelRef.current.requestFullscreen();
  };

  const openPreviousWorkspace = () => {
    const target = new URL(window.location.href);
    target.searchParams.set('classic', '1');
    window.location.assign(target.toString());
  };

  const runScientificReview = () => {
    setGenerationTimestamp(new Date().toISOString());
    setActiveResultTab(analysisMode === 'scientific-baseline' ? 'observations' : 'reasoning');
    setActiveInspectorTab(analysisMode === 'scientific-baseline' ? 'data' : 'discuss');
    setDockCollapsed(false);
    setInspectorCollapsed(false);
  };

  const startInspectorResize = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = inspectorWidth;
    setInspectorCollapsed(false);
    const handleMove = (moveEvent: MouseEvent) => {
      setInspectorWidth(Math.min(480, Math.max(260, startWidth + startX - moveEvent.clientX)));
    };
    const handleUp = () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  };

  const startDockResize = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = dockHeight;
    setDockCollapsed(false);
    const handleMove = (moveEvent: MouseEvent) => {
      const maxHeight = Math.max(240, Math.min(520, window.innerHeight - 280));
      setDockHeight(Math.min(maxHeight, Math.max(180, startHeight + startY - moveEvent.clientY)));
    };
    const handleUp = () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#eef2f7] text-slate-950">
      <header className="flex min-h-[58px] shrink-0 items-center justify-between gap-3 border-b border-[#d8e0ea] bg-white px-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-[13px] font-bold tracking-[-0.01em] text-slate-950">{surface === 'agent' ? 'Scientific Agent Workspace' : 'Scientific Analysis Workspace'}</h1>
          </div>
          <p className="mt-0.5 truncate text-[10px] text-slate-500">{surface === 'agent' ? 'Structured evidence review' : 'Evidence workspace'} · {file.filename}</p>
        </div>

        <div className="flex min-w-0 flex-1 items-center justify-center">
          <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5" aria-label="Analysis mode selector">
            <button type="button" onClick={() => setAnalysisMode('gpt-5.6-scientific')} className={`flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[10px] font-semibold transition-colors ${analysisMode === 'gpt-5.6-scientific' ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-white'}`}>
              <Sparkles size={13} /> GPT-5.6 Reasoning
            </button>
            <button type="button" onClick={() => setAnalysisMode('gemini-2.5-flash')} className={`flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[10px] font-semibold transition-colors ${analysisMode === 'gemini-2.5-flash' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-white'}`}>
              <BrainCircuit size={13} /> Gemini 2.5 Flash
            </button>
            <button type="button" onClick={() => setAnalysisMode('scientific-baseline')} className={`flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[10px] font-semibold transition-colors ${analysisMode === 'scientific-baseline' ? 'bg-white text-slate-950 ring-1 ring-slate-300' : 'text-slate-600 hover:bg-white'}`}>
              <SlidersHorizontal size={13} /> Baseline
            </button>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button type="button" onClick={openPreviousWorkspace} className="hidden h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-50 2xl:flex"><Columns3 size={13} /> Classic workspace</button>
          <button type="button" onClick={() => setIsUploadOpen(true)} className="flex h-8 items-center gap-1.5 rounded-md bg-primary px-2.5 text-[10px] font-semibold text-white hover:bg-blue-600"><Upload size={13} /> Upload files</button>
          <button type="button" onClick={runScientificReview} className="flex h-8 items-center gap-1.5 rounded-md bg-slate-950 px-2.5 text-[10px] font-semibold text-white hover:bg-slate-800"><Sparkles size={13} /> Run scientific review</button>
        </div>
      </header>

      <div
        className="grid min-h-0 min-w-0 flex-1 overflow-hidden bg-[#d8e0ea]"
        style={{ gridTemplateColumns: `248px minmax(0, 1fr) 6px ${inspectorCollapsed ? '40px' : `${inspectorWidth}px`}` }}
      >
        <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-[#f8fafc]">
          <div className="flex h-11 shrink-0 items-center justify-between border-b border-slate-200 px-3">
            <div className="flex items-center gap-2"><FileText size={14} className="text-slate-500" /><h2 className="text-[11px] font-bold">File Manager</h2></div>
            <button type="button" className="flex h-6 w-6 items-center justify-center rounded text-slate-500 hover:bg-slate-200" aria-label="File manager menu"><Menu size={14} /></button>
          </div>
          <div className="border-b border-slate-200 p-2.5">
            <label className="relative block"><Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search source files" className="h-8 w-full rounded-md border border-slate-200 bg-white pl-8 pr-2 text-[10px] text-slate-900 outline-none placeholder:text-slate-500 focus:border-primary focus:ring-2 focus:ring-primary/10" /></label>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            <div className="mb-2 flex items-center justify-between px-1 text-[9.5px] font-semibold text-slate-500"><span>Source files</span><span>{filteredFiles.length}</span></div>
            <div className="space-y-1.5">
              {filteredFiles.map((item) => {
                const itemMeta = TECHNIQUE_META[item.technique];
                const selected = item.id === file.id;
                return (
                  <div key={item.id} className={`group relative flex w-full items-start rounded-lg p-2 transition-colors ${selected ? 'bg-white ring-1 ring-primary' : 'hover:bg-white'}`}>
                    <button type="button" onClick={() => selectFile(item.id)} className="flex min-w-0 flex-1 items-start gap-2 text-left" aria-pressed={selected}>
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[9px] font-extrabold" style={{ background: itemMeta.soft, color: itemMeta.color }}>{itemMeta.label}</span>
                      <div className="min-w-0 flex-1">
                        <p className={`break-all text-[10px] font-semibold leading-4 ${selected ? 'text-slate-950' : 'text-slate-700'}`}>{item.filename}</p>
                        <div className="mt-1 flex items-center gap-1">
                          <span className="rounded bg-slate-100 px-1 py-0.5 text-[8.5px] font-bold text-slate-500">.{item.extension.toLowerCase()}</span>
                          <span className={`rounded px-1 py-0.5 text-[8.5px] font-semibold ${statusClass[item.status]}`}>{item.status}</span>
                          {overlayFileIds.includes(item.id) && (
                            <span className="rounded bg-orange-100 px-1 py-0.5 text-[8px] font-bold text-orange-700">Overlay</span>
                          )}
                        </div>
                      </div>
                    </button>
                    <div className="ml-1 flex shrink-0 items-center gap-0.5">
                      <button type="button" onClick={() => exportSource(item)} className="flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-800" aria-label={`Download ${item.filename}`} title="Export raw data"><Download size={11} /></button>
                      <div className="relative">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveFileMenuId((prev) => (prev === item.id ? null : item.id));
                          }}
                          className={`flex h-5 w-5 items-center justify-center rounded transition-colors ${activeFileMenuId === item.id ? 'bg-slate-200 text-slate-900 ring-1 ring-slate-400' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-800'}`}
                          aria-label={`Actions for ${item.filename}`}
                          title="File options"
                        >
                          <MoreHorizontal size={12} />
                        </button>
                        {activeFileMenuId === item.id && (
                          <div
                            className="absolute right-0 top-6 z-40 w-48 rounded-lg border border-slate-200 bg-white p-1 shadow-xl ring-1 ring-slate-900/10"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="border-b border-slate-100 px-2 py-1">
                              <p className="truncate text-[9.5px] font-bold text-slate-900">{item.filename}</p>
                              <p className="text-[8.5px] text-slate-500">{item.sampleId} · {item.technique.toUpperCase()}</p>
                            </div>
                            <div className="py-0.5">
                              <button
                                type="button"
                                onClick={() => { selectFile(item.id); setActiveFileMenuId(null); }}
                                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[9.5px] font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-700"
                              >
                                <Eye size={12} className="text-blue-600" /> Select as primary
                              </button>
                              {item.technique === file.technique && item.id !== file.id && (
                                <button
                                  type="button"
                                  onClick={() => { toggleOverlayFile(item.id); setActiveFileMenuId(null); }}
                                  className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[9.5px] font-semibold transition-colors ${overlayFileIds.includes(item.id) ? 'bg-amber-50 text-amber-800 font-bold' : 'text-slate-700 hover:bg-orange-50 hover:text-orange-700'}`}
                                >
                                  <Layers size={12} className={overlayFileIds.includes(item.id) ? 'text-amber-600' : 'text-orange-500'} />
                                  {overlayFileIds.includes(item.id) ? '✓ Remove overlay' : '+ Overlay on graph'}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => { setFileDetailsModalItem(item); setActiveFileMenuId(null); }}
                                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[9.5px] font-semibold text-slate-700 hover:bg-slate-100"
                              >
                                <Info size={12} className="text-slate-500" /> View file details
                              </button>
                              <button
                                type="button"
                                onClick={() => { toggleFileStatus(item.id); setActiveFileMenuId(null); }}
                                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[9.5px] font-semibold text-slate-700 hover:bg-slate-100"
                              >
                                <CheckCircle2 size={12} className="text-emerald-600" /> Toggle status
                              </button>
                              <button
                                type="button"
                                onClick={() => { exportSource(item); setActiveFileMenuId(null); }}
                                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[9.5px] font-semibold text-slate-700 hover:bg-slate-100"
                              >
                                <Download size={12} className="text-slate-600" /> Export raw data
                              </button>
                            </div>
                            {files.length > 1 && (
                              <div className="border-t border-slate-100 pt-0.5">
                                <button
                                  type="button"
                                  onClick={() => { removeFileFromWorkspace(item.id); setActiveFileMenuId(null); }}
                                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[9.5px] font-semibold text-red-600 hover:bg-red-50"
                                >
                                  <Trash2 size={12} /> Remove file
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="shrink-0 border-t border-slate-200 bg-white p-2">
            <button type="button" onClick={() => setIsUploadOpen(true)} className="flex h-8 w-full items-center gap-2 rounded-md bg-primary px-2.5 text-[10px] font-semibold text-white hover:bg-blue-600"><Upload size={13} /> Upload files</button>
            <button type="button" onClick={openPreviousWorkspace} className="mt-1 flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-100"><RotateCcw size={13} /> Classic workspace</button>
          </div>
        </aside>

        <main
          className="grid min-h-0 min-w-0 overflow-hidden bg-[#d8e0ea]"
          style={{ gridTemplateRows: `minmax(260px, 1fr) 6px ${dockCollapsed ? '40px' : `${dockHeight}px`}` }}
        >
          <section ref={graphPanelRef} className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-white">
            <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-3">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold" style={{ background: meta.soft, color: meta.color }}>{meta.label}</span>
                <h2 className="max-w-[240px] shrink truncate text-[12px] font-bold text-slate-950">{file.filename}</h2>
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold ${statusClass[file.status]}`}>{file.status}</span>
                <span className="h-4 w-px shrink-0 bg-slate-200" aria-hidden="true" />
                <p className="min-w-0 flex-1 truncate text-[9.5px] text-slate-500">{meta.role} · {file.technique === 'xps' ? (xpsRegionWindow ? `${xpsRegionSelection} survey-derived region` : 'Survey spectrum') : 'Observed signal'} · bounded reference markers · {graphPoints.length} points</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {([{ id: 'zoom', icon: ZoomIn, label: 'Zoom' }, { id: 'pan', icon: Move, label: 'Pan' }, { id: 'select', icon: MousePointer2, label: 'Select point' }] as const).map(({ id, icon: Icon, label }) => <button key={id} type="button" onClick={() => setActiveGraphTool(id)} title={label} aria-label={label} className={`flex h-7 w-7 items-center justify-center rounded-md border ${activeGraphTool === id ? 'border-primary bg-blue-50 text-primary' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'}`}><Icon size={13} /></button>)}
                <button type="button" onClick={() => setSelectedPoint(null)} title="Reset view" aria-label="Reset graph view" className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"><RotateCcw size={13} /></button>
                <button type="button" onClick={() => exportSource()} title="Export graph data" aria-label="Export graph data" className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"><Download size={13} /></button>
                <button type="button" onClick={fullscreenGraph} title="Fullscreen graph" aria-label="Fullscreen graph" className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"><Maximize2 size={13} /></button>
              </div>
            </div>
            <div className="relative min-h-0 flex-1 bg-white p-2">
              <Graph type={file.technique} height="100%" externalData={graphPoints} baselineData={baselinePoints} overlaySeries={overlaySeries} peakMarkers={showPeakMarkers ? peakMarkers : []} xAxisLabel={file.xLabel} yAxisLabel={file.yLabel} showLegend showReferencePeaks={showReferences} hideGrid={!showGrid} showBackground={showBackgroundContribution} showCalculated={false} showResidual={false} onChartClick={(x, y) => { if (activeGraphTool === 'select') setSelectedPoint({ x, y }); }} />
              <div className="pointer-events-none absolute left-4 top-3 flex items-center gap-3 rounded-md bg-white/95 px-2 py-1 text-[9px] font-medium text-slate-600 ring-1 ring-slate-200"><span className="inline-flex items-center gap-1"><span className="h-0.5 w-4 bg-primary" /> Observed signal</span><span className="inline-flex items-center gap-1"><span className="h-3 border-l border-dashed border-rose-500" /> Reference</span><span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-950" /> Peak marker</span></div>
              {selectedPoint && <div className="absolute bottom-4 right-4 rounded-md bg-slate-950 px-2.5 py-1.5 text-[9.5px] text-white">Selected · <span className="font-mono">{selectedPoint.x.toFixed(2)}, {selectedPoint.y.toFixed(2)}</span></div>}
            </div>
          </section>

          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize detail result dock"
            onMouseDown={startDockResize}
            className="group flex cursor-row-resize items-center justify-center bg-slate-100 hover:bg-blue-50"
          >
            <GripHorizontal size={16} className="text-slate-400 group-hover:text-primary" />
          </div>

          <section className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-white">
            <div className="flex min-h-10 shrink-0 items-center justify-between border-b border-slate-200 px-2">
              <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
                {RESULT_TABS.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => setActiveResultTab(id)} className={`flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-[9.5px] font-semibold ${activeResultTab === id ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-100'}`}><Icon size={12} />{label}{id === 'reasoning' && analysisMode === 'scientific-baseline' && <span className="rounded bg-amber-100 px-1 text-[8px] text-amber-800">Unavailable</span>}</button>)}
              </div>
              <div className="ml-2 flex shrink-0 items-center gap-1">
                <button type="button" onClick={() => setDockCollapsed((current) => !current)} className="flex h-7 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 text-[9.5px] font-semibold text-slate-700 hover:bg-slate-50" aria-label={dockCollapsed ? 'Show detail result dock' : 'Collapse detail result dock'}>{dockCollapsed ? <ChevronUp size={12} /> : <ChevronDown size={12} />} {dockCollapsed ? 'Show' : 'Collapse'}</button>
                <button type="button" onClick={() => { setIsExpanded(true); setIsMinimized(false); }} className="flex h-7 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 text-[9.5px] font-semibold text-slate-700 hover:bg-slate-50"><Expand size={12} /> Expand</button>
              </div>
            </div>
            {!dockCollapsed && <div className="min-h-0 min-w-0 max-w-full flex-1 overflow-auto overscroll-contain p-3"><ResultContent tab={activeResultTab} file={effectiveFile} mode={analysisMode} selectedPoint={selectedPoint} referenceContext={referencePresentation} onExport={exportResult} /></div>}
          </section>
        </main>

        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize Inspector"
          onMouseDown={startInspectorResize}
          className="group flex cursor-col-resize items-center justify-center bg-slate-100 hover:bg-blue-50"
        >
          <GripVertical size={16} className="text-slate-400 group-hover:text-primary" />
        </div>

        <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-[#f8fafc]">
          {inspectorCollapsed ? (
            <div className="flex h-full flex-col items-center gap-3 py-2">
              <button type="button" onClick={() => setInspectorCollapsed(false)} className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:text-primary" aria-label="Expand Inspector"><PanelRightOpen size={14} /></button>
              <span className="[writing-mode:vertical-rl] text-[10px] font-bold text-slate-600">Inspector</span>
            </div>
          ) : <>
          <div className="flex h-11 shrink-0 items-center justify-between border-b border-slate-200 px-3"><div className="flex items-center gap-2"><Settings2 size={14} className="text-slate-500" /><h2 className="text-[11px] font-bold">Inspector</h2></div><div className="flex items-center gap-2"><span className="text-[9px] font-medium text-slate-500">{inspectorWidth}px</span><button type="button" onClick={() => setInspectorCollapsed(true)} className="flex h-6 w-6 items-center justify-center rounded text-slate-500 hover:bg-slate-200 hover:text-slate-900" aria-label="Collapse Inspector"><PanelRightClose size={13} /></button></div></div>
          <div className="grid shrink-0 grid-cols-3 border-b border-slate-200 bg-white p-1.5">
            {([{ id: 'settings', label: 'Settings', icon: SlidersHorizontal }, { id: 'data', label: 'Data', icon: Database }, { id: 'discuss', label: 'Discuss', icon: MessageSquareText }] as const).map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => setActiveInspectorTab(id)} className={`flex h-8 items-center justify-center gap-1 rounded-md text-[9.5px] font-semibold ${activeInspectorTab === id ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-100'}`}><Icon size={11} />{label}</button>)}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {activeInspectorTab === 'settings' && <div className="space-y-4">
              <div className="rounded-md border border-slate-200 bg-white p-2">
                <div className="flex items-center justify-between gap-2"><SectionLabel>Signal processing</SectionLabel><span className="text-[8.5px] font-semibold text-slate-500">Schema {PARAMETER_SCHEMA_VERSION}</span></div>
                <p className="mt-1 text-[9px] leading-4 text-slate-500">{file.technique === 'xps' ? (xpsRegionWindow ? `${xpsRegionSelection} element-region controls are active. The graph is a survey-derived region, not an independent high-resolution scan.` : 'Survey controls are active for broad elemental screening. Element fitting and charge-reference controls remain stored until an element region is selected.') : `Shared with the ${meta.label} Workspace and Agent context.`}</p>
                <ProcessingPlanStepper steps={processingPlan} selectedStepId={selectedProcessingStep.id} onSelect={setSelectedProcessingStepId} />
                <div className="mt-2 flex items-center gap-2 text-[8px] font-medium text-slate-500" aria-label="Processing step status legend">
                  <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: '#94A3B8' }} />Not used</span>
                  <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: '#2563EB' }} />Configuring</span>
                  <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: '#16A34A' }} />Ready</span>
                </div>
                <details open className="group mt-2 rounded-md border border-slate-200 bg-slate-50">
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-2 px-2.5 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset [&::-webkit-details-marker]:hidden">
                    <span className="flex min-w-0 items-start gap-1.5"><ChevronDown size={13} className="mt-0.5 shrink-0 text-slate-400 transition-transform group-open:rotate-180" aria-hidden="true" /><span className="min-w-0"><span className="block text-[10.5px] font-bold text-slate-900">{selectedProcessingStep.title}</span><span className="mt-0.5 block text-[9px] leading-4 text-slate-500">{selectedProcessingStep.description}</span></span></span>
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[8px] font-bold ${selectedProcessingStep.configured ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                      {selectedProcessingStep.configured ? 'Ready' : 'Review'}
                    </span>
                  </summary>
                  <div id={`processing-step-${selectedProcessingStep.id}`} role="tabpanel" className="border-t border-slate-200 bg-white p-2.5">
                    {selectedProcessingStep.controls.length > 0 ? (
                      <div className="space-y-2">
                        {selectedProcessingStep.controls.map((control) => <CompactParameterControl key={control.id} control={control} value={effectiveParameterValues[control.id] ?? control.defaultValue} onChange={(value) => updateCanonicalControl(control, value)} />)}
                      </div>
                    ) : (
                      <div className="rounded-md bg-slate-50 px-2 py-1.5 text-[9px] leading-4 text-slate-600">No additional processing parameter is applied in this step. Review the generated evidence and validation boundary.</div>
                    )}
                    {selectedProcessingStep.controls.some((control) => control.id !== 'regionSelection' && !control.locked) && (
                      <button type="button" onClick={() => applyRecommendedStepSettings(selectedProcessingStep)} className="mt-2 flex h-7 w-full items-center justify-center gap-1.5 rounded-md border border-blue-600 bg-white text-[9.5px] font-semibold text-blue-700 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1">
                        <Sparkles size={11} aria-hidden="true" /> Use recommended settings
                      </button>
                    )}
                  </div>
                </details>
                {storedProcessingControls.length > 0 && <details className="mt-2 rounded-md bg-slate-100 p-2"><summary className="cursor-pointer text-[9.5px] font-semibold text-slate-700">Advanced / stored parameters ({storedProcessingControls.length})</summary><p className="mt-1 text-[8.5px] leading-4 text-slate-500">Stored for reproducibility but not applied to the current result.</p><div className="mt-2 space-y-2">{storedProcessingControls.map((control) => <CompactParameterControl key={control.id} control={control} value={effectiveParameterValues[control.id] ?? control.defaultValue} onChange={(value) => updateCanonicalControl(control, value)} />)}</div></details>}
              </div>
              <details className="group rounded-md border border-slate-200 bg-white px-2">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-md px-1 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 [&::-webkit-details-marker]:hidden">
                  <span className="flex items-center gap-2"><SectionLabel>Plot appearance</SectionLabel><span className="text-[8px] font-medium text-slate-400">Display controls</span></span>
                  <ChevronDown size={13} className="shrink-0 text-slate-400 transition-transform group-open:rotate-180" aria-hidden="true" />
                </summary>
                <div className="mt-2 space-y-2.5">
                  <label className="block text-[10px] font-medium text-slate-600">Plot style<select className="mt-1 h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-[10px] font-semibold text-slate-800"><option>Scientific line</option><option>Points + line</option><option>Signal envelope</option></select></label>
                  <label className="block text-[10px] font-medium text-slate-600">Background<select className="mt-1 h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-[10px] font-semibold text-slate-800"><option>Laboratory white</option><option>Neutral gray</option><option>Navy presentation</option></select></label>
                  <div className="border-t border-slate-100 pt-2">
                    <p className="mb-2 text-[9px] font-semibold text-slate-500">Plot overlays</p>
                    <div className="space-y-2">{[[showGrid, () => setShowGrid(!showGrid), 'Grid'], [showReferences, () => setShowReferences(!showReferences), 'Reference markers'], [showPeakMarkers, () => setShowPeakMarkers(!showPeakMarkers), 'Peak markers'], [showBackgroundContribution, () => setShowBackgroundContribution(!showBackgroundContribution), 'Background contribution']].map(([checked, handler, label]) => <div key={label as string} className="flex items-center justify-between"><span className="text-[10px] font-medium text-slate-700">{label as string}</span><Toggle checked={checked as boolean} onChange={handler as () => void} label={label as string} /></div>)}</div>
                  </div>
                </div>
              </details>
              <details className="group rounded-md border border-slate-200 bg-white px-2">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-md px-1 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 [&::-webkit-details-marker]:hidden">
                    <span className="flex items-center gap-2"><SectionLabel>{meta.label} reference and units</SectionLabel><span className="text-[8px] font-medium text-slate-400">Technique-specific</span></span>
                    <ChevronDown size={13} className="shrink-0 text-slate-400 transition-transform group-open:rotate-180" aria-hidden="true" />
                  </summary>
                  <div className="mt-2 space-y-2">{referenceControls.map((control) => <CompactParameterControl key={control.id} control={control} value={effectiveParameterValues[control.id] ?? control.defaultValue} onChange={(value) => updateCanonicalControl(control, value)} />)}</div>
                <div className="mt-2 rounded-md border border-blue-200 bg-blue-50/60 p-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[9px] font-bold text-blue-950">Reference file</p>
                      <p className="mt-0.5 text-[8.5px] leading-4 text-blue-900/80">Import a reference file for provenance. It remains candidate evidence until certified-site approval.</p>
                    </div>
                    <label htmlFor={`reference-file-${file.technique}`} className="inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-md bg-blue-600 px-2 text-[9px] font-bold text-white hover:bg-blue-700">
                      <Upload size={11} aria-hidden="true" /> Upload reference file
                    </label>
                    <input id={`reference-file-${file.technique}`} type="file" accept={referenceAccept} onChange={handleReferenceFileUpload} className="sr-only" />
                  </div>
                  {importedReferenceFile && (
                    <div className="mt-2 rounded border border-blue-200 bg-white px-2 py-1.5 text-[8.5px]">
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0 break-all font-semibold text-slate-800">{importedReferenceFile.filename}</span>
                        <span className="shrink-0 rounded bg-amber-50 px-1 py-0.5 font-bold text-amber-800">Approval pending</span>
                      </div>
                      <p className="mt-0.5 text-slate-500">{formatFileSize(importedReferenceFile.size)} · {importedReferenceFile.mediaType}</p>
                    </div>
                  )}
                  {referenceImportError && <p className="mt-1 text-[8.5px] font-semibold text-red-700">{referenceImportError}</p>}
                </div>
                {referencePresentation.certificationRemark && (
                  <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-amber-950">
                    <div className="flex items-start gap-1.5">
                      <AlertTriangle size={12} className="mt-0.5 shrink-0 text-amber-700" />
                      <div>
                        <p className="text-[9px] font-bold">Certified-site approval required</p>
                        <p className="mt-0.5 text-[8.5px] leading-4 text-amber-900/80">{referencePresentation.certificationRemark}</p>
                      </div>
                    </div>
                  </div>
                )}
                <div className="mt-2 rounded-md border border-slate-200 bg-white p-2">
                  <p className="text-[9px] font-bold text-slate-700">Units used by {meta.label}</p>
                  <div className="mt-1.5 space-y-1.5">
                    {referencePresentation.unitRows.map((row) => (
                      <div key={row.label} className="flex items-start justify-between gap-2 text-[9px]">
                        <span className="min-w-0 text-slate-500">{row.label}</span>
                        <span className="max-w-[62%] text-right font-semibold text-slate-800">
                          {row.value}{row.unit ? ` ${row.unit}` : ''}
                          {row.status && <span className="ml-1 text-[8px] font-medium text-slate-400">({row.status})</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                </details>
            </div>}

            {activeInspectorTab === 'data' && <div className="space-y-4">
              <div>
                <div className="mb-2 flex items-center justify-between"><SectionLabel>Source metadata</SectionLabel><span className={`rounded px-1.5 py-0.5 text-[8.5px] font-semibold ${statusClass[file.status]}`}>{file.status}</span></div>
                <dl><MetadataRow label="Filename" value={file.filename} /><MetadataRow label="File type" value={`.${file.extension.toLowerCase()} · ${file.points.length} rows`} /><MetadataRow label="Technique" value={meta.label} /><MetadataRow label="Upload date" value={file.uploadedAt} /><MetadataRow label="Instrument" value={file.instrument} /><MetadataRow label="Sample ID" value={file.sampleId} /><MetadataRow label="Conditions" value="Ambient · standard scan · condition lock CL-074" /><MetadataRow label="Units" value={`${file.xLabel} · ${file.yLabel}`} /><MetadataRow label="Parser status" value="Accepted · schema mapped" /><MetadataRow label="Data quality" value={file.quality} /><MetadataRow label="Provenance" value="sha256:9f2…c18 · immutable source" /></dl>
              </div>
              <div className="border-t border-slate-200 pt-3">
                <SectionLabel>Run context</SectionLabel>
                <dl className="mt-1"><MetadataRow label="Active mode" value={MODE_PROFILES[analysisMode].fullLabel} /><MetadataRow label="Model" value={ANALYSIS_MODE_REGISTRY[analysisMode].model ?? 'No LLM reasoning'} /><MetadataRow label="Generated" value={generationTimestamp} /><MetadataRow label="Schema" value={PARAMETER_SCHEMA_VERSION} /><MetadataRow label="State revision" value={parameterState.version} /></dl>
              </div>
            </div>}

            {activeInspectorTab === 'discuss' && <div className="space-y-3">
              {analysisMode === 'scientific-baseline' ? <div className="rounded-lg bg-amber-50 p-3 text-amber-950"><div className="flex items-center gap-2"><AlertTriangle size={14} /><p className="text-[10.5px] font-bold">AI discussion unavailable</p></div><p className="mt-1.5 text-[10px] leading-4">Scientific Baseline Mode does not generate model discussion or scientific reasoning. Select GPT-5.6 or Gemini 2.5 Flash to discuss evidence context.</p></div> : <><div className="rounded-lg bg-slate-950 p-3 text-white"><div className="flex items-center gap-2"><BrainCircuit size={14} className="text-blue-300" /><p className="text-[10.5px] font-bold">{MODE_PROFILES[analysisMode].shortLabel} context assembled</p></div><p className="mt-1.5 text-[10px] leading-4 text-slate-300">Discussion is bounded to the current file, selected feature, reference match, and visible validation gap.</p></div><div className="space-y-2">{[['Current file', file.filename], ['Selected graph point', selectedPoint ? `${selectedPoint.x.toFixed(2)}, ${selectedPoint.y.toFixed(2)}` : 'No point selected'], ['Selected peak', file.peaks[0]?.assignment ?? 'None'], ['Extracted observation', file.observation], ['Reference match', `${file.peaks[0]?.reference} · ${Math.round((file.peaks[0]?.score ?? 0) * 100)}%`], ['Validation gap', file.validationGap]].map(([label, value]) => <div key={label} className="min-w-0 rounded-md bg-white p-2.5 ring-1 ring-slate-200"><p className="text-[9px] font-semibold text-slate-500">{label}</p><p className="mt-1 break-words text-[10px] leading-4 text-slate-700">{value}</p></div>)}</div><label className="block"><span className="text-[10px] font-semibold text-slate-600">Ask about current context</span><textarea rows={3} placeholder="Ask how this evidence supports or limits a claim…" className="mt-1 w-full resize-none rounded-md border border-slate-200 bg-white p-2 text-[10px] text-slate-900 outline-none placeholder:text-slate-500 focus:border-primary focus:ring-2 focus:ring-primary/10" /><button type="button" className="mt-2 flex h-8 w-full items-center justify-center gap-2 rounded-md bg-primary text-[10px] font-semibold text-white"><Sparkles size={12} /> Ask {MODE_PROFILES[analysisMode].shortLabel}</button></label></>}
            </div>}
          </div>
          </>}
        </aside>
      </div>

      {isExpanded && !isMinimized && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/28 p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsExpanded(false); }}>
          <section className={`flex min-h-[360px] min-w-0 max-w-[calc(100vw-24px)] flex-col overflow-hidden bg-white shadow-[0_18px_48px_rgba(15,23,42,0.28)] ${isMaximized ? 'h-[calc(100vh-24px)] w-[calc(100vw-24px)]' : 'h-[72vh] w-[78vw] resize overflow-auto rounded-xl'}`} role="dialog" aria-modal="true" aria-label={`${RESULT_TABS.find((tab) => tab.id === activeResultTab)?.label} expanded result`}>
            <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-slate-950 px-3 text-white">
              <div className="min-w-0"><div className="flex items-center gap-2"><PanelBottomOpen size={14} className="text-blue-300" /><h2 className="text-[11px] font-bold">{RESULT_TABS.find((tab) => tab.id === activeResultTab)?.label}</h2><span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px]">{meta.label}</span><span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px]">{file.status}</span></div><p className="mt-0.5 truncate text-[9px] text-slate-300">{file.filename}</p></div>
              <div className="flex items-center gap-1"><button type="button" onClick={exportResult} className="flex h-7 items-center gap-1.5 rounded px-2 text-[9.5px] font-semibold text-slate-200 hover:bg-white/10"><Download size={12} /> Export</button><button type="button" onClick={() => setIsMinimized(true)} className="flex h-7 w-7 items-center justify-center rounded text-slate-300 hover:bg-white/10" aria-label="Minimize result window"><Minimize2 size={13} /></button><button type="button" onClick={() => setIsMaximized((current) => !current)} className="flex h-7 w-7 items-center justify-center rounded text-slate-300 hover:bg-white/10" aria-label="Maximize result window"><Maximize2 size={13} /></button><button type="button" onClick={() => setIsExpanded(false)} className="flex h-7 w-7 items-center justify-center rounded text-slate-300 hover:bg-white/10" aria-label="Close result window"><X size={14} /></button></div>
            </header>
            <div className="flex h-10 shrink-0 items-center gap-1 overflow-x-auto border-b border-slate-200 bg-slate-50 px-2">{RESULT_TABS.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => setActiveResultTab(id)} className={`flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[9.5px] font-semibold ${activeResultTab === id ? 'bg-white text-slate-950 ring-1 ring-slate-300' : 'text-slate-600 hover:bg-white'}`}><Icon size={12} />{label}</button>)}</div>
            <div className="min-h-0 min-w-0 max-w-full flex-1 overflow-auto p-5"><ResultContent tab={activeResultTab} file={effectiveFile} mode={analysisMode} selectedPoint={selectedPoint} referenceContext={referencePresentation} expanded onExport={exportResult} /></div>
          </section>
        </div>
      )}

      {isExpanded && isMinimized && <button type="button" onClick={() => setIsMinimized(false)} className="fixed bottom-4 right-4 z-[75] flex h-10 items-center gap-2 rounded-lg bg-slate-950 px-3 text-[10px] font-semibold text-white shadow-lg"><PanelBottomOpen size={14} /> {RESULT_TABS.find((tab) => tab.id === activeResultTab)?.label} · {file.filename}<Maximize2 size={12} /></button>}

      <RawFileUploadModal open={isUploadOpen} onClose={() => setIsUploadOpen(false)} technique={file.technique} onUploadSuccess={handleUploadSuccess} />

      {/* File Details & Metadata Modal */}
      {fileDetailsModalItem && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/40 p-4"
          onClick={() => setFileDetailsModalItem(null)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl ring-1 ring-slate-900/10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="rounded bg-blue-50 px-2 py-0.5 text-[9px] font-bold text-blue-700 uppercase">
                  {fileDetailsModalItem.technique} Metadata
                </span>
                <h3 className="mt-1 text-[14px] font-bold text-slate-950">
                  {fileDetailsModalItem.filename}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setFileDetailsModalItem(null)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-3 space-y-2.5 text-[10.5px]">
              <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3">
                <div><p className="font-semibold text-slate-500">Sample ID</p><p className="font-bold text-slate-900">{fileDetailsModalItem.sampleId}</p></div>
                <div><p className="font-semibold text-slate-500">Instrument</p><p className="font-bold text-slate-900">{fileDetailsModalItem.instrument}</p></div>
                <div><p className="font-semibold text-slate-500">Status</p><p className="font-bold text-slate-900">{fileDetailsModalItem.status}</p></div>
                <div><p className="font-semibold text-slate-500">Uploaded</p><p className="font-bold text-slate-900">{fileDetailsModalItem.uploadedAt}</p></div>
              </div>

              <div className="rounded-lg border border-slate-200 p-3">
                <p className="font-bold text-slate-900">Data quality & observations</p>
                <p className="mt-1 text-[10px] text-slate-600">{fileDetailsModalItem.quality}</p>
                <p className="mt-2 text-[10px] text-slate-700 leading-4">{fileDetailsModalItem.observation}</p>
              </div>

              <div className="rounded-lg bg-slate-950 p-3 text-white">
                <p className="text-[10px] font-bold text-slate-300">File Provenance Digest</p>
                <p className="mt-1 font-mono text-[9.5px] text-emerald-400">sha256:9f2b84e1a09c4d28e71c89f029a17c18</p>
                <p className="mt-1 text-[9px] text-slate-400">Points count: {fileDetailsModalItem.points.length} | Peak count: {fileDetailsModalItem.peaks.length}</p>
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  exportSource(fileDetailsModalItem);
                  setFileDetailsModalItem(null);
                }}
                className="flex h-8 items-center gap-1.5 rounded-md bg-blue-600 px-3 text-[10px] font-semibold text-white hover:bg-blue-700"
              >
                <Download size={12} /> Download Raw File
              </button>
              <button
                type="button"
                onClick={() => setFileDetailsModalItem(null)}
                className="flex h-8 items-center rounded-md border border-slate-200 bg-white px-3 text-[10px] font-semibold text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
