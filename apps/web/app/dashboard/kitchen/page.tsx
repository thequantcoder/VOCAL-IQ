'use client';

import { MOTION_DURATIONS, MOTION_LEVELS, THEME_PRESETS } from '@vocaliq/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@vocaliq/ui';
import { FlaskConical, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';

/**
 * Kitchen-sink / living component gallery (UX-00). Every new primitive from the UI/UX Elevation
 * Program is demoed here as it's built (motion engine, voice-motion, data-viz, theme presets…), with
 * reduced-motion toggles for QA. Dev-only: the content renders solely on localhost (or when
 * NEXT_PUBLIC_DEV_LOGIN=true) so it never appears on a real deployment. Sections fill in over UX-01+.
 */
export default function KitchenSinkPage() {
  const [show, setShow] = useState(false);
  const [reducedOS, setReducedOS] = useState(false);

  useEffect(() => {
    const h = window.location.hostname;
    setShow(h === 'localhost' || h === '127.0.0.1' || process.env.NEXT_PUBLIC_DEV_LOGIN === 'true');
    setReducedOS(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);

  if (!show) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center text-sm text-vq-text-lo">
        The component gallery is available in local development only.
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 font-display font-semibold text-vq-text-hi text-xl">
          <FlaskConical size={20} /> Component gallery
        </h1>
        <p className="text-sm text-vq-text-lo">
          The living kitchen-sink for the UI/UX Elevation program — primitives land here as they're
          built. OS reduced-motion is currently{' '}
          <span className="text-vq-text-hi">{reducedOS ? 'ON' : 'off'}</span>.
        </p>
      </div>

      <Section title="Motion tokens (UX-00 contract)">
        <div className="flex flex-wrap gap-2">
          {Object.entries(MOTION_DURATIONS).map(([k, v]) => (
            <Chip key={k}>
              {k} · {v}ms
            </Chip>
          ))}
          {MOTION_LEVELS.map((m) => (
            <Chip key={m}>motion: {m}</Chip>
          ))}
        </div>
      </Section>

      <Section title="Theme presets (UX-00 contract · applied in UX-12)">
        <div className="flex flex-wrap gap-2">
          {THEME_PRESETS.map((p) => (
            <Chip key={p}>{p}</Chip>
          ))}
        </div>
      </Section>

      <Card className="border-vq-border border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles size={16} className="text-vq-violet" /> Coming next
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-vq-text-lo">
          UX-01 mounts the motion engine + primitives (Reveal / Stagger / Pop / AnimatedNumber /
          PageTransition) here; UX-02 adds the color/elevation/density swatches; UX-03 the component
          kit; UX-04 the voice-motion set; UX-09 the data-viz gallery. This page is the QA surface
          for all of it.
        </CardContent>
      </Card>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-vq-pill border border-vq-border px-2.5 py-1 text-vq-text-lo text-xs">
      {children}
    </span>
  );
}
