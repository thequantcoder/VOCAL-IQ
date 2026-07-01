/**
 * Text chunking for RAG ingestion (Day 20). Splits on paragraph/sentence boundaries into
 * overlapping windows so retrieval has enough context without oversized chunks. Pure +
 * deterministic → unit-tested.
 */
export function chunkText(text: string, opts: { size?: number; overlap?: number } = {}): string[] {
  const size = opts.size ?? 800;
  const overlap = opts.overlap ?? 120;
  const clean = text.replace(/\r\n/g, '\n').trim();
  if (!clean) return [];
  if (clean.length <= size) return [clean];

  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + size, clean.length);
    if (end < clean.length) {
      // Prefer to break at a paragraph/sentence/space boundary before the hard cap.
      const slice = clean.slice(start, end);
      const brk = Math.max(
        slice.lastIndexOf('\n\n'),
        slice.lastIndexOf('. '),
        slice.lastIndexOf(' '),
      );
      if (brk > size * 0.5) end = start + brk + 1;
    }
    const chunk = clean.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= clean.length) break;
    start = end - overlap;
  }
  return chunks;
}
