import type {
  XRDCifMetadata,
  XRDLocalReferenceCellParameters,
  XRDLocalReferenceParseResult,
  XRDLocalReferencePeak,
  XRDReferenceFileKind,
  XRDReferenceImportCapability,
  XRDReferenceImportDiagnostics,
  XRDReferenceImportStatus,
  XRDReferenceTextBinaryLikelihood,
} from '../types/xrdLocalReference';

const LOCAL_REFERENCE_BACKEND_WARNING = 'Local references are sent to backend matching only when explicitly enabled.';

const TEXT_PEAK_LIST_EXTENSIONS = new Set(['.csv', '.txt', '.xy', '.dat']);
const INSTRUMENT_NATIVE_EXTENSIONS = new Set(['.raw', '.ras', '.xrdml', '.brml', '.uxd']);
const CIF_EXTENSIONS = new Set(['.cif']);
const REFERENCE_CARD_EXTENSIONS = new Set(['.pdf', '.card', '.jcpds', '.xml']);

const TWO_THETA_COLUMNS = new Set(['two_theta', '2theta', '2_theta', 'twotheta', 'two-theta', 'position', 'angle']);
const RELATIVE_INTENSITY_COLUMNS = new Set(['relative_intensity', 'rel_intensity', 'rel-intensity', 'relativeintensity', 'intensity']);
const HKL_COLUMNS = new Set(['hkl', 'miller_index', 'miller_indices']);
const D_SPACING_COLUMNS = new Set(['d_spacing', 'd-spacing', 'dspacing', 'd']);
const CIF_MARKERS = [
  'data_',
  '_cell_length_a',
  '_cell_length_b',
  '_cell_length_c',
  '_cell_angle_alpha',
  '_space_group_name_h-m_alt',
  '_symmetry_space_group_name_h-m',
  '_atom_site_',
];
const CIF_FORMULA_TAGS = ['_chemical_formula_sum', '_chemical_formula_structural'];
const CIF_STRUCTURE_NAME_TAGS = ['_chemical_name_common', '_chemical_name_mineral', '_chemical_name_systematic', '_pd_phase_name'];
const CIF_SPACE_GROUP_TAGS = ['_space_group_name_h-m_alt', '_symmetry_space_group_name_h-m'];
const CIF_CRYSTAL_SYSTEM_TAGS = ['_space_group_crystal_system', '_symmetry_cell_setting'];
const CU_K_ALPHA_WAVELENGTH_ANGSTROM = 1.5406;

type ColumnKey = 'twoTheta' | 'relativeIntensity' | 'hkl' | 'dSpacing';
type ColumnIndexes = Partial<Record<ColumnKey, number>>;

interface ParseOptions {
  fileSizeBytes?: number;
}

interface FileDetection {
  extension?: string;
  sourceFileType?: XRDLocalReferenceParseResult['sourceFileType'];
  fileKind: XRDReferenceFileKind;
  detectedFormat?: string;
  textBinaryLikelihood: XRDReferenceTextBinaryLikelihood;
}

function getExtension(sourceFileName: string) {
  return sourceFileName.match(/\.[^.]+$/)?.[0]?.toLowerCase();
}

function isTextSourceFileType(extension: string | undefined): extension is XRDLocalReferenceParseResult['sourceFileType'] {
  return extension === '.csv' || extension === '.txt' || extension === '.xy' || extension === '.dat';
}

function getTextBinaryLikelihood(text: string): XRDReferenceTextBinaryLikelihood {
  if (!text) return 'unknown';
  if (text.includes('\u0000')) return 'likely_binary';

  const sample = text.slice(0, 4096);
  const controlCount = Array.from(sample).filter((char) => {
    const code = char.charCodeAt(0);
    return code < 32 && char !== '\n' && char !== '\r' && char !== '\t';
  }).length;
  const ratio = sample.length > 0 ? controlCount / sample.length : 0;
  if (ratio > 0.08) return 'likely_binary';
  if (ratio > 0.02) return 'mixed';
  return 'likely_text';
}

