import type { PrismaClient } from '@vocaliq/db';
import {
  type CallWindow,
  CampaignContactStatus,
  type DialStats,
  type DueContact,
  type RetryPolicy,
  callWindowSchema,
  computeDialBudget,
  isWithinWindow,
  parseDialerConfig,
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
  dialerConfig: unknown; // Day 79: raw dialerConfig → parsed to a DialerConfig
}

export interface SchedulerDeps {
  /** RUNNING campaigns across all tenants (workers legitimately span tenants). */
  findRunningCampaigns(): Promise<SchedulerCampaign[]>;
  /** Contacts eligible to (re)try for a campaign — PENDING/RETRY with their nextAttemptAt. */
  findDueContacts(campaignId: string): Promise<DueContact[]>;
  /** How many of this campaign's calls are currently in flight (non-terminal). */
  countInFlight(campaignId: string): Promise<number>;
  /** Free HUMAN agents for a tenant right now (Agent Desk, Day 67) — for blended power/predictive. */
  countFreeAgents(tenantId: string): Promise<number>;
  /** Recent answer + abandon rate for a campaign (drives predictive pacing + the abandon cap). */
  getDialStats(campaignId: string): Promise<DialStats>;
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
      const config = parseDialerConfig(campaign.dialerConfig);
      const [due, inFlight] = await Promise.all([
        deps.findDueContacts(campaign.id),
        deps.countInFlight(campaign.id),
      ]);
      // Free capacity: free HUMAN agents for a blended team; the AI concurrency for a pure-AI campaign.
      const freeAgents = config.blended
        ? await deps.countFreeAgents(campaign.tenantId)
        : campaign.concurrency;
      const stats = await deps.getDialStats(campaign.id);
      // Mode-aware per-tick budget (progressive/power/predictive), abandon-cap-throttled (self-audit C).
      const budget = computeDialBudget(
        { freeAgents, inFlight, concurrency: campaign.concurrency, pacePerTick: campaign.pacing },
        stats,
        config,
      );
      // selectDueContacts still enforces the hard concurrency cap — the budget only ever lowers it.
      const picked = selectDueContacts(due, {
        now,
        inFlight,
        concurrency: campaign.concurrency,
        pacePerTick: budget,
      });
      for (const contactId of picked) {
        await deps.dial(campaign, contactId);
        dialed++;
      }
      if (picked.length > 0) {
        deps.log(
          `[campaign ${campaign.id}] ${config.mode} dialed ${picked.length} (free=${freeAgents} inFlight=${inFlight})`,
        );
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
          dialerConfig: true,
        },
      });
      return rows.map((r) => ({
        id: r.id,
        tenantId: r.tenantId,
        schedule: r.scheduleJson,
        concurrency: r.concurrency,
        pacing: r.pacing,
        retryPolicy: r.retryPolicy,
        dialerConfig: r.dialerConfig,
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
    countFreeAgents: (tenantId) =>
      admin.agentPresence.count({
        where: { tenantId, status: 'available', activeCalls: { lt: 1 } },
      }),
    getDialStats: async (campaignId) => {
      // Answer rate from recent contact dispositions. There is no live abandon feed yet (an abandon =
      // a predictive connect with no free agent, which needs the gated live-dial path), so
      // `abandonFeedLive` is false — and `computeDialBudget` therefore keeps predictive at SAFE 1:1
      // pacing (it never over-dials blind). It over-dials only once live dialing reports abandons.
      const [answered, attempted] = await Promise.all([
        admin.campaignContact.count({ where: { campaignId, lastDisposition: 'COMPLETED' } }),
        admin.campaignContact.count({ where: { campaignId, lastDisposition: { not: null } } }),
      ]);
      const answerRatePercent = attempted > 0 ? (answered / attempted) * 100 : 30;
      return { answerRatePercent, abandonRatePercent: 0, abandonFeedLive: false };
    },
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
