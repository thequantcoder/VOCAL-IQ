import { Role, ValidationError } from '@vocaliq/shared';
import { type Request, Router } from 'express';
import { z } from 'zod';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import type { TenantService } from '../tenancy/tenant.service';
import type { Actor, DeskService } from './desk.service';

/** The desk is for human agents + up. Viewers/billing roles can't claim live calls. */
const DESK_ROLES: Role[] = [Role.AGENT, Role.BUILDER, Role.ADMIN, Role.OWNER, Role.RESELLER_ADMIN];

const dispositionBody = z.object({
  disposition: z.string().min(1).max(64),
  notes: z.string().max(2000).optional(),
  durationSec: z.number().int().nonnegative().optional(),
});

/**
 * Agent Desk API (Day 67). Presence + claim + disposition are for desk roles (AGENT and up).
 * `requestTransfer` is how the Transfer node / an escalation enqueues a human handoff. All
 * tenant-scoped. Mounted at /desk.
 */
export function deskRoutes(desk: DeskService, tenants: TenantService): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants), requireRoles(...DESK_ROLES));

  const actorOf = (req: Request): Actor => ({
    userId: req.ctx!.userId,
    tenantId: req.ctx!.tenantId,
    membershipId: req.ctx!.membershipId,
    role: req.ctx!.role,
  });

  r.put(
    '/presence',
    ah(async (req, res) => res.json(await desk.setPresence(actorOf(req), req.body))),
  );
  r.get(
    '/agents',
    ah(async (req, res) => res.json(await desk.availableAgents(req.ctx!.tenantId))),
  );
  r.get(
    '/queue',
    ah(async (req, res) => res.json(await desk.queue(actorOf(req)))),
  );

  r.post(
    '/transfers',
    ah(async (req, res) => {
      const { callId, handoffType, strategy, requiredSkill, specificMembershipId, ...ctx } =
        req.body ?? {};
      res
        .status(201)
        .json(
          await desk.requestTransfer(
            req.ctx!.tenantId,
            { callId, handoffType, strategy, requiredSkill, specificMembershipId },
            ctx,
          ),
        );
    }),
  );
  r.post(
    '/transfers/:id/claim',
    ah(async (req, res) => res.json(await desk.claim(actorOf(req), req.params.id as string))),
  );
  r.post(
    '/transfers/:id/no-answer',
    ah(async (req, res) =>
      res.json(await desk.noAnswer(req.ctx!.tenantId, req.params.id as string)),
    ),
  );
  r.post(
    '/transfers/:id/disposition',
    ah(async (req, res) => {
      const p = dispositionBody.safeParse(req.body);
      if (!p.success) throw new ValidationError('A disposition is required');
      res.json(
        await desk.disposition(actorOf(req), req.params.id as string, {
          disposition: p.data.disposition,
          ...(p.data.notes ? { notes: p.data.notes } : {}),
          ...(p.data.durationSec != null ? { durationSec: p.data.durationSec } : {}),
        }),
      );
    }),
  );

  return r;
}
