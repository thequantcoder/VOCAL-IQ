import {
  type NumberProvisioner,
  TelnyxNumberProvisioner,
  TwilioNumberProvisioner,
} from '@vocaliq/provider-router';
import {
  type AvailableNumberDto,
  Capability,
  ForbiddenError,
  NotFoundError,
  type NumberBuyInput,
  type NumberSearchInput,
  type OwnedNumberDto,
  Provider,
  ValidationError,
  canAssignNumber,
} from '@vocaliq/shared';
import type { EntitlementsService } from '../billing/entitlements.service';
import type { PrismaService } from '../db/prisma.service';

/** Flat monthly-cost estimate (USD) by E.164 country prefix — the pool table stores no per-number cost. */
function estimateMonthlyCostUsd(e164: string): number {
  if (e164.startsWith('+1')) return 1.15;
  if (e164.startsWith('+44')) return 1.0;
  if (e164.startsWith('+61')) return 3.0;
  return 1.5;
}

/**
 * Build a live carrier provisioner from env, or null (→ mock catalogue in dev/CI). Twilio takes
 * precedence if both are configured; Telnyx is the alternative carrier. Adding another is one branch.
 */
function buildProvisioner(env: NodeJS.ProcessEnv): NumberProvisioner | null {
  if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN) {
    return new TwilioNumberProvisioner(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  }
  if (env.TELNYX_API_KEY) {
    return new TelnyxNumberProvisioner(env.TELNYX_API_KEY);
  }
  return null;
}

/** A small mock catalogue so search + buy work end-to-end without carrier credentials. */
function mockCatalogue(input: NumberSearchInput): AvailableNumberDto[] {
  const area = input.areaCode ?? '415';
  const caps = ['VOICE', 'SMS'];
  return Array.from({ length: Math.min(input.limit, 6) }, (_, i) => {
    const line = String(5550100 + i).padStart(7, '0');
    const e164 =
      input.country === 'US' || input.country === 'CA' ? `+1${area}${line}` : `+1${area}${line}`;
    return {
      e164,
      friendlyName: `(${area}) ${line.slice(0, 3)}-${line.slice(3)}`,
      locality: 'San Francisco',
      region: 'CA',
      country: input.country,
      capabilities: caps,
      monthlyCostUsd: estimateMonthlyCostUsd(e164),
      mock: true,
    };
  });
}

/**
 * Phone-number provisioning (search / buy / release) — fills the "buy a number" gap on top of the
 * PhoneNumber pool (the ops toolkit still owns KYC + assignment). Provider-agnostic via the router's
 * NumberProvisioner; gated to a mock catalogue when no carrier credentials are set. Every purchase is
 * tenant-scoped (RLS), plan-limited (numberLimit entitlement), and metered.
 */
export class NumbersService {
  private readonly provisioner: NumberProvisioner | null;

  constructor(
    private readonly db: PrismaService,
    private readonly entitlements: EntitlementsService,
    env: NodeJS.ProcessEnv = process.env,
  ) {
    this.provisioner = buildProvisioner(env);
  }

  /** True when a live carrier is configured (else search/buy use the mock catalogue). */
  get live(): boolean {
    return this.provisioner !== null;
  }

  /** The carrier a purchase/meter is attributed to (the mock path attributes to Twilio). */
  private get carrier(): Provider {
    return this.provisioner?.provider ?? Provider.TWILIO;
  }

  /** Search the carrier (or the mock catalogue) for numbers available to buy. */
  async search(tenantId: string, input: NumberSearchInput): Promise<AvailableNumberDto[]> {
    let results: AvailableNumberDto[];
    if (this.provisioner) {
      const found = await this.provisioner.searchAvailable({
        country: input.country,
        ...(input.areaCode ? { areaCode: input.areaCode } : {}),
        ...(input.contains ? { contains: input.contains } : {}),
        ...(input.smsEnabled !== undefined ? { smsEnabled: input.smsEnabled } : {}),
        ...(input.voiceEnabled !== undefined ? { voiceEnabled: input.voiceEnabled } : {}),
        limit: input.limit,
      });
      results = found.map((n) => ({ ...n, mock: false }));
    } else {
      results = mockCatalogue(input);
    }
    // Meter the search (a tiny, real cost even on the mock path so dashboards reflect activity).
    await this.db.withTenant(tenantId, (tx) =>
      tx.usageRecord.create({
        data: {
          tenantId,
          provider: this.carrier,
          capability: Capability.TELEPHONY,
          units: 1,
          costUsd: 0,
          byok: false,
        },
      }),
    );
    return results;
  }

