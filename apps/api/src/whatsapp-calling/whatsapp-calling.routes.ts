import { Router } from 'express';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import { CONFIG_WRITERS } from '../tenancy/roles';
import type { TenantService } from '../tenancy/tenant.service';
import type { WhatsAppCallSettingsService } from './whatsapp-call-settings.service';

/**
 * WhatsApp Business Calling API (WAC-05+). Reads open to members; settings writes to config-writers.
 * RLS-scoped (the service reads/writes the tenant's own settings + syncs to Meta).
 */
export function whatsAppCallingRoutes(
  settings: WhatsAppCallSettingsService,
  tenants: TenantService,
): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants));

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
