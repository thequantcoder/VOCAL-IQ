'use client';

import { THEME_PRESETS } from '@vocaliq/shared';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@vocaliq/ui';
import {
  AnimatedNumber,
  Collapse,
  Fade,
  Pop,
  Reveal,
  Stagger,
  StaggerItem,
  useMotionLevel,
} from '@vocaliq/ui/motion';
import { FlaskConical, RotateCw, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';

/**
 * Kitchen-sink / living component gallery (UX-00, motion added UX-01). Demos every primitive with a
 * live motion-level toggle so we QA reduced-motion / off parity. Dev-only (localhost).
 */
export default function KitchenSinkPage() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const h = window.location.hostname;
    setShow(h === 'localhost' || h === '127.0.0.1' || process.env.NEXT_PUBLIC_DEV_LOGIN === 'true');
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
          Primitives from the UI/UX Elevation program. Flip the motion level to QA reduced/off
          parity.
        </p>
      </div>

      <MotionControls />
      <MotionPrimitives />

      <Section title="Theme presets (contract · applied in UX-12)">
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
          UX-02 adds color/elevation/density swatches; UX-03 the component kit; UX-04 the
          voice-motion set; UX-09 the data-viz gallery.
        </CardContent>
      </Card>
    </div>
  );
}

function MotionControls() {
  const { level, setLevel } = useMotionLevel();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Motion level</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center gap-2">
        {(['full', 'reduced', 'off'] as const).map((l) => (
          <Button
            key={l}
            size="sm"
            variant={level === l ? 'primary' : 'secondary'}
            onClick={() => setLevel(l)}
          >
            {l}
          </Button>
        ))}
        <span className="ml-2 text-vq-text-lo text-xs">
          current: <span className="text-vq-text-hi">{level}</span> · mirrored to{' '}
          <code className="text-vq-text-hi">html[data-motion]</code>
        </span>
      </CardContent>
    </Card>
  );
}

function MotionPrimitives() {
  const [nonce, setNonce] = useState(0); // remount to replay entrances
  const [open, setOpen] = useState(false);
  const [n, setN] = useState(1240);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">Motion primitives</CardTitle>
        <Button size="sm" variant="ghost" onClick={() => setNonce((v) => v + 1)}>
          <RotateCw size={14} /> Replay
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div key={nonce} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Reveal className="rounded-vq border border-vq-border p-4 text-sm text-vq-text-lo">
            <span className="text-vq-text-hi">Reveal</span> — fade + rise
          </Reveal>
          <Fade className="rounded-vq border border-vq-border p-4 text-sm text-vq-text-lo">
            <span className="text-vq-text-hi">Fade</span> — opacity only
          </Fade>
          <Pop className="rounded-vq border border-vq-border p-4 text-sm text-vq-text-lo">
            <span className="text-vq-text-hi">Pop</span> — scale-in
          </Pop>
        </div>

        <div>
          <p className="mb-2 text-vq-text-lo text-xs">Stagger + StaggerItem</p>
          <Stagger key={`s-${nonce}`} className="flex flex-wrap gap-2">
            {['Sales', 'Support', 'Booking', 'Surveys', 'Outbound', 'Inbound'].map((t) => (
              <StaggerItem
                key={t}
                className="rounded-vq-pill border border-vq-border px-3 py-1.5 text-sm text-vq-text-hi"
              >
                {t}
              </StaggerItem>
            ))}
          </Stagger>
        </div>

        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-vq-text-lo text-xs">AnimatedNumber:</span>
            <span className="font-display font-semibold text-2xl text-vq-text-hi">
              <AnimatedNumber value={n} />
            </span>
            <Button size="sm" variant="secondary" onClick={() => setN(Math.round(n * 1.7 + 130))}>
              +
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-vq-text-lo text-xs">$ format:</span>
            <span className="font-mono text-vq-text-hi">
              <AnimatedNumber value={n / 100} format={(v) => `$${v.toFixed(2)}`} />
            </span>
          </div>
        </div>

        <div>
          <Button size="sm" variant="secondary" onClick={() => setOpen((v) => !v)}>
            Toggle Collapse
          </Button>
          <Collapse open={open}>
            <p className="mt-2 rounded-vq border border-vq-border p-3 text-sm text-vq-text-lo">
              Collapse content — animates by height (grid-rows), layout-safe, killed when motion is
              off.
            </p>
          </Collapse>
        </div>
      </CardContent>
    </Card>
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
