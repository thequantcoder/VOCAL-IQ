'use client';

import { Button, Card, CardContent, CardHeader, CardTitle } from '@vocaliq/ui';
import { ArrowLeft, Check, GraduationCap, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { LoadingCard } from '../../../../../components/states';
import {
  type LearningRun,
  useAnalyzeAgent,
  useApplySuggestion,
  useLearningRuns,
  useLearningSettings,
  useSetLearningSettings,
} from '../../../../../lib/api';

/**
 * Learn from top reps (Day 89): opt in (consent), analyze the agent's best consent-eligible calls, and
 * apply the reviewed persona suggestions. Applied suggestions still need re-testing + re-publishing —
 * this only stages the change into the agent's system prompt.
 */
export default function AgentLearningPage() {
  const params = useParams<{ id: string }>();
  const agentId = params?.id ?? '';
  const settings = useLearningSettings();
  const setSettings = useSetLearningSettings();
  const runs = useLearningRuns(agentId);
  const analyze = useAnalyzeAgent(agentId);

  const enabled = settings.data?.enabled ?? false;
  const latest = runs.data?.[0];

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <Link
        href={`/dashboard/agents/${agentId}/builder`}
        className="flex w-fit items-center gap-1 text-sm text-vq-text-lo hover:text-vq-text-hi"
      >
        <ArrowLeft size={16} /> Builder
      </Link>

      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 font-display font-semibold text-vq-text-hi text-xl">
          <GraduationCap size={20} /> Learn from top reps
        </h1>
        <p className="text-sm text-vq-text-lo">
          Distil the winning patterns from this agent's best calls and turn them into reviewed
          persona improvements. Only consent-eligible calls (AI disclosed, no opt-out, recorded) are
          ever used.
        </p>
      </div>

      {/* Consent opt-in */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Consent</CardTitle>
        </CardHeader>
        <CardContent>
          {settings.isLoading ? (
            <LoadingCard rows={1} />
          ) : (
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1"
                checked={enabled}
                disabled={setSettings.isPending}
                onChange={(e) => setSettings.mutate({ enabled: e.target.checked })}
              />
              <span className="text-sm text-vq-text-lo">
                <span className="text-vq-text-hi">
                  Use our call recordings to improve this agent.
                </span>{' '}
                Off by default. When on, we analyze only the best calls that disclosed AI and were
                not opted out — never another workspace's data.
              </span>
            </label>
          )}
        </CardContent>
      </Card>

      {/* Analyze */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Analysis</CardTitle>
          <Button
            size="sm"
            disabled={!enabled || analyze.isPending}
            onClick={() => analyze.mutate()}
          >
            <Sparkles size={15} /> {analyze.isPending ? 'Analyzing…' : 'Analyze top calls'}
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {!enabled && (
            <p className="text-sm text-vq-text-lo">Turn on consent above to analyze recordings.</p>
          )}
          {analyze.isError && (
            <p className="text-sm text-vq-danger">{(analyze.error as Error).message}</p>
          )}
          {runs.isLoading ? (
            <LoadingCard rows={2} />
          ) : latest ? (
            <RunView agentId={agentId} run={latest} />
          ) : (
            enabled && (
              <p className="text-sm text-vq-text-lo">
                No analysis yet. Run one to see winning patterns + suggestions.
              </p>
            )
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function RunView({ agentId, run }: { agentId: string; run: LearningRun }) {
  const apply = useApplySuggestion(agentId);

  if (run.status === 'empty') {
    return (
      <p className="text-sm text-vq-text-lo">
        {run.callsUsed > 0
          ? `Analyzed ${run.callsUsed} call${run.callsUsed === 1 ? '' : 's'} but found no new patterns to suggest.`
          : 'No consent-eligible calls to learn from yet'}
        {run.callsExcluded > 0 ? ` (${run.callsExcluded} excluded by consent).` : '.'}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-vq-text-lo text-xs">
        {run.callsUsed} top call{run.callsUsed === 1 ? '' : 's'} analyzed
        {run.callsExcluded > 0 ? ` · ${run.callsExcluded} excluded by consent` : ''}
        {run.model ? ` · ${run.model}` : ''}
      </p>

      {run.patterns.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="font-medium text-sm text-vq-text-hi">Winning patterns</h3>
          {run.patterns.map((p) => (
            <div key={`${p.kind}:${p.insight}`} className="rounded-vq border border-vq-border p-3">
              <span className="rounded-vq-pill border border-vq-border px-2 py-0.5 text-vq-text-lo text-xs">
                {p.kind.replace(/_/g, ' ')}
              </span>
              <p className="mt-2 text-sm text-vq-text-hi">{p.insight}</p>
              {p.example && <p className="mt-1 text-vq-text-lo text-xs italic">“{p.example}”</p>}
            </div>
          ))}
        </div>
      )}

      {run.suggestions.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="font-medium text-sm text-vq-text-hi">Suggested improvements</h3>
          <p className="text-vq-text-lo text-xs">
            Applying appends the instruction to the agent's system prompt. Re-test + re-publish
            before it goes live.
          </p>
          {run.suggestions.map((s) => (
            <div
              key={s.id}
              className="flex items-start justify-between gap-3 rounded-vq border border-vq-border p-3"
            >
              <div className="flex flex-col gap-1">
                <span className="font-medium text-sm text-vq-text-hi">{s.title}</span>
                <span className="text-sm text-vq-text-lo">{s.text}</span>
              </div>
              {s.applied ? (
                <span className="flex shrink-0 items-center gap-1 text-vq-success text-xs">
                  <Check size={14} /> Applied
                </span>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={apply.isPending}
                  onClick={() => apply.mutate({ runId: run.id, suggestionId: s.id })}
                >
                  Apply
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
