import { CONNECTOR_META } from '@vocaliq/shared';
import { Router } from 'express';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import { CONFIG_WRITERS } from '../tenancy/roles';
import type { TenantService } from '../tenancy/tenant.service';
import type { IntegrationsService } from './integrations.service';

/** Integrations API (Day 40). Reads open to members; connect/disconnect to config writers. */
export function integrationsRoutes(
  integrations: IntegrationsService,
  tenants: TenantService,
): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants));

  /** The connector catalog (labels + capabilities + which are implemented). */
  r.get(
    '/catalog',
    ah(async (_req, res) => {
      res.json(Object.entries(CONNECTOR_META).map(([type, meta]) => ({ type, ...meta })));
    }),
  );

  r.get(
    '/',
    ah(async (req, res) => {
      res.json(await integrations.list(req.ctx!.tenantId));
    }),
  );

  r.post(
    '/',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      res.json(await integrations.connect(req.ctx!.tenantId, req.body));
    }),
  );

  r.post(
    '/:id/test',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      res.json(await integrations.test(req.ctx!.tenantId, req.params.id as string));
    }),
  );

  r.post(
    '/sync/:callId',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      res.json(await integrations.syncCall(req.ctx!.tenantId, req.params.callId as string));
    }),
  );

  r.delete(
    '/:id',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      res.json(await integrations.disconnect(req.ctx!.tenantId, req.params.id as string));
    }),
  );

  return r;
}
