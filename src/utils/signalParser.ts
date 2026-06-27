/**
 * Robust upload parsing for .csv, .txt, .xy, .dat files.
 *
 * Handles: comma/whitespace/tab/semicolon delimiters, optional header rows,
 * comment lines (# or %), blank lines, trailing whitespace, BOM, CRLF vs LF,
 * scientific notation. Validates empty files, single-column rows, non-numeric
 * values, NaN/Infinity, and duplicate x-values.
 *
 * Returns a typed parse result with points, warnings, and error.
 */

export interface SignalPoint {
  x: number;
  y: number;
}

export interface SignalParseSuccess {
  ok: true;
  points: SignalPoint[];
  warnings: string[];
  rowCount: number;
}

export interface SignalParseFailure {
  ok: false;
  error: string;
  warnings: string[];
}

export type SignalParseResult = SignalParseSuccess | SignalParseFailure;

export const SUPPORTED_SIGNAL_EXTENSIONS = ['csv', 'txt', 'xy', 'dat'] as const;

function stripBOM(text: string): string {
  if (text.charCodeAt(0) === 0xFEFF) {
    return text.slice(1);
  }
  return text;
}

function detectDelimiter(line: string): string {
  if (line.includes('\t')) return '\t';
  if (line.includes(';')) return ';';
  if (line.includes(',')) return ',';
  return ' ';
}

function tokenizeAndParse(line: string, delimiter: string): string[] {
  if (delimiter === ' ') {
    return line.split(/\s+/).map(s => s.trim()).filter(Boolean);
  }
  return line.split(delimiter).map(s => s.trim()).filter(Boolean);
}

function parseNumericToken(token: string): number | null {
  const cleaned = token.trim().replace(/^["']|["']$/g, '');
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

export function parseSignalText(fileName: string, text: string): SignalParseResult {
  const warnings: string[] = [];

  const extMatch = fileName.toLowerCase().match(/\.([a-z0-9]+)$/);
  const ext = extMatch?.[1] ?? '';
  if (!SUPPORTED_SIGNAL_EXTENSIONS.includes(ext as typeof SUPPORTED_SIGNAL_EXTENSIONS[number])) {
    return {
      ok: false,
      error: `Unsupported file format ".${ext}". Supported formats: ${SUPPORTED_SIGNAL_EXTENSIONS.join(', ')}.`,
      warnings,
    };
  }

  let raw = stripBOM(text);
  raw = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const lines = raw.split('\n');

  if (lines.length === 0 || (lines.length === 1 && lines[0].trim() === '')) {
    return {
      ok: false,
      error: 'Empty file: no content found.',
      warnings,
    };
  }

  let delimiter: string = ' ';
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('%')) continue;
    delimiter = detectDelimiter(trimmed);
    break;
  }

  const points: SignalPoint[] = [];
  let dataRowCount = 0;
  let firstNonNumericRow = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (!line) continue;
    if (line.startsWith('#') || line.startsWith('%')) continue;

    const tokens = tokenizeAndParse(line, delimiter);
    if (tokens.length === 0) continue;

    const numericValues = tokens.map(parseNumericToken);
    const numericCount = numericValues.filter(v => v !== null).length;

    if (numericCount === 0) {
      if (dataRowCount === 0 && firstNonNumericRow === -1) {
        firstNonNumericRow = i;
        continue;
      }
      warnings.push(`Row ${i + 1}: skipped (no numeric values).`);
      continue;
    }

    if (numericCount === 1) {
      if (dataRowCount === 0 && firstNonNumericRow === -1) {
        firstNonNumericRow = i;
        continue;
      }
      return {
        ok: false,
        error: `Row ${i + 1}: expected 2 numeric columns, got 1.`,
        warnings,
      };
    }

    const x = numericValues.find(v => v !== null) as number;
    const yValues = numericValues.filter(v => v !== null);
    const y = yValues[1];

    dataRowCount++;

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      warnings.push(`Row ${i + 1}: non-finite value detected, row skipped.`);
      dataRowCount--;
      continue;
    }

    points.push({ x, y });
  }

  if (dataRowCount === 0 && firstNonNumericRow !== -1) {
    const headerLine = lines[firstNonNumericRow].trim();
    const tokens = tokenizeAndParse(headerLine, delimiter);
    const numericValues = tokens.map(parseNumericToken);
    const numericCount = numericValues.filter(v => v !== null).length;

    if (numericCount >= 2) {
      const x = numericValues.find(v => v !== null) as number;
      const yValues = numericValues.filter(v => v !== null);
      const y = yValues[1];
      if (Number.isFinite(x) && Number.isFinite(y)) {
        points.push({ x, y });
        dataRowCount++;
      }
    }
  }

  if (points.length === 0) {
    return {
      ok: false,
      error: 'Empty file: no valid data rows found. Ensure the file contains at least two numeric columns.',
      warnings,
    };
  }

  if (points.length < 2) {
    return {
      ok: false,
      error: `Insufficient data: only ${points.length} valid data row found. At least 2 are required.`,
      warnings,
    };
  }

  const xSeen = new Map<number, number>();
  for (const pt of points) {
    const count = xSeen.get(pt.x) ?? 0;
    xSeen.set(pt.x, count + 1);
  }
  let dupeCount = 0;
  for (const count of xSeen.values()) {
    if (count > 1) dupeCount++;
  }
  if (dupeCount > 0) {
    warnings.push(
      `${dupeCount} duplicate x-value${dupeCount === 1 ? '' : 's'} detected. Non-monotonic or repeated x-values may affect analysis.`,
    );
  }

  let isMonotonic = true;
  for (let i = 1; i < points.length; i++) {
    if (points[i].x < points[i - 1].x) {
      isMonotonic = false;
      break;
    }
  }
  if (!isMonotonic) {
    warnings.push('X-values are not in ascending order. The data may need sorting before analysis.');
  }

  return {
    ok: true,
    points,
    warnings,
    rowCount: dataRowCount,
  };
}