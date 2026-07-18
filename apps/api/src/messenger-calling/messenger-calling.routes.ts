import { Router } from 'express';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import type { TenantService } from '../tenancy/tenant.service';
import type { MessengerCallReadService } from './messenger-call-read.service';

/**
 * Messenger Calling dashboard API (MEC-04) — read-only for now: today's KPIs + this-month minutes +
 * recent calls (`/overview`), and one call's identity + decoded context + status timeline (`/calls/:id`
 * live-call view). Reads are open to members; RLS-scoped via the tenant middleware. Settings + outbound
 * dialing routes land in later phases (MEC-05/08).
 */
export function messengerCallingRoutes(
  read: MessengerCallReadService,
  tenants: TenantService,
): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants));

  // Dashboard: today's KPIs + this-month minutes + recent Messenger calls.
  r.get(
    '/overview',
    ah(async (req, res) => {
      res.json(await read.overview(req.ctx!.tenantId));
    }),
  );

  // Live-call view: one Messenger call's identity + decoded context + status timeline.
  r.get(
    '/calls/:id',
    ah(async (req, res) => {
      res.json(await read.liveCall(req.ctx!.tenantId, req.params.id as string));
    }),
  );

  return r;
}
