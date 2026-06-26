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
  | 'BILLING'
  | 'RATE_LIMIT'
  | 'CONFLICT'
  | 'INTERNAL';

/** The ONLY shape sent to clients — code + status + safe text, never internals. */
export interface ErrorResponse {
  error: {
    code: ErrorCode;
    message: string;
    /** Correlation id for support — ties a user-facing error to server logs/Sentry. */
    requestId?: string;
  };
}

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

/** Billing/quota problem (e.g. insufficient wallet, past-due) — 402 Payment Required. */
export class BillingError extends AppError {
  constructor(safeMessage = 'Billing action required to continue.', options?: AppErrorOptions) {
    super('BILLING', 402, safeMessage, safeMessage, options);
  }
}

/** Too many requests — per-tenant rate/abuse limits (CODING-RULES §6). */
export class RateLimitError extends AppError {
  constructor(message = 'Rate limit exceeded', options?: AppErrorOptions) {
    super('RATE_LIMIT', 429, message, 'Too many requests. Please slow down.', options);
  }
}

/** State conflict (duplicate, version mismatch, already-exists). */
export class ConflictError extends AppError {
  constructor(safeMessage = 'This conflicts with the current state.', options?: AppErrorOptions) {
    super('CONFLICT', 409, safeMessage, safeMessage, options);
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

/**
 * Coerce any thrown value into an AppError. Unknown errors become a generic
 * INTERNAL 500 whose safe message reveals nothing — the original is preserved as
 * `cause` for server-side logging only.
 */
export function normalizeError(value: unknown): AppError {
  if (isAppError(value)) return value;
  const message = value instanceof Error ? value.message : String(value);
  return new AppError('INTERNAL', 500, message, 'Something went wrong.', { cause: value });
}

/**
 * Build the client-safe response envelope. Emits ONLY code + safeMessage (+ optional
 * requestId) — never the internal `message`, `cause`, `meta`, or stack. This is the
 * boundary that guarantees errors never leak internals (CODING-RULES §7).
 */
export function toErrorResponse(value: unknown, requestId?: string): ErrorResponse {
  const err = normalizeError(value);
  return {
    error: {
      code: err.code,
      message: err.safeMessage,
      ...(requestId !== undefined ? { requestId } : {}),
    },
  };
}
