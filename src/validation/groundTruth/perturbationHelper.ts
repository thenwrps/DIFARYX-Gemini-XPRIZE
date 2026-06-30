export type PerturbationType = 'within_tolerance_shift' | 'beyond_tolerance_shift' | 'noise' | 'missing_peak' | 'extra_peak' | 'combined';

export interface Peak {
  position: number;
  intensity: number;
}

export interface PerturbationOptions {
  shift?: number;
  dropCount?: number;
  spuriousPeak?: { position: number; intensity: number };
  noiseMultiplier?: number;
}

export interface TechniquePerturbationConfig {
  tolerance: number; // e.g., 0.2 for XRD, 8 for Raman, 25 for FTIR, 0.5 for XPS
  axisUnits: string; // e.g., 'deg(2theta)', 'cm-1', 'eV'
  decimals?: number; // default 3
}

export function perturbPeaks(
  rawPeaks: Peak[],
  config: TechniquePerturbationConfig,
  options: PerturbationOptions = {}
): Peak[] {
  const decimals = config.decimals !== undefined ? config.decimals : 3;

  // Sort by intensity descending to drop secondary strong peaks if requested
  const sorted = [...rawPeaks].sort((a, b) => b.intensity - a.intensity);
  if (options.dropCount && options.dropCount > 0) {
    sorted.splice(1, options.dropCount);
  }

  // Sort back by position
  sorted.sort((a, b) => a.position - b.position);

  // Variation scale: 0.005 for 0.2 tolerance -> tolerance * 0.025
  const variationScale = config.tolerance * 0.025;

  const result = sorted.map((p, idx) => {
    const variation = (idx % 2 === 0 ? 1 : -1) * variationScale;
    const shift = options.shift !== undefined ? options.shift + variation : 0;
    const noise = options.noiseMultiplier !== undefined ? options.noiseMultiplier * (1 + ((idx % 3) - 1) * 0.02) : 1;
    return {
      position: Number((p.position + shift).toFixed(decimals)),
      intensity: Math.max(1, Number((p.intensity * noise).toFixed(1))),
    };
  });

  if (options.spuriousPeak) {
    result.push(options.spuriousPeak);
    result.sort((a, b) => a.position - b.position);
  }

  return result;
}
