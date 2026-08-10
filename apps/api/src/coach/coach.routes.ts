import { ValidationError } from '@vocaliq/shared';
import { type Request, Router } from 'express';
import { z } from 'zod';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import type { TenantService } from '../tenancy/tenant.service';
import type { Actor, CoachService } from './coach.service';

const turnSchema = z.object({ role: z.enum(['caller', 'agent']), text: z.string().max(4000) });
const suggestBody = z.object({
  callId: z.string().uuid(),
  agentId: z.string().uuid().optional(),
  turns: z.array(turnSchema).max(50),
  sentiment: z.number().min(-1).max(1).optional(),
  hasQuote: z.boolean().optional(),
});
const postCallBody = z.object({
  callId: z.string().uuid(),
  durationSec: z.number().int().min(0),
  turns: z.array(turnSchema).max(500),
  resolved: z.boolean().optional(),
});
const confirmBody = z.object({
  disposition: z.string().max(60).optional(),
  notes: z.string().max(4000).optional(),
});

/**
 * Agent-desk copilot API (Day 74). `suggest` is the live whisper the human agent's screen polls;
 * `post-call` drafts the auto-note; `notes/:id/confirm` is the human confirming the AI draft. All
 * output is agent-only — nothing here touches the spoken channel. Mounted at /coach.
 */
export function coachRoutes(coach: CoachService, tenants: TenantService): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants));

  const actorOf = (req: Request): Actor => ({
    userId: req.ctx!.userId,
    tenantId: req.ctx!.tenantId,
    membershipId: req.ctx!.membershipId,
    role: req.ctx!.role,
  });

  r.post(
    '/suggest',
    ah(async (req, res) => {
      const p = suggestBody.safeParse(req.body);
      if (!p.success) throw new ValidationError('callId + turns required');
      const { agentId, sentiment, hasQuote, ...rest } = p.data;
      res.json(
        await coach.suggest(req.ctx!.tenantId, {
          ...rest,
          ...(agentId ? { agentId } : {}),
          ...(sentiment !== undefined ? { sentiment } : {}),
          ...(hasQuote !== undefined ? { hasQuote } : {}),
        }),
      );
    }),
  );

  r.post(
    '/post-call',
    ah(async (req, res) => {
      const p = postCallBody.safeParse(req.body);
      if (!p.success) throw new ValidationError('callId + durationSec + turns required');
      const { resolved, ...rest } = p.data;
      res.status(201).json(
        await coach.postCallDraft(req.ctx!.tenantId, {
          ...rest,
          ...(resolved !== undefined ? { resolved } : {}),
        }),
      );
    }),
  );

  r.post(
    '/notes/:id/confirm',
    ah(async (req, res) => {
      const p = confirmBody.safeParse(req.body ?? {});
      if (!p.success) throw new ValidationError('Invalid edits');
      const edits: { disposition?: string; notes?: string } = {};
      if (p.data.disposition !== undefined) edits.disposition = p.data.disposition;
      if (p.data.notes !== undefined) edits.notes = p.data.notes;
      res.json(await coach.confirmNote(actorOf(req), req.params.id as string, edits));
    }),
  );

  r.get(
    '/notes',
    ah(async (req, res) =>
      res.json(await coach.listNotes(req.ctx!.tenantId, req.query.callId as string | undefined)),
    ),
  );

  return r;
}
