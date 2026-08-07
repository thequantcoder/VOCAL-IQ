#!/usr/bin/env node
// Validate a locale's catalog block against the English source (run after importing translations).
//
//   node scripts/i18n/validate.mjs            # all regional langs
//   node scripts/i18n/validate.mjs ta gu      # only these
//
// Checks, per locale:
//   • placeholder parity — every translated value keeps the SAME {vars} as its English key
//   • coverage — how many of the 1561 source keys are translated (rest fall back to English)
//   • duplicate keys — a repeated key silently drops a translation (eval keeps the last)
//   • orphans — keys present in the locale that no longer exist in the source
// Exits non-zero if any placeholder mismatch or duplicate is found (safe to wire into CI later).
import {
  LANG_NAMES,
  REGIONAL_LANGS,
  extractBlock,
  placeholders,
  rawDuplicateKeys,
  readCatalog,
} from './lib.mjs';

const args = process.argv.slice(2);
const langs = args.length ? args : REGIONAL_LANGS;

const src = readCatalog();
const hi = extractBlock(src, 'hi');
const sourceKeys = new Set(Object.keys(hi));
const total = sourceKeys.size;

let hadError = false;

for (const lang of langs) {
  const block = extractBlock(src, lang);
  const keys = Object.keys(block);
  const dups = rawDuplicateKeys(src, lang);

  const badVars = [];
  const orphans = [];
  for (const k of keys) {
    if (!sourceKeys.has(k)) {
      orphans.push(k);
      continue;
    }
    const want = placeholders(k).join(' ');
    const got = placeholders(block[k]).join(' ');
    if (want !== got) badVars.push({ key: k, want, got });
  }

  const covered = keys.filter((k) => sourceKeys.has(k)).length;
  const pct = ((covered / total) * 100).toFixed(1);

  console.log(`\n▶ ${lang} — ${LANG_NAMES[lang] ?? lang}`);
  console.log(
    `  coverage : ${covered}/${total} (${pct}%)  ·  ${total - covered} fall back to English`,
  );
  console.log(`  dup keys : ${dups.length ? `❌ ${dups.join(', ')}` : '✓ none'}`);
  console.log(
    `  orphans  : ${orphans.length ? `⚠ ${orphans.length} (key no longer in source)` : '✓ none'}`,
  );
  if (badVars.length) {
    console.log(`  placeholder mismatches: ❌ ${badVars.length}`);
    for (const b of badVars.slice(0, 25))
      console.log(`     • "${b.key}"  expected [${b.want}]  got [${b.got}]`);
    if (badVars.length > 25) console.log(`     …and ${badVars.length - 25} more`);
  } else {
    console.log('  placeholders: ✓ all preserved');
  }

  if (dups.length || badVars.length) hadError = true;
}

console.log('');
process.exit(hadError ? 1 : 0);
