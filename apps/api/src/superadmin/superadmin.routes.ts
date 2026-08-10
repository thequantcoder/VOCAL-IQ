import {
  Role,
  ValidationError,
  announcementInputSchema,
  createPromoCodeInputSchema,
  grantCreditInputSchema,
  impersonateInputSchema,
  tenantSearchSchema,
} from '@vocaliq/shared';
import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import type { TenantService } from '../tenancy/tenant.service';
import type { UpdateService } from '../version/update.service';
import type { SuperAdminService } from './superadmin.service';

const periodQuery = z.object({ period: z.string().regex(/^\d{4}-\d{2}$/) });

/**
 * Super-admin console API (Day 55). EVERY route is SUPER_ADMIN-gated (deny-by-default) — this is
 * the single audited door to the cross-tenant, owner-client reads in SuperAdminService. Tenant
 * status changes + impersonation grants are written to the audit log by the service.
 */
export function superAdminRoutes(
  admin: SuperAdminService,
  tenants: TenantService,
  update: UpdateService,
): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants), requireRoles(Role.SUPER_ADMIN));

  // Self-host "Check for Updates" (PARITY-11): compare the installed version to the release manifest.
  // Read-only — reports + links the changelog, never auto-applies.
  r.get(
    '/updates',
    ah(async (_req, res) => {
      res.json(await update.check());
    }),
  );

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

  // Publish a platform-wide announcement to a targeted audience (audited fan-out).
  r.post(
    '/announcements',
    ah(async (req, res) => {
      const parsed = announcementInputSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid announcement');
      }
      res.json(await admin.broadcastAnnouncement(req.ctx!.userId, req.ctx!.tenantId, parsed.data));
    }),
  );

  // Promotional / bonus credits (PARITY-08) — grant to a tenant, revoke a grant, create a promo code.
  r.post(
    '/tenants/:id/grant-credit',
    ah(async (req, res) => {
      const parsed = grantCreditInputSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid grant');
      }
      res.json(
        await admin.grantTenantCredit(
          req.ctx!.userId,
          req.ctx!.tenantId,
          req.params.id as string,
          parsed.data,
        ),
      );
    }),
  );

  r.post(
    '/grants/:grantId/revoke',
    ah(async (req, res) => {
      res.json(
        await admin.revokeTenantGrant(
          req.ctx!.userId,
          req.ctx!.tenantId,
          req.params.grantId as string,
        ),
      );
    }),
  );

  r.post(
    '/promo-codes',
    ah(async (req, res) => {
      const parsed = createPromoCodeInputSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid promo code');
      }
      res.json(await admin.createPromoCode(req.ctx!.userId, req.ctx!.tenantId, parsed.data));
    }),
  );

  return r;
}
