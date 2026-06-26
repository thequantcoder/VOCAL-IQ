import { AuthError } from '@vocaliq/shared';
import { Webhook } from 'svix';

/** Svix signature headers Clerk sends on every webhook. */
export interface SvixHeaders {
  'svix-id'?: string;
  'svix-timestamp'?: string;
  'svix-signature'?: string;
}

/** A verified Clerk webhook event (only the fields we use). */
export interface ClerkWebhookEvent {
  type: string;
  data: Record<string, unknown>;
}

/**
 * Verify a Clerk webhook using its Svix signing secret over the RAW body
 * (CODE-PATTERNS §4 — never trust an unverified webhook; use the raw payload).
 * Throws AuthError on a missing secret/headers or a bad signature.
 */
export function verifyClerkWebhook(
  secret: string | undefined,
  rawBody: string,
  headers: SvixHeaders,
): ClerkWebhookEvent {
  if (!secret) throw new AuthError('Webhook secret not configured');
  const id = headers['svix-id'];
  const timestamp = headers['svix-timestamp'];
  const signature = headers['svix-signature'];
  if (!id || !timestamp || !signature) throw new AuthError('Missing webhook signature headers');

  try {
    const wh = new Webhook(secret);
    return wh.verify(rawBody, {
      'svix-id': id,
      'svix-timestamp': timestamp,
      'svix-signature': signature,
    }) as ClerkWebhookEvent;
  } catch (cause) {
    throw new AuthError('Invalid webhook signature', { cause });
  }
}
