import { type MessageStatus, ValidationError, messageTemplateInputSchema } from '@vocaliq/shared';
import { type Request, type Response, Router } from 'express';
import { z } from 'zod';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import { CONFIG_WRITERS } from '../tenancy/roles';
import type { TenantService } from '../tenancy/tenant.service';
import type { MessagingService } from './messaging.service';
import { verifyMetaSignature, verifyTwilioSignature } from './webhook-verify';

const sendSchema = z.object({
  channel: z.enum(['WHATSAPP', 'SMS']),
  to: z.string().min(3).max(32),
  templateId: z.string().uuid().optional(),
  body: z.string().min(1).max(1024).optional(),
  variables: z.record(z.string(), z.string()).optional(),
  contactId: z.string().uuid().optional(),
  callId: z.string().uuid().optional(),
  campaignId: z.string().uuid().optional(),
});

/** Authenticated messaging API (Day 44). Reads open to members; sends/mutations to config writers. */
export function messagingRoutes(messaging: MessagingService, tenants: TenantService): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants));

  r.get(
    '/templates',
    ah(async (req, res) => {
      res.json(await messaging.listTemplates(req.ctx!.tenantId));
    }),
  );

  r.post(
    '/templates',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      const parsed = messageTemplateInputSchema.safeParse(req.body);
      if (!parsed.success)
        throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid template');
      res.status(201).json(await messaging.createTemplate(req.ctx!.tenantId, parsed.data));
    }),
  );

  r.delete(
    '/templates/:id',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      res.json(await messaging.deleteTemplate(req.ctx!.tenantId, req.params.id as string));
    }),
  );

  r.post(
    '/send',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      const parsed = sendSchema.safeParse(req.body);
      if (!parsed.success)
        throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid send');
      const { channel, to, templateId, body, variables, contactId, callId, campaignId } =
        parsed.data;
      res.status(201).json(
        await messaging.send(req.ctx!.tenantId, {
          channel,
          to,
          ...(templateId ? { templateId } : {}),
          ...(body ? { body } : {}),
          ...(variables ? { variables } : {}),
          ...(contactId ? { contactId } : {}),
          ...(callId ? { callId } : {}),
          ...(campaignId ? { campaignId } : {}),
        }),
      );
    }),
  );

  r.get(
    '/messages',
    ah(async (req, res) => {
      const limit = Number(req.query.limit ?? 50);
      res.json(
        await messaging.listMessages(req.ctx!.tenantId, Number.isFinite(limit) ? limit : 50),
      );
    }),
  );

  return r;
}

// ── Public, signature-verified webhooks (per-tenant URL) ──────────────────────

const TWILIO_STATUS: Record<string, MessageStatus> = {
  queued: 'QUEUED',
  sent: 'SENT',
  delivered: 'DELIVERED',
  read: 'READ',
  failed: 'FAILED',
  undelivered: 'FAILED',
};

/**
 * Twilio inbound + status webhook. Verified over the full URL + form params with the
 * platform auth token (self-audit C). Gated: 503 when `TWILIO_AUTH_TOKEN` is unset. The
 * tenant is taken from the per-tenant webhook path so inbound routes to the right tenant.
 */
export function twilioWebhookHandler(messaging: MessagingService) {
  return ah(async (req: Request, res: Response) => {
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!token) return res.status(503).json({ error: 'messaging not configured' });
    const tenantId = req.params.tenantId as string;
    const params = req.body as Record<string, string>;
    const url = `${process.env.PUBLIC_API_URL ?? ''}${req.originalUrl}`;
    const signature = req.header('X-Twilio-Signature');
    if (!verifyTwilioSignature(url, params, signature, token)) {
      return res.status(403).json({ error: 'invalid signature' });
    }

    // A status callback carries MessageStatus + MessageSid; an inbound carries Body + From.
    if (params.MessageStatus && params.MessageSid) {
      const mapped = TWILIO_STATUS[params.MessageStatus.toLowerCase()];
      if (mapped) await messaging.updateStatus(tenantId, params.MessageSid, mapped);
    } else if (params.From && params.Body !== undefined) {
      await messaging.recordInbound(tenantId, {
        channel: 'SMS',
        from: params.From,
        body: params.Body,
        ...(params.MessageSid ? { providerMessageId: params.MessageSid } : {}),
      });
    }
    return res.status(204).end();
  });
}

/**
 * WhatsApp Cloud (Meta) webhook. GET verifies the subscription challenge (`hub.verify_token`);
 * POST verifies `X-Hub-Signature-256` over the RAW body (self-audit C), then records inbound
 * messages / status. Gated: 503 when `WHATSAPP_APP_SECRET` is unset. RAW body required — mount
 * with `express.raw` (see main.ts).
 */
export function whatsappWebhookHandler(messaging: MessagingService) {
  return ah(async (req: Request, res: Response) => {
    if (req.method === 'GET') {
      const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
      if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === verifyToken) {
        return res.status(200).send(String(req.query['hub.challenge'] ?? ''));
      }
      return res.status(403).end();
    }

    const secret = process.env.WHATSAPP_APP_SECRET;
    if (!secret) return res.status(503).json({ error: 'messaging not configured' });
    const tenantId = req.params.tenantId as string;
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body);
    if (!verifyMetaSignature(raw, req.header('X-Hub-Signature-256'), secret)) {
      return res.status(403).json({ error: 'invalid signature' });
    }

    const payload = JSON.parse(raw) as MetaWebhook;
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        for (const msg of change.value?.messages ?? []) {
          if (msg.from && msg.text?.body !== undefined) {
            await messaging.recordInbound(tenantId, {
              channel: 'WHATSAPP',
              from: msg.from,
              body: msg.text.body,
              ...(msg.id ? { providerMessageId: msg.id } : {}),
            });
          }
        }
        for (const st of change.value?.statuses ?? []) {
          const mapped = META_STATUS[st.status ?? ''];
          if (st.id && mapped) await messaging.updateStatus(tenantId, st.id, mapped);
        }
      }
    }
    return res.status(200).end();
  });
}

const META_STATUS: Record<string, MessageStatus> = {
  sent: 'SENT',
  delivered: 'DELIVERED',
  read: 'READ',
  failed: 'FAILED',
};

interface MetaWebhook {
  entry?: {
    changes?: {
      value?: {
        messages?: { from?: string; id?: string; text?: { body?: string } }[];
        statuses?: { id?: string; status?: string }[];
      };
    }[];
  }[];
}
