export type SyntheticTracePoint = {
  x: number;
  y: number;
};

type Peak = {
  center: number;
  width: number;
  amplitude: number;
};

function gaussian(x: number, peak: Peak) {
  return peak.amplitude * Math.exp(-0.5 * Math.pow((x - peak.center) / peak.width, 2));
}

function lorentzian(x: number, peak: Peak) {
  return peak.amplitude / (1 + Math.pow((x - peak.center) / peak.width, 2));
}

function pseudoVoigt(x: number, peak: Peak, lorentzianMix = 0.28) {
  return gaussian(x, peak) * (1 - lorentzianMix) + lorentzian(x, peak) * lorentzianMix;
}

function deterministicNoise(index: number, x: number, amplitude: number) {
  return amplitude * (
    0.5 * Math.sin(index * 0.93 + x * 0.17) +
    0.3 * Math.sin(index * 2.11 + 0.8) +
    0.2 * Math.cos(index * 0.37 - x * 0.09)
  );
}

function sampleRange(start: number, end: number, count: number, fn: (x: number, index: number) => number): SyntheticTracePoint[] {
  return Array.from({ length: count }, (_, index) => {
    const x = start + ((end - start) * index) / (count - 1);
    return { x, y: fn(x, index) };
  });
}

export function generateXrdTrace(count = 260): SyntheticTracePoint[] {
  const peaks: Peak[] = [
    { center: 18.3, width: 0.22, amplitude: 18 },
    { center: 30.1, width: 0.24, amplitude: 52 },
    { center: 35.5, width: 0.27, amplitude: 92 },
    { center: 37.1, width: 0.25, amplitude: 24 },
    { center: 43.2, width: 0.3, amplitude: 48 },
    { center: 53.6, width: 0.34, amplitude: 28 },
    { center: 57.1, width: 0.37, amplitude: 39 },
    { center: 62.7, width: 0.4, amplitude: 45 },
  ];

  return sampleRange(10, 80, count, (x, index) => {
    const lowAngleScatter = 3.8 * Math.exp(-(x - 10) / 26);
    const broadSupport = gaussian(x, { center: 22.5, width: 7.4, amplitude: 1.7 });
    const baseline = 8.2 + lowAngleScatter + broadSupport + 0.26 * Math.sin(x * 0.42);
    const reflections = peaks.reduce((sum, peak) => {
      const mainPeak = pseudoVoigt(x, peak, 0.22);
      const kAlphaTail = pseudoVoigt(
        x,
        { center: peak.center + 0.18, width: peak.width * 1.22, amplitude: peak.amplitude * 0.14 },
        0.34,
      );

      return sum + mainPeak + kAlphaTail;
    }, 0);

    return baseline + reflections + deterministicNoise(index, x, 0.22);
  });
}

export function generateRamanTrace(count = 260): SyntheticTracePoint[] {
  // Raman modes for CuFe₂O₄ based on reference data (Graves et al., 1988)
  // Mode positions match src/data/ramanReferenceData.ts
  // Group theory predicts 5 Raman-active modes for spinel: A₁g + Eg + 3T₂g
  // Width parameter is σ (standard deviation); FWHM = 2.355 × σ
  const peaks: Peak[] = [
    // T₂g mode 1 - Asymmetric bending (lowest frequency)
    // Target FWHM: 20-40 cm⁻¹ → σ ≈ 12.7 cm⁻¹ (for FWHM ~30 cm⁻¹)
    { center: 210, width: 12.7, amplitude: 20 },
    // Eg mode - Symmetric bending vibration
    // Target FWHM: 20-40 cm⁻¹ → σ ≈ 12.7 cm⁻¹ (for FWHM ~30 cm⁻¹)
    { center: 300, width: 12.7, amplitude: 40 },
    // T₂g mode 2 - Asymmetric bending/stretching (intermediate frequency)
    // Target FWHM: 15-35 cm⁻¹ → σ ≈ 10.6 cm⁻¹ (for FWHM ~25 cm⁻¹)
    { center: 480, width: 10.6, amplitude: 50 },
    // T₂g mode 3 - Asymmetric stretching (highest frequency)
    // Target FWHM: 15-35 cm⁻¹ → σ ≈ 10.6 cm⁻¹ (for FWHM ~25 cm⁻¹)
    { center: 560, width: 10.6, amplitude: 60 },
    // A₁g mode - Symmetric stretching (strongest mode)
    // Target FWHM: 15-30 cm⁻¹ → σ ≈ 9.3 cm⁻¹ (for FWHM ~22 cm⁻¹)
    { center: 690, width: 9.3, amplitude: 100 },
  ];

  return sampleRange(150, 850, count, (x, index) => {
    const normalizedX = (x - 150) / 700;
    const fluorescence = 18 * Math.exp(-normalizedX * 0.95);
    const broadPhononShoulder = gaussian(x, { center: 615, width: 74, amplitude: 5.2 });
    const baseline = 7.4 + fluorescence + broadPhononShoulder + 0.45 * Math.sin(index * 0.08);
    const modes = peaks.reduce((sum, peak) => sum + pseudoVoigt(x, peak, 0.2), 0);

    return baseline + modes + deterministicNoise(index, x, 0.38);
  });
}

