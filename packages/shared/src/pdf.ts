/**
 * Minimal, dependency-free PDF generator (FOLLOWUP) — enough for a titled, single-page text report
 * (e.g. the analytics summary export). Produces valid PDF 1.4 bytes with a correct cross-reference
 * table, using the built-in Helvetica font. No third-party lib → no bundle/dep cost (self-audit F).
 * Pure + web-safe: returns a Uint8Array the api streams as `application/pdf`.
 */

/** Escape a string for a PDF text literal + drop non-Latin1 chars (Helvetica/WinAnsi safe). */
function pdfEscape(s: string): string {
  return s
    .replace(/[^\x20-\x7E]/g, '?')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

export interface SimplePdfInput {
  title: string;
  /** Body lines, drawn top-to-bottom. Long documents are truncated to one page (a note is appended). */
  lines: string[];
}

const PAGE_HEIGHT = 792; // US Letter, points
const TOP = 740;
const LINE_H = 14;
const MAX_LINES = 46; // fits one Letter page below the title

/** Build a single-page PDF (title + text lines). Returns the raw PDF bytes. */
export function buildSimplePdf(input: SimplePdfInput): Uint8Array {
  const bodyLines = input.lines.slice(0, MAX_LINES);
  const truncated = input.lines.length > MAX_LINES;

  // Content stream: title at 16pt, then body lines at 10pt.
  const parts: string[] = [
    'BT',
    `/F1 16 Tf 50 ${TOP} Td (${pdfEscape(input.title)}) Tj`,
    '/F1 10 Tf',
  ];
  let y = TOP - 28;
  for (const line of bodyLines) {
    parts.push(`1 0 0 1 50 ${y} Tm (${pdfEscape(line)}) Tj`);
    y -= LINE_H;
  }
  if (truncated) {
    parts.push(`1 0 0 1 50 ${y} Tm (… ${input.lines.length - MAX_LINES} more rows truncated) Tj`);
  }
  parts.push('ET');
  const content = parts.join('\n');

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 ${PAGE_HEIGHT}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefOffset = pdf.length;
  const pad = (n: number) => n.toString().padStart(10, '0');
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) xref += `${pad(off)} 00000 n \n`;
  pdf += xref;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new TextEncoder().encode(pdf);
}
