import {
  type FlowGraph,
  NotFoundError,
  type RubricGrader,
  type Scenario,
  type SuiteReport,
  ValidationError,
  compileFlow,
  runSuite,
  scenarioSchema,
} from '@vocaliq/shared';
import { PrismaService } from '../db/prisma.service';
import type { RouterService } from '../router/router.service';

/** Explicit DTOs so the public API type never leaks Prisma's runtime types (TS2742). */
export interface ScenarioRow {
  id: string;
  name: string;
  definition: Scenario;
  updatedAt: Date;
}

export interface RunSummary {
  id: string;
  total: number;
  passed: number;
  passRate: number;
  createdAt: Date;
}

export interface RunResult extends SuiteReport {
  runId: string;
}

/**
 * Agent testing (Day 33): a per-agent library of scenarios, run in bulk against the agent's
 * PUBLISHED flow via the Day-32 simulator + Day-33 grader. Deterministic assertions are free;
 * LLM-graded rubrics are OPT-IN per run (metered via the router — self-audit D). RLS-scoped.
 */
export class TestsService {
  constructor(
    private readonly db: PrismaService,
    /** Optional metered LLM grader factory (bound per-tenant at run time). */
    private readonly graderFactory?: (tenantId: string) => RubricGrader,
  ) {}

  async listScenarios(tenantId: string, agentId: string): Promise<ScenarioRow[]> {
    const rows = await this.db.withTenant(tenantId, (tx) =>
      tx.testScenario.findMany({
        where: { agentId },
        select: { id: true, name: true, definition: true, updatedAt: true },
        orderBy: { createdAt: 'asc' },
      }),
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      definition: r.definition as Scenario,
      updatedAt: r.updatedAt,
    }));
  }

  async createScenario(tenantId: string, agentId: string, input: unknown): Promise<ScenarioRow> {
    const parsed = scenarioSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid scenario');
    }
    const scenario = parsed.data;
    const id = await this.db.withTenant(tenantId, async (tx) => {
      const agent = await tx.agent.findFirst({ where: { id: agentId }, select: { id: true } });
      if (!agent) throw new ValidationError('Agent does not belong to this tenant');
      const created = await tx.testScenario.create({
        data: { tenantId, agentId, name: scenario.name, definition: scenario },
        select: { id: true },
      });
      return created.id;
    });
    return { id, name: scenario.name, definition: scenario, updatedAt: new Date() };
  }

  async deleteScenario(tenantId: string, id: string): Promise<{ id: string }> {
    return this.db.withTenant(tenantId, async (tx) => {
      const existing = await tx.testScenario.findFirst({ where: { id }, select: { id: true } });
      if (!existing) throw new NotFoundError('Scenario not found');
      await tx.testScenario.delete({ where: { id } });
      return { id };
    });
  }

  async listRuns(tenantId: string, agentId: string): Promise<RunSummary[]> {
    const rows = await this.db.withTenant(tenantId, (tx) =>
      tx.testRun.findMany({
        where: { agentId },
        select: { id: true, total: true, passed: true, passRate: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    );
    return rows;
  }

  /**
   * Run the agent's scenario suite against its PUBLISHED flow. Deterministic by default;
   * pass `llm: true` to grade `llm_rubric` assertions with the metered LLM grader.
   */
  async run(tenantId: string, agentId: string, opts: { llm?: boolean } = {}): Promise<RunResult> {
    const { scenarios, graph } = await this.db.withTenant(tenantId, async (tx) => {
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
      if (!published) throw new ValidationError('Agent has no published flow to test');
      const rows = await tx.testScenario.findMany({
        where: { agentId },
        select: { definition: true },
      });
      return {
        graph: published.graph as unknown as FlowGraph,
        scenarios: rows.map((r) => r.definition as Scenario),
      };
    });

    if (scenarios.length === 0) throw new ValidationError('No scenarios defined for this agent');

    const compiled = compileFlow(graph);
    if (!compiled.ok || !compiled.flow) {
      throw new ValidationError(
        `Published flow does not compile: ${compiled.errors[0]?.message ?? 'unknown error'}`,
      );
    }

    const grader = opts.llm ? this.graderFactory?.(tenantId) : undefined;
    const report = await runSuite(compiled.flow, scenarios, grader ? { grader } : {});

    const runId = await this.db.withTenant(tenantId, async (tx) => {
      const run = await tx.testRun.create({
        data: {
          tenantId,
          agentId,
          total: report.total,
          passed: report.passed,
          passRate: report.passRate,
          // Typed SuiteReport → plain JSON value for Prisma's Json column.
          report: JSON.parse(JSON.stringify(report)),
        },
        select: { id: true },
      });
      return run.id;
    });

    return { runId, ...report };
  }
}

/**
 * A metered LLM rubric grader bound to a tenant — asks the model to judge the rubric against
 * the transcript and returns PASS/FAIL. Every call routes through the router (UsageRecord).
 */
export function routerGrader(router: RouterService, tenantId: string): RubricGrader {
  return async ({ prompt, transcript, outcome }) => {
    const convo = transcript.map((t) => `${t.role}: ${t.text}`).join('\n');
    const result = await router.complete({
      tenantId,
      system:
        'You grade call transcripts against a rubric. Reply with ONLY "PASS" or "FAIL" on the ' +
        'first line, then a one-sentence reason.',
      messages: [{ role: 'user', content: `Rubric: ${prompt}\nOutcome: ${outcome}\n\n${convo}` }],
      maxTokens: 60,
    });
    const text = result.text.trim();
    const pass = /^\s*pass/i.test(text);
    const reason = text.split('\n').slice(1).join(' ').trim() || undefined;
    return reason ? { pass, reason } : { pass };
  };
}
