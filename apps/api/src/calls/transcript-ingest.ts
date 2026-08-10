import { timingSafeEqual } from 'node:crypto';
import { NotFoundError, ValidationError } from '@vocaliq/shared';
import type { Request, Response } from 'express';
import { z } from 'zod';
import type { PrismaService } from '../db/prisma.service';
import { ah } from '../http/async-handler';

/**
 * Voice→api transcript ingest (the missing write-side of the post-call chain). The voice loop
 * collects its per-turn transcript and POSTs it here at call end (`TranscriptReporter`); this
 * persists the Transcript row so post-call intel, QA scoring, search indexing, and the in-call
 * FORM extraction (PARITY-03 voice leg) can all run for voice calls.
 *
 * INTERNAL ONLY — guarded by the SAME shared secret as the api→voice control hop
 * (`VOICE_INTERNAL_SECRET`, constant-time compared); when unset the endpoint is DISABLED (503,
 * gated), never open — mirroring the voice side's `_authorize`. The claimed tenant must OWN the
 * call (exact tenantId match under RLS — not mere visibility, since a parent reseller can see a
 * child's rows), so even with the secret a caller can never write a transcript across tenants
 * (self-audit B).
 */

export const transcriptIngestSchema = z.object({
  call_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  segments: z
    .array(
      z.object({
        role: z.string().min(1).max(20),
        text: z.string().min(1).max(8000),
      }),
    )
    .min(1)
    .max(5000),
});

/**
 * Constant-time internal-secret check. `gated` = the server has no secret configured (503);
 * `unauthorized` = missing/wrong header (401); `ok` = proceed. Pure — unit-tested directly.
 */
export function checkInternalSecret(
  provided: string | undefined,
  expected: string | undefined,
): 'gated' | 'unauthorized' | 'ok' {
  if (!expected) return 'gated';
  if (!provided) return 'unauthorized';
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return 'unauthorized';
  return timingSafeEqual(a, b) ? 'ok' : 'unauthorized';
}

export class TranscriptIngestService {
  constructor(
    private readonly db: PrismaService,
    /** Post-ingest hook (in-call form extraction). Fire-and-forget — never blocks the ingest. */
    private readonly onIngested?: (tenantId: string, callId: string) => Promise<unknown>,
  ) {}

  /** Validate + persist a reported transcript (upsert — a re-report replaces the segments). */
  async ingest(input: unknown): Promise<{ ok: true; callId: string }> {
    const parsed = transcriptIngestSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid transcript report');
    }
    const { call_id: callId, tenant_id: tenantId, segments } = parsed.data;

    await this.db.withTenant(tenantId, async (tx) => {
      // Cross-tenant guard: the call must be OWNED by the claimed tenant (exact tenantId match, not
      // mere RLS visibility — a parent reseller can SEE a child's call but must not be able to
      // attach a transcript to it under its own tenant id).
      const call = await tx.call.findFirst({
        where: { id: callId, tenantId },
        select: { id: true },
      });
      if (!call) throw new NotFoundError('Call not found');
      await tx.transcript.upsert({
        where: { callId },
        create: { callId, tenantId, segments },
        update: { segments },
      });
    });

    if (this.onIngested) void this.onIngested(tenantId, callId).catch(() => {});
    return { ok: true, callId };
  }
}

/**
 * Express handler for `POST /internal/voice/transcript` (mounted in main.ts). Gated (503) until
 * `VOICE_INTERNAL_SECRET` is set; 401 on a missing/wrong `x-internal-secret`.
 */
export function transcriptIngestHandler(svc: TranscriptIngestService) {
  return ah(async (req: Request, res: Response): Promise<void> => {
    const verdict = checkInternalSecret(
      req.headers['x-internal-secret'] as string | undefined,
      process.env.VOICE_INTERNAL_SECRET,
    );
    if (verdict === 'gated') {
      res.status(503).json({ error: 'internal transcript ingest not configured' });
      return;
    }
    if (verdict === 'unauthorized') {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    res.json(await svc.ingest(req.body));
  });
}
