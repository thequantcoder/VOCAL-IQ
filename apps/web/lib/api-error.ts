import { type ErrorResponse, isAppError } from '@vocaliq/shared';

/**
 * Client-side reading of the API's safe error envelope (shared `ErrorResponse`).
 * The web app only ever sees the safe message + code — internals stay server-side.
 * This is the typed counterpart to the API's exception filter.
 */
export function isErrorResponse(value: unknown): value is ErrorResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as ErrorResponse).error?.code === 'string'
  );
}

/**
 * Extract a user-displayable message from any caught value or API payload.
 *
 * Handles the app-wide pattern where the API helpers re-throw as
 * `throw new Error(messageFromError(data))` — so a caught `Error`'s `.message`
 * is already the safe, extracted API message. Without the `Error` case such a
 * caught value would fall through to the generic fallback, losing the specific
 * message (e.g. showing "Something went wrong." instead of "Resource not found.").
 */
export function messageFromError(value: unknown, fallback = 'Something went wrong.'): string {
  if (isErrorResponse(value)) return value.error.message;
  if (isAppError(value)) return value.safeMessage;
  if (value instanceof Error && value.message) return value.message;
  return fallback;
}
