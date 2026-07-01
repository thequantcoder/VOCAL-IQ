import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { ValidationError } from '@vocaliq/shared';
import type { Request } from 'express';
import { z } from 'zod';
import { WidgetService } from './widget.service';

const sessionSchema = z.object({ agentId: z.string().uuid() });

/**
 * Public web-call widget API — UNAUTHENTICATED (embedded on any site). Safety comes from
 * agent-must-be-PUBLISHED + a per-caller rate limit (WidgetService). No tenant secret is
 * ever exposed; only a scoped, short-lived LiveKit join token.
 */
@Controller('widget')
export class WidgetController {
  constructor(private readonly widget: WidgetService) {}

  /** Public agent info (name + branding) for the widget shell. */
  @Get('config/:agentId')
  async config(@Param('agentId') agentId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(agentId)) throw new ValidationError('Invalid agent id');
    return this.widget.config(agentId);
  }

  /** Start a browser call: returns a LiveKit room + visitor join token. */
  @Post('session')
  async session(@Body() body: unknown, @Req() req: Request) {
    const parsed = sessionSchema.safeParse(body);
    if (!parsed.success) throw new ValidationError('agentId is required');
    const clientKey = clientIp(req);
    return this.widget.createSession(parsed.data.agentId, clientKey);
  }
}

/** Best-effort caller key for rate limiting (proxy header, else socket address). */
function clientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0]?.trim() ?? 'unknown';
  return req.ip ?? req.socket?.remoteAddress ?? 'unknown';
}
