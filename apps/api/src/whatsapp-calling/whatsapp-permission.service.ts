import { whatsappDestinationCountry } from '@vocaliq/provider-router';
import {
  type CanCallDecision,
  type CanRequestDecision,
  ProviderError,
  ValidationError,
  type WaPermissionState,
  canPlaceWhatsappCall,
  canSendWhatsappPermissionRequest,
  isWhatsappPermissionActive,
  normalizeWaNumber,
  whatsappTemporaryExpiry,
} from '@vocaliq/shared';
import type { PrismaService } from '../db/prisma.service';
import type { WaAdapterResolver } from './whatsapp-calling.service';

/**
 * WhatsApp outbound permission engine (WAC-08) — the governor that keeps us compliant BEFORE we dial.
 * Persists the per-pair permission (lazily expiring temporary grants — Meta sends no expiry webhook),
 * enforces the send caps from our own request-audit, tracks the consecutive-unanswered back-off, and
 * answers the pre-dial `canCall` gate. All tenant-scoped (`withTenant` → RLS). Pure rules live in
 * `@vocaliq/shared` ([[whatsapp-permission]]); this is the I/O + persistence around them.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const CONNECTED = ['accepted', 'completed'];

export interface WaPermissionView {
  waId: string;
  status: WaPermissionState;
  expiresAt: Date | null;
  source: string;
  consecutiveUnanswered: number;
  updatedAt: Date | null;
}

export interface WaCanCallResult extends CanCallDecision {
  permission: WaPermissionView;
  connectedLast24h: number;
}

export interface WaPermissionInspect {
  permission: WaPermissionView;
  canCall: WaCanCallResult;
  requestCaps: { sentLast24h: number; sentLast7d: number; canRequest: CanRequestDecision };
}

export interface WaPermissionReply {
  response: 'accept' | 'reject';
  isPermanent?: boolean;
  expirationTimestamp?: number; // epoch seconds (Meta)
  source?: 'request' | 'callback' | 'profile';
}

/** The subset the calling-service control plane depends on — injectable so its tests stay offline. */
export interface WaPermissionGate {
  canCall(
    tenantId: string,
    input: { waId: string; businessE164?: string; contactId?: string },
  ): Promise<WaCanCallResult>;
  recordPermissionReply(tenantId: string, waId: string, reply: WaPermissionReply): Promise<void>;
  recordCallOutcome(tenantId: string, waId: string, answered: boolean): Promise<void>;
}

const NO_PERMISSION_VIEW = (waId: string): WaPermissionView => ({
  waId,
  status: 'no_permission',
  expiresAt: null,
  source: 'request',
  consecutiveUnanswered: 0,
  updatedAt: null,
});

