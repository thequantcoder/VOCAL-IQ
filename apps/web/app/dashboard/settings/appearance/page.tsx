'use client';

import {
  COLOR_MODES,
  DENSITIES,
  FONTS,
  MOTION_LEVELS,
  RADII,
  THEME_PRESETS,
  THEME_PRESET_SWATCHES,
  type ThemeConfig,
  type ThemePreset,
} from '@vocaliq/shared';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  SegmentedControl,
  Separator,
  Switch,
  Waveform,
} from '@vocaliq/ui';
import { RadialGauge, Sparkline, StatCard } from '@vocaliq/ui/charts';
import { Reveal, Stagger, StaggerItem, useMotionLevel } from '@vocaliq/ui/motion';
import { Check, Palette, RotateCcw } from 'lucide-react';
import { useTheme } from 'next-themes';
import { setSoundEnabled, useSoundEnabled } from '../../../../lib/sound';
import { resetUserTheme, setUserTheme, useUserTheme } from '../../../../lib/theme-store';

const SPARK = [6, 9, 7, 12, 10, 15, 13, 19];

/** Human labels for the enum controls. */
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function AppearancePage() {
  const theme = useUserTheme();

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2 font-display font-semibold text-vq-text-hi text-xl">
            <Palette size={20} /> Appearance
          </h1>
          <p className="text-sm text-vq-text-lo">
            Make VocalIQ yours — pick a theme or craft your own. Changes apply instantly and save to
            your account.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => resetUserTheme()}>
          <RotateCcw size={15} /> Reset
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-6">
          <PresetGallery theme={theme} />
          <ModeAndControls theme={theme} />
          <CustomColors theme={theme} />
        </div>
        <div className="lg:sticky lg:top-6 lg:self-start">
          <LivePreview />
        </div>
      </div>
    </div>
  );
}