function detectReferenceFile(text: string, sourceFileName: string): FileDetection {
  const extension = getExtension(sourceFileName);
  const textBinaryLikelihood = getTextBinaryLikelihood(text);
  const lowerText = text.slice(0, 4096).toLowerCase();
  const hasCifMarker = CIF_MARKERS.some((marker) => lowerText.includes(marker));

  if (textBinaryLikelihood === 'likely_binary') {
    return {
      extension,
      fileKind: INSTRUMENT_NATIVE_EXTENSIONS.has(extension ?? '') ? 'instrument_native' : 'unknown_binary',
      detectedFormat: extension,
      textBinaryLikelihood,
    };
  }

  if (isTextSourceFileType(extension)) {
    const fileKind: XRDReferenceFileKind = hasCifMarker
      ? 'crystallographic_cif'
      : extension === '.xy' || extension === '.dat'
        ? 'exported_text_pattern'
        : 'text_peak_list';
    return {
      extension,
      sourceFileType: extension,
      fileKind,
      detectedFormat: fileKind === 'crystallographic_cif' ? 'CIF structure file' : extension,
      textBinaryLikelihood,
    };
  }

  if (INSTRUMENT_NATIVE_EXTENSIONS.has(extension ?? '')) {
    return { extension, fileKind: 'instrument_native', detectedFormat: extension, textBinaryLikelihood };
  }
  if (CIF_EXTENSIONS.has(extension ?? '') || hasCifMarker) {
    return { extension, fileKind: 'crystallographic_cif', detectedFormat: 'CIF structure file', textBinaryLikelihood };
  }
  if (REFERENCE_CARD_EXTENSIONS.has(extension ?? '') || lowerText.includes('jcpds') || lowerText.includes('pdf-4')) {
    return { extension, fileKind: 'reference_database_card', detectedFormat: extension ?? 'reference-card text', textBinaryLikelihood };
  }

  return {
    extension,
    fileKind: textBinaryLikelihood === 'likely_text' || textBinaryLikelihood === 'mixed' ? 'unknown_text' : 'unknown_binary',
    detectedFormat: extension,
    textBinaryLikelihood,
  };
}

