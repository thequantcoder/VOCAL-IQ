import type { MeCallPermission } from '@vocaliq/provider-router';
import {
  MESSENGER_CALL_ACTION,
  type MeCallActionLimit,
  type MeCanCallDecision,
  type MessengerPermissionStatus,
  canPlaceMessengerCall,
} from '@vocaliq/shared';
import type { PrismaService } from '../db/prisma.service';
import type { MeAdapterResolver } from './messenger-calling.service';

/**
 * Messenger (Meta) Calling — the OUTBOUND permission governor (MEC-08): the I/O + persistence around the
 * pure rules in `@vocaliq/shared` ([[messenger-permission]]). The WhatsApp `WhatsAppPermissionService`
 * sibling, but simpler because Meta gives Messenger a LIVE Call-Permissions API:
 *
 *   • Permission status + the rate limits are read **live** from Meta (`adapter.getCallPermission`), so we
 *     don't persist a permission grant or reconstruct it from webhook replies (that's the WhatsApp model).
 *     Gated (no adapter) or a Graph error → a `no_permission` view = **fail-closed** (never dial without a
 *     positive live grant).
 *   • The consecutive-unanswered back-off is **derived from `MessengerCall` history** (the terminate path
 *     already records each call's duration) — so there is NO extra table/migration for it.
 *
 * All reads are tenant-scoped (`withTenant` → RLS). The Meta wire specifics live behind the provider-router
 * adapter; the exact permission field/endpoint names are `[CONFIRM @ MEC-00]`.
 */

/** How many recent outbound calls to scan when computing the unanswered back-off run. */
const BACKOFF_LOOKBACK = 25;

export interface MePermissionView {
  psid: string;
  status: MessengerPermissionStatus;
  /** Temporary-grant expiry (from Meta's `expiration_time`), else null. */
  expiresAt: Date | null;
  /** Meta's live verdict for the call action (undefined when the live API is gated/unavailable). */
  callAllowed?: boolean;
  /** The live rate window for the call action, when Meta returned one. */
  limit?: MeCallActionLimit;
  /** True when read live from Meta; false when gated/errored (defaulted to no_permission). */
  live: boolean;
}

export interface MeCanCallResult extends MeCanCallDecision {
  permission: MePermissionView;
  consecutiveUnanswered: number;
}

export interface MePermissionInspect {
  permission: MePermissionView;
  canCall: MeCanCallResult;
}

/** The subset the calling-service control plane depends on — injectable so its tests stay offline. */
export interface MePermissionGate {
  canCall(tenantId: string, input: { psid: string; contactId?: string }): Promise<MeCanCallResult>;
}

const NO_PERMISSION_VIEW = (psid: string, live: boolean): MePermissionView => ({
  psid,
  status: 'no_permission',
  expiresAt: null,
  live,
});

/** A call is "answered" if it connected (accepted) or ran for a positive duration. */
const isAnswered = (c: { status: string; durationSec: number | null }): boolean =>
  c.status === 'accepted' || (c.durationSec ?? 0) > 0;

export class MessengerPermissionService implements MePermissionGate {
  constructor(
    private readonly db: PrismaService,
    private readonly adapterFor: MeAdapterResolver,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /**
   * Read the LIVE call permission from Meta's Call-Permissions API for a user PSID. Gated (no adapter) or
   * an error → a `no_permission` view (fail-closed). Never throws.
   */
  async getPermission(tenantId: string, psid: string): Promise<MePermissionView> {
    const adapter = await this.adapterFor(tenantId).catch(() => null);
    if (!adapter) return NO_PERMISSION_VIEW(psid, false);
    const perm = await adapter.getCallPermission({ psid }).catch(() => null);
    if (!perm) return NO_PERMISSION_VIEW(psid, false);
    return this.toView(psid, perm);
  }

  /** The pre-dial gate — live permission + derived back-off + DNC → typed decision. */
  async canCall(
    tenantId: string,
    input: { psid: string; contactId?: string },
  ): Promise<MeCanCallResult> {
    const [permission, consecutiveUnanswered, dnc] = await Promise.all([
      this.getPermission(tenantId, input.psid),
      this.consecutiveUnanswered(tenantId, input.psid),
      this.resolveDnc(tenantId, input.contactId),
    ]);

    const decision = canPlaceMessengerCall(
      {
        status: permission.status,
        expiresAtSec: permission.expiresAt
          ? Math.floor(permission.expiresAt.getTime() / 1000)
          : null,
        ...(permission.callAllowed !== undefined
          ? { callActionAllowed: permission.callAllowed }
          : {}),
        ...(permission.limit ? { callActionLimit: permission.limit } : {}),
        consecutiveUnanswered,
        dnc,
      },
      this.now(),
    );
    return { ...decision, permission, consecutiveUnanswered };
  }

  /** The inspector view (for the dashboard): current live permission + the pre-dial decision. */
  async inspect(
    tenantId: string,
    input: { psid: string; contactId?: string },
  ): Promise<MePermissionInspect> {
    const canCall = await this.canCall(tenantId, input);
    return { permission: canCall.permission, canCall };
  }

  /** Trailing run of UNANSWERED business-initiated calls to this PSID (the local back-off signal). */
  private async consecutiveUnanswered(tenantId: string, psid: string): Promise<number> {
    return this.db.withTenant(tenantId, async (tx) => {
      const recent = await tx.messengerCall.findMany({
        where: { direction: 'BUSINESS_INITIATED', psid },
        orderBy: { createdAt: 'desc' },
        take: BACKOFF_LOOKBACK,
        select: { status: true, durationSec: true },
      });
      let run = 0;
      for (const c of recent) {
        if (isAnswered(c)) break;
        run += 1;
      }
      return run;
    });
  }

  /** DNC resolves from an explicit contact (Messenger has no phone number to match on). */
  private async resolveDnc(tenantId: string, contactId?: string): Promise<boolean> {
    if (!contactId) return false;
    return this.db.withTenant(tenantId, async (tx) => {
      const contact = await tx.contact.findFirst({
        where: { id: contactId },
        select: { dnc: true },
      });
      return contact?.dnc ?? false;
    });
  }

  private toView(psid: string, perm: MeCallPermission): MePermissionView {
    const callAction =
      perm.actions.find((a) => a.actionName.toUpperCase() === MESSENGER_CALL_ACTION) ??
      perm.actions[0];
    const limit = callAction?.limits[0];
    return {
      psid,
      status: perm.status,
      expiresAt: perm.expirationTime ? new Date(perm.expirationTime * 1000) : null,
      ...(callAction ? { callAllowed: callAction.canPerformAction } : {}),
      ...(limit
        ? { limit: { maxAllowed: limit.maxAllowed, currentUsage: limit.currentUsage } }
        : {}),
      live: true,
    };
  }
}
