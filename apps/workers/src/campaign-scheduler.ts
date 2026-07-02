import type { PrismaClient } from '@vocaliq/db';
import {
  type CallWindow,
  CampaignContactStatus,
  type DueContact,
  type RetryPolicy,
  callWindowSchema,
  isWithinWindow,
  retryPolicySchema,
  selectDueContacts,
} from '@vocaliq/shared';

/**
 * Campaign scheduler tick (Day 28). On each tick, for every RUNNING campaign whose local
 * calling window is open, select due contacts within the concurrency + pace caps and hand
 * them to the dialer. The selection is the shared, unit-tested `selectDueContacts` — so the
 * caps can never be exceeded regardless of backlog (self-audit C + F). This pure runner
 * takes injected deps so it is tested without Redis/Postgres/a live dialer.
 *
 * The tick NEVER dials directly — it calls `dial(campaignId, contactId)`, which the
 * production wiring routes through the metered outbound path (gated until a funded number
 * is attached, like Day 10). One campaign's failure is isolated so others still run.
 */

export interface SchedulerCampaign {
  id: string;
  tenantId: string;
  schedule: unknown; // raw scheduleJson → parsed to a CallWindow
  concurrency: number;
  pacing: number; // max new calls per tick
  retryPolicy: unknown;
}

export interface SchedulerDeps {
  /** RUNNING campaigns across all tenants (workers legitimately span tenants). */
  findRunningCampaigns(): Promise<SchedulerCampaign[]>;
  /** Contacts eligible to (re)try for a campaign — PENDING/RETRY with their nextAttemptAt. */
  findDueContacts(campaignId: string): Promise<DueContact[]>;
  /** How many of this campaign's calls are currently in flight (non-terminal). */
  countInFlight(campaignId: string): Promise<number>;
  /** Launch one call (production: enqueue on the metered outbound path). */
  dial(campaign: SchedulerCampaign, contactId: string): Promise<void>;
  log(message: string): void;
}

export interface TickResult {
  campaignsConsidered: number;
  campaignsInWindow: number;
  dialed: number;
}

export async function runCampaignTick(deps: SchedulerDeps, now: Date): Promise<TickResult> {
  const campaigns = await deps.findRunningCampaigns();
  let campaignsInWindow = 0;
  let dialed = 0;

  for (const campaign of campaigns) {
    const window: CallWindow = callWindowSchema.parse(campaign.schedule ?? {});
    if (!isWithinWindow(now, window)) continue; // outside local calling hours → skip
    campaignsInWindow++;

    try {
      const [due, inFlight] = await Promise.all([
        deps.findDueContacts(campaign.id),
        deps.countInFlight(campaign.id),
      ]);
      const picked = selectDueContacts(due, {
        now,
        inFlight,
        concurrency: campaign.concurrency,
        pacePerTick: campaign.pacing,
      });
      for (const contactId of picked) {
        await deps.dial(campaign, contactId);
        dialed++;
      }
      if (picked.length > 0) {
        deps.log(`[campaign ${campaign.id}] dialed ${picked.length} (inFlight=${inFlight})`);
      }
    } catch (err) {
      // Isolate one campaign's failure so the rest of the tick still runs.
      deps.log(`[campaign ${campaign.id}] tick error: ${(err as Error).message}`);
    }
  }

  return { campaignsConsidered: campaigns.length, campaignsInWindow, dialed };
}

/** Parse a campaign's stored retry policy (defaults applied) for the disposition handler. */
export function parseRetryPolicy(raw: unknown): RetryPolicy {
  return retryPolicySchema.parse(raw ?? {});
}

/**
 * Production deps backed by the admin client (workers legitimately span tenants for this
 * infra sweep). `dial` marks the contact CALLING — the live outbound placement is gated
 * until a funded number is attached (Day 10 pattern), so here it flips state + logs; the
 * live enqueue slots in at the marked line without touching the tick/selection logic.
 */
export function createDbSchedulerDeps(
  admin: PrismaClient,
  log: (msg: string) => void,
): SchedulerDeps {
  return {
    findRunningCampaigns: async () => {
      const rows = await admin.campaign.findMany({
        where: { status: 'RUNNING' },
        select: {
          id: true,
          tenantId: true,
          scheduleJson: true,
          concurrency: true,
          pacing: true,
          retryPolicy: true,
        },
      });
      return rows.map((r) => ({
        id: r.id,
        tenantId: r.tenantId,
        schedule: r.scheduleJson,
        concurrency: r.concurrency,
        pacing: r.pacing,
        retryPolicy: r.retryPolicy,
      }));
    },
    findDueContacts: async (campaignId) => {
      const rows = await admin.campaignContact.findMany({
        where: {
          campaignId,
          status: { in: [CampaignContactStatus.PENDING, CampaignContactStatus.RETRY] },
        },
        select: { id: true, nextAttemptAt: true },
      });
      return rows.map((r) => ({ id: r.id, nextAttemptAt: r.nextAttemptAt }));
    },
    countInFlight: (campaignId) =>
      admin.campaignContact.count({
        where: { campaignId, status: CampaignContactStatus.CALLING },
      }),
    dial: async (_campaign, contactId) => {
      await admin.campaignContact.update({
        where: { id: contactId },
        data: { status: CampaignContactStatus.CALLING, attempts: { increment: 1 } },
      });
      // TODO(live): enqueue the metered outbound call for the campaign's agent here once a
      // funded number is attached (Twilio live is gated — see Day 10). Selection/caps above
      // already guarantee this is within pace + concurrency.
    },
    log,
  };
}
