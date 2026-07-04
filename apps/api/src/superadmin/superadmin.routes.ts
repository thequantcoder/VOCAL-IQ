import { Role, ValidationError, impersonateInputSchema, tenantSearchSchema } from '@vocaliq/shared';
import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import type { TenantService } from '../tenancy/tenant.service';
import type { SuperAdminService } from './superadmin.service';

const periodQuery = z.object({ period: z.string().regex(/^\d{4}-\d{2}$/) });

/**
 * Super-admin console API (Day 55). EVERY route is SUPER_ADMIN-gated (deny-by-default) — this is
 * the single audited door to the cross-tenant, owner-client reads in SuperAdminService. Tenant
 * status changes + impersonation grants are written to the audit log by the service.
 */
export function superAdminRoutes(admin: SuperAdminService, tenants: TenantService): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants), requireRoles(Role.SUPER_ADMIN));

  r.get(
    '/tenants',
    ah(async (req, res) => {
      const parsed = tenantSearchSchema.safeParse({
        ...req.query,
        ...(req.query.page ? { page: Number(req.query.page) } : {}),
        ...(req.query.pageSize ? { pageSize: Number(req.query.pageSize) } : {}),
      });
      if (!parsed.success) throw new ValidationError('Invalid tenant search');
      res.json(await admin.listTenants(parsed.data));
    }),
  );

  r.get(
    '/tenants/:id',
    ah(async (req, res) => {
      res.json(await admin.getTenant(req.params.id as string));
    }),
  );

  r.post(
    '/tenants/:id/suspend',
    ah(async (req, res) => {
      res.json(await admin.setTenantStatus(req.ctx!.userId, req.params.id as string, 'SUSPENDED'));
    }),
  );

  r.post(
    '/tenants/:id/reactivate',
    ah(async (req, res) => {
      res.json(await admin.setTenantStatus(req.ctx!.userId, req.params.id as string, 'ACTIVE'));
    }),
  );

  r.post(
    '/impersonate',
    ah(async (req, res) => {
      const parsed = impersonateInputSchema.safeParse(req.body);
      if (!parsed.success)
        throw new ValidationError('A target tenantId + a reason (min 3 chars) are required');
      res.json(await admin.impersonate(req.ctx!.userId, parsed.data));
    }),
  );

  r.get(
    '/overview',
    ah(async (req, res) => {
      const parsed = periodQuery.safeParse(req.query);
      if (!parsed.success) throw new ValidationError('A period (YYYY-MM) is required');
      res.json(await admin.platformOverview(parsed.data.period));
    }),
  );

  r.get(
    '/health',
    ah(async (_req, res) => {
      res.json(await admin.systemHealth());
    }),
  );

  r.get(
    '/audit',
    ah(async (req, res) => {
      const tenantId = z.string().uuid().safeParse(req.query.tenantId);
      res.json(await admin.listAudit(tenantId.success ? tenantId.data : undefined));
    }),
  );

  return r;
}
