import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException } from '@nestjs/common';
import {
  AppError,
  type ErrorCode,
  type ErrorResponse,
  normalizeError,
  toErrorResponse,
} from '@vocaliq/shared';
import type { Request, Response } from 'express';

/** Map an HTTP status to a stable ErrorResponse code (for framework HttpExceptions). */
function codeForStatus(status: number): ErrorCode {
  switch (status) {
    case 400:
      return 'VALIDATION';
    case 401:
      return 'AUTH';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 402:
      return 'BILLING';
    case 409:
      return 'CONFLICT';
    case 429:
      return 'RATE_LIMIT';
    default:
      return 'INTERNAL';
  }
}

/** Status → safe, generic user-facing message (never derived from internal detail). */
function safeMessageForStatus(status: number): string {
  switch (status) {
    case 400:
      return 'The request was invalid.';
    case 401:
      return 'Authentication required.';
    case 403:
      return 'You do not have access to this resource.';
    case 404:
      return 'Resource not found.';
    case 402:
      return 'Billing action required to continue.';
    case 409:
      return 'This conflicts with the current state.';
    case 429:
      return 'Too many requests. Please slow down.';
    default:
      return 'Something went wrong.';
  }
}

/**
 * Global exception filter — the single boundary where any thrown error becomes the
 * client-safe `ErrorResponse` envelope (CODING-RULES §7). Domain `AppError`s keep
 * their code/status; framework `HttpException`s keep their status but get a generic
 * safe message (so validation/internal detail never leaks); everything else is a
 * 500 with no detail. The full error is left for server-side logging/Sentry.
 */
@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const requestId = (req.headers['x-request-id'] as string | undefined) ?? undefined;

    let status: number;
    let body: ErrorResponse;

    if (exception instanceof AppError) {
      status = exception.status;
      body = toErrorResponse(exception, requestId);
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      body = {
        error: {
          code: codeForStatus(status),
          message: safeMessageForStatus(status),
          ...(requestId !== undefined ? { requestId } : {}),
        },
      };
    } else {
      const appError = normalizeError(exception);
      status = appError.status;
      body = toErrorResponse(appError, requestId);
    }

    res.status(status).json(body);
  }
}
