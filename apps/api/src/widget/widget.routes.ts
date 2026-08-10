import { ValidationError } from '@vocaliq/shared';
import { type Request, Router } from 'express';
import { z } from 'zod';
import { ah } from '../http/async-handler';
import type { WidgetService } from './widget.service';

const sessionSchema = z.object({ agentId: z.string().uuid() });

/**
 * Public web-call widget API — UNAUTHENTICATED (embedded on any site). Safety = the agent
 * must be PUBLISHED + a per-caller rate limit (WidgetService). No auth/tenant middleware.
 */
export function widgetRoutes(widget: WidgetService): Router {
  const r = Router();

  r.get(
    '/config/:agentId',
    ah(async (req, res) => {
      const agentId = req.params.agentId as string;
      if (!/^[0-9a-f-]{36}$/i.test(agentId)) throw new ValidationError('Invalid agent id');
      res.json(await widget.config(agentId));
    }),
  );

  r.post(
    '/session',
    ah(async (req, res) => {
      const parsed = sessionSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError('agentId is required');
      res.json(await widget.createSession(parsed.data.agentId, clientIp(req)));
    }),
  );

  return r;
}

/** Best-effort caller key for rate limiting (proxy header, else socket address). */
function clientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0]?.trim() ?? 'unknown';
  return req.ip ?? req.socket?.remoteAddress ?? 'unknown';
}
