import type { TxClient } from '@vocaliq/db';
import { buildSystemPrompt, personaSchema } from '@vocaliq/shared';
import type { PrismaService } from '../db/prisma.service';

/**
 * Inbound WhatsApp-call routing (WAC-04): resolve which agent answers a call that landed on the
 * business number. Reuses the SAME assignment surface as PSTN — a `PhoneNumber` row whose `e164`
 * matches the WhatsApp business number and that is assigned to a PUBLISHED agent wins; otherwise we
 * fall back to the tenant's first PUBLISHED agent (deterministic by creation) so a tenant that hasn't
 * explicitly mapped its WhatsApp number still answers. Returns `null` when the tenant has no publishable
 * agent — the control plane then rejects gracefully. Tenant-scoped (`withTenant` → RLS).
 */

export interface WhatsAppInboundRouting {
  agentId: string;
  agentName: string;
  /** The active flow version to run (if the agent has a published, active flow); else null. */
  flowVersionId: string | null;
  /** The agent's composed system prompt (persona) — the context brief is appended by the caller. */
  systemPrompt: string;
  /** The opening line the agent speaks. */
  greeting: string;
}

/** Default opener when the agent has no bespoke greeting configured. */
export const WA_DEFAULT_GREETING = 'Hello! Thanks for calling. How can I help you today?';

/** The routing seam the control plane depends on — injectable so it stays offline-testable with a fake. */
export interface WaInboundRouter {
  resolveInboundAgent(
    tenantId: string,
    toNumber: string | undefined,
  ): Promise<WhatsAppInboundRouting | null>;
}

interface RoutedAgent {
  id: string;
  name: string;
  persona: unknown;
}

export class WhatsAppInboundRouter implements WaInboundRouter {
  constructor(private readonly db: PrismaService) {}

  async resolveInboundAgent(
    tenantId: string,
    toNumber: string | undefined,
  ): Promise<WhatsAppInboundRouting | null> {
    return this.db.withTenant(tenantId, async (tx) => {
      const agent = await this.pickAgent(tx, toNumber);
      if (!agent) return null;
      const flowVersionId = await this.activeFlowVersion(tx, agent.id);
      const persona = personaSchema.safeParse(agent.persona ?? {});
      return {
        agentId: agent.id,
        agentName: agent.name,
        flowVersionId,
        systemPrompt: persona.success ? buildSystemPrompt(persona.data) : '',
        greeting: WA_DEFAULT_GREETING,
      };
    });
  }

  /** Number-assigned PUBLISHED agent first (explicit operator intent), else the first PUBLISHED agent. */
  private async pickAgent(tx: TxClient, toNumber: string | undefined): Promise<RoutedAgent | null> {
    const digits = (toNumber ?? '').replace(/[^\d]/g, '');
    if (digits) {
      // Meta sends the business number as digits; our PhoneNumber.e164 is `+E.164` — match both shapes.
      const pn = await tx.phoneNumber.findFirst({
        where: {
          e164: { in: [`+${digits}`, digits] },
          assignedAgentId: { not: null },
          assignedAgent: { is: { status: 'PUBLISHED' } },
        },
        select: { assignedAgent: { select: { id: true, name: true, persona: true } } },
      });
      if (pn?.assignedAgent) return pn.assignedAgent;
    }
    return tx.agent.findFirst({
      where: { status: 'PUBLISHED' },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, persona: true },
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
