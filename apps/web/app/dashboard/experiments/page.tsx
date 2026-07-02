'use client';

import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@vocaliq/ui';
import { FlaskConical, Play, Plus, Square } from 'lucide-react';
import { useState } from 'react';
import { EmptyState, ErrorState, LoadingCard } from '../../../components/states';
import {
  type ExperimentListItem,
  useCreateExperiment,
  useExperimentResults,
  useExperiments,
  useSetExperimentStatus,
} from '../../../lib/api';

/** A/B testing (Day 30): split traffic across variants + compare with significance. */
export default function ExperimentsPage() {
  const experiments = useExperiments();
  const [creating, setCreating] = useState(false);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2 font-display font-semibold text-xl text-vq-text-hi">
            <FlaskConical size={20} /> Experiments
          </h1>
          <p className="text-sm text-vq-text-lo">
            A/B test scripts, voices, and openers — compare variants with significance.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreating((v) => !v)}>
          <Plus size={16} /> New experiment
        </Button>
      </div>

      {creating && <CreateExperiment onDone={() => setCreating(false)} />}

      {experiments.isLoading ? (
        <LoadingCard rows={3} />
      ) : experiments.isError ? (
        <ErrorState
          message={(experiments.error as Error).message}
          onRetry={() => experiments.refetch()}
        />
      ) : !experiments.data || experiments.data.length === 0 ? (
        <EmptyState title="No experiments yet" hint="Create one to start A/B testing." />
      ) : (
        <div className="flex flex-col gap-3">
          {experiments.data.map((e) => (
            <ExperimentRow key={e.id} experiment={e} />
          ))}
        </div>
      )}
    </div>
  );
}

function ExperimentRow({ experiment }: { experiment: ExperimentListItem }) {
  const results = useExperimentResults(experiment.id);
  const setStatus = useSetExperimentStatus();
  const running = experiment.status === 'RUNNING';

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-vq-text-hi">{experiment.name}</p>
            <p className="text-xs text-vq-text-lo">
              {experiment.metric} · {experiment.variantCount} variants · {experiment.status}
            </p>
          </div>
          {running ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setStatus.mutate({ id: experiment.id, status: 'STOPPED' })}
            >
              <Square size={14} /> Stop
            </Button>
          ) : (
            experiment.status === 'DRAFT' && (
              <Button
                size="sm"
                onClick={() => setStatus.mutate({ id: experiment.id, status: 'RUNNING' })}
              >
                <Play size={14} /> Run
              </Button>
            )
          )}
        </div>

        {results.data && results.data.totalCalls > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-vq-border border-b text-left text-vq-text-lo text-xs">
                <th className="py-2 font-medium">Variant</th>
                <th className="py-2 font-medium">Calls</th>
                <th className="py-2 font-medium">Rate</th>
                <th className="py-2 font-medium">Lift</th>
                <th className="py-2 font-medium">Significance</th>
              </tr>
            </thead>
            <tbody>
              {results.data.rows.map((r) => (
                <tr key={r.variant} className="border-vq-border/40 border-b last:border-0">
                  <td className="py-2 text-vq-text-hi">
                    {r.label} {r.isControl && <span className="text-vq-text-lo">(control)</span>}
                  </td>
                  <td className="py-2 text-vq-text-lo">{r.total}</td>
                  <td className="py-2 text-vq-text-hi">{(r.rate * 100).toFixed(1)}%</td>
                  <td className="py-2 text-vq-text-lo">
                    {r.isControl ? '—' : `${r.lift >= 0 ? '+' : ''}${(r.lift * 100).toFixed(0)}%`}
                  </td>
                  <td className="py-2">
                    {r.isControl ? (
                      <span className="text-vq-text-lo">—</span>
                    ) : r.significant ? (
                      <span className="text-vq-success">significant (p={r.pValue.toFixed(3)})</span>
                    ) : (
                      <span className="text-vq-text-lo">n.s. (p={r.pValue.toFixed(3)})</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

function CreateExperiment({ onDone }: { onDone: () => void }) {
  const create = useCreateExperiment();
  const [name, setName] = useState('');
  const [metric, setMetric] = useState('conversion');
  const [variants, setVariants] = useState([
    { id: 'a', label: 'Control', weight: 1 },
    { id: 'b', label: 'Variant B', weight: 1 },
  ]);

  const canSubmit = name && variants.length >= 2 && variants.every((v) => v.id && v.label);

  async function submit() {
    await create.mutateAsync({ name, metric, variants });
    onDone();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">New experiment</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Input
          placeholder="Experiment name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <label htmlFor="metric" className="flex flex-col gap-1 text-xs text-vq-text-lo">
          Success metric
          <select
            id="metric"
            className="rounded-vq border border-vq-border bg-transparent px-2 py-2 text-sm text-vq-text-hi"
            value={metric}
            onChange={(e) => setMetric(e.target.value)}
          >
            <option value="conversion">Conversion</option>
            <option value="booking">Booking</option>
            <option value="csat">CSAT</option>
          </select>
        </label>

        <div className="flex flex-col gap-2">
          <p className="text-xs text-vq-text-lo uppercase tracking-wide">Variants</p>
          {variants.map((v, i) => (
            <div key={v.id} className="flex items-center gap-2">
              <Input
                placeholder="id"
                value={v.id}
                onChange={(e) =>
                  setVariants((arr) =>
                    arr.map((x, xi) => (xi === i ? { ...x, id: e.target.value } : x)),
                  )
                }
                className="w-20"
              />
              <Input
                placeholder="label"
                value={v.label}
                onChange={(e) =>
                  setVariants((arr) =>
                    arr.map((x, xi) => (xi === i ? { ...x, label: e.target.value } : x)),
                  )
                }
              />
              <Input
                type="number"
                value={v.weight}
                onChange={(e) =>
                  setVariants((arr) =>
                    arr.map((x, xi) => (xi === i ? { ...x, weight: Number(e.target.value) } : x)),
                  )
                }
                className="w-20"
              />
            </div>
          ))}
          {variants.length < 10 && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                setVariants((arr) => [
                  ...arr,
                  {
                    id: String.fromCharCode(97 + arr.length),
                    label: `Variant ${arr.length + 1}`,
                    weight: 1,
                  },
                ])
              }
            >
              <Plus size={14} /> Add variant
            </Button>
          )}
        </div>

        {create.isError && (
          <p className="text-xs text-vq-danger">{(create.error as Error).message}</p>
        )}
        <div className="flex gap-2">
          <Button size="sm" disabled={!canSubmit || create.isPending} onClick={submit}>
            {create.isPending ? 'Creating…' : 'Create experiment'}
          </Button>
          <Button size="sm" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
