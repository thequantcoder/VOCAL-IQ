'use client';

import { type CompiledFlow, type FlowGraph, FlowRunner, compileFlow } from '@vocaliq/shared';
import { Button } from '@vocaliq/ui';
import { Play, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
        <p className="text-sm text-vq-text-hi">Fix these before you can simulate:</p>
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
        <p className="text-sm text-vq-success">Reached an End node. </p>
      ) : decisionBranches.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-vq-text-lo text-xs">Choose a branch:</span>
          {decisionBranches.map((t) => (
            <Button
              key={`${t.kind}-${t.expression ?? t.target}`}
              variant="secondary"
              size="sm"
              onClick={() => step(t.kind === 'intent' ? t.expression : '__else__')}
            >
              {t.kind === 'intent'
                ? (t.expression ?? 'intent')
                : t.kind === 'else'
                  ? 'otherwise'
                  : t.kind}{' '}
              →
            </Button>
          ))}
        </div>
      ) : (
        <Button variant="primary" size="sm" onClick={() => step()} disabled={!runner}>
          <Play size={14} /> Advance
        </Button>
      )}

      <Button variant="ghost" size="sm" onClick={reset}>
        <RotateCcw size={14} /> Restart
      </Button>
    </div>
  );
}

function describe(flow: CompiledFlow, id: string): string {
  const node = flow.nodes[id];
  const label = node ? (NODE_META[node.type]?.label ?? node.type) : id;
  return `[${label}] ${id}`;
}
