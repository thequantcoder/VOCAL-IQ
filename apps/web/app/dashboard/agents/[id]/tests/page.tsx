'use client';

import { Button, Card, CardContent, CardHeader, CardTitle, Input, cn } from '@vocaliq/ui';
import { ArrowLeft, Check, FlaskConical, Play, Plus, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { EmptyState, LoadingCard } from '../../../../../components/states';
import {
  type Assertion,
  type ScenarioResult,
  type SuiteReport,
  useCreateScenario,
  useDeleteScenario,
  useRunSuite,
  useScenarios,
} from '../../../../../lib/api';

/** Agent testing suite (Day 33): scenarios + bulk grading against the published flow. */
export default function AgentTestsPage() {
  const params = useParams<{ id: string }>();
  const agentId = params?.id ?? '';
  const scenarios = useScenarios(agentId);
  const del = useDeleteScenario(agentId);
  const runSuite = useRunSuite(agentId);
  const [report, setReport] = useState<SuiteReport | null>(null);
  const [creating, setCreating] = useState(false);

  async function run() {
    const r = await runSuite.mutateAsync({});
    setReport(r);
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <Link
        href={`/dashboard/agents/${agentId}`}
        className="flex w-fit items-center gap-1 text-sm text-vq-text-lo hover:text-vq-text-hi"
      >
        <ArrowLeft size={16} /> Agent
      </Link>

      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 font-display font-semibold text-xl text-vq-text-hi">
          <FlaskConical size={20} /> Test suite
        </h1>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => setCreating((v) => !v)}>
            <Plus size={16} /> Scenario
          </Button>
          <Button size="sm" onClick={run} disabled={runSuite.isPending}>
            <Play size={16} /> {runSuite.isPending ? 'Running…' : 'Run suite'}
          </Button>
        </div>
      </div>

      {runSuite.isError && (
        <p className="text-sm text-vq-danger">{(runSuite.error as Error).message}</p>
      )}

      {report && <ReportCard report={report} />}

      {creating && <AddScenario agentId={agentId} onDone={() => setCreating(false)} />}

      {scenarios.isLoading ? (
        <LoadingCard rows={3} />
      ) : !scenarios.data || scenarios.data.length === 0 ? (
        <EmptyState title="No scenarios yet" hint="Add one, then run the suite." />
      ) : (
        <div className="flex flex-col gap-2">
          {scenarios.data.map((s) => (
            <Card key={s.id}>
              <CardContent className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium text-vq-text-hi">{s.name}</p>
                  <p className="text-xs text-vq-text-lo">
                    {s.definition.assertions.length} assertions · {s.definition.caller.length}{' '}
                    caller turns
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => del.mutate(s.id)}>
                  <Trash2 size={15} />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function ReportCard({ report }: { report: SuiteReport }) {
  const allPass = report.failed === 0;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Last run</span>
          <span className={cn('text-base', allPass ? 'text-vq-success' : 'text-vq-danger')}>
            {report.passed}/{report.total} passed ({Math.round(report.passRate * 100)}%)
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {report.scenarios.map((s) => (
          <ScenarioResultRow key={s.name} result={s} />
        ))}
      </CardContent>
    </Card>
  );
}

function ScenarioResultRow({ result }: { result: ScenarioResult }) {
  return (
    <div className="rounded-vq border border-vq-border p-2">
      <div className="flex items-center gap-2">
        {result.passed ? (
          <Check size={15} className="text-vq-success" />
        ) : (
          <X size={15} className="text-vq-danger" />
        )}
        <span className="font-medium text-sm text-vq-text-hi">{result.name}</span>
        <span className="ml-auto text-vq-text-lo text-xs">→ {result.outcome}</span>
      </div>
      <ul className="mt-1 flex flex-col gap-0.5 pl-6">
        {result.results.map((a) => (
          <li key={a.label} className="flex items-center gap-1.5 text-xs">
            {a.pass ? (
              <Check size={12} className="text-vq-success" />
            ) : (
              <X size={12} className="text-vq-danger" />
            )}
            <span className="text-vq-text-lo">{a.label}</span>
            {a.detail && <span className="text-vq-text-lo/60">— {a.detail}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Compact scenario builder: name + caller lines + a few common assertions. */
function AddScenario({ agentId, onDone }: { agentId: string; onDone: () => void }) {
  const create = useCreateScenario(agentId);
  const [name, setName] = useState('');
  const [caller, setCaller] = useState('');
  const [outcome, setOutcome] = useState('');
  const [mustInclude, setMustInclude] = useState('');
  const [rubric, setRubric] = useState('');

  async function submit() {
    const callerLines = caller
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [text, intent] = l.split('|').map((s) => s.trim());
        return intent ? { text: text ?? '', intent } : { text: text ?? '' };
      });
    const assertions: Assertion[] = [];
    if (outcome) assertions.push({ type: 'outcome_is', value: outcome });
    if (mustInclude) assertions.push({ type: 'transcript_includes', text: mustInclude });
    if (rubric) assertions.push({ type: 'llm_rubric', prompt: rubric });

    await create.mutateAsync({ name, caller: callerLines, assertions });
    onDone();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">New scenario</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Input placeholder="Scenario name" value={name} onChange={(e) => setName(e.target.value)} />
        <label htmlFor="caller" className="flex flex-col gap-1 text-xs text-vq-text-lo">
          Caller lines (one per row, add “ | intent” to route decisions)
          <textarea
            id="caller"
            value={caller}
            onChange={(e) => setCaller(e.target.value)}
            rows={3}
            className="rounded-vq border border-vq-border bg-vq-bg-base px-2 py-1.5 font-mono text-vq-text-hi text-xs"
          />
        </label>
        <Input
          placeholder="Expected outcome (e.g. booked)"
          value={outcome}
          onChange={(e) => setOutcome(e.target.value)}
        />
        <Input
          placeholder="Transcript must include… (optional)"
          value={mustInclude}
          onChange={(e) => setMustInclude(e.target.value)}
        />
        <Input
          placeholder="LLM rubric, e.g. “Did the agent confirm the booking?” (optional)"
          value={rubric}
          onChange={(e) => setRubric(e.target.value)}
        />
        {create.isError && (
          <p className="text-xs text-vq-danger">{(create.error as Error).message}</p>
        )}
        <div className="flex gap-2">
          <Button size="sm" disabled={!name || create.isPending} onClick={submit}>
            {create.isPending ? 'Saving…' : 'Add scenario'}
          </Button>
          <Button size="sm" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
