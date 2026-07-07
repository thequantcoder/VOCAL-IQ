'use client';

import { AUTOMATION_EVENTS, CONDITION_OPS, WORKFLOW_ACTION_TYPES } from '@vocaliq/shared';
import { Input } from '@vocaliq/ui';
import type { ReactNode } from 'react';

type Config = Record<string, unknown>;

const field =
  'w-full rounded-vq border border-vq-border bg-transparent px-2 py-1.5 text-sm text-vq-text-hi';

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the label implicitly wraps its control
    <label className="flex flex-col gap-1 text-vq-text-lo text-xs">
      {label}
      {children}
    </label>
  );
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/**
 * Type-specific config editor for a workflow node. The graph stores config loosely; this writes the
 * exact shape the shared parsers expect (trigger/condition/action/delay). Mirrors the call-flow builder.
 */
export function WorkflowNodeConfig({
  nodeType,
  config,
  onChange,
}: {
  nodeType: string;
  config: Config;
  onChange: (config: Config) => void;
}) {
  const set = (patch: Config) => onChange({ ...config, ...patch });

  if (nodeType === 'TRIGGER') {
    const filters = (config.filters ?? {}) as Config;
    const setFilter = (patch: Config) => set({ filters: { ...filters, ...patch } });
    return (
      <div className="flex flex-col gap-3">
        <Labeled label="Event">
          <select
            className={field}
            value={str(config.event) || 'call_ended'}
            onChange={(e) => set({ event: e.target.value })}
          >
            {AUTOMATION_EVENTS.map((ev) => (
              <option key={ev} value={ev}>
                {ev}
              </option>
            ))}
          </select>
        </Labeled>
        <Labeled label="Filter: disposition (optional)">
          <Input
            value={str(filters.disposition)}
            onChange={(e) => setFilter({ disposition: e.target.value || undefined })}
            placeholder="e.g. BOOKED"
          />
        </Labeled>
        <Labeled label="Filter: lead status (optional)">
          <Input
            value={str(filters.leadStatus)}
            onChange={(e) => setFilter({ leadStatus: e.target.value || undefined })}
            placeholder="e.g. QUALIFIED"
          />
        </Labeled>
      </div>
    );
  }

  if (nodeType === 'CONDITION') {
    return (
      <div className="flex flex-col gap-3">
        <Labeled label="Field (e.g. disposition, leadStatus)">
          <Input
            value={str(config.field)}
            onChange={(e) => set({ field: e.target.value })}
            placeholder="disposition"
          />
        </Labeled>
        <Labeled label="Operator">
          <select
            className={field}
            value={str(config.op) || 'eq'}
            onChange={(e) => set({ op: e.target.value })}
          >
            {CONDITION_OPS.map((op) => (
              <option key={op} value={op}>
                {op}
              </option>
            ))}
          </select>
        </Labeled>
        <Labeled label="Value">
          <Input
            value={str(config.value)}
            onChange={(e) => set({ value: e.target.value })}
            placeholder="BOOKED"
          />
        </Labeled>
        <p className="text-vq-text-lo text-xs">
          Green handle = true branch · red handle = false branch.
        </p>
      </div>
    );
  }

  if (nodeType === 'ACTION') {
    const action = (config.action ?? { type: 'notify' }) as Config;
    const setAction = (patch: Config) => set({ action: { ...action, ...patch } });
    const type = str(action.type) || 'notify';
    return (
      <div className="flex flex-col gap-3">
        <Labeled label="Action">
          <select
            className={field}
            value={type}
            onChange={(e) => setAction({ type: e.target.value })}
          >
            {WORKFLOW_ACTION_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Labeled>
        {type === 'webhook' && (
          <Labeled label="Webhook URL (https://…)">
            <Input
              value={str(action.url)}
              onChange={(e) => setAction({ url: e.target.value, includeContext: true })}
              placeholder="https://hooks.example.com/vq"
            />
          </Labeled>
        )}
        {type === 'notify' && (
          <Labeled label="Message">
            <Input
              value={str(action.message)}
              onChange={(e) => setAction({ message: e.target.value })}
              placeholder="Lead booked — follow up"
            />
          </Labeled>
        )}
        {type === 'task' && (
          <Labeled label="Task title">
            <Input
              value={str(action.title)}
              onChange={(e) => setAction({ title: e.target.value })}
              placeholder="Call the customer back"
            />
          </Labeled>
        )}
      </div>
    );
  }

  if (nodeType === 'DELAY') {
    return (
      <Labeled label="Delay (seconds, 1–86400)">
        <Input
          type="number"
          min={1}
          max={86400}
          value={typeof config.seconds === 'number' ? config.seconds : 60}
          onChange={(e) => set({ seconds: Math.max(1, Number(e.target.value) || 1) })}
        />
      </Labeled>
    );
  }

  return <p className="text-vq-text-lo text-xs">This node has no configuration.</p>;
}