function normalizeHeaderToken(token: string) {
  return token
    .trim()
    .replace(/^\uFEFF/, '')
    .replace(/^["']|["']$/g, '')
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[°()]/g, '');
}

function splitReferenceLine(line: string) {
  const trimmed = line.trim();
  if (trimmed.includes(',')) {
    return trimmed.split(',').map((token) => token.trim());
  }
  if (trimmed.includes('\t')) {
    return trimmed.split('\t').map((token) => token.trim());
  }
  return trimmed.split(/\s+/).map((token) => token.trim());
}

function getHeaderColumn(token: string): ColumnKey | null {
  const normalized = normalizeHeaderToken(token);
  if (TWO_THETA_COLUMNS.has(normalized)) return 'twoTheta';
  if (RELATIVE_INTENSITY_COLUMNS.has(normalized)) return 'relativeIntensity';
  if (HKL_COLUMNS.has(normalized)) return 'hkl';
  if (D_SPACING_COLUMNS.has(normalized)) return 'dSpacing';
  return null;
}

function buildHeaderIndexes(tokens: string[]) {
  return tokens.reduce<ColumnIndexes>((indexes, token, index) => {
    const column = getHeaderColumn(token);
    if (column && indexes[column] === undefined) {
      indexes[column] = index;
    }
    return indexes;
  }, {});
}

function parseFiniteNumber(value: string | undefined) {
  if (value === undefined) return undefined;
  const cleaned = value
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/[°]/g, '');
  if (!cleaned) return undefined;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function getStringValue(value: string | undefined) {
  const cleaned = value?.trim().replace(/^["']|["']$/g, '');
  return cleaned || undefined;
}

function cleanCifValue(value: string | undefined) {
  const cleaned = getStringValue(value)
    ?.replace(/^;|;$/g, '')
    .trim();
  if (!cleaned || cleaned === '?' || cleaned === '.') return undefined;
  return cleaned;
}

function parseCifNumber(value: string | undefined) {
  const cleaned = cleanCifValue(value)?.replace(/\([^)]+\)$/, '');
  if (!cleaned) return undefined;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function tokenizeCifLine(line: string) {
  const tokens: string[] = [];
  const tokenPattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = tokenPattern.exec(line)) !== null) {
    tokens.push(match[1] ?? match[2] ?? match[3]);
  }
  return tokens;
}

function getCifLines(text: string) {
  return text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

function extractCifTagValue(lines: string[], tags: string[]) {
  const tagSet = new Set(tags.map((tag) => tag.toLowerCase()));

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lowerLine = line.toLowerCase();
    const matchedTag = tags.find((tag) => lowerLine === tag.toLowerCase() || lowerLine.startsWith(`${tag.toLowerCase()} `));
    if (!matchedTag || !tagSet.has(matchedTag.toLowerCase())) continue;

    const tokens = tokenizeCifLine(line);
    if (tokens.length > 1) {
      return cleanCifValue(tokens.slice(1).join(' '));
    }

    const nextLine = lines[index + 1];
    if (nextLine && !nextLine.startsWith('_') && nextLine.toLowerCase() !== 'loop_') {
      return cleanCifValue(nextLine);
    }
  }

  return undefined;
}

function extractCifDataBlockName(lines: string[]) {
  const dataLine = lines.find((line) => line.toLowerCase().startsWith('data_'));
  const blockName = dataLine?.slice(5).trim();
  return blockName || undefined;
}

function extractElementsFromFormula(formula: string | undefined) {
  if (!formula) return [];
  const matches = formula.match(/[A-Z][a-z]?/g) ?? [];
  return Array.from(new Set(matches));
}

function extractCifCellParameters(lines: string[]): XRDLocalReferenceCellParameters | undefined {
  const cellParameters: XRDLocalReferenceCellParameters = {
    a: parseCifNumber(extractCifTagValue(lines, ['_cell_length_a'])),
    b: parseCifNumber(extractCifTagValue(lines, ['_cell_length_b'])),
    c: parseCifNumber(extractCifTagValue(lines, ['_cell_length_c'])),
    alpha: parseCifNumber(extractCifTagValue(lines, ['_cell_angle_alpha'])),
    beta: parseCifNumber(extractCifTagValue(lines, ['_cell_angle_beta'])),
    gamma: parseCifNumber(extractCifTagValue(lines, ['_cell_angle_gamma'])),
  };

  return Object.values(cellParameters).some((value) => value !== undefined) ? cellParameters : undefined;
}

interface CifLoop {
  tags: string[];
  rows: string[][];
}

function parseCifLoops(lines: string[]): CifLoop[] {
  const loops: CifLoop[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].toLowerCase() !== 'loop_') continue;

    const tags: string[] = [];
    const rows: string[][] = [];
    index += 1;

    while (index < lines.length && lines[index].startsWith('_')) {
      tags.push(tokenizeCifLine(lines[index])[0]?.toLowerCase() ?? lines[index].toLowerCase());
      index += 1;
    }

    while (index < lines.length) {
      const lowerLine = lines[index].toLowerCase();
      if (lowerLine === 'loop_' || lowerLine.startsWith('data_') || lines[index].startsWith('_')) {
        index -= 1;
        break;
      }

      const tokens = tokenizeCifLine(lines[index]).map(cleanCifValue).filter((token): token is string => Boolean(token));
      if (tokens.length >= tags.length && tags.length > 0) {
        rows.push(tokens.slice(0, tags.length));
      }
      index += 1;
    }

    if (tags.length > 0) {
      loops.push({ tags, rows });
    }
  }

  return loops;
}

function getCifLoopTagIndex(loop: CifLoop, tag: string) {
  return loop.tags.findIndex((candidate) => candidate === tag.toLowerCase());
}

function twoThetaFromDSpacing(dSpacing: number | undefined) {
  if (typeof dSpacing !== 'number' || !Number.isFinite(dSpacing) || dSpacing <= 0) return undefined;
  const ratio = CU_K_ALPHA_WAVELENGTH_ANGSTROM / (2 * dSpacing);
  if (ratio <= 0 || ratio > 1) return undefined;
  return (2 * Math.asin(ratio) * 180) / Math.PI;
}

