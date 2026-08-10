import {
  type ActionType,
  type AutomationAction,
  type AutomationEvent,
  type AutomationInput,
  NotFoundError,
  actionLabel,
  matchesTrigger,
} from '@vocaliq/shared';
import type { PrismaService } from '../db/prisma.service';

/**
 * Cross-channel automations (Day 47). Store per-tenant trigger→action rules and DISPATCH them
 * when a call/lead event fires: match active automations (pure `matchesTrigger`), then run each
 * action best-effort via an injected executor, auditing every step. Reusing injected executors
 * (messaging send, CRM sync, webhook, …) keeps this service testable + decoupled and lets one
 * call become one step in a larger flow (self-audit A). All reads/writes are RLS-scoped (B).
 */

export type ActionStatus = 'ok' | 'skipped' | 'error';
export interface ActionOutcome {
  status: ActionStatus;
  detail?: string;
}

/** Runs one action for an event. Injected so the service is unit-tested without side effects. */
export type ActionExecutor = (
  tenantId: string,
  event: AutomationEvent,
  action: AutomationAction,
) => Promise<ActionOutcome>;

export type ActionExecutors = Record<ActionType, ActionExecutor>;

export interface AutomationRow {
  id: string;
  name: string;
  event: string;
  filters: Record<string, unknown>;
  actions: AutomationAction[];
  active: boolean;
  updatedAt: Date;
}

export interface DispatchResult {
  matched: number;
  actions: { automationId: string; action: string; status: ActionStatus; detail?: string }[];
}

const asActions = (v: unknown): AutomationAction[] =>
  Array.isArray(v) ? (v as AutomationAction[]) : [];
const asFilters = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {};

export class AutomationsService {
  constructor(
    private readonly db: PrismaService,
    private readonly executors: ActionExecutors,
  ) {}

  // ── CRUD ────────────────────────────────────────────────────────────────────

  async create(tenantId: string, input: AutomationInput): Promise<AutomationRow> {
    const row = await this.db.withTenant(tenantId, (tx) =>
      tx.automation.create({
        data: {
          tenantId,
          name: input.name,
          event: input.trigger.event,
          filters: input.trigger.filters as object,
          actions: input.actions as unknown as object,
          active: input.active,
        },
        select: SELECT,
      }),
    );
    return toRow(row);
  }

  async list(tenantId: string): Promise<AutomationRow[]> {
    const rows = await this.db.withTenant(tenantId, (tx) =>
      tx.automation.findMany({ orderBy: { createdAt: 'desc' }, select: SELECT }),
    );
    return rows.map(toRow);
  }

  async setActive(tenantId: string, id: string, active: boolean): Promise<AutomationRow> {
    const existing = await this.db.withTenant(tenantId, (tx) =>
      tx.automation.findFirst({ where: { id }, select: { id: true } }),
    );
    if (!existing) throw new NotFoundError('Automation not found');
    const row = await this.db.withTenant(tenantId, (tx) =>
      tx.automation.update({ where: { id }, data: { active }, select: SELECT }),
    );
    return toRow(row);
  }

  async remove(tenantId: string, id: string): Promise<{ deleted: true }> {
    const existing = await this.db.withTenant(tenantId, (tx) =>
      tx.automation.findFirst({ where: { id }, select: { id: true } }),
    );
    if (!existing) throw new NotFoundError('Automation not found');
    await this.db.withTenant(tenantId, (tx) => tx.automation.delete({ where: { id } }));
    return { deleted: true };
  }

  // ── Dispatch ──────────────────────────────────────────────────────────────────

  /**
   * Fire an event: run every active automation whose trigger matches, executing its actions in
   * order. Best-effort — one failing action never stops the chain or another automation — and
   * every action outcome is written to the audit log.
   */
  async dispatch(tenantId: string, event: AutomationEvent): Promise<DispatchResult> {
    const candidates = await this.db.withTenant(tenantId, (tx) =>
      tx.automation.findMany({
        where: { active: true, event: event.event },
        select: { id: true, filters: true, actions: true },
      }),
    );

    const result: DispatchResult = { matched: 0, actions: [] };
    for (const automation of candidates) {
      const trigger = { event: event.event, filters: asFilters(automation.filters) };
      if (!matchesTrigger(trigger as never, event)) continue;
      result.matched += 1;

      for (const action of asActions(automation.actions)) {
        const executor = this.executors[action.type];
        let outcome: ActionOutcome;
        try {
          outcome = executor
            ? await executor(tenantId, event, action)
            : { status: 'skipped', detail: 'no executor' };
        } catch (err) {
          outcome = { status: 'error', detail: (err as Error).message };
        }
        await this.audit(tenantId, automation.id, action, outcome);
        result.actions.push({
          automationId: automation.id,
          action: actionLabel(action),
          status: outcome.status,
          ...(outcome.detail ? { detail: outcome.detail } : {}),
        });
      }
    }
    return result;
  }

  private async audit(
    tenantId: string,
    automationId: string,
    action: AutomationAction,
    outcome: ActionOutcome,
  ): Promise<void> {
    await this.db.withTenant(tenantId, (tx) =>
      tx.auditLog.create({
        data: {
          tenantId,
          action: 'automation.action',
          target: action.type,
          meta: { automationId, status: outcome.status, detail: outcome.detail ?? null } as object,
        },
      }),
    );
  }
}

const SELECT = {
  id: true,
  name: true,
  event: true,
  filters: true,
  actions: true,
  active: true,
  updatedAt: true,
} as const;

function toRow(r: {
  id: string;
  name: string;
  event: string;
  filters: unknown;
  actions: unknown;
  active: boolean;
  updatedAt: Date;
}): AutomationRow {
  return {
    id: r.id,
    name: r.name,
    event: r.event,
    filters: asFilters(r.filters),
    actions: asActions(r.actions),
    active: r.active,
    updatedAt: r.updatedAt,
  };
}
