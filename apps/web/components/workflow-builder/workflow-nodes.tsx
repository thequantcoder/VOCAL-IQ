'use client';

import { cn } from '@vocaliq/ui';
import { Handle, type NodeProps, Position } from '@xyflow/react';

/** The single custom node — differentiated by `nodeType`. */
export interface WorkflowNodeData extends Record<string, unknown> {
  nodeType: string;
  label?: string;
  config?: Record<string, unknown>;
  hasError?: boolean;
}

export const WORKFLOW_NODE_META: Record<string, { label: string; accent: string }> = {
  TRIGGER: { label: 'Trigger', accent: 'text-vq-success border-vq-success/50' },
  CONDITION: { label: 'Condition', accent: 'text-vq-warn border-vq-warn/50' },
  ACTION: { label: 'Action', accent: 'text-vq-violet border-vq-violet/50' },
  DELAY: { label: 'Delay', accent: 'text-vq-cyan border-vq-cyan/50' },
  END: { label: 'End', accent: 'text-vq-danger border-vq-danger/50' },
};

export function WorkflowNode({ data, selected }: NodeProps) {
  const d = data as WorkflowNodeData;
  const meta = WORKFLOW_NODE_META[d.nodeType] ?? {
    label: d.nodeType,
    accent: 'text-vq-text-lo border-vq-border',
  };
  const isTrigger = d.nodeType === 'TRIGGER';
  const isEnd = d.nodeType === 'END';
  const isCondition = d.nodeType === 'CONDITION';

  return (
    <div
      className={cn(
        'min-w-40 rounded-vq border bg-vq-bg-elevated px-3 py-2 shadow-sm transition-shadow',
        meta.accent,
        selected && 'shadow-[0_0_0_2px_var(--vq-cyan)]',
        d.hasError && 'border-vq-danger ring-1 ring-vq-danger',
      )}
    >
      {!isTrigger && <Handle type="target" position={Position.Left} className="!bg-vq-text-lo" />}
      <div className="flex items-center gap-2">
        <span className="inline-block h-2 w-2 rounded-full bg-current" aria-hidden />
        <span className="font-medium text-[11px] text-vq-text-lo uppercase tracking-wide">
          {meta.label}
        </span>
      </div>
      <div className="mt-0.5 text-sm text-vq-text-hi">{d.label || meta.label}</div>
      {/* A condition has two labelled source handles (true / false); every other non-end node has one. */}
      {isCondition ? (
        <>
          <Handle
            id="true"
            type="source"
            position={Position.Right}
            style={{ top: '35%' }}
            className="!bg-vq-success"
          />
          <Handle
            id="false"
            type="source"
            position={Position.Right}
            style={{ top: '70%' }}
            className="!bg-vq-danger"
          />
        </>
      ) : (
        !isEnd && <Handle type="source" position={Position.Right} className="!bg-vq-violet" />
      )}
    </div>
  );
}

export const workflowNodeTypes = { workflowNode: WorkflowNode };
