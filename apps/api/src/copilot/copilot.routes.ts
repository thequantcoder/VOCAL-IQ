import { ValidationError } from '@vocaliq/shared';
import { type Request, Router } from 'express';
import { z } from 'zod';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import { CONFIG_WRITERS } from '../tenancy/roles';
import type { TenantService } from '../tenancy/tenant.service';
import type { Actor, CopilotService } from './copilot.service';

const turnSchema = z.object({ role: z.enum(['caller', 'agent']), text: z.string().max(4000) });
const assistBody = z.object({
  turns: z.array(turnSchema).max(50),
  sentiment: z.number().min(-1).max(1).optional(),
  hasQuote: z.boolean().optional(),
});
const endBody = z.object({ durationSec: z.number().int().min(0).optional() });

/**
 * Live Co-Pilot API (Day 90) — the standalone product for human sales teams. Sessions are any-member
 * (reps run their own); the live `assist` is the whisper the rep's screen polls; `end` drafts CRM
 * fields; `crm` confirms the human-reviewed draft. Battlecard CRUD is config-writer. Nothing here
 * touches the spoken channel. Mounted at /copilot.
 */
export function copilotRoutes(svc: CopilotService, tenants: TenantService): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants));

  const actorOf = (req: Request): Actor => ({
    userId: req.ctx!.userId,
    tenantId: req.ctx!.tenantId,
    membershipId: req.ctx!.membershipId,
    role: req.ctx!.role,
  });

  // ── sessions ──
  r.post(
    '/sessions',
    ah(async (req, res) => res.status(201).json(await svc.startSession(actorOf(req), req.body))),
  );
  r.get(
    '/sessions',
    ah(async (req, res) => res.json(await svc.listSessions(req.ctx!.tenantId))),
  );
  r.get(
    '/sessions/:id',
    ah(async (req, res) =>
      res.json(await svc.getSession(req.ctx!.tenantId, req.params.id as string)),
    ),
  );
  r.post(
    '/sessions/:id/assist',
    ah(async (req, res) => {
      const p = assistBody.safeParse(req.body);
      if (!p.success) throw new ValidationError('turns required');
      const { sentiment, hasQuote, turns } = p.data;
      res.json(
        await svc.assist(req.ctx!.tenantId, req.params.id as string, {
          turns,
          ...(sentiment !== undefined ? { sentiment } : {}),
          ...(hasQuote !== undefined ? { hasQuote } : {}),
        }),
      );
    }),
  );
  r.post(
    '/sessions/:id/end',
    ah(async (req, res) => {
      const p = endBody.safeParse(req.body ?? {});
      if (!p.success) throw new ValidationError('Invalid end');
      res.json(
        await svc.endSession(req.ctx!.tenantId, req.params.id as string, {
          ...(p.data.durationSec !== undefined ? { durationSec: p.data.durationSec } : {}),
        }),
      );
    }),
  );
  r.post(
    '/sessions/:id/crm',
    ah(async (req, res) => {
      const edits = (req.body ?? {}) as Record<string, unknown>;
      res.json(await svc.confirmCrm(req.ctx!.tenantId, req.params.id as string, edits));
    }),
  );

  // ── battlecards (config-writer) ──
  r.get(
    '/battlecards',
    ah(async (req, res) => res.json(await svc.listBattlecards(req.ctx!.tenantId))),
  );
  r.post(
    '/battlecards',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) =>
      res.status(201).json(await svc.createBattlecard(req.ctx!.tenantId, req.body)),
    ),
  );
  r.put(
    '/battlecards/:id',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) =>
      res.json(await svc.updateBattlecard(req.ctx!.tenantId, req.params.id as string, req.body)),
    ),
  );
  r.delete(
    '/battlecards/:id',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) =>
      res.json(await svc.deleteBattlecard(req.ctx!.tenantId, req.params.id as string)),
    ),
  );

  return r;
}
