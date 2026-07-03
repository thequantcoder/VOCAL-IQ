import type { CallSyncPayload, IntegrationType } from '@vocaliq/shared';

/**
 * Connector framework (Day 40). A `Connector` is a thin, provider-specific client that turns
 * the normalized `CallSyncPayload` (from `@vocaliq/shared`) into authenticated CRM/helpdesk
 * calls. New providers implement this same interface — the `IntegrationsService` dispatch,
 * routes, and UI don't change. HTTP is injected so connectors are unit-testable offline.
 */

/** A minimal fetch-like function so connectors can be tested with a fake transport. */
export type HttpClient = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

/** Default transport: the platform `fetch` with a short timeout. */
export const fetchHttp: HttpClient = (url, init) =>
  fetch(url, { ...init, signal: AbortSignal.timeout(8000) });

export interface UpsertResult {
  externalId: string;
}

export interface Connector {
  readonly type: IntegrationType;
  /** Verify the stored credential works (used on connect + a manual "test"). */
  testAuth(): Promise<boolean>;
  /** Create or update the contact in the provider; returns its external id. */
  upsertContact(payload: CallSyncPayload): Promise<UpsertResult>;
  /** Open a support ticket for the call (only when `capabilities.tickets`). */
  createTicket?(payload: CallSyncPayload): Promise<UpsertResult>;
}
