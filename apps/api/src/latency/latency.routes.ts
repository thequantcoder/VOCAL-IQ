import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import type { TenantService } from '../tenancy/tenant.service';
import type { LatencyService } from './latency.service';

const hoursQuery = z.coerce.number().int().min(1).max(720).default(24);

/**
 * Latency telemetry API (Day 63). The voice service records per-turn samples; operators read the
 * SLO summary for the dashboard. Session-authenticated + tenant-scoped. Mounted at /latency.
 */
export function latencyRoutes(latency: LatencyService, tenants: TenantService): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants));

  r.post(
    '/',
    ah(async (req, res) => {
      const callId = typeof req.body?.callId === 'string' ? req.body.callId : undefined;
      res.status(201).json(await latency.record(req.ctx!.tenantId, req.body, callId));
    }),
  );

  r.get(
    '/summary',
    ah(async (req, res) => {
      const hours = hoursQuery.parse(req.query.hours ?? 24);
      res.json(await latency.summary(req.ctx!.tenantId, hours));
    }),
  );

  return r;
}
