'use client';

import { useState } from 'react';
import { useWorkflowRuns, useWorkflowSteps } from '../../lib/api';

const RUN_COLOR: Record<string, string> = {
  running: 'text-vq-cyan',
  waiting: 'text-vq-warn',
  completed: 'text-vq-success',
  failed: 'text-vq-danger',
};
const STEP_COLOR: Record<string, string> = {
  ok: 'text-vq-success',
  branched: 'text-vq-cyan',
  waiting: 'text-vq-warn',
  skipped: 'text-vq-text-lo',
  error: 'text-vq-danger',
};

/** Run history + per-step logs for a workflow (observability — self-audit F). */
export function WorkflowRunsPanel({ workflowId }: { workflowId: string }) {
  const runs = useWorkflowRuns(workflowId);
  const [openRun, setOpenRun] = useState<string | null>(null);
  const steps = useWorkflowSteps(openRun);

  return (
    <div className="max-h-56 overflow-y-auto rounded-vq-card border border-vq-border bg-vq-bg-elevated p-3">
      <p className="mb-2 font-medium text-[11px] text-vq-text-lo uppercase tracking-wide">
        Run history
      </p>
      {!runs.data || runs.data.length === 0 ? (
        <p className="text-vq-text-lo text-xs">
          No runs yet. Activate the workflow, then “Test run” to fire one.
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          {runs.data.map((run) => (
            <div key={run.id} className="flex flex-col">
              <button
                type="button"
                className="flex items-center justify-between gap-2 rounded-vq px-1 py-1 text-left text-xs hover:bg-vq-bg-base"
                onClick={() => setOpenRun((cur) => (cur === run.id ? null : run.id))}
              >
                <span className={RUN_COLOR[run.status] ?? 'text-vq-text-lo'}>
                  ● {run.status}
                  {run.error ? ` — ${run.error}` : ''}
                </span>
                <span className="text-vq-text-lo">
                  {run.stepCount} steps · {new Date(run.startedAt).toLocaleTimeString()}
                </span>
              </button>
              {openRun === run.id && (
                <div className="ml-3 flex flex-col gap-0.5 border-vq-border border-l py-1 pl-2">
                  {steps.isLoading ? (
                    <span className="text-vq-text-lo text-xs">Loading…</span>
                  ) : !steps.data || steps.data.length === 0 ? (
                    <span className="text-vq-text-lo text-xs">No steps recorded.</span>
                  ) : (
                    steps.data.map((s) => (
                      <span key={s.id} className="text-xs">
                        <span className="text-vq-text-lo">{s.nodeType}</span>{' '}
                        <span className={STEP_COLOR[s.status] ?? 'text-vq-text-lo'}>
                          {s.status}
                        </span>
                        {s.detail ? <span className="text-vq-text-lo"> · {s.detail}</span> : null}
                      </span>
                    ))
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
