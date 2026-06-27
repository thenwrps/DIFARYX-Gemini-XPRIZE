/**
 * Unit tests for signalParser.ts
 *
 * Run with:  npm run test
 *   (uses `tsx` to execute this file directly — no external test framework)
 *
 * Coverage (22 tests):
 *  - Delimiter types: tab, comma, semicolon, whitespace
 *  - Header present/absent
 *  - Comment lines (#, %)
 *  - BOM and CRLF handling
 *  - Scientific notation
 *  - Malformed inputs: empty file, blank-only, single-column, single-row,
 *    non-numeric rows, unsupported extension
 *  - Duplicate / non-monotonic x-values
 *  - Blank lines interspersed
 */
import assert from 'node:assert/strict';
import { parseSignalText } from '../signalParser.js';

// ---------------------------------------------------------------------------
// Test harness (matches techniqueDatasetAdapters.test.ts style)
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err instanceof Error ? err.message : String(err)}`);
    failed++;
  }
}

// ===========================================================================
// Delimiter types
// ===========================================================================
console.log('\nparseSignalText — delimiters');

test('parses tab-delimited data', () => {
  const result = parseSignalText('data.xy', '10\t100\n20\t200\n');
  assert.ok(result.ok);
  if (result.ok) {
    assert.equal(result.points.length, 2);
    assert.deepEqual(result.points[0], { x: 10, y: 100 });
  }
});

test('parses comma-delimited CSV', () => {
  const result = parseSignalText('data.csv', '10,100\n20,200\n');
  assert.ok(result.ok);
  if (result.ok) {
    assert.equal(result.points.length, 2);
    assert.deepEqual(result.points[1], { x: 20, y: 200 });
  }
});

test('parses semicolon-delimited data', () => {
  const result = parseSignalText('data.dat', '10;100\n20;200\n');
  assert.ok(result.ok);
  if (result.ok) {
    assert.equal(result.points.length, 2);
  }
});

test('parses whitespace-delimited data', () => {
  const result = parseSignalText('data.txt', '10 100\n20 200\n');
  assert.ok(result.ok);
  if (result.ok) {
    assert.equal(result.points.length, 2);
    assert.deepEqual(result.points[0], { x: 10, y: 100 });
  }
});

// ===========================================================================
// Header present/absent
// ===========================================================================
console.log('\nparseSignalText — headers');

test('skips header row and parses data', () => {
  const csv = 'X,Y\n10,100\n20,200\n';
  const result = parseSignalText('data.csv', csv);
  assert.ok(result.ok);
  if (result.ok) {
    assert.equal(result.points.length, 2);
    assert.deepEqual(result.points[0], { x: 10, y: 100 });
  }
});

test('parses data without headers', () => {
  const csv = '10,100\n20,200\n30,300\n';
  const result = parseSignalText('data.csv', csv);
  assert.ok(result.ok);
  if (result.ok) {
    assert.equal(result.points.length, 3);
  }
});

// ===========================================================================
// Comment lines
// ===========================================================================
console.log('\nparseSignalText — comments');

test('skips comment lines starting with #', () => {
  const data = '# This is a comment\n10,100\n# Another comment\n20,200\n';
  const result = parseSignalText('data.csv', data);
  assert.ok(result.ok);
  if (result.ok) {
    assert.equal(result.points.length, 2);
  }
});

test('skips comment lines starting with %', () => {
  const data = '% Comment\n10,100\n20,200\n';
  const result = parseSignalText('data.csv', data);
  assert.ok(result.ok);
  if (result.ok) {
    assert.equal(result.points.length, 2);
  }
});

// ===========================================================================
// BOM and CRLF
// ===========================================================================
console.log('\nparseSignalText — encoding');

test('handles BOM', () => {
  const data = '\uFEFF10,100\n20,200\n';
  const result = parseSignalText('data.csv', data);
  assert.ok(result.ok);
  if (result.ok) {
    assert.equal(result.points.length, 2);
    assert.deepEqual(result.points[0], { x: 10, y: 100 });
  }
});

test('handles CRLF line endings', () => {
  const data = '10,100\r\n20,200\r\n';
  const result = parseSignalText('data.csv', data);
  assert.ok(result.ok);
  if (result.ok) {
    assert.equal(result.points.length, 2);
  }
});

test('handles BOM + CRLF together', () => {
  const data = '\uFEFF10,100\r\n20,200\r\n';
  const result = parseSignalText('data.csv', data);
  assert.ok(result.ok);
  if (result.ok) {
    assert.equal(result.points.length, 2);
  }
});

// ===========================================================================
// Scientific notation
// ===========================================================================
console.log('\nparseSignalText — scientific notation');

test('parses scientific notation values', () => {
  const data = '1.23e3,4.56e2\n2.0e1,3.0E1\n';
  const result = parseSignalText('data.csv', data);
  assert.ok(result.ok);
  if (result.ok) {
    assert.deepEqual(result.points[0], { x: 1230, y: 456 });
    assert.deepEqual(result.points[1], { x: 20, y: 30 });
  }
});

// ===========================================================================
// Malformed inputs
// ===========================================================================
console.log('\nparseSignalText — malformed inputs');

test('rejects empty file', () => {
  const result = parseSignalText('data.csv', '');
  assert.ok(!result.ok);
  if (!result.ok) {
    assert.ok(result.error.includes('Empty file'));
  }
});

test('rejects file with only blank lines', () => {
  const result = parseSignalText('data.csv', '\n\n\n');
  assert.ok(!result.ok);
  if (!result.ok) {
    assert.ok(result.error.includes('Empty file'));
  }
});

test('rejects single-column data with specific error', () => {
  const data = '10\n20\n30\n';
  const result = parseSignalText('data.csv', data);
  assert.ok(!result.ok);
  if (!result.ok) {
    assert.ok(result.error.includes('expected 2 numeric columns, got 1'));
  }
});

test('rejects single-column after header with specific error', () => {
  const data = 'Value\n10\n20\n';
  const result = parseSignalText('data.txt', data);
  assert.ok(!result.ok);
  if (!result.ok) {
    assert.ok(result.error.includes('expected 2 numeric columns, got 1'));
  }
});

test('rejects single data row', () => {
  const data = '10,100\n';
  const result = parseSignalText('data.csv', data);
  assert.ok(!result.ok);
  if (!result.ok) {
    assert.ok(result.error.includes('Insufficient data'));
  }
});

test('reports non-numeric row in middle of data', () => {
  const data = '10,100\nhello world\n20,200\n';
  const result = parseSignalText('data.csv', data);
  assert.ok(result.ok);
  if (result.ok) {
    assert.ok(result.warnings.length > 0);
    assert.ok(result.warnings[0].includes('skipped'));
  }
});

test('rejects unsupported file extension', () => {
  const result = parseSignalText('data.xyz', '10,100\n');
  assert.ok(!result.ok);
  if (!result.ok) {
    assert.ok(result.error.includes('Unsupported file format'));
  }
});

// ===========================================================================
// Duplicate / non-monotonic x
// ===========================================================================
console.log('\nparseSignalText — x-value ordering');

test('warns about duplicate x-values', () => {
  const data = '10,100\n10,200\n20,300\n';
  const result = parseSignalText('data.csv', data);
  assert.ok(result.ok);
  if (result.ok) {
    const dupWarning = result.warnings.find(w => w.includes('duplicate'));
    assert.ok(dupWarning !== undefined);
  }
});

test('warns about non-monotonic x-values', () => {
  const data = '20,200\n10,100\n';
  const result = parseSignalText('data.csv', data);
  assert.ok(result.ok);
  if (result.ok) {
    const monoWarning = result.warnings.find(w => w.includes('ascending'));
    assert.ok(monoWarning !== undefined);
  }
});

// ===========================================================================
// Blank lines interspersed
// ===========================================================================
console.log('\nparseSignalText — blank lines');

test('handles blank lines between data rows', () => {
  const data = '10,100\n\n\n20,200\n\n';
  const result = parseSignalText('data.csv', data);
  assert.ok(result.ok);
  if (result.ok) {
    assert.equal(result.points.length, 2);
  }
});

// ===========================================================================
// Summary
// ===========================================================================
console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) {
  process.exit(1);
}