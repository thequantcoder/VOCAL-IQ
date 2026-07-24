import { LiveKitMedia } from '@vocaliq/provider-router';
import { NotFoundError, ProviderError, RateLimitError } from '@vocaliq/shared';
import { PrismaService } from '../db/prisma.service';
import { RateLimiter } from './rate-limiter';
import { PendingVoiceDispatcher, type VoiceDispatcher } from './voice-dispatcher';

/**
 * Public web-call widget backend (Day 16). Visitors talk to a PUBLISHED agent over
 * WebRTC with no phone number: this mints a tenant-scoped LiveKit join token, opens a
 * WEB Call, and is rate-limited (self-audit focus C — the route is unauthenticated, so
 * agent-must-be-published + per-caller rate limit are the guardrails). The room + token
 * feed the same Day-9 loop; the voice worker joins to converse (dispatch seam below).
 */

export interface WidgetSession {
  callId: string;
  room: string;
  token: string;
  serverUrl: string;
  agentName: string;
}

export interface WidgetConfig {
  agentId: string;
  name: string;
  branding: unknown;
}

/** Mints a visitor join token for a room; injectable so tests don't need LiveKit. */
export type TokenMinter = (
  room: string,
  identity: string,
) => Promise<{ token: string; serverUrl: string }>;

const envMinter: TokenMinter = async (room, identity) => {
  const url = process.env.LIVEKIT_URL;
  const key = process.env.LIVEKIT_API_KEY;
  const secret = process.env.LIVEKIT_API_SECRET;
  if (!url || !key || !secret) throw new ProviderError('Voice service is not configured.');
  const media = new LiveKitMedia(url, key, secret);
  return { token: await media.token(room, identity), serverUrl: media.serverUrl };
};

export class WidgetService {
  private readonly limiter: RateLimiter;
  private readonly mint: TokenMinter;
  private readonly dispatcher: VoiceDispatcher;

  constructor(
    private readonly db: PrismaService,
    limiter?: RateLimiter,
    minter?: TokenMinter,
    dispatcher?: VoiceDispatcher,
  ) {
    // ≤5 new sessions per caller (ip+agent) per minute.
    this.limiter = limiter ?? new RateLimiter(5, 60_000);
    this.mint = minter ?? envMinter;
    // Pending by default: records intent + no-ops until the voice deploy is wired (HttpVoiceDispatcher).
    this.dispatcher = dispatcher ?? new PendingVoiceDispatcher();
  }

  /** Open a widget session: rate-limit → resolve a published agent → WEB Call + token. */
  async createSession(agentId: string, clientKey: string): Promise<WidgetSession> {
    if (!this.limiter.hit(`${clientKey}:${agentId}`)) {
      throw new RateLimitError('Too many calls from here — please wait a moment.');
    }
    const agent = await this.db.admin.agent.findFirst({
      where: { id: agentId, status: 'PUBLISHED' },
      select: { id: true, name: true, tenantId: true },
    });
    if (!agent) throw new NotFoundError('This agent is not available.');

    const call = await this.db.withTenant(agent.tenantId, (tx) =>
      tx.call.create({
        data: {
          tenantId: agent.tenantId,
          agentId: agent.id,
          direction: 'INBOUND',
          channel: 'WEB',
          status: 'QUEUED',
        },
        select: { id: true },
      }),
    );

    const room = `web-${call.id}`;
    const { token, serverUrl } = await this.mint(room, `visitor-${call.id}`);
    // Put the AI agent into the visitor's room. Fail-soft at the boundary: the session (room +
    // token) is already committed, so a pending/unreachable/buggy dispatcher must never roll it
    // back — the browser still connects; the agent joins once the voice deploy is wired
    // (HttpVoiceDispatcher, config-swap to live).
    try {
      await this.dispatcher.dispatchAgent({
        tenantId: agent.tenantId,
        callId: call.id,
        agentId: agent.id,
        room,
      });
    } catch {
      // swallowed by design — never fail an already-valid session on a dispatch hiccup.
    }
    return { callId: call.id, room, token, serverUrl, agentName: agent.name };
  }

  /** Public agent info for the widget shell (name + tenant branding for theming). */
  async config(agentId: string): Promise<WidgetConfig> {
    const agent = await this.db.admin.agent.findFirst({
      where: { id: agentId, status: 'PUBLISHED' },
      select: { id: true, name: true, tenant: { select: { branding: true } } },
    });
    if (!agent) throw new NotFoundError('This agent is not available.');
    return { agentId: agent.id, name: agent.name, branding: agent.tenant.branding };
  }
}
