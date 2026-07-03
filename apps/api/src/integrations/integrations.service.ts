import {
  CONNECTOR_META,
  type IntegrationConnect,
  type IntegrationType,
  NotFoundError,
  ValidationError,
  integrationConnectSchema,
  mapCallToSync,
} from '@vocaliq/shared';
import { PrismaService } from '../db/prisma.service';
import { type ConnectorFactory, defaultConnectorFactory } from './connectors/factory';

/**
 * Integrations service (Day 40). Owns per-tenant CRM/helpdesk connections and the post-call
 * sync. Tokens are sealed at rest and NEVER returned to a client (list is masked). `syncCall`
 * maps a completed call to the normalized payload (shared `mapCallToSync`) and dispatches to
 * the tenant's connectors — upsert the contact, and open a ticket when the call went negative.
 * Everything is RLS-scoped via `withTenant`. The connector factory is injected so tests run
 * offline with a spy connector.
 */

interface StoredConfig {
  tokenCipher: string;
  settings: Record<string, string>;
  ticketOnNegative: boolean;
}

export interface IntegrationDto {
  id: string;
  type: IntegrationType;
  label: string;
  ticketOnNegative: boolean;
  settings: Record<string, string>;
  createdAt: Date;
}

export interface SyncResult {
  synced: { type: IntegrationType; contactId: string; ticketId?: string }[];
  skipped: { type: IntegrationType; reason: string }[];
}

// KMS envelope encryption lands Day 57; until then the token is base64-obscured, stored
// server-side, never returned, never logged (same posture as SIP/key-pool creds).
function seal(token: string): string {
  return Buffer.from(token, 'utf8').toString('base64');
}
function open(cipher: string): string {
  return Buffer.from(cipher, 'base64').toString('utf8');
}

export class IntegrationsService {
  private readonly factory: ConnectorFactory;

  constructor(
    private readonly db: PrismaService,
    factory?: ConnectorFactory,
  ) {
    this.factory = factory ?? defaultConnectorFactory();
  }

  /** Connected integrations (masked — token never leaves the service). */
  async list(tenantId: string): Promise<IntegrationDto[]> {
    const rows = await this.db.withTenant(tenantId, (tx) =>
      tx.integration.findMany({ orderBy: { createdAt: 'desc' } }),
    );
    return rows.map((r) => {
      const cfg = (r.config ?? {}) as unknown as Partial<StoredConfig>;
      return {
        id: r.id,
        type: r.type,
        label: CONNECTOR_META[r.type]?.label ?? r.type,
        ticketOnNegative: cfg.ticketOnNegative ?? false,
        settings: cfg.settings ?? {},
        createdAt: r.createdAt,
      };
    });
  }

  /**
   * Connect (or re-connect) a provider: validate, verify the credential works, then seal +
   * store it. One integration per type per tenant — a re-connect replaces the credential.
   */
  async connect(tenantId: string, input: unknown): Promise<IntegrationDto> {
    const parsed = integrationConnectSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid integration');
    }
    const cfg: IntegrationConnect = parsed.data;
    if (!CONNECTOR_META[cfg.type]?.implemented) {
      throw new ValidationError(
        `${CONNECTOR_META[cfg.type]?.label ?? cfg.type} is not yet available`,
      );
    }

    // Fail fast if the credential is bad (self-audit G — never store a dead token silently).
    const connector = this.factory(cfg.type, cfg.accessToken, cfg.settings ?? {});
    if (connector) {
      const ok = await connector.testAuth().catch(() => false);
      if (!ok)
        throw new ValidationError('Could not authenticate with the provider — check the token.');
    }

    const stored: StoredConfig = {
      tokenCipher: seal(cfg.accessToken),
      settings: cfg.settings ?? {},
      ticketOnNegative: cfg.ticketOnNegative,
    };

