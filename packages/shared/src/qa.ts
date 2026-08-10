import { z } from 'zod';

/**
 * Automated QA scoring (Day 43) — the pure evaluator core. A rubric is a set of weighted
 * criteria (followed script? confirmed booking? handled objection? compliant?); an LLM
 * scores each criterion 0..1 over a call transcript and we compute a weighted overall
 * 0..100. The LLM call itself is INJECTED (metered in the worker — self-audit D), so the
 * prompt builder, the tolerant parser, the weighted scorer, and the cost-aware sampler
 * here are all deterministic and unit-tested without a live model (self-audit A).
 */

// ── Rubric definition ─────────────────────────────────────────────────────────

export const qaCriterionSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9_]+$/, 'key must be lowercase letters, digits, or underscores'),
  description: z.string().min(1).max(300),
  weight: z.number().positive().max(100).default(1),
});
export type QaCriterion = z.infer<typeof qaCriterionSchema>;

export const qaRubricInputSchema = z.object({
  name: z.string().min(1).max(120),
  criteria: z.array(qaCriterionSchema).min(1).max(20),
  samplingRate: z.number().min(0).max(1).default(1),
  agentId: z.string().uuid().nullish(),
  active: z.boolean().default(true),
});
export type QaRubricInput = z.infer<typeof qaRubricInputSchema>;

// ── Scored results ────────────────────────────────────────────────────────────

export interface QaCriterionScore {
  key: string;
  score: number; // 0..1
  weight: number;
  reason: string;
}

export interface QaScored {
  overall: number; // weighted 0..100
  criteria: QaCriterionScore[];
}

// ── Prompt ────────────────────────────────────────────────────────────────────

/**
 * Build the evaluator prompt. The model is asked for STRICT JSON: one object per criterion
 * key with a 0..1 score and a short reason. Keeping the contract explicit + machine-readable
 * is what makes `parseQaResult` reliable.
 */
export function buildQaPrompt(
  criteria: QaCriterion[],
  transcript: string,
): { system: string; user: string } {
  const lines = criteria.map((c) => `- "${c.key}": ${c.description}`).join('\n');
  const system =
    'You are a strict call-quality evaluator. Score each criterion from 0.0 (not met) to ' +
    '1.0 (fully met) based ONLY on the transcript. Reply with ONLY a JSON object of the form ' +
    '{"results":[{"key":"<key>","score":<0..1>,"reason":"<short>"}]} — one entry per criterion, ' +
    'no prose, no markdown.';
  const user = `Criteria:\n${lines}\n\nTranscript:\n${transcript}`;
  return { system, user };
}

// ── Parse + score ─────────────────────────────────────────────────────────────

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

interface RawResult {
  key?: unknown;
  score?: unknown;
  reason?: unknown;
}

/**
 * Tolerantly parse the evaluator's JSON. Extracts the first JSON object (models sometimes
 * wrap it in prose/fences), maps results by key, and — crucially — returns one entry PER
 * rubric criterion: a criterion the model omitted or returned garbage for defaults to 0
 * (fail-closed, never silently skipped). Scores are clamped to 0..1.
 */
export function parseQaResult(raw: string, criteria: QaCriterion[]): QaCriterionScore[] {
  let parsed: Record<string, RawResult> = {};
  try {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    const json = start >= 0 && end > start ? raw.slice(start, end + 1) : raw;
    const obj = JSON.parse(json) as { results?: RawResult[] };
    for (const r of obj.results ?? []) {
      if (typeof r.key === 'string') parsed[r.key] = r;
    }
  } catch {
    parsed = {};
  }

  return criteria.map((c) => {
    const r = parsed[c.key];
    const rawScore = typeof r?.score === 'number' ? r.score : Number(r?.score);
    const score = Number.isFinite(rawScore) ? clamp01(rawScore) : 0;
    const reason =
      typeof r?.reason === 'string' && r.reason.trim()
        ? r.reason.trim().slice(0, 300)
        : r
          ? ''
          : 'not evaluated';
    return { key: c.key, score, weight: c.weight, reason };
  });
}

/** Weighted overall 0..100 from per-criterion 0..1 scores. Zero total weight → 0. */
export function scoreQa(criterionScores: QaCriterionScore[]): QaScored {
  const totalWeight = criterionScores.reduce((s, c) => s + c.weight, 0);
  const overall =
    totalWeight <= 0
      ? 0
      : (criterionScores.reduce((s, c) => s + c.score * c.weight, 0) / totalWeight) * 100;
  return { overall: Math.round(overall * 10) / 10, criteria: criterionScores };
}

// ── Cost-aware sampling ───────────────────────────────────────────────────────

/**
 * Deterministic sampling: `true` when a call should be scored under a rubric's sampling
 * rate. Uses a stable hash of the seed (callId+rubricId) so the SAME call always gets the
 * same decision (idempotent re-runs) while ~`rate` of calls overall are scored. rate>=1
 * always scores; rate<=0 never does.
 */
export function shouldSample(rate: number, seed: string): boolean {
  if (rate >= 1) return true;
  if (rate <= 0) return false;
  // FNV-1a 32-bit hash → [0,1)
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const unit = (h >>> 0) / 0xffffffff;
  return unit < rate;
}

// ── Aggregation (coaching / analytics) ────────────────────────────────────────

export interface QaScoreRow {
  rubricId: string;
  overall: number;
  criteria: QaCriterionScore[];
}

export interface QaCriterionAggregate {
  key: string;
  avgScore: number; // 0..1
  count: number;
}

export interface QaRubricAggregate {
  rubricId: string;
  avgOverall: number; // 0..100
  count: number;
  criteria: QaCriterionAggregate[];
}

/** Aggregate a set of scores into per-rubric averages + weakest/strongest criteria. */
export function aggregateQaScores(rows: QaScoreRow[]): QaRubricAggregate[] {
  const byRubric = new Map<string, QaScoreRow[]>();
  for (const r of rows) {
    const list = byRubric.get(r.rubricId) ?? [];
    list.push(r);
    byRubric.set(r.rubricId, list);
  }

  const out: QaRubricAggregate[] = [];
  for (const [rubricId, list] of byRubric) {
    const avgOverall = list.reduce((s, r) => s + r.overall, 0) / list.length;
    const critAcc = new Map<string, { sum: number; n: number }>();
    for (const r of list) {
      for (const c of r.criteria) {
        const acc = critAcc.get(c.key) ?? { sum: 0, n: 0 };
        acc.sum += c.score;
        acc.n += 1;
        critAcc.set(c.key, acc);
      }
    }
    const criteria = [...critAcc.entries()].map(([key, a]) => ({
      key,
      avgScore: Math.round((a.sum / a.n) * 1000) / 1000,
      count: a.n,
    }));
    out.push({
      rubricId,
      avgOverall: Math.round(avgOverall * 10) / 10,
      count: list.length,
      criteria,
    });
  }
  return out;
}
