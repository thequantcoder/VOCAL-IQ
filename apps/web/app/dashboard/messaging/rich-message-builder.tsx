'use client';

import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@vocaliq/ui';
import { Image as ImageIcon, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import {
  type RcsCard,
  type RcsSuggestion,
  type RichMessageInput,
  useSendRichMessage,
} from '../../../lib/api';
import { useI18n } from '../../../lib/i18n/provider';

/** GME-13: compose a rich RCS message (text / card / carousel + suggestion chips) with a live preview
 *  and send it via the cascade (RCS → SMS/WhatsApp fallback). English-as-key + Hindi via useI18n. */

type Kind = 'text' | 'card' | 'carousel';
interface CardDraft {
  id: string;
  title: string;
  description: string;
  mediaUrl: string;
}
interface SuggestionDraft {
  id: string;
  text: string;
  openUrl: string;
}

const KINDS: Kind[] = ['text', 'card', 'carousel'];
const draftCard = (id: string): CardDraft => ({ id, title: '', description: '', mediaUrl: '' });

export function RichMessageBuilder() {
  const { t } = useI18n();
  const send = useSendRichMessage();
  // Stable per-item ids (hydration-safe: the ref restarts at 0 on both SSR + client hydration).
  const idRef = useRef(0);
  const nextId = () => `d${idRef.current++}`;

  const [to, setTo] = useState('');
  const [kind, setKind] = useState<Kind>('card');
  const [text, setText] = useState('');
  const [cards, setCards] = useState<CardDraft[]>(() => [draftCard(nextId()), draftCard(nextId())]);
  const [suggestions, setSuggestions] = useState<SuggestionDraft[]>([]);

  const updateCard = (id: string, patch: Partial<CardDraft>) =>
    setCards((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const builtSuggestions = (): RcsSuggestion[] =>
    suggestions
      .filter((s) => s.text.trim())
      .slice(0, 4)
      .map((s) =>
        s.openUrl.trim()
          ? { type: 'action', text: s.text.trim(), openUrl: s.openUrl.trim() }
          : { type: 'reply', text: s.text.trim() },
      );

  const toCard = (c: CardDraft): RcsCard => {
    const card: RcsCard = {};
    if (c.title.trim()) card.title = c.title.trim();
    if (c.description.trim()) card.description = c.description.trim();
    if (/^https?:\/\//.test(c.mediaUrl.trim())) card.media = { fileUrl: c.mediaUrl.trim() };
    return card;
  };
  const cardHasContent = (c: RcsCard) => Boolean(c.title || c.description || c.media);

  // Recompute the wire payload each render (cheap) — no memo, so no dependency bookkeeping.
  const buildRich = (): RichMessageInput | null => {
    const sugg = builtSuggestions();
    if (kind === 'text') {
      if (!text.trim()) return null;
      return { kind: 'text', text: text.trim(), ...(sugg.length ? { suggestions: sugg } : {}) };
    }
    if (kind === 'card') {
      const c = toCard(cards[0] ?? draftCard(''));
      if (!cardHasContent(c)) return null;
      return { kind: 'card', card: sugg.length ? { ...c, suggestions: sugg } : c };
    }
    const cs = cards.map(toCard).filter(cardHasContent);
    if (cs.length < 2) return null;
    return { kind: 'carousel', cards: cs };
  };
  const rich = buildRich();
  const canSend = Boolean(to.trim()) && rich !== null && !send.isPending;
  const editorCards = kind === 'card' ? cards.slice(0, 1) : cards;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles size={16} /> {t('Rich message studio')}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 lg:flex-row">
        {/* ── Editor ── */}
        <div className="flex flex-1 flex-col gap-3">
          <div className="flex gap-2">
            {KINDS.map((k) => (
              <button
                type="button"
                key={k}
                onClick={() => setKind(k)}
                className={`rounded-md px-3 py-1.5 text-sm ${
                  kind === k
                    ? 'bg-vq-accent text-white'
                    : 'bg-vq-surface-2 text-vq-text-lo hover:text-vq-text-hi'
                }`}
              >
                {t(k === 'text' ? 'Text' : k === 'card' ? 'Card' : 'Carousel')}
              </button>
            ))}
          </div>

          <Input
            placeholder={t('Recipient phone (E.164, e.g. +14155550100)')}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />

          {kind === 'text' ? (
            <textarea
              className="min-h-24 rounded-md border border-vq-border bg-vq-surface-2 p-2 text-sm text-vq-text-hi"
              placeholder={t('Message text')}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          ) : (
            <div className="flex flex-col gap-3">
              {editorCards.map((c, i) => (
                <div
                  key={c.id}
                  className="flex flex-col gap-2 rounded-md border border-vq-border p-3"
                >
                  {kind === 'carousel' && (
                    <div className="flex items-center justify-between">
                      <span className="text-vq-text-lo text-xs">
                        {t('Card')} {i + 1}
                      </span>
                      {cards.length > 2 && (
                        <button
                          type="button"
                          onClick={() => setCards((cs) => cs.filter((x) => x.id !== c.id))}
                          className="text-vq-text-lo hover:text-vq-danger"
                          aria-label={t('Remove card')}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  )}
                  <Input
                    placeholder={t('Card title')}
                    value={c.title}
                    onChange={(e) => updateCard(c.id, { title: e.target.value })}
                  />
                  <Input
                    placeholder={t('Description')}
                    value={c.description}
                    onChange={(e) => updateCard(c.id, { description: e.target.value })}
                  />
                  <div className="flex items-center gap-2">
                    <ImageIcon size={14} className="text-vq-text-lo" />
                    <Input
                      placeholder={t('Media URL (https://…)')}
                      value={c.mediaUrl}
                      onChange={(e) => updateCard(c.id, { mediaUrl: e.target.value })}
                    />
                  </div>
                </div>
              ))}
              {kind === 'carousel' && cards.length < 10 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setCards((cs) => [...cs, draftCard(nextId())])}
                >
                  <Plus size={14} /> {t('Add card')}
                </Button>
              )}
            </div>
          )}

          {/* Suggestion chips */}
          <div className="flex flex-col gap-2">
            <span className="text-vq-text-lo text-xs">{t('Suggestions (max 4)')}</span>
            {suggestions.map((s) => (
              <div key={s.id} className="flex items-center gap-2">
                <Input
                  placeholder={t('Chip label')}
                  value={s.text}
                  onChange={(e) =>
                    setSuggestions((ss) =>
                      ss.map((x) => (x.id === s.id ? { ...x, text: e.target.value } : x)),
                    )
                  }
                />
                <Input
                  placeholder={t('Open URL (optional)')}
                  value={s.openUrl}
                  onChange={(e) =>
                    setSuggestions((ss) =>
                      ss.map((x) => (x.id === s.id ? { ...x, openUrl: e.target.value } : x)),
                    )
                  }
                />
                <button
                  type="button"
                  onClick={() => setSuggestions((ss) => ss.filter((x) => x.id !== s.id))}
                  className="text-vq-text-lo hover:text-vq-danger"
                  aria-label={t('Remove suggestion')}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            {suggestions.length < 4 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  setSuggestions((ss) => [...ss, { id: nextId(), text: '', openUrl: '' }])
                }
              >
                <Plus size={14} /> {t('Add suggestion')}
              </Button>
            )}
          </div>

          <Button
            disabled={!canSend}
            onClick={() => rich && send.mutate({ to: to.trim(), richMessage: rich })}
          >
            {send.isPending ? t('Sending…') : t('Send rich message')}
          </Button>
          {send.isError && (
            <p className="text-sm text-vq-danger">{(send.error as Error).message}</p>
          )}
          {send.data && (
            <p className="text-sm text-vq-success">
              {t('Sent via')} {send.data.channel} · {send.data.status}
            </p>
          )}
        </div>

        {/* ── Live preview ── */}
        <div className="flex-1">
          <span className="text-vq-text-lo text-xs">{t('Preview')}</span>
          <div className="mt-2 rounded-xl border border-vq-border bg-vq-surface-2 p-3">
            <RichPreview rich={rich} emptyLabel={t('Compose a message to preview it')} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function previewKey(c: RcsCard): string {
  return `${c.title ?? ''}|${c.description ?? ''}|${c.media?.fileUrl ?? ''}`;
}

function RichPreview({ rich, emptyLabel }: { rich: RichMessageInput | null; emptyLabel: string }) {
  if (!rich) return <p className="text-sm text-vq-text-lo italic">{emptyLabel}</p>;
  if (rich.kind === 'text') {
    return (
      <div className="flex flex-col gap-2">
        <p className="whitespace-pre-wrap text-sm text-vq-text-hi">{rich.text}</p>
        <Chips suggestions={rich.suggestions} />
      </div>
    );
  }
  const cards = rich.kind === 'card' ? [rich.card] : rich.cards;
  return (
    <div className="flex gap-2 overflow-x-auto">
      {cards.map((c) => (
        <CardPreview key={previewKey(c)} card={c} />
      ))}
    </div>
  );
}

function CardPreview({ card }: { card: RcsCard }) {
  return (
    <div className="min-w-40 flex-1 overflow-hidden rounded-lg border border-vq-border bg-vq-surface">
      {card.media?.fileUrl && (
        <img src={card.media.fileUrl} alt="preview" className="h-24 w-full object-cover" />
      )}
      <div className="flex flex-col gap-1 p-2">
        {card.title && <p className="font-medium text-sm text-vq-text-hi">{card.title}</p>}
        {card.description && <p className="text-vq-text-lo text-xs">{card.description}</p>}
        <Chips suggestions={card.suggestions} />
      </div>
    </div>
  );
}

function Chips({ suggestions }: { suggestions?: RcsSuggestion[] }) {
  if (!suggestions || suggestions.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {suggestions.map((s) => (
        <span
          key={`${s.type}:${s.text}`}
          className="rounded-full border border-vq-accent px-2 py-0.5 text-vq-accent text-xs"
        >
          {s.text}
        </span>
      ))}
    </div>
  );
}
