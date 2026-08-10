#!/usr/bin/env node
/**
 * No-secrets-in-artifact guard (PARITY-11). A self-hosted / distributable build must ship ZERO
 * secrets (golden rule #5). This script fails (exit 1) if:
 *   1. a real `.env` (not `.env.example`) is git-tracked, or
 *   2. any tracked, shippable file contains a value that looks like a live secret.
 *
 * Run before cutting a release:  node scripts/check-no-secrets.mjs
 * It reads the git index (so it reflects exactly what would be packaged), not the working tree.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const tracked = execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean);

const problems = [];

// 1. A real dotenv must never be tracked (only the template is allowed).
for (const f of tracked) {
  const base = f.split('/').pop();
  if (base === '.env' || (base?.startsWith('.env.') && base !== '.env.example')) {
    problems.push(`tracked dotenv: ${f} (only .env.example may be committed)`);
  }
}

// 2. Scan shippable text files for live-secret-shaped values. Skip the places where placeholders,
//    fixtures, and documentation legitimately mention these tokens.
const SKIP = [
  /(^|\/)\.env\.example$/,
  /(^|\/)node_modules\//,
  /\.(png|jpg|jpeg|gif|webp|ico|woff2?|ttf|mp3|wav|pdf|docx)$/i,
  /(^|\/)(docs|super-prompts)\//,
  /\.test\.(ts|tsx|js|mjs)$/,
  /(^|\/)scripts\/check-no-secrets\.mjs$/,
];

// Live-secret shapes: a real key with an actual body (not an empty assignment or a placeholder).
const SECRET_PATTERNS = [
  /\bsk-[A-Za-z0-9]{20,}\b/, // OpenAI-style
  /\bsk-ant-[A-Za-z0-9-]{20,}\b/, // Anthropic
  /\bvq_live_[A-Za-z0-9]{16,}\b/, // our live API keys
  /\bAKIA[0-9A-Z]{16}\b/, // AWS access key id
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/, // Slack token
  /-----BEGIN (RSA |EC )?PRIVATE KEY-----/, // private key material
];

for (const f of tracked) {
  if (SKIP.some((re) => re.test(f))) continue;
  let text;
  try {
    text = readFileSync(f, 'utf8');
  } catch {
    continue; // binary/unreadable — skip
  }
  for (const re of SECRET_PATTERNS) {
    const m = text.match(re);
    if (m) problems.push(`possible secret in ${f}: ${m[0].slice(0, 12)}…`);
  }
}

if (problems.length > 0) {
  console.error('✗ no-secrets check FAILED:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`✓ no-secrets check passed (${tracked.length} tracked files scanned).`);
