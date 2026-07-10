'use client';

import { THEME_PRESETS } from '@vocaliq/shared';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  AgentAvatar,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
  AmbientBackground,
  Avatar,
  Badge,
  Button,
  Callout,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  Chip,
  CircularProgress,
  CopyButton,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  FormField,
  Illustration,
  type IllustrationName,
  Input,
  Kbd,
  Label,
  MagneticButton,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Progress,
  RadioGroup,
  RadioGroupItem,
  SegmentedControl,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  Skeleton,
  Slider,
  Stepper,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  Tooltip,
  fireConfetti,
  toast,
} from '@vocaliq/ui';
import { Meter, RadialGauge, Sparkline, StatCard, TrendDelta } from '@vocaliq/ui/charts';
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
import {
  type AgentState,
  ConversationViz,
  ListeningPulse,
  LiveWaveform,
  ThinkingDots,
  TranscriptStream,
  type TranscriptTurn,
  VoiceOrb,
  useSimulatedAgent,
} from '@vocaliq/ui/voice';
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
      <TokenGallery />
      <ComponentKit />
      <ButtonKit />
      <InputsKit />
      <VoiceMotionKit />
      <PresenceKit />
      <DataVizKit />

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

const SCALES = ['primary', 'secondary', 'accent', 'neutral'] as const;
const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const;

