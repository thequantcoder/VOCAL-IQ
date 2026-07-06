'use client';

import { cn } from '@vocaliq/ui';
import { Handle, type NodeProps, Position } from '@xyflow/react';

/**
 * Typed node renderer for the builder (DESIGN-SYSTEM §5b). Each FlowNodeType gets its own
 * accent; the selected/active node glows cyan. START has no input handle, END no output.
 */

export interface VQNodeData extends Record<string, unknown> {
  nodeType: string;
  label?: string;
  hasError?: boolean;
  /** The simulator's current active node (Day 23) — pulses cyan. */
  simActive?: boolean;
}

// Accent per node type (border + dot); paired with the type label (never colour-only).
export const NODE_META: Record<string, { label: string; accent: string }> = {
  START: { label: 'Start', accent: 'text-vq-success border-vq-success/50' },
  SAY: { label: 'Say', accent: 'text-vq-violet border-vq-violet/50' },
  LISTEN: { label: 'Listen', accent: 'text-vq-cyan border-vq-cyan/50' },
  DECISION: { label: 'Decision', accent: 'text-vq-warn border-vq-warn/50' },
  TOOL: { label: 'Tool', accent: 'text-vq-cyan border-vq-cyan/50' },
  KNOWLEDGE: { label: 'Knowledge', accent: 'text-vq-violet border-vq-violet/50' },
  TRANSFER: { label: 'Transfer', accent: 'text-vq-warn border-vq-warn/50' },
  COLLECT_CONFIRM: { label: 'Collect', accent: 'text-vq-cyan border-vq-cyan/50' },
  SUBFLOW: { label: 'Sub-flow', accent: 'text-vq-violet border-vq-violet/50' },
  SQUAD_HANDOFF: { label: 'Squad', accent: 'text-vq-violet border-vq-violet/50' },
  PAYMENT: { label: 'Payment', accent: 'text-vq-success border-vq-success/50' },
  CALLBACK: { label: 'Callback', accent: 'text-vq-cyan border-vq-cyan/50' },
  END: { label: 'End', accent: 'text-vq-danger border-vq-danger/50' },
};

export function VQNode({ data, selected }: NodeProps) {
  const d = data as VQNodeData;
  const meta = NODE_META[d.nodeType] ?? {
    label: d.nodeType,
    accent: 'text-vq-text-lo border-vq-border',
  };
  const isStart = d.nodeType === 'START';
  const isEnd = d.nodeType === 'END';

  return (
    <div
      className={cn(
        'min-w-40 rounded-vq border bg-vq-bg-elevated px-3 py-2 shadow-sm transition-shadow',
        meta.accent,
        selected && 'shadow-[0_0_0_2px_var(--vq-cyan)]',
        d.hasError && 'border-vq-danger ring-1 ring-vq-danger',
        d.simActive &&
          'shadow-[0_0_0_3px_var(--vq-cyan)] ring-2 ring-vq-cyan animate-pulse motion-reduce:animate-none',
      )}
    >
      {!isStart && <Handle type="target" position={Position.Left} className="!bg-vq-text-lo" />}
      <div className="flex items-center gap-2">
        <span className={cn('inline-block h-2 w-2 rounded-full bg-current')} aria-hidden />
        <span className="font-medium text-[11px] text-vq-text-lo uppercase tracking-wide">
          {meta.label}
        </span>
      </div>
      <div className="mt-0.5 text-sm text-vq-text-hi">{d.label || meta.label}</div>
      {!isEnd && <Handle type="source" position={Position.Right} className="!bg-vq-violet" />}
    </div>
  );
}

export const nodeTypes = { vqNode: VQNode };
