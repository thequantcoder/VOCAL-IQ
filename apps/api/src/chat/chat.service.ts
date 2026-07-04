import {
  type ChatAdvance,
  type ChatChannel,
  type ChatState,
  type FlowGraph,
  NotFoundError,
  ValidationError,
  chatTurn,
  compileFlow,
  startChat,
} from '@vocaliq/shared';
import type { PrismaService } from '../db/prisma.service';

/**
 * Multimodal chat runtime service (Day 45). Drives an agent's PUBLISHED compiled flow through
 * the channel-agnostic `@vocaliq/shared` chat runtime so ONE agent definition answers over
 * voice, web chat, and messaging identically (self-audit A). Stateless: the caller round-trips
 * the `ChatState` each turn (no server session store). Every read is RLS-scoped (self-audit B).
 * Deterministic flow traversal — no LLM here, so no metered cost on this path (self-audit D).
 */
export class ChatService {
  constructor(private readonly db: PrismaService) {}

  /** Load + compile the agent's published flow (RLS-scoped). Throws if none / uncompilable. */
  private async compiledFlow(tenantId: string, agentId: string) {
    const graph = await this.db.withTenant(tenantId, async (tx) => {
      const agent = await tx.agent.findFirst({ where: { id: agentId }, select: { id: true } });
      if (!agent) throw new NotFoundError('Agent not found');
      const flow = await tx.flow.findFirst({ where: { agentId }, select: { id: true } });
      const published = flow
        ? await tx.flowVersion.findFirst({
            where: { flowId: flow.id, publishedAt: { not: null } },
            orderBy: { version: 'desc' },
            select: { graph: true },
          })
        : null;
      if (!published) throw new ValidationError('Agent has no published flow');
      return published.graph as unknown as FlowGraph;
    });

    const compiled = compileFlow(graph);
    if (!compiled.ok || !compiled.flow) {
      throw new ValidationError(
        `Published flow does not compile: ${compiled.errors[0]?.message ?? 'unknown error'}`,
      );
    }
    return compiled.flow;
  }

  /** Begin a conversation on a channel; optional `context` seeds captured vars (cross-channel memory). */
  async start(
    tenantId: string,
    agentId: string,
    channel: ChatChannel,
    context?: Record<string, string>,
  ): Promise<ChatAdvance> {
    const flow = await this.compiledFlow(tenantId, agentId);
    return startChat(flow, { channel, ...(context ? { context } : {}) });
  }

  /** Feed one user message into an in-progress conversation and advance to the next prompt / end. */
  async turn(
    tenantId: string,
    agentId: string,
    state: ChatState,
    message: string,
    intent?: string,
  ): Promise<ChatAdvance> {
    if (!message.trim()) throw new ValidationError('A message is required');
    const flow = await this.compiledFlow(tenantId, agentId);
    return chatTurn(flow, state, message, intent ? { intent } : {});
  }
}
