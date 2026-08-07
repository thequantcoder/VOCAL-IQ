// Shared helpers for the i18n translator-handoff tooling.
//
// The single source of truth is `apps/web/lib/i18n/catalogs.ts`. Its per-locale objects are plain
// JS object literals (English-as-key: the KEY is the English string, the VALUE is the translation),
// so we parse a block by slicing it out and letting JS itself evaluate the literal — this handles
// every quote style, escape, `{var}` placeholder and multi-line value exactly as the app sees it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CATALOG = path.join(ROOT, 'apps', 'web', 'lib', 'i18n', 'catalogs.ts');

/** The 9 non-Hindi Indian locales that need a full professional pass (nav is already seeded). */
export const REGIONAL_LANGS = ['bn', 'ta', 'te', 'mr', 'gu', 'kn', 'ml', 'pa', 'or'];

export const LANG_NAMES = {
  bn: 'Bengali (বাংলা)',
  ta: 'Tamil (தமிழ்)',
  te: 'Telugu (తెలుగు)',
  mr: 'Marathi (मराठी)',
  gu: 'Gujarati (ગુજરાતી)',
  kn: 'Kannada (ಕನ್ನಡ)',
  ml: 'Malayalam (മലയാളം)',
  pa: 'Punjabi (ਪੰਜਾਬੀ)',
  or: 'Odia (ଓଡ଼ିଆ)',
};

/** Read the catalog file as text. */
export function readCatalog() {
  return fs.readFileSync(CATALOG, 'utf8');
}

/**
 * Extract one locale block (e.g. `hi`) from the catalog source into a real object.
 * Returns {} if the block is absent.
 */
export function extractBlock(src, name) {
  const head = `\n  ${name}: {`;
  const start = src.indexOf(head);
  if (start === -1) return {};
  const after = start + head.length;
  // The block ends where the next top-level 2-letter locale block begins (or the object closes).
  const rest = src.slice(after);
  const next = rest.match(/\n {2}[a-z]{2}: \{/);
  const end = next ? after + next.index : after + rest.indexOf('\n};');
  let body = src.slice(after, end);
  const lastClose = body.lastIndexOf('},');
  if (lastClose !== -1) body = body.slice(0, lastClose);
  // Evaluate the object literal (our own trusted first-party source). Comments + trailing commas
  // are fine, and letting JS parse its own object literal is the most robust extraction.
  // biome-ignore lint/security/noGlobalEval: trusted first-party catalog file, not user input
  const obj = eval(`({${body}\n})`);
  return obj;
}

/** The `{var}` placeholder names in a string, as a sorted array (for parity checks). */
export function placeholders(s) {
  return [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
}

/**
 * Raw (pre-eval) duplicate-key scan of a locale block — eval() silently keeps the last of a dup,
 * which would drop a translation, so we detect dups textually.
 */
export function rawDuplicateKeys(src, name) {
  const head = `\n  ${name}: {`;
  const start = src.indexOf(head);
  if (start === -1) return [];
  const after = start + head.length;
  const rest = src.slice(after);
  const next = rest.match(/\n {2}[a-z]{2}: \{/);
  const end = next ? after + next.index : after + rest.indexOf('\n};');
  const body = src.slice(after, end);
  const seen = new Set();
  const dups = new Set();
  for (const line of body.split('\n')) {
    const m = line.match(/^ {4}(['"].*?['"]|[A-Za-z_$][\w$]*)\s*:/);
    if (m) {
      const k = m[1];
      if (seen.has(k)) dups.add(k);
      else seen.add(k);
    }
  }
  return [...dups];
}

// ---- CSV ----

/** Quote a value for CSV; newlines/tabs become literal \n / \t so each string stays on one row. */
export function csvCell(v) {
  const t = String(v ?? '')
    .replace(/\r?\n/g, '\\n')
    .replace(/\t/g, '\\t');
  return `"${t.replace(/"/g, '""')}"`;
}

/** Parse CSV text into rows of string cells (RFC-4180-ish; unescapes our \n / \t markers). */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQ = false;
      } else cell += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.map((r) => r.map((x) => x.replace(/\\n/g, '\n').replace(/\\t/g, '\t')));
}

// ---- TypeScript emission (for the importer) ----

/** Emit a catalog-style string literal, mirroring the file's quote convention. */
export function tsString(s) {
  const str = String(s);
  const hasSingle = str.includes("'");
  const hasDouble = str.includes('"');
  const esc = (x, q) =>
    x.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(new RegExp(q, 'g'), `\\${q}`);
  if (!hasSingle) return `'${esc(str, "'")}'`;
  if (!hasDouble) return `"${esc(str, '"')}"`;
  return `'${esc(str, "'")}'`;
}

/** Emit a catalog-style object key: bare when a valid identifier, else quoted. */
export function tsKey(k) {
  return /^[A-Za-z_$][\w$]*$/.test(k) ? k : tsString(k);
}
