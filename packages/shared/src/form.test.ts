import { describe, expect, it } from 'vitest';
import {
  type FormField,
  escapeForSheet,
  formConfigSchema,
  sanitizeValue,
  validateSubmission,
} from './form.js';

describe('sanitizeValue (storage)', () => {
  it('strips control chars, caps length, and keeps a leading + (phones)', () => {
    expect(sanitizeValue('Ada Lovelace')).toBe('Ada Lovelace');
    expect(sanitizeValue('+14155550100')).toBe('+14155550100'); // NOT formula-escaped
    expect(sanitizeValue('x'.repeat(5000)).length).toBe(2000);
  });
});

describe('escapeForSheet (formula-injection defense)', () => {
  it('neutralises leading formula characters only at the sheet boundary', () => {
    expect(escapeForSheet('=SUM(A1:A9)')).toBe("'=SUM(A1:A9)");
    expect(escapeForSheet('+1+1')).toBe("'+1+1");
    expect(escapeForSheet('@import')).toBe("'@import");
    expect(escapeForSheet('-5')).toBe("'-5");
    expect(escapeForSheet('Ada')).toBe('Ada');
  });
});

const fields: FormField[] = [
  { key: 'name', label: 'Name', type: 'text', required: true },
  { key: 'email', label: 'Email', type: 'email', required: true },
  { key: 'phone', label: 'Phone', type: 'phone', required: false },
  { key: 'plan', label: 'Plan', type: 'select', required: false, options: ['pro', 'scale'] },
];

describe('validateSubmission', () => {
  it('accepts a valid submission and returns sanitised values', () => {
    const res = validateSubmission(fields, {
      name: 'Ada',
      email: 'ada@example.com',
      phone: '+14155550100',
      plan: 'pro',
      junk: 'ignored', // unknown key dropped
    });
    expect(res.ok).toBe(true);
    expect(res.cleaned).toEqual({
      name: 'Ada',
      email: 'ada@example.com',
      phone: '+14155550100',
      plan: 'pro',
    });
    expect(res.cleaned.junk).toBeUndefined();
  });

  it('flags missing required, bad email/phone, and disallowed select', () => {
    const res = validateSubmission(fields, {
      email: 'not-an-email',
      phone: 'abc',
      plan: 'enterprise',
    });
    const keys = res.errors.map((e) => e.key);
    expect(res.ok).toBe(false);
    expect(keys).toContain('name'); // required missing
    expect(keys).toContain('email');
    expect(keys).toContain('phone');
    expect(keys).toContain('plan');
  });

  it('a malicious formula value is stored verbatim but neutralised for the sheet', () => {
    const res = validateSubmission(
      [{ key: 'note', label: 'Note', type: 'text', required: false }],
      {
        note: '=HYPERLINK("http://evil","click")',
      },
    );
    expect(res.ok).toBe(true);
    expect(res.cleaned.note).toBe('=HYPERLINK("http://evil","click")'); // stored as-is
    expect(escapeForSheet(res.cleaned.note ?? '').startsWith("'=")).toBe(true); // safe at the sheet
  });
});

describe('formConfigSchema', () => {
  it('requires ≥1 field, unique keys, and options for select', () => {
    expect(formConfigSchema.safeParse({ name: 'F', fields: [] }).success).toBe(false);
    expect(
      formConfigSchema.safeParse({
        name: 'F',
        fields: [
          { key: 'a', label: 'A', type: 'text' },
          { key: 'a', label: 'A2', type: 'text' },
        ],
      }).success,
    ).toBe(false);
    expect(
      formConfigSchema.safeParse({ name: 'F', fields: [{ key: 'p', label: 'P', type: 'select' }] })
        .success,
    ).toBe(false); // select without options
    expect(
      formConfigSchema.safeParse({ name: 'F', fields: [{ key: 'n', label: 'N', type: 'text' }] })
        .success,
    ).toBe(true);
  });
});
