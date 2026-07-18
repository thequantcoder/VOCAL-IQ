import type { TxClient } from '@vocaliq/db';
import { buildSystemPrompt, personaSchema } from '@vocaliq/shared';
import type { PrismaService } from '../db/prisma.service';
import type { MeInboundRouter, MessengerInboundRouting } from './messenger-calling.service';

/**
 * Inbound Messenger-call routing (MEC-04): resolve which agent answers a call that landed on the
 * business Page. Unlike WhatsApp (which matches a `PhoneNumber.e164`), Messenger has NO phone numbers —
 * a Page has no PSTN identity to key an assignment on — so we answer with the tenant's first PUBLISHED
 * agent (deterministic by creation). A per-Page → agent mapping is a future enhancement. Returns `null`
 * when the tenant has no publishable agent (the control plane then rejects gracefully). Tenant-scoped
 * (`withTenant` → RLS).
 */

/** Default opener when the agent has no bespoke greeting configured. */
export const ME_DEFAULT_GREETING = 'Hello! Thanks for calling. How can I help you today?';

export class MessengerInboundRouter implements MeInboundRouter {
  constructor(private readonly db: PrismaService) {}

  async resolveInboundAgent(
    tenantId: string,
    _pageId?: string,
  ): Promise<MessengerInboundRouting | null> {
    return this.db.withTenant(tenantId, async (tx) => {
      const agent = await tx.agent.findFirst({
        where: { status: 'PUBLISHED' },
        orderBy: { createdAt: 'asc' },
        select: { id: true, persona: true },
      });
      if (!agent) return null;
      const flowVersionId = await this.activeFlowVersion(tx, agent.id);
      const persona = personaSchema.safeParse(agent.persona ?? {});
      return {
        agentId: agent.id,
        ...(flowVersionId ? { flowVersionId } : {}),
        systemPrompt: persona.success ? buildSystemPrompt(persona.data) : '',
        greeting: ME_DEFAULT_GREETING,
      };
    });
  }

  /** The latest PUBLISHED version of the agent's active flow (if any). */
  private async activeFlowVersion(tx: TxClient, agentId: string): Promise<string | null> {
    const flow = await tx.flow.findFirst({
      where: { agentId, isActive: true },
      select: { id: true },
    });
    if (!flow) return null;
    const version = await tx.flowVersion.findFirst({
      where: { flowId: flow.id, publishedAt: { not: null } },
      orderBy: { version: 'desc' },
      select: { id: true },
    });
    return version?.id ?? null;
  }
}
