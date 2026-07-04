import { Role, ValidationError } from '@vocaliq/shared';
import { type Request, Router } from 'express';
import { z } from 'zod';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import type { TenantService } from '../tenancy/tenant.service';
import type { AuditService } from './audit.service';
import type { Actor, FeatureFlagsService } from './feature-flags.service';
import type { QuotaResource, QuotaService } from './quota.service';

const ADMINS: Role[] = [Role.OWNER, Role.ADMIN, Role.RESELLER_ADMIN];
const RESOURCES = ['minutes', 'agents', 'numbers', 'sip'] as const;

/**
 * Governance API (Day 58): feature flags, quotas, and the audit log. Flag/quota reads are open to
 * admins of the tenant; GLOBAL flag writes + platform audit are SUPER_ADMIN (enforced in the
 * services). Mounted at /admin/governance.
 */
export function governanceRoutes(
  flags: FeatureFlagsService,
  quota: QuotaService,
  audit: AuditService,
  tenants: TenantService,
): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants), requireRoles(...ADMINS));

  const actorOf = (req: Request): Actor => ({
    userId: req.ctx!.userId,
    tenantId: req.ctx!.tenantId,
    role: req.ctx!.role,
  });

  // ── Flags ──
  r.get(
    '/flags/global',
    ah(async (_req, res) => res.json(await flags.listGlobal())),
  );
  r.get(
    '/flags/tenant',
    ah(async (req, res) => res.json(await flags.listTenant(req.ctx!.tenantId))),
  );
  r.get(
    '/flags/effective',
    ah(async (req, res) => res.json(await flags.resolve(req.ctx!.tenantId))),
  );
  r.post(
    '/flags',
    ah(async (req, res) => res.status(201).json(await flags.set(actorOf(req), req.body))),
  );
  r.delete(
    '/flags/:scope/:key',
    ah(async (req, res) => {
      const scope = req.params.scope as string;
      if (scope !== 'GLOBAL' && scope !== 'TENANT') throw new ValidationError('Bad scope');
      res.json(await flags.remove(actorOf(req), scope, req.params.key as string));
    }),
  );

  // ── Quotas ──
  r.get(
    '/quota/:resource',
    ah(async (req, res) => {
      const resource = z.enum(RESOURCES).safeParse(req.params.resource);
      if (!resource.success) throw new ValidationError('Unknown resource');
      res.json(
        await quota.check(req.ctx!.tenantId, resource.data as QuotaResource, req.ctx!.userId),
      );
    }),
  );

  // ── Audit log ──
  r.get(
    '/audit',
    ah(async (req, res) => {
      const q = req.query;
      res.json(
        await audit.search(
          { tenantId: req.ctx!.tenantId, role: req.ctx!.role },
          {
            ...(q.action ? { action: String(q.action) } : {}),
            ...(q.actorUserId ? { actorUserId: String(q.actorUserId) } : {}),
            ...(q.tenantId ? { tenantId: String(q.tenantId) } : {}),
            ...(q.from ? { from: new Date(String(q.from)) } : {}),
            ...(q.to ? { to: new Date(String(q.to)) } : {}),
            ...(q.limit ? { limit: Number(q.limit) } : {}),
          },
        ),
      );
    }),
  );

  return r;
}
