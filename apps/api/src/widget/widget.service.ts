import { LiveKitMedia } from '@vocaliq/provider-router';
import {
  type FormField,
  NotFoundError,
  ProviderError,
  RateLimitError,
  buildFormCollectionBrief,
  isIndianLanguage,
  isSarvamVoice,
  primaryLanguage,
} from '@vocaliq/shared';
import type { PrismaService } from '../db/prisma.service';
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
      select: { id: true, name: true, tenantId: true, languages: true, persona: true },
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
      const language = primaryLanguage(agent.languages);
      // The picked Bulbul speaker only applies to a Sarvam (Indic) call; ignore it otherwise so a
      // stale voice never leaks onto the default (ElevenLabs) stack.
      const persona = (agent.persona ?? {}) as { sarvamVoice?: unknown; systemPrompt?: unknown };
      const sarvamVoice = typeof persona.sarvamVoice === 'string' ? persona.sarvamVoice : undefined;
      const voiceId =
        isIndianLanguage(language) && isSarvamVoice(sarvamVoice) ? sarvamVoice : undefined;
      // In-call FORM node (PARITY-03, voice ASK side): when the agent's flow has a configured FORM
      // node, dispatch a composed system prompt (persona + collection brief) so the voice agent asks
      // the fields; the post-call FormExtractionService then saves them. Only sent when a form exists
      // (no behaviour change otherwise); fail-soft — a lookup hiccup never blocks the session.
      const formBrief = await this.formCollectionBrief(agent.tenantId, agent.id).catch(
        () => undefined,
      );
      const personaPrompt = typeof persona.systemPrompt === 'string' ? persona.systemPrompt : '';
      const systemPrompt = formBrief
        ? [personaPrompt, formBrief].filter(Boolean).join('\n\n')
        : undefined;
      await this.dispatcher.dispatchAgent({
        tenantId: agent.tenantId,
        callId: call.id,
        agentId: agent.id,
        room,
        // India roadmap: an Indic primary language routes the voice loop to Sarvam end-to-end.
        ...(language ? { language } : {}),
        // …and the agent's chosen Bulbul speaker drives its TTS voice.
        ...(voiceId ? { voiceId } : {}),
        ...(systemPrompt ? { systemPrompt } : {}),
      });
    } catch {
      // swallowed by design — never fail an already-valid session on a dispatch hiccup.
    }
    return { callId: call.id, room, token, serverUrl, agentName: agent.name };
  }

  /**
   * The form-collection brief for the agent's published flow, or undefined when it has no configured
   * FORM node (the common case — two cheap indexed lookups). RLS-scoped (self-audit B).
   */
  private async formCollectionBrief(
    tenantId: string,
    agentId: string,
  ): Promise<string | undefined> {
    const forms = await this.db.withTenant(tenantId, async (tx) => {
      const flow = await tx.flow.findFirst({ where: { agentId }, select: { id: true } });
      const published = flow
        ? await tx.flowVersion.findFirst({
            where: { flowId: flow.id, publishedAt: { not: null } },
            orderBy: { version: 'desc' },
            select: { graph: true },
          })
        : null;
      const nodes =
        (
          published?.graph as {
            nodes?: Array<{ type?: string; data?: { config?: { formId?: unknown } } }>;
          } | null
        )?.nodes ?? [];
      const formIds = [
        ...new Set(
          nodes
            .filter((n) => n.type === 'FORM')
            .map((n) => (typeof n.data?.config?.formId === 'string' ? n.data.config.formId : ''))
            .filter((id) => id.length > 0),
        ),
      ];
      if (formIds.length === 0) return [];
      const rows = await tx.form.findMany({
        where: { id: { in: formIds }, active: true },
        select: { name: true, fields: true },
      });
      return rows.map((r) => ({ name: r.name, fields: r.fields as FormField[] }));
    });
    return forms.length > 0 ? buildFormCollectionBrief(forms) : undefined;
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
