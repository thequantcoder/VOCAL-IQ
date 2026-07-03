import type { TranscriptSegment } from './post-call.js';

/**
 * Advanced transcription controls (Day 39). Three pure, testable helpers:
 *  - `normalizeKeyTerms` — sanitise the per-agent custom vocabulary passed to STT
 *    (brand/drug/SKU boosting) before it hits the provider.
 *  - `cleanTranscript` / `cleanSegments` — "no-verbatim" mode: strip fillers + false
 *    starts so the stored clean copy reads naturally (the raw copy is always kept).
 *  - `buildCitations` — RAG source attribution: turn retrieved chunks into de-duplicated,
 *    ranked citations the UI can show ("answered from: <source>").
 */

export const MAX_KEY_TERMS = 100;
const MAX_TERM_LEN = 60;

/** Trim, drop empties, de-dupe case-insensitively (keeping first casing), and cap count. */
export function normalizeKeyTerms(terms: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of terms) {
    const term = raw.trim().slice(0, MAX_TERM_LEN);
    if (!term) continue;
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(term);
    if (out.length >= MAX_KEY_TERMS) break;
  }
  return out;
}

// Standalone filler words/phrases removed in no-verbatim mode (word-boundary, case-insensitive).
const FILLERS = [
  'um',
  'uh',
  'erm',
  'er',
  'ah',
  'hmm',
  'mm',
  'uh-huh',
  'like',
  'you know',
  'i mean',
  'sort of',
  'kind of',
  'basically',
  'literally',
  'actually',
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// A filler word/phrase, consuming any comma that was delimiting it ("the, you know, refund").
const FILLER_RE = new RegExp(
  `\\s*,?\\s*\\b(?:${FILLERS.map(escapeRegExp).join('|')})\\b\\s*,?`,
  'gi',
);
// Immediate word repetition / stutter: "I I want", "the- the", "wa- want".
const STUTTER_RE = /\b(\w+)([-]?\s+)\1\b/gi;

/**
 * No-verbatim clean of a single utterance: remove filler words (with the commas that
 * delimited them), collapse immediate word repetitions (false starts), and tidy the
 * leftover whitespace + punctuation. Content words are preserved — only disfluencies go.
 */
export function cleanTranscript(text: string): string {
  let out = text.replace(FILLER_RE, ' ');
  // Collapse stutters repeatedly (handles "the the the").
  let prev: string;
  do {
    prev = out;
    out = out.replace(STUTTER_RE, '$1');
  } while (out !== prev);
  return out
    .replace(/\s+([,.!?;:])/g, '$1') // no space before punctuation
    .replace(/([,;:])(?:\s*[,;:])+/g, '$1') // drop stray doubled punctuation
    .replace(/\s{2,}/g, ' ') // collapse whitespace
    .replace(/^[\s,;:-]+/, '') // trim leading filler punctuation
    .trim();
}

/**
 * Apply `cleanTranscript` to each segment's text, preserving speaker/timestamps, and drop
 * any segment that becomes empty (was pure filler). The input shape is passed through so
 * callers keep their extra fields.
 */
export function cleanSegments(segments: TranscriptSegment[]): TranscriptSegment[] {
  const out: TranscriptSegment[] = [];
  for (const seg of segments) {
    const text = cleanTranscript((seg.text ?? '').toString());
    if (!text) continue;
    out.push({ ...seg, text });
  }
  return out;
}

export interface RetrievedChunkLike {
  id: string;
  content: string;
  score: number;
  kbId?: string;
}

export interface Citation {
  chunkId: string;
  kbId: string | null;
  kbName: string | null;
  score: number;
  snippet: string;
}

const SNIPPET_LEN = 160;

/** One-line snippet of a chunk for the attribution UI. */
function snippet(content: string): string {
  const s = content.replace(/\s+/g, ' ').trim();
  return s.length > SNIPPET_LEN ? `${s.slice(0, SNIPPET_LEN - 1)}…` : s;
}

/**
 * Build ranked, de-duplicated citations from the chunks the agent used. `kbNameById` maps a
 * KB id to its display name (optional). Highest score first; each chunk appears once.
 */
export function buildCitations(
  chunks: RetrievedChunkLike[],
  kbNameById: Record<string, string> = {},
): Citation[] {
  const seen = new Set<string>();
  const out: Citation[] = [];
  for (const c of [...chunks].sort((a, b) => b.score - a.score)) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    out.push({
      chunkId: c.id,
      kbId: c.kbId ?? null,
      kbName: c.kbId ? (kbNameById[c.kbId] ?? null) : null,
      score: Math.round(c.score * 1000) / 1000,
      snippet: snippet(c.content),
    });
  }
  return out;
}
