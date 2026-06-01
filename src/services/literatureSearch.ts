/**
 * Literature Search Service
 *
 * Reusable, React-free retrieval layer consumed by useX7UniversalHook,
 * AgentDemo, ReportBuilder, and future notebook / autonomous workflows.
 *
 * Dependency direction (Requirement C):
 *     consumer (AgentDemo / hook / ...)  ->  literatureSearch.ts  ->  researchEvidence.ts
 * This module MUST NOT import AgentDemo or any UI/React types.
 *
 * Responsibilities:
 *  - searchScholar()         BrightData SERP path
 *  - searchLocalLiterature() local reference DB path
 *  - searchLiterature()      fallback orchestration + source attribution
 *  - buildLiteratureQuery()  hierarchical, phase-independent query construction
 */

import type { ScholarReference } from '../hooks/useX7UniversalHook';
import type { LiteratureSource, ResearchEvidenceItem } from '../types/researchEvidence';
import { scholarRefToEvidenceItem } from '../types/researchEvidence';

// ---------------------------------------------------------------------------
// Local reference database (offline fallback)
// ---------------------------------------------------------------------------

const LOCAL_SCHOLAR_REFERENCES: ScholarReference[] = [
  {
    id: 'ref_scholar_01',
    title: 'Crystalline phase structure and magnetic coupling in CuFe2O4 Spinel',
    authors: ['H. Chen', 'T. Osgood'],
    year: 2022,
    journal: 'Physical Review Materials',
    doi: '10.1103/PhysRevMaterials.6.024408',
    conditions: { wavelength: 1.5406, material: 'CuFe2O4', temperature: 298 },
  },
  {
    id: 'ref_scholar_02',
    title: 'Thermal expansion and phase transformations of copper ferrite spinels',
    authors: ['K. Lindqvist', 'S. Johansson'],
    year: 2020,
    journal: 'Journal of Applied Crystallography',
    doi: '10.1107/S160076892000412X',
    conditions: { wavelength: 1.5406, material: 'CuFe2O4', temperature: 473 },
  },
  {
    id: 'ref_scholar_03',
    title: 'Synchrotron powder diffraction of standard ferrites at room temperature',
    authors: ['F. Rossi', 'G. Bianchi'],
    year: 2024,
    journal: 'Nature Materials Science',
    doi: '10.1038/s41563-024-08819-y',
    conditions: { wavelength: 0.9754, material: 'CuFe2O4', temperature: 298 },
  },
];

// ---------------------------------------------------------------------------
// Hierarchical query construction (Requirement #2)
// Priority: material system -> technique -> research objective, with a
// confident detected phase as OPTIONAL leading enrichment. Never depends on a
// detected phase, so it works before phase identification has occurred.
// ---------------------------------------------------------------------------

export interface LiteratureQueryInputs {
  materialSystem?: string;
  technique?: string;
  researchObjective?: string;
  /** Optional enrichment only; prepended when a confident phase is available. */
  detectedPhase?: string;
}