function PresetGallery({ theme }: { theme: ThemeConfig }) {
  const custom = Boolean(theme.colors.primary || theme.colors.accent || theme.colors.secondary);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Theme</CardTitle>
      </CardHeader>
      <CardContent>
        <Stagger className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {THEME_PRESETS.map((p) => {
            const active = theme.preset === p && !custom;
            return (
              <StaggerItem key={p}>
                <PresetCard preset={p} active={active} />
              </StaggerItem>
            );
          })}
        </Stagger>
        {custom && (
          <p className="mt-3 text-vq-text-lo text-xs">
            You've customised colours below — pick a preset to reset them.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function PresetCard({ preset, active }: { preset: ThemePreset; active: boolean }) {
  const s = THEME_PRESET_SWATCHES[preset];
  return (
    <button
      type="button"
      onClick={() => setUserTheme({ preset, colors: {} })}
      aria-pressed={active}
      className={`vq-lift flex flex-col gap-2 rounded-vq-card border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vq-ring ${
        active
          ? 'border-vq-violet ring-1 ring-vq-violet/40'
          : 'border-vq-border hover:border-vq-violet/40'
      }`}
    >
      <div className="flex h-10 overflow-hidden rounded-vq">
        <span className="flex-1" style={{ background: s.primary }} />
        <span className="w-1/3" style={{ background: s.accent }} />
      </div>
      <div className="flex items-center justify-between">
        <span className="font-medium text-sm text-vq-text-hi capitalize">{preset}</span>
        {active && <Check size={14} className="text-vq-violet" />}
      </div>
    </button>
  );
}

function ModeAndControls({ theme }: { theme: ThemeConfig }) {
  const { setTheme: setMode } = useTheme();
  const { setLevel } = useMotionLevel();
  const soundOn = useSoundEnabled();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Controls</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Control label="Mode">
          <SegmentedControl
            aria-label="Colour mode"
            value={theme.mode}
            onValueChange={(v) => {
              setMode(v);
              setUserTheme({ mode: v as ThemeConfig['mode'] });
            }}
            options={COLOR_MODES.map((m) => ({ value: m, label: cap(m) }))}
          />
        </Control>
        <Control label="Corners">
          <SegmentedControl
            aria-label="Corner radius"
            value={theme.radius}
            onValueChange={(v) => setUserTheme({ radius: v as ThemeConfig['radius'] })}
            options={RADII.map((r) => ({ value: r, label: cap(r) }))}
          />
        </Control>
        <Control label="Density">
          <SegmentedControl
            aria-label="Density"
            value={theme.density}
            onValueChange={(v) => setUserTheme({ density: v as ThemeConfig['density'] })}
            options={DENSITIES.map((d) => ({ value: d, label: cap(d) }))}
          />
        </Control>
        <Control label="Motion">
          <SegmentedControl
            aria-label="Motion level"
            value={theme.motion}
            onValueChange={(v) => {
              setLevel(v as 'full' | 'reduced' | 'off');
              setUserTheme({ motion: v as ThemeConfig['motion'] });
            }}
            options={MOTION_LEVELS.map((m) => ({ value: m, label: cap(m) }))}
          />
        </Control>
        <Control label="Font">
          <SegmentedControl
            aria-label="Font"
            value={theme.font}
            onValueChange={(v) => setUserTheme({ font: v as ThemeConfig['font'] })}
            options={FONTS.map((f) => ({ value: f, label: cap(f) }))}
          />
        </Control>
        <Control label="Sound effects">
          <div className="flex items-center gap-2">
            <Switch
              id="sound-toggle"
              checked={soundOn}
              onCheckedChange={setSoundEnabled}
              aria-label="Sound effects"
            />
            <span className="text-vq-text-lo text-xs">{soundOn ? 'On' : 'Off'}</span>
          </div>
        </Control>
      </CardContent>
    </Card>
  );
}

function Control({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <span className="font-medium text-sm text-vq-text-hi">{label}</span>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

function CustomColors({ theme }: { theme: ThemeConfig }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          Custom colours
          <Badge variant="outline">optional</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-vq-text-lo text-sm">
          Override the preset's brand colours. Text contrast is auto-corrected so labels stay
          readable.
        </p>
        <ColorField
          label="Primary"
          value={theme.colors.primary ?? THEME_PRESET_SWATCHES[theme.preset].primary}
          onChange={(hex) => setUserTheme({ colors: { ...theme.colors, primary: hex } })}
        />
        <ColorField
          label="Accent"
          value={theme.colors.accent ?? THEME_PRESET_SWATCHES[theme.preset].accent}
          onChange={(hex) => setUserTheme({ colors: { ...theme.colors, accent: hex } })}
        />
      </CardContent>
    </Card>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  const valid = /^#[0-9a-fA-F]{6}$/.test(value);
  return (
    <div className="flex items-center gap-3">
      <span className="w-16 text-sm text-vq-text-hi">{label}</span>
      <label className="relative size-9 shrink-0 cursor-pointer overflow-hidden rounded-vq border border-vq-border">
        <span
          className="absolute inset-0"
          style={{ background: valid ? value : 'var(--vq-border)' }}
        />
        <input
          type="color"
          value={valid ? value : '#7c5cff'}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label={`${label} colour`}
        />
      </label>
      <Input
        value={value}
        mono
        invalid={!valid}
        onChange={(e) => onChange(e.target.value)}
        className="w-32"
        aria-label={`${label} hex`}
      />
    </div>
  );
}

/** A mini-dashboard that re-skins live (it reads the same :root tokens the whole app does). */
function LivePreview() {
  return (
    <Reveal>
      <Card className="flex flex-col gap-4 p-4">
        <span className="font-medium text-sm text-vq-text-hi">Live preview</span>
        <StatCard label="Calls today" value={1284} delta={12.4} spark={SPARK} sentiment="good" />
        <div className="flex items-center gap-3">
          <RadialGauge value={82} size={72} label="Success" />
          <div className="flex flex-1 flex-col gap-2">
            <Sparkline data={SPARK} />
            <div className="flex gap-2">
              <Button size="sm">Primary</Button>
              <Button size="sm" variant="secondary">
                Secondary
              </Button>
            </div>
          </div>
        </div>
        <Separator />
        <div className="h-12">
          <Waveform label="Preview" bars={24} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="primary">primary</Badge>
          <Badge variant="accent">accent</Badge>
          <Badge variant="success">success</Badge>
          <Badge variant="warn">warn</Badge>
        </div>
      </Card>
    </Reveal>
  );
}
