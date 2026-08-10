import {
  WHATSAPP_TIER0_MAX_MINUTES,
  telephonyCostUsd,
  whatsappCallRatePerMin,
  whatsappDestinationCountry,
} from '@vocaliq/provider-router';
import {
  type RouteChannel,
  type RouteReason,
  type WaRestriction,
  type WaRoutingPolicy,
  chooseWhatsappRoute,
  isWhatsappRestrictionActive,
  normalizeWaNumber,
  parseWhatsappRestriction,
  shouldThrottleWhatsapp,
  whatsappPickupRate,
} from '@vocaliq/shared';
import type { PrismaService } from '../db/prisma.service';
import { whatsappCallPeriod } from './whatsapp-call-cost.service';
import type { WaPermissionGate } from './whatsapp-permission.service';

/**
 * WhatsApp least-cost routing + restriction/pickup guardrails (WAC-09). Picks the cheapest ALLOWED
 * outbound channel (WhatsApp vs PSTN) for a destination, watches pickup-rate to back off before Meta's
 * low-pickup RESTRICTED_* bites, and persists `account_update` restrictions (with a local 7-day expiry)
 * so we route around them + surface a health banner. Routing policy + restriction live in a local-only
 * `settings.whatsappCallingOps` blob (NOT the Meta-synced call settings). All tenant-scoped (RLS).
 */

const DEFAULT_POLICY: WaRoutingPolicy = 'whatsapp_if_permitted';
const PICKUP_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const ANSWERED = ['accepted', 'completed'];

interface WaOps {
  policy?: WaRoutingPolicy;
  restriction?: WaRestriction | null;
}

export interface WaRoutePlan {
  channel: RouteChannel;
  reason: RouteReason;
  whatsappCostPerMin: number;
  pstnCostPerMin: number;
}

export interface WhatsAppCallingHealth {
  enabled: boolean;
  policy: WaRoutingPolicy;
  pickup: { attempts: number; answered: number; rate: number; throttled: boolean };
  restriction: { active: boolean; type: string | null; expiresAt: string | null };
  monthly: { period: string; minutes: number; tier: 'tier0' | 'tier1' };
}

export class WhatsAppRoutingService {
  constructor(
    private readonly db: PrismaService,
    private readonly permission: WaPermissionGate,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Plan the outbound route for a destination: cheapest allowed channel + a transparent reason. */
  async planRoute(
    tenantId: string,
    input: { destination: string; isWhatsappUser?: boolean },
  ): Promise<WaRoutePlan> {
    const waId = normalizeWaNumber(input.destination);
    const [{ enabled, ops }, pickup, canCall] = await Promise.all([
      this.settings(tenantId),
      this.pickup(tenantId),
      this.permission.canCall(tenantId, { waId }),
    ]);

    const country = whatsappDestinationCountry(waId);
    const whatsappCostPerMin = whatsappCallRatePerMin(country);
    const pstnCostPerMin = telephonyCostUsd('twilio', 60);

    const plan = chooseWhatsappRoute({
      policy: ops.policy ?? DEFAULT_POLICY,
      isWhatsappUser: input.isWhatsappUser ?? enabled,
      whatsappEnabled: enabled,
      whatsappRestricted: isWhatsappRestrictionActive(ops.restriction, this.now()),
      throttled: pickup.throttled,
      canCallAllowed: canCall.allowed,
      ...(canCall.reason ? { canCallReason: canCall.reason } : {}),
      // Only compare cost when both are known (unknown PSTN rate → fall through to policy default).
      ...(whatsappCostPerMin > 0 && pstnCostPerMin > 0
        ? { whatsappCostPerMin, pstnCostPerMin }
        : {}),
    });
    return { ...plan, whatsappCostPerMin, pstnCostPerMin };
  }

  /** WhatsApp-calling health: pickup rate, active restriction, monthly tier — for the health widget. */
  async health(tenantId: string): Promise<WhatsAppCallingHealth> {
    const [{ enabled, ops }, pickup, minutes] = await Promise.all([
      this.settings(tenantId),
      this.pickup(tenantId),
      this.monthlyMinutes(tenantId),
    ]);
    const restriction = ops.restriction ?? null;
    return {
      enabled,
      policy: ops.policy ?? DEFAULT_POLICY,
      pickup,
      restriction: {
        active: isWhatsappRestrictionActive(restriction, this.now()),
        type: restriction?.type ?? null,
        expiresAt: restriction?.expiresAt ?? null,
      },
      monthly: {
        period: whatsappCallPeriod(),
        minutes,
        tier: minutes > WHATSAPP_TIER0_MAX_MINUTES ? 'tier1' : 'tier0',
      },
    };
  }

  /** Persist (or clear) a restriction from a Meta `account_update` webhook. */
  async applyRestriction(tenantId: string, payload: unknown): Promise<void> {
    const restriction = parseWhatsappRestriction(payload, this.now());
    await this.writeOps(tenantId, { restriction });
  }

  /** Set the tenant's outbound routing policy. */
  async setPolicy(tenantId: string, policy: WaRoutingPolicy): Promise<void> {
    await this.writeOps(tenantId, { policy });
  }

  private async pickup(
    tenantId: string,
  ): Promise<{ attempts: number; answered: number; rate: number; throttled: boolean }> {
    const since = new Date(this.now().getTime() - PICKUP_WINDOW_MS);
    const [attempts, answered] = await this.db.withTenant(tenantId, (tx) =>
      Promise.all([
        tx.whatsAppCall.count({
          where: { direction: 'BUSINESS_INITIATED', createdAt: { gte: since } },
        }),
        tx.whatsAppCall.count({
          where: {
            direction: 'BUSINESS_INITIATED',
            status: { in: ANSWERED },
            createdAt: { gte: since },
          },
        }),
      ]),
    );
    return {
      attempts,
      answered,
      rate: whatsappPickupRate(answered, attempts),
      throttled: shouldThrottleWhatsapp(answered, attempts),
    };
  }

  private async monthlyMinutes(tenantId: string): Promise<number> {
    const period = whatsappCallPeriod();
    const vol = await this.db.withTenant(tenantId, (tx) =>
      tx.whatsAppCallVolume.findUnique({
        where: { tenantId_period: { tenantId, period } },
        select: { billedSeconds: true },
      }),
    );
    return Math.round(((vol?.billedSeconds ?? 0) / 60) * 10) / 10;
  }

  private async settings(tenantId: string): Promise<{ enabled: boolean; ops: WaOps }> {
    const t = await this.db.withTenant(tenantId, (tx) =>
      tx.tenant.findFirst({ where: { id: tenantId }, select: { settings: true } }),
    );
    const settings = (t?.settings ?? {}) as {
      whatsappCalling?: { enabled?: boolean };
      whatsappCallingOps?: WaOps;
    };
    return {
      enabled: settings.whatsappCalling?.enabled === true,
      ops: settings.whatsappCallingOps ?? {},
    };
  }

  private async writeOps(tenantId: string, patch: WaOps): Promise<void> {
    await this.db.withTenant(tenantId, async (tx) => {
      const t = await tx.tenant.findFirst({ where: { id: tenantId }, select: { settings: true } });
      const settings = (t?.settings ?? {}) as Record<string, unknown> & {
        whatsappCallingOps?: WaOps;
      };
      const merged = {
        ...settings,
        whatsappCallingOps: { ...(settings.whatsappCallingOps ?? {}), ...patch },
      };
      await tx.tenant.update({ where: { id: tenantId }, data: { settings: merged as object } });
    });
  }
}
