import {
  LANDING_CHANNELS,
  LANDING_DIFFERENTIATORS,
  LANDING_PRICING,
  LANDING_USE_CASES,
  formatTierPrice,
} from '@vocaliq/shared';
import { Card, CardContent } from '@vocaliq/ui';
import { ArrowRight, Check, PhoneCall } from 'lucide-react';
import Link from 'next/link';
import { AudioHero } from '../components/audio-hero';
import { LandingAuth } from '../components/landing-auth';
import { TrackedCta } from '../components/tracked-cta';
import { ThemeToggle } from './theme-toggle';

/**
 * The public marketing landing page (Day 95). The hero is the signature living waveform that TALKS
 * (DESIGN-SYSTEM §0/§5a) — the most characteristic thing in the product's world, not a template
 * big-stat hero. Static/SSG; the only client islands are the audio hero, the CTAs (analytics), and
 * the auth swap. On-brand copy (§9), restrained scroll surfaces, accessible + responsive.
 */
export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col bg-vq-bg-base text-vq-text-hi">
      {/* Header */}
      <header className="sticky top-0 z-20 border-vq-border/60 border-b bg-vq-bg-base/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link href="/" className="flex items-center gap-2">
            <span className="inline-block h-6 w-1.5 rounded-vq-pill bg-vq-violet" aria-hidden />
            <span className="font-display font-semibold text-vq-text-hi">VocalIQ</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-vq-text-lo md:flex">
            <a href="#product" className="hover:text-vq-text-hi">
              Product
            </a>
            <a href="#use-cases" className="hover:text-vq-text-hi">
              Use cases
            </a>
            <a href="#pricing" className="hover:text-vq-text-hi">
              Pricing
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <LandingAuth />
          </div>
        </div>
      </header>

      {/* Hero — the thesis */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="-z-10 -translate-x-1/2 pointer-events-none absolute top-0 left-1/2 h-[520px] w-[820px] rounded-full opacity-30 blur-3xl"
          style={{
            background: 'radial-gradient(closest-side, var(--vq-violet), transparent)',
          }}
        />
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-8 px-6 pt-16 pb-20 text-center sm:pt-24">
          <span className="rounded-vq-pill border border-vq-border px-3 py-1 text-vq-text-lo text-xs">
            Agentic Voice AI · white-label · self-hostable
          </span>
          <AudioHero />
          <h1 className="max-w-3xl font-bold font-display text-5xl text-vq-text-hi tracking-tight sm:text-7xl">
            AI that picks up the phone.
          </h1>
          <p className="max-w-xl text-lg text-vq-text-lo">
            Design a voice agent, put it on a number, and let it sell, support, and book — inbound
            and outbound, in any language, on every channel your customers use.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <TrackedCta href="/sign-up" event="landing_start_free">
              Start free <ArrowRight size={18} />
            </TrackedCta>
            <TrackedCta
              href="mailto:hello@vocaliq.dev?subject=VocalIQ demo"
              event="landing_book_demo"
              variant="secondary"
            >
              Book a demo
            </TrackedCta>
          </div>
          {/* Channel row */}
          <div className="flex flex-wrap items-center justify-center gap-2 pt-4">
            {LANDING_CHANNELS.map((ch) => (
              <span
                key={ch}
                className="rounded-vq-pill border border-vq-border px-2.5 py-1 text-vq-text-lo text-xs"
              >
                {ch}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Live-call proof */}
      <section id="product" className="border-vq-border/60 border-y bg-vq-bg-elevated/40">
        <div className="mx-auto grid max-w-5xl gap-8 px-6 py-16 md:grid-cols-2 md:items-center">
          <div className="flex flex-col gap-3">
            <h2 className="font-display font-semibold text-2xl text-vq-text-hi sm:text-3xl">
              Watch it work, live.
            </h2>
            <p className="text-vq-text-lo">
              Every call streams a transcript, detects intent, and meters its own cost in real time.
              Build the flow visually, test it in the panel, and publish to a number in minutes.
            </p>
            <Link
              href="/sign-up"
              className="flex w-fit items-center gap-1 text-sm text-vq-violet hover:underline"
            >
              Open the builder <ArrowRight size={15} />
            </Link>
          </div>
          <LiveCallMock />
        </div>
      </section>

      {/* Use cases */}
      <section id="use-cases" className="mx-auto max-w-5xl px-6 py-16">
        <h2 className="mb-8 text-center font-display font-semibold text-2xl text-vq-text-hi sm:text-3xl">
          One agent. Every job on the phone.
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {LANDING_USE_CASES.map((u) => (
            <Card key={u.key}>
              <CardContent className="flex flex-col gap-1.5 py-5">
                <h3 className="font-medium text-vq-text-hi">{u.title}</h3>
                <p className="text-sm text-vq-text-lo">{u.blurb}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Differentiators */}
      <section className="border-vq-border/60 border-y bg-vq-bg-elevated/40">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <h2 className="mb-8 text-center font-display font-semibold text-2xl text-vq-text-hi sm:text-3xl">
            Why teams pick VocalIQ
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {LANDING_DIFFERENTIATORS.map((d) => (
              <div key={d.title} className="flex gap-3 rounded-vq border border-vq-border p-4">
                <Check size={18} className="mt-0.5 shrink-0 text-vq-cyan" />
                <div className="flex flex-col gap-1">
                  <h3 className="font-medium text-vq-text-hi">{d.title}</h3>
                  <p className="text-sm text-vq-text-lo">{d.blurb}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mx-auto max-w-5xl px-6 py-16">
        <h2 className="mb-2 text-center font-display font-semibold text-2xl text-vq-text-hi sm:text-3xl">
          Simple pricing, honest margins.
        </h2>
        <p className="mb-8 text-center text-sm text-vq-text-lo">
          Start free. Scale to video avatars, biometrics, and a white-label reseller platform.
        </p>
        <div className="grid gap-4 md:grid-cols-3">
          {LANDING_PRICING.map((t) => (
            <div
              key={t.name}
              className={`flex flex-col gap-4 rounded-vq-card border p-6 ${
                t.featured
                  ? 'border-vq-violet bg-vq-bg-elevated shadow-lg'
                  : 'border-vq-border bg-vq-bg-elevated/40'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-display font-semibold text-vq-text-hi">{t.name}</span>
                {t.featured && (
                  <span className="rounded-vq-pill bg-vq-violet/15 px-2 py-0.5 text-vq-violet text-xs">
                    Popular
                  </span>
                )}
              </div>
              <div className="flex items-baseline gap-1">
                <span className="font-bold font-display text-3xl text-vq-text-hi">
                  {formatTierPrice(t)}
                </span>
              </div>
              <p className="text-sm text-vq-text-lo">{t.tagline}</p>
              <ul className="flex flex-col gap-2 text-sm">
                {t.highlights.map((h) => (
                  <li key={h} className="flex items-start gap-2 text-vq-text-lo">
                    <Check size={15} className="mt-0.5 shrink-0 text-vq-cyan" />
                    {h}
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-2">
                <TrackedCta
                  href="/sign-up"
                  event={`landing_pricing_${t.name.toLowerCase()}`}
                  size="sm"
                  variant={t.featured ? 'primary' : 'secondary'}
                >
                  {t.priceUsd === 0 ? 'Start free' : `Choose ${t.name}`}
                </TrackedCta>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA band */}
      <section className="border-vq-border/60 border-t bg-vq-bg-elevated/40">
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-5 px-6 py-16 text-center">
          <h2 className="font-display font-semibold text-3xl text-vq-text-hi">
            Give your business a voice.
          </h2>
          <p className="max-w-lg text-vq-text-lo">
            Launch your first agent free, or resell VocalIQ under your own brand.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <TrackedCta href="/sign-up" event="landing_footer_start_free">
              Start free <ArrowRight size={18} />
            </TrackedCta>
            <TrackedCta
              href="mailto:partners@vocaliq.dev?subject=Reseller"
              event="landing_become_reseller"
              variant="secondary"
            >
              Become a reseller
            </TrackedCta>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-6 py-8 text-sm text-vq-text-lo sm:flex-row">
        <span className="flex items-center gap-2">
          <span className="inline-block h-4 w-1 rounded-vq-pill bg-vq-violet" aria-hidden /> ©
          VocalIQ
        </span>
        <div className="flex items-center gap-5">
          <Link href="/privacy" className="hover:text-vq-text-hi">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-vq-text-hi">
            Terms
          </Link>
          <Link href="/status" className="hover:text-vq-text-hi">
            Status
          </Link>
        </div>
      </footer>
    </main>
  );
}

/** A static, on-brand mock of a live call — cyan "live" accents, streaming-transcript styling. */
function LiveCallMock() {
  const lines = [
    { who: 'agent', text: 'Hi, thanks for calling VocalIQ — how can I help today?' },
    { who: 'caller', text: 'I’d like to book a demo for next week.' },
    { who: 'agent', text: 'Happy to. Does Tuesday at 10 work?' },
    { who: 'caller', text: 'Perfect.' },
  ];
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-vq-border/60 border-b px-4 py-2.5">
        <span className="flex items-center gap-2 text-sm text-vq-text-hi">
          <PhoneCall size={15} className="text-vq-cyan" /> Live call
        </span>
        <span className="flex items-center gap-1.5 text-vq-cyan text-xs">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-vq-cyan" /> streaming
        </span>
      </div>
      <CardContent className="flex flex-col gap-2.5 py-4">
        {lines.map((l) => (
          <div
            key={l.text}
            className={`max-w-[85%] rounded-vq px-3 py-2 text-sm ${
              l.who === 'agent'
                ? 'self-start bg-vq-bg-base text-vq-text-hi'
                : 'self-end bg-vq-violet/10 text-vq-text-hi'
            }`}
          >
            {l.text}
          </div>
        ))}
        <div className="mt-1 flex items-center justify-between border-vq-border/60 border-t pt-2 text-vq-text-lo text-xs">
          <span>Intent: book_demo</span>
          <span className="font-mono">$0.021 · 00:38</span>
        </div>
      </CardContent>
    </Card>
  );
}
