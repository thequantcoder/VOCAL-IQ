import {
  type FlowFeatures,
  FlowNodeType,
  NotFoundError,
  type S2sDecision,
  decideS2sMode,
} from '@vocaliq/shared';
import type { PrismaService } from '../db/prisma.service';

/**
 * Speech-to-speech mode resolution (Day 65). For a given agent, inspect its active flow and decide
 * whether the call can use a direct audio-to-audio model (lowest latency) or must use the reliable
 * STT→LLM→TTS pipeline. The decision is pure (`decideS2sMode`); here we derive the flow features
 * from the graph node types and gate on whether an S2S provider is configured (self-audit F). All
 * reads are RLS-scoped (self-audit B).
 */
export class S2SService {
  constructor(
    private readonly db: PrismaService,
    /** True when an S2S provider key is set (gated — false in dev/CI → always pipeline). */
    private readonly providerAvailable: boolean,
  ) {}

  /** Resolve S2S vs pipeline for an agent's active flow. */
  async resolveMode(tenantId: string, agentId: string): Promise<S2sDecision> {
    const agent = await this.db.withTenant(tenantId, (tx) =>
      tx.agent.findFirst({ where: { id: agentId }, select: { id: true, languages: true } }),
    );
    if (!agent) throw new NotFoundError('Agent not found');

    const features = await this.deriveFeatures(tenantId, agentId, agent.languages[0] ?? 'en');
    return decideS2sMode(features, this.providerAvailable);
  }

  /** Extract S2S-relevant features from the agent's latest active flow graph. */
  private async deriveFeatures(
    tenantId: string,
    agentId: string,
    language: string,
  ): Promise<FlowFeatures> {
    const version = await this.db.withTenant(tenantId, (tx) =>
      tx.flowVersion.findFirst({
        where: { flow: { agentId, isActive: true } },
        orderBy: { version: 'desc' },
        select: { graph: true },
      }),
    );
    const graph = (version?.graph ?? {}) as { nodes?: { type?: string }[] };
    const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
    const typeCount = (t: string) => nodes.filter((n) => n.type === t).length;

    return {
      hasTools: typeCount(FlowNodeType.TOOL) > 0,
      hasRag: typeCount(FlowNodeType.KNOWLEDGE) > 0,
      hasTransfer:
        typeCount(FlowNodeType.TRANSFER) > 0 || typeCount(FlowNodeType.SQUAD_HANDOFF) > 0,
      // A couple of decision branches is fine; a dense decision tree is "complex".
      hasComplexBranching: typeCount(FlowNodeType.DECISION) > 2,
      language,
    };
  }
}
