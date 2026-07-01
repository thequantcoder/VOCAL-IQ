'use client';

import { VARIABLE_TYPES } from '@vocaliq/shared';
import { Button, cn } from '@vocaliq/ui';
import { Plus, X } from 'lucide-react';

/**
 * Per-type config editor for the core nodes (Day 18). Edits a node's opaque `config`
 * record; the canvas persists it into the graph (autosaved). Validation lives in the
 * shared schemas — this surfaces the fields.
 */

type Config = Record<string, unknown>;
const field =
  'w-full rounded-vq border border-vq-border bg-vq-bg-base px-2.5 py-1.5 text-sm text-vq-text-hi ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vq-ring focus-visible:border-vq-violet/60';

export function NodeConfigForm({
  nodeType,
  config,
  onChange,
}: {
  nodeType: string;
  config: Config;
  onChange: (config: Config) => void;
}) {
  const set = (patch: Config) => onChange({ ...config, ...patch });

  if (nodeType === 'START') {
    return (
      <div className="flex flex-col gap-3">
        <Labeled label="Opening line">
          <textarea
            rows={2}
            className={field}
            value={str(config.openingLine)}
            onChange={(e) => set({ openingLine: e.target.value })}
            placeholder="Hi, thanks for calling…"
          />
        </Labeled>
        <Labeled label="Language">
          <input
            className={field}
            value={str(config.language) || 'en'}
            onChange={(e) => set({ language: e.target.value })}
          />
        </Labeled>
      </div>
    );
  }

  if (nodeType === 'SAY') {
    const mode = str(config.mode) || 'scripted';
    return (
      <div className="flex flex-col gap-3">
        <Labeled label="Mode">
          <select className={field} value={mode} onChange={(e) => set({ mode: e.target.value })}>
            <option value="scripted">Scripted</option>
            <option value="generated">LLM-generated</option>
          </select>
        </Labeled>
        {mode === 'scripted' ? (
          <Labeled label="Text">
            <textarea
              rows={3}
              className={field}
              value={str(config.text)}
              onChange={(e) => set({ text: e.target.value })}
              placeholder="What the agent says…"
            />
          </Labeled>
        ) : (
          <Labeled label="Prompt">
            <textarea
              rows={3}
              className={field}
              value={str(config.prompt)}
              onChange={(e) => set({ prompt: e.target.value })}
              placeholder="Instruct the LLM (you can use {{variables}})"
            />
          </Labeled>
        )}
      </div>
    );
  }

  if (nodeType === 'LISTEN') {
    const captures = arr(config.captures) as { name?: string; type?: string; required?: boolean }[];
    const update = (i: number, patch: Config) =>
      set({ captures: captures.map((c, idx) => (idx === i ? { ...c, ...patch } : c)) });
    return (
      <div className="flex flex-col gap-3">
        <span className="text-vq-text-lo text-xs">Capture variables</span>
        {captures.map((c, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional, no stable id
          <div key={i} className="flex items-center gap-1.5">
            <input
              className={cn(field, 'flex-1')}
              value={c.name ?? ''}
              onChange={(e) => update(i, { name: e.target.value })}
              placeholder="var_name"
              aria-label="Variable name"
            />
            <select
              className={cn(field, 'w-24')}
              value={c.type ?? 'text'}
              onChange={(e) => update(i, { type: e.target.value })}
              aria-label="Variable type"
            >
              {VARIABLE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Remove variable"
              onClick={() => set({ captures: captures.filter((_, idx) => idx !== i) })}
            >
              <X size={14} />
            </Button>
          </div>
        ))}
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            set({ captures: [...captures, { name: '', type: 'text', required: false }] })
          }
        >
          <Plus size={14} /> Add variable
        </Button>
      </div>
    );
  }

  if (nodeType === 'DECISION') {
    const branches = arr(config.branches) as {
      id?: string;
      label?: string;
      kind?: string;
      match?: string;
    }[];
    const update = (i: number, patch: Config) =>
      set({ branches: branches.map((b, idx) => (idx === i ? { ...b, ...patch } : b)) });
    return (
      <div className="flex flex-col gap-3">
        <span className="text-vq-text-lo text-xs">Branches</span>
        {branches.map((b, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional, no stable id
          <div key={i} className="flex flex-col gap-1.5 rounded-vq border border-vq-border p-2">
            <div className="flex items-center gap-1.5">
              <input
                className={cn(field, 'flex-1')}
                value={b.label ?? ''}
                onChange={(e) => update(i, { label: e.target.value })}
                placeholder="Branch label"
                aria-label="Branch label"
              />
              <select
                className={cn(field, 'w-28')}
                value={b.kind ?? 'intent'}
                onChange={(e) => update(i, { kind: e.target.value })}
                aria-label="Branch kind"
              >
                <option value="intent">intent</option>
                <option value="sentiment">sentiment</option>
                <option value="value">value</option>
                <option value="else">else</option>
              </select>
              <Button
                variant="ghost"
                size="sm"
                aria-label="Remove branch"
                onClick={() => set({ branches: branches.filter((_, idx) => idx !== i) })}
              >
                <X size={14} />
              </Button>
            </div>
            {b.kind !== 'else' ? (
              <input
                className={field}
                value={b.match ?? ''}
                onChange={(e) => update(i, { match: e.target.value })}
                placeholder="Match (intent name / expression)"
                aria-label="Branch match"
              />
            ) : null}
          </div>
        ))}
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            set({
              branches: [
                ...branches,
                { id: `b-${Date.now()}`, label: '', kind: 'intent', match: '' },
              ],
            })
          }
        >
          <Plus size={14} /> Add branch
        </Button>
      </div>
    );
  }

  if (nodeType === 'END') {
    return (
      <div className="flex flex-col gap-3">
        <Labeled label="Outcome tag">
          <input
            className={field}
            value={str(config.outcome)}
            onChange={(e) => set({ outcome: e.target.value })}
            placeholder="e.g. booked, not_interested"
          />
        </Labeled>
        <label className="flex items-center gap-2 text-sm text-vq-text-hi">
          <input
            type="checkbox"
            checked={config.hangup !== false}
            onChange={(e) => set({ hangup: e.target.checked })}
          />
          Hang up on end
        </label>
      </div>
    );
  }

  if (nodeType === 'TOOL') {
    const kind = str(config.kind) || 'function';
    const params = arr(config.params) as { name?: string; type?: string; required?: boolean }[];
    const updateParam = (i: number, patch: Config) =>
      set({ params: params.map((p, idx) => (idx === i ? { ...p, ...patch } : p)) });
    return (
      <div className="flex flex-col gap-3">
        <Labeled label="Kind">
          <select className={field} value={kind} onChange={(e) => set({ kind: e.target.value })}>
            <option value="function">Function (LLM-callable)</option>
            <option value="webhook">Webhook (fire-and-forget)</option>
          </select>
        </Labeled>
        {kind === 'function' ? (
          <Labeled label="Function name">
            <input
              className={field}
              value={str(config.name)}
              onChange={(e) => set({ name: e.target.value })}
              placeholder="get_weather"
            />
          </Labeled>
        ) : null}
        <Labeled label="Description">
          <textarea
            rows={2}
            className={field}
            value={str(config.description)}
            onChange={(e) => set({ description: e.target.value })}
            placeholder="What this does / when the agent should call it"
          />
        </Labeled>
        <div className="flex gap-2">
          <div className="flex-1">
            <Labeled label="Endpoint (https)">
              <input
                className={field}
                value={str(config.endpoint)}
                onChange={(e) => set({ endpoint: e.target.value })}
                placeholder="https://api.example.com/…"
              />
            </Labeled>
          </div>
          <Labeled label="Method">
            <select
              className={cn(field, 'w-24')}
              value={str(config.method) || 'POST'}
              onChange={(e) => set({ method: e.target.value })}
            >
              {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </Labeled>
        </div>

        {kind === 'function' ? (
          <div className="flex flex-col gap-2">
            <span className="text-vq-text-lo text-xs">Parameters</span>
            {params.map((p, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional, no stable id
              <div key={i} className="flex items-center gap-1.5">
                <input
                  className={cn(field, 'flex-1')}
                  value={p.name ?? ''}
                  onChange={(e) => updateParam(i, { name: e.target.value })}
                  placeholder="param"
                  aria-label="Parameter name"
                />
                <select
                  className={cn(field, 'w-24')}
                  value={p.type ?? 'string'}
                  onChange={(e) => updateParam(i, { type: e.target.value })}
                  aria-label="Parameter type"
                >
                  {['string', 'number', 'integer', 'boolean', 'object', 'array'].map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Remove parameter"
                  onClick={() => set({ params: params.filter((_, idx) => idx !== i) })}
                >
                  <X size={14} />
                </Button>
              </div>
            ))}
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                set({ params: [...params, { name: '', type: 'string', required: false }] })
              }
            >
              <Plus size={14} /> Add parameter
            </Button>
          </div>
        ) : (
          <label className="flex items-center gap-2 text-sm text-vq-text-hi">
            <input
              type="checkbox"
              checked={config.signPayload === true}
              onChange={(e) => set({ signPayload: e.target.checked })}
            />
            Sign payload (HMAC)
          </label>
        )}
      </div>
    );
  }

  return <p className="text-vq-text-lo text-xs">Configuration for this node arrives soon.</p>;
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the label implicitly wraps its control
    <label className="flex flex-col gap-1">
      <span className="text-sm text-vq-text-hi">{label}</span>
      {children}
    </label>
  );
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}
function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
