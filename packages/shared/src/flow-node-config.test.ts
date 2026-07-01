import { describe, expect, it } from 'vitest';
import { FlowNodeType } from './enums';
import type { FlowNode } from './flow-graph';
import {
  compileNode,
  listenConfigSchema,
  sayConfigSchema,
  toolConfigSchema,
  toolParamsToJsonSchema,
  validateNodeConfig,
} from './flow-node-config';

describe('validateNodeConfig', () => {
  it('accepts a valid Start config', () => {
    expect(validateNodeConfig('START', { openingLine: 'Hi!', language: 'en' }).valid).toBe(true);
  });

  it('requires text for scripted Say and a prompt for generated Say', () => {
    expect(sayConfigSchema.safeParse({ mode: 'scripted', text: '' }).success).toBe(false);
    expect(sayConfigSchema.safeParse({ mode: 'scripted', text: 'Hello' }).success).toBe(true);
    expect(sayConfigSchema.safeParse({ mode: 'generated', prompt: 'be warm' }).success).toBe(true);
  });

  it('validates captured-variable names + types (sound typing)', () => {
    const ok = listenConfigSchema.safeParse({ captures: [{ name: 'caller_name', type: 'text' }] });
    expect(ok.success).toBe(true);
    const badName = validateNodeConfig('LISTEN', { captures: [{ name: '1bad', type: 'text' }] });
    expect(badName.valid).toBe(false);
    const badType = listenConfigSchema.safeParse({ captures: [{ name: 'x', type: 'colour' }] });
    expect(badType.success).toBe(false);
  });

  it('flags duplicate capture names', () => {
    const res = validateNodeConfig('LISTEN', {
      captures: [
        { name: 'email', type: 'email' },
        { name: 'email', type: 'text' },
      ],
    });
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.message.includes('Duplicate'))).toBe(true);
  });

  it('passes types without a config schema (opaque config)', () => {
    expect(validateNodeConfig('TOOL', { anything: true }).valid).toBe(true);
  });
});

describe('tool config', () => {
  it('validates a function tool and rejects a bad URL', () => {
    expect(
      toolConfigSchema.safeParse({ kind: 'function', name: 'get_weather', endpoint: 'https://x/w' })
        .success,
    ).toBe(true);
    expect(toolConfigSchema.safeParse({ endpoint: 'not-a-url' }).success).toBe(false);
    expect(validateNodeConfig('TOOL', { name: '1bad' }).valid).toBe(false); // invalid identifier
  });

  it('builds a JSON schema from typed params', () => {
    const schema = toolParamsToJsonSchema([
      { name: 'city', type: 'string', required: true },
      { name: 'days', type: 'integer', required: false },
    ]);
    expect(schema.properties).toEqual({ city: { type: 'string' }, days: { type: 'integer' } });
    expect(schema.required).toEqual(['city']);
  });
});

describe('compileNode', () => {
  const listen: FlowNode = {
    id: 'l1',
    type: FlowNodeType.LISTEN,
    position: { x: 0, y: 0 },
    data: {
      config: { captures: [{ name: 'appt_date', type: 'date', required: true }], timeoutMs: 8000 },
    },
  };

  it('emits parsed config + declared captures for Listen', () => {
    const spec = compileNode(listen);
    expect(spec.type).toBe('LISTEN');
    expect(spec.captures).toEqual([{ name: 'appt_date', type: 'date', required: true }]);
    expect((spec.config as { timeoutMs: number }).timeoutMs).toBe(8000);
  });

  it('emits no captures for a non-Listen node + applies defaults', () => {
    const say: FlowNode = {
      id: 's1',
      type: FlowNodeType.SAY,
      position: { x: 0, y: 0 },
      data: { config: { mode: 'scripted', text: 'Hello' } },
    };
    const spec = compileNode(say);
    expect(spec.captures).toEqual([]);
    expect((spec.config as { mode: string }).mode).toBe('scripted');
  });
});
