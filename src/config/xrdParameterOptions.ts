import type {
  XRDBaselineMethod,
  XRDClaimMode,
  XRDMatchMode,
  XRDPeakFitModel,
  XRDReferenceSource,
  XRDSmoothingMethod,
} from '../types/xrdParameters';

export interface XRDParameterOption<TValue extends string> {
  label: string;
  value: TValue;
  description?: string;
}

export const XRD_BASELINE_METHOD_OPTIONS: XRDParameterOption<XRDBaselineMethod>[] = [
  { label: 'Asymmetric LS', value: 'asymmetric_ls' },
  { label: 'Polynomial', value: 'polynomial' },
  { label: 'Rolling Ball', value: 'rolling_ball' },
  { label: 'None', value: 'none' },
];

export const XRD_SMOOTHING_METHOD_OPTIONS: XRDParameterOption<XRDSmoothingMethod>[] = [
  { label: 'Savitzky-Golay', value: 'savitzky_golay' },
  { label: 'Moving Average', value: 'moving_average' },
  { label: 'None', value: 'none' },
];

export const XRD_PEAK_FIT_MODEL_OPTIONS: XRDParameterOption<XRDPeakFitModel>[] = [
  { label: 'Pseudo-Voigt', value: 'pseudo_voigt' },
  { label: 'Gaussian', value: 'gaussian' },
  { label: 'Lorentzian', value: 'lorentzian' },
];

export const XRD_REFERENCE_SOURCE_OPTIONS: XRDParameterOption<XRDReferenceSource>[] = [
  { label: 'Internal Curated', value: 'internal_curated' },
  { label: 'Project Local Reference', value: 'project_local_reference' },
  { label: 'Uploaded Reference', value: 'uploaded_reference' },
];

export const XRD_MATCH_MODE_OPTIONS: XRDParameterOption<XRDMatchMode>[] = [
  { label: 'Targeted Candidate Match', value: 'targeted_candidate_match' },
  { label: 'Candidate Screening', value: 'candidate_screening' },
  { label: 'Disabled', value: 'disabled' },
];

export const XRD_CLAIM_MODE_OPTIONS: XRDParameterOption<XRDClaimMode>[] = [
  { label: 'Conservative', value: 'conservative' },
  { label: 'Standard', value: 'standard' },
  { label: 'Exploratory', value: 'exploratory' },
];
