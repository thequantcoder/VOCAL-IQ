import type { PrismaClient } from '@vocaliq/db';
import {
  type CallbackRetry,
  type CallingRules,
  type DueCallback,
  callbackRetrySchema,
  isCallbackDue,
  nextCallbackAttempt,
} from '@vocaliq/shared';

/**
 * Callback dialer tick (Day 80). Auto-dials every caller-requested callback that is DUE — its
 * requested (or retry) time has arrived AND it is inside the caller's legal calling window, evaluated
 * in the caller's timezone (the shared, unit-tested `isCallbackDue`, so a 2am request is never dialed
 * early — self-audit A + C). A missed dial is retried per policy, then marked `missed`. This pure
 * runner takes injected deps so it is tested without Redis/Postgres/a live dialer. Like the campaign
 * scheduler, the live outbound placement is gated (Day 10) — here `dial` reports the outcome.
 */

export interface SchedulerCallback extends DueCallback {
  tenantId: string;
  phone: string;
  attempts: number;
}

/** What a dial attempt produced. `enqueued` = handed to the (gated) live path; resolved later. */
export type DialOutcome = 'enqueued' | 'connected' | 'missed';

export interface CallbackDialerDeps {
  /** Scheduled callbacks across all tenants (workers legitimately span tenants). */
  findScheduled(): Promise<SchedulerCallback[]>;
  /** Place the callback (production: enqueue the metered outbound call). Reports the outcome. */
  dial(cb: SchedulerCallback): Promise<DialOutcome>;
  markCompleted(id: string): Promise<void>;
  markRetry(id: string, attempts: number, nextAttemptAt: Date): Promise<void>;
  markMissed(id: string, attempts: number): Promise<void>;
  log(message: string): void;
}

export interface CallbackTickResult {
  considered: number;
  due: number;
  dialed: number;
}

export async function runCallbackDialerTick(
  deps: CallbackDialerDeps,
  now: Date,
  rules?: CallingRules,
  retry: CallbackRetry = callbackRetrySchema.parse({}),
): Promise<CallbackTickResult> {
  const callbacks = await deps.findScheduled();
  let due = 0;
  let dialed = 0;

  for (const cb of callbacks) {
    if (!isCallbackDue(cb, now, rules)) continue; // held until its time AND inside calling hours
    due++;
    try {
      const outcome = await deps.dial(cb);
      const attempts = cb.attempts + 1;
      if (outcome === 'connected') {
        await deps.markCompleted(cb.id);
        dialed++;
      } else if (outcome === 'missed') {
        // Retry later, or give up (→ missed) once out of attempts.
        const decision = nextCallbackAttempt(attempts, now, retry);
        if (decision.action === 'retry')
          await deps.markRetry(cb.id, attempts, decision.nextAttemptAt);
        else await deps.markMissed(cb.id, attempts);
      } else {
        // enqueued to the (gated) live path — it moves to `dialing`; the disposition resolves it later.
        dialed++;
      }
    } catch (err) {
      // Isolate one callback's failure so the rest of the tick still runs.
      deps.log(`[callback ${cb.id}] dial error: ${(err as Error).message}`);
    }
  }
  return { considered: callbacks.length, due, dialed };
}

/**
 * Production deps backed by the admin client (workers span tenants for this sweep). `dial` marks the
 * callback `dialing` + increments attempts and returns `enqueued`; the live outbound placement is
 * gated (Day 10 pattern) — the enqueue slots in at the marked line without touching the due/window
 * logic. The disposition handler (gated) later calls markCompleted/markRetry/markMissed via the same
 * shared `nextCallbackAttempt` used above.
 */
export function createDbCallbackDialerDeps(
  admin: PrismaClient,
  log: (msg: string) => void,
): CallbackDialerDeps {
  return {
    findScheduled: async () => {
      const rows = await admin.callback.findMany({
        where: { status: 'scheduled' },
        select: {
          id: true,
          tenantId: true,
          phone: true,
          requestedAt: true,
          nextAttemptAt: true,
          timezone: true,
          status: true,
          attempts: true,
        },
        take: 500,
      });
      return rows.map((r) => ({
        id: r.id,
        tenantId: r.tenantId,
        phone: r.phone,
        requestedAt: r.requestedAt,
        nextAttemptAt: r.nextAttemptAt,
        timezone: r.timezone,
        status: r.status as DueCallback['status'],
        attempts: r.attempts,
      }));
    },
    dial: async (cb) => {
      await admin.callback.update({
        where: { id: cb.id },
        data: { status: 'dialing', attempts: { increment: 1 } },
      });
      // TODO(live): enqueue the metered outbound call for this callback here once a funded number is
      // attached (Twilio live is gated — see Day 10). The due + calling-window checks above already
      // guarantee this is a legal time to call.
      return 'enqueued';
    },
    markCompleted: async (id) => {
      await admin.callback.update({ where: { id }, data: { status: 'completed' } });
    },
    markRetry: async (id, attempts, nextAttemptAt) => {
      await admin.callback.update({
        where: { id },
        data: { status: 'scheduled', attempts, nextAttemptAt },
      });
    },
    markMissed: async (id, attempts) => {
      await admin.callback.update({ where: { id }, data: { status: 'missed', attempts } });
    },
    log,
  };
}
