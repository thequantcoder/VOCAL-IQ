import { Injectable } from '@nestjs/common';
import { NotFoundError, buildSystemPrompt, getAgentTemplate } from '@vocaliq/shared';
import { AgentsService } from '../agents/agents.service';
import { FlowsService } from '../flows/flows.service';

/**
 * Agent templates (Day 24): clone a built-in starter into a real agent — persona → the
 * agent's system prompt, plus the starter flow installed as its draft graph. Goes through
 * AgentsService.create so the plan agent-limit gate still applies (Day 15). RLS-scoped.
 */
@Injectable()
export class TemplatesService {
  constructor(
    private readonly agents: AgentsService,
    private readonly flows: FlowsService,
  ) {}

  async clone(
    tenantId: string,
    templateId: string,
    name?: string,
  ): Promise<{ agentId: string; name: string }> {
    const tpl = getAgentTemplate(templateId);
    if (!tpl) throw new NotFoundError('Template not found');

    const agent = await this.agents.create(tenantId, {
      name: name?.trim() || tpl.name,
      systemPrompt: buildSystemPrompt(tpl.persona),
      type: tpl.type,
      languages: tpl.languages,
      status: 'DRAFT',
    });

    // Install the template's starter flow as the new agent's draft graph.
    await this.flows.getOrCreateDraft(tenantId, agent.id);
    await this.flows.saveGraph(tenantId, agent.id, tpl.graph);

    return { agentId: agent.id, name: agent.name };
  }
}
