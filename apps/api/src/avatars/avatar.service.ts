import {
  type AvatarMode,
  type ModeDecision,
  NotFoundError,
  ValidationError,
  avatarInputSchema,
  clampSeconds,
  decideMode,
  estimateVideoCost,
  requiresLikenessConsent,
  startAvatarSessionSchema,
} from '@vocaliq/shared';
import type { PrismaService } from '../db/prisma.service';

/**
 * Digital-human / video-avatar agents (Day 92). A tenant curates an avatar catalogue and starts video
 * sessions where a photoreal/animated avatar speaks the agent's responses. Video is EXPENSIVE + likeness
 * is sensitive, so the guarantees live here:
 *  - D (cost): a video session is metered per second (`seconds × ratePerSec`) and attributed to the
 *    tenant on the session; seconds are capped so cost can never run away.
 *  - Plan-gating + graceful fallback (D/F): video runs only when the plan entitles it, a provider is
 *    ready, and an avatar is selected — otherwise the session AUTO-FALLS BACK to voice-only (never an
 *    error). The pure `decideMode` is the single source of that truth.
 *  - C (likeness consent): a `custom` (real-likeness) avatar can only be created WITH explicit consent
 *    (`likenessConsentAt` is stamped); a non-consented custom avatar is refused.
 *  - B (isolation): every read/write is `db.withTenant`-scoped.
 * The avatar/video provider is injected — an `unavailable` provider by default (so video gracefully
 * falls back to voice), and a real vendor swaps in when `AVATAR_PROVIDER_API_KEY` is set (gated).
 */

/** The real-time avatar/video provider. `ready()` gates whether video can run at all. */
export interface AvatarProvider {
  ready(): boolean;
  startSession(input: {
    tenantId: string;
    providerAvatarId: string;
  }): Promise<{ providerRef: string }>;
  endSession(input: { tenantId: string; providerRef: string }): Promise<void>;
}

/** Default provider when no vendor is configured: video is unavailable → sessions fall back to voice. */
export function unavailableAvatarProvider(): AvatarProvider {
  return {
    ready: () => false,
    async startSession() {
      throw new ValidationError('No avatar provider is configured.');
    },
    async endSession() {},
  };
}

/** A deterministic mock provider for self-host/tests — reports ready + returns a stable session ref. */
export function mockAvatarProvider(): AvatarProvider {
  return {
    ready: () => true,
    async startSession({ providerAvatarId }) {
      return { providerRef: `mock:${providerAvatarId}` };
    },
    async endSession() {},
  };
}

/** Resolves whether the tenant's plan entitles video avatars (wired to EntitlementsService in composition). */
export type VideoEntitlement = (tenantId: string) => Promise<boolean>;

export interface AvatarView {
  id: string;
  name: string;
  provider: string;
  providerAvatarId: string;
  kind: string;
  likenessConsentAt: Date | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AvatarSessionView {
  id: string;
  agentId: string | null;
  avatarId: string | null;
  mode: string;
  fallback: boolean;
  fallbackReason: string | null;
  status: string;
  seconds: number;
  costUsd: number;
  providerRef: string | null;
  createdAt: Date;
  endedAt: Date | null;
}

const AVATAR_SELECT = {
  id: true,
  name: true,
  provider: true,
  providerAvatarId: true,
  kind: true,
  likenessConsentAt: true,
  active: true,
  createdAt: true,
  updatedAt: true,
} as const;

const SESSION_SELECT = {
  id: true,
  agentId: true,
  avatarId: true,
  mode: true,
  fallback: true,
  fallbackReason: true,
  status: true,
  seconds: true,
  costUsd: true,
  providerRef: true,
  createdAt: true,
  endedAt: true,
} as const;

export class AvatarService {
  constructor(
    private readonly db: PrismaService,
    private readonly videoEntitlement: VideoEntitlement,
    private readonly provider: AvatarProvider,
  ) {}

  // ── catalogue ─────────────────────────────────────────────────────────────────

