import { messengerCallCostUsd } from '@vocaliq/provider-router';
import { Capability, Provider } from '@vocaliq/shared';
import type { PrismaService } from '../db/prisma.service';
import type { MeCallMeter } from './messenger-calling.service';

/**
 * Messenger call cost metering (MEC-06) — golden rule #4: no calling path ships without cost attribution.
 * On terminate we write a {@link Provider.MESSENGER}/{@link Capability.telephony} `UsageRecord` for EVERY
 * Messenger call, exactly like PSTN/WhatsApp telephony, so it rolls up through the existing cost /
 * analytics / billing views unchanged. Metering is idempotent: the `MessengerCall.billedAt` guard is
 * claimed atomically so a replayed terminate never double-meters.
 *
 * Difference from WhatsApp (WAC-06): Messenger has NO phone numbers → no per-country rate card and no
 * volume-tier table; calling is free-tier ($0) in our model, so inbound AND outbound currently log a $0
 * UsageRecord (still a metered path — never unmetered). `monthlyMinutes` is 0 (tiering is moot at $0); a
 * `MessengerCallVolume` accrual would only be added if Meta publishes a tiered Messenger calling rate.
 */
export class MessengerCallCostService implements MeCallMeter {
  constructor(private readonly db: PrismaService) {}

  /**
   * Meter a terminated Messenger call once. Reads the persisted lifecycle row, atomically CLAIMS it
   * (`billedAt IS NULL` → now), then in the same tenant transaction computes the (free-tier) cost, writes
   * the `UsageRecord`, and stamps the row. If the claim loses (already billed / concurrent meter) it
   * returns without writing — no double-charge.
   */
  async meterTerminated(tenantId: string, meCallId: string): Promise<void> {
    await this.db.withTenant(tenantId, async (tx) => {
      const row = await tx.messengerCall.findUnique({
        where: { tenantId_meCallId: { tenantId, meCallId } },
        select: { direction: true, durationSec: true, callId: true, billedAt: true },
      });
      if (!row || row.billedAt) return; // not found, or already metered

      // Atomic idempotency barrier: only the first terminate claims the billing.
      const claim = await tx.messengerCall.updateMany({
        where: { tenantId, meCallId, billedAt: null },
        data: { billedAt: new Date() },
      });
      if (claim.count === 0) return; // a concurrent meter won the claim

      const direction = row.direction === 'USER_INITIATED' ? 'inbound' : 'outbound';
      const seconds = row.durationSec ?? 0;
      // Free-tier flat rate → monthlyMinutes is moot (tier0 === tier1 === 0).
      const costUsd = messengerCallCostUsd(seconds, direction, 0);

      // Attribute the cost (currently $0 but always logged). Managed pricing → byok=false.
      await tx.usageRecord.create({
        data: {
          tenantId,
          provider: Provider.MESSENGER,
          capability: Capability.TELEPHONY,
          units: seconds,
          costUsd,
          byok: false,
          ...(row.callId ? { callId: row.callId } : {}),
        },
      });

      await tx.messengerCall.update({
        where: { tenantId_meCallId: { tenantId, meCallId } },
        data: { costUsd },
      });
    });
  }
}
