'use client';

import { SARVAM_VOICES, type SarvamVoice } from '@vocaliq/shared';
import { cn } from '@vocaliq/ui';

/**
 * Sarvam Bulbul voice picker (India roadmap Phase 2). Shown on the agent builder ONLY when the
 * agent's primary language is Indic — the 39 Bulbul v3 speakers that voice an Indian-language call.
 * Single-select: `value` is the chosen speaker id (stored on the agent's persona → drives Sarvam TTS).
 */

const FEMALE = SARVAM_VOICES.filter((v) => v.gender === 'female');
const MALE = SARVAM_VOICES.filter((v) => v.gender === 'male');

export function SarvamVoicePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <Group title="Female voices">
        {FEMALE.map((v) => (
          <VoiceChip
            key={v.id}
            voice={v}
            selected={value === v.id}
            onSelect={() => onChange(v.id)}
          />
        ))}
      </Group>
      <Group title="Male voices">
        {MALE.map((v) => (
          <VoiceChip
            key={v.id}
            voice={v}
            selected={value === v.id}
            onSelect={() => onChange(v.id)}
          />
        ))}
      </Group>
      <p className="text-vq-text-lo text-xs">
        Voiced by <span className="font-medium text-vq-text-hi">Sarvam Bulbul</span> — tuned for
        natural Hindi + regional Indian speech.
      </p>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="font-medium text-vq-text-hi text-xs">{title}</span>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function VoiceChip({
  voice,
  selected,
  onSelect,
}: {
  voice: SarvamVoice;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'rounded-vq border px-2.5 py-1.5 text-sm capitalize transition-colors',
        selected
          ? 'border-vq-violet/60 bg-vq-violet/10 text-vq-text-hi'
          : 'border-vq-border bg-vq-bg-base text-vq-text-lo hover:border-vq-violet/40',
      )}
    >
      {voice.id}
    </button>
  );
}
