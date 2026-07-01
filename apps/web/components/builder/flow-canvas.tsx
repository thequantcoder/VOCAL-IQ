'use client';

import {
  type FlowGraph,
  type FlowGraphError,
  validateFlowGraph,
  validateNodeConfig,
} from '@vocaliq/shared';
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
import { AlertTriangle, Check, Loader2, Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSaveFlow } from '../../lib/api';
import { NODE_META, type VQNodeData, nodeTypes } from './flow-nodes';
import { NodeConfigForm } from './node-config-form';

const PALETTE = ['SAY', 'LISTEN', 'DECISION', 'TOOL', 'KNOWLEDGE', 'TRANSFER', 'END'] as const;

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

function toRF(graph: FlowGraph): { nodes: Node[]; edges: Edge[] } {
  return {
    nodes: graph.nodes.map((n) => ({
      id: n.id,
      type: 'vqNode',
      position: n.position,
      data: { nodeType: n.type, label: n.data?.label, config: n.data?.config ?? {} } as VQNodeData,
    })),
    edges: graph.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      animated: true,
    })),
  };
}

function toGraph(nodes: Node[], edges: Edge[]): FlowGraph {
  return {
    nodes: nodes.map((n) => {
      const d = n.data as VQNodeData;
      return {
        id: n.id,
        type: d.nodeType as FlowGraph['nodes'][number]['type'],
        position: n.position,
        data: { label: d.label, config: (d.config as Record<string, unknown>) ?? {} },
      };
    }),
    edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
  };
}

export function FlowCanvas({ agentId, graph }: { agentId: string; graph: FlowGraph }) {
  const initial = useMemo(() => toRF(graph), [graph]);
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const save = useSaveFlow(agentId);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstRun = useRef(true);

  const validation = useMemo(() => validateFlowGraph(toGraph(nodes, edges)), [nodes, edges]);
  const errorByNode = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const e of validation.errors) if (e.nodeId) m.set(e.nodeId, true);
    // Also flag nodes whose per-type config is invalid (Day 18).
    for (const n of nodes) {
      const d = n.data as VQNodeData;
      if (!validateNodeConfig(d.nodeType, d.config).valid) m.set(n.id, true);
    }
    return m;
  }, [validation, nodes]);

  // Reflect validation errors onto node styling.
  const decorated = useMemo(
    () =>
      nodes.map((n) => ({ ...n, data: { ...n.data, hasError: errorByNode.get(n.id) ?? false } })),
    [nodes, errorByNode],
  );

  // Debounced autosave whenever the graph changes.
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
    (c: Connection) => setEdges((eds) => addEdge({ ...c, animated: true }, eds)),
    [setEdges],
  );

  const addNode = useCallback(
    (nodeType: string) => {
      const id = `${nodeType.toLowerCase()}-${Date.now()}`;
      setNodes((ns) => [
        ...ns,
        {
          id,
          type: 'vqNode',
          position: { x: 120 + ns.length * 40, y: 80 + ns.length * 30 },
          data: { nodeType, label: NODE_META[nodeType]?.label, config: {} } as VQNodeData,
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

  return (
    <div className="flex h-[calc(100vh-8rem)] w-full flex-col gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-vq-text-lo text-xs">Add:</span>
        {PALETTE.map((t) => (
          <Button key={t} variant="secondary" size="sm" onClick={() => addNode(t)}>
            <Plus size={14} /> {NODE_META[t]?.label ?? t}
          </Button>
        ))}
        <div className="ml-auto flex items-center gap-3 text-xs">
          <SaveBadge state={saveState} />
          <ValidityBadge errors={validation.errors} />
        </div>
      </div>

      <div className="relative flex-1 overflow-hidden rounded-vq-card border border-vq-border">
        <ReactFlow
          nodes={decorated}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, n) => setSelectedId(n.id)}
          onPaneClick={() => setSelectedId(null)}
          nodeTypes={nodeTypes}
          deleteKeyCode={['Backspace', 'Delete']}
          fitView
          proOptions={{ hideAttribution: true }}
          className="bg-vq-bg-base"
        >
          <Background color="var(--vq-border)" gap={20} />
          <Controls className="!bg-vq-bg-elevated !border-vq-border" />
          <MiniMap pannable zoomable className="!bg-vq-bg-elevated" />
        </ReactFlow>

        {/* Config drawer */}
        {selected ? (
          <aside className="absolute top-3 right-3 flex max-h-[calc(100%-1.5rem)] w-72 flex-col gap-3 overflow-y-auto rounded-vq-card border border-vq-border bg-vq-bg-elevated p-4 shadow-sm">
            <p className="font-medium text-[11px] text-vq-text-lo uppercase tracking-wide">
              {NODE_META[(selected.data as VQNodeData).nodeType]?.label ??
                (selected.data as VQNodeData).nodeType}
            </p>
            <label htmlFor="node-label" className="flex flex-col gap-1">
              <span className="text-sm text-vq-text-hi">Label</span>
              <Input
                id="node-label"
                value={(selected.data as VQNodeData).label ?? ''}
                onChange={(e) => updateLabel(e.target.value)}
                placeholder="Node label"
              />
            </label>
            <div className="border-vq-border border-t pt-3">
              <NodeConfigForm
                nodeType={(selected.data as VQNodeData).nodeType}
                config={((selected.data as VQNodeData).config as Record<string, unknown>) ?? {}}
                onChange={updateConfig}
              />
            </div>
          </aside>
        ) : null}
      </div>
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

function ValidityBadge({ errors }: { errors: FlowGraphError[] }) {
  if (errors.length === 0)
    return (
      <span className="flex items-center gap-1 text-vq-success">
        <Check size={14} /> Valid
      </span>
    );
  return (
    <span
      className={cn('flex items-center gap-1 text-vq-warn')}
      title={errors.map((e) => e.message).join('\n')}
    >
      <AlertTriangle size={14} /> {errors.length} issue{errors.length === 1 ? '' : 's'}
    </span>
  );
}
