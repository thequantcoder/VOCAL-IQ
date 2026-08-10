import {
  type ChatAdvance,
  type ChatChannel,
  type ChatState,
  type CompiledFlow,
  type FlowGraph,
  FlowNodeType,
  type FormField,
  NotFoundError,
  ValidationError,
  buildFormSubmission,
  chatTurn,
  compileFlow,
  expandFormNodesInGraph,
  startChat,
} from '@vocaliq/shared';
import type { PrismaService } from '../db/prisma.service';

/** Persist an in-call form submission (wired to `FormsService.submitForCall` in composition). */
export type FormSaver = (
  tenantId: string,
  formId: string,
  values: Record<string, string>,
) => Promise<unknown>;

/**
 * Multimodal chat runtime service (Day 45). Drives an agent's PUBLISHED compiled flow through
 * the channel-agnostic `@vocaliq/shared` chat runtime so ONE agent definition answers over
 * voice, web chat, and messaging identically (self-audit A). Stateless: the caller round-trips
 * the `ChatState` each turn (no server session store). Every read is RLS-scoped (self-audit B).
 * Deterministic flow traversal — no LLM here, so no metered cost on this path (self-audit D).
 *
 * FORM nodes (PARITY-03): a FORM node is expanded into SAY/LISTEN before compile (its referenced
 * form's fields resolved from the DB), and when the conversation ENDS each referenced form's captured
 * answers are persisted as a `FormSubmission` — best-effort, so a save hiccup never breaks the chat.
 */
export class ChatService {
  constructor(
    private readonly db: PrismaService,
    private readonly saveFormSubmission?: FormSaver,
  ) {}

  /**
   * Load the agent's published flow (RLS-scoped), resolve + expand any FORM nodes, and compile.
   * Returns the compiled flow + the referenced forms' fields (so the caller can persist submissions).
   */
  private async loadFlow(
    tenantId: string,
    agentId: string,
  ): Promise<{ flow: CompiledFlow; forms: Record<string, FormField[]> }> {
    const { graph, forms } = await this.db.withTenant(tenantId, async (tx) => {
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
      const graph = published.graph as unknown as FlowGraph;

      // Resolve the fields for every FORM node so the node can be expanded into ask/capture steps.
      const formIds = [
        ...new Set(
          graph.nodes
            .filter((n) => n.type === FlowNodeType.FORM)
            .map((n) => formIdOf(n.data?.config?.formId))
            .filter((id): id is string => id.length > 0),
        ),
      ];
      const forms: Record<string, FormField[]> = {};
      if (formIds.length > 0) {
        const rows = await tx.form.findMany({
          where: { id: { in: formIds }, active: true },
          select: { id: true, fields: true },
        });
        for (const r of rows) forms[r.id] = r.fields as FormField[];
      }
      return { graph, forms };
    });

    const compiled = compileFlow(expandFormNodesInGraph(graph, forms));
    if (!compiled.ok || !compiled.flow) {
      throw new ValidationError(
        `Published flow does not compile: ${compiled.errors[0]?.message ?? 'unknown error'}`,
      );
    }
    return { flow: compiled.flow, forms };
  }

  /** Begin a conversation on a channel; optional `context` seeds captured vars (cross-channel memory). */
  async start(
    tenantId: string,
    agentId: string,
    channel: ChatChannel,
    context?: Record<string, string>,
  ): Promise<ChatAdvance> {
    const { flow, forms } = await this.loadFlow(tenantId, agentId);
    const advance = startChat(flow, { channel, ...(context ? { context } : {}) });
    if (advance.done) await this.persistForms(tenantId, forms, advance.state.captured);
    return advance;
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
    const { flow, forms } = await this.loadFlow(tenantId, agentId);
    const advance = chatTurn(flow, state, message, intent ? { intent } : {});
    // Save when the conversation JUST ended (not on a no-op turn against an already-done state).
    if (advance.done && !state.done) {
      await this.persistForms(tenantId, forms, advance.state.captured);
    }
    return advance;
  }

  /** Persist a FormSubmission for each referenced form that captured any values. Best-effort. */
  private async persistForms(
    tenantId: string,
    forms: Record<string, FormField[]>,
    captured: Record<string, string>,
  ): Promise<void> {
    if (!this.saveFormSubmission) return;
    for (const [formId, fields] of Object.entries(forms)) {
      const values = buildFormSubmission(fields, captured);
      if (Object.keys(values).length > 0) {
        await this.saveFormSubmission(tenantId, formId, values).catch(() => {});
      }
    }
  }
}

/** The configured formId on a FORM node's open config record, or '' when unset. */
function formIdOf(v: unknown): string {
  return typeof v === 'string' ? v : '';
}
