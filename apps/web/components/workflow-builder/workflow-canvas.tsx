'use client';

import { type WorkflowGraph, validateWorkflowGraph } from '@vocaliq/shared';
import { Button, Input, cn } from '@vocaliq/ui';
import {
  Background,
  type Connection,
  Controls,
  type Edge,
  MiniMap,
  type Node,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { AlertTriangle, Check, Loader2, Play, Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type WorkflowSummary,
  useSaveWorkflow,
  useSetWorkflowStatus,
  useTriggerWorkflow,
} from '../../lib/api';
import { WorkflowNodeConfig } from './workflow-node-config';
import { WORKFLOW_NODE_META, type WorkflowNodeData, workflowNodeTypes } from './workflow-nodes';
import { WorkflowRunsPanel } from './workflow-runs-panel';

const PALETTE = ['TRIGGER', 'CONDITION', 'ACTION', 'DELAY', 'END'] as const;
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

function toRF(graph: WorkflowGraph): { nodes: Node[]; edges: Edge[] } {
  return {
    nodes: graph.nodes.map((n) => ({
      id: n.id,
      type: 'workflowNode',
      position: n.position,
      data: {
        nodeType: n.type,
        label: n.data?.label,
        config: n.data?.config ?? {},
      } as WorkflowNodeData,
    })),
    edges: graph.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? null,
      animated: true,
      label: e.sourceHandle ?? undefined,
    })),
  };
}

function toGraph(nodes: Node[], edges: Edge[]): WorkflowGraph {
  return {
    nodes: nodes.map((n) => {
      const d = n.data as WorkflowNodeData;
      return {
        id: n.id,
        type: d.nodeType as WorkflowGraph['nodes'][number]['type'],
        position: n.position,
        data: { label: d.label, config: (d.config as Record<string, unknown>) ?? {} },
      };
    }),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? null,
    })),
  };
}

