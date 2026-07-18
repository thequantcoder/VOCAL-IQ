import { Router } from 'express';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import { CONFIG_WRITERS } from '../tenancy/roles';
import type { TenantService } from '../tenancy/tenant.service';
import type { MessengerCallReadService } from './messenger-call-read.service';
import type { MessengerCallSettingsService } from './messenger-call-settings.service';

/**
 * Messenger Calling dashboard API (MEC-04/05) — today's KPIs + this-month minutes + recent calls
 * (`/overview`), one call's identity + decoded context + status timeline (`/calls/:id` live-call view),
 * and the tenant's call settings (`/settings`, GET open to members, PUT to config-writers). RLS-scoped
 * via the tenant middleware. Outbound dialing routes land in MEC-08.
 */
export function messengerCallingRoutes(
  read: MessengerCallReadService,
  settings: MessengerCallSettingsService,
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

  // Call settings (MEC-05): availability hours + call-button visibility.
  r.get(
    '/settings',
    ah(async (req, res) => {
      res.json(await settings.get(req.ctx!.tenantId));
    }),
  );

  r.put(
    '/settings',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      res.json(await settings.set(req.ctx!.tenantId, req.body));
    }),
  );

  return r;
}
