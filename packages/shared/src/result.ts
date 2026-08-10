import { type AppError, normalizeError } from './errors.js';

/**
 * Result — a discriminated union for fallible operations where an explicit value
 * reads clearer than a throw (CODING-RULES §1). Throwing typed AppErrors is still
 * fine for edge/boundary code; use Result for pure logic that callers branch on.
 */
export type Result<T, E = AppError> = { ok: true; value: T } | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

export function isOk<T, E>(r: Result<T, E>): r is { ok: true; value: T } {
  return r.ok;
}

export function isErr<T, E>(r: Result<T, E>): r is { ok: false; error: E } {
  return !r.ok;
}

/** Transform the success value, leaving errors untouched. */
export function mapResult<T, U, E>(r: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return r.ok ? ok(fn(r.value)) : r;
}

/** Extract the value or throw the error (AppErrors thrown as-is; others normalised). */
export function unwrap<T, E>(r: Result<T, E>): T {
  if (r.ok) return r.value;
  throw r.error instanceof Error ? r.error : normalizeError(r.error);
}

/** Run a throwing function and capture the outcome as a Result<T, AppError>. */
export function tryCatch<T>(fn: () => T): Result<T, AppError> {
  try {
    return ok(fn());
  } catch (e) {
    return err(normalizeError(e));
  }
}

/** Async variant of tryCatch. */
export async function tryCatchAsync<T>(fn: () => Promise<T>): Promise<Result<T, AppError>> {
  try {
    return ok(await fn());
  } catch (e) {
    return err(normalizeError(e));
  }
}
