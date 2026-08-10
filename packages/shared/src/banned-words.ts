import { z } from 'zod';

/**
 * Banned/blocked-word guardrails (Day 38). Agents can carry a list of prohibited terms
 * (stored in `persona.bannedWords`); at speak-time the agent's output is screened and the
 * configured action is applied — flag (log only), redact (mask the term), or block (refuse
 * to speak the turn). Pure + unit-tested; the voice loop calls `screenSpeech` before TTS.
 */

export const BANNED_WORDS_ACTIONS = ['flag', 'redact', 'block'] as const;
export type BannedWordsAction = (typeof BANNED_WORDS_ACTIONS)[number];
export const bannedWordsActionSchema = z.enum(BANNED_WORDS_ACTIONS);

/** Escape a user-supplied term for safe use inside a RegExp. */
function escapeRegExp(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * A word is matched case-insensitively on word boundaries when it's alphanumeric, so
 * "hell" does not match "hello"; multi-word / punctuated phrases match as a substring.
 */
function termToRegExp(term: string): RegExp {
  const t = term.trim();
  const alnum = /^[a-z0-9]+$/i.test(t);
  const body = escapeRegExp(t);
  return new RegExp(alnum ? `\\b${body}\\b` : body, 'gi');
}

/** Return the distinct banned terms present in `text` (original casing of the term). */
export function matchBannedWords(text: string, words: string[]): string[] {
  const found: string[] = [];
  for (const w of words) {
    const term = w.trim();
    if (!term) continue;
    if (termToRegExp(term).test(text)) found.push(term);
  }
  return found;
}

/** Replace every occurrence of each banned term with `••••` (length-hinted mask). */
export function redactBannedWords(text: string, words: string[]): string {
  let out = text;
  for (const w of words) {
    const term = w.trim();
    if (!term) continue;
    out = out.replace(termToRegExp(term), (m) => '•'.repeat(Math.max(1, m.length)));
  }
  return out;
}

export interface ScreenResult {
  /** The text the agent should actually speak ('' when blocked). */
  text: string;
  /** Distinct banned terms detected in the input. */
  matched: string[];
  /** Whether any banned term was detected. */
  flagged: boolean;
  /** Whether the whole turn was suppressed (action = block + a match). */
  blocked: boolean;
  action: BannedWordsAction;
}

/**
 * Screen a candidate agent utterance against the banned list and apply `action`:
 *  - flag  → speak as-is, but report the matches (for logging/QA),
 *  - redact→ speak with the terms masked,
 *  - block → suppress the whole turn (speak nothing) when any term matches.
 * With no words or no match, the original text passes through unflagged.
 */
export function screenSpeech(
  text: string,
  words: string[],
  action: BannedWordsAction = 'flag',
): ScreenResult {
  const matched = matchBannedWords(text, words);
  const flagged = matched.length > 0;
  if (!flagged) return { text, matched: [], flagged: false, blocked: false, action };

  if (action === 'block') return { text: '', matched, flagged: true, blocked: true, action };
  if (action === 'redact')
    return { text: redactBannedWords(text, words), matched, flagged: true, blocked: false, action };
  return { text, matched, flagged: true, blocked: false, action }; // flag
}
