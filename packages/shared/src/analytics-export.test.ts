import { describe, expect, it } from 'vitest';
import {
  analyticsQuerySchema,
  csvCell,
  isScheduleDue,
  maskEmail,
  maskPhone,
  toCsv,
} from './analytics-export.js';

describe('toCsv / csvCell (self-audit C — injection-safe)', () => {
  it('quotes cells with commas, quotes, or newlines (RFC-4180)', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('she said "hi"')).toBe('"she said ""hi"""');
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"');
    expect(csvCell('plain')).toBe('plain');
  });
  it('neutralizes formula-injection leads (= + - @) so a cell cannot execute', () => {
    expect(csvCell('=1+1')).toBe("'=1+1");
    expect(csvCell('+cmd')).toBe("'+cmd");
    expect(csvCell('-2')).toBe("'-2");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    // A formula that also needs quoting gets both defences.
    expect(csvCell('=HYPERLINK("http://x","a,b")')).toBe('"\'=HYPERLINK(""http://x"",""a,b"")"');
  });
  it('serializes a table', () => {
    expect(
      toCsv(
        ['id', 'note'],
        [
          [1, 'ok'],
          [2, 'a,b'],
        ],
      ),
    ).toBe('id,note\n1,ok\n2,"a,b"');
  });
});

describe('PII masking (self-audit C)', () => {
  it('masks a phone to first+last 2', () => {
    expect(maskPhone('+14155551234')).toBe('+1••••••••34'); // 12 chars → 8 masked middle
    expect(maskPhone('123')).toBe('•••');
    expect(maskPhone('')).toBe('');
  });
  it('masks an email to first char + domain', () => {
    expect(maskEmail('jane@acme.com')).toBe('j•••@acme.com');
    expect(maskEmail('not-an-email')).toBe(maskPhone('not-an-email'));
  });
});

describe('isScheduleDue (self-audit F)', () => {
  const now = new Date('2026-07-07T12:00:00Z');
  it('is due when never run', () => {
    expect(isScheduleDue('daily', null, now)).toBe(true);
  });
  it('daily is due after 24h, not before', () => {
    expect(isScheduleDue('daily', new Date('2026-07-06T11:00:00Z'), now)).toBe(true);
    expect(isScheduleDue('daily', new Date('2026-07-07T00:00:00Z'), now)).toBe(false);
  });
  it('weekly is due after 7 days', () => {
    expect(isScheduleDue('weekly', new Date('2026-06-30T11:00:00Z'), now)).toBe(true);
    expect(isScheduleDue('weekly', new Date('2026-07-05T11:00:00Z'), now)).toBe(false);
  });
});

describe('analyticsQuerySchema', () => {
  it('defaults + clamps the page size', () => {
    expect(analyticsQuerySchema.parse({}).limit).toBe(100);
    expect(analyticsQuerySchema.safeParse({ limit: 5000 }).success).toBe(false);
    expect(analyticsQuerySchema.parse({ from: '2026-01-01' }).from instanceof Date).toBe(true);
  });
});
