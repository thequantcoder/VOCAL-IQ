import { SubscriptionStatus } from '@vocaliq/shared';

/**
 * Dunning state machine (pure). On a failed payment a subscription goes PAST_DUE and
 * enters a retry+grace window; once retries are exhausted it is CANCELLED (suspended).
 * A successful payment recovers it to ACTIVE. Mapped onto the DB SubscriptionStatus
 * enum (no GRACE/SUSPENDED value — grace is the PAST_DUE window bounded by maxRetries).
 */

export type DunningEvent = 'payment_failed' | 'payment_succeeded' | 'retry_exhausted';

export interface DunningInput {
  status: SubscriptionStatus;
  failedAttempts: number;
  maxRetries?: number; // default 3
}

export interface DunningDecision {
  status: SubscriptionStatus;
  failedAttempts: number;
  /** Side-effect the caller should perform (send email / suspend access). */
  action: 'none' | 'send_dunning_email' | 'suspend' | 'reactivate';
}

export function nextDunningState(input: DunningInput, event: DunningEvent): DunningDecision {
  const maxRetries = input.maxRetries ?? 3;

  if (event === 'payment_succeeded') {
    const reactivated = input.status !== SubscriptionStatus.ACTIVE;
    return {
      status: SubscriptionStatus.ACTIVE,
      failedAttempts: 0,
      action: reactivated ? 'reactivate' : 'none',
    };
  }

  if (event === 'payment_failed') {
    const failedAttempts = input.failedAttempts + 1;
    if (failedAttempts >= maxRetries) {
      return { status: SubscriptionStatus.CANCELLED, failedAttempts, action: 'suspend' };
    }
    return { status: SubscriptionStatus.PAST_DUE, failedAttempts, action: 'send_dunning_email' };
  }

  // retry_exhausted
  return {
    status: SubscriptionStatus.CANCELLED,
    failedAttempts: Math.max(input.failedAttempts, input.maxRetries ?? 3),
    action: 'suspend',
  };
}
