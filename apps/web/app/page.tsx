import { Button, Card, CardContent, CardHeader, CardTitle, Input, Waveform } from '@vocaliq/ui';
import { LandingAuth } from '../components/landing-auth';
import { ThemeToggle } from './theme-toggle';

/*
 * Day 1 design-system proof surface + auth controls. The header's signed-in/out swap is a
 * client component (`LandingAuth`) reading the self-hosted JWT session. The real §5a
 * marketing hero is Day ~66.
 */
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-10 px-6 py-12">
      <header className="flex items-center justify-between">
        <span className="rounded-vq-pill border border-vq-border px-3 py-1 text-sm text-vq-text-lo">
          Self-hosted
        </span>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <LandingAuth />
        </div>
      </header>

      <section className="flex flex-col items-center gap-6 text-center">
        {/* The hero motif — sound made visible (DESIGN-SYSTEM §0). */}
        <div className="h-24 w-full max-w-md">
          <Waveform live label="VocalIQ live waveform" bars={36} />
        </div>
        <h1 className="font-display text-5xl font-bold tracking-tight text-vq-text-hi sm:text-6xl">
          AI that picks up the phone.
        </h1>
        <p className="max-w-xl text-lg text-vq-text-lo">
          The VocalIQ design system is live — tokens, themes, and the signature waveform. The visual
          builder and the live-call console land in the days ahead.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button size="lg">Build an agent</Button>
          <Button variant="secondary" size="lg">
            Watch a live call
          </Button>
        </div>
      </section>

      <section className="grid gap-5 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Component library</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              <Button size="sm">Primary</Button>
              <Button variant="secondary" size="sm">
                Secondary
              </Button>
              <Button variant="ghost" size="sm">
                Ghost
              </Button>
              <Button variant="danger" size="sm">
                Danger
              </Button>
            </div>
            <Input placeholder="you@company.com" aria-label="Email" />
            <Input mono placeholder="+1 555 0100" aria-label="Phone number" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quiet by default</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm text-vq-text-lo">
              Cyan means live. Violet is the brand. Everything else stays calm.
            </p>
            <div className="h-16 w-full rounded-vq bg-vq-bg-base p-2">
              <Waveform label="Ambient waveform" bars={24} />
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
