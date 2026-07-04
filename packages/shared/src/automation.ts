import { z } from 'zod';

/**
 * Cross-channel automations (Day 47) — the pure core. An automation treats a call as one step
 * in a larger flow: a trigger event (call ended / disposition set / lead status changed),
 * optionally filtered, fires an ordered list of actions (send a message, sync the CRM, POST a
 * webhook, create a task, notify). The trigger-matching + validation live here (deterministic,
 * unit-tested); the api runs the actions via injected executors (self-audit A + B).
 */

export const AUTOMATION_EVENTS = ['call_ended', 'disposition_set', 'lead_status_changed'] as const;
export type AutomationEventType = (typeof AUTOMATION_EVENTS)[number];

// ── Trigger ───────────────────────────────────────────────────────────────────

export const automationTriggerSchema = z.object({
  event: z.enum(AUTOMATION_EVENTS),
  filters: z
    .object({
      disposition: z.string().max(60).optional(),
      leadStatus: z.string().max(60).optional(),
      agentId: z.string().uuid().optional(),
    })
    .default({}),
});
export type AutomationTrigger = z.infer<typeof automationTriggerSchema>;

// ── Actions ───────────────────────────────────────────────────────────────────

export const ACTION_TYPES = ['send_message', 'crm_sync', 'webhook', 'task', 'notify'] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export const automationActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('send_message'),
    channel: z.enum(['WHATSAPP', 'SMS']),
    templateId: z.string().uuid().optional(),
    body: z.string().max(1024).optional(),
  }),
  z.object({ type: z.literal('crm_sync') }),
  z.object({ type: z.literal('webhook'), url: z.string().url() }),
  z.object({ type: z.literal('task'), title: z.string().min(1).max(200) }),
  z.object({ type: z.literal('notify'), message: z.string().min(1).max(500) }),
]);
export type AutomationAction = z.infer<typeof automationActionSchema>;

export const automationInputSchema = z.object({
  name: z.string().min(1).max(120),
  trigger: automationTriggerSchema,
  actions: z.array(automationActionSchema).min(1).max(10),
  active: z.boolean().default(true),
});
export type AutomationInput = z.infer<typeof automationInputSchema>;

// ── Event + matching ──────────────────────────────────────────────────────────

/** The runtime event dispatched when something happens on a call/lead. */
export interface AutomationEvent {
  event: AutomationEventType;
  callId?: string;
  agentId?: string;
  disposition?: string;
  leadStatus?: string;
  contactId?: string;
  /** Destination for message actions (phone), when known. */
  to?: string;
}

/**
 * Does `event` fire this trigger? The event type must match, and every configured filter must
 * match the event (an unset filter is a wildcard). Filters are ANDed — a narrow trigger only
 * fires on exactly the disposition/status/agent it targets (no accidental over-firing).
 */
export function matchesTrigger(trigger: AutomationTrigger, event: AutomationEvent): boolean {
  if (trigger.event !== event.event) return false;
  const f = trigger.filters;
  if (f.disposition && f.disposition !== event.disposition) return false;
  if (f.leadStatus && f.leadStatus !== event.leadStatus) return false;
  if (f.agentId && f.agentId !== event.agentId) return false;
  return true;
}

/** A concise human label for an action (UI + audit). */
export function actionLabel(action: AutomationAction): string {
  switch (action.type) {
    case 'send_message':
      return `Send ${action.channel} message`;
    case 'crm_sync':
      return 'Sync to CRM';
    case 'webhook':
      return 'POST webhook';
    case 'task':
      return `Create task: ${action.title}`;
    case 'notify':
      return `Notify: ${action.message}`;
  }
}
