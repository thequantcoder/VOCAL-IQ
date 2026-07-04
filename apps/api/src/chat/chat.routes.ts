import { type ChatState, ValidationError } from '@vocaliq/shared';
import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import type { TenantService } from '../tenancy/tenant.service';
import type { ChatService } from './chat.service';

const startSchema = z.object({
  channel: z.enum(['VOICE', 'CHAT', 'WHATSAPP', 'SMS']).default('CHAT'),
  context: z.record(z.string(), z.string()).optional(),
});

const turnSchema = z.object({
  message: z.string().min(1).max(2000),
  intent: z.string().max(60).optional(),
  // The client round-trips the runtime state (stateless server).
  state: z.object({
    channel: z.enum(['VOICE', 'CHAT', 'WHATSAPP', 'SMS']),
    activeNode: z.string(),
    captured: z.record(z.string(), z.string()),
    lastIntent: z.string().optional(),
    turns: z.number().int().min(0),
    awaitingInput: z.boolean(),
    done: z.boolean(),
    outcome: z.string().optional(),
  }),
});

/**
 * Multimodal chat API (Day 45). Mounted at /agents/:agentId/chat (agentId from the path).
 * Open to any tenant member; RLS-scoped. Stateless: `/start` returns a `ChatState` the client
 * passes back to `/turn` each message — the same runtime that drives voice + messaging.
 */
export function chatRoutes(chat: ChatService, tenants: TenantService): Router {
  const r = Router({ mergeParams: true });
  r.use(authMiddleware, tenantMiddleware(tenants));

  r.post(
    '/start',
    ah(async (req, res) => {
      const parsed = startSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError('Invalid chat start');
      res.json(
        await chat.start(
          req.ctx!.tenantId,
          req.params.agentId as string,
          parsed.data.channel,
          parsed.data.context,
        ),
      );
    }),
  );

  r.post(
    '/turn',
    ah(async (req, res) => {
      const parsed = turnSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError('Invalid chat turn');
      const { message, intent, state } = parsed.data;
      res.json(
        await chat.turn(
          req.ctx!.tenantId,
          req.params.agentId as string,
          state as ChatState,
          message,
          intent,
        ),
      );
    }),
  );

  return r;
}
