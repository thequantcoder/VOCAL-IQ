import {
  whatsappCallCostUsd,
  whatsappCallPulses,
  whatsappDestinationCountry,
} from '@vocaliq/provider-router';
import { Capability, Provider } from '@vocaliq/shared';
import type { PrismaService } from '../db/prisma.service';

/**
 * WhatsApp call cost metering (WAC-06) — golden rule #4: no calling path ships without cost
 * attribution. On terminate we write a {@link Provider.WHATSAPP}/{@link Capability.telephony}
 * `UsageRecord` for EVERY WhatsApp call (inbound = $0 but logged; outbound = per-country, 6-second
 * pulses rounded up, only-if-answered, monthly-volume-tiered) — exactly like PSTN telephony, so it
 * rolls up through the existing cost/analytics/billing views unchanged. Metering is idempotent: the
 * `WhatsAppCall.billedAt` guard is claimed atomically so a replayed Terminate never double-meters.
 *
 * NOTE (deviation from the WAC-06 super-prompt, §13): the PSTN calling path in this codebase meters to
 * `UsageRecord` and does NOT per-call debit the wallet (`chargeCall` is used only by outcome billing);
 * reseller margin + invoicing roll up from `UsageRecord`. WhatsApp follows the SAME model for
 * consistency (golden rule #6) rather than introducing a divergent per-call wallet debit.
 */

/** The metering seam the control plane calls on terminate. Injected so WAC-02 stays offline-testable. */
export interface WaCallMeter {
  meterTerminated(tenantId: string, waCallId: string): Promise<void>;
}

/** No-op meter — used where metering is irrelevant (WAC-02 control-plane tests). */
export class NoopWaCallMeter implements WaCallMeter {
  async meterTerminated(): Promise<void> {}
}

/** `YYYY-MM` billing period for a moment (defaults to now) — the monthly volume-tier bucket. */
export function whatsappCallPeriod(at: Date = new Date()): string {
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, '0')}`;
}

export class WhatsAppCallCostService implements WaCallMeter {
  constructor(private readonly db: PrismaService) {}

  /**
   * Meter a terminated WhatsApp call once. Reads the persisted lifecycle row, atomically CLAIMS it
   * (`billedAt IS NULL` → now), then in the same tenant transaction computes the carrier cost, writes
   * the `UsageRecord`, accrues this month's outbound volume (for the tier), and stamps the row. If the
   * claim loses (already billed / concurrent meter) it returns without writing — no double-charge.
   */
  async meterTerminated(tenantId: string, waCallId: string): Promise<void> {
    await this.db.withTenant(tenantId, async (tx) => {
      const row = await tx.whatsAppCall.findUnique({
        where: { tenantId_waCallId: { tenantId, waCallId } },
        select: {
          direction: true,
          toNumber: true,
          durationSec: true,
          callId: true,
          billedAt: true,
        },
      });
      if (!row || row.billedAt) return; // not found, or already metered

      // Atomic idempotency barrier: only the first Terminate claims the billing.
      const claim = await tx.whatsAppCall.updateMany({
        where: { tenantId, waCallId, billedAt: null },
        data: { billedAt: new Date() },
      });
      if (claim.count === 0) return; // a concurrent meter won the claim

      const direction = row.direction === 'USER_INITIATED' ? 'inbound' : 'outbound';
      const seconds = row.durationSec ?? 0;

      let country: string | undefined;
      let costUsd = 0;
      if (direction === 'outbound') {
        country = whatsappDestinationCountry(row.toNumber ?? '');
        const period = whatsappCallPeriod();
        // Tier is chosen from volume BEFORE this call, then this call's billed seconds are accrued.
        const vol = await tx.whatsAppCallVolume.findUnique({
          where: { tenantId_period: { tenantId, period } },
          select: { billedSeconds: true },
        });
        const monthlyMinutes = (vol?.billedSeconds ?? 0) / 60;
        costUsd = whatsappCallCostUsd(seconds, country, 'outbound', monthlyMinutes);
        const billedSeconds = whatsappCallPulses(seconds) * 6;
        if (billedSeconds > 0) {
          await tx.whatsAppCallVolume.upsert({
            where: { tenantId_period: { tenantId, period } },
            create: { tenantId, period, billedSeconds },
            update: { billedSeconds: { increment: billedSeconds } },
          });
        }
      }

      // Attribute the cost (inbound logged at 0). Managed pricing → byok=false (BYOK resolution is WAC-08).
      await tx.usageRecord.create({
        data: {
          tenantId,
          provider: Provider.WHATSAPP,
          capability: Capability.TELEPHONY,
          units: seconds,
          costUsd,
          byok: false,
          ...(row.callId ? { callId: row.callId } : {}),
        },
      });

      await tx.whatsAppCall.update({
        where: { tenantId_waCallId: { tenantId, waCallId } },
        data: { costUsd, ...(country ? { billedCountry: country } : {}) },
      });
    });
  }
}
