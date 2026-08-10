import { ValidationError, setMessagingConsentSchema } from '@vocaliq/shared';
import { Router } from 'express';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import { CONFIG_WRITERS } from '../tenancy/roles';
import type { TenantService } from '../tenancy/tenant.service';
import type { MessagingConsentService } from './messaging-consent.service';

/**
 * Messaging consent API (GME-14). A tenant sets/revokes a contact's lawful basis to be SMS/WhatsApp/
 * RCS-messaged; the unified send-gate (GME-15) reads it. Authenticated + tenant-scoped (RLS); writes
 * are limited to config managers. Mounted at /messaging/consent.
 */
export function messagingConsentRoutes(
  consent: MessagingConsentService,
  tenants: TenantService,
): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants));

  r.get(
    '/:phone',
    ah(async (req, res) => {
      res.json(await consent.getConsent(req.ctx!.tenantId, req.params.phone as string));
    }),
  );

  r.post(
    '/',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      const parsed = setMessagingConsentSchema.safeParse(req.body);
      if (!parsed.success)
        throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid consent');
      res.status(201).json(await consent.setConsent(req.ctx!.tenantId, parsed.data));
    }),
  );

  return r;
}
