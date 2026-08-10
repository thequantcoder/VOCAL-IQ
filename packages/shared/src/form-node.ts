import { z } from 'zod';
import { FlowNodeType } from './enums.js';
import type { FlowEdge, FlowGraph, FlowNode } from './flow-graph.js';
import type { FormField } from './form.js';

/**
 * In-call FORM node (PARITY-03 residual). A single builder node that runs one of the tenant's saved
 * Forms (Day 37) during a conversation: it asks each field, captures the answer, and the host then
 * persists a `FormSubmission`. Rather than a new runtime primitive, a FORM node COMPILES BY EXPANSION
 * into the standard `SAY` (ask) + `LISTEN` (capture) nodes every channel runtime already drives — so it
 * works on voice, web chat, and messaging with NO runtime/voice-loop change (self-audit A). Everything
 * here is pure + unit-tested; the API resolves the form fields (from the DB) and saves the submission.
 */

export const formNodeConfigSchema = z.object({
  /** The saved Form to run. Empty ⇒ unconfigured (the node is left un-expanded). */
  formId: z.string().uuid().or(z.literal('')).default(''),
  /** Optional lead-in prepended to the first question (e.g. "I'll take a few details."). */
  introPrompt: z.string().max(500).default(''),
  /** Read the captured fields back for confirmation before the host saves (host-honoured). */
  confirmBeforeSave: z.boolean().default(false),
});
export type FormNodeConfig = z.infer<typeof formNodeConfigSchema>;

/** A legal capture-variable name for a form field key (form keys may start with a digit; vars can't). */
export function formFieldVar(key: string): string {
  return /^[a-zA-Z_]/.test(key) ? key : `f_${key}`;
}

/** The question the agent asks for a field — `select` lists the options, `checkbox` is yes/no. */
export function formFieldPrompt(field: FormField): string {
  const label = field.label.trim();
  if (field.type === 'select' && field.options && field.options.length > 0) {
    return `${label}? Please choose one: ${field.options.join(', ')}.`;
  }
  if (field.type === 'checkbox') return `${label}? Please say yes or no.`;
  return `What is your ${label.toLowerCase()}?`;
}

/** Map a form field type to the flow's captured-variable type (for downstream typing). */
function captureType(t: FormField['type']): string {
  switch (t) {
    case 'email':
      return 'email';
    case 'phone':
      return 'phone';
    case 'number':
      return 'number';
    case 'date':
      return 'date';
    case 'checkbox':
      return 'boolean';
    default:
      return 'text';
  }
}

/**
 * Expand every configured FORM node in `graph` into a `SAY`→`LISTEN` chain (one ask + one capture per
 * field), using the referenced forms' fields (the caller resolves `forms` from the DB, keyed by formId).
 * The FORM node's id is preserved as the chain's FIRST node so incoming edges keep working; the FORM
 * node's outgoing edges are moved to the chain's LAST node. Pure + deterministic. A FORM node whose form
 * is missing/empty is left untouched (so the compiler still sees a valid, if inert, node).
 */
export function expandFormNodesInGraph(
  graph: FlowGraph,
  forms: Record<string, FormField[]>,
): FlowGraph {
  const outNodes: FlowNode[] = [];
  const outEdges: FlowEdge[] = [];
  // Edges NOT sourced at an expanded FORM node pass through unchanged; a FORM node's outgoing edges are
  // re-sourced from its last capture node (tracked here).
  const rerouteSource = new Map<string, string>(); // formNodeId → last-node id

  for (const node of graph.nodes) {
    const fields = node.type === FlowNodeType.FORM ? forms[extractFormId(node)] : undefined;
    if (node.type !== FlowNodeType.FORM || !fields || fields.length === 0) {
      outNodes.push(node);
      continue;
    }
    const intro = String(node.data?.config?.introPrompt ?? '').trim();
    let prevId = '';
    fields.forEach((field, i) => {
      const askId = i === 0 ? node.id : `${node.id}__ask${i}`;
      const capId = `${node.id}__cap${i}`;
      const question = formFieldPrompt(field);
      const text = i === 0 && intro ? `${intro} ${question}` : question;
      outNodes.push({
        id: askId,
        type: FlowNodeType.SAY,
        position: node.position,
        data: { label: `Ask: ${field.label}`, config: { mode: 'scripted', text } },
      });
      outNodes.push({
        id: capId,
        type: FlowNodeType.LISTEN,
        position: node.position,
        data: {
          label: `Capture: ${field.label}`,
          config: {
            captures: [
              {
                name: formFieldVar(field.key),
                type: captureType(field.type),
                required: field.required,
              },
            ],
          },
        },
      });
      outEdges.push({ id: `${askId}->${capId}`, source: askId, target: capId });
      if (prevId) outEdges.push({ id: `${prevId}->${askId}`, source: prevId, target: askId });
      prevId = capId;
    });
    rerouteSource.set(node.id, prevId); // last capture node continues to the FORM node's original next
  }

  for (const edge of graph.edges) {
    const newSource = rerouteSource.get(edge.source);
    outEdges.push(newSource ? { ...edge, source: newSource } : edge);
  }

  return { nodes: outNodes, edges: outEdges };
}

/** Read the FORM node's configured formId (defensive — config is an open record on the raw graph). */
function extractFormId(node: FlowNode): string {
  const id = node.data?.config?.formId;
  return typeof id === 'string' ? id : '';
}

/**
 * Assemble a form submission from a conversation's captured variables — `{ fieldKey: value }` for each
 * field the flow captured. Pure; the host validates/persists it (via `formConfigSchema`). A field with
 * no captured value is omitted so downstream validation flags a genuinely missing required field.
 */
export function buildFormSubmission(
  fields: FormField[],
  captured: Record<string, unknown>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of fields) {
    const v = captured[formFieldVar(field.key)];
    if (v !== undefined && v !== null && String(v).trim() !== '') out[field.key] = String(v);
  }
  return out;
}
