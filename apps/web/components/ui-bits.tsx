import { cn } from '@vocaliq/ui';
import { Globe, type LucideIcon, MessageCircle, Phone, Radio } from 'lucide-react';

/** USD with sub-cent precision (provider costs are tiny). */
export function formatUsd(n: number): string {
  return `$${n.toFixed(n < 0.1 ? 4 : 2)}`;
}

export function formatDuration(sec: number | null): string {
  if (sec == null) return '—';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Status colour is paired with the label text (never colour-only — a11y §7).
const STATUS_TONE: Record<string, string> = {
  COMPLETED: 'text-vq-success border-vq-success/40 bg-vq-success/10',
  IN_PROGRESS: 'text-vq-cyan border-vq-cyan/40 bg-vq-cyan/10',
  RINGING: 'text-vq-cyan border-vq-cyan/40 bg-vq-cyan/10',
  QUEUED: 'text-vq-text-lo border-vq-border bg-vq-bg-elevated',
  FAILED: 'text-vq-danger border-vq-danger/40 bg-vq-danger/10',
  NO_ANSWER: 'text-vq-warn border-vq-warn/40 bg-vq-warn/10',
  VOICEMAIL: 'text-vq-warn border-vq-warn/40 bg-vq-warn/10',
  PUBLISHED: 'text-vq-success border-vq-success/40 bg-vq-success/10',
  DRAFT: 'text-vq-text-lo border-vq-border bg-vq-bg-elevated',
  ARCHIVED: 'text-vq-text-lo border-vq-border bg-vq-bg-elevated',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-vq-pill border px-2 py-0.5 font-medium text-xs',
        STATUS_TONE[status] ?? 'text-vq-text-lo border-vq-border bg-vq-bg-elevated',
      )}
    >
      {status.replace(/_/g, ' ').toLowerCase()}
    </span>
  );
}

// Channel badge (WAC-04): WhatsApp gets the brand-green tone; the rest stay neutral. Icon + label so
// it's never colour-only (a11y §7); `iconOnly` renders the glyph with an sr-only label for tight rows.
const MUTED_TONE = 'text-vq-text-lo border-vq-border bg-vq-bg-elevated';
const CHANNEL_META: Record<string, { label: string; tone: string; Icon: LucideIcon }> = {
  WHATSAPP: {
    label: 'WhatsApp',
    tone: 'text-vq-success border-vq-success/40 bg-vq-success/10',
    Icon: MessageCircle,
  },
  MESSENGER: {
    label: 'Messenger',
    tone: 'text-vq-cyan border-vq-cyan/40 bg-vq-cyan/10',
    Icon: MessageCircle,
  },
  PSTN: { label: 'Phone', tone: MUTED_TONE, Icon: Phone },
  WEB: { label: 'Web', tone: MUTED_TONE, Icon: Globe },
  SIP: { label: 'SIP', tone: MUTED_TONE, Icon: Radio },
};

export function ChannelBadge({
  channel,
  iconOnly = false,
}: { channel: string; iconOnly?: boolean }) {
  const meta = CHANNEL_META[channel] ?? { label: channel, tone: MUTED_TONE, Icon: Phone };
  const { Icon } = meta;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-vq-pill border px-2 py-0.5 font-medium text-xs',
        meta.tone,
      )}
      title={meta.label}
    >
      <Icon size={12} aria-hidden />
      {iconOnly ? <span className="sr-only">{meta.label}</span> : meta.label}
    </span>
  );
}
