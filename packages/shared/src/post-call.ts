import { z } from 'zod';

/**
 * Post-call intelligence (Day 31): after a call ends, an LLM summarises the transcript and
 * extracts keywords / topics / entities. These pure helpers build the prompt and safely
 * parse the model's JSON so the worker stays deterministic + tested (self-audit A); the LLM
 * transport (metered via the provider router — self-audit D) is injected separately.
 */

// ── Intel shape ───────────────────────────────────────────────────────────────

export const callEntitySchema = z.object({
  type: z.string().min(1).max(40), // person / org / date / amount / product …
  value: z.string().min(1).max(200),
});
export type CallEntity = z.infer<typeof callEntitySchema>;

export const postCallIntelSchema = z.object({
  summary: z.string().max(2000).default(''),
  keywords: z.array(z.string().min(1).max(60)).max(30).default([]),
  topics: z.array(z.string().min(1).max(60)).max(20).default([]),
  entities: z.array(callEntitySchema).max(50).default([]),
  sentiment: z.enum(['positive', 'neutral', 'negative']).default('neutral'),
  followUps: z.array(z.string().min(1).max(200)).max(10).default([]),
});
export type PostCallIntel = z.infer<typeof postCallIntelSchema>;

// ── Transcript flattening ───────────────────────────────────────────────────────

/** A transcript segment (Day 12). Tolerant to the fields actually present. */
export interface TranscriptSegment {
  speaker?: string;
  role?: string;
  text?: string;
  startMs?: number;
  ts?: number;
}

/** Flatten transcript segments into a plain, speaker-labelled string for the LLM. */
export function segmentsToText(segments: unknown): string {
  if (!Array.isArray(segments)) return '';
  return segments
    .map((s) => {
      const seg = s as TranscriptSegment;
      const who = (seg.speaker ?? seg.role ?? '').toString().trim();
      const text = (seg.text ?? '').toString().trim();
      if (!text) return '';
      return who ? `${who}: ${text}` : text;
    })
    .filter(Boolean)
    .join('\n');
}

// ── Prompt ──────────────────────────────────────────────────────────────────────

export interface IntelPrompt {
  system: string;
  user: string;
}

/**
 * Build the summarisation prompt. The model is asked for STRICT JSON matching
 * `PostCallIntel` so `parseIntel` can validate it; keeping the schema in the prompt keeps
 * generations cheap + on-format (self-audit D — fewer retries/tokens).
 */
export function buildIntelPrompt(transcriptText: string): IntelPrompt {
  const system =
    'You analyse phone-call transcripts. Reply with ONLY a JSON object, no prose, no code fences. ' +
    'Schema: {"summary": string (<=3 sentences), "keywords": string[], "topics": string[], ' +
    '"entities": {"type": string, "value": string}[], "sentiment": "positive"|"neutral"|"negative", ' +
    '"followUps": string[]}. Keep keywords/topics concise; entities are names/orgs/dates/amounts/products.';
  const user = `Transcript:\n${transcriptText.slice(0, 12_000)}`; // cap tokens
  return { system, user };
}

// ── Parse ─────────────────────────────────────────────────────────────────────

/**
 * Safely parse the model's response into validated intel. Tolerates code fences and
 * surrounding prose by extracting the first balanced JSON object; on any failure returns
 * an empty (schema-default) intel rather than throwing — a bad generation never breaks the
 * call pipeline (self-audit G).
 */
export function parseIntel(raw: string): PostCallIntel {
  const json = extractJsonObject(raw);
  if (!json) return postCallIntelSchema.parse({});
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return postCallIntelSchema.parse({});
  }
  const parsed = postCallIntelSchema.safeParse(data);
  return parsed.success ? parsed.data : postCallIntelSchema.parse({});
}

/** Extract the first top-level {...} block from a string (handles fences/prose). */
function extractJsonObject(raw: string): string | null {
  const start = raw.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < raw.length; i++) {
    const c = raw[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  return null;
}
