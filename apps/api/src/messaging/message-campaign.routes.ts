import {
  NotFoundError,
  ValidationError,
  messageBulkCampaignSchema,
  messageCampaignSchema,
} from '@vocaliq/shared';
import { Router } from 'express';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import { CONFIG_WRITERS } from '../tenancy/roles';
import type { TenantService } from '../tenancy/tenant.service';
import type { MessageBulkService } from './message-bulk.service';
import type { MessageCampaignService } from './message-campaign.service';

/**
 * Message campaign API. `POST /messaging/campaign` (GME-17) sends synchronously to a small list (≤500),
 * consent-gated + quiet-hours-respecting by default, every send through the `MessagingGuard`. `POST
 * /messaging/campaign/bulk` (GME-DQ-b) enqueues a DURABLE bulk job (≤50k recipients) drained async by
 * the bulk-send worker; `GET /messaging/campaign/bulk/:id` reports progress. Auth + tenant-scoped;
 * config writers only.
 */
export function messageCampaignRoutes(
  campaigns: MessageCampaignService,
  bulk: MessageBulkService,
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

  r.post(
    '/bulk',
    ah(async (req, res) => {
      const parsed = messageBulkCampaignSchema.safeParse(req.body);
      if (!parsed.success)
        throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid bulk campaign');
      res.status(202).json(await bulk.enqueue(req.ctx!.tenantId, parsed.data));
    }),
  );

  r.get(
    '/bulk/:id',
    ah(async (req, res) => {
      const status = await bulk.status(req.ctx!.tenantId, req.params.id as string);
      if (!status) throw new NotFoundError('Bulk job not found');
      res.json(status);
    }),
  );

  return r;
}
