#!/usr/bin/env node
// Generate docs/i18n/glossary.csv — a STARTER glossary of recurring VocalIQ product terms.
//
//   node scripts/i18n/glossary.mjs
//
// Translators translate each product term ONCE, consistently, then reuse it everywhere — this is
// the single biggest quality lever. Terms marked translate=NO must stay verbatim (brand names,
// acronyms, code identifiers). Hindi references are pulled from the live catalog where the exact
// term is a key; otherwise left blank for the translator/reviewer to set.
import fs from 'node:fs';
import path from 'node:path';
import { REGIONAL_LANGS, ROOT, csvCell, extractBlock, readCatalog } from './lib.mjs';

// Recurring product nouns worth pinning. (Not exhaustive — translators extend it.)
const TRANSLATE = [
  'Agent',
  'Squad',
  'Campaign',
  'Lead',
  'Contact',
  'Call',
  'Inbound',
  'Outbound',
  'Disposition',
  'Transcript',
  'Recording',
  'Appointment',
  'Callback',
  'Voice',
  'Persona',
  'Knowledge base',
  'Workflow',
  'Trigger',
  'Condition',
  'Action',
  'Node',
  'Builder',
  'Template',
  'Phone number',
  'Wallet',
  'Credit',
  'Minute',
  'Markup',
  'Plan',
  'Quota',
  'Reseller',
  'Sub-tenant',
  'Tenant',
  'White-label',
  'Super-admin',
  'Dashboard',
  'Overview',
  'Analytics',
  'Settings',
  'Billing',
  'Integration',
  'Provider',
  'Consent',
  'Compliance',
  'Disclosure',
  'Fraud',
  'Reputation',
  'Simulator',
  'Widget',
  'Channel',
  'Lead status',
];

// Must stay verbatim across every language.
const DO_NOT_TRANSLATE = [
  'VocalIQ',
  'API',
  'SIP',
  'PSTN',
  'STIR/SHAKEN',
  'PCI',
  'CSV',
  'SLO',
  'SLA',
  'CNAME',
  'SMS',
  'RCS',
  'slug',
  'disposition',
  'leadStatus',
  'Webhook',
  'OAuth',
  'SAML',
  'OIDC',
  'SCIM',
  'LiveKit',
  'Twilio',
  'Telnyx',
  'Plivo',
  'Deepgram',
  'ElevenLabs',
  'Sarvam',
  'Stripe',
  'WhatsApp',
  'Messenger',
  'Instagram',
  'Telegram',
  'BYOK',
  'RLS',
  'JWT',
];

const src = readCatalog();
const hi = extractBlock(src, 'hi');

const head = ['term_english', 'translate', 'hindi_reference', 'notes', ...REGIONAL_LANGS];
const rows = [];
for (const t of TRANSLATE) {
  rows.push([
    t,
    'YES',
    hi[t] ?? '',
    'translate consistently everywhere',
    ...REGIONAL_LANGS.map(() => ''),
  ]);
}
for (const t of DO_NOT_TRANSLATE) {
  rows.push([
    t,
    'NO',
    t,
    'keep verbatim (brand / acronym / code id)',
    ...REGIONAL_LANGS.map(() => t),
  ]);
}

const csv = [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
fs.writeFileSync(path.join(ROOT, 'docs', 'i18n', 'glossary.csv'), `${csv}\n`);
console.log(
  `Wrote docs/i18n/glossary.csv — ${TRANSLATE.length} terms to translate + ${DO_NOT_TRANSLATE.length} do-not-translate.`,
);
