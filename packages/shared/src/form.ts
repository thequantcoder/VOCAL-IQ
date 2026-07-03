import { z } from 'zod';

/**
 * Form builder + submission validation (Day 37). A form is a set of typed fields + routing
 * (webhook / Google Sheet / trigger-a-call). Submissions are validated AND sanitised here
 * (self-audit C) — most importantly, values are neutralised against spreadsheet formula
 * injection before they can be pushed to Sheets. Pure + unit-tested; the API persists +
 * routes, the Sheets push is a gated port.
 */

export const FORM_FIELD_TYPES = [
  'text',
  'textarea',
  'email',
  'phone',
  'number',
  'select',
  'date',
  'checkbox',
] as const;
export type FormFieldType = (typeof FORM_FIELD_TYPES)[number];

export const formFieldSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-zA-Z0-9_]+$/, 'key must be alphanumeric/underscore'),
  label: z.string().min(1).max(120),
  type: z.enum(FORM_FIELD_TYPES),
  required: z.boolean().default(false),
  options: z.array(z.string().min(1).max(120)).max(50).optional(), // for `select`
});
export type FormField = z.infer<typeof formFieldSchema>;

export const formRoutingSchema = z.object({
  webhookUrl: z.string().url().optional(),
  sheetId: z.string().max(200).optional(),
  triggerAgentId: z.string().uuid().optional(), // call the submitter after submission
});
export type FormRouting = z.infer<typeof formRoutingSchema>;

export const formConfigSchema = z
  .object({
    name: z.string().min(1).max(120),
    fields: z.array(formFieldSchema).min(1).max(50),
    routing: formRoutingSchema.default({}),
  })
  .superRefine((cfg, ctx) => {
    const keys = new Set<string>();
    for (const [i, f] of cfg.fields.entries()) {
      if (keys.has(f.key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['fields', i, 'key'],
          message: `Duplicate field "${f.key}"`,
        });
      }
      keys.add(f.key);
      if (f.type === 'select' && (!f.options || f.options.length === 0)) {
        ctx.addIssue({
          code: 'custom',
          path: ['fields', i, 'options'],
          message: 'select needs options',
        });
      }
    }
  });
export type FormConfig = z.infer<typeof formConfigSchema>;

// ── Sanitisation ────────────────────────────────────────────────────────────────

/**
 * Sanitise a submitted value for storage: strip control chars + cap length. Kept separate
 * from spreadsheet escaping so a legitimate value (e.g. a `+1…` phone) still validates.
 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: intentionally stripping control chars for storage safety
const CONTROL_CHARS = /[\x00-\x1f\x7f]/g;
export function sanitizeValue(raw: unknown): string {
  return String(raw ?? '')
    .replace(CONTROL_CHARS, ' ')
    .trim()
    .slice(0, 2000);
}

/**
 * Escape a value at the SPREADSHEET/CSV boundary: prefix a leading `= + - @` with a `'` so a
 * submitted value can never execute as a formula (formula-injection defense, self-audit C).
 * Applied only when pushing to Sheets/CSV — never to stored/validated values.
 */
export function escapeForSheet(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

// ── Submission validation ───────────────────────────────────────────────────────

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const E164ish = /^\+?[0-9()\-.\s]{7,20}$/;

export interface SubmissionResult {
  ok: boolean;
  errors: { key: string; message: string }[];
  /** Sanitised, validated values (only present when `ok`). */
  cleaned: Record<string, string>;
}

/**
 * Validate + sanitise a raw submission against the form's fields. Required fields must be
 * present; email/phone/number are format-checked; every value is sanitised. Unknown keys are
 * dropped (never trusted). Returns typed errors so the form UI can highlight fields.
 */
export function validateSubmission(
  fields: FormField[],
  values: Record<string, unknown>,
): SubmissionResult {
  const errors: { key: string; message: string }[] = [];
  const cleaned: Record<string, string> = {};

  for (const field of fields) {
    const raw = values[field.key];
    const present = raw !== undefined && raw !== null && String(raw).trim() !== '';
    if (!present) {
      if (field.required) errors.push({ key: field.key, message: `${field.label} is required` });
      continue;
    }
    const value = sanitizeValue(raw);
    switch (field.type) {
      case 'email':
        if (!EMAIL.test(value)) errors.push({ key: field.key, message: 'Invalid email' });
        break;
      case 'phone':
        if (!E164ish.test(value)) errors.push({ key: field.key, message: 'Invalid phone number' });
        break;
      case 'number':
        if (Number.isNaN(Number(value)))
          errors.push({ key: field.key, message: 'Must be a number' });
        break;
      case 'select':
        if (field.options && !field.options.includes(value)) {
          errors.push({ key: field.key, message: 'Not an allowed option' });
        }
        break;
      default:
        break;
    }
    cleaned[field.key] = value;
  }

  return { ok: errors.length === 0, errors, cleaned };
}
