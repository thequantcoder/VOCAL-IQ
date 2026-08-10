import {
  ValidationError,
  type WhatsappCallSettings,
  parseWhatsappCallSettings,
  toGraphCalling,
  whatsappCallSettingsSchema,
} from '@vocaliq/shared';
import type { PrismaService } from '../db/prisma.service';
import type { WaAdapterResolver } from './whatsapp-calling.service';

/**
 * WhatsApp call settings (WAC-05). The tenant's calling config (hours/icons/callback/codecs/voicemail)
 * is stored in the tenant `settings` JSON (the Slack-config pattern, RLS-scoped) AND synced to Meta
 * via the provider-router adapter when calling creds exist (gated → local-only otherwise). On write we
 * sync to Meta FIRST so a Meta rejection surfaces before we persist a config Meta won't honour.
 */
export class WhatsAppCallSettingsService {
  constructor(
    private readonly db: PrismaService,
    private readonly adapterFor: WaAdapterResolver,
  ) {}

  async get(tenantId: string): Promise<WhatsappCallSettings> {
    const t = await this.db.withTenant(tenantId, (tx) =>
      tx.tenant.findFirst({ where: { id: tenantId }, select: { settings: true } }),
    );
    const raw = (t?.settings as { whatsappCalling?: unknown } | null)?.whatsappCalling;
    const parsed = whatsappCallSettingsSchema.safeParse(raw ?? {});
    return parsed.success ? parsed.data : whatsappCallSettingsSchema.parse({});
  }

  async set(tenantId: string, input: unknown): Promise<WhatsappCallSettings> {
    let settings: WhatsappCallSettings;
    try {
      settings = parseWhatsappCallSettings(input);
    } catch (err) {
      throw new ValidationError(err instanceof Error ? err.message : 'Invalid call settings');
    }

    // Sync to Meta first (when configured) so a rejection is surfaced before we persist locally.
    const adapter = await this.adapterFor(tenantId).catch(() => null);
    if (adapter) {
      try {
        await adapter.updateSettings(toGraphCalling(settings));
      } catch (err) {
        throw new ValidationError(
          `WhatsApp rejected the call settings${err instanceof Error ? `: ${err.message}` : ''}`,
        );
      }
    }

    const t = await this.db.withTenant(tenantId, (tx) =>
      tx.tenant.findFirst({ where: { id: tenantId }, select: { settings: true } }),
    );
    const merged = { ...((t?.settings as object) ?? {}), whatsappCalling: settings };
    await this.db.withTenant(tenantId, (tx) =>
      tx.tenant.update({ where: { id: tenantId }, data: { settings: merged as object } }),
    );
    return settings;
  }
}
