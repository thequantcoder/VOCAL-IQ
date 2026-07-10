'use client';

import { THEME_PRESETS } from '@vocaliq/shared';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
  Avatar,
  Badge,
  Button,
  Callout,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Chip,
  CircularProgress,
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
  Kbd,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Progress,
  Separator,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  Skeleton,
  Tooltip,
  toast,
} from '@vocaliq/ui';
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
      <TokenGallery />
      <ComponentKit />

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
