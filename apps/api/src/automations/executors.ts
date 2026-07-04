import { checkPublicHttpUrl } from '@vocaliq/shared';
import type { PrismaService } from '../db/prisma.service';
import type { IntegrationsService } from '../integrations/integrations.service';
import type { MessagingService } from '../messaging/messaging.service';
import type { ActionExecutors } from './automations.service';

/**
 * Production action executors (Day 47). Each maps an automation action onto an existing,
 * already-safe subsystem: messaging send (Day 44, opt-out-checked + metered), CRM sync
 * (Day 40, sealed tokens), an SSRF-guarded webhook POST (reusing the Day-46 URL guard), and
 * in-app notifications/tasks. Every executor is best-effort and returns a typed outcome; the
 * service audits it. Missing prerequisites (e.g. no `to` for a message) are `skipped`, not errors.
 */
export function buildActionExecutors(deps: {
  db: PrismaService;
  messaging: MessagingService;
  integrations: IntegrationsService;
}): ActionExecutors {
  const { db, messaging, integrations } = deps;
  return {
    send_message: async (tenantId, event, action) => {
      if (action.type !== 'send_message') return { status: 'skipped' };
      if (!event.to) return { status: 'skipped', detail: 'no recipient on the event' };
      try {
        const msg = await messaging.send(tenantId, {
          channel: action.channel,
          to: event.to,
          ...(action.templateId ? { templateId: action.templateId } : {}),
          ...(action.body ? { body: action.body } : {}),
          ...(event.callId ? { callId: event.callId } : {}),
          ...(event.contactId ? { contactId: event.contactId } : {}),
        });
        return { status: 'ok', detail: msg.status };
      } catch (err) {
        return { status: 'error', detail: (err as Error).message };
      }
    },

    crm_sync: async (tenantId, event) => {
      if (!event.callId) return { status: 'skipped', detail: 'no call to sync' };
      try {
        const res = await integrations.syncCall(tenantId, event.callId);
        return { status: 'ok', detail: `synced ${res.synced}` };
      } catch (err) {
        return { status: 'error', detail: (err as Error).message };
      }
    },

    webhook: async (_tenantId, event, action) => {
      if (action.type !== 'webhook') return { status: 'skipped' };
      const check = checkPublicHttpUrl(action.url);
      if (!check.ok) return { status: 'error', detail: `blocked URL: ${check.reason}` };
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      try {
        const res = await fetch(action.url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ event: event.event, callId: event.callId ?? null }),
          signal: controller.signal,
        });
        return res.ok
          ? { status: 'ok', detail: String(res.status) }
          : { status: 'error', detail: `webhook ${res.status}` };
      } catch (err) {
        return { status: 'error', detail: (err as Error).message };
      } finally {
        clearTimeout(timer);
      }
    },

    task: async (tenantId, event, action) => {
      if (action.type !== 'task') return { status: 'skipped' };
      await db.withTenant(tenantId, (tx) =>
        tx.notification.create({
          data: {
            tenantId,
            channel: 'task',
            payload: { title: action.title, callId: event.callId ?? null } as object,
          },
        }),
      );
      return { status: 'ok' };
    },

    notify: async (tenantId, event, action) => {
      if (action.type !== 'notify') return { status: 'skipped' };
      await db.withTenant(tenantId, (tx) =>
        tx.notification.create({
          data: {
            tenantId,
            channel: 'inapp',
            payload: { message: action.message, callId: event.callId ?? null } as object,
          },
        }),
      );
      return { status: 'ok' };
    },
  };
}
