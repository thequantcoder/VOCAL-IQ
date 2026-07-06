import { Router } from 'express';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import { CONFIG_WRITERS } from '../tenancy/roles';
import type { TenantService } from '../tenancy/tenant.service';
import type { IntelService } from './intel.service';

/**
 * Conversation-intelligence API (Day 75). Trends + signal search are read-only for any tenant
 * member; the competitor watchlist / alert rules are config-writer; extraction + alert checks are
 * config-writer (they mutate/notify). Mounted at /intel.
 */
export function intelRoutes(intel: IntelService, tenants: TenantService): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants));

  r.get(
    '/config',
    ah(async (req, res) => res.json(await intel.getConfig(req.ctx!.tenantId))),
  );
  r.put(
    '/config',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => res.json(await intel.setConfig(req.ctx!.tenantId, req.body))),
  );

  r.get(
    '/trends',
    ah(async (req, res) => {
      const sinceDays = req.query.sinceDays ? Number(req.query.sinceDays) : undefined;
      res.json(await intel.trends(req.ctx!.tenantId, sinceDays));
    }),
  );

  r.get(
    '/signals',
    ah(async (req, res) => {
      const { type, label, callId } = req.query;
      res.json(
        await intel.listSignals(req.ctx!.tenantId, {
          ...(typeof type === 'string' ? { type } : {}),
          ...(typeof label === 'string' ? { label } : {}),
          ...(typeof callId === 'string' ? { callId } : {}),
        }),
      );
    }),
  );

  r.post(
    '/calls/:callId/extract',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) =>
      res.json(await intel.extractForCall(req.ctx!.tenantId, req.params.callId as string)),
    ),
  );

  r.post(
    '/check-alerts',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      const sinceDays = req.body?.sinceDays ? Number(req.body.sinceDays) : undefined;
      res.json(await intel.checkAlerts(req.ctx!.tenantId, sinceDays));
    }),
  );

  return r;
}
