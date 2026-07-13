import { describe, expect, it } from 'vitest';
import { buildN8nTemplates } from './n8n-templates.js';

describe('buildN8nTemplates', () => {
  it('builds importable workflows with the API base URL substituted', () => {
    const templates = buildN8nTemplates('https://api.example.com/');
    expect(templates.length).toBeGreaterThanOrEqual(3);

    const ids = templates.map((t) => t.id);
    expect(ids).toContain('instant-dial');
    expect(ids).toContain('form-to-call');
    expect(ids).toContain('call-completed');

    for (const t of templates) {
      // Each is a valid-shaped n8n workflow document.
      const wf = t.workflow as { nodes: unknown[]; connections: Record<string, unknown> };
      expect(Array.isArray(wf.nodes)).toBe(true);
      expect(wf.nodes.length).toBeGreaterThan(0);
      expect(typeof wf.connections).toBe('object');

      const json = JSON.stringify(t.workflow);
      // Base URL substituted (no trailing double slash), and NO real secret embedded.
      expect(json).not.toContain('https://api.example.com//');
      expect(json).not.toMatch(/vq_live_[a-f0-9]/); // never ship a real API key
    }

    // The dial templates point at the instant-dial endpoint on the given base.
    const dial = JSON.stringify(templates.find((t) => t.id === 'instant-dial')?.workflow);
    expect(dial).toContain('https://api.example.com/v1/calls/dial');
    expect(dial).toContain('<YOUR_API_KEY>');
  });
});
