'use client';

import {
  type CompiledFlow,
  type FlowGraph,
  FlowRunner,
  type SimResult,
  compileFlow,
  runSimulation,
  scriptedCaller,
} from '@vocaliq/shared';
import { Button } from '@vocaliq/ui';
import { FastForward, Play, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useI18n } from '../../lib/i18n/provider';
import { NODE_META } from './flow-nodes';

/**
 * In-browser flow simulator (Day 23). Compiles the current graph with the Day-22 compiler
 * and drives the deterministic FlowRunner step-by-step — the active node lights up on the
 * canvas (via onActiveNode), and each step streams into a mono transcript. No real call.
 */
export function SimulatorPanel({
  graph,
  onActiveNode,
}: {
  graph: FlowGraph;
  onActiveNode: (id: string | null) => void;
}) {
  const { t } = useI18n();
  const compiled = useMemo(() => compileFlow(graph), [graph]);
  const [runner, setRunner] = useState<FlowRunner | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const reset = useCallback(() => {
    if (!compiled.ok || !compiled.flow) {
      setRunner(null);
      onActiveNode(null);
      return;
    }
    const r = new FlowRunner(compiled.flow);
    setRunner(r);
    setLog([describe(compiled.flow, r.active)]);
    onActiveNode(r.active);
  }, [compiled, onActiveNode]);

  useEffect(() => {
    reset();
    return () => onActiveNode(null);
  }, [reset, onActiveNode]);

  const step = useCallback(
    (intent?: string) => {
      if (!runner || !compiled.flow) return;
      const next = runner.advance(intent ? { intent } : {});
      if (next === null) {
        setLog((l) => [...l, '— call ended —']);
        onActiveNode(null);
        return;
      }
      setLog((l) => [
        ...l,
        `${intent ? `↳ (${intent}) ` : '↓ '}${describe(compiled.flow as CompiledFlow, next)}`,
      ]);
      onActiveNode(next);
    },
    [runner, compiled.flow, onActiveNode],
  );

  if (!compiled.ok || !compiled.flow) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-vq-text-hi">{t('Fix these before you can simulate:')}</p>
        <ul className="flex flex-col gap-1 text-vq-danger text-xs">
          {compiled.errors.slice(0, 6).map((e) => (
            <li key={`${e.code}-${e.nodeId ?? ''}`}>• {e.message}</li>
          ))}
        </ul>
      </div>
    );
  }

  const active = runner ? compiled.flow.nodes[runner.active] : undefined;
  const decisionBranches = active?.type === 'DECISION' ? active.transitions : [];
  const done = runner?.done ?? false;

  return (
    <div className="flex flex-col gap-3">
      <div className="max-h-48 overflow-y-auto rounded-vq border border-vq-border bg-vq-bg-base p-2 font-mono text-vq-text-hi text-xs">
        {log.map((line, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: append-only transcript log
          <div key={i}>{line}</div>
        ))}
      </div>

      {done ? (
        <p className="text-sm text-vq-success">{t('Reached an End node.')}</p>
      ) : decisionBranches.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-vq-text-lo text-xs">{t('Choose a branch:')}</span>
          {decisionBranches.map((br) => (
            <Button
              key={`${br.kind}-${br.expression ?? br.target}`}
              variant="secondary"
              size="sm"
              onClick={() => step(br.kind === 'intent' ? br.expression : '__else__')}
            >
              {br.kind === 'intent'
                ? (br.expression ?? t('intent'))
                : br.kind === 'else'
                  ? t('otherwise')
                  : br.kind}{' '}
              →
            </Button>
          ))}
        </div>
      ) : (
        <Button variant="primary" size="sm" onClick={() => step()} disabled={!runner}>
          <Play size={14} /> {t('Advance')}
        </Button>
      )}

      <Button variant="ghost" size="sm" onClick={reset}>
        <RotateCcw size={14} /> {t('Restart')}
      </Button>

      <ScriptedRun flow={compiled.flow} onActiveNode={onActiveNode} />
    </div>
  );
}

/**
 * Hands-free run (Day 32): a scriptable caller drives the whole conversation. Each textarea
 * line is one caller turn — append ` | intent` to route Decision branches. The event stream,
 * transcript, and estimated cost are shown, and the visited path replays on the canvas.
 */
function ScriptedRun({
  flow,
  onActiveNode,
}: {
  flow: CompiledFlow;
  onActiveNode: (id: string | null) => void;
}) {
  const { t } = useI18n();
  const [script, setScript] = useState('I want to book an appointment | booking');
  const [result, setResult] = useState<SimResult | null>(null);

  const run = useCallback(() => {
    const lines = script
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [text, intent] = l.split('|').map((s) => s.trim());
        return intent ? { text: text ?? '', intent } : { text: text ?? '' };
      });
    const res = runSimulation(flow, scriptedCaller(lines));
    setResult(res);
    // Replay the visited path on the canvas.
    res.visited.forEach((id, i) => setTimeout(() => onActiveNode(id), i * 350));
    setTimeout(() => onActiveNode(null), res.visited.length * 350 + 800);
  }, [flow, script, onActiveNode]);

  return (
    <div className="flex flex-col gap-2 border-vq-border border-t pt-3">
      <span className="text-vq-text-lo text-xs uppercase tracking-wide">
        {t('Scripted caller')}
      </span>
      <textarea
        value={script}
        onChange={(e) => setScript(e.target.value)}
        rows={3}
        placeholder={t('one caller line per row\nadd " | intent" to route decisions')}
        className="rounded-vq border border-vq-border bg-vq-bg-base px-2 py-1.5 font-mono text-vq-text-hi text-xs"
      />
      <Button variant="secondary" size="sm" onClick={run}>
        <FastForward size={14} /> {t('Auto-run')}
      </Button>

      {result && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-vq-text-lo">
              {t('outcome:')} <span className="text-vq-text-hi">{result.outcome}</span> ·{' '}
              {t('{n} turns', { n: result.transcript.length })}
            </span>
            <span className="text-vq-text-lo">
              {t('est. cost:')}{' '}
              <span className="text-vq-text-hi">${result.estCostUsd.toFixed(4)}</span>
            </span>
          </div>
          <div className="max-h-40 overflow-y-auto rounded-vq border border-vq-border bg-vq-bg-base p-2 text-xs">
            {result.transcript.map((turn, i) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: append-only transcript
                key={i}
                className={turn.role === 'agent' ? 'text-vq-violet' : 'text-vq-cyan'}
              >
                <span className="uppercase">{turn.role}:</span>{' '}
                <span className="text-vq-text-hi">{turn.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function describe(flow: CompiledFlow, id: string): string {
  const node = flow.nodes[id];
  const label = node ? (NODE_META[node.type]?.label ?? node.type) : id;
  return `[${label}] ${id}`;
}