  /** The tenant's owned numbers (pool + purchased). */
  async listOwned(tenantId: string): Promise<OwnedNumberDto[]> {
    const rows = await this.db.withTenant(tenantId, (tx) =>
      tx.phoneNumber.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } }),
    );
    return rows.map((n) => ({
      id: n.id,
      e164: n.e164,
      provider: n.provider,
      source: n.source,
      capabilities: n.capabilities,
      monthlyCostUsd: estimateMonthlyCostUsd(n.e164),
      assignedAgentId: n.assignedAgentId,
      createdAt: n.createdAt.toISOString(),
    }));
  }

  /** Buy a number into the tenant's pool — plan-limited + metered. */
  async buy(tenantId: string, input: NumberBuyInput): Promise<OwnedNumberDto> {
    // Enforce the plan's number limit (counts the tenant's current numbers).
    const ent = await this.entitlements.entitlements(tenantId);
    const current = await this.db.withTenant(tenantId, (tx) =>
      tx.phoneNumber.count({ where: { tenantId } }),
    );
    if (!canAssignNumber(current, ent.numberLimit)) {
      throw new ForbiddenError(`Your plan allows ${ent.numberLimit} number(s)`);
    }
    // Reject if this number is already owned/assigned anywhere (e164 is globally unique).
    const existing = await this.db.admin.phoneNumber.findUnique({
      where: { e164: input.e164 },
      select: { id: true, tenantId: true },
    });
    if (existing) throw new ValidationError('That number is already in use');

    // Purchase at the carrier (or synthesise a mock SID in dev/CI).
    let providerSid = `PN_MOCK_${input.e164.replace(/\D/g, '')}`;
    let capabilities = ['VOICE', 'SMS'];
    if (this.provisioner) {
      const bought = await this.provisioner.purchase(input.e164);
      providerSid = bought.providerSid;
      capabilities = bought.capabilities;
    }

    const costUsd = estimateMonthlyCostUsd(input.e164);
    const row = await this.db.withTenant(tenantId, async (tx) => {
      const created = await tx.phoneNumber.create({
        data: {
          tenantId,
          provider: this.carrier,
          e164: input.e164,
          providerSid,
          capabilities,
          source: 'PURCHASED',
          kycVerified: true, // a bought number is owned by the tenant — no separate pool KYC step
          ...(input.agentId ? { assignedAgentId: input.agentId } : {}),
        },
      });
      // Meter the purchase (first month's recurring cost).
      await tx.usageRecord.create({
        data: {
          tenantId,
          provider: this.carrier,
          capability: Capability.TELEPHONY,
          units: 1,
          costUsd,
          byok: false,
        },
      });
      return created;
    });

    return {
      id: row.id,
      e164: row.e164,
      provider: row.provider,
      source: row.source,
      capabilities: row.capabilities,
      monthlyCostUsd: costUsd,
      assignedAgentId: row.assignedAgentId,
      createdAt: row.createdAt.toISOString(),
    };
  }

  /** Release a purchased number back to the carrier + remove it from the pool. */
  async release(tenantId: string, id: string): Promise<{ released: true }> {
    const owned = await this.db.withTenant(tenantId, (tx) =>
      tx.phoneNumber.findFirst({
        where: { id },
        select: { id: true, providerSid: true, source: true },
      }),
    );
    if (!owned) throw new NotFoundError('Number not found');
    // Release at the carrier if it's a purchased number with a provider SID.
    if (this.provisioner && owned.providerSid) {
      await this.provisioner.release(owned.providerSid);
    }
    // Delete within the tenant scope (RLS) — business writes never use the admin client.
    await this.db.withTenant(tenantId, (tx) => tx.phoneNumber.delete({ where: { id } }));
    return { released: true };
  }
}
