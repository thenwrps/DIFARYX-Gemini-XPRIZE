import { createHash, createHmac } from 'node:crypto';
import type { ServerConfig } from '../config';
import { HttpError } from '../middleware/errorHandler';

const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;

export interface PersistentIdentity {
  subject: string;
}

export class Phase2fPersistenceClient {
  constructor(private readonly config: ServerConfig) {}

  get configured(): boolean {
    return Boolean(
      this.config.persistenceApiBaseUrl
      && this.config.internalServiceSecret,
    );
  }

  async request(
    identity: PersistentIdentity,
    organizationId: string | undefined,
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    body?: unknown | Buffer,
  ): Promise<unknown> {
    const baseUrl = this.config.persistenceApiBaseUrl;
    const secret = this.config.internalServiceSecret;
    if (!baseUrl || !secret) {
      throw new HttpError(
        503,
        'Persistent XRD service unavailable',
        'PERSISTENCE_SERVICE_UNAVAILABLE',
      );
    }
    const url = new URL(path, `${baseUrl}/`);
    const configured = new URL(baseUrl);
    if (url.origin !== configured.origin || !url.pathname.startsWith('/internal/phase2f/')) {
      throw new HttpError(500, 'Persistent XRD request rejected');
    }
    const bodyBuffer = body === undefined
      ? Buffer.alloc(0)
      : Buffer.isBuffer(body)
        ? body
        : Buffer.from(JSON.stringify(body), 'utf8');
    const timestamp = String(Math.floor(Date.now() / 1000));
    const target = `${url.pathname}${url.search}`;
    const digest = createHash('sha256').update(bodyBuffer).digest('hex');
    const signature = createHmac('sha256', secret)
      .update([
        timestamp,
        method,
        target,
        identity.subject,
        digest,
      ].join('\n'))
      .digest('hex');
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.persistenceRequestTimeoutMs,
    );
    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': Buffer.isBuffer(body)
            ? 'application/octet-stream'
            : 'application/json',
          'X-DIFARYX-Service-Timestamp': timestamp,
          'X-DIFARYX-Service-Subject': identity.subject,
          'X-DIFARYX-Service-Signature': signature,
          ...(organizationId ? { 'Active-Organization': organizationId } : {}),
        },
        body: method === 'GET' ? undefined : bodyBuffer,
        signal: controller.signal,
      });
      const contentLength = Number(response.headers.get('content-length'));
      if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
        throw new HttpError(502, 'Persistence service returned an oversized response');
      }
      const text = await response.text();
      if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) {
        throw new HttpError(502, 'Persistence service returned an oversized response');
      }
      let parsed: unknown = null;
      if (text) {
        try {
          parsed = JSON.parse(text);
        } catch {
          throw new HttpError(502, 'Persistence service returned an invalid response');
        }
      }
      if (!response.ok) {
        const detail = readRecord(readRecord(parsed)?.detail);
        const code = readString(detail?.errorCode)
          ?? readString(readRecord(parsed)?.errorCode)
          ?? mapStatusCode(response.status);
        const message = readString(detail?.message)
          ?? readString(readRecord(parsed)?.message)
          ?? publicMessageForStatus(response.status);
        throw new HttpError(
          response.status >= 400 && response.status < 600 ? response.status : 502,
          message,
          code,
        );
      }
      assertJsonValue(parsed, 0);
      return parsed;
    } catch (error) {
      if (error instanceof HttpError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new HttpError(
          503,
          'Persistent XRD service unavailable',
          'PERSISTENCE_SERVICE_UNAVAILABLE',
        );
      }
      throw new HttpError(
        503,
        'Persistent XRD service unavailable',
        'PERSISTENCE_SERVICE_UNAVAILABLE',
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

export function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function readBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

export function readArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

export function requireRecord(value: unknown, message = 'Invalid persistence response'): Record<string, unknown> {
  const record = readRecord(value);
  if (!record) throw new HttpError(502, message);
  return record;
}

export function requireString(value: unknown, message = 'Invalid persistence response'): string {
  const string = readString(value);
  if (!string) throw new HttpError(502, message);
  return string;
}

function assertJsonValue(value: unknown, depth: number): void {
  if (depth > 32) throw new HttpError(502, 'Persistence response is too deeply nested');
  if (
    value === null
    || typeof value === 'boolean'
    || typeof value === 'string'
  ) return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new HttpError(502, 'Persistence response is invalid');
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > 100_000) throw new HttpError(502, 'Persistence response is oversized');
    value.forEach((item) => assertJsonValue(item, depth + 1));
    return;
  }
  if (typeof value === 'object') {
    Object.values(value).forEach((item) => assertJsonValue(item, depth + 1));
    return;
  }
  throw new HttpError(502, 'Persistence response is invalid');
}

function publicMessageForStatus(status: number): string {
  if (status === 400 || status === 422) return 'Persistent request is invalid';
  if (status === 401) return 'Authentication required';
  if (status === 403) return 'Access denied';
  if (status === 404) return 'Persistent record not found';
  if (status === 409) return 'Persistent record state conflict';
  return 'Persistent XRD service unavailable';
}

function mapStatusCode(status: number): string {
  if (status === 401) return 'AUTHENTICATION_REQUIRED';
  if (status === 403) return 'ACCESS_DENIED';
  if (status === 404) return 'NOT_FOUND';
  if (status === 409) return 'STATE_CONFLICT';
  if (status === 422 || status === 400) return 'INVALID_REQUEST';
  return 'PERSISTENCE_SERVICE_UNAVAILABLE';
}
