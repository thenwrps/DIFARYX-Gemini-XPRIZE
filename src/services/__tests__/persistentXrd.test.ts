import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getPersistentCanonicalEvidence,
  getPersistentXrdDataset,
  listPersistentHistory,
  listPersistentXrdDatasets,
  PersistentApiError,
} from '../api/persistentXrd';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const PROJECT_ID = '22222222-2222-4222-8222-222222222222';
const DATASET_ID = '33333333-3333-4333-8333-333333333333';

const dataset = {
  id: DATASET_ID,
  organizationId: ORGANIZATION_ID,
  projectId: PROJECT_ID,
  title: 'Persistent XRD',
  technique: 'xrd',
  displayFilename: 'signal.xy',
  declaredContentType: 'text/plain',
  byteSize: 120,
  clientChecksumSha256: 'a'.repeat(64),
  datasetStatus: 'valid',
  evidenceStatus: 'ready',
  failureCode: null,
  originalObjectId: '44444444-4444-4444-8444-444444444444',
  currentEvidenceId: '55555555-5555-4555-8555-555555555555',
  measurementMetadata: {},
  processingParameters: {},
  experimentContext: {},
  createdAt: '2026-07-28T00:00:00.000Z',
  updatedAt: '2026-07-28T00:00:01.000Z',
  latestUpload: null,
  latestValidation: null,
  evidence: null,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('persistent XRD browser client', () => {
  it('uses the same-site session boundary and active organization header', async () => {
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ items: [dataset], hasMore: false }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetchMock);

    const rows = await listPersistentXrdDatasets(ORGANIZATION_ID, PROJECT_ID);

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(DATASET_ID);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain(`/api/persistent/projects/${PROJECT_ID}/datasets`);
    expect(init.credentials).toBe('include');
    expect(init.cache).toBe('no-store');
    expect(init.headers['Active-Organization']).toBe(ORGANIZATION_ID);
  });

  it('loads authoritative dataset state after refresh', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify(dataset),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )));

    const loaded = await getPersistentXrdDataset(ORGANIZATION_ID, DATASET_ID);

    expect(loaded.datasetStatus).toBe('valid');
    expect(loaded.evidenceStatus).toBe('ready');
    expect(loaded.currentEvidenceId).toBe(dataset.currentEvidenceId);
  });

  it('runtime-validates canonical evidence before graph rendering', async () => {
    const evidenceId = '55555555-5555-4555-8555-555555555555';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({
        id: evidenceId,
        organizationId: ORGANIZATION_ID,
        projectId: PROJECT_ID,
        datasetId: DATASET_ID,
        uploadSessionId: '66666666-6666-4666-8666-666666666666',
        validationAttemptId: '77777777-7777-4777-8777-777777777777',
        version: 1,
        status: 'ready',
        schemaVersion: 'phase2f-xrd-evidence-v1',
        processorVersion: 'test',
        contentSha256: 'a'.repeat(64),
        content: {
          processedOutput: {
            x: [10, 11],
            y_raw: [1, 2],
            y_smoothed: [1, 2],
            y_baseline: [0, 0],
          },
        },
        validationWarnings: [],
        scientificLimitations: ['XRD does not establish composition.'],
        provenance: { source: 'server_authorized_object' },
        createdAt: '2026-07-28T00:00:01.000Z',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )));

    const evidence = await getPersistentCanonicalEvidence(ORGANIZATION_ID, evidenceId);

    expect(evidence.id).toBe(evidenceId);
    expect(evidence.content.processedOutput).toBeTypeOf('object');
    expect(evidence.scientificLimitations).toHaveLength(1);
  });

  it('encodes History filters without accepting browser evidence content', async () => {
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ items: [], hasMore: false }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetchMock);

    await listPersistentHistory(
      ORGANIZATION_ID,
      { projectId: PROJECT_ID, datasetId: DATASET_ID },
    );

    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain(`projectId=${PROJECT_ID}`);
    expect(String(url)).toContain(`datasetId=${DATASET_ID}`);
  });

  it('fails closed on malformed server responses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ id: DATASET_ID, technique: 'xrd' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )));

    await expect(
      getPersistentXrdDataset(ORGANIZATION_ID, DATASET_ID),
    ).rejects.toMatchObject<PersistentApiError>({
      status: 502,
      errorCode: 'INVALID_SERVER_RESPONSE',
    });
  });
});
