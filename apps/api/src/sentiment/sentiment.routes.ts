import { ValidationError } from '@vocaliq/shared';
import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import { CONFIG_WRITERS } from '../tenancy/roles';
import type { TenantService } from '../tenancy/tenant.service';
import type { SentimentService } from './sentiment.service';

const signalSchema = z.object({
  sentimentScore: z.number().min(-1).max(1),
  anger: z.number().min(0).max(1),
  frustration: z.number().min(0).max(1),
  buyingIntent: z.number().min(0).max(1),
});
const processBody = z.object({
  callId: z.string().uuid(),
  agentId: z.string().uuid().optional(),
  signal: signalSchema,
});

/**
 * Sentiment-triggered actions API (Day 73). Rule config is config-writer; `process` is called by
 * the voice loop each turn with the live signal and returns the actions to apply. Events feed the
 * supervisor alert view. Mounted at /sentiment.
 */
export function sentimentRoutes(sentiment: SentimentService, tenants: TenantService): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants));

  r.get(
    '/rules',
    ah(async (req, res) =>
      res.json(
        await sentiment.listRules(req.ctx!.tenantId, req.query.agentId as string | undefined),
      ),
    ),
  );
  r.post(
    '/rules',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      const { agentId, ...rule } = req.body ?? {};
      res.status(201).json(await sentiment.createRule(req.ctx!.tenantId, rule, agentId));
    }),
  );
  r.delete(
    '/rules/:id',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) =>
      res.json(await sentiment.deleteRule(req.ctx!.tenantId, req.params.id as string)),
    ),
  );

  r.post(
    '/process',
    ah(async (req, res) => {
      const p = processBody.safeParse(req.body);
      if (!p.success) throw new ValidationError('callId + signal required');
      res.json(
        await sentiment.process(
          req.ctx!.tenantId,
          p.data.callId,
          p.data.agentId ?? null,
          p.data.signal,
        ),
      );
    }),
  );

  r.get(
    '/events',
    ah(async (req, res) =>
      res.json(
        await sentiment.recentEvents(req.ctx!.tenantId, req.query.callId as string | undefined),
      ),
    ),
  );

  return r;
}