  async listAvatars(tenantId: string, activeOnly = false): Promise<AvatarView[]> {
    return this.db.withTenant(tenantId, (tx) =>
      tx.avatar.findMany({
        where: activeOnly ? { active: true } : {},
        orderBy: { createdAt: 'desc' },
        take: 200,
        select: AVATAR_SELECT,
      }),
    );
  }

  /** Create an avatar. A `custom` (real-likeness) avatar REQUIRES explicit consent (self-audit C). */
  async createAvatar(tenantId: string, input: unknown): Promise<AvatarView> {
    const parsed = avatarInputSchema.safeParse(input);
    if (!parsed.success)
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid avatar');
    const { name, provider, providerAvatarId, kind, likenessConsent, active } = parsed.data;
    if (requiresLikenessConsent(kind) && !likenessConsent)
      throw new ValidationError('A custom avatar requires explicit likeness consent.');
    return this.db.withTenant(tenantId, (tx) =>
      tx.avatar.create({
        data: {
          tenantId,
          name,
          provider,
          providerAvatarId,
          kind,
          active,
          likenessConsentAt: requiresLikenessConsent(kind) ? new Date() : null,
        },
        select: AVATAR_SELECT,
      }),
    );
  }

  async updateAvatar(tenantId: string, id: string, input: unknown): Promise<AvatarView | null> {
    const parsed = avatarInputSchema.partial().safeParse(input);
    if (!parsed.success)
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid avatar');
    const d = parsed.data;
    const res = await this.db.withTenant(tenantId, (tx) =>
      tx.avatar.updateMany({
        where: { id },
        data: {
          ...(d.name !== undefined ? { name: d.name } : {}),
          ...(d.provider !== undefined ? { provider: d.provider } : {}),
          ...(d.providerAvatarId !== undefined ? { providerAvatarId: d.providerAvatarId } : {}),
          ...(d.active !== undefined ? { active: d.active } : {}),
        },
      }),
    );
    if (res.count === 0) throw new NotFoundError('Avatar not found');
    return this.db.withTenant(tenantId, (tx) =>
      tx.avatar.findFirst({ where: { id }, select: AVATAR_SELECT }),
    );
  }

  async deleteAvatar(tenantId: string, id: string): Promise<{ id: string }> {
    const res = await this.db.withTenant(tenantId, (tx) => tx.avatar.deleteMany({ where: { id } }));
    if (res.count === 0) throw new NotFoundError('Avatar not found');
    return { id };
  }

  // ── per-agent default avatar (tenant.settings.avatarBindings) ────────────────────

  async setAgentAvatar(
    tenantId: string,
    agentId: string,
    avatarId: string | null,
  ): Promise<{ agentId: string; avatarId: string | null }> {
    const t = await this.db.withTenant(tenantId, (tx) =>
      tx.tenant.findFirst({ where: { id: tenantId }, select: { settings: true } }),
    );
    const settings = (t?.settings as Record<string, unknown>) ?? {};
    const bindings = { ...((settings.avatarBindings as Record<string, string>) ?? {}) };
    if (avatarId) bindings[agentId] = avatarId;
    else delete bindings[agentId];
    await this.db.withTenant(tenantId, (tx) =>
      tx.tenant.update({
        where: { id: tenantId },
        data: { settings: { ...settings, avatarBindings: bindings } as object },
      }),
    );
    return { agentId, avatarId };
  }

  private async agentAvatarId(tenantId: string, agentId: string): Promise<string | undefined> {
    const t = await this.db.withTenant(tenantId, (tx) =>
      tx.tenant.findFirst({ where: { id: tenantId }, select: { settings: true } }),
    );
    const bindings = ((t?.settings as { avatarBindings?: Record<string, string> } | null)
      ?.avatarBindings ?? {}) as Record<string, string>;
    return bindings[agentId];
  }

  // ── sessions (plan-gated video, graceful voice fallback, metered) ────────────────

