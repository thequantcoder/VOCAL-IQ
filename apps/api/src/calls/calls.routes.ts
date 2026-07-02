import { Router } from 'express';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import { CONFIG_WRITERS } from '../tenancy/roles';
import type { TenantService } from '../tenancy/tenant.service';
import type { CallsReadService } from './calls-read.service';
import type { OutboundService } from './outbound.service';

/** Calls API — RLS-scoped list/detail reads + config-writer outbound + disposition. */
export function callsRoutes(
  outbound: OutboundService,
  reads: CallsReadService,
  tenants: TenantService,
): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants));

  /** Cursor-paginated call list (any member — RLS-scoped read). */
  r.get(
    '/',
    ah(async (req, res) => {
      res.json(await reads.list(req.ctx!.tenantId, req.query));
    }),
  );

  /** Call detail + transcript (any member — RLS-scoped read). */
  r.get(
    '/:id',
    ah(async (req, res) => {
      res.json(await reads.detail(req.ctx!.tenantId, req.params.id as string));
    }),
  );

  /**
   * Place an outbound call. Config-writer roles only (BUILDER+). Enforces DNC, consent,
   * concurrency + rate gates before dialing; returns the queued Call id.
   */
  r.post(
    '/outbound',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      res.json(await outbound.placeCall(req.ctx!.tenantId, req.body));
    }),
  );

  /**
   * Record a call's final disposition + cost. Reported by the voice service at call end.
   */
  r.post(
    '/:id/disposition',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      res.json(
        await outbound.recordDisposition(req.ctx!.tenantId, req.params.id as string, req.body),
      );
    }),
  );

  return r;
}
