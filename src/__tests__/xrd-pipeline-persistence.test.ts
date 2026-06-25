import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getAnalysisSession, saveAnalysisSession, createAnalysisSession } from '../data/analysisSessions';
import type { PipelineStepStatus } from '../data/analysisSessions';
import { 
  mapPipelineStatesToProcessingPipeline, 
  mapPipelineStepStatusToState,
  loadSessionState,
  getDefaultPipelineStates
} from '../components/workspace/TechniqueWorkspaceShell';
import { TechniqueWorkspaceConfig } from '../types/xrdWorkflowContract';

const mockPipelineConfig = [
  { id: 'xrd-baseline', label: 'Baseline', summary: '' },
  { id: 'xrd-smooth', label: 'Smooth', summary: '' },
  { id: 'xrd-peak-detect', label: 'Peak Detect', summary: '' },
  { id: 'xrd-fit-peaks', label: 'Fit Peaks', summary: '' },
  { id: 'xrd-match-references', label: 'Match References', summary: '' }
];

const mockConfig = {
  id: 'xrd',
  label: 'XRD',
  pipeline: mockPipelineConfig,
  parameters: [],
} as unknown as TechniqueWorkspaceConfig;

describe('Phase 4.6 - Pipeline State Persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('1. Focused test for actual mapping (Forward and Reverse)', () => {
    // Forward mapping: UI State -> ProcessingPipelineStep
    const uiStates = {
      'xrd-baseline': 'done' as const,
      'xrd-smooth': 'done' as const,
      'xrd-peak-detect': 'done' as const,
      'xrd-fit-peaks': 'pending' as const,
    };

    const mappedPipeline = mapPipelineStatesToProcessingPipeline(mockPipelineConfig, uiStates);
    
    expect(mappedPipeline).toEqual([
      { id: 'xrd-baseline', label: 'Baseline', status: 'completed', timestamp: undefined, notes: undefined },
      { id: 'xrd-smooth', label: 'Smooth', status: 'completed', timestamp: undefined, notes: undefined },
      { id: 'xrd-peak-detect', label: 'Peak Detect', status: 'completed', timestamp: undefined, notes: undefined },
      { id: 'xrd-fit-peaks', label: 'Fit Peaks', status: 'pending', timestamp: undefined, notes: undefined },
      { id: 'xrd-match-references', label: 'Match References', status: 'pending', timestamp: undefined, notes: undefined }
    ]);

    // Reverse mapping: ProcessingPipelineStatus -> UI State
    expect(mapPipelineStepStatusToState('completed')).toBe('done');
    expect(mapPipelineStepStatusToState('active')).toBe('active');
    expect(mapPipelineStepStatusToState('pending')).toBe('pending');
    expect(mapPipelineStepStatusToState('skipped')).toBe('optional');
    expect(mapPipelineStepStatusToState('error')).toBe('active');
  });

  it('2. Simulates the real save path to restored UI pipelineStates', () => {
    const session = createAnalysisSession('xrd', 'test.xy');
    const storageKey = `difaryx-technique-session:xrd:uploaded:${session.analysisId}`;

    // Initial UI state right before user clicks Save
    const uiStatesToSave = {
      'xrd-baseline': 'done' as const,
      'xrd-smooth': 'done' as const,
      'xrd-peak-detect': 'done' as const,
      'xrd-fit-peaks': 'pending' as const,
      'xrd-match-references': 'pending' as const,
    };

    // Step 1: saveSession mapping
    const mappedPipeline = mapPipelineStatesToProcessingPipeline(mockPipelineConfig, uiStatesToSave);
    
    // Step 2: saveAnalysisSession
    saveAnalysisSession({ ...session, status: 'saved', processingPipeline: mappedPipeline });

    // Simulate saving the UI state locally like useEffect does
    localStorage.setItem(storageKey, JSON.stringify({ pipelineStates: uiStatesToSave }));

    // Step 3: Hard Refresh Simulation
    // getAnalysisSession
    const reloadedSession = getAnalysisSession(session.analysisId);
    expect(reloadedSession?.processingPipeline.find(s => s.id === 'xrd-baseline')?.status).toBe('completed');

    // getDefaultPipelineStates / loadSessionState
    const restoredSessionState = loadSessionState(storageKey, mockConfig, false, false, reloadedSession);
    
    // Restored UI pipelineStates must match original exactly
    expect(restoredSessionState.pipelineStates['xrd-baseline']).toBe('done');
    expect(restoredSessionState.pipelineStates['xrd-smooth']).toBe('done');
    expect(restoredSessionState.pipelineStates['xrd-peak-detect']).toBe('done');
    expect(restoredSessionState.pipelineStates['xrd-fit-peaks']).toBe('pending');
    
    // Confirm default pending did not overwrite it
    const defaults = getDefaultPipelineStates(mockConfig, false, false, session); // without loaded pipeline
    expect(defaults['xrd-baseline']).toBe('pending'); // Proves default would have been pending
  });
});
