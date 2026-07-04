import { z } from 'zod';

/**
 * SaaS ops toolkit (Day 49) — the pure core. Credit draining (bonus-first), low-balance
 * detection, trial-limit enforcement, support-ticket state transitions, and per-plan number
 * limits are all deterministic + unit-tested here; the api persists via the existing Wallet /
 * SupportTicket / PhoneNumber / Notification models (self-audit D — credit maths — + B).
 */

// ── Credits ───────────────────────────────────────────────────────────────────

export interface CreditBalances {
  prepaidCents: number;
  bonusCents: number;
}

export interface DrainResult extends CreditBalances {
  drainedCents: number;
  /** Amount that could NOT be covered by any credits (would go negative). */
  shortfallCents: number;
}

/**
 * Drain `cents` from a wallet, spending BONUS credits first (perks are "use it or lose it"),
 * then prepaid. Never drives a balance below zero — an uncovered remainder is reported as a
 * shortfall so the caller can block/auto-recharge. Pure: returns the new balances.
 */
export function drainCredits(balances: CreditBalances, cents: number): DrainResult {
  const amount = Math.max(0, Math.round(cents));
  const fromBonus = Math.min(balances.bonusCents, amount);
  const remainder = amount - fromBonus;
  const fromPrepaid = Math.min(balances.prepaidCents, remainder);
  const shortfallCents = remainder - fromPrepaid;
  return {
    prepaidCents: balances.prepaidCents - fromPrepaid,
    bonusCents: balances.bonusCents - fromBonus,
    drainedCents: fromBonus + fromPrepaid,
    shortfallCents,
  };
}

/** Total spendable credits. */
export const totalCredits = (b: CreditBalances): number => b.prepaidCents + b.bonusCents;

/** Below the alert threshold → surface a low-balance notification. */
export function isLowBalance(balances: CreditBalances, thresholdCents: number): boolean {
  return totalCredits(balances) < Math.max(0, thresholdCents);
}

// ── Trial limits ──────────────────────────────────────────────────────────────

export const trialLimitsSchema = z.object({
  maxAgents: z.number().int().min(0).default(1),
  maxCalls: z.number().int().min(0).default(50),
  trialDays: z.number().int().min(0).default(14),
});
export type TrialLimits = z.infer<typeof trialLimitsSchema>;

export interface TrialUsage {
  agents: number;
  calls: number;
  ageDays: number;
}

export type TrialCheck = { allowed: true } | { allowed: false; reason: string };

/**
 * Enforce a trial: the trial has expired after `trialDays`, and while active an operation is
 * blocked once its resource hits the cap. `kind` picks which limit to check for a create.
 */
export function checkTrialLimit(
  limits: TrialLimits,
  usage: TrialUsage,
  kind: 'agent' | 'call',
): TrialCheck {
  if (usage.ageDays > limits.trialDays) {
    return { allowed: false, reason: 'Trial period has ended — upgrade to continue' };
  }
  if (kind === 'agent' && usage.agents >= limits.maxAgents) {
    return { allowed: false, reason: `Trial is limited to ${limits.maxAgents} agent(s)` };
  }
  if (kind === 'call' && usage.calls >= limits.maxCalls) {
    return { allowed: false, reason: `Trial is limited to ${limits.maxCalls} call(s)` };
  }
  return { allowed: true };
}

// ── Support tickets ─────────────────────────────────────────────────────────

export const TICKET_STATUSES = ['OPEN', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];
export const TICKET_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

const TICKET_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  OPEN: ['IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED'],
  IN_PROGRESS: ['WAITING', 'RESOLVED', 'CLOSED'],
  WAITING: ['IN_PROGRESS', 'RESOLVED', 'CLOSED'],
  RESOLVED: ['CLOSED', 'IN_PROGRESS'], // can reopen a resolved ticket
  CLOSED: [], // terminal
};

/** Is moving a ticket from `from` to `to` a legal transition? */
export function canTransitionTicket(from: TicketStatus, to: TicketStatus): boolean {
  return TICKET_TRANSITIONS[from]?.includes(to) ?? false;
}

// ── Phone-number pool ─────────────────────────────────────────────────────────

/** Whether a tenant with `currentAssigned` numbers may claim another under `planLimit`. */
export function canAssignNumber(currentAssigned: number, planLimit: number): boolean {
  return planLimit <= 0 ? false : currentAssigned < planLimit;
}
