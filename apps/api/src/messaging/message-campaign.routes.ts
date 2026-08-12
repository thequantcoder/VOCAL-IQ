import { ValidationError, messageCampaignSchema } from '@vocaliq/shared';
import { Router } from 'express';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import { CONFIG_WRITERS } from '../tenancy/roles';
import type { TenantService } from '../tenancy/tenant.service';
import type { MessageCampaignService } from './message-campaign.service';

/**
 * Message campaign API (GME-17). `POST /messaging/campaign` sends a template/body to a recipient list;
 * consent-gated + quiet-hours-respecting by default, every send through the `MessagingGuard`. Returns a
 * per-recipient summary (sent / skipped-with-reason / failed). Auth + tenant-scoped; config writers only.
 */
export function messageCampaignRoutes(
  campaigns: MessageCampaignService,
  tenants: TenantService,
): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants), requireRoles(...CONFIG_WRITERS));

  r.post(
    '/',
    ah(async (req, res) => {
      const parsed = messageCampaignSchema.safeParse(req.body);
      if (!parsed.success)
        throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid campaign');
      res.status(202).json(await campaigns.send(req.ctx!.tenantId, parsed.data));
    }),
  );

  return r;
}
