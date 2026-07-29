import { describe, expect, it } from 'vitest';
import { FlowNodeType } from './enums.js';
import { compileFlow } from './flow-compiler.js';
import type { FlowGraph } from './flow-graph.js';
import { validateNodeConfig } from './flow-node-config.js';
import {
  buildFormSubmission,
  expandFormNodesInGraph,
  formFieldPrompt,
  formFieldVar,
  formNodeConfigSchema,
} from './form-node.js';
import type { FormField } from './form.js';

/**
 * In-call FORM node: config validation + the compile-time expansion into SAY/LISTEN + the submission
 * mapping. The key proof is that an expanded FORM node yields a graph that COMPILES to a valid runnable
 * flow — so it runs on every channel with no runtime change.
 */

const FORM_ID = '11111111-1111-1111-1111-111111111111';
const fields: FormField[] = [
  { key: 'full_name', label: 'Full name', type: 'text', required: true },
  { key: 'email', label: 'Email', type: 'email', required: true },
  { key: 'plan', label: 'Plan', type: 'select', required: false, options: ['Pro', 'Scale'] },
];

function graphWithForm(): FlowGraph {
  const pos = { x: 0, y: 0 };
  return {
    nodes: [
      { id: 'start', type: FlowNodeType.START, position: pos, data: { config: {} } },
      {
        id: 'form',
        type: FlowNodeType.FORM,
        position: pos,
        data: { config: { formId: FORM_ID, introPrompt: 'Just a few details.' } },
      },
      { id: 'end', type: FlowNodeType.END, position: pos, data: { config: {} } },
    ],
    edges: [
      { id: 'e1', source: 'start', target: 'form' },
      { id: 'e2', source: 'form', target: 'end' },
    ],
  };
}

describe('formNodeConfigSchema + node validation', () => {
  it('accepts a uuid formId and defaults the rest', () => {
    const c = formNodeConfigSchema.parse({ formId: FORM_ID });
    expect(c).toEqual({ formId: FORM_ID, introPrompt: '', confirmBeforeSave: false });
    expect(validateNodeConfig(FlowNodeType.FORM, { formId: FORM_ID }).valid).toBe(true);
  });
  it('rejects a non-uuid formId', () => {
    expect(validateNodeConfig(FlowNodeType.FORM, { formId: 'nope' }).valid).toBe(false);
  });
});

describe('formFieldVar / formFieldPrompt', () => {
  it('guarantees a legal variable name', () => {
    expect(formFieldVar('email')).toBe('email');
    expect(formFieldVar('1st_choice')).toBe('f_1st_choice'); // form keys may start with a digit
  });
  it('asks appropriately per field type', () => {
    expect(formFieldPrompt(fields[0] as FormField)).toBe('What is your full name?');
    expect(formFieldPrompt(fields[2] as FormField)).toContain('Please choose one: Pro, Scale');
    expect(
      formFieldPrompt({ key: 'ok', label: 'Agree', type: 'checkbox', required: false }),
    ).toContain('yes or no');
  });
});

describe('expandFormNodesInGraph', () => {
  it('expands a FORM node into ask/capture pairs that compile to a valid runnable flow', () => {
    const expanded = expandFormNodesInGraph(graphWithForm(), { [FORM_ID]: fields });

    // FORM id preserved as the first ask; 2 nodes per field.
    const ask0 = expanded.nodes.find((n) => n.id === 'form');
    expect(ask0?.type).toBe(FlowNodeType.SAY);
    expect(String(ask0?.data?.config?.text)).toContain('Just a few details.'); // intro prepended
    const listens = expanded.nodes.filter((n) => n.type === FlowNodeType.LISTEN);
    expect(listens).toHaveLength(3);
    // captures are legal variable names.
    expect(
      listens.flatMap((n) => (n.data?.config?.captures as { name: string }[]).map((c) => c.name)),
    ).toEqual(['full_name', 'email', 'plan']);

    // The original form→end edge now flows from the LAST capture node.
    expect(expanded.edges.some((e) => e.source === 'form__cap2' && e.target === 'end')).toBe(true);
    // start→form still lands on the (now-first-ask) FORM node.
    expect(expanded.edges.some((e) => e.source === 'start' && e.target === 'form')).toBe(true);

    // The whole thing compiles — reachable, no dead-ends, END reachable.
    const res = compileFlow(expanded);
    expect(res.ok).toBe(true);
  });

  it('leaves a FORM node untouched when its form is missing/empty', () => {
    const expanded = expandFormNodesInGraph(graphWithForm(), {}); // no forms resolved
    expect(expanded.nodes.find((n) => n.id === 'form')?.type).toBe(FlowNodeType.FORM);
    expect(expanded.nodes.filter((n) => n.type === FlowNodeType.LISTEN)).toHaveLength(0);
  });
});

describe('buildFormSubmission', () => {
  it('maps captured variables back to field keys, omitting empties', () => {
    const captured = { full_name: 'Ada Lovelace', email: 'ada@x.com', plan: '' };
    expect(buildFormSubmission(fields, captured)).toEqual({
      full_name: 'Ada Lovelace',
      email: 'ada@x.com',
    });
  });
});