export function WorkflowCanvas({
  workflow,
  graph,
}: {
  workflow: WorkflowSummary;
  graph: WorkflowGraph;
}) {
  const initial = useMemo(() => toRF(graph), [graph]);
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const save = useSaveWorkflow(workflow.id);
  const setStatus = useSetWorkflowStatus(workflow.id);
  const trigger = useTriggerWorkflow(workflow.id);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstRun = useRef(true);

  const errors = useMemo(() => validateWorkflowGraph(toGraph(nodes, edges)), [nodes, edges]);
  const errorByNode = useMemo(() => {
    const m = new Set<string>();
    for (const e of errors) if (e.nodeId) m.add(e.nodeId);
    return m;
  }, [errors]);

  const decorated = useMemo(
    () => nodes.map((n) => ({ ...n, data: { ...n.data, hasError: errorByNode.has(n.id) } })),
    [nodes, errorByNode],
  );

  // Debounced autosave (a draft may be invalid; it just can't be activated).
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    setSaveState('saving');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      save.mutate(toGraph(nodes, edges), {
        onSuccess: () => setSaveState('saved'),
        onError: () => setSaveState('error'),
      });
    }, 800);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [nodes, edges, save]);

  const onConnect = useCallback(
    (c: Connection) =>
      setEdges((eds) => addEdge({ ...c, animated: true, label: c.sourceHandle ?? undefined }, eds)),
    [setEdges],
  );

  const addNode = useCallback(
    (nodeType: string) => {
      const id = `${nodeType.toLowerCase()}-${Date.now()}`;
      // Seed the config with the shown default so a freshly added node is already valid (not just
      // displaying an un-persisted placeholder).
      const config: Record<string, unknown> =
        nodeType === 'TRIGGER'
          ? { event: 'call_ended', filters: {} }
          : nodeType === 'DELAY'
            ? { seconds: 60 }
            : {};
      setNodes((ns) => [
        ...ns,
        {
          id,
          type: 'workflowNode',
          position: { x: 120 + ns.length * 40, y: 80 + ns.length * 30 },
          data: {
            nodeType,
            label: WORKFLOW_NODE_META[nodeType]?.label,
            config,
          } as WorkflowNodeData,
        },
      ]);
    },
    [setNodes],
  );

  const selected = decorated.find((n) => n.id === selectedId) ?? null;
  const updateLabel = useCallback(
    (label: string) =>
      setNodes((ns) =>
        ns.map((n) => (n.id === selectedId ? { ...n, data: { ...n.data, label } } : n)),
      ),
    [selectedId, setNodes],
  );
  const updateConfig = useCallback(
    (config: Record<string, unknown>) =>
      setNodes((ns) =>
        ns.map((n) => (n.id === selectedId ? { ...n, data: { ...n.data, config } } : n)),
      ),
    [selectedId, setNodes],
  );

  const isActive = workflow.status === 'active';

  // Build a test event that satisfies the trigger's filters, so "Test run" actually matches (a filtered
  // trigger would reject a bare event).
  const testEvent = useMemo(() => {
    const t = nodes.find((n) => (n.data as WorkflowNodeData).nodeType === 'TRIGGER');
    const cfg = (t?.data as WorkflowNodeData | undefined)?.config ?? {};
    const filters = (cfg.filters ?? {}) as Record<string, unknown>;
    return {
      event: (cfg.event as string) ?? workflow.triggerEvent ?? 'call_ended',
      ...(filters.disposition ? { disposition: filters.disposition } : {}),
      ...(filters.leadStatus ? { leadStatus: filters.leadStatus } : {}),
    };
  }, [nodes, workflow.triggerEvent]);

  return (
    <div className="flex h-[calc(100vh-10rem)] w-full flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-vq-text-lo text-xs">Add:</span>
        {PALETTE.map((t) => (
          <Button key={t} variant="secondary" size="sm" onClick={() => addNode(t)}>
            <Plus size={14} /> {WORKFLOW_NODE_META[t]?.label ?? t}
          </Button>
        ))}
        <div className="ml-auto flex items-center gap-3 text-xs">
          <SaveBadge state={saveState} />
          <ValidityBadge count={errors.length} />
          {isActive ? (
            <>
              <Button
                variant="secondary"
                size="sm"
                disabled={trigger.isPending}
                onClick={() => trigger.mutate(testEvent)}
                title="Fire a test run with the trigger event"
              >
                <Play size={14} /> Test run
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={setStatus.isPending}
                onClick={() => setStatus.mutate('paused')}
              >
                Pause
              </Button>
            </>
          ) : (
            <Button
              variant="primary"
              size="sm"
              disabled={errors.length > 0 || saveState === 'saving' || setStatus.isPending}
              onClick={() => setStatus.mutate('active')}
              title={
                errors.length > 0 ? 'Fix validation issues to activate' : 'Activate this workflow'
              }
            >
              {setStatus.isPending ? 'Activating…' : 'Activate'}
            </Button>
          )}
        </div>
      </div>
      {setStatus.isError && (
        <p className="text-vq-danger text-xs">{(setStatus.error as Error).message}</p>
      )}

      <div className="relative flex-1 overflow-hidden rounded-vq-card border border-vq-border">
        <ReactFlow
          nodes={decorated}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, n) => setSelectedId(n.id)}
          onPaneClick={() => setSelectedId(null)}
          nodeTypes={workflowNodeTypes}
          deleteKeyCode={['Backspace', 'Delete']}
          fitView
          proOptions={{ hideAttribution: true }}
          className="bg-vq-bg-base"
        >
          <Background color="var(--vq-border)" gap={20} />
          <Controls className="!bg-vq-bg-elevated !border-vq-border" />
          <MiniMap pannable zoomable className="!bg-vq-bg-elevated" />
        </ReactFlow>

        {selected ? (
          <aside className="absolute top-3 right-3 flex max-h-[calc(100%-1.5rem)] w-72 flex-col gap-3 overflow-y-auto rounded-vq-card border border-vq-border bg-vq-bg-elevated p-4 shadow-sm">
            <p className="font-medium text-[11px] text-vq-text-lo uppercase tracking-wide">
              {WORKFLOW_NODE_META[(selected.data as WorkflowNodeData).nodeType]?.label}
            </p>
            <label htmlFor="wf-node-label" className="flex flex-col gap-1">
              <span className="text-sm text-vq-text-hi">Label</span>
              <Input
                id="wf-node-label"
                value={(selected.data as WorkflowNodeData).label ?? ''}
                onChange={(e) => updateLabel(e.target.value)}
                placeholder="Node label"
              />
            </label>
            <div className="border-vq-border border-t pt-3">
              <WorkflowNodeConfig
                nodeType={(selected.data as WorkflowNodeData).nodeType}
                config={
                  ((selected.data as WorkflowNodeData).config as Record<string, unknown>) ?? {}
                }
                onChange={updateConfig}
              />
            </div>
          </aside>
        ) : null}
      </div>

      <WorkflowRunsPanel workflowId={workflow.id} />
    </div>
  );
}

function SaveBadge({ state }: { state: SaveState }) {
  if (state === 'saving')
    return (
      <span className="flex items-center gap-1 text-vq-text-lo">
        <Loader2 size={14} className="animate-spin motion-reduce:animate-none" /> Saving…
      </span>
    );
  if (state === 'saved')
    return (
      <span className="flex items-center gap-1 text-vq-success">
        <Check size={14} /> Saved
      </span>
    );
  if (state === 'error') return <span className="text-vq-danger">Save failed</span>;
  return <span className="text-vq-text-lo">Autosaves</span>;
}

function ValidityBadge({ count }: { count: number }) {
  if (count === 0)
    return (
      <span className="flex items-center gap-1 text-vq-success">
        <Check size={14} /> Valid
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-vq-warn">
      <AlertTriangle size={14} /> {count} issue{count === 1 ? '' : 's'}
    </span>
  );
}
