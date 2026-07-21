export const SCIENTIFIC_MODEL_ENV_KEYS = {
  model: 'OPENAI_SCIENTIFIC_MODEL',
  reasoningEffort: 'OPENAI_SCIENTIFIC_REASONING_EFFORT',
  promptVersion: 'OPENAI_SCIENTIFIC_PROMPT_VERSION',
} as const;

export interface ScientificModelConfiguration {
  model?: string;
  reasoningEffort?: string;
  promptVersion?: string;
}

export class ScientificModelConfigurationError extends Error {
  readonly code = 'SCIENTIFIC_MODEL_CONFIGURATION_MISSING';

  constructor(message: string) {
    super(message);
    this.name = 'ScientificModelConfigurationError';
  }
}

/** Reads supplied configuration only; it does not inspect process or browser environment. */
export function readScientificModelConfiguration(
  values: Partial<Record<(typeof SCIENTIFIC_MODEL_ENV_KEYS)[keyof typeof SCIENTIFIC_MODEL_ENV_KEYS], string | undefined>>,
): ScientificModelConfiguration {
  return {
    model: values[SCIENTIFIC_MODEL_ENV_KEYS.model]?.trim() || undefined,
    reasoningEffort: values[SCIENTIFIC_MODEL_ENV_KEYS.reasoningEffort]?.trim() || undefined,
    promptVersion: values[SCIENTIFIC_MODEL_ENV_KEYS.promptVersion]?.trim() || undefined,
  };
}
