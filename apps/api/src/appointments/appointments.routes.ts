import { ValidationError } from '@vocaliq/shared';
import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import { CONFIG_WRITERS } from '../tenancy/roles';
import type { TenantService } from '../tenancy/tenant.service';
import type { AppointmentsService } from './appointments.service';

const statusSchema = z.object({ status: z.string().min(1) });

/** Appointments API (Day 36). Reads open to members; mutations to config writers. */
export function appointmentsRoutes(
  appointments: AppointmentsService,
  tenants: TenantService,
): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants));

  r.get(
    '/',
    ah(async (req, res) => {
      res.json(await appointments.list(req.ctx!.tenantId, req.query.status as string | undefined));
    }),
  );

  r.get(
    '/stats',
    ah(async (req, res) => {
      res.json(await appointments.stats(req.ctx!.tenantId));
    }),
  );

  r.post(
    '/',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      res.json(await appointments.book(req.ctx!.tenantId, req.body));
    }),
  );

  r.post(
    '/:id/reschedule',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      res.json(await appointments.reschedule(req.ctx!.tenantId, req.params.id as string, req.body));
    }),
  );

  r.post(
    '/:id/status',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      const parsed = statusSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError('Invalid status');
      res.json(
        await appointments.setStatus(
          req.ctx!.tenantId,
          req.params.id as string,
          parsed.data.status,
        ),
      );
    }),
  );

  return r;
}
