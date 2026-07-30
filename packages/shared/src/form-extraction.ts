import type { FormField } from './form.js';

/**
 * Voice-side FORM support (PARITY-03). The voice loop is LLM-driven — it does not execute the
 * deterministic SAY/LISTEN expansion the chat runtime runs — so on voice a form is collected in two
 * halves, both pure here:
 *  1. ASK — {@link buildFormCollectionBrief} appends collection instructions to the agent's system
 *     prompt at dispatch, so the agent naturally asks for each field during the call.
 *  2. SAVE — after the call, {@link buildFormExtractionPrompt} + {@link parseFormExtraction} turn the
 *     transcript into validated `{ fieldKey: value }` values via a METERED LLM completion (the api's
 *     FormExtractionService orchestrates; `FormsService.submitForCall` persists + validates).
 * Everything here is deterministic + unit-tested; no network, no DB.
 */

/** A short type hint the agent/extractor can act on ('' for plain text). */
function fieldHint(field: FormField): string {
  switch (field.type) {
    case 'email':
      return ' (an email address)';
    case 'phone':
      return ' (a phone number)';
    case 'number':
      return ' (a number)';
    case 'date':
      return ' (a date)';
    case 'checkbox':
      return ' (yes or no)';
    case 'select':
      return field.options && field.options.length > 0
        ? ` (one of: ${field.options.join(', ')})`
        : '';
    default:
      return '';
  }
}

/**
 * The system-prompt brief that makes a voice agent COLLECT a form's fields conversationally.
 * Appended to the agent's persona prompt at dispatch when its flow has a configured FORM node.
 */
export function buildFormCollectionBrief(
  forms: Array<{ name: string; fields: FormField[] }>,
): string {
  return forms
    .map((form) => {
      const items = form.fields
        .map((f) => `${f.label}${fieldHint(f)}${f.required ? ' — required' : ''}`)
        .join('; ');
      return `During this call, naturally collect the caller's details for "${form.name}": ${items}. Ask for one item at a time, and read back anything that sounds unclear.`;
    })
    .join('\n');
}

/**
 * The post-call extraction prompt: strict JSON-only, exact keys, never invent. The transcript is
 * bounded upstream (the loop caps context); the model must omit anything the caller didn't provide.
 */
export function buildFormExtractionPrompt(
  fields: FormField[],
  transcriptText: string,
): { system: string; user: string } {
  const system =
    'You extract structured form data from a call transcript. Reply with ONLY a JSON object — ' +
    'no prose, no code fences. Use exactly the keys given. Omit any field the caller did not ' +
    'clearly provide. Never guess or invent values.';
  const lines = fields.map((f) => `- ${f.key}: ${f.label}${fieldHint(f)}`).join('\n');
  const user = `Fields to extract:\n${lines}\n\nTranscript:\n${transcriptText}\n\nJSON:`;
  return { system, user };
}

/**
 * Parse the model's reply into `{ fieldKey: value }`: tolerant of code fences / surrounding prose,
 * keeps ONLY known field keys, stringifies scalars, drops empties. Malformed output ⇒ `{}` (the
 * caller simply skips the save — never throws). Full validation happens at `submitForCall`.
 */
export function parseFormExtraction(fields: FormField[], raw: string): Record<string, string> {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return {};
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
  const obj = parsed as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const field of fields) {
    const v = obj[field.key];
    if (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') continue;
    const s = String(v).trim();
    if (s.length > 0) out[field.key] = s;
  }
  return out;
}
