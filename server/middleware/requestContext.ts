import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

export type StructuredLogger = (entry: Record<string, unknown>) => void;

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export function requestContext(logger: StructuredLogger): RequestHandler {
  return (request, response, next) => {
    const suppliedRequestId = request.header('X-Request-Id');
    const requestId = suppliedRequestId && REQUEST_ID_PATTERN.test(suppliedRequestId)
      ? suppliedRequestId
      : randomUUID();
    const startedAt = process.hrtime.bigint();

    response.locals.requestId = requestId;
    response.setHeader('X-Request-Id', requestId);
    response.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      logger({
        event: 'http_request',
        requestId,
        route: request.route?.path ?? request.path,
        status: response.statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
        provider: response.locals.selectedProvider ?? null,
        model: response.locals.selectedModel ?? null,
        fallbackUsed: response.locals.fallbackUsed ?? false,
        authOutcome: response.locals.authOutcome ?? 'not_required',
      });
    });
    next();
  };
}

export const jsonStructuredLogger: StructuredLogger = (entry) => {
  console.log(JSON.stringify(entry));
};