/** Full token gallery (UX-02) — color scales, semantics, viz palette, elevation, radius. */
function TokenGallery() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Design tokens (UX-02)</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {/* Color scales — swatches read the CSS vars directly (theme-reactive). */}
        <div className="flex flex-col gap-3">
          {SCALES.map((s) => (
            <div key={s}>
              <p className="mb-1 text-vq-text-lo text-xs capitalize">{s}</p>
              <div className="flex overflow-hidden rounded-vq border border-vq-border">
                {STEPS.map((n) => (
                  <div
                    key={n}
                    className="flex h-10 flex-1 items-end justify-center pb-1"
                    style={{ background: `var(--${s}-${n})` }}
                  >
                    <span
                      className={n >= 400 ? 'text-white/80 text-[9px]' : 'text-black/50 text-[9px]'}
                    >
                      {n}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Semantic states — on-color fg + subtle bg (literal Tailwind utilities → verify generation). */}
        <div className="flex flex-wrap gap-2">
          <span className="rounded-vq bg-primary-500 px-3 py-1.5 text-primary-fg text-sm">
            primary
          </span>
          <span className="rounded-vq bg-success px-3 py-1.5 text-success-fg text-sm">success</span>
          <span className="rounded-vq bg-warn px-3 py-1.5 text-warn-fg text-sm">warn</span>
          <span className="rounded-vq bg-danger px-3 py-1.5 text-danger-fg text-sm">danger</span>
          <span className="rounded-vq bg-info px-3 py-1.5 text-info-fg text-sm">info</span>
          <span className="rounded-vq bg-success-subtle px-3 py-1.5 text-vq-text-hi text-sm">
            success-subtle
          </span>
        </div>

        {/* Data-viz palette. */}
        <div>
          <p className="mb-1 text-vq-text-lo text-xs">Data-viz palette</p>
          <div className="flex gap-1.5">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <div
                key={n}
                className="h-8 flex-1 rounded-vq-sm"
                style={{ background: `var(--viz-${n})` }}
              />
            ))}
          </div>
        </div>

        {/* Elevation + radius. */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-vq-text-lo text-xs">Elevation</p>
            <div className="flex gap-3">
              {(['elev-1', 'elev-2', 'elev-3'] as const).map((e) => (
                <div
                  key={e}
                  className="flex h-14 flex-1 items-center justify-center rounded-vq bg-vq-bg-elevated text-vq-text-lo text-xs"
                  style={{ boxShadow: `var(--${e})` }}
                >
                  {e}
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-vq-text-lo text-xs">Radius</p>
            <div className="flex items-end gap-3">
              {(['radius-sm', 'radius', 'radius-card', 'radius-lg'] as const).map((r) => (
                <div
                  key={r}
                  className="h-14 flex-1 border border-vq-border bg-vq-bg-elevated"
                  style={{ borderRadius: `var(--${r})` }}
                />
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** Component kit v1 (UX-03) — overlays, feedback, display. */
function ComponentKit() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Component kit v1 (UX-03)</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {/* Badges + chips */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="primary">primary</Badge>
          <Badge variant="success">success</Badge>
          <Badge variant="warn">warn</Badge>
          <Badge variant="danger">danger</Badge>
          <Badge variant="accent">live</Badge>
          <Badge variant="outline">outline</Badge>
          <Chip onRemove={() => {}}>removable</Chip>
        </div>

        <Separator />

        {/* Feedback: toasts + callout */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => toast.success('Saved', { description: 'Your changes are live.' })}
          >
            Toast success
          </Button>
          <Button size="sm" variant="secondary" onClick={() => toast.error('Something failed')}>
            Toast error
          </Button>
          <Button size="sm" variant="secondary" onClick={() => toast.info('Heads up')}>
            Toast info
          </Button>
        </div>
        <Callout variant="info" title="Callout">
          A contextual note with a semantic left rule and tint.
        </Callout>

        {/* Overlays: tooltip, popover, dropdown, dialog, alert, sheet */}
        <div className="flex flex-wrap items-center gap-2">
          <Tooltip content="A helpful tooltip">
            <Button size="sm" variant="secondary">
              Hover me
            </Button>
          </Tooltip>

          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="secondary">
                Popover
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 text-sm text-vq-text-lo">
              A popover with arbitrary content.
            </PopoverContent>
          </Popover>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="secondary">
                Menu
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => toast('Edit')}>Edit</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => toast('Duplicate')}>Duplicate</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive onSelect={() => toast.error('Deleted')}>
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Dialog>
            <DialogTrigger asChild>
              <Button size="sm">Dialog</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create an agent</DialogTitle>
                <DialogDescription>A focus-trapped, animated modal.</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button size="sm">Create</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="danger">
                Delete…
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogTitle>Delete this agent?</AlertDialogTitle>
              <AlertDialogDescription>This can't be undone.</AlertDialogDescription>
              <AlertDialogFooter>
                <AlertDialogCancel asChild>
                  <Button size="sm" variant="secondary">
                    Cancel
                  </Button>
                </AlertDialogCancel>
                <AlertDialogAction asChild>
                  <Button size="sm" variant="danger" onClick={() => toast.error('Deleted')}>
                    Delete
                  </Button>
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Sheet>
            <SheetTrigger asChild>
              <Button size="sm" variant="secondary">
                Sheet
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Side panel</SheetTitle>
              </SheetHeader>
              <p className="text-sm text-vq-text-lo">Slides in from the edge.</p>
            </SheetContent>
          </Sheet>
        </div>

        <Separator />

        {/* Display: avatars, progress, skeleton */}
        <div className="flex flex-wrap items-center gap-4">
          <Avatar name="Sky Rivera" status="live" />
          <Avatar name="Jordan Lee" status="online" />
          <Avatar name="Casey Ng" status="busy" />
          <div className="flex items-center gap-2 text-vq-text-lo text-xs">
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd> to search
          </div>
          <CircularProgress value={68} size={44}>
            68
          </CircularProgress>
        </div>
        <Progress value={68} label="Usage" />
        <div className="flex gap-2">
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 w-24" />
        </div>

        <EmptyState
          title="No agents yet"
          hint="Create your first voice agent to place a call."
          action={<Button size="sm">Create an agent</Button>}
        />
      </CardContent>
    </Card>
  );
}

const ONBOARD_STEPS = [
  { label: 'Account' },
  { label: 'Agent' },
  { label: 'Number' },
  { label: 'Launch' },
];

const SPARK_A = [4, 6, 5, 8, 7, 11, 9, 14, 13, 18];
const SPARK_B = [20, 18, 19, 15, 16, 12, 13, 10, 11, 8];

/** Data-viz kit (UX-09a) — sparklines, radial gauges, meters, trend deltas, animated stat cards. */
function DataVizKit() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Data-viz &amp; infographics (UX-09)</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {/* Metric cards with count-up + delta + sparkline + sentiment glow. */}
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard
            label="Calls today"
            value={1284}
            delta={12.4}
            spark={SPARK_A}
            sentiment="good"
          />
          <StatCard
            label="Avg cost / call"
            value={0.42}
            format={(v) => `$${v.toFixed(2)}`}
            delta={-6.1}
            deltaInvert
            spark={SPARK_B}
            sentiment="good"
          />
          <StatCard
            label="Failed calls"
            value={37}
            delta={8.3}
            deltaInvert
            spark={SPARK_A}
            sentiment="bad"
          />
        </div>

        <Separator />

        {/* Gauges + meters. */}
        <div className="flex flex-wrap items-center gap-8">
          <div className="flex flex-col items-center gap-1">
            <RadialGauge value={82} label="Success rate" />
            <span className="text-vq-text-lo text-xs">Success rate</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <RadialGauge value={54} label="Sentiment" />
            <span className="text-vq-text-lo text-xs">Positive sentiment</span>
          </div>
          <div className="flex min-w-56 flex-1 flex-col gap-3">
            <Meter label="Minutes used" value={7400} max={10000} target={9000} />
            <Meter label="Storage" value={46} max={50} />
            <div className="flex items-center gap-3 text-sm">
              <span className="text-vq-text-lo">vs last week</span>
              <TrendDelta value={12.4} />
              <TrendDelta value={-4.2} />
              <TrendDelta value={-3.1} invert />
            </div>
          </div>
        </div>

        {/* Standalone sparklines. */}
        <div className="flex flex-wrap items-center gap-4">
          <Sparkline data={SPARK_A} label="Upward trend" />
          <Sparkline data={SPARK_B} color="var(--viz-3)" label="Downward trend" />
          <Sparkline data={SPARK_A} color="var(--viz-5)" area={false} label="Line only" />
        </div>
      </CardContent>
    </Card>
  );
}

/** Button interaction system (UX-08) — press/hover sheen/loading/success + magnetic CTA + copy. */
function ButtonKit() {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const runAsync = () => {
    setDone(false);
    setLoading(true);
    // Simulate a mutation: pending → success.
    window.setTimeout(() => {
      setLoading(false);
      setDone(true);
      window.setTimeout(() => setDone(false), 2000);
    }, 1300);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Buttons &amp; CTAs (UX-08)</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {/* Variants with hover sheen (primary/danger). */}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
        </div>

        {/* Async: loading → success. */}
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" loading={loading} success={done} onClick={runAsync}>
            {done ? 'Published' : 'Publish agent'}
          </Button>
          <span className="text-vq-text-lo text-xs">
            click → spinner → checkmark (reduced-motion: instant)
          </span>
        </div>

        <Separator />

        {/* Magnetic hero CTA + ripple. */}
        <div className="flex flex-wrap items-center gap-4">
          <MagneticButton variant="primary" size="lg" onClick={() => fireConfetti()}>
            <Sparkles size={16} /> Celebrate 🎉
          </MagneticButton>
          <span className="text-vq-text-lo text-xs">
            magnetic hover + ripple; click fires confetti (off under reduced motion)
          </span>
        </div>

        {/* Copy micro-interaction. */}
        <div className="flex items-center gap-3">
          <code className="rounded-vq-sm bg-vq-bg-base px-2 py-1 font-mono text-vq-text-hi text-xs">
            vq_live_sk_9f2a…c71
          </code>
          <CopyButton value="vq_live_sk_9f2a_demo_c71" showLabel />
        </div>
      </CardContent>
    </Card>
  );
}

/** Inputs + nav kit (UX-03b) — form controls, select, segmented, slider, tabs, accordion, stepper. */
function InputsKit() {
  const [notify, setNotify] = useState(true);
  const [terms, setTerms] = useState(false);
  const [plan, setPlan] = useState('pro');
  const [voice, setVoice] = useState('nova');
  const [temp, setTemp] = useState([40]);
  const [mode, setMode] = useState('inbound');
  const [step, setStep] = useState(1);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Inputs &amp; nav (UX-03b)</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {/* Toggles */}
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-2">
            <Switch id="k-notify" checked={notify} onCheckedChange={setNotify} />
            <Label htmlFor="k-notify">Call notifications</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="k-terms" checked={terms} onCheckedChange={(v) => setTerms(v === true)} />
            <Label htmlFor="k-terms">Accept terms</Label>
          </div>
        </div>

        {/* Radio group */}
        <div className="flex flex-col gap-2">
          <Label>Plan</Label>
          <RadioGroup value={plan} onValueChange={setPlan} className="flex gap-5">
            {['free', 'pro', 'scale'].map((p) => (
              <div key={p} className="flex items-center gap-2">
                <RadioGroupItem value={p} id={`plan-${p}`} />
                <Label htmlFor={`plan-${p}`} className="capitalize">
                  {p}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </div>

        <Separator />

        {/* FormField + Input + Textarea + Select */}
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Agent name" hint="Shown to callers" required>
            {(p) => <Input placeholder="Aria" {...p} />}
          </FormField>
          <FormField label="From number" error="Enter a valid E.164 number">
            {(p) => <Input placeholder="+1…" invalid {...p} />}
          </FormField>
          <div className="flex flex-col gap-1.5">
            <Label>Voice</Label>
            <Select value={voice} onValueChange={setVoice}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a voice" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nova">Nova (warm)</SelectItem>
                <SelectItem value="atlas">Atlas (deep)</SelectItem>
                <SelectItem value="sky">Sky (bright)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <FormField label="Greeting">
            {(p) => <Textarea placeholder="Hi, thanks for calling…" {...p} />}
          </FormField>
        </div>

        {/* Slider + segmented */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-8">
          <div className="flex-1">
            <Label className="mb-2 block">Creativity — {temp[0]}%</Label>
            <Slider
              value={temp}
              onValueChange={setTemp}
              max={100}
              step={1}
              aria-label="Creativity"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Call mode</Label>
            <SegmentedControl
              value={mode}
              onValueChange={setMode}
              aria-label="Call mode"
              options={[
                { value: 'inbound', label: 'Inbound' },
                { value: 'outbound', label: 'Outbound' },
                { value: 'both', label: 'Both' },
              ]}
            />
          </div>
        </div>

        <Separator />

        {/* Tabs */}
        <Tabs defaultValue="prompt">
          <TabsList>
            <TabsTrigger value="prompt">Prompt</TabsTrigger>
            <TabsTrigger value="tools">Tools</TabsTrigger>
            <TabsTrigger value="voice">Voice</TabsTrigger>
          </TabsList>
          <TabsContent value="prompt" className="text-sm text-vq-text-lo">
            The system prompt that shapes the agent's persona and goals.
          </TabsContent>
          <TabsContent value="tools" className="text-sm text-vq-text-lo">
            Webhooks, transfers, and knowledge the agent can call mid-conversation.
          </TabsContent>
          <TabsContent value="voice" className="text-sm text-vq-text-lo">
            TTS voice, speaking rate, and language for this agent.
          </TabsContent>
        </Tabs>

        {/* Accordion */}
        <Accordion type="single" collapsible defaultValue="a1">
          <AccordionItem value="a1">
            <AccordionTrigger>What counts as a billed minute?</AccordionTrigger>
            <AccordionContent>
              Connected talk-time, rounded up, summed per call across STT + LLM + TTS + telephony.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="a2">
            <AccordionTrigger>Can I bring my own provider keys?</AccordionTrigger>
            <AccordionContent>
              Yes — BYOK mode uses your keys with a thin platform fee; managed mode meters credits.
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <Separator />

        {/* Stepper */}
        <div className="flex flex-col gap-4">
          <Stepper steps={ONBOARD_STEPS} current={step} />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
            >
              Back
            </Button>
            <Button
              size="sm"
              onClick={() => setStep((s) => Math.min(ONBOARD_STEPS.length - 1, s + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const AGENT_SEEDS = [
  'agent_sales_01',
  'agent_support_ada',
  'booking-bot',
  'survey_9f2',
  'nova-outbound',
];
const ILLUSTRATIONS: IllustrationName[] = [
  'no-agents',
  'no-calls',
  'no-leads',
  'all-done',
  'error-404',
  'error-500',
];

/** Presence + atmosphere (UX-05) — procedural agent avatars, ambient background, illustration set. */
function PresenceKit() {
  const [avatarState, setAvatarState] = useState<AgentState>('speaking');
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Presence &amp; atmosphere (UX-05)</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {/* Procedural agent avatars — distinct per seed. */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="font-medium text-sm text-vq-text-hi">Agent avatars (seeded)</span>
            <SegmentedControl
              value={avatarState}
              onValueChange={(v) => setAvatarState(v as AgentState)}
              aria-label="Avatar state"
              options={[
                { value: 'idle', label: 'Idle' },
                { value: 'listening', label: 'Listening' },
                { value: 'speaking', label: 'Speaking' },
              ]}
            />
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {AGENT_SEEDS.map((seed) => (
              <div key={seed} className="flex flex-col items-center gap-1.5">
                <AgentAvatar seed={seed} name={seed} size={52} state={avatarState} />
                <span className="max-w-16 truncate text-[0.7rem] text-vq-text-lo">{seed}</span>
              </div>
            ))}
          </div>
        </div>

        <Separator />

        {/* Ambient background layer. */}
        <div className="flex flex-col gap-2">
          <span className="font-medium text-sm text-vq-text-hi">Ambient background</span>
          <div className="relative h-40 overflow-hidden rounded-vq-card border border-vq-border">
            <AmbientBackground intensity={0.6} particles />
            <div className="relative z-10 grid h-full place-items-center">
              <span className="font-display font-semibold text-lg text-vq-text-hi">
                Sound, made visible.
              </span>
            </div>
          </div>
        </div>

        <Separator />

        {/* Illustration set. */}
        <div className="flex flex-col gap-2">
          <span className="font-medium text-sm text-vq-text-hi">Illustrations</span>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {ILLUSTRATIONS.map((n) => (
              <div
                key={n}
                className="flex flex-col items-center gap-1 rounded-vq border border-vq-border p-3"
              >
                <Illustration name={n} size={96} />
                <span className="text-[0.7rem] text-vq-text-lo">{n}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Illustrated empty state (composition with EmptyState). */}
        <EmptyState
          icon={<Illustration name="no-agents" size={104} />}
          title="No agents yet"
          hint="Create your first voice agent to place a call."
          action={<Button size="sm">Create an agent</Button>}
        />
      </CardContent>
    </Card>
  );
}

const STATE_COPY: Record<AgentState, string> = {
  idle: 'Idle — waiting for the caller',
  listening: 'Listening to the caller',
  thinking: 'Thinking (LLM)',
  speaking: 'Speaking (TTS)',
};

/** Voice-motion primitives (UX-04) — a mini "live call" that choreographs every primitive off one state. */
function VoiceMotionKit() {
  const state = useSimulatedAgent();

  const turns: TranscriptTurn[] = [
    { speaker: 'agent', text: 'Hi, thanks for calling VocalIQ — how can I help today?' },
    { speaker: 'caller', text: 'I was hoping to book a product demo for next week.' },
  ];
  if (state === 'speaking') {
    turns.push({
      speaker: 'agent',
      text: 'Absolutely — I can set that up for you. What day works best?',
      live: true,
    });
  } else if (state === 'listening') {
    turns.push({
      speaker: 'caller',
      text: 'Tuesday afternoon would be perfect if you have anything open.',
      live: true,
    });
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">Voice-motion primitives (UX-04)</CardTitle>
        <Badge variant="accent">auto-cycling</Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-8">
          <VoiceOrb state={state} size={104} label={`Agent ${state}`} />
          <div className="flex flex-1 flex-col gap-3">
            <div className="flex items-center gap-2 text-sm">
              {state === 'listening' && <ListeningPulse />}
              {state === 'thinking' && <ThinkingDots />}
              <span className="font-medium text-vq-text-hi">{STATE_COPY[state]}</span>
            </div>
            <LiveWaveform state={state} label={`Waveform — ${state}`} />
          </div>
        </div>

        <ConversationViz state={state} />

        <TranscriptStream turns={turns} />

        <p className="text-vq-text-lo text-xs">
          One <code className="text-vq-text-hi">useSimulatedAgent()</code> drives the orb, waveform,
          conversation viz, indicators, and transcript together. Flip the motion level above to see
          the reduced-motion / off fallbacks (static forms, no rAF/loops).
        </p>
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
