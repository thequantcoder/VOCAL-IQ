import { ValidationError } from '@vocaliq/shared';
import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import { CONFIG_WRITERS } from '../tenancy/roles';
import type { TenantService } from '../tenancy/tenant.service';
import type { AnalyticsExportService } from './analytics-export.service';

const activeSchema = z.object({ active: z.boolean() });

/**
 * BI exports dashboard API (Day 87). Reads (list/download/schedules) are any-member; creating an export
 * or a schedule is config-writer. STORED exports are always PII-masked (raw PII is only available via
 * the live `/v1/analytics` API with the `pii:read` scope — never persisted to a downloadable file).
 */
export function analyticsExportRoutes(svc: AnalyticsExportService, tenants: TenantService): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants));

  r.get(
    '/',
    ah(async (req, res) => res.json(await svc.list(req.ctx!.tenantId))),
  );
  r.post(
    '/',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => res.status(201).json(await svc.create(req.ctx!.tenantId, req.body))),
  );
  r.get(
    '/:id/download',
    ah(async (req, res) => {
      const file = await svc.download(req.ctx!.tenantId, req.params.id as string);
      res.setHeader('content-type', 'text/csv; charset=utf-8');
      res.setHeader('content-disposition', `attachment; filename="${file.filename}"`);
      res.send(file.csv);
    }),
  );

  // ── schedules ──────────────────────────────────────────────────────────────
  r.get(
    '/schedules',
    ah(async (req, res) => res.json(await svc.listSchedules(req.ctx!.tenantId))),
  );
  r.post(
    '/schedules',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) =>
      res.status(201).json(await svc.createSchedule(req.ctx!.tenantId, req.body)),
    ),
  );
  r.post(
    '/schedules/:id/active',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      const p = activeSchema.safeParse(req.body);
      if (!p.success) throw new ValidationError('active must be a boolean');
      res.json(
        await svc.setScheduleActive(req.ctx!.tenantId, req.params.id as string, p.data.active),
      );
    }),
  );
  r.delete(
    '/schedules/:id',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) =>
      res.json(await svc.removeSchedule(req.ctx!.tenantId, req.params.id as string)),
    ),
  );

  return r;
}
