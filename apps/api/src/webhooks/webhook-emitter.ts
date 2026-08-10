import type { WebhookEvent } from '@vocaliq/shared';

/**
 * A best-effort webhook emit port. Services depend on this (not on WebhookService directly) so
 * emitting a domain event is optional + testable, and a delivery failure can never break the
 * business operation. Composition wires it to `WebhookService.deliver`.
 */
export type WebhookEmitter = (
  tenantId: string,
  event: WebhookEvent,
  payload: Record<string, unknown>,
) => Promise<unknown>;
