import {
  type MessageChannel,
  type MessageStatus,
  TEXT_MESSAGE_CHANNELS,
  ValidationError,
  messageTemplateInputSchema,
} from '@vocaliq/shared';
import { type Request, type Response, Router } from 'express';
import { z } from 'zod';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import type { MessengerCallingService } from '../messenger-calling/messenger-calling.service';
import { dispatchMessengerCallingWebhook } from '../messenger-calling/messenger-calling.webhooks';
import { CONFIG_WRITERS } from '../tenancy/roles';
import type { TenantService } from '../tenancy/tenant.service';
import type { WhatsAppCallingService } from '../whatsapp-calling/whatsapp-calling.service';
import { dispatchWhatsAppCallingWebhook } from '../whatsapp-calling/whatsapp-calling.webhooks';
import type { MessagingService } from './messaging.service';
import {
  verifyMetaSignature,
  verifyRcsSignature,
  verifyTelegramSecret,
  verifyTwilioSignature,
} from './webhook-verify';

const sendSchema = z.object({
  channel: z.enum(TEXT_MESSAGE_CHANNELS),
  to: z.string().min(1).max(200),
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
export function whatsappWebhookHandler(
  messaging: MessagingService,
  whatsappCalling?: WhatsAppCallingService,
) {
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

    // WhatsApp Business Calling (WAC-02): dispatch call connect/terminate/status/permission/account
    // events on the same (HMAC-verified) WABA webhook. Best-effort — never fails the 200 to Meta.
    if (whatsappCalling) {
      await dispatchWhatsAppCallingWebhook(whatsappCalling, tenantId, payload).catch(() => {});
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
    // Messenger/Instagram deliver messages under `entry[].messaging[]` (not `changes`).
    messaging?: {
      sender?: { id?: string };
      message?: { mid?: string; text?: string };
    }[];
  }[];
}

/**
 * Telegram Bot webhook (Day 93). Verified by the `X-Telegram-Bot-Api-Secret-Token` shared secret
 * (set on `setWebhook`), constant-time. Gated: 503 when `TELEGRAM_WEBHOOK_SECRET` is unset. Inbound
 * text is recorded (+ opt-out/opt-in keywords). Tenant from the per-tenant path.
 */
export function telegramWebhookHandler(messaging: MessagingService) {
  return ah(async (req: Request, res: Response) => {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!secret) return res.status(503).json({ error: 'messaging not configured' });
    if (!verifyTelegramSecret(req.header('X-Telegram-Bot-Api-Secret-Token'), secret)) {
      return res.status(403).json({ error: 'invalid signature' });
    }
    const tenantId = req.params.tenantId as string;
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body);
    const update = JSON.parse(raw) as {
      message?: { message_id?: number; text?: string; chat?: { id?: number } };
    };
    const m = update.message;
    if (m?.chat?.id !== undefined && m.text !== undefined) {
      await messaging.recordInbound(tenantId, {
        channel: 'TELEGRAM',
        from: String(m.chat.id),
        body: m.text,
        ...(m.message_id !== undefined ? { providerMessageId: String(m.message_id) } : {}),
      });
    }
    return res.status(200).end();
  });
}

/**
 * Meta Messenger + Instagram DM webhook (Day 93). Same GET challenge + `X-Hub-Signature-256` HMAC as
 * WhatsApp (self-audit C). The channel is fixed per mounted path so inbound records to the right
 * surface. Gated: 503 when the app secret for that channel is unset. RAW body required.
 */
export function metaMessagingWebhookHandler(
  messaging: MessagingService,
  channel: Extract<MessageChannel, 'MESSENGER' | 'INSTAGRAM'>,
  messengerCalling?: MessengerCallingService,
) {
  const secretEnv = channel === 'MESSENGER' ? 'MESSENGER_APP_SECRET' : 'INSTAGRAM_APP_SECRET';
  const verifyEnv = channel === 'MESSENGER' ? 'MESSENGER_VERIFY_TOKEN' : 'INSTAGRAM_VERIFY_TOKEN';
  return ah(async (req: Request, res: Response) => {
    if (req.method === 'GET') {
      if (
        req.query['hub.mode'] === 'subscribe' &&
        req.query['hub.verify_token'] === process.env[verifyEnv]
      ) {
        return res.status(200).send(String(req.query['hub.challenge'] ?? ''));
      }
      return res.status(403).end();
    }
    const secret = process.env[secretEnv];
    if (!secret) return res.status(503).json({ error: 'messaging not configured' });
    const tenantId = req.params.tenantId as string;
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body);
    if (!verifyMetaSignature(raw, req.header('X-Hub-Signature-256'), secret)) {
      return res.status(403).json({ error: 'invalid signature' });
    }
    const payload = JSON.parse(raw) as MetaWebhook;
    for (const entry of payload.entry ?? []) {
      for (const ev of entry.messaging ?? []) {
        if (ev.sender?.id && ev.message?.text !== undefined) {
          await messaging.recordInbound(tenantId, {
            channel,
            from: ev.sender.id,
            body: ev.message.text,
            ...(ev.message.mid ? { providerMessageId: ev.message.mid } : {}),
          });
        }
      }
    }

    // Messenger (Meta) Calling (MEC-02): dispatch call connect/terminate/status/settings events on the
    // same (HMAC-verified) Messenger webhook. Best-effort — never fails the 200 to Meta.
    if (channel === 'MESSENGER' && messengerCalling) {
      await dispatchMessengerCallingWebhook(messengerCalling, tenantId, payload).catch(() => {});
    }
    return res.status(200).end();
  });
}

/**
 * RCS provider webhook (Day 93). Verified by an `sha256` HMAC of the raw body with a shared signing
 * secret (self-audit C), constant-time. Gated: 503 when `RCS_SIGNING_SECRET` is unset. RAW body
 * required. The gateway payload shape varies; we read the common `from` + `text`.
 */
export function rcsWebhookHandler(messaging: MessagingService) {
  return ah(async (req: Request, res: Response) => {
    const secret = process.env.RCS_SIGNING_SECRET;
    if (!secret) return res.status(503).json({ error: 'messaging not configured' });
    const tenantId = req.params.tenantId as string;
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body);
    if (!verifyRcsSignature(raw, req.header('X-RCS-Signature'), secret)) {
      return res.status(403).json({ error: 'invalid signature' });
    }
    const body = JSON.parse(raw) as { from?: string; sender?: string; text?: string; id?: string };
    const from = body.from ?? body.sender;
    if (from && body.text !== undefined) {
      await messaging.recordInbound(tenantId, {
        channel: 'RCS',
        from,
        body: body.text,
        ...(body.id ? { providerMessageId: body.id } : {}),
      });
    }
    return res.status(200).end();
  });
}