export function generateFtirTrace(count = 260): SyntheticTracePoint[] {
  // FTIR bands for CuFe₂O₄ based on reference data (Waldron, 1955)
  // Band positions match src/data/ftirReferenceData.ts
  const bands: Peak[] = [
    // Octahedral site metal-oxygen stretching (400 cm⁻¹)
    { center: 415, width: 54, amplitude: 13 },
    // Tetrahedral site Fe-O stretching (580 cm⁻¹)
    { center: 580, width: 48, amplitude: 23 },
    { center: 1080, width: 76, amplitude: 10 },
    { center: 1385, width: 48, amplitude: 6 },
    { center: 1450, width: 56, amplitude: 9 },
    { center: 1548, width: 62, amplitude: 7 },
    // Adsorbed water H-O-H bending (1630 cm⁻¹)
    { center: 1630, width: 68, amplitude: 13 },
    { center: 2855, width: 34, amplitude: 3.6 },
    { center: 2922, width: 38, amplitude: 4.8 },
    // Surface hydroxyl O-H stretching (3400 cm⁻¹)
    { center: 3400, width: 185, amplitude: 20 },
  ];

  return sampleRange(400, 4000, count, (x, index) => {
    const normalizedX = (x - 400) / 3600;
    const baseline = 92 + 2.3 * normalizedX + 1.1 * Math.sin(index * 0.032);
    const absorbanceBands = bands.reduce((sum, band) => sum + pseudoVoigt(x, band, 0.12), 0);

    return baseline - absorbanceBands + deterministicNoise(index, x, 0.14);
  });
}

export function generateXpsTrace(count = 260): SyntheticTracePoint[] {
  const cu2pRegion: Peak[] = [
    { center: 933.5, width: 1.42, amplitude: 88 },
    { center: 942.2, width: 2.55, amplitude: 27 },
    { center: 953.3, width: 1.62, amplitude: 43 },
    { center: 962.2, width: 2.7, amplitude: 14 },
  ];

  return sampleRange(925, 965, count, (x, index) => {
    const scanProgress = (x - 925) / 40;
    const shirleyLikeBackground = 14 + 4.2 * scanProgress + 1.6 / (1 + Math.exp(-(x - 944) / 1.6));
    const envelopes = cu2pRegion.reduce((sum, peak) => {
      const core = pseudoVoigt(x, peak, 0.38);
      const lossTail = pseudoVoigt(
        x,
        { center: peak.center + peak.width * 1.8, width: peak.width * 2.6, amplitude: peak.amplitude * 0.12 },
        0.52,
      );

      return sum + core + lossTail;
    }, 0);

    return shirleyLikeBackground + envelopes + deterministicNoise(index, x, 0.34);
  });
}

export function generateUvVisTrace(count = 220): SyntheticTracePoint[] {
  return sampleRange(300, 850, count, (x) => {
    const absorptionEdge = 1 / (1 + Math.exp((x - 515) / 34));
    const shoulder = gaussian(x, { center: 680, width: 90, amplitude: 0.18 });
    return 0.18 + 0.82 * absorptionEdge + shoulder;
  });
}

export function generateVsmTrace(count = 240): SyntheticTracePoint[] {
  return Array.from({ length: count }, (_, index) => {
    const phase = index / (count - 1);
    const field = phase < 0.5 ? -12 + phase * 48 : 12 - (phase - 0.5) * 48;
    const branchOffset = phase < 0.5 ? 1.6 : -1.6;
    const y = 58 * Math.tanh((field + branchOffset) / 3.4);
    return { x: field, y };
  });
}

export function createSvgPath(points: SyntheticTracePoint[], width = 500, height = 120, padding = 8) {
  if (points.length === 0) return '';

  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const xSpan = maxX - minX || 1;
  const ySpan = maxY - minY || 1;

  return points
    .map((point, index) => {
      const x = padding + ((point.x - minX) / xSpan) * (width - padding * 2);
      const y = padding + (1 - (point.y - minY) / ySpan) * (height - padding * 2);
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}
