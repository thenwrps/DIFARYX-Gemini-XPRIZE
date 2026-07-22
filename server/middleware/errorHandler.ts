import type { ErrorRequestHandler } from 'express';

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  const status = error instanceof HttpError
    ? error.status
    : typeof error?.status === 'number' && error.status >= 400 && error.status < 500
      ? error.status
      : 500;
  const publicMessage = error instanceof HttpError && status < 500
    ? error.message
    : status === 400
      ? 'Malformed request body'
      : 'Internal server error';

  response.status(status).json({
    success: false,
    error: publicMessage,
    requestId: response.locals.requestId,
  });
};
