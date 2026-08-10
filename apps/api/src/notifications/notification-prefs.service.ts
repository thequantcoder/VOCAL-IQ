import { type NotificationPrefs, ValidationError, notificationPrefsSchema } from '@vocaliq/shared';
import type { PrismaService } from '../db/prisma.service';

/**
 * Notification preferences (FOLLOWUP) — the per-tenant event×channel matrix that gates the domain-
 * event fan-out. Stored in the tenant `settings` JSON (RLS-scoped), the same pattern as the Slack
 * config. Only overrides are kept; an absent (event, channel) defaults to enabled (fail-open).
 */
export class NotificationPrefsService {
  constructor(private readonly db: PrismaService) {}

  async getPrefs(tenantId: string): Promise<NotificationPrefs> {
    const t = await this.db.withTenant(tenantId, (tx) =>
      tx.tenant.findFirst({ where: { id: tenantId }, select: { settings: true } }),
    );
    const raw = (t?.settings as { notificationPrefs?: unknown } | null)?.notificationPrefs;
    const parsed = notificationPrefsSchema.safeParse(raw ?? {});
    return parsed.success ? parsed.data : {};
  }

  async setPrefs(tenantId: string, input: unknown): Promise<NotificationPrefs> {
    const parsed = notificationPrefsSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.issues[0]?.message ?? 'Invalid notification preferences',
      );
    }
    const t = await this.db.withTenant(tenantId, (tx) =>
      tx.tenant.findFirst({ where: { id: tenantId }, select: { settings: true } }),
    );
    const settings = { ...((t?.settings as object) ?? {}), notificationPrefs: parsed.data };
    await this.db.withTenant(tenantId, (tx) =>
      tx.tenant.update({ where: { id: tenantId }, data: { settings: settings as object } }),
    );
    return parsed.data;
  }
}
