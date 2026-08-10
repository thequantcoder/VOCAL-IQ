# DAY 95 — Marketing Landing Page & Signature Hero  🧠 OPUS

**Tier:** 🟣 LAUNCH SURFACE

> ⏱️ **Sequencing:** build when preparing to launch (around **Day 66**) — but the hero concept can be prototyped earlier to validate the visual identity. This is the first thing investors, customers, and resellers see. It must embody `DESIGN-SYSTEM.md` perfectly.

> Execute via the daily loop in `CLAUDE.md §2`.

## Prerequisites (admin)
- Brand finalised (name, logo); final copy/positioning (or approve Claude's draft).
- A sample AI voice clip (or use ElevenLabs) for the interactive "hear it talk" hero.
- Analytics (PostHog) + a form/waitlist destination (or Stripe checkout) for CTAs.

## Context to load
- `DESIGN-SYSTEM.md` (especially §0 thesis, §5a hero, §4 motion, §9 copy)
- `CLAUDE.md`
- `CODING-RULES.md` (#10 UI), Blueprint (positioning, use cases)

## Objective
Build a distinctive, high-converting marketing landing page whose **hero is the signature living waveform that talks** — the most characteristic thing in the product's world (per the design thesis), not a templated big-number/gradient hero. It should feel unmistakably VocalIQ and beat competitor landing pages on craft.

## Step-by-step build
1. **Hero (the thesis):** an interactive, living waveform (violet→cyan) with a "Hear it talk" button that plays a sample AI voice while the waveform pulses to the audio. Confident display-face headline (specific, e.g. "AI that picks up the phone."), one-line subhead, primary CTA. No template big-stat hero.
2. **Live demo / proof:** below the fold, show the builder canvas in motion + a live-call mock with a streaming transcript (reuse real components/styling). Optionally a real interactive demo agent.
3. **Use-case sections:** sales / support / appointments / surveys — each with a crisp benefit (DESIGN-SYSTEM §9 copy voice), scroll-triggered reveals (§4 motion, restrained).
4. **Multi-channel + white-label/reseller sections** (the differentiators), feature highlights, logos/social proof, pricing teaser.
5. **Performance:** static/SSG where possible; optimised assets; Lighthouse/Core Web Vitals budget in CI; lazy-load heavy visuals.
6. **Conversion:** clear CTAs (start free / book demo / become a reseller), PostHog events, SEO meta + OG images, accessible + responsive + reduced-motion.
7. **Tests:** hero audio+waveform works, responsive down to mobile, a11y AA, CWV budget passes, CTA events fire.

## Definition of Done
- [ ] Distinctive waveform hero that plays a sample voice; embodies DESIGN-SYSTEM identity (not a template).
- [ ] Builder + live-call proof sections; use-case + differentiator + pricing sections with on-brand copy.
- [ ] Fast (CWV budget green), responsive, accessible AA, reduced-motion respected.
- [ ] CTAs wired + analytics; SEO/OG done; tests pass.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (A–K). Special attention to: **H (does it look like the category leader, not a template? identity applied, motion deliberate, a11y AA, responsive, CWV), A (hero interaction works), and copy quality (§9).**

## Commit plan
`feat(web): marketing landing page + signature waveform hero (Day 95)` — branch `day/95-landing` → PR → CI green → merge.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
The public face of VocalIQ — built to out-craft competitor landing pages. Confirm brand/copy and the sample voice clip. This is the asset to put in front of investors.
