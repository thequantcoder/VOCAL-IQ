import { Role } from '@vocaliq/shared';
import { Router } from 'express';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import type { TenantService } from '../tenancy/tenant.service';
import type { LaunchService } from './launch.service';

/** Public status page endpoint (Day 66) — unauthenticated, minimal, safe to expose. */
export function statusRoutes(launch: LaunchService): Router {
  const r = Router();
  r.get(
    '/',
    ah(async (_req, res) => res.json(await launch.status())),
  );
  return r;
}

/** Go-live readiness report (Day 66) — SUPER_ADMIN only (reveals which signals are unmet). */
export function launchRoutes(launch: LaunchService, tenants: TenantService): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants), requireRoles(Role.SUPER_ADMIN));
  r.get(
    '/readiness',
    ah(async (_req, res) => res.json(await launch.readiness())),
  );
  return r;
}
