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

/** Extract a user-displayable message from any caught value or API payload. */
export function messageFromError(value: unknown, fallback = 'Something went wrong.'): string {
  if (isErrorResponse(value)) return value.error.message;
  if (isAppError(value)) return value.safeMessage;
  return fallback;
}
