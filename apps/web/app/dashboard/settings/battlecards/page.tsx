'use client';

import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@vocaliq/ui';
import { Swords, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { EmptyState, LoadingCard } from '../../../../components/states';
import { useBattlecards, useCreateBattlecard, useDeleteBattlecard } from '../../../../lib/api';

/**
 * Battlecards (Day 90): tenant-authored competitor cards. When a caller mentions a competitor (by name
 * or a cue keyword), the Live Co-Pilot surfaces the card's talking points to the rep — agent-only.
 */
export default function BattlecardsPage() {
  const cards = useBattlecards();
  const create = useCreateBattlecard();
  const del = useDeleteBattlecard();
  const [competitor, setCompetitor] = useState('');
  const [cues, setCues] = useState('');
  const [points, setPoints] = useState('');

  function submit() {
    const talkingPoints = points
      .split('\n')
      .map((p) => p.trim())
      .filter(Boolean);
    const cueList = cues
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);
    if (!competitor.trim()) return;
    create.mutate(
      { competitor: competitor.trim(), cues: cueList, talkingPoints },
      {
        onSuccess: () => {
          setCompetitor('');
          setCues('');
          setPoints('');
        },
      },
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 font-display font-semibold text-vq-text-hi text-xl">
          <Swords size={20} /> Battlecards
        </h1>
        <p className="text-sm text-vq-text-lo">
          Competitor talking points your reps see live when a caller mentions a rival. Shown only on
          the rep's screen — never to the caller.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">New battlecard</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <label htmlFor="bc-competitor" className="flex flex-col gap-1 text-vq-text-lo text-xs">
            Competitor
            <Input
              id="bc-competitor"
              placeholder="Acme Dialer"
              value={competitor}
              onChange={(e) => setCompetitor(e.target.value)}
            />
          </label>
          <label htmlFor="bc-cues" className="flex flex-col gap-1 text-vq-text-lo text-xs">
            Trigger cues (comma-separated; the competitor name always triggers it)
            <Input
              id="bc-cues"
              placeholder="acme, currently using acme"
              value={cues}
              onChange={(e) => setCues(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-vq-text-lo text-xs">
            Talking points (one per line)
            <textarea
              className="min-h-24 rounded-vq border border-vq-border bg-transparent px-2 py-1.5 text-sm text-vq-text-hi"
              placeholder={'We include analytics they charge extra for.\nNo per-seat lock-in.'}
              value={points}
              onChange={(e) => setPoints(e.target.value)}
            />
          </label>
          <div className="flex items-center gap-3">
            <Button size="sm" disabled={create.isPending || !competitor.trim()} onClick={submit}>
              {create.isPending ? 'Adding…' : 'Add battlecard'}
            </Button>
            {create.isError && (
              <span className="text-vq-danger text-xs">{(create.error as Error).message}</span>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        <h2 className="font-medium text-sm text-vq-text-hi">Your battlecards</h2>
        {cards.isLoading ? (
          <LoadingCard rows={2} />
        ) : !cards.data || cards.data.length === 0 ? (
          <EmptyState title="No battlecards yet" hint="Add one above to arm your reps." />
        ) : (
          <ul className="flex flex-col gap-2">
            {cards.data.map((c) => (
              <li key={c.id}>
                <Card className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-col gap-1">
                      <span className="font-medium text-sm text-vq-text-hi">vs {c.competitor}</span>
                      {c.cues.length > 0 && (
                        <span className="text-vq-text-lo text-xs">
                          Triggers: {c.cues.join(', ')}
                        </span>
                      )}
                      <ul className="mt-1 list-disc pl-4 text-sm text-vq-text-lo">
                        {c.talkingPoints.map((p) => (
                          <li key={p}>{p}</li>
                        ))}
                      </ul>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={del.isPending}
                      onClick={() => del.mutate(c.id)}
                    >
                      <Trash2 size={15} />
                    </Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
