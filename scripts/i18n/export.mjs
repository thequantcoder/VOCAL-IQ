#!/usr/bin/env node
// Generate the translator hand-off kit from apps/web/lib/i18n/catalogs.ts.
//
//   node scripts/i18n/export.mjs
//
// Outputs (all regenerable — catalogs.ts stays the single source of truth):
//   docs/i18n/source-strings.json        canonical extract: every English key + Hindi reference + vars
//   docs/i18n/out/master.csv             all keys × all regional target columns (coordinator view)
//   docs/i18n/out/translate-<lang>.csv   one sheet per language for its translator (target column empty,
//                                        pre-filled where a translation already exists, e.g. nav)
import fs from 'node:fs';
import path from 'node:path';
import {
  LANG_NAMES,
  REGIONAL_LANGS,
  ROOT,
  csvCell,
  extractBlock,
  placeholders,
  readCatalog,
} from './lib.mjs';

const OUT_DIR = path.join(ROOT, 'docs', 'i18n');
const GEN_DIR = path.join(OUT_DIR, 'out');
fs.mkdirSync(GEN_DIR, { recursive: true });

const src = readCatalog();
const hi = extractBlock(src, 'hi');
const existing = Object.fromEntries(REGIONAL_LANGS.map((l) => [l, extractBlock(src, l)]));

const keys = Object.keys(hi);
const strings = keys.map((k) => ({ key: k, hindiReference: hi[k], vars: placeholders(k) }));

// 1. canonical JSON
fs.writeFileSync(
  path.join(OUT_DIR, 'source-strings.json'),
  `${JSON.stringify(
    {
      generatedFrom: 'apps/web/lib/i18n/catalogs.ts',
      count: strings.length,
      langs: REGIONAL_LANGS,
      strings,
    },
    null,
    2,
  )}\n`,
);

// 2. master CSV
const masterHead = ['english_key', 'hindi_reference', 'placeholders', ...REGIONAL_LANGS];
const masterRows = strings.map((s) => [
  csvCell(s.key),
  csvCell(s.hindiReference),
  csvCell(s.vars.join(' ')),
  ...REGIONAL_LANGS.map((l) => csvCell(existing[l]?.[s.key] ?? '')),
]);
fs.writeFileSync(
  path.join(GEN_DIR, 'master.csv'),
  `${[masterHead.map(csvCell).join(','), ...masterRows.map((r) => r.join(','))].join('\n')}\n`,
);

// 3. per-language translator sheets
const summary = [];
for (const lang of REGIONAL_LANGS) {
  const head = ['english_key', 'hindi_reference', 'placeholders', 'notes', `translation_${lang}`];
  let prefilled = 0;
  const rows = strings.map((s) => {
    const cur = existing[lang]?.[s.key] ?? '';
    if (cur) prefilled++;
    const note = s.vars.length ? `KEEP placeholders: ${s.vars.map((v) => `{${v}}`).join(' ')}` : '';
    return [
      csvCell(s.key),
      csvCell(s.hindiReference),
      csvCell(s.vars.join(' ')),
      csvCell(note),
      csvCell(cur),
    ].join(',');
  });
  fs.writeFileSync(
    path.join(GEN_DIR, `translate-${lang}.csv`),
    `${[head.map(csvCell).join(','), ...rows].join('\n')}\n`,
  );
  summary.push({
    lang: LANG_NAMES[lang],
    total: strings.length,
    prefilled,
    todo: strings.length - prefilled,
  });
}

console.log(`Extracted ${strings.length} source strings from catalogs.ts (hi block).`);
console.log(
  `  ${strings.filter((s) => s.vars.length).length} carry {placeholders} — translators must preserve them.`,
);
console.log(
  `Wrote docs/i18n/source-strings.json + docs/i18n/out/master.csv + ${REGIONAL_LANGS.length} per-language sheets.\n`,
);
console.table(summary);
