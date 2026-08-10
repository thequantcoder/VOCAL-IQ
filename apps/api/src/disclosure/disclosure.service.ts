import {
  COMPLIANCE_TEMPLATES,
  type DisclosureConfig,
  NotFoundError,
  ValidationError,
  buildDisclosure,
  callingAllowed,
  disclosureConfigSchema,
  rulesForRegion,
} from '@vocaliq/shared';
import type { PrismaService } from '../db/prisma.service';

/**
 * AI disclosure & calling-rules compliance (Day 71). Manages a tenant's disclosure config, builds
 * the spoken AI-disclosure line the voice service says at call start (with the mandatory human
 * opt-out where the region requires it), logs what was disclosed per call (a defensible record),
 * records a caller's "reach a human" opt-out (→ Agent Desk), and gates outbound against region
 * calling-hours + frequency caps. Region rulebook is pure (@vocaliq/shared); all RLS-scoped.
 */
export class DisclosureService {
  constructor(private readonly db: PrismaService) {}

  /** The compliance template library (pre-built rule sets). */
  templates() {
    return Object.entries(COMPLIANCE_TEMPLATES).map(([key, rule]) => ({ key, ...rule }));
  }

  async getConfig(tenantId: string): Promise<DisclosureConfig> {
    const t = await this.db.withTenant(tenantId, (tx) =>
      tx.tenant.findFirst({ where: { id: tenantId }, select: { settings: true } }),
    );
    const raw = (t?.settings as { disclosure?: unknown } | null)?.disclosure;
    const parsed = disclosureConfigSchema.safeParse(raw ?? {});
    return parsed.success ? parsed.data : disclosureConfigSchema.parse({});
  }

  async setConfig(tenantId: string, input: unknown): Promise<DisclosureConfig> {
    const parsed = disclosureConfigSchema.safeParse(input);
    if (!parsed.success)
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid disclosure config');
    const t = await this.db.withTenant(tenantId, (tx) =>
      tx.tenant.findFirst({ where: { id: tenantId }, select: { settings: true } }),
    );
    const settings = { ...((t?.settings as object) ?? {}), disclosure: parsed.data };
    await this.db.withTenant(tenantId, (tx) =>
      tx.tenant.update({ where: { id: tenantId }, data: { settings: settings as object } }),
    );
    return parsed.data;
  }

  /** The spoken disclosure line for a call (voice service calls this at call start). */
  async buildForCall(
    tenantId: string,
    agentName: string,
    businessName?: string,
  ): Promise<{ text: string | null; humanOptOutRequired: boolean }> {
    const config = await this.getConfig(tenantId);
    const text = buildDisclosure(config, agentName, businessName);
    return { text, humanOptOutRequired: rulesForRegion(config.region).humanOptOutRequired };
  }

  /** Log what was disclosed on a call (the defensible record). */
  async logDisclosure(tenantId: string, callId: string, text: string): Promise<{ ok: true }> {
    await this.db.withTenant(tenantId, (tx) =>
      tx.call.updateMany({
        where: { id: callId },
        data: { disclosureText: text, disclosedAt: new Date() },
      }),
    );
    return { ok: true };
  }

  /** Record a caller's "reach a human" opt-out on a call (→ the voice service transfers to the desk). */
  async recordHumanOptOut(tenantId: string, callId: string): Promise<{ ok: true }> {
    const call = await this.db.withTenant(tenantId, (tx) =>
      tx.call.findFirst({ where: { id: callId }, select: { id: true } }),
    );
    if (!call) throw new NotFoundError('Call not found');
    await this.db.withTenant(tenantId, (tx) =>
      tx.call.updateMany({ where: { id: callId }, data: { humanOptOutAt: new Date() } }),
    );
    return { ok: true };
  }

  /**
   * Calling-rules gate for outbound: region calling-hours + per-contact daily frequency cap. The
   * local hour is the current server hour (per-contact timezone lookup is a follow-up); attempts
   * are counted from today's outbound calls to the same contact.
   */
  async checkCalling(
    tenantId: string,
    region: string,
    contactId?: string,
  ): Promise<{ allowed: boolean; reason?: string }> {
    const localHour = new Date().getUTCHours();
    let attemptsToday = 0;
    if (contactId) {
      attemptsToday = await this.db.withTenant(tenantId, (tx) =>
        tx.call.count({
          where: { contactId, direction: 'OUTBOUND', createdAt: { gte: startOfDay() } },
        }),
      );
    }
    return callingAllowed(region, { localHour, attemptsToday });
  }
}

function startOfDay(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}