  /** Start a session — video if entitled/available, else auto-fallback to voice-only (never an error). */
  async startSession(
    tenantId: string,
    input: unknown,
  ): Promise<AvatarSessionView & { decision: ModeDecision }> {
    const parsed = startAvatarSessionSchema.safeParse(input ?? {});
    if (!parsed.success)
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid session');
    const { agentId, requestVideo } = parsed.data;

    // Resolve the avatar: explicit → else the agent's bound default.
    const avatarId =
      parsed.data.avatarId ?? (agentId ? await this.agentAvatarId(tenantId, agentId) : undefined);
    const avatar = avatarId
      ? await this.db.withTenant(tenantId, (tx) =>
          tx.avatar.findFirst({
            where: { id: avatarId },
            select: { id: true, providerAvatarId: true, active: true },
          }),
        )
      : null;
    const avatarSelected = Boolean(avatar?.active);

    const planAllowsVideo = await this.videoEntitlement(tenantId);
    const decision = decideMode({
      requestVideo,
      planAllowsVideo,
      providerReady: this.provider.ready(),
      avatarSelected,
    });

    let providerRef: string | null = null;
    if (decision.mode === 'video' && avatar) {
      const started = await this.provider.startSession({
        tenantId,
        providerAvatarId: avatar.providerAvatarId,
      });
      providerRef = started.providerRef;
    }

    const view = await this.db.withTenant(tenantId, (tx) =>
      tx.avatarSession.create({
        data: {
          tenantId,
          ...(agentId ? { agentId } : {}),
          ...(decision.mode === 'video' && avatarId ? { avatarId } : {}),
          mode: decision.mode,
          fallback: decision.fallback,
          ...(decision.reason ? { fallbackReason: decision.reason } : {}),
          status: 'active',
          ...(providerRef ? { providerRef } : {}),
        },
        select: SESSION_SELECT,
      }),
    );
    return { ...view, decision };
  }

  /** Append billable seconds to an active session (capped so cost can never run away — self-audit D). */
  async addSeconds(
    tenantId: string,
    sessionId: string,
    seconds: number,
  ): Promise<AvatarSessionView> {
    const session = await this.db.withTenant(tenantId, (tx) =>
      tx.avatarSession.findFirst({
        where: { id: sessionId },
        select: { id: true, status: true, seconds: true },
      }),
    );
    if (!session) throw new NotFoundError('Avatar session not found');
    if (session.status !== 'active') throw new ValidationError('Session has ended');
    const next = clampSeconds(session.seconds, seconds);
    return this.db.withTenant(tenantId, (tx) =>
      tx.avatarSession.update({
        where: { id: sessionId },
        data: { seconds: next },
        select: SESSION_SELECT,
      }),
    );
  }

  /** End a session and meter the video cost (voice fallback → $0). Attributed to the tenant (rule #4). */
  async endSession(tenantId: string, sessionId: string): Promise<AvatarSessionView> {
    const session = await this.db.withTenant(tenantId, (tx) =>
      tx.avatarSession.findFirst({
        where: { id: sessionId },
        select: { id: true, mode: true, seconds: true, providerRef: true },
      }),
    );
    if (!session) throw new NotFoundError('Avatar session not found');
    if (session.mode === 'video' && session.providerRef) {
      await this.provider.endSession({ tenantId, providerRef: session.providerRef });
    }
    const costUsd = estimateVideoCost(session.mode as AvatarMode, session.seconds);
    return this.db.withTenant(tenantId, (tx) =>
      tx.avatarSession.update({
        where: { id: sessionId },
        data: { status: 'ended', endedAt: new Date(), costUsd },
        select: SESSION_SELECT,
      }),
    );
  }

  async listSessions(tenantId: string): Promise<AvatarSessionView[]> {
    return this.db.withTenant(tenantId, (tx) =>
      tx.avatarSession.findMany({
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: SESSION_SELECT,
      }),
    );
  }

  async getSession(tenantId: string, sessionId: string): Promise<AvatarSessionView> {
    const s = await this.db.withTenant(tenantId, (tx) =>
      tx.avatarSession.findFirst({ where: { id: sessionId }, select: SESSION_SELECT }),
    );
    if (!s) throw new NotFoundError('Avatar session not found');
    return s;
  }
}
