import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  SlidersHorizontal,
  Sparkles,
  Play,
  RotateCcw,
  Save,
  Download,
  ArrowRight,
  Database,
  Layers,
  Search,
} from 'lucide-react';
import { DashboardLayout } from '../components/layout/DashboardLayout';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Graph } from '../components/ui/Graph';
import { formatChemicalFormula } from '../utils/chemicalFormula';
import { useX7UniversalHook } from '../hooks/useX7UniversalHook';
import { getProject, saveEvidence } from '../data/demoProjects';

interface SpectrumPoint {
  x: number;
  y: number;
}

// Generate realistic FTIR raw spectrum (observed data with baseline slope and noise)
const getInitialFtirData = (): SpectrumPoint[] => {
  const points = [];
  for (let x = 400; x <= 4000; x += 5) {
    let y = 0.05; // baseline offset

    // Key IR absorption bands (absorbance peaks)
    y += 0.45 * Math.exp(-Math.pow((x - 3420) / 160, 2));   // Surface hydroxyl / O-H stretch
    y += 0.28 * Math.exp(-Math.pow((x - 1715) / 45, 2));    // Carbonyl C=O stretching (e.g. ester/acid)
    y += 0.32 * Math.exp(-Math.pow((x - 1625) / 35, 2));    // COO- asymmetric stretch / carboxylate
    y += 0.58 * Math.exp(-Math.pow((x - 1084) / 60, 2));    // Si-O-Si / C-O-C skeletal vibration
    y += 0.40 * Math.exp(-Math.pow((x - 590) / 25, 2));     // Metal-Oxygen tetrahedral
    y += 0.22 * Math.exp(-Math.pow((x - 410) / 15, 2));     // Metal-Oxygen octahedral

    // Add linear baseline slope
    y += (x - 400) * 0.000015;

    // Add high frequency measurement noise
    const noise = Math.sin(x * 15.5) * 0.0018 + Math.cos(x * 9.3) * 0.0009;
    y += noise;

    points.push({ x, y: Number(y.toFixed(4)) });
  }
  return points;
};

