# DAY 68 — UI Internationalization & Localization (App Interface)  ⚡ SONNET

> **Sequencing note:** this is about translating the **product UI itself** (buttons, labels, emails, dates, currency) — distinct from agents *speaking* multiple languages (Day 25). For a white-label platform sold to global resellers, it matters. **Recommended:** lay the i18n foundation early (right after Day 1's design system, or alongside Day 50 polish) so strings aren't hardcoded everywhere; full translation can come later. Numbered 68 only to avoid renumbering. Follow the daily loop.

## Prerequisites (admin)
- Decide launch locales (e.g. English + Hindi + Spanish + Arabic) and whether RTL (Arabic/Hebrew) is in scope.
- No new third-party credentials (optionally a translation-management service later, e.g. Crowdin/Locize).

## Context to load
- `CLAUDE.md`
- `CODING-RULES.md` (#10 UI, #11 docs)
- `TECH-STACK.md` (Next.js i18n)
- Blueprint §3.8 (white-label), §2.2 (compliance-aware, residency)

## Objective
Make the entire app UI localizable: extract all user-facing strings into message catalogs, add locale switching, localize dates/numbers/currency, support RTL, and localize transactional emails — so resellers and customers can use VocalIQ in their language. This is interface i18n, not agent speech.

## Step-by-step build
1. **i18n framework:** add `next-intl` (or `react-i18next`) to `apps/web`; configure locale routing/detection (cookie + Accept-Language + tenant default).
2. **String extraction:** replace hardcoded UI strings with message keys + an English base catalog; add a lint rule / check to catch new hardcoded strings.
3. **Locale switching:** user + tenant-level locale preference (tenant default cascades to its users; reseller can set a default for its sub-tenants).
4. **Formatting:** localize dates, times, numbers, and **currency** (ties to billing — show plan prices in the tenant's currency/format); timezone-aware display everywhere.
5. **RTL support:** logical CSS properties + `dir` handling so Arabic/Hebrew render correctly; verify the builder canvas + dashboards in RTL.
6. **Email localization:** transactional emails (Resend) localized per recipient locale; localized templates for invoices/notifications.
7. **Translation workflow:** structure catalogs for handing to translators (or a TMS like Crowdin/Locize); document the add-a-locale process in `BUILD-LOG.md`.
8. **Tests:** locale switching, formatting (date/number/currency per locale), RTL render smoke, no-hardcoded-string check, fallback to English on missing keys.

## Definition of Done
- [ ] UI strings come from catalogs; a check prevents new hardcoded strings.
- [ ] User + tenant locale switching works; reseller default cascades.
- [ ] Dates/numbers/currency localized; timezones correct; RTL renders correctly.
- [ ] Transactional emails localized; fallback to English on missing keys.
- [ ] Add-a-locale process documented; tests pass.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (A–K). Special attention to: **H (UI in all target locales + RTL + a11y), A (currency/date formatting correctness, esp. with billing), J (no hardcoded strings, catalog hygiene), B (tenant/reseller locale defaults scoped).**

## Commit plan
`feat(web): UI i18n + localization (RTL, currency, emails) (Day 68/slot early)` — branch `day/68-ui-i18n` → PR → CI green → merge. If you lay the foundation early and translate later, split into two commits across the days you actually do them.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
The product UI is now localizable for global resellers/customers. Provide the target locales + whether RTL is needed; translation can be incremental after the foundation lands.
