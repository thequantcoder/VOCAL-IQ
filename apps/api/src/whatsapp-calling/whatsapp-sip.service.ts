import { whatsappDestinationCountry } from '@vocaliq/provider-router';
import { type WhatsappCallSettings, parseWaMetaHeaders } from '@vocaliq/shared';
import type { PrismaService } from '../db/prisma.service';
import type { WaCallMeter } from './whatsapp-call-cost.service';
import type { WhatsAppCallSettingsService } from './whatsapp-call-settings.service';
import type { WaAdapterResolver } from './whatsapp-calling.service';

/**
 * WhatsApp Calling SIP mode (WAC-10) — for PBX (Asterisk/Kamailio) tenants who bridge WhatsApp calls
 * through their own TLS SIP server instead of Graph-API+WebRTC. Manages the `sip` settings block (synced
 * to Meta), fetches the Meta-generated digest credentials (gated), and — since SIP mode has no
 * `calls` webhook — correlates + meters a SIP call from Meta's `x-wa-meta-*` headers on BYE. Per-number
 * + opt-in: it never touches Graph-API tenants (WAC-00..09). Tenant-scoped (RLS).
 */

export type WaSipConfigInput = WhatsappCallSettings['sip'];

export interface WaSipCredentials {
  username: string;
  password: string | null;
  realm: string;
  servers: Array<{ hostname: string; port: number }>;
}

export class WhatsAppSipService {
  constructor(
    private readonly db: PrismaService,
    private readonly settings: WhatsAppCallSettingsService,
    private readonly adapterFor: WaAdapterResolver,
    private readonly meter: WaCallMeter,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Enable/update SIP mode (syncs the `sip` block to Meta via the settings service, then persists). */
  async configure(tenantId: string, sip: WaSipConfigInput): Promise<WhatsappCallSettings> {
    const current = await this.settings.get(tenantId);
    return this.settings.set(tenantId, { ...current, sip });
  }

  /** Is this tenant's number running in SIP mode (Graph-API calling disabled for it)? */
  async isSipMode(tenantId: string): Promise<boolean> {
    return (await this.settings.get(tenantId)).sip.enabled;
  }

  /**
   * Fetch the Meta-generated SIP digest credentials (`GET /settings?include_sip_credentials=true`).
   * Gated: `null` when no adapter (unconfigured creds). Never logs the password.
   */
  async credentials(tenantId: string): Promise<WaSipCredentials | null> {
    const adapter = await this.adapterFor(tenantId).catch(() => null);
    if (!adapter) return null;
    const raw = await adapter.getSettings(true).catch(() => null);
    const calling = (raw as { calling?: { sip?: Record<string, unknown> } } | null)?.calling;
    const sip = calling?.sip ?? {};
    const servers = ((sip.servers as Array<Record<string, unknown>> | undefined) ?? []).map(
      (s) => ({
        hostname: String(s.hostname ?? ''),
        port: Number(s.port ?? 5061),
      }),
    );
    return {
      username: String(sip.username ?? ''),
      password: typeof sip.password === 'string' ? sip.password : null,
      realm: String(sip.realm ?? 'wa.meta.vc'),
      servers,
    };
  }

  /**
   * Correlate + meter a SIP-mode call from its `x-wa-meta-*` headers (there's no calls webhook). Upserts
   * a WhatsAppCall keyed by the WACID with the parsed duration, then meters via WAC-06 (idempotent).
   */
  async recordSipCall(
    tenantId: string,
    headers: Record<string, string | string[] | undefined>,
    opts: { direction: 'USER_INITIATED' | 'BUSINESS_INITIATED'; to?: string } = {
      direction: 'USER_INITIATED',
    },
  ): Promise<{ waCallId: string } | null> {
    const meta = parseWaMetaHeaders(headers);
    if (!meta.wacid) return null;

    await this.db.withTenant(tenantId, async (tx) => {
      const data = {
        direction: opts.direction,
        status: 'completed',
        endedAt: this.now(),
        ...(meta.durationSec !== undefined ? { durationSec: meta.durationSec } : {}),
        ...(meta.userId ? { waUserId: meta.userId } : {}),
        ...(opts.to ? { toNumber: opts.to } : {}),
        ...(meta.ctaPayload ? { ctaPayload: meta.ctaPayload } : {}),
        ...(meta.deeplinkPayload ? { deeplinkPayload: meta.deeplinkPayload } : {}),
      };
      await tx.whatsAppCall.upsert({
        where: { tenantId_waCallId: { tenantId, waCallId: meta.wacid as string } },
        create: { tenantId, waCallId: meta.wacid as string, ...data },
        update: data,
      });
      await tx.whatsAppCallEvent.create({
        data: {
          tenantId,
          waCallId: meta.wacid as string,
          event: 'sip_terminate',
          payload: { ...meta } as object,
        },
      });
    });
    // Meter via WAC-06 (reads the row's duration + country; idempotent by billedAt).
    await this.meter.meterTerminated(tenantId, meta.wacid);
    return { waCallId: meta.wacid };
  }

  /** Coarse destination-country hint for a SIP call (for rate routing). */
  countryFor(e164: string): string {
    return whatsappDestinationCountry(e164);
  }
}
