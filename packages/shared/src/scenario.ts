import { z } from 'zod';
import type { CompiledFlow } from './flow-compiler.js';
import { type SimEvent, type SimResult, runSimulation, scriptedCaller } from './simulator.js';

/**
 * Batch scenario testing + eval rubrics (Day 33). A scenario is a scripted caller + a goal
 * + a set of assertions; a suite of scenarios runs each through the Day-32 simulator and
 * grades the result. Most assertions are DETERMINISTIC (free, seeded) so regression
 * detection is reliable (self-audit A); an `llm_rubric` assertion is graded by an INJECTED
 * grader (metered LLM in production — self-audit D), kept out of the pure core so tests are
 * deterministic without a live model.
 */

// ── Scenario + assertions ─────────────────────────────────────────────────────

export const scenarioCallerLineSchema = z.object({
  text: z.string().min(1).max(500),
  intent: z.string().max(60).optional(),
});

export const assertionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('outcome_is'), value: z.string().min(1).max(60) }),
  z.object({ type: z.literal('visited'), nodeId: z.string().min(1) }),
  z.object({ type: z.literal('transcript_includes'), text: z.string().min(1).max(300) }),
  z.object({ type: z.literal('captured'), name: z.string().min(1).max(60) }),
  z.object({ type: z.literal('max_turns'), value: z.number().int().min(1).max(100) }),
  z.object({ type: z.literal('cost_under'), value: z.number().min(0) }),
  z.object({ type: z.literal('llm_rubric'), prompt: z.string().min(1).max(500) }),
]);
export type Assertion = z.infer<typeof assertionSchema>;

export const scenarioSchema = z.object({
  name: z.string().min(1).max(120),
  caller: z.array(scenarioCallerLineSchema).max(50).default([]),
  assertions: z.array(assertionSchema).max(30).default([]),
});
export type Scenario = z.infer<typeof scenarioSchema>;

// ── Grading ─────────────────────────────────────────────────────────────────────

/** An LLM rubric grader (injected). Given a rubric + the run, returns pass + reason. */
export type RubricGrader = (input: {
  prompt: string;
  transcript: SimResult['transcript'];
  outcome: string;
}) => Promise<{ pass: boolean; reason?: string }>;

export interface AssertionResult {
  type: Assertion['type'];
  label: string;
  pass: boolean;
  detail?: string;
}

export interface ScenarioResult {
  name: string;
  outcome: string;
  passed: boolean;
  estCostUsd: number;
  results: AssertionResult[];
}

export interface SuiteReport {
  total: number;
  passed: number;
  failed: number;
  passRate: number; // 0..1
  estCostUsd: number;
  scenarios: ScenarioResult[];
}

function transcriptText(sim: SimResult): string {
  return sim.transcript
    .map((t) => t.text)
    .join('\n')
    .toLowerCase();
}
function capturedNames(sim: SimResult): Set<string> {
  const names = new Set<string>();
  for (const e of sim.events as SimEvent[]) {
    if (e.kind === 'capture') for (const k of Object.keys(e.vars)) names.add(k);
  }
  return names;
}
function callerTurns(sim: SimResult): number {
  return sim.transcript.filter((t) => t.role === 'caller').length;
}

/** Evaluate one assertion against a completed simulation (llm_rubric uses the grader). */
export async function evaluateAssertion(
  sim: SimResult,
  assertion: Assertion,
  grader?: RubricGrader,
): Promise<AssertionResult> {
  switch (assertion.type) {
    case 'outcome_is':
      return {
        type: assertion.type,
        label: `outcome is "${assertion.value}"`,
        pass: sim.outcome === assertion.value,
        detail: `got "${sim.outcome}"`,
      };
    case 'visited':
      return {
        type: assertion.type,
        label: `visits ${assertion.nodeId}`,
        pass: sim.visited.includes(assertion.nodeId),
      };
    case 'transcript_includes':
      return {
        type: assertion.type,
        label: `transcript includes "${assertion.text}"`,
        pass: transcriptText(sim).includes(assertion.text.toLowerCase()),
      };
    case 'captured':
      return {
        type: assertion.type,
        label: `captures ${assertion.name}`,
        pass: capturedNames(sim).has(assertion.name),
      };
    case 'max_turns': {
      const turns = callerTurns(sim);
      return {
        type: assertion.type,
        label: `≤ ${assertion.value} caller turns`,
        pass: turns <= assertion.value,
        detail: `used ${turns}`,
      };
    }
    case 'cost_under':
      return {
        type: assertion.type,
        label: `cost < $${assertion.value}`,
        pass: sim.estCostUsd < assertion.value,
        detail: `est $${sim.estCostUsd.toFixed(4)}`,
      };
    case 'llm_rubric': {
      if (!grader) {
        return {
          type: assertion.type,
          label: assertion.prompt,
          pass: false,
          detail: 'no grader configured',
        };
      }
      const graded = await grader({
        prompt: assertion.prompt,
        transcript: sim.transcript,
        outcome: sim.outcome,
      });
      return {
        type: assertion.type,
        label: assertion.prompt,
        pass: graded.pass,
        ...(graded.reason ? { detail: graded.reason } : {}),
      };
    }
  }
}

// ── Runners ─────────────────────────────────────────────────────────────────────

/** Run one scenario through the simulator and grade every assertion. */
export async function runScenario(
  flow: CompiledFlow,
  scenario: Scenario,
  opts: { grader?: RubricGrader } = {},
): Promise<ScenarioResult> {
  const caller = scenario.caller.map((c) =>
    c.intent ? { text: c.text, intent: c.intent } : { text: c.text },
  );
  const sim = runSimulation(flow, scriptedCaller(caller));
  const results = await Promise.all(
    scenario.assertions.map((a) => evaluateAssertion(sim, a, opts.grader)),
  );
  return {
    name: scenario.name,
    outcome: sim.outcome,
    estCostUsd: sim.estCostUsd,
    results,
    passed: results.every((r) => r.pass),
  };
}

/** Run a whole suite and aggregate pass/fail + cost. */
export async function runSuite(
  flow: CompiledFlow,
  scenarios: Scenario[],
  opts: { grader?: RubricGrader } = {},
): Promise<SuiteReport> {
  const results = await Promise.all(scenarios.map((s) => runScenario(flow, s, opts)));
  const passed = results.filter((r) => r.passed).length;
  const estCostUsd = results.reduce((sum, r) => sum + r.estCostUsd, 0);
  return {
    total: results.length,
    passed,
    failed: results.length - passed,
    passRate: results.length > 0 ? passed / results.length : 1,
    estCostUsd,
    scenarios: results,
  };
}

/** Scenarios that PASSED in the baseline but now FAIL — the regressions to block on. */
export function detectRegressions(current: SuiteReport, baseline: SuiteReport): string[] {
  const basePass = new Set(baseline.scenarios.filter((s) => s.passed).map((s) => s.name));
  return current.scenarios.filter((s) => !s.passed && basePass.has(s.name)).map((s) => s.name);
}