export function buildLiteratureQuery(inputs: LiteratureQueryInputs): string {
  const parts = [
    inputs.detectedPhase,
    inputs.materialSystem,
    inputs.technique,
    inputs.researchObjective,
  ];
  return parts
    .map((p) => (p || '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// Local reference search
// ---------------------------------------------------------------------------

export function searchLocalLiterature(query: string): ScholarReference[] {
  const keywords = (query || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (keywords.length === 0) return [...LOCAL_SCHOLAR_REFERENCES];
  return LOCAL_SCHOLAR_REFERENCES.filter((ref) => {
    const matchText = `${ref.title} ${ref.journal} ${ref.conditions.material}`.toLowerCase();
    return keywords.some((kw) => matchText.includes(kw));
  });
}

// ---------------------------------------------------------------------------
// BrightData SERP search
// ---------------------------------------------------------------------------

/** Error thrown when BrightData returns an auth/quota/rate-limit status. */
export class BrightDataAccessError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(
      `Bright Data SERP API returned HTTP ${status} (Quota Exceeded / Unauthorized / Rate Limited). ` +
        `Scholar searches locked. Falling back to local reference database.`,
    );
    this.name = 'BrightDataAccessError';
    this.status = status;
  }
}

export interface BrightDataSearchOptions {
  apiKey: string;
  /**
   * Invoked once immediately before a billable BrightData request is issued.
   * The hook injects Stripe quota reporting here; it may throw to block the
   * request (e.g. quota guardrail), in which case orchestration falls back.
   */
  onBeforeRequest?: () => void;
}

/**
 * Google Scholar search via Bright Data SERP API. Returns mapped
 * `ScholarReference[]`. Throws on auth/quota errors (BrightDataAccessError) or
 * network failures so the orchestrator can decide to fall back.
 */
export async function searchScholar(
  query: string,
  opts: BrightDataSearchOptions,
): Promise<ScholarReference[]> {
  opts.onBeforeRequest?.();

  const response = await fetch('https://api.brightdata.com/request', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      zone: 'serp_api2',
      url: `https://scholar.google.com/scholar?q=${encodeURIComponent(query)}`,
      format: 'raw',
    }),
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403 || response.status === 429) {
      throw new BrightDataAccessError(response.status);
    }
    throw new Error(`Bright Data SERP API error: HTTP ${response.status}`);
  }

  const data = await response.json();
  const results = (data && (data.organic || data.organic_results)) || [];

  if (results.length === 0) {
    // Empty result set: treat as "nothing found", let orchestrator fall back.
    return [];
  }

  return results.map((item: any, idx: number) => ({
    id: `ref_brightdata_${idx}`,
    title: item.title || 'Scholar Reference',
    authors: item.author_info?.split(' - ') || ['Unknown Authors'],
    year: parseInt(item.publication_info?.match(/\d{4}/)?.[0] || '2024', 10),
    journal: item.publication_info || 'Google Scholar Index',
    doi: item.resources?.[0]?.url,
    conditions: {
      wavelength: 1.5406,
      material: query.toLowerCase().includes('spinel') ? 'CuFe2O4' : 'Unknown',
      temperature: 298,
    },
  }));
}

// ---------------------------------------------------------------------------
// Fallback orchestration + source attribution (Requirement #1)
// ---------------------------------------------------------------------------

export interface LiteratureSearchOptions {
  /** BrightData API key. When absent, the local DB is used directly. */
  apiKey?: string;
  /** Injected billable-request hook (Stripe quota reporting). May throw. */
  onBeforeBrightDataRequest?: () => void;
}

export interface LiteratureSearchResult {
  /** Structured citation items for the Research Evidence Card. */
  items: ResearchEvidenceItem[];
  /** Raw references (preserves the hook's legacy ScholarReference[] contract). */
  refs: ScholarReference[];
  source: LiteratureSource;
  fallbackUsed: boolean;
  count: number;
  query: string;
  /** Populated when a BrightData attempt failed and we degraded to local. */
  error?: string;
}

function toResult(
  refs: ScholarReference[],
  source: LiteratureSource,
  query: string,
  fallbackUsed: boolean,
  error?: string,
): LiteratureSearchResult {
  return {
    items: refs.map((r) => scholarRefToEvidenceItem(r, source)),
    refs,
    source,
    fallbackUsed,
    count: refs.length,
    query,
    error,
  };
}

/**
 * Orchestrates literature retrieval with graceful degradation:
 * try BrightData (when a key is present) -> fall back to local references on
 * missing key, auth/quota error, network failure, or empty results.
 *
 * Never throws for retrieval failures: the demo always gets references.
 */
export async function searchLiterature(
  query: string,
  opts: LiteratureSearchOptions = {},
): Promise<LiteratureSearchResult> {
  const apiKey = opts.apiKey ?? (import.meta as any)?.env?.VITE_BRIGHTDATA_API_KEY;

  if (!apiKey) {
    return toResult(searchLocalLiterature(query), 'local', query, false);
  }

  try {
    const refs = await searchScholar(query, {
      apiKey,
      onBeforeRequest: opts.onBeforeBrightDataRequest,
    });
    if (refs.length === 0) {
      // Empty BrightData result -> local, but this is not an error condition.
      return toResult(searchLocalLiterature(query), 'local', query, true);
    }
    return toResult(refs, 'brightdata', query, false);
  } catch (err: any) {
    const rawMessage = err?.message || String(err);
    const message =
      err instanceof BrightDataAccessError || /SaaS|Subscription|Quota/i.test(rawMessage)
        ? rawMessage
        : `Bright Data Connectivity Warning: ${rawMessage}`;
    return toResult(searchLocalLiterature(query), 'local', query, true, message);
  }
}