export class WhatsAppPermissionService implements WaPermissionGate {
  constructor(
    private readonly db: PrismaService,
    private readonly adapterFor: WaAdapterResolver,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Read the permission, lazily flipping an expired temporary grant to `no_permission` (no webhook). */
  async getPermission(tenantId: string, rawWaId: string): Promise<WaPermissionView> {
    const waId = normalizeWaNumber(rawWaId);
    return this.db.withTenant(tenantId, async (tx) => {
      const row = await tx.whatsAppCallPermission.findUnique({
        where: { tenantId_waId: { tenantId, waId } },
      });
      if (!row) return NO_PERMISSION_VIEW(waId);

      const state = row.status as WaPermissionState;
      if (
        state === 'temporary' &&
        !isWhatsappPermissionActive(state, row.expiresAt?.getTime() ?? null, this.now())
      ) {
        // Temporary permission has lapsed — persist the flip so reads + gates agree.
        const updated = await tx.whatsAppCallPermission.update({
          where: { tenantId_waId: { tenantId, waId } },
          data: { status: 'no_permission', expiresAt: null },
        });
        return this.toView(updated);
      }
      return this.toView(row);
    });
  }

  /** Send a permission-request message (interactive or template), enforcing the 1/24h + 2/7d caps. */
  async requestPermission(
    tenantId: string,
    input: {
      waId: string;
      contactId?: string;
      text?: string;
      templateName?: string;
      languageCode?: string;
    },
  ): Promise<WaPermissionView> {
    const waId = normalizeWaNumber(input.waId);
    if (!waId) throw new ValidationError('A WhatsApp number is required.');

    const { sentLast24h, sentLast7d } = await this.requestCounts(tenantId, waId);
    const decision = canSendWhatsappPermissionRequest({ sentLast24h, sentLast7d });
    if (!decision.allowed) {
      throw new ValidationError(
        decision.reason === 'daily_request_cap'
          ? 'Only one permission request per 24 hours is allowed.'
          : 'At most two permission requests per 7 days are allowed.',
      );
    }

    const adapter = await this.adapterFor(tenantId).catch(() => null);
    if (!adapter) throw new ProviderError('WhatsApp calling is not configured for this tenant.');
    await adapter.sendCallPermissionRequest({
      to: waId,
      ...(input.text ? { text: input.text } : {}),
      ...(input.templateName ? { templateName: input.templateName } : {}),
      ...(input.languageCode ? { languageCode: input.languageCode } : {}),
    });

    return this.db.withTenant(tenantId, async (tx) => {
      await tx.whatsAppPermissionRequest.create({ data: { tenantId, waId } });
      const row = await tx.whatsAppCallPermission.upsert({
        where: { tenantId_waId: { tenantId, waId } },
        create: {
          tenantId,
          waId,
          source: 'request',
          ...(input.contactId ? { contactId: input.contactId } : {}),
        },
        update: { source: 'request', ...(input.contactId ? { contactId: input.contactId } : {}) },
      });
      return this.toView(row);
    });
  }

  /** Persist a user's permission reply (accept/reject) from the `call_permission_reply` webhook. */
  async recordPermissionReply(
    tenantId: string,
    rawWaId: string,
    reply: WaPermissionReply,
  ): Promise<void> {
    const waId = normalizeWaNumber(rawWaId);
    if (!waId) return;
    const accepted = reply.response === 'accept';
    const status: WaPermissionState = accepted
      ? reply.isPermanent
        ? 'permanent'
        : 'temporary'
      : 'no_permission';
    const expiresAt =
      accepted && !reply.isPermanent
        ? new Date(whatsappTemporaryExpiry(reply.expirationTimestamp, this.now()))
        : null;

    const data = {
      status,
      expiresAt,
      source: reply.source ?? 'request',
      ...(accepted ? { consecutiveUnanswered: 0 } : {}),
    };
    await this.db.withTenant(tenantId, (tx) =>
      tx.whatsAppCallPermission.upsert({
        where: { tenantId_waId: { tenantId, waId } },
        create: { tenantId, waId, ...data },
        update: data,
      }),
    );
  }

  /**
   * Record a call outcome for the auto-revoke back-off: an answer resets the counter; an unanswered
   * call increments it, and the 4th consecutive unanswered mirrors Meta's auto-revoke locally.
   */
  async recordCallOutcome(tenantId: string, rawWaId: string, answered: boolean): Promise<void> {
    const waId = normalizeWaNumber(rawWaId);
    if (!waId) return;
    await this.db.withTenant(tenantId, async (tx) => {
      const row = await tx.whatsAppCallPermission.findUnique({
        where: { tenantId_waId: { tenantId, waId } },
      });
      if (!row) return;
      if (answered) {
        if (row.consecutiveUnanswered === 0) return;
        await tx.whatsAppCallPermission.update({
          where: { tenantId_waId: { tenantId, waId } },
          data: { consecutiveUnanswered: 0 },
        });
        return;
      }
      const next = row.consecutiveUnanswered + 1;
      await tx.whatsAppCallPermission.update({
        where: { tenantId_waId: { tenantId, waId } },
        data: {
          consecutiveUnanswered: next,
          // 4 consecutive unanswered → Meta auto-revokes; reflect it so we stop dialing.
          ...(next >= 4 ? { status: 'no_permission', expiresAt: null } : {}),
        },
      });
    });
  }

  /** The pre-dial gate — resolves live state (permission, cap, unanswered, country, DNC) → decision. */
  async canCall(
    tenantId: string,
    input: { waId: string; businessE164?: string; contactId?: string },
  ): Promise<WaCanCallResult> {
    const waId = normalizeWaNumber(input.waId);
    const permission = await this.getPermission(tenantId, waId);

    const connectedLast24h = await this.db.withTenant(tenantId, (tx) =>
      tx.whatsAppCall.count({
        where: {
          direction: 'BUSINESS_INITIATED',
          toNumber: waId,
          status: { in: CONNECTED },
          createdAt: { gte: new Date(this.now().getTime() - DAY_MS) },
        },
      }),
    );

    const dnc = await this.resolveDnc(tenantId, waId, input.contactId);
    const businessCountry = input.businessE164
      ? whatsappDestinationCountry(input.businessE164)
      : undefined;

    const decision = canPlaceWhatsappCall(
      {
        state: permission.status,
        expiresAtMs: permission.expiresAt?.getTime() ?? null,
        connectedLast24h,
        consecutiveUnanswered: permission.consecutiveUnanswered,
        ...(businessCountry ? { businessCountry } : {}),
        dnc,
      },
      this.now(),
    );
    return { ...decision, permission, connectedLast24h };
  }

  /** The inspector view: current permission + the pre-dial decision + remaining request caps. */
  async inspect(
    tenantId: string,
    input: { waId: string; businessE164?: string; contactId?: string },
  ): Promise<WaPermissionInspect> {
    const waId = normalizeWaNumber(input.waId);
    const [canCall, counts] = await Promise.all([
      this.canCall(tenantId, input),
      this.requestCounts(tenantId, waId),
    ]);
    return {
      permission: canCall.permission,
      canCall,
      requestCaps: {
        sentLast24h: counts.sentLast24h,
        sentLast7d: counts.sentLast7d,
        canRequest: canSendWhatsappPermissionRequest(counts),
      },
    };
  }

  private async requestCounts(
    tenantId: string,
    waId: string,
  ): Promise<{ sentLast24h: number; sentLast7d: number }> {
    const now = this.now().getTime();
    return this.db.withTenant(tenantId, async (tx) => {
      const [sentLast24h, sentLast7d] = await Promise.all([
        tx.whatsAppPermissionRequest.count({
          where: { waId, createdAt: { gte: new Date(now - DAY_MS) } },
        }),
        tx.whatsAppPermissionRequest.count({
          where: { waId, createdAt: { gte: new Date(now - WEEK_MS) } },
        }),
      ]);
      return { sentLast24h, sentLast7d };
    });
  }

  private async resolveDnc(tenantId: string, waId: string, contactId?: string): Promise<boolean> {
    return this.db.withTenant(tenantId, async (tx) => {
      const contact = contactId
        ? await tx.contact.findFirst({ where: { id: contactId }, select: { dnc: true } })
        : await tx.contact.findFirst({ where: { phone: waId }, select: { dnc: true } });
      return contact?.dnc ?? false;
    });
  }

  private toView(row: {
    waId: string;
    status: string;
    expiresAt: Date | null;
    source: string;
    consecutiveUnanswered: number;
    updatedAt: Date;
  }): WaPermissionView {
    return {
      waId: row.waId,
      status: row.status as WaPermissionState,
      expiresAt: row.expiresAt,
      source: row.source,
      consecutiveUnanswered: row.consecutiveUnanswered,
      updatedAt: row.updatedAt,
    };
  }
}