function parseCifPeakLoops(loops: CifLoop[]) {
  const peaks: XRDLocalReferencePeak[] = [];
  let ignoredRowCount = 0;
  let usedDSpacingConversion = false;

  loops.forEach((loop) => {
    const twoThetaIndex = getCifLoopTagIndex(loop, '_pd_peak_2theta');
    const intensityIndex = getCifLoopTagIndex(loop, '_pd_peak_intensity');
    const dSpacingIndex = getCifLoopTagIndex(loop, '_refln_d_spacing');
    const hIndex = getCifLoopTagIndex(loop, '_refln_index_h');
    const kIndex = getCifLoopTagIndex(loop, '_refln_index_k');
    const lIndex = getCifLoopTagIndex(loop, '_refln_index_l');
    const hasPeakColumns = twoThetaIndex >= 0 || dSpacingIndex >= 0;
    if (!hasPeakColumns) return;

    loop.rows.forEach((row) => {
      const dSpacing = parseCifNumber(row[dSpacingIndex]);
      const twoTheta = parseCifNumber(row[twoThetaIndex]) ?? twoThetaFromDSpacing(dSpacing);
      if (!Number.isFinite(twoTheta)) {
        ignoredRowCount += 1;
        return;
      }

      if (twoThetaIndex < 0 && dSpacing !== undefined) {
        usedDSpacingConversion = true;
      }

      const h = cleanCifValue(row[hIndex]);
      const k = cleanCifValue(row[kIndex]);
      const l = cleanCifValue(row[lIndex]);
      const hkl = h && k && l ? `(${h}${k}${l})` : undefined;
      peaks.push({
        twoTheta: twoTheta as number,
        ...(Number.isFinite(parseCifNumber(row[intensityIndex])) ? { relativeIntensity: parseCifNumber(row[intensityIndex]) } : {}),
        ...(hkl ? { hkl } : {}),
        ...(dSpacing !== undefined ? { dSpacing } : {}),
      });
    });
  });

  return { peaks, ignoredRowCount, usedDSpacingConversion };
}

function getCifAtomSiteCount(loops: CifLoop[]) {
  const atomSiteLoop = loops.find((loop) => loop.tags.some((tag) => tag.startsWith('_atom_site_')));
  return atomSiteLoop?.rows.length;
}

function parsePeak(tokens: string[], indexes: ColumnIndexes): XRDLocalReferencePeak | null {
  const twoTheta = parseFiniteNumber(tokens[indexes.twoTheta ?? 0]);
  if (twoTheta === undefined) return null;

  const relativeIntensityIndex = indexes.relativeIntensity ?? 1;
  const hklIndex = indexes.hkl ?? 2;
  const dSpacingIndex = indexes.dSpacing ?? 3;
  const relativeIntensity = parseFiniteNumber(tokens[relativeIntensityIndex]);
  const hkl = getStringValue(tokens[hklIndex]);
  const dSpacing = parseFiniteNumber(tokens[dSpacingIndex]);

  return {
    twoTheta,
    ...(relativeIntensity !== undefined ? { relativeIntensity } : {}),
    ...(hkl ? { hkl } : {}),
    ...(dSpacing !== undefined ? { dSpacing } : {}),
  };
}

function buildValidation(
  peaks: XRDLocalReferencePeak[],
  errors: string[],
  additionalWarnings: string[],
  hasRequiredMetadata = false,
) {
  const hasTwoTheta = peaks.length > 0;
  const hasAtLeastThreePeaks = peaks.length >= 3;
  const hasRelativeIntensity = peaks.some((peak) => Number.isFinite(peak.relativeIntensity));
  const warnings: string[] = [];

  if (!hasRelativeIntensity) warnings.push('Missing relative intensity values.');
  if (!hasAtLeastThreePeaks) warnings.push('Fewer than 3 peaks were parsed.');
  if (!hasRequiredMetadata) warnings.push('Reference metadata was not supplied.');
  warnings.push(...additionalWarnings);
  warnings.push(LOCAL_REFERENCE_BACKEND_WARNING);

  return {
    hasTwoTheta,
    hasAtLeastThreePeaks,
    hasRelativeIntensity,
    hasRequiredMetadata,
    warnings,
    errors,
  };
}

function buildCapability(
  status: XRDReferenceImportStatus,
  isEligibleForBackendMatching: boolean,
  notes: string[],
): XRDReferenceImportCapability {
  return {
    canPreview: status === 'parsed_preview' || status === 'partial_preview' || status === 'repaired_preview',
    canParsePeaks: status === 'parsed_preview' || status === 'partial_preview' || status === 'repaired_preview',
    requiresConverter: status === 'requires_converter',
    plannedConverter: status === 'requires_converter' || status === 'not_supported_yet',
    isEligibleForBackendMatching,
    notes,
  };
}

