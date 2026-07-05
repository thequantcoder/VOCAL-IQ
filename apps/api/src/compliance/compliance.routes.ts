import { Role, ValidationError } from '@vocaliq/shared';
import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import { CONFIG_WRITERS } from '../tenancy/roles';
import type { TenantService } from '../tenancy/tenant.service';
import type { ComplianceService } from './compliance.service';

const suppressBody = z.object({
  phone: z.string().min(3).max(32),
  reason: z.string().max(200).optional(),
  global: z.boolean().default(false),
});

/**
 * Compliance API (Day 60): consent capture, DNC suppression, transcript redaction, and retention
 * policy. Reads open to members; mutations to config writers. Global suppression is SUPER_ADMIN.
 * All RLS-scoped. Mounted at /compliance.
 */
export function complianceRoutes(compliance: ComplianceService, tenants: TenantService): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants));

  // ── Consent ──
  r.post(
    '/consent',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      res.status(201).json(await compliance.recordConsent(req.ctx!.tenantId, req.body));
    }),
  );
  r.get(
    '/consent/check',
    ah(async (req, res) => {
      const phone = String(req.query.phone ?? '');
      const region = String(req.query.region ?? '');
      if (!phone || !region) throw new ValidationError('phone + region are required');
      res.json({ ok: await compliance.hasConsent(req.ctx!.tenantId, phone, region) });
    }),
  );

  // ── DNC suppression ──
  r.get(
    '/dnc',
    ah(async (req, res) => res.json(await compliance.listSuppressions(req.ctx!.tenantId))),
  );
  r.post(
    '/dnc',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      const p = suppressBody.safeParse(req.body);
      if (!p.success) throw new ValidationError('phone is required');
      if (p.data.global && req.ctx!.role !== Role.SUPER_ADMIN) {
        throw new ValidationError('Only a super-admin can add a global suppression');
      }
      res.status(201).json(
        await compliance.suppress(req.ctx!.tenantId, p.data.phone, {
          global: p.data.global,
          ...(p.data.reason ? { reason: p.data.reason } : {}),
        }),
      );
    }),
  );
  r.delete(
    '/dnc/:phone',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      const global = req.query.global === 'true';
      if (global && req.ctx!.role !== Role.SUPER_ADMIN) {
        throw new ValidationError('Only a super-admin can remove a global suppression');
      }
      res.json(await compliance.unsuppress(req.ctx!.tenantId, req.params.phone as string, global));
    }),
  );

  // ── Redaction ──
  r.post(
    '/redact/:callId',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      res.json(await compliance.redactTranscript(req.ctx!.tenantId, req.params.callId as string));
    }),
  );

  // ── Retention ──
  r.get(
    '/retention',
    ah(async (req, res) => res.json(await compliance.getRetention(req.ctx!.tenantId))),
  );
  r.put(
    '/retention',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => res.json(await compliance.setRetention(req.ctx!.tenantId, req.body))),
  );
  r.post(
    '/retention/sweep',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => res.json(await compliance.sweepRetention(req.ctx!.tenantId))),
  );

  return r;
}
