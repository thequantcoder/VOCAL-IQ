import { Router } from 'express';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import { CONFIG_WRITERS } from '../tenancy/roles';
import type { TenantService } from '../tenancy/tenant.service';
import type { BiometricsService } from './biometrics.service';

/**
 * Voice biometrics API (Day 91). Settings + enrollment + erase are config-writer (sensitive biometric
 * governance); verification is an operational check (any member, e.g. invoked during a call); reads
 * expose only metadata + audits, never the raw voiceprint. Mounted at /biometrics.
 */
export function biometricsRoutes(svc: BiometricsService, tenants: TenantService): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants));

  // Policy (off + deny-by-default until a config-writer enables it + allow-lists regions).
  r.get(
    '/settings',
    ah(async (req, res) => res.json(await svc.getSettings(req.ctx!.tenantId))),
  );
  r.put(
    '/settings',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => res.json(await svc.setSettings(req.ctx!.tenantId, req.body))),
  );

  // Enroll a consented voiceprint (config-writer — captures biometric PII).
  r.post(
    '/enroll',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => res.status(201).json(await svc.enroll(req.ctx!.tenantId, req.body))),
  );

  // Verify a live sample against the enrolled voiceprint (operational — any member).
  r.post(
    '/verify',
    ah(async (req, res) => res.json(await svc.verify(req.ctx!.tenantId, req.body))),
  );

  // Enrollment metadata (never the raw embedding).
  r.get(
    '/contacts/:contactId',
    ah(async (req, res) =>
      res.json(await svc.getEnrollment(req.ctx!.tenantId, req.params.contactId as string)),
    ),
  );

  // Right-to-erasure (config-writer) — delete the contact's voiceprint.
  r.delete(
    '/contacts/:contactId',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) =>
      res.json(await svc.erase(req.ctx!.tenantId, req.params.contactId as string)),
    ),
  );

  // Audit trail of every biometric action.
  r.get(
    '/audits',
    ah(async (req, res) =>
      res.json(await svc.listAudits(req.ctx!.tenantId, req.query.contactId as string | undefined)),
    ),
  );

  return r;
}
