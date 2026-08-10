import { z } from 'zod';

/**
 * Agent Desk (Day 67) — pure presence + human-transfer routing + queue/SLA math shared across
 * api/web. The Transfer node (Day 21) and escalations hand a live call to a HUMAN agent; this
 * decides WHO (round-robin / skill-based / specific), tracks availability, builds the warm-handoff
 * summary, and computes queue wait + SLA breaches. Keeping it pure makes routing deterministic +
 * testable; the realtime presence broadcast + LiveKit join are the thin live layer on top.
 */

export const PRESENCE_STATES = ['available', 'away', 'busy'] as const;
export type PresenceState = (typeof PRESENCE_STATES)[number];

export type HandoffType = 'warm' | 'cold';
export type RoutingStrategy = 'round_robin' | 'skill' | 'specific';

export interface DeskAgent {
  membershipId: string;
  userId: string;
  status: PresenceState;
  skills: string[];
  /** epoch ms of the last call routed to this agent — round-robin picks the stalest. */
  lastAssignedAt: number | null;
  /** how many live calls this agent currently holds (capacity gate). */
  activeCalls: number;
}

export const presenceInputSchema = z.object({
  status: z.enum(PRESENCE_STATES),
  skills: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
});
export type PresenceInput = z.infer<typeof presenceInputSchema>;

export const transferRequestSchema = z.object({
  callId: z.string().uuid(),
  handoffType: z.enum(['warm', 'cold']).default('cold'),
  strategy: z.enum(['round_robin', 'skill', 'specific']).default('round_robin'),
  requiredSkill: z.string().trim().max(40).optional(),
  specificMembershipId: z.string().uuid().optional(),
});
export type TransferRequestInput = z.infer<typeof transferRequestSchema>;

/** Max concurrent live calls a human agent can hold before they're skipped by routing. */
export const MAX_AGENT_CONCURRENCY = 1;

/**
 * Pick the human agent to route a transfer to. Only `available` agents under their concurrency cap
 * are eligible. `specific` targets one agent; `skill` requires the skill; `round_robin` (and the
 * fallback for skill/specific when unfilled) picks the agent idle the longest (null = never
 * assigned → highest priority). Returns null when nobody is eligible (→ caller queues/falls back).
 */
export function pickDeskAgent(
  agents: DeskAgent[],
  opts: { strategy: RoutingStrategy; requiredSkill?: string; specificMembershipId?: string },
): DeskAgent | null {
  const eligible = agents.filter(
    (a) => a.status === 'available' && a.activeCalls < MAX_AGENT_CONCURRENCY,
  );
  if (eligible.length === 0) return null;

  if (opts.strategy === 'specific') {
    return eligible.find((a) => a.membershipId === opts.specificMembershipId) ?? null;
  }
  let pool = eligible;
  if (opts.strategy === 'skill' && opts.requiredSkill) {
    pool = eligible.filter((a) => a.skills.includes(opts.requiredSkill!));
    if (pool.length === 0) return null; // no skilled agent — don't misroute
  }
  // Round-robin: the least-recently-assigned wins (never-assigned first).
  return [...pool].sort((a, b) => (a.lastAssignedAt ?? -1) - (b.lastAssignedAt ?? -1))[0]!;
}

/** Build the spoken warm-handoff summary the AI reads to the human before connecting. */
export function buildWarmSummary(ctx: {
  contactName?: string;
  leadScore?: number;
  reason?: string;
  aiSummary?: string;
}): string {
  const who = ctx.contactName ? `caller ${ctx.contactName}` : 'the caller';
  const parts = [`Transferring ${who}.`];
  if (ctx.reason) parts.push(`Reason: ${ctx.reason}.`);
  if (typeof ctx.leadScore === 'number') parts.push(`Lead score ${ctx.leadScore}.`);
  if (ctx.aiSummary) parts.push(`So far: ${ctx.aiSummary}`);
  return parts.join(' ');
}

// ── Queue + SLA ───────────────────────────────────────────────────────────────

export interface QueueItem {
  callId: string;
  waitStartedAt: number; // epoch ms
  handoffType: HandoffType;
  assignedMembershipId: string | null;
}

/** Default SLA: a waiting transfer should be answered within this many seconds. */
export const DESK_SLA_SECONDS = 30;

export interface QueueStat {
  callId: string;
  waitSeconds: number;
  slaBreached: boolean;
  assigned: boolean;
}

/** Compute wait time + SLA breach per queued transfer at `now`. */
export function summarizeQueue(
  items: QueueItem[],
  now: number,
  slaSeconds = DESK_SLA_SECONDS,
): { items: QueueStat[]; waiting: number; breached: number; longestWaitSeconds: number } {
  const stats: QueueStat[] = items.map((it) => {
    const waitSeconds = Math.max(0, Math.floor((now - it.waitStartedAt) / 1000));
    return {
      callId: it.callId,
      waitSeconds,
      slaBreached: !it.assignedMembershipId && waitSeconds > slaSeconds,
      assigned: it.assignedMembershipId !== null,
    };
  });
  const unassigned = stats.filter((s) => !s.assigned);
  return {
    items: stats,
    waiting: unassigned.length,
    breached: stats.filter((s) => s.slaBreached).length,
    longestWaitSeconds: unassigned.reduce((m, s) => Math.max(m, s.waitSeconds), 0),
  };
}