function buildResult(args: {
  sourceFileName: string;
  sourceFileType?: XRDLocalReferenceParseResult['sourceFileType'];
  fileSizeBytes?: number;
  detection: FileDetection;
  status: XRDReferenceImportStatus;
  peaks: XRDLocalReferencePeak[];
  parsedRowCount: number;
  ignoredRowCount: number;
  warnings: string[];
  errors: string[];
  capabilityNotes: string[];
  referenceLabel?: string;
  hasRequiredMetadata?: boolean;
  structureName?: string;
  formulaFromCif?: string;
  formula?: string;
  materialFamily?: string;
  spaceGroup?: string;
  crystalSystem?: string;
  cellParameters?: XRDLocalReferenceCellParameters;
  cifMetadata?: XRDCifMetadata;
  elements?: string[];
}): XRDLocalReferenceParseResult {
  const isEligibleForBackendMatching = (
    (args.status === 'parsed_preview' || args.status === 'partial_preview' || args.status === 'repaired_preview')
    && args.peaks.length >= 3
    && args.errors.length === 0
  );
  const validation = buildValidation(args.peaks, args.errors, args.warnings, args.hasRequiredMetadata);
  const diagnostics: XRDReferenceImportDiagnostics = {
    fileKind: args.detection.fileKind,
    ...(args.detection.detectedFormat ? { detectedFormat: args.detection.detectedFormat } : {}),
    ...(args.fileSizeBytes !== undefined ? { fileSizeBytes: args.fileSizeBytes } : {}),
    textBinaryLikelihood: args.detection.textBinaryLikelihood,
    parsedRowCount: args.parsedRowCount,
    ignoredRowCount: args.ignoredRowCount,
    warnings: validation.warnings,
    errors: validation.errors,
    isEligibleForBackendMatching,
  };
  const capability = buildCapability(args.status, isEligibleForBackendMatching, args.capabilityNotes);

  return {
    sourceFileName: args.sourceFileName,
    ...(args.sourceFileType ? { sourceFileType: args.sourceFileType } : {}),
    parsedAt: new Date().toISOString(),
    status: args.status,
    referenceLabel: args.referenceLabel ?? (args.sourceFileName.replace(/\.[^.]+$/, '') || undefined),
    ...(args.formula ? { formula: args.formula } : {}),
    ...(args.materialFamily ? { materialFamily: args.materialFamily } : {}),
    ...(args.structureName ? { structureName: args.structureName } : {}),
    ...(args.formulaFromCif ? { formulaFromCif: args.formulaFromCif } : {}),
    ...(args.spaceGroup ? { spaceGroup: args.spaceGroup } : {}),
    ...(args.crystalSystem ? { crystalSystem: args.crystalSystem } : {}),
    ...(args.cellParameters ? { cellParameters: args.cellParameters } : {}),
    ...(args.cifMetadata ? { cifMetadata: args.cifMetadata } : {}),
    elements: args.elements ?? [],
    peaks: args.peaks,
    validation,
    fileKind: args.detection.fileKind,
    ...(args.detection.detectedFormat ? { detectedFormat: args.detection.detectedFormat } : {}),
    ...(args.fileSizeBytes !== undefined ? { fileSizeBytes: args.fileSizeBytes } : {}),
    textBinaryLikelihood: args.detection.textBinaryLikelihood,
    parsedRowCount: args.parsedRowCount,
    ignoredRowCount: args.ignoredRowCount,
    importDiagnostics: diagnostics,
    importCapability: capability,
    isEligibleForBackendMatching,
    backendAvailable: false,
    usedForMatching: false,
  };
}

function buildUnsupportedResult(
  text: string,
  sourceFileName: string,
  options: ParseOptions,
): XRDLocalReferenceParseResult {
  const detection = detectReferenceFile(text, sourceFileName);
  const isBinary = detection.textBinaryLikelihood === 'likely_binary';
  const status: XRDReferenceImportStatus = isBinary
    ? 'corrupted_file'
    : detection.fileKind === 'instrument_native' || detection.fileKind === 'crystallographic_cif' || detection.fileKind === 'reference_database_card'
      ? 'requires_converter'
      : 'unsupported_format';
  const errors = isBinary
    ? ['File appears to be binary or damaged and cannot be parsed as a text peak list.']
    : status === 'requires_converter'
      ? ['This reference file kind requires a converter before peak preview or matching.']
      : ['Unsupported reference file format for the current frontend parser.'];
  const notes = status === 'requires_converter'
    ? ['Planned converter path. Current backend matching uses parsed text peak lists only.']
    : ['No backend matching payload will be built from this import.'];

  return buildResult({
    sourceFileName,
    sourceFileType: detection.sourceFileType,
    fileSizeBytes: options.fileSizeBytes,
    detection,
    status,
    peaks: [],
    parsedRowCount: 0,
    ignoredRowCount: 0,
    warnings: [],
    errors,
    capabilityNotes: notes,
  });
}

