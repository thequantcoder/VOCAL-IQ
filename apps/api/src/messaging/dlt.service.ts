import { NotFoundError, ValidationError } from '@vocaliq/shared';
import type { PrismaService } from '../db/prisma.service';
import type { Actor } from '../vault/vault.service';

/**
 * India DLT (TRAI) compliance engine (GME-06). SMS to +91 numbers is legally required to go out
 * under a DLT-registered entity/header with a DLT-approved content template — a message whose body
 * doesn't match a registered template must be blocked. This service stores a tenant's registered
 * templates and resolves the one matching a given message body; the send path (messaging.service)
 * blocks non-compliant India SMS and stamps the resolved template/sender/entity ids onto the send.
 */

/** The DLT ids a compliant India SMS carries. */
export interface DltResolution {
  dltTemplateId: string;
  senderId: string;
  entityId: string;
}

/** The resolver the send path depends on (an interface so tests can inject a fake). */
export interface DltResolver {
  resolveForBody(tenantId: string, body: string): Promise<DltResolution | null>;
}

/**
 * Turn a DLT template body (with `{#var#}` placeholders) into an anchored regex that matches a
 * rendered message: the fixed text must match exactly and each `{#var#}` stands in for any value.
 */
export function dltTemplateToRegex(templateBody: string): RegExp {
  const parts = templateBody.split(/\{#var#\}/gi);
  const escaped = parts.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`^${escaped.join('[\\s\\S]*?')}$`);
}

/** Does a rendered message match a DLT-approved template body? (pure — the core compliance check) */
export function dltTemplateMatches(templateBody: string, messageBody: string): boolean {
  return dltTemplateToRegex(templateBody).test(messageBody);
}

export interface DltTemplateDto {
  id: string;
  entityId: string;
  senderId: string;
  dltTemplateId: string;
  category: string;
  body: string;
  active: boolean;
  createdAt: Date;
}

export class DltService implements DltResolver {
  constructor(private readonly db: PrismaService) {}

  async register(
    actor: Actor,
    input: {
      entityId: string;
      senderId: string;
      dltTemplateId: string;
      category?: string;
      body: string;
    },
  ): Promise<DltTemplateDto> {
    const entityId = input.entityId?.trim();
    const senderId = input.senderId?.trim();
    const dltTemplateId = input.dltTemplateId?.trim();
    const body = input.body?.trim();
    if (!entityId || !senderId || !dltTemplateId || !body) {
      throw new ValidationError('entityId, senderId, dltTemplateId and body are all required');
    }
    const row = await this.db.withTenant(actor.tenantId, (tx) =>
      tx.dltTemplate.create({
        data: {
          tenantId: actor.tenantId,
          entityId,
          senderId,
          dltTemplateId,
          category: input.category?.trim() || 'transactional',
          body,
          active: true,
        },
        select: SELECT,
      }),
    );
    return toDto(row);
  }

  async list(tenantId: string): Promise<DltTemplateDto[]> {
    const rows = await this.db.withTenant(tenantId, (tx) =>
      tx.dltTemplate.findMany({ orderBy: { createdAt: 'desc' }, select: SELECT }),
    );
    return rows.map(toDto);
  }

  async delete(actor: Actor, id: string): Promise<{ id: string }> {
    const existing = await this.db.withTenant(actor.tenantId, (tx) =>
      tx.dltTemplate.findFirst({ where: { id }, select: { id: true } }),
    );
    if (!existing) throw new NotFoundError('DLT template not found');
    await this.db.withTenant(actor.tenantId, (tx) => tx.dltTemplate.delete({ where: { id } }));
    return { id };
  }

  /** The registered template whose body matches this message (the first active match), or null. */
  async resolveForBody(tenantId: string, body: string): Promise<DltResolution | null> {
    const rows = await this.db.withTenant(tenantId, (tx) =>
      tx.dltTemplate.findMany({
        where: { active: true },
        select: { dltTemplateId: true, senderId: true, entityId: true, body: true },
      }),
    );
    for (const t of rows) {
      if (dltTemplateMatches(t.body, body)) {
        return { dltTemplateId: t.dltTemplateId, senderId: t.senderId, entityId: t.entityId };
      }
    }
    return null;
  }
}

const SELECT = {
  id: true,
  entityId: true,
  senderId: true,
  dltTemplateId: true,
  category: true,
  body: true,
  active: true,
  createdAt: true,
} as const;

function toDto(row: DltTemplateDto): DltTemplateDto {
  return row;
}
