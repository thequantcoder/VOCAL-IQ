import {
  type MessengerCallSettings,
  ValidationError,
  messengerCallSettingsSchema,
  parseMessengerCallSettings,
  toGraphMessengerCalling,
} from '@vocaliq/shared';
import type { PrismaService } from '../db/prisma.service';
import type { MeAdapterResolver } from './messenger-calling.service';

/**
 * Messenger call settings (MEC-05). The tenant's calling config (availability hours + call-button
 * visibility) is stored in the tenant `settings` JSON (RLS-scoped) AND synced to Meta via the
 * provider-router adapter when calling creds exist (gated → local-only otherwise). On write we sync to
 * Meta FIRST so a Meta rejection surfaces before we persist a config Meta won't honour. The WhatsApp
 * `WhatsAppCallSettingsService` sibling.
 */
export class MessengerCallSettingsService {
  constructor(
    private readonly db: PrismaService,
    private readonly adapterFor: MeAdapterResolver,
  ) {}

  async get(tenantId: string): Promise<MessengerCallSettings> {
    const t = await this.db.withTenant(tenantId, (tx) =>
      tx.tenant.findFirst({ where: { id: tenantId }, select: { settings: true } }),
    );
    const raw = (t?.settings as { messengerCalling?: unknown } | null)?.messengerCalling;
    const parsed = messengerCallSettingsSchema.safeParse(raw ?? {});
    return parsed.success ? parsed.data : messengerCallSettingsSchema.parse({});
  }

  async set(tenantId: string, input: unknown): Promise<MessengerCallSettings> {
    let settings: MessengerCallSettings;
    try {
      settings = parseMessengerCallSettings(input);
    } catch (err) {
      throw new ValidationError(err instanceof Error ? err.message : 'Invalid call settings');
    }

    // Sync to Meta first (when configured) so a rejection is surfaced before we persist locally.
    const adapter = await this.adapterFor(tenantId).catch(() => null);
    if (adapter) {
      try {
        await adapter.updateSettings(toGraphMessengerCalling(settings));
      } catch (err) {
        throw new ValidationError(
          `Messenger rejected the call settings${err instanceof Error ? `: ${err.message}` : ''}`,
        );
      }
    }

    const t = await this.db.withTenant(tenantId, (tx) =>
      tx.tenant.findFirst({ where: { id: tenantId }, select: { settings: true } }),
    );
    const merged = { ...((t?.settings as object) ?? {}), messengerCalling: settings };
    await this.db.withTenant(tenantId, (tx) =>
      tx.tenant.update({ where: { id: tenantId }, data: { settings: merged as object } }),
    );
    return settings;
  }
}
