'use client';

import { INDIAN_LANGUAGES, TRANSLATION_LANGUAGES, isIndianLanguage } from '@vocaliq/shared';
import { cn } from '@vocaliq/ui';

/**
 * Agent language picker (India roadmap Phase 2). Indian languages (native script) are surfaced first
 * — the platform's India play. The FIRST selected language is the PRIMARY: it drives the call's voice
 * routing (an Indic primary → the agent talks via Sarvam Saaras+sarvam-30b+Bulbul end-to-end). Value
 * is an ordered `string[]` of base codes (primary first) — exactly what the agent stores.
 */

// Global (non-Indian) languages for multilingual agents — from the shared translation catalog.
const GLOBAL_LANGUAGES = TRANSLATION_LANGUAGES.filter((l) => !isIndianLanguage(l.code));

export function LanguagePicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const primary = value[0];

  function toggle(code: string) {
    onChange(value.includes(code) ? value.filter((c) => c !== code) : [...value, code]);
  }
  function makePrimary(code: string) {
    if (!value.includes(code) || value[0] === code) return;
    onChange([code, ...value.filter((c) => c !== code)]);
  }

  return (
    <div className="flex flex-col gap-3">
      <Group title="🇮🇳 Indian languages" hint="Sarvam voice AI — best Hindi + regional accuracy">
        {INDIAN_LANGUAGES.map((l) => (
          <Chip
            key={l.code}
            selected={value.includes(l.code)}
            primary={primary === l.code}
            onToggle={() => toggle(l.code)}
            onPrimary={() => makePrimary(l.code)}
            label={l.native}
            sub={l.label}
          />
        ))}
      </Group>
      <Group title="Global languages">
        {GLOBAL_LANGUAGES.map((l) => (
          <Chip
            key={l.code}
            selected={value.includes(l.code)}
            primary={primary === l.code}
            onToggle={() => toggle(l.code)}
            onPrimary={() => makePrimary(l.code)}
            label={l.label}
          />
        ))}
      </Group>
      {primary ? (
        <p className="text-vq-text-lo text-xs">
          Primary: <span className="font-medium text-vq-text-hi">{labelFor(primary)}</span>
          {isIndianLanguage(primary) ? (
            <span className="ml-1.5 rounded-full bg-vq-violet/15 px-2 py-0.5 font-medium text-[11px] text-vq-violet">
              Sarvam voice
            </span>
          ) : null}
          <span className="ml-1"> — drives the agent's voice + language routing.</span>
        </p>
      ) : (
        <p className="text-vq-danger text-xs">Pick at least one language.</p>
      )}
    </div>
  );
}

function Group({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <span className="font-medium text-vq-text-hi text-xs">{title}</span>
        {hint ? <span className="text-[11px] text-vq-text-lo">{hint}</span> : null}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Chip({
  selected,
  primary,
  onToggle,
  onPrimary,
  label,
  sub,
}: {
  selected: boolean;
  primary: boolean;
  onToggle: () => void;
  onPrimary: () => void;
  label: string;
  sub?: string;
}) {
  return (
    <button
      type="button"
      onClick={selected && !primary ? onPrimary : onToggle}
      title={selected && !primary ? 'Click to make primary' : undefined}
      className={cn(
        'flex items-center gap-1.5 rounded-vq border px-2.5 py-1.5 text-sm transition-colors',
        selected
          ? 'border-vq-violet/60 bg-vq-violet/10 text-vq-text-hi'
          : 'border-vq-border bg-vq-bg-base text-vq-text-lo hover:border-vq-violet/40',
      )}
    >
      <span>{label}</span>
      {sub ? <span className="text-[11px] text-vq-text-lo">{sub}</span> : null}
      {primary ? (
        <span className="rounded-full bg-vq-violet px-1.5 text-[10px] text-white">Primary</span>
      ) : null}
    </button>
  );
}

function labelFor(code: string): string {
  const indian = INDIAN_LANGUAGES.find((l) => l.code === code);
  if (indian) return `${indian.native} (${indian.label})`;
  return TRANSLATION_LANGUAGES.find((l) => l.code === code)?.label ?? code;
}
