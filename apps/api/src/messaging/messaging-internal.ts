import { ValidationError } from '@vocaliq/shared';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { checkInternalSecret } from '../calls/transcript-ingest';
import { ah } from '../http/async-handler';
import type { MessagingService } from './messaging.service';

/**
 * Internal messaging send (GME-19) — executes ONE guarded send on behalf of an internal caller (the
 * durable bulk-send worker; also usable by other internal orchestrators). This is the sanctioned
 * "worker→api internal-execute endpoint" that makes the credential-decrypting send path (which lives
 * in the api) reachable from `apps/workers` without duplicating the vault + adapters. Every send still
 * flows through the full `MessagingService.send()` → `MessagingGuard` (consent/opt-out/DNC/quiet-hours)
 * + metering — no bypass.
 *
 * INTERNAL ONLY — guarded by `MESSAGING_INTERNAL_SECRET` (constant-time, via the shared
 * `checkInternalSecret`); unset → 503 (gated, never open), missing/wrong header → 401. The tenant is
 * taken from the (secret-authenticated) body, so a worker can send for any tenant it was queued for —
 * the guard still enforces per-recipient eligibility.
 */

export const internalSendSchema = z.object({
  tenantId: z.string().uuid(),
  channel: z.enum(['SMS', 'WHATSAPP', 'TELEGRAM', 'MESSENGER', 'INSTAGRAM', 'RCS']),
  to: z.string().min(1).max(200),
  templateId: z.string().uuid().optional(),
  body: z.string().min(1).max(1024).optional(),
  variables: z.record(z.string(), z.string()).optional(),
  campaignId: z.string().uuid().optional(),
  requireConsent: z.boolean().optional(),
  respectQuietHours: z.boolean().optional(),
});

export interface InternalSendOutcome {
  /** SENT / QUEUED (gated provider) / SKIPPED (a guard refusal — permanent, don't retry). */
  status: string;
  id?: string;
  reason?: string;
}

/**
 * Execute one send. A guard refusal (opt-out/DNC/consent/quiet-hours) or a missing template variable
 * is a PERMANENT skip (`SKIPPED` + reason) — reported as a normal 200 so the worker never retries it.
 * Any other error propagates (5xx) so the worker's queue can retry a transient failure.
 */
export async function executeInternalSend(
  messaging: MessagingService,
  input: unknown,
): Promise<InternalSendOutcome> {
  const parsed = internalSendSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid internal send');
  }
  const { tenantId, ...rest } = parsed.data;
  try {
    const msg = await messaging.send(tenantId, {
      channel: rest.channel,
      to: rest.to,
      ...(rest.templateId ? { templateId: rest.templateId } : {}),
      ...(rest.body ? { body: rest.body } : {}),
      ...(rest.variables ? { variables: rest.variables } : {}),
      ...(rest.campaignId ? { campaignId: rest.campaignId } : {}),
      ...(rest.requireConsent ? { requireConsent: true } : {}),
      ...(rest.respectQuietHours ? { respectQuietHours: true } : {}),
    });
    return { status: msg.status, id: msg.id, ...(msg.error ? { reason: msg.error } : {}) };
  } catch (err) {
    // A guard/validation refusal is a permanent per-recipient skip — never retried by the worker.
    if (err instanceof ValidationError) {
      return { status: 'SKIPPED', reason: (err as Error).message };
    }
    throw err; // transient → let the caller (worker/BullMQ) retry
  }
}

/** Express handler for `POST /internal/messaging/send` (mounted in main.ts). */
export function messagingSendInternalHandler(messaging: MessagingService) {
  return ah(async (req: Request, res: Response): Promise<void> => {
    const verdict = checkInternalSecret(
      req.headers['x-internal-secret'] as string | undefined,
      process.env.MESSAGING_INTERNAL_SECRET,
    );
    if (verdict === 'gated') {
      res.status(503).json({ error: 'internal messaging send not configured' });
      return;
    }
    if (verdict === 'unauthorized') {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    res.json(await executeInternalSend(messaging, req.body));
  });
}
