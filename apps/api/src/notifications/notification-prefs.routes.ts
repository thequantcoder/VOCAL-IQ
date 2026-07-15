import { Router } from 'express';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import { CONFIG_WRITERS } from '../tenancy/roles';
import type { TenantService } from '../tenancy/tenant.service';
import type { NotificationPrefsService } from './notification-prefs.service';

/**
 * Notification-preferences API (FOLLOWUP): the event×channel matrix. Reads open to any member;
 * writes to config-writers. RLS-scoped (the service reads/writes the tenant's own settings).
 */
export function notificationPrefsRoutes(
  prefs: NotificationPrefsService,
  tenants: TenantService,
): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants));

  r.get(
    '/preferences',
    ah(async (req, res) => {
      res.json(await prefs.getPrefs(req.ctx!.tenantId));
    }),
  );

  r.put(
    '/preferences',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      res.json(await prefs.setPrefs(req.ctx!.tenantId, req.body));
    }),
  );

  return r;
}
