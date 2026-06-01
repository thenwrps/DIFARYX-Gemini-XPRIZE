/**
 * Literature Search Service Tests
 *
 * Verify:
 *  - hierarchical query construction (material -> technique -> objective,
 *    with optional confident-phase enrichment) and phase-independence
 *  - fallback orchestration source/fallback flags + source attribution
 *  - graceful degradation when BrightData is unavailable
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  buildLiteratureQuery,
  searchLocalLiterature,
  searchLiterature,
} from '../literatureSearch';

describe('buildLiteratureQuery', () => {
  it('builds a baseline query without a detected phase', () => {
    const q = buildLiteratureQuery({
      materialSystem: 'spinel ferrite',
      technique: 'XRD',
      researchObjective: 'phase identification',
    });
    expect(q).toBe('spinel ferrite XRD phase identification');
  });

  it('prepends a confident detected phase as enrichment', () => {
    const q = buildLiteratureQuery({
      materialSystem: 'spinel ferrite',
      technique: 'XRD',
      researchObjective: 'phase identification',
      detectedPhase: 'CoFe2O4',
    });
    expect(q).toBe('CoFe2O4 spinel ferrite XRD phase identification');
  });

  it('remains functional before phase identification (no phase term)', () => {
    const q = buildLiteratureQuery({ materialSystem: 'spinel ferrite', technique: 'XRD' });
    expect(q).toBe('spinel ferrite XRD');
    expect(q).not.toContain('undefined');
  });

  it('collapses whitespace and ignores empty inputs', () => {
    const q = buildLiteratureQuery({
      materialSystem: '  spinel  ',
      technique: '',
      researchObjective: 'phase id',
    });
    expect(q).toBe('spinel phase id');
  });
});

describe('searchLocalLiterature', () => {
  it('returns matching local references by keyword', () => {
    const refs = searchLocalLiterature('spinel');
    expect(refs.length).toBeGreaterThan(0);
    expect(refs.every((r) => typeof r.title === 'string')).toBe(true);
  });

  it('returns all references for an empty query', () => {
    const refs = searchLocalLiterature('');
    expect(refs.length).toBeGreaterThan(0);
  });
});

describe('searchLiterature orchestration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses local source (no fallback flag) when no API key is configured', async () => {
    const result = await searchLiterature('spinel ferrite XRD phase identification', {
      apiKey: '',
    });
    expect(result.source).toBe('local');
    expect(result.fallbackUsed).toBe(false);
    expect(result.count).toBe(result.items.length);
    expect(result.items.every((i) => i.source === 'local')).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('falls back to local with fallbackUsed=true when BrightData fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    const result = await searchLiterature('spinel ferrite XRD', { apiKey: 'test-key' });
    expect(result.source).toBe('local');
    expect(result.fallbackUsed).toBe(true);
    expect(result.error).toBeTruthy();
    expect(result.items.every((i) => i.source === 'local')).toBe(true);
  });

  it('falls back to local on a BrightData quota/auth status (429)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 429 }) as any),
    );
    const result = await searchLiterature('spinel ferrite XRD', { apiKey: 'test-key' });
    expect(result.source).toBe('local');
    expect(result.fallbackUsed).toBe(true);
  });

  it('maps BrightData organic results to brightdata-attributed items', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          organic: [
            {
              title: 'A spinel ferrite study',
              author_info: 'A. Author - B. Author',
              publication_info: 'J. Mater. 2023',
            },
          ],
        }),
      }) as any),
    );
    const result = await searchLiterature('spinel ferrite XRD', { apiKey: 'test-key' });
    expect(result.source).toBe('brightdata');
    expect(result.fallbackUsed).toBe(false);
    expect(result.items[0].source).toBe('brightdata');
    expect(result.items[0].title).toBe('A spinel ferrite study');
  });

  it('degrades to local when BrightData returns an empty result set', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ organic: [] }),
      }) as any),
    );
    const result = await searchLiterature('spinel ferrite XRD', { apiKey: 'test-key' });
    expect(result.source).toBe('local');
    expect(result.fallbackUsed).toBe(true);
  });
});
