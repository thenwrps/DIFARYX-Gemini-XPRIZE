import type {
  CanonicalParameterValue,
  CanonicalTechnique,
  CanonicalWorkspaceControl,
} from '../../data/parameterDefinitions';

export type ProcessingPlanStepId = 'prepare' | 'correct' | 'detect' | 'validate';

export interface AgentProcessingPlanStep {
  id: ProcessingPlanStepId;
  label: string;
  title: string;
  description: string;
  parameterIds: string[];
  controls: CanonicalWorkspaceControl[];
  configured: boolean;
}

interface StepTemplate {
  id: ProcessingPlanStepId;
  label: string;
  title: string;
  description: string;
  parameterIds: string[];
}

const PLAN_TEMPLATES: Record<CanonicalTechnique, StepTemplate[]> = {
  xrd: [
    {
      id: 'prepare',
      label: 'Prepare',
      title: 'Prepare the pattern',
      description: 'Establish the baseline model before changing peak evidence.',
      parameterIds: ['baselineMethod', 'baselineLambda', 'baselineP', 'baselineIterations'],
    },
    {
      id: 'correct',
      label: 'Correct',
      title: 'Correct the signal',
      description: 'Reduce high-frequency noise without shifting diffraction peaks.',
      parameterIds: ['smoothingMethod', 'smoothingWindow', 'smoothingPolynomialOrder'],
    },
    {
      id: 'detect',
      label: 'Detect / Fit',
      title: 'Detect and fit peaks',
      description: 'Set feature thresholds and fitting constraints for reported peak evidence.',
      parameterIds: ['minimumProminence', 'peakMinDistance', 'peakThreshold', 'fitModel', 'peakFitTolerance', 'peakFitMaxIterations', 'peakMaxCount', 'peakFitWindow', 'refineFWHM', 'refineShape', 'calculateCrystalliteSize', 'scherrerConstant', 'instrumentalBroadening', 'calculateMicrostrain'],
    },
    {
      id: 'validate',
      label: 'Validate',
      title: 'Match and validate',
      description: 'Match detected peaks only against the configured reference boundary.',
      parameterIds: ['referenceMatchEnabled', 'referenceMatchMode', 'referenceSetId', 'candidatePhaseIds', 'referenceMatchMinPeaks', 'referenceMatchMinCoverage', 'referenceMatchMinScore', 'referenceMatchUseRelativeIntensity', 'referenceMatchIntensityTolerance', 'referenceMatchAllowUnknown'],
    },
  ],
  xps: [],
  ftir: [
    {
      id: 'prepare',
      label: 'Prepare',
      title: 'Prepare the spectrum',
      description: 'Choose normalization before comparing band intensities.',
      parameterIds: ['normalization'],
    },
    {
      id: 'correct',
      label: 'Correct',
      title: 'Correct the spectrum',
      description: 'Remove baseline drift and smooth the signal with one reproducible profile.',
      parameterIds: ['baselineMethod', 'smoothingMethod', 'smoothingWindow'],
    },
    {
      id: 'detect',
      label: 'Detect',
      title: 'Detect bands',
      description: 'Set band prominence, spacing, and direction from the signal representation.',
      parameterIds: ['bandThreshold', 'minimumBandDistance', 'peakDirection'],
    },
    {
      id: 'validate',
      label: 'Validate',
      title: 'Review band evidence',
      description: 'Review assignments, confidence, and interference warnings before interpretation.',
      parameterIds: [],
    },
  ],
  raman: [
    {
      id: 'prepare',
      label: 'Prepare',
      title: 'Prepare the Raman signal',
      description: 'Establish the correction model before mode detection.',
      parameterIds: ['baselineMethod', 'polynomialOrder'],
    },
    {
      id: 'correct',
      label: 'Correct',
      title: 'Correct the signal',
      description: 'Smooth the corrected spectrum while preserving narrow Raman modes.',
      parameterIds: ['smoothingMethod', 'smoothingWindow'],
    },
    {
      id: 'detect',
      label: 'Detect',
      title: 'Detect Raman modes',
      description: 'Set prominence and spacing thresholds for reported mode evidence.',
      parameterIds: ['peakThreshold', 'minimumDistance'],
    },
    {
      id: 'validate',
      label: 'Validate',
      title: 'Review mode evidence',
      description: 'Review mode assignments, symmetry evidence, and defect or heating warnings.',
      parameterIds: [],
    },
  ],
};

function xpsTemplate(scope: string): StepTemplate[] {
  if (scope === 'Survey') {
    return [
      {
        id: 'prepare',
        label: 'Scope',
        title: 'Confirm Survey scope',
        description: 'Use the full spectrum for broad elemental screening, not chemical-state fitting.',
        parameterIds: ['regionSelection'],
      },
      {
        id: 'correct',
        label: 'Correct',
        title: 'Correct the Survey',
        description: 'Apply the configured background model before screening survey features.',
        parameterIds: ['backgroundMethod'],
      },
      {
        id: 'detect',
        label: 'Screen',
        title: 'Screen elemental features',
        description: 'Detect broad survey features using survey-specific thresholds only.',
        parameterIds: ['surveyPeakProminence', 'surveyPeakMinDistance'],
      },
      {
        id: 'validate',
        label: 'Review',
        title: 'Review Survey evidence',
        description: 'Review candidate elements and request high-resolution regions before chemical-state claims.',
        parameterIds: [],
      },
    ];
  }

  return [
    {
      id: 'prepare',
      label: 'Scope',
      title: `Confirm ${scope} scope`,
      description: 'Treat this as a survey-derived region unless an independent high-resolution source is provided.',
      parameterIds: ['regionSelection'],
    },
    {
      id: 'correct',
      label: 'Calibrate',
      title: 'Calibrate and correct',
      description: 'Apply charge-reference, energy-shift, and background settings to this element region.',
      parameterIds: ['chargeCorrectionMethod', 'referencePeak', 'referenceEnergy', 'energyShift', 'backgroundMethod'],
    },
    {
      id: 'detect',
      label: 'Fit',
      title: 'Fit the element region',
      description: 'Fit components using only the active region-specific constraints.',
      parameterIds: ['peakModel', 'fwhmConstraint', 'spinOrbitSplit', 'areaRatio', 'peakAsymmetry'],
    },
    {
      id: 'validate',
      label: 'Validate',
      title: 'Review assignments',
      description: 'Review fit quality and assignment limits before oxidation-state interpretation.',
      parameterIds: [],
    },
  ];
}

function hasConfiguredValue(value: CanonicalParameterValue | undefined): boolean {
  if (value === null || value === undefined || value === '') return false;
  return !Array.isArray(value) || value.length > 0;
}

export function buildAgentProcessingPlan(
  technique: CanonicalTechnique,
  controls: CanonicalWorkspaceControl[],
  values: Record<string, CanonicalParameterValue>,
): AgentProcessingPlanStep[] {
  const scope = technique === 'xps' ? String(values.regionSelection ?? 'Survey') : '';
  const templates = technique === 'xps' ? xpsTemplate(scope) : PLAN_TEMPLATES[technique];
  const controlsById = new Map(controls.map((control) => [control.id, control]));

  return templates.map((template) => {
    const stepControls = template.parameterIds
      .map((id) => controlsById.get(id))
      .filter((control): control is CanonicalWorkspaceControl => Boolean(control?.active));
    return {
      ...template,
      controls: stepControls,
      configured: stepControls.length > 0 && stepControls.every((control) => (
        hasConfiguredValue(values[control.id] ?? control.defaultValue)
      )),
    };
  });
}

