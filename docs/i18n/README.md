# VocalIQ — Regional Translation Hand-off Kit

Everything a translator / language-service-provider (LSP) needs to take the dashboard from
**Hindi-complete** to fully localized across the 9 other Indian languages — **without touching code**.

The single source of truth is `apps/web/lib/i18n/catalogs.ts`. Strings use the **English-as-key**
pattern (the object key *is* the English text; the value is the translation), and `translate()`
falls back per-key: **`chosen locale → English key`**. So a partial catalog degrades gracefully —
anything untranslated shows in English, nothing breaks. That means you can ship **one language, or
even one page, at a time**.

## Scope (auto-generated — re-run `export.mjs` for live numbers)

| | |
|---|---|
| Source strings (English keys, all done in Hindi) | **1561** |
| Strings with `{placeholders}` (must be preserved) | **113** |
| Languages needing a full pass | **9** — bn · ta · te · mr · gu · kn · ml · pa · or |
| Already seeded per language (nav) | 65 → **~1496 to go each** |
| Total to translate | **~13,500 strings** |

`es` (Spanish) and `ar` (Arabic) are also partial; `ar` is **RTL** and needs layout QA beyond copy.

## Who / what you need

- **Native translators** per language — ideally with **software/UI localization** experience (not
  marketing copywriters). An LSP, freelance natives, or a TMS (Crowdin / Lokalise / Locize / Phrase)
  with vetted linguists all work.
- **One native reviewer per language** for a QA pass (biggest quality lever after the glossary).
- Decisions: formal vs informal register per language; which languages ship first.

> None of this needs an API key or credential — it's people + review time, then a paste-back.

## The pipeline

```
1. export      node scripts/i18n/export.mjs
                 → docs/i18n/source-strings.json      (canonical extract)
                 → docs/i18n/out/master.csv           (coordinator: all langs)
                 → docs/i18n/out/translate-<lang>.csv (one sheet per translator)

2. translate   Hand each translator their docs/i18n/out/translate-<lang>.csv.
               They fill ONLY the `translation_<lang>` column. Columns provided:
                 english_key · hindi_reference · placeholders · notes · translation_<lang>
               (rows where a translation already exists — e.g. nav — are pre-filled.)
               Also hand over docs/i18n/glossary.csv (translate the product terms ONCE, reuse).

3. review      Native reviewer QA pass on the returned sheet.

4. import      node scripts/i18n/import.mjs <lang> docs/i18n/out/translate-<lang>.csv
                 → docs/i18n/out/<lang>-block.ts   (paste-ready catalog block)
               Replace that locale's `<lang>: { … }` block in catalogs.ts with the emitted block.

5. verify      npx biome check apps/web/lib/i18n/catalogs.ts
               node scripts/i18n/validate.mjs <lang>
               → placeholder parity, coverage %, duplicate keys, orphans (CI-safe exit code)

6. ship        Commit catalogs.ts. Untranslated keys keep falling back to English — ship anytime.
```

## Rules for translators (put these in the brief)

1. **Preserve `{placeholders}` exactly** — `{n}`, `{time}`, `{name}`, `{count}` … must appear
   verbatim in the translation (the `notes` column flags every such row). `validate.mjs` fails the
   build if a placeholder is added, dropped or renamed.
2. **Do NOT translate** (see `glossary.csv`, `translate=NO`): the brand name **VocalIQ**; acronyms
   (API, SIP, PSTN, PCI, CSV, SLO, STIR/SHAKEN, CNAME, SAML, SCIM …); code identifiers (`slug`,
   `disposition`, `leadStatus`); provider/brand names (Twilio, Deepgram, ElevenLabs, Stripe, WhatsApp
   …); URLs.
3. **Use the glossary** — translate each product term (Agent, Campaign, Lead, Squad, Disposition,
   Wallet, Reseller, White-label, Tenant …) once and reuse it consistently everywhere.
4. **Reference the Hindi column** — the product meaning is already resolved there.
5. **Keep it UI-tight** — prefer concise wording; very long strings can clip in buttons/labels.
6. **Enum data values** (status chips, call direction, gender, timezone) are intentionally **not** in
   this kit — they stay English by design, handled separately in code. Don't invent keys for them.

## Files

| Path | Committed? | What |
|---|---|---|
| `scripts/i18n/export.mjs` | ✅ | Extract source + build translator sheets |
| `scripts/i18n/import.mjs` | ✅ | Filled sheet → paste-ready catalog block |
| `scripts/i18n/validate.mjs` | ✅ | Placeholder parity / coverage / dup / orphan checks |
| `scripts/i18n/glossary.mjs` | ✅ | Regenerate the glossary |
| `scripts/i18n/lib.mjs` | ✅ | Shared catalog parser / CSV / TS-emit helpers |
| `docs/i18n/source-strings.json` | ✅ | Canonical extract (snapshot; regenerable) |
| `docs/i18n/glossary.csv` | ✅ | Starter product-term glossary |
| `docs/i18n/out/**` | ⛔ gitignored | Regenerable CSVs + emitted blocks (run `export.mjs`) |

Node only — no pnpm/toolchain needed (`node scripts/i18n/*.mjs`).