export default function FTIRWorkspace() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const {
    analyzeWithVertexAI,
    applyBaseline,
    applySmoothing,
    applyNormalization,
    identifyMaterialFeatures
  } = useX7UniversalHook();

  const projectId = searchParams.get('project') || 'cu-fe2o4-spinel';
  const project = getProject(projectId) || { name: 'Active Project', material: 'Target Sample', id: projectId };

  // Core spectrum states
  const [rawData] = useState<SpectrumPoint[]>(getInitialFtirData);
  const [processedData, setProcessedData] = useState<SpectrumPoint[]>(getInitialFtirData);
  const [plotMode, setPlotMode] = useState<'Transmittance' | 'Absorbance'>('Transmittance');

  const displayData = useMemo(() => {
    if (plotMode === 'Transmittance') {
      return processedData.map(pt => ({
        x: pt.x,
        y: Number((100 * Math.pow(10, -pt.y)).toFixed(4))
      }));
    }
    return processedData;
  }, [processedData, plotMode]);

  // Parameter settings
  const [baselineMethod, setBaselineMethod] = useState<'Rubberband' | 'ALS' | 'Polynomial' | 'None'>('Rubberband');
  const [smoothingMethod, setSmoothingMethod] = useState<'Savitzky-Golay' | 'Moving Average' | 'None'>('Savitzky-Golay');
  const [normalizationMethod, setNormalizationMethod] = useState<'Min-max' | 'Area' | 'Vector' | 'None'>('None');
  const [bandThreshold, setBandThreshold] = useState<number>(0.18);
  const [selectedIndustry, setSelectedIndustry] = useState<string>(() => {
    return localStorage.getItem('difaryx_selected_industry_mode') || 'Polymers';
  });

  // Result and Ingestion engine status
  const [detectedBands, setDetectedBands] = useState<any[]>([]);
  const [peakMarkers, setPeakMarkers] = useState<any[]>([]);
  const [isProcessed, setIsProcessed] = useState<boolean>(false);
  const [engineActive, setEngineActive] = useState<boolean>(false);
  const [log, setLog] = useState<string[]>(['FTIR workspace loaded. Dynamic ingestion module offline.']);
  const [toast, setToast] = useState<string>('');

  // Handle synchronization of unified industry mode selection
  useEffect(() => {
    const stored = localStorage.getItem('difaryx_selected_industry_mode') || 'Polymers';
    if (stored !== selectedIndustry) {
      setSelectedIndustry(stored);
    }
  }, [selectedIndustry]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2000);
  };

  const addLogEntry = (msg: string) => {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLog(prev => [`${time} - ${msg}`, ...prev]);
  };

  // 1. Apply signal processing parameter changes
  const handleApplyParameters = () => {
    let nextData = rawData.map(pt => ({ ...pt }));

    if (baselineMethod !== 'None') {
      nextData = applyBaseline(nextData, baselineMethod as any);
    }
    if (smoothingMethod !== 'None') {
      nextData = applySmoothing(nextData, smoothingMethod as any);
    }
    if (normalizationMethod !== 'None') {
      nextData = applyNormalization(nextData, normalizationMethod as any);
    }

    setProcessedData(nextData);
    setIsProcessed(true);
    addLogEntry(`Applied parameters: Baseline [${baselineMethod}], Smoothing [${smoothingMethod}], Normalization [${normalizationMethod}]`);
    showToast('Signal processing completed');
  };

  // 2. Perform peak pick & auto-match against database
  const handleDetectBands = () => {
    // If not processed yet, run processing first
    let activeData = displayData;
    if (!isProcessed) {
      let nextData = rawData.map(pt => ({ ...pt }));
      if (baselineMethod !== 'None') nextData = applyBaseline(nextData, baselineMethod as any);
      if (smoothingMethod !== 'None') nextData = applySmoothing(nextData, smoothingMethod as any);
      if (normalizationMethod !== 'None') nextData = applyNormalization(nextData, normalizationMethod as any);
      setProcessedData(nextData);
      setIsProcessed(true);

      // Calculate activeData based on current plotMode
      if (plotMode === 'Transmittance') {
        activeData = nextData.map(pt => ({
          x: pt.x,
          y: Number((100 * Math.pow(10, -pt.y)).toFixed(4))
        }));
      } else {
        activeData = nextData;
      }
    }

    const peaks = [];
    const n = activeData.length;
    const r = 4; // search radius for peak comparison

    for (let i = r; i < n - r; i++) {
      const current = activeData[i];
      let isPeak = true;

      if (plotMode === 'Transmittance') {
        // Transmittance peaks point down (local minima)
        for (let j = -r; j <= r; j++) {
          if (activeData[i + j].y < current.y) {
            isPeak = false;
            break;
          }
        }
      } else {
        // Absorbance peaks point up (local maxima)
        for (let j = -r; j <= r; j++) {
          if (activeData[i + j].y > current.y) {
            isPeak = false;
            break;
          }
        }
      }

      if (isPeak) {
        // Calculate relative intensity
        const yVals = activeData.map(pt => pt.y);
        const minY = Math.min(...yVals);
        const maxY = Math.max(...yVals);
        const span = maxY - minY || 1;

        let relativeIntensity = 0;
        let isValidPeak = false;

        if (plotMode === 'Transmittance') {
          relativeIntensity = (maxY - current.y) / span;
          isValidPeak = relativeIntensity >= bandThreshold && current.y < 98.0;
        } else {
          relativeIntensity = (current.y - minY) / span;
          isValidPeak = relativeIntensity >= bandThreshold && current.y > 0.03;
        }

        if (isValidPeak) {
          peaks.push({
            position: current.x,
            intensity: current.y,
            relativeIntensity: Number((relativeIntensity * 100).toFixed(1)),
          });
        }
      }
    }

    // Call smart mapping logic from the Knowledge Base
    const matched = identifyMaterialFeatures(peaks, 'FTIR', selectedIndustry);
    setDetectedBands(matched);

    // Update peak markers to draw blue vertical lines (role: 'selected') on graph
    const markers = matched.map(band => ({
      position: band.position,
      intensity: band.intensity,
      label: band.assignment !== 'Unassigned'
        ? `${band.assignment} (${band.confidence}%)`
        : `Band at ${band.position.toFixed(0)} cm⁻¹`,
      role: 'selected' as const,
    }));

    setPeakMarkers(markers);
    setEngineActive(true);
    addLogEntry(`Detected ${peaks.length} bands. Molecular fingerprint mapped against [${selectedIndustry}] mode.`);
    showToast(`Bands detected: ${peaks.length}`);
  };

  const handleReset = () => {
    setProcessedData(rawData);
    setBaselineMethod('Rubberband');
    setSmoothingMethod('Savitzky-Golay');
    setNormalizationMethod('None');
    setBandThreshold(0.18);
    setDetectedBands([]);
    setPeakMarkers([]);
    setIsProcessed(false);
    setEngineActive(false);
    setPlotMode('Transmittance');
    addLogEntry('Workspace reset. Baseline and peak states cleared.');
    showToast('State reset complete');
  };

  const handleSaveEvidence = () => {
    if (detectedBands.length === 0) {
      showToast('No bands detected yet');
      return;
    }

    const datasetId = `${project.id}-ftir-ingestion-run`;
    const primaryFeature = detectedBands.find(b => b.assignment !== 'Unassigned')?.assignment || 'Vibrational bands';

    const evidenceObj = {
      technique: 'FTIR' as const,
      datasetId,
      claim: `${detectedBands.filter(b => b.assignment !== 'Unassigned').length} vibrational bands confirm the molecular backbone characteristics under [${selectedIndustry}] mode.`,
      evidenceRole: 'supporting' as const,
      support: detectedBands.map(b => `${b.assignment} at ${b.position.toFixed(0)} cm⁻¹ (${b.confidence}%)`).join('; '),
      limitations: `Assigned bands mapped from UNIVERSAL_MASTER_LIBRARY in ${selectedIndustry} context.`,
    };

    saveEvidence(evidenceObj);
    addLogEntry('Scientific evidence successfully saved to project registry.');
    showToast('Evidence registered successfully');
  };

  const handleIndustryChange = (val: string) => {
    setSelectedIndustry(val);
    localStorage.setItem('difaryx_selected_industry_mode', val);
    addLogEntry(`Switched Analysis Mode / Industry to: [${val}]`);

    // Automatically recheck peak assignments if peaks are already pick/detected
    if (peakMarkers.length > 0) {
      const activePeaks = peakMarkers.map(m => ({
        position: m.position,
        intensity: m.intensity,
      }));
      const matched = identifyMaterialFeatures(activePeaks, 'FTIR', val);
      setDetectedBands(matched);
      const markers = matched.map(band => ({
        position: band.position,
        intensity: band.intensity,
        label: band.assignment !== 'Unassigned'
          ? `${band.assignment} (${band.confidence}%)`
          : `Band at ${band.position.toFixed(0)} cm⁻¹`,
        role: 'selected' as const,
      }));
      setPeakMarkers(markers);
    }
  };

  return (
    <DashboardLayout>
      <div className="flex-1 h-full flex flex-col lg:flex-row overflow-hidden bg-background">

        {/* Left Side: Main workspace visualizers */}
        <main className="flex-1 overflow-y-auto p-4 space-y-4">

          {/* Header section */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
                <span>Ingestion Workspace</span>
                <span className="rounded bg-primary/10 px-1 py-0.5 text-[9px] font-bold text-primary">FTIR Active</span>
              </div>
              <h1 className="mt-1 text-xl font-bold text-text-main">
                {formatChemicalFormula(project.name)} FTIR Characterization
              </h1>
              <p className="mt-0.5 text-xs text-text-muted">
                Material System: {formatChemicalFormula(project.material)}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {toast && (
                <div className="animate-fade-in rounded-md border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
                  {toast}
                </div>
              )}
              <Button variant="outline" size="sm" onClick={() => navigate(`/dashboard?project=${project.id}`)}>
                Back to Dashboard
              </Button>
            </div>
          </div>

          {/* 2. Dynamic Status Banner */}
          {isProcessed ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50/70 p-3.5 flex items-start gap-3">
              <CheckCircle2 className="text-emerald-600 shrink-0 mt-0.5" size={16} />
              <div className="text-xs">
                <span className="font-bold text-emerald-800">FTIR Core Analytical Engine: Active</span>
                <p className="mt-1 text-emerald-950 leading-relaxed">
                  Spectrum processed successfully. Detected <strong>{detectedBands.length} peaks</strong>. Mapped structure evidence is bound to the Universal Master Library.
                  <span className="block mt-1 text-[10px] font-semibold text-emerald-700 uppercase tracking-wider">
                    Parameters: Baseline: {baselineMethod} | Smoothing: {smoothingMethod} | Normalization: {normalizationMethod} | Mode: {selectedIndustry}
                  </span>
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-amber-200 bg-amber-50/70 p-3.5 flex items-start gap-3">
              <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={16} />
              <div className="text-xs">
                <span className="font-bold text-amber-800">FTIR provenance-only upload - processing adapter pending</span>
                <p className="mt-1 text-amber-950 leading-relaxed">
                  Signal characterization offline. Adjust mathematical processing parameters and click <strong>Detect Bands</strong> to initialize the ingestion engine and map functional groups.
                </p>
              </div>
            </div>
          )}

          {/* 3. Interactive Graph */}
          <Card className="p-4 bg-white shadow-sm border border-border">
            <div className="flex items-center justify-between border-b border-border pb-2 mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-text-main flex items-center gap-1.5">
                <SlidersHorizontal size={13} className="text-primary" /> Transmittance / Absorbance Plot
              </span>
              <span className="text-[10px] font-semibold text-text-muted">Wavenumber Range: 400 - 4000 cm⁻¹</span>
            </div>

            <div className="h-96 w-full">
              <Graph
                type="ftir"
                height="100%"
                externalData={displayData}
                peakMarkers={peakMarkers}
                showBackground={baselineMethod !== 'None'}
                showCalculated={false}
                showResidual={false}
                yAxisLabel={plotMode === 'Transmittance' ? 'Transmittance (%)' : 'Absorbance (a.u.)'}
              />
            </div>
          </Card>

          {/* 4. Top Evidence / Features Table */}
          <Card className="p-4 bg-white shadow-sm border border-border">
            <div className="flex items-center justify-between border-b border-border pb-2 mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-text-main flex items-center gap-1.5">
                <Database size={13} className="text-primary" /> Top Evidence / Mapped Features
              </span>
              <span className="text-[10px] font-bold text-primary uppercase">
                Database Source: Universal Master Library
              </span>
            </div>

            {detectedBands.length === 0 ? (
              <div className="py-8 text-center text-xs text-text-muted">
                No features mapped yet. Run peak detection to populate scientific assignments.
              </div>
            ) : (
              <>
                <div className="overflow-x-auto rounded border border-border/60">
                  <table className="w-full text-left">
                    <thead className="bg-surface-hover text-[10px] uppercase tracking-wide text-text-muted">
                      <tr>
                        <th className="px-3 py-2 font-bold">Wavenumber (cm⁻¹)</th>
                        <th className="px-3 py-2 font-bold">Obs. Intensity</th>
                        <th className="px-3 py-2 font-bold">Matched Assignment</th>
                        <th className="px-3 py-2 font-bold">Confidence</th>
                        <th className="px-3 py-2 font-bold">Interpretation / Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40 text-xs">
                      {detectedBands.map((band, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="px-3 py-2.5 font-mono font-semibold text-text-main">
                            {band.position.toFixed(1)}
                          </td>
                          <td className="px-3 py-2.5 font-mono text-text-muted">
                            {band.intensity.toFixed(4)}
                          </td>
                          <td className="px-3 py-2.5 font-bold text-primary">
                            {band.assignment}
                          </td>
                          <td className="px-3 py-2.5">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                band.confidence >= 80
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : band.confidence >= 50
                                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                  : 'bg-slate-50 text-slate-600 border border-border'
                              }`}
                            >
                              {band.confidence > 0 ? `${band.confidence}%` : 'Unassigned'}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-text-muted leading-relaxed">
                            {band.details || 'No matching fingerprint entry in selected industry mode.'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Evidence Summary Box */}
                <div className="mt-4 p-3.5 bg-slate-50 rounded-md border border-border/80 text-xs text-text-muted space-y-2">
                  <div className="flex items-center gap-1.5 font-bold text-text-main">
                    <Layers size={13} className="text-primary" />
                    <span>Evidence Summary</span>
                  </div>
                  {detectedBands.filter(b => b.assignment !== 'Unassigned').length > 0 ? (
                    <p className="leading-relaxed">
                      The FTIR spectrum characterization for {formatChemicalFormula(project.name)} has successfully resolved{' '}
                      <strong>{detectedBands.filter(b => b.assignment !== 'Unassigned').length}</strong> key molecular feature(s)
                      associated with the <strong>{selectedIndustry}</strong> industry library. The matched signature features include:{' '}
                      {detectedBands
                        .filter(b => b.assignment !== 'Unassigned')
                        .map(b => `${b.assignment} (${b.confidence}% confidence)`)
                        .join(', ')}.
                    </p>
                  ) : (
                    <p className="leading-relaxed">
                      No matching molecular signatures were found for the detected peaks under the current <strong>{selectedIndustry}</strong> mode library.
                    </p>
                  )}
                </div>
              </>
            )}
          </Card>

          {/* Activity / Processing Logs */}
          <Card className="p-4 bg-slate-900 text-slate-100 shadow-sm border border-slate-800">
            <div className="text-xs font-bold uppercase tracking-wider text-primary mb-2 flex items-center gap-1.5">
              <Layers size={13} /> Execution Trace Log
            </div>
            <div className="font-mono text-[11px] space-y-1 max-h-32 overflow-y-auto">
              {log.map((line, idx) => (
                <div key={idx} className="opacity-90">
                  <span className="text-emerald-400">&gt;</span> {line}
                </div>
              ))}
            </div>
          </Card>
        </main>

        {/* Right Side: Control Panels & Handoff */}
        <aside className="w-full lg:w-80 shrink-0 border-t lg:border-t-0 lg:border-l border-border bg-surface p-4 space-y-4 overflow-y-auto">

          {/* Industry dropdown selection */}
          <Card className="p-4 bg-white shadow-sm border border-border">
            <h3 className="text-xs font-bold uppercase tracking-wider text-text-main mb-2">
              Analysis Mode / Industry
            </h3>
            <p className="text-[10px] text-text-muted mb-3 leading-relaxed">
              Switches target molecular databases to dynamically filter and label active spectrum features.
            </p>
            <select
              value={selectedIndustry}
              onChange={(e) => handleIndustryChange(e.target.value)}
              className="w-full h-9 rounded border border-border bg-background px-3 text-xs font-semibold text-text-main focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="All">All Compounds & Analytical Fields (Standard)</option>
              <option value="Active Pharmaceutical Ingredients (APIs)">Active Pharmaceutical Ingredients (APIs)</option>
              <option value="Organic Chemistry">Organic Chemistry</option>
              <option value="Polymers & Macromolecules">Polymers & Macromolecules</option>
              <option value="Polymer Science">Polymer Science</option>
              <option value="Energy Storage">Energy Storage</option>
              <option value="Semiconductors">Semiconductors</option>
              <option value="Solid State Physics">Solid State Physics</option>
              <option value="Zeolites">Zeolites</option>
              <option value="Catalysts">Catalysts</option>
              <option value="Minerals">Minerals</option>
              <option value="Inorganic Chemistry">Inorganic Chemistry</option>
            </select>
          </Card>

          {/* Mathematical controls */}
          <Card className="p-4 bg-white shadow-sm border border-border space-y-4">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-text-main border-b border-border pb-1.5">
              <SlidersHorizontal size={13} /> Ingestion Controls
            </div>

            <label className="block text-[11px] font-semibold text-text-muted">
              Plot Mode
              <select
                value={plotMode}
                onChange={(e) => setPlotMode(e.target.value as any)}
                className="mt-1 w-full h-8 rounded border border-border bg-background px-2 text-xs font-semibold text-text-main"
              >
                <option value="Transmittance">Transmittance (%)</option>
                <option value="Absorbance">Absorbance (a.u.)</option>
              </select>
            </label>

            <label className="block text-[11px] font-semibold text-text-muted">
              Baseline Correction
              <select
                value={baselineMethod}
                onChange={(e) => setBaselineMethod(e.target.value as any)}
                className="mt-1 w-full h-8 rounded border border-border bg-background px-2 text-xs font-semibold text-text-main"
              >
                <option value="Rubberband">Rubberband (Convex Hull)</option>
                <option value="ALS">Asymmetric Least Squares (ALS)</option>
                <option value="Polynomial">Polynomial Fit (Order 3)</option>
                <option value="None">None (Keep raw offset)</option>
              </select>
            </label>

            <label className="block text-[11px] font-semibold text-text-muted">
              Signal Smoothing
              <select
                value={smoothingMethod}
                onChange={(e) => setSmoothingMethod(e.target.value as any)}
                className="mt-1 w-full h-8 rounded border border-border bg-background px-2 text-xs font-semibold text-text-main"
              >
                <option value="Savitzky-Golay">Savitzky-Golay (Window 9)</option>
                <option value="Moving Average">Moving Average (Window 9)</option>
                <option value="None">None</option>
              </select>
            </label>

            <label className="block text-[11px] font-semibold text-text-muted">
              Normalization
              <select
                value={normalizationMethod}
                onChange={(e) => setNormalizationMethod(e.target.value as any)}
                className="mt-1 w-full h-8 rounded border border-border bg-background px-2 text-xs font-semibold text-text-main"
              >
                <option value="None">None (Original Absorbance)</option>
                <option value="Min-max">Min-Max normalization [0, 1]</option>
                <option value="Area">Area (Integrate spectrum)</option>
                <option value="Vector">Vector (Euclidean norm)</option>
              </select>
            </label>

            <div className="space-y-1">
              <div className="flex justify-between text-[11px] font-semibold text-text-muted">
                <span>Band Threshold</span>
                <span>{bandThreshold.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0.05"
                max="0.50"
                step="0.01"
                value={bandThreshold}
                onChange={(e) => setBandThreshold(parseFloat(e.target.value))}
                className="w-full accent-primary"
              />
            </div>
          </Card>

          {/* Action buttons */}
          <Card className="p-4 bg-white shadow-sm border border-border space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-text-main mb-2">Actions</h3>

            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" className="w-full gap-1" onClick={handleApplyParameters}>
                <Play size={12} /> Apply Parameters
              </Button>
              <Button size="sm" variant="outline" className="w-full gap-1 border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100" onClick={handleDetectBands}>
                <Search size={12} /> Detect Bands
              </Button>
              <Button size="sm" variant="outline" className="w-full gap-1" onClick={handleReset}>
                <RotateCcw size={12} /> Reset State
              </Button>
              <Button size="sm" variant="outline" className="w-full gap-1 border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100" onClick={handleSaveEvidence}>
                <Save size={12} /> Save Evidence
              </Button>
            </div>
          </Card>

          {/* Handoff Panel */}
          <Card className="p-4 bg-white shadow-sm border border-border space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-text-main">Pipeline Handoff</h3>

            <div className="space-y-2 text-xs">
              <Link
                to={`/demo/agent?project=${project.id}`}
                className="w-full inline-flex h-8 items-center justify-between rounded border border-border bg-background px-3 font-semibold text-text-main hover:border-primary/40 hover:text-primary transition-colors"
              >
                <span>Handoff to Agent reasoning</span>
                <ArrowRight size={13} />
              </Link>

              <Link
                to={`/notebook?project=${project.id}&template=research`}
                className="w-full inline-flex h-8 items-center justify-between rounded border border-border bg-background px-3 font-semibold text-text-main hover:border-primary/40 hover:text-primary transition-colors"
              >
                <span>Export run to Notebook</span>
                <ArrowRight size={13} />
              </Link>

              <Link
                to={`/reports?project=${project.id}`}
                className="w-full inline-flex h-8 items-center justify-between rounded border border-border bg-background px-3 font-semibold text-text-main hover:border-primary/40 hover:text-primary transition-colors"
              >
                <span>Review validation report</span>
                <ArrowRight size={13} />
              </Link>
            </div>
          </Card>

        </aside>

      </div>
    </DashboardLayout>
  );
}