export function parseXrdCifReferenceText(
  text: string,
  sourceFileName: string,
  options: ParseOptions = {},
): XRDLocalReferenceParseResult {
  const detection = detectReferenceFile(text, sourceFileName);
  const lines = getCifLines(text);
  const loops = parseCifLoops(lines);
  const structureName = extractCifTagValue(lines, CIF_STRUCTURE_NAME_TAGS);
  const formulaFromCif = extractCifTagValue(lines, CIF_FORMULA_TAGS);
  const spaceGroup = extractCifTagValue(lines, CIF_SPACE_GROUP_TAGS);
  const crystalSystem = extractCifTagValue(lines, CIF_CRYSTAL_SYSTEM_TAGS);
  const cellParameters = extractCifCellParameters(lines);
  const atomSiteCount = getCifAtomSiteCount(loops);
  const peakLoopResult = parseCifPeakLoops(loops);
  const hasExplicitPeakPreview = peakLoopResult.peaks.length > 0;
  const hasRequiredMetadata = Boolean(formulaFromCif || structureName || cellParameters || spaceGroup);
  const conversionMode: XRDCifMetadata['conversionMode'] = hasExplicitPeakPreview
    ? 'estimated_peak_preview'
    : 'metadata_only';
  const cifMetadata: XRDCifMetadata = {
    ...(extractCifDataBlockName(lines) ? { dataBlockName: extractCifDataBlockName(lines) } : {}),
    ...(atomSiteCount !== undefined ? { atomSiteCount } : {}),
    hasCellParameters: Boolean(cellParameters),
    hasSpaceGroup: Boolean(spaceGroup),
    hasAtomSites: typeof atomSiteCount === 'number' && atomSiteCount > 0,
    conversionMode,
  };
  const warnings = [
    'CIF import is reference-source metadata only in this phase.',
    hasExplicitPeakPreview
      ? 'Explicit CIF peak or reflection rows were parsed cautiously for preview.'
      : 'CIF structure detected. Full diffraction simulation is planned; this file is not used for backend matching unless explicit peak data are available.',
    'CIF-derived peaks are not chemical identity confirmation.',
    'Phase purity is not confirmed.',
    'Full structure-to-pattern simulation requires crystallographic validation.',
  ];
  if (peakLoopResult.usedDSpacingConversion) {
    warnings.push('Some CIF preview positions were estimated from d-spacing using Cu K alpha wavelength.');
  }
  if (peakLoopResult.ignoredRowCount > 0) {
    warnings.push(`${peakLoopResult.ignoredRowCount} CIF peak/reflection row${peakLoopResult.ignoredRowCount === 1 ? '' : 's'} could not be parsed and were ignored.`);
  }

  const status: XRDReferenceImportStatus = hasExplicitPeakPreview
    ? peakLoopResult.ignoredRowCount > 0
      ? 'partial_preview'
      : 'parsed_preview'
    : 'requires_converter';
  const errors = lines.length === 0 ? ['Unsupported or empty CIF file.'] : [];

  return buildResult({
    sourceFileName,
    fileSizeBytes: options.fileSizeBytes,
    detection: {
      ...detection,
      fileKind: 'crystallographic_cif',
      detectedFormat: 'CIF structure file',
    },
    status: errors.length > 0 ? 'parse_error' : status,
    peaks: peakLoopResult.peaks,
    parsedRowCount: peakLoopResult.peaks.length,
    ignoredRowCount: peakLoopResult.ignoredRowCount,
    warnings,
    errors,
    capabilityNotes: [
      hasExplicitPeakPreview
        ? 'CIF explicit peak preview may be saved and used only by explicit opt-in when backend eligible.'
        : 'CIF metadata preview requires a future converter before backend matching.',
    ],
    referenceLabel: structureName ?? extractCifDataBlockName(lines) ?? sourceFileName.replace(/\.[^.]+$/, ''),
    hasRequiredMetadata,
    structureName,
    formulaFromCif,
    formula: formulaFromCif,
    materialFamily: 'CIF reference metadata',
    spaceGroup,
    crystalSystem,
    cellParameters,
    cifMetadata,
    elements: extractElementsFromFormula(formulaFromCif),
  });
}

