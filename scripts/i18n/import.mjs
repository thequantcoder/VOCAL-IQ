#!/usr/bin/env node
// Fold a completed translator sheet back into a paste-ready catalog block.
//
//   node scripts/i18n/import.mjs ta docs/i18n/out/translate-ta.csv
//
// Reads the filled `translation_<lang>` column, drops empty rows (they fall back to English),
// validates placeholder parity per row, and writes docs/i18n/out/<lang>-block.ts — a catalog-style
// object block ready to REPLACE that locale's block in apps/web/lib/i18n/catalogs.ts. Nothing is
// written to catalogs.ts automatically (keeps the human edit + biome pass in the loop).
import fs from 'node:fs';
import path from 'node:path';
import {
  LANG_NAMES,
  ROOT,
  extractBlock,
  parseCsv,
  placeholders,
  readCatalog,
  tsKey,
  tsString,
} from './lib.mjs';

const [lang, csvPath] = process.argv.slice(2);
if (!lang || !csvPath) {
  console.error('usage: node scripts/i18n/import.mjs <lang> <path-to-filled-csv>');
  process.exit(2);
}

const src = readCatalog();
const hi = extractBlock(src, 'hi');
const sourceKeys = new Set(Object.keys(hi));

const rows = parseCsv(fs.readFileSync(path.resolve(csvPath), 'utf8'));
const header = rows.shift() ?? [];
const keyCol = header.indexOf('english_key');
const tgtCol = header.findIndex((h) => h.startsWith('translation_'));
if (keyCol === -1 || tgtCol === -1) {
  console.error(
    'CSV must have `english_key` and `translation_<lang>` columns (regenerate with export.mjs).',
  );
  process.exit(2);
}

const out = [];
const problems = [];
let empty = 0;
for (const r of rows) {
  const key = r[keyCol];
  const val = (r[tgtCol] ?? '').trim();
  if (!key) continue;
  if (!val) {
    empty++;
    continue;
  }
  if (!sourceKeys.has(key)) {
    problems.push(`orphan (not in source): "${key}"`);
    continue;
  }
  const want = placeholders(key).join(' ');
  const got = placeholders(val).join(' ');
  if (want !== got) {
    problems.push(`placeholder mismatch "${key}": expected [${want}] got [${got}]`);
    continue;
  }
  out.push([key, val]);
}

const blockLines = out.map(([k, v]) => `    ${tsKey(k)}: ${tsString(v)},`);
const block = `  ${lang}: {\n${blockLines.join('\n')}\n  },\n`;
const outPath = path.join(ROOT, 'docs', 'i18n', 'out', `${lang}-block.ts`);
fs.writeFileSync(outPath, block);

console.log(`${lang} — ${LANG_NAMES[lang] ?? lang}`);
console.log(`  translated: ${out.length}  ·  empty (→ English fallback): ${empty}`);
if (problems.length) {
  console.log(`  ⚠ ${problems.length} rows skipped:`);
  for (const p of problems.slice(0, 25)) console.log(`     • ${p}`);
  if (problems.length > 25) console.log(`     …and ${problems.length - 25} more`);
}
console.log(
  `  wrote ${path.relative(ROOT, outPath)} — replace the \`${lang}: { … }\` block in catalogs.ts with it, then:`,
);
console.log(
  `     npx biome check apps/web/lib/i18n/catalogs.ts && node scripts/i18n/validate.mjs ${lang}`,
);
