import { Router } from 'express';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import { CONFIG_WRITERS } from '../tenancy/roles';
import type { TenantService } from '../tenancy/tenant.service';
import type { BenchmarkingService } from './benchmarking.service';

/** Parse ?from / ?to ISO dates from the query (both optional). */
function windowOf(q: Record<string, unknown>): { from?: Date; to?: Date } {
  const parse = (v: unknown): Date | undefined => {
    if (typeof v !== 'string') return undefined;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? undefined : d;
  };
  const from = parse(q.from);
  const to = parse(q.to);
  return { ...(from ? { from } : {}), ...(to ? { to } : {}) };
}

/**
 * Analytics benchmarking API (Day 86). Reads (settings/internal/peers) are any-member; changing the
 * opt-in/industry is config-writer. Peer data is aggregate-only + opt-in + k-anon gated in the service.
 * Mounted at /benchmarking.
 */
export function benchmarkingRoutes(svc: BenchmarkingService, tenants: TenantService): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants));

  r.get(
    '/settings',
    ah(async (req, res) => res.json(await svc.getSettings(req.ctx!.tenantId))),
  );
  r.put(
    '/settings',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => res.json(await svc.updateSettings(req.ctx!.tenantId, req.body))),
  );
  r.get(
    '/internal',
    ah(async (req, res) => res.json(await svc.internal(req.ctx!.tenantId, windowOf(req.query)))),
  );
  r.get(
    // The peer window is fixed server-side (privacy — no caller-controlled window), so ?from/?to are
    // intentionally ignored here.
    '/peers',
    ah(async (req, res) => res.json(await svc.peers(req.ctx!.tenantId))),
  );

  return r;
}