    return this.db.withTenant(tenantId, async (tx) => {
      const existing = await tx.integration.findFirst({ where: { type: cfg.type } });
      const row = existing
        ? await tx.integration.update({
            where: { id: existing.id },
            data: { config: stored as unknown as object },
          })
        : await tx.integration.create({
            data: { tenantId, type: cfg.type, config: stored as unknown as object },
          });
      return {
        id: row.id,
        type: row.type,
        label: CONNECTOR_META[row.type]?.label ?? row.type,
        ticketOnNegative: stored.ticketOnNegative,
        settings: stored.settings,
        createdAt: row.createdAt,
      };
    });
  }

  async disconnect(tenantId: string, id: string): Promise<{ id: string }> {
    return this.db.withTenant(tenantId, async (tx) => {
      const existing = await tx.integration.findFirst({ where: { id }, select: { id: true } });
      if (!existing) throw new NotFoundError('Integration not found');
      await tx.integration.delete({ where: { id } });
      return { id };
    });
  }

  /** Re-verify a stored credential (manual "test" button). */
  async test(tenantId: string, id: string): Promise<{ ok: boolean }> {
    const connector = await this.loadConnector(tenantId, id);
    if (!connector) return { ok: false };
    return { ok: await connector.testAuth().catch(() => false) };
  }

  /**
   * Sync one completed call to every connected provider: upsert the contact + push the
   * qualification/sentiment note, and open a ticket when the call ended negative. Best-effort
   * per provider — one failing connector never blocks the others.
   */
  async syncCall(tenantId: string, callId: string): Promise<SyncResult> {
    const data = await this.db.withTenant(tenantId, async (tx) => {
      const call = await tx.call.findFirst({
        where: { id: callId },
        select: {
          contactId: true,
          contact: { select: { name: true, email: true, phone: true, fields: true } },
          transcript: { select: { summary: true, sentiment: true, keywords: true } },
        },
      });
      if (!call) throw new NotFoundError('Call not found');
      const lead = call.contactId
        ? await tx.lead.findFirst({
            where: { contactId: call.contactId },
            select: { status: true, score: true },
            orderBy: { updatedAt: 'desc' },
          })
        : null;
      const integrations = await tx.integration.findMany();
      return { call, lead, integrations };
    });

    const result: SyncResult = { synced: [], skipped: [] };
    if (!data.call.contact) {
      return {
        synced: [],
        skipped: data.integrations.map((i) => ({ type: i.type, reason: 'no contact' })),
      };
    }

    for (const integ of data.integrations) {
      const cfg = (integ.config ?? {}) as unknown as Partial<StoredConfig>;
      const connector =
        cfg.tokenCipher && this.factory(integ.type, open(cfg.tokenCipher), cfg.settings ?? {});
      if (!connector) {
        result.skipped.push({ type: integ.type, reason: 'connector not implemented' });
        continue;
      }
      const payload = mapCallToSync({
        contact: {
          name: data.call.contact.name,
          email: data.call.contact.email,
          phone: data.call.contact.phone,
          fields: (data.call.contact.fields ?? {}) as Record<string, unknown>,
        },
        lead: data.lead,
        transcript: data.call.transcript,
        ticketOnNegative: cfg.ticketOnNegative ?? false,
      });
      try {
        const contact = await connector.upsertContact(payload);
        const entry: { type: IntegrationType; contactId: string; ticketId?: string } = {
          type: integ.type,
          contactId: contact.externalId,
        };
        if (payload.openTicket && connector.createTicket) {
          const ticket = await connector.createTicket(payload);
          entry.ticketId = ticket.externalId;
        }
        result.synced.push(entry);
      } catch (err) {
        result.skipped.push({ type: integ.type, reason: (err as Error).message });
      }
    }
    return result;
  }

  /** Load + decrypt the connector for a stored integration (null when unimplemented). */
  private async loadConnector(tenantId: string, id: string) {
    const row = await this.db.withTenant(tenantId, (tx) =>
      tx.integration.findFirst({ where: { id } }),
    );
    if (!row) throw new NotFoundError('Integration not found');
    const cfg = (row.config ?? {}) as unknown as Partial<StoredConfig>;
    if (!cfg.tokenCipher) return null;
    return this.factory(row.type, open(cfg.tokenCipher), cfg.settings ?? {});
  }
}
