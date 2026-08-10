import { Router } from 'express';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import { CONFIG_WRITERS } from '../tenancy/roles';
import type { TenantService } from '../tenancy/tenant.service';
import type { SlackService } from './slack.service';

/**
 * Slack notification settings. Read is open to members; write/test restricted to config writers.
 * All tenant-scoped (RLS). The webhook URL is masked on read and never echoed back in full.
 */
export function slackRoutes(slack: SlackService, tenants: TenantService): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants));

  r.get(
    '/',
    ah(async (req, res) => {
      res.json(await slack.getConfig(req.ctx!.tenantId));
    }),
  );

  r.put(
    '/',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      res.json(await slack.setConfig(req.ctx!.tenantId, req.body));
    }),
  );

  r.post(
    '/test',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      res.json(await slack.test(req.ctx!.tenantId));
    }),
  );

  return r;
}
