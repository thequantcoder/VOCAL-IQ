import { describe, expect, it } from 'vitest';
import { buildSimplePdf } from './pdf.js';

const decode = (b: Uint8Array) => new TextDecoder('latin1').decode(b);

describe('buildSimplePdf', () => {
  it('produces a well-formed PDF (header, xref, trailer, EOF)', () => {
    const pdf = decode(buildSimplePdf({ title: 'Analytics', lines: ['Calls: 42', 'Cost: $1.20'] }));
    expect(pdf.startsWith('%PDF-1.')).toBe(true);
    expect(pdf).toContain('/Type /Catalog');
    expect(pdf).toContain('xref');
    expect(pdf).toContain('startxref');
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);
  });

  it('includes the title + line text, escaped for PDF literals', () => {
    const pdf = decode(buildSimplePdf({ title: 'Report (2026)', lines: ['a\\b', 'plain'] }));
    expect(pdf).toContain('(Report \\(2026\\))'); // ( ) escaped
    expect(pdf).toContain('(a\\\\b)'); // backslash escaped
    expect(pdf).toContain('(plain)');
  });

  it('truncates to one page and notes the dropped rows', () => {
    const lines = Array.from({ length: 60 }, (_, i) => `row ${i}`);
    const pdf = decode(buildSimplePdf({ title: 'Big', lines }));
    expect(pdf).toContain('more rows truncated');
  });

  it('drops non-ASCII characters safely (no raw bytes leak into the stream)', () => {
    const pdf = decode(buildSimplePdf({ title: 'café ☕ x', lines: [] }));
    // Each non-ASCII code unit → '?'; the emoji/accented chars never appear raw.
    expect(pdf).toContain('(caf? ? x)');
    expect(pdf).not.toContain('é');
    expect(pdf).not.toContain('☕');
  });
});
