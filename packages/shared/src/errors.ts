/**
 * Typed error model (CODE-PATTERNS §13, CODING-RULES §7).
 * Every error carries a stable `code`, an HTTP `status`, and a `safeMessage`
 * that is the ONLY text shown to users — internal detail/cause never leaks.
 */
export type ErrorCode =
  | 'VALIDATION'
  | 'AUTH'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'TENANT'
  | 'PROVIDER'
  | 'RATE_LIMIT'
  | 'CONFLICT'
  | 'INTERNAL';

export interface AppErrorOptions {
  cause?: unknown;
  /** Non-sensitive context for structured logging (never includes secrets/PII). */
  meta?: Record<string, unknown>;
}

/** Base for all domain errors. `safeMessage` is user-facing; `message` is internal. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly safeMessage: string;
  readonly meta?: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    status: number,
    message: string,
    safeMessage: string,
    options?: AppErrorOptions,
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = new.target.name;
    this.code = code;
    this.status = status;
    this.safeMessage = safeMessage;
    if (options?.meta !== undefined) this.meta = options.meta;
  }
}

export class ValidationError extends AppError {
  constructor(safeMessage: string, options?: AppErrorOptions) {
    super('VALIDATION', 400, safeMessage, safeMessage, options);
  }
}

export class AuthError extends AppError {
  constructor(message = 'Unauthorized', options?: AppErrorOptions) {
    super('AUTH', 401, message, 'Authentication required.', options);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', options?: AppErrorOptions) {
    super('FORBIDDEN', 403, message, 'You do not have access to this resource.', options);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found', options?: AppErrorOptions) {
    super('NOT_FOUND', 404, message, 'Resource not found.', options);
  }
}

/** Tenant resolution / isolation failure — the golden-rule guardrail. */
export class TenantError extends AppError {
  constructor(message = 'No active tenant', options?: AppErrorOptions) {
    super('TENANT', 403, message, 'No active tenant context.', options);
  }
}

/** A provider (LLM/TTS/STT/telephony) failed; detail is logged, not exposed. */
export class ProviderError extends AppError {
  constructor(message: string, options?: AppErrorOptions) {
    super('PROVIDER', 502, message, 'A service is temporarily unavailable.', options);
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}
