'use client';

import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@vocaliq/ui';
import { BookOpen, Lock, MessageSquare, Send, Sparkles } from 'lucide-react';
import { useState } from 'react';
import {
  type CoachSuggestion,
  type CoachSuggestionKind,
  type CoachTurn,
  useCoachConfirmNote,
  useCoachPostCall,
  useCoachSuggest,
} from '../lib/api';

const KIND_META: Record<
  CoachSuggestionKind,
  { label: string; color: string; icon: typeof Sparkles }
> = {
  response: {
    label: 'Suggested reply',
    color: 'text-vq-accent border-vq-accent/40',
    icon: MessageSquare,
  },
  kb_answer: {
    label: 'Knowledge base',
    color: 'text-vq-success border-vq-success/40',
    icon: BookOpen,
  },
  objection: { label: 'Objection', color: 'text-vq-warn border-vq-warn/40', icon: Sparkles },
  next_action: { label: 'Next best action', color: 'text-vq-text-hi border-vq-border', icon: Send },
  compliance: { label: 'Compliance', color: 'text-vq-danger border-vq-danger/40', icon: Lock },
};

/**
 * The Agent-Desk whisper copilot (Day 74). The human agent feeds the live caller line; the copilot
 * returns suggested replies, KB answers, objection handling, and a next-best-action — all marked,
 * unmistakably, as PRIVATE to the agent and never spoken to the caller. Below, a post-call auto-note
 * the human confirms/edits (the AI never finalizes it).
 */
export function CoachPanel({ callId, agentId }: { callId: string; agentId?: string }) {
  const [turns, setTurns] = useState<CoachTurn[]>([]);
  const [line, setLine] = useState('');
  const suggest = useCoachSuggest();
  const postCall = useCoachPostCall();
  const confirmNote = useCoachConfirmNote();

  const [draftId, setDraftId] = useState<string | null>(null);
  const [disposition, setDisposition] = useState('');
  const [notes, setNotes] = useState('');

  const suggestions = suggest.data?.suggestions ?? [];

  const askCopilot = () => {
    const next: CoachTurn[] = line.trim()
      ? [...turns, { role: 'caller', text: line.trim() }]
      : turns;
    setTurns(next);
    setLine('');
    suggest.mutate({ callId, ...(agentId ? { agentId } : {}), turns: next });
  };

  const makeDraft = () => {
    postCall.mutate(
      { callId, durationSec: 240, turns },
      {
        onSuccess: (n) => {
          setDraftId(n.id);
          setDisposition(n.disposition);
          setNotes(n.notes);
        },
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <Sparkles size={16} /> AI copilot
          </span>
          <span className="flex items-center gap-1 rounded-vq-pill border border-vq-accent/40 px-2 py-0.5 text-vq-accent text-xs">
            <Lock size={11} /> Private to you — never heard by the caller
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex gap-2">
          <Input
            aria-label="What the caller just said"
            placeholder="What did the caller just say?"
            value={line}
            onChange={(e) => setLine(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') askCopilot();
            }}
          />
          <Button size="sm" disabled={suggest.isPending} onClick={askCopilot}>
            {suggest.isPending ? 'Thinking…' : 'Get help'}
          </Button>
        </div>

        {suggest.isError && (
          <p className="text-vq-danger text-xs">{(suggest.error as Error).message}</p>
        )}

        {suggestions.length > 0 && (
          <div className="flex flex-col gap-2">
            {suggestions.map((s, i) => (
              <SuggestionRow key={`${s.kind}-${i}`} s={s} />
            ))}
          </div>
        )}

        {/* Wrap-up: AI post-call note the human confirms. */}
        <div className="mt-2 border-vq-border border-t pt-3">
          {!draftId ? (
            <Button size="sm" variant="ghost" disabled={postCall.isPending} onClick={makeDraft}>
              {postCall.isPending ? 'Drafting…' : 'Draft wrap-up note'}
            </Button>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="flex items-center gap-1 text-vq-text-lo text-xs">
                <Sparkles size={12} /> AI draft — review, edit, and confirm
              </p>
              <Input
                aria-label="Disposition"
                value={disposition}
                onChange={(e) => setDisposition(e.target.value)}
              />
              <textarea
                aria-label="Notes"
                className="min-h-20 rounded-vq border border-vq-border bg-transparent px-3 py-2 text-sm text-vq-text-hi"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  disabled={confirmNote.isPending}
                  onClick={() => confirmNote.mutate({ id: draftId, disposition, notes })}
                >
                  {confirmNote.isSuccess ? 'Confirmed ✓' : 'Confirm'}
                </Button>
                {confirmNote.isSuccess && (
                  <span className="text-vq-success text-xs">Saved to the call.</span>
                )}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SuggestionRow({ s }: { s: CoachSuggestion }) {
  const meta = KIND_META[s.kind];
  const Icon = meta.icon;
  return (
    <div className="rounded-vq border border-vq-border p-2">
      <div className="mb-1 flex items-center justify-between">
        <span
          className={`flex items-center gap-1 rounded-vq-pill border px-2 py-0.5 text-xs ${meta.color}`}
        >
          <Icon size={11} /> {meta.label}
        </span>
        {s.source && <span className="text-vq-text-lo text-[10px]">{s.source}</span>}
      </div>
      <p className="font-medium text-sm text-vq-text-hi">{s.title}</p>
      <p className="text-sm text-vq-text-lo">{s.body}</p>
    </div>
  );
}