export function parseXrdLocalReferenceText(
  text: string,
  sourceFileName: string,
  options: ParseOptions = {},
): XRDLocalReferenceParseResult {
  const detection = detectReferenceFile(text, sourceFileName);

  if (detection.fileKind === 'crystallographic_cif' && detection.textBinaryLikelihood !== 'likely_binary') {
    return parseXrdCifReferenceText(text, sourceFileName, options);
  }

  if (!detection.sourceFileType || detection.textBinaryLikelihood === 'likely_binary') {
    return buildUnsupportedResult(text, sourceFileName, options);
  }

  if (!text.trim()) {
    return buildResult({
      sourceFileName,
      sourceFileType: detection.sourceFileType,
      fileSizeBytes: options.fileSizeBytes,
      detection,
      status: 'parse_error',
      peaks: [],
      parsedRowCount: 0,
      ignoredRowCount: 0,
      warnings: [],
      errors: ['Unsupported or empty file.'],
      capabilityNotes: ['No backend matching payload will be built from an empty import.'],
    });
  }

  const contentLines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && !line.startsWith('//'));

  if (contentLines.length === 0) {
    return buildResult({
      sourceFileName,
      sourceFileType: detection.sourceFileType,
      fileSizeBytes: options.fileSizeBytes,
      detection,
      status: 'parse_error',
      peaks: [],
      parsedRowCount: 0,
      ignoredRowCount: 0,
      warnings: [],
      errors: ['Unsupported or empty file.'],
      capabilityNotes: ['No backend matching payload will be built from an empty import.'],
    });
  }

  const firstTokens = splitReferenceLine(contentLines[0]);
  const headerIndexes = buildHeaderIndexes(firstTokens);
  const hasHeader = headerIndexes.twoTheta !== undefined || parseFiniteNumber(firstTokens[0]) === undefined;
  const indexes = hasHeader ? headerIndexes : {};
  const dataLines = hasHeader ? contentLines.slice(1) : contentLines;
  const peaks = dataLines
    .map((line) => parsePeak(splitReferenceLine(line), indexes))
    .filter((peak): peak is XRDLocalReferencePeak => Boolean(peak));

  const ignoredRowCount = dataLines.length - peaks.length;
  const warnings: string[] = [];
  if (ignoredRowCount > 0 && peaks.length > 0) {
    warnings.push(`${ignoredRowCount} row${ignoredRowCount === 1 ? '' : 's'} could not be parsed and were ignored.`);
  }
  const errors = peaks.length === 0 ? ['No parsable 2theta values were found.'] : [];
  const status: XRDReferenceImportStatus = errors.length > 0
    ? 'parse_error'
    : ignoredRowCount > 0
      ? 'partial_preview'
      : 'parsed_preview';

  return buildResult({
    sourceFileName,
    sourceFileType: detection.sourceFileType,
    fileSizeBytes: options.fileSizeBytes,
    detection,
    status,
    peaks,
    parsedRowCount: peaks.length,
    ignoredRowCount,
    warnings,
    errors,
    capabilityNotes: [
      'Parsed text peak lists may be used for backend matching only when a saved draft is explicitly enabled.',
    ],
  });
}

export function createXrdLocalReferenceImportErrorResult(
  sourceFileName: string,
  errors: string[],
  options: ParseOptions = {},
): XRDLocalReferenceParseResult {
  const extension = getExtension(sourceFileName);
  const detection: FileDetection = {
    extension,
    ...(isTextSourceFileType(extension) ? { sourceFileType: extension } : {}),
    fileKind: 'unknown_text',
    detectedFormat: extension,
    textBinaryLikelihood: 'unknown',
  };

  return buildResult({
    sourceFileName,
    sourceFileType: detection.sourceFileType,
    fileSizeBytes: options.fileSizeBytes,
    detection,
    status: 'parse_error',
    peaks: [],
    parsedRowCount: 0,
    ignoredRowCount: 0,
    warnings: [],
    errors,
    capabilityNotes: ['No backend matching payload will be built from this import.'],
  });
}
