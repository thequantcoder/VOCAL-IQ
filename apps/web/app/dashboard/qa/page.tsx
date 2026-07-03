'use client';

import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@vocaliq/ui';
import { ClipboardCheck, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { EmptyState, ErrorState, LoadingCard } from '../../../components/states';
import {
  type QaCriterion,
  type QaRubric,
  useCreateQaRubric,
  useDeleteQaRubric,
  useQaAggregate,
  useQaRubrics,
  useUpdateQaRubric,
} from '../../../lib/api';

/** QA scoring (Day 43): build weighted rubrics + a coaching view of average scores. */
export default function QaPage() {
  const rubrics = useQaRubrics();
  const aggregate = useQaAggregate();
  const [creating, setCreating] = useState(false);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2 font-display font-semibold text-vq-text-hi text-xl">
            <ClipboardCheck size={20} /> QA scoring
          </h1>
          <p className="text-sm text-vq-text-lo">
            Score calls automatically against weighted rubrics; coach from the averages.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreating((v) => !v)}>
          <Plus size={16} /> New rubric
        </Button>
      </div>

      {creating && <CreateRubric onDone={() => setCreating(false)} />}

      <CoachingView />

      {rubrics.isLoading ? (
        <LoadingCard rows={3} />
      ) : rubrics.isError ? (
        <ErrorState message={(rubrics.error as Error).message} onRetry={() => rubrics.refetch()} />
      ) : !rubrics.data || rubrics.data.length === 0 ? (
        <EmptyState
          title="No rubrics yet"
          hint="Create a rubric of weighted criteria to score calls."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {rubrics.data.map((rubric) => (
            <RubricRow
              key={rubric.id}
              rubric={rubric}
              avg={aggregate.data?.find((a) => a.rubricId === rubric.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CoachingView() {
  const aggregate = useQaAggregate();
  const rubrics = useQaRubrics();
  if (!aggregate.data || aggregate.data.length === 0) return null;
  const nameOf = (id: string) => rubrics.data?.find((r) => r.id === id)?.name ?? 'Rubric';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Coaching — average scores</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {aggregate.data.map((agg) => (
          <div key={agg.rubricId} className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm text-vq-text-hi">{nameOf(agg.rubricId)}</span>
              <span className="font-mono text-sm text-vq-text-hi">
                {agg.avgOverall.toFixed(1)}
                <span className="text-vq-text-lo text-xs"> /100 · {agg.count} calls</span>
              </span>
            </div>
            <div className="flex flex-col gap-1">
              {agg.criteria
                .slice()
                .sort((a, b) => a.avgScore - b.avgScore)
                .map((c) => (
                  <div key={c.key} className="flex items-center gap-2">
                    <span className="w-32 shrink-0 truncate text-vq-text-lo text-xs" title={c.key}>
                      {c.key}
                    </span>
                    <div className="h-2 flex-1 overflow-hidden rounded-vq-pill bg-vq-bg-base">
                      <div
                        className="h-full rounded-vq-pill"
                        style={{
                          width: `${Math.round(c.avgScore * 100)}%`,
                          background: c.avgScore < 0.5 ? 'var(--vq-danger)' : 'var(--vq-success)',
                        }}
                      />
                    </div>
                    <span className="w-10 shrink-0 text-right font-mono text-vq-text-hi text-xs">
                      {Math.round(c.avgScore * 100)}%
                    </span>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function RubricRow({
  rubric,
  avg,
}: {
  rubric: QaRubric;
  avg?: { avgOverall: number; count: number };
}) {
  const update = useUpdateQaRubric();
  const del = useDeleteQaRubric();

  return (
    <Card>
      <CardContent className="flex flex-col gap-2 py-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-vq-text-hi">{rubric.name}</p>
            <p className="text-vq-text-lo text-xs">
              {rubric.criteria.length} criteria · sampling {Math.round(rubric.samplingRate * 100)}%
              {avg ? ` · avg ${avg.avgOverall.toFixed(1)}/100 (${avg.count})` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-vq-text-lo text-xs">
              <input
                type="checkbox"
                checked={rubric.active}
                onChange={(e) =>
                  update.mutate({ id: rubric.id, body: { active: e.target.checked } })
                }
              />
              Active
            </label>
            <Button
              size="sm"
              variant="ghost"
              disabled={del.isPending}
              onClick={() => del.mutate(rubric.id)}
            >
              <Trash2 size={14} />
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {rubric.criteria.map((c) => (
            <span
              key={c.key}
              className="rounded-vq-pill border border-vq-border px-2 py-0.5 text-vq-text-lo text-xs"
              title={c.description}
            >
              {c.key} ·w{c.weight}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

interface CriterionDraft extends QaCriterion {
  id: string;
}
let draftSeq = 0;
const newDraft = (): CriterionDraft => ({
  id: `c${draftSeq++}`,
  key: '',
  description: '',
  weight: 1,
});

function CreateRubric({ onDone }: { onDone: () => void }) {
  const create = useCreateQaRubric();
  const [name, setName] = useState('');
  const [samplingPct, setSamplingPct] = useState(100);
  const [criteria, setCriteria] = useState<CriterionDraft[]>([newDraft()]);

  function setCriterion(id: string, patch: Partial<QaCriterion>) {
    setCriteria((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  const valid =
    name.trim().length > 0 &&
    criteria.length > 0 &&
    criteria.every((c) => /^[a-z0-9_]+$/.test(c.key) && c.description.trim() && c.weight > 0);

  async function submit() {
    if (!valid) return;
    await create.mutateAsync({
      name: name.trim(),
      criteria: criteria.map(({ key, description, weight }) => ({ key, description, weight })),
      samplingRate: samplingPct / 100,
      active: true,
    });
    onDone();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">New rubric</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Input
          placeholder="Rubric name (e.g. Sales QA)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <label htmlFor="qa-sampling" className="flex flex-col gap-1 text-vq-text-lo text-xs">
          Sampling rate: {samplingPct}% of calls
          <input
            id="qa-sampling"
            type="range"
            min={1}
            max={100}
            value={samplingPct}
            onChange={(e) => setSamplingPct(Number(e.target.value))}
          />
        </label>

        <div className="flex flex-col gap-2">
          <span className="text-vq-text-lo text-xs">
            Criteria — key (lowercase_snake), description, weight
          </span>
          {criteria.map((c) => (
            <div key={c.id} className="flex gap-2">
              <Input
                placeholder="key"
                value={c.key}
                onChange={(e) => setCriterion(c.id, { key: e.target.value })}
                className="w-32"
              />
              <Input
                placeholder="what to check for"
                value={c.description}
                onChange={(e) => setCriterion(c.id, { description: e.target.value })}
              />
              <Input
                type="number"
                min={1}
                value={c.weight}
                onChange={(e) => setCriterion(c.id, { weight: Number(e.target.value) })}
                className="w-16"
              />
              {criteria.length > 1 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setCriteria((cs) => cs.filter((x) => x.id !== c.id))}
                >
                  <Trash2 size={14} />
                </Button>
              )}
            </div>
          ))}
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setCriteria((cs) => [...cs, newDraft()])}
          >
            <Plus size={14} /> Add criterion
          </Button>
        </div>

        {create.isError && (
          <p className="text-vq-danger text-xs">{(create.error as Error).message}</p>
        )}
        <div className="flex gap-2">
          <Button size="sm" disabled={!valid || create.isPending} onClick={submit}>
            {create.isPending ? 'Creating…' : 'Create rubric'}
          </Button>
          <Button size="sm" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
