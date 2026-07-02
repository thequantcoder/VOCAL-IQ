import { AppError, normalizeError, toErrorResponse } from '@vocaliq/shared';
import type { NextFunction, Request, Response } from 'express';

/**
 * The single error boundary (Express port of the Nest AppExceptionFilter): any thrown
 * error becomes the client-safe `ErrorResponse` envelope. Domain `AppError`s keep their
 * code/status; everything else is normalised to a 500 with no leaked internals. The full
 * error is left for server-side logging / Sentry. Must be registered LAST, after routes.
 */
export function errorMiddleware(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = (req.headers['x-request-id'] as string | undefined) ?? undefined;
  const appError = err instanceof AppError ? err : normalizeError(err);
  res.status(appError.status).json(toErrorResponse(appError, requestId));
}

/** 404 handler for unmatched routes (registered just before the error middleware). */
export function notFoundMiddleware(_req: Request, res: Response): void {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Resource not found.' } });
}
